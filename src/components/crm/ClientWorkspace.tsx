"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./ClientWorkspace.module.css";
import KnowledgeWorkspace from "./KnowledgeWorkspace";
import {
  Building2, CheckCircle2, CircleAlert, Inbox, LockKeyhole, LogOut,
  Mail, MessageSquare, RefreshCw, Search, ShieldCheck, Users, UserPlus,
  Smartphone, QrCode, BookOpen, Bot, Sparkles, HelpCircle, ShieldAlert, Save, Trash2, Ban,
  Calendar, CreditCard, ChevronRight, HelpCircle as InfoIcon, Play, Clock, Zap, Send,
  Trash, Bell, Volume2, VolumeX, Tag, Filter, Check, ArrowRight, ArrowLeft, Wand2, BarChart3, Star, Plus
} from "lucide-react";
import {
  WhatsappFiveSlotsGrid,
  featureAvailable, FeatureUnavailable, commercialPlanId,
  QuickRepliesSection,
  TeamOperatorsSection,
  ReportsAndIndicatorsSection,
  FeatureGovernanceMatrix,
  UpgradeRequestModal,
  type WhatsappSlotItem,
  type QuickReplyItem,
  type TeamOperatorItem,
  type FeatureStateItem,
  type ReportsPayload
} from "@/components/crm/ClientPlanModules";

type Tenant = { id: string; name: string; status: string };
type Contact = { id: string; phone: string; display_name: string | null; created_at: string };
type Conversation = {
  id: string;
  contact_id: string;
  channel_id?: string | null;
  status: string;
  mode: string;
  last_message_at: string | null;
  assigned_to: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  priorityRank?: number;
  tag?: string | null;
  channelSlot?: number;
  satisfaction?: { rating: number; comment: string; createdAt: string } | null;
};
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; body: string; created_at: string };
type EscalationItem = { category: string; reason: string; text?: string; timestamp?: string };
type TagItem = { id: string; name: string; color: string };
type ContactTagItem = { contact_id: string; tag_id: string };

type Data = {
  tenants: Tenant[];
  selectedTenant: string | null;
  isSuspended?: boolean;
  suspensionReason?: string;
  publicSuspensionReason?: string;
  plan?: {
    planId?: string;
    name: string;
    price: string;
    dueDate: string;
    status: string;
    autoBlock: boolean;
    quotaLimit?: number;
    quotaUsed?: number;
    maxOperators?: number;
    maxWhatsappConnections?: number;
    allowedFeatures?: string[];
    featureStates?: Record<string, FeatureStateItem>;
    publicSuspensionReason?: string;
    isTrial?: boolean;
    trialDaysLeft?: number;
    trialStartedAt?: string;
    trialExpiresAt?: string;
    trialStatus?: "active" | "expiring_soon" | "expired" | "quota_exhausted" | "converted";
  };
  allowedFeatures?: string[];
  featureStates?: Record<string, FeatureStateItem>;
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  escalations?: Record<string, EscalationItem>;
  tags?: TagItem[];
  contactTags?: ContactTagItem[];
  note?: string;
};

type Tab = "whatsapp" | "conhecimento" | "artigos" | "simulador" | "horarios" | "atendimentos" | "equipe" | "relatorios" | "contatos" | "plano";

function dateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const INDUSTRY_PRESETS = [
  {
    label: "🍕 Pizzaria & Lanchonete",
    agentName: "Bia - Atendente Bella Pizza",
    instructions: "Você é a atendente virtual da Bella Pizza no WhatsApp. Atenda com simpatia e agilidade, use emojis leves, ajude o cliente a escolher a pizza ou lanche, confirme o tamanho e sabor, pergunte se deseja adicionar bebidas e solicite o endereço completo de entrega. Seja objetiva, cordial e prestativa.",
    storeInfo: `🍕 CARDÁPIO DE PIZZAS:
- Pizza Calabresa (Grande 8 fatias): R$ 49,90 | (Média 6 fatias): R$ 39,90
- Pizza 4 Queijos (Grande): R$ 54,90 | (Média): R$ 44,90
- Pizza Frango com Catupiry (Grande): R$ 52,90 | (Média): R$ 42,90
- Pizza Bacon Especial (Grande): R$ 56,90 | (Média): R$ 45,90
- Borda Recheada (Catupiry ou Cheddar): R$ 8,00

🥤 BEBIDAS:
- Coca-Cola 2 Litros: R$ 13,00
- Guaraná Antarctica 2L: R$ 11,00
- Cerveja Heineken Long Neck: R$ 9,50
- Água Mineral 500ml: R$ 4,50

🕒 HORÁRIO DE ATENDIMENTO:
- Terça a Domingo, das 18h00 às 23h30 (Segunda fechado)

🛵 ENTREGA & TAXAS:
- Centro: R$ 5,00 | Bairros vizinhos: R$ 8,00
- Tempo estimado: 40 a 55 minutos

💳 FORMAS DE PAGAMENTO:
- Pix (Chave: pix@bellapizza.com), Cartão na entrega ou Dinheiro`
  },
  {
    label: "👗 Loja de Roupas & Varejo",
    agentName: "Carol - Consultora de Moda",
    instructions: "Você é a consultora de vendas virtual da Loja Elegance no WhatsApp. Seja alegre, atenciosa e estilosa. Ajude as clientes a encontrar peças do seu tamanho, tire dúvidas sobre tecidos, caimento e prazo de envio. Incentive o envio de fotos do catálogo e feche a venda com carinho.",
    storeInfo: `✨ COLEÇÃO ATUAL:
- Vestido Midi Floral: R$ 149,90 (Tamanhos P, M, G)
- Calça Jeans Wide Leg: R$ 189,90 (Tamanhos 36 ao 44)
- Cropped Canelado Básico: R$ 49,90 (Cores: Preto, Branco, Fúcsia)
- Blazer Alfaiataria: R$ 229,90 (Tamanhos P, M, G)

📦 ENVIOS E RETIRADA:
- Enviamos para todo o Brasil via Correios (PAC e Sedex)
- Frete Grátis acima de R$ 250,00
- Retirada na loja física em até 2 horas úteis

🕒 HORÁRIO:
- Segunda a Sexta: 09h00 às 19h00 | Sábado: 09h00 às 17h00

💳 FORMAS DE PAGAMENTO:
- Pix com 5% de desconto ou Cartão em até 6x sem juros`
  },
  {
    label: "💼 Serviços & Agência",
    agentName: "Alex - Consultor de Projetos",
    instructions: "Você é o especialista de atendimento da Agência NovaesWeb. Entenda a necessidade do cliente (site, tráfego, automação, IA), tire dúvidas sobre metodologia e prazos, apresente os diferenciais da agência e convide para agendar uma demonstração ou orçamento personalizado.",
    storeInfo: `🚀 NOSSOS SERVIÇOS:
- Criação de Sites e Landing Pages de Alta Conversão (Entrega em 7 a 15 dias)
- Atendimento com IA e WhatsApp Automatizado (NovaesWeb CRM AI)
- Gestão de Tráfego Pago (Google Ads & Meta Ads)
- Automação de Processos e Chatbots

📋 COMO FUNCIONA O PROCESSO:
1. Diagnóstico gratuito das necessidades da sua empresa
2. Proposta comercial detalhada com cronograma e investimento
3. Execução ágil com alinhamentos semanais

🕒 HORÁRIO COMERCIAL:
- Segunda a Sexta: 08h30 às 18h30

💳 FORMAS DE PAGAMENTO:
- Pix, Boleto Bancário ou Cartão Corporativo parcelado`
  },
  {
    label: "🩺 Clínica & Consultório",
    agentName: "Juliana - Recepção & Agendamentos",
    instructions: "Você é a assistente virtual da Clínica Saúde & Bem-Estar no WhatsApp. Seja muito acolhedora, educada e cuidadosa. Tire dúvidas sobre as especialidades atendidas, informe os dias de consulta, orientações pré-exame e ajude o paciente a agendar o melhor horário.",
    storeInfo: `🏥 ESPECIALIDADES E CONSULTAS:
- Clínica Geral: R$ 180,00
- Dermatologia: R$ 250,00
- Nutrição Clínica & Esportiva: R$ 200,00
- Psicologia: R$ 170,00 por sessão

📋 CONVÊNIOS E PLANOS ACEITOS:
- Atendemos particular com emissão de recibo para reembolso
- Convênios parceiros: Unimed, Bradesco Saúde, Amil e SulAmérica

🕒 HORÁRIO DE ATENDIMENTO:
- Segunda a Sexta: 08h00 às 20h00 | Sábado: 08h00 às 13h00

📍 LOCALIZAÇÃO:
- Av. Central, 1000 - Cj. 52 - Centro Empresarial
- Estacionamento conveniado no local`
  }
];

type ClientWorkspaceProps = {
  embedded?: boolean;
  initialTenant?: string;
};

export default function ClientWorkspace({ embedded = false, initialTenant = "" }: ClientWorkspaceProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [tenant, setTenant] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>(embedded ? "atendimentos" : "whatsapp");
  const [selected, setSelected] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "ai" | "human" | "urgent">("all");
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactNotice, setContactNotice] = useState("");
  const [handoffNotice, setHandoffNotice] = useState("");
  const [claiming, setClaiming] = useState(false);

  // Suspension state
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");

  // AI Configuration state (Store Owner inputs what the AI says)
  const [agentLabel, setAgentLabel] = useState("Assistente Virtual");
  const [instructions, setInstructions] = useState("");
  const [storeInfo, setStoreInfo] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState("");

  // Keep track of unsaved local AI edits and prevent background fetch from wiping out user typing
  const isAiDirtyRef = useRef(false);
  const loadedTenantAiRef = useRef("");
  const prevDataRef = useRef<Data | null>(null);

  // Operating Hours state
  type DayScheduleCfg = {
    enabled: boolean;
    openTime: string;
    closeTime: string;
    hasBreak?: boolean;
    breakStart?: string;
    breakEnd?: string;
  };
  const DEFAULT_DAY_SCHEDULE: Record<string, DayScheduleCfg> = {
    seg: { enabled: false, openTime: "08:00", closeTime: "18:00", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    ter: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    qua: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    qui: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    sex: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    sab: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
    dom: { enabled: true, openTime: "18:00", closeTime: "23:30", hasBreak: false, breakStart: "12:00", breakEnd: "13:00" },
  };
  const [operatingHours, setOperatingHours] = useState<{
    enabled: boolean;
    timezone: string;
    openTime: string;
    closeTime: string;
    days: string[];
    sendClosedMessage: boolean;
    closedMessage: string;
    schedule: Record<string, DayScheduleCfg>;
  }>({
    enabled: false,
    timezone: "America/Sao_Paulo",
    openTime: "18:00",
    closeTime: "23:30",
    days: ["ter", "qua", "qui", "sex", "sab", "dom"],
    sendClosedMessage: true,
    closedMessage: "Olá! Nosso horário de atendimento é de terça a domingo, das 18h às 23h30. Deixe sua mensagem e responderemos assim que abrirmos! 😊",
    schedule: DEFAULT_DAY_SCHEDULE
  });
  const isHoursDirtyRef = useRef(false);
  const [hoursNotice, setHoursNotice] = useState("");
  const [hoursError, setHoursError] = useState("");
  const [savingHours, setSavingHours] = useState(false);

  // Quota state
  const [quotaData, setQuotaData] = useState<{
    quotaLimit: number;
    quotaUsed: number;
  }>({
    quotaLimit: 500,
    quotaUsed: 0
  });

  // Simulator state
  const [simMessages, setSimMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    time: string;
    latency?: number;
    isEscalation?: boolean;
    escalationReason?: string;
    escalationCategory?: string;
  }>>([
    {
      role: "assistant",
      content: "Olá! Sou a NovaesWeb IA configurada para a sua loja. Faça uma pergunta sobre seus produtos, cardápio ou horários para testar como eu converso com seus clientes!",
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  // WhatsApp QR Code state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [deletingQr, setDeletingQr] = useState(false);
  const [qrState, setQrState] = useState<"disconnected" | "connecting" | "open">("disconnected");
  const [qrNotice, setQrNotice] = useState("");
  const [qrError, setQrError] = useState(false);
  const [qrScanned, setQrScanned] = useState(false);
  const [qrValidating, setQrValidating] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [connectedProfile, setConnectedProfile] = useState<string | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState<number>(0);
  const [readTimestamps, setReadTimestamps] = useState<Record<string, number>>({});

  // Human Messaging state
  const [humanInput, setHumanInput] = useState("");
  const [sendingHumanMsg, setSendingHumanMsg] = useState(false);

  // Funnel & Tags filtering state
  const [funnelFilter, setFunnelFilter] = useState<"all" | "novo" | "ai" | "waiting_human" | "human" | "waiting_client" | "closed">("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  // Notifications & Sound state
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // Plan Allowed Features & 4-State Governance
  const [allowedFeatures, setAllowedFeatures] = useState<string[]>([]);
  const [featureStates, setFeatureStates] = useState<Record<string, FeatureStateItem>>({});
  function canUseFeature(id: string) { return allowedFeatures.includes(id) && featureAvailable(featureStates,id,isSuspended); }
  function featureMessage(id: string) { return featureStates[id]?.reason || "Não foi possível confirmar a permissão deste recurso."; }
  function requestFeatureAccess(id: string, targetPlan: string, reason: string) {
    if (!isSuspended && featureStates[id]?.state === "locked_by_plan") openUpgradeRequest(targetPlan,reason);
    else alert(featureMessage(id));
  }


  useEffect(() => { if (!featureAvailable(featureStates,"sound_notifications",isSuspended)) setSoundEnabled(false); },[featureStates,isSuspended]);

  // 5 WhatsApp Slots state (Etapa 5)
  const [whatsappSlots, setWhatsappSlots] = useState<WhatsappSlotItem[]>([]);
  const [selectedWhatsappSlot, setSelectedWhatsappSlot] = useState<number>(1);

  useEffect(() => {
    const currentSlot = whatsappSlots.find(s=>s.slot===selectedWhatsappSlot);
    if (currentSlot && !currentSlot.unlocked) {
      setSelectedWhatsappSlot(whatsappSlots.find(s=>s.unlocked)?.slot ?? 1);
      setQrCode(null); setQrState("disconnected");
    }
  }, [whatsappSlots,selectedWhatsappSlot]);

  // Quick Replies, Team Operators & Reports state (Etapa 7)
  const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([]);
  const [teamOperators, setTeamOperators] = useState<TeamOperatorItem[]>([]);
  const [reportsData, setReportsData] = useState<ReportsPayload | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  // Priority, Satisfaction & Upgrade Request Modal state
  const [priorityFilter, setPriorityFilter] = useState<"all" | "urgent" | "high" | "normal" | "low">("all");
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; targetPlan: string; reason: string }>({
    open: false,
    targetPlan: "CRM Business",
    reason: ""
  });
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyRating, setSurveyRating] = useState(5);
  const [surveyComment, setSurveyComment] = useState("");
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("purple");

  // Guided Setup Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    storeName: "",
    productsPrices: "",
    hoursDelivery: "",
    address: "",
    faqs: "",
    humanHandoffRules: "",
    tone: "amigavel"
  });

  const currentTenantObj = useMemo(() => data?.tenants?.find(t => t.id === tenant) ?? null, [data, tenant]);
  const instanceName = useMemo(() => {
    const slotItem = whatsappSlots.find(s => s.slot === selectedWhatsappSlot);
    if (slotItem?.instanceName) return slotItem.instanceName;
    if (!currentTenantObj) return "novaesweb-ia-teste";
    const slug = currentTenantObj.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);
    const base = slug.startsWith("novaesweb") ? "novaesweb-ia-teste" : `loja_${slug}`;
    return selectedWhatsappSlot <= 1 ? base : `${base}_${selectedWhatsappSlot}`;
  }, [currentTenantObj, whatsappSlots, selectedWhatsappSlot]);

  const fetchReports = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setLoadingReports(true);
    try {
      const res = await fetch(`/api/crm/operator/features?tenant=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.quickReplies)) setQuickReplies(json.quickReplies);
        if (Array.isArray(json.teamOperators)) setTeamOperators(json.teamOperators);
        if (json.featureStates) setFeatureStates(json.featureStates);
        setReportsData(json.reports ?? null);
      }
    } catch {} finally {
      setLoadingReports(false);
    }
  }, []);

  const fetchAiSettings = useCallback(async (tenantId: string, force = false) => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/crm/operator/ai-settings?tenant=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (force || !isAiDirtyRef.current) {
          setAgentLabel(json.agentLabel ?? "Assistente Virtual");
          setInstructions(json.instructions ?? "");
          setStoreInfo(json.storeInfo ?? "");
          setAiEnabled(json.enabled !== false);
          isAiDirtyRef.current = false;
        }
        if (json.operatingHours && (force || !isHoursDirtyRef.current)) {
          const rawH = json.operatingHours;
          const openDef = rawH.openTime || "18:00";
          const closeDef = rawH.closeTime || "23:30";
          const daysArr: string[] = Array.isArray(rawH.days) ? rawH.days : ["ter", "qua", "qui", "sex", "sab", "dom"];
          const nextSchedule: Record<string, DayScheduleCfg> = {};
          for (const d of ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]) {
            const ds = rawH.schedule?.[d];
            nextSchedule[d] = {
              enabled: ds && typeof ds.enabled === "boolean" ? ds.enabled : daysArr.includes(d),
              openTime: ds?.openTime || openDef,
              closeTime: ds?.closeTime || closeDef,
              hasBreak: Boolean(ds?.hasBreak),
              breakStart: ds?.breakStart || "12:00",
              breakEnd: ds?.breakEnd || "13:00",
            };
          }
          setOperatingHours(prev => ({
            ...prev,
            ...rawH,
            timezone: rawH.timezone || "America/Sao_Paulo",
            sendClosedMessage: rawH.sendClosedMessage !== false,
            schedule: nextSchedule,
            days: Object.entries(nextSchedule).filter(([, v]) => v.enabled).map(([k]) => k),
          }));
          isHoursDirtyRef.current = false;
        }
        if (json.plan) {
          setQuotaData({
            quotaLimit: json.plan.quotaLimit || 200,
            quotaUsed: json.plan.quotaUsed || 0
          });
        }
        if (Array.isArray(json.allowedFeatures)) {
          setAllowedFeatures(json.allowedFeatures);
        }
        if (json.featureStates) {
          setFeatureStates(json.featureStates);
        }
        if (Array.isArray(json.whatsappSlots)) {
          setWhatsappSlots(json.whatsappSlots);
        }
        if (Array.isArray(json.quickReplies)) {
          setQuickReplies(json.quickReplies);
        }
        if (Array.isArray(json.teamOperators)) {
          setTeamOperators(json.teamOperators);
        }
      }
      void fetchReports(tenantId);
    } catch {}
  }, [fetchReports]);

  // Audio beep notification via Web Audio API
  const playNotificationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }, []);

  const fetchData = useCallback(async (tenantId: string, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const url = "/api/crm/operator/data" + (tenantId ? "?tenant=" + encodeURIComponent(tenantId) : "");
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        setAuthenticated(false);
        setData(null);
        setError("Sessão expirada. Entre novamente.");
        return;
      }
      if (!response.ok) throw Error(response.status === 403 ? "Empresa não autorizada." : "Falha ao consultar dados da empresa.");
      const json = await response.json() as Data;

      // Check if new urgent handoffs arrived
      if (silent && soundEnabled && featureStates.sound_notifications?.state === "allowed" && !isSuspended) {
        const prevUrgent = prevDataRef.current?.conversations?.filter(c => c.status === "urgent" || c.status === "waiting_human").length || 0;
        const newUrgent = json.conversations?.filter(c => c.status === "urgent" || c.status === "waiting_human").length || 0;
        if (newUrgent > prevUrgent) {
          playNotificationSound();
        }
      }

      prevDataRef.current = json;
      setData(json);
      setIsSuspended(json.isSuspended === true);
      setSuspensionReason(json.suspensionReason || "");

      if (Array.isArray(json.allowedFeatures)) {
        setAllowedFeatures(json.allowedFeatures);
      }
      if (json.featureStates) {
        setFeatureStates(json.featureStates);
      }
      if (json.plan) {
        setQuotaData({
          quotaLimit: json.plan.quotaLimit || 200,
          quotaUsed: json.plan.quotaUsed || 0
        });
      }

      const activeTenant = json.selectedTenant || "";
      setTenant(activeTenant);
      if (activeTenant && loadedTenantAiRef.current !== activeTenant) {
        loadedTenantAiRef.current = activeTenant;
        void fetchAiSettings(activeTenant, true);
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Falha ao carregar atendimentos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchAiSettings, soundEnabled, playNotificationSound, featureStates.sound_notifications?.state, isSuspended]);

  // Silent auto-refresh polling every 3.5 seconds for real-time live chat and handoff notifications
  useEffect(() => {
    if (!authenticated || !tenant) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchData(tenant, true);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [authenticated, tenant, fetchData]);

  // Check connection state for this tenant & active slot
  const checkStatus = useCallback(async () => {
    if (!instanceName) return;
    try {
      const res = await fetch(`/api/crm/whatsapp/status?instance=${encodeURIComponent(instanceName)}&tenantId=${encodeURIComponent(tenant)}&slot=${selectedWhatsappSlot}`, { cache: "no-store" });
      if (res.ok) {
        const s = await res.json();
        if (Array.isArray(s.whatsappSlots)) {
          setWhatsappSlots(s.whatsappSlots);
        }
        if (s.connected || s.state === "open") {
          setQrState("open");
          setQrCode(null);
          setQrScanned(true);
          setQrValidating(false);
          setQrError(false);
          setQrExpiresIn(0);
          if (s.phoneNumber) setConnectedPhone(s.phoneNumber);
          if (s.profileName) setConnectedProfile(s.profileName);
        } else {
          if (s.qrScanned) setQrScanned(true);
          setConnectedPhone(null);
          setConnectedProfile(null);
          setQrState(prev => (prev === "open" ? "disconnected" : prev));
        }
      }
    } catch {}
  }, [instanceName, tenant, selectedWhatsappSlot]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/crm/auth/session", { cache: "no-store", credentials: "same-origin" });
        const result = await res.json() as { authenticated: boolean; role?: string };
        if (!active) return;
        if (!result.authenticated) {
          setAuthenticated(false);
          if (!embedded && typeof window !== "undefined") {
            window.location.href = "/";
          }
          setError("Sua sessão expirou. Entre novamente no painel Master.");
          return;
        }
        setAuthenticated(true);
        const requestedTenant = initialTenant || new URLSearchParams(window.location.search).get("tenant") || "";
        void fetchData(requestedTenant);
      } catch {
        if (active) setError("Não foi possível verificar a sessão.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authenticated && instanceName) {
      void checkStatus();
    }
  }, [authenticated, instanceName, checkStatus]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json() as { authenticated?: boolean; success?: boolean; error?: string };
      if (!res.ok) throw Error(data.error === "invalid_credentials" ? "E-mail ou senha incorretos." : "Não foi possível autenticar.");
      setAuthenticated(true);
      setEmail("");
      setPassword("");
      void fetchData("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/crm/auth/session", { method: "DELETE", credentials: "same-origin" });
    setAuthenticated(false);
    setData(null);
    setTenant("");
    setQrCode(null);
    setQrState("disconnected");
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }

  async function changeTenant(nextTenant: string) {
    setTenant(nextTenant);
    setSelected("");
    setSelectedWhatsappSlot(1);
    setQrCode(null);
    loadedTenantAiRef.current = nextTenant;
    isAiDirtyRef.current = false;
    void fetchAiSettings(nextTenant, true);
    await fetchData(nextTenant);
  }

  // Connect WhatsApp: generate QR Code for selected slot (1..5)
  async function handleConnectWhatsApp() {
    const selectedSlot = whatsappSlots.find(s=>s.slot === selectedWhatsappSlot);
    if (!instanceName || !canUseFeature("ai_chat") || !selectedSlot?.unlocked || selectedSlot.slot > (data?.plan?.maxWhatsappConnections ?? 0)) {
      setQrNotice("Este espaço não está liberado para conexão.");
      return;
    }
    setQrLoading(true);
    setQrError(false);
    setQrScanned(false);
    setQrValidating(false);
    setQrNotice(`Etapa 1: Preparando conexão do Espaço #${selectedWhatsappSlot} (${instanceName})...`);
    try {
      const res = await fetch("/api/crm/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance: instanceName,
          instanceName: instanceName,
          slot: selectedWhatsappSlot,
          tenantId: tenant,
          tenantName: currentTenantObj?.name
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.message || data.error || "Falha ao conectar com o WhatsApp.";
        setQrNotice(errorMsg);
        setQrError(true);
        setQrState("disconnected");
        return;
      }
      if (data.connected || data.state === "open") {
        setQrState("open");
        setQrCode(null);
        setQrScanned(true);
        setQrValidating(false);
        setQrError(false);
        setQrExpiresIn(0);
        setQrNotice("WhatsApp conectado e confirmado pela Evolution API!");
        void checkStatus();
        if (tenant) void fetchData(tenant, true);
      } else if (data.qrcode) {
        const formatted = data.qrcode.startsWith("data:") ? data.qrcode : `data:image/png;base64,${data.qrcode}`;
        setQrCode(formatted);
        setQrState("connecting");
        setQrError(false);
        setQrExpiresIn(60);
        setQrNotice(data.message || "QR Code gerado! Escaneie com seu WhatsApp em Aparelhos Conectados.");
      } else {
        setQrError(true);
        setQrNotice(data.message || "Aguardando geração do QR Code. Tente novamente em alguns segundos.");
      }
    } catch {
      setQrError(true);
      setQrNotice("Falha de conexão com a central de WhatsApp. Verifique sua rede e tente novamente.");
    } finally {
      setQrLoading(false);
    }
  }

  // Delete instance / Disconnect WhatsApp
  async function handleDeleteInstance() {
    if (!instanceName) return;
    if (!window.confirm(`Deseja realmente apagar a instância "${instanceName}" (Espaço #${selectedWhatsappSlot}) e desconectar o WhatsApp da loja "${currentTenantObj?.name || ""}"? O QR Code será cancelado e o número desconectado.`)) return;
    setDeletingQr(true);
    setQrNotice("Apagando instância e desconectando WhatsApp...");
    try {
      const res = await fetch(`/api/crm/whatsapp/connect?instance=${encodeURIComponent(instanceName)}&tenantId=${encodeURIComponent(tenant)}&slot=${selectedWhatsappSlot}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setQrCode(null);
        setQrState("disconnected");
        setQrScanned(false);
        setQrValidating(false);
        setQrError(false);
        setConnectedPhone(null);
        setConnectedProfile(null);
        setQrExpiresIn(0);
        setQrNotice(data.message || "Instância apagada com sucesso! O WhatsApp foi desconectado.");
        void checkStatus();
        if (tenant) void fetchData(tenant, true);
      } else {
        setQrError(true);
        setQrNotice(data.message || data.error || "Falha ao apagar instância.");
      }
    } catch {
      setQrError(true);
      setQrNotice("Falha de conexão ao apagar instância.");
    } finally {
      setDeletingQr(false);
    }
  }

  // Countdown for QR Code expiration (60s)
  useEffect(() => {
    if (qrState !== "connecting" || !qrCode || qrExpiresIn <= 0) return;
    const timer = setInterval(() => {
      setQrExpiresIn(prev => {
        if (prev <= 1) {
          setQrNotice("O QR Code expirou. Clique em 'Renovar QR Code' para gerar um novo código.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [qrState, qrCode, qrExpiresIn]);

  // Poll status while connecting or on WhatsApp tab (without fetchData in deps so interval is never reset)
  useEffect(() => {
    if (!authenticated || !instanceName) return;
    const pollMs = qrState === "connecting" ? 2000 : 8000;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/crm/whatsapp/status?instance=${encodeURIComponent(instanceName)}&tenantId=${encodeURIComponent(tenant)}&slot=${selectedWhatsappSlot}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const s = await res.json();
          if (Array.isArray(s.whatsappSlots)) {
            setWhatsappSlots(s.whatsappSlots);
          }
          if (s.qrScanned) {
            setQrScanned(true);
          }
          if (s.connected || s.state === "open") {
            setQrScanned(true);
            setQrValidating(true);
            setQrState("open");
            setQrCode(null);
            setQrError(false);
            setQrExpiresIn(0);
            setQrValidating(false);
            if (s.phoneNumber) setConnectedPhone(s.phoneNumber);
            if (s.profileName) setConnectedProfile(s.profileName);
            if (qrState === "connecting") {
              setQrNotice("WhatsApp Conectado com Sucesso! Conexão confirmada pela Evolution API e pronta para uso.");
              if (tenant) void fetchData(tenant, true);
            }
          } else if (qrState === "open" && s.state === "close") {
            // Automatic disconnection detection without F5
            setQrState("disconnected");
            setQrScanned(false);
            setConnectedPhone(null);
            setConnectedProfile(null);
            setQrNotice("O WhatsApp foi desconectado. Gere um novo QR Code para reconectar.");
          }
        }
      } catch {}
    }, pollMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, qrState, instanceName, tenant]);

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSavingAi(true);
    setAiNotice("");
    try {
      const finalLabel = agentLabel.trim() || "Assistente Virtual";
      const res = await fetch("/api/crm/operator/ai-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          agentLabel: finalLabel,
          instructions,
          storeInfo,
          enabled: aiEnabled
        })
      });
      if (!res.ok) throw new Error();
      setAgentLabel(finalLabel);
      isAiDirtyRef.current = false;
      setAiNotice("Configurações salvas com sucesso! Sua IA já está respondendo no WhatsApp com os novos dados.");
    } catch {
      setAiNotice("Falha ao salvar configurações da IA.");
    } finally {
      setSavingAi(false);
    }
  };

  const handleSaveOperatingHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSavingHours(true);
    setHoursNotice("");
    setHoursError("");
    try {
      const activeDays = Object.entries(operatingHours.schedule || {})
        .filter(([, cfg]) => cfg.enabled)
        .map(([day]) => day);

      const payloadHours = {
        ...operatingHours,
        days: activeDays,
      };

      const res = await fetch("/api/crm/operator/ai-settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          operatingHours: payloadHours
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setHoursError(errJson.message || errJson.error || "Falha ao salvar horários de atendimento no banco de dados.");
        return;
      }
      isHoursDirtyRef.current = false;
      setOperatingHours(payloadHours);
      setHoursNotice("Horários de atendimento salvos com sucesso no Supabase! A IA respeitará rigorosamente esta configuração.");
      setTimeout(() => setHoursNotice(""), 8000);
    } catch {
      setHoursError("Falha de comunicação ao salvar horários de atendimento.");
    } finally {
      setSavingHours(false);
    }
  };

  const handleSendSimulator = async (textToSend?: string) => {
    const prompt = (textToSend || simInput).trim();
    if (!prompt || !tenant || simLoading) return;
    setSimInput("");
    const userMsg = {
      role: "user" as const,
      content: prompt,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    };
    const nextHistory = [...simMessages, userMsg];
    setSimMessages(nextHistory);
    setSimLoading(true);

    try {
      const res = await fetch("/api/crm/operator/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          message: prompt,
          history: nextHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        setSimMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            time: data.timestamp || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            latency: data.latencyMs,
            isEscalation: data.isEscalation,
            escalationReason: data.escalationReason,
            escalationCategory: data.escalationCategory
          }
        ]);
      } else {
        setSimMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "Não foi possível simular a resposta no momento. Confira se você preencheu o cardápio e regras da loja na aba 'Minha IA'.",
            time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      }
    } catch {
      setSimMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Falha na comunicação com o simulador.",
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setSimLoading(false);
    }
  };

  const applyPreset = (preset: typeof INDUSTRY_PRESETS[0]) => {
    isAiDirtyRef.current = true;
    setAgentLabel(preset.agentName);
    setInstructions(preset.instructions);
    setStoreInfo(preset.storeInfo);
    setAiNotice(`Modelo "${preset.label}" aplicado! Ajuste os preços e horários conforme sua loja e clique em Salvar.`);
  };

  async function registerContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setContactNotice("");
    try {
      const res = await fetch("/api/crm/operator/contacts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, name: contactName, phone: contactPhone })
      });
      const json = await res.json() as { created: boolean; error?: string };
      if (!res.ok) throw Error(json.error === "phone_invalid" ? "Telefone inválido (use DDD + número)." : "Falha ao registrar contato.");
      setContactName("");
      setContactPhone("");
      setNewContactOpen(false);
      setContactNotice("Contato registrado com sucesso!");
      await fetchData(tenant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar contato.");
    } finally {
      setLoading(false);
    }
  }

  // Resolve Urgency status
  async function resolveUrgency(conversationId: string) {
    try {
      const res = await fetch("/api/crm/operator/handoff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId, action: "resolve_urgency" })
      });
      if (!res.ok) throw new Error("Falha ao resolver urgência.");
      setHandoffNotice("Status de urgência resolvido! O atendimento permanece com você ou pode ser devolvido para a IA quando desejar.");
      await fetchData(tenant);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao resolver urgência.");
    }
  }

  // Send real human message via Evolution API
  async function handleSendHumanMessage() {
    const text = humanInput.trim();
    if (!text || !tenant || !current || sendingHumanMsg) return;
    setSendingHumanMsg(true);
    try {
      const res = await fetch("/api/crm/operator/send", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId: current.id, message: text })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.details || json.error || "Falha ao enviar mensagem.");
      setHumanInput("");
      await fetchData(tenant, true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao enviar mensagem pelo WhatsApp.");
    } finally {
      setSendingHumanMsg(false);
    }
  }

  // Set Funnel Status
  async function handleSetFunnelStatus(conversationId: string, status: string) {
    try {
      const res = await fetch("/api/crm/operator/handoff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId, action: "set_status", status })
      });
      if (!res.ok) throw new Error("Falha ao atualizar etapa do funil.");
      await fetchData(tenant, true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar etapa.");
    }
  }

  function openUpgradeRequest(targetPlan = "CRM Business", reason = "") {
    setUpgradeModal({ open: true, targetPlan, reason });
  }

  async function handleSubmitUpgradeRequest(targetPlanId: string, note: string) {
    try {
      const res = await fetch("/api/crm/operator/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, action: "request_upgrade", targetPlanId: commercialPlanId(targetPlanId), note })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: json.message || "Falha ao registrar solicitação." };
      return { ok: true, message: json.message };
    } catch {
      return { ok: false, message: "Erro de comunicação ao solicitar upgrade." };
    }
  }

  async function handleSaveQuickReply(shortcut: string, title: string, body: string) {
    const res = await fetch("/api/crm/operator/features", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant, action: "save_quick_reply", shortcut, title, body })
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.quickReplies)) {
      setQuickReplies(json.quickReplies);
    } else if (!res.ok) {
      alert(json.message || "Não foi possível salvar a resposta rápida.");
    }
  }

  async function handleDeleteQuickReply(id: string) {
    const res = await fetch("/api/crm/operator/features", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant, action: "delete_quick_reply", replyId: id })
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.quickReplies)) {
      setQuickReplies(json.quickReplies);
    }
  }

  async function handleSetConversationPriority(conversationId: string, priority: "low" | "normal" | "high" | "urgent") {
    if (!canUseFeature("conversation_priority")) {
      requestFeatureAccess("conversation_priority", "crm-business", "Classificar prioridade de atendimento");
      return;
    }
    try {
      const res = await fetch("/api/crm/operator/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, action: "set_priority", conversationId, priority })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.message || "Falha ao alterar prioridade.");
        return;
      }
      await fetchData(tenant, true);
    } catch {
      alert("Erro ao atualizar prioridade da conversa.");
    }
  }

  async function handleSubmitSatisfactionSurvey(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !tenant) return;
    if (!canUseFeature("satisfaction_survey")) {
      requestFeatureAccess("satisfaction_survey", "crm-business", "Ativar Pesquisa de Satisfação (1 a 5 estrelas)");
      return;
    }
    setSavingSurvey(true);
    try {
      const res = await fetch("/api/crm/operator/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant,
          action: "submit_satisfaction",
          conversationId: current.id,
          contactId: current.contact_id,
          rating: surveyRating,
          comment: surveyComment
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.message || "Não foi possível registrar a avaliação.");
        return;
      }
      setSurveyOpen(false);
      setSurveyComment("");
      await fetchData(tenant, true);
      void fetchReports(tenant);
    } finally {
      setSavingSurvey(false);
    }
  }

  async function handleCreateCustomTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim() || !tenant) return;
    if (!canUseFeature("commercial_tags")) {
      requestFeatureAccess("commercial_tags", "crm-business", "Criar e gerenciar Etiquetas Comerciais");
      return;
    }
    try {
      const res = await fetch("/api/crm/operator/tags", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, action: "create", name: newTagName.trim(), color: newTagColor })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.message || "Erro ao criar etiqueta.");
        return;
      }
      setNewTagName("");
      setNewTagOpen(false);
      await fetchData(tenant, true);
    } catch {
      alert("Erro ao criar etiqueta comercial.");
    }
  }

  async function handleAddOperator(name: string, email: string, role: string) {
    try {
      const res = await fetch("/api/crm/operator/features", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, action: "add_operator", name, email, role })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: json.message || "Falha ao adicionar operador." };
      if (Array.isArray(json.teamOperators)) setTeamOperators(json.teamOperators);
      void fetchReports(tenant);
      return { ok: true };
    } catch {
      return { ok: false, message: "Erro ao adicionar operador." };
    }
  }

  async function handleRevokeOperator(operatorId: string) {
    if (!window.confirm("Deseja realmente revogar o acesso deste operador ao CRM da loja?")) return;
    const res = await fetch("/api/crm/operator/features", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant, action: "revoke_operator", operatorId })
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.teamOperators)) {
      setTeamOperators(json.teamOperators);
      void fetchReports(tenant);
    }
  }

  // Set Commercial Tag on Contact
  async function handleSetCommercialTag(contactId: string, tagId: string) {
    if (!canUseFeature("commercial_tags")) {
      openUpgradeRequest("CRM Business", "Utilizar Etiquetas Comerciais nas conversas");
      return;
    }
    try {
      if (!tagId) {
        const existing = data?.contactTags?.find(ct => ct.contact_id === contactId);
        if (existing) {
          const res = await fetch("/api/crm/operator/tags", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: tenant, contactId, tagId: existing.tag_id, action: "remove" })
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            alert(errJson.message || "Erro ao atualizar etiqueta comercial.");
            return;
          }
        }
      } else {
        const res = await fetch("/api/crm/operator/tags", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: tenant, contactId, tagId, action: "set" })
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          alert(errJson.message || "Erro ao atualizar etiqueta comercial.");
          return;
        }
      }
      await fetchData(tenant, true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar etiqueta comercial.");
    }
  }

  // Generate AI Store Knowledge from Wizard
  function handleGenerateFromWizard() {
    const sName = wizardData.storeName.trim() || currentTenantObj?.name || "Nossa Loja";
    const toneDescription = wizardData.tone === "formal"
      ? "Mantenha uma postura formal, educada, elegante e muito profissional."
      : wizardData.tone === "direto"
      ? "Seja muito objetivo, rápido, direto ao ponto e eficiente, sem enrolação."
      : "Seja muito amigável, acolhedor, empático e prestativo, usando emojis leves com bom senso.";

    const customPrompt = `Você é o assistente virtual oficial da loja "${sName}" no WhatsApp.
${toneDescription}
Responda em mensagens curtas e objetivas (1 a 3 frases).
Nunca invente preços, promoções ou informações que não constam nas regras oficiais da loja.
${wizardData.humanHandoffRules ? `\nQuando transferir para atendimento humano:\n${wizardData.humanHandoffRules}\n` : ""}`;

    const storeInfoCompiled = `### SOBRE O NEGÓCIO
Loja: ${sName}
${wizardData.address.trim() ? `Endereço / Localização: ${wizardData.address.trim()}` : ""}

### PRODUTOS, SERVIÇOS & VALORES
${wizardData.productsPrices.trim() || "Consulte os preços e opções diretamente com nossa equipe."}

### HORÁRIOS, REGRAS DE ENTREGA & PAGAMENTO
${wizardData.hoursDelivery.trim() || "Horário de atendimento comercial padrão."}

### DÚVIDAS FREQUENTES (FAQ)
${wizardData.faqs.trim() || "Tire dúvidas rápidas diretamente por aqui."}`;

    isAiDirtyRef.current = true;
    setAgentLabel(`Assistente Virtual - ${sName}`);
    setInstructions(customPrompt);
    setStoreInfo(storeInfoCompiled);
    setWizardOpen(false);
    setAiNotice("✨ Rascunho profissional gerado pelo Assistente! Revise os campos abaixo e clique em 'Salvar Configurações da Minha IA'.");
  }

  // Toggle Human Handoff (Take over or Return to AI)
  async function toggleConversationMode(conversationId: string, targetMode: "ai" | "human") {
    if (targetMode === "ai") {
      const ok = window.confirm("Deseja realmente devolver este atendimento para a Inteligência Artificial? A IA voltará a responder automaticamente as novas mensagens deste cliente.");
      if (!ok) return;
    }
    setClaiming(true);
    setHandoffNotice("");
    try {
      const res = await fetch("/api/crm/operator/handoff", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId, mode: targetMode })
      });
      const json = await res.json() as { claimed?: boolean; mode?: string; summary?: string; error?: string };
      if (!res.ok) throw Error(json.error || "Falha ao alterar modo de atendimento.");

      if (targetMode === "human") {
        setHandoffNotice(json.summary || "Atendimento assumido pelo atendente humano! A IA pausou as respostas nesta conversa.");
      } else {
        setHandoffNotice("Conversa devolvida para a NovaesWeb IA! Ela continuará atendendo automaticamente.");
      }
      await fetchData(tenant);
    } catch (e) {
      setHandoffNotice(e instanceof Error ? e.message : "Falha na transição de atendimento.");
    } finally {
      setClaiming(false);
    }
  }

  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const conversations = useMemo(() => data?.conversations ?? [], [data]);
  const messages = data?.messages ?? [];
  const byContact = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

  // Helper to determine effective operational funnel stage
  const getEffectiveStage = useCallback((c: Conversation): "novo" | "ai" | "waiting_human" | "human" | "waiting_client" | "closed" => {
    if (c.status === "closed") return "closed";
    if (c.status === "urgent" || c.status === "waiting_human") return "waiting_human";
    if (c.status === "waiting_client") return "waiting_client";
    if (c.status === "human" || c.mode === "human") return "human";
    if (c.status === "novo") return "novo";
    return "ai";
  }, []);

  // Tag maps
  const contactTagMap = useMemo(() => {
    const map = new Map<string, string>();
    if (data?.contactTags) {
      for (const ct of data.contactTags) {
        map.set(ct.contact_id, ct.tag_id);
      }
    }
    return map;
  }, [data?.contactTags]);

  const tagMap = useMemo(() => {
    const map = new Map<string, TagItem>();
    if (data?.tags) {
      for (const t of data.tags) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [data?.tags]);

  // Counts per funnel stage
  const funnelCounts = useMemo(() => {
    const counts = { all: conversations.length, novo: 0, ai: 0, waiting_human: 0, human: 0, waiting_client: 0, closed: 0 };
    for (const c of conversations) {
      const stage = getEffectiveStage(c);
      counts[stage] = (counts[stage] || 0) + 1;
    }
    return counts;
  }, [conversations, getEffectiveStage]);

  const urgentCount = funnelCounts.waiting_human;

  // Filtered conversations by search, funnel stage, commercial tag, and priority
  const filtered = useMemo(() => conversations.filter(c => {
    const contact = byContact.get(c.contact_id);
    const matchesSearch = (contact?.phone + " " + (contact?.display_name ?? "")).toLowerCase().includes(search.toLowerCase());

    const stage = getEffectiveStage(c);
    const matchesFunnel = funnelFilter === "all" || stage === funnelFilter;

    const contactTagId = contact ? contactTagMap.get(contact.id) : undefined;
    const matchesTag = tagFilter === "all" || contactTagId === tagFilter;

    const prio = c.priority || (stage === "waiting_human" ? "urgent" : "normal");
    const matchesPriority = priorityFilter === "all" || prio === priorityFilter;

    return matchesSearch && matchesFunnel && matchesTag && matchesPriority;
  }), [conversations, byContact, search, funnelFilter, tagFilter, priorityFilter, contactTagMap, getEffectiveStage]);

  // List of pending human requests for the Bell Notification Dropdown
  const pendingHumanList = useMemo(() => {
    return conversations.filter(c => c.status === "urgent" || c.status === "waiting_human");
  }, [conversations]);

  const current = filtered.find(c => c.id === selected) ?? filtered[0] ?? null;
  const thread = current ? messages.filter(m => m.conversation_id === current.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : [];

  // Quota percentage
  const quotaPercent = Math.min(100, Math.round(((quotaData.quotaUsed || 0) / (quotaData.quotaLimit || 200)) * 100));

  const tabFeatures: Partial<Record<Tab,string>> = {whatsapp:"ai_chat",conhecimento:"ai_chat",artigos:"ai_chat",simulador:"simulator",horarios:"business_hours_basic",atendimentos:"human_handoff",contatos:"human_handoff",equipe:"human_handoff",relatorios:"basic_indicators"};
  const activeFeatureState = tabFeatures[activeTab] ? featureStates[tabFeatures[activeTab]!] : undefined;
  const activeFeatureBlocked = activeTab !== "plano" && (isSuspended || !activeFeatureState || activeFeatureState.state !== "allowed");
  const Content = embedded ? "section" : "main";
  const WorkspaceHeading = embedded ? "h2" : "h1";
  const workspaceSections: Array<{ id: Tab; label: string }> = [
    { id: "atendimentos", label: "Atendimentos" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "conhecimento", label: "IA e conhecimento" },
    { id: "artigos", label: "Base de conhecimento" },
    { id: "simulador", label: "Simulador" },
    { id: "horarios", label: "Horários" },
    { id: "equipe", label: "Equipe" },
    { id: "relatorios", label: "Relatórios" },
    { id: "contatos", label: "Contatos" },
    { id: "plano", label: "Plano" }
  ];

  return (
    <div className={embedded ? styles.workspace : "nw-layout-shell"}>
      {checking ? (
        <section className="op-card op-centered" style={{margin: "120px auto", maxWidth: "420px", textAlign: "center"}}>
          <RefreshCw size={36} className="spin" style={{margin: "0 auto 14px", color: "#ec4899"}}/>
          <h1 style={{fontSize: "20px"}}>Verificando acesso seguro...</h1>
        </section>
      ) : !authenticated && embedded ? (
        <section className="op-card" role="alert" style={{padding: "24px"}}>
          {error || "Não foi possível acessar o CRM NovaesWeb. Entre novamente no painel Master."}
        </section>
      ) : !authenticated ? (
        <main className="op-card op-login" style={{maxWidth: "460px", margin: "50px auto"}}>
          <img
            src="/novaes-crm-logo.jpg"
            alt="Novaes CRM IA"
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "20px",
              objectFit: "cover",
              margin: "0 auto 16px",
              display: "block",
              border: "1px solid rgba(236, 72, 153, 0.4)",
              boxShadow: "0 0 25px rgba(236, 72, 153, 0.4)"
            }}
          />
          <h1 style={{fontSize: "26px", margin: "0 0 4px", textAlign: "center", fontWeight: 800}}>
            Novaes <span style={{background: "linear-gradient(90deg, #ec4899, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"}}>CRM IA</span>
          </h1>
          <p style={{textAlign: "center", color: "#c084fc", fontSize: "12px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", margin: "0 0 18px"}}>
            CRM Inteligente da NovaesWeb
          </p>
          <p style={{textAlign: "center", color: "#aba8bf", fontSize: "13px", lineHeight: "1.5", margin: "0 0 24px"}}>
            Acesse para acompanhar suas conversas no WhatsApp, monitorar o funil e gerenciar sua IA em tempo real.
          </p>
          <form onSubmit={e => void signIn(e)} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
            <label style={{fontSize: "13px", color: "#d1c8e6"}}>
              E-mail de Acesso
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@suaempresa.com"
                style={{width: "100%", padding: "12px 14px", marginTop: "6px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
              />
            </label>
            <label style={{fontSize: "13px", color: "#d1c8e6"}}>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{width: "100%", padding: "12px 14px", marginTop: "6px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
              />
            </label>
            <button className="op-primary" disabled={loading || !email || !password} style={{padding: "14px", borderRadius: "10px", marginTop: "8px", fontWeight: 700}}>
              {loading ? "Autenticando..." : "Entrar no Painel da Loja"}
            </button>
          </form>
          {error && <p className="op-alert" role="alert" style={{marginTop: "16px"}}><CircleAlert size={16}/>{error}</p>}
          <div className="op-notice" style={{marginTop: "20px", display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", fontSize: "13px", color: "#9ca3af"}}>
            <ShieldCheck size={18} color="#00db8c"/> Ambiente individual e 100% seguro da sua loja.
          </div>
        </main>
      ) : (
        <>
          {/* O Master já fornece a navegação e a sessão globais. */}
          {!embedded && <aside className="nw-sidebar">
            <div className="nw-sidebar-brand" style={{display: "flex", alignItems: "center", gap: "12px"}}>
              <img
                src="/novaes-crm-logo.jpg"
                alt="Novaes CRM IA"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  objectFit: "cover",
                  border: "1px solid rgba(236, 72, 153, 0.4)",
                  boxShadow: "0 0 15px rgba(236, 72, 153, 0.3)"
                }}
              />
              <div>
                <strong style={{display: "block", fontSize: "16px", color: "#fff", letterSpacing: "-0.3px", fontWeight: 800}}>
                  Novaes <span style={{background: "linear-gradient(90deg, #ec4899, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"}}>CRM IA</span>
                </strong>
                <small style={{display: "block", fontSize: "10px", color: "#c084fc", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase"}}>
                  CRM Inteligente
                </small>
              </div>
            </div>

            {/* Seletor de Loja (se houver mais de uma) */}
            {data && data.tenants.length > 1 && (
              <div style={{padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)"}}>
                <label style={{fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                  Empresa Ativa
                </label>
                <select
                  value={tenant}
                  onChange={e => void changeTenant(e.target.value)}
                  style={{width: "100%", padding: "8px 10px", borderRadius: "8px", background: "#1b172a", border: "1px solid #3c3254", color: "#fff", fontSize: "13px"}}
                >
                  {data.tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Navegação Principal */}
            <nav className="nw-sidebar-nav">
              <button
                type="button"
                className={`nw-nav-button ${activeTab === "whatsapp" ? "active" : ""}`}
                onClick={() => setActiveTab("whatsapp")}
              >
                <Smartphone size={19}/>
                <span>Conectar WhatsApp</span>
                <span style={{marginLeft: "auto", fontSize: "10px", fontWeight: 800, background: "rgba(255,255,255,0.12)", padding: "2px 6px", borderRadius: "8px"}}>
                  {data?.plan?.maxWhatsappConnections ?? 1}/5
                </span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "conhecimento" ? "active" : ""}`}
                onClick={() => setActiveTab("conhecimento")}
              >
                <Bot size={19}/>
                <span>Minha IA (O que ela fala)</span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "simulador" ? "active" : ""}`}
                onClick={() => setActiveTab("simulador")}
              >
                <Play size={19}/>
                <span>Chat de Teste (Simulador)</span>
                <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#ec4899", padding: "2px 6px", borderRadius: "6px", fontSize: "10px", fontWeight: 800}}>
                  TESTAR
                </span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "horarios" ? "active" : ""}`}
                onClick={() => setActiveTab("horarios")}
              >
                <Clock size={19}/>
                <span>Horários de Atendimento</span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "atendimentos" ? "active" : ""}`}
                onClick={() => setActiveTab("atendimentos")}
              >
                <Inbox size={19}/>
                <span>Atendimentos ao Vivo</span>
                {conversations.length > 0 && (
                  <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                    {conversations.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "equipe" ? "active" : ""}`}
                onClick={() => setActiveTab("equipe")}
              >
                <UserPlus size={19}/>
                <span>Equipe & Operadores</span>
                <span style={{marginLeft: "auto", background: "rgba(139,92,246,0.22)", color: "#d8b4fe", padding: "2px 7px", borderRadius: "8px", fontSize: "10px", fontWeight: 800}}>
                  {teamOperators.filter(o => o.status === "active").length}/{data?.plan?.maxOperators ?? 1}
                </span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "relatorios" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("relatorios");
                  if (tenant) void fetchReports(tenant);
                }}
              >
                <BarChart3 size={19}/>
                <span>Indicadores & Relatórios</span>
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "contatos" ? "active" : ""}`}
                onClick={() => setActiveTab("contatos")}
              >
                <Users size={19}/>
                <span>Contatos da Loja</span>
                {contacts.length > 0 && (
                  <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
                    {contacts.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`nw-nav-button ${activeTab === "plano" ? "active" : ""}`}
                onClick={() => setActiveTab("plano")}
              >
                <CreditCard size={19}/>
                <span>Meu Plano</span>
                {data?.plan?.isTrial ? (
                  <span style={{marginLeft: "auto", background: "linear-gradient(90deg, #ec4899, #8b5cf6)", color: "#fff", padding: "2px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: 800}}>
                    7 DIAS
                  </span>
                ) : (
                  <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#f472b6", padding: "2px 6px", borderRadius: "6px", fontSize: "10px", fontWeight: 700}}>
                    {data?.plan?.name?.replace("CRM ", "") || "PLANO"}
                  </span>
                )}
              </button>

              <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

              <Link
                href="/cliente/knowledge"
                className="nw-nav-button"
                style={{textDecoration: "none"}}
              >
                <BookOpen size={19}/>
                <span>Base de Conhecimento</span>
                <ChevronRight size={14} style={{marginLeft: "auto", opacity: 0.6}}/>
              </Link>
            </nav>

            {/* Rodapé do Menu Lateral */}
            <div className="nw-sidebar-footer">
              {/* Medidor de Franquia Visual */}
              <div
                onClick={() => setActiveTab("plano")}
                style={{
                  background: data?.plan?.isTrial ? "rgba(236, 72, 153, 0.08)" : "rgba(255, 255, 255, 0.03)",
                  border: data?.plan?.isTrial ? "1px solid rgba(236, 72, 153, 0.35)" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px"}}>
                  <span style={{color: data?.plan?.isTrial ? "#f472b6" : "#c9bede", fontWeight: 700}}>
                    {data?.plan?.isTrial ? "🎁 Teste Grátis (7d)" : "Franquia do Mês"}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    color: quotaPercent > 90 ? "#f43f5e" : quotaPercent > 70 ? "#f59e0b" : "#00db8c"
                  }}>
                    {quotaData.quotaUsed} / {quotaData.quotaLimit}
                  </span>
                </div>
                {/* Barra de Progresso */}
                <div style={{width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden"}}>
                  <div style={{
                    width: `${quotaPercent}%`,
                    height: "100%",
                    background: quotaPercent > 90
                      ? "#f43f5e"
                      : quotaPercent > 70
                        ? "#f59e0b"
                        : "linear-gradient(90deg, #ec4899, #8b5cf6)",
                    transition: "width 0.4s ease"
                  }}/>
                </div>
                <small style={{display: "block", color: data?.plan?.isTrial ? "#c4b5fd" : "#8e87a2", fontSize: "10px", marginTop: "6px", fontWeight: data?.plan?.isTrial ? 600 : 400}}>
                  {data?.plan?.isTrial
                    ? `${data.plan.trialDaysLeft !== undefined ? `${data.plan.trialDaysLeft} dias restantes` : "7 dias de avaliação"} · Clique p/ detalhes`
                    : "Renovação mensal automática"}
                </small>
              </div>

              {/* Botão Sair */}
              <button
                type="button"
                onClick={() => void signOut()}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e2e8f0",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <LogOut size={16}/> Sair do Painel
              </button>
            </div>
          </aside>}

          {embedded && (
            <nav className={styles.sections} aria-label="Seções do CRM NovaesWeb">
              {workspaceSections.map(section => (
                <button
                  key={section.id}
                  type="button"
                  className={`op-tab-button ${activeTab === section.id ? "active" : ""}`}
                  aria-current={activeTab === section.id ? "page" : undefined}
                  onClick={() => {
                    setActiveTab(section.id);
                    if (section.id === "relatorios" && tenant) void fetchReports(tenant);
                  }}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          )}
          {/* CONTEÚDO PRINCIPAL (MAIN CONTENT) */}
          <Content className={embedded ? styles.content : "nw-main-content"}>
            {activeTab !== "plano" && activeFeatureBlocked && <FeatureUnavailable feature={isSuspended && activeFeatureState ? {...activeFeatureState,state:"suspended"} : activeFeatureState} onUpgrade={openUpgradeRequest}/>}
            <fieldset disabled={activeFeatureBlocked} style={{border:0,padding:0,margin:0,minWidth:0}}>
            {/* Topbar com Nome da Loja */}
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px", flexWrap: "wrap", gap: "12px", position: "relative"}}>
              <div>
                <WorkspaceHeading style={{fontSize: embedded ? "20px" : "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px"}}>
                  {currentTenantObj ? currentTenantObj.name : embedded ? "CRM NovaesWeb" : "Painel da Loja"}
                </WorkspaceHeading>
                <p style={{color: "#aba8bf", margin: "4px 0 0", fontSize: "14px"}}>
                  Atendimento inteligente com <strong>NovaesWeb IA</strong> · Totalmente personalizado para o seu negócio.
                </p>
              </div>
              <div style={{display: "flex", gap: "10px", alignItems: "center", position: "relative"}}>
                {/* Botão de Som de Notificação */}
                <button
                  type="button"
                  onClick={() => {
                    if (!canUseFeature("sound_notifications")) {
                      requestFeatureAccess("sound_notifications", "crm-business", "Ativar notificações sonoras");
                      return;
                    }
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) playNotificationSound();
                  }}
                  className="op-refresh"
                  title={
                    !canUseFeature("sound_notifications")
                      ? "Notificações sonoras (Recurso CRM Business / Premium)"
                      : soundEnabled ? "Som de notificação ativado (clique para silenciar)" : "Som de notificação silenciado (clique para ativar)"
                  }
                  style={{
                    padding: "8px 12px",
                    background: soundEnabled ? "rgba(236,72,153,0.15)" : undefined,
                    borderColor: soundEnabled ? "#ec4899" : undefined,
                    color: soundEnabled ? "#ec4899" : "#aba8bf",
                    opacity: !canUseFeature("sound_notifications") ? 0.6 : 1
                  }}
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>

                {/* Sino de Notificações com Badge e Dropdown */}
                <div style={{position: "relative"}}>
                  <button
                    type="button"
                    onClick={() => setBellOpen(v => !v)}
                    className="op-refresh"
                    style={{position: "relative", padding: "8px 12px", background: pendingHumanList.length > 0 ? "rgba(239, 68, 68, 0.2)" : undefined, borderColor: pendingHumanList.length > 0 ? "#ef4444" : undefined, color: pendingHumanList.length > 0 ? "#fca5a5" : "#aba8bf"}}
                    title="Notificações de atendimento humano pendente"
                  >
                    <Bell size={16} />
                    {pendingHumanList.length > 0 && (
                      <span style={{
                        position: "absolute",
                        top: "-5px",
                        right: "-5px",
                        background: "#ef4444",
                        color: "#fff",
                        borderRadius: "10px",
                        padding: "1px 6px",
                        fontSize: "10px",
                        fontWeight: 800
                      }}>
                        {pendingHumanList.length}
                      </span>
                    )}
                  </button>

                  {/* Dropdown de Notificações Inteligentes */}
                  {bellOpen && (
                    <div style={{
                      position: "absolute",
                      right: 0,
                      top: "42px",
                      width: "350px",
                      background: "#181427",
                      border: "1px solid #443c5e",
                      borderRadius: "14px",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                      zIndex: 100,
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #372f4d", paddingBottom: "8px"}}>
                        <strong style={{fontSize: "13px", color: "#fff", display: "flex", alignItems: "center", gap: "6px"}}>
                          <Bell size={14} color="#ec4899"/> Clientes Aguardando Humano ({pendingHumanList.length})
                        </strong>
                        <button type="button" onClick={() => setBellOpen(false)} style={{background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "14px"}}>✕</button>
                      </div>

                      <div style={{maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px"}}>
                        {pendingHumanList.length === 0 ? (
                          <div style={{padding: "16px", textAlign: "center", fontSize: "12px", color: "#8e87a2"}}>
                            Nenhum cliente aguardando atendimento humano no momento.
                          </div>
                        ) : (
                          pendingHumanList.map(c => {
                            const contact = byContact.get(c.contact_id);
                            const escalation = data?.escalations?.[c.id];
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelected(c.id);
                                  setActiveTab("atendimentos");
                                  setBellOpen(false);
                                }}
                                style={{
                                  textAlign: "left",
                                  padding: "10px 12px",
                                  borderRadius: "8px",
                                  background: "rgba(239, 68, 68, 0.1)",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  cursor: "pointer",
                                  color: "#fff",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "3px"
                                }}
                              >
                                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                                  <strong style={{fontSize: "13px", color: "#fca5a5"}}>
                                    {contact?.display_name || contact?.phone || "Cliente"}
                                  </strong>
                                  <small style={{fontSize: "10px", color: "#9ca3af"}}>{dateTime(c.last_message_at)}</small>
                                </div>
                                <span style={{fontSize: "11px", color: "#e2e8f0"}}>
                                  {escalation?.reason ? `🚨 Motivo: ${escalation.reason}` : "🚨 Solicitou atendente humano"}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: qrState === "open" ? "rgba(0, 219, 140, 0.15)" : "rgba(244, 63, 94, 0.15)",
                  color: qrState === "open" ? "#00db8c" : "#f43f5e",
                  border: `1px solid ${qrState === "open" ? "rgba(0, 219, 140, 0.4)" : "rgba(244, 63, 94, 0.4)"}`
                }}>
                  <span style={{width: "8px", height: "8px", borderRadius: "50%", background: qrState === "open" ? "#00db8c" : "#f43f5e"}}/>
                  {qrState === "open" ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
                </span>

                <button className="op-refresh" onClick={() => void fetchData(tenant)} disabled={loading}>
                  <RefreshCw size={15}/> Atualizar
                </button>
              </div>
            </div>

            {/* ALERTA DE BLOQUEIO / SUSPENSÃO POR MENSALIDADE OU ADMINISTRATIVO */}
            {isSuspended && (
              <section className="op-card" style={{
                background: "linear-gradient(135deg, rgba(80, 16, 28, 0.95), rgba(40, 10, 18, 0.95))",
                border: "2px solid #f43f5e",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 10px 40px rgba(244, 63, 94, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px"
              }}>
                <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                  <ShieldAlert size={36} color="#f43f5e"/>
                  <div>
                    <h2 style={{margin: 0, color: "#fff", fontSize: "20px", fontWeight: 800}}>
                      {suspensionReason === "payment_overdue"
                        ? "Mensalidade do Plano Pendente — Respostas Automáticas em Pausa"
                        : suspensionReason === "trial_expired" || suspensionReason === "trial_quota_exhausted"
                        ? "Período de Teste Grátis Encerrado — Dados 100% Preservados"
                        : "Acesso Administrativo Temporariamente Pausado"}
                    </h2>
                    <p style={{margin: "4px 0 0", color: "#ffccd5", fontSize: "14px"}}>
                      {data?.publicSuspensionReason || data?.plan?.publicSuspensionReason || (
                        suspensionReason === "payment_overdue"
                          ? "A data de vencimento da mensalidade expirou. Regularize seu pagamento para que a IA continue respondendo no WhatsApp."
                          : "Entre em contato com o suporte NovaesWeb ou solicite um plano comercial para reativação imediata."
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openUpgradeRequest("CRM Business", "Reativar conta / Contratar plano comercial")}
                  className="op-primary"
                  style={{padding: "10px 18px", borderRadius: "10px", fontWeight: 800, fontSize: "13px"}}
                >
                  Solicitar Liberação / Upgrade
                </button>
              </section>
            )}

            {/* BANNER INFORMATIVO: TESTE GRÁTIS DE 7 DIAS */}
            {data?.plan?.isTrial && !isSuspended && (
              <section
                style={{
                  background: (data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 1)
                    ? "linear-gradient(135deg, rgba(120, 20, 40, 0.85), rgba(40, 10, 20, 0.85))"
                    : (data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 3)
                      ? "linear-gradient(135deg, rgba(110, 50, 15, 0.85), rgba(40, 20, 10, 0.85))"
                      : "linear-gradient(135deg, rgba(60, 20, 90, 0.75), rgba(25, 10, 45, 0.85))",
                  border: `1px solid ${(data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 1) ? "#f43f5e" : (data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 3) ? "#f59e0b" : "rgba(236, 72, 153, 0.45)"}`,
                  borderRadius: "16px",
                  padding: "16px 20px",
                  marginBottom: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "14px",
                  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)"
                }}
              >
                <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                  <div style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}>
                    <Sparkles size={22} color={data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 1 ? "#f43f5e" : "#ec4899"} />
                  </div>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                      <h3 style={{margin: 0, fontSize: "16px", fontWeight: 800, color: "#ffffff"}}>
                        {data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 0
                          ? "Teste Grátis Encerrado"
                          : data.plan.trialDaysLeft === 1
                            ? "Último dia de Teste Grátis!"
                            : `Avaliação Gratuita — ${data.plan.trialDaysLeft ?? 7} dias restantes`}
                      </h3>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 800,
                        background: "rgba(236, 72, 153, 0.25)",
                        color: "#f472b6"
                      }}>
                        {quotaData.quotaUsed} / {quotaData.quotaLimit} atendimentos
                      </span>
                    </div>
                    <p style={{margin: "4px 0 0", fontSize: "13px", color: "rgba(226, 232, 240, 0.85)"}}>
                      {data.plan.trialDaysLeft !== undefined && data.plan.trialDaysLeft <= 0
                        ? "Escolha um dos planos comerciais para reativar os atendimentos da IA. Seus dados estão seguros."
                        : "Aproveite todos os recursos do CRM Business durante o teste. Sem fidelidade e sem cobrança automática."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("plano")}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 4px 14px rgba(236, 72, 153, 0.35)",
                    whiteSpace: "nowrap"
                  }}
                >
                  <CreditCard size={15} /> Ver Planos & Upgrade
                </button>
              </section>
            )}

            {/* BANNER GLOBAL DE NOVA SOLICITAÇÃO DE ATENDIMENTO HUMANO */}
            {pendingHumanList.length > 0 && (
              <section
                style={{
                  background: "linear-gradient(135deg, rgba(185, 28, 28, 0.92), rgba(88, 12, 24, 0.95))",
                  border: "2px solid #ef4444",
                  borderRadius: "14px",
                  padding: "14px 20px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                  boxShadow: "0 8px 25px rgba(239, 68, 68, 0.35)"
                }}
              >
                <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.15)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0
                  }}>
                    <Bell size={20} color="#fff" />
                  </div>
                  <div>
                    <strong style={{color: "#fff", fontSize: "15px", display: "block"}}>
                      🚨 Nova solicitação de atendimento humano ({pendingHumanList.length})
                    </strong>
                    <span style={{color: "#fecaca", fontSize: "13px"}}>
                      Um cliente solicitou atendimento. Clique para abrir a conversa.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const firstPending = pendingHumanList[0];
                    if (firstPending) {
                      setSelected(firstPending.id);
                      setReadTimestamps(prev => ({ ...prev, [firstPending.id]: Date.now() }));
                    }
                    setActiveTab("atendimentos");
                    setMobileChatOpen(true);
                  }}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.4)",
                    background: "#fff",
                    color: "#991b1b",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  Abrir Conversa Agora
                </button>
              </section>
            )}

            {/* SEÇÃO 1: CONECTAR WHATSAPP (5 ESPAÇOS) */}
            {activeTab === "whatsapp" && (
              <>
                {whatsappSlots.length > 0 && (
                  <WhatsappFiveSlotsGrid
                    slots={whatsappSlots}
                    selectedSlot={selectedWhatsappSlot}
                    maxConnections={data?.plan?.maxWhatsappConnections ?? 0}
                    blockedState={isSuspended ? {...featureStates.ai_chat,state:"suspended"} : featureStates.ai_chat}
                    onSelectSlot={slotItem => {
                      if (!slotItem.unlocked || !canUseFeature("ai_chat")) return;
                      setSelectedWhatsappSlot(slotItem.slot);
                      setQrCode(null);
                      setQrError(false);
                      setQrNotice("");
                      setQrState(slotItem.status === "connected" ? "open" : "disconnected");
                      setConnectedPhone(slotItem.phoneNumber ?? null);
                      setConnectedProfile(slotItem.profileName ?? null);
                    }}
                    onRequestUpgrade={(targetPlan, reason) => openUpgradeRequest(targetPlan, reason)}
                  />
                )}
                <section style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "22px"}}>
                <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "14px", flexWrap: "wrap", gap: "10px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                        <Smartphone size={24} color="#fff"/>
                      </div>
                      <div>
                        <h2 style={{margin: 0, fontSize: "18px", color: "#fff"}}>
                          Conexão Oficial — Espaço #{selectedWhatsappSlot}
                        </h2>
                        <small style={{color: "#aba8bf"}}>Instância selecionada: <code>{instanceName}</code></small>
                      </div>
                    </div>
                    <span style={{
                      padding: "5px 12px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 800,
                      background: qrState === "open" ? "rgba(0, 219, 140, 0.16)" : qrState === "connecting" ? "rgba(139, 92, 246, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      color: qrState === "open" ? "#00db8c" : qrState === "connecting" ? "#c4b5fd" : "#9ca3af",
                      border: `1px solid ${qrState === "open" ? "#00db8c" : qrState === "connecting" ? "#8b5cf6" : "#4b5563"}`
                    }}>
                      {qrState === "open" ? "● Sessão Ativa" : qrState === "connecting" ? "◐ Aguardando Leitura" : "○ Desconectado"}
                    </span>
                  </div>

                  {/* Card de Número Conectado quando Ativo */}
                  {qrState === "open" && (
                    <div style={{
                      padding: "16px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, rgba(0, 219, 140, 0.14), rgba(6, 78, 59, 0.25))",
                      border: "1px solid rgba(0, 219, 140, 0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}>
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                        <CheckCircle2 size={28} color="#00db8c" />
                        <div>
                          <strong style={{color: "#fff", fontSize: "15px", display: "block"}}>
                            WhatsApp Conectado e Pronto para Uso
                          </strong>
                          <span style={{color: "#a7f3d0", fontSize: "13px"}}>
                            {connectedPhone ? `Número conectado: +${connectedPhone}` : "Sessão confirmada pela Evolution API"}
                            {connectedProfile ? ` · Perfil: ${connectedProfile}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p style={{color: "#c2bed4", fontSize: "14px", lineHeight: "1.5", margin: 0}}>
                    Conecte o número de WhatsApp do estabelecimento para receber conversas ao vivo no painel e ativar o atendimento inteligente. O progresso é atualizado automaticamente em tempo real.
                  </p>

                  <div style={{display: "flex", gap: "10px", flexWrap: "wrap"}}>
                    <button
                      type="button"
                      className="op-primary"
                      disabled={qrLoading || !canUseFeature("ai_chat") || !whatsappSlots.some(s=>s.slot===selectedWhatsappSlot && s.unlocked)}
                      onClick={() => void handleConnectWhatsApp()}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700}}
                    >
                      <QrCode size={18}/>
                      {qrLoading
                        ? "Preparando..."
                        : qrState === "open"
                          ? "Verificar / Reconectar Sessão"
                          : qrCode && qrExpiresIn === 0
                            ? "Renovar QR Code Expirado"
                            : qrCode
                              ? "Renovar QR Code"
                              : "Gerar QR Code de Conexão"}
                    </button>

                    <button
                      type="button"
                      className="op-refresh"
                      disabled={deletingQr || !canUseFeature("ai_chat")}
                      onClick={() => void handleDeleteInstance()}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", background: "#2e1218", color: "#ff859a", borderColor: "#f43f5e"}}
                      title="Apagar instância e desconectar número"
                    >
                      <Trash2 size={16}/> {deletingQr ? "Desconectando..." : "Desconectar / Apagar Sessão"}
                    </button>
                  </div>

                  {qrNotice && (
                    <div style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: qrError
                        ? "rgba(244, 63, 94, 0.18)"
                        : qrState === "open"
                          ? "rgba(0, 219, 140, 0.15)"
                          : "rgba(139, 92, 246, 0.15)",
                      border: `1px solid ${qrError ? "#f43f5e" : qrState === "open" ? "#00db8c" : "#8b5cf6"}`,
                      color: "#fff",
                      fontSize: "13px",
                      lineHeight: "1.5"
                    }}>
                      {qrNotice}
                    </div>
                  )}

                  {qrCode && qrState !== "open" && (
                    <div style={{textAlign: "center", padding: "20px", background: "#fff", borderRadius: "16px", margin: "6px auto", maxWidth: "280px", position: "relative"}}>
                      <img
                        src={qrCode}
                        alt="QR Code WhatsApp"
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                          opacity: qrExpiresIn === 0 ? 0.25 : 1,
                          filter: qrExpiresIn === 0 ? "grayscale(1)" : "none"
                        }}
                      />
                      {qrExpiresIn === 0 ? (
                        <div style={{marginTop: "10px"}}>
                          <span style={{color: "#dc2626", fontSize: "12px", fontWeight: 800, display: "block", marginBottom: "8px"}}>
                            QR Code expirado
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleConnectWhatsApp()}
                            style={{padding: "8px 14px", borderRadius: "8px", background: "#ec4899", color: "#fff", border: "none", fontWeight: 700, fontSize: "12px", cursor: "pointer"}}
                          >
                            Renovar QR Code
                          </button>
                        </div>
                      ) : (
                        <span style={{color: "#111", fontSize: "12px", fontWeight: 700, display: "block", marginTop: "10px"}}>
                          Aponte a câmera do seu WhatsApp ({qrExpiresIn}s)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Passo a Passo Visual de 5 Etapas Reais */}
                <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "14px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                      <CheckCircle2 size={22} color={qrState === "open" ? "#00db8c" : "#8b5cf6"}/>
                      <h2 style={{margin: 0, fontSize: "18px", color: "#fff"}}>Progresso da Conexão em Tempo Real</h2>
                    </div>
                  </div>

                  {(() => {
                    // Determine authentic step statuses based strictly on real Evolution API states:
                    // "pending" (Cinza), "active" (Azul/Roxo), "done" (Verde), "error" (Vermelho)
                    type StepStatus = "pending" | "active" | "done" | "error";
                    const step1: StepStatus = qrError && !qrCode && qrState !== "open"
                      ? "error"
                      : qrLoading
                        ? "active"
                        : (qrCode || qrState === "open")
                          ? "done"
                          : "pending";

                    const step2: StepStatus = qrState === "open" || qrScanned
                      ? "done"
                      : qrCode
                        ? (qrExpiresIn === 0 ? "error" : "active")
                        : "pending";

                    const step3: StepStatus = qrState === "open"
                      ? "done"
                      : qrScanned
                        ? "active"
                        : "pending";

                    const step4: StepStatus = qrState === "open"
                      ? "done"
                      : (qrValidating || qrScanned)
                        ? "active"
                        : "pending";

                    const step5: StepStatus = qrState === "open"
                      ? "done"
                      : "pending";

                    const steps = [
                      {
                        num: 1,
                        title: "Etapa 1 — Preparando conexão",
                        desc: "Status: aguardando inicialização da instância.",
                        st: step1
                      },
                      {
                        num: 2,
                        title: "Etapa 2 — QR Code gerado",
                        desc: "Status: aguardando leitura pelo WhatsApp.",
                        st: step2
                      },
                      {
                        num: 3,
                        title: "Etapa 3 — QR Code escaneado",
                        desc: "Status: aguardando confirmação da conexão.",
                        st: step3
                      },
                      {
                        num: 4,
                        title: "Etapa 4 — Validando sessão",
                        desc: "Status: verificando se a Evolution API confirmou a conexão.",
                        st: step4
                      },
                      {
                        num: 5,
                        title: "Etapa 5 — WhatsApp conectado",
                        desc: "Status: conexão confirmada e pronta para uso.",
                        st: step5
                      }
                    ];

                    const getColors = (st: StepStatus) => {
                      if (st === "done") return { bg: "rgba(0, 219, 140, 0.14)", border: "#00db8c", badgeBg: "#00db8c", badgeColor: "#002b1b", text: "#d1fae5", label: "Concluída" };
                      if (st === "active") return { bg: "rgba(139, 92, 246, 0.18)", border: "#8b5cf6", badgeBg: "#8b5cf6", badgeColor: "#ffffff", text: "#ddd6fe", label: "Em andamento" };
                      if (st === "error") return { bg: "rgba(239, 68, 68, 0.16)", border: "#ef4444", badgeBg: "#ef4444", badgeColor: "#ffffff", text: "#fecaca", label: "Erro / Expirado" };
                      return { bg: "rgba(107, 114, 128, 0.1)", border: "#374151", badgeBg: "#374151", badgeColor: "#9ca3af", text: "#9ca3af", label: "Não iniciada" };
                    };

                    return (
                      <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
                        {steps.map(s => {
                          const c = getColors(s.st);
                          return (
                            <div
                              key={s.num}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: c.bg,
                                border: `1px solid ${c.border}`,
                                transition: "all 0.25s ease"
                              }}
                            >
                              <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                                <span style={{
                                  background: c.badgeBg,
                                  color: c.badgeColor,
                                  borderRadius: "50%",
                                  minWidth: "28px",
                                  height: "28px",
                                  display: "grid",
                                  placeItems: "center",
                                  fontWeight: 800,
                                  fontSize: "12px",
                                  flexShrink: 0
                                }}>
                                  {s.st === "done" ? "✓" : s.st === "error" ? "!" : s.num}
                                </span>
                                <div>
                                  <strong style={{color: "#fff", fontSize: "14px", display: "block"}}>{s.title}</strong>
                                  <small style={{color: c.text, fontSize: "12px"}}>{s.desc}</small>
                                </div>
                              </div>
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "rgba(0,0,0,0.3)",
                                color: c.text,
                                whiteSpace: "nowrap"
                              }}>
                                {c.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </section>
              </>
            )}

            {/* SEÇÃO 2: CONFIGURAR MINHA IA */}
            {activeTab === "conhecimento" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "22px"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "16px", flexWrap: "wrap", gap: "12px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                    <div style={{width: "48px", height: "48px", borderRadius: "14px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Sparkles size={26} color="#fff"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "20px", color: "#fff"}}>Configurar Minha IA: O que ela vai falar e responder</h2>
                      <small style={{color: "#c2bed4"}}>Você define o nome, a simpatia, os preços e todas as regras do atendimento.</small>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="op-primary"
                    onClick={() => {
                      setWizardData({
                        storeName: currentTenantObj?.name || "",
                        productsPrices: "",
                        hoursDelivery: "",
                        address: "",
                        faqs: "",
                        humanHandoffRules: "",
                        tone: "amigavel"
                      });
                      setWizardStep(1);
                      setWizardOpen(true);
                    }}
                    style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "10px", fontWeight: 700, fontSize: "13px"}}
                  >
                    <Wand2 size={16}/> Assistente Guiado Passo a Passo
                  </button>
                </div>

                {/* MODAL / CARD DO ASSISTENTE GUIADO PASSO A PASSO */}
                {wizardOpen && (
                  <div style={{
                    background: "linear-gradient(135deg, rgba(30, 20, 50, 0.98), rgba(20, 15, 35, 0.98))",
                    border: "2px solid #ec4899",
                    borderRadius: "16px",
                    padding: "24px",
                    boxShadow: "0 10px 40px rgba(236, 72, 153, 0.25)",
                    position: "relative"
                  }}>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #443c5e", paddingBottom: "14px", marginBottom: "18px"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                        <div style={{width: "36px", height: "36px", borderRadius: "10px", background: "var(--grad-primary)", display: "grid", placeItems: "center"}}>
                          <Wand2 size={20} color="#fff"/>
                        </div>
                        <div>
                          <h3 style={{margin: 0, fontSize: "17px", color: "#fff"}}>Assistente Guiado: Passo {wizardStep} de 5</h3>
                          <small style={{color: "#aba8bf"}}>Responda perguntas simples para que a NovaesWeb IA crie o rascunho de atendimento da sua empresa.</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWizardOpen(false)}
                        style={{background: "none", border: "none", color: "#aba8bf", cursor: "pointer", fontSize: "18px", padding: "4px"}}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Passo 1: Nome da Loja e Tom */}
                    {wizardStep === 1 && (
                      <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                        <div>
                          <label style={{fontSize: "14px", color: "#fff", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                            1. Qual é o nome oficial do seu negócio ou loja?
                          </label>
                          <p style={{margin: "0 0 8px", fontSize: "13px", color: "#aba8bf"}}>
                            A IA utilizará este nome para se apresentar em todas as mensagens no WhatsApp.
                          </p>
                          <input
                            type="text"
                            value={wizardData.storeName}
                            onChange={e => setWizardData(prev => ({ ...prev, storeName: e.target.value }))}
                            placeholder="Ex.: Bella Pizza Express"
                            style={{width: "100%", padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px"}}
                          />
                        </div>

                        <div>
                          <label style={{fontSize: "14px", color: "#fff", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                            Qual o tom e personalidade do atendimento?
                          </label>
                          <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px"}}>
                            {[
                              { id: "amigavel", label: "😊 Amigável e Acolhedor", desc: "Usa emojis leves e tom simpático" },
                              { id: "formal", label: "👔 Formal e Corporativo", desc: "Educado, refinado e sem gírias" },
                              { id: "direto", label: "⚡ Ágil e Direto", desc: "Objetivo e focado em respostas rápidas" }
                            ].map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setWizardData(prev => ({ ...prev, tone: t.id }))}
                                style={{
                                  padding: "12px",
                                  borderRadius: "10px",
                                  border: "1px solid",
                                  borderColor: wizardData.tone === t.id ? "#ec4899" : "#3d345c",
                                  background: wizardData.tone === t.id ? "rgba(236, 72, 153, 0.2)" : "#141124",
                                  color: "#fff",
                                  textAlign: "left",
                                  cursor: "pointer"
                                }}
                              >
                                <strong style={{fontSize: "13px", display: "block"}}>{t.label}</strong>
                                <small style={{fontSize: "11px", color: "#9ca3af"}}>{t.desc}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Passo 2: Produtos, Serviços e Preços */}
                    {wizardStep === 2 && (
                      <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                        <label style={{fontSize: "14px", color: "#fff", fontWeight: 700}}>
                          2. Quais são seus principais produtos ou serviços e seus preços?
                        </label>
                        <p style={{margin: 0, fontSize: "13px", color: "#aba8bf"}}>
                          Coloque de forma simples o que você oferece e quanto custa. A IA consultará esta lista para responder dúvidas de cardápio e valores.
                        </p>
                        <textarea
                          rows={6}
                          value={wizardData.productsPrices}
                          onChange={e => setWizardData(prev => ({ ...prev, productsPrices: e.target.value }))}
                          placeholder="Ex.:
- Pizza Calabresa Grande: R$ 49,90 | Média: R$ 39,90
- Pizza 4 Queijos Grande: R$ 54,90
- Coca-Cola 2L: R$ 12,00
- Borda de Catupiry ou Cheddar: R$ 8,00"
                          style={{padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px", lineHeight: "1.5"}}
                        />
                      </div>
                    )}

                    {/* Passo 3: Horários e Endereço */}
                    {wizardStep === 3 && (
                      <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                        <div>
                          <label style={{fontSize: "14px", color: "#fff", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                            3. Quais são os dias e horários de funcionamento?
                          </label>
                          <input
                            type="text"
                            value={wizardData.hoursDelivery}
                            onChange={e => setWizardData(prev => ({ ...prev, hoursDelivery: e.target.value }))}
                            placeholder="Ex.: Terça a Domingo, das 18h00 às 23h30 (Segunda-feira fechado)"
                            style={{width: "100%", padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px"}}
                          />
                        </div>

                        <div>
                          <label style={{fontSize: "14px", color: "#fff", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                            Qual é o endereço físico da loja (se houver retirada)?
                          </label>
                          <input
                            type="text"
                            value={wizardData.address}
                            onChange={e => setWizardData(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="Ex.: Av. Principal, 1500 - Centro (Próximo à Praça Central)"
                            style={{width: "100%", padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px"}}
                          />
                        </div>
                      </div>
                    )}

                    {/* Passo 4: FAQ (Perguntas Frequentes) */}
                    {wizardStep === 4 && (
                      <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                        <label style={{fontSize: "14px", color: "#fff", fontWeight: 700}}>
                          4. Quais são as perguntas mais frequentes (FAQ) que seus clientes fazem?
                        </label>
                        <p style={{margin: 0, fontSize: "13px", color: "#aba8bf"}}>
                          Regras de frete/entrega, formas de pagamento aceitas (Pix, cartão, dinheiro) e dúvidas recorrentes.
                        </p>
                        <textarea
                          rows={6}
                          value={wizardData.faqs}
                          onChange={e => setWizardData(prev => ({ ...prev, faqs: e.target.value }))}
                          placeholder="Ex.:
- Quanto tempo demora a entrega? Leva de 40 a 55 minutos.
- Qual a taxa de entrega? R$ 5,00 para o Centro e R$ 8,00 para bairros vizinhos.
- Quais formas de pagamento? Aceitamos Pix (chave: financeiro@bellapizza.com), Cartão e Dinheiro na entrega."
                          style={{padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px", lineHeight: "1.5"}}
                        />
                      </div>
                    )}

                    {/* Passo 5: Regras de Transferência Humana */}
                    {wizardStep === 5 && (
                      <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                        <label style={{fontSize: "14px", color: "#fff", fontWeight: 700}}>
                          5. Em quais situações a IA deverá chamar um atendente humano?
                        </label>
                        <p style={{margin: 0, fontSize: "13px", color: "#aba8bf"}}>
                          Especifique quando você quer ser notificado para intervir na conversa (além de reclamações e cancelamentos que já são automáticos).
                        </p>
                        <textarea
                          rows={5}
                          value={wizardData.humanHandoffRules}
                          onChange={e => setWizardData(prev => ({ ...prev, humanHandoffRules: e.target.value }))}
                          placeholder="Ex.: Quando o cliente solicitar orçamentos para eventos e festas grandes, pedir para falar com a gerência, solicitar parcerias ou pedir personalizações fora do cardápio."
                          style={{padding: "12px 14px", borderRadius: "10px", background: "#121222", border: "1px solid #443c5e", color: "#fff", fontSize: "14px", lineHeight: "1.5"}}
                        />
                      </div>
                    )}

                    {/* Controles de Navegação do Wizard */}
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", borderTop: "1px solid #372f4d", paddingTop: "16px"}}>
                      <button
                        type="button"
                        disabled={wizardStep === 1}
                        onClick={() => setWizardStep(s => Math.max(1, s - 1))}
                        className="op-refresh"
                        style={{opacity: wizardStep === 1 ? 0.4 : 1}}
                      >
                        Voltar
                      </button>

                      <div style={{display: "flex", gap: "8px"}}>
                        {[1, 2, 3, 4, 5].map(step => (
                          <span
                            key={step}
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: wizardStep === step ? "#ec4899" : "#443c5e"
                            }}
                          />
                        ))}
                      </div>

                      {wizardStep < 5 ? (
                        <button
                          type="button"
                          onClick={() => setWizardStep(s => Math.min(5, s + 1))}
                          className="op-primary"
                          style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "10px", fontWeight: 700}}
                        >
                          Próximo <ArrowRight size={14}/>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleGenerateFromWizard}
                          className="op-primary"
                          style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", fontWeight: 700, background: "var(--grad-primary)"}}
                        >
                          <Check size={16}/> Gerar Rascunho da IA
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Modelos Prontos por Nicho */}
                <div>
                  <label style={{fontSize: "13px", fontWeight: 700, color: "#ec4899", display: "block", marginBottom: "8px"}}>
                    Modelos Prontos (Clique para preencher automaticamente com exemplos reais):
                  </label>
                  <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                    {INDUSTRY_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="preset-badge"
                        onClick={() => applyPreset(p)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {aiNotice && (
                  <div style={{padding: "14px 18px", borderRadius: "12px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", display: "flex", alignItems: "center", gap: "10px"}}>
                    <CheckCircle2 size={20} color="#00db8c" style={{flexShrink: 0}}/>
                    <span style={{fontSize: "14px"}}>{aiNotice}</span>
                  </div>
                )}

                <form onSubmit={handleSaveAiSettings} style={{display: "flex", flexDirection: "column", gap: "18px"}}>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px"}}>
                    <div>
                      <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                        Nome da sua Assistente Virtual
                      </label>
                      <input
                        style={{width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "14px"}}
                        value={agentLabel}
                        onChange={e => { isAiDirtyRef.current = true; setAgentLabel(e.target.value); }}
                        placeholder="Ex.: Bia - Atendente da Bella Pizza"
                      />
                    </div>

                    <div style={{display: "flex", alignItems: "center", gap: "12px", marginTop: "24px"}}>
                      <label style={{display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "#fff", background: "rgba(236, 72, 153, 0.1)", border: "1px solid rgba(236, 72, 153, 0.3)", padding: "10px 16px", borderRadius: "10px"}}>
                        <input
                          type="checkbox"
                          checked={aiEnabled}
                          onChange={e => setAiEnabled(e.target.checked)}
                          style={{width: "20px", height: "20px", accentColor: "#ec4899"}}
                        />
                        <strong>Respostas automáticas da IA ativadas no WhatsApp</strong>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                      Como a IA deve se comportar (Tom de voz, simpatia e regras)
                    </label>
                    <textarea
                      style={{width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", minHeight: "95px", fontSize: "14px", lineHeight: "1.5"}}
                      value={instructions}
                      onChange={e => { isAiDirtyRef.current = true; setInstructions(e.target.value); }}
                      placeholder="Ex.: Você é a atendente virtual da Bella Pizza no WhatsApp. Responda com simpatia, use emojis leves, ajude o cliente a escolher a pizza e incentive o pedido. Seja rápida e clara."
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "#d1c8e6", display: "block", marginBottom: "6px", fontWeight: 600}}>
                      Cardápio, Preços, Horários e Informações da sua Loja (A base de respostas da IA)
                    </label>
                    <textarea
                      style={{width: "100%", padding: "14px", borderRadius: "10px", border: "1px solid #443c5e", background: "#121222", color: "white", minHeight: "220px", fontSize: "14px", lineHeight: "1.6", fontFamily: "monospace"}}
                      value={storeInfo}
                      onChange={e => { isAiDirtyRef.current = true; setStoreInfo(e.target.value); }}
                      placeholder="Ex.: 
🍕 CARDÁPIO:
- Pizza Calabresa: R$ 49,90
- Pizza 4 Queijos: R$ 54,90
- Pizza Frango com Catupiry: R$ 52,90
- Refrigerante 2L: R$ 12,00

🕒 HORÁRIO DE ATENDIMENTO:
- Terça a Domingo, das 18h às 23h30

🛵 ENTREGA E PAGAMENTO:
- Taxa de entrega no Centro: R$ 5,00
- Formas de pagamento: Pix (chave: pix@bellapizza.com), Cartão de Crédito e Débito."
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="op-primary"
                      disabled={savingAi || !canUseFeature("ai_chat")}
                      style={{display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 28px", fontWeight: 700, fontSize: "15px", borderRadius: "12px"}}
                    >
                      <Save size={18}/> {savingAi ? "Salvando e atualizando IA..." : "Salvar Configurações da Minha IA"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SEÇÃO NOVO: CHAT DE TESTE (SIMULADOR) */}
            {activeTab === "simulador" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "18px", minHeight: "600px"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "14px", flexWrap: "wrap", gap: "10px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Play size={22} color="white"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "19px", color: "white"}}>Chat de Teste · Simulador da NovaesWeb IA</h2>
                      <small style={{color: "#c2bed4"}}>Simule em tempo real como a IA da sua loja conversa com os clientes sem gastar WhatsApp.</small>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => setSimMessages([{
                      role: "assistant",
                      content: "Chat de teste reiniciado. O que você gostaria de perguntar?",
                      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                    }])}
                    style={{fontSize: "12px", padding: "6px 12px"}}
                  >
                    <Trash size={14}/> Limpar Conversa
                  </button>
                </div>

                {/* Perguntas Rápidas */}
                <div>
                  <span style={{fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "6px", fontWeight: 600}}>
                    Clique para testar perguntas comuns de clientes:
                  </span>
                  <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Quanto custa a pizza grande e quais os sabores?")}
                    >
                      🍕 Quanto custa a pizza grande?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Qual é o horário de atendimento de vocês hoje?")}
                    >
                      🕒 Qual o horário de atendimento?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Vocês fazem entrega no Centro e aceitam Pix?")}
                    >
                      🛵 Entrega no Centro e aceita Pix?
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      onClick={() => void handleSendSimulator("Quero falar com um atendente humano agora")}
                    >
                      👤 Quero falar com um humano
                    </button>
                    <button
                      type="button"
                      className="preset-badge"
                      style={{borderColor: "rgba(239, 68, 68, 0.5)", color: "#fca5a5"}}
                      onClick={() => void handleSendSimulator("Meu pedido está 2 horas atrasado, absurdo, quero cancelamento imediato!")}
                    >
                      🚨 Reclamação: Pedido atrasado / Cancelar
                    </button>
                  </div>
                </div>

                {/* Balões de Conversa do Simulador */}
                <div style={{
                  flex: 1,
                  minHeight: "340px",
                  maxHeight: "440px",
                  overflowY: "auto",
                  padding: "16px",
                  background: "#141022",
                  borderRadius: "14px",
                  border: "1px solid #332b49",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  {simMessages.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        maxWidth: "75%",
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        padding: "12px 16px",
                        borderRadius: "14px",
                        background: m.role === "user" ? "var(--grad-primary)" : m.isEscalation ? "linear-gradient(135deg, #2b141e, #1a0f18)" : "#221c38",
                        border: "1px solid",
                        borderColor: m.role === "user" ? "#ec4899" : m.isEscalation ? "#ef4444" : "#443963",
                        color: "white"
                      }}
                    >
                      {m.isEscalation && (
                        <div style={{
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid #ef4444",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          marginBottom: "8px",
                          fontSize: "11px",
                          color: "#fca5a5",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}>
                          <ShieldAlert size={14} color="#ef4444" />
                          <span>🚨 INSATISFAÇÃO DETECTADA: {m.escalationReason || "Urgente"} → Transferido para Humano</span>
                        </div>
                      )}
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "10px"}}>
                        <strong style={{fontSize: "11px", color: m.role === "user" ? "#fef08a" : m.isEscalation ? "#f87171" : "#ec4899"}}>
                          {m.role === "user" ? "Você (Cliente)" : m.isEscalation ? "🚨 Resposta de Acolhimento & Transição" : "🤖 NovaesWeb IA"}
                        </strong>
                        {m.latency && (
                          <span style={{fontSize: "10px", background: "rgba(0,0,0,0.3)", padding: "1px 6px", borderRadius: "6px", color: "#a78bfa"}}>
                            ⚡ {m.latency}ms
                          </span>
                        )}
                      </div>
                      <p style={{margin: 0, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>{m.content}</p>
                      <small style={{display: "block", fontSize: "10px", color: "rgba(255,255,255,0.5)", textAlign: "right", marginTop: "4px"}}>
                        {m.time}
                      </small>
                    </div>
                  ))}
                  {simLoading && (
                    <div style={{alignSelf: "flex-start", padding: "10px 14px", borderRadius: "12px", background: "#221c38", color: "#ec4899", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px"}}>
                      <RefreshCw size={14} className="spin"/>
                      <span>NovaesWeb IA digitando...</span>
                    </div>
                  )}
                </div>

                {/* Input de Envio do Simulador */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    void handleSendSimulator();
                  }}
                  style={{display: "flex", gap: "10px"}}
                >
                  <input
                    type="text"
                    placeholder="Digite uma mensagem como se você fosse seu cliente no WhatsApp..."
                    value={simInput}
                    onChange={e => setSimInput(e.target.value)}
                    disabled={simLoading}
                    style={{
                      flex: 1,
                      padding: "14px 16px",
                      borderRadius: "12px",
                      background: "#161325",
                      border: "1px solid #3d345c",
                      color: "white",
                      fontSize: "14px"
                    }}
                  />
                  <button
                    type="submit"
                    className="op-primary"
                    disabled={simLoading || !simInput.trim()}
                    style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 22px", borderRadius: "12px", fontWeight: 700}}
                  >
                    <Send size={16}/> Enviar
                  </button>
                </form>
              </section>
            )}

            {/* SEÇÃO NOVO: HORÁRIOS DE ATENDIMENTO */}
            {activeTab === "horarios" && (
              <section className="op-card" style={{display: "flex", flexDirection: "column", gap: "20px"}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "14px", flexWrap: "wrap", gap: "12px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <Clock size={22} color="white"/>
                    </div>
                    <div>
                      <h2 style={{margin: 0, fontSize: "19px", color: "white"}}>Horários de Atendimento da IA</h2>
                      <small style={{color: "#c2bed4"}}>Configure livremente os dias, horários de início e término, intervalos e mensagem de ausência.</small>
                    </div>
                  </div>
                  <span style={{
                    padding: "6px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 800,
                    background: operatingHours.enabled ? "rgba(0, 219, 140, 0.16)" : "rgba(59, 130, 246, 0.16)",
                    color: operatingHours.enabled ? "#00db8c" : "#93c5fd",
                    border: `1px solid ${operatingHours.enabled ? "#00db8c" : "#3b82f6"}`
                  }}>
                    {operatingHours.enabled ? "🕒 Controle de Horário Ativo" : "🌐 IA Atendendo 24h (Sem Restrição de Horário)"}
                  </span>
                </div>

                {hoursNotice && (
                  <div style={{padding: "14px 18px", borderRadius: "12px", background: "rgba(10, 46, 32, 0.85)", border: "1px solid #00db8c", color: "#b6f5dd", display: "flex", alignItems: "center", gap: "10px"}}>
                    <CheckCircle2 size={20} color="#00db8c" style={{flexShrink: 0}}/>
                    <span style={{fontSize: "14px", fontWeight: 600}}>{hoursNotice}</span>
                  </div>
                )}

                {hoursError && (
                  <div style={{padding: "14px 18px", borderRadius: "12px", background: "rgba(88, 16, 28, 0.85)", border: "1px solid #f43f5e", color: "#fecdd3", display: "flex", alignItems: "center", gap: "10px"}}>
                    <CircleAlert size={20} color="#f43f5e" style={{flexShrink: 0}}/>
                    <span style={{fontSize: "14px", fontWeight: 600}}>{hoursError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveOperatingHours} style={{display: "flex", flexDirection: "column", gap: "20px"}}>
                  {/* Switch Ativar/Desativar + Fuso Horário */}
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "12px", background: operatingHours.enabled ? "rgba(236, 72, 153, 0.12)" : "rgba(255,255,255,0.03)", padding: "14px 18px", borderRadius: "12px", border: `1px solid ${operatingHours.enabled ? "#ec4899" : "#3a3250"}`}}>
                      <input
                        type="checkbox"
                        id="opt-hours-toggle"
                        checked={operatingHours.enabled}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, enabled: e.target.checked }));
                        }}
                        style={{width: "20px", height: "20px", accentColor: "#ec4899", cursor: "pointer"}}
                      />
                      <label htmlFor="opt-hours-toggle" style={{cursor: "pointer", fontSize: "14px", color: "white", fontWeight: 700, lineHeight: "1.4"}}>
                        Ativar controle de horário da IA
                        <small style={{display: "block", fontSize: "12px", color: "#aba8bf", fontWeight: 400, marginTop: "2px"}}>
                          Quando desligado, a IA atende a qualquer hora (desde que ativa). Quando ligado, respeita os dias e horários abaixo.
                        </small>
                      </label>
                    </div>

                    <div style={{background: "rgba(255,255,255,0.03)", padding: "14px 18px", borderRadius: "12px", border: "1px solid #3a3250"}}>
                      <label style={{fontSize: "13px", color: "#c2bed4", fontWeight: 700, display: "block", marginBottom: "6px"}}>
                        Fuso Horário do Estabelecimento:
                      </label>
                      <select
                        value={operatingHours.timezone || "America/Sao_Paulo"}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, timezone: e.target.value }));
                        }}
                        style={{width: "100%", padding: "10px 12px", borderRadius: "10px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "13px"}}
                      >
                        <option value="America/Sao_Paulo">Horário de Brasília (America/Sao_Paulo - GMT-3)</option>
                        <option value="America/Manaus">Horário do Amazonas (America/Manaus - GMT-4)</option>
                        <option value="America/Cuiaba">Horário de Mato Grosso (America/Cuiaba - GMT-4)</option>
                        <option value="America/Rio_Branco">Horário do Acre (America/Rio_Branco - GMT-5)</option>
                        <option value="America/Noronha">Fernando de Noronha (America/Noronha - GMT-2)</option>
                      </select>
                    </div>
                  </div>

                  {/* Atalho Rápido de Horário Padrão */}
                  <div style={{background: "rgba(255,255,255,0.02)", padding: "14px 18px", borderRadius: "12px", border: "1px solid #332b49", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                      <span style={{fontSize: "13px", color: "#c2bed4", fontWeight: 700}}>Horário padrão rápido:</span>
                      <input
                        type="time"
                        value={operatingHours.openTime}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, openTime: e.target.value }));
                        }}
                        style={{padding: "8px 10px", borderRadius: "8px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "13px"}}
                      />
                      <span style={{color: "#aba8bf", fontSize: "13px"}}>até</span>
                      <input
                        type="time"
                        value={operatingHours.closeTime}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, closeTime: e.target.value }));
                        }}
                        style={{padding: "8px 10px", borderRadius: "8px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "13px"}}
                      />
                    </div>
                    <button
                      type="button"
                      className="op-refresh"
                      onClick={() => {
                        isHoursDirtyRef.current = true;
                        setOperatingHours(prev => {
                          const nextSched = { ...prev.schedule };
                          for (const k of ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]) {
                            nextSched[k] = {
                              ...(nextSched[k] || DEFAULT_DAY_SCHEDULE[k]),
                              openTime: prev.openTime,
                              closeTime: prev.closeTime
                            };
                          }
                          return { ...prev, schedule: nextSched };
                        });
                      }}
                      style={{fontSize: "12px", padding: "8px 14px"}}
                    >
                      Aplicar início/fim a todos os dias
                    </button>
                  </div>

                  {/* Configuração Individual por Dia da Semana */}
                  <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
                    <label style={{fontSize: "14px", color: "#fff", fontWeight: 700}}>
                      Horários por Dia da Semana (configure início, término e intervalos opcionais):
                    </label>
                    {[
                      { id: "seg", label: "Segunda-feira" },
                      { id: "ter", label: "Terça-feira" },
                      { id: "qua", label: "Quarta-feira" },
                      { id: "qui", label: "Quinta-feira" },
                      { id: "sex", label: "Sexta-feira" },
                      { id: "sab", label: "Sábado" },
                      { id: "dom", label: "Domingo" }
                    ].map(d => {
                      const dayCfg = operatingHours.schedule?.[d.id] || {
                        enabled: operatingHours.days?.includes(d.id) ?? false,
                        openTime: operatingHours.openTime || "08:00",
                        closeTime: operatingHours.closeTime || "18:00",
                        hasBreak: false,
                        breakStart: "12:00",
                        breakEnd: "13:00"
                      };
                      const updateDay = (patch: Partial<DayScheduleCfg>) => {
                        isHoursDirtyRef.current = true;
                        setOperatingHours(prev => {
                          const nextSched = {
                            ...(prev.schedule || DEFAULT_DAY_SCHEDULE),
                            [d.id]: { ...dayCfg, ...patch }
                          };
                          const nextDays = Object.entries(nextSched)
                            .filter(([, v]) => v.enabled)
                            .map(([k]) => k);
                          return { ...prev, schedule: nextSched, days: nextDays };
                        });
                      };
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "12px",
                            padding: "12px 16px",
                            borderRadius: "12px",
                            background: dayCfg.enabled ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.2)",
                            border: `1px solid ${dayCfg.enabled ? "#443c5e" : "#262138"}`
                          }}
                        >
                          <div style={{display: "flex", alignItems: "center", gap: "10px", minWidth: "160px"}}>
                            <input
                              type="checkbox"
                              checked={dayCfg.enabled}
                              onChange={e => updateDay({ enabled: e.target.checked })}
                              style={{width: "18px", height: "18px", accentColor: "#ec4899", cursor: "pointer"}}
                            />
                            <strong style={{color: dayCfg.enabled ? "#fff" : "#6b7280", fontSize: "14px"}}>
                              {d.label}
                            </strong>
                            <span style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontWeight: 700,
                              background: dayCfg.enabled ? "rgba(0, 219, 140, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: dayCfg.enabled ? "#00db8c" : "#f87171"
                            }}>
                              {dayCfg.enabled ? "Atende" : "Fechado"}
                            </span>
                          </div>

                          {dayCfg.enabled ? (
                            <div style={{display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap"}}>
                              <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                                <small style={{color: "#aba8bf", fontSize: "12px"}}>Início:</small>
                                <input
                                  type="time"
                                  value={dayCfg.openTime}
                                  onChange={e => updateDay({ openTime: e.target.value })}
                                  style={{padding: "7px 10px", borderRadius: "8px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "13px"}}
                                />
                                <small style={{color: "#aba8bf", fontSize: "12px"}}>Término:</small>
                                <input
                                  type="time"
                                  value={dayCfg.closeTime}
                                  onChange={e => updateDay({ closeTime: e.target.value })}
                                  style={{padding: "7px 10px", borderRadius: "8px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "13px"}}
                                />
                              </div>

                              <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                                {featureStates.business_hours?.state !== "locked_by_plan" && !canUseFeature("business_hours") ? (<FeatureUnavailable feature={featureStates.business_hours} />) : canUseFeature("business_hours") ? (
                                  <>
                                    <label style={{display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c2bed4", cursor: "pointer"}}>
                                      <input
                                        type="checkbox"
                                        checked={Boolean(dayCfg.hasBreak)}
                                        onChange={e => updateDay({ hasBreak: e.target.checked })}
                                        style={{accentColor: "#8b5cf6"}}
                                      />
                                      Intervalo / Pausa
                                    </label>
                                    {dayCfg.hasBreak && (
                                      <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                                        <input
                                          type="time"
                                          value={dayCfg.breakStart || "12:00"}
                                          onChange={e => updateDay({ breakStart: e.target.value })}
                                          style={{padding: "5px 8px", borderRadius: "8px", background: "#161325", border: "1px solid #8b5cf6", color: "white", fontSize: "12px"}}
                                        />
                                        <small style={{color: "#aba8bf"}}>-</small>
                                        <input
                                          type="time"
                                          value={dayCfg.breakEnd || "13:00"}
                                          onChange={e => updateDay({ breakEnd: e.target.value })}
                                          style={{padding: "5px 8px", borderRadius: "8px", background: "#161325", border: "1px solid #8b5cf6", color: "white", fontSize: "12px"}}
                                        />
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openUpgradeRequest("CRM Business", "Ativar Horários Avançados e Intervalos de Almoço/Pausa")}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: "8px",
                                      background: "rgba(245, 158, 11, 0.14)",
                                      border: "1px dashed rgba(245, 158, 11, 0.45)",
                                      color: "#fcd34d",
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      cursor: "pointer"
                                    }}
                                  >
                                    🔒 Intervalo / Pausa (CRM Business)
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{fontSize: "12px", color: "#6b7280", fontStyle: "italic"}}>
                              A IA não realiza atendimento neste dia
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Mensagem de Ausência Fora do Horário */}
                  <div style={{background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "12px", border: "1px solid #3a3250", display: "flex", flexDirection: "column", gap: "12px"}}>
                    <label style={{display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "#fff", fontWeight: 700}}>
                      <input
                        type="checkbox"
                        checked={operatingHours.sendClosedMessage !== false}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, sendClosedMessage: e.target.checked }));
                        }}
                        style={{width: "18px", height: "18px", accentColor: "#ec4899"}}
                      />
                      Enviar mensagem automática de ausência quando o cliente chamar fora do horário
                    </label>
                    <small style={{color: "#aba8bf", fontSize: "12px"}}>
                      Se desmarcado, a IA permanecerá em silêncio absoluto fora do horário configurado sem enviar nenhuma resposta automática.
                    </small>
                    {operatingHours.sendClosedMessage !== false && (
                      <textarea
                        rows={3}
                        value={operatingHours.closedMessage}
                        onChange={e => {
                          isHoursDirtyRef.current = true;
                          setOperatingHours(prev => ({ ...prev, closedMessage: e.target.value }));
                        }}
                        placeholder="Digite a mensagem de ausência enviada fora do horário de funcionamento..."
                        style={{width: "100%", padding: "12px 14px", borderRadius: "10px", background: "#161325", border: "1px solid #3d345c", color: "white", fontSize: "14px", lineHeight: "1.5"}}
                      />
                    )}
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="op-primary"
                      disabled={savingHours || !canUseFeature("business_hours_basic")}
                      style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "14px 28px", fontWeight: 700, borderRadius: "12px", fontSize: "15px"}}
                    >
                      <Save size={18}/> {savingHours ? "Salvando horários..." : "Salvar Horários de Atendimento"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SEÇÃO 3: ATENDIMENTOS E CONVERSAS */}
            {activeTab === "atendimentos" && (
              <>
                <section className="op-workspace" style={{minHeight: "640px"}}>
                  {/* Coluna Esquerda: Lista de Conversas */}
                  <aside className={`op-card op-inbox ${mobileChatOpen ? "op-mobile-hide" : ""}`} style={{display: "flex", flexDirection: "column"}}>
                    <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px"}}>
                      <h2 style={{margin: 0, fontSize: "18px", fontWeight: 800}}>Atendimento ao Vivo</h2>
                      <span style={{fontSize: "12px", color: "#a59cb8", fontWeight: 600}}>{filtered.length} conversas</span>
                    </div>

                    <label className="op-search">
                      <Search size={16} color="#ec4899"/>
                      <input aria-label="Buscar contato" placeholder="Buscar por nome ou número..." value={search} onChange={e => setSearch(e.target.value)}/>
                    </label>

                    {/* Estados das Conversas (Filtro Operacional) */}
                    <div className="op-funnel-bar">
                      {[
                        { id: "all", label: "Todas", count: funnelCounts.all, bg: "var(--grad-primary)", border: "#ec4899", color: "#fff" },
                        { id: "ai", label: "🤖 Atendimento por IA", count: funnelCounts.ai, bg: "rgba(0, 219, 140, 0.18)", border: "#00db8c", color: "#00db8c" },
                        { id: "waiting_human", label: "🚨 Aguardando atendente", count: funnelCounts.waiting_human, bg: "rgba(239, 68, 68, 0.22)", border: "#ef4444", color: "#fca5a5" },
                        { id: "human", label: "👤 Em atendimento humano", count: funnelCounts.human, bg: "rgba(245, 158, 11, 0.18)", border: "#f59e0b", color: "#fcd34d" },
                        { id: "waiting_client", label: "⏳ Aguardando cliente", count: funnelCounts.waiting_client, bg: "rgba(14, 165, 233, 0.18)", border: "#0ea5e9", color: "#7dd3fc" },
                        { id: "closed", label: "✅ Finalizado", count: funnelCounts.closed, bg: "rgba(107, 114, 128, 0.18)", border: "#6b7280", color: "#d1d5db" }
                      ].map(f => {
                        const isSelected = funnelFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setFunnelFilter(f.id as typeof funnelFilter)}
                            style={{
                              padding: "7px 11px",
                              borderRadius: "10px",
                              border: "1px solid",
                              fontSize: "12px",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              background: isSelected ? f.bg : "transparent",
                              borderColor: isSelected ? f.border : "rgba(255, 255, 255, 0.1)",
                              color: isSelected ? (f.id === "all" ? "#fff" : f.color) : "#aba8bf",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              cursor: "pointer",
                              transition: "all 0.15s ease"
                            }}
                          >
                            <span>{f.label}</span>
                            <span style={{
                              background: isSelected ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.08)",
                              padding: "1px 6px",
                              borderRadius: "8px",
                              fontSize: "10px",
                              fontWeight: 800
                            }}>
                              {f.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Filtro por Etiqueta Comercial e Prioridade */}
                    <div style={{display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px"}}>
                      {featureStates.commercial_tags?.state !== "locked_by_plan" && !canUseFeature("commercial_tags") ? (<FeatureUnavailable feature={featureStates.commercial_tags} />) : canUseFeature("commercial_tags") ? (
                        <div style={{display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "8px", border: "1px solid #372f4d"}}>
                          <Tag size={13} color="#aba8bf"/>
                          <select
                            value={tagFilter}
                            onChange={e => setTagFilter(e.target.value)}
                            style={{
                              flex: 1,
                              background: "transparent",
                              border: "none",
                              color: "#fff",
                              fontSize: "12px",
                              outline: "none",
                              cursor: "pointer"
                            }}
                          >
                            <option value="all" style={{background: "#181427"}}>Todas as Etiquetas Comerciais</option>
                            {data?.tags?.map(t => (
                              <option key={t.id} value={t.id} style={{background: "#181427"}}>
                                🏷️ {t.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setNewTagOpen(v => !v)}
                            style={{background: "none", border: "none", color: "#ec4899", fontSize: "11px", fontWeight: 800, cursor: "pointer"}}
                          >
                            {newTagOpen ? "Fechar" : "+ Etiqueta"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openUpgradeRequest("CRM Business", "Desbloquear Etiquetas Comerciais")}
                          style={{
                            padding: "7px 10px",
                            borderRadius: "8px",
                            background: "rgba(245, 158, 11, 0.1)",
                            border: "1px dashed rgba(245, 158, 11, 0.45)",
                            color: "#fcd34d",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "left"
                          }}
                        >
                          🔒 Etiquetas Comerciais (Disponível no CRM Business)
                        </button>
                      )}

                      {newTagOpen && canUseFeature("commercial_tags") && (
                        <form onSubmit={e => void handleCreateCustomTag(e)} style={{display: "flex", gap: "6px", background: "#141022", padding: "8px", borderRadius: "8px", border: "1px solid #443c5e"}}>
                          <input
                            type="text"
                            required
                            placeholder="Nome da etiqueta..."
                            value={newTagName}
                            onChange={e => setNewTagName(e.target.value)}
                            style={{flex: 1, padding: "5px 8px", borderRadius: "6px", background: "#12101e", border: "1px solid #3d345c", color: "#fff", fontSize: "12px"}}
                          />
                          <select
                            value={newTagColor}
                            onChange={e => setNewTagColor(e.target.value)}
                            style={{padding: "5px 6px", borderRadius: "6px", background: "#12101e", border: "1px solid #3d345c", color: "#fff", fontSize: "11px"}}
                          >
                            <option value="purple">Roxo</option>
                            <option value="blue">Azul</option>
                            <option value="green">Verde</option>
                            <option value="amber">Âmbar</option>
                            <option value="red">Vermelho</option>
                          </select>
                          <button type="submit" className="op-primary" style={{padding: "5px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700}}>Criar</button>
                        </form>
                      )}

                      {featureStates.conversation_priority?.state !== "locked_by_plan" && !canUseFeature("conversation_priority") ? (<FeatureUnavailable feature={featureStates.conversation_priority} />) : canUseFeature("conversation_priority") ? (
                        <div style={{display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "8px", border: "1px solid #372f4d"}}>
                          <Filter size={13} color="#aba8bf"/>
                          <select
                            value={priorityFilter}
                            onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
                            style={{
                              flex: 1,
                              background: "transparent",
                              border: "none",
                              color: "#fff",
                              fontSize: "12px",
                              outline: "none",
                              cursor: "pointer"
                            }}
                          >
                            <option value="all" style={{background: "#181427"}}>Todas as Prioridades (Fila Ordenada)</option>
                            <option value="urgent" style={{background: "#181427"}}>🚨 Prioridade Urgente</option>
                            <option value="high" style={{background: "#181427"}}>🔥 Prioridade Alta</option>
                            <option value="normal" style={{background: "#181427"}}>⚡ Prioridade Normal</option>
                            <option value="low" style={{background: "#181427"}}>🟢 Prioridade Baixa</option>
                          </select>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openUpgradeRequest("CRM Business", "Desbloquear Prioridade de Atendimentos")}
                          style={{
                            padding: "7px 10px",
                            borderRadius: "8px",
                            background: "rgba(245, 158, 11, 0.1)",
                            border: "1px dashed rgba(245, 158, 11, 0.45)",
                            color: "#fcd34d",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "left"
                          }}
                        >
                          🔒 Prioridade dos Atendimentos (Disponível no CRM Business)
                        </button>
                      )}
                    </div>

                    <div className="op-list" style={{flex: 1, overflowY: "auto"}}>
                      {filtered.length ? filtered.map(c => {
                        const contact = byContact.get(c.contact_id);
                        const isSelected = (current?.id === c.id);
                        const isHumanMode = (c.mode === "human");
                        const stage = getEffectiveStage(c);
                        const isUrgent = (stage === "waiting_human" || c.status === "urgent");
                        const escalation = data?.escalations?.[c.id];
                        const contactTagId = contact ? contactTagMap.get(contact.id) : undefined;
                        const contactTag = contactTagId ? tagMap.get(contactTagId) : undefined;

                        // Last message preview and unread calculation
                        const convMsgs = messages
                          .filter(m => m.conversation_id === c.id)
                          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
                        const lastMsg = convMsgs[0];
                        const lastReadTs = readTimestamps[c.id] || 0;
                        const unreadCount = convMsgs.filter(
                          m => (m.direction === "inbound" || m.sender_type === "customer") && Date.parse(m.created_at) > lastReadTs
                        ).length;
                        const hasUnread = !isSelected && (isUrgent || (lastMsg?.direction === "inbound" && unreadCount > 0));

                        return (
                          <button
                            key={c.id}
                            className={isSelected ? "op-contact active" : "op-contact"}
                            onClick={() => {
                              setSelected(c.id);
                              setReadTimestamps(prev => ({ ...prev, [c.id]: Date.now() }));
                              setMobileChatOpen(true);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "12px",
                              padding: "12px 13px",
                              borderRadius: "12px",
                              width: "100%",
                              textAlign: "left",
                              border: isSelected
                                ? "1px solid #ec4899"
                                : isUrgent
                                ? "1px solid rgba(239, 68, 68, 0.55)"
                                : "1px solid rgba(255, 255, 255, 0.05)",
                              background: isSelected
                                ? "linear-gradient(135deg, rgba(225, 29, 72, 0.18), rgba(139, 92, 246, 0.18))"
                                : isUrgent
                                ? "rgba(239, 68, 68, 0.08)"
                                : "rgba(255, 255, 255, 0.02)",
                              boxShadow: isSelected ? "0 4px 14px rgba(0, 0, 0, 0.25)" : "none",
                              transition: "all 0.15s ease"
                            }}
                          >
                            <div style={{
                              width: "42px",
                              height: "42px",
                              borderRadius: "50%",
                              background: isUrgent
                                ? "linear-gradient(135deg, #ef4444, #991b1b)"
                                : isHumanMode
                                ? "linear-gradient(135deg, #b45309, #d97706)"
                                : "var(--grad-primary)",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 800,
                              fontSize: "15px",
                              color: "#fff",
                              flexShrink: 0,
                              position: "relative",
                              boxShadow: isUrgent ? "0 0 12px rgba(239, 68, 68, 0.6)" : "none"
                            }}>
                              {(contact?.display_name || contact?.phone || "C").charAt(0).toUpperCase()}
                              {hasUnread && (
                                <span style={{
                                  position: "absolute",
                                  top: "-2px",
                                  right: "-2px",
                                  background: "#ef4444",
                                  color: "#fff",
                                  borderRadius: "999px",
                                  minWidth: "16px",
                                  height: "16px",
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  display: "grid",
                                  placeItems: "center",
                                  padding: "0 4px",
                                  border: "2px solid #12101e"
                                }}>
                                  {unreadCount || "!"}
                                </span>
                              )}
                            </div>
                            <div style={{minWidth: 0, flex: 1}}>
                              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px"}}>
                                <strong style={{fontSize: "14px", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                  {contact?.display_name || contact?.phone || "Contato"}
                                </strong>
                                <span style={{fontSize: "11px", color: "#9ca3af", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"}}>
                                  {dateTime(lastMsg?.created_at || c.last_message_at)}
                                </span>
                              </div>

                              {/* Preview da última mensagem */}
                              <div style={{
                                fontSize: "12px",
                                color: hasUnread ? "#fff" : "#9ca3af",
                                fontWeight: hasUnread ? 700 : 400,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginTop: "3px"
                              }}>
                                {lastMsg
                                  ? `${lastMsg.sender_type === "human" ? "Você: " : lastMsg.sender_type === "agent" ? "🤖 IA: " : ""}${lastMsg.body}`
                                  : (contact?.phone || "Sem mensagens ainda")}
                              </div>

                              <div style={{display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", flexWrap: "wrap"}}>
                                {c.channelSlot && c.channelSlot > 1 && (
                                  <span style={{fontSize: "10px", padding: "1px 6px", borderRadius: "6px", fontWeight: 700, background: "rgba(236,72,153,0.16)", color: "#f472b6"}}>
                                    📱 WA #{c.channelSlot}
                                  </span>
                                )}
                                {c.priority && c.priority !== "normal" && (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "1px 6px",
                                    borderRadius: "6px",
                                    fontWeight: 800,
                                    background: c.priority === "urgent" ? "rgba(239,68,68,0.22)" : c.priority === "high" ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.15)",
                                    color: c.priority === "urgent" ? "#fca5a5" : c.priority === "high" ? "#fcd34d" : "#6ee7b7"
                                  }}>
                                    {c.priority === "urgent" ? "🚨 Urgente" : c.priority === "high" ? "🔥 Alta" : "🟢 Baixa"}
                                  </span>
                                )}
                                {c.satisfaction && (
                                  <span style={{fontSize: "10px", padding: "1px 6px", borderRadius: "6px", fontWeight: 700, background: "rgba(251,191,36,0.18)", color: "#fbbf24"}}>
                                    ★ {c.satisfaction.rating}/5
                                  </span>
                                )}
                                {contactTag && (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "1px 6px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: "rgba(139,92,246,0.2)",
                                    color: "#d8b4fe",
                                    border: "1px solid rgba(139,92,246,0.45)"
                                  }}>
                                    🏷️ {contactTag.name}
                                  </span>
                                )}
                                {stage === "waiting_human" ? (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontWeight: 800,
                                    background: "rgba(239, 68, 68, 0.22)",
                                    color: "#fca5a5",
                                    border: "1px solid #ef4444"
                                  }}>
                                    🚨 Aguardando atendente
                                  </span>
                                ) : stage === "human" ? (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: "rgba(245, 158, 11, 0.2)",
                                    color: "#f59e0b",
                                    border: "1px solid rgba(245, 158, 11, 0.35)"
                                  }}>
                                    👤 Em atendimento humano
                                  </span>
                                ) : stage === "waiting_client" ? (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: "rgba(14, 165, 233, 0.18)",
                                    color: "#7dd3fc",
                                    border: "1px solid rgba(14, 165, 233, 0.35)"
                                  }}>
                                    ⏳ Aguardando cliente
                                  </span>
                                ) : stage === "closed" ? (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: "rgba(107, 114, 128, 0.2)",
                                    color: "#d1d5db",
                                    border: "1px solid rgba(107, 114, 128, 0.3)"
                                  }}>
                                    ✅ Finalizado
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: "10px",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    fontWeight: 700,
                                    background: "rgba(0, 219, 140, 0.15)",
                                    color: "#00db8c",
                                    border: "1px solid rgba(0, 219, 140, 0.3)"
                                  }}>
                                    🤖 Atendimento por IA
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      }) : (
                        <div className="op-empty" style={{textAlign: "center", padding: "40px 10px", color: "#8c879b"}}>
                          Nenhuma conversa encontrada neste estabelecimento.
                        </div>
                      )}
                    </div>
                  </aside>

                  {/* Coluna Direita: Janela da Conversa */}
                  <article className={`op-card op-thread ${!mobileChatOpen ? "op-mobile-hide" : ""}`} style={{display: "flex", flexDirection: "column"}}>
                    {current ? (
                      <>
                        <div className="op-thread-head">
                          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", width: "100%"}}>
                            <div style={{display: "flex", alignItems: "center", gap: "10px", minWidth: 0}}>
                              <button
                                type="button"
                                className="op-mobile-back-btn"
                                onClick={() => setMobileChatOpen(false)}
                                style={{
                                  alignItems: "center",
                                  gap: "5px",
                                  background: "rgba(255, 255, 255, 0.06)",
                                  border: "1px solid rgba(255, 255, 255, 0.12)",
                                  borderRadius: "8px",
                                  padding: "6px 11px",
                                  color: "#fff",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  flexShrink: 0
                                }}
                              >
                                <ArrowLeft size={15}/>
                                <span>Conversas</span>
                              </button>

                              <div style={{minWidth: 0}}>
                                <strong style={{fontSize: "16px", color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                  {byContact.get(current.contact_id)?.display_name || byContact.get(current.contact_id)?.phone || "Contato"}
                                </strong>
                                <div style={{fontSize: "12px", color: "#aba8bf", display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap"}}>
                                  <span style={{fontVariantNumeric: "tabular-nums"}}>+{byContact.get(current.contact_id)?.phone || ""}</span>
                                  {(() => {
                                    const st = getEffectiveStage(current);
                                    if (st === "waiting_human") {
                                      return <span style={{fontSize: "10px", padding: "2px 8px", borderRadius: "8px", fontWeight: 800, background: "rgba(239, 68, 68, 0.22)", color: "#fca5a5", border: "1px solid #ef4444"}}>🚨 Aguardando atendente (IA Pausada)</span>;
                                    }
                                    if (st === "human") {
                                      return <span style={{fontSize: "10px", padding: "2px 8px", borderRadius: "8px", fontWeight: 700, background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.4)"}}>👤 Em atendimento humano (IA Pausada)</span>;
                                    }
                                    if (st === "waiting_client") {
                                      return <span style={{fontSize: "10px", padding: "2px 8px", borderRadius: "8px", fontWeight: 700, background: "rgba(14, 165, 233, 0.2)", color: "#7dd3fc", border: "1px solid rgba(14, 165, 233, 0.4)"}}>⏳ Aguardando cliente (IA Pausada)</span>;
                                    }
                                    if (st === "closed") {
                                      return <span style={{fontSize: "10px", padding: "2px 8px", borderRadius: "8px", fontWeight: 700, background: "rgba(107, 114, 128, 0.25)", color: "#d1d5db", border: "1px solid rgba(107, 114, 128, 0.4)"}}>✅ Atendimento Finalizado</span>;
                                    }
                                    return <span style={{fontSize: "10px", padding: "2px 8px", borderRadius: "8px", fontWeight: 700, background: "rgba(0, 219, 140, 0.15)", color: "#00db8c", border: "1px solid rgba(0, 219, 140, 0.3)"}}>🤖 Atendimento por IA</span>;
                                  })()}
                                </div>
                              </div>
                            </div>

                            {/* Botões de Ação: Assumir / Finalizar / Devolver para IA */}
                            <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                              {getEffectiveStage(current) !== "human" && (
                                <button
                                  type="button"
                                  className="op-refresh"
                                  style={{
                                    background: "rgba(245, 158, 11, 0.18)",
                                    color: "#fcd34d",
                                    borderColor: "#f59e0b",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    padding: "7px 13px",
                                    borderRadius: "9px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px"
                                  }}
                                  disabled={claiming || loading}
                                  onClick={() => void toggleConversationMode(current.id, "human")}
                                >
                                  <Users size={15}/> {claiming ? "Assumindo..." : "Assumir Atendimento"}
                                </button>
                              )}

                              {getEffectiveStage(current) !== "closed" && (
                                <button
                                  type="button"
                                  className="op-refresh"
                                  style={{
                                    background: "rgba(107, 114, 128, 0.2)",
                                    color: "#e5e7eb",
                                    borderColor: "#6b7280",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    padding: "7px 13px",
                                    borderRadius: "9px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px"
                                  }}
                                  disabled={claiming || loading}
                                  onClick={() => void handleSetFunnelStatus(current.id, "closed")}
                                >
                                  <Check size={15}/> Finalizar Atendimento
                                </button>
                              )}

                              {current.mode !== "ai" && (
                                <button
                                  type="button"
                                  className="op-refresh"
                                  style={{
                                    background: "rgba(0, 219, 140, 0.15)",
                                    color: "#00db8c",
                                    borderColor: "#00db8c",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    padding: "7px 13px",
                                    borderRadius: "9px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px"
                                  }}
                                  disabled={claiming || loading}
                                  onClick={() => void toggleConversationMode(current.id, "ai")}
                                >
                                  <Bot size={15}/> {claiming ? "Reativando..." : "Devolver atendimento para IA"}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Linha Inferior: Seletor de Estado, Prioridade, Etiqueta Comercial e Pesquisa de Satisfação */}
                          <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingTop: "6px"}}>
                            <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                              <span style={{fontSize: "11px", color: "#aba8bf", fontWeight: 700, textTransform: "uppercase"}}>Estado:</span>
                              <select
                                value={getEffectiveStage(current)}
                                onChange={e => {
                                  const nextVal = e.target.value;
                                  if (nextVal === "ai" && current.mode !== "ai") {
                                    void toggleConversationMode(current.id, "ai");
                                  } else {
                                    void handleSetFunnelStatus(current.id, nextVal);
                                  }
                                }}
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: "8px",
                                  background: "#161325",
                                  border: "1px solid #3d345c",
                                  color: "#fff",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: "pointer"
                                }}
                              >
                                <option value="ai">🤖 Atendimento por IA</option>
                                <option value="waiting_human">🚨 Aguardando atendente</option>
                                <option value="human">👤 Em atendimento humano</option>
                                <option value="waiting_client">⏳ Aguardando cliente</option>
                                <option value="closed">✅ Finalizado</option>
                              </select>
                            </div>

                            {/* Seletor de Prioridade (Business+) */}
                            {featureStates.conversation_priority?.state !== "locked_by_plan" && !canUseFeature("conversation_priority") ? (<FeatureUnavailable feature={featureStates.conversation_priority} />) : canUseFeature("conversation_priority") ? (
                              <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                                <span style={{fontSize: "11px", color: "#aba8bf", fontWeight: 700, textTransform: "uppercase"}}>Prioridade:</span>
                                <select
                                  value={current.priority || "normal"}
                                  onChange={e => void handleSetConversationPriority(current.id, e.target.value as "low" | "normal" | "high" | "urgent")}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "8px",
                                    background: "#161325",
                                    border: "1px solid #3d345c",
                                    color: "#fff",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                  }}
                                >
                                  <option value="low">🟢 Baixa</option>
                                  <option value="normal">⚡ Normal</option>
                                  <option value="high">🔥 Alta</option>
                                  <option value="urgent">🚨 Urgente</option>
                                </select>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openUpgradeRequest("CRM Business", "Definir Prioridade nos Atendimentos")}
                                style={{padding: "4px 10px", borderRadius: "8px", background: "rgba(245,158,11,0.12)", border: "1px dashed #f59e0b", color: "#fcd34d", fontSize: "11px", fontWeight: 700, cursor: "pointer"}}
                              >
                                🔒 Prioridade (Business)
                              </button>
                            )}

                            {/* Seletor de Etiqueta Comercial (Business+) */}
                            {featureStates.commercial_tags?.state !== "locked_by_plan" && !canUseFeature("commercial_tags") ? (<FeatureUnavailable feature={featureStates.commercial_tags} />) : canUseFeature("commercial_tags") ? (
                              <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                                <Tag size={13} color="#aba8bf"/>
                                <select
                                  value={byContact.get(current.contact_id) ? contactTagMap.get(current.contact_id) || "" : ""}
                                  onChange={e => void handleSetCommercialTag(current.contact_id, e.target.value)}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "8px",
                                    background: "#161325",
                                    border: "1px solid #3d345c",
                                    color: "#fff",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                  }}
                                >
                                  <option value="">Sem Etiqueta Comercial</option>
                                  {data?.tags?.map(t => (
                                    <option key={t.id} value={t.id}>🏷️ {t.name}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openUpgradeRequest("CRM Business", "Classificar clientes com Etiquetas Comerciais")}
                                style={{padding: "4px 10px", borderRadius: "8px", background: "rgba(245,158,11,0.12)", border: "1px dashed #f59e0b", color: "#fcd34d", fontSize: "11px", fontWeight: 700, cursor: "pointer"}}
                              >
                                🔒 Etiquetas (Business)
                              </button>
                            )}

                            {/* Pesquisa de Satisfação (Business+) */}
                            {featureStates.satisfaction_survey?.state !== "locked_by_plan" && !canUseFeature("satisfaction_survey") ? (<FeatureUnavailable feature={featureStates.satisfaction_survey} />) : canUseFeature("satisfaction_survey") ? (
                              current.satisfaction ? (
                                <span style={{fontSize: "11px", padding: "4px 10px", borderRadius: "8px", background: "rgba(251,191,36,0.16)", border: "1px solid #fbbf24", color: "#fde68a", fontWeight: 800}}>
                                  ★ Satisfação: {current.satisfaction.rating}/5 {current.satisfaction.comment ? `("${current.satisfaction.comment}")` : ""}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSurveyOpen(v => !v)}
                                  style={{padding: "4px 10px", borderRadius: "8px", background: "rgba(251,191,36,0.16)", border: "1px solid #fbbf24", color: "#fde68a", fontSize: "11px", fontWeight: 800, cursor: "pointer"}}
                                >
                                  ⭐ Avaliar Satisfação (1-5)
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => openUpgradeRequest("CRM Business", "Registrar Pesquisa de Satisfação (1 a 5 estrelas)")}
                                style={{padding: "4px 10px", borderRadius: "8px", background: "rgba(245,158,11,0.12)", border: "1px dashed #f59e0b", color: "#fcd34d", fontSize: "11px", fontWeight: 700, cursor: "pointer"}}
                              >
                                🔒 Satisfação (Business)
                              </button>
                            )}
                          </div>

                          {/* Formulário Inline de Pesquisa de Satisfação */}
                          {surveyOpen && !current.satisfaction && (
                            <form onSubmit={e => void handleSubmitSatisfactionSurvey(e)} style={{marginTop: "10px", padding: "12px", borderRadius: "10px", background: "#141022", border: "1px solid #fbbf24", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
                              <strong style={{fontSize: "12px", color: "#fde68a"}}>Nota de Satisfação (1 a 5):</strong>
                              <div style={{display: "flex", gap: "4px"}}>
                                {[1, 2, 3, 4, 5].map(n => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setSurveyRating(n)}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: "6px",
                                      border: "1px solid #fbbf24",
                                      background: surveyRating >= n ? "#fbbf24" : "transparent",
                                      color: surveyRating >= n ? "#111" : "#fde68a",
                                      fontWeight: 800,
                                      fontSize: "12px",
                                      cursor: "pointer"
                                    }}
                                  >
                                    {n} ★
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                placeholder="Comentário opcional do atendimento..."
                                value={surveyComment}
                                onChange={e => setSurveyComment(e.target.value)}
                                style={{flex: 1, minWidth: "180px", padding: "6px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px"}}
                              />
                              <button type="submit" disabled={savingSurvey} className="op-primary" style={{padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700}}>
                                {savingSurvey ? "Salvando..." : "Registrar Nota"}
                              </button>
                            </form>
                          )}
                        </div>

                        {/* ALERTA DE TRANSFERÊNCIA PARA HUMANO / AGUARDANDO ATENDENTE */}
                        {(getEffectiveStage(current) === "waiting_human" || current.status === "urgent") && (
                          <div style={{
                            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(185, 28, 28, 0.1))",
                            border: "1px solid rgba(239, 68, 68, 0.55)",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            margin: "12px 0 0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "10px"
                          }}>
                            <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                              <div style={{background: "rgba(239, 68, 68, 0.25)", border: "1px solid #ef4444", borderRadius: "8px", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#fca5a5", flexShrink: 0}}>
                                <ShieldAlert size={17} />
                              </div>
                              <div>
                                <strong style={{color: "#fca5a5", fontSize: "13px", display: "block"}}>
                                  Cliente aguardando atendente humano
                                </strong>
                                <span style={{color: "#fee2e2", fontSize: "12px"}}>
                                  Motivo: <strong>{data?.escalations?.[current.id]?.reason || "Solicitação de atendimento humano"}</strong>
                                  {" · "}A IA pausou as respostas automáticas nesta conversa.
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="op-refresh"
                              style={{background: "#ef4444", color: "#fff", borderColor: "#ef4444", fontSize: "12px", fontWeight: 800, padding: "7px 14px", borderRadius: "8px"}}
                              onClick={() => void toggleConversationMode(current.id, "human")}
                            >
                              <Users size={14} /> Assumir Conversa Agora
                            </button>
                          </div>
                        )}

                        {handoffNotice && (
                          <div style={{
                            background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08))",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            margin: "12px 0 0"
                          }}>
                            <div style={{color: "#f59e0b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px"}}>
                              <Users size={15}/> Status do Atendimento
                            </div>
                            <p style={{margin: 0, color: "#fef3c7", fontSize: "13px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>
                              {handoffNotice}
                            </p>
                          </div>
                        )}

                        <div className="op-bubbles">
                          {thread.length ? thread.map(m => (
                            <div
                              key={m.id}
                              className={m.direction === "outbound" ? "op-message sent" : "op-message"}
                              style={{
                                maxWidth: "80%",
                                alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start",
                                padding: "11px 15px",
                                borderRadius: m.direction === "outbound" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                                background: m.direction === "outbound"
                                  ? (m.sender_type === "human"
                                      ? "linear-gradient(135deg, #26173a, #3e1b52)"
                                      : "var(--grad-primary)")
                                  : "#181427",
                                border: "1px solid",
                                borderColor: m.direction === "outbound"
                                  ? (m.sender_type === "human" ? "rgba(168, 85, 247, 0.45)" : "#ec4899")
                                  : "rgba(255, 255, 255, 0.08)",
                                boxShadow: m.direction === "outbound" ? "0 4px 12px rgba(0, 0, 0, 0.25)" : "none"
                              }}
                            >
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: m.direction === "outbound" ? "#fff" : "#9ca3af",
                                display: "block",
                                marginBottom: "4px"
                              }}>
                                {m.sender_type === "human" ? "👤 Atendente Humano" : m.sender_type === "agent" ? "🤖 Novaes CRM IA" : "📱 Cliente"}
                              </span>
                              <p style={{margin: 0, fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap"}}>{m.body}</p>
                              <small style={{display: "block", fontSize: "10px", color: "rgba(255,255,255,0.6)", textAlign: "right", marginTop: "6px", fontVariantNumeric: "tabular-nums"}}>
                                {dateTime(m.created_at)}
                              </small>
                            </div>
                          )) : (
                            <div className="op-empty" style={{textAlign: "center", padding: "40px", color: "#8c879b"}}>
                              Nenhuma mensagem registrada nesta conversa ainda.
                            </div>
                          )}
                        </div>

                        {/* CAMPO DE RESPOSTA DIRETA DO ATENDENTE HUMANO + RESPOSTAS RÁPIDAS */}
                        <form
                          onSubmit={e => {
                            e.preventDefault();
                            void handleSendHumanMessage();
                          }}
                          style={{
                            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                            paddingTop: "12px",
                            marginTop: "8px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
                        >
                          <QuickRepliesSection
                            quickReplies={quickReplies}
                            allowed={canUseFeature("quick_replies")}
                            onSelectReply={bodyText => setHumanInput(bodyText)}
                            onSaveReply={handleSaveQuickReply}
                            onDeleteReply={handleDeleteQuickReply}
                            onRequestUpgrade={() => openUpgradeRequest("CRM Start", "Ativar Respostas Rápidas")}
                          />
                          {current.mode === "ai" && (
                            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#aba8bf", background: "rgba(0, 219, 140, 0.06)", border: "1px solid rgba(0, 219, 140, 0.2)", padding: "6px 12px", borderRadius: "8px", flexWrap: "wrap", gap: "8px"}}>
                              <span>🤖 A IA está ativa nesta conversa. Ao enviar uma resposta abaixo ou clicar em <strong>Assumir Atendimento</strong>, a IA será pausada automaticamente.</span>
                            </div>
                          )}
                          <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
                            <input
                              type="text"
                              placeholder="Digite sua resposta para o cliente no WhatsApp..."
                              value={humanInput}
                              onChange={e => setHumanInput(e.target.value)}
                              disabled={sendingHumanMsg}
                              style={{
                                flex: 1,
                                padding: "12px 14px",
                                borderRadius: "10px",
                                background: "#141124",
                                border: "1px solid rgba(236, 72, 153, 0.35)",
                                color: "#fff",
                                fontSize: "14px"
                              }}
                            />
                            <button
                              type="submit"
                              className="op-primary"
                              disabled={sendingHumanMsg || !humanInput.trim()}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "12px 20px",
                                borderRadius: "10px",
                                fontWeight: 700,
                                background: "var(--grad-primary)",
                                cursor: "pointer",
                                flexShrink: 0
                              }}
                            >
                              <Send size={15}/> {sendingHumanMsg ? "Enviando..." : "Responder no WhatsApp"}
                            </button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <div className="op-centered op-thread-empty" style={{textAlign: "center", padding: "60px 20px", color: "#8c879b"}}>
                        <MessageSquare size={36} color="#ec4899" style={{margin: "0 auto 12px"}}/>
                        <h2 style={{fontSize: "18px", color: "#fff"}}>Selecione uma conversa</h2>
                        <p style={{fontSize: "13px"}}>As mensagens recebidas no WhatsApp do estabelecimento aparecerão aqui automaticamente em tempo real.</p>
                      </div>
                    )}
                  </article>
                </section>
              </>
            )}

            {/* SEÇÃO EQUIPE & OPERADORES (ETAPA 7) */}
            {activeTab === "equipe" && (
              <TeamOperatorsSection
                operators={teamOperators}
                maxOperators={data?.plan?.maxOperators ?? 1}
                planName={data?.plan?.name || "CRM Start"}
                isSuspended={isSuspended}
                onAddOperator={handleAddOperator}
                onRevokeOperator={handleRevokeOperator}
                onRequestUpgrade={(targetPlan, reason) => openUpgradeRequest(targetPlan, reason)}
              />
            )}

            {/* SEÇÃO INDICADORES & RELATÓRIOS (ETAPA 7) */}
            {activeTab === "relatorios" && (
              <ReportsAndIndicatorsSection
                reports={reportsData}
                featureStates={featureStates}
                loadingReports={loadingReports}
                onRefresh={() => { if (tenant) void fetchReports(tenant); }}
                onRequestUpgrade={(targetPlan, reason) => openUpgradeRequest(targetPlan, reason)}
              />
            )}

            {/* SEÇÃO 4: CONTATOS */}
            {activeTab === "contatos" && (
              <section className="op-card op-contacts-section" aria-label="Cadastro de contatos">
                <div className="op-contact-heading" style={{display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #372f4d", paddingBottom: "16px", marginBottom: "16px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <UserPlus size={24} color="#ec4899"/>
                    <div>
                      <h2 style={{margin: 0, fontSize: "18px"}}>Contatos da Loja</h2>
                      <span style={{fontSize: "12px", color: "#aba8bf"}}>{contacts.length} cadastrados</span>
                    </div>
                  </div>
                  <button className="op-refresh" onClick={() => setNewContactOpen(v => !v)} aria-expanded={newContactOpen}>
                    {newContactOpen ? "Fechar formulário" : "+ Novo Contato"}
                  </button>
                </div>

                {newContactOpen && (
                  <form className="op-contact-form" onSubmit={e => void registerContact(e)} style={{marginBottom: "20px", background: "rgba(0,0,0,0.25)", padding: "18px", borderRadius: "12px"}}>
                    <h3 style={{margin: "0 0 12px", fontSize: "15px"}}>Cadastrar Novo Cliente</h3>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px"}}>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Nome do Cliente
                        <input
                          type="text"
                          required
                          value={contactName}
                          onChange={e => setContactName(e.target.value)}
                          placeholder="Ex.: Maria Souza"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                      <label style={{fontSize: "13px", color: "#c2bed4"}}>
                        Telefone (WhatsApp com DDD)
                        <input
                          type="tel"
                          required
                          value={contactPhone}
                          onChange={e => setContactPhone(e.target.value)}
                          placeholder="Ex.: 51988887777"
                          style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", marginTop: "4px"}}
                        />
                      </label>
                    </div>
                    <button type="submit" className="op-primary" disabled={loading} style={{padding: "10px 20px", fontWeight: 700, borderRadius: "8px"}}>
                      Salvar Contato
                    </button>
                  </form>
                )}

                {contactNotice && (
                  <div style={{padding: "12px 16px", borderRadius: "10px", background: "rgba(10, 46, 32, 0.8)", border: "1px solid #00db8c", color: "#b6f5dd", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
                    <CheckCircle2 size={16} color="#00db8c"/>
                    <span>{contactNotice}</span>
                  </div>
                )}

                <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
                  {contacts.length ? contacts.map(c => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "12px",
                        border: "1px solid #332b49",
                        flexWrap: "wrap",
                        gap: "10px"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                        <div style={{width: "38px", height: "38px", borderRadius: "50%", background: "var(--grad-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: "14px", color: "white"}}>
                          {(c.display_name || c.phone).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{color: "white", fontSize: "15px", display: "block"}}>{c.display_name || "Sem nome"}</strong>
                          <span style={{color: "#8e87a2", fontSize: "13px"}}>{c.phone}</span>
                        </div>
                      </div>
                      <span style={{fontSize: "12px", color: "#9ca3af"}}>
                        Cadastrado em {dateTime(c.created_at)}
                      </span>
                    </div>
                  )) : (
                    <div style={{textAlign: "center", padding: "40px", color: "#8c879b"}}>
                      Nenhum contato cadastrado ainda.
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* SEÇÃO 5: MEU PLANO & ASSINATURA */}
            {activeTab === "plano" && (
              <section style={{display: "flex", flexDirection: "column", gap: "24px"}}>
                {/* Header da Seção */}
                <div className="op-card" style={{display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                    <div style={{width: "48px", height: "48px", borderRadius: "14px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)"}}>
                      <CreditCard size={24} color="#fff"/>
                    </div>
                    <div>
                      <h2 style={{fontSize: "22px", fontWeight: 800, margin: 0, color: "#fff"}}>
                        Meu Plano & Franquia Comercial
                      </h2>
                      <p style={{color: "#aba8bf", margin: "4px 0 0", fontSize: "14px"}}>
                        Acompanhe seu consumo de atendimentos com IA, limites de operadores e recursos contratados.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openUpgradeRequest("CRM Business", "Solicitação de Upgrade pela aba Meu Plano")}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "10px",
                      background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      boxShadow: "0 4px 18px rgba(236, 72, 153, 0.4)"
                    }}
                  >
                    <Sparkles size={16}/> Solicitar Upgrade de Plano
                  </button>
                </div>

                {/* Card de Resumo do Plano Atual + Barra de Consumo */}
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px"}}>
                  {/* Detalhes do Plano Contratado */}
                  <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                      <div>
                        <span style={{fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "#f472b6", fontWeight: 800}}>
                          Plano em Operação
                        </span>
                        <h3 style={{fontSize: "24px", fontWeight: 900, margin: "4px 0 0", color: "#fff"}}>
                          {data?.plan?.isTrial ? "Teste Grátis (7 Dias)" : (data?.plan?.name || "CRM Business")}
                        </h3>
                      </div>
                      <span style={{
                        padding: "6px 14px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 800,
                        background: data?.plan?.isTrial
                          ? "rgba(236, 72, 153, 0.2)"
                          : data?.plan?.status === "paid" ? "rgba(0, 219, 140, 0.15)" : "rgba(244, 63, 94, 0.15)",
                        color: data?.plan?.isTrial
                          ? "#f472b6"
                          : data?.plan?.status === "paid" ? "#00db8c" : "#f43f5e",
                        border: `1px solid ${data?.plan?.isTrial ? "rgba(236, 72, 153, 0.4)" : data?.plan?.status === "paid" ? "rgba(0, 219, 140, 0.4)" : "rgba(244, 63, 94, 0.4)"}`
                      }}>
                        {data?.plan?.isTrial ? "⚡ Período de Teste" : data?.plan?.status === "paid" ? "✅ Assinatura Ativa" : "⚠️ Pendente"}
                      </span>
                    </div>

                    <div style={{display: "flex", alignItems: "baseline", gap: "6px", margin: "6px 0"}}>
                      <span style={{fontSize: "32px", fontWeight: 900, color: "#fff"}}>
                        {data?.plan?.isTrial ? "Grátis" : `R$ ${data?.plan?.price || "99,90"}`}
                      </span>
                      <span style={{fontSize: "14px", color: "#aba8bf"}}>
                        {data?.plan?.isTrial ? "por 7 dias corridos" : "/mês"}
                      </span>
                    </div>

                    <div style={{background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: "#c9bede", display: "flex", flexDirection: "column", gap: "6px"}}>
                      <div>
                        <strong>Vencimento / Renovação:</strong>{" "}
                        <span style={{color: "#fff"}}>
                          {data?.plan?.isTrial
                            ? (data.plan.trialDaysLeft !== undefined ? `${data.plan.trialDaysLeft} dias restantes (expira em ${data.plan.trialExpiresAt?.slice(0, 10) || "7 dias"})` : "7 dias corridos")
                            : (data?.plan?.dueDate || "Renovação mensal")}
                        </span>
                      </div>
                      <div>
                        <strong>Cobrança Automática:</strong>{" "}
                        <span style={{color: "#00db8c"}}>
                          {data?.plan?.isTrial ? "Sem cartão de crédito · Sem cobrança surpresa" : "Boleto / Pix mensal"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Medidor de Atendimentos com IA */}
                  <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                    <span style={{fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "#8b5cf6", fontWeight: 800}}>
                      Consumo de Atendimentos IA
                    </span>
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
                      <span style={{fontSize: "32px", fontWeight: 900, color: "#fff"}}>
                        {quotaData.quotaUsed} <span style={{fontSize: "18px", color: "#aba8bf", fontWeight: 500}}>/ {quotaData.quotaLimit}</span>
                      </span>
                      <span style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: quotaPercent > 90 ? "#f43f5e" : quotaPercent > 70 ? "#f59e0b" : "#00db8c"
                      }}>
                        {quotaPercent}% consumido
                      </span>
                    </div>

                    {/* Barra de Progresso de Cota */}
                    <div style={{width: "100%", height: "12px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "6px", overflow: "hidden", position: "relative"}}>
                      <div style={{
                        width: `${quotaPercent}%`,
                        height: "100%",
                        background: quotaPercent > 90
                          ? "#f43f5e"
                          : quotaPercent > 70
                            ? "#f59e0b"
                            : "linear-gradient(90deg, #ec4899, #8b5cf6)",
                        transition: "width 0.4s ease"
                      }}/>
                    </div>

                    <p style={{fontSize: "12px", color: "#8e87a2", margin: 0, lineHeight: 1.5}}>
                      Cada atendimento é contabilizado por sessão de 24 horas por cliente no WhatsApp após a 1ª resposta automática da IA enviada com sucesso. Atendimento apenas humano não consome franquia.
                    </p>
                  </div>
                </div>

                {/* Grid de Limites Técnicos da Conta */}
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px"}}>
                  <div className="op-card" style={{padding: "16px", display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "38px", height: "38px", borderRadius: "10px", background: "rgba(236, 72, 153, 0.15)", display: "grid", placeItems: "center"}}>
                      <Smartphone size={20} color="#ec4899"/>
                    </div>
                    <div>
                      <span style={{fontSize: "11px", color: "#8e87a2", display: "block"}}>WhatsApps Permitidos</span>
                      <strong style={{color: "#fff", fontSize: "16px"}}>
                        {data?.plan?.maxWhatsappConnections ?? 1} de 5 espaços
                      </strong>
                    </div>
                  </div>

                  <div className="op-card" style={{padding: "16px", display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "38px", height: "38px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.15)", display: "grid", placeItems: "center"}}>
                      <Users size={20} color="#8b5cf6"/>
                    </div>
                    <div>
                      <span style={{fontSize: "11px", color: "#8e87a2", display: "block"}}>Operadores Humanos</span>
                      <strong style={{color: "#fff", fontSize: "16px"}}>
                        Até {data?.plan?.maxOperators ?? (data?.plan?.isTrial ? 1 : 3)} atendente(s)
                      </strong>
                    </div>
                  </div>

                  <div className="op-card" style={{padding: "16px", display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "38px", height: "38px", borderRadius: "10px", background: "rgba(0, 219, 140, 0.15)", display: "grid", placeItems: "center"}}>
                      <Bot size={20} color="#00db8c"/>
                    </div>
                    <div>
                      <span style={{fontSize: "11px", color: "#8e87a2", display: "block"}}>NovaesWeb IA</span>
                      <strong style={{color: "#fff", fontSize: "16px"}}>Ativa 24h/dia</strong>
                    </div>
                  </div>

                  <div className="op-card" style={{padding: "16px", display: "flex", alignItems: "center", gap: "12px"}}>
                    <div style={{width: "38px", height: "38px", borderRadius: "10px", background: "rgba(59, 130, 246, 0.15)", display: "grid", placeItems: "center"}}>
                      <ShieldCheck size={20} color="#3b82f6"/>
                    </div>
                    <div>
                      <span style={{fontSize: "11px", color: "#8e87a2", display: "block"}}>Histórico & Conversas</span>
                      <strong style={{color: "#fff", fontSize: "16px"}}>100% Preservado</strong>
                    </div>
                  </div>
                </div>

                {/* Matriz Completa de Recursos do CRM (4 Estados) */}
                <FeatureGovernanceMatrix
                  featureStates={featureStates}
                  onRequestUpgrade={(p, r) => openUpgradeRequest(p, r)}
                />

                {/* Comparativo dos Três Planos Comerciais */}
                <div className="op-card" style={{display: "flex", flexDirection: "column", gap: "20px"}}>
                  <div>
                    <h3 style={{fontSize: "20px", fontWeight: 800, margin: 0, color: "#fff"}}>
                      Conheça os Planos Comerciais NovaesWeb CRM IA
                    </h3>
                    <p style={{color: "#aba8bf", margin: "4px 0 0", fontSize: "14px"}}>
                      Escale seu atendimento com automação inteligente, múltiplos atendentes e até 5 números WhatsApp.
                    </p>
                  </div>

                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px"}}>
                    {/* Plano 1: Start */}
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "16px",
                        padding: "24px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px"
                      }}
                    >
                      <div>
                        <h4 style={{fontSize: "18px", fontWeight: 800, margin: 0, color: "#fff"}}>CRM Start</h4>
                        <p style={{fontSize: "12px", color: "#8e87a2", margin: "4px 0 0"}}>
                          Ideal para autônomos e pequenos comércios locais.
                        </p>
                      </div>

                      <div style={{display: "flex", alignItems: "baseline", gap: "4px"}}>
                        <span style={{fontSize: "28px", fontWeight: 900, color: "#fff"}}>R$ 59,90</span>
                        <span style={{fontSize: "13px", color: "#8e87a2"}}>/mês</span>
                      </div>

                      <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px", color: "#c9bede"}}>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> <strong>200 atendimentos</strong> com IA/mês
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> <strong>1 número</strong> WhatsApp (1/5 espaços)
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> <strong>1 operador</strong> humano
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> IA personalizada + Base de conhecimento
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Assistente de configuração + Simulador
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Atendimento humano + Transbordo IA → humano
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Horários básicos + Respostas rápidas
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Contatos, histórico e Indicadores básicos
                        </li>
                      </ul>

                      <button
                        type="button"
                        onClick={() => openUpgradeRequest("CRM Start", "Interesse no plano CRM Start (R$ 59,90/mês)")}
                        style={{
                          marginTop: "auto",
                          padding: "10px",
                          borderRadius: "10px",
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          textAlign: "center",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: "13px"
                        }}
                      >
                        Solicitar Start
                      </button>
                    </div>

                    {/* Plano 2: Business (DESTAQUE MAIS RECOMENDADO) */}
                    <div
                      style={{
                        background: "linear-gradient(135deg, rgba(60, 20, 80, 0.65), rgba(25, 10, 45, 0.85))",
                        border: "2px solid #ec4899",
                        borderRadius: "16px",
                        padding: "24px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        position: "relative",
                        boxShadow: "0 0 28px rgba(236, 72, 153, 0.35)"
                      }}
                    >
                      <div style={{
                        position: "absolute",
                        top: "-12px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                        color: "#fff",
                        padding: "3px 14px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 900,
                        letterSpacing: "0.5px",
                        boxShadow: "0 2px 10px rgba(236, 72, 153, 0.5)"
                      }}>
                        ⭐ MAIS RECOMENDADO
                      </div>

                      <div style={{marginTop: "6px"}}>
                        <h4 style={{fontSize: "18px", fontWeight: 800, margin: 0, color: "#fff"}}>CRM Business</h4>
                        <p style={{fontSize: "12px", color: "#fbcfe8", margin: "4px 0 0"}}>
                          Para empresas em expansão que exigem escala e equipe.
                        </p>
                      </div>

                      <div style={{display: "flex", alignItems: "baseline", gap: "4px"}}>
                        <span style={{fontSize: "28px", fontWeight: 900, color: "#fff"}}>R$ 99,90</span>
                        <span style={{fontSize: "13px", color: "#fbcfe8"}}>/mês</span>
                      </div>

                      <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px", color: "#f5d0fe"}}>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> <strong>600 atendimentos</strong> com IA/mês
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Até <strong>3 números</strong> WhatsApp (3/5 espaços)
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Até <strong>3 operadores</strong> humanos
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Horários avançados e intervalos de almoço
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Etiquetas comerciais e Prioridade da fila
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Resumos inteligentes + Alertas sonoros
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Modelo reserva de IA (zero quedas)
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Pesquisa de satisfação + Indicadores comerciais
                        </li>
                      </ul>

                      <button
                        type="button"
                        onClick={() => openUpgradeRequest("CRM Business", "Upgrade para o plano CRM Business (R$ 99,90/mês)")}
                        style={{
                          marginTop: "auto",
                          padding: "11px",
                          borderRadius: "10px",
                          background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                          color: "#fff",
                          border: "none",
                          textAlign: "center",
                          cursor: "pointer",
                          fontWeight: 800,
                          fontSize: "13px",
                          boxShadow: "0 4px 14px rgba(236, 72, 153, 0.4)"
                        }}
                      >
                        Fazer Upgrade p/ Business
                      </button>
                    </div>

                    {/* Plano 3: Premium */}
                    <div
                      style={{
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "16px",
                        padding: "24px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px"
                      }}
                    >
                      <div>
                        <h4 style={{fontSize: "18px", fontWeight: 800, margin: 0, color: "#fff"}}>CRM Premium</h4>
                        <p style={{fontSize: "12px", color: "#8e87a2", margin: "4px 0 0"}}>
                          Para redes de lojas, clínicas e alta demanda comercial.
                        </p>
                      </div>

                      <div style={{display: "flex", alignItems: "baseline", gap: "4px"}}>
                        <span style={{fontSize: "28px", fontWeight: 900, color: "#fff"}}>R$ 159,90</span>
                        <span style={{fontSize: "13px", color: "#8e87a2"}}>/mês</span>
                      </div>

                      <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px", color: "#c9bede"}}>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> <strong>1.500 atendimentos</strong> com IA/mês
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Até <strong>5 números</strong> WhatsApp (5/5 espaços)
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Até <strong>5 operadores</strong> humanos
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Tudo do plano Business incluído
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Relatórios avançados de funil e conversão
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Análise de satisfação e NPS detalhada
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Indicadores de produtividade por atendente
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "8px"}}>
                          <Check size={16} color="#00db8c" style={{flexShrink: 0}}/> Filtros e análises comerciais avançadas
                        </li>
                      </ul>

                      <button
                        type="button"
                        onClick={() => openUpgradeRequest("CRM Premium", "Upgrade para o plano CRM Premium (R$ 159,90/mês)")}
                        style={{
                          marginTop: "auto",
                          padding: "10px",
                          borderRadius: "10px",
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          textAlign: "center",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: "13px"
                        }}
                      >
                        Solicitar Premium
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {embedded && activeTab === "artigos" && <KnowledgeWorkspace embedded tenantId={tenant} />}

            <UpgradeRequestModal
              open={upgradeModal.open}
              initialPlan={upgradeModal.targetPlan}
              initialNotes={upgradeModal.reason}
              currentPlanName={data?.plan?.name || "CRM Start"}
              onClose={() => setUpgradeModal(prev => ({ ...prev, open: false }))}
              onSubmitUpgrade={handleSubmitUpgradeRequest}
            />
            </fieldset>
          </Content>
        </>
      )}
    </div>
  );
}
