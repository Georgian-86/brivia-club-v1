-- Iteration-3 arena P0-A1, A2, A3 (D-038, R1; spec §7, §9.1.5, §9.1.6): the interim deck's membership and order.
-- Membership depends only on what the card shows and on the viewer's own state:
--   * a FINE target (viewer and target precision 'cell', target g7 cell ok10) is admitted at <= 15 km on g7 and banded
--     "~3 km" / "~10 km";
--   * every other target is admitted by the place rule: the two place centroids within 60 km; band = place name;
--   * nobody is admitted on the true g7 ring 2.
-- Order: (1) at least one shared non-sensitive active interest first, (2) display ring, (3) budget-bounded overlap
-- sum(min(p_viewer, p_target)) / 20 desc, (4) brivia_deck_tie(viewer, target, current_date).
-- Impressions (C-4): deck_candidates and search_members are volatile and log owner-only 'impression' rows.
-- Served ids: a member's like/pass for a target not served in the last 7 days is silently ignored.
-- Ids: e8e8e8e8-e8e8-4e8e-a8e8-e8e8e8e8e8NN.
--   01 V viewer (Kolkata C0)   02 D deep (squash 10+10)   03 B broad (padel 1+1, pickleball 1+1)
--   04 S1 ring 1, kabaddi (8 vs 20)   05 N0 ring 0, nothing shared   06-10 T1..T5 ring 0, nothing shared
--   12 FV viewer on the Navi Mumbai side of the Navi Mumbai / Pune boundary   13 FT ~12 km away on the Pune side
--   14 F2 ~27 km away on the Pune side (true ring 2)
--   15 K kabaddi (8 vs 20: overlap 0.4)   16 Q squash 6 (overlap 0.3): with D (0.5) all in the 'mid' overlap level
-- Fix round 1 (M-2): the overlap key is bucketed into 4 levels (0; low <= 0.25; mid <= 0.5; high), so within one level
-- the daily tie key orders. (I-2): one impression per (viewer, target, surface, UTC day); purge after 30 days.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.e8(n int) returns uuid language sql immutable as $$
  select ('e8e8e8e8-e8e8-4e8e-a8e8-e8e8e8e8e8' || lpad(n::text, 2, '0'))::uuid $$;

create temp table ord_cells as
select public.brivia_grid_cell(22.5726, 88.3639, 7) as c0,
       public.brivia_grid_cell(22.5726 + 0.072, 88.3639, 7) as c1,
       -- the Navi Mumbai -> Pune line: t = 0.44 is nearest Navi Mumbai, 0.56 and 0.70 nearest Pune
       public.brivia_grid_cell(19.0330 + (18.5204 - 19.0330) * 0.44, 73.0297 + (73.8567 - 73.0297) * 0.44, 7) as fv,
       public.brivia_grid_cell(19.0330 + (18.5204 - 19.0330) * 0.56, 73.0297 + (73.8567 - 73.0297) * 0.56, 7) as ft,
       public.brivia_grid_cell(19.0330 + (18.5204 - 19.0330) * 0.70, 73.0297 + (73.8567 - 73.0297) * 0.70, 7) as f2;

delete from public.cell_density;

do $$
declare c record; g int; mid uuid; cell text; interests jsonb; it record;
begin
  select * into c from ord_cells;
  if public.brivia_ring(public.brivia_cell_km(c.c0, c.c1)) <> 1 then raise exception 'FAIL setup: c1 is not ring 1'; end if;
  if public.brivia_nearest_place(c.fv) <> 'in-navi-mumbai' or public.brivia_nearest_place(c.ft) <> 'in-pune'
     or public.brivia_nearest_place(c.f2) <> 'in-pune' then raise exception 'FAIL setup: boundary places'; end if;
  if public.brivia_ring(public.brivia_cell_km(c.fv, c.ft)) <> 1 or public.brivia_ring(public.brivia_cell_km(c.fv, c.f2)) <> 2 then
    raise exception 'FAIL setup: boundary rings % / %', public.brivia_cell_km(c.fv, c.ft), public.brivia_cell_km(c.fv, c.f2);
  end if;
  if (select public.brivia_haversine_km(a.lat, a.lng, b.lat, b.lng) from public.place a, public.place b
       where a.id = 'in-navi-mumbai' and b.id = 'in-pune') <= 60 then
    raise exception 'FAIL setup: Navi Mumbai and Pune are within 60 km';
  end if;
  for g in 1..16 loop
    continue when g = 11;
    mid := pg_temp.e8(g);
    cell := case when g = 4 then c.c1 when g = 12 then c.fv when g = 13 then c.ft when g = 14 then c.f2 else c.c0 end;
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Order ' || lpad(g::text, 2, '0'), 'Order ' || g, 'order' || g || '@example.com', 'x', array['Friends'])
    on conflict (id) do nothing;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    interests := case g
      when 1 then '{"sports.racket.squash":10,"sports.racket.padel":1,"sports.racket.pickleball":1,"sports.team.kabaddi":8}'
      when 2 then '{"sports.racket.squash":10,"sports.endurance.running":10}'
      when 3 then '{"sports.racket.padel":1,"sports.racket.pickleball":1,"sports.endurance.running":18}'
      when 4 then '{"sports.team.kabaddi":20}'
      when 15 then '{"sports.team.kabaddi":20}'
      when 16 then '{"sports.racket.squash":6,"sports.endurance.running":14}'
      else '{"sports.endurance.running":20}' end::jsonb;
    for it in select key, value::int as pts from jsonb_each_text(interests) loop
      insert into public.member_interest (member_id, interest_id, points) values (mid, it.key, it.pts) on conflict do nothing;
    end loop;
  end loop;
  if (select count(*) from public.profiles where id::text like 'e8e8e8e8-%' and public.brivia_member_completed(id)) <> 15 then
    raise exception 'FAIL setup: 15 completed members expected';
  end if;
  -- C0 and c1 meet k = 10 (forced as the owner)
  insert into public.cell_density (cell, is_test, n, streak10, streak5, ok10, ok5, as_of)
  values (c.c0, false, 10, 7, 7, true, true, current_date), (c.c1, false, 10, 7, 7, true, true, current_date);
end $$;

create or replace function pg_temp.deck(p_viewer uuid) returns table(id uuid, band text, ord bigint) language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  return query select d.id, d.distance_band, d.ord
    from public.deck_candidates(20) with ordinality as d(id, name, photo_url, cover_url, experience, skills,
                                                         looking_for, distance_band, shared_interests, ord);
  reset role;
end $$;
create or replace function pg_temp.deck_ids(p_viewer uuid) returns uuid[] language sql as $$
  select coalesce(array_agg(d.id order by d.ord), '{}') from pg_temp.deck(p_viewer) d $$;
create or replace function pg_temp.band(p_viewer uuid, p_target uuid) returns text language sql as $$
  select coalesce((select d.band from pg_temp.deck(p_viewer) d where d.id = p_target), '(absent)') $$;

-- 1. Shape: both card RPCs are volatile (they write impressions), definer, search_path pinned; the tie helper is
-- internal and immutable.
do $$
declare f text;
begin
  foreach f in array array['public.deck_candidates(integer)', 'public.search_members(text, integer)'] loop
    if not (select prosecdef and proconfig @> array['search_path=public'] and provolatile = 'v'
              from pg_proc where oid = to_regprocedure(f)) then
      raise exception 'FAIL C-4: % must be volatile, security definer, search_path=public', f;
    end if;
  end loop;
  if to_regprocedure('public.brivia_deck_tie(uuid, uuid, date)') is null
     or (select provolatile from pg_proc where oid = 'public.brivia_deck_tie(uuid, uuid, date)'::regprocedure) <> 'i' then
    raise exception 'FAIL R1: brivia_deck_tie(uuid, uuid, date) missing or not immutable';
  end if;
  if has_function_privilege('authenticated', 'public.brivia_deck_tie(uuid, uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.brivia_deck_tie(uuid, uuid, date)', 'execute') then
    raise exception 'FAIL R1: brivia_deck_tie is executable by a client role';
  end if;
end $$;

-- 2. Order: interest first, then display ring, then the overlap level, then the daily tie key.
do $$
declare v uuid := pg_temp.e8(1); d uuid[]; tail uuid[]; mid3 uuid[] := array[pg_temp.e8(2), pg_temp.e8(15), pg_temp.e8(16)];
begin
  d := pg_temp.deck_ids(v);
  if cardinality(d) <> 11 then raise exception 'FAIL: V deck has % cards: %', cardinality(d), d; end if;
  -- the 'mid' level (D 0.5, K 0.4, Q 0.3) is ordered by the tie key, not by the exact overlap (M-2)
  if d[1:3] <> (select array_agg(x order by public.brivia_deck_tie(v, x, current_date)) from unnest(mid3) u(x)) then
    raise exception 'FAIL M-2: the mid overlap level is not ordered by the tie key: %', d; end if;
  -- deep (1 shared id, overlap 10/20, mid) before broad (2 shared ids, overlap 2/20, low)
  if d[4] <> pg_temp.e8(3) or array_position(d, pg_temp.e8(2)) > 3 then
    raise exception 'FAIL R1 (C-3): a deep 10+10 card must lead a broad 2-point card: %', d; end if;
  -- a shared ring-1 card before every zero-shared ring-0 card
  if d[5] <> pg_temp.e8(4) then raise exception 'FAIL R1: the shared ring-1 card is not fifth: %', d; end if;
  if pg_temp.band(v, pg_temp.e8(4)) <> '~10 km' or pg_temp.band(v, pg_temp.e8(5)) <> '~3 km' then
    raise exception 'FAIL setup: bands % / %', pg_temp.band(v, pg_temp.e8(4)), pg_temp.band(v, pg_temp.e8(5)); end if;
  -- the zero-shared ring-0 tail follows brivia_deck_tie(viewer, target, current_date)
  tail := d[6:11];
  if tail <> (select array_agg(x order by public.brivia_deck_tie(v, x, current_date)) from unnest(tail) u(x)) then
    raise exception 'FAIL R1 (C-4): the tie order is not brivia_deck_tie(viewer, target, current_date)'; end if;
  -- and it rotates: two fixed dates give two different orders of the same tail
  if (select array_agg(x order by public.brivia_deck_tie(v, x, date '2026-01-01')) from unnest(tail) u(x))
     = (select array_agg(x order by public.brivia_deck_tie(v, x, date '2026-01-02')) from unnest(tail) u(x)) then
    raise exception 'FAIL R1 (C-4): the tie order does not change across dates'; end if;
  if public.brivia_deck_tie(v, pg_temp.e8(5), date '2026-01-01') <> md5(v::text || pg_temp.e8(5)::text || '2026-01-01') then
    raise exception 'FAIL R1: brivia_deck_tie is not md5(viewer || target || YYYY-MM-DD)'; end if;
  -- the place tier: S1's cell no longer meets k = 10, so it is banded "Kolkata", and still leads the zero-shared
  -- "~3 km" cards (interest qualifies, location orders)
  update public.cell_density set ok10 = false where cell = (select c1 from ord_cells) and not is_test;
  d := pg_temp.deck_ids(v);
  if pg_temp.band(v, pg_temp.e8(4)) <> 'Kolkata' then raise exception 'FAIL: S1 place band = %', pg_temp.band(v, pg_temp.e8(4)); end if;
  if d[5] <> pg_temp.e8(4) then raise exception 'FAIL R1: a shared place-tier card must lead zero-shared ring-0 cards: %', d; end if;
  update public.cell_density set ok10 = true where cell = (select c1 from ord_cells) and not is_test;
end $$;

-- 3. Fine targets: admitted at <= 15 km only when the target's g7 cell is ok10 and both members are precision
-- 'cell'. FV (Navi Mumbai) and FT (Pune) are ~12 km apart; their place centroids are > 60 km apart.
do $$
declare c record; fv uuid := pg_temp.e8(12); ft uuid := pg_temp.e8(13); f2 uuid := pg_temp.e8(14);
begin
  select * into c from ord_cells;
  if pg_temp.band(fv, ft) <> '(absent)' then raise exception 'FAIL R1: FT admitted without ok10: %', pg_temp.band(fv, ft); end if;
  insert into public.cell_density (cell, is_test, n, streak10, streak5, ok10, ok5, as_of)
  values (c.ft, false, 10, 7, 7, true, true, current_date), (c.f2, false, 10, 7, 7, true, true, current_date);
  if pg_temp.band(fv, ft) <> '~10 km' then raise exception 'FAIL R1: fine FT = % (want ~10 km)', pg_temp.band(fv, ft); end if;
  -- a fine cell at the true ring 2 is never admitted on g7
  if pg_temp.band(fv, f2) <> '(absent)' then raise exception 'FAIL R1: true ring 2 admitted: %', pg_temp.band(fv, f2); end if;
  -- ok5 only is not enough
  update public.cell_density set ok10 = false where cell = c.ft and not is_test;
  if pg_temp.band(fv, ft) <> '(absent)' then raise exception 'FAIL R1: FT admitted at ok5: %', pg_temp.band(fv, ft); end if;
  update public.cell_density set ok10 = true where cell = c.ft and not is_test;
  -- the target's cell decides, not the viewer's: FV's own cell has no density row, so FT does not see FV
  if pg_temp.band(ft, fv) <> '(absent)' then raise exception 'FAIL R1: FV admitted to FT without ok10'; end if;
  -- either side 'place': never fine
  update public.member_orbit set precision = 'place' where member_id = fv;
  if pg_temp.band(fv, ft) <> '(absent)' then raise exception 'FAIL R2: a place-precision viewer got a fine card'; end if;
  update public.member_orbit set precision = 'cell' where member_id = fv;
  update public.member_orbit set precision = 'place' where member_id = ft;
  if pg_temp.band(fv, ft) <> '(absent)' then raise exception 'FAIL R2: a place-precision target got a fine card'; end if;
  update public.member_orbit set precision = 'cell' where member_id = ft;
  if pg_temp.band(fv, ft) <> '~10 km' then raise exception 'FAIL: FT not restored'; end if;
end $$;

-- 4. Impressions (C-4): one owner-only row per served card, with position, display ring, overlap and policy.
do $$
declare v uuid := pg_temp.e8(1); d uuid[]; n int; bad int;
begin
  delete from public.interaction where viewer_id = v;
  d := pg_temp.deck_ids(v);
  select count(*) into n from public.interaction where viewer_id = v and event = 'impression';
  if n <> cardinality(d) then raise exception 'FAIL C-4: % impressions for % cards', n, cardinality(d); end if;
  select count(*) into bad from public.interaction i
   where i.viewer_id = v and i.event = 'impression'
     and not (i.context->>'policy' = 'interim-v1' and i.context->>'surface' = 'deck'
              and (i.context->>'position')::int = array_position(d, i.target_id)
              and i.context ? 'ring' and i.context ? 'overlap' and i.model_version = 'interim-v1' and i.propensity = 1);
  if bad <> 0 then raise exception 'FAIL C-4: % impression rows have the wrong context', bad; end if;
  if (select (context->>'ring')::int from public.interaction where viewer_id = v and target_id = pg_temp.e8(4)) <> 1
     or (select (context->>'ring')::int from public.interaction where viewer_id = v and target_id = pg_temp.e8(2)) <> 0
     or (select (context->>'overlap')::numeric from public.interaction where viewer_id = v and target_id = pg_temp.e8(2)) <> 0.5
     or (select (context->>'overlap')::numeric from public.interaction where viewer_id = v and target_id = pg_temp.e8(3)) <> 0.1
     or (select (context->>'overlap')::numeric from public.interaction where viewer_id = v and target_id = pg_temp.e8(5)) <> 0
     or (select (context->>'overlap_level')::int from public.interaction where viewer_id = v and target_id = pg_temp.e8(2)) <> 2
     or (select (context->>'overlap_level')::int from public.interaction where viewer_id = v and target_id = pg_temp.e8(3)) <> 1
     or (select (context->>'overlap_level')::int from public.interaction where viewer_id = v and target_id = pg_temp.e8(5)) <> 0 then
    raise exception 'FAIL C-4: impression ring/overlap values';
  end if;
  -- I-2: a second deck call on the same UTC day adds no impression for the same targets
  perform pg_temp.deck_ids(v);
  select count(*) into n from public.interaction where viewer_id = v and event = 'impression';
  if n <> cardinality(d) then raise exception 'FAIL I-2: % impressions after two deck calls for % cards', n, cardinality(d); end if;
  if exists (select 1 from public.interaction where event = 'impression' and viewer_id = v
              group by target_id, context->>'surface', (created_at at time zone 'UTC')::date having count(*) > 1) then
    raise exception 'FAIL I-2: duplicate impressions';
  end if;
  -- members never read impression rows (0003 policy interaction_select_own)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into n from public.interaction where event = 'impression';
  reset role;
  if n <> 0 then raise exception 'FAIL C-4: a member reads % own impression rows', n; end if;
end $$;

-- search_members logs its cards the same way (surface 'search').
do $$
declare v uuid := pg_temp.e8(1); n int; hits int;
begin
  delete from public.interaction where viewer_id = v;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into hits from public.search_members('Order', 20);
  reset role;
  select count(*) into n from public.interaction
   where viewer_id = v and event = 'impression' and context->>'policy' = 'interim-v1' and context->>'surface' = 'search'
     and (context->>'position')::int between 1 and hits and model_version = 'interim-v1';
  if hits < 10 or n <> hits then raise exception 'FAIL C-4: search logged % impressions for % cards', n, hits; end if;
  -- I-2: the same search again adds nothing today
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  perform * from public.search_members('Order', 20);
  reset role;
  if (select count(*) from public.interaction where viewer_id = v and event = 'impression') <> hits then
    raise exception 'FAIL I-2: a repeated search duplicated impressions'; end if;
end $$;

-- 5. Served ids (P0-A2): like/pass only for a target served in the last 7 days; otherwise silently ignored.
do $$
declare v uuid := pg_temp.e8(1); n int; failed boolean := false;
begin
  delete from public.interaction where viewer_id = v;
  perform pg_temp.deck_ids(v);   -- serves D, B, S1, N0, T1..T5
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  begin
    insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(2), 'pass');
    insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(3), 'like');
    insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(13), 'pass');   -- never served
    insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(13), 'like');   -- never served
  exception when others then failed := true;
  end;
  reset role;
  if failed then raise exception 'FAIL P0-A2: an unserved like/pass raised an error'; end if;
  select count(*) into n from public.interaction where viewer_id = v and event in ('like', 'pass');
  if n <> 2 then raise exception 'FAIL P0-A2: % like/pass rows (want 2: the served ones)', n; end if;
  if exists (select 1 from public.interaction where viewer_id = v and target_id = pg_temp.e8(13) and event <> 'impression') then
    raise exception 'FAIL P0-A2: an unserved target got a row'; end if;
  -- an impression older than 7 days no longer counts
  update public.interaction set created_at = now() - interval '8 days'
   where viewer_id = v and target_id = pg_temp.e8(5) and event = 'impression';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(5), 'pass');
  reset role;
  if exists (select 1 from public.interaction where viewer_id = v and target_id = pg_temp.e8(5) and event = 'pass') then
    raise exception 'FAIL P0-A2: a pass for a target served 8 days ago was stored'; end if;
  -- a search hit counts as served
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  perform * from public.search_members('Order 05', 20);
  insert into public.interaction (viewer_id, target_id, event) values (v, pg_temp.e8(5), 'pass');
  reset role;
  if not exists (select 1 from public.interaction where viewer_id = v and target_id = pg_temp.e8(5) and event = 'pass') then
    raise exception 'FAIL P0-A2: a pass for a search hit was not stored'; end if;
end $$;

-- 6. I-2 retention: purge_expired_requests deletes impressions older than 30 days, and keeps newer ones.
do $$
declare v uuid := pg_temp.e8(1); n_before int;
begin
  delete from public.interaction where viewer_id = v;
  insert into public.interaction (viewer_id, target_id, event, created_at) values
    (v, pg_temp.e8(2), 'impression', now() - interval '31 days'),
    (v, pg_temp.e8(3), 'impression', now() - interval '29 days');
  perform public.purge_expired_requests();
  if exists (select 1 from public.interaction where viewer_id = v and target_id = pg_temp.e8(2)) then
    raise exception 'FAIL I-2: a 31-day-old impression survived the purge'; end if;
  if not exists (select 1 from public.interaction where viewer_id = v and target_id = pg_temp.e8(3)) then
    raise exception 'FAIL I-2: a 29-day-old impression was purged'; end if;
end $$;

-- Clean up.
delete from public.cell_density;
delete from public.interaction where viewer_id::text like 'e8e8e8e8-%' or target_id::text like 'e8e8e8e8-%';
delete from public.profiles where id::text like 'e8e8e8e8-%';
delete from auth.users where id::text like 'e8e8e8e8-%';

select 'orbit-deck-order.test.sql OK' as result;
