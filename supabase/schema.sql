create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'New Member',
  full_name text not null default 'New Member',
  email text not null,
  phone text,
  phone_country_code text,
  phone_number text,
  gender text check (gender in ('Male', 'Female', 'Prefer not to say')),
  city text,
  state text,
  experience text,
  skills text[] not null default '{}',
  looking_for text[] not null default '{}',
  photo_url text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  login_password text not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_credentials enable row level security;
drop policy if exists "Members can view their own login credential" on public.profile_credentials;
drop policy if exists "Members can save their own login credential" on public.profile_credentials;
drop policy if exists "Members can update their own login credential" on public.profile_credentials;

-- Migrate existing projects too. CREATE TABLE IF NOT EXISTS does not add
-- columns when public.profiles already exists.
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

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

alter table public.profiles enable row level security;
create or replace function public.brivia_has_completed_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id::text = auth.uid()::text);
$$;
revoke all on function public.brivia_has_completed_profile() from public;
grant execute on function public.brivia_has_completed_profile() to authenticated;
drop policy if exists "Members can view profiles" on public.profiles;
create policy "Members can view profiles" on public.profiles for select to authenticated using (id::text = auth.uid()::text or public.brivia_has_completed_profile());
drop policy if exists "Members can create their profile" on public.profiles;
create policy "Members can create their profile" on public.profiles for insert to authenticated with check (auth.uid()::text = id::text);
drop policy if exists "Members can update their profile" on public.profiles;
create policy "Members can update their profile" on public.profiles for update to authenticated using (auth.uid()::text = id::text) with check (auth.uid()::text = id::text);

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('profile-covers', 'profile-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload their profile photo" on storage.objects;
create policy "Members can upload their profile photo" on storage.objects for insert to authenticated with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Anyone can view profile photos" on storage.objects;
create policy "Anyone can view profile photos" on storage.objects for select to public using (bucket_id = 'profile-photos');
drop policy if exists "Members can update their profile photo" on storage.objects;
create policy "Members can update their profile photo" on storage.objects for update to authenticated using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Members can upload their profile cover" on storage.objects;
create policy "Members can upload their profile cover" on storage.objects for insert to authenticated with check (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Anyone can view profile covers" on storage.objects;
create policy "Anyone can view profile covers" on storage.objects for select to public using (bucket_id = 'profile-covers');
drop policy if exists "Members can update their profile cover" on storage.objects;
create policy "Members can update their profile cover" on storage.objects for update to authenticated using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user1_id, user2_id)
);

alter table public.matches enable row level security;
drop policy if exists "Members can view their matches" on public.matches;
create policy "Members can view their matches" on public.matches for select to authenticated using (public.brivia_has_completed_profile() and (auth.uid()::text = user1_id::text or auth.uid()::text = user2_id::text));
drop policy if exists "Members can create their matches" on public.matches;
create policy "Members can create their matches" on public.matches for insert to authenticated with check (public.brivia_has_completed_profile() and auth.uid()::text = user1_id::text);
drop policy if exists "Members can remove their matches" on public.matches;
create policy "Members can remove their matches" on public.matches for delete to authenticated using (public.brivia_has_completed_profile() and (auth.uid()::text = user1_id::text or auth.uid()::text = user2_id::text));

create table if not exists public.brivia_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null,
  recipient_id text not null,
  body text not null,
  message_type text not null default 'text',
  attachment_url text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.brivia_blocks (
  blocker_id text not null references public.profiles(id) on delete cascade,
  blocked_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.brivia_blocks enable row level security;
drop policy if exists "Members can view their own blocks" on public.brivia_blocks;
create policy "Members can view their own blocks" on public.brivia_blocks for select to authenticated using (auth.uid()::text = blocker_id::text);
drop policy if exists "Members can create their own blocks" on public.brivia_blocks;
create policy "Members can create their own blocks" on public.brivia_blocks for insert to authenticated with check (auth.uid()::text = blocker_id::text);
drop policy if exists "Members can remove their own blocks" on public.brivia_blocks;
create policy "Members can remove their own blocks" on public.brivia_blocks for delete to authenticated using (auth.uid()::text = blocker_id::text);

create or replace function public.brivia_is_blocked_between(first_user text, second_user text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.brivia_blocks where (blocker_id::text = first_user and blocked_id::text = second_user) or (blocker_id::text = second_user and blocked_id::text = first_user));
$$;
revoke all on function public.brivia_is_blocked_between(text, text) from public;
grant execute on function public.brivia_is_blocked_between(text, text) to authenticated;

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
create policy "Members can upload message attachments" on storage.objects for insert to authenticated
with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Anyone can view message attachments" on storage.objects;
create policy "Anyone can view message attachments" on storage.objects for select to public
using (bucket_id = 'message-attachments');
drop policy if exists "Members can delete their message attachments" on storage.objects;
create policy "Members can delete their message attachments" on storage.objects for delete to authenticated
using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

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

alter table public.brivia_messages enable row level security;
drop policy if exists "Members can view their messages" on public.brivia_messages;
create policy "Members can view their messages" on public.brivia_messages for select to authenticated using (public.brivia_has_completed_profile() and (auth.uid()::text = sender_id::text or auth.uid()::text = recipient_id::text));
drop policy if exists "Members can send messages" on public.brivia_messages;
create policy "Members can send messages" on public.brivia_messages for insert to authenticated with check (public.brivia_has_completed_profile() and auth.uid()::text = sender_id::text and not public.brivia_is_blocked_between(sender_id, recipient_id));
