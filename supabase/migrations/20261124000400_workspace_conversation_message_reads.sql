alter table public.messages enable row level security;
drop policy if exists "workspace members read messages" on public.messages;
create policy "workspace members read messages" on public.messages for select to authenticated using (
 exists(select 1 from public.business_memberships bm where bm.business_id=messages.business_id and bm.user_id=(select auth.uid()))
);
grant select on public.messages to authenticated;