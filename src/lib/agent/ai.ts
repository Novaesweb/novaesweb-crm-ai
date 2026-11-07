import type { AiConfig } from "./config";

function approvedModels(primary: string, fallback?: string): string[] {
  const rawEnv = process.env.AI_FALLBACK_MODELS;
  if (rawEnv !== undefined) {
    const additional = rawEnv.split(",").map(v => v.trim()).filter(Boolean);
    const candidateList = [primary, fallback, ...additional].filter(Boolean) as string[];
    const models = candidateList.filter(m => /^[a-zA-Z0-9_.:/-]{1,140}$/.test(m));
    return [...new Set(models)].slice(0, 4);
  }

  // When using automatic routing ("auto" or "auto/*"), prioritize fast, fluent
  // Brazilian Portuguese models first so it never falls into weak 7B non-PT models.
  if (primary.startsWith("auto")) {
    const preferred = [
      "groq/openai/gpt-oss-20b",
      "auto/gpt",
      "auto/best-chat",
      fallback && !fallback.startsWith("auto") ? fallback : "auto/fast"
    ].filter(Boolean) as string[];
    return [...new Set(preferred)].slice(0, 4);
  }

  const candidateList = [primary, fallback, "groq/openai/gpt-oss-20b", "auto/gpt"].filter(Boolean) as string[];
  const models = candidateList.filter(m => /^[a-zA-Z0-9_.:/-]{1,140}$/.test(m));
  return [...new Set(models)].slice(0, 4);
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DaySchedule = {
  enabled: boolean;
  openTime: string;
  closeTime: string;
  hasBreak?: boolean;
  breakStart?: string;
  breakEnd?: string;
};

export type StoreAiContext = {
  storeName?: string;
  agentLabel?: string;
  instructions?: string;
  storeInfo?: string;
  history?: ChatHistoryMessage[];
  primaryModel?: string;
  fallbackModel?: string;
  allowFallback?: boolean;
  operatingHours?: {
    enabled: boolean;
    timezone?: string;
    openTime: string;
    closeTime: string;
    days?: string[];
    sendClosedMessage?: boolean;
    closedMessage?: string;
    schedule?: Record<string, DaySchedule>;
  };
};

const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: "seg", label: "Segunda-feira" },
  { key: "ter", label: "Terça-feira" },
  { key: "qua", label: "Quarta-feira" },
  { key: "qui", label: "Quinta-feira" },
  { key: "sex", label: "Sexta-feira" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" }
];

function parseMinutes(hhmm: string | undefined, fallback: number): number {
  if (!hhmm || typeof hhmm !== "string" || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return fallback;
  const [h, m] = hhmm.trim().split(":").map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

export function formatOperatingHoursForPrompt(
  hours?: StoreAiContext["operatingHours"],
  nowDate?: Date
): string {
  const now = nowDate ?? new Date();
  const tz = hours?.timezone && hours.timezone.trim() ? hours.timezone.trim() : "America/Sao_Paulo";

  let currentDayKey = "seg";
  let currentDayLabel = "Segunda-feira";
  let formattedDate = "";
  let formattedTime = "";
  let currentMinutes = 12 * 60;

  try {
    const enParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);

    const dayStr = enParts.find(p => p.type === "weekday")?.value?.toLowerCase() || "mon";
    const rawHour = parseInt(enParts.find(p => p.type === "hour")?.value || "0", 10);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = parseInt(enParts.find(p => p.type === "minute")?.value || "0", 10);
    currentMinutes = hour * 60 + minute;

    const map: Record<string, { key: string; label: string }> = {
      mon: { key: "seg", label: "Segunda-feira" },
      tue: { key: "ter", label: "Terça-feira" },
      wed: { key: "qua", label: "Quarta-feira" },
      thu: { key: "qui", label: "Quinta-feira" },
      fri: { key: "sex", label: "Sexta-feira" },
      sat: { key: "sab", label: "Sábado" },
      sun: { key: "dom", label: "Domingo" }
    };
    if (map[dayStr]) {
      currentDayKey = map[dayStr].key;
      currentDayLabel = map[dayStr].label;
    }

    formattedDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(now);
    formattedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  } catch {
    formattedTime = "horário local";
  }

  if (!hours) {
    return `- Momento atual (${tz}): ${currentDayLabel}, ${formattedDate} às ${formattedTime}.\n- Horário de funcionamento: consulte as informações na Base de Conhecimento abaixo.`;
  }

  const defaultOpen = hours.openTime || "08:00";
  const defaultClose = hours.closeTime || "18:00";
  const activeDays = Array.isArray(hours.days) ? hours.days : ["seg", "ter", "qua", "qui", "sex", "sab"];

  const lines: string[] = [];
  let isOpenRightNow = false;
  let todaySummary = "";

  for (const d of DAY_LABELS) {
    const dayCfg = hours.schedule?.[d.key];
    const isEnabled = dayCfg ? Boolean(dayCfg.enabled) : activeDays.includes(d.key);
    const openT = dayCfg?.openTime || defaultOpen;
    const closeT = dayCfg?.closeTime || defaultClose;
    const hasBreak = Boolean(dayCfg?.hasBreak && dayCfg?.breakStart && dayCfg?.breakEnd);
    const breakText = hasBreak ? ` (Intervalo/pausa das ${dayCfg!.breakStart} às ${dayCfg!.breakEnd})` : "";

    const lineText = isEnabled
      ? `das ${openT} às ${closeT}${breakText}`
      : "Fechado";

    lines.push(`  • ${d.label}: ${lineText}`);

    if (d.key === currentDayKey) {
      todaySummary = lineText;
      if (isEnabled) {
        const openMin = parseMinutes(openT, 0);
        const closeMin = parseMinutes(closeT, 23 * 60 + 59);
        const inWindow = closeMin > openMin
          ? currentMinutes >= openMin && currentMinutes <= closeMin
          : currentMinutes >= openMin || currentMinutes <= closeMin;
        let inBreak = false;
        if (hasBreak) {
          const bStart = parseMinutes(dayCfg!.breakStart, -1);
          const bEnd = parseMinutes(dayCfg!.breakEnd, -1);
          if (bStart >= 0 && bEnd > bStart && currentMinutes >= bStart && currentMinutes < bEnd) {
            inBreak = true;
          }
        }
        isOpenRightNow = inWindow && !inBreak;
      }
    }
  }

  const statusNow = isOpenRightNow
    ? `ABERTO AGORA (Hoje, ${currentDayLabel}, funciona ${todaySummary})`
    : `FORA DO HORÁRIO COMERCIAL NESTE INSTANTE (Hoje, ${currentDayLabel}: ${todaySummary})`;

  return [
    `- Data e hora exata agora (${tz}): ${currentDayLabel}, ${formattedDate} às ${formattedTime}.`,
    `- Status do estabelecimento neste momento: ${statusNow}.`,
    `- Quadro de Horários de Funcionamento Cadastrado no Painel:`,
    ...lines
  ].join("\n");
}

export function buildSystemPrompt(storeContext?: StoreAiContext, fallbackPrompt?: string): string {
  const storeName = storeContext?.storeName || "Nossa Loja";
  const agentLabel = storeContext?.agentLabel?.trim() || "Assistente Virtual";
  const customInstructions = storeContext?.instructions?.trim() || "Atenda os clientes com simpatia, agilidade e clareza.";
  const commercialData = storeContext?.storeInfo?.trim() || fallbackPrompt || "Informações gerais sobre o negócio.";
  const hasHistory = (storeContext?.history?.length ?? 0) > 0;
  const scheduleSection = formatOperatingHoursForPrompt(storeContext?.operatingHours);

  return `Você é "${agentLabel}", responsável pelo atendimento no WhatsApp do estabelecimento "${storeName}".
Seu papel é conversar como uma pessoa real da equipe no WhatsApp: 100% humana, acolhedora, inteligente, ágil e resolutiva.

# 1. NATURALIDADE HUMANA NO WHATSAPP (ZERO CARA DE ROBÔ)
- Escreva em português brasileiro natural, fluido e simpático, exatamente como um excelente atendente humano conversa no WhatsApp.
- Use mensagens curtas e fáceis de ler no celular (1 a 3 parágrafos curtos por resposta).
- Use emojis com moderação e naturalidade (1 ou 2 por mensagem).
- Adapte-se ao estilo do cliente: se ele for informal ("eae", "opa", "blz", "manda ai"), responda de forma leve e próxima; se for formal, mantenha o tom educado e prestativo.
- PROIBIDO dar respostas falsas de espera como "Vou verificar as informações da loja para você", "Vou buscar no sistema" ou "Aguarde que vou checar". Você JÁ TEM todas as informações da loja e os horários logo abaixo neste prompt — responda a dúvida do cliente IMEDIATAMENTE na mesma mensagem!

# 2. COMPREENSÃO TOTAL DE PALAVRAS ERRADAS, ABREVIAÇÕES E ÁUDIOS TRANSCRITOS
- Clientes no WhatsApp digitam rápido, com corretor errando, sem acento, com palavras grudadas ou erros fonéticos.
- Você DEVE compreender perfeitamente qualquer abreviação, gíria ou palavra escrita errada pelo contexto, incluindo:
  * Abreviações de WhatsApp: "oq" / "o q" (o que), "vc" / "vcs" (você/vocês), "qto" / "qnto" / "qnt" (quanto), "hrs" / "hr" (horas), "hj" (hoje), "pfv" / "pfvr" (por favor), "blz" (beleza), "vlw" (valeu), "tbm" / "tb" (também), "cmg" (comigo), "ctz" (certeza), "fds" (fim de semana), "ta" / "tá" (está / tudo bem / ok), "c/" (com), "s/" (sem), "p/" / "pra" (para).
  * Erros de digitação ou fonéticos comuns: "piza" (pizza), "calabreza" (calabresa), "mussarela/muçarela/muzarela", "kardapio/cardapio", "preso/preço/valor", "abeto/abero" (aberto), "fika/fica", "entega/entrega", "endreso/endereço", "xave/chave", "orsamento/orçamento", "siti/site", "sistena/sistema", "atrazado/atrasado".
- NUNCA corrija a gramática do cliente e NUNCA diga "não entendi o que você quis dizer" por causa de erro de digitação. Deduza a intenção pelo contexto do negócio e responda naturalmente!

# 3. INTELIGÊNCIA EMOCIONAL (QUANDO O CLIENTE ESTÁ NERVOSO, ANSIOSO OU COM PRESSA)
- Se perceber que o cliente está nervoso, ansioso, impaciente, confuso ou com muita pressa (ex.: escrevendo em LETRAS MAIÚSCULAS, usando vários "???" ou "!!!", dizendo "tô com pressa", "me ajuda logo", "não tô entendendo nada", "demora pra responder", "pelo amor de Deus"):
  1. Acolha e acalme o cliente primeiro com empatia humana genuína (ex.: "Fica tranquilo(a), já estou aqui com você e vamos resolver isso rapidinho! 😊").
  2. Nunca seja frio, defensivo ou burocrático.
  3. Responda a dúvida ou necessidade dele de forma direta, simples e imediata.
  4. Caso o cliente continue insatisfeito ou queira falar com uma pessoa, ofereça: "Se você preferir falar diretamente com uma pessoa da nossa equipe, é só me avisar que já te transfiro na hora!"

# 4. SAUDAÇÕES E MEMÓRIA DE CONVERSA
${hasHistory ? `- ATENÇÃO (CONVERSA EM ANDAMENTO): Você JÁ está conversando com este cliente (veja o histórico). NUNCA repita cumprimentos ("Olá!", "Oi, tudo bem?", "Seja bem-vindo") e não se apresente novamente. Vá direto à resposta do que o cliente perguntou ou disse agora.` : `- PRIMEIRA MENSAGEM: Cumprimente de forma calorosa e natural (se o cliente apenas deu "oi/oie/bom dia", apresente-se brevemente e pergunte como pode ajudar; se ele já fez uma pergunta direta, cumprimente rapidamente e já responda a pergunta!).`}
- Conecte respostas curtas ao contexto anterior: se o cliente responder apenas "ta", "ok", "sim", "quero", "pode", "quanto?", "e o outro?", olhe para a mensagem anterior da conversa e continue o assunto com inteligência, sem perder o fio da meada.

# 5. HORÁRIO DE FUNCIONAMENTO DO ESTABELECIMENTO E HORA ATUAL
Sempre que o cliente perguntar "que horas abre?", "tá aberto?", "até que horas funciona?", "abre hoje?" ou "funciona domingo?", responda com base nestes dados oficiais do estabelecimento (e complementos da Base de Conhecimento):
----------------------------------------
${scheduleSection}
----------------------------------------

# 6. BASE DE CONHECIMENTO DO PAINEL E O QUE A IA DEVE FALAR (FONTE OFICIAL)
As instruções e a Base de Conhecimento abaixo foram configuradas pelo proprietário no painel do cliente. Use TODAS essas informações para responder sobre o que a empresa faz, cardápio, produtos, serviços, planos, preços, entregas, pagamentos e regras:

Instruções de Comportamento da Loja ("O que minha IA fala"):
----------------------------------------
${customInstructions}
----------------------------------------

Base de Conhecimento Oficial (Produtos, Serviços, Preços, Planos e Regras):
----------------------------------------
${commercialData}
----------------------------------------
- IMPORTANTE: Se o nome na Base de Conhecimento for mais específico que "${storeName}", utilize naturalmente a identidade, os produtos, serviços e planos descritos na Base de Conhecimento acima!
- NUNCA invente preços, taxas ou produtos que não estejam descritos acima.
- Se o cliente perguntar algo muito específico que realmente não exista na Base de Conhecimento nem nos Horários acima, seja sincero de forma humana: explique o que você já sabe sobre o assunto e diga que pode chamar um atendente humano da equipe para confirmar esse detalhe específico.`;
}

export async function generateAnswer(
  prompt: string,
  cfg: AiConfig,
  storeContext?: StoreAiContext
): Promise<string> {
  const url = cfg.aiUrl.replace(/\/$/, "") + "/chat/completions";
  const primary = storeContext?.primaryModel || cfg.aiModel || "auto/best-chat";
  const fallback = storeContext?.fallbackModel;
  const models = storeContext?.allowFallback === true ? approvedModels(primary, fallback) : (/^[a-zA-Z0-9_.:/-]{1,140}$/.test(primary) ? [primary] : []);
  if (!models.length) throw new Error("Modelo de IA nao autorizado");

  const deadline = Date.now() + 25_000;
  const systemContent = buildSystemPrompt(storeContext, cfg.systemPrompt);

  // Construct message thread with real conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent }
  ];

  if (storeContext?.history && storeContext.history.length > 0) {
    // Keep up to 10 most recent dialogue turns for fast response and sharp context
    const recentHistory = storeContext.history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.content && msg.content.trim()) {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content.trim()
        });
      }
    }
  }

  // Add the incoming prompt from the user
  messages.push({ role: "user", content: prompt });

  for (let index = 0; index < models.length; index++) {
    const currentModel = models[index];
    const controller = new AbortController();
    const ms = Math.min(12_000, deadline - Date.now());
    if (ms <= 0) throw new Error("Tempo maximo de IA excedido");
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.aiKey}` },
        body: JSON.stringify({
          model: currentModel,
          temperature: 0.35,
          max_tokens: 700,
          messages,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (retryable && index + 1 < models.length && Date.now() < deadline) {
          console.warn(`[ai-fallback] Model ${currentModel} returned ${response.status}. Switching to fallback: ${models[index + 1]}`);
          continue;
        }
        const nonRetryableErr = new Error(`Provedor IA retornou HTTP ${response.status}`);
        (nonRetryableErr as unknown as { nonRetryable: boolean }).nonRetryable = true;
        throw nonRetryableErr;
      }
      const data: unknown = await response.json();
      const answer = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) {
        if (index + 1 < models.length && Date.now() < deadline) {
          console.warn(`[ai-fallback] Model ${currentModel} returned empty content. Switching to fallback: ${models[index + 1]}`);
          continue;
        }
        throw new Error("IA retornou resposta vazia");
      }
      return answer.trim().slice(0, 1400);
    } catch (error) {
      if ((error as { nonRetryable?: boolean })?.nonRetryable) throw error;
      if (index + 1 < models.length && Date.now() < deadline) {
        console.warn(`[ai-fallback] Error on model ${currentModel}. Switching to fallback: ${models[index + 1]}`);
        continue;
      }
      if (index + 1 >= models.length || Date.now() >= deadline) throw error;
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "AbortError")) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Todas as rotas de IA permitidas falharam");
}
