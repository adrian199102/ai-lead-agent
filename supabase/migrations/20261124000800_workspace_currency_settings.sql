-- Workspace currency preference: default USD, tenant-scoped, owner/admin changes only.
create table if not exists public.business_currency_settings(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 currency_code text not null default 'USD' check(currency_code in ('USD','EUR','GBP','PHP','SGD','AUD','CAD','JPY','INR')),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.business_currency_settings(business_id,currency_code)
 select id,'USD' from public.businesses on conflict(business_id) do nothing;
alter table public.business_currency_settings enable row level security;
drop policy if exists "workspace members can view currency" on public.business_currency_settings;
create policy "workspace members can view currency" on public.business_currency_settings for select to authenticated
 using(exists(select 1 from public.business_memberships m where m.business_id=business_currency_settings.business_id and m.user_id=(select auth.uid())));
grant select on public.business_currency_settings to authenticated;
revoke insert,update,delete on public.business_currency_settings from anon,authenticated;
create or replace function public.set_business_currency(p_business_id uuid,p_currency_code text)
returns text language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_code text:=upper(btrim(coalesce(p_currency_code,'')));
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.business_memberships m where m.business_id=p_business_id and m.user_id=v_actor and m.role in ('owner','admin'))
 then raise exception 'Only workspace owners and admins may change currency' using errcode='42501'; end if;
 if v_code not in ('USD','EUR','GBP','PHP','SGD','AUD','CAD','JPY','INR') then raise exception 'Unsupported currency' using errcode='22023'; end if;
 insert into public.business_currency_settings(business_id,currency_code,updated_at,updated_by)
 values(p_business_id,v_code,now(),v_actor)
 on conflict(business_id) do update set currency_code=excluded.currency_code,updated_at=now(),updated_by=v_actor;
 return v_code;
end $$;
revoke all on function public.set_business_currency(uuid,text) from public,anon;
grant execute on function public.set_business_currency(uuid,text) to authenticated;
