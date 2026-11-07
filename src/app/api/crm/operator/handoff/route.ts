import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant, crmFeatureAllowed } from "@/lib/crm/tenant-access";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return privateJson({ error: "payload_too_large" }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: "invalid_json" }, 400); }
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const tenant = typeof data.tenantId === "string" ? data.tenantId : "";
  const conversation = typeof data.conversationId === "string" ? data.conversationId : "";
  const action = typeof data.action === "string" ? data.action : "";
  const targetMode = data.mode === "ai" ? "ai" : "human";

  if (!UUID.test(tenant) || !UUID.test(conversation)) return privateJson({ error: "invalid_request" }, 400);

  try {

    const access = await authorizeCrmTenant(request, tenant, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "not_authorized" }, 403);
    const featureGuard = await requireTenantFeature(tenant, "human_handoff");
    if (!featureGuard.allowed) return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);
    if (targetMode === "ai") {
      const aiGuard = await requireTenantFeature(tenant, "ai_chat");
      if (!aiGuard.allowed) return privateJson({ error: aiGuard.errorCode, state: aiGuard.state }, aiGuard.statusHttp);
    }
    const operator = { id: access.operatorId };

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    const conversationCheck = await fetch(url + `/rest/v1/crm_conversations?select=id&id=eq.${conversation}&tenant_id=eq.${tenant}&limit=1`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(7000)
    });
    if (!conversationCheck.ok) return privateJson({ error: "conversation_lookup_failed" }, 503);
    const ownedConversations = await conversationCheck.json() as Array<{ id: string }>;
    if (ownedConversations.length !== 1) return privateJson({ error: "conversation_not_found" }, 404);

    const redisUrl = process.env.CRM_REDIS_URL;

    // Action: Set Funnel Status
    if (action === "set_status") {
      const newStatus = typeof data.status === "string" ? data.status : "open";
      const allowedStatuses = ["novo", "ai", "waiting_human", "human", "waiting_client", "closed", "open", "urgent"];
      if (!allowedStatuses.includes(newStatus)) {
        return privateJson({ error: "invalid_status" }, 400);
      }

      const patchData: Record<string, unknown> = {};
      if (newStatus === "ai" || newStatus === "open" || newStatus === "novo") {
        patchData.mode = "ai";
        patchData.status = "open";
        patchData.assigned_to = null;
      } else if (newStatus === "waiting_human" || newStatus === "urgent") {
        patchData.mode = "human";
        patchData.status = "pending";
        patchData.assigned_to = null;
      } else if (newStatus === "human") {
        patchData.mode = "human";
        patchData.status = "open";
        patchData.assigned_to = operator.id;
      } else if (newStatus === "waiting_client") {
        patchData.mode = "human";
        patchData.status = "pending";
        patchData.assigned_to = operator.id;
      } else if (newStatus === "closed") {
        patchData.mode = "paused";
        patchData.status = "resolved";
      }

      const rPatch = await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify(patchData)
      });
      if (!rPatch.ok) {
        return privateJson({ error: "failed_to_update_status" }, 500);
      }

      // Synchronize crm_handoffs table
      try {
        if (newStatus === "waiting_human" || newStatus === "urgent") {
          const rCheckH = await fetch(
            `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=eq.pending&select=id&limit=1`,
            { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
          );
          const existingH = rCheckH.ok ? ((await rCheckH.json()) as Array<{ id: string }>) : [];
          if (existingH.length === 0) {
            await fetch(`${url}/rest/v1/crm_handoffs`, {
              method: "POST",
              headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
              body: JSON.stringify({
                tenant_id: tenant,
                conversation_id: conversation,
                reason: "Transferido manualmente para fila de espera",
                status: "pending"
              })
            });
          }
        } else if (newStatus === "human" || newStatus === "waiting_client") {
          await fetch(
            `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=eq.pending`,
            {
              method: "PATCH",
              headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "accepted",
                accepted_by: operator.id,
                accepted_at: new Date().toISOString()
              })
            }
          );
        } else if (newStatus === "ai" || newStatus === "closed" || newStatus === "open") {
          await fetch(
            `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=in.(pending,accepted)`,
            {
              method: "PATCH",
              headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "closed",
                resolved_at: new Date().toISOString()
              })
            }
          );
        }
      } catch {}

      if (newStatus !== "urgent" && redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          await redis.del(`crm:escalation:${conversation}`);
          redis.disconnect();
        } catch {}
      }
      return privateJson({ success: true, conversationId: conversation, status: newStatus, mode: patchData.mode });
    }

    // Action: Resolve Urgency / Claim Urgent Conversation
    if (action === "resolve_urgency") {
      await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "human", status: "open", assigned_to: operator.id })
      });
      await fetch(
        `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=eq.pending`,
        {
          method: "PATCH",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "accepted",
            accepted_by: operator.id,
            accepted_at: new Date().toISOString()
          })
        }
      ).catch(() => {});
      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          await redis.del(`crm:escalation:${conversation}`);
          redis.disconnect();
        } catch {}
      }
      return privateJson({ resolved: true, conversationId: conversation, status: "human", mode: "human" });
    }

    if (targetMode === "ai") {
      const r = await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai", status: "open", assigned_to: null })
      });
      if (!r.ok) return privateJson({ error: "failed_to_resume_ai" }, 500);

      await fetch(
        `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=in.(pending,accepted)`,
        {
          method: "PATCH",
          headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "closed",
            resolved_at: new Date().toISOString()
          })
        }
      ).catch(() => {});

      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          await redis.del(`crm:escalation:${conversation}`);
          redis.disconnect();
        } catch {}
      }

      return privateJson({ claimed: false, conversationId: conversation, mode: "ai", status: "ai" });
    } else {
      const r = access.isMaster ? await fetch(url + `/rest/v1/crm_conversations?id=eq.${conversation}&tenant_id=eq.${tenant}`, {
        method: "PATCH", cache: "no-store", signal: AbortSignal.timeout(9000),
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "human", status: "open", assigned_to: null })
      }) : await fetch(url + "/rest/v1/rpc/crm_operator_claim_conversation", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(9000),
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ p_tenant: tenant, p_conversation: conversation, p_actor: operator.id })
      });
      // Always ensure conversation status is "open", mode is "human", and assigned_to is operator.id
      await fetch(url + "/rest/v1/crm_conversations?id=eq." + conversation + "&tenant_id=eq." + tenant, {
        method: "PATCH",
        headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "human", status: "open", assigned_to: operator.id })
      });
      if (!r.ok) {
        await fetch(
          `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&status=eq.pending`,
          {
            method: "PATCH",
            headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "accepted",
              accepted_by: operator.id,
              accepted_at: new Date().toISOString()
            })
          }
        ).catch(() => {});
      }

      // Check if there was an active escalation detected
      let escalationHeader = "";
      if (redisUrl) {
        try {
          const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
          await redis.connect();
          const escRaw = await redis.get(`crm:escalation:${conversation}`);
          if (escRaw) {
            const parsed = JSON.parse(escRaw);
            escalationHeader = `🚨 ALERTA DETECTADO: ${parsed.reason || "Solicitação de Atendimento Humano"}\n`;
            await redis.del(`crm:escalation:${conversation}`);
          }
          redis.disconnect();
        } catch {}
      }

      // Generate 3-line structured handoff summary only if allowed by plan
      let summary = "";
      try {
        const effectivePlan = await getEffectiveTenantPlan(tenant);
        if (crmFeatureAllowed(effectivePlan, "handoff_summary")) {
          const rMsgs = await fetch(
            url + `/rest/v1/crm_messages?conversation_id=eq.${conversation}&tenant_id=eq.${tenant}&select=direction,body,sender_type&order=created_at.desc&limit=8`,
            { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
          );
          if (rMsgs.ok) {
            const msgs = (await rMsgs.json()) as Array<{ direction: string; body: string; sender_type: string }>;
            const inbound = msgs.filter(m => m.direction === "inbound" || m.sender_type === "customer").map(m => m.body).reverse();
            const lastCustMsg = inbound[inbound.length - 1] || "Cliente iniciou contato";
            const prevCustMsg = inbound.length > 1 ? inbound[inbound.length - 2] : "";

            summary = `${escalationHeader}👤 Atendimento transferido para operador humano.\n📌 Última mensagem do cliente: "${lastCustMsg.slice(0, 120)}"\n${prevCustMsg ? `💬 Contexto anterior: "${prevCustMsg.slice(0, 80)}"\n` : ""}⏳ Status: IA pausada nesta conversa. Atendente no comando.`;
          }
        }
      } catch {}

      return privateJson({
        claimed: true,
        conversationId: conversation,
        mode: "human",
        summary
      });
    }
  } catch {
    return privateJson({ error: "handoff_unavailable" }, 503);
  }
}
