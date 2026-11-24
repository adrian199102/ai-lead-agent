create table if not exists public.lead_outbound_replies (
  inbound_message_id uuid primary key references public.messages(id) on delete cascade,
  outbound_message_id uuid not null unique references public.messages(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  next_action text not null,
  created_at timestamptz not null default now()
);
create index if not exists lead_outbound_replies_lead_idx on public.lead_outbound_replies(business_id,lead_id);
alter table public.lead_outbound_replies enable row level security;
revoke all on public.lead_outbound_replies from public,anon,authenticated;
grant select,insert on public.lead_outbound_replies to service_role;

create or replace function public.append_assess_and_reply_inbound_message(
 p_business_id uuid,p_lead_id uuid,p_event_key text,p_payload_hash text,p_message text,
 p_budget text default null,p_timeline text default null
) returns table(out_message_id uuid,out_duplicate boolean,out_budget text,out_timeline text,
 out_required_fields text[],out_missing_fields text[],out_completeness_score integer,
 out_next_action text,out_qualification_decision text,out_outbound_message_id uuid,out_outbound_reply text)
language plpgsql security definer set search_path=''
as $$
declare
 v_assessment record;
 v_reply text;
 v_outbound uuid;
 v_next text;
begin
 -- The inner RPC locks the lead and appends/reassesses. Both RPCs share one transaction.
 select * into v_assessment from public.append_and_assess_inbound_message(
   p_business_id,p_lead_id,p_event_key,p_payload_hash,p_message,p_budget,p_timeline
 );
 -- Preserve the original reply for duplicate deliveries, even if assessment has changed.
 select r.outbound_message_id,m.message,r.next_action
   into v_outbound,v_reply,v_next
   from public.lead_outbound_replies r
   join public.messages m on m.id=r.outbound_message_id
   where r.inbound_message_id=v_assessment.out_message_id
     and r.business_id=p_business_id and r.lead_id=p_lead_id;
 if not found then
   v_next:=case
     when v_assessment.out_qualification_decision in ('qualified','disqualified') then 'complete'
     when 'budget'=any(v_assessment.out_missing_fields) then 'ask_budget'
     when 'timeline'=any(v_assessment.out_missing_fields) then 'ask_timeline'
     else 'review_qualification'
   end;
   v_reply:=case v_next
     when 'ask_budget' then 'What is your estimated budget?'
     when 'ask_timeline' then 'When are you planning to proceed?'
     when 'review_qualification' then 'Thank you. We have the details we need, and our team will review them.'
     else case when v_assessment.out_qualification_decision='qualified'
       then 'Thank you. Your qualification is complete.'
       else 'Thank you for sharing your information.' end
   end;
   insert into public.messages(business_id,lead_id,direction,message)
     values(p_business_id,p_lead_id,'outbound',v_reply)
     returning id into v_outbound;
   insert into public.lead_outbound_replies(inbound_message_id,outbound_message_id,business_id,lead_id,next_action)
     values(v_assessment.out_message_id,v_outbound,p_business_id,p_lead_id,v_next);
   update public.leads set message_count=coalesce(message_count,0)+1
     where business_id=p_business_id and id=p_lead_id;
 end if;
 return query select v_assessment.out_message_id,v_assessment.out_duplicate,
   v_assessment.out_budget,v_assessment.out_timeline,v_assessment.out_required_fields,
   v_assessment.out_missing_fields,v_assessment.out_completeness_score,
   v_next,v_assessment.out_qualification_decision,v_outbound,v_reply;
end;
$$;
revoke all on function public.append_assess_and_reply_inbound_message(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.append_assess_and_reply_inbound_message(uuid,uuid,text,text,text,text,text) to service_role;