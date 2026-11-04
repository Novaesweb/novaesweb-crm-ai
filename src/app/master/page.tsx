import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ShieldCheck, UsersRound, Bot, MessageCircle, LogOut } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { signOutMaster } from "./actions";

export const dynamic = "force-dynamic";

export default async function MasterPage() {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return <main className="master-page"><section className="master-access-card"><ShieldCheck size={35}/><h1>Configuração necessária</h1><p>Para habilitar o Master, configure as variáveis públicas de autenticação do Supabase. Nenhuma chave foi incluída no repositório.</p><Link href="/login">Ir para login</Link></section></main>;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // Only server-confirmed, privileged membership may unlock this page.
  // The platform_staff table has read-only RLS limited to auth.uid().
  const { data: staff, error } = await supabase
    .from("platform_staff")
    .select("role, enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !staff || !staff.enabled || staff.role !== "MASTER") {
    return <main className="master-page"><section className="master-access-card"><ShieldCheck size={35}/><h1>Acesso não autorizado</h1><p>Sua conta não possui permissão Master ativa. O acesso não será concedido automaticamente.</p><form action={signOutMaster}><button type="submit">Sair da conta</button></form></section></main>;
  }

  return <main className="master-page">
    <header className="master-header"><div className="master-header-info"><span><ShieldCheck size={24}/> NovaesWeb CRM AI</span><h1>Painel Master</h1><p>Fundação do acesso administrativo. Nenhuma empresa ou agente está conectado nesta versão.</p></div><form action={signOutMaster}><button className="master-logout" type="submit"><LogOut size={17}/> Sair</button></form></header>
    <section className="master-intro"><span>MASTER AUTORIZADO</span><h2>Ambiente administrativo</h2><p>Bem-vindo. A identificação foi confirmada pelo Supabase Auth e a permissão pela tabela restrita <code>platform_staff</code>. As operações de clientes, agentes e conexões virão na próxima etapa.</p></section>
    <div className="master-kpis">
      <div><Building2 size={25}/><span>Empresas cadastradas</span><strong>—</strong><small>Aguardando integração</small></div>
      <div><Bot size={25}/><span>Agentes de IA</span><strong>—</strong><small>Aguardando integração</small></div>
      <div><MessageCircle size={25}/><span>Conversas</span><strong>—</strong><small>Aguardando integração</small></div>
      <div><UsersRound size={25}/><span>Clientes</span><strong>—</strong><small>Aguardando integração</small></div>
    </div>
    <Link className="master-back" href="/">Abrir demonstração do Dashboard</Link>
  </main>;
}
