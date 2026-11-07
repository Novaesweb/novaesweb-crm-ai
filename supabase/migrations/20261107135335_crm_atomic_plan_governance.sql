-- Atomic commercial governance. Apply in staging before deploying the application.
-- No sample tenants, no deletion of customer history, no access to secret keys.
alter table public.crm_tenant_memberships add column if not exists is_active boolean not null default true;
drop policy if exists crm_memberships_read_own on public.crm_tenant_memberships;
create policy crm_memberships_read_own on public.crm_tenant_memberships
for select to authenticated using(user_id=(select auth.uid()) and is_active);

create table public.crm_attendance_usage (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 period_key text not null check(period_key='trial' or period_key ~ '^[0-9]{4}-[0-9]{2}$'),
 used integer not null default 0 check(used>=0),
 primary key(tenant_id,period_key)
);
create table public.crm_attendance_windows (
 tenant_id uuid not null references public.crm_tenants(id) on delete cascade,
 phone_hash text not null check(phone_hash ~ '^[a-f0-9]{64}$'),
 token uuid not null,
 state text not null check(state in ('reserved','dispatching','committed','released')),
 period_key text not null,
 new_window boolean not null,
 committed_until timestamptz,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,phone_hash),
 unique(tenant_id,token)
);
create index crm_attendance_pending on public.crm_attendance_windows(tenant_id,period_key,state);
alter table public.crm_attendance_usage enable row level security;
alter table public.crm_attendance_windows enable row level security;
revoke all on public.crm_attendance_usage,public.crm_attendance_windows from public,anon,authenticated;
grant all on public.crm_attendance_usage,public.crm_attendance_windows to service_role;

-- All functions are SECURITY INVOKER and callable only by the trusted backend.
-- One advisory lock serializes plan, membership and quota mutations per company.
create or replace function public.crm_locked_config(p_tenant uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_raw text; v_cfg jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant::text,7147));
 select business_description into v_raw from public.crm_tenant_settings where tenant_id=p_tenant for update;
 if not found then raise exception 'tenant_settings_not_found' using errcode='22023'; end if;
 begin v_cfg := v_raw::jsonb; exception when others then raise exception 'invalid_tenant_config' using errcode='22023'; end;
 if jsonb_typeof(v_cfg)<>'object' then raise exception 'invalid_tenant_config' using errcode='22023'; end if;
 return v_cfg;
end $$;

create or replace function public.crm_patch_tenant_config(p_tenant uuid,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_cfg jsonb;
begin
 if jsonb_typeof(p_patch)<>'object' or p_patch ? 'plan' or p_patch ? 'usageCounters' then
  raise exception 'invalid_config_patch' using errcode='22023';
 end if;
 v_cfg := public.crm_locked_config(p_tenant) || p_patch;
 update public.crm_tenant_settings set business_description=v_cfg::text,updated_at=now() where tenant_id=p_tenant;
 return v_cfg;
end $$;

create or replace function public.crm_replace_plan(p_tenant uuid,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_cfg jsonb;
begin
 if jsonb_typeof(p_plan)<>'object' or coalesce(p_plan->>'planId','')='' then
  raise exception 'invalid_plan' using errcode='22023';
 end if;
 v_cfg := jsonb_set(public.crm_locked_config(p_tenant),'{plan}',p_plan);
 update public.crm_tenant_settings set business_description=v_cfg::text,updated_at=now() where tenant_id=p_tenant;
 return v_cfg;
end $$;

create or replace function public.crm_effective_stored_plan(p_cfg jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p jsonb := p_cfg->'plan'; v_snapshot jsonb;
begin
 if jsonb_typeof(p)<>'object' or coalesce(p->>'planId','')='' then
  raise exception 'tenant_plan_unavailable' using errcode='22023';
 end if;
 v_snapshot := p->'contractedPlan';
 if jsonb_typeof(v_snapshot)='object' then p := p || v_snapshot; end if;
 if (p_cfg->'plan'->'pendingPlanUpdate'->>'effectiveAt')::timestamptz <= now() then
  p := p || (p_cfg->'plan'->'pendingPlanUpdate');
 end if;
 return p;
end $$;

create or replace function public.crm_enforce_operator_limit(p_tenant uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; lim integer; paused uuid[];
begin
 cfg := public.crm_locked_config(p_tenant);
 if p_limit is null or p_limit not between 1 and 5 then raise exception 'invalid_operator_limit' using errcode='22023'; end if;
 lim := least(p_limit,coalesce((public.crm_effective_stored_plan(cfg)->>'maxOperators')::integer,p_limit));
 with ranked as (
  select user_id,row_number() over(order by case role when 'owner' then 0 when 'admin' then 1 else 2 end,created_at,user_id) rn
  from public.crm_tenant_memberships where tenant_id=p_tenant and is_active
 ), changed as (
  update public.crm_tenant_memberships m set is_active=false from ranked r
  where m.tenant_id=p_tenant and m.user_id=r.user_id and r.rn>lim returning m.user_id
 ) select array_agg(user_id) into paused from changed;
 return jsonb_build_object('pausedUserIds',coalesce(paused,'{}'::uuid[]),'activeCount',
  (select count(*) from public.crm_tenant_memberships where tenant_id=p_tenant and is_active));
end $$;

create or replace function public.crm_apply_due_plan(p_tenant uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; p jsonb; pend jsonb; wa integer; ops integer;
begin
 cfg:=public.crm_locked_config(p_tenant); p:=cfg->'plan'; pend:=p->'pendingPlanUpdate';
 if pend is null or (pend->>'effectiveAt')::timestamptz>now() then return cfg; end if;
 if pend->>'effectiveAt' is null then raise exception 'invalid_pending_plan'; end if;
 p := (p-'pendingPlanUpdate') || jsonb_build_object(
  'quotaLimit',pend->'quotaLimit','price',pend->'price','maxOperators',pend->'maxOperators',
  'maxWhatsappConnections',pend->'maxWhatsappConnections','contractedPlan',
  jsonb_build_object('quotaLimit',pend->'quotaLimit','features',pend->'features','price',pend->'price',
   'maxOperators',pend->'maxOperators','maxWhatsappConnections',pend->'maxWhatsappConnections',
   'version',pend->'planVersion','contractedAt',now()));
 cfg:=jsonb_set(cfg,'{plan}',p);
 update public.crm_tenant_settings set business_description=cfg::text,updated_at=now() where tenant_id=p_tenant;
 wa:=(pend->>'maxWhatsappConnections')::integer; ops:=(pend->>'maxOperators')::integer;
 if wa is null or ops is null or wa not between 1 and 5 or ops not between 1 and 5 then raise exception 'invalid_pending_limits'; end if;
 update public.crm_channels set status=case when substring(instance_name from '_([2-5])$')::integer>wa then 'paused'
   when status='paused' then 'disconnected' else status end where tenant_id=p_tenant;
 perform public.crm_enforce_operator_limit(p_tenant,ops);
 return cfg;
end $$;

create or replace function public.crm_add_operator_membership(p_tenant uuid,p_user uuid,p_role text,p_max integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; lim integer; n integer;
begin
 cfg:=public.crm_apply_due_plan(p_tenant);
 if p_role is null or p_role not in ('admin','agent','viewer') or p_max is null or p_max not between 1 and 5 then raise exception 'invalid_membership' using errcode='22023'; end if;
 if coalesce((cfg->'suspension'->>'isSuspended')::boolean,false) or not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') then raise exception 'tenant_inactive' using errcode='42501'; end if;
 lim:=least(p_max,coalesce((public.crm_effective_stored_plan(cfg)->>'maxOperators')::integer,p_max));
 select count(*) into n from public.crm_tenant_memberships where tenant_id=p_tenant and is_active;
 if exists(select 1 from public.crm_tenant_memberships where tenant_id=p_tenant and user_id=p_user and is_active) then
  return jsonb_build_object('added',false,'count',n);
 end if;
 if n>=lim then raise exception 'operator_limit_reached' using errcode='23514'; end if;
 insert into public.crm_tenant_memberships(tenant_id,user_id,role,is_active) values(p_tenant,p_user,p_role,true)
 on conflict(tenant_id,user_id) do update set role=excluded.role,is_active=true;
 return jsonb_build_object('added',true,'count',n+1);
end $$;

create or replace function public.crm_update_operator_membership(p_tenant uuid,p_user uuid,p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.crm_locked_config(p_tenant);
 if p_role is null or p_role not in ('admin','agent','viewer') then raise exception 'invalid_role' using errcode='22023'; end if;
 update public.crm_tenant_memberships set role=p_role where tenant_id=p_tenant and user_id=p_user and role<>'owner' and is_active;
 if not found then raise exception 'membership_not_mutable' using errcode='42501'; end if;
 return jsonb_build_object('updated',true);
end $$;
create or replace function public.crm_revoke_operator_membership(p_tenant uuid,p_user uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.crm_locked_config(p_tenant);
 update public.crm_tenant_memberships set is_active=false where tenant_id=p_tenant and user_id=p_user and role<>'owner' and is_active;
 if not found then raise exception 'membership_not_mutable' using errcode='42501'; end if;
 return jsonb_build_object('revoked',true);
end $$;

create or replace function public.crm_attendance_permission(p_tenant uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; p jsonb; trial boolean; lim integer; wa integer; slot integer; period text;
begin
 cfg:=public.crm_apply_due_plan(p_tenant); p:=public.crm_effective_stored_plan(cfg);
 if not exists(select 1 from public.crm_tenants where id=p_tenant and status='active') or
  coalesce((cfg->'suspension'->>'isSuspended')::boolean,false) or coalesce(cfg->'maintenanceFeatures','[]'::jsonb) ? 'ai_chat' then
  raise exception 'attendance_suspended' using errcode='42501';
 end if;
 trial:=coalesce((p->>'isTrial')::boolean,false) or p->>'planId'='crm-trial' or p->>'status'='trial';
 if trial then
  if coalesce(p->>'trialExpiresAt','')='' or (p->>'trialExpiresAt')::timestamptz<=now() then raise exception 'trial_expired' using errcode='42501'; end if;
  lim:=100; wa:=1; period:='trial';
 else
  if p->>'status'='pending' and coalesce((p->>'autoBlock')::boolean,true) and
   (p->>'dueDate')::timestamptz<now() then raise exception 'payment_overdue' using errcode='42501'; end if;
  lim:=coalesce((p->>'customQuotaOverride')::integer,(p->>'quotaLimit')::integer);
  wa:=coalesce((p->>'maxWhatsappConnections')::integer,1);
  period:=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
 end if;
 if lim is null or lim<1 or p_limit<1 or p_limit is null then raise exception 'invalid_quota_limit' using errcode='22023'; end if;
 slot:=coalesce(substring(p_instance from '_([2-5])$')::integer,1);
 if slot>wa or not exists(select 1 from public.crm_channels where tenant_id=p_tenant and instance_name=p_instance and status<>'paused') then
  raise exception 'channel_not_allowed' using errcode='42501';
 end if;
 return jsonb_build_object('period',period,'limit',least(lim,p_limit),'config',cfg);
end $$;

create or replace function public.crm_reserve_attendance(
 p_tenant uuid,p_phone_hash text,p_instance text,p_token uuid,p_limit integer,p_floor integer default 0,p_floor_period text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; period text; lim integer; cfg jsonb; baseline integer; n integer; pending integer; w public.crm_attendance_windows%rowtype; fresh boolean;
begin
 if p_phone_hash is null or p_phone_hash !~ '^[a-f0-9]{64}$' or p_token is null then raise exception 'invalid_reservation' using errcode='22023'; end if;
 perm:=public.crm_attendance_permission(p_tenant,p_instance,p_limit); period:=perm->>'period'; lim:=(perm->>'limit')::integer; cfg:=perm->'config';
 baseline:=greatest(0,case when p_floor_period=period then coalesce(p_floor,0) else 0 end,case when period='trial' then coalesce((cfg->'usageCounters'->>'trialUsed')::integer,0)
  else coalesce((cfg->'usageCounters'->'monthly'->>period)::integer,0) end);
 insert into public.crm_attendance_usage(tenant_id,period_key,used) values(p_tenant,period,baseline)
 on conflict(tenant_id,period_key) do update set used=greatest(crm_attendance_usage.used,excluded.used);
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=period;
 select * into w from public.crm_attendance_windows where tenant_id=p_tenant and phone_hash=p_phone_hash;
 -- Only reservations that never reached dispatch may expire automatically.
 update public.crm_attendance_windows set state='released',updated_at=now()
 where tenant_id=p_tenant and state='reserved' and updated_at<now()-interval '5 minutes';
 if w.state in ('reserved','dispatching') and (w.state='dispatching' or w.updated_at>=now()-interval '5 minutes') then
  return jsonb_build_object('allowed',false,'reason','attendance_busy');
 end if;
 fresh:=w.committed_until is null or w.committed_until<=now();
 select count(*) into pending from public.crm_attendance_windows
 where tenant_id=p_tenant and period_key=period and new_window and state in ('reserved','dispatching');
 if fresh and n+pending>=lim then return jsonb_build_object('allowed',false,'reason','quota_exceeded','used',n); end if;
 insert into public.crm_attendance_windows(tenant_id,phone_hash,token,state,period_key,new_window,committed_until)
 values(p_tenant,p_phone_hash,p_token,'reserved',period,fresh,w.committed_until)
 on conflict(tenant_id,phone_hash) do update set token=excluded.token,state='reserved',period_key=excluded.period_key,
  new_window=excluded.new_window,updated_at=now();
 return jsonb_build_object('allowed',true,'token',p_token,'period',period,'used',n,'newWindow',fresh);
end $$;

create or replace function public.crm_dispatch_attendance(p_tenant uuid,p_token uuid,p_instance text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare perm jsonb; w public.crm_attendance_windows%rowtype; n integer; pending integer;
begin
 perm:=public.crm_attendance_permission(p_tenant,p_instance,p_limit);
 select * into w from public.crm_attendance_windows where tenant_id=p_tenant and token=p_token;
 if not found or w.state<>'reserved' or w.updated_at<now()-interval '5 minutes' then raise exception 'reservation_not_ready' using errcode='42501'; end if;
 if w.new_window and w.period_key<>perm->>'period' then
  insert into public.crm_attendance_usage(tenant_id,period_key,used) values(p_tenant,perm->>'period',
   coalesce((perm->'config'->'usageCounters'->'monthly'->>(perm->>'period'))::integer,0)) on conflict do nothing;
  update public.crm_attendance_windows set period_key=perm->>'period' where tenant_id=p_tenant and token=p_token;
  w.period_key:=perm->>'period';
 end if;
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=w.period_key;
 select count(*) into pending from public.crm_attendance_windows where tenant_id=p_tenant and period_key=w.period_key and new_window and state in ('reserved','dispatching');
 if w.new_window and n+pending>(perm->>'limit')::integer then raise exception 'quota_limit_changed' using errcode='42501'; end if;
 update public.crm_attendance_windows set state='dispatching',updated_at=now() where tenant_id=p_tenant and token=p_token;
 return jsonb_build_object('dispatched',true);
end $$;

create or replace function public.crm_commit_attendance(p_tenant uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.crm_attendance_windows%rowtype; n integer;
begin
 perform public.crm_locked_config(p_tenant);
 select * into w from public.crm_attendance_windows where tenant_id=p_tenant and token=p_token;
 if not found then raise exception 'reservation_not_found' using errcode='22023'; end if;
 if w.state='dispatching' then
  if w.new_window then update public.crm_attendance_usage set used=used+1 where tenant_id=p_tenant and period_key=w.period_key; end if;
  update public.crm_attendance_windows set state='committed',
   committed_until=case when w.new_window then now()+interval '24 hours' else committed_until end,updated_at=now()
  where tenant_id=p_tenant and token=p_token;
 elsif w.state<>'committed' then raise exception 'reservation_not_dispatched' using errcode='42501';
 end if;
 select used into n from public.crm_attendance_usage where tenant_id=p_tenant and period_key=w.period_key;
 return jsonb_build_object('committed',true,'used',n,'newWindow',w.new_window,'period',w.period_key);
end $$;
create or replace function public.crm_release_attendance(p_tenant uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.crm_locked_config(p_tenant);
 update public.crm_attendance_windows set state='released',updated_at=now()
 where tenant_id=p_tenant and token=p_token and state in ('reserved','dispatching');
 return jsonb_build_object('released',true);
end $$;

-- Explicit grants: authenticated clients cannot invoke any privileged helper/RPC.
do $$
declare r record;
begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('crm_locked_config','crm_patch_tenant_config','crm_replace_plan',
 'crm_effective_stored_plan','crm_enforce_operator_limit','crm_apply_due_plan','crm_add_operator_membership',
 'crm_update_operator_membership','crm_revoke_operator_membership','crm_attendance_permission',
 'crm_reserve_attendance','crm_dispatch_attendance','crm_commit_attendance','crm_release_attendance')
 loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;


-- Pause existing excess operators without deleting identities or history.
-- Retain the previously documented agency default only for its unique exact name.
do $$
declare r record; cfg jsonb; p jsonb; lim integer;
begin
 for r in select s.tenant_id,s.business_description,t.name from public.crm_tenant_settings s join public.crm_tenants t on t.id=s.tenant_id loop
  begin cfg:=r.business_description::jsonb; exception when others then continue; end;
  if jsonb_typeof(cfg)<>'object' then continue; end if;
  if coalesce(cfg->'plan'->>'planId','')='' and lower(btrim(r.name))='novaesweb' and
    (select count(*) from public.crm_tenants where lower(btrim(name))='novaesweb')=1 then
    p:=jsonb_build_object('planId','crm-premium','name','CRM Premium','quotaLimit',1500,'maxOperators',5,'maxWhatsappConnections',5,'status','paid','autoBlock',false);
    perform public.crm_replace_plan(r.tenant_id,p);
    cfg:=jsonb_set(cfg,'{plan}',p);
  end if;
  if coalesce(cfg->'plan'->>'planId','')='' then continue; end if;
  p:=public.crm_effective_stored_plan(cfg);
  lim:=coalesce((p->>'maxOperators')::integer,case p->>'planId' when 'crm-premium' then 5 when 'crm-business' then 3 else 1 end);
  perform public.crm_enforce_operator_limit(r.tenant_id,lim);
 end loop;
end $$;

-- Resolve the exact persisted request and target under the same company lock.
create or replace function public.crm_resolve_upgrade(
 p_tenant uuid,p_request text,p_decision text,p_plan jsonb,p_actor text,p_admin_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cfg jsonb; req jsonb; pos integer; list jsonb; lim integer;
begin
 cfg:=public.crm_locked_config(p_tenant); list:=coalesce(cfg->'upgradeRequests','[]'::jsonb);
 select value,ordinality::integer-1 into req,pos from jsonb_array_elements(list) with ordinality
 where value->>'id'=p_request;
 if not found or req->>'status'<>'pending' then raise exception 'upgrade_not_pending' using errcode='23505'; end if;
 if p_decision not in ('approved','rejected') or p_plan->>'planId' is distinct from req->>'targetPlanId' then
  raise exception 'invalid_upgrade_target' using errcode='22023';
 end if;
 req:=req||jsonb_build_object('status',p_decision,'resolvedAt',now(),'resolvedBy',p_actor,'adminNote',p_admin_note);
 cfg:=jsonb_set(cfg,'{upgradeRequests}',jsonb_set(list,array[pos::text],req));
 if p_decision='approved' then cfg:=jsonb_set(cfg,'{plan}',p_plan); end if;
 update public.crm_tenant_settings set business_description=cfg::text,updated_at=now() where tenant_id=p_tenant;
 if p_decision='approved' then
  lim:=(p_plan->>'maxWhatsappConnections')::integer;
  if lim is null or lim not between 1 and 5 then raise exception 'invalid_channel_limit'; end if;
  update public.crm_channels set status=case when coalesce(substring(instance_name from '_([2-5])$')::integer,1)>lim then 'paused'
   when status='paused' then 'disconnected' else status end where tenant_id=p_tenant;
  perform public.crm_enforce_operator_limit(p_tenant,(p_plan->>'maxOperators')::integer);
 end if;
 return cfg;
end $$;
revoke all on function public.crm_resolve_upgrade(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.crm_resolve_upgrade(uuid,text,text,jsonb,text,text) to service_role;

