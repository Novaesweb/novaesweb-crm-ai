import { NextRequest } from "next/server";
import { requireTenantFeature } from "@/lib/crm/plans";
import { authorizeCrmTenant, crmFeatureAllowed } from "@/lib/crm/tenant-access";
import { isAllowedOrigin, privateJson } from "@/lib/crm/supabase-server";
import { generateAnswer, StoreAiContext } from "@/lib/agent/ai";
import { AiConfig } from "@/lib/agent/config";
import { detectCustomerEscalation } from "@/lib/agent/escalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceConfig() {
  const url = process.env.CRM_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const serviceKey = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const omniUrl = process.env.AI_OPENAI_BASE_URL?.trim().replace(/\/$/, "") || "http://host.docker.internal:20128/v1";
  const omniKey = process.env.AI_API_KEY?.trim() || "";
  return { url, serviceKey, omniUrl, omniKey };
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return privateJson({ error: "origin_forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "json_required" }, 415);

  try {

    const body = await request.json();
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!UUID.test(tenantId)) return privateJson({ error: "invalid_tenant" }, 400);
    if (!message || message.length < 1) return privateJson({ error: "empty_message" }, 400);

    // Verify operator belongs to this tenant
    const access = await authorizeCrmTenant(request, tenantId);
    if (!access) return privateJson({ error: "not_authorized" }, 403);
    const featureGuard = await requireTenantFeature(tenantId, "simulator");
    if (!featureGuard.allowed) return privateJson({ error: featureGuard.errorCode, state: featureGuard.state, message: featureGuard.message }, featureGuard.statusHttp);

    // Check for customer dissatisfaction / escalation first
    const escalation = detectCustomerEscalation(message);
    if (escalation.isEscalation) {
      return privateJson({
        answer: escalation.customerReply,
        isEscalation: true,
        escalationCategory: escalation.category,
        escalationReason: escalation.reason,
        sentiment: escalation.sentiment,
        latencyMs: 15,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        isSimulation: true
      });
    }

    const { url, serviceKey, omniUrl, omniKey } = getServiceConfig();
    if (!url || !serviceKey || !omniKey) return privateJson({ error: "simulator_not_configured" }, 503);

    // 1. Fetch store name
    const rTenant = await fetch(url + `/rest/v1/crm_tenants?id=eq.${tenantId}&select=name`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const tenants = (await rTenant.json()) as Array<{ name: string }>;
    const storeName = tenants[0]?.name || "Nossa Loja";

    // 2. Fetch agent instructions & label
    const rAgent = await fetch(url + `/rest/v1/crm_agents?tenant_id=eq.${tenantId}&limit=1`, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      cache: "no-store"
    });
    const agents = (await rAgent.json()) as Array<{ label: string; instructions: string; provider_route: string }>;
    const agentLabel = agents[0]?.label || "Assistente Virtual";
    const instructions = agents[0]?.instructions || "Atenda os clientes com simpatia, agilidade e clareza.";
    const preferredModel = agents[0]?.provider_route || "auto/best-chat";

    // 3. Fetch published knowledge articles (up to 20)
    const rArticles = await fetch(
      url + `/rest/v1/crm_knowledge_articles?tenant_id=eq.${tenantId}&status=eq.published&order=updated_at.desc&limit=20`,
      {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      }
    );
    const articles = (await rArticles.json()) as Array<{ title: string; body: string }>;
    const storeInfo = Array.isArray(articles)
      ? articles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
      : "";

    // 4. Fetch operating hours from crm_tenant_settings
    let operatingHours: StoreAiContext["operatingHours"] = undefined;
    try {
      const rSettings = await fetch(url + `/rest/v1/crm_tenant_settings?tenant_id=eq.${tenantId}&select=timezone,business_description&limit=1`, {
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        cache: "no-store"
      });
      if (rSettings.ok) {
        const settings = (await rSettings.json()) as Array<{ timezone?: string; business_description: string }>;
        const dbTimezone = settings[0]?.timezone || "America/Sao_Paulo";
        const rawDesc = settings[0]?.business_description ?? "";
        if (rawDesc.startsWith("{")) {
          const parsed = JSON.parse(rawDesc);
          if (parsed.ai_settings?.operatingHours) {
            operatingHours = {
              timezone: dbTimezone,
              ...parsed.ai_settings.operatingHours
            };
          }
        }
      }
    } catch {}

    // 5. Build context
    const context: StoreAiContext = {
      storeName,
      agentLabel,
      instructions,
      storeInfo,
      history,
      operatingHours,
      allowFallback: crmFeatureAllowed(featureGuard.effectivePlan, "model_fallback")
    };

    const cfg: AiConfig = {
      aiUrl: omniUrl,
      aiKey: omniKey,
      aiModel: preferredModel.startsWith("auto") ? preferredModel : "auto/best-chat",
      systemPrompt: "Informações gerais da loja."
    };

    const startTime = Date.now();
    const answer = await generateAnswer(message, cfg, context);
    const latencyMs = Date.now() - startTime;

    return privateJson({
      answer,
      latencyMs,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      isSimulation: true
    });
  } catch (e) {
    return privateJson({ error: e instanceof Error ? e.message : "simulation_failed" }, 503);
  }
}
