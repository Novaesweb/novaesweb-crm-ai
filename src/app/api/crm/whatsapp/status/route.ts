import { NextRequest, NextResponse } from "next/server";
import { authorizeCrmInstance } from "@/lib/crm/tenant-access";
import Redis from "ioredis";
import { verifyOperator } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getEffectiveTenantPlan } from "@/lib/crm/plans";
import { buildTenantWhatsappSlots, extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractPhoneFromJid(jid: unknown): string | null {
  if (typeof jid !== "string" || !jid) return null;
  const clean = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return clean.length >= 10 ? clean : null;
}

export async function GET(req: NextRequest) {
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
    const key = process.env.EVOLUTION_API_KEY ?? "";
    const rawInstance = req.nextUrl.searchParams.get("instance") || req.nextUrl.searchParams.get("instanceName") || process.env.EVOLUTION_INSTANCE || "novaesweb-ia-teste";
    const instanceName = rawInstance.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
    let tenantId = req.nextUrl.searchParams.get("tenantId") || req.nextUrl.searchParams.get("tenant") || undefined;
    const includeAllSlots = req.nextUrl.searchParams.get("allSlots") === "1";

    const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
    const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();

    if (!tenantId && operator?.id && supaUrl && supaKey) {
      try {
        const rMem = await fetch(`${supaUrl}/rest/v1/crm_tenant_memberships?user_id=eq.${encodeURIComponent(operator.id)}&select=tenant_id&limit=1`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3000)
        });
        if (rMem.ok) {
          const mems = await rMem.json();
          if (Array.isArray(mems) && mems[0]?.tenant_id) {
            tenantId = mems[0].tenant_id;
          }
        }
      } catch {}
    }

    const channelAccess = await authorizeCrmInstance(req, tenantId, instanceName, true);
    if (!channelAccess) return NextResponse.json({ error: "channel_forbidden" }, { status: 403 });
    tenantId = channelAccess.tenant.id;

    if (!supaUrl || !supaKey) return NextResponse.json({ error: "plan_verification_unavailable" }, { status: 503 });
    let effectivePlan;
    try { effectivePlan = await getEffectiveTenantPlan(tenantId); }
    catch { return NextResponse.json({ error: "plan_verification_unavailable" }, { status: 503 }); }
    const currentSlotNum = extractSlotFromInstanceName(instanceName);
    const requestedSlot = req.nextUrl.searchParams.get("slot");
    if (requestedSlot && (!/^[1-5]$/.test(requestedSlot) || Number(requestedSlot) !== currentSlotNum)) return NextResponse.json({ error: "slot_instance_mismatch" }, { status: 403 });
    if (effectivePlan.isSuspended) return NextResponse.json({ error: "ACCOUNT_SUSPENDED", state: "suspended" }, { status: 403 });
    if (effectivePlan.featureStates?.ai_chat?.state === "maintenance") return NextResponse.json({ error: "FEATURE_MAINTENANCE", state: "maintenance" }, { status: 503 });
    if (currentSlotNum > effectivePlan.maxWhatsappConnections) return NextResponse.json({ error: "whatsapp_slot_locked", slot: currentSlotNum, maxAllowed: effectivePlan.maxWhatsappConnections }, { status: 403 });
    let whatsappSlots = undefined;
    const [rTenant, rCh] = await Promise.all([
      fetch(supaUrl + "/rest/v1/crm_tenants?id=eq." + tenantId + "&select=name&limit=1", { headers: { apikey: supaKey, Authorization: "Bearer " + supaKey }, cache: "no-store" }),
      fetch(supaUrl + "/rest/v1/crm_channels?tenant_id=eq." + tenantId + "&select=id,instance_name,status&order=created_at.asc", { headers: { apikey: supaKey, Authorization: "Bearer " + supaKey }, cache: "no-store" }),
    ]);
    if (!rTenant.ok || !rCh.ok) return NextResponse.json({ error: "channel_verification_unavailable" }, { status: 503 });
    const tenants = await rTenant.json();
    const channels = await rCh.json();
    if (!Array.isArray(tenants) || tenants.length !== 1 || !Array.isArray(channels)) return NextResponse.json({ error: "channel_verification_unavailable" }, { status: 503 });
    const slots = buildTenantWhatsappSlots(tenants[0].name, channels, effectivePlan);
    if (includeAllSlots) whatsappSlots = slots;
    const isChannelPausedByDowngrade = channels.some((c: { instance_name: string; status: string }) => c.instance_name === instanceName && c.status === "paused");
    if (isChannelPausedByDowngrade) return NextResponse.json({ error: "channel_paused", state: "paused", connected: false, slot: currentSlotNum, whatsappSlots }, { status: 403 });

    if (!key) {
      return NextResponse.json({
        instanceName,
        slot: extractSlotFromInstanceName(instanceName),
        state: isChannelPausedByDowngrade ? "paused" : "disconnected",
        connected: false,
        pausedByDowngrade: isChannelPausedByDowngrade,
        qrScanned: false,
        phoneNumber: null,
        whatsappSlots,
        message: "Evolution API Key não configurada"
      }, { status: 200 });
    }

    let qrScannedFromWebhook = false;
    let qrcodeFromWebhook: string | null = null;
    const redisUrl = process.env.CRM_REDIS_URL;
    if (redisUrl) {
      try {
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1200 });
        await redis.connect();
        const raw = await redis.get(`crm:wa:state:${instanceName}`);
        redis.disconnect();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.qrScanned) qrScannedFromWebhook = true;
          if (typeof parsed.qrcode === "string" && parsed.qrcode.startsWith("data:image/")) {
            qrcodeFromWebhook = parsed.qrcode;
          }
        }
      } catch {}
    }

    try {
      const response = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return NextResponse.json({
          instanceName,
          slot: extractSlotFromInstanceName(instanceName),
          state: isChannelPausedByDowngrade ? "paused" : "disconnected",
          connected: false,
          pausedByDowngrade: isChannelPausedByDowngrade,
          qrScanned: false,
          phoneNumber: null,
          whatsappSlots
        }, { status: 200 });
      }

      const data = await response.json();
      const state = data?.instance?.state ?? data?.state ?? "close";
      const isConnected = state === "open" && !isChannelPausedByDowngrade;

      let phoneNumber: string | null = extractPhoneFromJid(data?.instance?.owner ?? data?.instance?.wuid ?? data?.ownerJid);
      let profileName: string | null = data?.instance?.profileName ?? null;

      if (state === "open" || state === "connecting") {
        try {
          const infoRes = await fetch(`${url}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(3500)
          });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const instObj = Array.isArray(infoData)
              ? infoData.find((i: any) => (i?.name || i?.instance?.instanceName || i?.instanceName) === instanceName) || infoData[0]
              : infoData?.instance || infoData;
            if (instObj) {
              phoneNumber = phoneNumber || extractPhoneFromJid(instObj.ownerJid || instObj.owner || instObj.number || instObj?.instance?.owner);
              profileName = profileName || instObj.profileName || instObj?.instance?.profileName || null;
              if (phoneNumber && state === "connecting") {
                qrScannedFromWebhook = true;
              }
            }
          }
        } catch {}
      }

      // Sync channel status in Supabase ONLY if not paused by downgrade
      if (supaUrl && supaKey && !isChannelPausedByDowngrade && (isConnected || state === "close")) {
        const dbStatus = isConnected ? "connected" : "disconnected";
        try {
          const patchRes = await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}&tenant_id=eq.${tenantId}`, {
            method: "PATCH",
            headers: {
              apikey: supaKey,
              Authorization: "Bearer " + supaKey,
              "Content-Type": "application/json",
              Prefer: "return=representation"
            },
            body: JSON.stringify({ status: dbStatus })
          });
          if (!patchRes.ok) throw new Error("channel_status_write_failed");
          const updated = await patchRes.json();
          if (Array.isArray(updated) && updated.length === 0 && tenantId) {
            await fetch(`${supaUrl}/rest/v1/crm_channels`, {
              method: "POST",
              headers: {
                apikey: supaKey,
                Authorization: "Bearer " + supaKey,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                tenant_id: tenantId,
                provider: "evolution",
                instance_name: instanceName,
                status: dbStatus
              })
            });
          }
        } catch {}
      }

      if (isConnected) {
        try {
          const whCheck = await fetch(`${url}/webhook/find/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(2500)
          });
          const whData = whCheck.ok ? await whCheck.json() : null;
          if (!whData || !whData.enabled || !whData.url) {
            const secret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.CRM_WEBHOOK_SECRET || "";
            const webhookBase = process.env.EVOLUTION_WEBHOOK_TARGET_URL || "http://host.docker.internal:3040/api/evolution/webhook";
            const targetWebhookUrl = secret
              ? `${webhookBase.replace(/\/$/, "")}?secret=${encodeURIComponent(secret)}`
              : webhookBase.replace(/\/$/, "");
            await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: key },
              body: JSON.stringify({
                webhook: {
                  enabled: true,
                  url: targetWebhookUrl,
                  byEvents: false,
                  base64: false,
                  events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
                  headers: secret ? { "x-crm-webhook-secret": secret } : {}
                }
              }),
              cache: "no-store",
              signal: AbortSignal.timeout(3000)
            }).catch(() => {});
          }
        } catch {}
      }

      return NextResponse.json({
        instanceName,
        slot: extractSlotFromInstanceName(instanceName),
        state: isChannelPausedByDowngrade ? "paused" : state,
        connected: isConnected,
        pausedByDowngrade: isChannelPausedByDowngrade,
        qrScanned: isConnected || qrScannedFromWebhook,
        phoneNumber,
        profileName,
        qrcode: isConnected ? null : qrcodeFromWebhook,
        whatsappSlots
      });
    } catch {
      return NextResponse.json({
        instanceName,
        slot: extractSlotFromInstanceName(instanceName),
        state: isChannelPausedByDowngrade ? "paused" : "disconnected",
        connected: false,
        pausedByDowngrade: isChannelPausedByDowngrade,
        qrScanned: false,
        phoneNumber: null,
        whatsappSlots,
        message: "Evolution API inacessível no momento"
      }, { status: 200 });
    }
  } catch {
    return NextResponse.json({ error: "status_verification_unavailable" }, { status: 503 });
  }
}
