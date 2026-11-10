-- 0025 (D-125): "Show interest" (a half registration for paid events) and the event brochure.
-- Ids 0e250000-0000-4000-8000-0000000000NN: 01 O (organiser), 02 A, 03 B, 04 C (not looking), 05 K (O blocks K).
-- N1 structure: the new functions are for members only; the brochure bucket is public, PDF only, 5 MB.
-- N2 interest on a paid event: no seat held (spots stay), not "going", my_status 'interested', counted in
--    interested_count; since 0026 a free event takes an interest too and Register makes it a confirmed seat; refused on
--    the organiser's own event and for a member who cannot see it.
-- N3 the pool: an interested member who opted in sees, and is seen by, others who opted in (interested, held or paid);
--    one who did not opt in is never listed; the companion switch works on an interest (no "register first").
-- N4 Reserve on an interest becomes the 30-minute hold (going, seat taken, interest count down); withdrawing an
--    interest never removes a seat or a live hold; withdrawing a plain interest removes it.
-- N5 the brochure: the organiser sets a PDF in their own folder; anything else, or another member, is refused; null
--    clears it; list_events returns it.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.mi(n int) returns uuid language sql immutable as $$
  select ('0e250000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate || ':' || sqlerrm; end $$;
create or replace function pg_temp.fields(p jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('title', 'Rooftop Jazz Night', 'category', 'music',
    'description', 'Live jazz on a rooftop, a set list of standards and plenty of time to talk.',
    'date', to_char((now() at time zone 'Asia/Kolkata')::date + 6, 'YYYY-MM-DD'), 'start_time', '19:00', 'end_time', '22:00',
    'venue_name', 'The Terrace', 'venue_address', '4 Lavelle Road', 'place_id', 'in-bengaluru',
    'capacity', 2, 'fee_inr', 799) || p $$;
create temp table n_ids (k text primary key, id uuid);
grant all on n_ids to authenticated;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..5 loop
    mid := pg_temp.mi(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Interest ' || g, 'Interest ' || g, 'interest' || g || '@example.com', 'Some years', array['Friends'], array['Jazz'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  if not public.brivia_member_completed(pg_temp.mi(2)) then raise exception 'FAIL setup: A must be completed'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mi(1), pg_temp.mi(5)) on conflict do nothing;
end $$;

-- N1
do $$
declare f text;
begin
  foreach f in array array['public.set_event_interest(uuid, boolean, boolean)', 'public.set_event_brochure(uuid, text)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL N1: anon can run %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL N1: members cannot run %', f; end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'event-brochures' and public and file_size_limit is null   -- 5 MB until 0069 (D-227)
                  and allowed_mime_types = array['application/pdf']) then
    raise exception 'FAIL N1: event-brochures bucket'; end if;
  if has_function_privilege('authenticated', 'public.brivia_companion_status(text)', 'execute') then
    raise exception 'FAIL N1: the pool helper is callable by members'; end if;
end $$;

-- N2
do $$
declare p uuid; f uuid; r record; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mi(1));
  p := public.save_member_event(null, pg_temp.fields(), true);
  f := public.save_member_event(null, pg_temp.fields('{"title": "Free Jam", "fee_inr": 0}'), true);
  insert into n_ids values ('paid', p), ('free', f);
  c := pg_temp.code_of(format('select public.set_event_interest(%L, true)', p));
  if c not like '22023:invalid event%' then raise exception 'FAIL N2: the organiser shows interest in their own event: %', c; end if;

  perform pg_temp.as_member(pg_temp.mi(2));
  select * into r from public.set_event_interest(p, true, false);
  if not r.interested or r.status <> 'interested' or r.wants_companion then raise exception 'FAIL N2: interest %', r; end if;
  select * into r from public.list_events(null) where id = p;
  if r.going or r.my_status <> 'interested' or r.registered_count <> 0 or r.interested_count <> 1 or r.going_count <> 0 then
    raise exception 'FAIL N2: listed interest %', r; end if;
  select * into r from public.set_event_interest(f, true);
  if r.status <> 'interested' then raise exception 'FAIL N2: interest in a free event (0026) %', r; end if;
  select * into r from public.list_events(null) where id = f;
  if r.going or r.my_status <> 'interested' or r.registered_count <> 0 or r.interested_count <> 1 then raise exception 'FAIL N2: free interest listed %', r; end if;
  select * into r from public.set_event_rsvp(f, true, null);
  if not r.going or r.status <> 'confirmed' then raise exception 'FAIL N2: Register on a free interest %', r; end if;
  select * into r from public.list_events(null) where id = f;
  if r.my_status <> 'confirmed' or r.registered_count <> 1 or r.interested_count <> 0 then raise exception 'FAIL N2: after Register %', r; end if;

  perform pg_temp.as_member(pg_temp.mi(5));
  c := pg_temp.code_of(format('select public.set_event_interest(%L, true)', p));
  if c not like '22023:invalid event%' then raise exception 'FAIL N2: a blocked member shows interest: %', c; end if;
  reset role;
end $$;

-- N3
do $$
declare p uuid := (select id from n_ids where k = 'paid'); r record; c text;
begin
  set local role authenticated;
  -- A turns the companion choice on through the ordinary switch (no "register first" for an interest).
  perform pg_temp.as_member(pg_temp.mi(2));
  select * into r from public.set_event_rsvp(p, null, true);
  if r.going or not r.wants_companion or r.status <> 'interested' then raise exception 'FAIL N3: switch on an interest %', r; end if;
  -- B shows interest wanting company; C shows interest without.
  perform pg_temp.as_member(pg_temp.mi(3));
  perform public.set_event_interest(p, true, true);
  perform pg_temp.as_member(pg_temp.mi(4));
  perform public.set_event_interest(p, true, false);

  perform pg_temp.as_member(pg_temp.mi(2));
  if (select companion_count from public.list_events(null) where id = p) <> 2 then raise exception 'FAIL N3: companion_count'; end if;
  if not (select wants_companion from public.list_events(null) where id = p) then raise exception 'FAIL N3: wants_companion'; end if;
  if not exists (select 1 from public.companion_deck(p, 20) where member_id = pg_temp.mi(3)) then raise exception 'FAIL N3: A must see B'; end if;
  if exists (select 1 from public.companion_deck(p, 20) where member_id = pg_temp.mi(4)) then raise exception 'FAIL N3: C is not looking'; end if;
  if not exists (select 1 from public.event_companions(p) where member_id = pg_temp.mi(3)) then raise exception 'FAIL N3: event_companions'; end if;
  if (select to_see from public.companion_events() where event_id = p) <> 1 then raise exception 'FAIL N3: companion_events'; end if;
  perform pg_temp.as_member(pg_temp.mi(4));
  if exists (select 1 from public.companion_deck(p, 20)) then raise exception 'FAIL N3: C not looking sees cards'; end if;
  reset role;
end $$;

-- N4
do $$
declare p uuid := (select id from n_ids where k = 'paid'); r record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mi(2));
  select * into r from public.set_event_rsvp(p, true, null);
  if not r.going or r.status <> 'pending_payment' or not r.wants_companion then raise exception 'FAIL N4: reserve on an interest %', r; end if;
  select * into r from public.list_events(null) where id = p;
  if r.my_status <> 'pending_payment' or r.registered_count <> 1 or r.interested_count <> 2 then raise exception 'FAIL N4: after reserve %', r; end if;
  -- Withdrawing "interest" never drops the live hold.
  select * into r from public.set_event_interest(p, false);
  if not r.interested or r.status <> 'pending_payment' then raise exception 'FAIL N4: the hold was dropped %', r; end if;
  -- B withdraws a plain interest: the row goes.
  perform pg_temp.as_member(pg_temp.mi(3));
  select * into r from public.set_event_interest(p, false);
  if r.interested or r.status is not null then raise exception 'FAIL N4: B withdrew %', r; end if;
  reset role;
  if exists (select 1 from public.event_rsvp where event_id = p and member_id = pg_temp.mi(3)) then raise exception 'FAIL N4: B''s row stays'; end if;
  -- A lapsed hold becomes an interest when interest is shown again.
  update public.event_rsvp set created_at = now() - interval '31 minutes' where event_id = p and member_id = pg_temp.mi(2);
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mi(2));
  select * into r from public.set_event_interest(p, true);
  if r.status <> 'interested' then raise exception 'FAIL N4: a lapsed hold should become an interest %', r; end if;
  reset role;
end $$;

-- N5
do $$
declare p uuid := (select id from n_ids where k = 'paid'); good text; c text;
begin
  good := 'https://example.supabase.co/storage/v1/object/public/event-brochures/' || pg_temp.mi(1) || '/brochure-1.pdf';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mi(1));
  if public.set_event_brochure(p, good) <> good then raise exception 'FAIL N5: set'; end if;
  c := pg_temp.code_of(format('select public.set_event_brochure(%L, %L)', p, replace(good, '.pdf', '.exe')));
  if c not like '22023:invalid brochure_url%' then raise exception 'FAIL N5: not a pdf: %', c; end if;
  c := pg_temp.code_of(format('select public.set_event_brochure(%L, %L)', p, replace(good, pg_temp.mi(1)::text, pg_temp.mi(2)::text)));
  if c not like '22023:invalid brochure_url%' then raise exception 'FAIL N5: another member''s folder: %', c; end if;
  c := pg_temp.code_of(format('select public.set_event_brochure(%L, %L)', p, replace(good, 'event-brochures', 'event-posters')));
  if c not like '22023:invalid brochure_url%' then raise exception 'FAIL N5: another bucket: %', c; end if;
  perform pg_temp.as_member(pg_temp.mi(2));
  if (select brochure_url from public.list_events(null) where id = p) <> good then raise exception 'FAIL N5: list_events brochure'; end if;
  c := pg_temp.code_of(format('select public.set_event_brochure(%L, null)', p));
  if c not like '42501:not your event%' then raise exception 'FAIL N5: a member sets another''s brochure: %', c; end if;
  perform pg_temp.as_member(pg_temp.mi(1));
  if public.set_event_brochure(p, null) is not null then raise exception 'FAIL N5: clear'; end if;
  reset role;
  if (select brochure_url from public.club_event where id = p) is not null then raise exception 'FAIL N5: not cleared'; end if;
end $$;

do $$
begin
  delete from public.profiles where id in (select pg_temp.mi(g) from generate_series(1, 5) g);
  delete from auth.users where id in (select pg_temp.mi(g) from generate_series(1, 5) g);
end $$;

select 'n-event-interest: ALL PASSED' as result;
