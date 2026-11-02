-- Founder request 2026-11-02 (0027, D-128): the covers are reordered and renamed, "OPEN MINDS" is retired.
-- O1 the offered list is the 25 names in the founder's order; OPEN MINDS is not among them
-- O2 a member can switch to any offered cover at any time (first, last, the default); OPEN MINDS is refused (23514)
-- O3 the cleanup nulls a stored OPEN MINDS cover and a legacy hashed /assets/ value naming it, leaves other members'
--    covers alone, and is a no-op when run again
-- O4 a member's cover change touches only their own row
-- Ids: 0c270000-0000-4000-8000-0000000000NN. One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.co(n int) returns uuid language sql immutable as $$
  select ('0c270000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(p_uid uuid) returns void language plpgsql as $f$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.preset(k text) returns text language sql immutable as $$
  select '/Images/Cover%20images/' || k $$;

do $$
declare g int;
begin
  for g in 1..4 loop
    insert into auth.users(id, email) values (pg_temp.co(g), 'order' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test)
    values (pg_temp.co(g), 'Order ' || g, 'Order ' || g, 'order' || g || '@example.com', false)
    on conflict (id) do nothing;
  end loop;
end $$;

-- O1
do $$
declare k text[] := brivia_private.brivia_offered_cover_keys();
begin
  if cardinality(k) <> 25 then raise exception 'FAIL O1: % offered covers, expected 25', cardinality(k); end if;
  if '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG' = any (k) then raise exception 'FAIL O1: OPEN MINDS is still offered'; end if;
  if k[1] <> 'b66eff76-068e-4f2a-b789-a27051a11f5a.png' then raise exception 'FAIL O1: first cover is %', k[1]; end if;
  if k[20] <> '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG' then raise exception 'FAIL O1: 20th cover is %', k[20]; end if;
  if k[25] <> 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG' then raise exception 'FAIL O1: last cover is %', k[25]; end if;
  if (select count(distinct x) from unnest(k) x) <> 25 then raise exception 'FAIL O1: duplicate keys'; end if;
end $$;

-- O2: member 4 walks through first, last and default covers; each save sticks.
do $$
declare c text;
begin
  foreach c in array array['b66eff76-068e-4f2a-b789-a27051a11f5a.png', 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG',
                           '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'] loop
    perform pg_temp.as_member(pg_temp.co(4));
    update public.profiles set cover_url = pg_temp.preset(c) where id = pg_temp.co(4);
    perform pg_temp.as_owner();
    if (select cover_url from public.profiles where id = pg_temp.co(4)) is distinct from pg_temp.preset(c) then
      raise exception 'FAIL O2: % was not saved', c; end if;
  end loop;
end $$;
do $$
declare failed boolean := false;
begin
  perform pg_temp.as_member(pg_temp.co(4));
  begin
    update public.profiles set cover_url = pg_temp.preset('7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG') where id = pg_temp.co(4);
  exception when check_violation then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL O2: OPEN MINDS was accepted'; end if;
end $$;

-- O3: old rows predate 0027; write them with the guard off (owner only, inside this transaction).
alter table public.profiles disable trigger brivia_profiles_cover_offered;
update public.profiles set cover_url = pg_temp.preset('7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG') where id = pg_temp.co(1);
update public.profiles set cover_url = '/assets/7423007B-E17D-4D46-A19F-499CC9A8DB99-Bcr88PbJ.PNG' where id = pg_temp.co(2);
update public.profiles set cover_url = pg_temp.preset('9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG') where id = pg_temp.co(3);
alter table public.profiles enable trigger brivia_profiles_cover_offered;
do $$
declare n int;
begin
  n := brivia_private.brivia_clear_retired_covers();
  if n <> 2 then raise exception 'FAIL O3: cleanup changed % rows, expected 2', n; end if;
  if exists (select 1 from public.profiles where id in (pg_temp.co(1), pg_temp.co(2)) and cover_url is not null) then
    raise exception 'FAIL O3: an OPEN MINDS cover was left'; end if;
  if (select cover_url from public.profiles where id = pg_temp.co(3)) is distinct from pg_temp.preset('9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG') then
    raise exception 'FAIL O3: an offered cover was touched'; end if;
  n := brivia_private.brivia_clear_retired_covers();
  if n <> 0 then raise exception 'FAIL O3: the second run changed % rows', n; end if;
end $$;

-- O4: member 4 cannot change member 3's cover (RLS: the update matches no row).
select pg_temp.as_member(pg_temp.co(4));
update public.profiles set cover_url = pg_temp.preset('94978B9F-A399-43FC-AC48-0A41088B5D27.PNG') where id = pg_temp.co(3);
select pg_temp.as_owner();
do $$
begin
  if (select cover_url from public.profiles where id = pg_temp.co(3)) is distinct from pg_temp.preset('9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG') then
    raise exception 'FAIL O4: another member changed this cover'; end if;
end $$;

rollback;
