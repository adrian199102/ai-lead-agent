create function public.complete_conversation_turn(p_lease_id uuid,p_message text,p_reply text,p_budget text default null,p_timeline text default null,p_input_tokens integer default null,p_output_tokens integer default null,p_processing_time_ms integer default null,p_model text default null,p_requires_human_review boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.conversation_turns%rowtype; s public.website_chat_sessions%rowtype; a record; c record; inbound_id uuid; outbound_id uuid; event_id text; response jsonb; next_step text; score integer;
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
 update public.messages set channel='website',external_message_id=t.event_key where id=inbound_id and business_id=s.business_id and lead_id=s.lead_id;
 insert into public.messages(business_id,lead_id,direction,message,channel) values(s.business_id,s.lead_id,'outbound',trim(p_reply),'website') returning id into outbound_id;
 insert into public.lead_outbound_replies(inbound_message_id,outbound_message_id,business_id,lead_id,next_action) values(inbound_id,outbound_id,s.business_id,s.lead_id,next_step);
 update public.leads set message_count=coalesce(message_count,0)+1 where id=s.lead_id and business_id=s.business_id;
 update public.website_chat_sessions set lead_id=s.lead_id,message_count=message_count+1,last_message_at=now() where id=s.id;
 response:=jsonb_build_object('leadId',s.lead_id,'reply',trim(p_reply),'completeness',score,'nextAction',next_step,'requiresHumanReview',p_requires_human_review);
 update public.conversation_turns set status='completed',inbound_message_id=inbound_id,outbound_message_id=outbound_id,result=response,model=p_model,input_tokens=p_input_tokens,output_tokens=p_output_tokens,processing_time_ms=p_processing_time_ms,completed_at=now() where id=t.id;
 return response;
end $$;
revoke all on function public.complete_conversation_turn(uuid,text,text,text,text,integer,integer,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_conversation_turn(uuid,text,text,text,text,integer,integer,integer,text,boolean) to service_role;