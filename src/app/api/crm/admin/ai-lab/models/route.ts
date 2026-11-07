import { NextRequest } from "next/server";
import Redis from "ioredis";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { verifyMasterRequest } from "@/lib/crm/master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const redisUrl = process.env.CRM_REDIS_URL || "redis://127.0.0.1:6379";
  const omniUrl = process.env.AI_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "http://host.docker.internal:20128/v1";
  const omniKey = process.env.AI_API_KEY?.trim() || "";
  return { url, serviceKey, redisUrl, omniUrl, omniKey };
}

const CURATED_MODELS = [
  { id: "auto/best-chat", name: "NovaesWeb Best Chat (Auto Roteador Inteligente)", provider: "OmniRoute", speed: "Ultrarrápido", isDefaultPrimary: true },
  { id: "auto/best-fast", name: "NovaesWeb Fast Engine (Baixa Latência)", provider: "OmniRoute", speed: "Instantâneo (< 500ms)", isDefaultFallback: true },
  { id: "auto/llama", name: "Meta LLaMA 3.3 (Groq / Alta Precisão)", provider: "Groq Cloud", speed: "Rápido" },
  { id: "auto/gemini", name: "Google Gemini 2.0 Flash (Multimodal & Ágil)", provider: "Google AI", speed: "Muito Rápido" },
  { id: "auto/gpt", name: "GPT-4o Mini / Turbo (OpenAI Gateway)", provider: "OpenAI Compatible", speed: "Equilibrado" },
  { id: "auto/best-free", name: "OpenRouter Free Cluster (Variantes Gratuitas)", provider: "OpenRouter", speed: "Econômico" },
  { id: "auto/reasoning", name: "DeepSeek / Qwen Reasoning (Lógica Complexa)", provider: "DeepSeek / Qwen", speed: "Profundo" }
];

// GET: List available AI models and current global defaults
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const { redisUrl, omniUrl, omniKey } = getAdminConfig();

    // 1. Get current defaults from Redis
    let defaults = {
      primaryModel: "auto/best-chat",
      fallbackModel: "auto/best-fast",
      lastAppliedToAllAt: null as string | null
    };

    try {
      const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
      await redis.connect();
      const raw = await redis.get("crm:master:ai_defaults");
      redis.disconnect();
      if (raw) {
        defaults = { ...defaults, ...JSON.parse(raw) };
      }
    } catch {}

    // 2. Fetch live models from OmniRoute gateway
    let availableModels = [...CURATED_MODELS];
    try {
      const res = await fetch(`${omniUrl}/models`, {
        headers: { Authorization: `Bearer ${omniKey}` },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        const liveList = (data?.data || []) as Array<{ id: string }>;

        // Add any additional auto models from the gateway
        const autoFromGateway = liveList
          .filter(m => m.id.startsWith("auto/") && !CURATED_MODELS.some(c => c.id === m.id))
          .map(m => ({
            id: m.id,
            name: `NovaesWeb ${m.id.replace("auto/", "").replace(/-/g, " ").toUpperCase()}`,
            provider: "OmniRoute",
            speed: "Normal"
          }));

        availableModels = [...CURATED_MODELS, ...autoFromGateway];
      }
    } catch {}

    return privateJson({
      models: availableModels,
      currentDefaults: defaults
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "models_unavailable" }, 503);
  }
}

// POST: Save AI configuration and optionally apply to ALL clients
export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  try {
    const auth = await verifyMasterRequest(request);
    if (!auth.authorized) {
      return privateJson({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    const primaryModel = typeof body.primaryModel === "string" && body.primaryModel ? body.primaryModel : "auto/best-chat";
    const fallbackModel = typeof body.fallbackModel === "string" && body.fallbackModel ? body.fallbackModel : "auto/best-fast";
    const applyToAll = body.applyToAll === true;
    const targetTenantId = typeof body.tenantId === "string" ? body.tenantId : "";

    const { url, serviceKey, redisUrl } = getAdminConfig();

    // 1. Save global default in Redis
    const nowIso = new Date().toISOString();
    const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.set("crm:master:ai_defaults", JSON.stringify({
      primaryModel,
      fallbackModel,
      lastAppliedToAllAt: applyToAll ? nowIso : undefined
    }));
    redis.disconnect();

    let updatedStoresCount = 0;

    // 2. If targetTenantId is passed, update only that store
    if (targetTenantId) {
      const rGet = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${targetTenantId}`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      const current = (await rGet.json()) as Array<{ business_description: string }>;
      let dataObj: Record<string, unknown> = {};
      try {
        if (current[0]?.business_description?.startsWith("{")) {
          dataObj = JSON.parse(current[0].business_description);
        }
      } catch {}

      dataObj.ai_settings = {
        ...(dataObj.ai_settings as Record<string, unknown> || {}),
        primaryModel,
        fallbackModel
      };

      await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${targetTenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
      });

      // Also update agent provider_route
      await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${targetTenantId}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ provider_route: primaryModel })
      });

      return privateJson({ updated: true, targetTenantId, primaryModel, fallbackModel });
    }

    // 3. If applyToAll is true, batch update all tenant settings in Supabase!
    if (applyToAll && serviceKey && url) {
      const rSettings = await fetch(url + "/rest/v1/crm_tenant_settings?select=tenant_id,business_description", {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      if (rSettings.ok) {
        const allSettings = (await rSettings.json()) as Array<{ tenant_id: string; business_description: string }>;
        for (const s of allSettings) {
          try {
            let dataObj: Record<string, unknown> = {};
            if (s.business_description?.startsWith("{")) {
              dataObj = JSON.parse(s.business_description);
            }
            dataObj.ai_settings = {
              ...(dataObj.ai_settings as Record<string, unknown> || {}),
              primaryModel,
              fallbackModel
            };

            await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${s.tenant_id}`, {
              method: "PATCH",
              headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
              body: JSON.stringify({ business_description: JSON.stringify(dataObj) })
            });

            // Update agent
            await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${s.tenant_id}`, {
              method: "PATCH",
              headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
              body: JSON.stringify({ provider_route: primaryModel })
            });

            updatedStoresCount++;
          } catch {}
        }
      }
    }

    return privateJson({
      saved: true,
      primaryModel,
      fallbackModel,
      appliedToAll: applyToAll,
      updatedStoresCount
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "save_models_failed" }, 503);
  }
}

