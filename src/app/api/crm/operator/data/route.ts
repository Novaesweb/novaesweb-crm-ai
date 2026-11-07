import { NextRequest } from "next/server";
import Redis from "ioredis";
import { getCrmAccess, selectCrmTenant, crmFeatureAllowed } from "@/lib/crm/tenant-access";
import { privateJson, supabaseRows } from "@/lib/crm/supabase-server";
import { detectCustomerEscalation } from "@/lib/agent/escalation";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";
import { getBrazilMonthKey } from "@/lib/agent/processor";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contact = { id: string; phone: string; display_name: string | null; created_at: string };
type Conversation = {
  id: string;
  contact_id: string;
  channel_id?: string | null;
  status: string;
  mode: string;
  last_message_at: string | null;
  assigned_to: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  priorityRank?: number;
  tag?: string | null;
  channelSlot?: number;
  satisfaction?: { rating: number; comment: string; createdAt: string } | null;
};
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; body: string; created_at: string };
type HandoffRow = { id: string; conversation_id: string; requested_by: string; status: string; reason: string | null; created_at: string };
type ChannelRow = { id: string; instance_name: string | null; status: string };


const PRIORITY_RANK: Record<"low" | "normal" | "high" | "urgent", number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return { url, serviceKey };
}

async function serviceQuery<T>(url: string, serviceKey: string, pathAndQuery: string, fallbackToken?: string): Promise<T> {
  if (url && serviceKey.length >= 30) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) return (await res.json()) as T;
  }
  if (fallbackToken) {
    return await supabaseRows<T>(pathAndQuery, fallbackToken);
  }
  return [] as unknown as T;
}

export async function GET(request: NextRequest) {
  try {
    const access = await getCrmAccess(request);
    if (!access) return privateJson({ error: "unauthorized" }, 401);
    const { url, serviceKey } = getServiceConfig();
    const tenants = access.tenants;
    const user = { token: access.token };
    const requestedTenant = request.nextUrl.searchParams.get("tenant");
    const selectedTenant = selectCrmTenant(access, requestedTenant);
    if (requestedTenant && !selectedTenant) return privateJson({ error: "tenant_forbidden" }, 403);
    const selected = selectedTenant?.id ?? null;
    if (!selected) return privateJson({ tenants, selectedTenant: null, contacts: [], conversations: [], messages: [] });

    // Check effective plan & auto-block for the selected tenant
    let isSuspended = false;
    let suspensionReason = "";
    const effectivePlan = await getEffectiveTenantPlan(selected);
    if (effectivePlan.isSuspended || (effectivePlan.autoBlock && effectivePlan.isOverdue)) {
      isSuspended = true;
      suspensionReason = effectivePlan.suspensionReason || "payment_overdue";
    }

    const selectedTenantObj = tenants.find(t => t.id === selected);
    if (selectedTenantObj?.status === "suspended") {
      isSuspended = true;
      if (!suspensionReason) suspensionReason = "admin_suspended";
    }

    const query = "tenant_id=eq." + encodeURIComponent(selected);
    const [contacts, rawConversations, messages, tags, contactTags, handoffs, channels, settingsRows] = await Promise.all([
      serviceQuery<Contact[]>(url, serviceKey, "crm_contacts?select=id,phone,display_name,created_at&" + query + "&order=created_at.desc&limit=100", user.token).catch(() => []),
      serviceQuery<Conversation[]>(url, serviceKey, "crm_conversations?select=id,contact_id,channel_id,status,mode,last_message_at,assigned_to&" + query + "&order=last_message_at.desc.nullslast&limit=100", user.token).catch(() => []),
      serviceQuery<Message[]>(url, serviceKey, "crm_messages?select=id,conversation_id,direction,sender_type,body,created_at&" + query + "&order=created_at.desc&limit=300", user.token).catch(() => []),
      serviceQuery<Array<{ id: string; name: string; color: string }>>(url, serviceKey, "crm_tags?select=id,name,color&" + query, user.token).catch(() => []),
      serviceQuery<Array<{ contact_id: string; tag_id: string }>>(url, serviceKey, "crm_contact_tags?select=contact_id,tag_id&" + query, user.token).catch(() => []),
      serviceQuery<HandoffRow[]>(url, serviceKey, "crm_handoffs?select=id,conversation_id,requested_by,status,reason,created_at&" + query + "&order=created_at.desc&limit=100", user.token).catch(() => []),
      serviceQuery<ChannelRow[]>(url, serviceKey, "crm_channels?select=id,instance_name,status&" + query, user.token).catch(() => []),
      serviceQuery<Array<{ config_jsonb: Record<string, unknown> }>>(url, serviceKey, "crm_tenant_settings?select=config_jsonb&" + query + "&limit=1", user.token).catch(() => []),
    ]);

    const channelSlotMap = new Map<string, number>();
    for (const ch of channels) {
      channelSlotMap.set(ch.id, extractSlotFromInstanceName(ch.instance_name || ""));
    }

    const tenantSettings = settingsRows?.[0]?.config_jsonb || {};
    const persistedConvTags = (tenantSettings.conversationTags as Record<string, string>) || {};
    const persistedConvPriorities = (tenantSettings.conversationPriorities as Record<string, { priority?: string }>) || {};
    const persistedSurveys = Array.isArray(tenantSettings.satisfactionSurveys)
      ? (tenantSettings.satisfactionSurveys as Array<{ conversationId?: string; rating: number; comment: string; createdAt: string }>)
      : [];
    const surveyByConvId = new Map<string, { rating: number; comment: string; createdAt: string }>();
    for (const s of persistedSurveys) {
      if (s.conversationId && !surveyByConvId.has(s.conversationId)) {
        surveyByConvId.set(s.conversationId, { rating: s.rating, comment: s.comment, createdAt: s.createdAt });
      }
    }

    // Map latest handoff per conversation
    const pendingHandoffMap = new Map<string, HandoffRow>();
    for (const h of handoffs) {
      if (h.status === "pending" && !pendingHandoffMap.has(h.conversation_id)) {
        pendingHandoffMap.set(h.conversation_id, h);
      }
    }

    const monthKey = getBrazilMonthKey();
    const quotaHistory = (tenantSettings.quotaHistory as Record<string, number>) || {};
    let quotaUsed = effectivePlan.isTrial
      ? Number(tenantSettings.trialQuotaUsed || 0)
      : Number(quotaHistory[monthKey] || 0);

    quotaUsed = Math.max(quotaUsed, effectivePlan.quotaUsed || 0);

    // Fetch escalation info, tags, priorities & quota usage from Redis
    const escalations: Record<string, { category: string; reason: string; text?: string; timestamp?: string; sentiment?: string }> = {};
    const redisConvTags: Record<string, string> = {};
    const redisConvPriorities: Record<string, string> = {};

    const redisUrl = process.env.CRM_REDIS_URL;
    if (redisUrl) {
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
        await redis.connect();
        const quotaKey = effectivePlan.isTrial ? `crm:quota:trial:${selected}` : `crm:quota:${selected}:${monthKey}`;
        const quotaUsedRaw = await redis.get(quotaKey);
        if (quotaUsedRaw !== null) {
          quotaUsed = Math.max(quotaUsed, parseInt(quotaUsedRaw || "0", 10));
        }

        for (const c of rawConversations) {
          const [rawEsc, rawTag, rawPrio] = await Promise.all([
            redis.get(`crm:escalation:${c.id}`).catch(() => null),
            redis.get(`crm:conv_tag:${c.id}`).catch(() => null),
            redis.get(`crm:conv_priority:${c.id}`).catch(() => null),
          ]);
          if (rawEsc) {
            try {
              escalations[c.id] = JSON.parse(rawEsc);
            } catch {}
          }
          if (rawTag) redisConvTags[c.id] = rawTag;
          if (rawPrio) redisConvPriorities[c.id] = rawPrio;
        }
        redis.disconnect();
      } catch {}
    }

    // Derive logical conversation status, mode, priority, tag, slot & satisfaction
    const mappedConversations: Conversation[] = rawConversations.map(c => {
      const convMsgs = messages.filter(m => m.conversation_id === c.id);
      const newestMsg = convMsgs[0];
      const pendingHandoff = pendingHandoffMap.get(c.id);

      let derivedMode = c.mode;
      let derivedStatus = c.status;

      // 1. Closed / Resolved
      if (c.status === "resolved" || c.status === "closed" || c.mode === "paused") {
        derivedMode = "paused";
        derivedStatus = "closed";
      } else if ((c.mode === "human" && c.status === "pending" && !c.assigned_to) || (pendingHandoff && !c.assigned_to && c.mode === "human")) {
        // 2. Waiting for human operator (unclaimed human request or pending handoff)
        if (!escalations[c.id]) {
          const lastInbound = convMsgs.find(m => m.direction === "inbound" || m.sender_type === "customer");
          const esc = lastInbound ? detectCustomerEscalation(lastInbound.body) : { isEscalation: false };
          escalations[c.id] = {
            category: esc.category || "human_request",
            reason: pendingHandoff?.reason || esc.reason || "Solicitação de Atendente Humano",
            text: lastInbound?.body,
            timestamp: pendingHandoff?.created_at || lastInbound?.created_at || c.last_message_at || undefined,
            sentiment: esc.sentiment || "neutral"
          };
        }
        const isSevere = escalations[c.id]?.sentiment === "urgent" || escalations[c.id]?.sentiment === "frustrated";
        derivedMode = "human";
        derivedStatus = isSevere ? "urgent" : "waiting_human";
      } else if (c.mode === "human") {
        // 3. In Human Attendance (claimed by operator)
        const lastWasHumanReply = newestMsg && newestMsg.direction === "outbound" && newestMsg.sender_type === "human";
        derivedMode = "human";
        derivedStatus = c.status === "pending" || lastWasHumanReply ? "waiting_client" : "human";
      } else {
        // 4. AI Mode
        derivedMode = "ai";
        derivedStatus = "ai";
      }

      const rawPrio = redisConvPriorities[c.id] || persistedConvPriorities[c.id]?.priority;
      const priority: "low" | "normal" | "high" | "urgent" =
        rawPrio === "urgent" || rawPrio === "high" || rawPrio === "normal" || rawPrio === "low"
          ? rawPrio
          : derivedStatus === "urgent"
          ? "urgent"
          : derivedStatus === "waiting_human"
          ? "high"
          : "normal";

      const tag = redisConvTags[c.id] || persistedConvTags[c.id] || null;
      const channelSlot = c.channel_id ? (channelSlotMap.get(c.channel_id) || 1) : 1;
      const satisfaction = surveyByConvId.get(c.id) || null;

      return {
        ...c,
        mode: derivedMode,
        status: derivedStatus,
        priority: crmFeatureAllowed(effectivePlan, "conversation_priority") ? priority : "normal",
        priorityRank: crmFeatureAllowed(effectivePlan, "conversation_priority") ? PRIORITY_RANK[priority] : 2,
        tag: crmFeatureAllowed(effectivePlan, "commercial_tags") ? tag : null,
        channelSlot,
        satisfaction: crmFeatureAllowed(effectivePlan, "satisfaction_survey") ? satisfaction : null,
      };
    });

    // Sort active conversations by priority first (if priority feature is active), then by last_message_at desc
    const sortByPriority = crmFeatureAllowed(effectivePlan, "conversation_priority");
    const conversations = [...mappedConversations].sort((a, b) => {
      if (sortByPriority && a.status !== "closed" && b.status !== "closed") {
        const rankDiff = (b.priorityRank || 2) - (a.priorityRank || 2);
        if (rankDiff !== 0) return rankDiff;
      }
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return timeB - timeA;
    });

    const planData = {
      ...effectivePlan,
      quotaUsed,
    };

    return privateJson({
      tenants,
      selectedTenant: selected,
      isSuspended,
      suspensionReason,
      publicSuspensionReason: effectivePlan.publicSuspensionReason,
      plan: planData,
      allowedFeatures: effectivePlan.allowedFeatures,
      featureStates: effectivePlan.featureStates,
      contacts,
      conversations,
      messages,
      escalations,
      tags: crmFeatureAllowed(effectivePlan, "commercial_tags") ? tags : [],
      contactTags: crmFeatureAllowed(effectivePlan, "commercial_tags") ? contactTags : []
    });
  } catch {
    return privateJson({ error: "crm_data_unavailable" }, 503);
  }
}
