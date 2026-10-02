-- Run once in the Supabase SQL Editor.
-- This enables suggested and uploaded cover images to persist with profiles.

alter table public.profiles
  add column if not exists cover_url text;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload their profile photo" on storage.objects;
create policy "Members can upload their profile photo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Anyone can view profile photos" on storage.objects;
create policy "Anyone can view profile photos"
on storage.objects for select to public
using (bucket_id = 'profile-photos');

drop policy if exists "Members can update their profile photo" on storage.objects;
create policy "Members can update their profile photo"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

insert into storage.buckets (id, name, public)
values ('profile-covers', 'profile-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload their profile cover" on storage.objects;
create policy "Members can upload their profile cover"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Anyone can view profile covers" on storage.objects;
create policy "Anyone can view profile covers"
on storage.objects for select to public
using (bucket_id = 'profile-covers');

drop policy if exists "Members can update their profile cover" on storage.objects;
create policy "Members can update their profile cover"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

notify pgrst, 'reload schema';
