# Habilitação da base multiempresa — NovaesWeb CRM AI

## Estado verificado
- Repositório: Novaesweb/novaesweb-crm-ai
- Projeto exclusivo Supabase: `mpteambmrlflllfqtkmq`, região `sa-east-1`.
- O login Master (`platform_staff`) já foi migrado no banco exclusivo, mas não existem usuários Auth provisionados na última verificação.
- A estrutura `crm_tenants` + `crm_tenant_memberships` está proposta na branch `feat/tenant-isolation-foundation`.
- **Esta migration ainda NÃO foi aplicada no Supabase**. A ferramenta recusou a tentativa. Não considerar as tabelas disponíveis sem conferência.
- PR #2 contém login Master; PR #3 contém a base multiempresa. Conferir ordem de integração.

## Próximo procedimento de ativação
1. Revisar `supabase/migrations/20261104182000_crm_tenant_isolation_foundation.sql` com foco em privilégios e políticas.
2. No projeto Supabase **do CRM, e somente nele**, aplicar essa migration pelo fluxo oficial do projeto com histórico de migrations.
3. Conferir a existência das duas tabelas e que RLS está habilitada.
4. Conferir permissões: `anon` sem SELECT; `authenticated` apenas SELECT protegido por RLS, sem INSERT, UPDATE ou DELETE.
5. Criar dois usuários de teste autorizados e duas empresas fictícias **apenas no ambiente de homologação** e verificar isolamento entre elas, inclusive tentativas de consultar ou modificar os dados da outra empresa.
6. Testar associação desabilitada, empresa suspensa e nenhum vínculo.
7. Registrar evidências. Somente então integrar UI de empresas ao backend.

## Regras de implementação futura
- A área Master deve autenticar-se no servidor e conferir autorização a cada operação.
- Aprovação de novas empresas e gestão de membros só em rota privilegiada auditada, sem expor service-role ao navegador.
- `tenant_id` não é autorização por si só: cada endpoint precisa conferir a associação do usuário.
- Não criar empresas reais nem carregar conversas de clientes antes de concluir homologação.
- Não copiar dados dos bancos dos outros produtos NovaesWeb.
- Não dar permissão de escrita direta à tabela de membros através da Data API.

## Sobre o bloqueio
A execução direta desta migration foi barrada pela proteção da ferramenta. Não contornar a proteção por comandos alternativos. O operador deve aplicar a alteração pelo fluxo administrativo autorizado após revisar as políticas.

## Próxima etapa após a aprovação
Construir o cadastro de empresa no Master, primeiro com formulário de validação local e estados de carregamento/erro, depois com endpoints autorizados e auditáveis.
