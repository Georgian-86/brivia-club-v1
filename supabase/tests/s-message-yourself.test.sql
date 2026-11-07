-- D-224 (0068): a member can message themselves; nothing else about who may message whom changes.
-- S1 A sends to A (text): stored; A reads it back; it is not withheld; edit and unsend work on it; a reply to it works
-- S2 B (not matched with A) cannot read A's note to self, and cannot send to A (unmatched is still refused)
-- S3 a member who has not completed the profile cannot message themselves either (the insert policy's first rule)
-- S4 A cannot send "as" B to B (sender must be the caller)
-- S5 mark_conversation_read(A) by A changes nothing (0 rows); no match row was created
-- Ids: 5e000000-0000-4000-8000-0000000000NN: 01 A, 02 B (completed), 03 C (not completed). One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.sm(n int) returns uuid language sql immutable as $$
  select ('5e000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(p_uid uuid) returns void language plpgsql as $f$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.sm(g);
    insert into auth.users(id, email) values (mid, 'self' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Self ' || g, 'Self ' || g, 'self' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    if g < 3 then
      update public.profiles set adult_declared_at = now() where profiles.id = mid;
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    end if;
  end loop;
  if not (public.brivia_member_completed(pg_temp.sm(1)) and public.brivia_member_completed(pg_temp.sm(2))) then
    raise exception 'FAIL setup: A and B must be completed'; end if;
  if public.brivia_member_completed(pg_temp.sm(3)) then raise exception 'FAIL setup: C must not be completed'; end if;
end $$;

-- S1
do $$
declare a uuid := pg_temp.sm(1); mid uuid; n int; b text;
begin
  perform pg_temp.as_member(a);
  insert into public.brivia_messages (sender_id, recipient_id, body) values (a, a, 'note to self') returning id into mid;
  select count(*) into n from public.brivia_messages where sender_id = a and recipient_id = a;
  if n <> 1 then raise exception 'FAIL S1: A sees % notes to self, expected 1', n; end if;
  perform 1 from public.edit_message(mid, 'note to self, edited');
  select body into b from public.brivia_messages where id = mid;
  if b <> 'note to self, edited' then raise exception 'FAIL S1: edit gave "%"', b; end if;
  insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (a, a, 'a reply', mid);
  perform public.unsend_message(mid);
  select count(*) into n from public.brivia_messages where id = mid and unsent_at is not null;
  if n <> 1 then raise exception 'FAIL S1: unsend did not mark the note'; end if;
  perform pg_temp.as_owner();
  select count(*) into n from brivia_private.withheld_message w join public.brivia_messages m on m.id = w.message_id where m.sender_id = a;
  if n <> 0 then raise exception 'FAIL S1: a note to self was withheld'; end if;
end $$;

-- S2
do $$
declare a uuid := pg_temp.sm(1); b uuid := pg_temp.sm(2); n int; st text;
begin
  perform pg_temp.as_member(b);
  select count(*) into n from public.brivia_messages where sender_id = a;
  if n <> 0 then raise exception 'FAIL S2: B reads % of A''s notes to self', n; end if;
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (b, a, 'hi');
    raise exception 'FAIL S2: an unmatched send was stored';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_owner();
end $$;

-- S3
do $$
declare c uuid := pg_temp.sm(3);
begin
  perform pg_temp.as_member(c);
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (c, c, 'hi me');
    raise exception 'FAIL S3: an incomplete profile messaged itself';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_owner();
end $$;

-- S4
do $$
declare a uuid := pg_temp.sm(1); b uuid := pg_temp.sm(2);
begin
  perform pg_temp.as_member(a);
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (b, b, 'forged');
    raise exception 'FAIL S4: A wrote a note as B';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_owner();
end $$;

-- S5
do $$
declare a uuid := pg_temp.sm(1); n int;
begin
  perform pg_temp.as_member(a);
  n := public.mark_conversation_read(a);
  if n <> 0 then raise exception 'FAIL S5: mark_conversation_read(self) changed % rows', n; end if;
  perform pg_temp.as_owner();
  select count(*) into n from public.matches where a in (user1_id, user2_id);
  if n <> 0 then raise exception 'FAIL S5: a match was created'; end if;
end $$;

rollback;
\echo 's-message-yourself: all checks passed'
