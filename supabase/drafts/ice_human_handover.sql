-- Draft: validate in isolated database before applying to shared environment.
alter table public.human_follow_ups alter column created_by drop not null;
alter table public.human_follow_ups add column creation_source text not null default 'human';
alter table public.human_follow_ups add constraint follow_up_creation_actor_check check ((creation_source='human' and created_by is not null) or (creation_source='ice' and created_by is null));
alter table public.human_follow_up_events alter column actor_id drop not null;
alter table public.human_follow_up_events add column actor_source text not null default 'human';
alter table public.human_follow_up_events add constraint follow_up_event_actor_check check ((actor_source='human' and actor_id is not null) or (actor_source='ice' and actor_id is null));
create or replace function public.complete_conversation_turn(p_lease_id uuid,p_message text,p_reply text,p_budget text default null,p_timeline text default null,p_input_tokens integer default null,p_output_tokens integer default null,p_processing_time_ms integer default null,p_model text default null,p_requires_human_review boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.conversation_turns%rowtype; s public.website_chat_sessions%rowtype; a record; c record; inbound_id uuid; outbound_id uuid; event_id text; response jsonb; next_step text; score integer; f public.human_follow_ups%rowtype; decision text; final_reply text; owner_id uuid;
begin
 select * into t from public.conversation_turns where lease_id=p_lease_id;
 if not found then raise exception 'Lease unavailable' using errcode='42501'; end if;
 select * into s from public.website_chat_sessions where id=t.session_id and business_id=t.business_id for update;
 if not found or s.expires_at<=now() or s.contact_consent is distinct from true or not exists(select 1 from public.website_chat_widgets w where w.id=s.widget_id and w.business_id=s.business_id and w.enabled) then raise exception 'Session unavailable' using errcode='42501'; end if;
 select * into t from public.conversation_turns where id=t.id and lease_id=p_lease_id for update;
 if not found then raise exception 'Lease unavailable' using errcode='42501'; end if;
 if p_message is null or length(trim(p_message)) not between 1 and 4000 or t.payload_hash<>encode(extensions.digest(convert_to(trim(p_message),'UTF8'),'sha256'),'hex') then raise exception 'Payload mismatch' using errcode='22023'; end if;
 if t.status='completed' then return t.result; end if;
 if t.status<>'processing' or t.lease_expires_at<=clock_timestamp() or s.message_count>=100 then raise exception 'Lease unavailable' using errcode='42501'; end if;
 if p_reply is null or length(trim(p_reply)) not between 1 and 2000 or length(p_budget)>200 or length(p_timeline)>200 then raise exception 'Invalid response' using errcode='22023'; end if;
 event_id:='ice-'||s.id::text||'-'||t.event_key;
 if s.lead_id is null then
 select * into c from public.create_qualified_lead(s.business_id,event_id,t.payload_hash,'Website visitor',case when s.preferred_contact_method='phone' then s.contact_detail else null end,trim(p_message),p_budget,p_timeline);
 if c.out_duplicate then raise exception 'Unexpected duplicate'; end if;
 s.lead_id:=c.out_lead_id;
 update public.leads set source_channel='website',preferred_contact_method=s.preferred_contact_method,contact_email=case when s.preferred_contact_method='email' then s.contact_detail else null end,contact_consent=s.contact_consent,contact_consented_at=s.contact_consented_at where id=s.lead_id and business_id=s.business_id;
 select id into strict inbound_id from public.messages where business_id=s.business_id and lead_id=s.lead_id and direction='inbound';
 select completeness_score,next_action into strict score,next_step from public.qualification_assessments where business_id=s.business_id and lead_id=s.lead_id and policy_version=1;
 else
 select * into a from public.append_and_assess_inbound_message(s.business_id,s.lead_id,event_id,t.payload_hash,trim(p_message),p_budget,p_timeline);
 if a.out_duplicate then raise exception 'Unexpected duplicate'; end if;
 inbound_id:=a.out_message_id; score:=a.out_completeness_score; next_step:=a.out_next_action;
 end if;
 final_reply:=trim(p_reply);
 select qualification_decision into strict decision from public.qualification_assessments where business_id=s.business_id and lead_id=s.lead_id and policy_version=1 for update;
 select * into f from public.human_follow_ups where business_id=s.business_id and lead_id=s.lead_id for update;
 if decision='pending' and p_requires_human_review is true then
   select user_id into owner_id from public.business_memberships where business_id=s.business_id and role='owner' order by user_id limit 1;
   if f.id is null then
     insert into public.human_follow_ups(business_id,lead_id,question,creation_source,assigned_to) values(s.business_id,s.lead_id,left(trim(p_message),2000),'ice',owner_id) returning * into f;
     insert into public.human_follow_up_events(follow_up_id,business_id,lead_id,actor_source,action,note) values(f.id,s.business_id,s.lead_id,'ice','assign',case when owner_id is null then 'Automatically queued by ICE; no workspace owner available' else 'Automatically queued by ICE; assigned to workspace owner' end);
   elsif f.status='resolved' then
     update public.human_follow_ups set status='open',assigned_to=owner_id,question=left(trim(p_message),2000),response=null,resolved_by=null,resolved_at=null,updated_at=now() where id=f.id returning * into f;
     insert into public.human_follow_up_events(follow_up_id,business_id,lead_id,actor_source,action,note) values(f.id,s.business_id,s.lead_id,'ice','reopen',case when owner_id is null then 'ICE reopened follow-up; no workspace owner available' else 'ICE reopened follow-up; assigned to workspace owner' end);
   end if;
   final_reply:='I have recorded your request for human follow-up. Your conversation details are available for review. I cannot confirm a response time.';
 elsif p_requires_human_review is true then
   final_reply:='I understand you would like human assistance. I cannot arrange a new follow-up through this conversation.';
 end if;
 if decision='pending' and f.status='open' then
   next_step:='human_follow_up';
   update public.qualification_assessments set next_action=next_step where business_id=s.business_id and lead_id=s.lead_id and policy_version=1;
   update public.leads set stage='needs_info' where business_id=s.business_id and id=s.lead_id;
 end if;
 update public.messages set channel='website',external_message_id=t.event_key where id=inbound_id and business_id=s.business_id and lead_id=s.lead_id;
 insert into public.messages(business_id,lead_id,direction,message,channel) values(s.business_id,s.lead_id,'outbound',final_reply,'website') returning id into outbound_id;
 insert into public.lead_outbound_replies(inbound_message_id,outbound_message_id,business_id,lead_id,next_action) values(inbound_id,outbound_id,s.business_id,s.lead_id,next_step);
 update public.leads set message_count=coalesce(message_count,0)+1 where id=s.lead_id and business_id=s.business_id;
 update public.website_chat_sessions set lead_id=s.lead_id,message_count=message_count+1,last_message_at=now() where id=s.id;
 response:=jsonb_build_object('leadId',s.lead_id,'reply',final_reply,'completeness',score,'nextAction',next_step,'requiresHumanReview',p_requires_human_review);
 update public.conversation_turns set status='completed',inbound_message_id=inbound_id,outbound_message_id=outbound_id,result=response,model=p_model,input_tokens=p_input_tokens,output_tokens=p_output_tokens,processing_time_ms=p_processing_time_ms,completed_at=now() where id=t.id;
 return response;
end $$;
revoke all on function public.complete_conversation_turn(uuid,text,text,text,text,integer,integer,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_conversation_turn(uuid,text,text,text,text,integer,integer,integer,text,boolean) to service_role;