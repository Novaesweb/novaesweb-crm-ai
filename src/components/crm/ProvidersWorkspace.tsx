"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Play, ShieldCheck, AlertCircle, Sparkles, Zap } from "lucide-react";

type ModelItem = {
  id: string;
  name: string;
  provider: string;
  speed: string;
  isDefaultPrimary?: boolean;
  isDefaultFallback?: boolean;
};

type TestResult = {
  answer: string;
  requestedModel: string;
  reportedModel: string | null;
  latencyMs?: number;
  tokens: { input: number | null; output: number | null } | null;
  whatsappSent: boolean;
};

const PROVIDERS = [
  { name: "OmniRoute Gateway", ability: "Roteador inteligente integrado com Groq, Gemini e OpenRouter", cost: "Ativo e Conectado", link: "http://localhost:20128", tag: "Conectado" },
  { name: "Groq Cloud (LLaMA 3.3)", ability: "Texto ultra veloz com inferência de 300+ tokens/segundo", cost: "Plano gratuito / Baixa latência", link: "https://console.groq.com/docs/rate-limits", tag: "Primeira opção" },
  { name: "Google Gemini 2.0 Flash", ability: "Texto, fotos, áudio e vídeo com janela de 1 milhão de tokens", cost: "Cota gratuita disponível", link: "https://ai.google.dev/gemini-api/docs/rate-limits", tag: "Multimodal" },
  { name: "OpenRouter Free Pool", ability: "Mais de 25 modelos gratuitos disponíveis sem cobrança", cost: "50 chamadas/dia em variantes :free", link: "https://openrouter.ai/collections/free-models", tag: "Reserva" },
  { name: "Mistral API", ability: "Modelos europeus de alta precisão linguística", cost: "Cota gratuita sujeita a limites", link: "https://docs.mistral.ai", tag: "Reserva" }
];

export default function ProvidersWorkspace() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [primaryModel, setPrimaryModel] = useState("auto/best-chat");
  const [fallbackModel, setFallbackModel] = useState("auto/best-fast");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState("");
  const [error, setError] = useState("");

  // Test form state
  const [testModel, setTestModel] = useState("auto/best-chat");
  const [question, setQuestion] = useState("Olá! Qual é o horário de atendimento da pizzaria e quais sabores de pizza vocês têm?");
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<TestResult | null>(null);

  const fetchAiModels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/admin/ai-lab/models", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
        return;
      }
      if (!res.ok) {
        setError("Não foi possível carregar os modelos da Central de IAs.");
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.models)) {
        setModels(data.models);
      }
      if (data.currentDefaults) {
        if (data.currentDefaults.primaryModel) {
          setPrimaryModel(data.currentDefaults.primaryModel);
          setTestModel(data.currentDefaults.primaryModel);
        }
        if (data.currentDefaults.fallbackModel) {
          setFallbackModel(data.currentDefaults.fallbackModel);
        }
      }
    } catch {
      setError("Falha de comunicação com o servidor de IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAiModels();
  }, [fetchAiModels]);

  const handleApplyToAll = async () => {
    if (!window.confirm(`Tem certeza que deseja aplicar:\n\n• Modelo Principal: ${primaryModel}\n• Modelo Reserva: ${fallbackModel}\n\npara TODAS as lojas cadastradas? Esta ação atualizará imediatamente o atendimento dos clientes.`)) {
      return;
    }

    setApplying(true);
    setApplySuccess("");
    setError("");
    try {
      const res = await fetch("/api/crm/admin/ai-lab/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryModel,
          fallbackModel,
          applyToAll: true
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao aplicar modelos em massa.");
        return;
      }
      setApplySuccess(`Modelos aplicados com sucesso para todas as ${data.updatedStoresCount || "suas"} lojas ativas!`);
      setTimeout(() => setApplySuccess(""), 8000);
    } catch {
      setError("Erro ao comunicar com o servidor.");
    } finally {
      setApplying(false);
    }
  };

  const handleTestChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setTesting(true);
    setError("");
    setTestOutput(null);

    const startTime = Date.now();
    try {
      const res = await fetch("/api/crm/admin/ai-lab/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: testModel, question })
      });
      const data = await res.json();
      const latencyMs = Date.now() - startTime;
      if (!res.ok) {
        setError(data.error || "Falha no teste da IA.");
        return;
      }
      setTestOutput({
        answer: data.answer,
        requestedModel: data.requestedModel || testModel,
        reportedModel: data.reportedModel,
        latencyMs,
        tokens: data.tokens,
        whatsappSent: false
      });
    } catch {
      setError("Erro ao executar teste de IA.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section aria-label="Provedores de inteligência artificial">
      {/* FEEDBACK BANNERS */}
      {applySuccess && (
        <div style={{
          background: "linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(16, 185, 129, 0.12))",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: "14px",
          padding: "16px 20px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "#4ade80",
          fontSize: "14px",
          fontWeight: 700
        }}>
          <CheckCircle2 size={22} />
          <span>{applySuccess}</span>
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(244, 63, 94, 0.14)",
          border: "1px solid rgba(244, 63, 94, 0.4)",
          borderRadius: "14px",
          padding: "14px 18px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "#fca5a5",
          fontSize: "14px"
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* CARD PRINCIPAL: DEFINIR E APLICAR MODELO PARA TODOS OS CLIENTES */}
      <section className="op-card" style={{
        background: "linear-gradient(145deg, #1b162b, #120e1e)",
        border: "1px solid rgba(236, 72, 153, 0.35)",
        borderRadius: "18px",
        padding: "28px",
        marginBottom: "32px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
          <div style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "var(--grad-primary)",
            display: "grid",
            placeItems: "center",
            boxShadow: "var(--glow-pink)"
          }}>
            <Sparkles size={22} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#fff" }}>
              Atribuição de IAs para os Clientes
            </h2>
            <p style={{ margin: "2px 0 0", color: "#c2bed4", fontSize: "13px" }}>
              O cliente final no WhatsApp vê apenas a marca <strong>NovaesWeb IA</strong>. O Master decide quais motores processam as mensagens.
            </p>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginTop: "22px",
          marginBottom: "24px"
        }}>
          {/* Modelo Principal */}
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            borderRadius: "14px",
            padding: "18px"
          }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 800, color: "#f43f5e", marginBottom: "8px" }}>
              ⚡ Modelo Principal (Primeira Escolha)
            </label>
            <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 10px", lineHeight: "1.4" }}>
              Processa todas as mensagens normais enviadas pelos clientes no WhatsApp.
            </p>
            <select
              value={primaryModel}
              onChange={e => setPrimaryModel(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "#161325",
                border: "1px solid rgba(244, 63, 94, 0.4)",
                color: "white",
                fontSize: "14px",
                fontWeight: 600
              }}
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.speed})
                </option>
              ))}
            </select>
          </div>

          {/* Modelo Reserva */}
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(139, 92, 246, 0.3)",
            borderRadius: "14px",
            padding: "18px"
          }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 800, color: "#a78bfa", marginBottom: "8px" }}>
              🛡️ Modelo Reserva (Fallback Automático)
            </label>
            <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 10px", lineHeight: "1.4" }}>
              Assume instantaneamente se o modelo principal sofrer lentidão ou atingir limite (HTTP 429).
            </p>
            <select
              value={fallbackModel}
              onChange={e => setFallbackModel(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "#161325",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                color: "white",
                fontSize: "14px",
                fontWeight: 600
              }}
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.speed})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Botão de Aplicação em Massa */}
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "18px" }}>
          <button
            type="button"
            className="op-primary"
            disabled={applying || loading}
            onClick={handleApplyToAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 28px",
              fontWeight: 800,
              fontSize: "15px",
              borderRadius: "12px",
              cursor: "pointer"
            }}
          >
            <Zap size={18} />
            {applying ? "Aplicando para todas as lojas..." : "🚀 Aplicar estes modelos para TODOS os Clientes"}
          </button>

          <span style={{ fontSize: "12px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={16} color="#ec4899" />
            Configuração multi-tenant sincronizada. As lojas não sofrem interrupção.
          </span>
        </div>
      </section>

      {/* SEÇÃO DE TESTE CONTROLADO DE RESPOSTA */}
      <section className="op-card lab-console" style={{
        background: "#161224",
        border: "1px solid #2d2645",
        borderRadius: "18px",
        padding: "26px",
        marginBottom: "32px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <Play size={20} color="#f43f5e" />
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "white" }}>
            Simulador de Teste Rápido (Sem Envio ao WhatsApp)
          </h2>
        </div>
        <p style={{ color: "#9ca3af", fontSize: "13px", marginTop: 0, marginBottom: "18px" }}>
          Teste diretamente a velocidade de resposta e a naturalidade de qualquer modelo aprovado antes de aplicar para os clientes.
        </p>

        <form onSubmit={handleTestChat} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 240px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>
                Modelo a Testar:
              </label>
              <select
                value={testModel}
                onChange={e => setTestModel(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#1c182d",
                  border: "1px solid #3d335c",
                  color: "white",
                  fontSize: "13px"
                }}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>
              Mensagem de Teste:
            </label>
            <textarea
              rows={3}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Digite uma dúvida comum de cliente..."
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "#1c182d",
                border: "1px solid #3d335c",
                color: "white",
                fontSize: "14px"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              type="submit"
              className="op-primary"
              disabled={testing || !question.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 22px",
                fontWeight: 700,
                borderRadius: "10px"
              }}
            >
              <Play size={16} />
              {testing ? "Consultando modelo..." : "Executar Teste"}
            </button>
            <small style={{ color: "#9ca3af" }}>Nenhuma mensagem real de WhatsApp é enviada por este teste.</small>
          </div>
        </form>

        {testOutput && (
          <div style={{
            marginTop: "20px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(236, 72, 153, 0.3)",
            borderRadius: "12px",
            padding: "16px 18px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
              <strong style={{ color: "#f43f5e", fontSize: "13px" }}>Resposta do Modelo:</strong>
              {testOutput.latencyMs && (
                <span style={{ background: "rgba(244, 63, 94, 0.15)", color: "#ec4899", padding: "2px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: 800 }}>
                  Latência: {testOutput.latencyMs}ms
                </span>
              )}
            </div>
            <p style={{ margin: "0 0 10px", color: "white", fontSize: "14px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
              {testOutput.answer}
            </p>
            <small style={{ color: "#9ca3af", fontSize: "11px" }}>
              Modelo requisitado: {testOutput.requestedModel} · WhatsApp não enviado · Isolado no ambiente Master
            </small>
          </div>
        )}
      </section>

      {/* GRADE DE PROVEDORES PESQUISADOS */}
      <h3 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 16px", color: "#fff" }}>
        Provedores Disponíveis no Ecossistema
      </h3>
      <section className="lab-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px", marginBottom: "30px" }}>
        {PROVIDERS.map(p => (
          <article className="op-card lab-provider" key={p.name} style={{
            background: "#161224",
            border: "1px solid #2d2645",
            borderRadius: "14px",
            padding: "18px"
          }}>
            <span className="lab-provider-tag" style={{
              display: "inline-block",
              background: "rgba(236, 72, 153, 0.15)",
              color: "#ec4899",
              padding: "2px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 800,
              marginBottom: "8px"
            }}>
              {p.tag}
            </span>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 6px", color: "white" }}>{p.name}</h2>
            <p style={{ fontSize: "12px", color: "#c2bed4", margin: "0 0 8px", lineHeight: "1.4" }}>{p.ability}</p>
            <small style={{ display: "block", color: "#9ca3af", fontSize: "11px", marginBottom: "10px" }}>{p.cost}</small>
            <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa", fontSize: "12px", textDecoration: "none", fontWeight: 600 }}>
              Documentação Oficial →
            </a>
          </article>
        ))}
      </section>

      <p className="adm-footer" style={{ textAlign: "center", color: "#6b7280", fontSize: "12px", marginTop: "30px" }}>
        NovaesWeb CRM AI · Central Master restrita. Segredos e chaves de API nunca são expostos ao cliente final.
      </p>
    </section>
  );
}
