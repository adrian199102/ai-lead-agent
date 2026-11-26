-- Applied to Supabase development project rrpglnllrdvculbslxnn on 2026-11-23.
-- Workspace creation is intentionally the only privileged action exposed to signed-in users.
-- Atomic creation of a business and its owner membership.
-- Security note: SECURITY DEFINER is necessary to bootstrap the first owner without
-- permitting unrestricted INSERT on public.businesses or business_memberships.
-- This intentionally triggers Supabase advisor 0029; review before production.
create or replace function public.create_business_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_name text := btrim(p_name);
begin
  if (select auth.role()) is distinct from 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Business name must contain 2 to 120 characters' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'Confirmed email required' using errcode = '28000';
  end if;

  insert into public.businesses (name)
  values (v_name)
  returning id into v_business_id;

  insert into public.business_memberships (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  return v_business_id;
end;
$$;

revoke all on function public.create_business_workspace(text) from public, anon, authenticated;
grant execute on function public.create_business_workspace(text) to authenticated;
