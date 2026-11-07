# Correções de governança — 07/11/2026

Este documento atualiza o parecer histórico em AUDITORIA_GOVERNANCA_PLANOS_2026-11-07.md. As falhas ali reproduzidas passaram a ter testes de bloqueio.

## Alterações

- Master único, com CRM próprio e provedores no mesmo menu; links antigos redirecionados.
- Slot de WhatsApp resolvido da instância no servidor; número declarado divergente recusado. Conexão e status recusam falha de plano, suspensão, manutenção e slots excedentes antes de Evolution ou QR.
- Contrato real compartilhado na interface para cinco slots, quatro estados, relatórios e upgrade. Start libera 1, Business 3 e Premium 5; bloqueio operacional não oferece upgrade como se fosse bloqueio comercial.
- Atualizações imediatas do catálogo propagam limites, direitos e franquia aos clientes daquele plano, preservando somente exceções contratuais explícitas. Falhas por cliente são informadas. Downgrade pausa canais e vínculos excedentes, sem apagar identidade, contatos ou histórico.
- Vigência canônica next_cycle, com compatibilidade next_renewal; snapshot completo preservado até a data. A RPC de plano vencido aplica a atualização e os limites sob a mesma trava.
- Operadores contados nos vínculos ativos reais, incluindo o titular. Cadastro e verificação final da vaga são atômicos; Auth falho não cria operador fictício. Pausas de vínculos são respeitadas pela RLS.
- Upgrade usa ID canônico e o pedido persistido exato, nunca o primeiro pendente ou Business por padrão. Aprovação é atômica e não pode ser repetida.
- Contexto, catálogo e autorização indisponíveis falham fechados. Webhook exige segredo/chave verificado; formato do corpo sozinho não autoriza. Eventos técnicos não removem pausa comercial.
- Modelo reserva depende de permissão explícita, inclusive quando há alternativas no ambiente.
- Franquia e janela de 24 horas passaram para armazenamento durável no PostgreSQL. Há reserva antes da geração/envio, confirmação somente após sucesso e liberação em falha. O consumo não é regravado no JSON comercial; Redis é projeção e controle de fila, não a autoridade da franquia.
- Reservas de envio sem confirmação final ficam retidas para conciliação: não são devolvidas automaticamente e não autorizam novos gastos silenciosamente. O recibo de sucesso da Evolution não equivale a leitura/entrega no aparelho.
- Fuso mensal único America/Sao_Paulo; reserva que cruza o mês é reavaliada no período de despacho. Trial mantém um único contador de 100 no período, com expiração.
- Removidas senhas públicas de emergência do login Master. Recuperação de senha existente no GitHub foi preservada e conectada ao formulário.

## Banco e ordem de implantação

A migração nova é supabase/migrations/20261107135335_crm_atomic_plan_governance.sql.

**Ela foi testada somente em PostgreSQL isolado. Não foi aplicada ao Supabase de produção.** A aplicação depende dessas RPCs e colunas e falha fechada se a migração não existir.

1. Fazer backup e homologar a migração em staging usando o catálogo e os contratos aprovados.
2. Conferir as pausas de operadores excedentes: titular tem prioridade; nenhum usuário ou vínculo é apagado. Vínculo manualmente revogado não é restaurado automaticamente em upgrade.
3. Confirmar plano próprio NovaesWeb e cadastros legados inválidos. A migração preserva o padrão Premium da empresa própria única de nome exato NovaesWeb quando não havia plano explícito.
4. Aplicar a migração aprovada antes de colocar esta versão da aplicação em produção.
5. Testar usuários reais de duas empresas de homologação, QR/WhatsApp de teste, vencimento, downgrade e atualização coletiva.
6. Publicar a aplicação somente após essa homologação. Não há deploy automático nem merge em main realizado nesta tarefa.

Os dados de configuração ficam preservados por atualizações de subobjetos sob trava. As novas tabelas de consumo e janelas e as RPCs são exclusivas do backend/service_role; anon e authenticated não possuem acesso direto. Nenhuma credencial privilegiada é enviada ao navegador.

## Validação local

- TypeScript: passou.
- Compilação Next.js: passou; existem avisos CSS legados.
- Suíte completa de agente/CRM: 71 testes passaram, incluindo regressões de slots, operadores, horários, manutenção, fallback e webhook.
- Navegador com APIs simuladas: 10 testes passaram, incluindo Start/Business/Premium, solicitação Premium, quatro estados, Master único, links antigos e celular.
- PostgreSQL real descartável e sem rede externa: migração executada; verificadas concorrência por última vaga de franquia e operador, confirmação idempotente, recuperação durável sem Redis, janela ativa sem nova cobrança, downgrade sem exclusão, Trial total/expiração, aprovação exata/única, escrita atômica de configuração e RLS entre duas empresas fictícias.
- Lint geral: ainda acusa dívida de tipagem/estilo do CRM (55 erros e 50 avisos na execução registrada, principalmente any); não deve ser informado como aprovado. Backups, dependências e arquivos gerados agora são excluídos corretamente dessa inspeção.
- Os testes de navegador simulam Auth/Supabase/Evolution. O PostgreSQL isolado usa o esquema base real e identidades fictícias; não comprova sessões reais do Supabase nem entrega real de WhatsApp.

Comandos:
    npm run test:agent
    npm run test:governance-db
    npx tsc --noEmit
    npm run build
    npx playwright test tests/plan-governance.spec.ts tests/unified-master.spec.ts

O teste de banco requer Docker com a imagem postgres:15. Ele cria e encerra somente o seu próprio container descartável; não publica porta, não usa volume real e não contata produção.
