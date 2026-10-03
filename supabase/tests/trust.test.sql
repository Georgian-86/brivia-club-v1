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
select ('70000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 16) n
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
  ('70000000-0000-0000-0000-000000000009','Tara Testa','Tara Testa','t2@test.brivia.club','Pune','{Design}','{Friends}',true, now() - interval '9 days'),
  -- Ruling I3 edge cases: padded "New Member", empty and whitespace-only names and cities are NOT completed;
  -- a padded real name and city IS completed.
  ('70000000-0000-0000-0000-000000000010','  New Member  ','  New Member  ','e10@example.com','Pune','{}','{}',false, now() - interval '10 hours'),
  ('70000000-0000-0000-0000-000000000011','','','e11@example.com','Pune','{}','{}',false, now() - interval '11 hours'),
  ('70000000-0000-0000-0000-000000000012','   ','   ','e12@example.com','Pune','{}','{}',false, now() - interval '12 hours'),
  ('70000000-0000-0000-0000-000000000013','Empty City','Empty City','e13@example.com','','{}','{}',false, now() - interval '13 hours'),
  ('70000000-0000-0000-0000-000000000014','Space City','Space City','e14@example.com','   ','{}','{}',false, now() - interval '14 hours'),
  ('70000000-0000-0000-0000-000000000015','  Pat Padded  ','  Pat Padded  ','e15@example.com','  Pune ','{}','{}',false, now() - interval '15 hours')
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
                 and public.brivia_is_completed(p.name, p.city)
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


-- ---------------------------------------------------------------------------------------------
-- Task 2 fix round 1: Rulings I3 (completed helper), I5 (caller completed), I4 (posts), I6 (world
-- isolation for requests and messages).
-- ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  if to_regprocedure('public.brivia_is_completed(text,text)') is null then raise exception 'FAIL I3: brivia_is_completed missing'; end if;
  if public.brivia_is_completed('  New Member  ', 'Pune') or public.brivia_is_completed('', 'Pune')
     or public.brivia_is_completed('   ', 'Pune') or public.brivia_is_completed(null, 'Pune')
     or public.brivia_is_completed('Ann', '') or public.brivia_is_completed('Ann', '   ')
     or public.brivia_is_completed('Ann', null) then
    raise exception 'FAIL I3: brivia_is_completed accepts an incomplete profile';
  end if;
  if not public.brivia_is_completed('  Pat  ', ' Pune ') then raise exception 'FAIL I3: padded name and city rejected'; end if;
  foreach f in array array['public.brivia_same_world(uuid,uuid)', 'public.brivia_can_see_author(uuid)'] loop
    if to_regprocedure(f) is null then raise exception 'FAIL: % missing', f; end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then raise exception 'FAIL: % not security definer', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' and cmd = 'INSERT') <> 1 then
    raise exception 'FAIL I6: brivia_messages must keep exactly one insert policy';
  end if;
end $$;

-- Owner fixtures: posts by R1, R2, R3 (blocked R1), R4 (blocked by R1), T1, T2, RN (no city);
-- matches R1-R2 (same world) and R1-T1 (a legacy cross-world row).
insert into public.community_posts (author_id, image_url, image_path, caption)
select ('70000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u', 'p', 'post ' || n
from unnest(array[1, 2, 3, 4, 6, 8, 9]) n;
insert into public.matches (user1_id, user2_id) values
  ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000008')
on conflict do nothing;

do $$
declare who text; want text; got text; n int;
begin
  -- caller => the post authors (last two digits) they must see, exactly.
  foreach who in array array['01:01,02,06', '03:02,03,04,06', '04:02,03,04,06', '08:08,09', '09:08,09', '06:06', '15:01,02,03,04,06'] loop
    want := split_part(who, ':', 2);
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', '70000000-0000-0000-0000-0000000000' || split_part(who, ':', 1))::text, true);
    select string_agg(right(author_id::text, 2), ',' order by author_id) into got
      from public.community_posts where author_id::text like '70000000-%';
    reset role;
    if got is distinct from want then
      raise exception 'FAIL I4: member % sees posts by % (want %)', split_part(who, ':', 1), got, want;
    end if;
  end loop;
  -- Same-world helper never answers a third party.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003"}', true);
  if public.brivia_same_world('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002') then
    reset role; raise exception 'FAIL: brivia_same_world answers a third party';
  end if;
  reset role;
end $$;

-- Ruling I5: a caller who is not completed (no city; whitespace-only city) gets 0 rows from every RPC.
do $$
declare who text; n int;
begin
  foreach who in array array['70000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000014', '70000000-0000-0000-0000-000000000010'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    select (select count(*) from public.list_members(20)) + (select count(*) from public.search_members('Ravi'))
         + (select count(*) from public.get_candidates(array['70000000-0000-0000-0000-000000000002'::uuid])) into n;
    reset role;
    if n <> 0 then raise exception 'FAIL I5: incomplete caller % got % rows', who, n; end if;
  end loop;
end $$;

-- Ruling I3 through the RPCs: padded/empty/whitespace profiles hidden; a padded real profile shown.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from public.get_candidates(array['70000000-0000-0000-0000-000000000010','70000000-0000-0000-0000-000000000011',
    '70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000013','70000000-0000-0000-0000-000000000014']::uuid[]);
  if n <> 0 then raise exception 'FAIL I3: get_candidates shows % padded/empty/whitespace profiles', n; end if;
  select count(*) into n from public.list_members(20) where id::text between '70000000-0000-0000-0000-000000000010' and '70000000-0000-0000-0000-000000000014';
  if n <> 0 then raise exception 'FAIL I3: list_members shows % incomplete profiles', n; end if;
  select count(*) into n from public.search_members('City');
  if n <> 0 then raise exception 'FAIL I3: search shows an empty/whitespace-city profile (%)', n; end if;
  select count(*) into n from public.get_candidates(array['70000000-0000-0000-0000-000000000015'::uuid]);
  if n <> 1 then raise exception 'FAIL I3: padded real profile hidden'; end if;
  select count(*) into n from public.search_members('Pat Padded');
  if n <> 1 then raise exception 'FAIL I3: padded real profile not searchable (%)', n; end if;
end $$;
rollback;

-- Ruling I6: requests and messages across worlds are refused; same-world ones still work.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array[
    '01|insert into public.connection_requests (from_id, to_id) values (''70000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000008'')',
    '08|insert into public.connection_requests (from_id, to_id) values (''70000000-0000-0000-0000-000000000008'', ''70000000-0000-0000-0000-000000000002'')',
    '01|insert into public.brivia_messages (sender_id, recipient_id, body) values (''70000000-0000-0000-0000-000000000001'', ''70000000-0000-0000-0000-000000000008'', ''hi'')',
    '08|insert into public.brivia_messages (sender_id, recipient_id, body) values (''70000000-0000-0000-0000-000000000008'', ''70000000-0000-0000-0000-000000000001'', ''hi'')'
  ] loop
    failed := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', '70000000-0000-0000-0000-0000000000' || split_part(stmt, '|', 1))::text, true);
    begin execute split_part(stmt, '|', 2); exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL I6: cross-world write allowed: %', stmt; end if;
  end loop;
end $$;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001"}';
insert into public.connection_requests (from_id, to_id) values ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000015');
insert into public.brivia_messages (sender_id, recipient_id, body) values ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'same world');
rollback;
do $$ begin
  if exists (select 1 from public.connection_requests where from_id::text like '70000000-%')
     or exists (select 1 from public.brivia_messages where sender_id::text like '70000000-%') then
    raise exception 'FAIL: I6 fixtures leaked';
  end if;
end $$;

-- Clean up Task 2 fixtures.
delete from public.community_posts where author_id::text like '70000000-%';
delete from public.matches where user1_id::text like '70000000-%' or user2_id::text like '70000000-%';
drop table public.trust_t2_expected;
delete from public.brivia_blocks where blocker_id::text like '70000000-%';
delete from public.profiles where id::text like '70000000-%' or id::text like '71000000-%';
delete from auth.users where id::text like '70000000-%' or id::text like '71000000-%';

-- ---------------------------------------------------------------------------------------------
-- Task 3: abuse caps on requests (silent caps, Review Focus 5), 30-day expiry, purge.
-- Fixtures (owner): S = 72..0001 sends; R1..R110 = 72..0101..72..0210 receive; all completed, real world.
-- ---------------------------------------------------------------------------------------------
insert into auth.users(id)
select ('72000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 210) n
on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
select ('72000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'Cap ' || n, 'Cap ' || n, 'cap' || n || '@example.com', 'Pune'
from generate_series(1, 210) n
on conflict (id) do nothing;
create or replace function pg_temp.t3(n int) returns uuid language sql immutable as $$
  select ('72000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- 3.1 A note over 500 characters is rejected; exactly 500 is accepted.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare failed boolean := false;
begin
  insert into public.connection_requests (from_id, to_id, note) values (pg_temp.t3(1), pg_temp.t3(101), repeat('x', 500));
  begin
    insert into public.connection_requests (from_id, to_id, note) values (pg_temp.t3(1), pg_temp.t3(102), repeat('x', 501));
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'FAIL T3: a 501-character note was accepted'; end if;
end $$;
rollback;

-- 3.2 The 31st request in 24 h is silently not inserted: no error, no row.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare i int; n int;
begin
  for i in 101..131 loop  -- 31 inserts; the last must be dropped silently (an error here fails the test)
    insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(i));
    get diagnostics n = row_count;
    if i <= 130 and n <> 1 then raise exception 'FAIL T3: request % of 30 not inserted', i - 100; end if;
    if i = 131 and n <> 0 then raise exception 'FAIL T3: 31st request in 24 h reported % rows', n; end if;
  end loop;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.connection_requests where from_id = pg_temp.t3(1)) <> 30 then
    raise exception 'FAIL T3: daily cap wrote % rows (want 30)', (select count(*) from public.connection_requests where from_id = pg_temp.t3(1));
  end if;
end $$;
rollback;

-- 3.2b A request that completes a match is never capped (it needs the other member's consent anyway).
begin;
insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(140), pg_temp.t3(1));
insert into public.connection_requests (from_id, to_id)
select pg_temp.t3(1), pg_temp.t3(i) from generate_series(101, 130) i;  -- 30 today: at the daily cap
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(140));
reset role;
do $$ begin
  if not exists (select 1 from public.matches where user1_id = least(pg_temp.t3(1), pg_temp.t3(140)) and user2_id = greatest(pg_temp.t3(1), pg_temp.t3(140))) then
    raise exception 'FAIL T3: a completing request at the daily cap did not create the match';
  end if;
end $$;
rollback;

-- 3.3 The 101st pending request (older than 24 h, within 30 days) is silently not inserted. A declined
-- request counts as pending (the sender cannot tell them apart); expired requests do not count.
begin;
insert into public.connection_requests (from_id, to_id, status, created_at)
select pg_temp.t3(1), pg_temp.t3(i), case when i = 101 then 'declined' else 'pending' end, now() - interval '2 days'
from generate_series(101, 200) i;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(201));
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL T3: 101st pending request reported % rows', n; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.connection_requests where from_id = pg_temp.t3(1) and to_id = pg_temp.t3(201)) then
    raise exception 'FAIL T3: 101st pending request was written';
  end if;
end $$;
-- Once those 100 are expired (older than 30 days), they no longer count.
update public.connection_requests set created_at = now() - interval '31 days' where from_id = pg_temp.t3(1);
set local role authenticated;
insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(201));
reset role;
do $$ begin
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.t3(1) and to_id = pg_temp.t3(201)) then
    raise exception 'FAIL T3: expired requests still count toward the pending cap';
  end if;
end $$;
rollback;

-- 3.4 A pending request older than 30 days is expired: hidden from the recipient's list, cannot be
-- accepted, and does not complete a match. A 29-day-old one still does.
begin;
insert into public.connection_requests (from_id, to_id, note, created_at) values
  (pg_temp.t3(102), pg_temp.t3(1), 'old', now() - interval '31 days'),
  (pg_temp.t3(103), pg_temp.t3(1), 'old', now() - interval '31 days'),
  (pg_temp.t3(104), pg_temp.t3(1), 'recent', now() - interval '29 days');
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare n int; failed boolean := false;
begin
  select count(*) into n from public.connection_requests where to_id = auth.uid() and status = 'pending';
  if n <> 1 then raise exception 'FAIL T3: recipient sees % pending requests (want 1, expired hidden)', n; end if;
  begin
    perform public.respond_connection_request(pg_temp.t3(103), true);
  exception when no_data_found then failed := true;
  end;
  if not failed then raise exception 'FAIL T3: an expired request was accepted'; end if;
  insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(102));
  insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(104));
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.matches where pg_temp.t3(1) in (user1_id, user2_id) and pg_temp.t3(102) in (user1_id, user2_id))
     or exists (select 1 from public.matches where pg_temp.t3(1) in (user1_id, user2_id) and pg_temp.t3(103) in (user1_id, user2_id)) then
    raise exception 'FAIL T3: an expired request completed a match';
  end if;
  if not exists (select 1 from public.matches where pg_temp.t3(1) in (user1_id, user2_id) and pg_temp.t3(104) in (user1_id, user2_id)) then
    raise exception 'FAIL T3: a 29-day-old request did not complete the match';
  end if;
end $$;
rollback;

-- 3.4b The sender's own expired request (pending or declined) is replaced by a fresh one; a live declined
-- request conflicts exactly like a live pending one, so a decline is never revealed.
begin;
insert into public.connection_requests (from_id, to_id, status, created_at) values
  (pg_temp.t3(1), pg_temp.t3(105), 'pending', now() - interval '31 days'),
  (pg_temp.t3(1), pg_temp.t3(106), 'declined', now() - interval '31 days'),
  (pg_temp.t3(1), pg_temp.t3(107), 'pending', now() - interval '3 days'),
  (pg_temp.t3(1), pg_temp.t3(108), 'declined', now() - interval '3 days');
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare i int; code text; codes text := '';
begin
  insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(105));
  insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(106));
  foreach i in array array[107, 108] loop
    code := 'none';
    begin
      insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(i));
    exception when others then code := sqlstate;
    end;
    codes := codes || code || ',';
  end loop;
  if codes <> '23505,23505,' then raise exception 'FAIL T3: live pending/declined re-request answers differ: %', codes; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.connection_requests where from_id = pg_temp.t3(1) and to_id in (pg_temp.t3(105), pg_temp.t3(106))
        and status = 'pending' and created_at > now() - interval '1 minute') <> 2 then
    raise exception 'FAIL T3: an expired own request was not replaced by a fresh one';
  end if;
end $$;
rollback;

-- 3.5 purge_expired_requests() deletes expired pending/declined requests, keeps live and accepted ones,
-- and is owner-only.
begin;
insert into public.connection_requests (from_id, to_id, status, created_at) values
  (pg_temp.t3(1), pg_temp.t3(101), 'pending', now() - interval '31 days'),
  (pg_temp.t3(1), pg_temp.t3(102), 'declined', now() - interval '45 days'),
  (pg_temp.t3(1), pg_temp.t3(103), 'pending', now() - interval '29 days'),
  (pg_temp.t3(1), pg_temp.t3(104), 'accepted', now() - interval '90 days');
do $$
declare n int;
begin
  if to_regprocedure('public.purge_expired_requests()') is null then raise exception 'FAIL T3: purge_expired_requests missing'; end if;
  if has_function_privilege('authenticated', 'public.purge_expired_requests()', 'execute')
     or has_function_privilege('anon', 'public.purge_expired_requests()', 'execute') then
    raise exception 'FAIL T3: purge_expired_requests is executable by API roles';
  end if;
  select public.purge_expired_requests() into n;
  if n <> 2 then raise exception 'FAIL T3: purge deleted % rows (want 2)', n; end if;
  if (select string_agg(right(to_id::text, 3), ',' order by to_id) from public.connection_requests where from_id = pg_temp.t3(1)) <> '103,104' then
    raise exception 'FAIL T3: purge kept the wrong rows';
  end if;
end $$;
rollback;

-- ---------------------------------------------------------------------------------------------
-- Task 3b: consent follow-ups from the P0 final review.
-- ---------------------------------------------------------------------------------------------
-- 3b.1 A block withdraws the blocker's own pending request: A requests B, A blocks B, A unblocks B,
-- B requests A -> no match (B's request is just pending).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(1), pg_temp.t3(150));
insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.t3(1), pg_temp.t3(150));
delete from public.brivia_blocks where blocker_id = pg_temp.t3(1) and blocked_id = pg_temp.t3(150);
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000150"}';
insert into public.connection_requests (from_id, to_id) values (pg_temp.t3(150), pg_temp.t3(1));
reset role;
do $$ begin
  if exists (select 1 from public.matches where pg_temp.t3(1) in (user1_id, user2_id) and pg_temp.t3(150) in (user1_id, user2_id)) then
    raise exception 'FAIL T3b: block/unblock left the blocker''s request live; a later reverse request matched';
  end if;
  if exists (select 1 from public.connection_requests where from_id = pg_temp.t3(1) and to_id = pg_temp.t3(150)) then
    raise exception 'FAIL T3b: block did not withdraw the blocker''s pending request';
  end if;
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.t3(150) and to_id = pg_temp.t3(1) and status = 'pending') then
    raise exception 'FAIL T3b: the later reverse request is not pending';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.brivia_on_block_created()') and prosecdef and proconfig @> array['search_path=public']) then
    raise exception 'FAIL T3b: brivia_on_block_created must be security definer with search_path=public';
  end if;
end $$;
rollback;

-- 3b.2 Insert is granted on (from_id, to_id, note) only; status and created_at come from defaults.
do $$
declare c text;
begin
  if has_table_privilege('authenticated', 'public.connection_requests', 'insert') then
    raise exception 'FAIL T3b: authenticated still holds table-level insert on connection_requests';
  end if;
  foreach c in array array['from_id', 'to_id', 'note'] loop
    if not has_column_privilege('authenticated', 'public.connection_requests', c, 'insert') then
      raise exception 'FAIL T3b: authenticated cannot insert %', c;
    end if;
  end loop;
  foreach c in array array['status', 'created_at'] loop
    if has_column_privilege('authenticated', 'public.connection_requests', c, 'insert') then
      raise exception 'FAIL T3b: authenticated can insert %', c;
    end if;
  end loop;
end $$;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare failed boolean := false;
begin
  begin
    insert into public.connection_requests (from_id, to_id, created_at) values (pg_temp.t3(1), pg_temp.t3(151), now() - interval '40 days');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL T3b: client set created_at'; end if;
  insert into public.connection_requests (from_id, to_id, note) values (pg_temp.t3(1), pg_temp.t3(151), 'hi');
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.t3(1) and to_id = pg_temp.t3(151)
                 and status = 'pending' and created_at > now() - interval '1 minute') then
    raise exception 'FAIL T3b: defaults did not fill status/created_at';
  end if;
end $$;
rollback;

-- 3b.3 The sender never sees a decline: my_outgoing_requests() shows declined as pending; the base table
-- shows the sender none of their outgoing rows; the recipient still reads incoming ones.
do $$
begin
  if to_regprocedure('public.my_outgoing_requests()') is null then raise exception 'FAIL T3b: my_outgoing_requests missing'; end if;
  if not (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = to_regprocedure('public.my_outgoing_requests()')) then
    raise exception 'FAIL T3b: my_outgoing_requests must be security definer with search_path=public';
  end if;
  if has_function_privilege('anon', 'public.my_outgoing_requests()', 'execute') then raise exception 'FAIL T3b: anon can execute my_outgoing_requests'; end if;
  if not has_function_privilege('authenticated', 'public.my_outgoing_requests()', 'execute') then raise exception 'FAIL T3b: authenticated cannot execute my_outgoing_requests'; end if;
end $$;
begin;
-- Owner fixtures: S->R152 declined, S->R153 pending, S->R154 accepted, S->R155 expired, S->R156 (R156 blocked S),
-- S->T (cross-world legacy row; 72..0209 becomes a test member).
update public.profiles set is_test = true where id = pg_temp.t3(209);
insert into public.connection_requests (from_id, to_id, status, created_at) values
  (pg_temp.t3(1), pg_temp.t3(152), 'declined', now() - interval '1 day'),
  (pg_temp.t3(1), pg_temp.t3(153), 'pending', now() - interval '2 days'),
  (pg_temp.t3(1), pg_temp.t3(154), 'accepted', now() - interval '3 days'),
  (pg_temp.t3(1), pg_temp.t3(155), 'pending', now() - interval '31 days'),
  (pg_temp.t3(1), pg_temp.t3(156), 'pending', now() - interval '4 days'),
  (pg_temp.t3(1), pg_temp.t3(209), 'pending', now() - interval '5 days');
insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.t3(156), pg_temp.t3(1));
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare got text; n int;
begin
  select string_agg(right(to_id::text, 3) || ':' || status, ',' order by to_id) into got from public.my_outgoing_requests();
  if got is distinct from '152:pending,153:pending,154:accepted' then
    raise exception 'FAIL T3b: my_outgoing_requests = % (want 152:pending,153:pending,154:accepted)', got;
  end if;
  select count(*) into n from public.connection_requests where from_id = auth.uid();
  if n <> 0 then raise exception 'FAIL T3b: sender reads % outgoing rows from the base table', n; end if;
end $$;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000153"}';
do $$ begin
  if (select count(*) from public.connection_requests where to_id = auth.uid() and status = 'pending') <> 1 then
    raise exception 'FAIL T3b: recipient no longer reads incoming pending requests';
  end if;
end $$;
rollback;

-- 3b.4 No oversized photos: photo_url / cover_url longer than 2048 characters are rejected.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"72000000-0000-0000-0000-000000000001"}';
do $$
declare col text; failed boolean;
begin
  update public.profiles set photo_url = 'https://x/' || repeat('a', 2038), cover_url = 'https://x/' || repeat('a', 2038) where id = auth.uid();
  foreach col in array array['photo_url', 'cover_url'] loop
    failed := false;
    begin
      execute format('update public.profiles set %I = %L where id = auth.uid()', col, 'data:image/png;base64,' || repeat('A', 2100));
    exception when check_violation then failed := true;
    end;
    if not failed then raise exception 'FAIL T3b: % over 2048 characters accepted', col; end if;
  end loop;
end $$;
rollback;

-- 3b.5 The own-profile select policy compares ids as uuid (no text casts).
do $$
declare q text;
begin
  select qual into q from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Members can view their own profile';
  if q is null or q ~ '::text' or q !~ 'auth\.uid\(\)' then raise exception 'FAIL T3b: own-profile policy qual is %', q; end if;
end $$;

-- Clean up Task 3 fixtures.
delete from public.connection_requests where from_id::text like '72000000-%' or to_id::text like '72000000-%';
delete from public.matches where user1_id::text like '72000000-%' or user2_id::text like '72000000-%';
delete from public.brivia_blocks where blocker_id::text like '72000000-%' or blocked_id::text like '72000000-%';
delete from public.profiles where id::text like '72000000-%';
delete from auth.users where id::text like '72000000-%';

-- =============================================================================================
-- Task 4: private chat media, bucket limits, careers throttle
-- =============================================================================================
-- 4.1 message-attachments is private; every bucket has a size limit and a mime allow-list.
do $$
declare r record;
begin
  if (select public from storage.buckets where id = 'message-attachments') is distinct from false then
    raise exception 'FAIL T4: message-attachments is not private';
  end if;
  for r in select * from (values ('profile-photos', 5242880), ('profile-covers', 5242880), ('community-posts', 10485760),
                                 ('message-attachments', 20971520), ('career-resumes', 5242880)) v(id, lim) loop
    if (select file_size_limit from storage.buckets where id = r.id) is distinct from r.lim::bigint then
      raise exception 'FAIL T4: % file_size_limit is %', r.id, (select file_size_limit from storage.buckets where id = r.id);
    end if;
    if coalesce(array_length((select allowed_mime_types from storage.buckets where id = r.id), 1), 0) = 0 then
      raise exception 'FAIL T4: % has no allowed_mime_types', r.id;
    end if;
  end loop;
  if (select allowed_mime_types from storage.buckets where id = 'career-resumes') <> array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] then
    raise exception 'FAIL T4: career-resumes mimes are wrong';
  end if;
  if not ('video/mp4' = any (array(select unnest(allowed_mime_types) from storage.buckets where id = 'message-attachments')) and
          'application/pdf' = any (array(select unnest(allowed_mime_types) from storage.buckets where id = 'message-attachments')) and
          'text/plain' = any (array(select unnest(allowed_mime_types) from storage.buckets where id = 'message-attachments'))) then
    raise exception 'FAIL T4: message-attachments mimes miss mp4/pdf/txt';
  end if;
  if exists (select 1 from storage.buckets where id in ('profile-photos','profile-covers','community-posts') and not allowed_mime_types <@ array['image/jpeg','image/png','image/webp','image/gif']) then
    raise exception 'FAIL T4: an image bucket allows a non-image mime';
  end if;
end $$;

-- 4.2 Select on a chat object: uploader, sender or recipient of the message row; a third party is denied.
insert into auth.users (id) values ('73000000-0000-0000-0000-000000000001'),('73000000-0000-0000-0000-000000000002'),('73000000-0000-0000-0000-000000000003') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city) values
  ('73000000-0000-0000-0000-000000000001','Sender','Sender','s4a@example.com','Pune'),
  ('73000000-0000-0000-0000-000000000002','Recipient','Recipient','s4b@example.com','Pune'),
  ('73000000-0000-0000-0000-000000000003','Third','Third','s4c@example.com','Pune')
on conflict (id) do nothing;
insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path, attachment_name)
  values ('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','', 'image',
          '73000000-0000-0000-0000-000000000001/a.jpg', 'a.jpg');
insert into storage.objects (bucket_id, name, owner) values
  ('message-attachments', '73000000-0000-0000-0000-000000000001/a.jpg', '73000000-0000-0000-0000-000000000001'),
  ('message-attachments', '73000000-0000-0000-0000-000000000001/unsent.jpg', '73000000-0000-0000-0000-000000000001');
create or replace function pg_temp.t4_sees(uid text, obj text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'message-attachments' and name = obj;
  reset role;
  return n;
end $$;
do $$
begin
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001/a.jpg') <> 1 then raise exception 'FAIL T4: uploader cannot select'; end if;
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001/a.jpg') <> 1 then raise exception 'FAIL T4: recipient cannot select'; end if;
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000001/a.jpg') <> 0 then raise exception 'FAIL T4: third party can select'; end if;
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001/unsent.jpg') <> 0 then raise exception 'FAIL T4: recipient selects an object no message references'; end if;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  if (select count(*) from storage.objects where bucket_id = 'message-attachments') <> 0 then raise exception 'FAIL T4: anon selects chat media'; end if;
  reset role;
end $$;
-- 4.2b Forged reference: a message may not point at another member's object.
insert into storage.objects (bucket_id, name, owner) values
  ('message-attachments', '73000000-0000-0000-0000-000000000003/secret.jpg', '73000000-0000-0000-0000-000000000003');
do $$
declare failed boolean := false;
begin
  perform set_config('request.jwt.claims', '{"sub":"73000000-0000-0000-0000-000000000001"}', true);
  set local role authenticated;
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path, attachment_name)
      values ('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','', 'image',
              '73000000-0000-0000-0000-000000000003/secret.jpg', 's.jpg');
  exception when check_violation or insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL T4: a forged attachment_path was accepted at insert'; end if;
  -- the CHECK itself (owner bypasses RLS) refuses the forged path
  failed := false;
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path, attachment_name)
      values ('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','', 'image',
              '73000000-0000-0000-0000-000000000003/secret.jpg', 's.jpg');
  exception when check_violation then failed := true;
  end;
  if not failed then raise exception 'FAIL T4: the attachment_path CHECK did not fire'; end if;
  -- forced in as owner (bypassing the check): the policy still must not expose the object
  alter table public.brivia_messages disable trigger user;
  alter table public.brivia_messages drop constraint brivia_messages_attachment_path_owner;
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path, attachment_name)
    values ('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','', 'image',
            '73000000-0000-0000-0000-000000000003/secret.jpg', 's.jpg');
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000003/secret.jpg') <> 0 then raise exception 'FAIL T4: forged row lets the sender select a third member''s object'; end if;
  if pg_temp.t4_sees('73000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000003/secret.jpg') <> 0 then raise exception 'FAIL T4: forged row lets the recipient select a third member''s object'; end if;
  delete from public.brivia_messages where attachment_path like '73000000-0000-0000-0000-000000000003/%';
  alter table public.brivia_messages add constraint brivia_messages_attachment_path_owner
    check (attachment_path is null or split_part(attachment_path, '/', 1) = sender_id::text);
  alter table public.brivia_messages enable trigger user;
end $$;
delete from storage.objects where name like '73000000-%';
delete from public.brivia_messages where sender_id::text like '73000000-%';
delete from public.profiles where id::text like '73000000-%';
delete from auth.users where id::text like '73000000-%';

-- 4.3 Careers throttle: > 3 per email in 24 h, > 200 per hour overall; anon insert still allowed.
do $$
declare i int; failed boolean;
begin
  set local role anon;
  for i in 1..3 loop
    insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', 'Dup@Example.com', 'p' || i, 'cv.pdf', 1);
  end loop;
  failed := false;
  begin
    insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', 'dup@example.com', 'p4', 'cv.pdf', 1);
  exception when others then failed := true; if sqlerrm !~* 'try again later' or sqlerrm ~* 'email|dup' then raise exception 'FAIL T4: error is not generic: %', sqlerrm; end if;
  end;
  if not failed then raise exception 'FAIL T4: a 4th application in 24h for one email was accepted'; end if;
  -- whitespace / case variants are the same email
  failed := false;
  begin
    insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', '  DUP@example.com ', 'p4b', 'cv.pdf', 1);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL T4: a padded email bypassed the per-email cap'; end if;
  insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', 'other@example.com', 'p5', 'cv.pdf', 1);
  reset role;
  -- the email window slides: old rows do not count
  update public.career_applications set created_at = now() - interval '25 hours' where lower(email) = 'dup@example.com';
  set local role anon;
  insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', 'dup@example.com', 'p6', 'cv.pdf', 1);
  reset role;
  delete from public.career_applications;
  insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size)
    select 'r', 'n', 'bulk' || g || '@example.com', 'b' || g, 'cv.pdf', 1 from generate_series(1, 200) g;
  set local role anon;
  failed := false;
  begin
    insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values ('r', 'n', 'late@example.com', 'late', 'cv.pdf', 1);
  exception when others then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL T4: the 201st application in an hour was accepted'; end if;
  delete from public.career_applications;
  if not exists (select 1 from pg_indexes where tablename = 'career_applications' and indexdef ~* 'lower\(email\)' and indexdef ~* 'created_at') then
    raise exception 'FAIL T4: no (lower(email), created_at) index';
  end if;
end $$;

select 'trust.test T4 OK';

select 'trust.test OK';

-- Iteration 2 (Trust), Task 5: interaction log.
insert into auth.users(id) values
  ('a5a5a5a5-0000-0000-0000-0000000000a5'), ('b5b5b5b5-0000-0000-0000-0000000000b5'),
  ('d5d5d5d5-0000-0000-0000-0000000000d5')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city, is_test) values
  ('a5a5a5a5-0000-0000-0000-0000000000a5','A5','A5','a5@example.com','Austin', false),
  ('b5b5b5b5-0000-0000-0000-0000000000b5','B5','B5','b5@example.com','Austin', false),
  ('d5d5d5d5-0000-0000-0000-0000000000d5','D5','D5','d5@test.brivia.club','Austin', true)
on conflict (id) do nothing;

do $$
declare
  a uuid := 'a5a5a5a5-0000-0000-0000-0000000000a5';
  b uuid := 'b5b5b5b5-0000-0000-0000-0000000000b5';
  d uuid := 'd5d5d5d5-0000-0000-0000-0000000000d5';
  ev text; failed boolean; n int; cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols from information_schema.columns
   where table_schema='public' and table_name='interaction';
  if cols is distinct from 'context,created_at,event,features,id,model_version,propensity,score,target_id,viewer_id' then
    raise exception 'FAIL T5: interaction columns are %', cols;
  end if;

  -- member A inserts the allowed events
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || a || '"}', true);
  reset role;
  insert into public.matches (user1_id, user2_id) values (least(a,b), greatest(a,b));
  insert into public.connection_requests (from_id, to_id) values (b, a);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || a || '"}', true);
  foreach ev in array array['like','pass','request','accept','decline','met','letgo'] loop
    insert into public.interaction (viewer_id, target_id, event) values (a, b, ev);
  end loop;
  -- denied cases
  foreach ev in array array[
    'insert into public.interaction (viewer_id, target_id, event) values (''' || b || ''',''' || a || ''',''like'')',
    'insert into public.interaction (viewer_id, target_id, event) values (''' || a || ''',''' || b || ''',''impression'')',
    'insert into public.interaction (viewer_id, target_id, event) values (''' || a || ''',''' || b || ''',''bogus'')',
    'insert into public.interaction (viewer_id, target_id, event, propensity) values (''' || a || ''',''' || b || ''',''like'',1.5)',
    'insert into public.interaction (viewer_id, target_id, event, features) values (''' || a || ''',''' || b || ''',''like'',jsonb_build_object(''k'', repeat(''x'', 9000)))',
    'insert into public.interaction (viewer_id, target_id, event, created_at) values (''' || a || ''',''' || b || ''',''like'',''2000-01-01'')',
    'insert into public.interaction (viewer_id, target_id, event) values (''' || a || ''',''' || d || ''',''like'')',
    -- fix round 1 (Critical 2): clients write viewer, target and event only
    'insert into public.interaction (viewer_id, target_id, event, features) values (''' || a || ''',''' || b || ''',''like'',''{"x":1}'')',
    'insert into public.interaction (viewer_id, target_id, event, score) values (''' || a || ''',''' || b || ''',''like'',0.5)',
    'insert into public.interaction (viewer_id, target_id, event, propensity) values (''' || a || ''',''' || b || ''',''like'',0.25)',
    'insert into public.interaction (viewer_id, target_id, event, model_version) values (''' || a || ''',''' || b || ''',''like'',''orbit-0'')',
    'insert into public.interaction (viewer_id, target_id, event, context) values (''' || a || ''',''' || b || ''',''like'',''{"surface":"deck"}'')'
  ] loop
    failed := false;
    begin execute ev; exception when others then failed := true; end;
    if not failed then raise exception 'FAIL T5: should be refused: %', ev; end if;
  end loop;

  -- no client update/delete
  foreach ev in array array['update public.interaction set score = 1', 'delete from public.interaction'] loop
    failed := false;
    begin execute ev; exception when insufficient_privilege then failed := true; end;
    if not failed then raise exception 'FAIL T5: should be denied: %', ev; end if;
  end loop;

  select count(*) into n from public.interaction;
  if n <> 7 then raise exception 'FAIL T5: A sees % own rows, expected 7', n; end if;

  -- B sees none of A's rows
  perform set_config('request.jwt.claims', '{"sub":"' || b || '"}', true);
  select count(*) into n from public.interaction;
  if n <> 0 then raise exception 'FAIL T5: B sees % of A rows', n; end if;
  reset role;

  -- owner (service) may write an impression
  insert into public.interaction (viewer_id, target_id, event, propensity) values (a, b, 'impression', 0.1);

  -- anon denied
  set local role anon;
  failed := false;
  begin perform 1 from public.interaction; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL T5: anon select allowed'; end if;
  failed := false;
  begin insert into public.interaction (viewer_id, target_id, event) values (a, b, 'like');
  exception when insufficient_privilege then failed := true; end;
  reset role;
  if not failed then raise exception 'FAIL T5: anon insert allowed'; end if;

  if (select count(*) from pg_indexes where tablename='interaction' and indexdef ~ 'viewer_id, created_at DESC') <> 1
     or (select count(*) from pg_indexes where tablename='interaction' and indexdef ~ 'target_id, created_at DESC') <> 1 then
    raise exception 'FAIL T5: missing interaction indexes';
  end if;
  delete from public.interaction;
  delete from public.matches where user1_id in (a,b);
  delete from public.connection_requests where from_id::text in (a::text,b::text);
end $$;

select 'trust.test T5 OK';

-- T5 fix: labels need backing evidence.
do $$
declare
  a uuid := 'a5a5a5a5-0000-0000-0000-0000000000a5';
  b uuid := 'b5b5b5b5-0000-0000-0000-0000000000b5';
  ev text; failed boolean;
begin
  delete from public.matches where user1_id in (a,b) or user2_id in (a,b);
  delete from public.connection_requests where from_id::text in (a::text,b::text) or to_id::text in (a::text,b::text);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || a || '"}', true);
  foreach ev in array array['met','letgo','accept','decline'] loop
    failed := false;
    begin insert into public.interaction (viewer_id, target_id, event) values (a, b, ev);
    exception when others then failed := true; end;
    if not failed then raise exception 'FAIL T5: % accepted without backing', ev; end if;
  end loop;
  insert into public.interaction (viewer_id, target_id, event) values (a, b, 'like'), (a, b, 'pass'), (a, b, 'request');
  reset role;
  -- match in reversed order backs met/letgo
  insert into public.matches (user1_id, user2_id) values (least(a,b), greatest(a,b));
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || b || '"}', true);
  insert into public.interaction (viewer_id, target_id, event) values (b, a, 'met'), (b, a, 'letgo');
  -- accept needs a request addressed to the viewer, not from the viewer
  failed := false;
  begin insert into public.interaction (viewer_id, target_id, event) values (b, a, 'accept');
  exception when others then failed := true; end;
  if not failed then raise exception 'FAIL T5: accept without a request'; end if;
  reset role;
  insert into public.connection_requests (from_id, to_id) values (a, b);
  set local role authenticated;
  insert into public.interaction (viewer_id, target_id, event) values (b, a, 'accept'), (b, a, 'decline');
  perform set_config('request.jwt.claims', '{"sub":"' || a || '"}', true);
  failed := false;
  begin insert into public.interaction (viewer_id, target_id, event) values (a, b, 'accept');
  exception when others then failed := true; end;
  reset role;
  if not failed then raise exception 'FAIL T5: sender accepted own request'; end if;
  delete from public.interaction;
  delete from public.connection_requests where from_id::text = a::text;
  delete from public.matches where user1_id in (a,b);
end $$;

select 'trust.test T5 evidence OK';

-- T5 fix 2: definer helpers answer only for the caller.
do $$
declare
  a uuid := 'a5a5a5a5-0000-0000-0000-0000000000a5';
  b uuid := 'b5b5b5b5-0000-0000-0000-0000000000b5';
  c uuid := 'c1c1c1c1-0000-0000-0000-0000000000c1';
  ev text; r boolean;
begin
  insert into public.matches (user1_id, user2_id) values (least(a,b), greatest(a,b));
  insert into public.connection_requests (from_id, to_id) values (a, b);
  set local role authenticated;
  -- a third party (c) asks about a/b, impersonating either
  perform set_config('request.jwt.claims', '{"sub":"' || c || '"}', true);
  foreach ev in array array['like','pass','request','met','letgo','accept','decline'] loop
    if public.brivia_interaction_allowed(b, a, ev) or public.brivia_interaction_allowed(a, b, ev)
       or public.brivia_interaction_allowed(c, a, ev) and ev in ('met','letgo','accept','decline') then
      raise exception 'FAIL T5: helper answered for a non-party, event %', ev;
    end if;
  end loop;
  if public.brivia_same_world(a, b) then
    raise exception 'FAIL T5: same_world/blocked helper answered for a non-party';
  end if;
  -- the real party still gets true
  perform set_config('request.jwt.claims', '{"sub":"' || b || '"}', true);
  if not (public.brivia_interaction_allowed(b, a, 'met') and public.brivia_interaction_allowed(b, a, 'accept')) then
    raise exception 'FAIL T5: helper denied the real party';
  end if;
  reset role;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (a, b);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || c || '"}', true);
  if public.brivia_is_blocked_between(a, b) then raise exception 'FAIL T5: blocked helper answered for a non-party'; end if;
  reset role;
  delete from public.brivia_blocks where blocker_id = a;
  delete from public.connection_requests where from_id = a;
  delete from public.matches where user1_id in (a,b);
end $$;

select 'trust.test T5 definer OK';

-- Iteration 2 Task 6 fix round 1 (Critical 2): members never read impression rows or served-model columns.
do $$
declare
  a uuid := 'a5a5a5a5-0000-0000-0000-0000000000a5';
  b uuid := 'b5b5b5b5-0000-0000-0000-0000000000b5';
  col text; failed boolean; n int;
begin
  delete from public.interaction;
  -- the service path (owner here; log_impressions in iteration 4) writes an impression for A, with ring in context
  insert into public.interaction (viewer_id, target_id, event, features, score, propensity, model_version, context)
    values (a, b, 'impression', '{"x":1}', 0.7, 1, 'orbit-0', '{"ring":0,"holdout":false,"lane":"ranked"}');
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"' || a || '"}', true);
  insert into public.interaction (viewer_id, target_id, event) values (a, b, 'like');
  -- A sees the own like through the allowed columns, never the impression row
  select count(*) into n from public.interaction;
  if n <> 1 then raise exception 'FAIL T6: A sees % rows, expected 1 (impression must be hidden)', n; end if;
  select count(*) into n from public.interaction where event = 'impression';
  if n <> 0 then raise exception 'FAIL T6: A can read own impression rows'; end if;
  perform id, viewer_id, target_id, event, created_at from public.interaction;
  -- the served-model columns are not selectable at all
  foreach col in array array['features','score','propensity','model_version','context'] loop
    failed := false;
    begin execute 'select ' || col || ' from public.interaction';
    exception when insufficient_privilege then failed := true; end;
    if not failed then raise exception 'FAIL T6: member can select interaction.%', col; end if;
  end loop;
  failed := false;
  begin perform * from public.interaction; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL T6: member can select * from interaction'; end if;
  reset role;
  -- grants as declared: authenticated has exactly these column privileges
  if (select string_agg(privilege_type || ':' || column_name, ',' order by privilege_type, column_name)
        from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'interaction' and grantee = 'authenticated')
     is distinct from 'INSERT:event,INSERT:target_id,INSERT:viewer_id,SELECT:created_at,SELECT:event,SELECT:id,SELECT:target_id,SELECT:viewer_id' then
    raise exception 'FAIL T6: authenticated column privileges on interaction are wrong';
  end if;
  delete from public.interaction;
end $$;

select 'trust.test T6 impressions hidden OK';
