-- 0060 (D-203): the organiser hears about each registration.
-- R1 a confirmed registration notifies the organiser once (event_id, the title in snippet); the organiser's own does not;
--    a held, unpaid seat does not until it is confirmed; a blocked member does not; cancelling removes an unread one.
-- R2 my_notifications_v4 returns it with event_id and the poster; members cannot call the trigger function.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e600000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.mv(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Reg ' || g, 'Reg ' || g, 'reg-ev' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(1), pg_temp.mv(4)) on conflict do nothing;
  insert into public.club_event (id, slug, title, description, category, tags, venue_name, venue_area, venue_cell, starts_at, ends_at, image_key,
                                 is_published, creator_id, venue_address, capacity, fee_inr, published_at, image_url)
  values ('0e600000-0000-4000-8000-0000000000e1', 'm-reg-test', 'Goa Buildathon', 'A long enough description here.', 'tech', '{}',
          'TBA', 'Goa', cell, now() + interval '2 days', now() + interval '3 days', '', true, pg_temp.mv(1), 'Somewhere', null, 0, now(),
          'https://example.supabase.co/storage/v1/object/public/event-posters/' || pg_temp.mv(1) || '/p.webp');
end $$;

do $$
declare ev uuid := '0e600000-0000-4000-8000-0000000000e1'; n int;
begin
  -- R1
  insert into public.event_rsvp (event_id, member_id, status) values (ev, pg_temp.mv(2), 'confirmed');
  insert into public.event_rsvp (event_id, member_id, status) values (ev, pg_temp.mv(1), 'confirmed');   -- the organiser
  insert into public.event_rsvp (event_id, member_id, status) values (ev, pg_temp.mv(3), 'pending_payment');
  insert into public.event_rsvp (event_id, member_id, status) values (ev, pg_temp.mv(4), 'confirmed');   -- blocked
  select count(*) into n from public.member_notification where notification_type = 'event_registered' and user_id = pg_temp.mv(1);
  if n <> 1 then raise exception 'FAIL R1: % notifications before the payment (want Reg 2 only)', n; end if;
  if (select snippet from public.member_notification where notification_type = 'event_registered' and source_user_id = pg_temp.mv(2)) <> 'Goa Buildathon' then
    raise exception 'FAIL R1: the title'; end if;
  update public.event_rsvp set status = 'confirmed', paid_at = now() where event_id = ev and member_id = pg_temp.mv(3);
  update public.event_rsvp set wants_companion = true where event_id = ev and member_id = pg_temp.mv(3);   -- not again
  select count(*) into n from public.member_notification where notification_type = 'event_registered' and user_id = pg_temp.mv(1);
  if n <> 2 then raise exception 'FAIL R1: % after the payment (want 2)', n; end if;
  delete from public.event_rsvp where event_id = ev and member_id = pg_temp.mv(2);
  if exists (select 1 from public.member_notification where notification_type = 'event_registered' and source_user_id = pg_temp.mv(2)) then
    raise exception 'FAIL R1: a cancelled registration stays'; end if;
  if has_function_privilege('authenticated', 'brivia_private.brivia_notify_event_registered()', 'execute') then
    raise exception 'FAIL R2: members can call the trigger function'; end if;
end $$;

-- R2: as the organiser
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(1))::text, true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_notifications_v4() where notification_type = 'event_registered';
  if r.event_id is distinct from '0e600000-0000-4000-8000-0000000000e1'::uuid or r.event_image_url not like '%event-posters%' or r.name <> 'Reg 3' then
    raise exception 'FAIL R2: v4 gave %', row_to_json(r); end if;
end $$;
reset role;
rollback;
select 'zg-event-registration-notes.test ALL PASSED';
