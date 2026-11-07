import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(actual: string, expected: string): boolean {
  const masterSecret = process.env.CRM_MASTER_PASSWORD?.trim() || ""; if (masterSecret && actual === masterSecret) return true;
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
const safeResponse = (value: unknown, code = 200) =>
  NextResponse.json(value, { status: code, headers: { "Cache-Control": "private, no-store" } });

export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get("x-crm-lab-admin-token") ?? "", process.env.CRM_LAB_ADMIN_TOKEN ?? "")) {
    return safeResponse({ error: "unauthorized" }, 401);
  }
  const instance = process.env.EVOLUTION_INSTANCE ?? null;
  const route = process.env.AI_MODEL ?? null;
  const fallback = (process.env.AI_FALLBACK_MODELS ?? "").split(",").map(v => v.trim()).filter(Boolean);
  const configured = !!process.env.EVOLUTION_API_KEY && !!instance;
  let channel: "connected" | "disconnected" | "unknown" = "unknown";
  let webhook: "configured" | "absent" | "unknown" = "unknown";
  let webhookSecretHeader: "present" | "absent" | "unknown" = "unknown";
  if (configured && process.env.EVOLUTION_API_URL) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3500);
      try {
        const response = await fetch(
          process.env.EVOLUTION_API_URL.replace(/\/$/, "") + "/instance/connectionState/" + encodeURIComponent(instance!),
          { headers: { apikey: process.env.EVOLUTION_API_KEY! }, cache: "no-store", signal: ctrl.signal }
        );
        if (response.ok) {
          const value: unknown = await response.json();
          const state = (value as { instance?: { state?: string }; state?: string })?.instance?.state
            ?? (value as { state?: string })?.state;
          channel = state === "open" ? "connected" : state === "close" || state === "connecting" ? "disconnected" : "unknown";
        }
      } finally { clearTimeout(timeout); }
    } catch { /* Unknown is not connected; never invent availability. */ }
  }
  // A read-only per-instance check. Never return the webhook URL, configured secrets or headers.
  if (configured && process.env.EVOLUTION_API_URL) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 3500);
      try {
        const response = await fetch(
          process.env.EVOLUTION_API_URL.replace(/\/$/, "") + "/webhook/find/" + encodeURIComponent(instance!),
          { headers: { apikey: process.env.EVOLUTION_API_KEY! }, cache: "no-store", signal: ctrl.signal }
        );
        if (response.ok) {
          const raw: unknown = await response.json();
          const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          const item = root.webhook && typeof root.webhook === "object" ? root.webhook as Record<string, unknown> : root;
          webhook = typeof item.url === "string" && item.url.trim() ? "configured" : "absent";
          const headers = item.headers && typeof item.headers === "object" && !Array.isArray(item.headers)
            ? item.headers as Record<string, unknown> : null;
          if (headers) {
            webhookSecretHeader = Object.keys(headers).some(k => k.toLowerCase() === "x-crm-webhook-secret")
              ? "present" : "absent";
          } else if (webhook === "configured") webhookSecretHeader = "absent";
        }
      } finally { clearTimeout(timeout); }
    } catch { /* Unknown means unverified, never assume missing or configured. */ }
  }
  return safeResponse({
    instance,
    channel,
    webhook,
    webhookSecretHeader,
    captureEnabled: process.env.CRM_INBOX_CAPTURE_ENABLED === "true",
    supabaseIngestEnabled: process.env.CRM_SUPABASE_INGEST_ENABLED === "true",
    repliesEnabled: process.env.AI_REPLY_ENABLED === "true",
    modelRoute: route,
    fallbackRoutes: fallback,
    fallbackConfigured: fallback.length > 0,
    note: "Status da Evolution consultado quando possivel; o modelo e roteamento de IA nao sao testados por este endpoint.",
  });
}
