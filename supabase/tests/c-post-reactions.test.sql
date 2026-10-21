-- Polish wave, Task C1 (0012 section C): community_post_likes and community_post_saves.
-- P1 a completed member likes and saves a post (one row each); P2 a second like is a unique_violation (23505, the
-- client treats it as done); P3 another member sees none of a's rows; P4 an incomplete member cannot insert;
-- P5 a like on a non-existent post is refused; P6 deleting the post or the member removes the rows (cascade);
-- anon has no privilege, and nobody can update.
-- Ids: c0120000-0000-4000-8000-0000000000NN: 01 A (completed), 02 B (completed), 03 I (incomplete).
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.cp(n int) returns uuid language sql immutable as $$
  select ('c0120000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.cp(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Cpost ' || g, 'Cpost ' || g, 'cpost' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    if g <= 2 then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
      on conflict do nothing;
    end if;
  end loop;
  if not (public.brivia_member_completed(pg_temp.cp(1)) and public.brivia_member_completed(pg_temp.cp(2))) then
    raise exception 'FAIL setup: A and B are not completed'; end if;
  if public.brivia_member_completed(pg_temp.cp(3)) then raise exception 'FAIL setup: I must be incomplete'; end if;
  insert into public.community_posts (id, author_id, image_url, image_path)
  values ('c0120000-0000-4000-8000-0000000000f1', pg_temp.cp(2), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.cp(2) || '/a.jpg', pg_temp.cp(2) || '/a.jpg'),
         ('c0120000-0000-4000-8000-0000000000f2', pg_temp.cp(2), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.cp(2) || '/b.jpg', pg_temp.cp(2) || '/b.jpg');
end $$;

-- Structure: both tables, RLS on, grants exactly select/insert/delete for authenticated, none for anon.
do $$
declare t text; p text;
begin
  foreach t in array array['community_post_likes', 'community_post_saves'] loop
    if to_regclass('public.' || t) is null then raise exception 'FAIL P0: % is missing', t; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FAIL P0: RLS is off on %', t; end if;
    foreach p in array array['select', 'insert', 'delete'] loop
      if not has_table_privilege('authenticated', 'public.' || t, p) then raise exception 'FAIL P0: authenticated lacks % on %', p, t; end if;
    end loop;
    foreach p in array array['update', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) then raise exception 'FAIL P0: authenticated has % on %', p, t; end if;
    end loop;
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege('anon', 'public.' || t, p) then raise exception 'FAIL P0: anon has % on %', p, t; end if;
    end loop;
  end loop;
end $$;

-- P1, P2, P3: A likes and saves post f1; a second like collides; B sees nothing of A's.
do $$
declare a uuid := pg_temp.cp(1); b uuid := pg_temp.cp(2); dup boolean := false; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  insert into public.community_post_likes (post_id) values ('c0120000-0000-4000-8000-0000000000f1');  -- member_id defaults to auth.uid()
  insert into public.community_post_saves (post_id) values ('c0120000-0000-4000-8000-0000000000f1');
  select count(*) into n from public.community_post_likes where member_id = a;
  if n <> 1 then raise exception 'FAIL P1: expected one like, got %', n; end if;
  select count(*) into n from public.community_post_saves where member_id = a;
  if n <> 1 then raise exception 'FAIL P1: expected one save, got %', n; end if;
  begin insert into public.community_post_likes (post_id) values ('c0120000-0000-4000-8000-0000000000f1');
  exception when unique_violation then dup := true; end;
  if not dup then raise exception 'FAIL P2: a second like was accepted'; end if;
  -- a row for someone else is refused
  dup := false;
  begin insert into public.community_post_likes (post_id, member_id) values ('c0120000-0000-4000-8000-0000000000f2', b);
  exception when insufficient_privilege then dup := true; end;
  if not dup then raise exception 'FAIL P1: A inserted a like for B'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  select count(*) into n from public.community_post_likes;
  if n <> 0 then raise exception 'FAIL P3: B sees % like rows', n; end if;
  select count(*) into n from public.community_post_saves;
  if n <> 0 then raise exception 'FAIL P3: B sees % save rows', n; end if;
  delete from public.community_post_likes where member_id = a;  -- RLS hides A's row: nothing deleted
  reset role;
  if (select count(*) from public.community_post_likes where member_id = a) <> 1 then
    raise exception 'FAIL P3: B deleted A''s like'; end if;
end $$;

-- A deletes its own like and save, then can like again (delete own).
do $$
declare a uuid := pg_temp.cp(1);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  delete from public.community_post_likes where post_id = 'c0120000-0000-4000-8000-0000000000f1';
  delete from public.community_post_saves where post_id = 'c0120000-0000-4000-8000-0000000000f1';
  if exists (select 1 from public.community_post_likes) or exists (select 1 from public.community_post_saves) then
    raise exception 'FAIL P1: own delete did not remove the rows'; end if;
  insert into public.community_post_likes (post_id) values ('c0120000-0000-4000-8000-0000000000f1');
  insert into public.community_post_saves (post_id) values ('c0120000-0000-4000-8000-0000000000f1');
  reset role;
end $$;

-- P4 an incomplete member cannot insert; P5 a post that does not exist is refused; anon is refused.
do $$
declare i uuid := pg_temp.cp(3); a uuid := pg_temp.cp(1); refused boolean; t text;
begin
  foreach t in array array['community_post_likes', 'community_post_saves'] loop
    refused := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', i)::text, true);
    begin execute format('insert into public.%I (post_id) values (%L)', t, 'c0120000-0000-4000-8000-0000000000f1');
    exception when insufficient_privilege then refused := true; end;
    reset role;
    if not refused then raise exception 'FAIL P4: an incomplete member inserted into %', t; end if;

    refused := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
    begin execute format('insert into public.%I (post_id) values (%L)', t, 'c0120000-0000-4000-8000-0000000000ff');
    exception when insufficient_privilege or foreign_key_violation then refused := true; end;
    reset role;
    if not refused then raise exception 'FAIL P5: a %-row on a missing post was accepted', t; end if;

    refused := false;
    set local role anon;
    begin execute format('select 1 from public.%I', t);
    exception when insufficient_privilege then refused := true; end;
    reset role;
    if not refused then raise exception 'FAIL P0: anon could read %', t; end if;
  end loop;
end $$;

-- No update for anyone signed in (no grant).
do $$
declare a uuid := pg_temp.cp(1); refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  begin update public.community_post_likes set created_at = now();
  exception when insufficient_privilege then refused := true; end;
  reset role;
  if not refused then raise exception 'FAIL P0: update was allowed'; end if;
end $$;

-- P6 cascade: deleting the post removes its rows; deleting the member removes the rest.
do $$
declare a uuid := pg_temp.cp(1);
begin
  insert into public.community_post_likes (post_id, member_id) values ('c0120000-0000-4000-8000-0000000000f2', a);
  delete from public.community_posts where id = 'c0120000-0000-4000-8000-0000000000f1';
  if exists (select 1 from public.community_post_likes where post_id = 'c0120000-0000-4000-8000-0000000000f1')
     or exists (select 1 from public.community_post_saves where post_id = 'c0120000-0000-4000-8000-0000000000f1') then
    raise exception 'FAIL P6: rows survived the post'; end if;
  if (select count(*) from public.community_post_likes where member_id = a) <> 1 then
    raise exception 'FAIL P6: the like on the other post was lost'; end if;
  delete from public.community_posts where id = 'c0120000-0000-4000-8000-0000000000f2';
  insert into public.community_posts (id, author_id, image_url, image_path)
  values ('c0120000-0000-4000-8000-0000000000f3', pg_temp.cp(2), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.cp(2) || '/c.jpg', pg_temp.cp(2) || '/c.jpg');
  insert into public.community_post_saves (post_id, member_id) values ('c0120000-0000-4000-8000-0000000000f3', a);
  delete from public.profiles where id = a;
  if exists (select 1 from public.community_post_saves where member_id = a) or exists (select 1 from public.community_post_likes where member_id = a) then
    raise exception 'FAIL P6: rows survived the member'; end if;
end $$;
select 'c-post-reactions.test P0-P6 likes and saves OK';

delete from public.community_posts where author_id::text like 'c0120000-%';
delete from public.member_interest where member_id::text like 'c0120000-%';
delete from public.member_orbit where member_id::text like 'c0120000-%';
delete from public.profiles where id::text like 'c0120000-%';
delete from auth.users where id::text like 'c0120000-%';
reset brivia.harness_autocomplete;
