"use client";
import React, { useState } from "react";
import {
  Smartphone, LockKeyhole, CheckCircle2, Sparkles, Users, UserPlus, Trash2,
  BarChart3, Star, Zap, Plus, ShieldAlert, Wrench, Ban, Check, Send, Filter, Tag
} from "lucide-react";

export type WhatsappSlotItem = {
  slot: number; label: string; instanceName: string;
  unlocked: boolean; minPlanId: string; minPlanName: string;
  status: "connected" | "connecting" | "disconnected" | "paused" | "locked";
  phoneNumber?: string | null; profileName?: string | null;
  channelId: string | null; pausedByDowngrade: boolean; lockedReason?: string;
};

export type QuickReplyItem = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category?: string;
};

export type TeamOperatorItem = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  status: "active" | "revoked";
  createdAt: string;
};

export type SatisfactionSurveyItem = {
  id: string;
  conversationId: string;
  contactId?: string;
  rating: number;
  comment: string;
  operatorId?: string;
  createdAt: string;
};

export type FeatureStateItem = {
  id: string; name: string; description: string; category?: string;
  minPlanId: string; minPlanName: string;
  state: "allowed" | "locked_by_plan" | "maintenance" | "suspended";
  reason?: string;
};

// Matches the published operator/features response. No invented UI-only envelope.
export type ReportsPayload = {
  basicIndicators: {quotaUsed:number;quotaLimit:number;quotaPercent:number;totalConversations:number;activeConversations:number;aiConversations:number;humanConversations:number;totalContacts:number} | null;
  commercialIndicators: {tagBreakdown:Record<string,number>;priorityBreakdown:Record<string,number>;handoffCount:number;handoffRate:number;totalSurveys:number;avgSatisfaction:number} | null;
  premiumAnalytics: {starDistribution:Record<string,number>;csatPercent:number;aiAvgRating:number|null;humanAvgRating:number|null;detractors:SatisfactionSurveyItem[];operatorMetrics:Array<{operatorId:string;name:string;role:string;conversationsHandled:number;surveysCount:number;avgRating:number|null}>;channelsSummary:Array<{id:string;instanceName:string;status:string;conversationsCount:number}>} | null;
};

export function featureAvailable(states: Record<string, FeatureStateItem>, id: string, suspended = false): boolean {
  return !suspended && states[id]?.state === "allowed";
}

export function commercialPlanId(value: string): string {
  const aliases: Record<string,string> = {"CRM Start":"crm-start","CRM Business":"crm-business","CRM Premium":"crm-premium"};
  return aliases[value] || value;
}

export function FeatureUnavailable({feature, onUpgrade}: {feature?:FeatureStateItem;onUpgrade?:(plan:string,reason:string)=>void}) {
  const locked = feature?.state === "locked_by_plan";
  return <div role="status" className="op-card" style={{padding:"16px",border:"1px dashed #615477"}}>
    <strong>{feature?.state === "maintenance" ? "Recurso em manutenção" : feature?.state === "suspended" ? "Recurso suspenso" : locked ? "Recurso bloqueado pelo plano" : "Permissão indisponível"}</strong>
    <p>{feature?.reason || "Não foi possível confirmar a permissão para este recurso."}</p>
    {locked && onUpgrade && <button type="button" className="op-primary" onClick={()=>onUpgrade(feature.minPlanId,feature.name)}>Solicitar {feature.minPlanName}</button>}
  </div>;
}

// ============================================================================
// 1. BARRA DE 5 ESPAÇOS DE WHATSAPP (ETAPA 5)
// ============================================================================
export function WhatsappFiveSlotsGrid({
  slots,
  selectedSlot,
  maxConnections,
  onSelectSlot,
  onRequestUpgrade,
  blockedState,
}: {
  blockedState?: FeatureStateItem;
  slots: WhatsappSlotItem[];
  selectedSlot: number;
  maxConnections: number;
  onSelectSlot: (slot: WhatsappSlotItem) => void;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
}) {
  const connectedCount = slots.filter(s => s.status === "connected" && s.unlocked).length;

  return (
    <div className="op-card" style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "12px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <Smartphone size={19} color="#ec4899" /> Central Multi-WhatsApp — 5 Espaços da Empresa
          </h3>
          <small style={{ color: "#aba8bf", fontSize: "12px" }}>
            Seu plano libera até <strong>{maxConnections} de 5 espaços</strong> simultâneos. Selecione um espaço liberado abaixo para conectar ou gerenciar o QR Code.
          </small>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            padding: "5px 12px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 800,
            background: "rgba(236, 72, 153, 0.16)",
            border: "1px solid rgba(236, 72, 153, 0.45)",
            color: "#f472b6"
          }}>
            {connectedCount} conectado(s) · {maxConnections}/5 liberados no plano
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
        {slots.map(s => {
          const isSelected = selectedSlot === s.slot;
          const isLocked = !s.unlocked || s.slot > maxConnections || (blockedState && blockedState.state !== "allowed");
          const planLocked = isLocked && (!blockedState || blockedState.state === "allowed" || blockedState.state === "locked_by_plan") && (s.slot > maxConnections || s.pausedByDowngrade || s.status === "locked");
          const isPausedDowngrade = s.pausedByDowngrade;

          const statusColor = isLocked
            ? "#6b7280"
            : isPausedDowngrade
            ? "#f59e0b"
            : (s.status === "connected")
            ? "#00db8c"
            : s.status === "connecting"
            ? "#a855f7"
            : "#9ca3af";

          const statusText = isLocked
            ? `🔒 Bloqueado (${s.minPlanName})`
            : isPausedDowngrade
            ? "⏸️ Pausado por downgrade"
            : (s.status === "connected")
            ? "● Conectado"
            : s.status === "connecting"
            ? "◐ Aguardando QR Code"
            : "○ Disponível p/ conectar";

          return (
            <div
              key={s.slot}
              data-testid={`whatsapp-slot-${s.slot}`}
              data-locked={Boolean(isLocked)}
              role="group"
              aria-label={`${s.label}: ${isLocked ? "bloqueado" : "liberado"}`}
              style={{
                padding: "14px",
                borderRadius: "14px",
                background: isSelected
                  ? "linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(139, 92, 246, 0.18))"
                  : isLocked
                  ? "rgba(15, 13, 26, 0.65)"
                  : "rgba(255, 255, 255, 0.03)",
                border: isSelected
                  ? "2px solid #ec4899"
                  : isLocked
                  ? "1px dashed rgba(107, 114, 128, 0.45)"
                  : (s.status === "connected")
                  ? "1px solid rgba(0, 219, 140, 0.45)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px",
                opacity: isLocked ? 0.78 : 1,
                transition: "all 0.18s ease"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: isLocked ? "rgba(107,114,128,0.2)" : "rgba(236,72,153,0.2)",
                    color: isLocked ? "#9ca3af" : "#f472b6"
                  }}>
                    Espaço #{s.slot}
                  </span>
                  {isLocked ? (
                    <LockKeyhole size={15} color="#f59e0b" />
                  ) : (s.status === "connected") ? (
                    <CheckCircle2 size={16} color="#00db8c" />
                  ) : (
                    <Smartphone size={15} color="#aba8bf" />
                  )}
                </div>

                <strong style={{ color: "#fff", fontSize: "14px", display: "block" }}>
                  {s.label}
                </strong>
                <small style={{ color: "#8e87a2", fontSize: "11px", display: "block", marginTop: "2px", wordBreak: "break-all" }}>
                  {s.phoneNumber ? `+${s.phoneNumber}` : `Instância: ${s.instanceName}`}
                </small>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: statusColor }}>
                  {statusText}
                </span>

                {isPausedDowngrade && (
                  <small style={{ fontSize: "10px", color: "#fde68a", lineHeight: 1.3 }}>
                    Histórico e conversas 100% preservados. Faça upgrade para reativar este número.
                  </small>
                )}

                <button type="button" className="op-refresh" disabled={Boolean(isLocked)} aria-label={`Selecionar ${s.label}`} onClick={()=>onSelectSlot(s)}>{isLocked ? "Conexão bloqueada" : "Gerenciar espaço"}</button>
                {planLocked && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onRequestUpgrade(s.minPlanId, `Desbloquear ${s.label} (${s.minPlanName})`);
                    }}
                    style={{
                      marginTop: "2px",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid rgba(236, 72, 153, 0.5)",
                      background: "rgba(236, 72, 153, 0.15)",
                      color: "#f472b6",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    🔓 Solicitar {s.minPlanName}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 2. BARRA E MODAL DE RESPOSTAS RÁPIDAS (ETAPA 7)
// ============================================================================
export function QuickRepliesSection({
  quickReplies,
  allowed,
  onSelectReply,
  onSaveReply,
  onDeleteReply,
  onRequestUpgrade,
}: {
  quickReplies: QuickReplyItem[];
  allowed: boolean;
  onSelectReply: (body: string) => void;
  onSaveReply: (shortcut: string, title: string, body: string) => Promise<void>;
  onDeleteReply: (id: string) => Promise<void>;
  onRequestUpgrade: () => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  if (!allowed) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(245,158,11,0.4)", padding: "8px 12px", borderRadius: "10px", fontSize: "12px" }}>
        <span style={{ color: "#fde68a", display: "flex", alignItems: "center", gap: "6px" }}>
          <LockKeyhole size={14} color="#f59e0b" /> Respostas Rápidas bloqueadas no plano atual.
        </span>
        <button type="button" onClick={onRequestUpgrade} style={{ background: "none", border: "none", color: "#ec4899", fontWeight: 800, cursor: "pointer", fontSize: "12px" }}>
          Solicitar Upgrade
        </button>
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await onSaveReply(shortcut.trim() || "/atalho", title.trim(), body.trim());
      setShortcut("");
      setTitle("");
      setBody("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: "#c084fc", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Zap size={12} color="#ec4899" /> Respostas Rápidas:
        </span>
        {quickReplies.map(qr => (
          <button
            key={qr.id}
            type="button"
            onClick={() => onSelectReply(qr.body)}
            title={qr.body}
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: "rgba(139, 92, 246, 0.16)",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              color: "#e9d5ff",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {qr.shortcut} · {qr.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen(v => !v)}
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            background: "rgba(236, 72, 153, 0.14)",
            border: "1px solid rgba(236, 72, 153, 0.4)",
            color: "#f472b6",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {manageOpen ? "Fechar" : "+ Gerenciar Atalhos"}
        </button>
      </div>

      {manageOpen && (
        <div style={{ background: "#161226", border: "1px solid #3d345c", borderRadius: "12px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <strong style={{ fontSize: "12px", color: "#fff" }}>Gerenciar Respostas Rápidas da Loja</strong>
          <div style={{ display: "grid", gridTemplateColumns: "110px 160px 1fr auto", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="/pix"
              value={shortcut}
              onChange={e => setShortcut(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <input
              type="text"
              placeholder="Título (ex: Chave Pix)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <input
              type="text"
              placeholder="Texto completo da resposta rápida..."
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "8px", background: "#12101e", border: "1px solid #443c5e", color: "#fff", fontSize: "12px" }}
            />
            <button
              type="button"
              disabled={saving || !title.trim() || !body.trim()}
              onClick={e => void handleAdd(e)}
              className="op-primary"
              style={{ padding: "7px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}
            >
              {saving ? "..." : "Salvar"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
            {quickReplies.map(qr => (
              <div key={qr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: "8px", fontSize: "12px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ color: "#f472b6" }}>{qr.shortcut}</strong> — <strong style={{ color: "#fff" }}>{qr.title}:</strong>{" "}
                  <span style={{ color: "#aba8bf" }}>{qr.body}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteReply(qr.id)}
                  style={{ background: "none", border: "none", color: "#f43f5e", cursor: "pointer", padding: "2px 6px" }}
                  title="Excluir resposta rápida"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. ABA DE EQUIPE E OPERADORES (ETAPA 7)
// ============================================================================
export function TeamOperatorsSection({
  operators,
  maxOperators,
  planName,
  isSuspended,
  onAddOperator,
  onRevokeOperator,
  onRequestUpgrade,
}: {
  operators: TeamOperatorItem[];
  maxOperators: number;
  planName: string;
  isSuspended: boolean;
  onAddOperator: (name: string, email: string, role: string) => Promise<{ ok: boolean; message?: string }>;
  onRevokeOperator: (operatorId: string) => Promise<void>;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  const activeOperators = operators.filter(o => o.status === "active");
  const limitReached = activeOperators.length >= maxOperators;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("");
    setErr("");
    if (limitReached) {
      setErr(`Limite de ${maxOperators} operador(es) atingido no plano ${planName}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await onAddOperator(name.trim(), email.trim(), role);
      if (res.ok) {
        setName("");
        setEmail("");
        setRole("agent");
        setNotice("Operador cadastrado com sucesso na equipe!");
      } else {
        setErr(res.message || "Não foi possível cadastrar o operador.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="op-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #372f4d", paddingBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "var(--grad-primary)", display: "grid", placeItems: "center", boxShadow: "var(--glow-pink)" }}>
            <Users size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "19px", color: "#fff" }}>Equipe & Operadores de Atendimento</h2>
            <small style={{ color: "#c2bed4" }}>
              Gerencie os atendentes humanos com acesso ao CRM da sua empresa (Isolamento Multiempresa).
            </small>
          </div>
        </div>
        <span style={{
          padding: "6px 14px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 800,
          background: limitReached ? "rgba(245, 158, 11, 0.16)" : "rgba(0, 219, 140, 0.16)",
          color: limitReached ? "#fcd34d" : "#00db8c",
          border: `1px solid ${limitReached ? "#f59e0b" : "#00db8c"}`
        }}>
          {activeOperators.length} / {maxOperators} operador(es) ativos ({planName})
        </span>
      </div>

      {notice && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(0, 219, 140, 0.14)", border: "1px solid #00db8c", color: "#d1fae5", fontSize: "13px" }}>
          {notice}
        </div>
      )}
      {err && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "rgba(244, 63, 94, 0.16)", border: "1px solid #f43f5e", color: "#fecdd3", fontSize: "13px" }}>
          {err}
        </div>
      )}

      {/* Formulário ou Bloqueio por Limite de Plano */}
      {limitReached ? (
        <div style={{
          padding: "18px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, rgba(60, 20, 80, 0.45), rgba(30, 12, 45, 0.65))",
          border: "1px dashed #ec4899",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <LockKeyhole size={24} color="#ec4899" />
            <div>
              <strong style={{ color: "#fff", fontSize: "15px", display: "block" }}>
                Limite de {maxOperators} operador(es) do plano {planName} atingido
              </strong>
              <span style={{ color: "#d1c8e6", fontSize: "13px" }}>
                Faça upgrade para o CRM Business (até 3 operadores) ou CRM Premium (até 5 operadores) para adicionar mais membros.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestUpgrade(maxOperators < 3 ? "CRM Business" : "CRM Premium", "Expandir limite de operadores da equipe")}
            className="op-primary"
            style={{ padding: "10px 18px", borderRadius: "10px", fontWeight: 800, fontSize: "13px" }}
          >
            🔓 Solicitar Upgrade de Equipe
          </button>
        </div>
      ) : (
        <form onSubmit={e => void handleSubmit(e)} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #372f4d", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <UserPlus size={17} color="#ec4899" /> Adicionar Operador à Equipe
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <input
              type="text"
              required
              placeholder="Nome completo do atendente"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
            />
            <input
              type="email"
              required
              placeholder="E-mail do operador"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
            >
              <option value="agent">Atendente Comercial (Operador)</option>
              <option value="admin">Supervisor / Administrador</option>
              <option value="viewer">Visualizador (Somente Leitura)</option>
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={submitting || isSuspended}
              className="op-primary"
              style={{ padding: "10px 20px", borderRadius: "10px", fontWeight: 700, fontSize: "13px" }}
            >
              {submitting ? "Adicionando..." : "+ Cadastrar Operador"}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Operadores */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {operators.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "#8e87a2", fontSize: "13px" }}>
            Você opera atualmente com o acesso titular da loja ({maxOperators} vaga(s) disponíveis no plano).
          </div>
        ) : (
          operators.map(op => (
            <div
              key={op.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                borderRadius: "12px",
                background: op.status === "active" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.25)",
                border: `1px solid ${op.status === "active" ? "#372f4d" : "#262138"}`,
                opacity: op.status === "active" ? 1 : 0.6,
                flexWrap: "wrap",
                gap: "10px"
              }}
            >
              <div>
                <strong style={{ color: "#fff", fontSize: "14px", display: "block" }}>
                  {op.name} <span style={{ fontSize: "11px", color: "#c084fc", fontWeight: 700 }}>({op.role === "admin" ? "Supervisor" : op.role === "viewer" ? "Leitura" : "Atendente"})</span>
                </strong>
                <small style={{ color: "#9ca3af", fontSize: "12px" }}>{op.email}</small>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  background: op.status === "active" ? "rgba(0,219,140,0.15)" : "rgba(239,68,68,0.15)",
                  color: op.status === "active" ? "#00db8c" : "#f87171"
                }}>
                  {op.status === "active" ? "● Ativo" : "Revogado"}
                </span>
                {op.status === "active" && (
                  <button
                    type="button"
                    onClick={() => void onRevokeOperator(op.id)}
                    className="op-refresh"
                    style={{ padding: "6px 12px", fontSize: "12px", color: "#fca5a5", borderColor: "#ef4444" }}
                  >
                    Revogar Acesso
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ============================================================================
// 4. ABA DE INDICADORES E RELATÓRIOS EM 3 NÍVEIS (ETAPA 7)
// ============================================================================
export function ReportsAndIndicatorsSection({reports,loadingReports,onRefresh,onRequestUpgrade,featureStates}: {
  reports:ReportsPayload|null;loadingReports:boolean;onRefresh:()=>void;onRequestUpgrade:(plan:string,reason:string)=>void;featureStates:Record<string,FeatureStateItem>;
}) {
  const basic=reports?.basicIndicators, comm=reports?.commercialIndicators, adv=reports?.premiumAnalytics;
  return <section style={{display:"grid",gap:"20px"}}>
    <header className="op-card"><h2>Indicadores & Relatórios Comerciais</h2><button type="button" className="op-refresh" disabled={loadingReports} onClick={onRefresh}>{loadingReports?"Atualizando...":"Atualizar Indicadores"}</button></header>
    <section className="op-card"><h3>Indicadores Básicos de Operação</h3>
      {!featureAvailable(featureStates,"basic_indicators") || !basic ? <FeatureUnavailable feature={featureStates.basic_indicators} onUpgrade={onRequestUpgrade}/> : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:"12px"}}>
        {[["Total de Conversas",basic.totalConversations],["Em andamento",basic.activeConversations],["Atendidas pela IA",basic.aiConversations],["Atendimento humano",basic.humanConversations],["Contatos cadastrados",basic.totalContacts],["Franquia consumida",basic.quotaUsed+" / "+basic.quotaLimit]].map(([label,value])=><div key={label} style={{padding:"12px",background:"rgba(255,255,255,.03)",borderRadius:"12px"}}><span>{label}</span><strong style={{display:"block",fontSize:"23px"}}>{value}</strong></div>)}
      </div>}
    </section>
    <section className="op-card"><h3>Indicadores Comerciais</h3>
      {!featureAvailable(featureStates,"commercial_indicators") || !comm ? <FeatureUnavailable feature={featureStates.commercial_indicators} onUpgrade={onRequestUpgrade}/> : <>
        <h4>Distribuição por prioridade</h4>{Object.entries(comm.priorityBreakdown).map(([label,count])=><p key={label}>{label}: <strong>{count}</strong></p>)}
        <h4>Distribuição por etiqueta</h4>{Object.entries(comm.tagBreakdown).map(([label,count])=><p key={label}>{label}: <strong>{count}</strong></p>)}
        <p>Transferências IA → humano: <strong>{comm.handoffCount}</strong></p><p>Taxa de transferência: <strong>{comm.handoffRate}%</strong></p><p>Pesquisas respondidas: <strong>{comm.totalSurveys}</strong> · Nota média: <strong>{comm.avgSatisfaction}</strong></p>
      </>}
    </section>
    <section className="op-card"><h3>Relatórios Avançados — CRM Premium</h3>
      {!featureAvailable(featureStates,"advanced_reports") || !adv ? <FeatureUnavailable feature={featureStates.advanced_reports} onUpgrade={onRequestUpgrade}/> : <>
        {featureAvailable(featureStates,"satisfaction_analytics") ? <><h4>Análise de satisfação</h4><p>CSAT: <strong>{adv.csatPercent}%</strong></p>{Object.entries(adv.starDistribution).map(([rating,count])=><p key={rating}>{rating} estrelas: <strong>{count}</strong></p>)}</> : <FeatureUnavailable feature={featureStates.satisfaction_analytics} onUpgrade={onRequestUpgrade}/>}
        {featureAvailable(featureStates,"operator_indicators") ? <><h4>Indicadores por atendente</h4>{adv.operatorMetrics.length ? adv.operatorMetrics.map(op=><div key={op.operatorId}><strong>{op.name}</strong><p>{op.conversationsHandled} conversas · {op.surveysCount} avaliações · Nota: {op.avgRating ?? "—"}</p></div>) : <p>Nenhum atendente cadastrado.</p>}</> : <FeatureUnavailable feature={featureStates.operator_indicators} onUpgrade={onRequestUpgrade}/>}
      </>}
    </section>
  </section>;
}

// ============================================================================
// 5. MATRIZ DE GOVERNANÇA DE 4 ESTADOS (ETAPA 4)
// ============================================================================
export function FeatureGovernanceMatrix({
  featureStates,
  onRequestUpgrade,
}: {
  featureStates: Record<string, FeatureStateItem>;
  onRequestUpgrade: (targetPlan: string, reason: string) => void;
}) {
  const list = Object.values(featureStates || {});
  if (list.length === 0) return null;

  const badgeForState = (item: FeatureStateItem) => {
    if (item.state === "allowed") {
      return { bg: "rgba(0, 219, 140, 0.15)", border: "#00db8c", color: "#00db8c", label: "✓ Liberado pelo plano", icon: <Check size={13} /> };
    }
    if (item.state === "locked_by_plan") {
      return { bg: "rgba(245, 158, 11, 0.16)", border: "#f59e0b", color: "#fcd34d", label: `🔒 Bloqueado (${item.minPlanName})`, icon: <LockKeyhole size={13} /> };
    }
    if (item.state === "maintenance") {
      return { bg: "rgba(59, 130, 246, 0.16)", border: "#3b82f6", color: "#93c5fd", label: "🛠️ Indisponível (Manutenção)", icon: <Wrench size={13} /> };
    }
    return { bg: "rgba(244, 63, 94, 0.18)", border: "#f43f5e", color: "#fda4af", label: "⛔ Suspenso administrativamente", icon: <Ban size={13} /> };
  };

  return (
    <div className="op-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#fff" }}>
          Central de Funcionalidades & Direitos do Plano
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#aba8bf" }}>
          Visualize todas as funcionalidades do Novaes CRM IA e o estado atual na sua conta (Liberado, Bloqueado pelo plano, Em manutenção ou Suspenso).
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
        {list.map(item => {
          const b = badgeForState(item);
          return (
            <div
              key={item.id}
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: item.state === "allowed" ? "rgba(255,255,255,0.03)" : "rgba(15,12,24,0.65)",
                border: `1px solid ${item.state === "allowed" ? "rgba(255,255,255,0.08)" : b.border}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px"
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <strong style={{ color: "#fff", fontSize: "14px" }}>{item.name}</strong>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af", lineHeight: 1.4 }}>{item.description}</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 800,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: b.bg,
                  color: b.color,
                  border: `1px solid ${b.border}`
                }}>
                  {b.icon} {b.label}
                </span>

                {item.state === "locked_by_plan" && (
                  <button
                    type="button"
                    onClick={() => onRequestUpgrade(item.minPlanId, `Liberar recurso: ${item.name}`)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "8px",
                      background: "linear-gradient(90deg, #ec4899, #8b5cf6)",
                      border: "none",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    Solicitar Upgrade
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 6. MODAL INTERNO DE SOLICITAÇÃO DE UPGRADE (ETAPA 4 & ETAPA 8)
// ============================================================================
export function UpgradeRequestModal({
  open,
  initialPlan,
  initialNotes,
  currentPlanName,
  onClose,
  onSubmitUpgrade,
}: {
  open: boolean;
  initialPlan: string;
  initialNotes: string;
  currentPlanName: string;
  onClose: () => void;
  onSubmitUpgrade: (requestedPlan: string, notes: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [selectedPlan, setSelectedPlan] = useState(commercialPlanId(initialPlan || "CRM Business"));
  const [notes, setNotes] = useState(initialNotes || "");
  const [sending, setSending] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");
  const [submitError, setSubmitError] = useState("");

  React.useEffect(() => {
    if (open) {
      setSelectedPlan(commercialPlanId(initialPlan || "CRM Business"));
      setNotes(initialNotes || "");
      setDoneMsg("");
    }
  }, [open, initialPlan, initialNotes]);

  if (!open) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSubmitError("");
    try {
      const res = await onSubmitUpgrade(selectedPlan, notes);
      if (res.ok) {
        setDoneMsg(res.message || "Solicitação de upgrade registrada com sucesso no Painel Master da NovaesWeb!");
      } else setSubmitError(res.message || "Não foi possível enviar a solicitação.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      zIndex: 9999,
      display: "grid",
      placeItems: "center",
      padding: "16px"
    }}>
      <div role="dialog" aria-modal="true" aria-label="Solicitar upgrade de plano" className="op-card" style={{ maxWidth: "480px", width: "100%", border: "2px solid #ec4899", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} color="#ec4899" /> Solicitar Upgrade de Plano
          </h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>

        {submitError && <p role="alert">{submitError}</p>}
        {doneMsg ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ padding: "14px", borderRadius: "12px", background: "rgba(0,219,140,0.15)", border: "1px solid #00db8c", color: "#d1fae5", fontSize: "14px" }}>
              ✅ {doneMsg}
            </div>
            <button type="button" onClick={onClose} className="op-primary" style={{ padding: "10px", borderRadius: "10px", fontWeight: 700 }}>
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={e => void handleConfirm(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#c2bed4" }}>
              Plano atual: <strong>{currentPlanName}</strong>. Escolha o novo plano desejado para enviar a solicitação diretamente à administração da NovaesWeb:
            </p>

            <label style={{ fontSize: "13px", color: "#fff", fontWeight: 700 }}>
              Plano Desejado
              <select
                value={selectedPlan}
                onChange={e => setSelectedPlan(e.target.value)}
                style={{ width: "100%", marginTop: "6px", padding: "11px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "14px" }}
              >
                <option value="crm-start">CRM Start — R$ 59,90/mês (200 atendimentos · 1 WhatsApp · 1 operador)</option>
                <option value="crm-business">CRM Business — R$ 99,90/mês (600 atendimentos · 3 WhatsApps · 3 operadores)</option>
                <option value="crm-premium">CRM Premium — R$ 159,90/mês (1.500 atendimentos · 5 WhatsApps · 5 operadores)</option>
              </select>
            </label>

            <label style={{ fontSize: "13px", color: "#fff", fontWeight: 700 }}>
              Observação ou necessidade da loja (opcional)
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex.: Preciso liberar mais números de WhatsApp e etiquetas comerciais..."
                style={{ width: "100%", marginTop: "6px", padding: "10px 12px", borderRadius: "10px", background: "#141124", border: "1px solid #443c5e", color: "#fff", fontSize: "13px" }}
              />
            </label>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} className="op-refresh">Cancelar</button>
              <button type="submit" disabled={sending} className="op-primary" style={{ padding: "10px 20px", borderRadius: "10px", fontWeight: 800 }}>
                {sending ? "Enviando..." : "Confirmar Solicitação de Upgrade"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

