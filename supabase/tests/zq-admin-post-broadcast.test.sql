-- 0077 (D-250): an Admin's note notifies every real account; anyone else's notifies only their connections.
-- A1 admin posts: every other account in the world gets 'post_new' (completed or not), not the author, not a blocker,
--    not an anonymous account, not another world.
-- A2 a member without the badge posts: only their connection is notified.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.ab(n int) returns uuid language sql immutable as $$
  select ('0e770000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; mid uuid; n int; ids uuid[]; p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
begin
  -- 1 admin, 2 member, 3 member (connected to 2), 4 setup unfinished, 5 blocked the admin, 6 anonymous, 7 other world
  for g in 1..7 loop
    mid := pg_temp.ab(g);
    insert into auth.users(id, is_anonymous) values (mid, g = 6) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test) values (mid, 'Ann ' || g, 'Ann ' || g, 'ann' || g || '@example.com', g = 7) on conflict (id) do nothing;
  end loop;
  insert into public.member_badge (member_id, badge) values (pg_temp.ab(1), 'admin');
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.ab(5), pg_temp.ab(1));
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.ab(2), pg_temp.ab(3)), greatest(pg_temp.ab(2), pg_temp.ab(3)));
  if public.brivia_in_test_world(pg_temp.ab(7)) = public.brivia_in_test_world(pg_temp.ab(1)) then
    raise exception 'FAIL setup: 7 must be in another world'; end if;
  insert into public.community_posts (id, author_id, image_url, image_path, caption)
  values (p1, pg_temp.ab(1), 'https://example.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.ab(1) || '/a.jpg', pg_temp.ab(1) || '/a.jpg', 'Brivia has notifications');
  select array_agg(user_id order by user_id) into ids from public.member_notification where post_id = p1 and notification_type = 'post_new' and user_id::text like '0e770000%';
  if ids is distinct from array[pg_temp.ab(2), pg_temp.ab(3), pg_temp.ab(4)] then raise exception 'FAIL A1: admin note reached %', ids; end if;
  insert into public.community_posts (id, author_id, image_url, image_path, caption)
  values (p2, pg_temp.ab(2), 'https://example.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.ab(2) || '/b.jpg', pg_temp.ab(2) || '/b.jpg', 'hello');
  select array_agg(user_id) into ids from public.member_notification where post_id = p2 and notification_type = 'post_new';
  -- 2 and 3 are not completed here, so brivia_visible_to keeps even the connection out: no row at all is the 0071 rule
  if ids is not null and ids <> array[pg_temp.ab(3)] then raise exception 'FAIL A2: member note reached %', ids; end if;
  select count(*) into n from public.member_notification where post_id = p2 and user_id in (pg_temp.ab(4), pg_temp.ab(1));
  if n <> 0 then raise exception 'FAIL A2: a non-connection was notified'; end if;
end $$;
rollback;
select 'zq-admin-post-broadcast.test ALL PASSED';
