-- 0074 (D-242): who liked a note.
-- L1 the author sees every liker they can see, newest first, with is_connection; not a blocked liker.
-- L2 another member sees only their connections among the likers (and themselves).
-- L3 a member who cannot see the note (blocked by its author) gets nothing; anon cannot call it.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e740000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  -- 1 author, 2 liker (connected to 1 and 5), 3 liker, 4 liker blocked by 1, 5 viewer (connected to 2), 6 blocked by 1 (viewer)
  for g in 1..6 loop
    mid := pg_temp.mv(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Liker ' || g, 'Liker ' || g, 'liker' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.mv(1), pg_temp.mv(2)), greatest(pg_temp.mv(1), pg_temp.mv(2)));
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.mv(5), pg_temp.mv(2)), greatest(pg_temp.mv(5), pg_temp.mv(2)));
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(1), pg_temp.mv(4)), (pg_temp.mv(1), pg_temp.mv(6)) on conflict do nothing;
  insert into public.community_posts (id, author_id, image_url, image_path, caption)
  values ('0e740000-0000-4000-8000-0000000000a1', pg_temp.mv(1), 'https://example.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.mv(1) || '/p.jpg', pg_temp.mv(1) || '/p.jpg', 'A note');
  insert into public.community_post_likes (post_id, member_id, created_at) values
    ('0e740000-0000-4000-8000-0000000000a1', pg_temp.mv(2), now() - interval '3 minutes'),
    ('0e740000-0000-4000-8000-0000000000a1', pg_temp.mv(3), now() - interval '2 minutes'),
    ('0e740000-0000-4000-8000-0000000000a1', pg_temp.mv(4), now() - interval '1 minute');
end $$;

-- L1 as the author
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(1))::text, true);
set local role authenticated;
do $$
declare ids uuid[]; conn boolean;
begin
  select array_agg(l.member_id order by l.liked_at desc) into ids from public.post_likers('0e740000-0000-4000-8000-0000000000a1') l;
  if ids is distinct from array[pg_temp.mv(3), pg_temp.mv(2)] then raise exception 'FAIL L1: %', ids; end if;
  select l.is_connection into conn from public.post_likers('0e740000-0000-4000-8000-0000000000a1') l where l.member_id = pg_temp.mv(2);
  if conn is not true then raise exception 'FAIL L1: is_connection'; end if;
end $$;
reset role;

-- L2 as a member connected to liker 2 only
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(5))::text, true);
set local role authenticated;
do $$
declare ids uuid[];
begin
  select array_agg(l.member_id) into ids from public.post_likers('0e740000-0000-4000-8000-0000000000a1') l;
  if ids is distinct from array[pg_temp.mv(2)] then raise exception 'FAIL L2: %', ids; end if;
end $$;
reset role;

-- L3 as a member the author blocked
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(6))::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.post_likers('0e740000-0000-4000-8000-0000000000a1')) then raise exception 'FAIL L3: a blocked member saw likers'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.post_likers(uuid)', 'execute') then raise exception 'FAIL L3: anon can call it'; end if;
end $$;
rollback;
select 'zn-post-likers.test ALL PASSED';
