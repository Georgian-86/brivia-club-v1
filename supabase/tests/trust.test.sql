-- Iteration 2 (Trust), Task 1: column-locked profiles; is_test is owner-only.
insert into auth.users(id) values
  ('a1a1a1a1-0000-0000-0000-0000000000a1'), ('b1b1b1b1-0000-0000-0000-0000000000b1'),
  ('c1c1c1c1-0000-0000-0000-0000000000c1')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('a1a1a1a1-0000-0000-0000-0000000000a1','A','A','a1@example.com','Austin'),
       ('b1b1b1b1-0000-0000-0000-0000000000b1','B','B','b1@example.com','Dallas')
on conflict (id) do nothing;

-- Member A: editable columns succeed.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}';
do $$
declare n int;
begin
  update public.profiles set name='A2', full_name='A2', phone='1', phone_country_code='+1', phone_number='1',
    gender='Male', city='Houston', state='TX', experience='x', skills='{a,b}', looking_for='{c}',
    photo_url='p', cover_url='c', updated_at=now()
  where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: editable update touched % rows', n; end if;
end $$;
rollback;

-- Member A: locked columns fail, each in its own savepoint-style block.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array[
    'update public.profiles set is_test = true where id = auth.uid()',
    'update public.profiles set email = ''evil@example.com'' where id = auth.uid()',
    'update public.profiles set created_at = now() - interval ''1 year'' where id = auth.uid()',
    'update public.profiles set id = ''c1c1c1c1-0000-0000-0000-0000000000c1'' where id = auth.uid()'
  ] loop
    failed := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}', true);
    begin
      execute stmt;
    exception when insufficient_privilege then failed := true;
    end;
    reset role;
    if not failed then raise exception 'FAIL: statement should be denied: %', stmt; end if;
  end loop;
end $$;

-- anon cannot update at all.
do $$
declare failed boolean := false;
begin
  set local role anon;
  begin
    update public.profiles set name = 'x';
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL: anon update allowed'; end if;
end $$;

-- Insert as authenticated: email insertable, is_test forced false.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c1c1c1c1-0000-0000-0000-0000000000c1"}';
insert into public.profiles (id, name, full_name, email, is_test)
values ('c1c1c1c1-0000-0000-0000-0000000000c1','C','C','c1@example.com', true);
do $$
begin
  if (select is_test from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: authenticated insert kept is_test=true';
  end if;
end $$;
rollback;

-- Owner (the role running this harness, as the seed script does) may set is_test.
do $$
begin
  insert into public.profiles (id, name, full_name, email, is_test)
  values ('c1c1c1c1-0000-0000-0000-0000000000c1','C','C','c1@test.brivia.club', true);
  if not (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner insert could not set is_test';
  end if;
  update public.profiles set is_test = false where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
  if (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner update could not clear is_test';
  end if;
  update public.profiles set is_test = true where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
  if not (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner update could not set is_test';
  end if;
  delete from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
end $$;

-- Trigger blocks is_test changes even if a future grant re-adds the column.
do $$
begin
  grant update (is_test) on public.profiles to authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}', true);
  update public.profiles set is_test = true where id = auth.uid();
  reset role;
  if (select is_test from public.profiles where id = 'a1a1a1a1-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: trigger did not hold is_test under a column grant';
  end if;
  revoke update (is_test) on public.profiles from authenticated;
end $$;
-- A SECURITY DEFINER function owned by the table owner, called by a member session, cannot set is_test.
create or replace function public.trust_test_definer_set_is_test(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_test = true where id = uid;
  insert into public.profiles (id, name, full_name, email, is_test)
  values ('c1c1c1c1-0000-0000-0000-0000000000c1','C','C','c1d@example.com', true)
  on conflict (id) do nothing;
end $$;
grant execute on function public.trust_test_definer_set_is_test(uuid) to authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'trust_test_login') then
    create role trust_test_login nologin;
  end if;
end $$;
grant authenticated to trust_test_login;
begin;
set session authorization trust_test_login;  -- like authenticator: session_user is not the owner
set local role authenticated;
select public.trust_test_definer_set_is_test('a1a1a1a1-0000-0000-0000-0000000000a1');
reset role;
reset session authorization;
do $$
begin
  if exists (select 1 from public.profiles where id in ('a1a1a1a1-0000-0000-0000-0000000000a1','c1c1c1c1-0000-0000-0000-0000000000c1') and is_test) then
    raise exception 'FAIL: definer function called by a member set is_test';
  end if;
end $$;
rollback;
drop function public.trust_test_definer_set_is_test(uuid);

-- ---------------------------------------------------------------------------------------------
-- Task 2: candidate RPCs replace the open directory (Review Focus 1-3, Rulings P14 and I1).
-- Members (prefix 7...): R1 caller (real), R2 real, R3 real who blocked R1, R4 real blocked by R1,
-- RI real "New Member", RN real without city, RP real "Ann 100%", T1/T2 test world, NP no profile,
-- plus 25 real paging members (some sharing created_at to exercise the (created_at, id) tie-break).
-- ---------------------------------------------------------------------------------------------
insert into auth.users(id)
select ('70000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 9) n
on conflict do nothing;
insert into auth.users(id)
select ('71000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 25) n
on conflict do nothing;
-- Owner inserts (the seed path), so is_test can be set.
insert into public.profiles (id, name, full_name, email, city, skills, looking_for, is_test, created_at) values
  ('70000000-0000-0000-0000-000000000001','Rita Real','Rita Real','r1@example.com','Pune','{Design}','{Cofounder}',false, now() - interval '1 day'),
  ('70000000-0000-0000-0000-000000000002','Ravi Realson','Ravi Realson','r2@example.com','Pune','{Climbing}','{Friends}',false, now() - interval '2 days'),
  ('70000000-0000-0000-0000-000000000003','Bea Blocker','Bea Blocker','r3@example.com','Pune','{Chess}','{Friends}',false, now() - interval '3 days'),
  ('70000000-0000-0000-0000-000000000004','Bo Blocked','Bo Blocked','r4@example.com','Pune','{Chess}','{Friends}',false, now() - interval '4 days'),
  ('70000000-0000-0000-0000-000000000005','New Member','New Member','ri@example.com','Pune','{}','{}',false, now() - interval '5 days'),
  ('70000000-0000-0000-0000-000000000006','Nina Nocity','Nina Nocity','rn@example.com',null,'{}','{}',false, now() - interval '6 days'),
  ('70000000-0000-0000-0000-000000000007','Ann 100%','Ann 100%','rp@example.com','Goa','{Poetry}','{Friends}',false, now() - interval '7 days'),
  ('70000000-0000-0000-0000-000000000008','Zed Testonly','Zed Testonly','t1@test.brivia.club','Pune','{Design}','{Friends}',true, now() - interval '8 days'),
  ('70000000-0000-0000-0000-000000000009','Tara Testa','Tara Testa','t2@test.brivia.club','Pune','{Design}','{Friends}',true, now() - interval '9 days')
on conflict (id) do nothing;
insert into public.profiles (id, name, full_name, email, city, created_at)
select ('71000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Pager ' || n, 'Pager ' || n,
       'p' || n || '@example.com', 'Mumbai',
       -- groups of three share a timestamp
       now() - interval '10 days' - ((n / 3) || ' hours')::interval
from generate_series(1, 25) n
on conflict (id) do nothing;
insert into public.brivia_blocks (blocker_id, blocked_id) values
  ('70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004')
on conflict do nothing;

-- Shape, grants and the closed directory.
do $$
declare n int; f text;
begin
  if to_regtype('public.public_profile_card') is null then raise exception 'FAIL: public_profile_card type missing'; end if;
  select string_agg(a.attname, ',' order by a.attnum) into f from pg_attribute a
   where a.attrelid = (select typrelid from pg_type where oid = 'public.public_profile_card'::regtype)
     and a.attnum > 0 and not a.attisdropped;
  if f is distinct from 'id,name,full_name,gender,city,state,experience,skills,looking_for,photo_url,cover_url,created_at' then
    raise exception 'FAIL: public_profile_card columns = %', f;
  end if;
  foreach f in array array['public.get_candidates(uuid[])','public.search_members(text,integer)',
                           'public.list_members(integer,timestamp with time zone,uuid)'] loop
    if to_regprocedure(f) is null then raise exception 'FAIL: % missing', f; end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception 'FAIL: % not security definer', f; end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(f) and 'search_path=public' = any(proconfig)) then
      raise exception 'FAIL: % has no search_path=public', f;
    end if;
    if (select provolatile from pg_proc where oid = to_regprocedure(f)) <> 's' then raise exception 'FAIL: % not stable', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL: authenticated cannot execute %', f; end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
               where p.oid = to_regprocedure(f) and x.grantee = 0) then
      raise exception 'FAIL: PUBLIC can execute %', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.public_profiles', 'select') then
    raise exception 'FAIL: authenticated can still select public_profiles';
  end if;
end $$;

-- anon is denied every RPC.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array[
    'select * from public.list_members()',
    'select * from public.search_members(''Ravi'')',
    'select * from public.get_candidates(array[''70000000-0000-0000-0000-000000000002''::uuid])'
  ] loop
    failed := false;
    set local role anon;
    begin execute stmt; exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL: anon allowed: %', stmt; end if;
  end loop;
end $$;

-- Authenticated can no longer read the directory view directly.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform 1 from public.public_profiles;
    raise exception 'FAIL: authenticated can select public_profiles';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Everyone R1 should be able to page through, computed as owner (R1's RLS hides the base table).
create table public.trust_t2_expected as
  select array(select p.id from public.profiles p
               where p.id <> '70000000-0000-0000-0000-000000000001' and not p.is_test
                 and p.name <> 'New Member' and p.city is not null
                 and p.id not in ('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004')
               order by p.created_at desc, p.id desc) as ids;
grant select on public.trust_t2_expected to authenticated;

-- Caller R1 (real world).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001"}';
do $$
declare
  n int; ids uuid[]; page1 uuid[]; page2 uuid[]; page3 uuid[]; expected uuid[]; allpages uuid[];
  last_at timestamptz; last_id uuid;
  r1 uuid := '70000000-0000-0000-0000-000000000001'; r2 uuid := '70000000-0000-0000-0000-000000000002';
  r3 uuid := '70000000-0000-0000-0000-000000000003'; r4 uuid := '70000000-0000-0000-0000-000000000004';
  ri uuid := '70000000-0000-0000-0000-000000000005'; rn uuid := '70000000-0000-0000-0000-000000000006';
  t1 uuid := '70000000-0000-0000-0000-000000000008'; t2 uuid := '70000000-0000-0000-0000-000000000009';
  p5 uuid := '71000000-0000-0000-0000-000000000005';
begin
  -- Review Focus 1: a name only a test member has gives 0 results to a real member.
  select count(*) into n from public.search_members('Testonly');
  if n <> 0 then raise exception 'FAIL RF1: real member found test member by search (% rows)', n; end if;
  select count(*) into n from public.search_members('Ravi');
  if n <> 1 then raise exception 'FAIL: real member cannot find real Ravi (% rows)', n; end if;
  select count(*) into n from public.get_candidates(array[t1, t2]);
  if n <> 0 then raise exception 'FAIL P14: get_candidates returned test members to a real member (%)', n; end if;
  select count(*) into n from public.list_members(20) where id in (t1, t2);
  if n <> 0 then raise exception 'FAIL P14: list_members returned test members to a real member'; end if;

  -- Review Focus 2: 500 ids -> at most 50 rows, never the caller; only the first 50 distinct ids count.
  ids := array[r1, r2] || array(select gen_random_uuid() from generate_series(1, 497)) || array[p5];
  if array_length(ids, 1) <> 500 then raise exception 'test bug: % ids', array_length(ids, 1); end if;
  select count(*) into n from public.get_candidates(ids);
  if n <> 1 then raise exception 'FAIL RF2: 500 ids returned % rows (want only R2; P5 is past the cap)', n; end if;
  select count(*) into n from public.get_candidates(ids) where id = r1;
  if n <> 0 then raise exception 'FAIL RF2: get_candidates returned the caller'; end if;
  select count(*) into n from public.get_candidates(array(select '71000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0') from generate_series(1,25) g)::uuid[]
                                                    || array(select r2 from generate_series(1, 60)) || array[p5]);
  if n <> 26 then raise exception 'FAIL: duplicate ids should count once toward the cap (% rows, want 26)', n; end if;
  select count(*) into n from public.get_candidates(array(select '71000000-0000-0000-0000-0000000000'||lpad(g::text,2,'0') from generate_series(1,25) g)::uuid[]
                                                    || array(select gen_random_uuid() from generate_series(1, 25)) || array[r2]);
  if n <> 25 then raise exception 'FAIL: 51st distinct id should be ignored (% rows, want 25)', n; end if;
  select count(*) into n from public.get_candidates(null);
  if n <> 0 then raise exception 'FAIL: null ids returned rows'; end if;
  select count(*) into n from public.get_candidates(array[r1]);
  if n <> 0 then raise exception 'FAIL: caller returned by get_candidates'; end if;

  -- Review Focus 3 (R1 side): blocked pairs invisible in every RPC, both directions.
  select count(*) into n from public.get_candidates(array[r3, r4, r2]);
  if n <> 1 then raise exception 'FAIL RF3: get_candidates shows a blocked pair (% rows)', n; end if;
  select count(*) into n from public.search_members('Blo');
  if n <> 0 then raise exception 'FAIL RF3: search shows a blocked pair (% rows)', n; end if;
  select count(*) into n from public.list_members(20) where id in (r3, r4);
  if n <> 0 then raise exception 'FAIL RF3: list_members shows a blocked pair'; end if;

  -- Ruling I1: incomplete profiles are hidden everywhere.
  select count(*) into n from public.get_candidates(array[ri, rn]);
  if n <> 0 then raise exception 'FAIL I1: get_candidates shows incomplete profiles (%)', n; end if;
  select count(*) into n from public.search_members('Nina') ;
  if n <> 0 then raise exception 'FAIL I1: search shows a city-less profile'; end if;
  select count(*) into n from public.search_members('New Member');
  if n <> 0 then raise exception 'FAIL I1: search shows a New Member profile'; end if;

  -- Search: case-insensitive over name/full_name/city/skills/looking_for; wildcards are literal.
  select count(*) into n from public.search_members('rAVI');
  if n <> 1 then raise exception 'FAIL: search not case-insensitive (%)', n; end if;
  select count(*) into n from public.search_members('climb');
  if n <> 1 then raise exception 'FAIL: search does not match skills (%)', n; end if;
  select count(*) into n from public.search_members('poetry');
  if n <> 1 then raise exception 'FAIL: search does not match skills of Ann (%)', n; end if;
  select count(*) into n from public.search_members('cofounder');
  if n <> 0 then raise exception 'FAIL: search matched only the caller''s looking_for (%)', n; end if;
  select count(*) into n from public.search_members('friends', 20);
  if n <> 2 then raise exception 'FAIL: search does not match looking_for (% rows, want Ravi + Ann)', n; end if;
  select count(*) into n from public.search_members('goa');
  if n <> 1 then raise exception 'FAIL: search does not match city (%)', n; end if;
  select count(*) into n from public.search_members('%');
  if n <> 1 then raise exception 'FAIL: %% is not literal (% rows, want only Ann 100%%)', n; end if;
  select count(*) into n from public.search_members('_');
  if n <> 0 then raise exception 'FAIL: _ is not literal (% rows)', n; end if;
  select count(*) into n from public.search_members('\');
  if n <> 0 then raise exception 'FAIL: backslash query matched (% rows)', n; end if;
  select count(*) into n from public.search_members('');
  if n <> 0 then raise exception 'FAIL: empty query returned % rows', n; end if;
  select count(*) into n from public.search_members('   ');
  if n <> 0 then raise exception 'FAIL: whitespace query returned % rows', n; end if;
  select count(*) into n from public.search_members(null);
  if n <> 0 then raise exception 'FAIL: null query returned % rows', n; end if;
  select count(*) into n from public.search_members('Pager');
  if n <> 20 then raise exception 'FAIL: search default limit (% rows, want 20)', n; end if;
  select count(*) into n from public.search_members('Pager', 1000);
  if n <> 20 then raise exception 'FAIL: search limit not clamped to 20 (%)', n; end if;
  select count(*) into n from public.search_members('Pager', 0);
  if n <> 1 then raise exception 'FAIL: search limit not clamped to 1 (%)', n; end if;
  select count(*) into n from public.search_members('Rita');
  if n <> 0 then raise exception 'FAIL: search returned the caller'; end if;
  if (select array_agg(id) from public.search_members('Pager', 5)) is distinct from
     (select array_agg(id) from public.search_members('Pager', 5)) then
    raise exception 'FAIL: search order is not deterministic';
  end if;

  -- list_members: keyset paging newest first, disjoint pages that together cover everyone visible.
  expected := (select e.ids from public.trust_t2_expected e);
  select array_agg(id) into page1 from public.list_members(20);
  select created_at, id into last_at, last_id from public.list_members(20) offset 19 limit 1;
  select array_agg(id) into page2 from public.list_members(20, last_at, last_id);
  if coalesce(array_length(page1, 1), 0) <> 20 then raise exception 'FAIL: page 1 has % rows', array_length(page1, 1); end if;
  if page1 && page2 then raise exception 'FAIL: pages overlap'; end if;
  allpages := page1 || coalesce(page2, '{}');
  if array_length(page2, 1) = 20 then
    select created_at, id into last_at, last_id from public.list_members(20, last_at, last_id) offset 19 limit 1;
    select array_agg(id) into page3 from public.list_members(20, last_at, last_id);
    allpages := allpages || coalesce(page3, '{}');
  end if;
  if allpages is distinct from expected then
    raise exception 'FAIL: paging did not return every visible member exactly once in order (got %, want %)',
      array_length(allpages, 1), array_length(expected, 1);
  end if;
  -- Small pages split groups of members that share created_at: the (created_at, id) key must not skip or repeat.
  allpages := '{}'; last_at := null; last_id := null;
  loop
    page3 := array(select id from public.list_members(4, last_at, last_id));
    exit when coalesce(array_length(page3, 1), 0) = 0;
    if allpages && page3 then raise exception 'FAIL: small pages overlap'; end if;
    allpages := allpages || page3;
    select created_at, id into last_at, last_id from public.list_members(4, last_at, last_id) offset array_length(page3, 1) - 1 limit 1;
  end loop;
  if allpages is distinct from expected then
    raise exception 'FAIL: 4-row paging skipped or repeated members (got %, want %)', array_length(allpages, 1), array_length(expected, 1);
  end if;
  select count(*) into n from public.list_members(1000);
  if n <> 20 then raise exception 'FAIL: list limit not clamped to 20 (%)', n; end if;
  select count(*) into n from public.list_members(0);
  if n <> 1 then raise exception 'FAIL: list limit not clamped to 1 (%)', n; end if;
  select count(*) into n from public.list_members(20) where id = r1;
  if n <> 0 then raise exception 'FAIL: list_members returned the caller'; end if;
end $$;
rollback;

-- Review Focus 1 reverse and P14 from the test world: T1 sees only the test world.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000008"}';
do $$
declare n int;
begin
  select count(*) into n from public.search_members('Ravi');
  if n <> 0 then raise exception 'FAIL RF1 reverse: test member found a real member (% rows)', n; end if;
  select count(*) into n from public.search_members('Tara');
  if n <> 1 then raise exception 'FAIL: test member cannot find another test member (%)', n; end if;
  select count(*) into n from public.get_candidates(array['70000000-0000-0000-0000-000000000002'::uuid, '70000000-0000-0000-0000-000000000009'::uuid]);
  if n <> 1 then raise exception 'FAIL P14: get_candidates crossed worlds (% rows, want 1)', n; end if;
  select count(*) into n from public.list_members(20);
  if n <> 1 or (select id from public.list_members(20)) <> '70000000-0000-0000-0000-000000000009' then
    raise exception 'FAIL P14: test member deck is not just the test world (% rows)', n;
  end if;
end $$;
rollback;

-- Review Focus 3 from the other side: the blocker (R3) and the blocked (R4) cannot see R1.
do $$
declare who text; n int;
begin
  foreach who in array array['70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    select count(*) into n from public.get_candidates(array['70000000-0000-0000-0000-000000000001'::uuid]);
    if n <> 0 then raise exception 'FAIL RF3: % sees R1 via get_candidates', who; end if;
    select count(*) into n from public.search_members('Rita');
    if n <> 0 then raise exception 'FAIL RF3: % finds R1 via search', who; end if;
    select count(*) into n from public.list_members(20) where id = '70000000-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'FAIL RF3: % sees R1 in list_members', who; end if;
    select count(*) into n from public.search_members('Ravi');
    if n <> 1 then raise exception 'FAIL: % cannot see unrelated R2 (%)', who, n; end if;
    reset role;
  end loop;
end $$;

-- A session without a profile row gets nothing.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000099"}';
do $$
declare n int;
begin
  select (select count(*) from public.list_members(20)) + (select count(*) from public.search_members('Ravi'))
       + (select count(*) from public.get_candidates(array['70000000-0000-0000-0000-000000000002'::uuid])) into n;
  if n <> 0 then raise exception 'FAIL: caller without a profile got % rows', n; end if;
end $$;
rollback;

-- Clean up Task 2 fixtures.
drop table public.trust_t2_expected;
delete from public.brivia_blocks where blocker_id::text like '70000000-%';
delete from public.profiles where id::text like '70000000-%' or id::text like '71000000-%';
delete from auth.users where id::text like '70000000-%' or id::text like '71000000-%';

select 'trust.test OK';
