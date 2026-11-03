-- 0043 (D-151): the Read receipts switch, and notifications for likes and comments on a note.
-- Ids 0d430000-0000-4000-8000-0000000000NN: 01 A (author), 02 B, 03 C (blocked by A).
-- N1 B likes A's note: one post_like for A (source B, post_id); liking again after un-liking does not add a second;
--    un-liking removes the unread one; A liking their own note writes nothing.
-- N2 B comments: one post_comment for A with the comment id and a snippet (80 chars at most); deleting the comment
--    removes it; A's own comment writes nothing; C (blocked) liking or commenting writes nothing.
-- N3 my_notifications_v3 returns post_id, comment_id, snippet and the note's image; anon cannot execute it.
-- N4 read receipts: default on; off on either side -> mark_conversation_read marks delivered only; on both -> read.
set brivia.harness_autocomplete = 'on';
create or replace function pg_temp.xn(n int) returns uuid language sql immutable as $$
  select ('0d430000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int;
begin
  for g in 1..3 loop
    insert into auth.users(id) values (pg_temp.xn(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, city, experience, looking_for)
    values (pg_temp.xn(g), 'Xnote ' || g, 'Xnote ' || g, 'xnote' || g || '@example.com', 'Pune', 'Some years', array['Friends']) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where id = pg_temp.xn(g);
  end loop;
  insert into public.matches (user1_id, user2_id) values (pg_temp.xn(1), pg_temp.xn(2)) on conflict do nothing;
  insert into public.community_posts (id, author_id, image_url, image_path) values
    ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(1), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.xn(1) || '/a.jpg', pg_temp.xn(1) || '/a.jpg');
  if not public.brivia_visible_to(pg_temp.xn(1), pg_temp.xn(2)) then raise exception 'FAIL setup: A cannot see B'; end if;
end $$;

do $$
declare n int; v record; f text;
begin
  -- N1
  insert into public.community_post_likes (post_id, member_id) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(2));
  select count(*) into n from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_like'
     and source_user_id = pg_temp.xn(2) and post_id = '0d430000-0000-4000-8000-0000000000f1';
  if n <> 1 then raise exception 'FAIL N1: expected one like notification, got %', n; end if;
  update public.member_notification set read_at = now() where user_id = pg_temp.xn(1) and notification_type = 'post_like';
  delete from public.community_post_likes where member_id = pg_temp.xn(2);
  insert into public.community_post_likes (post_id, member_id) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(2));
  if (select count(*) from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_like') <> 1 then
    raise exception 'FAIL N1: like, unlike, like notified twice'; end if;
  update public.member_notification set read_at = null where user_id = pg_temp.xn(1) and notification_type = 'post_like';
  delete from public.community_post_likes where member_id = pg_temp.xn(2);
  if exists (select 1 from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_like') then
    raise exception 'FAIL N1: un-liking kept the unread notification'; end if;
  insert into public.community_post_likes (post_id, member_id) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(1));
  if exists (select 1 from public.member_notification where user_id = pg_temp.xn(1) and source_user_id = pg_temp.xn(1)) then
    raise exception 'FAIL N1: an own like notified'; end if;
  insert into public.community_post_likes (post_id, member_id) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(2));

  -- N2
  insert into public.community_post_comments (id, post_id, author_id, body) values
    ('0d430000-0000-4000-8000-0000000000c1', '0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(2), repeat('lovely ', 30));
  select * into v from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_comment';
  if v.comment_id is distinct from '0d430000-0000-4000-8000-0000000000c1'::uuid or char_length(v.snippet) > 80 or v.snippet not like 'lovely lovely%' then
    raise exception 'FAIL N2: comment notification wrong: % %', v.comment_id, v.snippet; end if;
  insert into public.community_post_comments (post_id, author_id, body) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(1), 'thanks');
  if (select count(*) from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_comment') <> 1 then
    raise exception 'FAIL N2: an own comment notified'; end if;
  delete from public.community_post_comments where id = '0d430000-0000-4000-8000-0000000000c1';
  if exists (select 1 from public.member_notification where user_id = pg_temp.xn(1) and notification_type = 'post_comment') then
    raise exception 'FAIL N2: a deleted comment kept its notification'; end if;
  insert into public.community_post_comments (id, post_id, author_id, body) values
    ('0d430000-0000-4000-8000-0000000000c2', '0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(2), 'Where is this?');
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.xn(1), pg_temp.xn(3)) on conflict do nothing;
  insert into public.community_post_likes (post_id, member_id) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(3));
  insert into public.community_post_comments (post_id, author_id, body) values ('0d430000-0000-4000-8000-0000000000f1', pg_temp.xn(3), 'hi');
  if exists (select 1 from public.member_notification where user_id = pg_temp.xn(1) and source_user_id = pg_temp.xn(3)) then
    raise exception 'FAIL N2: a blocked member notified'; end if;

  -- N3
  foreach f in array array['public.my_notifications_v3()', 'public.set_read_receipts(boolean)', 'public.my_read_receipts()'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL N3: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL N3: authenticated may not execute %', f; end if;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(1))::text, true);
  select count(*) into n from public.my_notifications_v3() x
   where x.post_id = '0d430000-0000-4000-8000-0000000000f1' and x.post_image_url like '%/a.jpg'
     and x.notification_type in ('post_like', 'post_comment') and x.name = 'Xnote 2';
  if n <> 2 then raise exception 'FAIL N3: expected the like and the comment with name and image, got %', n; end if;
  if (select snippet from public.my_notifications_v3() x where x.notification_type = 'post_comment') <> 'Where is this?' then
    raise exception 'FAIL N3: snippet missing'; end if;

  -- N4 (B messages A; A reads)
  reset role;
  insert into public.brivia_messages (id, sender_id, recipient_id, body) values
    ('0d430000-0000-4000-8000-0000000000a1', pg_temp.xn(2), pg_temp.xn(1), 'one'),
    ('0d430000-0000-4000-8000-0000000000a2', pg_temp.xn(2), pg_temp.xn(1), 'two');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(1))::text, true);
  if not public.my_read_receipts() then raise exception 'FAIL N4: default should be on'; end if;
  perform public.set_read_receipts(false);
  if public.my_read_receipts() then raise exception 'FAIL N4: did not turn off'; end if;
  perform public.mark_conversation_read(pg_temp.xn(2));
  reset role;
  if exists (select 1 from public.brivia_messages where id::text like '0d430000-%' and (read_at is not null or delivered_at is null)) then
    raise exception 'FAIL N4: reader off should mark delivered only'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(1))::text, true);
  perform public.set_read_receipts(true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(2))::text, true);
  perform public.set_read_receipts(false);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(1))::text, true);
  perform public.mark_conversation_read(pg_temp.xn(2));
  reset role;
  if exists (select 1 from public.brivia_messages where id::text like '0d430000-%' and read_at is not null) then
    raise exception 'FAIL N4: sender off still got Read'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(2))::text, true);
  perform public.set_read_receipts(true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.xn(1))::text, true);
  if public.mark_conversation_read(pg_temp.xn(2)) <> 2 then raise exception 'FAIL N4: both on should mark 2 read'; end if;
  reset role;
end $$;
select 'x-post-notifications.test N1-N4 OK';

delete from public.brivia_messages where id::text like '0d430000-%';
delete from public.member_notification where user_id::text like '0d430000-%';
delete from public.community_posts where author_id::text like '0d430000-%';
delete from public.brivia_blocks where blocker_id::text like '0d430000-%';
delete from public.matches where user1_id::text like '0d430000-%';
delete from public.profiles where id::text like '0d430000-%';
delete from auth.users where id::text like '0d430000-%';
