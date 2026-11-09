-- P2P Social Admin Controller schema reference.
-- This SQL has already been applied to the connected Supabase project.
-- Keep browser roles denied; the protected Edge Functions use service_role.

create table if not exists public.admin_feature_registry (
  feature_key text primary key,
  name text not null unique,
  category text not null,
  priority smallint not null unique check (priority between 1 and 50),
  readiness text not null default 'planned' check (readiness in ('planned','partial','live')),
  monitoring_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  event_type text not null check (event_type in ('login_success')),
  device_type text,
  browser text,
  operating_system text,
  ip_prefix text,
  created_at timestamptz not null default now(),
  unique(user_id, session_id, event_type)
);

create index if not exists admin_security_events_created_at_idx
  on public.admin_security_events(created_at desc);
create index if not exists admin_security_events_user_created_idx
  on public.admin_security_events(user_id, created_at desc);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_actor_created_idx
  on public.admin_audit_logs(actor_id, created_at desc);

alter table public.admin_feature_registry enable row level security;
alter table public.admin_security_events enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_feature_registry from public, anon, authenticated;
revoke all on public.admin_security_events from public, anon, authenticated;
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant all on public.admin_feature_registry to service_role;
grant all on public.admin_security_events to service_role;
grant all on public.admin_audit_logs to service_role;
grant usage, select on sequence public.admin_audit_logs_id_seq to service_role;

drop policy if exists admin_feature_registry_deny_client on public.admin_feature_registry;
create policy admin_feature_registry_deny_client on public.admin_feature_registry
for all to anon, authenticated using (false) with check (false);
drop policy if exists admin_security_events_deny_client on public.admin_security_events;
create policy admin_security_events_deny_client on public.admin_security_events
for all to anon, authenticated using (false) with check (false);
drop policy if exists admin_audit_logs_deny_client on public.admin_audit_logs;
create policy admin_audit_logs_deny_client on public.admin_audit_logs
for all to anon, authenticated using (false) with check (false);

create or replace function public.prevent_admin_audit_log_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'admin_audit_logs is append-only';
end;
$$;
revoke all on function public.prevent_admin_audit_log_mutation() from public, anon, authenticated;
drop trigger if exists admin_audit_logs_no_update on public.admin_audit_logs;
create trigger admin_audit_logs_no_update
before update or delete on public.admin_audit_logs
for each row execute function public.prevent_admin_audit_log_mutation();

insert into public.admin_feature_registry(feature_key,name,category,priority,readiness)
values
  ('login_detection','Login Detection','Security',1,'partial'),
  ('session_monitor','Session Monitor','Security',2,'partial'),
  ('device_detection','Device Detection','Security',3,'partial'),
  ('ip_monitor','IP Monitor','Security',4,'partial'),
  ('mfa_security','MFA Security','Security',5,'partial'),
  ('role_control','Role Control','Security',6,'live'),
  ('admin_logs','Admin Logs','Security',7,'partial'),
  ('fraud_detection','Fraud Detection','Security',8,'planned'),
  ('account_security','Account Security','Security',9,'partial'),
  ('rate_limits','Rate Limits','Security',10,'planned'),
  ('user_control','User Control','Users',11,'planned'),
  ('user_verification','User Verification','Users',12,'partial'),
  ('profile_monitor','Profile Monitor','Users',13,'partial'),
  ('report_review','Report Review','Users',14,'partial'),
  ('trade_monitor','Trade Monitor','Trading',15,'live'),
  ('order_monitor','Order Monitor','Trading',16,'live'),
  ('dispute_control','Dispute Control','Trading',17,'partial'),
  ('payment_check','Payment Check','Trading',18,'partial'),
  ('wallet_monitor','Wallet Monitor','Wallet',19,'partial'),
  ('deposit_monitor','Deposit Monitor','Wallet',20,'live'),
  ('withdrawal_monitor','Withdrawal Monitor','Wallet',21,'live'),
  ('balance_check','Balance Check','Wallet',22,'partial'),
  ('transaction_audit','Transaction Audit','Wallet',23,'partial'),
  ('blockchain_monitor','Blockchain Monitor','Blockchain',24,'partial'),
  ('node_health','Node Health','Blockchain',25,'partial'),
  ('consensus_check','Consensus Check','Blockchain',26,'planned'),
  ('bicycle_api','Bicycle API','Blockchain',27,'partial'),
  ('edge_functions','Edge Functions','Operations',28,'partial'),
  ('database_health','Database Health','Operations',29,'partial'),
  ('system_audit','System Audit','Operations',30,'planned'),
  ('backup','Backup','Operations',31,'planned'),
  ('recovery','Recovery','Operations',32,'planned'),
  ('live_alerts','Live Alerts','Operations',33,'partial'),
  ('notifications','Notifications','Operations',34,'partial'),
  ('analytics','Analytics','Operations',35,'partial'),
  ('performance','Performance','Operations',36,'planned'),
  ('uptime','Uptime','Operations',37,'planned'),
  ('error_logs','Error Logs','Operations',38,'planned'),
  ('permissions','Permissions','Governance',39,'partial'),
  ('compliance','Compliance','Governance',40,'planned'),
  ('blacklist','Blacklist','Governance',41,'planned'),
  ('whitelist','Whitelist','Governance',42,'planned'),
  ('api_security','API Security','Governance',43,'partial'),
  ('traffic_monitor','Traffic Monitor','Operations',44,'planned'),
  ('audit_trail','Audit Trail','Governance',45,'partial'),
  ('maintenance','Maintenance','Operations',46,'planned'),
  ('updates','Updates','Operations',47,'planned'),
  ('cache_monitor','Cache Monitor','Operations',48,'planned'),
  ('storage_monitor','Storage Monitor','Operations',49,'planned'),
  ('health_check','Health Check','Operations',50,'live')
on conflict (feature_key) do update set
 name=excluded.name, category=excluded.category, priority=excluded.priority, readiness=excluded.readiness;

comment on table public.admin_feature_registry is
 'P2P Social Admin 50-feature registry. Readiness is evidence-based, not user-toggleable.';
comment on column public.admin_feature_registry.monitoring_enabled is
 'Controls dashboard monitoring visibility only; does not itself enforce application security policies.';
comment on table public.admin_security_events is
 'Successful sign-in telemetry with coarse IP prefixes and parsed device metadata. No full IP or tokens.';
comment on table public.admin_audit_logs is
 'Append-only log of privileged admin controller actions. Browser roles have no direct table access.';
