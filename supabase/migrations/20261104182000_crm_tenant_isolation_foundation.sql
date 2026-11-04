create table public.crm_tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text not null unique,
 status text not null default 'draft' check (status in ('draft','active','suspended')),
 created_at timestamptz not null default now()
);
create table public.crm_tenant_memberships (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('OWNER','MANAGER','AGENT','VIEWER')),
 enabled boolean not null default false,
 primary key(tenant_id,user_id)
);
create index crm_tenant_memberships_by_user on public.crm_tenant_memberships (user_id,enabled,tenant_id);
alter table public.crm_tenants enable row level security;
alter table public.crm_tenant_memberships enable row level security;
revoke all on public.crm_tenants from anon, authenticated;
revoke all on public.crm_tenant_memberships from anon, authenticated;
grant select on public.crm_tenants to authenticated;
grant select on public.crm_tenant_memberships to authenticated;
create policy crm_self_memberships on public.crm_tenant_memberships
 for select to authenticated using (user_id = (select auth.uid()));
create policy crm_tenant_read on public.crm_tenants
 for select to authenticated using (
 status = 'active' and exists (
  select 1 from public.crm_tenant_memberships m
  where m.tenant_id = id and m.user_id = (select auth.uid()) and m.enabled
 )
);