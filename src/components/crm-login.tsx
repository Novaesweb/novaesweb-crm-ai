"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, CircleAlert, CheckCircle2, LoaderCircle } from "lucide-react";
import styles from "./crm-login.module.css";

type Props = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  loading: boolean;
  error: string;
};

export default function CrmLogin({email, password, onEmailChange, onPasswordChange, onSignIn, loading, error}: Props) {
  const [visible, setVisible] = useState(false);
  const [recoverMode, setRecoverMode] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const emailId = useId();
  const passwordId = useId();
  const canSubmit = email.trim().length > 3 && (recoverMode || password.length >= 8);

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoverLoading) return;
    setRecoverLoading(true); setRecoverError(""); setNotice("");
    try {
      const response = await fetch("/api/crm/auth/recover", {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: email.trim()})
      });
      if (!response.ok) {
        setRecoverError(response.status === 429 ? "Muitas solicitações. Tente novamente mais tarde." : "Não foi possível solicitar a recuperação agora.");
        return;
      }
      setNotice("Se este e-mail estiver cadastrado, você receberá as instruções de recuperação.");
    } catch {
      setRecoverError("Sem conexão para solicitar a recuperação. Tente novamente.");
    } finally { setRecoverLoading(false); }
  }

  return <main className={styles.scene}>
    <div className={styles.ambientTop} aria-hidden="true"/>
    <div className={styles.ambientBottom} aria-hidden="true"/>
    <div className={styles.frame}>
      <header className={styles.brand} aria-label="NovaesWeb CRM AI">
        <span className={styles.brandMark} aria-hidden="true">N</span>
        <span className={styles.brandName}>NovaesWeb</span>
        <span className={styles.brandBadge}>CRM AI</span>
      </header>

      <section className={styles.card} aria-labelledby="crm-login-title">
        <div className={styles.lockIcon} aria-hidden="true"><LockKeyhole size={35} strokeWidth={2.3}/></div>
        <h1 id="crm-login-title">{recoverMode ? "Recuperar senha" : "Entrar no CRM"}</h1>
        <p className={styles.description}>{recoverMode
          ? "Informe seu e-mail cadastrado para receber as instruções de recuperação."
          : "Use o usuário autorizado no Supabase do CRM. O sistema só exibe as empresas às quais você pertence."}</p>

        <form className={styles.form} onSubmit={recoverMode ? recover : onSignIn}>
          <div className={styles.field}>
            <label htmlFor={emailId}>E-mail</label>
            <div className={styles.inputShell}>
              <Mail size={22} aria-hidden="true" />
              <input id={emailId} name="email" type="email" inputMode="email" autoComplete="username" required
                maxLength={254} placeholder="seu@email.com" value={email} onChange={e=>onEmailChange(e.target.value)}
                aria-invalid={Boolean(error && !recoverMode)} />
            </div>
          </div>

          {!recoverMode && <div className={styles.field}>
            <label htmlFor={passwordId}>Senha</label>
            <div className={styles.inputShell}>
              <LockKeyhole size={21} aria-hidden="true" />
              <input id={passwordId} name="password" type={visible ? "text" : "password"} autoComplete="current-password"
                minLength={8} maxLength={256} required placeholder="Sua senha" value={password}
                onChange={e=>onPasswordChange(e.target.value)} />
              <button className={styles.eyeButton} type="button" aria-label={visible?"Ocultar senha":"Mostrar senha"}
                aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>
                {visible?<EyeOff size={23}/>:<Eye size={23}/>}
              </button>
            </div>
          </div>}

          {!recoverMode && <button className={styles.forgot} type="button" onClick={()=>{setRecoverMode(true);setNotice("");setRecoverError("");}}>
            Esqueci minha senha
          </button>}

          {(recoverMode ? recoverError : error) && <p role="alert" className={styles.alert}><CircleAlert size={18}/>{recoverMode ? recoverError : error}</p>}
          {notice && <p role="status" className={styles.success}><CheckCircle2 size={18}/>{notice}</p>}

          <button className={styles.submit} type="submit" disabled={!canSubmit || loading || recoverLoading}>
            {(loading || recoverLoading) ? <LoaderCircle className={styles.spin} size={22} aria-hidden="true"/> : null}
            <span>{recoverMode ? (recoverLoading?"Enviando...":"Enviar instruções") : (loading?"Autenticando...":"Entrar")}</span>
            {!(loading || recoverLoading) && <ArrowRight size={24} aria-hidden="true"/>}
          </button>

          {recoverMode && <button className={styles.back} type="button" onClick={()=>{setRecoverMode(false);setNotice("");setRecoverError("");}}>
            Voltar para entrar
          </button>}
        </form>

        <div className={styles.securityNote}><ShieldCheck size={26} strokeWidth={1.9} aria-hidden="true"/>
          <span>Sem cadastro público. A entrada de operadores é controlada pela NovaesWeb.</span>
        </div>
      </section>
    </div>
  </main>;
}
