-- Applied to dedicated Supabase CRM project mpteambmrlflllfqtkmq
-- Remote migration: 20261104170200 crm_master_staff_secure_foundation
create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('MASTER', 'ADMINISTRADOR', 'FINANCEIRO', 'SUPORTE', 'VISUALIZACAO')),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.platform_staff enable row level security;
revoke all privileges on table public.platform_staff from public, anon, authenticated;
grant select on table public.platform_staff to authenticated;
create policy staff_self_read on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid()));
comment on table public.platform_staff is 'Explicitly provisioned internal staff membership. No client writes allowed.';
