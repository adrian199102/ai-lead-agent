create table public.conversation_turns (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 session_id uuid not null references public.website_chat_sessions(id),
 event_key text not null check(event_key ~ '^[a-zA-Z0-9_-]{8,100}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'processing' check(status in ('processing','completed','failed')),
 lease_id uuid not null default gen_random_uuid(),
 lease_expires_at timestamptz not null default (now()+interval '30 seconds'),
 inbound_message_id uuid references public.messages(id),
 outbound_message_id uuid references public.messages(id),
 result jsonb,
 model text,
 input_tokens integer check(input_tokens>=0),
 output_tokens integer check(output_tokens>=0),
 processing_time_ms integer check(processing_time_ms>=0),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(session_id,event_key),
 check(status <> 'completed' or (result is not null and completed_at is not null and inbound_message_id is not null and outbound_message_id is not null))
);
create unique index conversation_turns_one_processing on public.conversation_turns(session_id) where status='processing';
create index conversation_turns_business_created on public.conversation_turns(business_id,created_at);
alter table public.conversation_turns enable row level security;
revoke all on public.conversation_turns from public,anon,authenticated;
grant select,insert,update on public.conversation_turns to service_role;