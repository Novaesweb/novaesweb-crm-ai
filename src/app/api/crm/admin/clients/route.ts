import { NextRequest } from "next/server";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { patchCrmConfig, TENANT_UUID } from "@/lib/crm/tenant-access";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import {
  syncTenantUsageLimits,
  replaceTenantPlan,
  enforceTenantOperatorLimit,
  getMasterPlans,
  getEffectiveTenantPlan,
  checkTrialEligibility,
  recordTrialRegistration,
  convertTrialToPaidPlan,
  invalidateEffectivePlanCache,
  recordPlanAudit,
  DEFAULT_PLANS,
  TRIAL_PLAN
} from "@/lib/crm/plans";
import { buildTenantWhatsappSlots, syncWhatsappChannelsForPlanLimit } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  return { url, serviceKey };
}

// GET: List all client stores with login email, plan, dueDate, paymentStatus, block state, 5 WhatsApp slots, operators, and upgrade requests
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const masterPlans = await getMasterPlans();

    // 1. Fetch tenants
    const rTenants = await fetch(url + "/rest/v1/crm_tenants?select=*&order=created_at.desc", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenants.json()) as Array<{ id: string; name: string; status: string; created_at: string }>;

    // 2. Fetch memberships
    const rMemb = await fetch(url + "/rest/v1/crm_tenant_memberships?is_active=eq.true&select=tenant_id,user_id,role,created_at", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const memberships = (await rMemb.json()) as Array<{ tenant_id: string; user_id: string; role: string; created_at?: string }>;

    // 3. Fetch all auth users
    const rUsers = await fetch(url + "/auth/v1/admin/users?per_page=200", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const usersData = await rUsers.json();
    const users = (usersData?.users || []) as Array<{ id: string; email: string; user_metadata?: Record<string, any> }>;
    const userMap = new Map(users.map(u => [u.id, u]));

    // 4. Fetch tenant settings
    const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const settings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
    const settingsMap = new Map(settings.map(s => [s.tenant_id, s.business_description]));

    // 5. Fetch ALL channels grouped by tenant_id (supporting up to 5 slots per company)
    const rChannels = await fetch(url + "/rest/v1/crm_channels?select=id,tenant_id,instance_name,status&order=created_at.asc", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const channels = (await rChannels.json()) as Array<{ id: string; tenant_id: string; instance_name: string; status: string }>;
    const channelsByTenant = new Map<string, Array<{ id: string; instance_name: string; status: string }>>();
    for (const ch of channels) {
      const list = channelsByTenant.get(ch.tenant_id) || [];
      list.push(ch);
      channelsByTenant.set(ch.tenant_id, list);
    }

    const now = new Date();
    const clients = [];
    const allUpgradeRequests: Array<Record<string, any>> = [];

    for (const t of tenants) {
      const tenantMemberships = memberships.filter(m => m.tenant_id === t.id);
      const primaryMemb = tenantMemberships.find(m => m.role === "owner" || m.role === "admin") || tenantMemberships[0];
      const primaryUser = primaryMemb ? userMap.get(primaryMemb.user_id) : undefined;
      const email = primaryUser?.email || "—";

      const tenantChannels = channelsByTenant.get(t.id) || [];
      const primaryChannel = tenantChannels.find(c => c.status === "connected") || tenantChannels[0];

      const isNovaesOwn = process.env.CRM_MASTER_OWN_TENANT_ID ? t.id === process.env.CRM_MASTER_OWN_TENANT_ID.trim() : t.name.trim().toLowerCase() === "novaesweb";
      const defaultCatalogPlan = isNovaesOwn
        ? (masterPlans.find(p => p.id === "crm-premium") || DEFAULT_PLANS[2])
        : (masterPlans.find(p => p.id === "crm-start") || DEFAULT_PLANS[0]);

      let plan: Record<string, any> = {
        planId: defaultCatalogPlan.id,
        name: defaultCatalogPlan.name,
        price: defaultCatalogPlan.price,
        quotaLimit: defaultCatalogPlan.quotaLimit,
        maxOperators: defaultCatalogPlan.maxOperators,
        maxWhatsappConnections: defaultCatalogPlan.maxWhatsappConnections,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        status: "paid" as "paid" | "pending" | "trial",
        autoBlock: !isNovaesOwn,
        isOverdue: false,
        isTrial: false
      };

      let suspension: { isSuspended?: boolean; publicReason?: string; internalNote?: string; updatedAt?: string } = {};
      let paymentHistory: Array<Record<string, any>> = [];
      let upgradeRequests: Array<Record<string, any>> = [];
      let teamOperators: Array<Record<string, any>> = [];

      const rawDesc = settingsMap.get(t.id) || "";
      try {
        if (rawDesc.startsWith("{")) {
          const parsed = JSON.parse(rawDesc);
          if (parsed.plan) {
            plan = { ...plan, ...parsed.plan };
          }
          if (parsed.suspension && typeof parsed.suspension === "object") {
            suspension = parsed.suspension;
          }
          if (Array.isArray(parsed.paymentHistory)) {
            paymentHistory = parsed.paymentHistory;
          }
          if (Array.isArray(parsed.upgradeRequests)) {
            upgradeRequests = parsed.upgradeRequests;
          }
          if (Array.isArray(parsed.teamOperators)) {
            teamOperators = parsed.teamOperators;
          }
        }
      } catch {}

      try {
        const effective = await getEffectiveTenantPlan(t.id);
        plan = { ...plan, ...effective, name:effective.planName };
      } catch {
        plan = { ...plan, name:"Configuração indisponível",quotaLimit:0,quotaUsed:0,maxOperators:1,maxWhatsappConnections:1,isSuspended:true,suspensionReason:"plan_verification_unavailable" };
      }

      const whatsappSlots = buildTenantWhatsappSlots(t.name, tenantChannels, {
        maxWhatsappConnections: plan.maxWhatsappConnections || 1,
        isSuspended: plan.isSuspended || t.status !== "active"
      });
      const connectedWhatsappCount = whatsappSlots.filter(c => c.unlocked && c.status === "connected").length;

      for (const req of upgradeRequests) {
        allUpgradeRequests.push({
          ...req,
          tenantId: t.id,
          storeName: t.name,
          email
        });
      }

      const activeOperatorsCount = tenantMemberships.length;

      clients.push({
        id: t.id,
        name: t.name,
        status: t.status,
        isNovaesOwn,
        isMasterOwnTenant:isNovaesOwn,
        email,
        userId: primaryMemb?.user_id ?? null,
        created_at: t.created_at,
        instanceName: primaryChannel?.instance_name || null,
        whatsappStatus: primaryChannel?.status || "disconnected",
        connectedWhatsappCount,
        whatsappSlots,
        operatorsCount: activeOperatorsCount,
        maxOperators: plan.maxOperators || 1,
        maxWhatsappConnections: plan.maxWhatsappConnections || 1,
        suspension,
        paymentHistory,
        upgradeRequests,
        plan
      });
    }

    return privateJson({
      clients,
      upgradeRequests: allUpgradeRequests.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "clients_unavailable" }, 503);
  }
}

// POST: Create a complete client (Store + Auth User + Membership + Official Plan Snapshot + Default Agent + Slot #1 Channel)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const requestedPlanId = typeof body.planId === "string" ? body.planId.trim() : "";
    const requestedPlanName = typeof body.planName === "string" ? body.planName.trim() : "CRM Start";
    const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const paymentStatus = body.paymentStatus === "pending" ? "pending" : "paid";
    const autoBlock = body.autoBlock !== false;

    if (storeName.length < 2 || storeName.length > 160) return privateJson({ error: "invalid_store_name" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return privateJson({ error: "invalid_email" }, 400);
    if (password.length < 6) return privateJson({ error: "password_too_short" }, 400);

    const isTrial = body.isTrial === true || requestedPlanId === "crm-trial" || requestedPlanName.toLowerCase().includes("teste");
    if (isTrial) {
      const eligibility = await checkTrialEligibility(storeName, email);
      if (!eligibility.eligible) {
        return privateJson({
          error: "trial_already_used",
          message: eligibility.message || eligibility.reason || "Esta empresa ou e-mail já utilizou a avaliação gratuita de 7 dias anteriormente."
        }, 400);
      }
    }

    // 1. Create tenant in crm_tenants
    const rTenant = await fetch(url + "/rest/v1/crm_tenants", {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ name: storeName, status: "active" })
    });
    if (!rTenant.ok) {
      const err = await rTenant.text();
      return privateJson({ error: "tenant_create_failed", detail: err }, 500);
    }
    const tenantData = (await rTenant.json()) as Array<{ id: string }>;
    const tenantId = tenantData[0].id;

    // 2. Create user in Supabase Auth via Admin API
    const rUser = await fetch(url + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { storeName, tenantId, role: "CLIENT" }
      })
    });
    if (!rUser.ok) {
      const errUser = await rUser.text();
      return privateJson({ error: "user_create_failed", detail: errUser }, 500);
    }
    const userData = await rUser.json();
    const userId = userData.id;

    // 3. Create membership in crm_tenant_memberships
    await fetch(url + "/rest/v1/crm_tenant_memberships", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        user_id: userId,
        role: "admin"
      })
    });

    // 4. Save initial Plan settings strictly derived from the Official Plan Catalog
    let planMeta: Record<string, any>;
    let effectiveLimit: number;
    let finalPlanName: string;

    if (isTrial) {
      const trialStartedAt = new Date().toISOString();
      const trialExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      finalPlanName = TRIAL_PLAN.name;
      planMeta = {
        plan: {
          isTrial: true,
          planId: "crm-trial",
          name: TRIAL_PLAN.name,
          price: "0,00",
          quotaLimit: 100,
          maxOperators: 1,
          maxWhatsappConnections: 1,
          trialStartedAt,
          trialExpiresAt,
          dueDate: trialExpiresAt.slice(0, 10),
          status: "trial",
          autoBlock: true,
          customQuotaOverride: null,
          exceptionReason: null
        },
        teamOperators: [
          {
            id: userId,
            name: `Administrador (${storeName})`,
            email,
            role: "admin",
            status: "active",
            createdAt: trialStartedAt
          }
        ]
      };
      effectiveLimit = 100;
      await recordTrialRegistration(tenantId, storeName, email);
    } else {
      const masterPlans = await getMasterPlans();
      const matchedPlan = masterPlans.find(
        p => (requestedPlanId && p.id === requestedPlanId) || p.name.toLowerCase() === requestedPlanName.toLowerCase()
      ) || masterPlans[0] || DEFAULT_PLANS[0];

      finalPlanName = matchedPlan.name;
      const customQuota = typeof body.customQuotaOverride === "number" ? body.customQuotaOverride : null;
      const exceptionReason = typeof body.exceptionReason === "string" ? body.exceptionReason : null;
      // Never accept legacy "149,00" fallback as custom price unless explicitly flagged
      const suppliedPrice = typeof body.planPrice === "string" ? body.planPrice.trim() : "";
      const resolvedPrice = (suppliedPrice && suppliedPrice !== "149,00") ? suppliedPrice : matchedPlan.price;

      planMeta = {
        plan: {
          isTrial: false,
          planId: matchedPlan.id,
          name: matchedPlan.name,
          price: resolvedPrice,
          quotaLimit: matchedPlan.quotaLimit,
          maxOperators: matchedPlan.maxOperators,
          maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
          dueDate,
          status: paymentStatus,
          autoBlock,
          customQuotaOverride: customQuota,
          exceptionReason,
          contractedPlan: {
            quotaLimit: matchedPlan.quotaLimit,
            features: matchedPlan.features,
            price: resolvedPrice,
            maxOperators: matchedPlan.maxOperators,
            maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
            version: matchedPlan.version,
            contractedAt: new Date().toISOString()
          }
        },
        teamOperators: [
          {
            id: userId,
            name: `Administrador (${storeName})`,
            email,
            role: "admin",
            status: "active",
            createdAt: new Date().toISOString()
          }
        ]
      };
      effectiveLimit = customQuota !== null ? customQuota : matchedPlan.quotaLimit;
    }

    await fetch(url + "/rest/v1/crm_tenant_settings", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        ai_sending_enabled: true,
        business_description: JSON.stringify(planMeta)
      })
    });
    await syncTenantUsageLimits(tenantId, effectiveLimit, url, serviceKey);

    // 5. Create default agent in crm_agents
    await fetch(url + "/rest/v1/crm_agents", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        label: `Assistente ${storeName}`,
        instructions: `Você é o assistente virtual da loja ${storeName}. Responda em português brasileiro de forma educada, ágil e prestativa. Use as informações de cardápio, produtos e regras da loja.`,
        provider_route: "auto",
        enabled: true
      })
    });

    // 6. Create default evolution channel (Slot #1)
    const slug = storeName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);
    await fetch(url + "/rest/v1/crm_channels", {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        provider: "evolution",
        instance_name: `loja_${slug}`,
        status: "disconnected"
      })
    });

    return privateJson({
      created: true,
      tenantId,
      storeName,
      email,
      planName: finalPlanName,
      plan: planMeta.plan,
      dueDate,
      paymentStatus
    }, 201);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "client_creation_failed" }, 503);
  }
}

// PATCH: Block/Unblock (with public reason + internal note), Mark Paid (idempotent), Update Plan (with downgrade handling), Approve/Reject Upgrade, Reset Password
export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!TENANT_UUID.test(tenantId)) return privateJson({ error: "invalid_tenant_id" }, 400);

    // Helper to load current business_description JSON
    const loadSettingsObj = async (): Promise<Record<string, any>> => {
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      if (!rGet.ok) throw new Error("tenant_settings_lookup_failed");
      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, any> = { plan: {} };
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        }
      } catch {}
      return dataObj;
    };

    const saveSettingsObj = async (dataObj: Record<string, any>, extraFields: Record<string, any> = {}, fields: string[] = ["plan"]) => {
      if (fields.includes("plan")) await replaceTenantPlan(tenantId, dataObj.plan, url, serviceKey);
      const patch = Object.fromEntries(fields.filter(k => k !== "plan").map(k => [k, dataObj[k]]));
      if (Object.keys(patch).length) await patchCrmConfig(tenantId, patch);
      if (Object.keys(extraFields).length) {
        const r = await fetch(url + "/rest/v1/crm_tenant_settings?tenant_id=eq." + tenantId, {
          method: "PATCH", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" }, body: JSON.stringify(extraFields)
        });
        if (!r.ok) throw new Error("tenant_flags_write_failed");
      }
      await invalidateEffectivePlanCache(tenantId);
    };

    // 1. Action: Toggle Block / Unblock status with Public Reason & Internal Note
    if (action === "toggle_block") {
      const suspend = body.suspend === true;
      const publicReason = typeof body.publicReason === "string" && body.publicReason.trim()
        ? body.publicReason.trim()
        : (suspend ? "Conta suspensa administrativamente. Entre em contato com o suporte financeiro da NovaesWeb." : "");
      const internalNote = typeof body.internalNote === "string" ? body.internalNote.trim() : "";

      const dataObj = await loadSettingsObj();
      dataObj.suspension = {
        isSuspended: suspend,
        publicReason: suspend ? publicReason : "",
        internalNote,
        updatedAt: new Date().toISOString(),
        actor: auth.actor || "master_admin"
      };
      if (dataObj.plan && typeof dataObj.plan === "object") {
        dataObj.plan.publicSuspensionReason = suspend ? publicReason : "";
        dataObj.plan.internalSuspensionNote = internalNote;
      }

      await saveSettingsObj(dataObj, { ai_sending_enabled: !suspend }, ["suspension"]);

      const newStatus = suspend ? "suspended" : "active";
      await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });

      await recordPlanAudit({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: auth.actor || "master_admin",
        planId: dataObj?.plan?.planId || "crm-start",
        planName: dataObj?.plan?.name || "CRM Start",
        action: "suspension_updated",
        vigencia: "immediate",
        affectedTenantsCount: 1,
        affectedTenants: [tenantId],
        timestamp: new Date().toISOString()
      });

      return privateJson({
        updated: true,
        newStatus,
        suspension: dataObj.suspension
      });
    }

    // 2. Action: Mark Paid or Pending (with idempotency and subscription + invoice consistency)
    if (action === "set_payment_status") {
      const newPaymentStatus = body.paymentStatus === "paid" ? "paid" : "pending";
      const dataObj = await loadSettingsObj();
      const planObj = (dataObj.plan as Record<string, any>) ?? {};
      const dueDate = typeof planObj.dueDate === "string" && planObj.dueDate
        ? planObj.dueDate
        : new Date().toISOString().slice(0, 10);
      const billingCycleKey = `${tenantId}:${dueDate}:${planObj.planId || "plan"}`;

      const paymentHistory: Array<Record<string, any>> = Array.isArray(dataObj.paymentHistory)
        ? dataObj.paymentHistory
        : [];

      let duplicatePrevented = false;
      if (newPaymentStatus === "paid") {
        const alreadyPaidForCycle = paymentHistory.some(
          p => p.billingCycleKey === billingCycleKey && p.status === "paid"
        );
        if (alreadyPaidForCycle && planObj.status === "paid") {
          duplicatePrevented = true;
        } else if (!alreadyPaidForCycle) {
          paymentHistory.unshift({
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            billingCycleKey,
            planId: planObj.planId || "crm-start",
            planName: planObj.name || "CRM Start",
            amount: planObj.price || "59,90",
            dueDate,
            paidAt: new Date().toISOString(),
            status: "paid",
            actor: auth.actor || "master_admin"
          });
        }
        planObj.lastPaidAt = new Date().toISOString();
        planObj.isOverdue = false;
        // Advance due date if it was in the past
        if (new Date(dueDate) < new Date()) {
          planObj.dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        }
        // Clear payment-overdue suspension if any
        if (dataObj.suspension && !dataObj.suspension.internalNote) {
          dataObj.suspension.isSuspended = false;
          dataObj.suspension.publicReason = "";
        }
      }

      planObj.status = newPaymentStatus;
      dataObj.plan = planObj;
      dataObj.paymentHistory = paymentHistory.slice(0, 50);

      await saveSettingsObj(dataObj, { ai_sending_enabled: newPaymentStatus === "paid" }, ["plan", "paymentHistory"]);

      if (newPaymentStatus === "paid") {
        await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" })
        });

        if (!duplicatePrevented) {
          await recordPlanAudit({
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            actor: auth.actor || "master_admin",
            planId: String(planObj.planId || "crm-start"),
            planName: String(planObj.name || "CRM Start"),
            action: "payment_marked_paid",
            vigencia: "immediate",
            affectedTenantsCount: 1,
            affectedTenants: [tenantId],
            timestamp: new Date().toISOString()
          });
        }
      }

      return privateJson({
        updated: true,
        paymentStatus: newPaymentStatus,
        duplicatePrevented,
        paymentHistory: dataObj.paymentHistory,
        active: newPaymentStatus === "paid"
      });
    }

    // 3. Action: Reset Password
    if (action === "reset_password") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!userId || newPassword.length < 6) return privateJson({ error: "invalid_password_data" }, 400);

      const rPwd = await fetch(url + `/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      if (!rPwd.ok) return privateJson({ error: "password_update_failed" }, 503);
      return privateJson({ updated: true, passwordReset: true });
    }

    // 4. Action: Update Plan details (synchronizing contractedPlan + WhatsApp slot limits on upgrade/downgrade)
    if (action === "update_plan") {
      const dataObj = await loadSettingsObj();
      const planObj = (dataObj.plan as Record<string, any>) ?? {};
      const masterPlans = await getMasterPlans();

      const requestedId = typeof body.planId === "string" ? body.planId : "";
      const requestedName = typeof body.planName === "string" ? body.planName : String(planObj.name || "CRM Start");

      const matchedPlan = masterPlans.find(
        p => (requestedId && p.id === requestedId) || p.name.toLowerCase() === requestedName.toLowerCase()
      ) || masterPlans[0] || DEFAULT_PLANS[0];

      const resolvedPrice = (typeof body.planPrice === "string" && body.planPrice.trim() && body.planPrice !== "149,00")
        ? body.planPrice.trim()
        : matchedPlan.price;

      planObj.planId = matchedPlan.id;
      planObj.name = matchedPlan.name;
      planObj.price = resolvedPrice;
      planObj.quotaLimit = matchedPlan.quotaLimit;
      planObj.maxOperators = matchedPlan.maxOperators;
      planObj.maxWhatsappConnections = matchedPlan.maxWhatsappConnections;
      planObj.isTrial = false;
      if (planObj.status === "trial") planObj.status = "paid";
      if (body.dueDate) planObj.dueDate = body.dueDate;
      if (body.autoBlock !== undefined) planObj.autoBlock = body.autoBlock;

      // Update frozen contracted snapshot so getEffectiveTenantPlan reflects the new plan immediately
      planObj.contractedPlan = {
        quotaLimit: matchedPlan.quotaLimit,
        features: matchedPlan.features,
        price: resolvedPrice,
        maxOperators: matchedPlan.maxOperators,
        maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
        version: matchedPlan.version,
        contractedAt: new Date().toISOString()
      };
      delete planObj.pendingPlanUpdate;
      dataObj.plan = planObj;

      await saveSettingsObj(dataObj);
      await syncTenantUsageLimits(tenantId, Number(dataObj.plan?.customQuotaOverride ?? matchedPlan.quotaLimit), url, serviceKey);
      await enforceTenantOperatorLimit(tenantId, matchedPlan.maxOperators, url, serviceKey);

      // Enforce WhatsApp slot limits (suspending excess channels on downgrade or restoring on upgrade)
      const channelSync = await syncWhatsappChannelsForPlanLimit(
        tenantId,
        matchedPlan.maxWhatsappConnections,
        url,
        serviceKey
      );

      await recordPlanAudit({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: auth.actor || "master_admin",
        planId: matchedPlan.id,
        planName: matchedPlan.name,
        action: "update",
        vigencia: "immediate",
        newValues: {
          price: resolvedPrice,
          quotaLimit: matchedPlan.quotaLimit,
          maxOperators: matchedPlan.maxOperators,
          maxWhatsappConnections: matchedPlan.maxWhatsappConnections,
          features: matchedPlan.features
        },
        affectedTenantsCount: 1,
        affectedTenants: [tenantId],
        timestamp: new Date().toISOString()
      });

      return privateJson({
        updated: true,
        plan: planObj,
        channelSync
      });
    }

    // 5. Action: Approve or Reject Upgrade Request from Client
    if (action === "resolve_upgrade_request") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      if (!requestId || !["approved", "rejected"].includes(body.decision)) return privateJson({error:"invalid_upgrade_decision"},400);
      const decision = body.decision as "approved" | "rejected";
      const dataObj = await loadSettingsObj();
      const requests = Array.isArray(dataObj.upgradeRequests) ? dataObj.upgradeRequests : [];
      const target = requests.find((r: Record<string,unknown>) => r.id === requestId);
      if (!target || target.status !== "pending") return privateJson({error:"upgrade_request_not_pending"},409);
      const catalog = await getMasterPlans();
      const plan = catalog.find(p => p.id === target.targetPlanId && p.status === "active");
      if (!plan) return privateJson({error:"upgrade_plan_unavailable"},409);
      const planObj = { ...(dataObj.plan || {}), planId:plan.id,name:plan.name,price:plan.price,
        quotaLimit:plan.quotaLimit,maxOperators:plan.maxOperators,maxWhatsappConnections:plan.maxWhatsappConnections,
        isTrial:false,status:"paid",contractedPlan:{quotaLimit:plan.quotaLimit,features:plan.features,price:plan.price,
        maxOperators:plan.maxOperators,maxWhatsappConnections:plan.maxWhatsappConnections,version:plan.version,contractedAt:new Date().toISOString()} };
      delete planObj.pendingPlanUpdate;
      const resolved = await fetch(url + "/rest/v1/rpc/crm_resolve_upgrade", {
        method:"POST",headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"Content-Type":"application/json"},
        body:JSON.stringify({p_tenant:tenantId,p_request:requestId,p_decision:decision,p_plan:planObj,p_actor:auth.actor,p_admin_note:typeof body.adminNote==="string"?body.adminNote:""})
      });
      if(!resolved.ok)return privateJson({error:"upgrade_resolution_failed"},resolved.status===409?409:503);
      const saved = await resolved.json();
      if(decision === "approved")await syncTenantUsageLimits(tenantId,Number(planObj.customQuotaOverride ?? plan.quotaLimit),url,serviceKey);
      await invalidateEffectivePlanCache(tenantId);
      return privateJson({updated:true,decision,plan:saved.plan,upgradeRequests:saved.upgradeRequests});
    }

    // 6. Action: Convert Trial to Paid Commercial Plan
    if (action === "convert_trial") {
      const targetPlanId = typeof body.planId === "string" ? body.planId : "crm-business";
      const targetDueDate = typeof body.dueDate === "string" ? body.dueDate : undefined;
      const result = await convertTrialToPaidPlan(tenantId, targetPlanId, auth.actor || "master_admin", targetDueDate);
      if (!result.success) {
        return privateJson({ error: "conversion_failed", message: result.error || "Falha ao converter teste para plano pago" }, 500);
      }
      await syncWhatsappChannelsForPlanLimit(tenantId, result.plan.maxWhatsappConnections, url, serviceKey);
      return privateJson({ updated: true, converted: true, plan: result.plan });
    }

    return privateJson({ error: "invalid_action" }, 400);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "patch_failed" }, 503);
  }
}

// DELETE: Delete store / client and its WhatsApp instances
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  const auth = await verifyMasterRequest(request);
  if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

  try {
    const { url, serviceKey } = getAdminConfig();
    if (!serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const tenantId = request.nextUrl.searchParams.get("tenantId") || "";
    if (!tenantId) return privateJson({ error: "missing_tenant_id" }, 400);

    try {
      const rCh = await fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=instance_name`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
      });
      const channels = (await rCh.json()) as Array<{ instance_name: string }>;
      const evoUrl = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
      const evoKey = process.env.EVOLUTION_API_KEY ?? "";
      for (const ch of channels) {
        if (ch.instance_name && evoKey) {
          try {
            await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(ch.instance_name)}`, {
              method: "DELETE",
              headers: { apikey: evoKey }
            });
            await fetch(`${evoUrl}/instance/delete/${encodeURIComponent(ch.instance_name)}`, {
              method: "DELETE",
              headers: { apikey: evoKey }
            });
          } catch {}
        }
      }
    } catch {}

    await fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenant_memberships?tenant_id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }
    });
    await invalidateEffectivePlanCache(tenantId);

    return privateJson({ deleted: true, tenantId });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "delete_failed" }, 503);
  }
}
