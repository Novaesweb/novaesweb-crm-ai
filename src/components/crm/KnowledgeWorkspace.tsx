"use client";
import {useCallback, useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckCircle2,FilePlus2,LockKeyhole,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
type Tenant={id:string;name:string;status:string};
type Article={id:string;title:string;body:string;status:"draft"|"published"|"archived";updated_at:string};
type KnowledgeWorkspaceProps = { embedded?: boolean; tenantId?: string };
export default function KnowledgeWorkspace({ embedded = false, tenantId = "" }: KnowledgeWorkspaceProps){
 const [tenants,setTenants]=useState<Tenant[]>([]);
 const [tenant,setTenant]=useState(tenantId);
 const [articles,setArticles]=useState<Article[]>([]);
 const [selected,setSelected]=useState("");
 const [title,setTitle]=useState("");
 const [body,setBody]=useState("");
 const [status,setStatus]=useState<Article["status"]>("published");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [limited,setLimited]=useState(false);

 const loadArticles = useCallback(async (tenantId:string)=>{
  if(!tenantId){setArticles([]);setLimited(false);return;}
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/knowledge?tenant="+encodeURIComponent(tenantId),{cache:"no-store"});
   if(!r.ok){setError("Não foi possível consultar os artigos desta empresa.");setArticles([]);return;}
   const v=await r.json() as {articles:Article[];limited:boolean};
   setArticles(v.articles);setLimited(v.limited);
  }catch{setError("Falha na consulta dos artigos.");setArticles([]);}
  finally{setLoading(false);}
 },[]);

 const loadTenants = useCallback(async ()=>{
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/crm/operator/data",{cache:"no-store"});
   if(!r.ok){setError(r.status===401?"Faça login no Portal Operacional.":"Não foi possível consultar suas empresas.");return;}
   const v=await r.json() as {tenants:Tenant[]};
   setTenants(v.tenants);
   if(v.tenants.length && !tenant){
     const firstId = v.tenants[0].id;
     setTenant(firstId);
     void loadArticles(firstId);
   }
  }catch{setError("Conexão indisponível.");}finally{setLoading(false);}
 },[tenant, loadArticles]);

 useEffect(()=>{
  if(embedded){
   setTenant(tenantId);setSelected("");setTitle("");setBody("");setStatus("published");setNotice("");
   if(tenantId) void loadArticles(tenantId); else setLoading(false);
   return;
  }
  void loadTenants();
 },[embedded,tenantId,loadArticles,loadTenants]);

 function selectArticle(id:string){
  setSelected(id);setNotice("");setError("");
  const a=articles.find(x=>x.id===id);
  setTitle(a?.title??"");setBody(a?.body??"");setStatus(a?.status??"published");
 }
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setSaving(true);setError("");setNotice("");
  try{
   const isEdit=!!selected;
   const r=await fetch("/api/crm/operator/knowledge",{
    method:isEdit?"PATCH":"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tenantId:tenant,...(isEdit?{id:selected,status}:{}),title,body})
   });
   if(!r.ok){
    setError(r.status===403?"Você não possui permissão para esta alteração.":r.status===404?"Artigo não encontrado. Atualize a página.":"Não foi possível gravar. Verifique os campos e sua conexão.");
    return;
   }
   const result=await r.json() as {id?:string};
   await loadArticles(tenant);
   if(!isEdit){selectArticle("");} else {setSelected(selected);}
   setNotice(isEdit?"Alterações gravadas no Supabase com sucesso! A IA já usará estas informações.":"Artigo salvo no Supabase! A IA já usará estas informações.");
   if(!isEdit&&result.id){setSelected(result.id);setTitle(title);setBody(body);setStatus("published");}
  }catch{setError("Erro de comunicação ao salvar o artigo.");}
  finally{setSaving(false);}
 }
 const Container = embedded ? "section" : "main";
 const Heading = embedded ? "h3" : "h1";
 return <Container className={embedded ? undefined : "kn-shell"} aria-label="Base de conhecimento">
   {!embedded && <div className="kn-top">
    <Link href="/cliente" className="adm-back"><ArrowLeft size={17}/> Voltar ao Painel da Loja</Link>
    <span><Sparkles size={20}/> Treinamento da IA · Base de Conhecimento</span>
   </div>}
   <header className="adm-header">
    <div>
      <Heading>O que a IA vai responder (Base de Conhecimento)</Heading>
      <p>Cadastre aqui o cardápio, preços, horários de atendimento, regras e perguntas frequentes da sua loja.</p>
    </div>
   </header>
   {error&&<div role="alert" className="op-alert">{error}</div>}
   {!embedded && <div className="op-tenant-bar"><ShieldCheck size={18}/><label htmlFor="kn-company">Loja vinculada:</label>
    <select id="kn-company" value={tenant} onChange={e=>{setTenant(e.target.value);setSelected("");setTitle("");setBody("");setStatus("published");setNotice("");void loadArticles(e.target.value);}}>
      {tenants.map(t=><option key={t.id} value={t.id}>{t.name}{t.status!=="active"?" (inativa)":""}</option>)}
    </select>
    {loading&&<RefreshCw size={17}/>}
   </div>}
   {embedded && loading && <p role="status">Carregando artigos...</p>}
   {!tenant?<section className="op-card op-centered"><LockKeyhole size={28}/><h2>Selecione uma empresa</h2><p>{tenants.length?"Os artigos de cada empresa são separados.":"Sem empresas vinculadas a este usuário."}</p></section>
    :<div className="kn-layout" style={embedded ? {gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))"} : undefined}>
      <section className="op-card kn-list">
       <div className="kn-list-head"><h2>Artigos da Loja</h2><button type="button" onClick={()=>selectArticle("")} className="op-refresh"><FilePlus2 size={17}/> Novo Artigo</button></div>
       {limited&&<p className="adm-warning">Mostrando até 100 artigos.</p>}
       {articles.length?articles.map(a=><button type="button" key={a.id} className={selected===a.id?"kn-article active":"kn-article"} onClick={()=>selectArticle(a.id)}>
          <strong>{a.title}</strong><span>{a.status==="published"?"Publicado (Ativo na IA)":a.status==="draft"?"Rascunho":"Arquivado"} · {new Date(a.updated_at).toLocaleDateString("pt-BR")}</span>
       </button>):<p className="op-empty">Nenhum artigo cadastrado ainda. Clique em &quot;Novo Artigo&quot; para ensinar a IA sobre seus produtos ou serviços.</p>}
      </section>
      <section className="op-card kn-editor"><h2>{selected?"Editar Informação":"Nova Informação para a IA"}</h2>
        <p>A IA consultará essas informações para responder com precisão as dúvidas dos seus clientes no WhatsApp.</p>
        <form onSubmit={e=>void save(e)}>
          <label>Título do Assunto<input value={title} minLength={3} maxLength={200} onChange={e=>setTitle(e.target.value)} required placeholder="Ex.: Cardápio e Preços de Pizzas, Horário de Funcionamento..."/></label>
          <label>Informações Detalhadas (Conteúdo)<textarea value={body} maxLength={20000} rows={12} onChange={e=>setBody(e.target.value)} required placeholder="Descreva tudo em detalhes para a IA: produtos, preços, taxas de entrega, chave pix, etc."/></label>
          {selected&&<label>Status na IA<select value={status} onChange={e=>setStatus(e.target.value as Article["status"])}>
            <option value="published">Publicado (Usar no atendimento da IA)</option>
            <option value="draft">Rascunho (Não responder ainda)</option>
            <option value="archived">Arquivado</option>
          </select></label>}
          <button className="op-primary" disabled={saving||loading||title.trim().length<3||!body.trim()} type="submit">{saving?"Salvando...":"Salvar e Atualizar IA"}</button>
          {notice&&<p className="kn-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
        </form>
      </section>
    </div>}
 </Container>;
}
