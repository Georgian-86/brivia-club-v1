-- 0071 (D-234): connections hear about a new note.
-- N1 a new note notifies each connection once (post_id, the caption's start in snippet); not the author, not a
--    non-connection, not a blocked connection. Members cannot call the trigger function.
-- N2 editing the caption updates an unread notification's snippet; deleting the note removes the notifications.
-- N3 my_notifications_v4 returns it, with the note's image.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e710000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..5 loop
    mid := pg_temp.mv(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Poster ' || g, 'Poster ' || g, 'post-new' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  -- 1 is connected to 2, 3 and 4 (4 is blocked by 1); 5 is not connected.
  for g in 2..4 loop
    insert into public.matches (user1_id, user2_id) values (least(pg_temp.mv(1), pg_temp.mv(g)), greatest(pg_temp.mv(1), pg_temp.mv(g)));
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(1), pg_temp.mv(4)) on conflict do nothing;
end $$;

do $$
declare n int; pid uuid := '0e710000-0000-4000-8000-0000000000a1';
begin
  -- N1
  insert into public.community_posts (id, author_id, image_url, image_path, caption)
  values (pid, pg_temp.mv(1), 'https://example.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.mv(1) || '/p.jpg',
          pg_temp.mv(1) || '/p.jpg', '  Evening   at the club ');
  select count(*) into n from public.member_notification where notification_type = 'post_new' and post_id = pid;
  if n <> 2 then raise exception 'FAIL N1: % notifications (want Poster 2 and 3)', n; end if;
  if exists (select 1 from public.member_notification where notification_type = 'post_new' and user_id in (pg_temp.mv(1), pg_temp.mv(4), pg_temp.mv(5))) then
    raise exception 'FAIL N1: the author, a blocked connection or a stranger was notified'; end if;
  if (select snippet from public.member_notification where notification_type = 'post_new' and user_id = pg_temp.mv(2)) <> 'Evening at the club' then
    raise exception 'FAIL N1: the snippet'; end if;
  if has_function_privilege('authenticated', 'brivia_private.brivia_notify_post_new()', 'execute') then
    raise exception 'FAIL N1: members can call the trigger function'; end if;
  -- N2
  update public.member_notification set read_at = now() where notification_type = 'post_new' and user_id = pg_temp.mv(3);
  update public.community_posts set caption = 'Badminton tonight' where id = pid;
  if (select snippet from public.member_notification where notification_type = 'post_new' and user_id = pg_temp.mv(2)) <> 'Badminton tonight' then
    raise exception 'FAIL N2: an unread snippet was not updated'; end if;
  if (select snippet from public.member_notification where notification_type = 'post_new' and user_id = pg_temp.mv(3)) <> 'Evening at the club' then
    raise exception 'FAIL N2: a read snippet changed'; end if;
end $$;

-- N3: as Poster 2
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(2))::text, true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_notifications_v4() where notification_type = 'post_new';
  if r.post_id is distinct from '0e710000-0000-4000-8000-0000000000a1'::uuid or r.post_image_url not like '%community-posts%' or r.name <> 'Poster 1' then
    raise exception 'FAIL N3: v4 gave %', row_to_json(r); end if;
end $$;
reset role;

do $$
begin
  delete from public.community_posts where id = '0e710000-0000-4000-8000-0000000000a1';
  if exists (select 1 from public.member_notification where notification_type = 'post_new') then
    raise exception 'FAIL N2: deleting the note left its notifications'; end if;
end $$;
rollback;
select 'zk-new-post-notes.test ALL PASSED';
