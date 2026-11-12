set lock_timeout = '5s';
-- 0074_post_likers.sql (D-242, a member's feedback via the founder, 2026-11-12: "I'm unable to see who liked my
-- note"). Apply after 0073 (README "## 0074"), then deploy the client. 0001-0073 are frozen. Idempotent.
--
-- post_likers(p_post_id): who liked a note, newest first (at most 200), as cards the caller may see.
--   * The note's author sees every liker they can see (brivia_visible_to: completed, same world, no block either way).
--   * Anyone else who can see the note sees only their own connections among its likers (the rule post_activity's
--     "Liked by" line already follows, 0015), plus themselves.
--   * A note the caller cannot see answers nothing. Answers id, name, photo_url, liked_at, is_connection; never email,
--     phone or location.

create or replace function public.post_likers(p_post_id uuid)
returns table(member_id uuid, name text, photo_url text, liked_at timestamptz, is_connection boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where auth.uid() is not null and public.brivia_member_completed(auth.uid())),
  post as (
    select p.id, p.author_id from public.community_posts p, me
     where p.id = p_post_id and (p.author_id = me.id or public.brivia_visible_to(me.id, p.author_id))),
  connections as (
    select case when m.user1_id = me.id then m.user2_id else m.user1_id end as id
      from public.matches m, me where me.id in (m.user1_id, m.user2_id))
  select l.member_id, pr.name, pr.photo_url, l.created_at, (l.member_id in (select id from connections))
    from public.community_post_likes l
    join post on post.id = l.post_id
    join public.profiles pr on pr.id = l.member_id
    cross join me
   where l.member_id = me.id
      or (public.brivia_visible_to(me.id, l.member_id)
          and (post.author_id = me.id or l.member_id in (select id from connections)))
   order by l.created_at desc, l.member_id
   limit 200
$$;
revoke all on function public.post_likers(uuid) from public, anon;
grant execute on function public.post_likers(uuid) to authenticated;
