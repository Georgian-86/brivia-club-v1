-- 0045 (D-156): 10 free swipes a day on the deck and on Find my companion; "DJ". Ids 0e450000-0000-4000-8000-0000000000NN:
-- 01 A (the swiper), 02..14 others in the same cell, all looking for a companion at one event.
-- Z1 the limits are private config rows (10 and 10); my_companion_quota is for members only.
-- Z2 deck: 10 passes are stored, the 11th is refused (PT429 swipe_quota_exhausted) and not stored; passing someone
--    already passed today is free; a signal at the cap is refused too; my_signal_quota says 0 left with a reset time.
-- Z3 passes and signals share the count: 9 passes leave 1 signal.
-- Z4 companions: 10 swipes (likes and passes, any event), the 11th is refused (PT429 companion_swipe_quota) and not
--    stored; re-swiping someone is free; my_companion_quota counts down to 0 with a reset time.
-- Z6 (0080, D-263) one pool: the deck and the companions share the same 10 a day; after Z4's 10 companion swipes the
--    deck is out too (my_signal_quota 0, a Pass refused), and a member on the unlimited list (0079) is never blocked.
-- Z5 "DJ" is offered under the founder's wording, A-Z order intact.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.zm(n int) returns uuid language sql immutable as $$
  select ('0e450000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate || ':' || sqlerrm; end $$;
create temp table z_ids (k text primary key, id uuid);
grant all on z_ids to authenticated;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9352, 77.6245, 7); e1 uuid;
begin
  for g in 1..14 loop
    mid := pg_temp.zm(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Swipe ' || g, 'Swipe ' || g, 'swipe' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    -- A was shown everyone (a pass needs an impression: 0004 brivia_interaction_served).
    if g > 1 then
      insert into public.interaction (viewer_id, target_id, event, context) values (pg_temp.zm(1), mid, 'impression', '{"surface":"deck"}');
    end if;
  end loop;
  if not public.brivia_member_completed(pg_temp.zm(1)) then raise exception 'FAIL setup: A must be completed'; end if;
  insert into public.club_event (slug, title, category, venue_name, venue_area, venue_cell, starts_at, ends_at)
  values ('zz-swipes-1', 'Swipe Test', 'music', 'Hall', 'Koramangala, Bengaluru', cell, now() + interval '2 days', now() + interval '2 days 3 hours')
  on conflict (slug) do nothing;
  select id into e1 from public.club_event where slug = 'zz-swipes-1';
  insert into z_ids values ('e1', e1);
  for g in 1..14 loop
    insert into public.event_rsvp (event_id, member_id, wants_companion, status) values (e1, pg_temp.zm(g), true, 'confirmed') on conflict do nothing;
  end loop;
end $$;

-- Z1
do $$
begin
  if public.brivia_config_int('signal_daily_limit', 30) <> 10 then raise exception 'FAIL Z1: signal_daily_limit is not 10'; end if;
  if public.brivia_config_int('companion_swipe_daily_limit', 0) <> 10 then raise exception 'FAIL Z1: companion limit is not 10'; end if;
  if has_function_privilege('anon', 'public.my_companion_quota()', 'execute') then raise exception 'FAIL Z1: anon can run my_companion_quota'; end if;
  if not has_function_privilege('authenticated', 'public.my_companion_quota()', 'execute') then raise exception 'FAIL Z1: members cannot run my_companion_quota'; end if;
end $$;

-- Z2
do $$
declare g int; code text; q record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.zm(1));
  for g in 2..11 loop
    insert into public.interaction (viewer_id, target_id, event) values (pg_temp.zm(1), pg_temp.zm(g), 'pass');
  end loop;
  select * into q from public.my_signal_quota();
  if q.remaining <> 0 or q.daily_limit <> 10 or q.resets_at is null then raise exception 'FAIL Z2: quota after 10 passes %', q; end if;
  code := pg_temp.code_of(format('insert into public.interaction (viewer_id, target_id, event) values (%L, %L, ''pass'')', pg_temp.zm(1), pg_temp.zm(12)));
  if code not like 'PT429:swipe_quota_exhausted%' then raise exception 'FAIL Z2: the 11th pass answered %', code; end if;
  code := pg_temp.code_of(format('insert into public.interaction (viewer_id, target_id, event) values (%L, %L, ''pass'')', pg_temp.zm(1), pg_temp.zm(2)));
  if code <> 'none' then raise exception 'FAIL Z2: passing someone already passed answered %', code; end if;
  code := pg_temp.code_of(format('select * from public.send_signal(%L)', pg_temp.zm(13)));
  if code not like 'PT429:signal_quota_exhausted%' then raise exception 'FAIL Z2: a signal at the cap answered %', code; end if;
end $$;
do $$
begin
  if exists (select 1 from public.interaction where viewer_id = pg_temp.zm(1) and target_id = pg_temp.zm(12) and event = 'pass') then
    raise exception 'FAIL Z2: the refused pass was stored'; end if;
end $$;

-- Z3 (a fresh day: the passes are moved back past 24 h)
update public.interaction set created_at = now() - interval '25 hours' where viewer_id = pg_temp.zm(1) and event = 'pass';
do $$
declare g int; r record; code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.zm(1));
  for g in 2..10 loop
    insert into public.interaction (viewer_id, target_id, event) values (pg_temp.zm(1), pg_temp.zm(g), 'pass');
  end loop;
  select * into r from public.send_signal(pg_temp.zm(13));
  if r.remaining <> 0 then raise exception 'FAIL Z3: 9 passes + 1 signal left %', r.remaining; end if;
  code := pg_temp.code_of(format('select * from public.send_signal(%L)', pg_temp.zm(14)));
  if code not like 'PT429:signal_quota_exhausted%' then raise exception 'FAIL Z3: the 11th swipe answered %', code; end if;
end $$;

-- Z4 (D-263: one pool, so Z2 and Z3's deck swipes are cleared first)
delete from public.interaction where viewer_id = pg_temp.zm(1) and event = 'pass';
delete from public.signal_ledger where sender_id = pg_temp.zm(1);
do $$
declare e1 uuid := (select id from z_ids where k = 'e1'); g int; code text; q record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.zm(1));
  select * into q from public.my_companion_quota();
  if q.remaining <> 10 or q.daily_limit <> 10 or q.resets_at is not null then raise exception 'FAIL Z4: fresh quota %', q; end if;
  for g in 2..11 loop
    perform * from public.companion_swipe(e1, pg_temp.zm(g), g % 2 = 0);
  end loop;
  select * into q from public.my_companion_quota();
  if q.remaining <> 0 or q.resets_at is null then raise exception 'FAIL Z4: quota after 10 swipes %', q; end if;
  code := pg_temp.code_of(format('select * from public.companion_swipe(%L, %L, true)', e1, pg_temp.zm(12)));
  if code not like 'PT429:companion_swipe_quota%' then raise exception 'FAIL Z4: the 11th swipe answered %', code; end if;
  code := pg_temp.code_of(format('select * from public.companion_swipe(%L, %L, true)', e1, pg_temp.zm(2)));
  if code <> 'none' then raise exception 'FAIL Z4: re-swiping answered %', code; end if;
end $$;
do $$
begin
  if exists (select 1 from public.event_companion_swipe where actor_id = pg_temp.zm(1) and target_id = pg_temp.zm(12)) then
    raise exception 'FAIL Z4: the refused swipe was stored'; end if;
end $$;

-- Z6
do $$
declare q record; code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.zm(1));
  select * into q from public.my_signal_quota();
  if q.remaining <> 0 or q.daily_limit <> 10 then raise exception 'FAIL Z6: deck after 10 companion swipes %', q; end if;
  code := pg_temp.code_of(format('insert into public.interaction (viewer_id, target_id, event) values (%L, %L, %L)', pg_temp.zm(1), pg_temp.zm(13), 'pass'));
  if code not like 'PT429:swipe_quota_exhausted%' then raise exception 'FAIL Z6: a Pass at the shared cap answered %', code; end if;
end $$;
insert into brivia_private.unlimited_swipes (member_id) values (pg_temp.zm(1)) on conflict do nothing;
do $$
declare q record; code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.zm(1));
  select * into q from public.my_companion_quota();
  if q.daily_limit <> 100000 or q.remaining <= 0 then raise exception 'FAIL Z6: unlimited member quota %', q; end if;
  code := pg_temp.code_of(format('insert into public.interaction (viewer_id, target_id, event) values (%L, %L, %L)', pg_temp.zm(1), pg_temp.zm(13), 'pass'));
  if code <> 'none' then raise exception 'FAIL Z6: unlimited member Pass answered %', code; end if;
end $$;
delete from brivia_private.unlimited_swipes where member_id = pg_temp.zm(1);

-- Z5
do $$
begin
  if (select label from public.interest_node where id = 'music.making.djing') <> 'DJ' then raise exception 'FAIL Z5: DJ label'; end if;
  if exists (select 1 from public.interest_node where catalog_order is not null and label = 'DJing') then raise exception 'FAIL Z5: DJing offered'; end if;
  if exists (select 1 from (select label, lag(label) over (order by catalog_order) prev from public.interest_node where catalog_order is not null) t
              where lower(t.prev) > lower(t.label)) then raise exception 'FAIL Z5: not A-Z'; end if;
end $$;

select 'z-daily-swipes.test.sql OK' as result;
