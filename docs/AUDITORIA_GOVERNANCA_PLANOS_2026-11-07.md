# Auditoria de governança dos planos — Novaes CRM IA

Data: 07/11/2026. Escopo: cópia local em `C:/Users/camil/novaesweb-crm-ai`, incluindo as alterações locais do Master unificado.

> Registro histórico anterior às correções. Consulte [CORRECOES_GOVERNANCA_PLANOS_2026-11-07.md](CORRECOES_GOVERNANCA_PLANOS_2026-11-07.md) para o estado corrigido e as limitações de homologação.

## Parecer

**NÃO APROVADO para a regra de que cada cliente só utiliza os recursos e limites contratados.** O catálogo padrão corresponde à matriz solicitada e existem bloqueios corretos, mas há caminhos de contorno, inconsistências na interface, falhas de sincronização e falta de atomicidade. Não é possível afirmar blindagem de 100% ou isolamento comprovado em produção.

Esta etapa foi uma auditoria: foram acrescentados testes e este relatório. As regras da aplicação não foram corrigidas nesta etapa. Não houve migração, criação de conta, alteração comercial real, conexão de WhatsApp ou publicação.

## Matriz comercial conferida

| Plano | Franquia | WhatsApps | Operadores | Recursos no catálogo | Resultado |
| --- | --- | --- | --- | --- | --- |
| Teste grátis | 100 no período de 7 dias | 1 de 5 | 1 | Business temporário | Definições corretas; execução tem ressalvas abaixo |
| Start | 200/mês | 1 de 5 | 1 | 6 recursos básicos | Definições corretas; bloqueios não são uniformes |
| Business | 600/mês | 3 de 5 | 3 | 14 recursos | Definições corretas; slots 4–5 têm caminhos de contorno |
| Premium | 1.500/mês | 5 de 5 | 5 | Todos os 18 recursos | Definições corretas; interface de relatórios tem contrato incompatível |

Fonte: `src/lib/crm/plans.ts:142`, `:320`, `:404`. Os testes solicitados conferem esses valores e a montagem dos cinco slots, mas não cobrem todos os handlers reais.

## O que está correto e qual é a evidência

- Conversa em modo humano sai antes da geração e da cobrança da IA. Testes existentes exercitam esse fluxo (`src/lib/agent/processor.ts:459`).
- A janela de 24 horas e o incremento são gravados após sucesso do envio; falha simulada de envio não cobra (`processor.ts:584`). Sucesso da API de envio não comprova entrega no aparelho.
- Trial tem contador separado do mês, com suspensão por 7 dias/100 atendimentos quando as configurações e os contadores estão disponíveis (`plans.ts:1203`).
- Etiquetas, prioridade, CSAT e respostas rápidas usam `requireTenantFeature` em seus caminhos de gravação. O guard central recusa plano sem recurso, conta suspensa e manutenção quando o estado efetivo foi obtido corretamente. Revisão estática das rotas e teste direto do guard.
- Start não consegue persistir almoço/intervalos pela rota de configurações: a normalização remove `hasBreak` e `intervals`. Normalmente a API responde 200 com conteúdo sanitizado; 403 depende de `strictAdvancedHours:true`. Isso não é um contorno do horário, mas o retorno deveria ser mais explícito (`src/app/api/crm/operator/ai-settings/route.ts:317`, `:333`, `:427`).
- A função atual de sincronização de canais é `syncWhatsappChannelsForPlanLimit`, em `src/lib/crm/whatsapp-slots.ts:115`. Ela usa PATCH e não apaga contatos, mensagens ou histórico. O nome antigo `enforceWhatsappSlotLimitsOnDowngrade` dos guias não corresponde à implementação atual.

## Falhas prioritárias

### A01 — P1: slot informado pode mascarar a instância real

Em `src/app/api/crm/whatsapp/connect/route.ts:193`, o limite usa `requestedSlot || extractSlotFromInstanceName(instanceName)`. A propriedade declarada pelo cliente prevalece sobre o número real da instância.

Reprodução offline com o handler real: Start, canal próprio `_5` já registrado e pausado. Declarar slot 5 resulta em 403; declarar slot 1 para a MESMA instância resulta em 200 e PATCH de status conectado. A contagem total também é dispensada quando o canal já está registrado (`:251`).

Correção: resolver o slot no servidor, exigir correspondência com a instância autorizada e barrar o canal excedente mesmo quando já existir ou estiver pausado. Revalidar antes de Evolution, QR, persistência e envio.

### A02 — P1: consulta de status pode continuar sem autorização comercial

`src/app/api/crm/whatsapp/status/route.ts:64` captura falha de plano e continua. Não há recusa uniforme por suspensão ou limite de slot antes de consultar Evolution/cache. Dependência de `pausedByDowngrade` não protege todos os casos, especialmente canal excedente ainda sem registro.

Reprodução offline com o handler real: consulta de plano lança erro, mas status retorna 200/conectado e executa PATCH simulado no canal. Corrigir para 503 quando o plano não puder ser verificado e 403 quando suspenso ou acima do limite.

### A03 — P1: falhas de banco/cache podem restaurar direitos indevidamente

`getEffectiveTenantPlan` ignora falhas das consultas de configuração/status e cai em Start ativo (`src/lib/crm/plans.ts:1120`, `:1130`, `:1238`). Teste simulado com HTTP 503 comprovou que `requireTenantFeature('ai_chat')` ainda permite acesso.

`getMasterPlans` retorna `DEFAULT_PLANS` quando Redis falha (`plans.ts:555`). Outro teste confirmou que um Business cujo catálogo publicado retirou etiquetas volta a recebê-las no fallback.

Além disso, `getStoreAiContext` pode retornar contexto vazio e o processador não exige tenant resolvido antes de continuar; sem tenant, a contagem é pulada. `outboundAllowed` retorna true por falta de configuração ou erro (`src/lib/agent/processor.ts:240`, `:367`, `:390`; `src/lib/crm/outbound-guard.ts:10`, `:46`). Este último caminho foi identificado por revisão estática, sem envio real.

Correção: diferenciar indisponibilidade de plano legítimo; suspender a operação automática quando não houver autorização verificável. Catálogo durável aprovado pode ser recuperado com versão, sem liberar padrões mais amplos.

### A04 — P1: franquia não tem reserva atômica por empresa

O processador lê o consumo, gera/envia e só depois incrementa (`src/lib/agent/processor.ts:547`, `:584`, `:591`). O lock é por instância/número, não por empresa. Com 199 de 200 usados, dois contatos diferentes podem passar juntos e produzir 201 atendimentos. Esse risco foi identificado por leitura do fluxo; não houve teste de carga ou envio real.

Se Redis perder os contadores, o plano efetivo conhece o consumo persistido, mas a pré-verificação do processador lê somente Redis. O contador operacional pode reiniciar em zero apesar de consumo anterior (`plans.ts:1179`; `processor.ts:547`).

Correção: reservar a vaga de atendimento atomicamente por tenant, confirmar após envio e liberar a reserva na falha. Reconciliar os contadores duráveis antes de autorizar novas janelas. A leitura mensal do plano usa UTC, enquanto o processador usa São Paulo (`plans.ts:1169`, `processor.ts:539`); unificar o fuso.

### A05 — P1: operadores são contados por fontes diferentes

`src/app/api/crm/operator/features/route.ts:503` limita a inclusão pela lista JSON `teamOperators`, enquanto a leitura também considera memberships reais (`:109`). Um Start com titular no banco e JSON vazio pode cadastrar outro operador. Requisições concorrentes podem aprovar a mesma vaga, pois não há operação transacional. Falha de criação no Auth pode ainda resultar em operador fictício/sucesso aparente (`:531`). Evidência por revisão estática.

Correção: contar vínculos ativos reais, incluindo o titular, e cadastrar com limite transacional no banco. Não informar sucesso se a criação/vinculação não for confirmada. Definir também como os operadores excedentes serão revogados/pausados em downgrade.

### A06 — P1: webhook aceita formato válido sem comprovar origem

`src/app/api/evolution/webhook/route.ts:121` autoriza evento sem segredo quando o corpo contém os campos de formato esperados. `CONNECTION_UPDATE` também pode sobrescrever `paused` por `connected/disconnected` (`:82`).

Isso reduz a confiabilidade da pausa e do caminho de processamento. Revisão estática; nenhuma requisição ofensiva ou externa foi feita. Remover a autorização baseada apenas no formato e preservar pausas comerciais independentemente do estado técnico da conexão.

## Atualização automática e downgrade

### A07 — P1: atualização coletiva é parcial e não executa toda a política

Com `save_and_apply` e vigência `immediate`, o código publica o catálogo, atualiza clientes reconhecidos do MESMO plano, sincroniza franquias e invalida seus caches (`src/lib/crm/plans.ts:744`, `:783`, `:801`). Um teste com duas empresas fictícias comprovou atualização dos limites, recursos e franquias. A exceção de franquia de um cliente é preservada.

Portanto existe propagação automática, mas ela NÃO garante a exigência de todos os clientes seguirem integralmente a atualização:

- A publicação coletiva não chama a sincronização de `crm_channels`; reduzir WhatsApps não persiste a pausa dos canais excedentes. Teste confirmou ausência de qualquer chamada de canais. A atribuição INDIVIDUAL chama o helper (`src/app/api/crm/admin/plans/route.ts:319`).
- Registros sem JSON válido/plano reconhecido são ignorados; sem configuração Supabase a função pode retornar aplicada sem sincronizar clientes (`plans.ts:769`, `:783`, `:914`).
- O helper de pausa não verifica o resultado HTTP do PATCH e adiciona a instância a `pausedInstances` mesmo com HTTP 500 (`src/lib/crm/whatsapp-slots.ts:140`). Reprodução simulada confirmou esse sucesso falso.
- Não há garantia de suspensão dos operadores excedentes.
- Cache tem até 60 segundos; sua invalidação engole falhas. Não equivale a atualização instantânea garantida.
- A persistência de consumo regrava o JSON de configuração por leitura+PATCH e pode sobrescrever uma atualização comercial simultânea (`processor.ts:165`). Risco por revisão estática.

Correção: aplicação versionada por cliente com estado confirmado, falhas explícitas e retentativa; sincronizar canais e operadores em todos os caminhos de redução; conferir respostas HTTP. Manter contador de consumo separado das configurações comerciais. Exceções contratuais devem ser explícitas, pois a regra atual as preserva.

### A08 — P2: vigência e contratos congelados estão inconsistentes

A interface envia `next_renewal` (`src/app/admin/page.tsx:393`, `:743`); o backend reconhece `next_cycle` (`src/lib/crm/plans.ts:862`). Teste comprovou publicação e `applied:true` sem atualizar ou agendar qualquer cliente, sem gravar `pendingPlanUpdate` e sem informar falha.

Também os limites de WhatsApp/operadores do snapshot congelado não são restaurados, e seus recursos são unidos aos do catálogo novo (`plans.ts:1245`, `:1265`, `:1273`). Teste com contrato congelado de 1 WhatsApp/operador retornou 5 do catálogo atual, além de recursos novos. Isso afeta `new_clients` e agendamentos; não significa que a aplicação imediata bem-sucedida sempre preserve recursos retirados.

Correção: contrato único para o enum de vigência; validar no servidor; respeitar o snapshot completo até a data efetiva. Se o requisito comercial é atualizar todos imediatamente, apresentar esse comportamento claramente como padrão, mantendo exceções apenas quando deliberadas.

## Interface e recursos

### A09 — P2: cadeados e matriz usam formatos diferentes da API

O backend retorna `unlocked`, `minPlanName` e `status`; o componente espera `lockedByPlan`, `unlockedByPlan`, `requiredPlanName` e `connected` (`src/components/crm/ClientPlanModules.tsx:8`, `:158`). A resposta é atribuída diretamente em `src/components/crm/ClientWorkspace.tsx:454`. Consequência: a grade pode deixar de exibir cadeado/upgrade e permitir selecionar slot bloqueado.

Na matriz, backend usa `id/name/minPlanId/minPlanName`, mas interface espera `featureId/label/minPlan/minPlanLabel`. O badge de estado pode existir, mas os nomes/plano mínimo ficam indefinidos. Correção: compartilhar tipos/serializador entre API e interface e testar os quatro estados com o JSON REAL do servidor, sem fixtures inventadas que escondam a divergência.

### A10 — P2: upgrade pode registrar e aprovar o plano errado

O modal existe, mas `ClientWorkspace.tsx:1049` envia `requestedPlan` e `notes`. A API lê `targetPlanId` e `note` e assume Business na ausência (`src/app/api/crm/operator/features/route.ts:333`). Assim escolher Premium no modal pode registrar Business.

A fila Master recebe `targetPlanName/storeName`, mas renderiza `requestedPlanName/tenantName`. Na aprovação, a interface não envia `targetPlanId` (`src/app/admin/page.tsx:937`); a API novamente assume Business em vez de usar obrigatoriamente o plano da solicitação (`src/app/api/crm/admin/clients/route.ts:773`). A busca da solicitação também aceita o primeiro item pendente além do ID solicitado (`:778`).

Evidência por revisão estática. Correção: IDs canônicos ponta a ponta, validação do pedido exato e resolução do plano a partir da solicitação persistida, não de um default silencioso.

### A11 — P2: relatórios e quatro estados não são respeitados uniformemente

A API entrega `{reports:{basicIndicators,commercialIndicators,premiumAnalytics}}`, enquanto a interface espera campos na raiz e `advancedReports` (`src/app/api/crm/operator/features/route.ts:287`; `ClientWorkspace.tsx:394`; `ClientPlanModules.tsx:684`). Relatórios Premium podem parecer vazios/bloqueados.

Filtros avançados são aplicados antes de validação uniforme de `advanced_commercial_filters`, e dados brutos de prioridades/CSAT aparecem na resposta sem o mesmo bloqueio de plano (`features/route.ts:67`, `:284`).

`allowedFeatures` mantém os direitos contratados mesmo em manutenção/suspensão; várias interfaces e rotas verificam apenas essa lista, sem o estado de governança. O guard central é mais rigoroso, mas não é usado em todos os caminhos (`plans.ts:1326`; `ai-settings/route.ts:317`; `features/route.ts:177`; `handoff/route.ts:255`).

Correção: serialização única de relatórios; aplicar guard a cada operação e projeção de dados; UI deve tratar allowed/locked_by_plan/maintenance/suspended de forma distinta.

### A12 — P2: Start continua podendo usar modelo reserva

O processador omite `fallbackModel` quando o plano não permite, mas `src/lib/agent/ai.ts:3` acrescenta alternativas por padrão ou por variável de ambiente. `generateAnswer` tenta a lista (`:258`, `:285`). A proibição comercial do Start não chega até o executor real de modelos.

Correção: transmitir uma permissão explícita de fallback e limitar a execução a um único modelo quando bloqueado. Revisão estática; nenhum provedor real foi chamado.

## Testes executados e limites da conclusão

| Verificação | Resultado | Alcance |
| --- | --- | --- |
| `npx.cmd tsc --noEmit` | Passou, sem erros | Tipagem; repetida após adicionar os testes da auditoria |
| `npx.cmd tsx --conditions react-server --test src/lib/agent/processor.test.ts src/lib/crm/plans.test.ts src/lib/crm/live-chat-hours.test.ts` | 27 testes passaram | Testes existentes com dependências simuladas |
| `npm.cmd run build` | Passou | Compilação local; lint é desativado no build pela configuração existente |
| `npx.cmd tsx --conditions react-server --test src/lib/crm/governance-audit.test.ts src/lib/crm/governance-api-audit.test.ts` | 9 cenários reproduzidos | Banco, cache, Auth e Evolution inteiramente simulados; vários testes confirmam defeitos atuais, não conformidade |

Os testes adicionais executam funções reais de catálogo/governança e os handlers reais de conexão/status. Para os handlers, o código TypeScript é carregado em contexto isolado com autenticação/empresa própria/plano/serviços substituídos por fixtures. Eles não comprovam autenticação real, RLS ou comunicação real com Evolution.

Os testes chamados `GAP`/`audit reproduction` descrevem o comportamento vulnerável atual. Depois da correção, as expectativas precisam ser invertidas para exigir o bloqueio e impedir regressões.

## Matriz de autorização observada

Todos os usuários/empresas desta tabela são fictícios. Não há dados sensíveis.

| Usuário | Empresa/plano | Recurso/operação | Esperado | Observado | Evidência |
| --- | --- | --- | --- | --- | --- |
| Operador A | A / Start | Conectar instância própria slot 5, declarando 5 | Recusar | HTTP 403 | Handler real, serviços simulados |
| Operador A | A / Start | Mesma instância slot 5, declarando 1 | Recusar | HTTP 200 e PATCH conectado | Handler real, serviços simulados |
| Operador A | A / Start | Status slot 5 com consulta do plano indisponível | Recusar/503 | HTTP 200 e atualização do canal | Handler real, serviços simulados |
| Operador A | A / plano indisponível | Uso de IA | Recusar/503 | Plano Start ativo; guard permitiu | Funções reais, HTTP 503 simulado |
| Master | A e B / Business | Publicar atualização imediata do plano | Atualizar clientes elegíveis e pausar excessos | Contratos/franquias/cache atualizados; canais não sincronizados | Função real, HTTP/Redis simulados |
| Master | A / plano agendado | Aplicar na próxima renovação | Gravar atualização pendente | Catálogo publicado, sem agendamento, sucesso aparente | Função real com valor enviado pela UI |
| Master | A / downgrade | Pausar canal com PATCH falho | Informar falha | Relatou instância pausada | Helper real, HTTP 500 simulado |
| Operador A e B reais | Duas empresas reais | Consultas, gravações, arquivos e endpoints cruzados | Negar acesso entre empresas | NÃO EXECUTADO | Exige homologação isolada com usuários e ambientes apropriados |

## Ordem recomendada de correção

1. Fechar webhook, falhas de autorização/contexto e caminhos de conexão/status; validar slot real no servidor.
2. Tornar franquia e operadores atômicos, recuperar consumo durável e bloquear contagem por fontes divergentes.
3. Completar a propagação comercial em lote, a pausa/revogação de excessos e a confirmação de erros; corrigir vigência e snapshots.
4. Unificar contratos de slots, governança, relatórios e upgrades; aplicar os quatro estados e a permissão real de fallback.
5. Transformar as reproduções em testes de bloqueio e homologar Start/Business/Premium/Trial com duas empresas isoladas, concorrência, expiração, reinício de cache e downgrade. A validação real precisa ocorrer sem atingir clientes de produção.

Até essas correções e homologações, a matriz comercial está definida corretamente, mas sua execução não atende de ponta a ponta à regra solicitada.

