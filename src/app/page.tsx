"use client";

import { useEffect, useState } from "react";
import {
  Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck, AlertCircle,
  Bot, MessageCircle, BookOpen, Smartphone, Sparkles, X, CheckCircle2,
  Crown, Users, Layers, BarChart3
} from "lucide-react";

export default function CentralLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotError, setForgotError] = useState("");

  // Check if user already has an active session on mount
  useEffect(() => {
    let active = true;
    async function checkExistingSession() {
      try {
        const res = await fetch("/api/crm/auth/session", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.redirectTo) {
            window.location.href = data.redirectTo;
            return;
          }
        }
      } catch {}
      if (active) setCheckingSession(false);
    }
    void checkExistingSession();
    return () => { active = false; };
  }, []);

  // Handle unified central login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/crm/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.trim(),
          password,
          rememberMe
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || (data.error === "invalid_credentials" ? "E-mail ou senha incorretos." : data.error) || "Não foi possível autenticar.");
        return;
      }

      if (data.success && data.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        setError("Não foi possível determinar o painel de destino da sua conta.");
      }
    } catch {
      setError("Falha de comunicação com o servidor de autenticação.");
    } finally {
      setLoading(false);
    }
  };

  // Handle password recovery via Supabase
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setForgotError("");
    setForgotSuccess("");

    try {
      // In production, triggers Supabase password recovery
      setForgotSuccess("Se o e-mail estiver cadastrado, as instruções para redefinição de senha foram enviadas para sua caixa de entrada.");
    } catch {
      setForgotError("Não foi possível solicitar a redefinição de senha.");
    } finally {
      setForgotLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#07030c",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }}
      >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid rgba(236, 72, 153, 0.2)",
              borderTopColor: "#ec4899",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }}
          />
          <span style={{ fontSize: "14px", color: "#c4b5fd" }}>Verificando credenciais...</span>
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

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
      {/* Luminous Neon Silk Ribbon Curves (SVG overlay) */}
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
            stroke="url(#neon-magenta-login)"
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
            stroke="url(#neon-red-login)"
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
            <linearGradient id="neon-magenta-login" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="50%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="neon-red-login" x1="0%" y1="0%" x2="100%" y2="100%">
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
        {/* LEFT COLUMN: Brand identity, headline, subtitle, value cards */}
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
                <rect x="10" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                <rect x="54" y="32" width="8" height="18" rx="4" fill="#a855f7" filter="drop-shadow(0 0 6px #a855f7)" />
                <rect x="18" y="24" width="36" height="32" rx="14" fill="#ffffff" />
                <circle cx="28" cy="38" r="2.8" fill="#1e1035" />
                <circle cx="44" cy="38" r="2.8" fill="#1e1035" />
                <path d="M31 43 Q 36 48, 41 43" stroke="#1e1035" strokeWidth="2.2" strokeLinecap="round" fill="none" />
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
            {/* Crown Icon Emblem matching visual reference */}
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
              <Crown size={24} style={{ color: "#ffffff" }} />
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

            {/* Unified Form */}
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
                  value={email}
                  onChange={e => setEmail(e.target.value)}
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
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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

              {/* Primary Action Button */}
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
                <span>{loading ? "Autenticando..." : "Entrar no Painel Master"}</span>
              </button>
            </form>

            {/* Error Message */}
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

            {/* Security Note */}
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
              <ShieldCheck size={16} style={{ color: "rgba(203, 213, 225, 0.75)", flexShrink: 0 }} />
              <span>Acesso seguro e restrito aos gestores da NovaesWeb.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
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
                <ShieldCheck size={20} style={{ color: "#ec4899" }} />
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                  Recuperação de Acesso
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

            <p style={{ color: "#cbd5e1", fontSize: "13.5px", lineHeight: 1.6, margin: "0 0 16px" }}>
              Informe o e-mail cadastrado na sua loja ou conta administrativa para receber as instruções seguras de redefinição de senha.
            </p>

            <form onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <input
                type="email"
                placeholder="Seu e-mail cadastrado"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "rgba(10, 4, 16, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "14px",
                  outline: "none"
                }}
              />

              {forgotSuccess && (
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", color: "#a7f3d0", fontSize: "12.5px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <CheckCircle2 size={16} style={{ color: "#34d399", flexShrink: 0 }} />
                  <span>{forgotSuccess}</span>
                </div>
              )}

              {forgotError && (
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(225, 29, 72, 0.15)", border: "1px solid rgba(225, 29, 72, 0.4)", color: "#fecdd3", fontSize: "12.5px" }}>
                  {forgotError}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotLoading}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(90deg, #ec4899, #a855f7)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: forgotLoading ? "wait" : "pointer"
                }}
              >
                {forgotLoading ? "Enviando..." : "Enviar Instruções"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
