-- Applied to Supabase development project rrpglnllrdvculbslxnn as
-- tenant_scoped_read_policies (20261122122636).
-- This file documents deployed tenant read access; do not apply twice.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.business_memberships bm
      where bm.business_id=p_business_id and bm.user_id=(select auth.uid())
    );
$$;
revoke all on function app_private.is_business_member(uuid) from public, anon;
grant execute on function app_private.is_business_member(uuid) to authenticated;

grant select on public.businesses, public.business_memberships,
  public.leads, public.lead_state, public.messages, public.agent_runs to authenticated;

create policy "members_read_business" on public.businesses
for select to authenticated using (app_private.is_business_member(id));
create policy "members_read_own_membership" on public.business_memberships
for select to authenticated using (user_id=(select auth.uid()));
create policy "members_read_leads" on public.leads
for select to authenticated using (business_id is not null and app_private.is_business_member(business_id));
create policy "members_read_lead_state" on public.lead_state
for select to authenticated using (business_id is not null and app_private.is_business_member(business_id));
create policy "members_read_messages" on public.messages
for select to authenticated using (business_id is not null and app_private.is_business_member(business_id));
create policy "members_read_agent_runs" on public.agent_runs
for select to authenticated using (business_id is not null and app_private.is_business_member(business_id));
-- inbound_events is service-role only.
