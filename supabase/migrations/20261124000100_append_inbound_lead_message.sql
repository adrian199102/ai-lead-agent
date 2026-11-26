-- Atomic, idempotent append of an inbound message to an existing lead.
-- Only the trusted backend service role can invoke this function.
create table if not exists public.lead_message_events (
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_key text not null check (length(event_key) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  lead_id uuid not null references public.leads(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, event_key)
);
create index if not exists lead_message_events_lead_idx
  on public.lead_message_events(business_id,lead_id);
alter table public.lead_message_events enable row level security;
revoke all on public.lead_message_events from public, anon, authenticated;
grant select,insert,update on public.lead_message_events to service_role;

create or replace function public.append_inbound_lead_message(
  p_business_id uuid, p_lead_id uuid, p_event_key text,
  p_payload_hash text, p_message text
) returns table(out_message_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.lead_message_events%rowtype;
  v_message_id uuid;
begin
  if p_business_id is null or p_lead_id is null
    or p_event_key is null or length(p_event_key) not between 1 and 200
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_message is null or length(btrim(p_message)) not between 1 and 4000 then
    raise exception 'Invalid inbound message' using errcode='22023';
  end if;
  -- Lock the lead so concurrent appends cannot lose message_count updates.
  perform 1 from public.leads
   where id=p_lead_id and business_id=p_business_id for update;
  if not found then
    raise exception 'Lead not found in workspace' using errcode='P0002';
  end if;
  select * into v_existing from public.lead_message_events
   where business_id=p_business_id and event_key=p_event_key for update;
  if found then
    if v_existing.payload_hash <> p_payload_hash or v_existing.lead_id <> p_lead_id then
      raise exception 'Idempotency key conflict' using errcode='23505';
    end if;
    return query select v_existing.message_id,true;
    return;
  end if;
  insert into public.messages(business_id,lead_id,direction,message)
    values(p_business_id,p_lead_id,'inbound',p_message)
    returning id into v_message_id;
  insert into public.lead_message_events(business_id,event_key,payload_hash,lead_id,message_id)
    values(p_business_id,p_event_key,p_payload_hash,p_lead_id,v_message_id);
  update public.leads set message_count=coalesce(message_count,0)+1
    where business_id=p_business_id and id=p_lead_id;
  return query select v_message_id,false;
end;
$$;
revoke all on function public.append_inbound_lead_message(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.append_inbound_lead_message(uuid,uuid,text,text,text) to service_role;
