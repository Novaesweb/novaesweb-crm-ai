"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

const ProvidersWorkspace = dynamic(() => import("@/components/crm/ProvidersWorkspace"), {
  loading: () => <p role="status">Carregando provedores de IA...</p>,
});
const ClientWorkspace = dynamic(() => import("@/components/crm/ClientWorkspace"), {
  loading: () => <p role="status">Carregando CRM NovaesWeb...</p>,
});

type MasterSection = "clients" | "plans" | "kpis" | "providers" | "crm";
const MASTER_SECTIONS: Record<MasterSection, { title: string; description: string }> = {
  clients: { title: "Gestão de Clientes e Mensalidades", description: "Cadastre lojistas, configure planos, acompanhe pagamentos e controle bloqueios automáticos." },
  plans: { title: "Planos Comerciais & Franquias de IA", description: "Gestão de planos, limites técnicos, sincronização e franquias de atendimento." },
  kpis: { title: "Faturamento & Métricas", description: "Acompanhe receitas, mensalidades e indicadores das empresas." },
  providers: { title: "Provedores de IA", description: "Defina os modelos principal e reserva e teste o atendimento das lojas." },
  crm: { title: "CRM NovaesWeb", description: "Atendimento, WhatsApp e inteligência artificial da própria NovaesWeb." },
};
import {
  Building2, RefreshCw, ShieldCheck,
  BrainCircuit, AlertCircle, PlusCircle, CheckCircle2, Ban, RotateCcw,
  Calendar, CreditCard, KeyRound, UserCheck, Trash2, Smartphone,
  Search, DollarSign, Users, AlertTriangle, ShieldAlert, LogOut, ChevronRight,
  Zap, Sparkles, Check, Copy, Edit3, Eye, History, Layers, Sliders, Info,
  CheckSquare, Square, Crown, Bot, BarChart3, Mail, Lock, EyeOff, LogIn, X
} from "lucide-react";

type Client = {
  id: string;
  name: string;
  slug?: string;
  status: string;
  email: string;
  userId: string | null;
  created_at: string;
  instanceName?: string | null;
  whatsappStatus?: string;
  connectedWhatsappCount?: number;
  maxWhatsappConnections?: number;
  operatorsCount?: number;
  maxOperators?: number;
  isMasterOwnTenant?: boolean;
  plan: {
    planId?: string;
    name: string;
    price: string;
    dueDate: string;
    status: "paid" | "pending";
    autoBlock: boolean;
    isOverdue: boolean;
    quotaLimit?: number;
    quotaUsed?: number;
    maxOperators?: number;
    maxWhatsappConnections?: number;
    customQuotaOverride?: number | null;
    exceptionReason?: string | null;
    adminSuspensionReason?: string | null;
    adminInternalNote?: string | null;
    isTrial?: boolean;
    trialDaysLeft?: number;
    trialStatus?: "active" | "expiring_soon" | "expired" | "quota_exhausted" | "converted" | string;
    trialStartedAt?: string;
    trialExpiresAt?: string;
    contractedPlan?: {
      quotaLimit: number;
      price: string;
      version: number;
      contractedAt?: string;
    } | null;
    pendingPlanUpdate?: {
      quotaLimit: number;
      effectiveAt: string;
      planVersion: number;
    } | null;
  };
};

type UpgradeRequestItem = {
  id: string;
  tenantId: string;
  storeName: string;
  tenantSlug?: string;
  currentPlanId: string;
  currentPlanName: string;
  targetPlanId: string;
  targetPlanName: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string | null;
};

type FeatureId =
  | "ai_chat"
  | "knowledge_base"
  | "setup_wizard"
  | "human_handoff"
  | "simulator"
  | "contacts_history"
  | "basic_hours"
  | "quick_replies"
  | "basic_indicators"
  | "business_hours"
  | "commercial_tags"
  | "handoff_summary"
  | "sound_notifications"
  | "model_fallback"
  | "attendance_priority"
  | "satisfaction_survey"
  | "commercial_indicators"
  | "advanced_reports"
  | "satisfaction_analytics"
  | "operator_indicators"
  | "advanced_commercial_filters";

type PlanItem = {
  id: string;
  name: string;
  price: string;
  quotaLimit: number;
  description: string;
  features: string[];
  allowedFeatures?: FeatureId[];
  maxOperators?: number;
  maxWhatsAppConnections?: number;
  isPopular?: boolean;
  isActive?: boolean;
  isDraft?: boolean;
  hasDraft?: boolean;
  draftPlan?: Partial<Omit<PlanItem, "draftPlan">>;
  enrolledStores?: Array<{ id: string; name: string; customQuotaOverride?: number; exceptionReason?: string }>;
};

type AuditEntry = {
  id: string;
  timestamp: string;
  planId: string;
  planName: string;
  action: string;
  vigencia: string;
  actor: string;
  impactedCount: number;
  diffSummary?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
};

const TECHNICAL_FEATURES_LIST: Array<{ id: FeatureId; name: string; category: string; description: string; isCore?: boolean }> = [
  { id: "ai_chat", name: "IA Personalizada 24h", category: "IA", description: "Respostas inteligentes automatizadas com IA no WhatsApp.", isCore: true },
  { id: "knowledge_base", name: "Base de Conhecimento", category: "IA", description: "Treinamento com preços, produtos, serviços e FAQ da empresa.", isCore: true },
  { id: "setup_wizard", name: "Assistente de Configuração", category: "IA", description: "Configuração guiada de perfil comercial e comportamento da IA.", isCore: true },
  { id: "human_handoff", name: "Atendimento Humano & Transferência", category: "Atendimento", description: "Operador humano assume o chat e pausa a IA naquela conversa.", isCore: true },
  { id: "simulator", name: "Simulador da IA", category: "IA", description: "Ambiente para o lojista simular diálogos antes de ativar o WhatsApp.", isCore: true },
  { id: "contacts_history", name: "Contatos e Histórico", category: "Atendimento", description: "Base de clientes atendidos e histórico completo.", isCore: true },
  { id: "basic_hours", name: "Horários Básicos", category: "Gestão", description: "Configuração simples de abertura e fechamento.", isCore: true },
  { id: "quick_replies", name: "Respostas Rápidas", category: "Atendimento", description: "Atalhos de mensagens prontas para agilizar o operador.", isCore: true },
  { id: "basic_indicators", name: "Indicadores Básicos", category: "Gestão", description: "Visão essencial do volume de atendimentos e consumo.", isCore: true },
  { id: "business_hours", name: "Horários Avançados e Intervalos", category: "Gestão", description: "Configuração por dia da semana, intervalos de almoço e mensagem fora do expediente." },
  { id: "commercial_tags", name: "Etiquetas Comerciais", category: "Atendimento", description: "Classificação por etapas: Novo Lead, Orçamento, Vendido, Perdido." },
  { id: "handoff_summary", name: "Resumos Inteligentes de Atendimento", category: "IA", description: "Síntese automática em 3 linhas gerada para o atendente humano." },
  { id: "sound_notifications", name: "Alertas Sonoros", category: "Atendimento", description: "Alerta em áudio quando cliente solicita atendente humano." },
  { id: "model_fallback", name: "Modelo Reserva de IA", category: "Segurança", description: "Fallback automático de rota de IA garantindo zero indisponibilidade." },
  { id: "attendance_priority", name: "Prioridade dos Atendimentos", category: "Atendimento", description: "Classificação e ordenação de fila por urgência (Baixa, Normal, Alta, Urgente)." },
  { id: "satisfaction_survey", name: "Pesquisa de Satisfação", category: "Atendimento", description: "Coleta de nota 1 a 5 e comentário ao encerrar o atendimento." },
  { id: "commercial_indicators", name: "Indicadores Comerciais", category: "Gestão", description: "Métricas de funil comercial, etiquetas e conversão." },
  { id: "advanced_reports", name: "Relatórios Avançados", category: "Gestão", description: "Relatórios gerenciais detalhados de operação e tendências." },
  { id: "satisfaction_analytics", name: "Análise de Satisfação (CSAT)", category: "Gestão", description: "Distribuição de notas, média CSAT e comentários." },
  { id: "operator_indicators", name: "Indicadores por Atendente", category: "Gestão", description: "Produtividade individual e volume por operador da equipe." },
  { id: "advanced_commercial_filters", name: "Filtros e Análises Comerciais Avançadas", category: "Gestão", description: "Segmentação avançada por período, etiqueta, prioridade e atendente." }
];

const DEFAULT_PLANS: PlanItem[] = [
  {
    id: "crm-start",
    name: "CRM Start",
    price: "59,90",
    quotaLimit: 200,
    maxOperators: 1,
    maxWhatsAppConnections: 1,
    isActive: true,
    description: "Ideal para autônomos, pequenos comércios e prestadores de serviços locais.",
    allowedFeatures: [
      "ai_chat",
      "knowledge_base",
      "setup_wizard",
      "human_handoff",
      "simulator",
      "contacts_history",
      "basic_hours",
      "quick_replies",
      "basic_indicators"
    ],
    features: [
      "200 atendimentos com IA por mês",
      "1 número WhatsApp (1/5 espaços)",
      "1 operador humano",
      "IA personalizada + Base de conhecimento",
      "Assistente de configuração",
      "Atendimento humano + Transferência IA → humano",
      "Simulador da IA",
      "Contatos e histórico",
      "Horários básicos",
      "Respostas rápidas",
      "Indicadores básicos"
    ]
  },
  {
    id: "crm-business",
    name: "CRM Business",
    price: "99,90",
    quotaLimit: 600,
    maxOperators: 3,
    maxWhatsAppConnections: 3,
    isPopular: true,
    isActive: true,
    description: "Para empresas e lojas em crescimento que buscam escala e atendimento profissional.",
    allowedFeatures: [
      "ai_chat",
      "knowledge_base",
      "setup_wizard",
      "human_handoff",
      "simulator",
      "contacts_history",
      "basic_hours",
      "quick_replies",
      "basic_indicators",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "attendance_priority",
      "satisfaction_survey",
      "commercial_indicators"
    ],
    features: [
      "600 atendimentos com IA por mês",
      "Até 3 números WhatsApp (3/5 espaços)",
      "Até 3 operadores humanos",
      "Tudo do Plano Start incluído",
      "Horários avançados e intervalos",
      "Etiquetas comerciais",
      "Resumos inteligentes de atendimento",
      "Alertas sonoros",
      "Modelo reserva de IA (zero quedas)",
      "Prioridade dos atendimentos",
      "Pesquisa de satisfação",
      "Indicadores comerciais"
    ]
  },
  {
    id: "crm-premium",
    name: "CRM Premium",
    price: "159,90",
    quotaLimit: 1500,
    maxOperators: 5,
    maxWhatsAppConnections: 5,
    isActive: true,
    description: "Para operações avançadas, redes de lojas, imobiliárias e clínicas de alta demanda.",
    allowedFeatures: [
      "ai_chat",
      "knowledge_base",
      "setup_wizard",
      "human_handoff",
      "simulator",
      "contacts_history",
      "basic_hours",
      "quick_replies",
      "basic_indicators",
      "business_hours",
      "commercial_tags",
      "handoff_summary",
      "sound_notifications",
      "model_fallback",
      "attendance_priority",
      "satisfaction_survey",
      "commercial_indicators",
      "advanced_reports",
      "satisfaction_analytics",
      "operator_indicators",
      "advanced_commercial_filters"
    ],
    features: [
      "1.500 atendimentos com IA por mês",
      "Até 5 números WhatsApp (5/5 espaços)",
      "Até 5 operadores humanos",
      "Tudo do Plano Business incluído",
      "Relatórios avançados",
      "Análise de satisfação",
      "Indicadores por atendente",
      "Filtros e análises comerciais avançadas"
    ]
  }
];

export default function AdminCRM() {
  const [clients, setClients] = useState<Client[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [clientCountsMap, setClientCountsMap] = useState<Record<string, number>>({});
  const [enrolledStoresMap, setEnrolledStoresMap] = useState<Record<string, Array<{ id: string; name: string; customQuotaOverride?: number; exceptionReason?: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "overdue" | "suspended">("all");
  const [currentNav, setCurrentNav] = useState<MasterSection>("clients");

  useEffect(() => {
    const syncSection = () => {
      const section = new URLSearchParams(window.location.search).get("section");
      setCurrentNav(section && Object.hasOwn(MASTER_SECTIONS, section) ? section as MasterSection : "clients");
    };
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  function navigateSection(section: MasterSection) {
    setCurrentNav(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.pushState(null, "", url);
  }

  // Master Authentication (secure session cookie)
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [inputKey, setInputKey] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  // Create client form state (initialized with official CRM Start values)
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planName, setPlanName] = useState("CRM Start");
  const [planPrice, setPlanPrice] = useState("59,90");
  const [quotaLimit, setQuotaLimit] = useState(200);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [autoBlock, setAutoBlock] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Administrative Suspension Modal state (with public reason + internal note)
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [clientToBlock, setClientToBlock] = useState<Client | null>(null);
  const [blockPublicReason, setBlockPublicReason] = useState("Conta suspensa administrativamente. Entre em contato com o suporte financeiro NovaesWeb.");
  const [blockInternalNote, setBlockInternalNote] = useState("");
  const [togglingBlock, setTogglingBlock] = useState(false);
  const [resolvingUpgradeId, setResolvingUpgradeId] = useState<string | null>(null);

  // Change Plan Modal
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [selectedClientForPlan, setSelectedClientForPlan] = useState<Client | null>(null);
  const [targetPlanToAssign, setTargetPlanToAssign] = useState<PlanItem>(DEFAULT_PLANS[0]);
  const [assigningPlan, setAssigningPlan] = useState(false);
  const [customQuotaChecked, setCustomQuotaChecked] = useState(false);
  const [customQuotaValue, setCustomQuotaValue] = useState<number>(0);
  const [customQuotaReason, setCustomQuotaReason] = useState("");

  // Plan Edit / Create Modal state
  const [editPlanModalOpen, setEditPlanModalOpen] = useState(false);
  const [isCreatingNewPlan, setIsCreatingNewPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanItem>({
    id: "",
    name: "",
    price: "199,00",
    quotaLimit: 1000,
    maxOperators: 1,
    maxWhatsAppConnections: 1,
    description: "",
    features: [],
    allowedFeatures: ["ai_chat", "human_handoff"],
    isPopular: false,
    isActive: true
  });
  const [editingFeaturesText, setEditingFeaturesText] = useState("");

  // Impact Confirmation Modal ("Salvar e Aplicar")
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [planToApply, setPlanToApply] = useState<PlanItem | null>(null);
  const [originalPlan, setOriginalPlan] = useState<PlanItem | null>(null);
  const [vigencia, setVigencia] = useState<"immediate" | "new_clients" | "next_cycle">("immediate");
  const [applyingPlan, setApplyingPlan] = useState(false);

  // Duplicate Plan Modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [sourcePlanForDuplicate, setSourcePlanForDuplicate] = useState<PlanItem | null>(null);
  const [duplicateNewId, setDuplicateNewId] = useState("");
  const [duplicateNewName, setDuplicateNewName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // Enrolled Stores Modal
  const [enrolledModalOpen, setEnrolledModalOpen] = useState(false);
  const [selectedPlanForStores, setSelectedPlanForStores] = useState<PlanItem | null>(null);

  // Audit History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Password reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetStoreName, setResetStoreName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Fetch Clients
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setAuthenticated(false);
          setError("Digite a senha Master para acessar a Central de Administração.");
        } else {
          setError("Não foi possível carregar a lista de clientes.");
        }
        return;
      }
      setAuthenticated(true);
      const data = await res.json();
      setClients(data.clients || []);
      setUpgradeRequests(Array.isArray(data.upgradeRequests) ? data.upgradeRequests : []);
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Plans
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/admin/plans", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.plans)) {
          setPlans(data.plans);
        }
        if (data.clientCounts) {
          setClientCountsMap(data.clientCounts);
        }
        if (data.enrolledStores) {
          setEnrolledStoresMap(data.enrolledStores);
        }
      }
    } catch {}
  }, []);

  // Check Master session on initial mount
  useEffect(() => {
    async function checkMasterSession() {
      try {
        const res = await fetch("/api/crm/auth/session", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.role === "master") {
            setAuthenticated(true);
            void fetchClients();
            void fetchPlans();
            return;
          }
        }
      } catch {}
      setAuthenticated(false);
      setLoading(false);
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
    void checkMasterSession();
  }, [fetchClients, fetchPlans]);

  // Master Login
  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidatePass = (adminPassword || inputKey).trim();
    if (!candidatePass) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: adminEmail.trim(),
          password: candidatePass,
          rememberMe
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || (data.error === "invalid_credentials" ? "E-mail ou senha Master incorretos. Verifique suas credenciais de administrador." : data.error) || "Senha incorreta ou acesso não autorizado.");
        return;
      }
      setAuthenticated(true);
      setAdminPassword("");
      setInputKey("");
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  // Master Logout
  const handleMasterLogout = async () => {
    try {
      await fetch("/api/crm/auth/session", { method: "DELETE", credentials: "same-origin" });
    } catch {}
    setAuthenticated(false);
    setAdminPassword("");
    setInputKey("");
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = clients.length;
    const connected = clients.filter(c => c.whatsappStatus === "connected").length;
    const revenue = clients.reduce((acc, c) => {
      const val = parseFloat(c.plan.price.replace(/\./g, "").replace(",", ".")) || 0;
      return acc + val;
    }, 0);
    const blocked = clients.filter(c => c.status === "suspended" || c.plan.isOverdue).length;
    return { total, connected, revenue, blocked };
  }, [clients]);

  // Client counts per plan
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) counts[p.name] = clientCountsMap[p.id] ?? 0;
    for (const c of clients) {
      const pName = c.plan.name || "CRM Start";
      if (!counts[pName]) counts[pName] = (counts[pName] || 0) + 1;
    }
    return counts;
  }, [plans, clients, clientCountsMap]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterStatus === "active") return c.status === "active" && !c.plan.isOverdue;
      if (filterStatus === "overdue") return c.plan.isOverdue;
      if (filterStatus === "suspended") return c.status === "suspended";
      return true;
    });
  }, [clients, searchTerm, filterStatus]);

  // Create Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const isTrial = planName === "Teste Grátis (7 Dias)" || planName.includes("Teste Grátis");
      const selectedPlanObj = plans.find(p => p.name === planName);
      const planId = isTrial ? "crm-trial" : (selectedPlanObj?.id || "crm-start");
      const res = await fetch("/api/crm/admin/clients", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          email,
          password,
          isTrial,
          planId,
          planName: isTrial ? "Teste Grátis (7 Dias)" : planName,
          planPrice: isTrial ? "0,00" : planPrice,
          dueDate,
          paymentStatus: isTrial ? "paid" : paymentStatus,
          autoBlock,
          quotaLimit: isTrial ? 100 : quotaLimit
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error === "trial_already_used") {
          setError(errJson.message || "Esta empresa ou e-mail já utilizou a avaliação gratuita de 7 dias anteriormente.");
        } else if (errJson.error === "backend_not_configured") {
          setError("O Supabase não está configurado no servidor. Adicione a variável CRM_SUPABASE_SERVICE_ROLE_KEY nas configurações de ambiente da hospedagem (ex: Vercel).");
        } else if (errJson.error === "tenant_create_failed") {
          setError("Falha ao criar o registro da loja no banco de dados do Supabase. Verifique as permissões da chave service_role.");
        } else if (errJson.error === "user_create_failed") {
          setError("Falha ao criar o usuário no Supabase Auth. Verifique se o e-mail já não está cadastrado.");
        } else {
          setError(errJson.message || errJson.error || "Não foi possível cadastrar o cliente.");
        }
        return;
      }
      setNotice(`Loja "${storeName}" cadastrada com sucesso! Login criado para ${email}.`);
      setStoreName("");
      setEmail("");
      setPassword("");
      setFormOpen(false);
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha ao salvar novo cliente.");
    } finally {
      setCreating(false);
    }
  };

  // Plan Management Handlers
  const handleOpenCreatePlan = () => {
    setIsCreatingNewPlan(true);
    const newId = `crm-custom-${Date.now().toString().slice(-4)}`;
    setEditingPlan({
      id: newId,
      name: "Novo Plano CRM",
      price: "199,00",
      quotaLimit: 1000,
      maxOperators: 1,
      maxWhatsAppConnections: 1,
      description: "Plano comercial personalizado para lojistas.",
      allowedFeatures: ["ai_chat", "human_handoff", "simulator"],
      features: [
        "Até 1.000 atendimentos/mês",
        "NovaesWeb IA ativa 24h",
        "Conexão WhatsApp (1 número)",
        "Atendimento Humano Básico"
      ],
      isPopular: false,
      isActive: true
    });
    setEditingFeaturesText("Até 1.000 atendimentos/mês\nNovaesWeb IA ativa 24h\nConexão WhatsApp (1 número)\nAtendimento Humano Básico");
    setEditPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan: PlanItem) => {
    setIsCreatingNewPlan(false);
    const target = (plan.hasDraft && plan.draftPlan) ? { ...plan, ...plan.draftPlan } : plan;
    setEditingPlan({
      ...target,
      allowedFeatures: target.allowedFeatures || target.features.filter((id): id is FeatureId =>
        TECHNICAL_FEATURES_LIST.some(feature => feature.id === id))
    });
    setEditingFeaturesText((target.features || []).join("\n"));
    setEditPlanModalOpen(true);
  };

  const handleDiscardDraft = async (planId: string) => {
    if (!window.confirm("Deseja descartar as alterações deste rascunho? O plano publicado voltará a ser o único exibido.")) return;
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "discard_draft", planId })
      });
      if (!res.ok) throw new Error();
      setNotice("Rascunho descartado com sucesso.");
      await fetchPlans();
    } catch {
      setError("Falha ao descartar rascunho.");
    }
  };

  const handleToggleFeatureInEditor = (featId: FeatureId) => {
    const current = editingPlan.allowedFeatures || [];
    if (current.includes(featId)) {
      setEditingPlan({ ...editingPlan, allowedFeatures: current.filter(id => id !== featId) });
    } else {
      setEditingPlan({ ...editingPlan, allowedFeatures: [...current, featId] });
    }
  };

  const handleSavePlanDraft = async () => {
    try {
      const lines = editingFeaturesText.split("\n").map(l => l.trim()).filter(Boolean);
      const planPayload = { ...editingPlan, features: lines };
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "save_draft", plan: planPayload })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano "${editingPlan.name}" salvo como rascunho com sucesso.`);
      setEditPlanModalOpen(false);
      await fetchPlans();
    } catch {
      setError("Falha ao salvar rascunho do plano.");
    }
  };

  const handleTriggerApplyPlan = () => {
    const lines = editingFeaturesText.split("\n").map(l => l.trim()).filter(Boolean);
    const planPayload = { ...editingPlan, features: lines };
    setPlanToApply(planPayload);
    const orig = plans.find(p => p.id === editingPlan.id) || null;
    setOriginalPlan(orig);
    setVigencia("immediate");
    setEditPlanModalOpen(false);
    setImpactModalOpen(true);
  };

  const handleConfirmApplyPlan = async () => {
    if (!planToApply) return;
    setApplyingPlan(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "save_and_apply",
          plan: planToApply,
          vigencia
        })
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || "Falha ao aplicar plano");

      if (data.failedTenants && data.failedTenants.length > 0) {
        setError(
          `Sincronização com falhas parciais: ${data.succeededTenants?.length || 0} loja(s) sincronizada(s), mas ${data.failedTenants.length} falharam: ${data.failedTenants.map((f: { tenantId: string; error: string }) => `${f.tenantId}: ${f.error}`).join("; ")}`
        );
      } else {
        const affectedCount = data.affectedTenants?.length || data.impactedCount || 0;
        setNotice(
          `Plano "${planToApply.name}" aplicado com sucesso! ${affectedCount} loja(s) vinculada(s) sincronizada(s) automaticamente conforme vigência (${vigencia}).`
        );
      }
      setImpactModalOpen(false);
      setPlanToApply(null);
      await fetchPlans();
      await fetchClients();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar plano.");
    } finally {
      setApplyingPlan(false);
    }
  };

  const handleOpenDuplicate = (plan: PlanItem) => {
    setSourcePlanForDuplicate(plan);
    setDuplicateNewId(`${plan.id}-copia`);
    setDuplicateNewName(`${plan.name} (Cópia)`);
    setDuplicateModalOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!sourcePlanForDuplicate || !duplicateNewId.trim()) return;
    setDuplicating(true);
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "duplicate",
          sourcePlanId: sourcePlanForDuplicate.id,
          newPlanId: duplicateNewId.trim(),
          newName: duplicateNewName.trim()
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano duplicado com sucesso: "${duplicateNewName}"`);
      setDuplicateModalOpen(false);
      await fetchPlans();
    } catch {
      setError("Falha ao duplicar plano.");
    } finally {
      setDuplicating(false);
    }
  };

  const handleTogglePlanStatus = async (plan: PlanItem) => {
    try {
      const nextStatus = !(plan.isActive !== false);
      const res = await fetch("/api/crm/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "toggle_status",
          planId: plan.id,
          isActive: nextStatus
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Plano "${plan.name}" ${nextStatus ? "ativado" : "desativado"}.`);
      await fetchPlans();
    } catch {
      setError("Falha ao alterar status do plano.");
    }
  };

  const handleViewEnrolledStores = (plan: PlanItem) => {
    setSelectedPlanForStores(plan);
    setEnrolledModalOpen(true);
  };

  const handleOpenAuditHistory = async () => {
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/crm/admin/plans/history", {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.history || []);
      }
    } catch {
      setError("Falha ao carregar histórico de alterações.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open Assign Plan Modal for a client
  const handleOpenAssignModal = (client: Client) => {
    setSelectedClientForPlan(client);
    const cur = plans.find(p => p.id === client.plan.planId || p.name === client.plan.name) || plans[0];
    setTargetPlanToAssign(cur);
    if (client.plan.customQuotaOverride) {
      setCustomQuotaChecked(true);
      setCustomQuotaValue(client.plan.customQuotaOverride);
      setCustomQuotaReason(client.plan.exceptionReason || "");
    } else {
      setCustomQuotaChecked(false);
      setCustomQuotaValue(cur.quotaLimit);
      setCustomQuotaReason("");
    }
    setChangePlanModalOpen(true);
  };

  const handleAssignPlan = async () => {
    if (!selectedClientForPlan) return;
    setAssigningPlan(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          tenantId: selectedClientForPlan.id,
          planId: targetPlanToAssign.id,
          planName: targetPlanToAssign.name,
          planPrice: targetPlanToAssign.price,
          quotaLimit: targetPlanToAssign.quotaLimit,
          customQuotaOverride: customQuotaChecked ? Number(customQuotaValue) : null,
          exceptionReason: customQuotaChecked ? customQuotaReason.trim() : null
        })
      });
      if (!res.ok) throw new Error();
      setNotice(
        `Plano da loja "${selectedClientForPlan.name}" atualizado para ${targetPlanToAssign.name}${
          customQuotaChecked ? ` com exceção contratual (${customQuotaValue} msgs)` : ""
        }!`
      );
      setChangePlanModalOpen(false);
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha ao atualizar plano da loja.");
    } finally {
      setAssigningPlan(false);
    }
  };

  const handleToggleBlock = (client: Client) => {
    setClientToBlock(client);
    setBlockPublicReason(
      client.plan.adminSuspensionReason ||
        "Conta suspensa administrativamente. Entre em contato com o suporte financeiro NovaesWeb."
    );
    setBlockInternalNote(client.plan.adminInternalNote || "");
    setBlockModalOpen(true);
  };

  const handleConfirmToggleBlock = async () => {
    if (!clientToBlock) return;
    const isSuspended = clientToBlock.status === "suspended";
    setTogglingBlock(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: clientToBlock.id,
          action: "toggle_block",
          suspend: !isSuspended,
          publicReason: !isSuspended ? blockPublicReason.trim() : undefined,
          internalNote: blockInternalNote.trim() || undefined
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Status da loja ${clientToBlock.name} atualizado para ${isSuspended ? "Ativo (Liberado)" : "Suspenso Administrativamente"}.`);
      setBlockModalOpen(false);
      setClientToBlock(null);
      await fetchClients();
    } catch {
      setError("Falha ao alterar status de bloqueio.");
    } finally {
      setTogglingBlock(false);
    }
  };

  const handleResolveUpgradeRequest = async (reqItem: UpgradeRequestItem, decision: "approved" | "rejected") => {
    setResolvingUpgradeId(reqItem.id);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: reqItem.tenantId,
          action: "resolve_upgrade_request",
          requestId: reqItem.id,
          decision
        })
      });
      if (!res.ok) throw new Error();
      setNotice(
        decision === "approved"
          ? `Upgrade aprovado! Loja "${reqItem.storeName}" migrada para ${reqItem.targetPlanName}.`
          : `Solicitação de upgrade de "${reqItem.storeName}" rejeitada.`
      );
      await fetchClients();
      await fetchPlans();
    } catch {
      setError("Falha ao processar solicitação de upgrade.");
    } finally {
      setResolvingUpgradeId(null);
    }
  };

  const handleSetPaymentStatus = async (client: Client, newStatus: "paid" | "pending") => {
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: client.id,
          action: "set_payment_status",
          paymentStatus: newStatus
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Pagamento da loja ${client.name} marcado como ${newStatus === "paid" ? "PAGO (Liberado)" : "PENDENTE"}.`);
      await fetchClients();
    } catch {
      setError("Falha ao atualizar status de pagamento.");
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (!window.confirm(`Tem certeza que deseja APAGAR permanentemente a loja "${client.name}" e desconectar a instância WhatsApp dela? Esta ação não pode ser desfeita.`)) return;

    try {
      const res = await fetch(`/api/crm/admin/clients?tenantId=${encodeURIComponent(client.id)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) throw new Error();
      setNotice(`Loja "${client.name}" e sua instância apagadas com sucesso.`);
      await fetchClients();
    } catch {
      setError("Falha ao apagar cliente.");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || newPassword.length < 6) return;
    setResetting(true);
    try {
      const res = await fetch("/api/crm/admin/clients", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: resetUserId,
          action: "reset_password",
          userId: resetUserId,
          newPassword
        })
      });
      if (!res.ok) throw new Error();
      setNotice(`Senha da loja "${resetStoreName}" alterada com sucesso!`);
      setResetModalOpen(false);
      setNewPassword("");
    } catch {
      setError("Falha ao alterar senha.");
    } finally {
      setResetting(false);
    }
  };

  // Login Screen if not authenticated
  if (!authenticated) {
    return (
      <main
        style={{
          position: "relative",
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "#07030c",
          backgroundImage: `
            radial-gradient(ellipse 65% 50% at 12% 18%, rgba(217, 70, 239, 0.32) 0%, rgba(147, 51, 234, 0.14) 42%, transparent 70%),
            radial-gradient(ellipse 60% 48% at 18% 92%, rgba(244, 63, 94, 0.38) 0%, rgba(225, 29, 72, 0.18) 46%, transparent 75%),
            radial-gradient(ellipse 55% 45% at 94% 88%, rgba(217, 70, 239, 0.32) 0%, rgba(168, 85, 247, 0.14) 50%, transparent 75%),
            radial-gradient(ellipse 42% 38% at 92% 10%, rgba(225, 29, 72, 0.25) 0%, transparent 60%)
          `,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          overflow: "hidden"
        }}
      >
        {/* Luminous Neon Silk Ribbon Curves (SVG overlay matching reference image) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            overflow: "hidden"
          }}
        >
          <svg
            style={{ position: "absolute", top: "-10%", left: "-10%", width: "120%", height: "120%", opacity: 0.7 }}
            viewBox="0 0 1440 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M-80 230 C 220 70, 260 400, 520 270 C 760 150, 880 490, 1560 820"
              stroke="url(#neon-magenta)"
              strokeWidth="64"
              strokeLinecap="round"
              filter="blur(40px)"
            />
            <path
              d="M-50 220 C 240 80, 280 390, 520 280 C 760 170, 890 480, 1520 800"
              stroke="#ff1493"
              strokeWidth="10"
              strokeLinecap="round"
              filter="blur(8px)"
            />
            <path
              d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
              stroke="url(#neon-red)"
              strokeWidth="74"
              filter="blur(46px)"
            />
            <path
              d="M-40 840 C 320 730, 440 900, 780 830 C 1080 770, 1220 940, 1540 830"
              stroke="#ff1e42"
              strokeWidth="8"
              filter="blur(7px)"
            />
            <defs>
              <linearGradient id="neon-magenta" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ec4899" />
                <stop offset="50%" stopColor="#d946ef" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="neon-red" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff1744" />
                <stop offset="50%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#a824e8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Central Content Container: 2-column landscape on desktop */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidth: "1160px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            alignItems: "center",
            gap: "52px",
            margin: "0 auto"
          }}
        >
          {/* LEFT COLUMN: Brand identity, headline, subtitle, 4 feature cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {/* Brand Header: mascot + typography */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* Mascot Robot Head wearing glowing headphones */}
              <div
                style={{
                  position: "relative",
                  width: "70px",
                  height: "70px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <svg width="70" height="70" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Glowing headphone band */}
                  <path
                    d="M16 38 C 16 22, 25 14, 36 14 C 47 14, 56 22, 56 38"
                    stroke="#ec4899"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    filter="drop-shadow(0 0 6px #ec4899)"
                  />
                  {/* Left earphone pad */}
                  <rect x="10" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                  {/* Right earphone pad */}
                  <rect x="54" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                  {/* Cute robot face pill */}
                  <rect x="18" y="24" width="36" height="32" rx="14" fill="#ffffff" />
                  {/* Friendly eyes */}
                  <circle cx="28" cy="38" r="2.8" fill="#1e1035" />
                  <circle cx="44" cy="38" r="2.8" fill="#1e1035" />
                  {/* Cute smile */}
                  <path d="M31 43 Q 36 48, 41 43" stroke="#1e1035" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                  {/* Rosy cheeks */}
                  <circle cx="24" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
                  <circle cx="48" cy="42" r="2" fill="#f43f5e" opacity="0.6" />
                </svg>
              </div>

              {/* Brand Typography with red swoosh over Web */}
              <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "relative", display: "inline-flex", alignItems: "baseline" }}>
                  <span style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.5px" }}>
                    Novaes
                  </span>
                  <span style={{ fontSize: "28px", fontWeight: 900, color: "#ff1e42", letterSpacing: "-0.5px" }}>
                    Web
                  </span>
                  {/* Curved dynamic swoosh arch over Web */}
                  <svg
                    style={{
                      position: "absolute",
                      top: "-10px",
                      right: "-12px",
                      width: "80px",
                      height: "28px",
                      overflow: "visible",
                      pointerEvents: "none"
                    }}
                    viewBox="0 0 80 28"
                    fill="none"
                  >
                    <path
                      d="M2 24 C 24 2, 54 2, 78 18"
                      stroke="#ff1e42"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: 900,
                    letterSpacing: "1px",
                    background: "linear-gradient(90deg, #ffffff 0%, #fbcfe8 50%, #c084fc 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textTransform: "uppercase",
                    marginTop: "-4px"
                  }}
                >
                  CRM IA
                </span>
              </div>
            </div>

            {/* Pill Badge: Painel Master */}
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  background: "rgba(42, 14, 48, 0.7)",
                  border: "1px solid rgba(236, 72, 153, 0.45)",
                  boxShadow: "0 0 16px rgba(236, 72, 153, 0.25)"
                }}
              >
                <Crown size={14} style={{ color: "#fbbf24" }} />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#f5d0fe", letterSpacing: "0.2px" }}>
                  Painel Master
                </span>
              </div>
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: "clamp(26px, 3.2vw, 36px)",
                fontWeight: 900,
                lineHeight: 1.15,
                color: "#ffffff",
                letterSpacing: "-0.6px",
                margin: 0
              }}
            >
              Central de Gestão<br />do NovaesWeb CRM IA
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: "14px",
                lineHeight: 1.6,
                color: "rgba(226, 232, 240, 0.75)",
                margin: 0,
                maxWidth: "460px"
              }}
            >
              Administre planos, clientes, IA, WhatsApp, funcionalidades e toda a operação da plataforma em um só lugar.
            </p>

            {/* 4 Feature Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "10px",
                marginTop: "12px"
              }}
            >
              {/* Card 1 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Users size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Clientes e<br />Empresas
                </span>
              </div>

              {/* Card 2 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Layers size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Planos e<br />Franquias
                </span>
              </div>

              {/* Card 3 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <Bot size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  IA e<br />Modelos
                </span>
              </div>

              {/* Card 4 */}
              <div
                style={{
                  background: "rgba(24, 12, 32, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "16px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: "8px",
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)"
                }}
              >
                <BarChart3 size={22} style={{ color: "#f1f5f9" }} />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 }}>
                  Relatórios e<br />Uso
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Frosted Glass Login Card */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: "100%",
                maxWidth: "430px",
                background: "rgba(24, 12, 34, 0.68)",
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "28px",
                padding: "36px 32px",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.65), 0 0 32px rgba(217, 70, 239, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16)"
              }}
            >
              {/* Crown Icon Emblem */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  margin: "0 auto 16px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)",
                  boxShadow: "0 6px 20px rgba(192, 38, 211, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Crown size={24} style={{ color: "#fef08a" }} />
              </div>

              {/* Title and Subtitle */}
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#ffffff",
                  textAlign: "center",
                  margin: 0,
                  letterSpacing: "-0.3px"
                }}
              >
                Acesso ao Painel Master
              </h2>
              <p
                style={{
                  fontSize: "13px",
                  color: "#c4b5fd",
                  textAlign: "center",
                  margin: "4px 0 24px",
                  fontWeight: 500
                }}
              >
                NovaesWeb CRM IA
              </p>

              {/* Form */}
              <form onSubmit={handleMasterLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Input 1: E-mail do administrador */}
                <div style={{ position: "relative", width: "100%" }}>
                  <Mail
                    size={18}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none"
                    }}
                  />
                  <input
                    type="email"
                    placeholder="E-mail do administrador"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "13px 14px 13px 44px",
                      background: "rgba(12, 6, 18, 0.7)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: "12px",
                      color: "#ffffff",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s"
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#d946ef";
                      e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Input 2: Senha */}
                <div style={{ position: "relative", width: "100%" }}>
                  <Lock
                    size={18}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none"
                    }}
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Senha"
                    value={adminPassword}
                    onChange={e => {
                      setAdminPassword(e.target.value);
                      setInputKey(e.target.value);
                    }}
                    required
                    style={{
                      width: "100%",
                      padding: "13px 44px 13px 44px",
                      background: "rgba(12, 6, 18, 0.7)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      borderRadius: "12px",
                      color: "#ffffff",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s"
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#d946ef";
                      e.target.style.boxShadow = "0 0 0 3px rgba(217, 70, 239, 0.25)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.14)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Row: Manter-me conectado & Esqueceu a senha? */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "4px",
                    fontSize: "13px"
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      userSelect: "none"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      style={{
                        accentColor: "#d946ef",
                        width: "16px",
                        height: "16px",
                        cursor: "pointer"
                      }}
                    />
                    <span>Manter-me conectado</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#c084fc",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "none",
                      fontWeight: 500
                    }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                {/* Primary Button: Entrar no Painel Master */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "13px 20px",
                    borderRadius: "12px",
                    border: "none",
                    marginTop: "10px",
                    cursor: loading ? "wait" : "pointer",
                    background: "linear-gradient(90deg, #ff1e42 0%, #e11d48 35%, #a824e8 100%)",
                    boxShadow: "0 6px 22px rgba(225, 29, 72, 0.4)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "15px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      e.currentTarget.style.filter = "brightness(1.08)";
                      e.currentTarget.style.boxShadow = "0 8px 26px rgba(225, 29, 72, 0.55)";
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.filter = "none";
                    e.currentTarget.style.boxShadow = "0 6px 22px rgba(225, 29, 72, 0.4)";
                  }}
                >
                  <LogIn size={18} />
                  <span>{loading ? "Verificando..." : "Entrar no Painel Master"}</span>
                </button>
              </form>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "rgba(225, 29, 72, 0.15)",
                    border: "1px solid rgba(225, 29, 72, 0.4)",
                    color: "#fecdd3",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <AlertCircle size={16} style={{ color: "#fb7185", flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Security Footer Note */}
              <div
                style={{
                  marginTop: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: "rgba(203, 213, 225, 0.65)",
                  fontSize: "12px",
                  textAlign: "center"
                }}
              >
                <ShieldCheck size={16} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <span>Acesso seguro e restrito aos gestores da NovaesWeb.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Esqueceu a Senha */}
        {forgotModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(12px)"
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "460px",
                background: "#160b24",
                border: "1px solid rgba(236, 72, 153, 0.4)",
                borderRadius: "20px",
                padding: "28px",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
                position: "relative"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Crown size={20} style={{ color: "#ec4899" }} />
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                    Recuperação de Acesso Master
                  </h3>
                </div>
                <button
                  onClick={() => setForgotModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ color: "#cbd5e1", fontSize: "13.5px", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ margin: 0 }}>
                  O acesso Master é restrito e autenticado pelo segredo criptográfico configurado nas variáveis de ambiente do servidor.
                </p>

                <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>
                  Solicite a recuperação ao responsável pela administração da NovaesWeb. As credenciais de acesso não são exibidas no painel.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                style={{
                  width: "100%",
                  marginTop: "20px",
                  padding: "11px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(90deg, #ec4899, #a855f7)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                Voltar para o Login
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="nw-layout-shell">
      {/* MENU LATERAL FIXO MASTER (SIDEBAR) */}
      <aside className="nw-sidebar">
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
            <small style={{display: "block", fontSize: "10px", color: "#f43f5e", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase"}}>
              Painel Master
            </small>
          </div>
        </div>

        {/* Navegação Master */}
        <nav className="nw-sidebar-nav" aria-label="Menu do Master">
          <button
            type="button"
            className={`nw-nav-button ${currentNav === "clients" ? "active" : ""}`}
            aria-current={currentNav === "clients" ? "page" : undefined}
            onClick={() => navigateSection("clients")}
          >
            <Building2 size={19}/>
            <span>Lojas &amp; Clientes</span>
            <span style={{marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
              {clients.length}
            </span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "plans" ? "active" : ""}`}
            aria-current={currentNav === "plans" ? "page" : undefined}
            onClick={() => navigateSection("plans")}
          >
            <CreditCard size={19}/>
            <span>Planos &amp; Franquias</span>
            <span style={{marginLeft: "auto", background: "rgba(236, 72, 153, 0.2)", color: "#ec4899", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700}}>
              {plans.length}
            </span>
          </button>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "kpis" ? "active" : ""}`}
            aria-current={currentNav === "kpis" ? "page" : undefined}
            onClick={() => navigateSection("kpis")}
          >
            <DollarSign size={19}/>
            <span>Faturamento &amp; Métricas</span>
          </button>

          <div style={{height: "1px", background: "rgba(255,255,255,0.08)", margin: "10px 4px"}}/>

          <button
            type="button"
            className={`nw-nav-button ${currentNav === "crm" ? "active" : ""}`}
            aria-current={currentNav === "crm" ? "page" : undefined}
            onClick={() => navigateSection("crm")}
          >
            <Crown size={19}/><span>CRM NovaesWeb</span>
          </button>
          <button
            type="button"
            className={`nw-nav-button ${currentNav === "providers" ? "active" : ""}`}
            aria-current={currentNav === "providers" ? "page" : undefined}
            onClick={() => navigateSection("providers")}
          >
            <BrainCircuit size={19}/><span>Provedores de IA</span>
          </button>
        </nav>

        {/* Rodapé da Sidebar Master */}
        <div className="nw-sidebar-footer">
          <div style={{
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            borderRadius: "12px",
            padding: "12px 14px",
            fontSize: "12px"
          }}>
            <div style={{display: "flex", alignItems: "center", gap: "8px", color: "#f43f5e", fontWeight: 700, marginBottom: "4px"}}>
              <ShieldCheck size={16}/> Central de Comando
            </div>
            <p style={{margin: 0, color: "#9ca3af", fontSize: "11px", lineHeight: "1.4"}}>
              Os clientes acessam seus painéis sem permissão de ver esta central.
            </p>
          </div>

          <button
            type="button"
            onClick={handleMasterLogout}
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
            <LogOut size={16}/> Sair do Master
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL MASTER */}
      <main className="nw-main-content">
        {/* Top Header */}
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "16px"}}>
          <div>
            <h1 style={{fontSize: "28px", fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px"}}>
              {MASTER_SECTIONS[currentNav].title}
            </h1>
            <p style={{color: "#c2bed4", margin: 0, fontSize: "14px"}}>
              {MASTER_SECTIONS[currentNav].description}
            </p>
          </div>
          <div style={{display: "flex", gap: "10px"}}>
            {currentNav === "plans" && (
              <>
                <button
                  className="op-primary"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px", fontWeight: 700, borderRadius: "10px"}}
                  onClick={handleOpenCreatePlan}
                >
                  <PlusCircle size={18}/> + Novo Plano
                </button>
                <button
                  className="op-refresh"
                  style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px"}}
                  onClick={handleOpenAuditHistory}
                >
                  <History size={16}/> Histórico
                </button>
              </>
            )}
            {currentNav === "clients" && (
              <button
                className="op-primary"
                style={{display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", fontWeight: 700, borderRadius: "10px"}}
                onClick={() => setFormOpen(!formOpen)}
              >
                <PlusCircle size={18}/> {formOpen ? "Fechar Formulário" : "+ Novo Cliente"}
              </button>
            )}
            {["clients", "plans", "kpis"].includes(currentNav) && (
              <button className="op-refresh" onClick={() => { void fetchClients(); void fetchPlans(); }} disabled={loading}>
                <RefreshCw size={16}/> Atualizar
              </button>
            )}
          </div>
        </div>

        {/* FEEDBACKS */}
        {error && (
          <div className="op-card" style={{border: "1px solid #f43f5e", background: "rgba(80, 16, 28, 0.8)", color: "#ffccd5", padding: "14px 18px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px"}}>
            <AlertCircle size={20} color="#f43f5e"/>
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="op-card" style={{border: "1px solid #00db8c", background: "rgba(6, 43, 30, 0.8)", color: "#b9f5dc", padding: "14px 18px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px"}}>
            <CheckCircle2 size={20} color="#00db8c"/>
            <span>{notice}</span>
          </div>
        )}

        {currentNav === "providers" && <ProvidersWorkspace />}
        {currentNav === "crm" && <ClientWorkspace embedded initialTenant="novaesweb" />}

        {/* FILA DE SOLICITAÇÕES DE UPGRADE DOS CLIENTES */}
        {currentNav === "clients" && upgradeRequests.filter(r => r.status === "pending").length > 0 && (
          <div
            className="op-card"
            style={{
              marginBottom: "22px",
              padding: "18px 22px",
              border: "1px solid rgba(245, 158, 11, 0.5)",
              background: "rgba(45, 28, 10, 0.45)"
            }}
          >
            <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px"}}>
              <Sparkles size={20} color="#fbbf24"/>
              <h3 style={{margin: 0, fontSize: "16px", fontWeight: 800, color: "#fef08a"}}>
                Solicitações de Upgrade Pendentes ({upgradeRequests.filter(r => r.status === "pending").length})
              </h3>
            </div>
            <div style={{display: "flex", flexDirection: "column", gap: "10px"}}>
              {upgradeRequests
                .filter(r => r.status === "pending")
                .map(reqItem => (
                  <div
                    key={reqItem.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}
                  >
                    <div>
                      <strong style={{color: "#fff", fontSize: "14px"}}>
                        {reqItem.storeName}
                      </strong>{" "}
                      <span style={{fontSize: "12px", color: "#cbd5e1"}}>
                        solicitou upgrade de <strong>{reqItem.currentPlanName}</strong> para{" "}
                        <strong style={{color: "#ec4899"}}>{reqItem.targetPlanName}</strong>
                      </span>
                      {reqItem.reason && (
                        <small style={{display: "block", color: "#9ca3af", marginTop: "3px"}}>
                          Motivo/Recurso desejado: {reqItem.reason}
                        </small>
                      )}
                    </div>
                    <div style={{display: "flex", gap: "8px"}}>
                      <button
                        type="button"
                        className="op-primary"
                        disabled={resolvingUpgradeId === reqItem.id}
                        onClick={() => handleResolveUpgradeRequest(reqItem, "approved")}
                        style={{padding: "7px 14px", fontSize: "12px", background: "#00db8c", color: "#052e16", fontWeight: 800, borderRadius: "8px"}}
                      >
                        ✅ Aprovar &amp; Ativar {reqItem.targetPlanName}
                      </button>
                      <button
                        type="button"
                        className="op-refresh"
                        disabled={resolvingUpgradeId === reqItem.id}
                        onClick={() => handleResolveUpgradeRequest(reqItem, "rejected")}
                        style={{padding: "7px 12px", fontSize: "12px", color: "#f43f5e", borderRadius: "8px"}}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ===================== VIEW: PLANOS & FRANQUIAS ===================== */}
        {currentNav === "plans" && (
          <section>
            <div style={{
              background: "linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.12))",
              border: "1px solid rgba(236, 72, 153, 0.3)",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <Zap size={24} color="#ec4899"/>
              <div style={{fontSize: "14px", color: "#e2e8f0", lineHeight: "1.5"}}>
                <strong>Sincronização Automática Master:</strong> Ao editar um plano e confirmar a aplicação, as novas cotas e recursos são refletidos automaticamente em todas as lojas vinculadas elegíveis, preservando com segurança as exceções contratuais individuais.
              </div>
            </div>

            {/* Grid dos Planos */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "24px",
              marginBottom: "36px"
            }}>
              {plans.map(p => {
                const enrolled = clientCountsMap[p.id] ?? planDistribution[p.name] ?? 0;
                const allowedFeats = p.allowedFeatures || [];
                const isActive = p.isActive !== false;
                return (
                  <div
                    key={p.id}
                    className="op-card"
                    style={{
                      position: "relative",
                      background: p.isPopular
                        ? "linear-gradient(145deg, #231638, #140e24)"
                        : "linear-gradient(145deg, #181427, #110d1d)",
                      border: p.isPopular ? "2px solid #ec4899" : isActive ? "1px solid #3d335c" : "1px dashed #574b6f",
                      boxShadow: p.isPopular ? "0 0 32px rgba(236, 72, 153, 0.22), 0 0 8px rgba(244, 63, 94, 0.3)" : undefined,
                      borderRadius: "18px",
                      padding: "26px",
                      display: "flex",
                      flexDirection: "column",
                      opacity: isActive ? 1 : 0.65
                    }}
                  >
                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                        <span style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "#c2bed4",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 700,
                          fontFamily: "monospace"
                        }}>
                          ID: {p.id}
                        </span>
                        {!isActive && (
                          <span style={{
                            background: "rgba(244, 63, 94, 0.2)",
                            color: "#f43f5e",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            DESATIVADO
                          </span>
                        )}
                        {p.hasDraft && (
                          <span style={{
                            background: "rgba(245, 158, 11, 0.2)",
                            color: "#f59e0b",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            RASCUNHO PENDENTE
                          </span>
                        )}
                      </div>

                      {p.isPopular && (
                        <span style={{
                          background: "var(--grad-primary)",
                          color: "white",
                          padding: "5px 14px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "0.5px",
                          boxShadow: "0 0 16px rgba(244, 63, 94, 0.45)"
                        }}>
                          ⭐ MAIS RECOMENDADO
                        </span>
                      )}
                    </div>

                    <div style={{marginBottom: "12px"}}>
                      <h3 style={{fontSize: "22px", fontWeight: 800, margin: "0 0 6px", color: "white"}}>{p.name}</h3>
                      <p style={{fontSize: "13px", color: "#c2bed4", margin: 0, minHeight: "36px"}}>{p.description}</p>
                    </div>

                    <div style={{marginBottom: "16px"}}>
                      <span style={{fontSize: "13px", color: "#9ca3af"}}>R$</span>
                      <strong style={{fontSize: "34px", color: "white", marginLeft: "4px"}}>{p.price}</strong>
                      <span style={{fontSize: "13px", color: "#9ca3af"}}>/mês</span>
                    </div>

                    {/* Franquia & Limites Técnicos */}
                    <div style={{
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      marginBottom: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                        <span style={{fontSize: "13px", color: "#e2e8f0", fontWeight: 600}}>
                          Franquia com IA:
                        </span>
                        <strong style={{fontSize: "14px", color: "#ec4899"}}>
                          {p.quotaLimit.toLocaleString("pt-BR")} atendimentos / mês
                        </strong>
                      </div>
                      <small style={{fontSize: "11px", color: "#9ca3af", margin: "-2px 0 2px"}}>
                        (1 atendimento = 1 conversa ativa em 24h)
                      </small>
                      <div style={{display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af"}}>
                        <span>Operadores: <strong style={{color: "white"}}>{p.maxOperators || 1}</strong></span>
                        <span>WhatsApps: <strong style={{color: "white"}}>{p.maxWhatsAppConnections || 1}</strong></span>
                      </div>
                    </div>

                    {/* Benefícios Reais e Incluídos */}
                    <div style={{marginBottom: "18px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px", flex: 1}}>
                      <strong style={{display: "block", fontSize: "12px", color: "#a599c2", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px"}}>
                        Recursos e Benefícios Incluídos:
                      </strong>
                      <ul style={{listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px"}}>
                        {p.features.map(f => (
                          <li key={f} style={{display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12.5px", color: "#e2e8f0", lineHeight: 1.4}}>
                            <Check size={14} color="#00db8c" style={{flexShrink: 0, marginTop: "2px"}}/>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Lojas vinculadas e Botões de Ação */}
                    <div style={{borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px"}}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px"}}>
                        <span style={{fontSize: "12px", color: "#9ca3af"}}>
                          Lojas neste plano: <strong style={{color: "white"}}>{enrolled}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleViewEnrolledStores(p)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ec4899",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <Eye size={13}/> Ver Lojas ({enrolled})
                        </button>
                      </div>

                      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"}}>
                        <button
                          type="button"
                          className="op-primary"
                          style={{padding: "8px", fontSize: "12px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"}}
                          onClick={() => handleOpenEditPlan(p)}
                        >
                          <Edit3 size={14}/> Editar
                        </button>
                        <button
                          type="button"
                          className="op-refresh"
                          style={{padding: "8px", fontSize: "12px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"}}
                          onClick={() => handleOpenDuplicate(p)}
                        >
                          <Copy size={14}/> Duplicar
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTogglePlanStatus(p)}
                        style={{
                          width: "100%",
                          marginTop: "8px",
                          padding: "6px",
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "8px",
                          color: isActive ? "#9ca3af" : "#00db8c",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        {isActive ? "Desativar Plano" : "Ativar Plano"}
                      </button>

                      {p.hasDraft && (
                        <button
                          type="button"
                          onClick={() => handleDiscardDraft(p.id)}
                          style={{
                            width: "100%",
                            marginTop: "6px",
                            padding: "6px",
                            background: "rgba(245, 158, 11, 0.08)",
                            border: "1px dashed rgba(245, 158, 11, 0.35)",
                            borderRadius: "8px",
                            color: "#f59e0b",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer"
                          }}
                        >
                          Descartar Rascunho Pendente
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabela de Lojas e Seus Planos */}
            <div className="op-card" style={{padding: "24px"}}>
              <h3 style={{fontSize: "18px", fontWeight: 800, margin: "0 0 8px", color: "white"}}>
                Atribuição Rápida de Planos por Loja
              </h3>
              <p style={{fontSize: "13px", color: "#9ca3af", margin: "0 0 16px"}}>
                Alterne o plano contratado ou defina uma exceção contratual individual para qualquer loja.
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
                {clients.map(c => {
                  const hasException = Boolean(c.plan.customQuotaOverride);
                  return (
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
                        gap: "12px"
                      }}
                    >
                      <div>
                        <strong style={{fontSize: "15px", color: "white"}}>{c.name}</strong>
                        <small style={{display: "block", color: "#8e87a2", fontSize: "12px"}}>{c.email}</small>
                        {hasException && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#f59e0b",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            ⚠️ Exceção Contratual: {c.plan.customQuotaOverride} msgs ({c.plan.exceptionReason || "Personalizado"})
                          </span>
                        )}
                        {Boolean(c.plan.contractedPlan) && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            marginLeft: hasException ? "6px" : "0",
                            background: "rgba(59, 130, 246, 0.15)",
                            color: "#60a5fa",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            🔒 Contrato Congelado (v{c.plan.contractedPlan?.version}: {c.plan.contractedPlan?.quotaLimit} msgs)
                          </span>
                        )}
                        {Boolean(c.plan.pendingPlanUpdate) && (
                          <span style={{
                            display: "inline-block",
                            marginTop: "4px",
                            marginLeft: "6px",
                            background: "rgba(168, 85, 247, 0.15)",
                            color: "#c084fc",
                            border: "1px solid rgba(168, 85, 247, 0.3)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}>
                            ⏳ Transição Agendada: {c.plan.pendingPlanUpdate?.quotaLimit} msgs em {c.plan.pendingPlanUpdate?.effectiveAt}
                          </span>
                        )}
                      </div>

                      <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                        <span style={{
                          background: "rgba(236, 72, 153, 0.15)",
                          color: "#ec4899",
                          padding: "4px 12px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 700
                        }}>
                          {c.plan.name} (R$ {c.plan.price})
                        </span>

                        <button
                          type="button"
                          className="op-primary"
                          style={{padding: "8px 14px", fontSize: "12px", borderRadius: "8px"}}
                          onClick={() => handleOpenAssignModal(c)}
                        >
                          Alterar Plano
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===================== VIEW: LOJAS & CLIENTES ===================== */}
        {currentNav === "clients" && (
          <section>
            {/* FORMULÁRIO DE CADASTRO DE CLIENTE */}
            {formOpen && (
              <div className="op-card" style={{padding: "26px", marginBottom: "26px", border: "1px solid #ec4899", boxShadow: "0 8px 30px rgba(236,72,153,0.15)"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <PlusCircle size={22} color="#ec4899"/>
                    <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Cadastrar Nova Loja / Cliente</h3>
                  </div>
                  <button type="button" className="op-refresh" onClick={() => setFormOpen(false)} style={{padding: "4px 12px", fontSize: "12px"}}>
                    Cancelar
                  </button>
                </div>

                <form onSubmit={handleCreateClient} style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px"}}>
                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Nome da Loja</label>
                    <input
                      type="text"
                      placeholder="Ex: Pizzaria Forno & Sabor"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>E-mail de Login do Cliente</label>
                    <input
                      type="email"
                      placeholder="cliente@pizzaria.com.br"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Senha de Acesso do Lojista</label>
                    <input
                      type="password"
                      placeholder="Mínimo 6 dígitos"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Plano Comercial</label>
                    <select
                      value={planName}
                      onChange={e => {
                        if (e.target.value === "crm-trial" || e.target.value === "Teste Grátis (7 Dias)") {
                          setPlanName("Teste Grátis (7 Dias)");
                          setPlanPrice("0,00");
                          setQuotaLimit(100);
                          const trialExp = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                          setDueDate(trialExp);
                          setPaymentStatus("paid");
                          return;
                        }
                        const sel = plans.find(p => p.name === e.target.value);
                        if (sel) {
                          setPlanName(sel.name);
                          setPlanPrice(sel.price);
                          setQuotaLimit(sel.quotaLimit);
                        }
                      }}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    >
                      <option value="crm-trial">🎁 Teste Grátis (7 Dias — 100 atendimentos)</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.name}>
                          {p.name} — R$ {p.price}/mês ({p.quotaLimit.toLocaleString("pt-BR")} msgs)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Primeiro Vencimento</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      required
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: "13px", color: "var(--muted)", display: "block", marginBottom: "4px"}}>Status do Pagamento</label>
                    <select
                      value={paymentStatus}
                      onChange={e => setPaymentStatus(e.target.value as "paid" | "pending")}
                      style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    >
                      <option value="paid">PAGO (Acesso Liberado)</option>
                      <option value="pending">PENDENTE (Aguardando)</option>
                    </select>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", padding: "10px 0"}}>
                    <input
                      type="checkbox"
                      id="autoBlock"
                      checked={autoBlock}
                      onChange={e => setAutoBlock(e.target.checked)}
                      style={{width: "18px", height: "18px", accentColor: "#ec4899"}}
                    />
                    <label htmlFor="autoBlock" style={{fontSize: "14px", color: "#e2e8f0", cursor: "pointer"}}>
                      <strong>Bloqueio Automático por Inadimplência:</strong> Suspender automaticamente as respostas da IA caso a mensalidade vença sem confirmação de pagamento.
                    </label>
                  </div>

                  <div style={{gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "12px"}}>
                    <button type="submit" className="op-primary" disabled={creating} style={{padding: "14px 28px", fontWeight: 700, borderRadius: "10px"}}>
                      {creating ? "Criando Loja e Instância..." : "Confirmar Cadastro do Cliente"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* BARRA DE FILTROS & BUSCA */}
            <div style={{display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center"}}>
              <div style={{position: "relative", flex: 1, minWidth: "260px"}}>
                <Search size={18} color="#8e87a2" style={{position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)"}}/>
                <input
                  type="text"
                  placeholder="Pesquisar loja por nome ou e-mail..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{width: "100%", padding: "12px 14px 12px 42px", borderRadius: "10px", border: "1px solid #332b49", background: "#151222", color: "white", fontSize: "14px"}}
                />
              </div>

              <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "all" ? "active" : ""}`}
                  onClick={() => setFilterStatus("all")}
                >
                  Todos ({clients.length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "active" ? "active" : ""}`}
                  onClick={() => setFilterStatus("active")}
                >
                  Em Dia ({clients.filter(c => c.status === "active" && !c.plan.isOverdue).length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "overdue" ? "active" : ""}`}
                  onClick={() => setFilterStatus("overdue")}
                  style={{borderColor: filterStatus === "overdue" ? "#f59e0b" : undefined}}
                >
                  Atrasados ({clients.filter(c => c.plan.isOverdue).length})
                </button>
                <button
                  type="button"
                  className={`op-filter-chip ${filterStatus === "suspended" ? "active" : ""}`}
                  onClick={() => setFilterStatus("suspended")}
                  style={{borderColor: filterStatus === "suspended" ? "#f43f5e" : undefined}}
                >
                  Bloqueados ({clients.filter(c => c.status === "suspended").length})
                </button>
              </div>
            </div>

            {/* LISTA DE LOJAS CADASTRADAS */}
            <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>
              {filteredClients.length === 0 ? (
                <div className="op-card" style={{padding: "40px", textAlign: "center", color: "#8e87a2"}}>
                  <Users size={36} style={{margin: "0 auto 12px", opacity: 0.5}}/>
                  <p style={{margin: 0, fontSize: "15px"}}>Nenhuma loja encontrada com os filtros selecionados.</p>
                </div>
              ) : (
                filteredClients.map(client => {
                  const isBlocked = client.status === "suspended";
                  const isOverdue = client.plan.isOverdue;
                  const hasException = Boolean(client.plan.customQuotaOverride);

                  return (
                    <div
                      key={client.id}
                      className="op-card"
                      style={{
                        padding: "20px 24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "18px",
                        borderLeft: isBlocked ? "4px solid #f43f5e" : isOverdue ? "4px solid #f59e0b" : "4px solid #00db8c"
                      }}
                    >
                      <div style={{display: "flex", alignItems: "center", gap: "16px", minWidth: "260px"}}>
                        <div style={{
                          width: "48px", height: "48px", borderRadius: "12px",
                          background: isBlocked ? "rgba(244,63,94,0.15)" : "rgba(236,72,153,0.15)",
                          display: "grid", placeItems: "center",
                          color: isBlocked ? "#f43f5e" : "#ec4899",
                          fontWeight: 800, fontSize: "18px"
                        }}>
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>

                        <div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                            <strong style={{fontSize: "17px", color: "white"}}>{client.name}</strong>
                            {client.isMasterOwnTenant && (
                              <span style={{
                                background: "rgba(251, 191, 36, 0.2)",
                                color: "#fbbf24",
                                border: "1px solid rgba(251, 191, 36, 0.4)",
                                padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 800
                              }}>
                                👑 OPERAÇÃO PRÓPRIA MASTER
                              </span>
                            )}
                            <span style={{
                              background: isBlocked ? "rgba(244,63,94,0.2)" : isOverdue ? "rgba(245,158,11,0.2)" : "rgba(0,219,140,0.2)",
                              color: isBlocked ? "#f43f5e" : isOverdue ? "#f59e0b" : "#00db8c",
                              padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700
                            }}>
                              {isBlocked ? "SUSPENSO / BLOQUEADO" : isOverdue ? "PAGAMENTO PENDENTE" : "ATIVO"}
                            </span>
                          </div>

                          <span style={{fontSize: "13px", color: "#8e87a2", display: "block", marginTop: "2px"}}>
                            Login: <strong>{client.email}</strong>
                          </span>

                          <div style={{display: "flex", alignItems: "center", gap: "12px", marginTop: "6px", fontSize: "12px", color: "#b3a9c7", flexWrap: "wrap"}}>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Smartphone size={13} color={client.whatsappStatus === "connected" ? "#00db8c" : "#8e87a2"}/>
                              WhatsApp: <strong>{client.connectedWhatsappCount ?? (client.whatsappStatus === "connected" ? 1 : 0)}/{client.maxWhatsappConnections ?? client.plan.maxWhatsappConnections ?? 1}</strong> (de 5 espaços)
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Users size={13} color="#a855f7"/>
                              Operadores: <strong>{client.operatorsCount ?? 1}/{client.maxOperators ?? client.plan.maxOperators ?? 1}</strong>
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Bot size={13} color="#ec4899"/>
                              Consumo IA: <strong>{client.plan.quotaUsed ?? 0}/{client.plan.customQuotaOverride || client.plan.quotaLimit || 200}</strong>
                            </span>
                            <span>•</span>
                            <span style={{display: "flex", alignItems: "center", gap: "4px"}}>
                              <Calendar size={13}/> Vence em: {client.plan.dueDate}
                            </span>
                          </div>

                          {isBlocked && (client.plan.adminSuspensionReason || client.plan.adminInternalNote) && (
                            <div style={{marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px"}}>
                              {client.plan.adminSuspensionReason && (
                                <span style={{fontSize: "11.5px", color: "#fda4af"}}>
                                  🚫 <strong>Motivo público (exibido ao cliente):</strong> {client.plan.adminSuspensionReason}
                                </span>
                              )}
                              {client.plan.adminInternalNote && (
                                <span style={{fontSize: "11.5px", color: "#fbbf24"}}>
                                  🔒 <strong>Nota interna Master:</strong> {client.plan.adminInternalNote}
                                </span>
                              )}
                            </div>
                          )}

                          {hasException && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                ⚠️ Exceção Contratual: {client.plan.customQuotaOverride} msgs ({client.plan.exceptionReason || "Personalizado"})
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.contractedPlan) && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#60a5fa",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                🔒 Contrato Congelado (v{client.plan.contractedPlan?.version}: {client.plan.contractedPlan?.quotaLimit} msgs)
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.pendingPlanUpdate) && (
                            <div style={{marginTop: "6px"}}>
                              <span style={{
                                background: "rgba(168, 85, 247, 0.15)",
                                color: "#c084fc",
                                border: "1px solid rgba(168, 85, 247, 0.3)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 700
                              }}>
                                ⏳ Transição Agendada: {client.plan.pendingPlanUpdate?.quotaLimit} msgs em {client.plan.pendingPlanUpdate?.effectiveAt}
                              </span>
                            </div>
                          )}
                          {Boolean(client.plan.isTrial) && (
                            <div style={{marginTop: "6px"}}>
                              {client.plan.trialStatus === "expired" ? (
                                <span style={{
                                  background: "rgba(239, 68, 68, 0.2)",
                                  color: "#f87171",
                                  border: "1px solid rgba(239, 68, 68, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  ⚠️ Teste Expirado (7 dias esgotados)
                                </span>
                              ) : client.plan.trialStatus === "quota_exhausted" ? (
                                <span style={{
                                  background: "rgba(245, 158, 11, 0.2)",
                                  color: "#fbbf24",
                                  border: "1px solid rgba(245, 158, 11, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  🚫 Limite do Teste Atingido (100/100)
                                </span>
                              ) : (
                                <span style={{
                                  background: "rgba(168, 85, 247, 0.2)",
                                  color: "#c084fc",
                                  border: "1px solid rgba(168, 85, 247, 0.4)",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 800
                                }}>
                                  🎁 Teste Grátis — {client.plan.trialDaysLeft ?? 7}d restantes
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Informações do Plano & Ações Rápidas */}
                      <div style={{display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap"}}>
                        <div style={{textAlign: "right", marginRight: "6px"}}>
                          <span style={{
                            display: "inline-block",
                            background: client.plan.isTrial ? "rgba(168, 85, 247, 0.15)" : "rgba(236, 72, 153, 0.15)",
                            color: client.plan.isTrial ? "#c084fc" : "#ec4899",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 700
                          }}>
                            {client.plan.name}
                          </span>
                          <strong style={{display: "block", fontSize: "16px", color: "white", marginTop: "2px"}}>
                            {client.plan.isTrial ? "Gratuito (7 dias)" : `R$ ${client.plan.price}/mês`}
                          </strong>
                          <small style={{color: "#8e87a2", fontSize: "11px"}}>
                            {client.plan.isTrial ? "100 atendimentos de teste" : `${client.plan.customQuotaOverride || client.plan.quotaLimit || 200} atendimentos`}
                          </small>
                        </div>

                        {/* Botões de Ação */}
                        <div style={{display: "flex", gap: "6px", flexWrap: "wrap"}}>
                          {client.plan.isTrial && (
                            <button
                              type="button"
                              className="op-primary"
                              title="Converter Teste em Plano Pago Definitivo"
                              style={{
                                padding: "8px 12px",
                                background: "var(--grad-primary)",
                                color: "white",
                                fontSize: "12px",
                                fontWeight: 800,
                                borderRadius: "8px",
                                boxShadow: "0 0 12px rgba(236, 72, 153, 0.35)"
                              }}
                              onClick={() => handleOpenAssignModal(client)}
                            >
                              ⭐ Converter p/ Pago
                            </button>
                          )}
                          {client.plan.status === "paid" ? (
                            <button
                              type="button"
                              className="op-refresh"
                              title="Marcar como Pagamento Pendente"
                              style={{padding: "8px 12px", color: "#f59e0b"}}
                              onClick={() => handleSetPaymentStatus(client, "pending")}
                            >
                              Pendente
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="op-primary"
                              title="Confirmar Pagamento Recebido"
                              style={{padding: "8px 12px", background: "#00db8c", color: "#000"}}
                              onClick={() => handleSetPaymentStatus(client, "paid")}
                            >
                              Marcar Pago
                            </button>
                          )}

                          <button
                            type="button"
                            className="op-refresh"
                            title="Alterar Plano da Loja"
                            style={{padding: "8px 12px"}}
                            onClick={() => handleOpenAssignModal(client)}
                          >
                            <CreditCard size={15}/>
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title="Redefinir Senha do Cliente"
                            style={{padding: "8px 12px"}}
                            onClick={() => {
                              setResetUserId(client.userId || client.id);
                              setResetStoreName(client.name);
                              setNewPassword("");
                              setResetModalOpen(true);
                            }}
                          >
                            <KeyRound size={15}/>
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title={isBlocked ? "Desbloquear Loja" : "Bloquear Loja"}
                            style={{padding: "8px 12px", color: isBlocked ? "#00db8c" : "#f43f5e"}}
                            onClick={() => handleToggleBlock(client)}
                          >
                            {isBlocked ? <RotateCcw size={15}/> : <Ban size={15}/>}
                          </button>

                          <button
                            type="button"
                            className="op-refresh"
                            title="Apagar Loja"
                            style={{padding: "8px 12px", color: "#f43f5e"}}
                            onClick={() => handleDeleteClient(client)}
                          >
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ===================== VIEW: FATURAMENTO & KPIS ===================== */}
        {currentNav === "kpis" && (
          <section>
            <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "18px", marginBottom: "26px"}}>
              <div className="op-card" style={{padding: "20px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Total de Clientes</span>
                <strong style={{display: "block", fontSize: "32px", color: "white", marginTop: "4px"}}>{kpis.total}</strong>
                <small style={{color: "#00db8c", fontSize: "12px"}}>Lojistas cadastrados</small>
              </div>

              <div className="op-card" style={{padding: "20px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>WhatsApps Conectados</span>
                <strong style={{display: "block", fontSize: "32px", color: "#00db8c", marginTop: "4px"}}>{kpis.connected}</strong>
                <small style={{color: "#9ca3af", fontSize: "12px"}}>Operando com NovaesWeb IA</small>
              </div>

              <div className="op-card" style={{padding: "20px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Receita Mensal Recorrente</span>
                <strong style={{display: "block", fontSize: "32px", color: "#ec4899", marginTop: "4px"}}>
                  R$ {kpis.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </strong>
                <small style={{color: "#9ca3af", fontSize: "12px"}}>Faturamento estimado mensal</small>
              </div>

              <div className="op-card" style={{padding: "20px"}}>
                <span style={{fontSize: "12px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px"}}>Lojas com Pendência/Bloqueio</span>
                <strong style={{display: "block", fontSize: "32px", color: kpis.blocked > 0 ? "#f43f5e" : "#9ca3af", marginTop: "4px"}}>
                  {kpis.blocked}
                </strong>
                <small style={{color: "#9ca3af", fontSize: "12px"}}>Mensalidade atrasada ou suspensa</small>
              </div>
            </div>

            <div className="op-card" style={{padding: "24px"}}>
              <h3 style={{fontSize: "18px", fontWeight: 800, margin: "0 0 16px", color: "white"}}>Distribuição de Clientes por Plano</h3>
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px"}}>
                {plans.map(p => {
                  const count = clientCountsMap[p.id] ?? planDistribution[p.name] ?? 0;
                  const priceVal = parseFloat(p.price.replace(/\./g, "").replace(",", ".")) || 0;
                  const totalPlanRev = count * priceVal;
                  return (
                    <div key={p.id} style={{padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid #332b49"}}>
                      <strong style={{fontSize: "16px", color: "white", display: "block"}}>{p.name}</strong>
                      <span style={{fontSize: "13px", color: "#ec4899", fontWeight: 700}}>R$ {p.price}/mês</span>
                      <div style={{marginTop: "10px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af"}}>
                        <span>Lojas ativas:</span>
                        <strong style={{color: "white"}}>{count}</strong>
                      </div>
                      <div style={{marginTop: "4px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#9ca3af"}}>
                        <span>Receita gerada:</span>
                        <strong style={{color: "#00db8c"}}>R$ {totalPlanRev.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ===================== MODAIS ===================== */}

        {/* MODAL 1: EDITAR / CRIAR PLANO */}
        {editPlanModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto",
              padding: "28px", borderColor: "#ec4899"
            }}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <Edit3 size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>
                  {isCreatingNewPlan ? "Criar Novo Plano Comercial" : `Editar Plano: ${editingPlan.name}`}
                </h3>
              </div>

              <div style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>ID do Plano (Slug estável)</label>
                    <input
                      type="text"
                      disabled={!isCreatingNewPlan}
                      value={editingPlan.id}
                      onChange={e => setEditingPlan({ ...editingPlan, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: isCreatingNewPlan ? "#121222" : "#1a1628", color: "white", fontFamily: "monospace"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Nome Comercial</label>
                    <input
                      type="text"
                      value={editingPlan.name}
                      onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                </div>

                <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Preço Mensal (R$)</label>
                    <input
                      type="text"
                      value={editingPlan.price}
                      onChange={e => setEditingPlan({ ...editingPlan, price: e.target.value })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Franquia (Msgs/mês)</label>
                    <input
                      type="number"
                      value={editingPlan.quotaLimit}
                      onChange={e => setEditingPlan({ ...editingPlan, quotaLimit: Number(e.target.value) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Max WhatsApps (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={editingPlan.maxWhatsAppConnections || 1}
                      onChange={e => setEditingPlan({ ...editingPlan, maxWhatsAppConnections: Math.min(5, Math.max(1, Number(e.target.value))) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Max Operadores</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editingPlan.maxOperators || 1}
                      onChange={e => setEditingPlan({ ...editingPlan, maxOperators: Math.max(1, Number(e.target.value)) })}
                      style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                    />
                  </div>
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Descrição Comercial</label>
                  <input
                    type="text"
                    value={editingPlan.description}
                    onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                  />
                </div>

                {/* Checklist dos 9 Recursos Técnicos */}
                <div style={{background: "rgba(255,255,255,0.03)", padding: "14px", borderRadius: "10px", border: "1px solid #3d344f"}}>
                  <strong style={{fontSize: "13px", color: "#fff", display: "block", marginBottom: "10px"}}>
                    Habilitar Recursos Técnicos para este Plano:
                  </strong>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px"}}>
                    {TECHNICAL_FEATURES_LIST.map(feat => {
                      const isChecked = (editingPlan.allowedFeatures || []).includes(feat.id);
                      return (
                        <div
                          key={feat.id}
                          onClick={() => handleToggleFeatureInEditor(feat.id)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            cursor: "pointer",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            background: isChecked ? "rgba(236,72,153,0.1)" : "transparent"
                          }}
                        >
                          {isChecked ? (
                            <CheckSquare size={16} color="#ec4899" style={{marginTop: "2px", flexShrink: 0}}/>
                          ) : (
                            <Square size={16} color="#6b7280" style={{marginTop: "2px", flexShrink: 0}}/>
                          )}
                          <div>
                            <span style={{fontSize: "12px", fontWeight: 700, color: isChecked ? "white" : "#9ca3af", display: "block"}}>
                              {feat.name}
                            </span>
                            <small style={{fontSize: "11px", color: "#8e87a2", lineHeight: "1.2", display: "block"}}>
                              {feat.description}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>
                    Itens da Lista Comercial (1 benefício por linha)
                  </label>
                  <textarea
                    rows={4}
                    value={editingFeaturesText}
                    onChange={e => setEditingFeaturesText(e.target.value)}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "13px"}}
                  />
                </div>

                <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                  <input
                    type="checkbox"
                    id="isPopular"
                    checked={editingPlan.isPopular || false}
                    onChange={e => setEditingPlan({ ...editingPlan, isPopular: e.target.checked })}
                    style={{width: "16px", height: "16px", accentColor: "#ec4899"}}
                  />
                  <label htmlFor="isPopular" style={{fontSize: "13px", color: "#e2e8f0", cursor: "pointer"}}>
                    Destacar como <strong>MAIS VENDIDO</strong> no catálogo
                  </label>
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "space-between", marginTop: "24px"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setEditPlanModalOpen(false)}
                >
                  Cancelar
                </button>
                <div style={{display: "flex", gap: "10px"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={handleSavePlanDraft}
                  >
                    Salvar como Rascunho
                  </button>
                  <button
                    type="button"
                    className="op-primary"
                    onClick={handleTriggerApplyPlan}
                  >
                    Salvar e Aplicar...
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: CONFIRMAÇÃO DE IMPACTO E APLICAÇÃO EM LOTE */}
        {impactModalOpen && planToApply && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "560px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <Zap size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Confirmar Aplicação e Sincronização</h3>
              </div>

              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Você está prestes a aplicar as novas definições do plano <strong>{planToApply.name}</strong>.
              </p>

              {/* Comparativo DE -> PARA */}
              <div style={{background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "14px", marginBottom: "16px", border: "1px solid #3d344f"}}>
                <strong style={{fontSize: "13px", color: "white", display: "block", marginBottom: "8px"}}>
                  Resumo das Alterações (De ➔ Para):
                </strong>
                <div style={{display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px"}}>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Preço:</span>
                    <span>
                      <s style={{color: "#6b7280"}}>R$ {originalPlan?.price || "—"}</s> ➔ <strong style={{color: "white"}}>R$ {planToApply.price}</strong>
                    </span>
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Franquia Mensal:</span>
                    <span>
                      <s style={{color: "#6b7280"}}>{originalPlan?.quotaLimit?.toLocaleString("pt-BR") || "—"} msgs</s> ➔ <strong style={{color: "#ec4899"}}>{planToApply.quotaLimit.toLocaleString("pt-BR")} msgs</strong>
                    </span>
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between"}}>
                    <span style={{color: "#9ca3af"}}>Recursos Habilitados:</span>
                    <span><strong style={{color: "#00db8c"}}>{(planToApply.allowedFeatures || []).length} ativos</strong></span>
                  </div>
                </div>
              </div>

              {/* Lojas Elegíveis Afetadas */}
              <div style={{background: "rgba(236,72,153,0.06)", borderRadius: "10px", padding: "14px", marginBottom: "16px", border: "1px solid rgba(236,72,153,0.2)"}}>
                <strong style={{fontSize: "13px", color: "#ec4899", display: "block", marginBottom: "6px"}}>
                  Lojas Vinculadas Elegíveis ({enrolledStoresMap[planToApply.id]?.length || clientCountsMap[planToApply.id] || 0}):
                </strong>
                {(enrolledStoresMap[planToApply.id]?.length || 0) > 0 ? (
                  <div style={{maxHeight: "100px", overflowY: "auto", fontSize: "12px", color: "#d1d5db", display: "flex", flexDirection: "column", gap: "4px"}}>
                    {enrolledStoresMap[planToApply.id].map(s => (
                      <div key={s.id} style={{display: "flex", justifyContent: "space-between"}}>
                        <span>• {s.name}</span>
                        {s.customQuotaOverride && (
                          <span style={{color: "#f59e0b", fontSize: "11px"}}>
                            (Mantém exceção: {s.customQuotaOverride} msgs)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{fontSize: "12px", color: "#9ca3af"}}>
                    Nenhuma loja cadastrada vinculada a este plano no momento. Novos clientes receberão as regras vigentes automaticamente.
                  </span>
                )}
              </div>

              {/* Escolha de Vigência */}
              <div style={{marginBottom: "20px"}}>
                <label style={{fontSize: "13px", color: "#e2e8f0", fontWeight: 700, display: "block", marginBottom: "8px"}}>
                  Vigência da Aplicação:
                </label>
                <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="immediate"
                      checked={vigencia === "immediate"}
                      onChange={() => setVigencia("immediate")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Imediata:</strong> Sincronizar em todas as lojas vinculadas elegíveis agora mesmo.</span>
                  </label>

                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="new_clients"
                      checked={vigencia === "new_clients"}
                      onChange={() => setVigencia("new_clients")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Apenas Novos Clientes:</strong> Manter lojas existentes como estão.</span>
                  </label>

                  <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#d1d5db", cursor: "pointer"}}>
                    <input
                      type="radio"
                      name="vigencia"
                      value="next_cycle"
                      checked={vigencia === "next_cycle"}
                      onChange={() => setVigencia("next_cycle")}
                      style={{accentColor: "#ec4899"}}
                    />
                    <span><strong>Na Próxima Renovação:</strong> Atualizar no próximo vencimento/ciclo.</span>
                  </label>
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setImpactModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={applyingPlan}
                  onClick={handleConfirmApplyPlan}
                >
                  {applyingPlan ? "Sincronizando..." : "Confirmar e Sincronizar em Lote"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: DUPLICAR PLANO */}
        {duplicateModalOpen && sourcePlanForDuplicate && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "440px", padding: "26px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                <Copy size={20} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800}}>Duplicar Plano Comercial</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Copiar a estrutura do plano <strong>{sourcePlanForDuplicate.name}</strong> para criar uma nova versão.
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px"}}>
                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Novo ID (slug único)</label>
                  <input
                    type="text"
                    value={duplicateNewId}
                    onChange={e => setDuplicateNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontFamily: "monospace"}}
                  />
                </div>
                <div>
                  <label style={{fontSize: "12px", color: "#a599c2", display: "block", marginBottom: "4px"}}>Novo Nome Comercial</label>
                  <input
                    type="text"
                    value={duplicateNewName}
                    onChange={e => setDuplicateNewName(e.target.value)}
                    style={{width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                  />
                </div>
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setDuplicateModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={duplicating || !duplicateNewId.trim()}
                  onClick={handleConfirmDuplicate}
                >
                  {duplicating ? "Copiando..." : "Criar Cópia"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: VER LOJAS VINCULADAS */}
        {enrolledModalOpen && selectedPlanForStores && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "520px", padding: "26px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                <Building2 size={20} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px", fontWeight: 800}}>
                  Lojas Vinculadas ao {selectedPlanForStores.name}
                </h3>
              </div>

              <div style={{maxHeight: "340px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px"}}>
                {((enrolledStoresMap[selectedPlanForStores.id]) || []).length === 0 ? (
                  <p style={{fontSize: "13px", color: "#9ca3af", textAlign: "center", padding: "20px 0"}}>
                    Nenhuma loja cadastrada vinculada a este plano no momento.
                  </p>
                ) : (
                  enrolledStoresMap[selectedPlanForStores.id].map(st => (
                    <div
                      key={st.id}
                      style={{
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "8px",
                        border: "1px solid #332b49",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong style={{color: "white", display: "block", fontSize: "14px"}}>{st.name}</strong>
                        {st.customQuotaOverride && (
                          <small style={{color: "#f59e0b", fontSize: "11px"}}>
                            ⚠️ Exceção: {st.customQuotaOverride} msgs ({st.exceptionReason || "Customizado"})
                          </small>
                        )}
                      </div>
                      <span style={{fontSize: "12px", color: "#a599c2"}}>
                        {st.customQuotaOverride || selectedPlanForStores.quotaLimit} msgs/mês
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div style={{display: "flex", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-primary"
                  onClick={() => setEnrolledModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: HISTÓRICO DE AUDITORIA */}
        {historyModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "grid", placeItems: "center", zIndex: 110, padding: "20px"
          }}>
            <div className="op-card" style={{
              width: "100%", maxWidth: "660px", maxHeight: "85vh", overflowY: "auto",
              padding: "26px", borderColor: "#ec4899"
            }}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <History size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "20px", fontWeight: 800}}>Histórico de Alterações de Planos</h3>
              </div>

              {loadingHistory ? (
                <p style={{textAlign: "center", color: "#9ca3af", padding: "30px 0"}}>Carregando histórico...</p>
              ) : auditLogs.length === 0 ? (
                <p style={{textAlign: "center", color: "#9ca3af", padding: "30px 0"}}>Nenhuma alteração registrada ainda.</p>
              ) : (
                <div style={{display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px"}}>
                  {auditLogs.map(entry => (
                    <div
                      key={entry.id}
                      style={{
                        padding: "12px 16px",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "10px",
                        border: "1px solid #332b49"
                      }}
                    >
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"}}>
                        <strong style={{color: "white", fontSize: "14px"}}>{entry.planName || entry.planId}</strong>
                        <span style={{fontSize: "11px", color: "#8e87a2"}}>
                          {new Date(entry.timestamp).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div style={{fontSize: "12px", color: "#ec4899", fontWeight: 600}}>
                        Ação: {entry.action} {entry.vigencia ? `• Vigência: ${entry.vigencia}` : ""}
                        {entry.impactedCount ? ` • ${entry.impactedCount} loja(s) impactada(s)` : ""}
                      </div>
                      {entry.diffSummary && (
                        <p style={{margin: "4px 0 0", fontSize: "12px", color: "#d1d5db"}}>{entry.diffSummary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display: "flex", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-primary"
                  onClick={() => setHistoryModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 6: ALTERAR PLANO DA LOJA (COM SUPORTE A EXCEÇÃO CONTRATUAL) */}
        {changePlanModalOpen && selectedClientForPlan && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "480px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <CreditCard size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px"}}>Alterar Plano da Loja</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Selecione o novo plano comercial para a loja <strong>{selectedClientForPlan.name}</strong>:
              </p>

              <div style={{display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px"}}>
                {plans.map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setTargetPlanToAssign(p);
                      if (!customQuotaChecked) setCustomQuotaValue(p.quotaLimit);
                    }}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      border: "1px solid",
                      borderColor: targetPlanToAssign.id === p.id ? "#ec4899" : "#3d344f",
                      background: targetPlanToAssign.id === p.id ? "rgba(236, 72, 153, 0.15)" : "#161325",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <strong style={{color: "white", display: "block"}}>{p.name}</strong>
                      <small style={{color: "#9ca3af"}}>{p.quotaLimit.toLocaleString("pt-BR")} atendimentos/mês</small>
                    </div>
                    <strong style={{color: "#ec4899"}}>R$ {p.price}/mês</strong>
                  </div>
                ))}
              </div>

              {/* Exceção Contratual Individual */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                padding: "14px",
                marginBottom: "20px",
                border: "1px solid #3d344f"
              }}>
                <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "white", cursor: "pointer", fontWeight: 700}}>
                  <input
                    type="checkbox"
                    checked={customQuotaChecked}
                    onChange={e => {
                      setCustomQuotaChecked(e.target.checked);
                      if (e.target.checked && !customQuotaValue) {
                        setCustomQuotaValue(targetPlanToAssign.quotaLimit);
                      }
                    }}
                    style={{width: "16px", height: "16px", accentColor: "#ec4899"}}
                  />
                  <span>Exceção Contratual Individual</span>
                </label>
                <small style={{color: "#8e87a2", fontSize: "11px", display: "block", marginTop: "2px", marginBottom: "8px"}}>
                  Define uma franquia mensal exclusiva para esta loja. Não será sobrescrita por atualizações gerais do plano.
                </small>

                {customQuotaChecked && (
                  <div style={{display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px"}}>
                    <div>
                      <label style={{fontSize: "11px", color: "#a599c2", display: "block", marginBottom: "2px"}}>Franquia Customizada (Msgs/mês)</label>
                      <input
                        type="number"
                        value={customQuotaValue}
                        onChange={e => setCustomQuotaValue(Number(e.target.value))}
                        style={{width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      />
                    </div>
                    <div>
                      <label style={{fontSize: "11px", color: "#a599c2", display: "block", marginBottom: "2px"}}>Motivo da Exceção</label>
                      <input
                        type="text"
                        placeholder="Ex: Acordo anual VIP com franquia ampliada"
                        value={customQuotaReason}
                        onChange={e => setCustomQuotaReason(e.target.value)}
                        style={{width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => setChangePlanModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={assigningPlan}
                  onClick={handleAssignPlan}
                >
                  {assigningPlan ? "Salvando..." : "Confirmar Alteração"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 7: REDEFINIR SENHA DO CLIENTE */}
        {resetModalOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "grid", placeItems: "center", zIndex: 100, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "420px", padding: "28px", borderColor: "#ec4899"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px"}}>
                <KeyRound size={22} color="#ec4899"/>
                <h3 style={{margin: 0, fontSize: "18px"}}>Redefinir Senha do Cliente</h3>
              </div>
              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                Defina uma nova senha para o acesso da loja <strong>{resetStoreName}</strong>.
              </p>
              <form onSubmit={handleResetPassword} style={{display: "flex", flexDirection: "column", gap: "14px"}}>
                <input
                  type="password"
                  placeholder="Nova senha (mínimo 6 caracteres)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  style={{width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white"}}
                />
                <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                  <button
                    type="button"
                    className="op-refresh"
                    onClick={() => setResetModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="op-primary"
                    disabled={resetting || newPassword.length < 6}
                  >
                    {resetting ? "Gravando..." : "Salvar Nova Senha"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* MODAL 8: SUSPENSÃO ADMINISTRATIVA / DESBLOQUEIO COM MOTIVO PÚBLICO E NOTA INTERNA */}
        {blockModalOpen && clientToBlock && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
            display: "grid", placeItems: "center", zIndex: 120, padding: "20px"
          }}>
            <div className="op-card" style={{width: "100%", maxWidth: "480px", padding: "28px", borderColor: clientToBlock.status === "suspended" ? "#00db8c" : "#f43f5e"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px"}}>
                {clientToBlock.status === "suspended" ? (
                  <RotateCcw size={22} color="#00db8c"/>
                ) : (
                  <Ban size={22} color="#f43f5e"/>
                )}
                <h3 style={{margin: 0, fontSize: "19px", fontWeight: 800}}>
                  {clientToBlock.status === "suspended"
                    ? `Desbloquear Loja: ${clientToBlock.name}`
                    : `Suspender Administrativamente: ${clientToBlock.name}`}
                </h3>
              </div>

              <p style={{fontSize: "13px", color: "#c2bed4", marginTop: 0}}>
                {clientToBlock.status === "suspended"
                  ? "Ao confirmar o desbloqueio, os recursos do plano contratado e o atendimento da IA voltarão a operar imediatamente."
                  : "A suspensão administrativa pausa o atendimento automático da IA e exibe o motivo público no painel do cliente. O histórico e os dados permanecem 100% preservados."}
              </p>

              {clientToBlock.status !== "suspended" && (
                <div style={{display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px"}}>
                  <div>
                    <label style={{fontSize: "12px", color: "#fda4af", fontWeight: 700, display: "block", marginBottom: "4px"}}>
                      Motivo Público (exibido ao cliente no painel)
                    </label>
                    <input
                      type="text"
                      value={blockPublicReason}
                      onChange={e => setBlockPublicReason(e.target.value)}
                      placeholder="Ex: Mensalidade em aberto. Entre em contato com o financeiro NovaesWeb."
                      style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(244, 63, 94, 0.45)", background: "#121222", color: "white", fontSize: "13px"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: "12px", color: "#fbbf24", fontWeight: 700, display: "block", marginBottom: "4px"}}>
                      Observação Interna Master (visível somente para a NovaesWeb)
                    </label>
                    <textarea
                      rows={3}
                      value={blockInternalNote}
                      onChange={e => setBlockInternalNote(e.target.value)}
                      placeholder="Ex: Aguardando compensação de boleto / combinado retorno na segunda-feira."
                      style={{width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #443c5e", background: "#121222", color: "white", fontSize: "13px"}}
                    />
                  </div>
                </div>
              )}

              <div style={{display: "flex", gap: "10px", justifyContent: "flex-end"}}>
                <button
                  type="button"
                  className="op-refresh"
                  onClick={() => {
                    setBlockModalOpen(false);
                    setClientToBlock(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="op-primary"
                  disabled={togglingBlock}
                  onClick={handleConfirmToggleBlock}
                  style={{
                    background: clientToBlock.status === "suspended" ? "#00db8c" : "#f43f5e",
                    color: clientToBlock.status === "suspended" ? "#052e16" : "#fff",
                    fontWeight: 800
                  }}
                >
                  {togglingBlock
                    ? "Processando..."
                    : clientToBlock.status === "suspended"
                      ? "Confirmar Desbloqueio"
                      : "Confirmar Suspensão"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
