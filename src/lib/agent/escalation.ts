export type EscalationCategory =
  | "delay"
  | "refund"
  | "complaint"
  | "legal"
  | "human_request";

export interface EscalationResult {
  isEscalation: boolean;
  category?: EscalationCategory;
  reason?: string;
  customerReply?: string;
  sentiment?: "frustrated" | "urgent" | "neutral";
}

/**
 * Normalizes text: lowercase, removes diacritics/accents, collapses repeated letters
 * (e.g., "horriveeel" -> "horrivel", "socorroooo" -> "socorro"), and trims whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([aeiou])\1+/g, "$1")
    .replace(/([bcdfghjklmnpqrstvwxyz])\1{2,}/g, "$1$1")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes common Brazilian Portuguese phonetic typos in WhatsApp messages
 * so nervous or fast-typing customers are still accurately understood.
 */
function normalizePhoneticTypos(norm: string): string {
  return norm
    .replace(/\batrazad/g, "atrasad")
    .replace(/\batrazo\b/g, "atraso")
    .replace(/\bdemorano\b/g, "demorando")
    .replace(/\besperano\b/g, "esperando")
    .replace(/\bfaltano\b/g, "faltando")
    .replace(/\bhorivel\b/g, "horrivel")
    .replace(/\borrivel\b/g, "horrivel")
    .replace(/\bpecim(o|a)\b/g, "pessim$1")
    .replace(/\bpesim(o|a)\b/g, "pessim$1")
    .replace(/\berad(o|a)\b/g, "errad$1")
    .replace(/\breembolc(o|ar)\b/g, "reembols$1")
    .replace(/\bextorn(o|ar|a)\b/g, "estorn$1")
    .replace(/\bprocom\b/g, "procon")
    .replace(/\batedente\b/g, "atendente")
    .replace(/\batendete\b/g, "atendente")
    .replace(/\batenente\b/g, "atendente")
    .replace(/\buman(o|a)\b/g, "human$1")
    .replace(/\bpesoa\b/g, "pessoa")
    .replace(/\bgereti\b/g, "gerente");
}

/**
 * Detects customer dissatisfaction, complaints, delay protests, refund demands,
 * legal threats or explicit human requests in WhatsApp messages (including typos).
 */
export function detectCustomerEscalation(text: string): EscalationResult {
  if (!text || typeof text !== "string") {
    return { isEscalation: false };
  }

  const norm = normalizePhoneticTypos(normalizeText(text));

  // 1. Legal / Regulatory / Authorities (Highest urgency)
  const legalRegex = /\b(procon|policia|delegacia|boletim de ocorrencia|process(o|ar)|advogad(o|a)|juizado|pequenas causas|patrulha do consumidor|denuncia(r)?|denunciando)\b/;
  if (legalRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "legal",
      sentiment: "urgent",
      reason: "Ameaça Legal / Procon / Denúncia",
      customerReply:
        "Compreendemos totalmente a seriedade da sua mensagem e pedimos desculpas pelo transtorno. Pausei o atendimento automático agora mesmo e transferi sua conversa com prioridade máxima para a nossa gerência assumir imediatamente. Por favor, aguarde só um instante! 🙏"
    };
  }

  // 2. Refund / Chargeback / Cancellation demands
  const refundRegex = /\b(estorno|estornar|estorne|devolver (meu|o) dinheiro|devolva (meu|o) dinheiro|devolucao do (valor|dinheiro|pix)|quero meu dinheiro( de volta)?|quero (o )?reembolso|reembolsar|cancele(m)? meu pedido|cancela(r)? (o|meu) pedido|quero cancelar|cancelamento imediato|estorna o pix|estornar no cartao)\b/;
  if (refundRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "refund",
      sentiment: "frustrated",
      reason: "Solicitação de Estorno / Cancelamento",
      customerReply:
        "Entendo perfeitamente a sua solicitação e sinto muito por isso. Já pausei as respostas automáticas e passei sua conversa com prioridade urgente para a nossa equipe resolver o seu cancelamento/estorno agora mesmo. Um atendente já vai falar com você! 🙏"
    };
  }

  // 3. Severe Delay / Delivery Complaints
  // Must avoid matching innocent queries like "quanto tempo demora a entrega?"
  const delayRegex = /\b(atras(o|ado|ada)|muito atrasad(o|a)|atraso absurdo|demorando demais|demora absurda|nao aguento mais esperar|cade meu pedido|cade o pedido|onde esta o pedido|onde ta o pedido|meu pedido nao chegou|ainda nao chegou|nao recebi meu pedido|ja faz mais de|faz (mais de )?\d+ (horas|hora|minutos|min)|esperando ha (mais de )?\d+ (horas|minutos|min)|esperando faz horas|duas horas esperando|mais de uma hora esperando|\d+ (horas|hora|minutos|min) atrasad(o|a))\b/;
  const orderDelayed = /\b(pedido|entrega|lanche|pizza)\s+.*(atrasad(o|a)|demor(ando|ou))\b/;

  if (delayRegex.test(norm) || orderDelayed.test(norm)) {
    return {
      isEscalation: true,
      category: "delay",
      sentiment: "frustrated",
      reason: "Reclamação de Atraso na Entrega",
      customerReply:
        "Sinto muito pela demora na sua entrega! Entendo sua frustração. Já pausei o atendimento automático e acionei nossa equipe humana com prioridade para verificar o seu pedido agora mesmo. Só um instante que já vão falar com você! 🙏"
    };
  }

  // 4. Severe Dissatisfaction / Angry Customer / Poor Quality / Bad Experience
  const complaintRegex = /\b(horrivel|pessim(o|a)|absurdo|palhacada|falta de respeito|pouca vergonha|sacanagem|descaso|lixo|porcaria|comida fria|comida estragada|estragad(o|a)|veio errado|pedido errado|veio faltando|faltando coisa|tudo queimado|nunca mais peco|nunca mais compro|pior atendimento|decepcionado|decepcionada|decepcao|indignado|indignada|muito nervos(o|a)|estou furios(o|a)|to put(o|a)|muita raiva|robo burro|ia burra|atendimento ridiculo)\b/;
  if (complaintRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "complaint",
      sentiment: "frustrated",
      reason: "Cliente Nervoso / Reclamação Severa",
      customerReply:
        "Peço sinceras desculpas pelo transtorno! Compreendo totalmente a sua chateação e queremos resolver isso agora mesmo para você. Pausei a inteligência artificial e chamei nossa equipe humana com prioridade máxima. Aguarde só um instante! 🙏"
    };
  }

  // 5. Explicit Human Request
  const humanRegex = /\b(atendente|humano|humana|pessoa real|falar com ((um|uma|o|a|algum|alguma) )?(alguem|pessoa|atendente|humano|humana|dono|gerente|suporte|vendedor|vendedora|equipe|funcionario|gente)|chama(r)? ((um|uma|o|a) )?(atendente|alguem|pessoa|gerente|humano)|quero (atendimento humano|uma pessoa|um humano|um atendente)|passa(r)? (para|pra) ((um|uma|o|a) )?(atendente|pessoa|humano|alguem)|transfer(ir|e) (para|pra) ((um|uma|o|a) )?(atendente|pessoa|humano)|atendimento humano|nao quero (falar com )?(robo|ia|inteligencia artificial))\b/;
  if (humanRegex.test(norm)) {
    return {
      isEscalation: true,
      category: "human_request",
      sentiment: "neutral",
      reason: "Solicitação de Atendente Humano",
      customerReply:
        "Claro! 😊 Vou solicitar atendimento da nossa equipe para continuar sua conversa."
    };
  }

  return { isEscalation: false };
}
