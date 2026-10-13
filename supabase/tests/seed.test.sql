-- Seed + purge of marked test members (Ruling P7; v2 test world: Phase D, Task 2).
-- Run by run.sh in four phases: -v phase=seeded (after the seed), extras (adds rows to purge), tester (the founder path:
-- a real account becomes a tester, then the purge runs), purged (after the purge).
-- NOT picked up by the generic tests loop: it needs the seed, so it runs in its own database.
--
-- The v2 world (supabase/seed/test-members.sql): 60 members (t01-t60), Mumbai 12, Thane 10, Pune 10, Bengaluru 14,
-- Delhi 14. Per city, the ORBIT roles below (the "first member" F is the city's first v2 member, because the v1
-- members t01-t24 keep their interests and share none with a city-mate):
--   city       F   neighbours (overlap > 0.5)  weak (1 shared, <= 0.25)  flagged   block      far-strong -> partner
--   Bengaluru  25  26 27 28                     02 04                     30 31     25 -> 32   29 -> 45 (Thane)
--   Mumbai     33  34 35 36                     07 09                     38 12     33 -> 11   37 -> 29 (Bengaluru)
--   Thane      39  40 41 42                     43 44                     46 47     39 -> 48   45 -> 29 (Bengaluru)
--   Pune       49  50 51 52                     21 22                     20 24     49 -> 23   21 -> 57 (Delhi)
--   Delhi      53  54 55 56                     14 16                     58 59     53 -> 60   57 -> 21 (Pune)
\if :{?phase}
\else
  \set phase seeded
\endif

-- list_members is executable by no client role since D-038 (R4); its world isolation is still checked through this
-- owner wrapper (security definer; auth.uid() still reads the caller's claims). Members see test members only through
-- deck_candidates, search_members and get_candidates, which S5/S6 also check.
create or replace function pg_temp.list_members(p_limit int default 20)
returns setof public.public_profile_card language sql security definer set search_path = public as $w$
  select * from public.list_members(p_limit) $w$;

-- tNN as a uuid
create or replace function pg_temp.t(n int) returns uuid language sql immutable as $w$
  select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $w$;

-- The deck of p_viewer, in deck order (role authenticated, auth.uid() = p_viewer).
create or replace function pg_temp.deck_ids(p_viewer uuid) returns uuid[] language plpgsql as $w$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(d.id order by d.ord), '{}') into r from public.deck_candidates(20) with ordinality d(id, name, photo_url, cover_url, experience, skills, looking_for, distance_band, shared_interests, ord);
  reset role;
  return r;
end $w$;

-- search_members(p_query) as p_viewer.
create or replace function pg_temp.search_ids(p_viewer uuid, p_query text) returns uuid[] language plpgsql as $w$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(s.id), '{}') into r from public.search_members(p_query, 20) s;
  reset role;
  return r;
end $w$;

-- Overlap of two members as deck_candidates computes it: shared active non-sensitive ids, sum(min(points)) / 20.
create or replace function pg_temp.overlap(a uuid, b uuid, out n int, out overlap numeric) language sql stable as $w$
  select count(*)::int, coalesce(sum(least(ma.points, mb.points)), 0)::numeric / 20
    from public.member_interest ma
    join public.member_interest mb on mb.interest_id = ma.interest_id and mb.member_id = b
    join public.interest_node nd on nd.id = ma.interest_id and nd.status = 'active' and not nd.sensitive
   where ma.member_id = a $w$;

create temp table _roles (city text, f int, nb int[], weak int[], flagged int[], blocker int, blocked int, far int, partner int);
insert into _roles values
  ('Bengaluru', 25, '{26,27,28}', '{2,4}',   '{30,31}', 25, 32, 29, 45),
  ('Mumbai',    33, '{34,35,36}', '{7,9}',   '{38,12}', 33, 11, 37, 29),
  ('Thane',     39, '{40,41,42}', '{43,44}', '{46,47}', 39, 48, 45, 29),
  ('Pune',      49, '{50,51,52}', '{21,22}', '{20,24}', 49, 23, 21, 57),
  ('Delhi',     53, '{54,55,56}', '{14,16}', '{58,59}', 53, 60, 57, 21);

-- A real member (is_test = false) and the founder-style completed profile, created in both phases.
insert into auth.users(id) values ('eeeeeeee-0000-0000-0000-0000000000e1') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city, state, skills, adult_declared_at)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'Real Member', 'Real Member', 'real@example.com', 'Bengaluru', 'Karnataka', '{Python}', now())
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

select :'phase' = 'seeded' as seeded, :'phase' = 'extras' as extras, :'phase' = 'tester' as tester \gset
\if :seeded

do $$
declare n int; ids uuid[]; r record; flagged uuid[];
begin
  -- 60 members, marked, emails, pgcrypto password, unusable
  select count(*) into n from public.profiles where is_test;
  if n <> 60 then raise exception 'FAIL S1: % test profiles, expected 60', n; end if;
  select count(*) into n from public.profiles p join auth.users u on u.id = p.id
   where p.is_test and u.email like 't__@test.brivia.club' and p.email = u.email and u.aud = 'authenticated'
     and u.role = 'authenticated' and u.encrypted_password like '$2%' and u.email_confirmed_at is not null
     and u.confirmation_token = '' and u.recovery_token = '' and u.email_change_token_new = '' and u.email_change = ''
     and u.email_change_token_current = '' and u.phone_change = '' and u.phone_change_token = '' and u.reauthentication_token = ''
     and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
                   and i.provider_id = u.id::text and i.identity_data->>'sub' = u.id::text and i.identity_data->>'email' = u.email);
  if n <> 60 then raise exception 'FAIL S1: only % rows have test emails + auth columns', n; end if;
  select count(*) into n from public.profiles where id = any(array(select pg_temp.t(g) from generate_series(1, 60) g)) and is_test;
  if n <> 60 then raise exception 'FAIL S1: the ids are not t01-t60 (% match)', n; end if;

  -- 10 flagged (2 per city), suspended_pending_review, never expiring
  select array_agg(pg_temp.t(x)) into flagged from _roles, unnest(_roles.flagged) x;
  select count(*) into n from public.member_flag f join public.profiles p on p.id = f.member_id
   where p.is_test and f.reason = 'suspended_pending_review' and f.expires_at is null;
  if n <> 10 then raise exception 'FAIL S2: % flagged test members, expected 10', n; end if;
  if exists (select 1 from public.member_flag f join public.profiles p on p.id = f.member_id
              where p.is_test and not (f.member_id = any(flagged))) then
    raise exception 'FAIL S2: a test member outside the flagged list is flagged'; end if;
  -- every other member is completed (D-030); the flagged ones have everything but are not (invisible)
  select count(*) into n from public.profiles where is_test and not (id = any(flagged)) and not public.brivia_member_completed(id);
  if n <> 0 then raise exception 'FAIL S2: % unflagged test profiles are not completed (D-030)', n; end if;
  select count(*) into n from public.profiles p where p.id = any(flagged)
     and not public.brivia_member_completed(p.id)
     and p.adult_declared_at is not null
     and exists (select 1 from public.member_orbit o where o.member_id = p.id)
     and (select sum(points) from public.member_interest mi where mi.member_id = p.id) = 20
     and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                  where mi.member_id = p.id and not nd.sensitive);
  if n <> 10 then raise exception 'FAIL S2: only % flagged members are complete-but-flagged', n; end if;
  if not public.brivia_member_completed('eeeeeeee-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL S2: positive control: the real member is not completed'; end if;

  -- 2-5 active non-sensitive interests and at most one sensitive each, summing to 20; skills = the non-sensitive labels
  select count(*) into n from public.profiles p where p.is_test and not (
    (select count(*) from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
      where mi.member_id = p.id and nd.status = 'active' and nd.level >= 3 and not nd.sensitive) between 2 and 5
    and (select count(*) from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
          where mi.member_id = p.id and nd.sensitive) <= 1
    and (select count(*) from public.member_interest mi where mi.member_id = p.id)
        = (select count(*) from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
            where mi.member_id = p.id and nd.status = 'active')
    and (select sum(points) from public.member_interest mi where mi.member_id = p.id) = 20
    and p.skills = (select array_agg(nd.label order by mi.points desc, nd.label asc)
                      from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                     where mi.member_id = p.id and not nd.sensitive));
  if n <> 0 then raise exception 'FAIL S2: % test members break the interests / 20 points / skills rule', n; end if;
  -- the v1 members keep their exact v1 interests (spot check: 3-5 interests, all play)
  if exists (select 1 from public.member_interest where member_id = any(array(select pg_temp.t(g) from generate_series(1, 24) g)) and mode <> 'play')
     or (select count(*) from public.member_interest where member_id = pg_temp.t(1)) <> 4
     or not exists (select 1 from public.member_interest where member_id = pg_temp.t(1) and interest_id = 'tech.ai_data.data_analysis' and points = 8) then
    raise exception 'FAIL S2: a v1 member''s interests changed'; end if;

  -- private (sensitive) interests: 3 per city, each with its consent (sensitive_consent_at + one sensitive_give event)
  for r in select p.city, count(*) c from public.profiles p
            where p.is_test and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                                         where mi.member_id = p.id and nd.sensitive)
            group by p.city loop
    if r.c <> 3 then raise exception 'FAIL S2: % has % members with a private interest, expected 3', r.city, r.c; end if;
  end loop;
  select count(*) into n from public.profiles p
   where p.is_test and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                                where mi.member_id = p.id and nd.sensitive)
     and p.sensitive_consent_at is not null
     and (select count(*) from public.consent_event e where e.member_id = p.id and e.kind = 'sensitive_give'
            and e.notice_version = public.brivia_notice_version()) = 1;
  if n <> 15 then raise exception 'FAIL S2: only % of 15 private-interest members have their consent rows', n; end if;
  if exists (select 1 from public.profiles p where p.is_test and p.sensitive_consent_at is not null
               and not exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                                where mi.member_id = p.id and nd.sensitive)) then
    raise exception 'FAIL S2: consent recorded for a member without a private interest'; end if;
  select count(*) into n from public.consent_event e join public.profiles p on p.id = e.member_id where p.is_test;
  if n <> 15 then raise exception 'FAIL S2: % consent_event rows for test members, expected 15', n; end if;
  -- all four modes in every city
  for r in select p.city, count(distinct mi.mode) c from public.profiles p join public.member_interest mi on mi.member_id = p.id
            where p.is_test group by p.city loop
    if r.c <> 4 then raise exception 'FAIL S2: % uses % modes, expected all 4', r.city, r.c; end if;
  end loop;

  -- a cell in their own city: g7 plus the stored grid parents, nearest place = the city, within 3 km of its centroid
  select count(*) into n from public.profiles p join public.member_orbit o on o.member_id = p.id
    join public.place pl on pl.id = o.place_id
   where p.is_test and o.cell_scheme = 'grid1' and o.home_cell like 'g7:%' and o.precision = 'cell'  -- D-038 R2
     and o.home_cell_g6 = public.brivia_grid_parent(o.home_cell, 6) and o.home_cell_g5 = public.brivia_grid_parent(o.home_cell, 5)
     and pl.name = p.city and public.brivia_cell_km(o.home_cell, public.brivia_grid_cell(pl.lat, pl.lng, 7)) <= 3;
  if n <> 60 then raise exception 'FAIL S2: only % test members have a cell in their city', n; end if;
  select count(distinct o.home_cell) into n from public.member_orbit o join public.profiles p on p.id = o.member_id where p.is_test;
  if n < 15 then raise exception 'FAIL S2: only % distinct cells (per-member offset missing)', n; end if;
  if exists (select 1 from public.location_change lc join public.profiles p on p.id = lc.member_id where p.is_test) then
    raise exception 'FAIL S2: the seed wrote location_change rows'; end if;
  if exists (select 1 from public.profiles where is_test and photo_url is not null) then
    raise exception 'FAIL S2: a test member has a photo (monograms only)'; end if;
  if exists (select 1 from public.profiles where is_test and cover_url is not null and not public.brivia_is_preset_cover(cover_url)) then
    raise exception 'FAIL S2: a test cover is not a preset'; end if;
  if (select is_test from public.profiles where id = 'eeeeeeee-0000-0000-0000-0000000000e1') then
    raise exception 'FAIL S2: real member flagged test'; end if;

  -- distribution: Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14; varied skills and looking_for
  for r in select v.city, v.want, (select count(*) from public.profiles p where p.is_test and p.city = v.city) as got
             from (values ('Mumbai', 12), ('Thane', 10), ('Pune', 10), ('Bengaluru', 14), ('Delhi', 14)) v(city, want) loop
    if r.got <> r.want then raise exception 'FAIL S3: city % has % members, expected %', r.city, r.got, r.want; end if;
  end loop;
  select count(distinct city) into n from public.profiles where is_test;
  if n <> 5 then raise exception 'FAIL S3: % cities, expected 5', n; end if;
  select count(distinct skills) into n from public.profiles where is_test;
  if n < 40 then raise exception 'FAIL S3: only % distinct skill sets', n; end if;
  select count(distinct looking_for) into n from public.profiles where is_test;
  if n < 15 then raise exception 'FAIL S3: only % distinct looking_for sets', n; end if;
  if exists (select 1 from public.profiles where is_test and (cardinality(skills) = 0 or cardinality(looking_for) = 0)) then
    raise exception 'FAIL S3: empty skills/looking_for'; end if;

  -- fixtures: 3 matches (1-2, 43-44, 13-14) made by the consent trigger, requests both ways for t01, 5 blocks
  select count(*) into n from public.matches where user1_id::text like 'a7e57000%' or user2_id::text like 'a7e57000%';
  if n <> 3 then raise exception 'FAIL S4: % test matches, expected 3', n; end if;
  select count(*) into n from public.matches m, (values (1, 2), (43, 44), (13, 14)) v(a, b)
   where m.user1_id = least(pg_temp.t(v.a), pg_temp.t(v.b)) and m.user2_id = greatest(pg_temp.t(v.a), pg_temp.t(v.b));
  if n <> 3 then raise exception 'FAIL S4: the matches are not 1-2, 43-44, 13-14 (ordered): % found', n; end if;
  select count(*) into n from public.connection_requests where status = 'accepted';
  if n <> 6 then raise exception 'FAIL S4: % accepted requests, expected 6 (both directions of each match)', n; end if;
  select count(*) into n from public.connection_requests where status = 'pending';
  if n <> 5 then raise exception 'FAIL S4: % pending requests, expected 5', n; end if;
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.t(1) and status = 'pending')
     or (select count(*) from public.connection_requests where to_id = pg_temp.t(1) and status = 'pending') <> 2 then
    raise exception 'FAIL S4: t01 needs pending requests in both directions'; end if;
  if exists (select 1 from public.connection_requests cr join public.profiles p on p.id in (cr.from_id, cr.to_id) where not p.is_test)
     or exists (select 1 from public.matches m join public.profiles p on p.id in (m.user1_id, m.user2_id) where not p.is_test) then
    raise exception 'FAIL S4: fixture touches a real member'; end if;
  -- messages: only between matched pairs, 4-8 per match, 15 in all
  if exists (select 1 from public.brivia_messages b
              where not exists (select 1 from public.matches m where m.user1_id = least(b.sender_id, b.recipient_id)
                                                                and m.user2_id = greatest(b.sender_id, b.recipient_id))) then
    raise exception 'FAIL S4: a message between members who are not matched'; end if;
  for r in select m.user1_id, m.user2_id, (select count(*) from public.brivia_messages b
                                            where least(b.sender_id, b.recipient_id) = m.user1_id
                                              and greatest(b.sender_id, b.recipient_id) = m.user2_id) as c
             from public.matches m loop
    if r.c not between 4 and 8 then raise exception 'FAIL S4: match % - % has % messages (want 4-8)', r.user1_id, r.user2_id, r.c; end if;
  end loop;
  select count(*) into n from public.brivia_messages;
  if n <> 15 then raise exception 'FAIL S4: % messages, expected 15', n; end if;
  if exists (select 1 from public.brivia_messages b group by least(b.sender_id, b.recipient_id), greatest(b.sender_id, b.recipient_id)
              having count(distinct b.sender_id) < 2) then
    raise exception 'FAIL S4: a conversation is one-sided'; end if;
  -- blocks: exactly the 5 role pairs
  select count(*) into n from public.brivia_blocks;
  if n <> 5 then raise exception 'FAIL S4: % blocks, expected 5', n; end if;
  select count(*) into n from public.brivia_blocks b join _roles ro on b.blocker_id = pg_temp.t(ro.blocker) and b.blocked_id = pg_temp.t(ro.blocked);
  if n <> 5 then raise exception 'FAIL S4: only % blocks are the role pairs', n; end if;
  -- 30 posts by visible test members, each a preset illustration (no Storage file), dated in the past
  select count(*) into n from public.community_posts c join public.profiles p on p.id = c.author_id where p.is_test;
  if n <> 30 then raise exception 'FAIL S4: % test posts, expected 30', n; end if;
  select count(*) into n from public.community_posts c
   where public.brivia_is_preset_cover(c.image_url) and c.image_url like '/Images/Cover\%20images/%' and c.image_path = ''
     and c.caption <> '' and c.created_at < now() and not (c.author_id = any(flagged));
  if n <> 30 then raise exception 'FAIL S4: only % posts are preset illustrations by unflagged members', n; end if;
  select count(distinct author_id) into n from public.community_posts;
  if n < 15 then raise exception 'FAIL S4: only % post authors', n; end if;
  select count(distinct (select p.city from public.profiles p where p.id = c.author_id)) into n from public.community_posts c;
  if n <> 5 then raise exception 'FAIL S4: posts come from % cities, expected 5', n; end if;
  -- (no notification table exists: the app derives notifications from these requests, matches and messages)
end $$;
select 'seed.test S1-S4 members, distribution, fixtures OK';

-- A REAL member sees none of them through any RPC, and cannot request or message them.
do $$
declare n int; failed boolean; t uuid := 'a7e57000-0000-4000-8000-000000000003'; ids uuid[];
begin
  select array_agg(id) into ids from public.profiles where is_test;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-0000000000e1"}', true);
  select count(*) into n from pg_temp.list_members(20);
  if n <> 0 then raise exception 'FAIL S5: real member lists % rows', n; end if;
  select count(*) into n from public.deck_candidates(20) where id = any(ids);
  if n <> 0 then raise exception 'FAIL S5: real member''s deck shows % test members', n; end if;
  select count(*) into n from public.search_members('Bengaluru', 20) where id = any(ids);
  if n <> 0 then raise exception 'FAIL S5: real member searches % test rows by city', n; end if;
  select count(*) into n from public.search_members('test.brivia', 20)
    ; if n <> 0 then raise exception 'FAIL S5: search by email domain returned %', n; end if;
  select count(*) into n from public.search_members('Aarav', 20); if n <> 0 then raise exception 'FAIL S5: search by name returned %', n; end if;
  select count(*) into n from public.get_candidates(ids); if n <> 0 then raise exception 'FAIL S5: get_candidates returned %', n; end if;
  select count(*) into n from public.connection_requests; if n <> 0 then raise exception 'FAIL S5: real member sees % requests', n; end if;
  select count(*) into n from public.matches; if n <> 0 then raise exception 'FAIL S5: real member sees % matches', n; end if;
  select count(*) into n from public.community_posts where author_id = any(ids);
  if n <> 0 then raise exception 'FAIL S5: real member sees % test posts', n; end if;
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
  select count(*) into n from pg_temp.list_members(20); if n <> 20 then raise exception 'FAIL S6: test member lists %', n; end if;
  -- the deck (D-038): member 1 (Bengaluru) sees only Bengaluru members (place rule; no density yet, so no km band)
  select count(*) into n from public.deck_candidates(20) d where d.distance_band <> 'Bengaluru';
  if n <> 0 then raise exception 'FAIL S6: member 1 deck has % cards outside Bengaluru', n; end if;
  select count(*) into n from public.deck_candidates(20) d where d.id::text like f || '%';
  if n < 8 then raise exception 'FAIL S6: member 1 deck has only % cards', n; end if;
  select count(*) into n from public.get_candidates(array['eeeeeeee-0000-0000-0000-0000000000e1'::uuid]);
  if n <> 0 then raise exception 'FAIL S6: test member sees a real member'; end if;
  select count(*) into n from public.matches; if n <> 1 then raise exception 'FAIL S6: member 1 sees % matches', n; end if;
  select count(*) into n from public.brivia_messages; if n <> 5 then raise exception 'FAIL S6: member 1 reads % messages, expected 5', n; end if;
  select count(*) into n from public.connection_requests where to_id = auth.uid() and status = 'pending';
  if n <> 2 then raise exception 'FAIL S6: member 1 has % pending incoming, expected 2', n; end if;
  select count(*) into n from public.community_posts; if n <> 30 then raise exception 'FAIL S6: member 1 sees % posts, expected 30', n; end if;
  reset role;
end $$;
select 'seed.test S5-S6 real member isolation OK';

-- S8. ORBIT checks, per city (roles in the header and _roles).
do $$
declare r record; d uuid[]; s uuid[]; o record; n int; flagged uuid[]; v int; nm text;
begin
  select array_agg(pg_temp.t(x)) into flagged from _roles, unnest(_roles.flagged) x;
  for r in select * from _roles loop
    -- the roles hold as designed: neighbours share 2+ interests with overlap > 0.5 and sit within 3 km (ring 0);
    -- the weak members share exactly one interest with overlap <= 0.25; the blocked member is a strong match too
    foreach v in array r.nb loop
      o := pg_temp.overlap(pg_temp.t(r.f), pg_temp.t(v));
      if o.n < 2 or o.overlap <= 0.5 then raise exception 'FAIL S8 %: neighbour t% shares % (overlap %)', r.city, v, o.n, o.overlap; end if;
      if public.brivia_ring(public.brivia_cell_km((select home_cell from public.member_orbit where member_id = pg_temp.t(r.f)),
                                                  (select home_cell from public.member_orbit where member_id = pg_temp.t(v)))) <> 0 then
        raise exception 'FAIL S8 %: neighbour t% is not within 3 km', r.city, v; end if;
    end loop;
    foreach v in array r.weak loop
      o := pg_temp.overlap(pg_temp.t(r.f), pg_temp.t(v));
      if o.n <> 1 or o.overlap > 0.25 then raise exception 'FAIL S8 %: weak t% shares % (overlap %)', r.city, v, o.n, o.overlap; end if;
    end loop;

    -- every other member in F's place pool (<= 60 km) is at overlap level <= 2 (<= 0.5), so the neighbours lead the
    -- deck on every day, whatever the daily tie-break (brivia_deck_tie)
    select count(*) into n
      from public.member_orbit ot join public.place tp on tp.id = ot.place_id,
           public.member_orbit of join public.place fp on fp.id = of.place_id
     where of.member_id = pg_temp.t(r.f) and ot.member_id <> of.member_id
       and not (ot.member_id = any(array(select pg_temp.t(x) from unnest(r.nb) x)))
       and public.brivia_haversine_km(fp.lat, fp.lng, tp.lat, tp.lng) <= 60
       and public.brivia_visible_to(of.member_id, ot.member_id)
       and (pg_temp.overlap(of.member_id, ot.member_id)).overlap > 0.5;
    if n <> 0 then raise exception 'FAIL S8 %: % other members compete with the neighbours of t%', r.city, n, r.f; end if;

    -- 1. the first member's deck: its 3 neighbours first (in any order), then everyone else; never a flagged or
    --    blocked member; the weak members are in it; nobody from another place pool
    d := pg_temp.deck_ids(pg_temp.t(r.f));
    if cardinality(d) < 6 then raise exception 'FAIL S8 %: deck of t% has only % cards', r.city, r.f, cardinality(d); end if;
    if not (d[1:3] @> array(select pg_temp.t(x) from unnest(r.nb) x) and array(select pg_temp.t(x) from unnest(r.nb) x) @> d[1:3]) then
      raise exception 'FAIL S8 %: deck of t% does not start with its 3 neighbours: %', r.city, r.f, d[1:3]; end if;
    if d && flagged then raise exception 'FAIL S8 %: deck of t% shows a flagged member', r.city, r.f; end if;
    if pg_temp.t(r.blocked) = any(d) then raise exception 'FAIL S8 %: deck of t% shows the member it blocked', r.city, r.f; end if;
    if not (d @> array(select pg_temp.t(x) from unnest(r.weak) x)) then
      raise exception 'FAIL S8 %: deck of t% misses a weak-overlap member', r.city, r.f; end if;
    if pg_temp.t(r.partner) = any(d) then
      raise exception 'FAIL S8 %: deck of t% shows the far partner t%', r.city, r.f, r.partner; end if;
    -- the blocked member does not see the blocker either
    if pg_temp.t(r.blocker) = any(pg_temp.deck_ids(pg_temp.t(r.blocked))) then
      raise exception 'FAIL S8 %: t% still sees t% after the block', r.city, r.blocked, r.blocker; end if;

    -- 2. the far-but-strong match: >= 3 shared interests, > 350 km apart (ring >= 3), never in the interim deck (it has
    --    no Worth-the-Distance lane: the gate is ORBIT's, tests/unit/seed-orbit.test.mjs), found through search
    o := pg_temp.overlap(pg_temp.t(r.far), pg_temp.t(r.partner));
    if o.n < 3 then raise exception 'FAIL S8 %: far pair t%-t% shares only %', r.city, r.far, r.partner, o.n; end if;
    if (select public.brivia_haversine_km(a.lat, a.lng, b.lat, b.lng)
          from public.member_orbit oa join public.place a on a.id = oa.place_id,
               public.member_orbit ob join public.place b on b.id = ob.place_id
         where oa.member_id = pg_temp.t(r.far) and ob.member_id = pg_temp.t(r.partner)) <= 350 then
      raise exception 'FAIL S8 %: far pair t%-t% is not more than 350 km apart', r.city, r.far, r.partner; end if;
    if pg_temp.t(r.partner) = any(pg_temp.deck_ids(pg_temp.t(r.far))) then
      raise exception 'FAIL S8 %: the far partner t% is in the deck of t%', r.city, r.partner, r.far; end if;
    select name into nm from public.profiles where id = pg_temp.t(r.partner);
    s := pg_temp.search_ids(pg_temp.t(r.far), nm);
    if not (pg_temp.t(r.partner) = any(s)) then
      raise exception 'FAIL S8 %: search for "%" as t% does not find the far partner', r.city, nm, r.far; end if;

    -- 3. a flagged member is found by nobody's search either
    foreach v in array r.flagged loop
      select name into nm from public.profiles where id = pg_temp.t(v);
      if pg_temp.t(v) = any(pg_temp.search_ids(pg_temp.t(r.f), nm)) then
        raise exception 'FAIL S8 %: search finds the flagged t%', r.city, v; end if;
    end loop;
  end loop;

  -- 4. no flagged member is in ANY test member's deck
  for v in select g from generate_series(1, 60) g where not (pg_temp.t(g) = any(flagged)) loop
    if pg_temp.deck_ids(pg_temp.t(v)) && flagged then raise exception 'FAIL S8: the deck of t% shows a flagged member', v; end if;
  end loop;
end $$;
select 'seed.test S8 ORBIT roles (neighbours first, flagged invisible, blocks, far match only through the gate) OK';

-- Seeding twice changes nothing (idempotent): run.sh re-runs the seed before these checks, and the exact counts above
-- (60 members, 30 posts, 15 messages, 15 consent rows, 5 blocks, 10 flags) would double otherwise.
select count(*) = 60 as ok from public.profiles where is_test \gset
\if :ok
\else
  do $$ begin raise exception 'FAIL S7: expected exactly 60 test profiles after re-seed'; end $$;
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
  -- consent_event.member_id has no foreign key either (R3): a real member's own row must survive the purge.
  insert into public.consent_event(member_id, kind, notice_version) values (r, 'adult', public.brivia_notice_version());
  insert into storage.objects(bucket_id, name, owner) values
    ('profile-photos', a || '/avatar.jpg', null), ('community-posts', 'x/y.jpg', b), ('profile-photos', r || '/avatar.jpg', r);
  -- a genuine signup with the reserved domain but no seed id and no profile yet: the purge must keep it
  insert into auth.users(id, email) values ('eeeeeeee-0000-0000-0000-0000000000e2', 'someone@test.brivia.club');
end $$;
select 'seed.test extras inserted';
\elif :tester
-- Founder path (0008 is applied in this harness; the v2 seed is the only seed state, v1 is not separable). Two completed
-- real accounts: R1 (the real member above, becomes the tester) and R2 (stays a plain real member).
do $$
declare r1 uuid := 'eeeeeeee-0000-0000-0000-0000000000e1'; r2 uuid := 'eeeeeeee-0000-0000-0000-0000000000e3';
        n int; d uuid[]; s uuid[];
begin
  insert into auth.users(id) values (r2) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email, city, state, skills, adult_declared_at)
  values (r2, 'Other Founder', 'Other Founder', 'other@example.com', 'Bengaluru', 'Karnataka', '{Python}', now())
  on conflict (id) do nothing;
  insert into public.member_interest (member_id, interest_id, points, mode) values
    (r2, 'tech.ai_data.data_analysis', 12, 'play'), (r2, 'sports.racket.badminton', 8, 'play') on conflict do nothing;
  insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
  select r2, c, public.brivia_grid_parent(c, 6), public.brivia_grid_parent(c, 5), 'in-bengaluru'
    from (select public.brivia_grid_cell(12.9716, 77.5946, 7) as c) x on conflict (member_id) do nothing;
  if not public.brivia_member_completed(r1) or not public.brivia_member_completed(r2) then
    raise exception 'FAIL T0: both real accounts must be completed'; end if;

  -- before: R2 finds R1 by search (positive control), neither is a tester, R1's deck has no test member
  if not (r1 = any(pg_temp.search_ids(r2, 'Real Member'))) then raise exception 'FAIL T1: control: R2 cannot find R1 before the switch'; end if;
  d := pg_temp.deck_ids(r1);
  if exists (select 1 from unnest(d) x join public.profiles p on p.id = x where p.is_test) then
    raise exception 'FAIL T1: a non-tester deck holds a test member'; end if;

  insert into public.brivia_tester(member_id) values (r1);

  -- after: R1's deck is non-empty and holds only test members; R2 can no longer find R1
  d := pg_temp.deck_ids(r1);
  if coalesce(array_length(d, 1), 0) = 0 then raise exception 'FAIL T2: the tester deck is empty'; end if;
  if exists (select 1 from unnest(d) x join public.profiles p on p.id = x where not p.is_test) then
    raise exception 'FAIL T2: the tester deck holds a real member'; end if;
  if r1 = any(pg_temp.search_ids(r2, 'Real Member')) then raise exception 'FAIL T3: a real account finds the tester'; end if;
  s := pg_temp.search_ids(r2, 'Real Member');
  if exists (select 1 from unnest(s) x join public.profiles p on p.id = x where p.is_test) then
    raise exception 'FAIL T3: a real account sees a test member in search'; end if;
  if exists (select 1 from unnest(pg_temp.deck_ids(r2)) x where x = r1) then raise exception 'FAIL T3: R2 deck holds the tester'; end if;
end $$;
select 'seed.test T1-T3 founder path (tester deck is test-only, tester hidden from real accounts) OK';

\else
-- phase = purged: zero rows remain for the test ids in every table; the real member is untouched.
do $$
declare n int; ids uuid[] := array(select ('a7e57000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 60) g);
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
  select count(*) into n from public.member_flag where member_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % member_flag', n; end if;
  select count(*) into n from public.consent_event where member_id = any(ids); if n <> 0 then raise exception 'FAIL P1: % consent_event', n; end if;
  if not exists (select 1 from auth.users where id = 'eeeeeeee-0000-0000-0000-0000000000e2') then raise exception 'FAIL P3: purge deleted a real @test.brivia.club signup'; end if;
  -- the real member and their data survive
  select count(*) into n from public.profiles where id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real member purged'; end if;
  select count(*) into n from storage.objects where name like 'eeeeeeee%'; if n <> 1 then raise exception 'FAIL P2: real member storage purged'; end if;
  select count(*) into n from public.community_posts where author_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real post purged'; end if;
  if not public.brivia_member_completed('eeeeeeee-0000-0000-0000-0000000000e1') then raise exception 'FAIL P2: real member interests or cell purged'; end if;
  select count(*) into n from public.location_change where member_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real location_change purged'; end if;
  -- the founder path: both real accounts survive the purge, are not test, are still completed; nobody is a tester
  select count(*) into n from public.profiles where id in ('eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-0000000000e3') and not is_test;
  if n <> 2 then raise exception 'FAIL P4: both real accounts must survive the purge with is_test false (% do)', n; end if;
  if not public.brivia_member_completed('eeeeeeee-0000-0000-0000-0000000000e3') then raise exception 'FAIL P4: the second real account is no longer completed'; end if;
  select count(*) into n from public.brivia_tester; if n <> 0 then raise exception 'FAIL P4: brivia_tester not empty after the purge (% rows)', n; end if;
  select count(*) into n from public.signal_ledger where sender_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real signal_ledger rows: % (want 1)', n; end if;
  select count(*) into n from public.consent_event where member_id = 'eeeeeeee-0000-0000-0000-0000000000e1'; if n <> 1 then raise exception 'FAIL P2: real consent_event rows: % (want 1)', n; end if;
end $$;
select 'seed.test P1-P2 purge complete, real member intact OK';
\endif
