-- Seed v3 (test world v3, D-100): 200 more test members, t061-t260, with faceless photos shipped with the site.
-- Run by run.sh in its seed database after the v2 phases: -v phase=seeded (after test-members-v3.sql, run twice) and
-- -v phase=purged (after the purge). NOT picked up by the generic tests loop: it needs the seed.
\if :{?phase}
\else
  \set phase seeded
\endif
select :'phase' = 'seeded' as seeded \gset

\if :seeded
do $$
declare
  v uuid[] := array(select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(61, 260) n);
  bad text;
  n int;
begin
  -- V1: exactly 200 v3 members, all is_test, with their own auth row and identity, emails t061-t260.
  select count(*) into n from public.profiles where id = any (v) and is_test and email ~ '^t[0-9]{3}@test\.brivia\.club$';
  if n <> 200 then raise exception 'V1: expected 200 v3 test members, got %', n; end if;
  select count(*) into n from auth.identities where user_id = any (v) and provider = 'email';
  if n <> 200 then raise exception 'V1: expected 200 identities, got %', n; end if;
  if (select count(*) from public.profiles where is_test) <> 260 then
    raise exception 'V1: expected 260 test members in all (60 v2 + 200 v3), got %', (select count(*) from public.profiles where is_test);
  end if;

  -- V2: the cities and counts of the spec.
  select string_agg(city || ' ' || c, ', ' order by city) into bad from (
    select city, count(*) c from public.profiles where id = any (v) group by city) x;
  if bad <> 'Ahmedabad 6, Bengaluru 30, Chennai 14, Delhi 18, Gurugram 10, Hyderabad 18, Jaipur 6, Kolkata 10, Mumbai 26, Navi Mumbai 10, Noida 8, Pune 22, Thane 22' then
    raise exception 'V2: city counts differ: %', bad;
  end if;

  -- V3: every v3 member is completed (visible in the deck and search), names are unique across the whole test world.
  select count(*) into n from unnest(v) id where not public.brivia_member_completed(id);
  if n <> 0 then raise exception 'V3: % v3 members are not completed', n; end if;
  if exists (select name from public.profiles where is_test group by name having count(*) > 1) then
    raise exception 'V3: a test member name repeats';
  end if;

  -- V4: 2-5 interests, points summing to 20 (the Passion Budget), none sensitive, all active; skills mirrors them.
  if exists (select 1 from unnest(v) id
              left join public.member_interest mi on mi.member_id = id
              group by id having count(mi.*) not between 2 and 5 or coalesce(sum(mi.points), 0) <> 20) then
    raise exception 'V4: a v3 member does not have 2-5 interests summing to 20';
  end if;
  if exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
              where mi.member_id = any (v) and (nd.sensitive or nd.status <> 'active' or nd.level < 3)) then
    raise exception 'V4: a v3 member holds a sensitive, retired or non-selectable interest';
  end if;
  if exists (select 1 from public.profiles p where p.id = any (v)
              and cardinality(p.skills) <> (select count(*) from public.member_interest mi where mi.member_id = p.id)) then
    raise exception 'V4: skills does not mirror the interests';
  end if;

  -- V5: neighbours share interests: in every city, at least 80% of v3 members share 2+ interests with a v3 city-mate.
  select string_agg(city, ', ') into bad from (
    select p.city, avg(case when exists (
             select 1 from public.profiles q join public.member_interest b on b.member_id = q.id
              where q.id = any (v) and q.id <> p.id and q.city = p.city
                and b.interest_id in (select a.interest_id from public.member_interest a where a.member_id = p.id)
              group by q.id having count(*) >= 2) then 1 else 0 end) share
      from public.profiles p where p.id = any (v) group by p.city) x
   where share < 0.8;
  if bad is not null then raise exception 'V5: too little shared interest among neighbours in %', bad; end if;

  -- V6: a home cell for each, in its own city's area (nearest place within the city's region), no coordinate stored.
  select count(*) into n from public.member_orbit o where o.member_id = any (v) and o.precision = 'cell' and o.home_cell is not null;
  if n <> 200 then raise exception 'V6: expected 200 home cells, got %', n; end if;

  -- V7: covers are offered presets; photos are null or exactly the shipped test path.
  if exists (select 1 from public.profiles where id = any (v)
              and (cover_url is null or substr(cover_url, 24) <> all (brivia_private.brivia_offered_cover_keys())
                   or cover_url not like '/Images/Cover%20images/%')) then
    raise exception 'V7: a v3 cover is not an offered preset';
  end if;
  if exists (select 1 from public.profiles where id = any (v) and photo_url is not null
              and photo_url <> '/media/test-members/t' || lpad(substr(id::text, 34)::int::text, 3, '0') || '.webp') then
    raise exception 'V7: a v3 photo_url is not its own shipped path';
  end if;
end $$;

-- V8 (0015): a real member can never store a shipped test photo; a test member can; Storage URLs still work.
do $$
declare ok boolean;
begin
  insert into auth.users(id, email) values ('eeeeeeee-0000-0000-0000-0000000000f1', 'real-v3@example.com') on conflict do nothing;
  insert into public.profiles(id, name, email) values ('eeeeeeee-0000-0000-0000-0000000000f1', 'Real V3', 'real-v3@example.com') on conflict do nothing;
  begin
    update public.profiles set photo_url = '/media/test-members/t061.webp' where id = 'eeeeeeee-0000-0000-0000-0000000000f1';
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'V8: a real member stored a shipped test photo'; end if;
  begin
    update public.profiles set photo_url = '/media/test-members/../x.webp'
     where id = ('a7e57000-0000-4000-8000-' || lpad('61', 12, '0'))::uuid;
    ok := false;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'V8: a test member stored a path outside /media/test-members/tNNN.webp'; end if;
  update public.profiles set photo_url = 'https://x.supabase.co/storage/v1/object/public/profile-photos/eeeeeeee-0000-0000-0000-0000000000f1/a.jpg'
   where id = 'eeeeeeee-0000-0000-0000-0000000000f1';
  delete from public.profiles where id = 'eeeeeeee-0000-0000-0000-0000000000f1';
  delete from auth.users where id = 'eeeeeeee-0000-0000-0000-0000000000f1';
end $$;
select 'seed-v3.test seeded: ok';
\else
-- phase = purged: nothing of v3 remains.
do $$
declare v uuid[] := array(select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(61, 260) n);
begin
  if exists (select 1 from public.profiles where id = any (v)) or exists (select 1 from auth.users where id = any (v))
     or exists (select 1 from auth.identities where user_id = any (v)) or exists (select 1 from public.member_interest where member_id = any (v))
     or exists (select 1 from public.member_orbit where member_id = any (v)) then
    raise exception 'V9: v3 rows remain after the purge';
  end if;
end $$;
select 'seed-v3.test purged: ok';
\endif
