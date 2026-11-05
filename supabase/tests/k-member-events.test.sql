-- 0022 (D-121): members create events. Ids 0e220000-0000-4000-8000-0000000000NN: 01 O (organiser), 02 A, 03 B, 04 K
-- (O blocked K), 05 I (incomplete), 06 C.
-- M1 structure: no coordinate columns on club_event; the new functions are authenticated-only (anon cannot run
--    them); confirm_event_payment is not executable by any client role; the event-posters bucket is public with limits.
-- M2 save_member_event: a draft needs only a title and is seen only by its creator; publishing names the missing or
--    bad field (22023 'invalid <field>'): category, Other without its own name (and the name is kept), description, a past date, an end before the start, venue, city,
--    capacity, a map link off the allow-list, a poster outside the creator's folder; a pin becomes a g7 cell only.
-- M3 visibility: a published event is listed to members who can see the creator (not K, whom O blocked); the
--    organiser block is {id, name, photo_url}; contact reaches others only when public, and the organiser always.
-- M4 ownership: another member cannot edit, cancel or delete it (42501); a published event cannot go back to draft.
-- M5 registration: capacity checked server-side ('event_full'); registering twice changes nothing; cancelling frees
--    the seat; the companion choice needs a registration; with registrations the fee is locked and the capacity cannot
--    drop under the seats taken.
-- M6 paid: a registration is pending_payment (a held seat, not confirmed; since 0025 in the companion pool); confirm_event_payment
--    (service side) confirms it; an expired hold frees the seat.
-- M7 cancel and delete: a cancelled event leaves others' lists but stays (marked cancelled) for the organiser and the
--    members registered; a published event cannot be deleted; a draft or cancelled one can, with its registrations.
-- M8 at most 10 new events per member per 24 hours (P0001 'event_limit').
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e220000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate || ':' || sqlerrm; end $$;
create or replace function pg_temp.fields(p jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('title', 'Bangalore Chess Meetup', 'category', 'games',
    'description', 'Rapid games, a friendly ladder and good conversation. All levels welcome.',
    'date', to_char((now() at time zone 'Asia/Kolkata')::date + 5, 'YYYY-MM-DD'), 'start_time', '18:00', 'end_time', '21:00',
    'venue_name', 'Battle Chess Skool', 'venue_address', '12 ITPL Main Road, Whitefield', 'place_id', 'in-bengaluru',
    'capacity', 2, 'fee_inr', 0) || p $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..6 loop
    mid := pg_temp.mv(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Member ' || g, 'Member ' || g, 'member-ev' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    if g <> 5 then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
      on conflict do nothing;
    end if;
  end loop;
  if not public.brivia_member_completed(pg_temp.mv(1)) then raise exception 'FAIL setup: O must be completed'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(1), pg_temp.mv(4)) on conflict do nothing;
end $$;

-- M1
do $$
declare f text; r text;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_event'
              and (column_name ~ '(^|_)(lat|lng|lon|latitude|longitude)$')) then
    raise exception 'FAIL M1: club_event keeps a coordinate column'; end if;
  foreach f in array array['public.save_member_event(uuid, jsonb, boolean)', 'public.cancel_member_event(uuid)',
                           'public.delete_member_event(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL M1: anon can run %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL M1: members cannot run %', f; end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(r, 'public.confirm_event_payment(uuid, uuid, text)', 'execute') then
      raise exception 'FAIL M1: % can confirm a payment', r; end if;
  end loop;
  if not exists (select 1 from storage.buckets where id = 'event-posters' and public and file_size_limit = 10485760
                  and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']) then
    raise exception 'FAIL M1: event-posters bucket'; end if;
end $$;

-- M2
create temp table k_ids (k text primary key, id uuid);
grant all on k_ids to authenticated;
do $$
declare d uuid; e uuid; c text; r record; poster text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(1));
  d := public.save_member_event(null, '{"title": "Half an idea"}'::jsonb, false);
  insert into k_ids values ('draft', d);
  select * into r from public.list_events(null) where id = d;
  if r.status <> 'draft' or not r.is_mine or r.starts_at is not null then raise exception 'FAIL M2: draft row %', r; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, false)', '{"title": "  "}'));
  if c not like '22023:invalid title%' then raise exception 'FAIL M2: empty title gave %', c; end if;

  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"category": null}')));
  if c not like '22023:invalid category%' then raise exception 'FAIL M2: no category gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"category": "other"}')));
  if c not like '22023:invalid custom_category%' then raise exception 'FAIL M2: Other without a name gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"category": "other", "custom_category": "<b>x</b>"}')));
  if c not like '22023:invalid custom_category%' then raise exception 'FAIL M2: a markup name gave %', c; end if;
  d := public.save_member_event(null, pg_temp.fields('{"category": "other", "custom_category": "  Book   club "}'), true);
  if (select custom_category from public.list_events(null) where id = d) <> 'Book club' then raise exception 'FAIL M2: the own category is kept, tidied'; end if;
  if (select custom_category from public.list_events('other') where id = d) <> 'Book club' then raise exception 'FAIL M2: list_events returns it'; end if;
  perform public.save_member_event(d, pg_temp.fields('{"category": "games", "custom_category": "Book club"}'), true);
  if (select custom_category from public.list_events(null) where id = d) is not null then raise exception 'FAIL M2: a named category goes with Other'; end if;
  perform public.cancel_member_event(d); perform public.delete_member_event(d);
  d := (select id from k_ids where k = 'draft');
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"description": "short"}')));
  if c not like '22023:invalid description%' then raise exception 'FAIL M2: short description gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)',
         pg_temp.fields(jsonb_build_object('date', to_char((now() at time zone 'Asia/Kolkata')::date - 1, 'YYYY-MM-DD')))));
  if c not like '22023:invalid date%' then raise exception 'FAIL M2: past date gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"end_time": "17:00"}')));
  if c not like '22023:invalid end_time%' then raise exception 'FAIL M2: end before start gave %', c; end if;
  -- D-197 (0056): an event may end on a later day, up to 30 days after its start date, never before it starts.
  d := public.save_member_event(null, pg_temp.fields(jsonb_build_object('end_date', to_char((now() at time zone 'Asia/Kolkata')::date + 7, 'YYYY-MM-DD'), 'end_time', '17:00')), true);
  if (select ends_at - starts_at from public.list_events(null) where id = d) is distinct from interval '1 day 23 hours' then raise exception 'FAIL M2: a multi-day event keeps its end date'; end if;
  perform public.cancel_member_event(d); perform public.delete_member_event(d);
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)',
         pg_temp.fields(jsonb_build_object('end_date', to_char((now() at time zone 'Asia/Kolkata')::date + 4, 'YYYY-MM-DD')))));
  if c not like '22023:invalid end_date%' then raise exception 'FAIL M2: an end date before the start gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)',
         pg_temp.fields(jsonb_build_object('end_date', to_char((now() at time zone 'Asia/Kolkata')::date + 36, 'YYYY-MM-DD')))));
  if c not like '22023:invalid end_date%' then raise exception 'FAIL M2: an end date over 30 days gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"end_date": "2026-13-40"}')));
  if c not like '22023:invalid end_date%' then raise exception 'FAIL M2: a malformed end date gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)',
         pg_temp.fields(jsonb_build_object('end_date', to_char((now() at time zone 'Asia/Kolkata')::date + 5, 'YYYY-MM-DD'), 'end_time', '17:00'))));
  if c not like '22023:invalid end_time%' then raise exception 'FAIL M2: same end date, earlier time gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"date": "31-31-2026"}')));
  if c not like '22023:invalid date%' then raise exception 'FAIL M2: a malformed date gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"venue_address": ""}')));
  if c not like '22023:invalid venue_address%' then raise exception 'FAIL M2: no address gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"place_id": "nowhere"}')));
  if c not like '22023:invalid place_id%' then raise exception 'FAIL M2: unknown city gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"capacity": null}')));
  if c not like '22023:invalid capacity%' then raise exception 'FAIL M2: no capacity gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"capacity": 0}')));
  if c not like '22023:invalid capacity%' then raise exception 'FAIL M2: zero capacity gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"map_url": "https://evil.example/maps"}')));
  if c not like '22023:invalid map_url%' then raise exception 'FAIL M2: a non-map link gave %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields('{"contact_email": "not-an-email"}')));
  if c not like '22023:invalid contact_email%' then raise exception 'FAIL M2: a bad email gave %', c; end if;
  poster := 'https://x.supabase.co/storage/v1/object/public/event-posters/' || pg_temp.mv(2)::text || '/p.jpg';
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, true)', pg_temp.fields(jsonb_build_object('image_url', poster))));
  if c not like '22023:invalid image_url%' then raise exception 'FAIL M2: another member''s poster gave %', c; end if;

  poster := 'https://x.supabase.co/storage/v1/object/public/event-posters/' || pg_temp.mv(1)::text || '/p.jpg';
  e := public.save_member_event(null, pg_temp.fields(jsonb_build_object(
         'image_url', poster, 'map_url', 'https://maps.app.goo.gl/abc123', 'pin', jsonb_build_object('lat', 12.9591, 'lng', 77.7300),
         'contact_email', 'host@example.com', 'contact_public', false)), true);
  insert into k_ids values ('chess', e);
  reset role;
  select * into r from public.club_event where id = e;
  if r.venue_cell <> public.brivia_grid_cell(12.9591, 77.7300, 7) then raise exception 'FAIL M2: the pin must become the g7 cell'; end if;
  if r.starts_at <> (((now() at time zone 'Asia/Kolkata')::date + 5) + time '18:00') at time zone 'Asia/Kolkata' then
    raise exception 'FAIL M2: start time in IST'; end if;
  if r.venue_area <> 'Bengaluru' or r.creator_id <> pg_temp.mv(1) or not r.is_published or r.published_at is null then
    raise exception 'FAIL M2: stored row %', r; end if;
end $$;

-- M3
do $$
declare e uuid := (select id from k_ids where k = 'chess'); d uuid := (select id from k_ids where k = 'draft'); r record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(2));
  if exists (select 1 from public.list_events(null) where id = d) then raise exception 'FAIL M3: a draft reached another member'; end if;
  select * into r from public.list_events(null) where id = e;
  if r.id is null then raise exception 'FAIL M3: A must see the published event'; end if;
  if r.is_mine or r.status <> 'published' or r.capacity <> 2 or r.registered_count <> 0 or r.fee_inr <> 0 then
    raise exception 'FAIL M3: row for A %', r; end if;
  if (r.organizer ->> 'id')::uuid <> pg_temp.mv(1) or r.organizer ->> 'name' <> 'Member 1' or r.organizer ? 'email' then
    raise exception 'FAIL M3: organizer %', r.organizer; end if;
  if r.contact is not null then raise exception 'FAIL M3: a private contact reached A: %', r.contact; end if;
  if r.distance_km is null then raise exception 'FAIL M3: a distance is expected'; end if;
  if not exists (select 1 from public.list_events('games') where id = e) or exists (select 1 from public.list_events('music') where id = e) then
    raise exception 'FAIL M3: category filter'; end if;
  perform pg_temp.as_member(pg_temp.mv(4));
  if exists (select 1 from public.list_events(null) where id = e) then raise exception 'FAIL M3: K (blocked by O) sees the event'; end if;
  perform pg_temp.as_member(pg_temp.mv(1));
  select * into r from public.list_events(null) where id = e;
  if r.contact ->> 'email' <> 'host@example.com' or (r.contact ->> 'public')::boolean then raise exception 'FAIL M3: the organiser reads the contact back'; end if;
  perform public.save_member_event(e, pg_temp.fields(jsonb_build_object('contact_email', 'host@example.com', 'contact_public', true,
    'image_url', 'https://x.supabase.co/storage/v1/object/public/event-posters/' || pg_temp.mv(1)::text || '/p.jpg')), true);
  perform pg_temp.as_member(pg_temp.mv(2));
  select * into r from public.list_events(null) where id = e;
  if r.contact ->> 'email' <> 'host@example.com' or r.contact ? 'phone' then raise exception 'FAIL M3: a public contact: %', r.contact; end if;
  if r.distance_km is null then raise exception 'FAIL M3: an edit with the same city keeps the pin'; end if;
  reset role;
end $$;

-- M4
do $$
declare e uuid := (select id from k_ids where k = 'chess'); d uuid := (select id from k_ids where k = 'draft'); c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(2));
  c := pg_temp.code_of(format('select public.save_member_event(%L, %L::jsonb, true)', e, pg_temp.fields('{"title": "Mine now"}')));
  if c not like '42501%' then raise exception 'FAIL M4: another member edited: %', c; end if;
  c := pg_temp.code_of(format('select public.cancel_member_event(%L)', e));
  if c not like '42501%' then raise exception 'FAIL M4: another member cancelled: %', c; end if;
  c := pg_temp.code_of(format('select public.delete_member_event(%L)', d));
  if c not like '42501%' then raise exception 'FAIL M4: another member deleted a draft: %', c; end if;
  perform pg_temp.as_member(pg_temp.mv(1));
  c := pg_temp.code_of(format('select public.save_member_event(%L, %L::jsonb, false)', e, pg_temp.fields()));
  if c not like '22023:invalid publish%' then raise exception 'FAIL M4: published back to draft: %', c; end if;
  c := pg_temp.code_of(format('select public.delete_member_event(%L)', e));
  if c not like '22023:cancel first%' then raise exception 'FAIL M4: deleted a published event: %', c; end if;
  reset role;
  if (select title from public.club_event where id = e) <> 'Bangalore Chess Meetup' then raise exception 'FAIL M4: title changed'; end if;
end $$;

-- M5
do $$
declare e uuid := (select id from k_ids where k = 'chess'); r record; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(2));
  c := pg_temp.code_of(format('select public.set_event_rsvp(%L, null, true)', e));
  if c not like '22023:register first%' then raise exception 'FAIL M5: companion without registering: %', c; end if;
  select * into r from public.set_event_rsvp(e, true);
  if not r.going or r.status <> 'confirmed' then raise exception 'FAIL M5: A registers %', r; end if;
  select * into r from public.set_event_rsvp(e, true);
  if (select count(*) from public.list_events(null) x where x.id = e and x.registered_count = 1) <> 1 then
    raise exception 'FAIL M5: registering twice must not add a seat'; end if;
  select * into r from public.set_event_rsvp(e, null, true);
  if not r.wants_companion then raise exception 'FAIL M5: companion on'; end if;
  perform pg_temp.as_member(pg_temp.mv(3));
  perform public.set_event_rsvp(e, true, false);
  perform pg_temp.as_member(pg_temp.mv(6));
  c := pg_temp.code_of(format('select public.set_event_rsvp(%L, true)', e));
  if c not like 'P0001:event_full%' then raise exception 'FAIL M5: capacity 2 let a third in: %', c; end if;
  select * into r from public.list_events(null) where id = e;
  if r.registered_count <> 2 or r.going then raise exception 'FAIL M5: C sees % taken, going %', r.registered_count, r.going; end if;
  -- The organiser cannot lower the capacity under the seats taken, or change the fee, once people registered.
  perform pg_temp.as_member(pg_temp.mv(1));
  c := pg_temp.code_of(format('select public.save_member_event(%L, %L::jsonb, true)', e, pg_temp.fields('{"capacity": 1}')));
  if c not like '22023:invalid capacity%' then raise exception 'FAIL M5: capacity under seats taken: %', c; end if;
  c := pg_temp.code_of(format('select public.save_member_event(%L, %L::jsonb, true)', e, pg_temp.fields('{"fee_inr": 300}')));
  if c not like '22023:invalid fee_inr%' then raise exception 'FAIL M5: fee changed under registrations: %', c; end if;
  -- B cancels: the seat frees and C gets in.
  perform pg_temp.as_member(pg_temp.mv(3));
  select * into r from public.set_event_rsvp(e, false);
  if r.going then raise exception 'FAIL M5: cancel'; end if;
  perform pg_temp.as_member(pg_temp.mv(6));
  select * into r from public.set_event_rsvp(e, true, true);
  if not r.going then raise exception 'FAIL M5: C should get the freed seat'; end if;
  -- Companions: A sees C (both opted in, both confirmed); never K; the organiser has no list of registrants.
  perform pg_temp.as_member(pg_temp.mv(2));
  if (select count(*) from public.event_companions(e)) <> 1 or not exists (select 1 from public.event_companions(e) where member_id = pg_temp.mv(6) and shared_background >= 1) then
    raise exception 'FAIL M5: companions for A'; end if;
  perform pg_temp.as_member(pg_temp.mv(1));
  if exists (select 1 from public.event_companions(e)) then raise exception 'FAIL M5: the organiser (not opted in) sees companions'; end if;
  reset role;
end $$;

-- M6
do $$
declare p uuid; r record; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(1));
  p := public.save_member_event(null, pg_temp.fields('{"title": "Wine & Words", "category": "art", "fee_inr": 499, "capacity": 1}'), true);
  insert into k_ids values ('paid', p);
  perform pg_temp.as_member(pg_temp.mv(2));
  select * into r from public.set_event_rsvp(p, true, true);
  if r.status <> 'pending_payment' then raise exception 'FAIL M6: a paid registration must wait for payment, got %', r.status; end if;
  select * into r from public.list_events(null) where id = p;
  if r.my_status <> 'pending_payment' or r.registered_count <> 1 or r.fee_inr <> 499 or r.companion_count <> 1 then  -- 0025: a hold is in the companion pool
    raise exception 'FAIL M6: pending row %', r; end if;
  perform pg_temp.as_member(pg_temp.mv(3));
  c := pg_temp.code_of(format('select public.set_event_rsvp(%L, true)', p));
  if c not like 'P0001:event_full%' then raise exception 'FAIL M6: a pending hold must take the seat: %', c; end if;
  reset role;
  -- The provider confirms (service side, as postgres here).
  if public.confirm_event_payment(p, pg_temp.mv(2), 'pay_123') <> 'confirmed' then raise exception 'FAIL M6: confirm'; end if;
  if (select status from public.event_rsvp where event_id = p and member_id = pg_temp.mv(2)) <> 'confirmed'
     or (select payment_ref from public.event_rsvp where event_id = p and member_id = pg_temp.mv(2)) <> 'pay_123' then
    raise exception 'FAIL M6: not confirmed'; end if;
  -- An expired hold frees the seat.
  delete from public.event_rsvp where event_id = p;
  insert into public.event_rsvp (event_id, member_id, status, created_at) values (p, pg_temp.mv(2), 'pending_payment', now() - interval '31 minutes');
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(2));
  if (select my_status from public.list_events(null) where id = p) <> 'expired' then raise exception 'FAIL M6: expired hold state'; end if;
  perform pg_temp.as_member(pg_temp.mv(3));
  select * into r from public.set_event_rsvp(p, true);
  if r.status <> 'pending_payment' then raise exception 'FAIL M6: B takes the expired seat'; end if;
  reset role;
end $$;

-- M7
do $$
declare e uuid := (select id from k_ids where k = 'chess'); d uuid := (select id from k_ids where k = 'draft'); r record; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(1));
  if not public.cancel_member_event(e) then raise exception 'FAIL M7: cancel'; end if;
  if (select status from public.list_events(null) where id = e) <> 'cancelled' then raise exception 'FAIL M7: organiser sees cancelled'; end if;
  perform pg_temp.as_member(pg_temp.mv(2));   -- registered
  if (select status from public.list_events(null) where id = e) <> 'cancelled' then raise exception 'FAIL M7: a registrant sees it cancelled'; end if;
  c := pg_temp.code_of(format('select public.set_event_rsvp(%L, true)', e));
  if c not like '22023%' then raise exception 'FAIL M7: registered for a cancelled event: %', c; end if;
  perform pg_temp.as_member(pg_temp.mv(3));   -- not registered
  if exists (select 1 from public.list_events(null) where id = e) then raise exception 'FAIL M7: a cancelled event stays listed'; end if;
  perform pg_temp.as_member(pg_temp.mv(1));
  c := pg_temp.code_of(format('select public.save_member_event(%L, %L::jsonb, true)', e, pg_temp.fields()));
  if c not like '22023:invalid event%' then raise exception 'FAIL M7: edited a cancelled event: %', c; end if;
  if not public.delete_member_event(e) or not public.delete_member_event(d) then raise exception 'FAIL M7: delete'; end if;
  reset role;
  if exists (select 1 from public.club_event where id in (e, d)) or exists (select 1 from public.event_rsvp where event_id = e) then
    raise exception 'FAIL M7: rows survived the delete'; end if;
end $$;

-- M8
do $$
declare i int; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.mv(6));
  for i in 1..10 loop perform public.save_member_event(null, jsonb_build_object('title', 'Draft ' || i), false); end loop;
  c := pg_temp.code_of(format('select public.save_member_event(null, %L::jsonb, false)', '{"title": "One more"}'));
  if c not like 'P0001:event_limit%' then raise exception 'FAIL M8: an 11th event in 24 h: %', c; end if;
  reset role;
end $$;

-- Cleanup: a deleted profile takes its events and registrations with it.
do $$
begin
  delete from public.profiles where id in (select pg_temp.mv(g) from generate_series(1, 6) g);
  if exists (select 1 from public.club_event where creator_id in (select pg_temp.mv(g) from generate_series(1, 6) g)) then
    raise exception 'FAIL: events survived their creator'; end if;
  delete from auth.users where id in (select pg_temp.mv(g) from generate_series(1, 6) g);
end $$;

select 'k-member-events: ALL PASSED' as result;
