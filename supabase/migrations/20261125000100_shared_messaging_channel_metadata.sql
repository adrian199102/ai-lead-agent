-- Shared messaging channel metadata, applied to the development Supabase project.
alter table public.leads add column if not exists source_channel text not null default 'internal';
alter table public.messages add column if not exists channel text not null default 'internal';
alter table public.messages add column if not exists external_message_id text;
alter table public.leads drop constraint if exists leads_source_channel_check;
alter table public.leads add constraint leads_source_channel_check check (source_channel in ('internal','website','whatsapp'));
alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check check (channel in ('internal','website','whatsapp'));
create unique index if not exists messages_channel_external_id_unique on public.messages (business_id, channel, external_message_id) where external_message_id is not null;
