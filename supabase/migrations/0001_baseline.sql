-- 0001_baseline.sql: the canonical Brivia Club v1 schema for a fresh Supabase project (Ruling P6).
--
-- Consolidates the legacy files now archived in supabase/legacy/ (schema.sql, auth-hardening.sql,
-- blocking.sql, chat-attachments.sql, community-posts.sql, careers.sql, add-cover-support.sql,
-- gender-phone-fields.sql, connection-removal.sql, fix-profile-columns.sql, fix-auth-trigger.sql)
-- into one consistent schema. Where the legacy files disagreed, the latest definition wins;
-- see supabase/legacy/README.md for the choices made and what was dropped.
--
-- Every member id is uuid (auth.users ids are uuid), so policies compare auth.uid() directly.
-- Run in the Supabase SQL editor, then each later migrations/NNNN_*.sql file in order. Idempotent.
-- Secure by default: profiles are owner-only (others read public.public_profiles, no contact
-- fields), clients cannot insert matches, storage cannot be listed beyond your own folder, and the
-- block check answers only the two members involved. Re-run all migrations in order.
--
-- WARNING (Ruling P5): apply this ONLY together with the client change that reads public_profiles
-- and uses connection_requests (0002). Applied alone, the deck is empty and matches can't be created.

-- ---------------------------------------------------------------------------------------------
-- profiles: one row per member, owned by the auth user.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'New Member',
  full_name text not null default 'New Member',
  email text not null,
  phone text,
  phone_country_code text,
  phone_number text,
  gender text constraint profiles_gender_check
    check (gender is null or gender in ('Male', 'Female', 'Prefer not to say')),
  city text,
  state text,
  experience text,
  skills text[] not null default '{}',
  looking_for text[] not null default '{}',
  photo_url text,
  cover_url text,
  is_test boolean not null default false,  -- Ruling P7: seeded test members, purged before launch
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.profiles enable row level security;

-- An authenticated session is not a Brivia membership until a profile row exists.
create or replace function public.brivia_has_completed_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;
revoke all on function public.brivia_has_completed_profile() from public, anon;
grant execute on function public.brivia_has_completed_profile() to authenticated;

-- Secure by default: the base table is owner-only, so email and phone are visible only to the
-- member who owns the row. Other members read public.public_profiles (no contact fields).
drop policy if exists "Members can view profiles" on public.profiles;
drop policy if exists "Completed members can view profiles" on public.profiles;
drop policy if exists "Members can view their own profile" on public.profiles;
create policy "Members can view their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- Owner-run (security-definer) view, NOT security_invoker: it reads rows the base-table policy
-- hides, and the where clause keeps it members-only. Supabase advisor lint 0010 is expected.
-- Depends on profiles never having FORCE ROW LEVEL SECURITY and on the view owner owning profiles.
-- 0002_p0_privacy_consent.sql defines the same view and policy; re-applying it is a no-op.
create or replace view public.public_profiles as
  select id, name, full_name, gender, city, state, experience, skills, looking_for,
         photo_url, cover_url, created_at
  from public.profiles
  where public.brivia_has_completed_profile();
-- Strictly read-only for clients (default privileges would grant ALL, and writes through an
-- owner-run view would bypass RLS).
revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to authenticated;

drop policy if exists "Members can create their profile" on public.profiles;
create policy "Members can create their profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Members can update their profile" on public.profiles;
create policy "Members can update their profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Profiles are created by the client after sign-up, never by an auth trigger.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- matches: a connection between two members (unordered legacy rows; see Ruling P3).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user1_id, user2_id)
);
alter table public.matches enable row level security;

drop policy if exists "Members can view their matches" on public.matches;
drop policy if exists "Completed members can view their matches" on public.matches;
create policy "Completed members can view their matches"
  on public.matches for select to authenticated
  using (public.brivia_has_completed_profile() and auth.uid() in (user1_id, user2_id));

-- No client insert policy: a connection exists only after mutual consent, created server-side
-- (Task 2: connection_requests + respond_connection_request). Clients cannot insert matches.
drop policy if exists "Members can create their matches" on public.matches;
drop policy if exists "Completed members can create their matches" on public.matches;

-- Either side may remove a connection, in either orientation.
drop policy if exists "Members can remove their matches" on public.matches;
drop policy if exists "Completed members can remove their matches" on public.matches;
create policy "Completed members can remove their matches"
  on public.matches for delete to authenticated
  using (public.brivia_has_completed_profile() and auth.uid() in (user1_id, user2_id));

-- ---------------------------------------------------------------------------------------------
-- brivia_blocks: server-enforced blocking.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.brivia_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.brivia_blocks enable row level security;

drop policy if exists "Members can view their own blocks" on public.brivia_blocks;
create policy "Members can view their own blocks"
  on public.brivia_blocks for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Members can create their own blocks" on public.brivia_blocks;
create policy "Members can create their own blocks"
  on public.brivia_blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "Members can remove their own blocks" on public.brivia_blocks;
create policy "Members can remove their own blocks"
  on public.brivia_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- True when either member has blocked the other. Only answers for a caller who is one of the
-- two members; a third party always gets false, so it cannot probe who blocked whom.
-- The uuid form is canonical; the text form keeps callers that pass ::text ids (Task 2) working.
create or replace function public.brivia_is_blocked_between(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.brivia_blocks
    where auth.uid() in (first_user, second_user)
      and ((blocker_id = first_user and blocked_id = second_user)
        or (blocker_id = second_user and blocked_id = first_user))
  );
$$;
revoke all on function public.brivia_is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.brivia_is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.brivia_is_blocked_between(first_user text, second_user text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.brivia_blocks
    where auth.uid()::text in (first_user, second_user)
      and ((blocker_id::text = first_user and blocked_id::text = second_user)
        or (blocker_id::text = second_user and blocked_id::text = first_user))
  );
$$;
revoke all on function public.brivia_is_blocked_between(text, text) from public, anon;
grant execute on function public.brivia_is_blocked_between(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- brivia_messages: chat, with optional attachment metadata (files live in Storage).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.brivia_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  message_type text not null default 'text',
  attachment_url text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists brivia_messages_sender_idx on public.brivia_messages (sender_id);
create index if not exists brivia_messages_recipient_idx on public.brivia_messages (recipient_id);
alter table public.brivia_messages enable row level security;

drop policy if exists "Members can view their messages" on public.brivia_messages;
drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using (public.brivia_has_completed_profile() and auth.uid() in (sender_id, recipient_id));

-- One insert policy only: a second permissive policy would OR away the block rule.
drop policy if exists "Members can send messages" on public.brivia_messages;
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and sender_id = auth.uid()
    and not public.brivia_is_blocked_between(sender_id, recipient_id)
  );

-- Live INSERT events for chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brivia_messages'
  ) then
    alter publication supabase_realtime add table public.brivia_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- community_posts: the shared Explore feed.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
alter table public.community_posts enable row level security;

drop policy if exists "Members can view community posts" on public.community_posts;
create policy "Members can view community posts"
  on public.community_posts for select to authenticated
  using (public.brivia_has_completed_profile());

drop policy if exists "Members can create their own community posts" on public.community_posts;
create policy "Members can create their own community posts"
  on public.community_posts for insert to authenticated
  with check (public.brivia_has_completed_profile() and author_id = auth.uid());

drop policy if exists "Members can update their own community posts" on public.community_posts;
create policy "Members can update their own community posts"
  on public.community_posts for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "Members can delete their own community posts" on public.community_posts;
create policy "Members can delete their own community posts"
  on public.community_posts for delete to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- career_applications: public Careers form (applicants are not members; no member id).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  name text not null,
  email text not null,
  linkedin_url text,
  resume_path text not null,
  resume_name text not null,
  resume_size integer not null,
  created_at timestamptz not null default now()
);
alter table public.career_applications enable row level security;

drop policy if exists "Anyone can submit career applications" on public.career_applications;
create policy "Anyone can submit career applications"
  on public.career_applications for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------------------------
-- Storage buckets and object policies. Member uploads live under "<auth uid>/...".
-- Public buckets serve files by public URL without any select policy. Select policies only gate
-- the Storage list/search API, so they are owner-folder only: nobody can enumerate other
-- members' uuids or chat media paths (Ruling P9). Upsert/remove need select on own objects.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('profile-photos', 'profile-photos', true),
  ('profile-covers', 'profile-covers', true),
  ('message-attachments', 'message-attachments', true),
  ('community-posts', 'community-posts', true),
  ('career-resumes', 'career-resumes', false)
on conflict (id) do nothing;
-- Visibility of the buckets this file owns. message-attachments is NOT touched on a re-run: 0003 makes it
-- private, and re-running 0001 must never make chat media public again.
update storage.buckets set public = true where id in ('profile-photos', 'profile-covers', 'community-posts');
update storage.buckets set public = false where id = 'career-resumes';

-- Legacy list-everything policies (removed).
drop policy if exists "Anyone can view profile photos" on storage.objects;
drop policy if exists "Anyone can view profile covers" on storage.objects;
drop policy if exists "Anyone can view message attachments" on storage.objects;
drop policy if exists "Anyone can view community post images" on storage.objects;

-- profile-photos
drop policy if exists "Members can upload their profile photo" on storage.objects;
create policy "Members can upload their profile photo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own profile photos" on storage.objects;
create policy "Members can view their own profile photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can update their profile photo" on storage.objects;
create policy "Members can update their profile photo"
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- profile-covers
drop policy if exists "Members can upload their profile cover" on storage.objects;
create policy "Members can upload their profile cover"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own profile covers" on storage.objects;
create policy "Members can view their own profile covers"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can update their profile cover" on storage.objects;
create policy "Members can update their profile cover"
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- message-attachments (created public on a fresh install; 0003 makes it private and owns its visibility)
drop policy if exists "Members can upload message attachments" on storage.objects;
create policy "Members can upload message attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own message attachments" on storage.objects;
create policy "Members can view their own message attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can delete their message attachments" on storage.objects;
create policy "Members can delete their message attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'message-attachments' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- community-posts
drop policy if exists "Members can upload community post images" on storage.objects;
create policy "Members can upload community post images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'community-posts' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own community post images" on storage.objects;
create policy "Members can view their own community post images"
  on storage.objects for select to authenticated
  using (bucket_id = 'community-posts' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can delete their community post images" on storage.objects;
create policy "Members can delete their community post images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'community-posts' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- career-resumes (private bucket; upload only)
drop policy if exists "Anyone can upload career resumes" on storage.objects;
create policy "Anyone can upload career resumes"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'career-resumes' and lower(storage.extension(name)) in ('pdf', 'doc', 'docx'));

notify pgrst, 'reload schema';
