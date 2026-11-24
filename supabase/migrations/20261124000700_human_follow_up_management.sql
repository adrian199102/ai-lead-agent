-- Applied in Supabase: human_follow_up_management (2026-11-24).
create table if not exists public.human_follow_ups (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),
 lead_id uuid not null references public.leads(id),assigned_to uuid references auth.users(id),
 question text not null check(length(btrim(question)) between 1 and 2000),response text,due_at timestamptz,
 status text not null default 'open' check(status in ('open','resolved')),
 created_by uuid not null references auth.users(id),resolved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),resolved_at timestamptz,updated_at timestamptz not null default now(),unique(lead_id));
create index if not exists human_follow_ups_business_status on public.human_follow_ups(business_id,status,due_at);
alter table public.human_follow_ups enable row level security;
drop policy if exists "workspace members read followups" on public.human_follow_ups;
create policy "workspace members read followups" on public.human_follow_ups for select to authenticated using
(exists(select 1 from public.business_memberships m where m.business_id=human_follow_ups.business_id and m.user_id=(select auth.uid())));
grant select on public.human_follow_ups to authenticated;
revoke insert,update,delete on public.human_follow_ups from anon,authenticated;
create table if not exists public.human_follow_up_events (
 id uuid primary key default gen_random_uuid(),follow_up_id uuid not null references public.human_follow_ups(id),
 business_id uuid not null references public.businesses(id),lead_id uuid not null references public.leads(id),
 actor_id uuid not null references auth.users(id),action text not null check(action in ('assign','update','resolve','reopen')),
 note text,created_at timestamptz not null default now());
alter table public.human_follow_up_events enable row level security;
drop policy if exists "workspace members read followup audit" on public.human_follow_up_events;
create policy "workspace members read followup audit" on public.human_follow_up_events for select to authenticated using
(exists(select 1 from public.business_memberships m where m.business_id=human_follow_up_events.business_id and m.user_id=(select auth.uid())));
grant select on public.human_follow_up_events to authenticated;
revoke insert,update,delete on public.human_follow_up_events from anon,authenticated;
CREATE OR REPLACE FUNCTION public.manage_human_follow_up(p_business_id uuid, p_lead_id uuid, p_action text, p_question text DEFAULT NULL::text, p_response text DEFAULT NULL::text, p_assigned_to uuid DEFAULT NULL::uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(follow_up_id uuid, follow_up_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid;v_role text;v_a record;v_f public.human_follow_ups%rowtype;v_question text;v_response text;
begin
 v_actor:=(select auth.uid());
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select role into v_role from public.business_memberships where business_id=p_business_id and user_id=v_actor;
 if v_role not in ('owner','admin') or v_role is null then raise exception 'Owner or admin required' using errcode='42501'; end if;
 if p_action not in ('assign','update','resolve','reopen') or p_action is null then raise exception 'Invalid action' using errcode='22023'; end if;
 if length(coalesce(p_question,''))>2000 or length(coalesce(p_response,''))>4000 then raise exception 'Text too long' using errcode='22023'; end if;
 if p_due_at is not null and p_due_at < now() and p_action in ('assign','update','reopen') then raise exception 'Due date must be future' using errcode='22023'; end if;
 perform 1 from public.leads where id=p_lead_id and business_id=p_business_id for update;
 if not found then raise exception 'Lead not found' using errcode='P0002'; end if;
 select * into v_a from public.qualification_assessments where lead_id=p_lead_id and business_id=p_business_id and policy_version=1 for update;
 if not found then raise exception 'Assessment not found' using errcode='P0002'; end if;
 if v_a.qualification_decision <> 'pending' then raise exception 'Final decision cannot be changed' using errcode='23505'; end if;
 if p_assigned_to is not null and not exists(select 1 from public.business_memberships where business_id=p_business_id and user_id=p_assigned_to and role in ('owner','admin','agent')) then raise exception 'Assignee must be workspace owner, admin, or agent' using errcode='22023'; end if;
 select * into v_f from public.human_follow_ups where lead_id=p_lead_id and business_id=p_business_id for update;
 if p_action='assign' then
   if v_a.next_action <> 'human_follow_up' then raise exception 'Lead is not awaiting human follow-up' using errcode='22023'; end if;
   if v_f.id is not null then raise exception 'Follow-up already exists' using errcode='23505'; end if;
   v_question:=nullif(btrim(coalesce(p_question,'')),'');
   if v_question is null then
     select note into v_question from public.qualification_review_events where lead_id=p_lead_id and business_id=p_business_id and action='request_info' order by created_at desc limit 1;
   end if;
   if v_question is null then raise exception 'Question required' using errcode='22023'; end if;
   insert into public.human_follow_ups(business_id,lead_id,assigned_to,question,due_at,created_by)
    values(p_business_id,p_lead_id,coalesce(p_assigned_to,v_actor),v_question,p_due_at,v_actor) returning * into v_f;
 elsif v_f.id is null then raise exception 'Follow-up not found' using errcode='P0002';
 elsif p_action='update' then
   if v_f.status <> 'open' then raise exception 'Follow-up already resolved' using errcode='23505'; end if;
   update public.human_follow_ups set
    question=coalesce(nullif(btrim(p_question),''),question),
    assigned_to=coalesce(p_assigned_to,assigned_to),
    due_at=coalesce(p_due_at,due_at),
    response=coalesce(nullif(btrim(p_response),''),response),
    updated_at=now() where id=v_f.id returning * into v_f;
 elsif p_action='resolve' then
   if v_f.status <> 'open' then raise exception 'Follow-up already resolved' using errcode='23505'; end if;
   v_response:=coalesce(nullif(btrim(coalesce(p_response,'')),''),nullif(btrim(coalesce(v_f.response,'')),''));
   if v_response is null then raise exception 'Response required' using errcode='22023'; end if;
   update public.human_follow_ups set status='resolved',response=v_response,resolved_by=v_actor,resolved_at=now(),updated_at=now()
    where id=v_f.id returning * into v_f;
   update public.qualification_assessments set next_action='review_qualification'
    where lead_id=p_lead_id and business_id=p_business_id and policy_version=1;
   update public.leads set stage='review' where id=p_lead_id and business_id=p_business_id;
 elsif p_action='reopen' then
   if v_f.status <> 'resolved' or v_a.next_action <> 'review_qualification' then raise exception 'Cannot reopen follow-up' using errcode='22023'; end if;
   update public.human_follow_ups set status='open',resolved_by=null,resolved_at=null,updated_at=now() where id=v_f.id returning * into v_f;
   update public.qualification_assessments set next_action='human_follow_up' where lead_id=p_lead_id and business_id=p_business_id and policy_version=1;
   update public.leads set stage='needs_info' where id=p_lead_id and business_id=p_business_id;
 end if;
 insert into public.human_follow_up_events(follow_up_id,business_id,lead_id,actor_id,action,note)
 values(v_f.id,p_business_id,p_lead_id,v_actor,p_action,case when p_action='resolve' then v_f.response else v_f.question end);
 return query select v_f.id,v_f.status;
end;
$function$

revoke all on function public.manage_human_follow_up(uuid,uuid,text,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.manage_human_follow_up(uuid,uuid,text,text,text,uuid,timestamptz) to authenticated;
