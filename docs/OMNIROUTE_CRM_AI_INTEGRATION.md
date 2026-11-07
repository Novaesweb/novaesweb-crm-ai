# Guia Definitivo de Integracao: OmniRoute + NovaesWeb CRM AI

Este documento descreve a arquitetura, o funcionamento e as operacoes oficiais do **OmniRoute** integrado ao ecossistema **NovaesWeb CRM AI**.

---

## 1. Visao Geral da Arquitetura

O sistema funciona em camadas desacopladas e containerizadas com Docker Desktop no Windows:

```
[ Cliente / WhatsApp ]
          │
          ▼
[ Evolution API (Porta 8080) ]
          │
          ▼ (Webhook HTTP)
[ NovaesWeb CRM AI (Porta 3040) ]
          │
          ▼ (OpenAI Compatible API / Bearer Token)
[ OmniRoute (Porta 20128) ]
          │
          ▼ (Fallback / Proxy Unificado)
[ Provedores de IA (Groq / Meta / OpenAI) ]
          │
          ▼
[ Persistencia & Historico: Supabase ]
```

---

## 2. Portas e Painéis de Acesso

| Serviço | URL Local | Descrição |
|---|---|---|
| **OmniRoute Dashboard** | `http://localhost:20128` | Gestão de chaves, provedores de IA, roteamento e consumo. |
| **NovaesWeb CRM AI** | `http://localhost:3040` | Painel de Atendimentos, Agentes, Contatos e Base de Conhecimento. |
| **Evolution API** | `http://localhost:8080` | Gateway de conexão e instâncias do WhatsApp. |
| **Evolution Manager** | `http://localhost:3000` | Interface web para parear QR Code da Evolution API. |

---

## 3. O Que a IA Precisa Para Funcionar Corretamente

Para que a inteligência artificial responda com precisão, rapidez e sem falhas, quatro componentes essenciais devem estar alinhados:

### A. Motor de Roteamento (OmniRoute)
* **Contêiner Ativo:** `novaes-omniroute` rodando com política `--restart unless-stopped`.
* **Provedor Conectado:** Um provedor com saldo/cota ativa configurado (ex.: **Groq**, já provisionado com chave oficial recuperada).
* **Chave de API Interna:** Chave gerada no OmniRoute para autorizar o CRM (`AI_API_KEY`).

### B. Cérebro e Regras de Negócio (NovaesWeb CRM AI)
* **Endpoint de Comunicação:** `AI_OPENAI_BASE_URL=http://host.docker.internal:20128/v1`
* **Modelo Adequado:** `auto` ou `auto/best-chat` (garante resposta conversacional rápida sem interrupção).
* **Contexto de Negócio (`AI_BUSINESS_CONTEXT`):** Define que a assistente é da NovaesWeb, apresenta criação de sites, e-commerce e suporte, proibindo alucinações de preços ou prazos não confirmados.

### C. Canal de Mensagens (WhatsApp / Evolution API)
* Instância conectada e autenticada via QR Code.
* Webhook apontado para `http://host.docker.internal:3040/api/evolution/webhook`.
* Controle de ativação: `AI_REPLY_ENABLED=true` (mantido desligado ou restrito a número de teste até validação final).

### D. Armazenamento e Histórico (Supabase)
* Instância Supabase configurada com URL e Service Role Key para registrar leads, histórico de mensagens e dados cadastrais.

---

## 4. Scripts Utilitários Inclusos

Na pasta `scripts/`, você encontra automações prontas:

1. **Testar o Pipeline de IA Completo:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/test-ai-pipeline.ps1
   ```
   * Valida a saúde do OmniRoute.
   * Realiza uma inferência direta de teste.
   * Executa a pergunta através do CRM AI App e exibe a resposta da assistente.

2. **Redefinir Senha do Painel OmniRoute:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/reset-omniroute-password.ps1 -NewPassword "SuaNovaSenha"
   ```
   * Atualiza o hash bcrypt diretamente no banco SQLite e reinicia o contêiner de forma segura.

---

## 5. Boas Práticas para o GitHub

* O arquivo `.gitignore` foi atualizado para ignorar a pasta `backups/`, bancos SQLite (`*.sqlite`) e arquivos `.env.*`.
* Chaves secretas, senhas de dashboard e credenciais bancárias/bancos de dados **nunca** devem ser commitadas em repositórios públicos.

