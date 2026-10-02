-- Run once in Supabase SQL Editor to enable the shared Explore feed.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id text not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

alter table public.community_posts add column if not exists author_id text;
alter table public.community_posts add column if not exists image_url text;
alter table public.community_posts add column if not exists image_path text;
alter table public.community_posts add column if not exists caption text default '';
alter table public.community_posts add column if not exists created_at timestamptz default now();

create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
alter table public.community_posts enable row level security;

drop policy if exists "Members can view community posts" on public.community_posts;
create policy "Members can view community posts"
  on public.community_posts for select to authenticated
  using (public.brivia_has_completed_profile());

drop policy if exists "Members can create their own community posts" on public.community_posts;
create policy "Members can create their own community posts"
  on public.community_posts for insert to authenticated
  with check (public.brivia_has_completed_profile() and auth.uid()::text = author_id::text);

drop policy if exists "Members can update their own community posts" on public.community_posts;
create policy "Members can update their own community posts"
  on public.community_posts for update to authenticated
  using (auth.uid()::text = author_id::text)
  with check (auth.uid()::text = author_id::text);

drop policy if exists "Members can delete their own community posts" on public.community_posts;
create policy "Members can delete their own community posts"
  on public.community_posts for delete to authenticated
  using (auth.uid()::text = author_id::text);

insert into storage.buckets (id, name, public)
values ('community-posts', 'community-posts', true)
on conflict (id) do update set public = true;

drop policy if exists "Members can upload community post images" on storage.objects;
create policy "Members can upload community post images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-posts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Anyone can view community post images" on storage.objects;
create policy "Anyone can view community post images"
  on storage.objects for select to public
  using (bucket_id = 'community-posts');

drop policy if exists "Members can delete their community post images" on storage.objects;
create policy "Members can delete their community post images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-posts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

notify pgrst, 'reload schema';
