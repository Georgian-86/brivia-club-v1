-- Founder request 2026-10-22 (0014, D-080): covers only from the provided set.
-- V1 a member cannot set an uploaded (own profile-covers Storage URL), external, preset-shaped-but-not-offered or
--    traversal cover, on update or on insert (23514 cover_not_offered)
-- V2 an offered preset and null work ('' was already refused by the 0003 CHECK); an update that leaves a legacy cover unchanged still works
-- V3 the cleanup maps the legacy Vite-hashed /assets/ paths to their preset, nulls an uploaded cover and an unknown
--    path, leaves offered covers and test members untouched, and is a no-op when run again
-- V4 storage: a member can no longer insert or update an object in profile-covers (the insert and update policies are
--    gone); select and delete still work, and profile-photos uploads are unaffected
-- V5 the helpers are executable by no client role; the guard is a trigger on profiles
-- Ids: 0c000000-0000-4000-8000-0000000000NN. One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.cm(n int) returns uuid language sql immutable as $$
  select ('0c000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(p_uid uuid) returns void language plpgsql as $f$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;
create or replace function pg_temp.preset(k text) returns text language sql immutable as $$
  select '/Images/Cover%20images/' || k $$;
create or replace function pg_temp.upload(p_uid uuid) returns text language sql immutable as $$
  select 'https://proj.supabase.co/storage/v1/object/public/profile-covers/' || p_uid::text || '/c.jpg' $$;

-- Members: 1 M (offered preset), 2 U (uploaded), 3 L1 (legacy webp hash), 4 L2 (legacy PNG hash), 5 X (unknown /assets/),
-- 6 T (test member, uploaded), 7 N (no cover), 8 S (preset written with a space instead of %20).
do $$
declare g int;
begin
  for g in 1..9 loop
    insert into auth.users(id, email) values (pg_temp.cm(g), 'cover' || g || '@example.com') on conflict do nothing;
  end loop;
  for g in 1..8 loop
    insert into public.profiles (id, name, full_name, email, is_test)
    values (pg_temp.cm(g), 'Cover ' || g, 'Cover ' || g, 'cover' || g || '@example.com', g = 6)
    on conflict (id) do nothing;
  end loop;
end $$;
-- Live legacy data predates the guard: write it with the guard off (owner only, inside this transaction).
alter table public.profiles disable trigger brivia_profiles_cover_offered;
update public.profiles set cover_url = pg_temp.preset('2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG') where id = pg_temp.cm(1);
update public.profiles set cover_url = pg_temp.upload(pg_temp.cm(2)) where id = pg_temp.cm(2);
update public.profiles set cover_url = '/assets/F28EA63E-1BEB-49E9-BA01-F62127017DB1-B4-NibCZ.webp' where id = pg_temp.cm(3);
update public.profiles set cover_url = '/assets/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF-Bcr88PbJ.PNG' where id = pg_temp.cm(4);
update public.profiles set cover_url = '/assets/brand-logo-AbCdEf12.png' where id = pg_temp.cm(5);
update public.profiles set cover_url = pg_temp.upload(pg_temp.cm(6)) where id = pg_temp.cm(6);
update public.profiles set cover_url = '/Images/Cover images/3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG' where id = pg_temp.cm(8);
alter table public.profiles enable trigger brivia_profiles_cover_offered;

-- V2 (before the cleanup): a legacy value re-sent unchanged (the client rewrites the row it read) is accepted.
select pg_temp.as_member(pg_temp.cm(3));
update public.profiles set name = 'Cover 3b', cover_url = cover_url where id = pg_temp.cm(3);
select pg_temp.as_owner();
do $$ begin
  if (select name from public.profiles where id = pg_temp.cm(3)) <> 'Cover 3b' then raise exception 'FAIL V2: unchanged legacy cover blocked the save'; end if;
end $$;

-- V1: refused values, as the member, on update.
do $$
declare v text; failed boolean;
begin
  foreach v in array array[
    pg_temp.upload(pg_temp.cm(7)),
    'https://evil.example.com/c.jpg',
    '/assets/c.png',
    '/Images/Cover%20images/not-a-preset.PNG',
    '/Images/Cover%20images/../2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG',
    '/Images/Cover%20images/2257522a-04b9-4e3e-ab1a-a73d7bb8ccbf.png',
    pg_temp.preset('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'),  -- retired by 0019 (D-116)
    'data:image/png;base64,AAAA'
  ] loop
    failed := false;
    perform pg_temp.as_member(pg_temp.cm(7));
    begin
      update public.profiles set cover_url = v where id = pg_temp.cm(7);
    exception when check_violation then failed := true;
    end;
    perform pg_temp.as_owner();
    if not failed then raise exception 'FAIL V1: cover accepted: %', v; end if;
  end loop;
  -- Insert with an uploaded cover (a new member's first row) is refused too.
  failed := false;
  perform pg_temp.as_member(pg_temp.cm(9));
  begin
    insert into public.profiles (id, name, full_name, email, cover_url)
    values (pg_temp.cm(9), 'Cover 9', 'Cover 9', 'cover9@example.com', pg_temp.upload(pg_temp.cm(9)));
  exception when check_violation then failed := true;
  end;
  perform pg_temp.as_owner();
  if not failed then raise exception 'FAIL V1: insert with an uploaded cover accepted'; end if;
end $$;

-- V2: offered and null work.
do $$
declare v text; got text;
begin
  foreach v in array array[pg_temp.preset('F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'), pg_temp.preset('2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg'), null] loop
    perform pg_temp.as_member(pg_temp.cm(7));
    update public.profiles set cover_url = v where id = pg_temp.cm(7);
    perform pg_temp.as_owner();
    select cover_url into got from public.profiles where id = pg_temp.cm(7);
    if got is distinct from v then raise exception 'FAIL V2: % stored as %', v, got; end if;
  end loop;
  perform pg_temp.as_member(pg_temp.cm(9));
  insert into public.profiles (id, name, full_name, email, cover_url)
  values (pg_temp.cm(9), 'Cover 9', 'Cover 9', 'cover9@example.com', pg_temp.preset('E7E0AFAA-B547-4228-97C0-88E527151123.PNG'));
  perform pg_temp.as_owner();
end $$;

-- V3: the cleanup.
do $$
declare n int; got text;
begin
  n := brivia_private.brivia_cleanup_custom_covers();
  if n < 5 then raise exception 'FAIL V3: cleanup changed % rows, expected at least 5', n; end if;
  for got in select format('%s=%s', right(id::text, 2), coalesce(cover_url, 'null')) from public.profiles
              where id in (pg_temp.cm(1), pg_temp.cm(2), pg_temp.cm(3), pg_temp.cm(4), pg_temp.cm(5), pg_temp.cm(6), pg_temp.cm(8)) order by id loop
    raise debug '%', got;
  end loop;
  if (select cover_url from public.profiles where id = pg_temp.cm(1)) is distinct from pg_temp.preset('2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG') then
    raise exception 'FAIL V3: an offered cover was changed'; end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(2)) is not null then
    raise exception 'FAIL V3: the uploaded cover was not cleared'; end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(3)) is distinct from pg_temp.preset('F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG') then
    raise exception 'FAIL V3: legacy webp path not mapped: %', (select cover_url from public.profiles where id = pg_temp.cm(3)); end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(4)) is distinct from pg_temp.preset('2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG') then
    raise exception 'FAIL V3: legacy PNG path not mapped: %', (select cover_url from public.profiles where id = pg_temp.cm(4)); end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(5)) is not null then
    raise exception 'FAIL V3: an unknown /assets/ path was not cleared'; end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(6)) is distinct from pg_temp.upload(pg_temp.cm(6)) then
    raise exception 'FAIL V3: a test member was touched'; end if;
  if (select cover_url from public.profiles where id = pg_temp.cm(8)) is distinct from pg_temp.preset('3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG') then
    raise exception 'FAIL V3: a spaced preset path was not made canonical'; end if;
  n := brivia_private.brivia_cleanup_custom_covers();
  if n <> 0 then raise exception 'FAIL V3: the second run changed % rows', n; end if;
end $$;

-- V4: storage.
insert into storage.objects (bucket_id, name) values ('profile-covers', pg_temp.cm(2)::text || '/old.jpg');
do $$
declare failed boolean := false; n int;
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname in ('Members can upload their profile cover', 'Members can update their profile cover')) then
    raise exception 'FAIL V4: a profile-covers insert/update policy still exists'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('Members can view their own profile covers', 'Members can delete their profile covers')) <> 2 then
    raise exception 'FAIL V4: the profile-covers select/delete policies are missing'; end if;
  perform pg_temp.as_member(pg_temp.cm(2));
  begin
    insert into storage.objects (bucket_id, name) values ('profile-covers', pg_temp.cm(2)::text || '/new.jpg');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then perform pg_temp.as_owner(); raise exception 'FAIL V4: a profile-covers upload was accepted'; end if;
  update storage.objects set name = pg_temp.cm(2)::text || '/renamed.jpg' where bucket_id = 'profile-covers' and name = pg_temp.cm(2)::text || '/old.jpg';
  get diagnostics n = row_count;
  if n <> 0 then perform pg_temp.as_owner(); raise exception 'FAIL V4: a profile-covers object was updated'; end if;
  if (select count(*) from storage.objects where bucket_id = 'profile-covers' and name = pg_temp.cm(2)::text || '/old.jpg') <> 1 then
    perform pg_temp.as_owner(); raise exception 'FAIL V4: the member can no longer see the old cover file'; end if;
  insert into storage.objects (bucket_id, name) values ('profile-photos', pg_temp.cm(2)::text || '/p.jpg');
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'profile-covers' and name = pg_temp.cm(2)::text || '/old.jpg';
  get diagnostics n = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  perform pg_temp.as_owner();
  if n <> 1 then raise exception 'FAIL V4: the member could not delete the old cover file (%)', n; end if;
end $$;

-- V5: no client role can call the helpers; the trigger is on profiles.
do $$
declare f text; r text;
begin
  foreach f in array array['brivia_private.brivia_offered_cover_keys()', 'brivia_private.brivia_is_offered_cover(text)',
                           'brivia_private.brivia_offered_cover_for(text)', 'brivia_private.brivia_guard_cover_url()',
                           'brivia_private.brivia_cleanup_custom_covers()'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL V5: % can execute %', r, f; end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'brivia_profiles_cover_offered' and tgenabled = 'O') then
    raise exception 'FAIL V5: the cover trigger is missing or disabled'; end if;
end $$;

rollback;
