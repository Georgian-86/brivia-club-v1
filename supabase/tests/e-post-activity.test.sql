-- 0015 (D-101): comments, shares and post_activity on Explore posts.
-- Ids e0150000-0000-4000-8000-0000000000NN: 01 A, 02 B (post author), 03 C, 04 K (A blocked K), 05 I (incomplete).
-- A and B are connected (a match). Posts: f1 by B, f2 by B, f3 by K.
-- Q1 post_activity counts likes, comments and shares the caller can see, says liked_by_me, and names only the caller's
--    connections among the likers (at most 3); a blocked liker is not counted for the member who blocked them.
-- Q2 comments and threaded replies are readable by anyone who can see the post and the author; a reply must be on the
--    same post as its parent; empty bodies are refused; an incomplete member cannot comment.
-- Q3 delete: own comment, or any comment on your own post (its replies go with it); never someone else's otherwise.
-- Q4 shares: own rows only, one per member and post, counted by post_activity.
-- Q5 a post the caller cannot see returns no activity row; anon cannot call post_activity or read comments.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.ep(n int) returns uuid language sql immutable as $$
  select ('e0150000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..5 loop
    mid := pg_temp.ep(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Epost ' || g, 'Epost ' || g, 'epost' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    if g <> 5 then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
      on conflict do nothing;
    end if;
  end loop;
  if public.brivia_member_completed(pg_temp.ep(5)) then raise exception 'FAIL setup: I must be incomplete'; end if;
  insert into public.matches (user1_id, user2_id) values (pg_temp.ep(1), pg_temp.ep(2)) on conflict do nothing;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.ep(1), pg_temp.ep(4)) on conflict do nothing;
  insert into public.community_posts (id, author_id, image_url, image_path)
  select v.id, v.au, 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || v.au || '/x.jpg', v.au || '/x.jpg'
    from (values ('e0150000-0000-4000-8000-0000000000f1'::uuid, pg_temp.ep(2)),
                 ('e0150000-0000-4000-8000-0000000000f2'::uuid, pg_temp.ep(2)),
                 ('e0150000-0000-4000-8000-0000000000f3'::uuid, pg_temp.ep(4))) v(id, au);
end $$;

-- Structure and grants.
do $$
declare p text;
begin
  foreach p in array array['select', 'insert', 'delete'] loop
    if not has_table_privilege('authenticated', 'public.community_post_comments', p) then raise exception 'FAIL: comments lack %', p; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.community_post_comments', 'update') then raise exception 'FAIL: comments can be updated'; end if;
  if has_table_privilege('authenticated', 'public.community_post_shares', 'delete') or has_table_privilege('authenticated', 'public.community_post_shares', 'update') then
    raise exception 'FAIL: shares can be changed'; end if;
  foreach p in array array['select', 'insert', 'update', 'delete'] loop
    if has_table_privilege('anon', 'public.community_post_comments', p) or has_table_privilege('anon', 'public.community_post_shares', p) then
      raise exception 'FAIL: anon has % on comments or shares', p; end if;
  end loop;
  if has_function_privilege('anon', 'public.post_activity(uuid[])', 'execute') then raise exception 'FAIL Q5: anon may call post_activity'; end if;
  if not has_function_privilege('authenticated', 'public.post_activity(uuid[])', 'execute') then raise exception 'FAIL: authenticated cannot call post_activity'; end if;
end $$;

-- Q1 likes (as each liker), then the activity as B, C and A.
do $$
declare f1 uuid := 'e0150000-0000-4000-8000-0000000000f1'; r record; m int;
begin
  foreach m in array array[1, 3, 4] loop
    set local role authenticated; perform pg_temp.as_member(pg_temp.ep(m));
    insert into public.community_post_likes (post_id) values (f1);
    reset role;
  end loop;

  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(2));
  select * into r from public.post_activity(array[f1]);
  reset role;
  if r.like_count <> 3 then raise exception 'FAIL Q1: B sees % likes, want 3', r.like_count; end if;
  if r.liked_by_me then raise exception 'FAIL Q1: B did not like f1'; end if;
  if r.connection_likers <> array[pg_temp.ep(1)] then raise exception 'FAIL Q1: B''s named likers are %, want only A', r.connection_likers; end if;

  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(3));
  select * into r from public.post_activity(array[f1]);
  reset role;
  if r.like_count <> 3 or not r.liked_by_me then raise exception 'FAIL Q1: C sees % likes / liked %', r.like_count, r.liked_by_me; end if;
  if cardinality(r.connection_likers) <> 0 then raise exception 'FAIL Q1: C (no connections) sees named likers %', r.connection_likers; end if;

  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(1));
  select * into r from public.post_activity(array[f1]);
  reset role;
  if r.like_count <> 2 then raise exception 'FAIL Q1: A sees % likes, want 2 (K, whom A blocked, is not counted)', r.like_count; end if;
end $$;
select 'e-post-activity.test Q1 likes OK';

-- Q2 comments and replies.
do $$
declare f1 uuid := 'e0150000-0000-4000-8000-0000000000f1'; f2 uuid := 'e0150000-0000-4000-8000-0000000000f2';
  ca uuid; cb uuid; ck uuid; refused boolean; n int; r record;
begin
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(1));
  insert into public.community_post_comments (post_id, body) values (f1, '  Lovely shot  ') returning id into ca;
  reset role;
  if (select body from public.community_post_comments where id = ca) <> 'Lovely shot' then raise exception 'FAIL Q2: body not trimmed'; end if;

  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(2));
  insert into public.community_post_comments (post_id, parent_id, body) values (f1, ca, 'Thank you!') returning id into cb;
  -- a reply that names a comment on another post is refused
  refused := false;
  begin insert into public.community_post_comments (post_id, parent_id, body) values (f2, ca, 'wrong post');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'FAIL Q2: a reply on another post was accepted'; end if;
  -- an empty body is refused
  refused := false;
  begin insert into public.community_post_comments (post_id, body) values (f1, '   ');
  exception when check_violation then refused := true; end;
  if not refused then raise exception 'FAIL Q2: an empty comment was accepted'; end if;
  -- writing as someone else is refused
  refused := false;
  begin insert into public.community_post_comments (post_id, author_id, body) values (f1, pg_temp.ep(3), 'as C');
  exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'FAIL Q2: B commented as C'; end if;
  reset role;

  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(4));
  insert into public.community_post_comments (post_id, body) values (f1, 'K says hi') returning id into ck;
  reset role;

  -- C reads all three, with the thread link; A (who blocked K) reads two.
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(3));
  select count(*) into n from public.community_post_comments where post_id = f1;
  if n <> 3 then raise exception 'FAIL Q2: C reads % comments, want 3', n; end if;
  if (select parent_id from public.community_post_comments where id = cb) is distinct from ca then raise exception 'FAIL Q2: the reply lost its parent'; end if;
  select * into r from public.post_activity(array[f1]);
  if r.comment_count <> 3 then raise exception 'FAIL Q2: C counts % comments', r.comment_count; end if;
  reset role;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(1));
  select count(*) into n from public.community_post_comments where post_id = f1;
  if n <> 2 then raise exception 'FAIL Q2: A reads % comments, want 2 (not K''s)', n; end if;
  select * into r from public.post_activity(array[f1]);
  if r.comment_count <> 2 then raise exception 'FAIL Q2: A counts % comments', r.comment_count; end if;
  reset role;

  -- an incomplete member cannot comment
  refused := false;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(5));
  begin insert into public.community_post_comments (post_id, body) values (f1, 'me too');
  exception when insufficient_privilege then refused := true; end;
  reset role;
  if not refused then raise exception 'FAIL Q2: an incomplete member commented'; end if;

  -- Q3: C cannot delete A's comment; A can delete only its own; B (the post's author) removes K's comment.
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(3));
  delete from public.community_post_comments where id = ca;
  reset role;
  if not exists (select 1 from public.community_post_comments where id = ca) then raise exception 'FAIL Q3: C deleted A''s comment'; end if;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(2));
  delete from public.community_post_comments where id = ck;
  reset role;
  if exists (select 1 from public.community_post_comments where id = ck) then raise exception 'FAIL Q3: the post author could not remove a comment'; end if;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(1));
  delete from public.community_post_comments where id = ca;
  reset role;
  if exists (select 1 from public.community_post_comments where id in (ca, cb)) then raise exception 'FAIL Q3: the comment or its reply survived'; end if;
end $$;
select 'e-post-activity.test Q2-Q3 comments OK';

-- Q4 shares; Q5 an invisible post, and anon.
do $$
declare f1 uuid := 'e0150000-0000-4000-8000-0000000000f1'; f3 uuid := 'e0150000-0000-4000-8000-0000000000f3';
  r record; dup boolean := false; n int; refused boolean := false;
begin
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(3));
  insert into public.community_post_shares (post_id) values (f1);
  begin insert into public.community_post_shares (post_id) values (f1); exception when unique_violation then dup := true; end;
  reset role;
  if not dup then raise exception 'FAIL Q4: a second share row was accepted'; end if;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(2));
  select count(*) into n from public.community_post_shares;
  if n <> 0 then raise exception 'FAIL Q4: B reads C''s share rows'; end if;
  select * into r from public.post_activity(array[f1]);
  if r.share_count <> 1 then raise exception 'FAIL Q4: share_count %', r.share_count; end if;
  reset role;

  -- K's post: A blocked K, so A gets no row for it; B does.
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(1));
  select count(*) into n from public.post_activity(array[f1, f3]);
  reset role;
  if n <> 1 then raise exception 'FAIL Q5: A got % activity rows, want 1 (not K''s post)', n; end if;
  set local role authenticated; perform pg_temp.as_member(pg_temp.ep(5));
  select count(*) into n from public.post_activity(array[f1]);
  reset role;
  if n <> 0 then raise exception 'FAIL Q5: an incomplete member read activity'; end if;
  set local role anon;
  begin perform 1 from public.community_post_comments; exception when insufficient_privilege then refused := true; end;
  reset role;
  if not refused then raise exception 'FAIL Q5: anon read comments'; end if;
end $$;
select 'e-post-activity.test Q4-Q5 shares and visibility OK';

delete from public.brivia_blocks where blocker_id::text like 'e0150000-%' or blocked_id::text like 'e0150000-%';
delete from public.matches where user1_id::text like 'e0150000-%' or user2_id::text like 'e0150000-%';
delete from public.community_posts where author_id::text like 'e0150000-%';
delete from public.member_interest where member_id::text like 'e0150000-%';
delete from public.member_orbit where member_id::text like 'e0150000-%';
delete from public.profiles where id::text like 'e0150000-%';
delete from auth.users where id::text like 'e0150000-%';
reset brivia.harness_autocomplete;
