import type { AgentConfig } from "./config";

export type EvolutionSendConfig = Pick<AgentConfig, "evolutionUrl" | "evolutionKey" | "instance" | "sendFormat">;

export async function sendText(number: string, text: string, cfg: EvolutionSendConfig, targetInstance?: string): Promise<void> {
  const instance = encodeURIComponent(targetInstance || cfg.instance);
  const endpoint = `${cfg.evolutionUrl}/message/sendText/${instance}`;
  // Evolution v2 commonly accepts flat `text`; legacy installations can use textMessage.
  const body = cfg.sendFormat === "legacy"
    ? { number, textMessage: { text } }
    : { number, text };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.evolutionKey },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[evolution-send-error] ${endpoint} -> ${response.status}:`, errorText);
      throw new Error(`Evolution retornou HTTP ${response.status}: ${errorText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
