# Fundação do Painel Master — Etapa 1

## Implementado nesta branch
- /login com Supabase Auth (e-mail + senha) e cadastro público **desativado**.
- /master com verificação de sessão por `auth.getUser()` **no servidor**.
- Checagem de permissão `platform_staff.role = 'MASTER'` e `enabled = true` usando RLS de leitura somente para o próprio usuário.
- Logout no servidor.
- Sem service-role no navegador, sem dados/credenciais reais no GitHub.

## Pré-requisitos de ativação
1. Garantir que o repositório esteja privado (recomendado para este produto).
2. Configurar o projeto Supabase CRM já criado: `mpteambmrlflllfqtkmq`.
3. Criar `platform_staff` e suas políticas por migração revisada e testada (ver SQL proposto abaixo).
4. Criar conta do operador via painel Auth no Supabase, com e-mail confirmado; NÃO habilitar cadastro público no app.
5. Associar o UUID de `auth.users` da conta autorizada a `platform_staff` com role MASTER por ação administrativa auditada.
6. Definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `.env.local` (nunca publicar o arquivo). Não são necessárias secret keys nesta etapa.
7. Rodar testes reais de login correto, senha errada, conta sem role, role desabilitada e logout.

## SQL de referência — não executado
Este bloco só deve ser aplicado após revisão e geração formal de migration via Supabase CLI.

```sql
create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('MASTER', 'ADMINISTRADOR', 'FINANCEIRO', 'SUPORTE', 'VISUALIZACAO')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.platform_staff enable row level security;

create policy "staff_self_read" on public.platform_staff
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.platform_staff from anon, authenticated;
grant select on public.platform_staff to authenticated;
```

**Não execute cadastro automático de MASTER; sem usuários criados automaticamente.** O backend administrativo futuro deve validar o papel no servidor novamente em cada ação privilegiada; rotas de UI não bastam como proteção.

## Limitações
As telas de Master não consultam empresas ou mensagens reais: os contadores usam travessões. Até executar a migração e cadastrar o usuário Master, /master permanece sem acesso. Interface inicial continua pública por ser apenas demonstração fictícia.

## Testes de integração pendentes
Sem credenciais nem dados de usuário, o CI consegue validar compilação do fluxo, mas não consegue provar autenticação real ou isolamento de tenants.
