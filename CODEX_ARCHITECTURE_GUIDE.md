# NOVAES CRM IA — MAPA COMPLETO DO SISTEMA (GUIA PARA CODEX / IA / DEV)

Este documento mapeia **exatamente onde está cada arquivo, regra de negócio, tela, API, tabela do Supabase e chave do Redis** no projeto **Novaes CRM IA**.

> **Instrução para o Codex / Agente de IA:**
> Antes de alterar qualquer código, leia este mapa para localizar o módulo exato, respeite o isolamento multiempresa (`tenant_id`) e rode os comandos de validação da Seção 8 ao terminar.

---

## 1. Informações do Repositório e Branch Atual

- **Caminho local do projeto:** `C:\Users\camil\novaesweb-crm-ai`
- **Branch de desenvolvimento com todas as melhorias implementadas:** `feat/commercial-plans-definitive`
- **Branch principal de produção:** `main` (atualmente intocada no commit `d4f88b6`)
- **Stack Tecnológica:**
  - Next.js 15 (App Router) + React 19 + TypeScript
  - Banco de Dados e Auth: Supabase (`public.crm_*` e `auth.users`)
  - Cache, Filas, Locks e Catálogo Master: Redis (`ioredis`)
  - WhatsApp Gateway: Evolution API v2

---

## Master unificado (atualização de 07/11/2026)

O Master usa uma única estrutura e menu em `/admin`: Clientes, Planos, Faturamento, Provedores de IA e CRM NovaesWeb. A seção selecionada fica em `?section=clients|plans|kpis|providers|crm`, com suporte a recarregar e voltar no navegador.

- `src/components/crm/ProvidersWorkspace.tsx`: conteúdo de provedores, incorporado ao Master.
- `src/components/crm/ClientWorkspace.tsx`: CRM reutilizado no painel cliente e no Master. No modo `embedded`, usa navegação operacional local e não cria outra sidebar, marca, seletor de empresa ou saída.
- `src/components/crm/KnowledgeWorkspace.tsx`: editor de artigos reutilizado na aba Base de conhecimento do CRM integrado, com empresa fixa e sem sair do Master. A entrada independente dos clientes permanece em `src/app/cliente/knowledge/page.tsx`.
- `src/app/cliente/page.tsx`: entrada do cliente; o link antigo `?tenant=novaesweb` redireciona para `/admin?section=crm`.
- `src/app/admin/ai-providers/page.tsx`: redireciona o link antigo para `/admin?section=providers`.
- `src/lib/crm/tenant-access.ts`: autorização das operações CRM. O Master resolve somente sua própria empresa no servidor; nenhuma chave privilegiada é enviada ao navegador. A identificação usa `CRM_MASTER_OWN_TENANT_ID` quando configurado ou o nome exato NovaesWeb (sem distinção de maiúsculas), recusando ausência ou ambiguidade. Operadores continuam limitados aos seus vínculos.
- O CRM usa o UUID `selectedTenant` retornado pela API; um tenant solicitado inválido não seleciona outra empresa por padrão.
- `tests/unified-master.spec.ts`: navegação e links antigos com APIs simuladas; não envia WhatsApp nem altera dados reais.
- `src/lib/crm/tenant-access.test.ts`: verificações de autorização com respostas simuladas. Estes testes não comprovam RLS entre usuários reais.

## 2. Mapa Rápido: "Onde Mexer Quando Eu Quiser Alterar..."

| O que você quer alterar / arrumar | Arquivo(s) exato(s) onde mexer |
| :--- | :--- |
| **Preços, franquias, limites de WhatsApp (1, 3, 5), limites de operadores (1, 3, 5) ou recursos de cada plano** | `src/lib/crm/plans.ts` (`DEFAULT_PLANS`, `TRIAL_PLAN`, `TECHNICAL_FEATURES`) |
| **Regras de bloqueio de funcionalidade por plano (4 estados: liberado, bloqueado, manutenção, suspenso)** | `src/lib/crm/plans.ts` (`buildFeatureGovernanceMap`, `requireTenantFeature`) |
| **Visual do Painel do Cliente (`/cliente` — abas, chat ao vivo, IA, horários, simulador, meu plano)** | `src/components/crm/ClientWorkspace.tsx`, `src/app/cliente/page.tsx` e `src/components/crm/ClientPlanModules.tsx` |
| **Módulos novos do Painel do Cliente (5 espaços de WhatsApp, Respostas Rápidas, Equipe/Operadores, Relatórios, Matriz de Recursos e Modal de Upgrade)** | `src/components/crm/ClientPlanModules.tsx` |
| **Visual do Painel Master (`/admin` — cadastro de clientes, edição de planos, faturamento, bloqueio administrativo, aprovação de upgrades, botão Meu CRM NovaesWeb)** | `src/app/admin/page.tsx` |
| **Central de Provedores de IA do Master (`/admin?section=providers`)** | `src/components/crm/ProvidersWorkspace.tsx` e `src/app/api/crm/admin/ai-lab/` |
| **Lógica dos 5 espaços de WhatsApp (`loja_slug`, `loja_slug_2`..`_5`) e pausa de canais no downgrade** | `src/lib/crm/whatsapp-slots.ts` |
| **Conexão do WhatsApp, geração de QR Code e status da Evolution API** | `src/app/api/crm/whatsapp/connect/route.ts` e `src/app/api/crm/whatsapp/status/route.ts` |
| **Recebimento de mensagens do WhatsApp (Webhook da Evolution API)** | `src/app/api/evolution/webhook/route.ts` e `src/lib/agent/processor.ts` |
| **Contagem da franquia de atendimentos (janela de 24h, não cobrar humano, trava anti-loop de 25 msgs)** | `src/lib/agent/processor.ts` |
| **Personalidade da IA, prompt do sistema, entendimento de erros de digitação (typos) e cliente nervoso** | `src/lib/agent/ai.ts`, `src/lib/agent/escalation.ts` e `src/lib/agent/processor.ts` |
| **Cálculo de horário de funcionamento (básico vs. avançado com intervalo de almoço)** | `src/lib/agent/processor.ts` (`checkOperatingHours`) e `src/app/api/crm/operator/ai-settings/route.ts` |
| **Etiquetas comerciais, prioridade da conversa, pesquisa de satisfação, respostas rápidas e operadores** | `src/app/api/crm/operator/features/route.ts` e `src/app/api/crm/operator/tags/route.ts` |
| **Persistência no Supabase (criar contato, salvar mensagem, buscar contexto da loja, handoff humano)** | `src/lib/crm/supabase-ingest.ts` e `src/lib/crm/supabase-server.ts` |
| **Estilos globais, cores neon, cards e layout responsivo** | `src/app/globals.css` |

---

## 3. Detalhamento Completo por Módulo e Arquivo

### 3.1. Núcleo de Planos, Direitos Comerciais e Governança (`src/lib/crm/`)

1. **`src/lib/crm/plans.ts`**
   - **O que faz:** É a **fonte oficial da verdade** dos planos comerciais (`Teste Grátis`, `CRM Start`, `CRM Business`, `CRM Premium`).
   - **Principais funções e constantes:**
     - `TECHNICAL_FEATURES`: Lista dos 18 recursos técnicos do sistema e qual o plano mínimo de cada um.
     - `START_FEATURES`, `BUSINESS_FEATURES`, `PREMIUM_FEATURES`: Arrays com os IDs liberados em cada plano.
     - `DEFAULT_PLANS` e `TRIAL_PLAN`: Definição de preços (`59,90`, `99,90`, `159,90`), franquias (`100` no trial, `200`, `600`, `1500`), `maxWhatsappConnections` (`1`, `3`, `5`) e `maxOperators` (`1`, `3`, `5`).
     - `normalizeCatalogPlan()`: Atualiza automaticamente qualquer catálogo antigo salvo no Redis (`CATALOG_SCHEMA_VERSION = 2`).
     - `buildFeatureGovernanceMap()`: Calcula os **4 estados** de cada funcionalidade para a empresa (`allowed`, `locked_by_plan`, `maintenance`, `suspended`).
     - `getEffectiveTenantPlan(tenantId)`: Retorna o plano efetivo da loja (lendo do Supabase `crm_tenant_settings` + catálogo Master, com cache em Redis `crm:tenant:effective_plan:${tenantId}`).
     - `requireTenantFeature(tenantId, featureId)`: Validação *fail-closed* usada nas APIs para bloquear chamadas diretas a recursos que não pertencem ao plano da empresa.
     - `assignTenantPlan()` e `syncPlanToEnrolledTenants()`: Atribuem ou sincronizam planos em lote, descongelando contratos quando autorizado e invalidando o cache.

2. **`src/lib/crm/whatsapp-slots.ts`**
   - **O que faz:** Controla a arquitetura dos **5 espaços de WhatsApp** por empresa.
   - **Principais funções:**
     - `expectedSlotInstanceName(tenantName, slot)`: Gera o nome da instância na Evolution API (`loja_nome` para o slot 1, `loja_nome_2` a `loja_nome_5` para os slots 2 a 5).
     - `extractSlotFromInstanceName(instanceName)`: Identifica a qual espaço (`1` a `5`) pertence uma instância.
     - `buildTenantWhatsappSlots(tenantName, channels, effectivePlan)`: Monta o array de 5 espaços com status individual (`connected`, `disconnected`, `paused`, `locked`) e flag `pausedByDowngrade`.
     - `enforceWhatsappSlotLimitsOnDowngrade(tenantId, maxAllowed)`: Quando uma empresa faz downgrade (ex: Business → Start), pausa os canais excedentes (`status = 'paused'`) no Supabase sem apagar mensagens nem contatos.

3. **`src/lib/crm/supabase-ingest.ts`**
   - **O que faz:** Integra o webhook da Evolution API e os endpoints de WhatsApp ao banco Supabase.
   - **Principais funções:**
     - `tenantInstanceSlug()` e `resolveChannelInstanceCandidates()`: Resolvem a empresa dona da instância mesmo quando a mensagem chega pelos slots 2 a 5 (`_2`, `_3`, `_4`, `_5`).
     - `fetchStoreContextByInstance()`: Carrega as instruções da IA, base de conhecimento (`storeInfo`), horários (`operatingHours`), plano e `tenantId` da loja.
     - `ingestWebhookMessage()`: Grava o contato (`crm_contacts`), a conversa (`crm_conversations`) e a mensagem (`crm_messages`) garantindo isolamento por `tenant_id`.
     - `fetchConversationContext()`: Busca o histórico recente da conversa, o modo atual (`ai` ou `human`) e se é a primeira interação.
     - `handoffToHuman()`: Transfere a conversa para a fila humana (`mode = 'human'`, `status = 'waiting_human'`) e registra em `crm_handoffs`.

---

### 3.2. Motor da Inteligência Artificial e Contagem de Franquia (`src/lib/agent/`)

1. **`src/lib/agent/processor.ts`**
   - **O que faz:** Orquestra todo o processamento de cada mensagem recebida no WhatsApp.
   - **Fluxo passo a passo dentro de `processWebhook()`:**
     1. Ignora eventos que não sejam `messages.upsert` ou mensagens enviadas pela própria loja (`fromMe`).
     2. Verifica deduplicação (`msg_dedup`) em Redis para evitar respostas duplicadas.
     3. Carrega o contexto da loja (`fetchStoreContextByInstance`) e o plano efetivo (`getEffectiveTenantPlan`).
     4. Verifica se a loja está suspensa, com pagamento vencido ou com período de teste/franquia esgotado.
     5. Verifica o modo da conversa (`human` vs `ai`). Se estiver em atendimento humano (`mode === 'human'`), **para imediatamente e não consome franquia**.
     6. Verifica horário de atendimento (`checkOperatingHours` — suporta horário básico no Start e horário avançado com intervalo de almoço `hasBreak`/`breakStart`/`breakEnd` no Business/Premium).
     7. Verifica se o cliente pediu atendente humano ou está nervoso/reclamando (`detectCustomerEscalation`). Se transferir antes da 1ª resposta da IA, **não consome franquia**.
     8. Verifica a trava anti-loop (`ai_loop_count` > 25 respostas da IA na mesma janela de 24h transfere automaticamente para humano).
     9. Gera a resposta da IA (`generateReply`) com fallback automático para o modelo reserva se o plano tiver `model_fallback` (Business/Premium/Trial).
     10. Envia a resposta no WhatsApp via Evolution API (`sendMessage`).
     11. **Somente após `sendMessage` concluir com sucesso**, abre a janela de 24h (`quota_window:v2:${tenantId}:${phone}`) e incrementa 1 atendimento na franquia mensal (`quota_used:v2:${tenantId}:${monthKey}` no fuso `America/Sao_Paulo`), persistindo também em `crm_tenant_settings.config_jsonb.quotaTracking`.

2. **`src/lib/agent/ai.ts`**
   - **O que faz:** Constrói o prompt do sistema (`buildSystemPrompt`) injetando Nome da Assistente, Base de Conhecimento (`storeInfo`), Horários de Funcionamento em tempo real e regras de empatia/compreensão de palavras escritas erradas (typos fonéticos e abreviações), além de chamar o provedor de IA (OpenAI / Gemini / Groq / OpenRouter) e gerar resumos de 3 linhas (`generateHandoffSummary`).

3. **`src/lib/agent/escalation.ts`**
   - **O que faz:** Detecta pedidos explícitos de humano ("quero falar com atendente", "passa pra uma pessoa"), cliente nervoso/irritado, reclamações graves ou dúvidas complexas, classificando a prioridade da conversa.

4. **`src/lib/agent/parse.ts`** e **`src/lib/agent/evolution.ts`**
   - **O que fazem:** Extraem o texto, número de telefone (incluindo tratamento de `@lid` e `remoteJidAlt`) e enviam mensagens para a Evolution API.

---

### 3.3. Rotas de API do Painel do Cliente (`src/app/api/crm/operator/` e `whatsapp/`)

1. **`src/app/api/crm/operator/data/route.ts`** (`GET`)
   - Retorna todos os dados do painel `/cliente`: lista de empresas do operador, conversas (ordenadas por prioridade `urgent > high > normal > low` e data), mensagens, contatos, etiquetas, handoffs, plano efetivo, **governança dos 4 estados (`featureStates`)**, **5 espaços de WhatsApp (`whatsappSlots`)**, respostas rápidas, operadores da equipe e indicadores.

2. **`src/app/api/crm/operator/features/route.ts`** (`GET` / `POST`)
   - Endpoint central para as funcionalidades operacionais e comerciais do cliente:
     - `action: "save_quick_reply"` / `"delete_quick_reply"` (Respostas rápidas — Start+)
     - `action: "set_priority"` (Prioridade do atendimento: `low`, `normal`, `high`, `urgent` — Business+)
     - `action: "submit_satisfaction"` (Pesquisa de satisfação 1 a 5 estrelas + comentário, com trava anti-duplicidade por conversa — Business+)
     - `action: "add_operator"` / `"revoke_operator"` (Gestão de operadores da equipe respeitando limite 1, 3 ou 5 do plano)
     - `action: "request_upgrade"` (Registra solicitação de upgrade enviada pelo cliente para a fila do Painel Master)
     - `GET` retorna relatórios consolidados por nível do plano (Indicadores básicos no Start, Comerciais no Business, Relatórios avançados + Satisfação + Por atendente no Premium).

3. **`src/app/api/crm/operator/ai-settings/route.ts`** (`GET` / `POST`)
   - Salva e carrega configurações da IA (`agentLabel`, `instructions`, `storeInfo`, `enabled`) e horários de funcionamento (`operatingHours`). Bloqueia o salvamento de intervalos avançados (`hasBreak`) se o plano não tiver `business_hours`.

4. **`src/app/api/crm/operator/tags/route.ts`** (`GET` / `POST`)
   - Cria, atribui e remove etiquetas comerciais em contatos e conversas, exigindo a permissão `commercial_tags` (Business+).

5. **`src/app/api/crm/operator/handoff/route.ts`** e **`src/app/api/crm/operator/send/route.ts`**
   - Assumir atendimento humano / devolver para IA (`handoff`) e enviar mensagem humana no WhatsApp (`send`).

6. **`src/app/api/crm/operator/simulator/route.ts`**
   - Executa simulações da IA no painel sem gastar franquia de WhatsApp.

7. **`src/app/api/crm/whatsapp/connect/route.ts`** e **`src/app/api/crm/whatsapp/status/route.ts`**
   - Conectam, desconectam, geram QR Code e consultam o status de qualquer um dos 5 espaços de WhatsApp (`slot` 1 a 5), validando no servidor se o slot pedido é permitido pelo plano (`slot <= maxWhatsappConnections`).

---

### 3.4. Rotas de API do Painel Master (`src/app/api/crm/admin/`)

1. **`src/app/api/crm/admin/clients/route.ts`** (`GET` / `POST` / `PATCH` / `DELETE`)
   - `GET`: Lista todas as lojas, calculando canais de WhatsApp conectados (`connectedWhatsappCount / maxWhatsappConnections`), operadores (`operatorsCount / maxOperators`), consumo de franquia, status de trial, identifica a operação própria da NovaesWeb (`isMasterOwnTenant`) e retorna a fila de `upgradeRequests`.
   - `POST`: Cria nova loja + usuário no Supabase Auth + configurações iniciais + canal slot 1.
   - `PATCH`:
     - `action: "toggle_block"`: Suspende ou desbloqueia loja gravando `publicReason` (motivo público exibido ao cliente) e `internalNote` (observação interna Master).
     - `action: "set_payment_status"`: Marca mensalidade como paga/pendente de forma **idempotente** (evita duplicidade em cliques repetidos).
     - `action: "resolve_upgrade_request"`: Aprova (atualizando o plano automaticamente) ou rejeita solicitações de upgrade dos clientes.
     - `action: "reset_password"`: Redefine a senha de acesso do cliente no Supabase Auth.

2. **`src/app/api/crm/admin/plans/route.ts`** (`GET` / `POST` / `PATCH`)
   - Gerencia o catálogo de planos Master (`save_draft`, `discard_draft`, `save_and_apply` com vigência imediata/novos clientes/próximo ciclo, `duplicate`, `toggle_status`) e atribuição individual de plano com suporte a exceção contratual (`PATCH`), acionando também `enforceWhatsappSlotLimitsOnDowngrade`.

---

### 3.5. Interfaces Frontend (`src/app/` e `src/components/`)

1. **`src/app/cliente/page.tsx`**
   - Painel completo do cliente/operador dividido nas abas:
     - `atendimentos`: Chat ao vivo, filtros por funil, etiqueta e prioridade, respostas rápidas com 1 clique, seletor de prioridade, pesquisa de satisfação (CSAT), resumo inteligente de 3 linhas e botões de assumir/devolver para IA.
     - `whatsapp`: Seletor visual dos **5 espaços de WhatsApp** (`WhatsappFiveSlotsGrid`) + gerador de QR Code com progresso em 5 etapas + seção de Respostas Rápidas (`QuickRepliesSection`).
     - `ia`: Configuração da IA, Base de Conhecimento, Assistente de Configuração guiado (Wizard) e Simulador em tempo real.
     - `horarios`: Configuração de expediente por dia da semana e intervalos de almoço/pausa (com cadeado de upgrade para planos Start nos intervalos avançados).
     - `equipe`: Gestão de operadores humanos da loja (`TeamOperatorsSection`) respeitando o limite `1`, `3` ou `5` do plano.
     - `relatorios`: Painel de indicadores básicos, comerciais, relatórios avançados, CSAT e desempenho por atendente (`ReportsAndIndicatorsSection`).
     - `contatos`: Lista de contatos atendidos.
     - `plano`: Consumo da franquia em tempo real, limites da conta, **Matriz Completa de Governança de Recursos (4 estados)** (`FeatureGovernanceMatrix`) e comparativo dos planos com botão de solicitação de upgrade.

2. **`src/components/crm/ClientPlanModules.tsx`**
   - Componentes modulares reutilizados em `src/app/cliente/page.tsx`:
     - `FeatureStateBadge`
     - `WhatsappFiveSlotsGrid`
     - `QuickRepliesSection`
     - `TeamOperatorsSection`
     - `ReportsAndIndicatorsSection`
     - `FeatureGovernanceMatrix`
     - `UpgradeRequestModal`

3. **`src/app/admin/page.tsx`**
   - Painel Master completo:
     - Botão lateral e card de destaque **"CRM Próprio — Operação NovaesWeb"** (`/cliente?tenant=novaesweb`).
     - **Fila de Solicitações de Upgrade Pendentes** com aprovação em 1 clique.
     - Cadastro e listagem de clientes mostrando `WhatsApp: X/Y (de 5 espaços)`, `Operadores: X/Y` e `Consumo IA: X/Y`.
     - **Modal de Suspensão Administrativa** com **Motivo Público** e **Observação Interna Master**.
     - Editor completo de planos comerciais com `Max WhatsApps (1-5)`, `Max Operadores` e checklist dos 18 recursos técnicos.

---

## 4. Banco de Dados Supabase e Chaves Redis

### 4.1. Tabelas Principais no Supabase
- `crm_tenants`: Empresas cadastradas (`id`, `name`, `slug`, `status`, `created_at`).
- `crm_tenant_settings`: Configurações por empresa (`tenant_id`, `ai_enabled`, `agent_label`, `instructions_text`, `config_jsonb`).
  - **Dentro de `config_jsonb` ficam armazenados:**
    - `plan`, `contractedPlan`, `pendingPlanUpdate`, `customQuotaOverride`, `exceptionReason`
    - `adminSuspensionReason` (público) e `adminInternalNote` (interno Master)
    - `storeInfo` (Base de conhecimento) e `operatingHours` (Horários e intervalos)
    - `quickReplies`, `teamOperators`, `conversationPriorities`, `conversationTags`, `satisfactionSurveys`, `upgradeRequests`, `quotaTracking`
- `crm_channels`: Canais de WhatsApp da empresa (`id`, `tenant_id`, `instance_name`, `status` — suporta até 5 registros por empresa: `loja_slug`, `loja_slug_2`..`_5`).
- `crm_contacts`: Clientes finais atendidos no WhatsApp (`id`, `tenant_id`, `phone`, `display_name`).
- `crm_conversations`: Conversas (`id`, `tenant_id`, `contact_id`, `channel_id`, `status`, `mode`, `assigned_to`, `last_message_at`).
- `crm_messages`: Mensagens trocadas (`id`, `tenant_id`, `conversation_id`, `direction`, `sender_type`, `body`, `created_at`).
- `crm_tags` e `crm_contact_tags`: Etiquetas comerciais por empresa e vínculo com contatos.
- `crm_handoffs`: Histórico de transferências da IA para atendimento humano.
- `crm_tenant_members`: Vínculo entre usuários (`auth.users`) e empresas (`tenant_id`, `role`).

### 4.2. Chaves Principais no Redis
- `crm:master:plans`: Catálogo publicado de planos Master (`CATALOG_SCHEMA_VERSION = 2`).
- `crm:master:plans:draft:${planId}`: Rascunhos de planos ainda não publicados.
- `crm:master:plans:audit`: Histórico de auditoria comercial do Master.
- `crm:tenant:effective_plan:${tenantId}`: Cache de 60s do plano efetivo da empresa (invalidado automaticamente a cada mudança).
- `quota_window:v2:${tenantId}:${phone}`: Janela ativa de 24h de atendimento com IA daquele cliente (TTL de 86.400s).
- `quota_used:v2:${tenantId}:${YYYY_MM}`: Contador mensal de atendimentos consumidos pela IA no fuso `America/Sao_Paulo`.
- `ai_loop_count:${tenantId}:${phone}`: Contador de respostas da IA na janela ativa (limite de segurança = 25).
- `crm:whatsapp:connect_lock:${tenantId}:${slot}`: Lock de 15s contra tentativas simultâneas de geração de QR Code.

---

## 5. Comandos de Validação e Testes (Obrigatórios para o Codex)

Sempre que o Codex fizer qualquer alteração no projeto, ele deve rodar estes 3 comandos na pasta `C:\Users\camil\novaesweb-crm-ai`:

```powershell
# 1. Validar tipagem TypeScript em todo o projeto (deve retornar 0 erros)
npx.cmd tsc --noEmit

# 2. Rodar as 3 suítes de testes automatizados (processador/franquia, planos/5 slots e horários/QR/handoff)
npx.cmd tsx --conditions react-server --test src/lib/agent/processor.test.ts src/lib/crm/plans.test.ts src/lib/crm/live-chat-hours.test.ts

# 3. Validar o build de produção do Next.js
npm.cmd run build
```

