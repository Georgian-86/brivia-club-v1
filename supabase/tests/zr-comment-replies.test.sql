-- 0078 (D-260): a reply notifies the writer of the comment it answers.
-- Ids 0e780000-0000-4000-8000-0000000000NN: 01 A (the note's author), 02 B, 03 C, 04 D (blocked by B).
-- R1 A replies to B's comment on A's note: B gets one comment_reply (source A, comment id, snippet); A gets nothing.
-- R2 C replies to B's comment: B gets a comment_reply; A gets the usual post_comment and no comment_reply.
-- R3 C replies to A's own comment: A gets only the post_comment (never two for one reply).
-- R4 B replies to their own comment: nothing for B.  R5 D (blocked by B) replies to B: nothing for B.
set brivia.harness_autocomplete = 'on';
begin;
create or replace function pg_temp.cr(n int) returns uuid language sql immutable as $$
  select ('0e780000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; post uuid := '0e780000-0000-4000-8000-0000000000f1'; n int;
begin
  for g in 1..4 loop
    insert into auth.users(id) values (pg_temp.cr(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, city, experience, looking_for)
    values (pg_temp.cr(g), 'Reply ' || g, 'Reply ' || g, 'reply' || g || '@example.com', 'Pune', 'Some years', array['Friends']) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where id = pg_temp.cr(g);
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.cr(2), pg_temp.cr(4));
  insert into public.community_posts (id, author_id, image_url, image_path) values
    (post, pg_temp.cr(1), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.cr(1) || '/a.jpg', pg_temp.cr(1) || '/a.jpg');
  if not public.brivia_visible_to(pg_temp.cr(2), pg_temp.cr(1)) then raise exception 'FAIL setup: B cannot see A'; end if;
  insert into public.community_post_comments (id, post_id, author_id, body) values ('0e780000-0000-4000-8000-0000000000c1', post, pg_temp.cr(2), 'Where is this?');
  insert into public.community_post_comments (id, post_id, author_id, body) values ('0e780000-0000-4000-8000-0000000000c9', post, pg_temp.cr(1), 'Author speaking');
  -- R1
  insert into public.community_post_comments (id, post_id, author_id, parent_id, body) values ('0e780000-0000-4000-8000-0000000000c2', post, pg_temp.cr(1), '0e780000-0000-4000-8000-0000000000c1', 'In Pune!');
  select count(*) into n from public.member_notification where user_id = pg_temp.cr(2) and notification_type = 'comment_reply'
     and source_user_id = pg_temp.cr(1) and comment_id = '0e780000-0000-4000-8000-0000000000c2' and snippet = 'In Pune!' and post_id = post;
  if n <> 1 then raise exception 'FAIL R1: B got % replies from A', n; end if;
  if exists (select 1 from public.member_notification where user_id = pg_temp.cr(1) and comment_id = '0e780000-0000-4000-8000-0000000000c2') then
    raise exception 'FAIL R1: A was told about their own reply'; end if;
  -- R2
  insert into public.community_post_comments (id, post_id, author_id, parent_id, body) values ('0e780000-0000-4000-8000-0000000000c3', post, pg_temp.cr(3), '0e780000-0000-4000-8000-0000000000c1', 'Me too');
  if (select count(*) from public.member_notification where user_id = pg_temp.cr(2) and notification_type = 'comment_reply' and comment_id = '0e780000-0000-4000-8000-0000000000c3') <> 1 then
    raise exception 'FAIL R2: B not told of C''s reply'; end if;
  if (select string_agg(notification_type, ',') from public.member_notification where user_id = pg_temp.cr(1) and comment_id = '0e780000-0000-4000-8000-0000000000c3') is distinct from 'post_comment' then
    raise exception 'FAIL R2: A should get one post_comment only'; end if;
  -- R3
  insert into public.community_post_comments (id, post_id, author_id, parent_id, body) values ('0e780000-0000-4000-8000-0000000000c4', post, pg_temp.cr(3), '0e780000-0000-4000-8000-0000000000c9', 'Nice');
  if (select count(*) from public.member_notification where user_id = pg_temp.cr(1) and comment_id = '0e780000-0000-4000-8000-0000000000c4') <> 1 then
    raise exception 'FAIL R3: A notified twice (or not at all) for one reply'; end if;
  -- R4
  insert into public.community_post_comments (id, post_id, author_id, parent_id, body) values ('0e780000-0000-4000-8000-0000000000c5', post, pg_temp.cr(2), '0e780000-0000-4000-8000-0000000000c1', 'edit: Pune');
  if exists (select 1 from public.member_notification where user_id = pg_temp.cr(2) and comment_id = '0e780000-0000-4000-8000-0000000000c5') then
    raise exception 'FAIL R4: B told of their own reply'; end if;
  -- R5
  insert into public.community_post_comments (id, post_id, author_id, parent_id, body) values ('0e780000-0000-4000-8000-0000000000c6', post, pg_temp.cr(4), '0e780000-0000-4000-8000-0000000000c1', 'hey');
  if exists (select 1 from public.member_notification where user_id = pg_temp.cr(2) and comment_id = '0e780000-0000-4000-8000-0000000000c6') then
    raise exception 'FAIL R5: a blocked member''s reply reached B'; end if;
end $$;
rollback;
select 'zr-comment-replies.test ALL PASSED';
