"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CrmLogin from "./crm-login";
import {
  ArrowLeft, Building2, CheckCircle2, CircleAlert, Inbox, LockKeyhole, LogOut,
  Mail, MessageSquare, RefreshCw, Search, ShieldCheck, Users, UserPlus
} from "lucide-react";

type Tenant={id:string;name:string;status:string};
type Contact={id:string;phone:string;display_name:string|null;created_at:string};
type Conversation={id:string;contact_id:string;status:string;mode:string;last_message_at:string|null;assigned_to:string|null};
type Message={id:string;conversation_id:string;direction:string;sender_type:string;body:string;created_at:string};
type Data={tenants:Tenant[];selectedTenant:string|null;contacts:Contact[];conversations:Conversation[];messages:Message[];note?:string};
function dateTime(s:string|null) { if(!s)return "—";const d=new Date(s);return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}); }
export default function OperatorPage() {
  const [authenticated,setAuthenticated]=useState(false);
  const [checking,setChecking]=useState(true);
  const [loading,setLoading]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const [tenant,setTenant]=useState("");
  const [selected,setSelected]=useState("");
  const [search,setSearch]=useState("");
  const [newContactOpen,setNewContactOpen]=useState(false);
  const [contactName,setContactName]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [contactNotice,setContactNotice]=useState("");
  const [handoffNotice,setHandoffNotice]=useState("");
  const [claiming,setClaiming]=useState(false);

  const fetchData=useCallback(async (tenantId:string)=>{
    setLoading(true);setError("");
    try {
      const url="/api/crm/operator/data"+(tenantId?"?tenant="+encodeURIComponent(tenantId):"");
      const response=await fetch(url,{cache:"no-store",credentials:"same-origin"});
      if(response.status===401){setAuthenticated(false);setData(null);setError("Sessão expirada. Entre novamente.");return;}
      if(!response.ok)throw Error(response.status===403?"Empresa não autorizada.":"Falha ao consultar dados da empresa.");
      const json=await response.json() as Data;
      setData(json);
    } catch(e) {setError(e instanceof Error?e.message:"Falha ao carregar atendimentos.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        const res=await fetch("/api/crm/operator/session",{cache:"no-store",credentials:"same-origin"});
        const result=await res.json() as {authenticated:boolean};
        if(!active)return;
        setAuthenticated(result.authenticated);
        if(result.authenticated)void fetchData("");
      }catch{if(active)setError("Não foi possível verificar a sessão.");}
      finally{if(active)setChecking(false);}
    })();
    return()=>{active=false;};
  },[fetchData]);
  async function signIn(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setLoading(true);setError("");
    try{
      const res=await fetch("/api/crm/operator/session",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email,password})
      });
      if(!res.ok){setError(res.status===401?"E-mail ou senha incorretos.":"Login indisponível. Confira a configuração do Supabase.");return;}
      setAuthenticated(true);setPassword("");setTenant("");setSelected("");
      await fetchData("");
    }catch{setError("Falha na conexão de login.");}
    finally{setLoading(false);}
  }
  async function signOut(){
    try{await fetch("/api/crm/operator/session",{method:"DELETE",credentials:"same-origin"});}
    finally{setAuthenticated(false);setData(null);setTenant("");setSelected("");setPassword("");setSearch("");}
  }
  async function changeTenant(value:string){setTenant(value);setSelected("");await fetchData(value);}
  async function registerContact(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setLoading(true);setError("");setContactNotice("");
    try {
      const res=await fetch("/api/crm/operator/contacts",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({tenantId:tenant,name:contactName,phone:contactPhone})
      });
      if(!res.ok){
        setError(res.status===409?"Este número já está cadastrado na empresa."
          :res.status===403?"Cadastro não permitido para esta conta ou empresa inativa."
          :"Não foi possível salvar o contato.");
        return;
      }
      setContactPhone("");setContactName("");setNewContactOpen(false);
      await fetchData(tenant);
      setContactNotice("Contato cadastrado no Supabase. Nenhum WhatsApp foi enviado.");
    }catch{setError("Falha na comunicação com o servidor. Não confirme o cadastro antes de recarregar.");}
    finally{setLoading(false);}
  }
  async function claimConversation(id:string) {
    if(!tenant)return;
    setClaiming(true);setError("");setHandoffNotice("");
    try {
      const res=await fetch("/api/crm/operator/handoff",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({tenantId:tenant,conversationId:id})
      });
      if(!res.ok){
        setError(res.status===403?"Seu perfil não pode assumir esta conversa.":res.status===409?"Conversa não está disponível ou a empresa está inativa.":"Não foi possível assumir o atendimento.");
        return;
      }
      await fetchData(tenant);
      setSelected(id);
      setHandoffNotice("Conversa atribuída a você no Supabase e marcada como atendimento humano. Ainda falta homologar o bloqueio da IA no motor de envio.");
    }catch{setError("Falha na conexão. Confira o histórico antes de repetir a operação.");}
    finally{setClaiming(false);}
  }
  const contacts=useMemo(()=>data?.contacts??[],[data]);
  const conversations=useMemo(()=>data?.conversations??[],[data]);
  const messages=data?.messages??[];
  const byContact=useMemo(()=>new Map(contacts.map(c=>[c.id,c])),[contacts]);
  const filtered=useMemo(()=>conversations.filter(c=>{
    const contact=byContact.get(c.contact_id);
    return (contact?.phone+" "+(contact?.display_name??"")).toLowerCase().includes(search.toLowerCase());
  }),[conversations,byContact,search]);
  const current=filtered.find(c=>c.id===selected)??filtered[0]??null;
  const thread=current?messages.filter(m=>m.conversation_id===current.id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)):[];
  // Login is the only public entry. Keep all CRM data and actions behind the existing session.
  if (!checking && !authenticated) return <CrmLogin
    email={email} password={password} onEmailChange={setEmail} onPasswordChange={setPassword}
    onSignIn={signIn} loading={loading} error={error}
  />;
  return <div className="op-shell">
    <header className="op-topbar"><div className="op-brand"><span>N</span><strong>NovaesWeb <em>CRM AI</em></strong></div>
      <div className="op-top-actions">{authenticated&&<><Link href="/operator/knowledge" className="op-back">Conhecimento</Link><Link href="/admin" className="op-back">Central Master</Link><Link href="/lab" className="op-back"><ArrowLeft size={16}/> Laboratório técnico</Link></>}
        {authenticated&&<button className="op-exit" onClick={()=>void signOut()}><LogOut size={17}/> Sair</button>}
      </div>
    </header>
    {checking?<section className="op-card op-centered"><RefreshCw size={26}/><h1>Verificando acesso</h1></section>
    : !authenticated?<main className="op-card op-login">
      <LockKeyhole size={32} color="#ac6bff"/><h1>Entrar no CRM</h1>
      <p>Use o usuário autorizado no Supabase do CRM. O sistema só exibe as empresas às quais você pertence.</p>
      <form onSubmit={e=>void signIn(e)}>
        <label>E-mail<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"/></label>
        <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button className="op-primary" disabled={loading||!email||!password}>{loading?"Autenticando...":"Entrar"}</button>
      </form>
      {error&&<p className="op-alert" role="alert"><CircleAlert size={16}/>{error}</p>}
      <div className="op-notice"><ShieldCheck size={18}/> Sem cadastro público. A entrada de operadores é controlada pela NovaesWeb.</div>
    </main>
    : <main className="op-main">
      <div className="op-heading"><div><h1>Central de atendimentos</h1><p>Contatos e conversas reais do Supabase — nenhuma mensagem é enviada por esta página.</p></div>
        <button className="op-refresh" disabled={loading} onClick={()=>void fetchData(tenant)}><RefreshCw size={17}/> Atualizar</button>
      </div>
      {error&&<p className="op-alert" role="alert"><CircleAlert size={16}/>{error}</p>}
      <div className="op-tenant-bar"><Building2 size={20}/><label htmlFor="op-tenant">Empresa</label>
        <select id="op-tenant" value={tenant} onChange={e=>void changeTenant(e.target.value)}>
          <option value="">Selecione uma empresa</option>
          {data?.tenants.map(t=><option key={t.id} value={t.id}>{t.name}{t.status!=="active"?" (inativa)":""}</option>)}
        </select>
        <span><ShieldCheck size={15}/> Acesso isolado por empresa</span>
      </div>
      {!tenant?<section className="op-card op-centered"><Building2 size={32}/>
        <h2>{data?.tenants.length?"Escolha uma empresa":"Nenhuma empresa vinculada"}</h2>
        <p>{data?.tenants.length?"Selecione uma empresa autorizada para abrir as conversas.":"O login funcionou, mas esta conta ainda não possui vínculo no CRM. O administrador deve cadastrá-lo no Supabase."}</p>
      </section>:<>
        <section className="op-stats">
          <div className="op-card"><Users size={23}/><span>Contatos cadastrados (até 100)</span><strong>{contacts.length}</strong></div>
          <div className="op-card"><Inbox size={23}/><span>Conversas listadas (até 100)</span><strong>{conversations.length}</strong></div>
          <div className="op-card"><MessageSquare size={23}/><span>Mensagens recentes (até 300)</span><strong>{messages.length}</strong></div>
        </section>
        <section className="op-card op-contacts-section" aria-label="Cadastro de contatos reais">
          <div className="op-contact-heading"><div><UserPlus size={23}/><h2>Contatos da empresa</h2><span>{contacts.length} exibidos</span></div>
            <button className="op-refresh" onClick={()=>setNewContactOpen(v=>!v)} aria-expanded={newContactOpen}>{newContactOpen?"Fechar":"Novo contato"}</button></div>
          {newContactOpen&&<form className="op-contact-form" onSubmit={e=>void registerContact(e)}>
            <label>Nome (opcional)<input value={contactName} maxLength={160} onChange={e=>setContactName(e.target.value)} placeholder="Nome real do contato"/></label>
            <label>WhatsApp com DDI<input type="tel" required value={contactPhone} onChange={e=>setContactPhone(e.target.value)} placeholder="Ex.: 5511999999999" pattern="[+0-9 ()-]{10,22}"/></label>
            <button type="submit" className="op-primary" disabled={loading||!contactPhone.trim()}>Salvar contato</button>
            <p>Cadastro no Supabase, sem mensagem ou convite por WhatsApp. Apenas operadores autorizados podem cadastrar.</p>
          </form>}
          {contactNotice&&<p className="op-contact-success" role="status"><CheckCircle2 size={17}/>{contactNotice}</p>}
          <div className="op-contact-chips">{contacts.length?contacts.slice(0,12).map(c=><div key={c.id} title={c.phone}><strong>{c.display_name||"Sem nome"}</strong><small>{c.phone}</small></div>):<p>Nenhum contato cadastrado nesta empresa.</p>}</div>
        </section>
        <section className="op-workspace">
          <aside className="op-card op-inbox"><h2>Conversas</h2>
            <label className="op-search"><Search size={16}/><input aria-label="Buscar contato" placeholder="Nome ou número" value={search} onChange={e=>setSearch(e.target.value)}/></label>
            <div className="op-list">{filtered.length?filtered.map(c=>{
              const contact=byContact.get(c.contact_id);
              return <button key={c.id} className={current?.id===c.id?"op-contact active":"op-contact"} onClick={()=>setSelected(c.id)}>
                <strong>{contact?.display_name||contact?.phone||"Contato não identificado"}</strong>
                <span>{c.status} · {c.mode} · {dateTime(c.last_message_at)}</span>
              </button>;
            }):<div className="op-empty">Nenhum atendimento registrado nesta empresa.</div>}</div>
          </aside>
          <article className="op-card op-thread">
            {current?<><div className="op-thread-head"><strong>{byContact.get(current.contact_id)?.display_name||byContact.get(current.contact_id)?.phone||"Contato"}</strong>
              <span>{current.status} · Atendimento {current.mode}</span>
              {current.status!=="resolved"&&<button type="button" className="op-refresh" disabled={claiming||loading} onClick={()=>void claimConversation(current.id)}>
                {claiming?"Registrando...":"Assumir atendimento"}
              </button>}</div>
              {handoffNotice&&<p className="op-contact-success" role="status"><CheckCircle2 size={17}/>{handoffNotice}</p>}
              <div className="op-bubbles">{thread.length?thread.map(m=><div key={m.id} className={m.direction==="outbound"?"op-message sent":"op-message"}>
                <span>{m.sender_type==="human"?"Atendente":m.sender_type==="agent"?"IA":"Cliente"}</span><p>{m.body}</p><small>{dateTime(m.created_at)}</small>
              </div>):<div className="op-empty">Nenhuma mensagem registrada no histórico desta conversa.</div>}</div>
              <div className="op-readonly"><LockKeyhole size={17}/> Somente leitura: envio humano e IA permanecem bloqueados até a homologação.</div>
            </>:<div className="op-centered op-thread-empty"><MessageSquare size={32}/><h2>Selecione um atendimento</h2><p>As mensagens aparecerão aqui depois que os registros reais forem gravados no Supabase.</p></div>}
          </article>
        </section>
      </>}
      <p className="op-footnote"><Mail size={15}/> Sessão individual autenticada; acesso aos dados verificado pelo Supabase Auth e políticas RLS. Sessões expiram e exigem novo login.</p>
    </main>}
  </div>;
}
