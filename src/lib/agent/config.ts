import "server-only";

export type AiConfig = {
  aiUrl: string;
  aiKey: string;
  aiModel: string;
  systemPrompt: string;
};

export type AgentConfig = AiConfig & {
  evolutionUrl: string;
  evolutionKey: string;
  instance: string;
  webhookSecret: string;
  redisUrl: string;
  allowedNumber: string;
  sendEnabled: boolean;
  sendFormat: "v2" | "legacy";
};

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável não configurada: ${name}`);
  return value;
}

function validUrl(name: string, value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`Configuração inválida: ${name}`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Protocolo inválido: ${name}`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`URL não permitida: ${name}`);
  return url.toString().replace(/\/$/, "");
}

export function getAiConfig(): AiConfig {
  const aiUrl = validUrl("AI_OPENAI_BASE_URL", read("AI_OPENAI_BASE_URL"));
  const aiModel = read("AI_MODEL");
  // A free lab must never silently fall back to a billed model.
  if (aiUrl === "https://openrouter.ai/api/v1" && aiModel !== "openrouter/free" && !aiModel.endsWith(":free")) {
    throw new Error("No OpenRouter, este laboratório aceita apenas openrouter/free ou modelos :free");
  }
  return {
    aiUrl,
    aiKey: read("AI_API_KEY"),
    aiModel,
    systemPrompt: read("AI_BUSINESS_CONTEXT"),
  };
}

export function getAgentConfig(): AgentConfig {
  const rawAllowed = (process.env.AI_TEST_ALLOWED_NUMBER ?? "").trim();
  const allowed = (rawAllowed === "*" || rawAllowed === "all" || rawAllowed === "" || rawAllowed === "none")
    ? "*"
    : rawAllowed.replace(/\D/g, "");
  if (allowed !== "*" && !/^\d{10,15}$/.test(allowed)) throw new Error("AI_TEST_ALLOWED_NUMBER inválido");
  const webhookSecret = read("CRM_WEBHOOK_SECRET");
  if (webhookSecret.length < 32) throw new Error("CRM_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres");
  const redisUrl = read("CRM_REDIS_URL");
  if (!/^redis(s)?:\/\//.test(redisUrl)) throw new Error("CRM_REDIS_URL deve ser redis:// ou rediss://");
  const format = process.env.EVOLUTION_SEND_FORMAT || "v2";
  if (format !== "v2" && format !== "legacy") throw new Error("EVOLUTION_SEND_FORMAT inválido");
  return {
    ...getAiConfig(),
    evolutionUrl: validUrl("EVOLUTION_API_URL", read("EVOLUTION_API_URL")),
    evolutionKey: read("EVOLUTION_API_KEY"),
    instance: read("EVOLUTION_INSTANCE"),
    webhookSecret,
    redisUrl,
    allowedNumber: allowed,
    sendEnabled: process.env.AI_REPLY_ENABLED === "true",
    sendFormat: format,
  };
}
