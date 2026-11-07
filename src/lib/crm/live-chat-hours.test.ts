import { memoryAttendanceQuota } from "./attendance-quota.fixture";
import test from "node:test";
import assert from "node:assert/strict";
import { isWithinOperatingHours, processWebhook as processWebhookActual } from "../agent/processor";
import { detectCustomerEscalation } from "../agent/escalation";
import { parseIncoming } from "../agent/parse";
import { tenantInstanceSlug } from "./supabase-ingest";
import { buildSystemPrompt, formatOperatingHoursForPrompt, type StoreAiContext } from "../agent/ai";
import type { AgentConfig } from "../agent/config";

const processWebhook: typeof processWebhookActual = (payload,cfg,deps={}) => processWebhookActual(payload,cfg,{
 getStoreContext: async()=>({tenantId:"11111111-1111-4111-8111-111111111111",quotaLimit:200,context:{}}),
 ...deps, quota:deps.quota || (deps.redis ? memoryAttendanceQuota(deps.redis as never) : undefined)
});

const baseCfg: AgentConfig = {
  evolutionUrl: "http://localhost:8080",
  evolutionKey: "dummy",
  instance: "loja_bella_pizza",
  webhookSecret: "x".repeat(40),
  redisUrl: "redis://localhost:6379",
  aiUrl: "http://localhost:3001/v1",
  aiKey: "dummy",
  aiModel: "demo",
  systemPrompt: "Atendimento de teste",
  allowedNumber: "",
  sendEnabled: true,
  sendFormat: "v2",
};

function createFakeRedis() {
  const keys = new Set<string>();
  const lists = new Map<string, string[]>();
  const kv = new Map<string, string>();
  return {
    exists: async (k: string) => Number(keys.has(k) || kv.has(k)),
    set: async (k: string, val?: string, _ex?: string, _ttl?: number, mode?: string) => {
      if (mode === "NX" && (keys.has(k) || kv.has(k))) return null;
      keys.add(k);
      if (val !== undefined) kv.set(k, String(val));
      return "OK";
    },
    get: async (k: string) => kv.get(k) ?? null,
    incr: async (k: string) => {
      const cur = parseInt(kv.get(k) || "0", 10) + 1;
      kv.set(k, String(cur));
      return cur;
    },
    del: async (k: string) => {
      keys.delete(k);
      lists.delete(k);
      kv.delete(k);
      return 1;
    },
    rpush: async (k: string, v: string) => {
      const l = lists.get(k) || [];
      l.push(v);
      lists.set(k, l);
      return l.length;
    },
    lrange: async (k: string) => lists.get(k) || [],
    expire: async () => 1,
  };
}

// ============================================================================
// 6.1 TESTES DE HORÁRIO DE ATENDIMENTO DA IA
// ============================================================================

test("6.1.a Controle de horário desligado: IA atende em qualquer dia e horário", () => {
  const hours: NonNullable<StoreAiContext["operatingHours"]> = {
    enabled: false,
    timezone: "America/Sao_Paulo",
    openTime: "09:00",
    closeTime: "18:00",
    days: ["seg"],
    closedMessage: "Fechado",
  };
  // Domingo 03:00 BRT (06:00 UTC)
  const sunday3amBrt = new Date("2026-11-08T06:00:00.000Z");
  assert.equal(isWithinOperatingHours(hours, sunday3amBrt), true);
});

test("6.1.b Controle de horário ligado com horários individuais por dia e dias fechados", () => {
  const hours: NonNullable<StoreAiContext["operatingHours"]> = {
    enabled: true,
    timezone: "America/Sao_Paulo",
    openTime: "08:00",
    closeTime: "18:00",
    days: ["ter", "qua", "qui", "sex", "sab"],
    sendClosedMessage: true,
    closedMessage: "Estamos fechados no momento.",
    schedule: {
      seg: { enabled: false, openTime: "08:00", closeTime: "18:00" },
      ter: { enabled: true, openTime: "09:00", closeTime: "19:00", hasBreak: true, breakStart: "12:00", breakEnd: "13:30" },
      qua: { enabled: true, openTime: "18:00", closeTime: "23:30" },
    },
  };

  // Segunda-feira 10:00 BRT (13:00 UTC) -> Fechado
  const monday10amBrt = new Date("2026-11-02T13:00:00.000Z");
  assert.equal(isWithinOperatingHours(hours, monday10amBrt), false);

  // Terça-feira 10:30 BRT (13:30 UTC) -> Dentro do horário
  const tuesday1030amBrt = new Date("2026-11-03T13:30:00.000Z");
  assert.equal(isWithinOperatingHours(hours, tuesday1030amBrt), true);

  // Terça-feira 12:30 BRT (15:30 UTC) -> No intervalo de almoço (12:00 às 13:30) -> Fora do horário
  const tuesday1230pmBrt = new Date("2026-11-03T15:30:00.000Z");
  assert.equal(isWithinOperatingHours(hours, tuesday1230pmBrt), false);

  // Terça-feira 14:00 BRT (17:00 UTC) -> Após o intervalo -> Dentro do horário
  const tuesday2pmBrt = new Date("2026-11-03T17:00:00.000Z");
  assert.equal(isWithinOperatingHours(hours, tuesday2pmBrt), true);

  // Quarta-feira 15:00 BRT (18:00 UTC) -> Abre apenas às 18:00 -> Fora do horário
  const wednesday3pmBrt = new Date("2026-11-04T18:00:00.000Z");
  assert.equal(isWithinOperatingHours(hours, wednesday3pmBrt), false);

  // Quarta-feira 20:00 BRT (23:00 UTC) -> Dentro do horário (18:00 às 23:30)
  const wednesday8pmBrt = new Date("2026-11-04T23:00:00.000Z");
  assert.equal(isWithinOperatingHours(hours, wednesday8pmBrt), true);
});

test("6.1.c Comportamento fora do horário: não envia mensagem automática se sendClosedMessage = false", async () => {
  const db = createFakeRedis();
  const sentTexts: string[] = [];
  const payload = {
    event: "messages.upsert",
    instance: "loja_bella_pizza",
    data: {
      key: { id: "msg_closed_silent_1", remoteJid: "5511999991111@s.whatsapp.net", fromMe: false },
      message: { conversation: "Vocês estão abertos?" },
    },
  };

  const result = await processWebhook(payload, baseCfg, {
    redis: db as never,
    getStoreContext: async () => ({
      channelFound: true,
      tenantId: "00000000-0000-0000-0000-000000000001",
      context: {
        operatingHours: {
          enabled: true,
          timezone: "America/Sao_Paulo",
          openTime: "08:00",
          closeTime: "18:00",
          days: [], // Nenhum dia habilitado -> fora do horário
          sendClosedMessage: false,
          closedMessage: "Fechado",
          schedule: {
            seg: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            ter: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            qua: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            qui: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            sex: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            sab: { enabled: false, openTime: "08:00", closeTime: "18:00" },
            dom: { enabled: false, openTime: "08:00", closeTime: "18:00" },
          },
        },
      },
    }),
    fetchConvContext: async () => ({
      mode: "ai",
      history: [],
      conversationId: "00000000-0000-0000-0000-000000000002",
      isFirstInteraction: false,
    }),
    send: async (_num, txt) => {
      sentTexts.push(txt);
    },
  });

  assert.equal(result.status, "disabled");
  assert.equal(result.reason, "outside_operating_hours");
  assert.equal(sentTexts.length, 0, "Não deve enviar nenhuma mensagem automática quando sendClosedMessage = false");
});

// ============================================================================
// 6.2 TESTES DO QR CODE E PROGRESSO DE 5 ETAPAS
// ============================================================================

function computeQrFiveSteps(state: {
  qrError: boolean;
  qrLoading: boolean;
  qrCode: string | null;
  qrState: "disconnected" | "connecting" | "open";
  qrScanned: boolean;
  qrValidating: boolean;
  qrExpiresIn: number;
}) {
  type StepStatus = "pending" | "active" | "done" | "error";
  const step1: StepStatus =
    state.qrError && !state.qrCode && state.qrState !== "open"
      ? "error"
      : state.qrLoading
        ? "active"
        : state.qrCode || state.qrState === "open"
          ? "done"
          : "pending";

  const step2: StepStatus =
    state.qrState === "open" || state.qrScanned
      ? "done"
      : state.qrCode
        ? state.qrExpiresIn === 0
          ? "error"
          : "active"
        : "pending";

  const step3: StepStatus =
    state.qrState === "open" ? "done" : state.qrScanned ? "active" : "pending";

  const step4: StepStatus =
    state.qrState === "open" ? "done" : state.qrValidating || state.qrScanned ? "active" : "pending";

  const step5: StepStatus = state.qrState === "open" ? "done" : "pending";

  return [step1, step2, step3, step4, step5];
}

test("6.2.a Progresso das 5 etapas do QR Code sem inventar estados", () => {
  // 1. Estado inicial desconectado (todas não iniciadas = pending / cinza)
  assert.deepEqual(
    computeQrFiveSteps({
      qrError: false,
      qrLoading: false,
      qrCode: null,
      qrState: "disconnected",
      qrScanned: false,
      qrValidating: false,
      qrExpiresIn: 0,
    }),
    ["pending", "pending", "pending", "pending", "pending"]
  );

  // 2. Gerando QR Code (Etapa 1 em andamento = active / roxo)
  assert.deepEqual(
    computeQrFiveSteps({
      qrError: false,
      qrLoading: true,
      qrCode: null,
      qrState: "disconnected",
      qrScanned: false,
      qrValidating: false,
      qrExpiresIn: 0,
    }),
    ["active", "pending", "pending", "pending", "pending"]
  );

  // 3. QR Code gerado aguardando leitura (Etapa 1 concluída, Etapa 2 em andamento, Etapa 3 NÃO marcada como concluída por suposição)
  assert.deepEqual(
    computeQrFiveSteps({
      qrError: false,
      qrLoading: false,
      qrCode: "data:image/png;base64,abc",
      qrState: "connecting",
      qrScanned: false,
      qrValidating: false,
      qrExpiresIn: 55,
    }),
    ["done", "active", "pending", "pending", "pending"]
  );

  // 4. QR Code expirado (Etapa 2 sinaliza erro/expiração = vermelho)
  assert.deepEqual(
    computeQrFiveSteps({
      qrError: false,
      qrLoading: false,
      qrCode: "data:image/png;base64,abc",
      qrState: "connecting",
      qrScanned: false,
      qrValidating: false,
      qrExpiresIn: 0,
    }),
    ["done", "error", "pending", "pending", "pending"]
  );

  // 5. WhatsApp conectado e confirmado pela Evolution API (todas as 5 etapas concluídas = verde)
  assert.deepEqual(
    computeQrFiveSteps({
      qrError: false,
      qrLoading: false,
      qrCode: null,
      qrState: "open",
      qrScanned: true,
      qrValidating: false,
      qrExpiresIn: 0,
    }),
    ["done", "done", "done", "done", "done"]
  );
});

// ============================================================================
// 6.3 TESTES DE ATENDIMENTO AO VIVO, HANDOFF E MULTI-TENANT
// ============================================================================

test("6.3.a Solicitação de atendimento humano ('Quero falar com uma pessoa.') transfere e pausa a IA", async () => {
  const esc = detectCustomerEscalation("Quero falar com uma pessoa.");
  assert.equal(esc.isEscalation, true);
  assert.equal(esc.category, "human_request");
  assert.equal(
    esc.customerReply,
    "Claro! 😊 Vou solicitar atendimento da nossa equipe para continuar sua conversa."
  );

  // Outras variações reais de pedido de atendente humano
  assert.equal(detectCustomerEscalation("Preciso falar com um atendente").isEscalation, true);
  assert.equal(detectCustomerEscalation("Pode me passar para uma pessoa real?").isEscalation, true);
  assert.equal(detectCustomerEscalation("Quero atendimento humano por favor").isEscalation, true);

  // Simula o fluxo completo no processWebhook
  const db = createFakeRedis();
  let handoffCalled = false;
  let sentReply = "";
  let aiCalled = false;

  const payload = {
    event: "messages.upsert",
    instance: "loja_bella_pizza",
    data: {
      key: { id: "msg_human_req_1", remoteJid: "5511988887777@s.whatsapp.net", fromMe: false },
      message: { conversation: "Quero falar com uma pessoa." },
    },
  };

  const result = await processWebhook(payload, baseCfg, {
    redis: db as never,
    getStoreContext: async () => ({
      channelFound: true,
      tenantId: "00000000-0000-0000-0000-000000000001",
      context: {},
    }),
    fetchConvContext: async () => ({
      mode: "ai",
      history: [],
      conversationId: "00000000-0000-0000-0000-000000000099",
      isFirstInteraction: false,
    }),
    handoff: async () => {
      handoffCalled = true;
      return "00000000-0000-0000-0000-000000000099";
    },
    generate: async () => {
      aiCalled = true;
      return "Resposta da IA que não deveria ser chamada";
    },
    send: async (_num, text) => {
      sentReply = text;
    },
  });

  assert.equal(result.status, "sent");
  assert.equal(result.reason, "escalated_human_request");
  assert.equal(handoffCalled, true, "Deve acionar handoffToHuman no Supabase");
  assert.equal(aiCalled, false, "A IA não deve gerar resposta quando o cliente pede humano");
  assert.equal(
    sentReply,
    "Claro! 😊 Vou solicitar atendimento da nossa equipe para continuar sua conversa."
  );
});

test("6.3.b Pausa da IA após transferência: novas mensagens do cliente não geram resposta automática da IA", async () => {
  const db = createFakeRedis();
  let aiCalled = false;
  let sentCount = 0;

  const payload = {
    event: "messages.upsert",
    instance: "loja_bella_pizza",
    data: {
      key: { id: "msg_after_handoff_1", remoteJid: "5511988887777@s.whatsapp.net", fromMe: false },
      message: { conversation: "Oi, tem alguém aí para me atender?" },
    },
  };

  const result = await processWebhook(payload, baseCfg, {
    redis: db as never,
    getStoreContext: async () => ({
      channelFound: true,
      tenantId: "00000000-0000-0000-0000-000000000001",
      context: {},
    }),
    fetchConvContext: async () => ({
      mode: "human", // Conversa em 'Aguardando atendente' ou 'Em atendimento humano'
      history: [],
      conversationId: "00000000-0000-0000-0000-000000000099",
      isFirstInteraction: false,
    }),
    generate: async () => {
      aiCalled = true;
      return "IA intrometida";
    },
    send: async () => {
      sentCount++;
    },
  });

  assert.equal(result.status, "disabled");
  assert.equal(result.reason, "conversation_in_human_mode");
  assert.equal(aiCalled, false, "IA deve permanecer em silêncio enquanto em atendimento humano ou aguardando atendente");
  assert.equal(sentCount, 0, "Nenhuma mensagem automática deve ser disparada pela IA");
});

test("6.3.c Recebimento de mensagem real: suporta JID padrão e @lid com remoteJidAlt e isola instâncias por loja", () => {
  const lidPayload = {
    event: "MESSAGES_UPSERT",
    instance: "loja_pizzaria_do_ze",
    data: {
      key: {
        id: "3EB0998877",
        remoteJid: "192837465@lid",
        remoteJidAlt: "5511977776666@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Carlos Cliente",
      message: { conversation: "Boa noite, quero fazer um pedido!" },
    },
  };

  const extracted = parseIncoming(lidPayload);
  assert.ok(extracted, "Deve extrair corretamente mensagem com @lid + remoteJidAlt");
  assert.equal(extracted.number, "5511977776666");
  assert.equal(extracted.text, "Boa noite, quero fazer um pedido!");
  assert.equal(extracted.instance, "loja_pizzaria_do_ze");
  assert.equal(extracted.pushName, "Carlos Cliente");

  // Isolamento multi-tenant de slugs de instância
  assert.equal(tenantInstanceSlug("Pizzaria do Zé"), "loja_pizzaria_do_z_");
  assert.equal(tenantInstanceSlug("Clínica Saúde"), "loja_cl_nica_sa_de");
  assert.notEqual(tenantInstanceSlug("Pizzaria do Zé"), tenantInstanceSlug("Clínica Saúde"));
});

// ============================================================================
// 6.4 TESTES DE BASE DE CONHECIMENTO, HORÁRIO NO PROMPT, PALAVRAS ERRADAS E CLIENTE NERVOSO
// ============================================================================

test("6.4.a buildSystemPrompt injeta Nome da Assistente, Horários do Estabelecimento, Instruções e Base de Conhecimento", () => {
  const saturdayMorningBrt = new Date("2026-11-07T10:30:00.000Z"); // 07:30 BRT
  const hours: NonNullable<StoreAiContext["operatingHours"]> = {
    enabled: false,
    timezone: "America/Sao_Paulo",
    openTime: "06:00",
    closeTime: "18:00",
    days: ["seg", "ter", "qua", "qui", "sex", "sab"],
    schedule: {
      seg: { enabled: true, openTime: "06:00", closeTime: "18:00" },
      ter: { enabled: true, openTime: "06:00", closeTime: "18:00", hasBreak: true, breakStart: "12:00", breakEnd: "13:00" },
      sab: { enabled: true, openTime: "06:00", closeTime: "18:00" },
      dom: { enabled: false, openTime: "06:00", closeTime: "18:00" }
    }
  };

  const formattedSchedule = formatOperatingHoursForPrompt(hours, saturdayMorningBrt);
  assert.ok(formattedSchedule.includes("Sábado: das 06:00 às 18:00"), "Deve listar horário de sábado");
  assert.ok(formattedSchedule.includes("Domingo: Fechado"), "Deve listar domingo como fechado");
  assert.ok(formattedSchedule.includes("Intervalo/pausa das 12:00 às 13:00"), "Deve listar intervalo configurado");
  assert.ok(formattedSchedule.includes("ABERTO AGORA"), "Deve identificar que está aberto às 07:30 BRT de sábado");

  const prompt = buildSystemPrompt({
    storeName: "Bella Pizza",
    agentLabel: "Bia - Atendente Virtual",
    instructions: "Atenda com simpatia e informe sempre os sabores.",
    storeInfo: "Pizza Calabresa R$ 49,90 | Criamos sites personalizados na NovaesWeb.",
    operatingHours: hours
  });

  assert.ok(prompt.includes("Bia - Atendente Virtual"), "Prompt deve incluir o nome da assistente virtual");
  assert.ok(prompt.includes("Atenda com simpatia e informe sempre os sabores."), "Prompt deve incluir O que minha IA fala");
  assert.ok(prompt.includes("Pizza Calabresa R$ 49,90"), "Prompt deve incluir a Base de Conhecimento");
  assert.ok(prompt.includes("das 06:00 às 18:00"), "Prompt deve incluir os horários de funcionamento do painel");
});

test("6.4.b Detector de cliente nervoso e palavras escritas erradas (typos fonéticos)", () => {
  // Cliente nervoso digitando com erros ortográficos
  assert.equal(detectCustomerEscalation("meu pedido ta muito atrazadoooo cade??").category, "delay");
  assert.equal(detectCustomerEscalation("atendimento horivel e pecimo").category, "complaint");
  assert.equal(detectCustomerEscalation("estou muito nervoso com essa demora absurda").isEscalation, true);
  assert.equal(detectCustomerEscalation("quero meu reembolço agora ou vou no procom").isEscalation, true);
  assert.equal(detectCustomerEscalation("quero falar com um atedente umano").category, "human_request");
  assert.equal(detectCustomerEscalation("me passa pra uma pesoa").category, "human_request");
});
