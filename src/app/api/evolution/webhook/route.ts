import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { getAgentConfig } from "@/lib/agent/config";
import { processWebhook } from "@/lib/agent/processor";
import { parseIncoming } from "@/lib/agent/parse";
import { captureIncoming } from "@/lib/crm/inbox";
import { persistIncomingInSupabase, resolveChannelForInstance } from "@/lib/crm/supabase-ingest";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";
import { outboundAllowed } from "@/lib/crm/outbound-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
function matchesSecret(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleConnectionOrQrEvent(payload: Record<string, any>) {
  const event = String(payload.event ?? "").toUpperCase().replace(/\./g, "_");
  const rawInstance = payload.instance ?? payload.instanceName ?? payload?.data?.instance ?? "";
  const instanceName = String(rawInstance).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
  if (!instanceName) return;

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const state = data.state ?? data.status ?? "";
  const statusReason = data.statusReason;

  // Sync to Redis for real-time step-by-step UI tracking
  const redisUrl = process.env.CRM_REDIS_URL;
  if (redisUrl) {
    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
      await redis.connect();
      const key = `crm:wa:state:${instanceName}`;
      const prevRaw = await redis.get(key);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};

      if (event === "CONNECTION_UPDATE") {
        const isConnected = state === "open";
        const qrScanned = isConnected || (state === "connecting" && statusReason === 200);
        await redis.set(
          key,
          JSON.stringify({
            ...prev,
            state,
            statusReason,
            connected: isConnected,
            qrScanned: qrScanned || prev.qrScanned || false,
            qrcode: isConnected ? null : prev.qrcode,
            updatedAt: new Date().toISOString()
          }),
          "EX",
          300
        );
      } else if (event === "QRCODE_UPDATED") {
        const rawQr = data?.qrcode?.base64 ?? data?.base64 ?? null;
        const qrcode = typeof rawQr === "string" && rawQr.length > 50
          ? (rawQr.startsWith("data:image/") ? rawQr : `data:image/png;base64,${rawQr}`)
          : null;
        await redis.set(
          key,
          JSON.stringify({
            ...prev,
            state: "connecting",
            connected: false,
            qrScanned: false,
            qrcode,
            updatedAt: new Date().toISOString()
          }),
          "EX",
          300
        );
      }
      redis.disconnect();
    } catch {}
  }

  // Sync connection state to Supabase crm_channels
  if (event === "CONNECTION_UPDATE" && (state === "open" || state === "close")) {
    try {
      const channel = await resolveChannelForInstance(instanceName);
      if (!channel || channel.status === "paused") return;
      const plan = await getEffectiveTenantPlan(channel.tenant_id);
      if (plan.isSuspended || extractSlotFromInstanceName(instanceName) > plan.maxWhatsappConnections) return;
      const supaUrl = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "");
      const supaKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (supaUrl && supaKey) {
        await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}&tenant_id=eq.${channel.tenant_id}&status=neq.paused`, {
          method: "PATCH",
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: state === "open" ? "connected" : "disconnected" })
        });
      }
    } catch {}
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "json_required" }, 415);
  const raw = await request.text();
  if (raw.length > 65_536) return json({ error: "payload_too_large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  const evoKey = process.env.EVOLUTION_API_KEY ?? "";
  const header = request.headers.get("x-crm-webhook-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  const bodyObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const payloadApiKey = typeof bodyObj.apikey === "string" ? bodyObj.apikey : "";
  // A recognizable payload is never proof of origin.
  const isAuthorized = header.length > 0
    ? secret.length >= 32 && matchesSecret(header, secret)
    : (secret.length >= 32 && querySecret.length > 0 && matchesSecret(querySecret, secret)) ||
      (evoKey.length >= 6 && payloadApiKey.length > 0 && matchesSecret(payloadApiKey, evoKey));

  if (!isAuthorized) return json({ error: "unauthorized" }, 401);

  try {
    // 1. Handle connection & QR code update events first
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const ev = String((payload as Record<string, unknown>).event ?? "").toUpperCase().replace(/\./g, "_");
      if (ev === "CONNECTION_UPDATE" || ev === "QRCODE_UPDATED") {
        await handleConnectionOrQrEvent(payload as Record<string, any>);
        return json({ status: "ignored", reason: "connection_event_handled" });
      }
    }

    // 2. Always persist incoming customer message in Supabase first so Live Chat works even if AI is disabled
    const incoming = parseIncoming(payload);
    if (incoming) {
      try { await persistIncomingInSupabase(incoming); } catch {}
      try { await captureIncoming(incoming); } catch {}
    }

    // 3. Process AI response if configured
    const cfg = getAgentConfig();
    const result = await processWebhook(payload, cfg, { maySend: outboundAllowed });
    return json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[crm-ai-webhook]", message);
    return json({ error: "processing_failed", detail: message }, 500);
  }
}
export async function GET() { return json({ error: "method_not_allowed" }, 405); }
