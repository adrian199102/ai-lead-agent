-- Human qualification review RBAC regression test.
-- Execute against Supabase SQL editor or via the Supabase SQL connector.
-- Requires one complete, pending lead and an owner membership in its workspace.
-- Uses transaction-local role impersonation and rolls back all changes.
begin;
do $test$
declare
  v_business uuid;
  v_lead uuid;
  v_user uuid;
  v_role text;
  v_action text;
  v_result record;
  v_before integer;
  v_after integer;
  v_denied boolean;
  v_success boolean;
begin
  select a.business_id,a.lead_id,bm.user_id
    into v_business,v_lead,v_user
    from public.qualification_assessments a
    join public.business_memberships bm
      on bm.business_id=a.business_id and bm.role='owner'
    where a.completeness_score=100
      and a.qualification_decision='pending'
      and a.next_action='review_qualification'
    limit 1;
  if v_user is null then
    raise exception 'No pending complete lead with owner membership available';
  end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select count(*) into v_before
    from public.qualification_review_events where lead_id=v_lead;
  foreach v_role in array array['owner','admin','agent','viewer'] loop
    update public.business_memberships set role=v_role
      where business_id=v_business and user_id=v_user;
    if not found then raise exception 'Test membership missing'; end if;
    foreach v_action in array array['approve','reject','request_info'] loop
      v_denied:=false;
      v_success:=false;
      begin
        select * into v_result from public.submit_qualification_review(
          v_business,v_lead,v_action,
          case when v_action='approve' then null
            else 'Automated rollback-only permission test' end
        );
        if v_role not in ('owner','admin') then
          raise exception 'SECURITY FAILURE: % allowed to %',v_role,v_action;
        end if;
        if v_result.audit_id is null or not exists (
          select 1 from public.qualification_review_events
            where id=v_result.audit_id
        ) then raise exception 'Permitted action did not create audit row'; end if;
        -- This intentional error rolls back the nested PL/pgSQL subtransaction.
        raise exception using errcode='P0001',message='ROLLBACK_TEST_ACTION';
      exception
        when sqlstate 'P0001' then
          if sqlerrm <> 'ROLLBACK_TEST_ACTION' then raise; end if;
          v_success:=true;
        when insufficient_privilege then
          v_denied:=true;
      end;
      if v_role in ('owner','admin') and not v_success then
        raise exception 'Expected % to be allowed to %',v_role,v_action;
      end if;
      if v_role in ('agent','viewer') and not v_denied then
        raise exception 'Expected % to be denied %',v_role,v_action;
      end if;
      raise notice 'PASS role=% action=% result=%',v_role,v_action,
        case when v_success then 'allowed' else 'denied' end;
    end loop;
  end loop;
  select count(*) into v_after from public.qualification_review_events
    where lead_id=v_lead;
  if v_before<>v_after then raise exception 'Unexpected audit persistence'; end if;
end;
$test$;
rollback;
