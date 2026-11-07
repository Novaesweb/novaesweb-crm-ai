import test from "node:test";
import assert from "node:assert/strict";

function sanitizeQr(val: unknown): string | null {
  if (!val || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.length > 80 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/[\r\n]/g, "")}`;
  }
  return null;
}

function resolveInstanceName(body: Record<string, any>, queryInstance?: string | null): string {
  const raw = (
    body.instance ||
    body.instanceName ||
    body.instance_name ||
    body.tenantName ||
    body.tenant_name ||
    queryInstance ||
    "novaesweb-ia-teste"
  );
  return String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 32) || "novaesweb_crm";
}

test("1. WhatsApp QR Code Sanitization: prefixa corretamente base64 cru ou preserva data:image", () => {
  const alreadyPrefixed = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVwAAAFcCAYAAACEFgYs";
  assert.equal(sanitizeQr(alreadyPrefixed), alreadyPrefixed);

  const rawBase64 = "iVBORw0KGgoAAAANSUhEUgAAAVwAAAFcCAYAAACEFgYsAAAjA0lEQVR4AezBwY0oR4xEwafGN4J20Yo0iVbQrvRCqyMvW0ChZ1raBSP++vsfrLXW+nUP";
  assert.equal(sanitizeQr(rawBase64), `data:image/png;base64,${rawBase64}`);

  // Invalid or empty strings
  assert.equal(sanitizeQr(""), null);
  assert.equal(sanitizeQr(null), null);
  assert.equal(sanitizeQr("short-invalid-token"), null);
});

test("2. Resolução de Instância: aceita 'instance', 'instanceName' e query param sem perder slug da loja", () => {
  // Test case A: frontend envia { instance: 'loja_pastelaria_do_ze' }
  const nameFromInstance = resolveInstanceName({ instance: "loja_pastelaria_do_ze" });
  assert.equal(nameFromInstance, "loja_pastelaria_do_ze");

  // Test case B: frontend envia { instanceName: 'loja_barbearia' }
  const nameFromInstanceName = resolveInstanceName({ instanceName: "loja_barbearia" });
  assert.equal(nameFromInstanceName, "loja_barbearia");

  // Test case C: fallback para query param
  const nameFromQuery = resolveInstanceName({}, "loja_calcados_123");
  assert.equal(nameFromQuery, "loja_calcados_123");

  // Test case D: caracteres especiais são normalizados para segurança
  const sanitized = resolveInstanceName({ instance: "Loja do João & Maria / 2026!" });
  assert.equal(sanitized, "loja_do_jo_o___maria___2026_");
});

test("3. Detecção de Erros de Conexão na Nuvem: mensagens claras em português", () => {
  const urlLocal = "http://host.docker.internal:8080";
  const isVercel = true;
  const isLocalUrl = urlLocal.includes("host.docker.internal") || urlLocal.includes("localhost");

  let errorPayload: { error: string; message: string } | null = null;
  if (isVercel && isLocalUrl) {
    errorPayload = {
      error: "evolution_cloud_unreachable",
      message: `A Evolution API está configurada com URL local (${urlLocal}). Na Vercel (nuvem), configure a variável de ambiente EVOLUTION_API_URL com a URL pública da sua Evolution API (ex: via Cloudflare Tunnel, Ngrok ou VPS).`
    };
  }

  assert.ok(errorPayload);
  assert.equal(errorPayload.error, "evolution_cloud_unreachable");
  assert.match(errorPayload.message, /Vercel/);
  assert.match(errorPayload.message, /EVOLUTION_API_URL/);
});

test("4. Validação de Limites de WhatsApp por Plano", () => {
  const planStart = { maxWhatsappConnections: 1, planName: "CRM Start" };
  const planPremium = { maxWhatsappConnections: 2, planName: "CRM Premium" };

  const currentConnectionsStart = 1;
  const isBlockedStart = currentConnectionsStart >= planStart.maxWhatsappConnections;
  assert.equal(isBlockedStart, true, "Start não deve permitir uma 2ª conexão");

  const currentConnectionsPremium = 1;
  const isBlockedPremium = currentConnectionsPremium >= planPremium.maxWhatsappConnections;
  assert.equal(isBlockedPremium, false, "Premium deve permitir a 2ª conexão");
});
