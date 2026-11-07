import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson, supabaseSettings } from "@/lib/crm/supabase-server";
import { sendText, type EvolutionSendConfig } from "@/lib/agent/evolution";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) {
    return privateJson({ error: "origin_forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return privateJson({ error: "json_required" }, 415);
  }

  try {

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const messageText = typeof body.message === "string" ? body.message.trim() : "";

    if (!UUID.test(tenantId) || !UUID.test(conversationId)) {
      return privateJson({ error: "invalid_request_params" }, 400);
    }
    if (!messageText || messageText.length < 1) {
      return privateJson({ error: "empty_message" }, 400);
    }
    if (messageText.length > 2000) {
      return privateJson({ error: "message_too_long" }, 400);
    }

    // 1. Verify operator membership in tenant
    const access = await authorizeCrmTenant(request, tenantId, ["owner", "admin", "agent"]);
    if (!access) return privateJson({ error: "not_authorized" }, 403);
    const featureGuard = await requireTenantFeature(tenantId, "human_handoff");
    if (!featureGuard.allowed) return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);
    const operator = { id: access.operatorId };

    const { url } = supabaseSettings();
    const secret = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (secret.length < 30) return privateJson({ error: "service_not_configured" }, 503);

    // 2. Fetch conversation details
    const rConv = await fetch(
      url + `/rest/v1/crm_conversations?id=eq.${conversationId}&tenant_id=eq.${tenantId}&select=id,contact_id,channel_id,mode,status&limit=1`,
      { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
    );
    if (!rConv.ok) return privateJson({ error: "conversation_not_found" }, 404);
    const convs = (await rConv.json()) as Array<{ id: string; contact_id: string; channel_id: string; mode: string; status: string }>;
    if (!convs.length) return privateJson({ error: "conversation_not_found" }, 404);
    const conv = convs[0];

    // 3. Fetch contact phone
    const rContact = await fetch(
      url + `/rest/v1/crm_contacts?id=eq.${conv.contact_id}&tenant_id=eq.${tenantId}&select=id,phone,display_name&limit=1`,
      { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
    );
    if (!rContact.ok) return privateJson({ error: "contact_not_found" }, 404);
    const contacts = (await rContact.json()) as Array<{ id: string; phone: string; display_name: string }>;
    if (!contacts.length || !contacts[0].phone) return privateJson({ error: "contact_phone_missing" }, 400);
    const contactPhone = contacts[0].phone;

    // 4. Fetch channel instance if available, with tenant fallback
    let targetInstance: string | undefined;
    if (conv.channel_id) {
      const rChannel = await fetch(
        url + `/rest/v1/crm_channels?id=eq.${conv.channel_id}&tenant_id=eq.${tenantId}&select=instance_name,status&limit=1`,
        { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
      );
      if (rChannel.ok) {
        const channels = (await rChannel.json()) as Array<{ instance_name: string; status: string }>;
        if (channels[0]?.status === "paused") return privateJson({ error: "channel_paused" }, 403);
        if (channels[0]?.instance_name) targetInstance = channels[0].instance_name;
      }
    }
    if (!targetInstance) {
      const rTenantChannels = await fetch(
        url + `/rest/v1/crm_channels?tenant_id=eq.${tenantId}&select=instance_name,status&order=updated_at.desc&limit=5`,
        { headers: { apikey: secret, Authorization: "Bearer " + secret }, cache: "no-store" }
      );
      if (rTenantChannels.ok) {
        const tChannels = (await rTenantChannels.json()) as Array<{ instance_name: string; status: string }>;
        const connected = tChannels.find((c) => c.status === "connected" && extractSlotFromInstanceName(c.instance_name) <= featureGuard.effectivePlan.maxWhatsappConnections);
        targetInstance = connected?.instance_name;
      }
    }
    if (!targetInstance || extractSlotFromInstanceName(targetInstance) > featureGuard.effectivePlan.maxWhatsappConnections) return privateJson({ error: "channel_unavailable_or_locked" }, 403);

    // 5. Send real WhatsApp message via Evolution API
    const evolutionUrl = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
    const evolutionKey = process.env.EVOLUTION_API_KEY ?? "";
    if (!evolutionUrl || !evolutionKey) {
      return privateJson({ error: "evolution_not_configured" }, 503);
    }
    const cfg: EvolutionSendConfig = {
      evolutionUrl,
      evolutionKey,
      instance: targetInstance || process.env.EVOLUTION_INSTANCE || "default",
      sendFormat: process.env.EVOLUTION_SEND_FORMAT === "legacy" ? "legacy" : "v2",
    };
    try {
      await sendText(contactPhone, messageText, cfg, targetInstance);
    } catch (sendErr) {
      console.error("[operator-send-error] Failed to send via Evolution:", sendErr);
      return privateJson({
        error: "evolution_send_failed",
        details: sendErr instanceof Error ? sendErr.message : "WhatsApp delivery failed"
      }, 502);
    }

    // 6. Record message in Supabase crm_messages
    const rMsg = await fetch(url + "/rest/v1/crm_messages", {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "human",
        body: messageText,
        delivery_status: "sent"
      })
    });
    const savedMsg = rMsg.ok ? (await rMsg.json())?.[0] : null;

    // 7. Update conversation: ensure mode is human, assigned to this operator, and status is pending (maps to waiting_client)
    await fetch(url + `/rest/v1/crm_conversations?id=eq.${conversationId}&tenant_id=eq.${tenantId}`, {
      method: "PATCH",
      headers: { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "human",
        assigned_to: operator.id,
        status: "pending",
        last_message_at: new Date().toISOString()
      })
    });

    // Mark any pending handoffs as accepted by this operator
    await fetch(
      `${url}/rest/v1/crm_handoffs?tenant_id=eq.${tenantId}&conversation_id=eq.${conversationId}&status=eq.pending`,
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

    return privateJson({
      success: true,
      message: savedMsg || {
        id: "msg_" + Date.now(),
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "human",
        body: messageText,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("[operator-send-exception]", err);
    return privateJson({ error: "operator_send_unavailable" }, 500);
  }
}

