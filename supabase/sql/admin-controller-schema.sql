-- P2P Social Admin Permissions catalog and controller schema reference.
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
  ('login_detection','Login Detection','Security & Access Control',1,'partial'),
  ('session_monitor','Session Monitor','Security & Access Control',2,'partial'),
  ('device_detection','Device Detection','Security & Access Control',3,'partial'),
  ('ip_monitor','IP Monitor','Security & Access Control',4,'partial'),
  ('mfa_security','MFA Security','Security & Access Control',5,'partial'),
  ('role_control','Role Control','Security & Access Control',6,'partial'),
  ('admin_logs','Admin Logs','Security & Access Control',7,'partial'),
  ('fraud_detection','Fraud Detection','Security & Access Control',8,'planned'),
  ('account_security','Account Security','Security & Access Control',9,'partial'),
  ('rate_limits','Rate Limits','Security & Access Control',10,'planned'),
  ('user_control','User Control','User & Trading Management',11,'planned'),
  ('user_verification','User Verification','User & Trading Management',12,'live'),
  ('profile_monitor','Profile Monitor','User & Trading Management',13,'partial'),
  ('report_review','Report Review','User & Trading Management',14,'partial'),
  ('trade_monitor','Trade Monitor','User & Trading Management',15,'live'),
  ('order_monitor','Order Monitor','User & Trading Management',16,'live'),
  ('dispute_control','Dispute Control','User & Trading Management',17,'partial'),
  ('payment_check','Payment Check','User & Trading Management',18,'partial'),
  ('wallet_monitor','Wallet Monitor','User & Trading Management',19,'partial'),
  ('deposit_monitor','Deposit Monitor','User & Trading Management',20,'partial'),
  ('withdrawal_monitor','Withdrawal Monitor','User & Trading Management',21,'partial'),
  ('balance_check','Balance Check','User & Trading Management',22,'partial'),
  ('transaction_audit','Transaction Audit','User & Trading Management',23,'partial'),
  ('blockchain_monitor','Blockchain Monitor','Blockchain & Infrastructure',24,'partial'),
  ('node_health','Node Health','Blockchain & Infrastructure',25,'partial'),
  ('consensus_check','Consensus Check','Blockchain & Infrastructure',26,'planned'),
  ('bicycle_api','Bicycle API','Blockchain & Infrastructure',27,'partial'),
  ('edge_functions','Edge Functions','Blockchain & Infrastructure',28,'partial'),
  ('database_health','Database Health','Blockchain & Infrastructure',29,'partial'),
  ('system_audit','System Audit','Blockchain & Infrastructure',30,'planned'),
  ('backup','Backup','Backup & Recovery',31,'planned'),
  ('recovery','Recovery','Backup & Recovery',32,'planned'),
  ('live_alerts','Live Alerts','Backup & Recovery',33,'partial'),
  ('notifications','Notifications','Monitoring & Analytics',34,'partial'),
  ('analytics','Analytics','Monitoring & Analytics',35,'partial'),
  ('performance','Performance','Monitoring & Analytics',36,'planned'),
  ('uptime','Uptime','Monitoring & Analytics',37,'planned'),
  ('error_logs','Error Logs','Monitoring & Analytics',38,'planned'),
  ('permissions','Permissions','Monitoring & Analytics',39,'partial'),
  ('compliance','Compliance','Monitoring & Analytics',40,'planned'),
  ('blacklist','Blacklist','Protection & Maintenance',41,'planned'),
  ('whitelist','Whitelist','Protection & Maintenance',42,'planned'),
  ('api_security','API Security','Protection & Maintenance',43,'partial'),
  ('traffic_monitor','Traffic Monitor','Protection & Maintenance',44,'planned'),
  ('audit_trail','Audit Trail','Protection & Maintenance',45,'partial'),
  ('maintenance','Maintenance','Protection & Maintenance',46,'planned'),
  ('updates','Updates','Protection & Maintenance',47,'planned'),
  ('cache_monitor','Cache Monitor','Protection & Maintenance',48,'planned'),
  ('storage_monitor','Storage Monitor','Protection & Maintenance',49,'planned'),
  ('health_check','Health Check','Protection & Maintenance',50,'live')
on conflict (feature_key) do update set
 name=excluded.name, category=excluded.category, priority=excluded.priority, readiness=excluded.readiness;

comment on table public.admin_feature_registry is
 'P2P Social Admin 50-module permissions catalog. Categories organize responsibilities; readiness remains evidence-based and is not user-toggleable.';
comment on column public.admin_feature_registry.monitoring_enabled is
 'Controls dashboard monitoring visibility only; does not itself enforce application security policies.';
comment on table public.admin_security_events is
 'Successful sign-in telemetry with coarse IP prefixes and parsed device metadata. No full IP or tokens.';
comment on table public.admin_audit_logs is
 'Append-only log of privileged admin controller actions. Browser roles have no direct table access.';
