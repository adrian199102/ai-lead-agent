create or replace function public.append_and_assess_inbound_message(
 p_business_id uuid,p_lead_id uuid,p_event_key text,p_payload_hash text,p_message text,
 p_budget text default null,p_timeline text default null
) returns table(out_message_id uuid,out_duplicate boolean,out_budget text,out_timeline text,
 out_required_fields text[],out_missing_fields text[],out_completeness_score integer,
 out_next_action text,out_qualification_decision text)
language plpgsql security definer set search_path=''
as $$
declare
 v_append record;
 v_budget text;
 v_timeline text;
 v_required text[];
 v_missing text[] := array[]::text[];
 v_score integer;
 v_next text;
 v_decision text;
begin
 if p_budget is not null and length(p_budget)>200 or p_timeline is not null and length(p_timeline)>200 then
   raise exception 'Invalid extracted qualification fields' using errcode='22023';
 end if;
 -- Append, event deduplication, and all updates share the same transaction.
 -- The append function locks the lead row until this function returns.
 select * into v_append from public.append_inbound_lead_message(
   p_business_id,p_lead_id,p_event_key,p_payload_hash,p_message
 );
 if not v_append.out_duplicate then
   update public.lead_state
     set budget=coalesce(nullif(btrim(budget),''),nullif(btrim(p_budget),'')),
         timeline=coalesce(nullif(btrim(timeline),''),nullif(btrim(p_timeline),'')),
         last_agent='qualification',updated_at=now()
     where lead_id=p_lead_id and business_id=p_business_id;
   if not found then raise exception 'Lead state not found' using errcode='P0002'; end if;
 end if;
 select s.budget,s.timeline into v_budget,v_timeline from public.lead_state s
  where s.lead_id=p_lead_id and s.business_id=p_business_id;
 select a.required_fields,a.qualification_decision into v_required,v_decision
   from public.qualification_assessments a
   where a.lead_id=p_lead_id and a.business_id=p_business_id and a.policy_version=1
   for update;
 if not found then raise exception 'Qualification assessment not found' using errcode='P0002'; end if;
 -- Preserve the lead's original policy snapshot; workspace edits affect only new leads.
 if v_required is null or cardinality(v_required)=0 or
    v_required <@ array['budget','timeline']::text[] is not true then
   raise exception 'Invalid qualification policy snapshot' using errcode='22023';
 end if;
 if 'budget'=any(v_required) and nullif(btrim(v_budget),'') is null then
   v_missing:=array_append(v_missing,'budget');
 end if;
 if 'timeline'=any(v_required) and nullif(btrim(v_timeline),'') is null then
   v_missing:=array_append(v_missing,'timeline');
 end if;
 v_score:=((cardinality(v_required)-cardinality(v_missing))*100)/cardinality(v_required);
 v_next:=case when 'budget'=any(v_missing) then 'ask_budget'
              when 'timeline'=any(v_missing) then 'ask_timeline'
              else 'review_qualification' end;
 if not v_append.out_duplicate then
   update public.qualification_assessments a
      set missing_fields=v_missing,completeness_score=v_score,next_action=
          case when v_decision='pending' then v_next else a.next_action end
      where a.lead_id=p_lead_id and a.business_id=p_business_id and a.policy_version=1;
 end if;
 return query select v_append.out_message_id,v_append.out_duplicate,v_budget,v_timeline,
   v_required,v_missing,v_score,
   case when v_decision='pending' then v_next else 'complete' end,v_decision;
end;
$$;
revoke all on function public.append_and_assess_inbound_message(uuid,uuid,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.append_and_assess_inbound_message(uuid,uuid,text,text,text,text,text)
 to service_role;