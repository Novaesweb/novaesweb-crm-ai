import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  CrmPlan,
  TECHNICAL_FEATURES,
  getMasterPlans,
  getMasterPlansWithDrafts,
  discardPlanDraft,
  saveMasterPlan,
  syncTenantUsageLimits,
  invalidateEffectivePlanCache,
  recordPlanAudit,
  replaceTenantPlan,
  enforceTenantOperatorLimit,
  normalizePlanVigencia
} from "@/lib/crm/plans";
import { syncWhatsappChannelsForPlanLimit } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

// GET: List all master plans with draft decorations, client distribution counts, and technical features catalog
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    const plans = await getMasterPlansWithDrafts();

    const counts: Record<string, number> = {};
    const enrolledStores: Record<string, Array<{ id: string; name: string; hasOverride: boolean }>> = {};

    for (const p of plans) {
      counts[p.id] = 0;
      counts[p.name] = 0;
      enrolledStores[p.id] = [];
    }

    if (serviceKey && url) {
      try {
        const [rSettings, rTenants] = await Promise.all([
          fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
            cache: "no-store"
          }),
          fetch(url + "/rest/v1/crm_tenants?select=id,name,status", {
            headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
            cache: "no-store"
          })
        ]);

        if (rSettings.ok && rTenants.ok) {
          const settings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
          const tenants = (await rTenants.json()) as Array<{ id: string; name: string; status: string }>;
          const tenantMap = new Map(tenants.map(t => [t.id, t]));

          for (const s of settings) {
            try {
              if (s.business_description?.startsWith("{")) {
                const parsed = JSON.parse(s.business_description);
                const pId = parsed?.plan?.planId;
                const pName = parsed?.plan?.name || "CRM Start";
                const hasOverride = parsed?.plan?.customQuotaOverride !== undefined && parsed?.plan?.customQuotaOverride !== null;
                const tObj = tenantMap.get(s.tenant_id);

                const matchedPlan = plans.find(p => p.id === pId || p.name.toLowerCase() === pName.toLowerCase());
                if (matchedPlan) {
                  counts[matchedPlan.id] = (counts[matchedPlan.id] || 0) + 1;
                  counts[matchedPlan.name] = (counts[matchedPlan.name] || 0) + 1;
                  if (tObj) {
                    enrolledStores[matchedPlan.id] = enrolledStores[matchedPlan.id] || [];
                    enrolledStores[matchedPlan.id].push({ id: tObj.id, name: tObj.name, hasOverride });
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return privateJson({
      plans,
      clientCounts: counts,
      enrolledStores,
      technicalFeatures: TECHNICAL_FEATURES
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "plans_failed" }, 503);
  }
}

// POST: Save draft, apply plan to stores, discard draft, duplicate, or toggle status
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    const action = body.action || "save_and_apply";

    if (action === "discard_draft") {
      const planId = typeof body.planId === "string" ? body.planId : "";
      if (!planId) return privateJson({ error: "missing_plan_id" }, 400);
      await discardPlanDraft(planId, auth.actor);
      return privateJson({ discarded: true, planId });
    }

    if (action === "duplicate") {
      const sourcePlanId = typeof body.sourcePlanId === "string" ? body.sourcePlanId : "";
      const currentPlans = await getMasterPlans();
      const source = currentPlans.find(p => p.id === sourcePlanId);
      if (!source) return privateJson({ error: "source_plan_not_found" }, 404);

      const newId = `crm-custom-${Date.now().toString(36)}`;
      const duplicatedPlan: CrmPlan = {
        ...source,
        id: newId,
        name: body.newName || `${source.name} (Cópia)`,
        isPopular: false,
        version: 1,
        status: "active",
        updated_at: new Date().toISOString()
      };

      const result = await saveMasterPlan(duplicatedPlan, "draft", "new_clients", auth.actor);
      return privateJson({ duplicated: true, plan: result.plan });
    }

    if (action === "toggle_status") {
      const planId = typeof body.planId === "string" ? body.planId : "";
      const currentPlans = await getMasterPlans();
      const plan = currentPlans.find(p => p.id === planId);
      if (!plan) return privateJson({ error: "plan_not_found" }, 404);

      plan.status = plan.status === "active" ? "inactive" : "active";
      const result = await saveMasterPlan(plan, "apply", "new_clients", auth.actor);
      return privateJson({ updated: true, plan: result.plan });
    }

    if (action === "set_client_exception") {
      const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
      const customQuota = typeof body.customQuota === "number" ? body.customQuota : undefined;
      const exceptionReason = typeof body.reason === "string" ? body.reason.trim() : "Exceção contratual aprovada pelo Master";

      if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return privateJson({ error: "missing_tenant" }, 400);
      if (customQuota !== undefined && (!Number.isInteger(customQuota) || customQuota < 0)) return privateJson({ error: "invalid_quota" }, 400);

      const { url, serviceKey } = getAdminConfig();
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      if (!rGet.ok) throw new Error(`Supabase read tenant settings failed: HTTP ${rGet.status}`);

      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, unknown> = {};
      try {
        if (current[0]?.business_description?.startsWith("{")) dataObj = JSON.parse(current[0].business_description);
      } catch {}

      const planObj = (dataObj.plan as Record<string, unknown>) || {};
      if (customQuota !== undefined) {
        planObj.customQuotaOverride = customQuota;
        planObj.exceptionReason = exceptionReason;
      } else {
        delete planObj.customQuotaOverride;
        delete planObj.exceptionReason;
      }
      dataObj.plan = planObj;

      await replaceTenantPlan(tenantId, planObj, url, serviceKey);

      if (customQuota !== undefined) {
        await syncTenantUsageLimits(tenantId, customQuota, url, serviceKey);
      }

      await invalidateEffectivePlanCache(tenantId);
      return privateJson({ exceptionSaved: true, tenantId, customQuota });
    }

    const planInput = body.plan;
    if (!planInput || !planInput.id || !planInput.name) {
      return privateJson({ error: "invalid_plan_payload" }, 400);
    }

    const mode = action === "save_draft" ? "draft" : "apply";
    const vigencia = normalizePlanVigencia(body.vigencia ?? "immediate");

    const result = await saveMasterPlan(planInput, mode, vigencia, auth.actor);

    return privateJson({
      saved: result.saved,
      applied: result.applied,
      partiallyApplied: result.partiallyApplied,
      isDraft: result.isDraft,
      affectedTenants: result.affectedTenants,
      succeededTenants: result.succeededTenants,
      failedTenants: result.failedTenants,
      plan: result.plan
    }, result.partiallyApplied ? 207 : result.applied || result.isDraft ? 200 : 503);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "save_plans_failed" }, 503);
  }
}

// PATCH: Assign a plan to a specific store tenant (synchronizing contractedPlan + WhatsApp slot limits)
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const planId = typeof body.planId === "string" ? body.planId : "";
    const planName = typeof body.planName === "string" ? body.planName : "";
    const customQuotaOverride = typeof body.customQuotaOverride === "number" ? body.customQuotaOverride : null;
    const exceptionReason = typeof body.exceptionReason === "string" ? body.exceptionReason : null;

    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || (!planId && !planName)) return privateJson({ error: "missing_required_fields" }, 400);
    if (customQuotaOverride !== null && (!Number.isInteger(customQuotaOverride) || customQuotaOverride < 0)) return privateJson({ error: "invalid_quota" }, 400);

    const masterPlans = await getMasterPlans();
    const matchedPlan = masterPlans.find(
      p => (planId && p.id === planId) || (planName && p.name.toLowerCase() === planName.toLowerCase())
    );
    if (!matchedPlan || matchedPlan.status !== "active") return privateJson({ error: "plan_not_found" }, 400);

    const suppliedPrice = typeof body.planPrice === "string" ? body.planPrice.trim() : "";
    const resolvedPrice = (suppliedPrice && suppliedPrice !== "149,00") ? suppliedPrice : matchedPlan.price;
    const quotaLimit = matchedPlan.quotaLimit;

    const { url, serviceKey } = getAdminConfig();
    const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    if (!rGet.ok) throw new Error(`Supabase read tenant settings failed: HTTP ${rGet.status}`);

    const current = (await rGet.json()) as Array<{ business_description: string }>;
    let dataObj: Record<string, unknown> = { plan: {} };
    try {
      if (current[0]?.business_description?.startsWith("{")) {
        dataObj = JSON.parse(current[0].business_description);
      }
    } catch {}

    const planObj = (dataObj.plan as Record<string, unknown>) ?? {};
    planObj.planId = matchedPlan.id;
    planObj.name = matchedPlan.name;
    planObj.price = resolvedPrice;
    planObj.quotaLimit = quotaLimit;
    planObj.maxOperators = matchedPlan.maxOperators;
    planObj.maxWhatsappConnections = matchedPlan.maxWhatsappConnections;
    planObj.isTrial = false;
    planObj.status = "paid";
    planObj.trialConvertedAt = new Date().toISOString();
    planObj.contractedPlan = {
      quotaLimit,
      features: matchedPlan.features,
      price: resolvedPrice,
      maxOperators: matchedPlan.maxOperators,
      maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
      version: matchedPlan.version,
      contractedAt: new Date().toISOString()
    };
    delete planObj.pendingPlanUpdate;

    if (customQuotaOverride !== null) {
      planObj.customQuotaOverride = customQuotaOverride;
      planObj.exceptionReason = exceptionReason;
    }

    dataObj.plan = planObj;

    await replaceTenantPlan(tenantId, planObj, url, serviceKey);

    const effectiveLimit = customQuotaOverride !== null ? customQuotaOverride : quotaLimit;
    await syncTenantUsageLimits(tenantId, effectiveLimit, url, serviceKey);
    const channelSync = await syncWhatsappChannelsForPlanLimit(tenantId, matchedPlan.maxWhatsappConnections, url, serviceKey);
    await enforceTenantOperatorLimit(tenantId, matchedPlan.maxOperators, url, serviceKey);
    await invalidateEffectivePlanCache(tenantId);

    await recordPlanAudit({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actor: auth.actor || "master_admin",
      planId: matchedPlan.id,
      planName: matchedPlan.name,
      action: "update",
      vigencia: "immediate",
      newValues: {
        price: resolvedPrice,
        quotaLimit: effectiveLimit,
        maxOperators: matchedPlan.maxOperators,
        maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
        features: matchedPlan.features
      },
      affectedTenantsCount: 1,
      affectedTenants: [tenantId],
      timestamp: new Date().toISOString()
    });

    return privateJson({ updated: true, tenantId, plan: planObj, channelSync });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "assign_plan_failed" }, 503);
  }
}
