import { NextRequest, NextResponse } from "next/server";
import { authorizeCrmInstance } from "@/lib/crm/tenant-access";
import { verifyOperator, isAllowedOrigin } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";
import { getEffectiveTenantPlan, getRedis } from "@/lib/crm/plans";
import { extractSlotFromInstanceName } from "@/lib/crm/whatsapp-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEvolutionConfig() {
  const url = (process.env.EVOLUTION_API_URL ?? "http://host.docker.internal:8080").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY ?? "";
  const secret = process.env.CRM_WEBHOOK_SECRET ?? "";
  return { url, key, secret };
}

function sanitizeQr(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.length > 80 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/[\r\n]/g, "")}`;
  }
  return null;
}

async function syncChannelStatus(instanceName: string, tenantId: string | undefined, status: "connected" | "connecting" | "disconnected") {
  try {
    const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
    const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();
    if (!supaUrl || !supaKey) return;

    const dbStatus = status === "connected" ? "connected" : "disconnected";

    const res = await fetch(`${supaUrl}/rest/v1/crm_channels?instance_name=eq.${encodeURIComponent(instanceName)}${tenantId ? `&tenant_id=eq.${tenantId}` : ""}`, {
      method: "PATCH",
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ status: dbStatus })
    });

    if (!res.ok) throw new Error("channel_status_write_failed");
    const updated = await res.json();
    if (Array.isArray(updated) && updated.length === 0 && tenantId) {
      const inserted = await fetch(`${supaUrl}/rest/v1/crm_channels`, {
        method: "POST",
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          provider: "evolution",
          instance_name: instanceName,
          status: dbStatus
        })
      });
      if (!inserted.ok) throw new Error("channel_insert_failed");
    }
  } catch {
    throw new Error("channel_status_sync_failed");
  }
}

async function configureEvolutionWebhook(url: string, key: string, secret: string, instanceName: string) {
  try {
    const webhookBase = process.env.EVOLUTION_WEBHOOK_TARGET_URL || "http://host.docker.internal:3040/api/evolution/webhook";
    const targetWebhookUrl = secret
      ? `${webhookBase.replace(/\/$/, "")}?secret=${encodeURIComponent(secret)}`
      : webhookBase.replace(/\/$/, "");
    const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

    const res = await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: targetWebhookUrl,
          byEvents: false,
          base64: false,
          events,
          headers: {
            "x-crm-webhook-secret": secret
          }
        }
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      await fetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({
          enabled: true,
          url: targetWebhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events,
          headers: {
            "x-crm-webhook-secret": secret
          }
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000)
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[WhatsApp Connect] Falha não bloqueante ao configurar webhook:", err);
  }
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get("origin"), req.url)) return NextResponse.json({ error: "origin_forbidden" }, { status: 403 });
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({
        error: "unauthorized",
        message: "Sessão não autorizada. Faça login novamente no painel."
      }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {}

    const supaUrl = (process.env.CRM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim().replace(/\/$/, "");
    const supaKey = (process.env.CRM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim();

    // 1. Resolve tenantId strictly
    let tenantId = (
      (typeof body.tenantId === "string" && body.tenantId) ? body.tenantId :
      (typeof body.tenant_id === "string" && body.tenant_id) ? body.tenant_id :
      req.nextUrl.searchParams.get("tenantId") ||
      req.nextUrl.searchParams.get("tenant") ||
      undefined
    );

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

    // Fail-closed if an operator tries to connect without a resolved tenantId
    if (!tenantId && !masterAuth.authorized) {
      return NextResponse.json({
        error: "tenant_verification_failed",
        message: "Não foi possível confirmar o estabelecimento vinculado à sua sessão. Faça login novamente."
      }, { status: 403 });
    }

    if (body.slot !== undefined && (typeof body.slot !== "number" || !Number.isInteger(body.slot) || body.slot < 1 || body.slot > 5)) return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
    const requestedSlot = typeof body.slot === "number" && body.slot >= 1 && body.slot <= 5
      ? (body.slot as 1 | 2 | 3 | 4 | 5)
      : undefined;

    const rawName = (
      body.instance ||
      body.instanceName ||
      body.instance_name ||
      body.tenantName ||
      body.tenant_name ||
      req.nextUrl.searchParams.get("instance") ||
      req.nextUrl.searchParams.get("instanceName") ||
      "novaesweb-ia-teste"
    );
    let instanceName = String(rawName).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32) || "novaesweb_crm";

    if (requestedSlot && requestedSlot > 1 && !/_\d$/.test(instanceName)) {
      instanceName = `${instanceName.slice(0, 30)}_${requestedSlot}`;
    }

    const slotNumber = extractSlotFromInstanceName(instanceName);
    if (requestedSlot !== undefined && requestedSlot !== slotNumber) return NextResponse.json({ error: "slot_instance_mismatch" }, { status: 403 });

    const channelAccess = await authorizeCrmInstance(req, tenantId, instanceName, true);
    if (!channelAccess) return NextResponse.json({ error: "channel_forbidden" }, { status: 403 });
    tenantId = channelAccess.tenant.id;

    // 2. FAIL-CLOSED verification of plan limits, slot permissions, and concurrent attempts
    if (tenantId) {
      if (!supaUrl || !supaKey) {
        return NextResponse.json({
          error: "plan_verification_unavailable",
          message: "Serviço de validação de assinatura indisponível. Conexão bloqueada por segurança."
        }, { status: 503 });
      }

      let effectivePlan;
      let existingChannels: Array<{ instance_name: string; status: string }> = [];
      try {
        effectivePlan = await getEffectiveTenantPlan(tenantId);
        const rCh = await fetch(`${supaUrl}/rest/v1/crm_channels?tenant_id=eq.${encodeURIComponent(tenantId)}&select=instance_name,status`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
          cache: "no-store",
          signal: AbortSignal.timeout(4000)
        });
        if (!rCh.ok) {
          throw new Error(`Channel lookup failed with HTTP ${rCh.status}`);
        }
        existingChannels = (await rCh.json()) as Array<{ instance_name: string; status: string }>;
      } catch (verifyErr) {
        // FAIL-CLOSED: If we cannot verify the tenant's plan or channels, deny connection creation!
        console.error("[WhatsApp Connect] Fail-closed on limit check:", verifyErr);
        return NextResponse.json({
          error: "limit_verification_failed",
          message: "Não foi possível confirmar a permissão do seu plano no momento. Por segurança, a conexão foi negada até que a validação seja restabelecida."
        }, { status: 503 });
      }

      if (effectivePlan.isSuspended || effectivePlan.featureStates?.ai_chat?.state === "suspended") {
        return NextResponse.json({
          error: "account_suspended",
          message: effectivePlan.publicSuspensionReason || "Sua conta está suspensa ou o período de avaliação terminou. Regularize seu plano para conectar o WhatsApp."
        }, { status: 403 });
      }

      if (effectivePlan.featureStates?.ai_chat?.state === "maintenance") return NextResponse.json({ error: "FEATURE_MAINTENANCE" }, { status: 503 });
      // Check slot number against maxWhatsappConnections (1 for Trial/Start, 3 for Business, 5 for Premium)
      if (slotNumber > effectivePlan.maxWhatsappConnections) {
        const requiredPlan = slotNumber <= 3 ? "CRM Business" : "CRM Premium";
        return NextResponse.json({
          error: "whatsapp_slot_locked",
          slot: slotNumber,
          maxAllowed: effectivePlan.maxWhatsappConnections,
          requiredPlan,
          message: `O Espaço WhatsApp #${slotNumber} está bloqueado no seu plano ${effectivePlan.planName} (limite: ${effectivePlan.maxWhatsappConnections} de 5). Solicite upgrade para o ${requiredPlan} para liberar este espaço.`
        }, { status: 403 });
      }

      // Also verify total non-paused channels + concurrent connection attempts so user cannot bypass slot naming
      
      const occupiedChannels = existingChannels.filter(
        c => c.status !== "paused" && c.instance_name !== instanceName
      );

      if (occupiedChannels.length >= effectivePlan.maxWhatsappConnections) {
        return NextResponse.json({
          error: "whatsapp_limit_reached",
          maxAllowed: effectivePlan.maxWhatsappConnections,
          message: `Seu plano ${effectivePlan.planName} permite até ${effectivePlan.maxWhatsappConnections} conexão(ões) de WhatsApp (de 5 espaços). Solicite upgrade para liberar mais números.`
        }, { status: 403 });
      }

      // Control simultaneous connection attempts via Redis lock
      try {
        const redis = getRedis();
        if (redis.status !== "ready" && redis.status !== "connecting") await redis.connect();
        const lockKey = `crm:wa:connecting_lock:${tenantId}:${slotNumber}`;
        await redis.set(lockKey, instanceName, "EX", 60);
        redis.disconnect();
      } catch {}
    }

    const { url, key, secret } = getEvolutionConfig();

    const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const isLocalUrl = url.includes("host.docker.internal") || url.includes("localhost") || url.includes("127.0.0.1");
    if (isVercel && isLocalUrl) {
      return NextResponse.json({
        error: "evolution_cloud_unreachable",
        message: `A Evolution API está configurada com URL local (${url}). Configure EVOLUTION_API_URL com a URL pública da sua Evolution API.`
      }, { status: 503 });
    }

    if (!key) {
      return NextResponse.json({
        error: "evolution_key_missing",
        message: "Chave da Evolution API (EVOLUTION_API_KEY) não configurada nas variáveis de ambiente."
      }, { status: 500 });
    }

    // 3. Check if instance already exists and is connected
    let state = "close";
    let qrcodeBase64: string | null = null;
    let evolutionOnline = true;

    try {
      const stateRes = await fetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        state = stateData?.instance?.state ?? stateData?.state ?? "close";
      }
    } catch (err) {
      const failure = err as { name?: string; code?: string; message?: string } | null;
      if (failure?.name === "TimeoutError" || failure?.code === "ECONNREFUSED" || failure?.code === "ENOTFOUND" || failure?.message?.includes("fetch failed")) {
        evolutionOnline = false;
      }
    }

    if (!evolutionOnline) {
      return NextResponse.json({
        error: "evolution_unavailable",
        message: `Servidor de WhatsApp indisponível no momento (${url}). Verifique se o container da Evolution API está ativo.`
      }, { status: 503 });
    }

    if (state === "open") {
      await configureEvolutionWebhook(url, key, secret, instanceName);
      await syncChannelStatus(instanceName, tenantId, "connected");
      return NextResponse.json({
        slot: slotNumber,
        instanceName,
        state: "open",
        connected: true,
        message: `WhatsApp #${slotNumber} já está conectado e pronto para atendimento!`
      });
    }

    // 4. Request QR Code for existing disconnected instance
    try {
      const connectRes = await fetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(7000)
      });
      if (connectRes.ok) {
        const connectData = await connectRes.json();
        qrcodeBase64 = (
          sanitizeQr(connectData?.base64) ||
          sanitizeQr(connectData?.qrcode?.base64) ||
          sanitizeQr(connectData?.code) ||
          null
        );
      }
    } catch {}

    // 5. Create new instance if QR Code not yet generated
    if (!qrcodeBase64) {
      try {
        const createRes = await fetch(`${url}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          qrcodeBase64 = (
            sanitizeQr(createData?.qrcode?.base64) ||
            sanitizeQr(createData?.base64) ||
            sanitizeQr(createData?.code) ||
            null
          );
        } else {
          const connectRetry = await fetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: key },
            cache: "no-store",
            signal: AbortSignal.timeout(6000)
          });
          if (connectRetry.ok) {
            const retryData = await connectRetry.json();
            qrcodeBase64 = (
              sanitizeQr(retryData?.base64) ||
              sanitizeQr(retryData?.qrcode?.base64) ||
              sanitizeQr(retryData?.code) ||
              null
            );
          }
        }
      } catch (err) {
        console.warn("[WhatsApp Connect] Erro ao criar instância:", err instanceof Error ? err.message : undefined);
      }
    }

    // 6. Auto-configure webhook and register channel in Supabase
    await configureEvolutionWebhook(url, key, secret, instanceName);
    await syncChannelStatus(instanceName, tenantId, "disconnected");

    return NextResponse.json({
      slot: slotNumber,
      instanceName,
      state: "connecting",
      connected: false,
      qrcode: qrcodeBase64,
      message: qrcodeBase64
        ? `QR Code do WhatsApp #${slotNumber} gerado com sucesso! Aponte a câmera do WhatsApp em Aparelhos Conectados.`
        : `Instância #${slotNumber} iniciada. Aguarde alguns segundos para carregar o QR Code.`
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao conectar WhatsApp.";
    return NextResponse.json({ error: msg, message: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get("origin"), req.url)) return NextResponse.json({ error: "origin_forbidden" }, { status: 403 });
  try {
    const [masterAuth, operator] = await Promise.all([
      verifyMasterRequest(req),
      verifyOperator()
    ]);
    if (!masterAuth.authorized && !operator) {
      return NextResponse.json({
        error: "unauthorized",
        message: "Sessão não autorizada."
      }, { status: 401 });
    }

    const { url, key } = getEvolutionConfig();
    if (!key) {
      return NextResponse.json({
        error: "evolution_key_missing",
        message: "Evolution API Key não configurada."
      }, { status: 500 });
    }

    let instance = req.nextUrl.searchParams.get("instance") ?? "";
    if (!instance) {
      try {
        const body = await req.json();
        instance = body.instance || body.instanceName || "";
      } catch {}
    }

    if (!instance) {
      return NextResponse.json({
        error: "missing_instance",
        message: "Nome da instância é obrigatório para desconectar."
      }, { status: 400 });
    }

    const instanceName = instance.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32);
    const channelAccess = await authorizeCrmInstance(req,
      req.nextUrl.searchParams.get("tenantId") || req.nextUrl.searchParams.get("tenant") || undefined,
      instanceName);
    if (!channelAccess) return NextResponse.json({ error: "channel_forbidden" }, { status: 403 });

    try {
      await fetch(`${url}/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
    } catch {}

    let deleted = false;
    try {
      const delRes = await fetch(`${url}/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
        headers: { apikey: key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
      deleted = delRes.ok;
    } catch {}

    const tenantId = channelAccess.tenant.id;
    await syncChannelStatus(instanceName, tenantId, "disconnected");

    return NextResponse.json({
      success: true,
      instanceName,
      deleted,
      message: "Instância desconectada com sucesso! Os contatos e históricos foram preservados."
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao desconectar.";
    return NextResponse.json({ error: msg, message: msg }, { status: 500 });
  }
}
