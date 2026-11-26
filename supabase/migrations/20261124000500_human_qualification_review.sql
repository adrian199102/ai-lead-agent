create table if not exists public.qualification_review_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 lead_id uuid not null references public.leads(id),
 reviewer_id uuid not null references auth.users(id),
 action text not null check (action in ('approve','reject','request_info')),
 note text,
 created_at timestamptz not null default now()
);
create index if not exists qualification_review_events_workspace_idx on public.qualification_review_events(business_id,lead_id,created_at desc);
alter table public.qualification_review_events enable row level security;
drop policy if exists "members read review audit" on public.qualification_review_events;
create policy "members read review audit" on public.qualification_review_events for select to authenticated
 using (exists(select 1 from public.business_memberships bm where bm.business_id=qualification_review_events.business_id and bm.user_id=(select auth.uid())));
grant select on public.qualification_review_events to authenticated;
revoke insert,update,delete on public.qualification_review_events from anon,authenticated;
create or replace function public.submit_qualification_review(p_business_id uuid,p_lead_id uuid,p_action text,p_note text default null)
returns table(decision text, next_action text, audit_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_role text;v_assessment record;v_id uuid;v_next text;v_decision text;
begin
 if (select auth.uid()) is null then raise exception 'Unauthenticated' using errcode='28000'; end if;
 select bm.role into v_role from public.business_memberships bm
  where bm.business_id=p_business_id and bm.user_id=(select auth.uid());
 if v_role is null or v_role not in ('owner','admin') then raise exception 'Review requires owner or admin' using errcode='42501'; end if;
 if p_action not in ('approve','reject','request_info') or p_action is null then
  raise exception 'Invalid review action' using errcode='22023'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note too long' using errcode='22023'; end if;
 if p_action in ('reject','request_info') and nullif(btrim(coalesce(p_note,'')),'') is null then
  raise exception 'Reason required' using errcode='22023'; end if;
 perform 1 from public.leads l where l.id=p_lead_id and l.business_id=p_business_id for update;
 if not found then raise exception 'Lead not found' using errcode='P0002'; end if;
 select a.qualification_decision,a.completeness_score,a.missing_fields into v_assessment
  from public.qualification_assessments a
  where a.business_id=p_business_id and a.lead_id=p_lead_id and a.policy_version=1 for update;
 if not found then raise exception 'Assessment not found' using errcode='P0002'; end if;
 if v_assessment.qualification_decision <> 'pending' then
  raise exception 'Lead has already been reviewed' using errcode='23505'; end if;
 if p_action='approve' and (v_assessment.completeness_score<>100 or cardinality(v_assessment.missing_fields)<>0) then
  raise exception 'Cannot approve an incomplete lead' using errcode='22023'; end if;
 v_decision:=case p_action when 'approve' then 'qualified' when 'reject' then 'disqualified' else 'pending' end;
 v_next:=case p_action when 'approve' then 'complete' when 'reject' then 'complete' else 'human_follow_up' end;
 update public.qualification_assessments a set qualification_decision=v_decision,next_action=v_next
  where a.business_id=p_business_id and a.lead_id=p_lead_id and a.policy_version=1;
 update public.leads set stage=case p_action when 'approve' then 'qualified' when 'reject' then 'disqualified' else 'needs_info' end
  where business_id=p_business_id and id=p_lead_id;
 insert into public.qualification_review_events(business_id,lead_id,reviewer_id,action,note)
  values(p_business_id,p_lead_id,(select auth.uid()),p_action,nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;
 return query select v_decision,v_next,v_id;
end;
$$;
revoke all on function public.submit_qualification_review(uuid,uuid,text,text) from public,anon;
grant execute on function public.submit_qualification_review(uuid,uuid,text,text) to authenticated;