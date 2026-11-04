"use client";

import { useMemo, useState } from "react";
import {
  Bell, Bot, Building2, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, Crown, Headphones, LayoutDashboard, Menu, MessageCircle,
  MoreHorizontal, Paperclip, Plus, Search, Send, Settings2, Smile,
  Sparkles, Tag, UserRound, UserRoundPlus, UsersRound, X,
  ChartNoAxesColumnIncreasing, CircleHelp, Megaphone, Workflow, Smartphone, Mic,
  CheckCheck
} from "lucide-react";

type Chat = { id: number; name: string; initials: string; color: string; preview: string; time: string; unread: number; mode: "IA" | "Humano"; messages: { id: number; from: "contact" | "agent" | "human"; text: string; time: string }[] };
type Filter = "Todas" | "IA" | "Humano" | "Não lidas";
type DetailTab = "Contato" | "Histórico" | "Automação";

const seedChats: Chat[] = [
  { id: 1, name: "Ana Souza", initials: "AS", color: "rose", preview: "Quero saber sobre os planos...", time: "10:24", unread: 2, mode: "IA", messages: [
    { id: 1, from: "contact", text: "Olá! Bom dia! 😊", time: "10:20" },
    { id: 2, from: "contact", text: "Quero saber sobre os planos do CRM AI.\nVocês têm uma versão de teste?", time: "10:21" },
    { id: 3, from: "agent", text: "Bom dia, Ana! Tudo bem? 😊\n\nTemos sim! Você pode conhecer o NovaesWeb CRM AI em uma demonstração com nossos recursos de agentes de IA, WhatsApp e relatórios.\n\nQuer que eu te envie mais informações?", time: "10:22" },
    { id: 4, from: "contact", text: "Quero sim! Pode me enviar. 🙏", time: "10:24" },
  ] },
  { id: 2, name: "Carlos Mendes", initials: "CM", color: "amber", preview: "Vocês fazem integração com...", time: "10:12", unread: 1, mode: "IA", messages: [
    { id: 1, from: "contact", text: "Vocês fazem integração com meu site?", time: "10:12" },
  ] },
  { id: 3, name: "Mariana Silva", initials: "MS", color: "rose", preview: "Perfeito, obrigado!", time: "09:47", unread: 0, mode: "Humano", messages: [
    { id: 1, from: "human", text: "Posso ajudar em mais alguma coisa?", time: "09:45" },
    { id: 2, from: "contact", text: "Perfeito, obrigado!", time: "09:47" },
  ] },
  { id: 4, name: "Empresa Alfa", initials: "EA", color: "blue", preview: "Pode me enviar a proposta?", time: "09:30", unread: 0, mode: "IA", messages: [
    { id: 1, from: "contact", text: "Pode me enviar a proposta?", time: "09:30" },
  ] },
  { id: 5, name: "João Pereira", initials: "JP", color: "gold", preview: "Já resolvido, valeu!", time: "Ontem", unread: 0, mode: "Humano", messages: [
    { id: 1, from: "contact", text: "Já resolvido, valeu!", time: "Ontem" },
  ] },
];

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Atendimentos", icon: MessageCircle },
  { name: "Contatos", icon: UsersRound },
  { name: "Agentes de IA", icon: Bot },
  { name: "Conexões WhatsApp", icon: Smartphone },
  { name: "Campanhas", icon: Megaphone },
  { name: "Automações", icon: Workflow },
  { name: "Relatórios", icon: ChartNoAxesColumnIncreasing },
  { name: "Configurações", icon: Settings2 },
];

const stats = [
  { title: "Conversas hoje", value: "187", trend: "+23%", icon: MessageCircle, color: "green" },
  { title: "Atendimentos ativos", value: "12", trend: "", icon: UserRound, color: "purple" },
  { title: "Respostas da IA", value: "169", trend: "+27%", icon: Bot, color: "purple" },
  { title: "Tempo médio", value: "1m 24s", trend: "↓ -31%", icon: Clock3, color: "blue" },
  { title: "Taxa de resolução", value: "92%", trend: "+6%", icon: CheckCircle2, color: "green" },
];

const starterTasks = ["Enviar planos e comparação", "Aguardar retorno (até 24h)", "Agendar demonstração"];

function Avatar({ chat, size = "normal" }: { chat: Pick<Chat, "initials" | "color">; size?: "normal" | "large" }) {
  return <span aria-hidden className={`avatar avatar--${chat.color} ${size === "large" ? "avatar--large" : ""}`}>
    {chat.initials}<span className="avatar-online"><MessageCircle size={10} strokeWidth={2.4} /></span>
  </span>;
}

export default function Dashboard() {
  const [nav, setNav] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>(seedChats);
  const [selectedId, setSelectedId] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("Todas");
  const [detailTab, setDetailTab] = useState<DetailTab>("Contato");
  const [draft, setDraft] = useState("");
  const [tasks, setTasks] = useState(starterTasks.map((title, id) => ({ id, title, done: false })));
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [notice, setNotice] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [companyMenu, setCompanyMenu] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const chat = chats.find(c => c.id === selectedId) ?? chats[0];
  const filtered = useMemo(() => chats.filter(c => {
    const matchSearch = `${c.name} ${c.preview}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    const matchFilter = filter === "Todas" || (filter === "Não lidas" ? c.unread > 0 : c.mode === filter);
    return matchSearch && matchFilter;
  }), [chats, filter, search]);
  const unread = chats.reduce((sum, c) => sum + c.unread, 0);

  function chooseChat(id: number) {
    setSelectedId(id);
    setChats(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
    setDetailsOpen(false);
    setNav("Atendimentos");
  }
  function sendMessage() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setChats(prev => prev.map(c => c.id === selectedId ? {
      ...c, preview: text, time: "Agora", mode: "Humano",
      messages: [...c.messages, { id: Date.now(), from: "human" as const, text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }],
    } : c));
    setDraft("");
    setNotice("Mensagem adicionada à simulação. Nenhum WhatsApp foi acionado.");
  }
  function addTask() {
    if (!newTask.trim()) return;
    setTasks(t => [...t, { id: Date.now(), title: newTask.trim(), done: false }]);
    setNewTask(""); setAddingTask(false);
  }
  function changeNav(name: string) {
    setNav(name); setMenuOpen(false);
    if (name !== "Dashboard" && name !== "Atendimentos") setNotice(`${name}: módulo previsto para uma próxima etapa. Esta é uma demonstração visual.`);
  }

  return <div className="app-shell">
    {menuOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar--open" : ""}`} aria-label="Navegação principal">
      <div className="brand" role="img" aria-label="NovaesWeb CRM AI">
        <span className="brand-mark">N</span><div><strong>NovaesWeb<span className="brand-star">✦</span></strong><span className="brand-pill">CRM AI</span></div>
      </div>
      <nav className="nav-list">
        {navItems.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${nav === name ? "active" : ""}`} onClick={() => changeNav(name)} aria-current={nav === name ? "page" : undefined}>
          <Icon size={20} strokeWidth={1.9}/><span>{name}</span>{name === "Atendimentos" && unread > 0 && <span className="nav-count">{unread}</span>}
        </button>)}
      </nav>
      <div className="sidebar-footer">
        <span className="footer-label">Painel Master</span>
        <button className="master-card" onClick={() => { window.location.assign("/master"); }}>
          <Crown size={24} className="master-crown"/>
          <span><strong>Painel Master</strong><small>Gestão da plataforma,<br/> clientes e consumo.</small></span>
          <ChevronRight size={18}/>
        </button>
        <div className="sidebar-glow" aria-hidden />
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="heading-group">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22}/></button>
          <div><h1>{nav === "Dashboard" || nav === "Atendimentos" ? "Dashboard" : nav}</h1><p>Visão geral do seu CRM e agentes de atendimento</p></div>
        </div>
        <div className="top-actions">
          <div className="company-control">
            <button className="company-button" onClick={() => setCompanyMenu(v => !v)} aria-expanded={companyMenu}><Building2 size={20}/><span>Minha Empresa</span><ChevronDown size={17}/></button>
            {companyMenu && <div className="company-popover"><strong>Ambiente de demonstração</strong><p>Somente Minha Empresa está disponível.</p><button onClick={() => setCompanyMenu(false)}>Entendi</button></div>}
          </div>
          <button className="notification-button" onClick={() => setNotice("Nenhuma notificação real: dados demonstrativos.")} aria-label="Notificações"><Bell size={23}/><span className="notification-dot"/></button>
          <div className="top-separator"/>
          <div className="user-badge"><span className="user-avatar">LN</span><span className="user-identity"><strong>Administrador</strong><small>NovaesWeb</small></span><ChevronDown size={18}/></div>
        </div>
      </header>

      <div className="demo-strip"><Sparkles size={14}/><span>Prévia visual do produto — dados fictícios e interações locais, sem WhatsApp ou IA conectados.</span><button onClick={() => setNotice("")} className="demo-help" title="Sobre a demonstração"><CircleHelp size={15}/></button></div>

      <section className="stats-grid" aria-label="Indicadores demonstrativos">
        {stats.map(({ title, value, trend, icon: Icon, color }) => <div className="stat-card" key={title}>
          <div className={`stat-icon stat-icon--${color}`}><Icon size={27} strokeWidth={2.2}/></div>
          <div className="stat-content"><span className="stat-title">{title}</span><div className="stat-value-row"><strong>{value}</strong>{trend && <span className="trend">{trend}</span>}</div></div>
        </div>)}
      </section>

      <section className="workspace" aria-label="Área de atendimento">
        <div className="inbox-panel panel">
          <div className="panel-titlebar"><h2>Caixa de Entrada</h2><span className="count-badge">{unread}</span><button aria-label="Informações da caixa de entrada" className="title-action" onClick={() => setNotice("Caixa de entrada demonstrativa com cinco conversas fictícias.")}><MoreHorizontal size={22}/></button></div>
          <label className="searchbox"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa, nome ou número..." aria-label="Buscar conversas"/></label>
          <div className="filters" aria-label="Filtrar conversas">{(["Todas", "IA", "Humano", "Não lidas"] as const).map(f => <button key={f} className={filter === f ? "selected" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
          <div className="chat-list" role="list">
            {filtered.length ? filtered.map(c => <button role="listitem" key={c.id} className={`chat-item ${selectedId === c.id ? "chat-item--active" : ""}`} onClick={() => chooseChat(c.id)}>
              <Avatar chat={c}/><span className="chat-item-info"><strong>{c.name}</strong><span>{c.preview}</span></span><span className="chat-item-meta"><time>{c.time}</time>{c.unread > 0 && <b>{c.unread}</b>}</span>
            </button>) : <div className="empty-list">Nenhuma conversa encontrada.</div>}
          </div>
        </div>

        <div className="conversation-panel panel">
          <div className="conversation-header">
            <Avatar chat={chat} size="large"/>
            <div className="conversation-contact"><strong>{chat.name}</strong><small><span className="online-dot"/> Atendimento de demonstração</small></div>
            <div className="conversation-actions">
              <button aria-label="Etiquetas" onClick={() => {setDetailTab("Contato");setDetailsOpen(true)}}><Tag size={19}/></button>
              <button aria-label="Assumir atendimento humano" onClick={() => {setChats(prev => prev.map(c => c.id === chat.id ? {...c, mode: "Humano"} : c));setNotice("Atendimento humano ativado nesta conversa simulada.");}}><UserRoundPlus size={20}/></button>
              <button aria-label="Mais opções" onClick={() => setDetailsOpen(v => !v)}><MoreHorizontal size={21}/></button>
            </div>
          </div>
          <div className="messages" aria-live="polite">
            {chat.messages.map(message => <div className={`bubble-row bubble-row--${message.from}`} key={message.id}>
              <div className={`message-bubble message-bubble--${message.from}`}>
                {message.from === "agent" && <span className="agent-label"><Bot size={17}/> Atendimento IA</span>}
                {message.from === "human" && <span className="agent-label"><Headphones size={15}/> Atendimento humano</span>}
                <p>{message.text}</p><span className="message-time">{message.time}{message.from !== "contact" && <CheckCheck size={13}/>}</span>
              </div>
            </div>)}
          </div>
          <form className="composer" onSubmit={e => {e.preventDefault();sendMessage()}}>
            <button type="button" aria-label="Adicionar emoji demonstrativo" title="Adicionar emoji" onClick={() => setDraft(t => t + " 😊")}><Smile size={21}/></button>
            <button type="button" aria-label="Anexo indisponível" title="Anexos indisponíveis na demonstração" onClick={() => setNotice("Anexos estarão disponíveis após integração com o backend.")}><Paperclip size={21}/></button>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Digite uma mensagem..." aria-label="Mensagem"/>
            <button type="button" aria-label="Áudio indisponível" title="Áudio indisponível na demonstração" onClick={() => setNotice("Gravação de áudio ainda não está implementada.")}><Mic size={21}/></button>
            <button className="send-button" type="submit" aria-label="Adicionar mensagem à simulação" disabled={!draft.trim()}><Send size={20}/></button>
          </form>
        </div>

        <div className={`details-panel ${detailsOpen ? "details-panel--open" : ""}`}>
          <div className="detail-tabs" role="tablist" aria-label="Detalhes da conversa">
            {(["Contato", "Histórico", "Automação"] as const).map(t => <button role="tab" aria-selected={detailTab === t} className={detailTab === t ? "active" : ""} key={t} onClick={() => setDetailTab(t)}>{t}</button>)}
          </div>
          {detailTab === "Contato" ? <div className="detail-card contact-card">
            <div className="contact-top"><Avatar chat={chat} size="large"/><div><strong>{chat.name}</strong><span><MessageCircle size={13}/> Número de demonstração</span></div><button onClick={() => setNotice("Edição de contato será conectada ao Supabase numa próxima etapa.")}><Settings2 size={13}/>Editar</button></div>
            <dl><dt>Empresa</dt><dd>—</dd><dt>Origem</dt><dd>WhatsApp</dd><dt>Tag(s)</dt><dd className="tags"><span>Lead</span><span>Interesse CRM</span><button aria-label="Adicionar etiqueta demonstrativa" onClick={() => setNotice("Cadastro de etiquetas será habilitado após a integração.")}><Plus size={18}/></button></dd></dl>
          </div> : <div className="detail-card alternate-card">{detailTab === "Histórico" ? <><Clock3 size={22}/><strong>Histórico da conversa</strong><p>{chat.messages.length} mensagens nesta demonstração. Os eventos reais serão registrados após a integração.</p></> : <><Workflow size={22}/><strong>Automação</strong><p>Configure regras, gatilhos e transferência para humanos quando o backend estiver disponível.</p></>}</div>}
          <div className="detail-card agent-card"><h3>Agente de IA</h3><div className="agent-main"><div className="agent-avatar"><Bot size={27}/></div><div><strong>Agente Comercial</strong><p>Especialista em apresentação, planos e qualificação de leads.</p></div><button aria-label={agentEnabled ? "Pausar agente de teste" : "Ativar agente de teste"} aria-pressed={agentEnabled} className={`agent-status ${!agentEnabled ? "is-off" : ""}`} onClick={() => setAgentEnabled(v => !v)}>{agentEnabled ? "Ativo" : "Pausado"}</button></div></div>
          <div className="detail-card tasks-card"><h3>Próximas ações</h3><div className="task-list">{tasks.map(t => <label key={t.id} className={t.done ? "task-done" : ""}><input type="checkbox" checked={t.done} onChange={() => setTasks(prev => prev.map(x => x.id === t.id ? {...x, done: !x.done} : x))}/><span>{t.title}</span></label>)}</div>{addingTask ? <form className="add-task-form" onSubmit={e => {e.preventDefault();addTask()}}><input aria-label="Nova tarefa" autoFocus value={newTask} placeholder="Nova tarefa..." onChange={e => setNewTask(e.target.value)}/><button type="submit" aria-label="Salvar tarefa"><Check size={17}/></button></form> : <button className="add-task" onClick={() => setAddingTask(true)}><Plus size={19}/> Adicionar tarefa</button>}</div>
        </div>
      </section>
    </main>
    {notice && <div className="toast" role="status"><CircleHelp size={17}/><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={16}/></button></div>}
    {detailsOpen && <button aria-label="Fechar detalhes" className="details-backdrop" onClick={() => setDetailsOpen(false)}/>}
  </div>;
}
