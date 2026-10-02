-- Run this once in Supabase SQL Editor for an existing database.
-- This is safe for an existing table: it only adds missing columns.
create table if not exists public.profiles (
  id text primary key,
  name text default 'New Member',
  full_name text default 'New Member',
  email text,
  phone text,
  phone_country_code text,
  phone_number text,
  gender text,
  city text,
  state text,
  experience text,
  skills text[] default '{}',
  looking_for text[] default '{}',
  photo_url text,
  cover_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists full_name text default 'New Member';
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_country_code text;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists experience text;
alter table public.profiles add column if not exists skills text[];
alter table public.profiles add column if not exists looking_for text[];
alter table public.profiles add column if not exists photo_url text;
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;

notify pgrst, 'reload schema';

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload their profile photo" on storage.objects;
create policy "Members can upload their profile photo" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Anyone can view profile photos" on storage.objects;
create policy "Anyone can view profile photos" on storage.objects for select to public using (bucket_id = 'profile-photos');
drop policy if exists "Members can update their profile photo" on storage.objects;
create policy "Members can update their profile photo" on storage.objects for update to authenticated using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

insert into storage.buckets (id, name, public)
values ('profile-covers', 'profile-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload their profile cover" on storage.objects;
create policy "Members can upload their profile cover" on storage.objects for insert to authenticated with check (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Anyone can view profile covers" on storage.objects;
create policy "Anyone can view profile covers" on storage.objects for select to public using (bucket_id = 'profile-covers');
drop policy if exists "Members can update their profile cover" on storage.objects;
create policy "Members can update their profile cover" on storage.objects for update to authenticated using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Legacy credentials table retained for compatibility; the app no longer stores passwords here.
create table if not exists public.profile_credentials (
  user_id text primary key,
  email text not null default '',
  login_password text not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_credentials enable row level security;
drop policy if exists "Members can view their own login credential" on public.profile_credentials;
drop policy if exists "Members can save their own login credential" on public.profile_credentials;
drop policy if exists "Members can update their own login credential" on public.profile_credentials;

-- Enable live INSERT events for the chat table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brivia_messages'
  ) then
    alter publication supabase_realtime add table public.brivia_messages;
  end if;
end $$;
