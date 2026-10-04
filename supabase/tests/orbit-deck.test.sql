-- Iteration 3, Task 7: deck_candidates, the interim location-first deck, and deck_status (P0-4; spec §7, §9.1.5).
-- Order: true ring asc, then shared-interest count desc, then md5(viewer || target). Rings 0-2 only. Cards carry a
-- k-anonymous distance band and at most two "You both" labels; sensitive (D-029) and non-active interests (including
-- the retired harness fixture zz.harness.any) are never shown and never counted, for display or for ordering.
-- Members are made completed directly as the owner (the harness autocomplete is off).
-- Ids: d7e7e7e7-e7e7-4e7e-a7e7-e7e7e7e7e7NN (no 10-digit run, so the phone-shaped contract regex can apply to ids).
--   01 V viewer (C0, Kochi)   02 A ring 0, 2 shared   03 B ring 0, 1 shared   04 Z ring 0, 0 shared
--   05 S ring 0, only sensitive shared   06 R1 ring 1, 1 shared   07 R2 ring 2, 3 shared   08 R3 ring 3, 3 shared
--   09 BL blocked by V   10 BB blocks V   11 W test world   12 I incomplete   13 M matched   14 P passed
--   15 G signalled   16-19 fillers ring 0, 0 shared   20 H ring 0, only the harness fixture shared
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.d7(n int) returns uuid language sql immutable as $$
  select ('d7e7e7e7-e7e7-4e7e-a7e7-e7e7e7e7e7' || lpad(n::text, 2, '0'))::uuid $$;

-- Cells: C0 at the Kochi centroid; ring 1 about 8 km north, ring 2 about 30 km north, ring 3 about 100 km north.
create temp table deck_cells as
select public.brivia_grid_cell(9.9312, 76.2673, 7) as c0,
       public.brivia_grid_cell(9.9312 + 0.072, 76.2673, 7) as c1,
       public.brivia_grid_cell(9.9312 + 0.27, 76.2673, 7) as c2,
       public.brivia_grid_cell(9.9312 + 0.90, 76.2673, 7) as c3;

-- No other suite may leave a density row behind (the refresh watermark is global).
delete from public.cell_density;

do $$
declare c record; g int; mid uuid; cell text; interests jsonb; it record;
begin
  select * into c from deck_cells;
  if public.brivia_ring(public.brivia_cell_km(c.c0, c.c1)) <> 1 or public.brivia_ring(public.brivia_cell_km(c.c0, c.c2)) <> 2
     or public.brivia_ring(public.brivia_cell_km(c.c0, c.c3)) <> 3 then
    raise exception 'FAIL setup: ring offsets are not 1/2/3';
  end if;
  for g in 1..20 loop
    mid := pg_temp.d7(g);
    cell := case g when 6 then c.c1 when 7 then c.c2 when 8 then c.c3 else c.c0 end;
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Deck ' || g, 'Deck ' || g, 'deck' || g || '@example.com', g = 11, 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set created_at = now() - interval '15 days' where profiles.id = mid;   -- owner update
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5),
            public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    interests := case g
      when 1  then '{"sports.racket.badminton":8,"sports.racket.tennis":5,"sports.team.cricket":4,"wellbeing.health.sleep":1,"wellbeing.health.nutrition":1,"zz.harness.any":1}'
      when 2  then '{"sports.racket.badminton":10,"sports.racket.tennis":10}'
      when 3  then '{"sports.racket.tennis":20}'
      when 5  then '{"wellbeing.health.sleep":5,"wellbeing.health.nutrition":5,"sports.endurance.running":10}'
      when 6  then '{"sports.team.cricket":20}'
      when 7  then '{"sports.racket.badminton":7,"sports.racket.tennis":7,"sports.team.cricket":6}'
      when 8  then '{"sports.racket.badminton":7,"sports.racket.tennis":7,"sports.team.cricket":6}'
      when 9  then '{"sports.racket.badminton":20}'
      when 10 then '{"sports.racket.badminton":20}'
      when 11 then '{"sports.racket.badminton":20}'
      when 12 then '{"sports.racket.badminton":10}'
      when 13 then '{"sports.racket.badminton":20}'
      when 20 then '{"zz.harness.any":10,"sports.endurance.running":10}'
      else '{"sports.endurance.running":20}' end::jsonb;
    for it in select key, value::int as pts from jsonb_each_text(interests) loop
      insert into public.member_interest (member_id, interest_id, points) values (mid, it.key, it.pts) on conflict do nothing;
    end loop;
  end loop;
  if (select count(*) from generate_series(1, 20) s(i) where public.brivia_member_completed(pg_temp.d7(s.i))) <> 19
     or public.brivia_member_completed(pg_temp.d7(12)) then
    raise exception 'FAIL setup: expected 19 completed deck members (all but I)';
  end if;
  if not (select sensitive from public.interest_node where id = 'wellbeing.health.sleep')
     or not (select sensitive from public.interest_node where id = 'wellbeing.health.nutrition')
     or exists (select 1 from public.interest_node where id in ('sports.racket.badminton', 'sports.racket.tennis',
                'sports.team.cricket', 'sports.endurance.running') and (sensitive or status <> 'active')) then
    raise exception 'FAIL setup: interest fixture flags';
  end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.d7(1), pg_temp.d7(9)) on conflict do nothing;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.d7(10), pg_temp.d7(1)) on conflict do nothing;
  perform public.brivia_create_match(pg_temp.d7(1), pg_temp.d7(13));
end $$;

-- 1. Shape and privileges.
do $$
declare f text;
begin
  foreach f in array array['public.deck_candidates(integer)', 'public.deck_status()'] loop
    if to_regprocedure(f) is null then raise exception 'FAIL: % missing', f; end if;
    if not (select prosecdef and proconfig @> array['search_path=public'] and provolatile = 's'
              from pg_proc where oid = to_regprocedure(f)) then
      raise exception 'FAIL: % must be stable, security definer, search_path=public', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
    if has_function_privilege('public', f, 'execute') then raise exception 'FAIL: public can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL: authenticated cannot execute %', f; end if;
  end loop;
end $$;

-- anon is denied both RPCs.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array['select * from public.deck_candidates(20)', 'select public.deck_status()'] loop
    failed := false;
    set local role anon;
    begin execute stmt; exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL: anon may run %', stmt; end if;
  end loop;
end $$;

-- Helper: the viewer's deck as an ordered id list.
create or replace function pg_temp.deck_ids(p_viewer uuid, p_limit int default 20) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(d.id order by d.ord), '{}') into r
    from public.deck_candidates(p_limit) with ordinality as d(id, name, photo_url, cover_url, experience, skills,
                                                              looking_for, distance_band, shared_interests, ord);
  reset role;
  return r;
end $$;

create or replace function pg_temp.card(p_viewer uuid, p_target uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select to_jsonb(d) into r from public.deck_candidates(20) d where d.id = p_target;
  reset role;
  return r;
end $$;

create or replace function pg_temp.pos(a uuid[], x uuid) returns int language sql immutable as $$
  select array_position(a, x) $$;

-- 2. Pool and exclusions; the P (passed) and G (signalled) members are still in the deck at this point.
do $$
declare d uuid[]; g int;
begin
  d := pg_temp.deck_ids(pg_temp.d7(1));
  -- present: A, B, Z, S, R1, R2, P, G, fillers, H
  foreach g in array array[2, 3, 4, 5, 6, 7, 14, 15, 16, 17, 18, 19, 20] loop
    if pg_temp.pos(d, pg_temp.d7(g)) is null then raise exception 'FAIL: member % missing from the deck', g; end if;
  end loop;
  -- absent: self, ring 3, blocked (both directions), test world, incomplete, matched
  foreach g in array array[1, 8, 9, 10, 11, 12, 13] loop
    if pg_temp.pos(d, pg_temp.d7(g)) is not null then raise exception 'FAIL: member % is in the deck', g; end if;
  end loop;
  if cardinality(d) <> 13 then raise exception 'FAIL: deck size % <> 13', cardinality(d); end if;
end $$;

-- 3. Ordering (P0-4): ring 0 before ring 1 before ring 2 whatever the shared count; within ring 0, 2 shared before
-- 1 shared before 0 shared. S (two shared sensitive interests) and H (shared fixture interest) count 0.
do $$
declare d uuid[]; g int; v uuid := pg_temp.d7(1);
begin
  d := pg_temp.deck_ids(v);
  if not (pg_temp.pos(d, pg_temp.d7(4)) < pg_temp.pos(d, pg_temp.d7(7))) then
    raise exception 'FAIL P0-4: ring-0 with 0 shared is not before ring-2 with 3 shared'; end if;
  if pg_temp.pos(d, pg_temp.d7(2)) <> 1 or pg_temp.pos(d, pg_temp.d7(3)) <> 2 then
    raise exception 'FAIL P0-4: ring 0 with 2 shared, then 1 shared, must lead: %', d; end if;
  -- S, H and every other ring-0 zero-shared member come after B: sensitive / fixture interests do not order.
  foreach g in array array[4, 5, 14, 15, 16, 17, 18, 19, 20] loop
    if pg_temp.pos(d, pg_temp.d7(g)) <= 2 or pg_temp.pos(d, pg_temp.d7(g)) > 11 then
      raise exception 'FAIL: ring-0 zero-shared member % at position %', g, pg_temp.pos(d, pg_temp.d7(g)); end if;
  end loop;
  if pg_temp.pos(d, pg_temp.d7(6)) <> 12 or pg_temp.pos(d, pg_temp.d7(7)) <> 13 then
    raise exception 'FAIL: ring 1 then ring 2 must close the deck: %', d; end if;
  -- the zero-shared ring-0 tail is ordered by md5(viewer || target)
  if (select array_agg(x order by o) from unnest(d[3:11]) with ordinality u(x, o))
     <> (select array_agg(x order by md5(v::text || x::text)) from unnest(d[3:11]) u(x)) then
    raise exception 'FAIL: tie-break is not md5(viewer || target)'; end if;
  -- deterministic
  if d <> pg_temp.deck_ids(v) then raise exception 'FAIL: deck order is not deterministic'; end if;
end $$;

-- 4. p_limit: default 12, clamped to [1, 20].
do $$
declare v uuid := pg_temp.d7(1); n int; full_deck uuid[];
begin
  full_deck := pg_temp.deck_ids(v, 20);
  if cardinality(pg_temp.deck_ids(v, 0)) <> 1 or cardinality(pg_temp.deck_ids(v, -5)) <> 1 then raise exception 'FAIL: p_limit < 1 not clamped to 1'; end if;
  if cardinality(pg_temp.deck_ids(v, 3)) <> 3 or pg_temp.deck_ids(v, 3) <> full_deck[1:3] then raise exception 'FAIL: p_limit 3'; end if;
  if cardinality(pg_temp.deck_ids(v, null)) <> 12 then raise exception 'FAIL: p_limit null is not 12'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into n from public.deck_candidates();
  reset role;
  if n <> 12 then raise exception 'FAIL: default p_limit % <> 12', n; end if;
  -- above 20 is clamped (40 fillers would be needed to observe 20; the call must at least not fail or exceed 20)
  if cardinality(pg_temp.deck_ids(v, 1000)) <> 13 then raise exception 'FAIL: p_limit 1000'; end if;
end $$;

-- 5. "You both" labels: at most 2, by summed points desc then label asc; never a sensitive or fixture interest.
do $$
declare v uuid := pg_temp.d7(1); j jsonb;
begin
  j := pg_temp.card(v, pg_temp.d7(2));
  if j->'shared_interests' <> '["Badminton", "Tennis"]'::jsonb then raise exception 'FAIL: A labels %', j->'shared_interests'; end if;
  j := pg_temp.card(v, pg_temp.d7(3));
  if j->'shared_interests' <> '["Tennis"]'::jsonb then raise exception 'FAIL: B labels %', j->'shared_interests'; end if;
  -- R2 shares three: badminton 8+7 = 15, tennis 5+7 = 12, cricket 4+6 = 10 -> the top two
  j := pg_temp.card(v, pg_temp.d7(7));
  if j->'shared_interests' <> '["Badminton", "Tennis"]'::jsonb then raise exception 'FAIL: R2 labels %', j->'shared_interests'; end if;
  -- the only shared interests are sensitive: no label at all
  j := pg_temp.card(v, pg_temp.d7(5));
  if j->'shared_interests' <> '[]'::jsonb then raise exception 'FAIL: S (sensitive only) labels %', j->'shared_interests'; end if;
  -- the only shared interest is the retired harness fixture: no label
  j := pg_temp.card(v, pg_temp.d7(20));
  if j->'shared_interests' <> '[]'::jsonb then raise exception 'FAIL: H (fixture only) labels %', j->'shared_interests'; end if;
  j := pg_temp.card(v, pg_temp.d7(4));
  if j->'shared_interests' <> '[]'::jsonb then raise exception 'FAIL: Z labels %', j->'shared_interests'; end if;
  -- no card anywhere names a sensitive or retired interest
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  if exists (select 1 from public.deck_candidates(20) d, unnest(d.shared_interests) s
              join public.interest_node n on n.label = s where n.sensitive or n.status <> 'active') then
    reset role; raise exception 'FAIL: a sensitive or retired label is on a card';
  end if;
  reset role;
end $$;

-- 6. Contract (spec §9.1.5 style): exactly the nine keys; no cell, km, coordinate, email, phone or city/state key.
do $$
declare v uuid := pg_temp.d7(1); keys text[]; t text; n int := 0;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select array_agg(distinct k order by k) into keys from public.deck_candidates(20) d, jsonb_object_keys(to_jsonb(d)) k;
  if keys <> array['cover_url', 'distance_band', 'experience', 'id', 'looking_for', 'name', 'photo_url',
                   'shared_interests', 'skills'] then
    reset role; raise exception 'FAIL contract: keys %', keys;
  end if;
  for t in select to_jsonb(d)::text from public.deck_candidates(20) d loop
    n := n + 1;
    if t ~ '8[0-9a-f]{14}' or t ~ 'g[5-7]:\d+:\d+' or t ~ '-?\d{1,3}\.\d{3,}' or t ~ '@' or t ~ '\d{10}'
       or t ~* '"(city|state|cell|km|lat|lng|ring|email|phone|is_test)"\s*:' then
      reset role; raise exception 'FAIL contract: forbidden value or key in %', t;
    end if;
  end loop;
  reset role;
  if n <> 13 then raise exception 'FAIL contract: % rows checked', n; end if;
end $$;

-- 7. k-anonymity. No density row yet: every band is coarsened to the place (display ring >= 2), never "~3 km".
do $$
declare v uuid := pg_temp.d7(1); j jsonb;
begin
  j := pg_temp.card(v, pg_temp.d7(2));
  if j->>'distance_band' <> 'Kochi' then raise exception 'FAIL k-anon: ring-0 band without density = %', j->>'distance_band'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  if exists (select 1 from public.deck_candidates(20) d where d.distance_band in ('~3 km', '~10 km')) then
    reset role; raise exception 'FAIL k-anon: a km band without density';
  end if;
  reset role;
end $$;

-- Six refreshes: still coarsened. The seventh (15 aged completed members in C0 >= 10): "~3 km".
do $$
declare v uuid := pg_temp.d7(1); i int; c record;
begin
  select * into c from deck_cells;
  for i in 0..5 loop
    perform public.refresh_cell_density(current_date + i);
    if pg_temp.card(v, pg_temp.d7(2))->>'distance_band' <> 'Kochi' then raise exception 'FAIL k-anon: band after % refreshes', i + 1; end if;
  end loop;
  perform public.refresh_cell_density(current_date + 6);
  if not public.brivia_cell_ok(c.c0, false, 10) then raise exception 'FAIL setup: C0 not ok10 after 7 refreshes'; end if;
  if pg_temp.card(v, pg_temp.d7(2))->>'distance_band' <> '~3 km' then
    raise exception 'FAIL k-anon: ring-0 band after 7 refreshes = %', pg_temp.card(v, pg_temp.d7(2))->>'distance_band'; end if;
  if pg_temp.card(v, pg_temp.d7(4))->>'distance_band' <> '~3 km' then raise exception 'FAIL k-anon: Z band'; end if;
  -- R1 is alone in its g7 cell (k = 10 not met): coarsened, never "~10 km"
  if pg_temp.card(v, pg_temp.d7(6))->>'distance_band' <> 'Kochi' then
    raise exception 'FAIL k-anon: lone ring-1 band = %', pg_temp.card(v, pg_temp.d7(6))->>'distance_band'; end if;
  -- R2 (ring 2): the place name
  if pg_temp.card(v, pg_temp.d7(7))->>'distance_band' <> 'Kochi' then
    raise exception 'FAIL: ring-2 band = %', pg_temp.card(v, pg_temp.d7(7))->>'distance_band'; end if;
end $$;

-- Level fallbacks, forced on the density table as the owner.
do $$
declare v uuid := pg_temp.d7(1); c record;
begin
  select * into c from deck_cells;
  -- R1's g7 cell ok for k = 10: "~10 km"
  insert into public.cell_density (cell, is_test, n, streak10, streak5, ok10, ok5, as_of)
  values (c.c1, false, 10, 7, 7, true, true, current_date + 6)
  on conflict (cell, is_test) do update set ok10 = true, ok5 = true;
  if pg_temp.card(v, pg_temp.d7(6))->>'distance_band' <> '~10 km' then
    raise exception 'FAIL: ring-1 band at g7 = %', pg_temp.card(v, pg_temp.d7(6))->>'distance_band'; end if;
  -- ok for k = 5 only is not enough for ring 1 (k = 10)
  update public.cell_density set ok10 = false where cell = c.c1 and not is_test;
  if pg_temp.card(v, pg_temp.d7(6))->>'distance_band' = '~10 km' then raise exception 'FAIL: ring 1 shown at k = 5'; end if;
  -- C0 not ok at g7 but its g6 parent ok: display ring = greatest(2, ...) -> the place name, never "~3 km"
  update public.cell_density set ok10 = false where cell = c.c0 and not is_test;
  if not public.brivia_cell_ok(public.brivia_grid_parent(c.c0, 6), false, 10) then raise exception 'FAIL setup: g6 of C0 not ok10'; end if;
  if pg_temp.card(v, pg_temp.d7(2))->>'distance_band' <> 'Kochi' then
    raise exception 'FAIL: ring-0 band at g6 = %', pg_temp.card(v, pg_temp.d7(2))->>'distance_band'; end if;
  update public.cell_density set ok10 = true where cell = c.c0 and not is_test;
  -- the target's place is in another country: "Abroad"
  update public.member_orbit set place_id = 'lk-colombo' where member_id = pg_temp.d7(3);
  if pg_temp.card(v, pg_temp.d7(3))->>'distance_band' <> 'Abroad' then
    raise exception 'FAIL: other-country band = %', pg_temp.card(v, pg_temp.d7(3))->>'distance_band'; end if;
  update public.member_orbit set place_id = 'in-kochi' where member_id = pg_temp.d7(3);
  if pg_temp.card(v, pg_temp.d7(3))->>'distance_band' <> '~3 km' then raise exception 'FAIL: B band restored'; end if;
end $$;

-- 8. Seen memory: a pass hides for 7 days; a signal hides for 30 days.
do $$
declare v uuid := pg_temp.d7(1); p uuid := pg_temp.d7(14); g uuid := pg_temp.d7(15); s record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  insert into public.interaction (viewer_id, target_id, event) values (v, p, 'pass');
  select * into s from public.send_signal(g);
  reset role;
  if s.status <> 'sent' then raise exception 'FAIL setup: signal status %', s.status; end if;
  if pg_temp.pos(pg_temp.deck_ids(v), p) is not null then raise exception 'FAIL: passed member shown'; end if;
  if pg_temp.pos(pg_temp.deck_ids(v), g) is not null then raise exception 'FAIL: signalled member shown'; end if;
  -- 6 days later: still hidden; 8 days later: back
  update public.interaction set created_at = now() - interval '6 days' where viewer_id = v and target_id = p;
  if pg_temp.pos(pg_temp.deck_ids(v), p) is not null then raise exception 'FAIL: pass 6 days old shown'; end if;
  update public.interaction set created_at = now() - interval '8 days' where viewer_id = v and target_id = p;
  if pg_temp.pos(pg_temp.deck_ids(v), p) is null then raise exception 'FAIL: pass 8 days old still hidden'; end if;
  -- the passed member's own deck is unaffected (the pass is the viewer's memory only)
  if pg_temp.pos(pg_temp.deck_ids(p), v) is null then raise exception 'FAIL: a pass hides the viewer from the target'; end if;
  -- a signal 29 days old still hides; 31 days old (and the request expired) shows again
  update public.signal_ledger set at = now() - interval '29 days' where sender_id = v and to_id = g;
  update public.connection_requests set created_at = now() - interval '29 days' where from_id = v and to_id = g;
  if pg_temp.pos(pg_temp.deck_ids(v), g) is not null then raise exception 'FAIL: signal 29 days old shown'; end if;
  update public.signal_ledger set at = now() - interval '31 days' where sender_id = v and to_id = g;
  update public.connection_requests set created_at = now() - interval '31 days' where from_id = v and to_id = g;
  if pg_temp.pos(pg_temp.deck_ids(v), g) is null then raise exception 'FAIL: signal 31 days old still hidden'; end if;
  -- a live request without a ledger row (sent before the ledger existed) also hides
  delete from public.signal_ledger where sender_id = v and to_id = g;
  update public.connection_requests set created_at = now() - interval '1 day' where from_id = v and to_id = g;
  if pg_temp.pos(pg_temp.deck_ids(v), g) is not null then raise exception 'FAIL: live legacy request shown'; end if;
  -- the recipient of the signal still sees the sender (so they can like back)
  if pg_temp.pos(pg_temp.deck_ids(g), v) is null then raise exception 'FAIL: the signal recipient does not see the sender'; end if;
end $$;

-- 9. Callers: not completed -> nothing; deck_status's three outcomes.
do $$
declare st text; n int;
begin
  if cardinality(pg_temp.deck_ids(pg_temp.d7(12))) <> 0 then raise exception 'FAIL: an incomplete caller gets cards'; end if;
  -- the test-world member W is alone in its world
  if exists (select 1 from public.profiles where is_test and id <> pg_temp.d7(11) and public.brivia_member_completed(id)) then
    raise exception 'FAIL setup: another completed test-world member exists';
  end if;
  if cardinality(pg_temp.deck_ids(pg_temp.d7(11))) <> 0 then raise exception 'FAIL: W gets cards from the other world'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.d7(12))::text, true);
  st := public.deck_status();
  if st <> 'complete_profile' then reset role; raise exception 'FAIL: incomplete deck_status %', st; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.d7(11))::text, true);
  st := public.deck_status();
  if st <> 'no_members_yet' then reset role; raise exception 'FAIL: lone test-world deck_status %', st; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.d7(1))::text, true);
  st := public.deck_status();
  if st <> 'caught_up' then reset role; raise exception 'FAIL: viewer deck_status %', st; end if;
  -- no session
  perform set_config('request.jwt.claims', '', true);
  st := public.deck_status();
  select count(*) into n from public.deck_candidates(20);
  reset role;
  if st <> 'complete_profile' or n <> 0 then raise exception 'FAIL: no-session deck_status % / % cards', st, n; end if;
end $$;

-- A blocked pair is not a visible member for deck_status: a second test-world member who blocks W.
do $$
declare st text; x uuid := pg_temp.d7(21);
begin
  insert into auth.users(id) values (x) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email, is_test) values (x, 'Deck 21', 'Deck 21', 'deck21@example.com', true)
  on conflict (id) do nothing;
  insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
  select x, home_cell, home_cell_g6, home_cell_g5, place_id from public.member_orbit where member_id = pg_temp.d7(11)
  on conflict (member_id) do nothing;
  insert into public.member_interest (member_id, interest_id, points) values (x, 'sports.racket.badminton', 20) on conflict do nothing;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (x, pg_temp.d7(11)) on conflict do nothing;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.d7(11))::text, true);
  st := public.deck_status();
  reset role;
  if st <> 'no_members_yet' then raise exception 'FAIL: deck_status counts a blocked member: %', st; end if;
  delete from public.brivia_blocks where blocker_id = x;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.d7(11))::text, true);
  st := public.deck_status();
  reset role;
  if st <> 'caught_up' then raise exception 'FAIL: deck_status with a visible member: %', st; end if;
end $$;

-- Clean up (later suites compute expected decks from every profile; the density watermark is global).
delete from public.cell_density;
delete from public.signal_ledger where sender_id::text like 'd7e7e7e7-%' or to_id::text like 'd7e7e7e7-%';
delete from public.profiles where id::text like 'd7e7e7e7-%';
delete from auth.users where id::text like 'd7e7e7e7-%';

select 'orbit-deck.test.sql OK' as result;
