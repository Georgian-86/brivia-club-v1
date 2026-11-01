-- Phase D, Task 2 (0008 section 4): the community_posts image rule. The 0003 CHECK (community_posts_image_storage)
-- became a trigger with the same rule for everyone, plus one exception: a test member (profiles.is_test) may post a
-- preset illustration (brivia_is_preset_cover, the shape of isPresetCoverUrl in supabase.js) with an empty image_path,
-- so the seed's posts show an image without a Storage upload. Real members' rule is unchanged, and a tester (a real
-- account in brivia_tester) is still a real member here.
-- Ids: d0057000-0000-4000-8000-0000000000NN: 01 T test member, 02 R real member, 03 X real tester.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.dp(n int) returns uuid language sql immutable as $$
  select ('d0057000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.dp(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Dpost ' || g, 'Dpost ' || g, 'dpost' || g || '@example.com', g = 1, 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  insert into public.brivia_tester (member_id) values (pg_temp.dp(3)) on conflict do nothing;
  if (select count(*) from generate_series(1, 3) s(i) where public.brivia_member_completed(pg_temp.dp(s.i))) <> 3 then
    raise exception 'FAIL setup: the post fixtures are not completed';
  end if;
end $$;

-- Structure: the CHECK is gone, the trigger is there, and no client role can call its function.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'community_posts_image_storage') then
    raise exception 'FAIL DP0: the 0003 CHECK community_posts_image_storage still exists'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.community_posts'::regclass and tgname = 'brivia_zz_posts_image_rule'
                   and not tgisinternal) then
    raise exception 'FAIL DP0: trigger brivia_zz_posts_image_rule is missing'; end if;
  if has_function_privilege('authenticated', 'public.brivia_posts_image_rule()', 'execute')
     or has_function_privilege('anon', 'public.brivia_posts_image_rule()', 'execute') then
    raise exception 'FAIL DP0: a client role may execute brivia_posts_image_rule'; end if;
end $$;

-- Accepted and refused inserts, as the signed-in author (role authenticated) and as the owner.
do $$
declare
  base text := 'https://proj.supabase.co/storage/v1/object/public/';
  preset text := '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG';
  t uuid := pg_temp.dp(1); r uuid := pg_temp.dp(2); x uuid := pg_temp.dp(3);
  stmt text; who uuid; rec record; failed boolean; post_id uuid;
begin
  -- accepted: a test member's preset (empty path), and every member's own Storage file (rule unchanged)
  foreach who in array array[t, r, x] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    insert into public.community_posts (author_id, image_url, image_path) values (who, base || 'community-posts/' || who || '/ok.jpg', who || '/ok.jpg');
    reset role;
  end loop;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', t)::text, true);
  insert into public.community_posts (author_id, image_url, image_path, caption) values (t, preset, '', 'preset ok') returning id into post_id;
  insert into public.community_posts (author_id, image_url, image_path) values (t, '/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.png', '');
  update public.community_posts set caption = 'edited' where id = post_id;  -- a caption edit keeps the preset
  reset role;
  if (select caption from public.community_posts where id = post_id) <> 'edited' then raise exception 'FAIL DP1: caption edit lost'; end if;
  -- the owner (the seed) may store a test member's preset too
  insert into public.community_posts (author_id, image_url, image_path) values (t, preset, '');
  if (select count(*) from public.community_posts where author_id = t and image_path = '') <> 3 then
    raise exception 'FAIL DP1: the test member''s preset posts were not stored'; end if;

  -- refused (23514), signed in as the author
  for rec in select * from (values
    (r, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', r, preset, '')),             -- real member, preset
    (x, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', x, preset, '')),             -- tester, preset
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, 'https://tracker.example/p.jpg', '')),
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, 'https://tracker.example/p.jpg', t || '/p.jpg')),
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, preset, t || '/x.png')),  -- preset needs an empty path
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, '/assets/../../x.png', '')),
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, '//tracker.example/Images/Cover%20images/a.PNG', '')),
    (t, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, base || 'community-posts/' || r || '/p.jpg', r || '/p.jpg')),
    (r, format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', r, base || 'community-posts/' || r || '/q.jpg', r || '/p.jpg'))
  ) v(who, stmt) loop
    failed := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', rec.who)::text, true);
    begin execute rec.stmt; exception when check_violation then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL DP2: accepted %', rec.stmt; end if;
  end loop;
  -- a member's update of the image is ignored (brivia_posts_keep_immutable, 0003), as before: the post keeps its file
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', r)::text, true);
  update public.community_posts set image_url = preset, image_path = '' where author_id = r;
  reset role;
  if exists (select 1 from public.community_posts where author_id = r and (image_url = preset or image_path = '')) then
    raise exception 'FAIL DP2: a real member changed a post image to a preset'; end if;
  -- refused for the owner as well (a CHECK binds every writer; so does the trigger)
  foreach stmt in array array[
    format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', r, preset, ''),
    format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', x, preset, ''),
    format('insert into public.community_posts (author_id, image_url, image_path) values (%L, %L, %L)', t, 'https://tracker.example/p.jpg', ''),
    format('update public.community_posts set image_url = %L, image_path = %L where author_id = %L', preset, '', r)
  ] loop
    failed := false;
    begin execute stmt; exception when check_violation then failed := true; end;
    if not failed then raise exception 'FAIL DP3: the owner was allowed %', stmt; end if;
  end loop;
  -- a test member whose flag is_test is lifted can no longer store a new preset (the rule reads is_test now)
  update public.profiles set is_test = false where id = t;  -- owner session: brivia_guard_is_test allows it
  failed := false;
  begin insert into public.community_posts (author_id, image_url, image_path) values (t, preset, '');
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'FAIL DP3: a former test member could post a preset'; end if;
  update public.profiles set is_test = true where id = t;
end $$;
select 'd-post-presets.test DP0-DP3 preset posts for test members only OK';

-- Clean up (the tester list must be empty for the suites that follow).
delete from public.community_posts where author_id::text like 'd0057000-%';
delete from public.brivia_tester where member_id::text like 'd0057000-%';
delete from public.member_interest where member_id::text like 'd0057000-%';
delete from public.member_orbit where member_id::text like 'd0057000-%';
delete from public.profiles where id::text like 'd0057000-%';
delete from auth.users where id::text like 'd0057000-%';
reset brivia.harness_autocomplete;
