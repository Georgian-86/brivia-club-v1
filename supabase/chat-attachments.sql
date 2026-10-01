-- Run once in the Supabase SQL editor to enable WhatsApp-style chat media.
-- Files live in Storage; this table stores the attachment metadata next to the message.

alter table public.brivia_messages add column if not exists message_type text not null default 'text';
alter table public.brivia_messages add column if not exists attachment_url text;
alter table public.brivia_messages add column if not exists attachment_path text;
alter table public.brivia_messages add column if not exists attachment_name text;
alter table public.brivia_messages add column if not exists attachment_mime text;
alter table public.brivia_messages add column if not exists attachment_size bigint;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload message attachments" on storage.objects;
create policy "Members can upload message attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Anyone can view message attachments" on storage.objects;
create policy "Anyone can view message attachments"
  on storage.objects
  for select
  to public
  using (bucket_id = 'message-attachments');

drop policy if exists "Members can delete their message attachments" on storage.objects;
create policy "Members can delete their message attachments"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

notify pgrst, 'reload schema';
