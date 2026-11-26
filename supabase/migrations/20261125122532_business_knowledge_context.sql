create table public.business_knowledge(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),category text not null check(category in ('service','product','pricing','faq','policy')),title text not null check(length(trim(title)) between 1 and 100),content text not null check(length(trim(content)) between 1 and 380),is_active boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index business_knowledge_active on public.business_knowledge(business_id,updated_at desc,id) where is_active;
alter table public.business_knowledge enable row level security;
revoke all on public.business_knowledge from public,anon,authenticated;
grant select,insert,update on public.business_knowledge to service_role;
create or replace function public.get_conversation_context(p_lease_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_chat_sessions%rowtype; t public.conversation_turns%rowtype; h jsonb; st jsonb; k jsonb;
begin
select * into t from public.conversation_turns where lease_id=p_lease_id and status='processing' and lease_expires_at>clock_timestamp();
if not found then raise exception 'Lease unavailable' using errcode='42501'; end if;
select * into s from public.website_chat_sessions where id=t.session_id and business_id=t.business_id and expires_at>now() and contact_consent=true;
if not found or not exists(select 1 from public.website_chat_widgets w where w.id=s.widget_id and w.business_id=s.business_id and w.enabled) then raise exception 'Session unavailable' using errcode='42501'; end if;
select coalesce(jsonb_agg(jsonb_build_object('direction',q.direction,'message',q.message) order by q.created_at,q.id),'[]'::jsonb) into h from (select id,direction,message,created_at from public.messages where business_id=t.business_id and lead_id=s.lead_id order by created_at desc,id desc limit 12) q;
select jsonb_build_object('budget',budget,'timeline',timeline) into st from public.lead_state where business_id=t.business_id and lead_id=s.lead_id;
select coalesce(jsonb_agg(q.title||': '||q.content order by q.updated_at desc,q.id),'[]'::jsonb) into k from (select id,title,content,updated_at from public.business_knowledge where business_id=t.business_id and is_active order by updated_at desc,id limit 10) q;
return jsonb_build_object('history',h,'state',coalesce(st,'{}'::jsonb),'knowledge',k);
end $$;
revoke all on function public.get_conversation_context(uuid) from public,anon,authenticated;
grant execute on function public.get_conversation_context(uuid) to service_role;