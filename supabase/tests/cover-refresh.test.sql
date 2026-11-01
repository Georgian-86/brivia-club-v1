-- Founder request 2026-11-01 (0019, D-116): "THE THOUGHTFUL ROOM" cover is retired and 9 covers are added.
-- R1 the offered list has 26 names: the retired one is gone, the 9 new ones are in, the old 17 stay
-- R2 a member can set a new cover; setting the retired one is refused (23514)
-- R3 the cleanup nulls a stored retired cover and a legacy hashed /assets/ value naming it (test members too), leaves
--    other covers alone, and is a no-op when run again
-- R4 the cleanup function is executable by no client role
-- Ids: 0c190000-0000-4000-8000-0000000000NN. One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.rc(n int) returns uuid language sql immutable as $$
  select ('0c190000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
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
    insert into auth.users(id, email) values (pg_temp.rc(g), 'refresh' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test)
    values (pg_temp.rc(g), 'Refresh ' || g, 'Refresh ' || g, 'refresh' || g || '@example.com', g = 3)
    on conflict (id) do nothing;
  end loop;
end $$;

-- R1
do $$
declare k text[] := brivia_private.brivia_offered_cover_keys();
begin
  if cardinality(k) <> 26 then raise exception 'FAIL R1: % offered covers, expected 26', cardinality(k); end if;
  if '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG' = any (k) then raise exception 'FAIL R1: the retired cover is still offered'; end if;
  if not ('94978B9F-A399-43FC-AC48-0A41088B5D27.PNG' = any (k) and 'EFFF6FA8-4DBE-44CC-8980-661B610AB1A2.PNG' = any (k)
          and 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG' = any (k)) then
    raise exception 'FAIL R1: a new or kept cover is missing'; end if;
  if k[1] <> '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG' then raise exception 'FAIL R1: the first (default) cover is %', k[1]; end if;
end $$;

-- R2
select pg_temp.as_member(pg_temp.rc(4));
update public.profiles set cover_url = pg_temp.preset('0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG') where id = pg_temp.rc(4);
select pg_temp.as_owner();
do $$
declare failed boolean := false;
begin
  if (select cover_url from public.profiles where id = pg_temp.rc(4)) is distinct from pg_temp.preset('0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG') then
    raise exception 'FAIL R2: a new cover was not saved'; end if;
  perform pg_temp.as_member(pg_temp.rc(4));
  begin
    update public.profiles set cover_url = pg_temp.preset('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG') where id = pg_temp.rc(4);
  exception when check_violation then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL R2: the retired cover was accepted'; end if;
end $$;

-- R3: old rows predate 0019; write them with the guard off (owner only, inside this transaction).
alter table public.profiles disable trigger brivia_profiles_cover_offered;
update public.profiles set cover_url = pg_temp.preset('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG') where id = pg_temp.rc(1);
update public.profiles set cover_url = '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Bcr88PbJ.PNG' where id = pg_temp.rc(2);
update public.profiles set cover_url = pg_temp.preset('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG') where id = pg_temp.rc(3);
alter table public.profiles enable trigger brivia_profiles_cover_offered;
do $$
declare n int;
begin
  n := brivia_private.brivia_clear_retired_covers();
  if n <> 3 then raise exception 'FAIL R3: cleanup changed % rows, expected 3', n; end if;
  if exists (select 1 from public.profiles where id in (pg_temp.rc(1), pg_temp.rc(2), pg_temp.rc(3)) and cover_url is not null) then
    raise exception 'FAIL R3: a retired cover was left'; end if;
  if (select cover_url from public.profiles where id = pg_temp.rc(4)) is distinct from pg_temp.preset('0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG') then
    raise exception 'FAIL R3: an offered cover was touched'; end if;
  n := brivia_private.brivia_clear_retired_covers();
  if n <> 0 then raise exception 'FAIL R3: the second run changed % rows', n; end if;
end $$;

-- R4
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'brivia_private.brivia_clear_retired_covers()', 'execute') then
      raise exception 'FAIL R4: % can execute the cleanup', r; end if;
  end loop;
end $$;

rollback;
