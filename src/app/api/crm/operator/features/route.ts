import type { StoredTenantConfig } from "@/lib/crm/settings-types";
import { NextRequest } from "next/server";
import { authorizeCrmTenant, ownsCrmResource, crmFeatureAllowed, patchCrmConfig } from "@/lib/crm/tenant-access";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { getEffectiveTenantPlan, requireTenantFeature, getMasterPlans } from "@/lib/crm/plans";
import { DEFAULT_QUICK_REPLIES } from "@/app/api/crm/operator/ai-settings/route";
import { getBrazilMonthKey } from "@/lib/agent/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

async function authorizeTenant(request: NextRequest, tenantId: string) {
  const access = await authorizeCrmTenant(request, tenantId);
  return { authorized: Boolean(access), operatorId: access?.operatorId ?? undefined, operatorEmail: access?.operatorEmail };
}

async function loadTenantSettingsJson(url: string, serviceKey: string, tenantId: string): Promise<StoredTenantConfig> {
  const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=business_description&limit=1`, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
    cache: "no-store"
  });
  if (!rGet.ok) throw new Error("settings_unavailable");
  const rows = (await rGet.json()) as Array<{ business_description: string }>;
  if (rows[0]?.business_description?.startsWith("{")) {
    try {
      return JSON.parse(rows[0].business_description);
    } catch {}
  }
  throw new Error("settings_unavailable");
}

async function saveTenantSettingsJson(_url: string, _serviceKey: string, tenantId: string, dataObj: StoredTenantConfig, key: string): Promise<void> {
  await patchCrmConfig(tenantId, { [key]: dataObj[key] });
}

// GET: Retrieve Quick Replies, Team Operators, Priorities, Satisfaction Surveys, Upgrade Requests, and Tiered Reports (Start / Business / Premium)
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant") ?? "";
  if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

  try {
    const auth = await authorizeTenant(request, tenantId);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey, redisUrl } = getServiceConfig();
    if (!url || !serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    const effectivePlan = await getEffectiveTenantPlan(tenantId);
    const dataObj = await loadTenantSettingsJson(url, serviceKey, tenantId);

    if (effectivePlan.isSuspended) return privateJson({ error: "ACCOUNT_SUSPENDED", state: "suspended" }, 403);
    // Optional filters for reports (Premium advanced filters)
    const periodFilter = request.nextUrl.searchParams.get("period") || "30d"; // "7d" | "30d" | "all"
    const channelFilter = request.nextUrl.searchParams.get("channel") || "all";
    const tagFilter = request.nextUrl.searchParams.get("tag") || "all";
    const priorityFilter = request.nextUrl.searchParams.get("priority") || "all";
    const operatorFilter = request.nextUrl.searchParams.get("operator") || "all";

    const hasAdvancedFilters = periodFilter !== "30d" || [channelFilter, tagFilter, priorityFilter, operatorFilter].some(f => f !== "all");
    if (hasAdvancedFilters) {
      const guard = await requireTenantFeature(tenantId, "advanced_commercial_filters");
      if (!guard.allowed) return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
    }
    const basicGuard = await requireTenantFeature(tenantId, "basic_indicators");
    if (!basicGuard.allowed) return privateJson({ error: basicGuard.errorCode, state: basicGuard.state, message: basicGuard.message }, basicGuard.statusHttp);
    const [rConvs, rContacts, rChannels, rMemberships, rHandoffs] = await Promise.all([
      fetch(url + `/rest/v1/crm_conversations?tenant_id=eq.${tenantId}&select=id,contact_id,channel_id,assigned_to,mode,status,last_message_at,created_at&order=last_message_at.desc&limit=300`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_contacts?tenant_id=eq.${tenantId}&select=id,phone,display_name`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=id,instance_name,status`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_tenant_memberships?is_active=eq.true&tenant_id=eq.${tenantId}&select=user_id,role,created_at`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_handoffs?tenant_id=eq.${tenantId}&select=id,conversation_id,status,reason,created_at&limit=200`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      })
    ]);

    const rawConvs = rConvs.ok ? ((await rConvs.json()) as Array<{ id: string; contact_id: string; channel_id: string; assigned_to?: string; mode: string; status: string; last_message_at?: string }>) : [];
    const contacts = rContacts.ok ? ((await rContacts.json()) as Array<Record<string, unknown>>) : [];
    const channels = rChannels.ok ? ((await rChannels.json()) as Array<{ id: string; instance_name: string; status: string }>) : [];
    const memberships = rMemberships.ok ? ((await rMemberships.json()) as Array<{ user_id: string; role: string; created_at?: string }>) : [];
    const handoffs = rHandoffs.ok ? ((await rHandoffs.json()) as Array<Record<string, unknown>>) : [];

    const conversationTags: Record<string, string> = dataObj.conversationTags || {};
    const conversationPriorities: Record<string, "low" | "normal" | "high" | "urgent"> = dataObj.conversationPriorities || {};
    const satisfactionSurveys: Array<Record<string, unknown>> = Array.isArray(dataObj.satisfactionSurveys) ? dataObj.satisfactionSurveys : [];
    const quickReplies = Array.isArray(dataObj.quickReplies) && dataObj.quickReplies.length > 0 ? dataObj.quickReplies : DEFAULT_QUICK_REPLIES;
    const upgradeRequests = Array.isArray(dataObj.upgradeRequests) ? dataObj.upgradeRequests : [];

    const operatorMetadata: Array<Record<string, unknown>> = Array.isArray(dataObj.teamOperators) ? dataObj.teamOperators : [];
    const teamOperators: Array<Record<string, unknown>> = memberships.map((m, idx: number) => ({
      id: m.user_id, name: idx === 0 ? "Operador Principal" : "Operador #" + (idx + 1),
      email: "—", ...(operatorMetadata.find(o => o.id === m.user_id) || {}),
      role: m.role, status: "active", createdAt: m.created_at,
    }));

    // Apply report filters
    const nowMs = Date.now();
    const cutoffMs = periodFilter === "7d"
      ? nowMs - 7 * 86400000
      : periodFilter === "30d"
        ? nowMs - 30 * 86400000
        : 0;

    const filteredConvs = rawConvs.filter(c => {
      if (cutoffMs > 0 && c.last_message_at && new Date(c.last_message_at).getTime() < cutoffMs) {
        return false;
      }
      if (channelFilter !== "all" && c.channel_id !== channelFilter) {
        return false;
      }
      const cTag = conversationTags[c.id] || conversationTags[c.contact_id] || "";
      if (tagFilter !== "all" && cTag !== tagFilter) {
        return false;
      }
      const cPrio = conversationPriorities[c.id] || "normal";
      if (priorityFilter !== "all" && cPrio !== priorityFilter) {
        return false;
      }
      if (operatorFilter !== "all" && c.assigned_to !== operatorFilter) {
        return false;
      }
      return true;
    });

    // 1. BASIC INDICATORS (CRM Start+)
    const monthKey = getBrazilMonthKey();
    let quotaUsed = effectivePlan.quotaUsed || 0;
    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1200, maxRetriesPerRequest: 1 });
      await redis.connect();
      const qKey = effectivePlan.isTrial ? `crm:quota:trial:${tenantId}` : `crm:quota:${tenantId}:${monthKey}`;
      const rawQ = await redis.get(qKey);
      redis.disconnect();
      if (rawQ) quotaUsed = Math.max(quotaUsed, parseInt(rawQ, 10) || 0);
    } catch {}

    const aiConversations = filteredConvs.filter(c => c.mode === "ai").length;
    const humanConversations = filteredConvs.filter(c => c.mode !== "ai").length;
    const activeConversations = filteredConvs.filter(c => c.status === "open" || c.status === "pending").length;

    const basicIndicators = {
      quotaUsed,
      quotaLimit: effectivePlan.quotaLimit,
      quotaPercent: Math.min(100, Math.round((quotaUsed / Math.max(1, effectivePlan.quotaLimit)) * 100)),
      totalConversations: filteredConvs.length,
      activeConversations,
      aiConversations,
      humanConversations,
      totalContacts: contacts.length
    };

    // 2. COMMERCIAL INDICATORS (CRM Business+)
    const allowCommercial = crmFeatureAllowed(effectivePlan, "commercial_indicators");
    const tagBreakdown: Record<string, number> = {
      "Interessado": 0,
      "Orçamento enviado": 0,
      "Venda confirmada": 0,
      "Cliente perdido": 0,
      "Sem etiqueta": 0
    };
    const priorityBreakdown: Record<string, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0
    };

    for (const c of filteredConvs) {
      const tName = conversationTags[c.id] || conversationTags[c.contact_id] || "Sem etiqueta";
      tagBreakdown[tName] = (tagBreakdown[tName] || 0) + 1;

      const prio = conversationPriorities[c.id] || (c.status === "pending" && c.mode === "human" ? "high" : "normal");
      priorityBreakdown[prio] = (priorityBreakdown[prio] || 0) + 1;
    }

    const totalSurveys = satisfactionSurveys.length;
    const avgSatisfaction = totalSurveys > 0
      ? Number((satisfactionSurveys.reduce((acc, s) => acc + Number(s.rating || 0), 0) / totalSurveys).toFixed(2))
      : 0;
    const handoffRate = filteredConvs.length > 0
      ? Math.round((Math.max(humanConversations, handoffs.length) / filteredConvs.length) * 100)
      : 0;

    const commercialIndicators = allowCommercial ? {
      tagBreakdown,
      priorityBreakdown,
      handoffCount: handoffs.length,
      handoffRate,
      totalSurveys,
      avgSatisfaction
    } : null;

    // 3. ADVANCED REPORTS, SATISFACTION ANALYTICS & OPERATOR INDICATORS (CRM Premium)
    const allowAdvanced = crmFeatureAllowed(effectivePlan, "advanced_reports");

    let premiumAnalytics = null;
    if (allowAdvanced) {
      const starDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let aiRatingSum = 0, aiRatingCount = 0;
      let humanRatingSum = 0, humanRatingCount = 0;

      for (const s of satisfactionSurveys) {
        const r = Math.max(1, Math.min(5, Math.round(Number(s.rating || 5))));
        starDistribution[r] = (starDistribution[r] || 0) + 1;
        if (s.mode === "ai") {
          aiRatingSum += r;
          aiRatingCount++;
        } else {
          humanRatingSum += r;
          humanRatingCount++;
        }
      }

      const positiveSurveys = (starDistribution[4] || 0) + (starDistribution[5] || 0);
      const csatPercent = totalSurveys > 0 ? Math.round((positiveSurveys / totalSurveys) * 100) : 0;
      const detractors = satisfactionSurveys.filter(s => Number(s.rating) <= 2).slice(0, 20);

      // Per-operator performance metrics
      const activeOps = teamOperators.filter(op => op.status !== "revoked");
      const operatorMetrics = activeOps.map((op) => {
        const opConvs = filteredConvs.filter(c => c.assigned_to === op.id || (!c.assigned_to && c.mode === "human" && activeOps.length === 1));
        const opSurveys = satisfactionSurveys.filter(s => s.operatorId === op.id || s.operatorName === op.name);
        const opAvgRating = opSurveys.length > 0
          ? Number((opSurveys.reduce((a, b) => a + Number(b.rating || 0), 0) / opSurveys.length).toFixed(2))
          : null;
        return {
          operatorId: op.id,
          name: op.name,
          email: op.email,
          role: op.role,
          conversationsHandled: opConvs.length,
          surveysCount: opSurveys.length,
          avgRating: opAvgRating
        };
      });

      premiumAnalytics = {
        starDistribution: crmFeatureAllowed(effectivePlan, "satisfaction_analytics") ? starDistribution : null,
        csatPercent: crmFeatureAllowed(effectivePlan, "satisfaction_analytics") ? csatPercent : null,
        aiAvgRating: aiRatingCount > 0 ? Number((aiRatingSum / aiRatingCount).toFixed(2)) : null,
        humanAvgRating: humanRatingCount > 0 ? Number((humanRatingSum / humanRatingCount).toFixed(2)) : null,
        detractors: crmFeatureAllowed(effectivePlan, "satisfaction_analytics") ? detractors : [],
        operatorMetrics: crmFeatureAllowed(effectivePlan, "operator_indicators") ? operatorMetrics : [],
        channelsSummary: channels.map(ch => ({
          id: ch.id,
          instanceName: ch.instance_name,
          status: ch.status,
          conversationsCount: filteredConvs.filter(c => c.channel_id === ch.id).length
        }))
      };
    }

    return privateJson({
      quickReplies: crmFeatureAllowed(effectivePlan, "quick_replies") ? quickReplies : [],
      teamOperators,
      maxOperators: effectivePlan.maxOperators,
      conversationTags: crmFeatureAllowed(effectivePlan, "commercial_tags") ? conversationTags : {},
      conversationPriorities: crmFeatureAllowed(effectivePlan, "conversation_priority") ? conversationPriorities : {},
      satisfactionSurveys: crmFeatureAllowed(effectivePlan, "satisfaction_survey") ? satisfactionSurveys : [],
      upgradeRequests,
      reports: {
        basicIndicators,
        commercialIndicators,
        premiumAnalytics
      },
      featureStates: effectivePlan.featureStates
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "features_unavailable" }, 503);
  }
}

// POST: Execute actions for Quick Replies, Priorities, Satisfaction Surveys, Team Operators, and Upgrade Requests
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const auth = await authorizeTenant(request, tenantId);
    if (!auth.authorized) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey, redisUrl } = getServiceConfig();
    if (!url || !serviceKey) return privateJson({ error: "backend_not_configured" }, 503);

    if (["set_priority", "submit_satisfaction"].includes(action)) {
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      if (conversationId && !await ownsCrmResource(tenantId, "crm_conversations", conversationId)) {
        return privateJson({ error: "conversation_not_found" }, 404);
      }
    }
    if (["add_operator", "update_operator", "revoke_operator"].includes(action) &&
      !await authorizeCrmTenant(request, tenantId, ["owner", "admin"])) {
      return privateJson({ error: "not_authorized" }, 403);
    }

    const dataObj = await loadTenantSettingsJson(url, serviceKey, tenantId);

    // 1. ACTION: Request Plan Upgrade (Always allowed, even when account is suspended or locked!)
    if (action === "request_upgrade") {
      const requestedPlan = typeof body.targetPlanId === "string" ? body.targetPlanId : typeof body.requestedPlan === "string" ? body.requestedPlan : "";
      const featureRequested = typeof body.featureRequested === "string" ? body.featureRequested : "";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";

      const effectivePlan = await getEffectiveTenantPlan(tenantId);
      const targetPlan = (await getMasterPlans()).find(p => p.status === "active" && (p.id === requestedPlan || p.name.toLowerCase() === requestedPlan.toLowerCase()));
      if (!targetPlan) return privateJson({ error: "invalid_upgrade_plan" }, 400);

      const upgradeRequests: Array<Record<string, unknown>> = Array.isArray(dataObj.upgradeRequests)
        ? dataObj.upgradeRequests
        : [];

      const newReq = {
        id: `upg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tenantId,
        currentPlanId: effectivePlan.planId,
        currentPlanName: effectivePlan.planName,
        targetPlanId: targetPlan.id,
        targetPlanName: targetPlan.name,
        targetPrice: targetPlan.price,
        featureRequested,
        note,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      upgradeRequests.unshift(newReq);
      dataObj.upgradeRequests = upgradeRequests.slice(0, 50);
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "upgradeRequests");

      return privateJson({
        requested: true,
        upgradeRequest: newReq,
        upgradeRequests: dataObj.upgradeRequests,
        message: `Solicitação de upgrade para o plano ${targetPlan.name} enviada com sucesso para a central Master!`
      });
    }

    // 2. ACTION: Save or Delete Quick Reply (Requires 'quick_replies' - Start, Business, Premium)
    if (action === "save_quick_reply" || action === "delete_quick_reply") {
      const guard = await requireTenantFeature(tenantId, "quick_replies");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const list: Array<Record<string, unknown>> = Array.isArray(dataObj.quickReplies) && dataObj.quickReplies.length > 0
        ? [...dataObj.quickReplies]
        : [...DEFAULT_QUICK_REPLIES];

      if (action === "delete_quick_reply") {
        const replyId = String(body.replyId || body.id || "");
        dataObj.quickReplies = list.filter(r => r.id !== replyId);
      } else {
        const replyId = typeof body.id === "string" && body.id ? body.id : `qr_${Date.now()}`;
        const rawShortcut = typeof body.shortcut === "string" ? body.shortcut.trim() : "/atalho";
        const shortcut = rawShortcut.startsWith("/") ? rawShortcut : `/${rawShortcut}`;
        const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "Resposta Rápida";
        const replyBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
        const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Geral";

        if (!replyBody) return privateJson({ error: "empty_quick_reply_body", message: "Digite o texto da resposta rápida." }, 400);

        const existingIdx = list.findIndex(r => r.id === replyId);
        const item = { id: replyId, shortcut, title, body: replyBody, category, updatedAt: new Date().toISOString() };
        if (existingIdx >= 0) list[existingIdx] = item;
        else list.push(item);

        dataObj.quickReplies = list;
      }

      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "quickReplies");
      return privateJson({ saved: true, quickReplies: dataObj.quickReplies });
    }

    // 3. ACTION: Set Conversation Priority (Requires 'conversation_priority' - Business, Premium)
    if (action === "set_priority") {
      const guard = await requireTenantFeature(tenantId, "conversation_priority");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const validPriorities = ["low", "normal", "high", "urgent"] as const;
      const priority = validPriorities.includes(body.priority) ? body.priority : "normal";

      if (!conversationId) return privateJson({ error: "missing_conversation_id" }, 400);

      const priorities = dataObj.conversationPriorities && typeof dataObj.conversationPriorities === "object"
        ? dataObj.conversationPriorities
        : {};
      priorities[conversationId] = priority;
      dataObj.conversationPriorities = priorities;
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "conversationPriorities");

      // Sync to Redis for real-time queue sorting
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1200, maxRetriesPerRequest: 1 });
        await redis.connect();
        await redis.set(`crm:priority:${tenantId}:${conversationId}`, priority, "EX", 86400 * 30);
        redis.disconnect();
      } catch {}

      return privateJson({ saved: true, conversationId, priority });
    }

    // 4. ACTION: Submit or Send Satisfaction Survey (Requires 'satisfaction_survey' - Business, Premium)
    if (action === "submit_satisfaction") {
      const guard = await requireTenantFeature(tenantId, "satisfaction_survey");
      if (!guard.allowed) {
        return privateJson({ error: guard.errorCode, state: guard.state, message: guard.message }, guard.statusHttp);
      }

      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone : "";
      const contactName = typeof body.contactName === "string" ? body.contactName : contactPhone;
      const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating || 5))));
      const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 600) : "";
      const operatorName = typeof body.operatorName === "string" ? body.operatorName : "Atendimento";
      const operatorId = typeof body.operatorId === "string" ? body.operatorId : auth.operatorId;
      const mode = body.mode === "ai" ? "ai" : "human";
      const dayBucket = new Date().toISOString().slice(0, 10);
      const dedupKey = `${conversationId || contactPhone}:${dayBucket}`;

      const surveys: Array<Record<string, unknown>> = Array.isArray(dataObj.satisfactionSurveys)
        ? dataObj.satisfactionSurveys
        : [];

      // Prevent duplicate survey for the same conversation on the same day unless explicitly updating
      if (surveys.some(s => s.dedupKey === dedupKey) && !body.allowUpdate) {
        return privateJson({
          error: "duplicate_survey",
          message: "Já existe uma avaliação registrada para este atendimento hoje."
        }, 409);
      }

      const entry = {
        id: `csat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        dedupKey,
        conversationId,
        contactPhone,
        contactName,
        rating,
        comment,
        operatorId,
        operatorName,
        mode,
        createdAt: new Date().toISOString()
      };

      const filtered = surveys.filter(s => s.dedupKey !== dedupKey);
      filtered.unshift(entry);
      dataObj.satisfactionSurveys = filtered.slice(0, 300);
      await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "satisfactionSurveys");

      return privateJson({
        saved: true,
        survey: entry,
        satisfactionSurveys: dataObj.satisfactionSurveys
      });
    }

    // 5. ACTION: Manage Team Operators (Add, Update Role, Revoke) respecting maxOperators (1, 3, 5)
    if (action === "add_operator" || action === "update_operator" || action === "revoke_operator") {
      const effectivePlan = await getEffectiveTenantPlan(tenantId);
      if (effectivePlan.isSuspended) {
        return privateJson({
          error: "ACCOUNT_SUSPENDED",
          message: effectivePlan.publicSuspensionReason || "Conta suspensa administrativamente."
        }, 403);
      }

      const teamOperators: Array<Record<string, unknown>> = Array.isArray(dataObj.teamOperators)
        ? [...dataObj.teamOperators]
        : [];

      if (action === "add_operator") {
        const rMembers = await fetch(url + "/rest/v1/crm_tenant_memberships?is_active=eq.true&tenant_id=eq." + tenantId + "&select=user_id,role", {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, cache: "no-store",
        });
        if (!rMembers.ok) throw new Error("operator_limit_verification_failed");
        const members = await rMembers.json() as Array<{user_id: string; role: string}>;
        if (!Array.isArray(members)) throw new Error("operator_limit_verification_failed");
        if (members.length >= effectivePlan.maxOperators) return privateJson({ error: "OPERATOR_LIMIT_REACHED", maxOperators: effectivePlan.maxOperators }, 403);

        const name = typeof body.name === "string" ? body.name.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const role = ["admin", "agent", "viewer"].includes(body.role) ? body.role : "agent";

        if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
          return privateJson({
            error: "invalid_operator_data",
            message: "Informe nome válido, e-mail e senha com no mínimo 6 caracteres."
          }, 400);
        }

        const rUser = await fetch(url + "/auth/v1/admin/users", {
          method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
        });
        if (!rUser.ok) return privateJson({ error: "operator_account_creation_failed", message: "Não foi possível criar a conta do operador." }, rUser.status === 422 ? 409 : 503);
        const uData = await rUser.json();
        const userId = typeof uData.id === "string" ? uData.id : "";
        if (!UUID.test(userId)) throw new Error("operator_account_creation_unconfirmed");
        let membershipConfirmed = false;
        try {
          const rMember = await fetch(url + "/rest/v1/rpc/crm_add_operator_membership", {
            method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
            body: JSON.stringify({ p_tenant: tenantId, p_user: userId, p_role: role, p_max: effectivePlan.maxOperators }),
          });
          if (!rMember.ok) {
            const detail = await rMember.text();
            if (rMember.status === 409 || /operator_limit_reached/i.test(detail)) return privateJson({ error: "OPERATOR_LIMIT_REACHED" }, 403);
            throw new Error("operator_membership_creation_failed");
          }
          const result = await rMember.json();
          if (result?.added !== true) throw new Error("operator_membership_creation_unconfirmed");
          membershipConfirmed = true;
        } finally {
          if (!membershipConfirmed) await fetch(url + "/auth/v1/admin/users/" + userId, {
            method: "DELETE", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          }).catch(() => {});
        }

        const newOp = {
          id: userId,
          name,
          email,
          role,
          status: "active",
          createdAt: new Date().toISOString()
        };
        teamOperators.push(newOp);
        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "teamOperators");

        return privateJson({ saved: true, operator: newOp, teamOperators });
      }

      if (action === "update_operator") {
        const operatorId = String(body.operatorId || "");
        const role = ["admin", "agent", "viewer"].includes(body.role) ? body.role : "agent";
        const idx = teamOperators.findIndex(o => o.id === operatorId);
        if (idx >= 0) {
          teamOperators[idx].role = role;
          if (typeof body.name === "string" && body.name.trim()) {
            teamOperators[idx].name = body.name.trim();
          }
        }
        if (!UUID.test(operatorId)) return privateJson({ error: "invalid_operator" }, 400);
        const rMember = await fetch(url + "/rest/v1/rpc/crm_update_operator_membership", {
          method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ p_tenant: tenantId, p_user: operatorId, p_role: role }),
        });
        if (!rMember.ok) return privateJson({ error: "operator_update_denied" }, rMember.status === 404 ? 404 : 403);

        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "teamOperators");
        return privateJson({ saved: true, teamOperators });
      }

      if (action === "revoke_operator") {
        const operatorId = String(body.operatorId || "");
        const idx = teamOperators.findIndex(o => o.id === operatorId);
        if (idx >= 0) {
          teamOperators[idx].status = "revoked";
          teamOperators[idx].revokedAt = new Date().toISOString();
        }
        if (!UUID.test(operatorId)) return privateJson({ error: "invalid_operator" }, 400);
        const rMember = await fetch(url + "/rest/v1/rpc/crm_revoke_operator_membership", {
          method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ p_tenant: tenantId, p_user: operatorId }),
        });
        if (!rMember.ok) return privateJson({ error: "operator_revoke_denied" }, rMember.status === 404 ? 404 : 403);

        dataObj.teamOperators = teamOperators;
        await saveTenantSettingsJson(url, serviceKey, tenantId, dataObj, "teamOperators");
        return privateJson({ saved: true, revoked: true, teamOperators });
      }
    }

    return privateJson({ error: "invalid_action" }, 400);
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "feature_action_failed" }, 503);
  }
}

