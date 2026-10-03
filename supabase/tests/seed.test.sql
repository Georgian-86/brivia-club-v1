-- Iteration 2 (Trust), Task 7: seed + purge of marked test members (Ruling P7).
-- Run by run.sh in three phases: -v phase=seeded (after the seed), extras (adds rows to purge), purged (after the purge).
-- NOT picked up by the generic tests loop: it needs the seed, so it runs in its own database.
\if :{?phase}
\else
  \set phase seeded
\endif

-- A real member (is_test = false) and the founder-style completed profile, created in both phases.
insert into auth.users(id) values ('eeeeeeee-0000-0000-0000-0000000000e1') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city, state, skills)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'Real Member', 'Real Member', 'real@example.com', 'Bengaluru', 'Karnataka', '{Python}')
on conflict (id) do nothing;
-- The real member is completed under D-030 (interests summing to 20 and a cell), so S5 is a real isolation check.
insert into public.member_interest (member_id, interest_id, points, mode) values
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'tech.ai_data.data_analysis', 12, 'play'),
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'sports.racket.badminton', 8, 'play')
on conflict do nothing;
insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
select 'eeeeeeee-0000-0000-0000-0000000000e1', c, public.brivia_grid_parent(c, 6), public.brivia_grid_parent(c, 5), 'in-bengaluru'
  from (select public.brivia_grid_cell(12.9716, 77.5946, 7) as c) x
on conflict (member_id) do nothing;

select :'phase' = 'seeded' as seeded, :'phase' = 'extras' as extras \gset
\if :seeded

do $$
declare n int; f text := 'a7e57000-0000-4000-8000-'; ids uuid[]; r record;
begin
  -- 24 members, marked, emails, completed, pgcrypto password, unusable
  select count(*) into n from public.profiles where is_test;
  if n <> 24 then raise exception 'FAIL S1: % test profiles, expected 24', n; end if;
  select count(*) into n from public.profiles p join auth.users u on u.id = p.id
   where p.is_test and u.email like 't__@test.brivia.club' and p.email = u.email and u.aud = 'authenticated'
     and u.role = 'authenticated' and u.encrypted_password like '$2%' and u.email_confirmed_at is not null
     and u.confirmation_token = '' and u.recovery_token = '' and u.email_change_token_new = '' and u.email_change = ''
     and u.email_change_token_current = '' and u.phone_change = '' and u.phone_change_token = '' and u.reauthentication_token = ''
     and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
                   and i.provider_id = u.id::text and i.identity_data->>'sub' = u.id::text and i.identity_data->>'email' = u.email);
  if n <> 24 then raise exception 'FAIL S1: only % rows have test emails + auth columns', n; end if;
  select count(*) into n from public.profiles where is_test and not public.brivia_member_completed(id);
  if n <> 0 then raise exception 'FAIL S2: % test profiles are not completed (D-030)', n; end if;
  if not public.brivia_member_completed('eeeeeeee-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL S2: positive control: the real member is not completed'; end if;
  -- 3-5 active, non-sensitive interests each, summing to 20; skills is their display copy
  select count(*) into n from public.profiles p where p.is_test and not (
    (select count(*) from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
      where mi.member_id = p.id and nd.status = 'active' and nd.level >= 3 and not nd.sensitive) between 3 and 5
    and (select count(*) from public.member_interest mi where mi.member_id = p.id)
        = (select count(*) from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
            where mi.member_id = p.id and not nd.sensitive and nd.status = 'active')
    and (select sum(points) from public.member_interest mi where mi.member_id = p.id) = 20
    and p.skills = (select array_agg(nd.label order by mi.points desc, nd.label asc)
                      from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                     where mi.member_id = p.id));
  if n <> 0 then raise exception 'FAIL S2: % test members break the 3-5 non-sensitive interests / 20 points / skills rule', n; end if;
  -- a cell in their own city: g7 plus the stored grid parents, nearest place = the city, within 3 km of its centroid
  select count(*) into n from public.profiles p join public.member_orbit o on o.member_id = p.id
    join public.place pl on pl.id = o.place_id
   where p.is_test and o.cell_scheme = 'grid1' and o.home_cell like 'g7:%'
     and o.home_cell_g6 = public.brivia_grid_parent(o.home_cell, 6) and o.home_cell_g5 = public.brivia_grid_parent(o.home_cell, 5)
     and pl.name = p.city and public.brivia_cell_km(o.home_cell, public.brivia_grid_cell(pl.lat, pl.lng, 7)) <= 3;
  if n <> 24 then raise exception 'FAIL S2: only % test members have a cell in their city', n; end if;
  select count(distinct o.home_cell) into n from public.member_orbit o join public.profiles p on p.id = o.member_id where p.is_test;
  if n < 8 then raise exception 'FAIL S2: only % distinct cells (per-member offset missing)', n; end if;
  if exists (select 1 from public.location_change lc join public.profiles p on p.id = lc.member_id where p.is_test) then
    raise exception 'FAIL S2: the seed wrote location_change rows'; end if;
  -- the real member is not a test member
  if (select is_test from public.profiles where id = 'eeeeeeee-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL S2: real member flagged test'; end if;

  -- 4 cities x 6, varied skills and looking_for
  for r in select city, count(*) c from public.profiles where is_test group by city loop
    if r.c <> 6 then raise exception 'FAIL S3: city % has % members', r.city, r.c; end if;
  end loop;
  select count(distinct city) into n from public.profiles where is_test;
  if n <> 4 then raise exception 'FAIL S3: % cities, expected 4', n; end if;
  select count(distinct skills) into n from public.profiles where is_test;
  if n < 8 then raise exception 'FAIL S3: only % distinct skill sets', n; end if;
  select count(distinct looking_for) into n from public.profiles where is_test;
  if n < 8 then raise exception 'FAIL S3: only % distinct looking_for sets', n; end if;
  if exists (select 1 from public.profiles where is_test and (cardinality(skills) = 0 or cardinality(looking_for) = 0)) then
    raise exception 'FAIL S3: empty skills/looking_for'; end if;

  -- fixtures: one match (1,2), requests 1<->2 accepted, 4 pending
  select count(*) into n from public.matches where user1_id::text like 'a7e57000%' or user2_id::text like 'a7e57000%';
  if n <> 1 then raise exception 'FAIL S4: % test matches, expected 1', n; end if;
  if not exists (select 1 from public.matches where user1_id = least((f||'000000000001')::uuid,(f||'000000000002')::uuid)
                    and user2_id = greatest((f||'000000000001')::uuid,(f||'000000000002')::uuid)) then
    raise exception 'FAIL S4: match is not 1<->2 (ordered)'; end if;
  select count(*) into n from public.connection_requests where status = 'accepted';
  if n <> 2 then raise exception 'FAIL S4: % accepted requests, expected 2', n; end if;
  select count(*) into n from public.connection_requests where status = 'pending';
  if n <> 4 then raise exception 'FAIL S4: % pending requests, expected 4', n; end if;
  -- every request and match is between test members only
  if exists (select 1 from public.connection_requests cr join public.profiles p on p.id in (cr.from_id, cr.to_id) where not p.is_test)
     or exists (select 1 from public.matches m join public.profiles p on p.id in (m.user1_id, m.user2_id) where not p.is_test) then
    raise exception 'FAIL S4: fixture touches a real member'; end if;
end $$;
select 'seed.test S1-S4 members, distribution, fixtures OK';

-- A REAL member sees none of them through any RPC, and cannot request or message them.
do $$
declare n int; failed boolean; t uuid := 'a7e57000-0000-4000-8000-000000000003'; ids uuid[];
begin
  select array_agg(id) into ids from public.profiles where is_test;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-0000000000e1"}', true);
  select count(*) into n from public.list_members(20);
  if n <> 0 then raise exception 'FAIL S5: real member lists % rows', n; end if;
  select count(*) into n from public.search_members('Bengaluru', 20) where id = any(ids);
  if n <> 0 then raise exception 'FAIL S5: real member searches % test rows by city', n; end if;
  select count(*) into n from public.search_members('test.brivia', 20)
    ; if n <> 0 then raise exception 'FAIL S5: search by email domain returned %', n; end if;
  select count(*) into n from public.search_members('Aarav', 20); if n <> 0 then raise exception 'FAIL S5: search by name returned %', n; end if;
  select count(*) into n from public.get_candidates(ids); if n <> 0 then raise exception 'FAIL S5: get_candidates returned %', n; end if;
  select count(*) into n from public.connection_requests; if n <> 0 then raise exception 'FAIL S5: real member sees % requests', n; end if;
  select count(*) into n from public.matches; if n <> 0 then raise exception 'FAIL S5: real member sees % matches', n; end if;
  failed := false;
  begin insert into public.connection_requests(from_id, to_id) values (auth.uid(), t);
  exception when insufficient_privilege or check_violation then failed := true; end;
  if not failed then raise exception 'FAIL S5: real member could request a test member'; end if;
  failed := false;
  begin insert into public.brivia_messages(sender_id, recipient_id, body) values (auth.uid(), t, 'hi');
  exception when insufficient_privilege or check_violation then failed := true; end;
  if not failed then raise exception 'FAIL S5: real member could message a test member'; end if;
  reset role;
end $$;

-- A test member sees only test members (world is intact) and the fixtures.
do $$
declare n int; f text := 'a7e57000-0000-4000-8000-';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a7e57000-0000-4000-8000-000000000001"}', true);
  select count(*) into n from public.list_members(20); if n <> 20 then raise exception 'FAIL S6: test member lists %', n; end if;
  select count(*) into n from public.get_candidates(array['eeeeeeee-0000-0000-0000-0000000000e1'::uuid]);
  if n <> 0 then raise exception 'FAIL S6: test member sees a real member'; end if;
  select count(*) into n from public.matches; if n <> 1 then raise exception 'FAIL S6: member 1 sees % matches', n; end if;
  select count(*) into n from public.connection_requests where to_id = auth.uid() and status = 'pending';
  if n <> 2 then raise exception 'FAIL S6: member 1 has % pending incoming, expected 2', n; end if;
  reset role;
end $$;
select 'seed.test S5-S6 real member isolation OK';

-- Seeding twice changes nothing (idempotent): checked by run.sh re-running the seed, then this count.
select count(*) = 24 as ok from public.profiles where is_test \gset
\if :ok
\else
  do $$ begin raise exception 'FAIL S7: expected exactly 24 test profiles after re-seed'; end $$;
\endif

\elif :extras
-- Rows tied to test members in every purge-relevant table (plus a real member's own, which must survive).
do $$
declare f text := 'a7e57000-0000-4000-8000-'; a uuid := (f || '000000000001')::uuid; b uuid := (f || '000000000002')::uuid;
        r uuid := 'eeeeeeee-0000-0000-0000-0000000000e1';
begin
  insert into public.brivia_blocks(blocker_id, blocked_id) values (a, (f || '000000000007')::uuid);
  insert into public.brivia_messages(sender_id, recipient_id, body) values (a, b, 'test hello');  -- owner session: no RLS
  insert into public.community_posts(author_id, image_url, image_path) values
    (a, 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || a || '/p.jpg', a || '/p.jpg'),
    (r, 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || r || '/p.jpg', r || '/p.jpg');
  insert into public.interaction(viewer_id, target_id, event) values (a, b, 'like'), (b, a, 'impression');
  insert into public.location_change(member_id) values (a), (r);
  -- signal_ledger.to_id has no foreign key: a real member's attempt at a test member must be purged explicitly.
  insert into public.signal_ledger(sender_id, to_id) values (a, b), (r, a), (r, 'eeeeeeee-0000-0000-0000-0000000000e2');
  insert into storage.objects(bucket_id, name, owner) values
    ('profile-photos', a || '/avatar.jpg', null), ('community-posts', 'x/y.jpg', b), ('profile-photos', r || '/avatar.jpg', r);
  -- a genuine signup with the reserved domain but no seed id and no profile yet: the purge must keep it
  insert into auth.users(id, email) values ('eeeeeeee-0000-0000-0000-0000000000e2', 'someone@test.brivia.club');
end $$;
select 'seed.test extras inserted';
\else
-- phase = purged: zero rows remain for the test ids in every table; the real member is untouched.
do $$
declare n int; ids uuid[] := array(select ('a7e57000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 24) g);
begin
  select count(*) into n from auth.users where id = any(ids); if n <> 0 then raise exception 'FAIL P1: % auth.users', n; end if;
  select count(*) into n from public.profiles where id = any(ids) or is_test; if n <> 0 then raise exception 'FAIL P1: % profiles', n; end if;
  select count(*) into n from public.connection_requests where from_id = any(ids) or to_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % requests', n; end if;
  select count(*) into n from public.matches where user1_id = any(ids) or user2_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % matches', n; end if;
  select count(*) into n from public.brivia_blocks where blocker_id = any(ids) or blocked_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % blocks', n; end if;
  select count(*) into n from public.brivia_messages where sender_id = any(ids) or recipient_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % messages', n; end if;
  select count(*) into n from public.community_posts where author_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % posts', n; end if;
  select count(*) into n from public.interaction where viewer_id = any(ids) or target_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % interaction', n; end if;
  select count(*) into n from storage.objects where owner = any(ids) or (storage.foldername(name))[1] = any(array(select unnest(ids)::text)); if n <> 0 then raise exception 'FAIL P1: % storage objects', n; end if;
  select count(*) into n from auth.identities where user_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % identities', n; end if;
  select count(*) into n from public.member_interest where member_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % member_interest', n; end if;
  select count(*) into n from public.member_orbit where member_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % member_orbit', n; end if;
  select count(*) into n from public.location_change where member_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % location_change', n; end if;
  select count(*) into n from public.signal_ledger where sender_id = any(ids) or to_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % signal_ledger', n; end if;
  if not exists (select 1 from auth.users where id = 'eeeeeeee-0000-0000-0000-0000000000e2') then raise exception 'FAIL P3: purge deleted a real @test.brivia.club signup'; end if;
  -- the real member and their data survive
  select count(*) into n from public.profiles where id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real member purged'; end if;
  select count(*) into n from storage.objects where name like 'eeeeeeee%'; if n <> 1 then raise exception 'FAIL P2: real member storage purged'; end if;
  select count(*) into n from public.community_posts where author_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real post purged'; end if;
  if not public.brivia_member_completed('eeeeeeee-0000-0000-0000-0000000000e1') then raise exception 'FAIL P2: real member interests or cell purged'; end if;
  select count(*) into n from public.location_change where member_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real location_change purged'; end if;
  select count(*) into n from public.signal_ledger where sender_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real signal_ledger rows: % (want 1)', n; end if;
end $$;
select 'seed.test P1-P2 purge complete, real member intact OK';
\endif
