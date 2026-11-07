import "server-only";
import type { Incoming } from "@/lib/agent/parse";

export type Channel = { id: string; tenant_id: string; status: string; instance_name?: string };
type TenantRow = { id: string; name: string; status: string };
type RecordId = { id: string };
type RequestMethod = "GET" | "POST" | "PATCH";

export function tenantInstanceSlug(tenantName: string): string {
  const slug = tenantName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);
  return slug.startsWith("novaesweb") ? "novaesweb-ia-teste" : `loja_${slug}`;
}

function isIngestEnabled(instance?: string): boolean {
  if (instance === "crmtest") return false;
  if (process.env.CRM_SUPABASE_INGEST_ENABLED === "false") return false;
  const url = process.env.CRM_SUPABASE_URL?.trim() ?? "";
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && key.length >= 30;
}

function settings() {
  const url = process.env.CRM_SUPABASE_URL?.trim() ?? "";
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || key.length < 30)
    throw new Error("crm_supabase_ingest_not_configured");
  return { url: url.replace(/\/$/, ""), key };
}

async function db<T>(table: string, query: string, method: RequestMethod, payload?: unknown): Promise<T> {
  const { url, key } = settings();
  const response = await fetch(url + "/rest/v1/" + table + query, {
    method, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: {
      apikey: key, Authorization: "Bearer " + key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "return=representation" } :
        method === "PATCH" ? { Prefer: "return=minimal" } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[supabase-db-error] ${table} ${method} failed:`, response.status, errorText);
    throw new Error("crm_supabase_ingest_failed");
  }
  if (method === "PATCH") return undefined as T;
  return await response.json() as T;
}

export async function resolveChannelForInstance(instanceName: string): Promise<Channel | null> {
  const normalizedInstance = instanceName.trim().toLowerCase();
  const baseInstance = normalizedInstance.replace(/_[2345]$/, "");

  let channels = await db<Channel[]>(
    "crm_channels",
    "?select=id,tenant_id,status,instance_name&instance_name=eq." + encodeURIComponent(normalizedInstance) + "&limit=1",
    "GET"
  );

  if (channels.length > 0) {
    return channels[0];
  }

  // Try matching tenant by expected instance slug (supporting slots _2.._5)
  const allTenants = await db<TenantRow[]>(
    "crm_tenants",
    "?select=id,name,status&order=created_at.desc",
    "GET"
  );
  if (!allTenants.length) return null;

  let matchedTenant = allTenants.find(
    t => tenantInstanceSlug(t.name) === normalizedInstance || tenantInstanceSlug(t.name) === baseInstance
  );
  if (!matchedTenant && baseInstance.startsWith("loja_")) {
    const prefix = baseInstance.slice(0, 18);
    matchedTenant = allTenants.find(t => tenantInstanceSlug(t.name).startsWith(prefix));
  }
  if (!matchedTenant && (baseInstance === "novaesweb-ia-teste" || allTenants.length === 1)) {
    matchedTenant = allTenants.find(t => t.name.toLowerCase().includes("novaesweb")) || allTenants.find(t => t.status === "active") || allTenants[0];
  }

  if (!matchedTenant) return null;

  await db<Channel[]>("crm_channels", "", "POST", {
    tenant_id: matchedTenant.id,
    provider: "evolution",
    instance_name: normalizedInstance,
    status: "connected"
  });

  channels = await db<Channel[]>(
    "crm_channels",
    "?select=id,tenant_id,status,instance_name&instance_name=eq." + encodeURIComponent(normalizedInstance) + "&limit=1",
    "GET"
  );
  return channels[0] ?? null;
}

export async function persistIncomingInSupabase(incoming: Incoming): Promise<"off" | "created" | "duplicate"> {
  if (!isIngestEnabled(incoming.instance)) return "off";

  try {
    // 1. Find or auto-link channel for this establishment's instance
    const channel = await resolveChannelForInstance(incoming.instance);
    if (!channel) return "off";
    const t = channel.tenant_id;

    // Ensure channel is marked connected when receiving real messages, UNLESS paused by downgrade
    if (channel.status !== "connected" && channel.status !== "paused") {
      await db("crm_channels", "?id=eq." + channel.id, "PATCH", { status: "connected" }).catch(() => {});
    }

    // 2. Find or create contact
    const contactQuery = "?select=id,display_name&tenant_id=eq." + t + "&phone=eq." + incoming.number + "&limit=1";
    let contacts = await db<Array<{ id: string; display_name: string | null }>>("crm_contacts", contactQuery, "GET");
    if (!contacts.length) {
      await db<RecordId[]>("crm_contacts", "?on_conflict=tenant_id,phone", "POST", {
        tenant_id: t, phone: incoming.number, display_name: incoming.pushName || incoming.number
      });
      contacts = await db<Array<{ id: string; display_name: string | null }>>("crm_contacts", contactQuery, "GET");
    } else if (incoming.pushName && (!contacts[0].display_name || contacts[0].display_name === incoming.number)) {
      await db("crm_contacts", "?id=eq." + contacts[0].id, "PATCH", {
        display_name: incoming.pushName,
        updated_at: new Date().toISOString()
      }).catch(() => {});
    }
    if (!contacts.length) return "off";
    const contact = contacts[0];

    // 3. Find or create conversation (scoped to tenant_id + contact_id + channel_id so each WhatsApp channel is separated)
    const conversationQuery = "?select=id,mode,status,assigned_to&tenant_id=eq." + t +
      "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1";
    let threads = await db<Array<{ id: string; mode: string; status: string; assigned_to: string | null }>>("crm_conversations", conversationQuery, "GET");
    if (!threads.length) {
      await db<RecordId[]>("crm_conversations", "?on_conflict=tenant_id,contact_id,channel_id", "POST", {
        tenant_id: t, contact_id: contact.id, channel_id: channel.id, mode: "ai", status: "open",
        last_message_at: new Date().toISOString()
      });
      threads = await db<Array<{ id: string; mode: string; status: string; assigned_to: string | null }>>("crm_conversations", conversationQuery, "GET");
    }
    if (!threads.length) return "off";
    const conversation = threads[0];

    // 4. Save incoming message (idempotent by external_id)
    const existing = await db<RecordId[]>("crm_messages",
      "?select=id&conversation_id=eq." + conversation.id + "&external_id=eq." + encodeURIComponent(incoming.id) + "&limit=1", "GET");
    if (existing.length > 0) {
      return "duplicate";
    }

    await db<RecordId[]>("crm_messages", "", "POST", {
      tenant_id: t,
      conversation_id: conversation.id,
      external_id: incoming.id,
      direction: "inbound",
      sender_type: "customer",
      body: incoming.text,
      delivery_status: "received"
    });

    const patchPayload: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (conversation.mode === "human" && conversation.assigned_to && conversation.status === "pending") {
      patchPayload.status = "open";
    }
    await db("crm_conversations", "?id=eq." + conversation.id, "PATCH", patchPayload);

    return "created";
  } catch (e) {
    console.error("[supabase-ingest] Error:", e);
    return "off";
  }
}

export async function persistOutboundInSupabase(instance: string, phone: string, text: string): Promise<void> {
  if (!isIngestEnabled(instance)) return;
  try {
    const channel = await resolveChannelForInstance(instance);
    if (!channel) return;
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return;
    const contact = contacts[0];

    const threads = await db<RecordId[]>("crm_conversations",
      "?select=id&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return;
    const conversation = threads[0];

    await db<RecordId[]>("crm_messages", "", "POST", {
      tenant_id: t,
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "agent",
      body: text,
      delivery_status: "sent"
    });

    await db("crm_conversations", "?id=eq." + conversation.id, "PATCH", {
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("[supabase-ingest-outbound] Error:", e);
  }
}

export type ConversationContext = {
  conversationId?: string;
  channelStatus?: string;
  mode: "ai" | "human";
  status?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  isFirstInteraction: boolean;
};

export async function fetchConversationContext(instance: string, phone: string, limit = 10): Promise<ConversationContext> {
  const fallback: ConversationContext = { mode: "ai", history: [], isFirstInteraction: true };
  if (!isIngestEnabled(instance)) return fallback;

  try {
    const channel = await resolveChannelForInstance(instance);
    if (!channel) return fallback;
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return { ...fallback, channelStatus: channel.status };
    const contact = contacts[0];

    const threads = await db<Array<{ id: string; mode: string; status?: string }>>("crm_conversations",
      "?select=id,mode,status&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return { ...fallback, channelStatus: channel.status };
    const conversation = threads[0];
    const isAiPaused = conversation.mode !== "ai" || conversation.status === "pending" || conversation.status === "resolved";
    const mode: "ai" | "human" = isAiPaused ? "human" : "ai";
    const status = conversation.status || "open";

    type DbMsg = { direction: string; sender_type: string; body: string; created_at: string };
    const rawMsgs = await db<DbMsg[]>("crm_messages",
      "?conversation_id=eq." + conversation.id + "&select=direction,sender_type,body,created_at&order=created_at.desc&limit=" + limit, "GET");

    if (!rawMsgs || rawMsgs.length === 0) {
      return { conversationId: conversation.id, channelStatus: channel.status, mode, status, history: [], isFirstInteraction: true };
    }

    const history = rawMsgs.reverse().map(m => ({
      role: (m.direction === "outbound" || m.sender_type === "agent" || m.sender_type === "human" ? "assistant" : "user") as "user" | "assistant",
      content: m.body || ""
    }));

    return {
      conversationId: conversation.id,
      channelStatus: channel.status,
      mode,
      status,
      history,
      isFirstInteraction: history.length <= 1
    };
  } catch (err) {
    console.error("[supabase-fetch-context] Error:", err);
    return fallback;
  }
}

export async function handoffToHuman(instance: string, phone: string, _isUrgent = false, reason = "Solicitação de atendimento humano"): Promise<string | null> {
  if (!isIngestEnabled(instance)) return null;
  try {
    const channel = await resolveChannelForInstance(instance);
    if (!channel) return null;
    const t = channel.tenant_id;

    const contacts = await db<RecordId[]>("crm_contacts",
      "?select=id&tenant_id=eq." + t + "&phone=eq." + phone + "&limit=1", "GET");
    if (!contacts.length) return null;
    const contact = contacts[0];

    const threads = await db<RecordId[]>("crm_conversations",
      "?select=id&tenant_id=eq." + t + "&contact_id=eq." + contact.id + "&channel_id=eq." + channel.id + "&limit=1", "GET");
    if (!threads.length) return null;
    const conv = threads[0];

    await db("crm_conversations", "?id=eq." + conv.id, "PATCH", {
      mode: "human",
      status: "pending",
      assigned_to: null,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await db("crm_handoffs", "", "POST", {
      tenant_id: t,
      conversation_id: conv.id,
      requested_by: "customer",
      status: "pending",
      reason: reason.slice(0, 500)
    }).catch(() => {});

    return conv.id;
  } catch (err) {
    console.error("[supabase-handoff] Error:", err);
    return null;
  }
}
