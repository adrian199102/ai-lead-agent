-- Apply in Supabase SQL editor on a DEVELOPMENT project first.
-- Assumes original README's public.leads, public.messages, public.lead_state exist.
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent','viewer')),
  primary key (business_id,user_id)
);

alter table public.leads add column if not exists business_id uuid references public.businesses(id);
alter table public.messages add column if not exists business_id uuid references public.businesses(id);
alter table public.lead_state add column if not exists business_id uuid references public.businesses(id);

create table if not exists public.inbound_events (
  business_id uuid not null references public.businesses(id),
  event_key text not null,
  payload_hash text not null,
  lead_id uuid references public.leads(id),
  created_at timestamptz not null default now(),
  primary key (business_id,event_key)
);
create index if not exists leads_business_id_idx on public.leads(business_id);
create index if not exists messages_business_id_idx on public.messages(business_id);
create index if not exists lead_state_business_id_idx on public.lead_state(business_id);

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.lead_state enable row level security;
alter table public.inbound_events enable row level security;

-- No broad client policies: dashboard access requires separate authenticated,
-- tenant-scoped RLS policies. Server-only service_role bypasses RLS.
-- This migration does not authorize anonymous or authenticated direct writes.

create or replace function public.create_qualified_lead(
  p_business_id uuid,
  p_event_key text,
  p_payload_hash text,
  p_name text,
  p_phone text,
  p_message text,
  p_budget text,
  p_timeline text
) returns table(out_lead_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_hash text;
  v_new boolean := false;
begin
  if p_business_id is null or not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Unknown business';
  end if;
  if p_event_key is null or length(p_event_key) < 1 or length(p_event_key) > 200
     or p_payload_hash is null or length(p_payload_hash) <> 64
     or p_message is null or length(trim(p_message)) = 0 then
    raise exception 'Invalid inbound event';
  end if;

  -- A unique event reservation serializes concurrent deliveries of the same event.
  insert into public.inbound_events(business_id,event_key,payload_hash)
  values (p_business_id,p_event_key,p_payload_hash)
  on conflict do nothing;
  v_new := found;

  select e.lead_id, e.payload_hash into v_lead_id,v_hash
    from public.inbound_events e
   where e.business_id = p_business_id and e.event_key = p_event_key
   for update;

  if v_hash is distinct from p_payload_hash then
    raise exception 'Idempotency key reused with different payload';
  end if;
  if not v_new then
    return query select v_lead_id, true;
    return;
  end if;

  insert into public.leads(business_id,name,phone,stage,status,message_count)
  values(p_business_id,p_name,p_phone,'new','active',1)
  returning id into v_lead_id;

  insert into public.messages(business_id,lead_id,direction,message)
  values(p_business_id,v_lead_id,'inbound',p_message);

  insert into public.lead_state(business_id,lead_id,budget,timeline,qualified,score,last_agent)
  values(p_business_id,v_lead_id,p_budget,p_timeline,false,0,'qualification');

  update public.inbound_events set lead_id=v_lead_id
  where business_id=p_business_id and event_key=p_event_key;

  return query select v_lead_id, false;
end;
$$;

revoke all on function public.create_qualified_lead(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_qualified_lead(uuid,text,text,text,text,text,text,text) to service_role;
