create function public.reserve_conversation_turn(p_widget_id uuid,p_token_hash text,p_event_key text,p_message text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_chat_sessions%rowtype; t public.conversation_turns%rowtype; h text;
begin
 if p_event_key is null or p_event_key !~ '^[a-zA-Z0-9_-]{8,100}$' or p_message is null or length(trim(p_message)) not between 1 and 4000 then raise exception 'Invalid message' using errcode='22023'; end if;
 select * into s from public.website_chat_sessions where widget_id=p_widget_id and token_hash=p_token_hash for update;
 if not found or s.expires_at<=now() or s.contact_consent is distinct from true or not exists(select 1 from public.website_chat_widgets w where w.id=s.widget_id and w.business_id=s.business_id and w.enabled) then raise exception 'Session unavailable' using errcode='42501'; end if;
 h:=encode(extensions.digest(convert_to(trim(p_message),'UTF8'),'sha256'),'hex');
 select * into t from public.conversation_turns where session_id=s.id and event_key=p_event_key;
 if found then
 if t.payload_hash<>h then raise exception 'Event conflict' using errcode='23505'; end if;
 if t.status='completed' then return jsonb_build_object('status','completed','result',t.result); end if;
 end if;
 update public.conversation_turns set status='failed' where session_id=s.id and status='processing' and lease_expires_at<=now();
 if exists(select 1 from public.conversation_turns where session_id=s.id and status='processing') then return jsonb_build_object('status','busy'); end if;
 if s.message_count>=100 or (s.last_message_at>now()-interval '1 second') then raise exception 'Session limit' using errcode='22023'; end if;
 insert into public.conversation_turns(business_id,session_id,event_key,payload_hash) values(s.business_id,s.id,p_event_key,h)
 on conflict(session_id,event_key) do update set status='processing',lease_id=gen_random_uuid(),lease_expires_at=now()+interval '30 seconds' returning * into t;
 return jsonb_build_object('status','reserved','id',t.lease_id);
end $$;
create function public.get_conversation_context(p_lease_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.website_chat_sessions%rowtype; t public.conversation_turns%rowtype; h jsonb; st jsonb;
begin
 select * into t from public.conversation_turns where lease_id=p_lease_id and status='processing' and lease_expires_at>now();
 if not found then raise exception 'Lease unavailable' using errcode='42501'; end if;
 select * into s from public.website_chat_sessions where id=t.session_id and business_id=t.business_id and expires_at>now() and contact_consent=true;
 if not found or not exists(select 1 from public.website_chat_widgets w where w.id=s.widget_id and w.business_id=s.business_id and w.enabled) then raise exception 'Session unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('direction',q.direction,'message',q.message) order by q.created_at,q.id),'[]'::jsonb) into h from (select id,direction,message,created_at from public.messages where business_id=t.business_id and lead_id=s.lead_id order by created_at desc,id desc limit 12) q;
 select jsonb_build_object('budget',budget,'timeline',timeline) into st from public.lead_state where business_id=t.business_id and lead_id=s.lead_id;
 return jsonb_build_object('history',h,'state',coalesce(st,'{}'::jsonb),'knowledge','[]'::jsonb);
end $$;
create function public.release_conversation_turn(p_lease_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin update public.conversation_turns set status='failed' where lease_id=p_lease_id and status='processing'; return found; end $$;
revoke all on function public.reserve_conversation_turn(uuid,text,text,text),public.get_conversation_context(uuid),public.release_conversation_turn(uuid) from public,anon,authenticated;
grant execute on function public.reserve_conversation_turn(uuid,text,text,text),public.get_conversation_context(uuid),public.release_conversation_turn(uuid) to service_role;