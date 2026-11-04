"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, LockKeyhole, Mail, LoaderCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("Autenticação ainda não configurada neste ambiente.");
      return;
    }
    setBusy(true);setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError("Não foi possível entrar. Confira seu e-mail e senha.");
        return;
      }
      router.replace("/master");
      router.refresh();
    } catch {
      setError("Falha ao conectar ao serviço de autenticação.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-card">
      <span className="auth-icon"><ShieldCheck size={28}/></span>
      <div className="auth-heading"><span className="auth-eyebrow">NOVAESWEB CRM AI</span><h1>Acesso administrativo</h1><p>Entre com sua conta autorizada para acessar o Painel Master.</p></div>
      {!configured && <div className="auth-warning" role="status">Ambiente de demonstração: configure as variáveis públicas do Supabase para habilitar o login.</div>}
      <form onSubmit={onSubmit} className="auth-form">
        <label htmlFor="email"><Mail size={17}/> E-mail</label>
        <input id="email" type="email" autoComplete="username" placeholder="seu@email.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={!configured || busy}/>
        <label htmlFor="password"><LockKeyhole size={17}/> Senha</label>
        <input id="password" type="password" minLength={6} autoComplete="current-password" placeholder="Sua senha" required value={password} onChange={e => setPassword(e.target.value)} disabled={!configured || busy}/>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={!configured || busy}>{busy && <LoaderCircle size={17}/>} Entrar no Master</button>
      </form>
      <Link className="auth-back" href="/"><ArrowLeft size={16}/> Voltar para a demonstração</Link>
      <p className="auth-footnote">Cadastro público desativado. O acesso é liberado apenas pela administração.</p>
    </div>
  </main>;
}
