# GUIA OPERACIONAL E ROTINAS DE MANUTENÇÃO (CODEX / DEV / IA)

Este documento complementa o [CODEX_ARCHITECTURE_GUIDE.md](file:///C:/Users/camil/novaesweb-crm-ai/CODEX_ARCHITECTURE_GUIDE.md) com os **passos práticos, exemplos de código e rotinas de manutenção** para alterar qualquer parte do Novaes CRM IA com segurança total.

---

## 1. Passo a Passo: Como Alterar os Planos Comerciais

Se você precisar mudar valores, franquias, limites de WhatsApp ou de operadores:

### Arquivo: `src/lib/crm/plans.ts`
Localize a constante `DEFAULT_PLANS` (por volta da linha 320):

```typescript
// Exemplo para alterar o CRM Start:
{
  id: "crm-start",
  name: "CRM Start",
  price: "59,90",           // Preço comercial de referência
  quotaLimit: 200,          // Franquia mensal com IA
  maxOperators: 1,          // Quantidade de atendentes humanos
  maxWhatsappConnections: 1,// Número de conexões de WhatsApp permitidas (1 a 5)
  features: [...START_FEATURES],
  ...
}
```

> **Atenção:** 
> - Sempre que alterar a estrutura base, o `CATALOG_SCHEMA_VERSION` (linha 47) garante que o Redis não sirva cache legado para os clientes.
> - Se adicionar um novo recurso técnico, cadastre-o em `TECHNICAL_FEATURES` e defina seu `minPlanId` ("crm-start", "crm-business" ou "crm-premium").

---

## 2. Passo a Passo: Como Ajustar o Comportamento da IA

### 2.1. Como a IA entende erros ortográficos e gírias
- **Arquivo:** `src/lib/agent/ai.ts` e `src/lib/agent/processor.ts`
- O prompt montado em `buildSystemPrompt()` já instrui o LLM a interpretar variações fonéticas e abreviações (ex.: *"pq"*, *"td bem"*, *"voceis tem"*).
- Para adicionar regras específicas de linguagem ou sotaque regional, edite a diretriz no arquivo `src/lib/agent/ai.ts`.

### 2.2. Como a IA transfere quando o cliente está nervoso
- **Arquivo:** `src/lib/agent/escalation.ts`
- A função `detectCustomerEscalation(text)` contém regex e padrões de sentimento:
  - `human_request`: Quando o cliente pede atendente expressamente.
  - `angry_sentiment`: Expressões de raiva, frustração, processos ou Procon.
  - `billing_doubt`: Dúvidas financeiras complexas.
- Ao detectar um desses cenários, a IA não envia resposta padrão do bot: ela envia uma mensagem acolhedora pré-definida e coloca o chamado em `waiting_human` com prioridade alta ou urgente.

---

## 3. Passo a Passo: Como Funciona o Horário de Atendimento

### 3.1. Horário Básico (CRM Start)
- Funciona com horário único de abertura e fechamento por dia (ex.: 08:00 às 18:00).
- Se o cliente mandar mensagem fora desse horário, a IA envia a mensagem de ausência cadastrada e **não consome créditos de atendimento**.

### 3.2. Horário Avançado com Intervalos (CRM Business e Premium)
- Suporta múltiplos intervalos, folgas e horário de almoço (`hasBreak: true`, `breakStart: "12:00"`, `breakEnd: "13:30"`).
- **Validação de Segurança:** A API `src/app/api/crm/operator/ai-settings/route.ts` bloqueia a ativação de `hasBreak` caso a loja esteja no plano Start, garantindo a barreira comercial no backend.

---

## 4. Passo a Passo: Gestão dos 5 Espaços de WhatsApp

### 4.1. Como os 5 slots são controlados
- No banco Supabase, a tabela `crm_channels` guarda cada conexão.
- O nome da instância na Evolution API segue o padrão:
  - Espaço 1: `loja_${slug}`
  - Espaço 2: `loja_${slug}_2`
  - Espaço 3: `loja_${slug}_3`
  - Espaço 4: `loja_${slug}_4`
  - Espaço 5: `loja_${slug}_5`
- No plano **CRM Start** e **Teste Grátis**, apenas o Espaço 1 pode conectar (`1/5`).
- No plano **CRM Business**, os Espaços 1, 2 e 3 são liberados (`3/5`).
- No plano **CRM Premium**, todos os 5 Espaços são liberados (`5/5`).

### 4.2. O que acontece em caso de Downgrade?
- Se um cliente mudar do **Business (3 conexões)** para o **Start (1 conexão)**:
  - A função `enforceWhatsappSlotLimitsOnDowngrade()` em `src/lib/crm/whatsapp-slots.ts` altera o status das conexões 2 e 3 para `paused`.
  - **Nenhum dado é apagado.** O histórico de conversas, contatos e mensagens passadas continua intacto.

---

## 5. Como Homologar e Testar Localmente

Para rodar o projeto na sua máquina e testar o funcionamento:

1. **Iniciar o servidor de desenvolvimento:**
   ```powershell
   Set-Location C:\Users\camil\novaesweb-crm-ai
   npm.cmd run dev
   ```
2. **Acessar o Painel Master:**
   - URL: `http://localhost:3000/admin`
   - Senha Master: somente o valor privado configurado em `CRM_MASTER_PASSWORD`; não há senha pública de emergência.
3. **Acessar o CRM Próprio da NovaesWeb:**
   - Clique no botão **"Meu CRM (NovaesWeb)"** no menu lateral ou acesse `http://localhost:3000/cliente?tenant=novaesweb`.
4. **Acessar o Painel de uma Loja Cliente:**
   - Acesse `http://localhost:3000/cliente` e selecione o tenant da loja desejada.

---

## 6. Checklist de Segurança antes de fazer Merge para a `main`

Quando for publicar para produção:

- [ ] Garantir que está na branch `feat/commercial-plans-definitive`.
- [ ] Executar `npx.cmd tsc --noEmit` e confirmar zero erros de TypeScript.
- [ ] Executar a suíte de testes:
  ```powershell
  npx.cmd tsx --conditions react-server --test src/lib/agent/processor.test.ts src/lib/crm/plans.test.ts src/lib/crm/live-chat-hours.test.ts
  ```
- [ ] Executar `npm.cmd run build` e confirmar que o bundle de produção compilou com sucesso.
- [ ] Criar o commit na branch e fazer o merge para a branch `main`:
  ```powershell
  git add .
  git commit -m "feat(crm): implementacao definitiva dos planos comerciais, 5 slots whatsapp e governanca"
  git checkout main
  git merge feat/commercial-plans-definitive
  ```

