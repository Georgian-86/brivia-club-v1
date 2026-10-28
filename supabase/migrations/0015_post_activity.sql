set lock_timeout = '5s';
-- 0015_post_activity.sql: likes, comments and shares on Explore posts that other members can see (founder request
-- 2026-10-28, D-101). "Make the likes, comments and share functional and the connections can see it. Make the comments
-- in the thread style: whoever replies to a comment, it should be in a thread form."
-- Applied by hand in the Supabase SQL editor, as postgres, after 0014 (see README.md "## 0015"). 0001-0014 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Based on the latest definitions:
--   * community_posts select policy "Members can view community posts" (0006_perf_policies.sql:54): the author, or
--     brivia_can_see_author(author_id) (0004:845, which is brivia_visible_to as redefined in 0008:76: same world, no
--     block either way, both completed).
--   * community_post_likes / community_post_saves (0012 section C): own rows only. They are NOT changed: a member still
--     reads only their own like rows. What others learn about likes comes only from post_activity() below.
--
-- What changes:
--   1. community_post_comments: a comment, or a reply (parent_id) to another comment on the same post, so the client
--      draws threads. Readable by anyone who can see the post AND the comment's author (a blocked or other-world author's
--      comments are invisible, like their posts). Insert: own, completed, on a post the member can see. Delete: the
--      comment's author or the post's author. No update. A deleted comment takes its replies with it (cascade).
--   2. community_post_shares: one row per member and post when they share it (a link, or sent to a connection in chat).
--      Own rows only, like likes; the count comes from post_activity().
--   3. post_activity(post ids): per post the caller can see: like, comment and share counts, whether the caller liked it,
--      and up to 3 of the caller's CONNECTIONS (mutual matches) who liked it. Counts include only members the caller can
--      see (so a blocked member, or the other world, is never counted). Other likers are never named.

-- 1. Comments ----------------------------------------------------------------------------------------------------------
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id uuid references public.community_post_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint community_post_comments_body_len check (char_length(btrim(body)) between 1 and 1000)
);
create index if not exists community_post_comments_post_idx on public.community_post_comments (post_id, created_at);
create index if not exists community_post_comments_parent_idx on public.community_post_comments (parent_id);
create index if not exists community_post_comments_author_idx on public.community_post_comments (author_id);
alter table public.community_post_comments enable row level security;
revoke all on public.community_post_comments from public, anon, authenticated;
grant select, insert, delete on public.community_post_comments to authenticated;

-- A reply belongs to the same post as the comment it answers (a policy cannot read its own table without recursion,
-- so a trigger checks it). The server clock and the caller's id are always used.
create or replace function brivia_private.brivia_comment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.body := btrim(new.body);
  if new.parent_id is not null and not exists (
    select 1 from public.community_post_comments c where c.id = new.parent_id and c.post_id = new.post_id) then
    raise exception 'reply_wrong_post' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function brivia_private.brivia_comment_guard() from public, anon, authenticated;
drop trigger if exists community_post_comments_guard on public.community_post_comments;
create trigger community_post_comments_guard before insert on public.community_post_comments
  for each row execute function brivia_private.brivia_comment_guard();

drop policy if exists "Members can read comments they can see" on public.community_post_comments;
create policy "Members can read comments they can see"
  on public.community_post_comments for select to authenticated
  using (
    exists (select 1 from public.community_posts p where p.id = post_id)
    and (author_id = (select auth.uid()) or public.brivia_can_see_author(author_id))
  );
drop policy if exists "Members can comment on posts they can see" on public.community_post_comments;
create policy "Members can comment on posts they can see"
  on public.community_post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.brivia_has_completed_profile())
    and exists (select 1 from public.community_posts p where p.id = post_id)
  );
drop policy if exists "Authors can remove comments" on public.community_post_comments;
create policy "Authors can remove comments"
  on public.community_post_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

-- 2. Shares ------------------------------------------------------------------------------------------------------------
create table if not exists public.community_post_shares (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  member_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);
create index if not exists community_post_shares_member_idx on public.community_post_shares (member_id, created_at desc);
alter table public.community_post_shares enable row level security;
revoke all on public.community_post_shares from public, anon, authenticated;
grant select, insert on public.community_post_shares to authenticated;
drop policy if exists "Members can view their own shares" on public.community_post_shares;
create policy "Members can view their own shares"
  on public.community_post_shares for select to authenticated
  using (member_id = (select auth.uid()));
drop policy if exists "Members can record their own shares" on public.community_post_shares;
create policy "Members can record their own shares"
  on public.community_post_shares for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.brivia_has_completed_profile())
    and exists (select 1 from public.community_posts p where p.id = post_id)
  );

-- 3. post_activity -----------------------------------------------------------------------------------------------------
create or replace function public.post_activity(p_post_ids uuid[])
returns table(post_id uuid, like_count int, liked_by_me boolean, comment_count int, share_count int, connection_likers uuid[])
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where auth.uid() is not null and public.brivia_member_completed(auth.uid())),
  posts as (  -- at most 100 posts the caller can see (the same rule as the posts select policy)
    select p.id from public.community_posts p, me
     where p.id = any((coalesce(p_post_ids, '{}'::uuid[]))[1:100])
       and (p.author_id = me.id or public.brivia_visible_to(me.id, p.author_id))),
  connections as (
    select case when m.user1_id = me.id then m.user2_id else m.user1_id end as id
      from public.matches m, me where me.id in (m.user1_id, m.user2_id))
  select po.id,
         (select count(*)::int from public.community_post_likes l, me
           where l.post_id = po.id and (l.member_id = me.id or public.brivia_visible_to(me.id, l.member_id))),
         exists (select 1 from public.community_post_likes l, me where l.post_id = po.id and l.member_id = me.id),
         (select count(*)::int from public.community_post_comments c, me
           where c.post_id = po.id and (c.author_id = me.id or public.brivia_visible_to(me.id, c.author_id))),
         (select count(*)::int from public.community_post_shares s, me
           where s.post_id = po.id and (s.member_id = me.id or public.brivia_visible_to(me.id, s.member_id))),
         coalesce((select array_agg(x.member_id order by x.created_at desc) from (
            select l.member_id, l.created_at from public.community_post_likes l, me
             where l.post_id = po.id and l.member_id in (select id from connections)
               and public.brivia_visible_to(me.id, l.member_id)
             order by l.created_at desc limit 3) x), '{}'::uuid[])
    from posts po
$$;
revoke all on function public.post_activity(uuid[]) from public, anon;
grant execute on function public.post_activity(uuid[]) to authenticated;
