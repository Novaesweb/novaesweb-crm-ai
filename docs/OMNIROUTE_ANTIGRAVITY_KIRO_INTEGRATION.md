# NovaesWeb CRM AI — OmniRoute, Antigravity e Kiro

Status: **preparação documentada no GitHub; nenhum provedor conectado, nenhuma chave cadastrada, nenhum envio ativado**.

## Decisão de arquitetura

O CRM reutiliza o **OmniRoute** já instalado no computador do proprietário como um único gateway compatível com a API OpenAI. O CRM conversa somente com `POST {AI_OPENAI_BASE_URL}/chat/completions` e mantém a chave no servidor (`AI_API_KEY`).

Caminho previsto:

`WhatsApp de teste → Evolution API → CRM (checagem de empresa, canal e permissões) → OmniRoute → rota/modelo autorizado → resposta`.

**Antigravity e Kiro devem ser identificados separadamente.** O proprietário lembra ter selecionado Antigravity e configurado Kiro ou outro provedor dentro do roteador; não sabemos ainda qual conta, método de autenticação, modelo ou API estão ativos. Não assumir que uma assinatura de editor/IDE concede direitos de uso como API comercial. Conferir os termos oficiais de cada conta/provedor, especialmente uso através de proxy, automação e atendimento a terceiros. Se não houver autorização explícita, NÃO encaminhar dados nem mensagens de clientes a essa rota.

## Configuração de teste, somente na máquina do proprietário (GOLF)

O código de `src/lib/agent/ai.ts` já suporta endpoint OpenAI-compatible e até duas rotas adicionais do mesmo gateway, com tentativas alternativas somente em 429/502/503/504 e falhas de rede/timeout. **Isso não é homologação de fallback entre provedores**: depende de como o OmniRoute mapeia os identificadores dos modelos.

Exemplo de formato, **não configurar sem confirmar URL/porta na instalação real**:

```dotenv
# Usar APENAS no .env.ai-lab LOCAL, nunca commitar os valores reais
AI_OPENAI_BASE_URL=http://host.docker.internal:<PORTA_CONFIRMADA>/v1
AI_API_KEY=<CHAVE_EMITIDA_PELO_OMNIROUTE_PARA_O_CRM>
AI_MODEL=<ID_EXATO_DA_ROTA_TESTADA>
AI_FALLBACK_MODELS=
# Sempre desativados até testes com número isolado
AI_REPLY_ENABLED=false
CRM_INBOX_CAPTURE_ENABLED=false
CRM_SUPABASE_INGEST_ENABLED=false
CRM_AI_LAB_TEST_ENABLED=false
CRM_AI_LAB_FREE_MODEL_IDS=
```

- `localhost` dentro do container Docker é o **próprio container**. No Windows com Docker Desktop pode ser necessário `host.docker.internal`, desde que o OmniRoute esteja escutando numa interface alcançável, tenha autenticação e a rede esteja protegida.
- A **Vercel não acessa localhost** do Windows. Não abrir a porta do OmniRoute para toda a internet nem cadastrar URL local em produção. Para uso hospedado será preciso um gateway privado com HTTPS, autenticação, restrições de rede, limites e disponibilidade.
- Chaves nunca em `NEXT_PUBLIC_*`, GitHub, tela pública, captura de tela ou chat. Não confundir a chave de API do OmniRoute com credenciais OAuth, cookies ou tokens de editor do Antigravity/Kiro.
- Se o OmniRoute não emitir chave de API própria ou não fornecer endpoint documentado e autorizado, parar; não improvisar uso de credenciais de sessão de editores.
- A rota inicial deverá ser validada sem dados pessoais (pergunta fictícia), sem WhatsApp, com limite de chamadas e nenhum faturamento automático.

## Checklist para validação real, sem acionar Vercel

1. No Windows, verificar versão, porta, endpoint HTTP, necessidade de autenticação, provedores e modelos listados pelo OmniRoute. Não exportar nem copiar segredos.
2. Identificar **exatamente** se Antigravity usa login Google/OAuth e se Kiro é um provedor efetivamente vinculado. Verificar termos de automação, uso comercial, privacidade e proxy antes de permitir.
3. Testar localmente `/v1/models` (se suportado) e `/v1/chat/completions` usando rota **explicitamente permitida** e conteúdo fictício. Registrar apenas código de status, latência, nome de modelo e erro sanitizado.
4. Usar primeiro o laboratório interno da Central Master, com `CRM_AI_LAB_TEST_ENABLED=true` **somente no ambiente isolado** e lista `CRM_AI_LAB_FREE_MODEL_IDS` limitada aos identificadores aprovados. Sem WhatsApp.
5. Testar limites 429, queda de rede, modelo indisponível, troca de rota, proteção contra cobranças e isolamento entre empresas. Não assumir que o roteador troca de provedor automaticamente.
6. Só então testar um **número autorizado de laboratório** na Evolution API, respeitando as proteções existentes, antes de considerar qualquer atendimento real.

## Regras operacionais

- Até homologação, **nenhum envio automático** e nenhum uso de Antigravity/Kiro em atendimento comercial.
- Provedores com dados pessoais exigem base legal e política de retenção adequada à LGPD; gratuito não significa ilimitado.
- Não atrelar a operação comercial a autenticações de uso pessoal que possam ser revogadas ou contrariar termos.
- Prioridade para API comercial autorizada, com custo/limites observáveis; OpenRouter/Groq podem ser rotas alternativas somente após autorização e verificação de custo.
- **Fluxo GitHub/Vercel:** desenvolver na branch `feat/omniroute-provider-integration`, agrupar alterações e testar; fazer merge na `main` e **uma única publicação** quando a integração inteira estiver pronta. Não realizar deploy Preview ou Produção nesta etapa.

## O que esta atualização NÃO fez

Não acessou o OmniRoute do computador, não leu nem armazenou chave, não ativou Kiro/Antigravity, não conectou WhatsApp e não alterou Supabase ou Vercel. A integração existente no CRM continua sendo um cliente genérico OpenAI-compatible que poderá apontar para OmniRoute quando forem confirmados endpoint, modelo, permissão e segurança.
