import type { StoredTenantConfig } from "@/lib/crm/settings-types";
import { NextRequest } from "next/server";
import { authorizeCrmTenant, crmFeatureAllowed, patchCrmConfig } from "@/lib/crm/tenant-access";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { getEffectiveTenantPlan, requireTenantFeature } from "@/lib/crm/plans";
import { buildTenantWhatsappSlots } from "@/lib/crm/whatsapp-slots";
import { getBrazilMonthKey } from "@/lib/agent/processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_DAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  return { url, serviceKey, redisUrl };
}

export type DaySchedule = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  hasBreak?: boolean;
  breakStart?: string;
  breakEnd?: string;
  intervals?: Array<{ start: string; end: string }>;
};

export type OperatingHours = {
  enabled: boolean;
  timezone: string;
  openTime: string;
  closeTime: string;
  days: string[];
  sendClosedMessage: boolean;
  closedMessage: string;
  schedule: Record<string, DaySchedule>;
};

const DEFAULT_DAYS = ["seg", "ter", "qua", "qui", "sex", "sab"];

export const DEFAULT_QUICK_REPLIES = [
  {
    id: "qr_boas_vindas",
    shortcut: "/oi",
    title: "Boas-vindas e Apresentação",
    body: "Olá! Tudo bem? 😊 Sou do atendimento humano. Como posso ajudar você hoje?",
    category: "Saudação"
  },
  {
    id: "qr_pix",
    shortcut: "/pix",
    title: "Dados para Pagamento via PIX",
    body: "Para pagamento via PIX, assim que realizar a transferência nos envie o comprovante por aqui para confirmarmos seu pedido imediatamente! ✅",
    category: "Financeiro"
  },
  {
    id: "qr_encerramento",
    shortcut: "/obrigado",
    title: "Agradecimento e Encerramento",
    body: "Muito obrigado pelo seu contato! Qualquer outra dúvida, permanecemos à disposição. Tenha um excelente dia! 🙌",
    category: "Encerramento"
  }
];

function buildDefaultSchedule(openTime = "08:00", closeTime = "18:00", activeDays: string[] = DEFAULT_DAYS): Record<string, DaySchedule> {
  const schedule: Record<string, DaySchedule> = {};
  for (const d of ALL_DAYS) {
    schedule[d] = {
      enabled: activeDays.includes(d),
      openTime,
      closeTime,
      hasBreak: false,
      breakStart: "12:00",
      breakEnd: "13:00",
      intervals: []
    };
  }
  return schedule;
}

export function normalizeOperatingHours(
  raw?: Partial<OperatingHours> | null,
  fallbackTimezone = "America/Sao_Paulo",
  allowAdvancedIntervals = true
): OperatingHours {
  const openTime = typeof raw?.openTime === "string" && /^\d{2}:\d{2}$/.test(raw.openTime) ? raw.openTime : "08:00";
  const closeTime = typeof raw?.closeTime === "string" && /^\d{2}:\d{2}$/.test(raw.closeTime) ? raw.closeTime : "18:00";
  const rawDays = Array.isArray(raw?.days) ? raw!.days.filter(d => ALL_DAYS.some(day => day === d)) : DEFAULT_DAYS;

  const schedule: Record<string, DaySchedule> = buildDefaultSchedule(openTime, closeTime, rawDays);
  if (raw?.schedule && typeof raw.schedule === "object") {
    for (const d of ALL_DAYS) {
      const item = raw.schedule[d];
      if (item && typeof item === "object") {
        schedule[d] = {
          enabled: Boolean(item.enabled),
          openTime: typeof item.openTime === "string" && /^\d{2}:\d{2}$/.test(item.openTime) ? item.openTime : openTime,
          closeTime: typeof item.closeTime === "string" && /^\d{2}:\d{2}$/.test(item.closeTime) ? item.closeTime : closeTime,
          hasBreak: allowAdvancedIntervals ? Boolean(item.hasBreak) : false,
          breakStart: typeof item.breakStart === "string" && /^\d{2}:\d{2}$/.test(item.breakStart) ? item.breakStart : "12:00",
          breakEnd: typeof item.breakEnd === "string" && /^\d{2}:\d{2}$/.test(item.breakEnd) ? item.breakEnd : "13:00",
          intervals: allowAdvancedIntervals && Array.isArray(item.intervals) ? item.intervals : []
        };
      }
    }
  }

  const syncedDays = ALL_DAYS.filter(d => schedule[d]?.enabled);

  return {
    enabled: Boolean(raw?.enabled),
    timezone: typeof raw?.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim() : fallbackTimezone,
    openTime,
    closeTime,
    days: syncedDays,
    sendClosedMessage: raw?.sendClosedMessage !== false,
    closedMessage:
      typeof raw?.closedMessage === "string"
        ? raw.closedMessage
        : "Olá! No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e responderemos assim que abrirmos! 😊",
    schedule
  };
}

async function authorizeTenantAccess(request: NextRequest, tenantId: string) {
  const access = await authorizeCrmTenant(request, tenantId);
  return { authorized: Boolean(access), operatorId: access?.operatorId ?? undefined, operatorEmail: access?.operatorEmail };
}

// GET: Retrieve the client store's AI settings, knowledge, operating hours, quota, 5 WhatsApp slots, quick replies, operators, satisfaction & upgrade requests
export async function GET(request: NextRequest) {
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "";
  if (!UUID.test(tenant)) return privateJson({ error: "invalid_tenant" }, 400);

  try {
    const access = await authorizeTenantAccess(request, tenant);
    if (!access.authorized) return privateJson({ error: "unauthorized" }, 401);

    const readGuard = await requireTenantFeature(tenant, "ai_chat");
    if (!readGuard.allowed) return privateJson({ error: readGuard.errorCode, state: readGuard.state, message: readGuard.message }, readGuard.statusHttp);
    const { url, serviceKey, redisUrl } = getServiceConfig();

    // 1. Fetch tenant info, agent, articles, settings, channels, and memberships in parallel
    const [rTenant, rAgent, rArticle, rSettings, rChannels, rMemberships, effectivePlan] = await Promise.all([
      fetch(url + `/rest/v1/crm_tenants?id=eq.${tenant}&select=id,name,status&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenant}&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenant}&order=updated_at.desc&limit=20`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenant}&select=timezone,business_description&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_channels?tenant_id=eq.${tenant}&select=id,instance_name,status&order=created_at.asc`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      fetch(url + `/rest/v1/crm_tenant_memberships?is_active=eq.true&tenant_id=eq.${tenant}&select=user_id,role,created_at`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }),
      getEffectiveTenantPlan(tenant)
    ]);

    const tenants = rTenant.ok ? ((await rTenant.json()) as Array<{ id: string; name: string; status: string }>) : [];
    const tenantName = tenants[0]?.name || "Estabelecimento";

    const agents = rAgent.ok ? ((await rAgent.json()) as Array<{ id: string; label: string; instructions: string; enabled: boolean }>) : [];
    const agent = agents[0] ?? {
      id: "",
      label: "Assistente Virtual",
      instructions: "Responda os clientes de forma educada, informando nossos produtos e horários.",
      enabled: true
    };

    const articles = rArticle.ok ? ((await rArticle.json()) as Array<{ id: string; title: string; body: string; status: string }>) : [];
    const mainArticle =
      (Array.isArray(articles) && articles.find(a => a.title === "Informações da Loja e Cardápio")) ||
      (Array.isArray(articles) && articles.find(a => a.status === "published")) ||
      articles?.[0];
    const storeInfo = mainArticle?.body ?? "";
    const storeInfoTitle = mainArticle?.title ?? "Informações da Loja e Cardápio";

    const channels = rChannels.ok ? ((await rChannels.json()) as Array<{ id: string; instance_name: string; status: string }>) : [];
    const memberships = rMemberships.ok ? ((await rMemberships.json()) as Array<{ user_id: string; role: string; created_at?: string }>) : [];

    let rawOperatingHours: Partial<OperatingHours> | undefined;
    let dbTimezone = "America/Sao_Paulo";
    let parsedSettings: StoredTenantConfig & { ai_settings?: { operatingHours?: Partial<OperatingHours> } } = {};

    if (rSettings.ok) {
      const settings = (await rSettings.json()) as Array<{ timezone?: string; business_description: string }>;
      if (settings[0]?.timezone) dbTimezone = settings[0].timezone;
      const rawDesc = settings[0]?.business_description ?? "";
      if (rawDesc.startsWith("{")) {
        try {
          parsedSettings = JSON.parse(rawDesc);
          if (parsedSettings.ai_settings?.operatingHours) {
            rawOperatingHours = parsedSettings.ai_settings.operatingHours;
          }
        } catch {}
      }
    }

    const allowAdvancedHours = crmFeatureAllowed(effectivePlan, "business_hours");
    const operatingHours = normalizeOperatingHours(rawOperatingHours, dbTimezone, allowAdvancedHours);

    // 4. Read real quota used this month from Redis + durable fallback
    const monthKey = getBrazilMonthKey();
    const durableUsed = effectivePlan.isTrial
      ? Number(parsedSettings?.usageCounters?.trialUsed ?? effectivePlan.quotaUsed ?? 0)
      : Number(parsedSettings?.usageCounters?.monthly?.[monthKey] ?? effectivePlan.quotaUsed ?? 0);

    let quotaUsed = Math.max(durableUsed, effectivePlan.quotaUsed || 0);
    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 1500, maxRetriesPerRequest: 1 });
      await redis.connect();
      const quotaKey = effectivePlan.isTrial ? `crm:quota:trial:${tenant}` : `crm:quota:${tenant}:${monthKey}`;
      const usedRaw = await redis.get(quotaKey);
      redis.disconnect();
      if (usedRaw) {
        quotaUsed = Math.max(quotaUsed, parseInt(usedRaw, 10) || 0);
      }
    } catch {}

    const whatsappSlots = buildTenantWhatsappSlots(tenantName, channels, effectivePlan);

    const quickReplies = Array.isArray(parsedSettings.quickReplies) && parsedSettings.quickReplies.length > 0
      ? parsedSettings.quickReplies
      : DEFAULT_QUICK_REPLIES;

    const operatorMetadata: Array<Record<string, unknown>> = Array.isArray(parsedSettings.teamOperators) ? parsedSettings.teamOperators : [];
    const teamOperators = memberships.map((m, idx) => ({
      id: m.user_id, name: idx === 0 ? "Operador Principal (" + tenantName + ")" : "Operador #" + (idx + 1),
      email: "—", ...(operatorMetadata.find(o => o.id === m.user_id) || {}),
      role: m.role, status: "active", createdAt: m.created_at,
    }));

    const satisfactionSurveys = Array.isArray(parsedSettings.satisfactionSurveys)
      ? parsedSettings.satisfactionSurveys
      : [];

    const upgradeRequests = Array.isArray(parsedSettings.upgradeRequests)
      ? parsedSettings.upgradeRequests
      : [];

    const planData = {
      ...effectivePlan,
      quotaUsed
    };

    return privateJson({
      tenantName,
      agentId: agent.id,
      agentLabel: agent.label || "Assistente Virtual",
      instructions: agent.instructions,
      enabled: agent.enabled,
      storeInfo,
      storeInfoTitle,
      operatingHours,
      allowAdvancedHours,
      whatsappSlots,
      quickReplies: crmFeatureAllowed(effectivePlan, "quick_replies") ? quickReplies : [],
      teamOperators,
      satisfactionSurveys: crmFeatureAllowed(effectivePlan, "satisfaction_survey") ? satisfactionSurveys : [],
      upgradeRequests,
      plan: planData,
      allowedFeatures: effectivePlan.allowedFeatures,
      featureStates: effectivePlan.featureStates
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "ai_settings_unavailable" }, 503);
  }
}

// POST: Store owner saves custom AI instructions, store knowledge, and/or operating hours (with backend plan validation)
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {
    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);

    const access = await authorizeTenantAccess(request, tenantId);
    if (!access.authorized) return privateJson({ error: "unauthorized" }, 401);

    const { url, serviceKey } = getServiceConfig();
    const aiGuard = await requireTenantFeature(tenantId, "ai_chat");
    if (!aiGuard.allowed) return privateJson({ error: aiGuard.errorCode, state: aiGuard.state, message: aiGuard.message }, aiGuard.statusHttp);
    const effectivePlan = aiGuard.effectivePlan;

    if (effectivePlan.isSuspended) {
      return privateJson({
        error: "account_suspended",
        message: effectivePlan.publicSuspensionReason || "Conta suspensa administrativamente. Regularize seu plano para alterar configurações."
      }, 403);
    }

    const hasAgentFields = body.agentLabel !== undefined || body.instructions !== undefined || body.enabled !== undefined;
    const incomingOperatingHours = body.operatingHours;

    // Validate operating hours permissions on backend
    const allowAdvancedHours = crmFeatureAllowed(effectivePlan, "business_hours");
    const allowBasicHours = allowAdvancedHours || crmFeatureAllowed(effectivePlan, "business_hours_basic");

    if (incomingOperatingHours && typeof incomingOperatingHours === "object") {
      if (!allowBasicHours) {
        return privateJson({
          error: "PLAN_FEATURE_LOCKED",
          message: `O controle de horários não está disponível no plano ${effectivePlan.planName}.`
        }, 403);
      }

      // Check if user tried to enable intervals/breaks without Business/Premium plan
      const sched = incomingOperatingHours.schedule || {};
      const requestedBreaks = Object.values(sched).some(
        (d: unknown) => d && typeof d === "object" && (
          (d as Record<string, unknown>).hasBreak === true ||
          (Array.isArray((d as Record<string, unknown>).intervals) && ((d as Record<string, unknown>).intervals as unknown[]).length > 0)
        )
      );
      if (requestedBreaks && !allowAdvancedHours) {
        const hoursGuard = await requireTenantFeature(tenantId, "business_hours");
        if (!hoursGuard.allowed) return privateJson({ error: hoursGuard.errorCode, state: hoursGuard.state, message: hoursGuard.message }, hoursGuard.statusHttp);
        return privateJson({
          error: "PLAN_FEATURE_LOCKED",
          requiredPlan: "CRM Business",
          message: "Horários avançados com intervalos e múltiplos turnos estão disponíveis a partir do plano CRM Business."
        }, 403);
      }
    }

    let savedLabel = "Assistente Virtual";
    let savedEnabled = true;

    // 1. Upsert or Update Agent ONLY when agent fields were submitted
    if (hasAgentFields) {
      const rawLabel = typeof body.agentLabel === "string" ? body.agentLabel.trim() : "";
      const label = rawLabel.length >= 2 ? rawLabel.slice(0, 100) : "Assistente Virtual";
      const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
      const enabled = body.enabled !== false;
      savedLabel = label;
      savedEnabled = enabled;

      const rCheckAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      const existingAgents = (await rCheckAgent.json()) as Array<{ id: string }>;

      if (existingAgents.length > 0) {
        const rPatch = await fetch(url + `/rest/v1/crm_agents?id=eq.${existingAgents[0].id}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ label, instructions, enabled })
        });
        if (!rPatch.ok) {
          const errText = await rPatch.text();
          throw new Error(`Falha ao atualizar agente: ${errText}`);
        }
      } else {
        const rPost = await fetch(url + "/rest/v1/crm_agents", {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, label, instructions, enabled, provider_route: "auto" })
        });
        if (!rPost.ok) {
          const errText = await rPost.text();
          throw new Error(`Falha ao criar agente: ${errText}`);
        }
      }
    }

    // 2. Upsert or Update main knowledge article if storeInfo is provided
    const storeInfo = typeof body.storeInfo === "string" ? body.storeInfo.trim() : "";
    if (storeInfo.length > 0) {
      const rCheckArt = await fetch(
        url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&order=updated_at.desc&limit=20`,
        {
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
          cache: "no-store"
        }
      );
      const existingArticles = (await rCheckArt.json()) as Array<{ id: string; title: string }>;
      const targetArticle =
        (Array.isArray(existingArticles) && existingArticles.find(a => a.title === "Informações da Loja e Cardápio")) ||
        (Array.isArray(existingArticles) && existingArticles.length === 1 ? existingArticles[0] : undefined);

      if (targetArticle) {
        await fetch(url + `/rest/v1/crm_knowledge_articles?id=eq.${targetArticle.id}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Informações da Loja e Cardápio",
            body: storeInfo,
            status: "published",
            updated_at: new Date().toISOString()
          })
        });
      } else {
        await fetch(url + "/rest/v1/crm_knowledge_articles", {
          method: "POST",
          headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            title: "Informações da Loja e Cardápio",
            body: storeInfo,
            status: "published",
            created_by: access.operatorId ?? null
          })
        });
      }
    }

    // 3. Save operating hours in crm_tenant_settings (enforcing basic vs advanced hours)
    let savedOperatingHours: OperatingHours | undefined;
    if (incomingOperatingHours && typeof incomingOperatingHours === "object") {
      const normalizedHours = normalizeOperatingHours(incomingOperatingHours, "America/Sao_Paulo", allowAdvancedHours);
      savedOperatingHours = normalizedHours;

      const rGet = await fetch(url + "/rest/v1/crm_tenant_settings?tenant_id=eq." + tenantId + "&select=business_description&limit=1", {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, cache: "no-store",
      });
      if (!rGet.ok) throw new Error("settings_unavailable");
      const current = await rGet.json() as Array<{business_description: string}>;
      if (current.length !== 1) throw new Error("settings_unavailable");
      const currentSettings = JSON.parse(current[0].business_description);
      await patchCrmConfig(tenantId, { ai_settings: { ...(currentSettings.ai_settings || {}), operatingHours: normalizedHours } });
      const rTimezone = await fetch(url + "/rest/v1/crm_tenant_settings?tenant_id=eq." + tenantId, {
        method: "PATCH", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: normalizedHours.timezone }),
      });
      if (!rTimezone.ok) throw new Error("timezone_write_failed");
    }

    return privateJson({
      saved: true,
      agentLabel: savedLabel,
      enabled: savedEnabled,
      hasStoreInfo: storeInfo.length > 0,
      operatingHours: savedOperatingHours,
      allowAdvancedHours
    });
  } catch (e) {
    return privateJson({
      error: e instanceof Error ? e.message : "save_failed",
      message: e instanceof Error ? e.message : "Falha ao salvar configurações."
    }, 503);
  }
}
