-- Iteration 3, Task 2: interest taxonomy (spec §3.1) and the 20-point Passion Budget (spec §3.2).
insert into auth.users(id) values
  ('a3a3a3a3-0000-0000-0000-0000000000a3'), ('b3b3b3b3-0000-0000-0000-0000000000b3'),
  ('c3c3c3c3-0000-0000-0000-0000000000c3')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email)
values ('a3a3a3a3-0000-0000-0000-0000000000a3','A3','A3','a3@example.com'),
       ('b3b3b3b3-0000-0000-0000-0000000000b3','B3','B3','b3@example.com')
on conflict (id) do nothing;
-- c3 has an auth user but no profile row.

-- Taxonomy shape: 350-450 nodes, 10-14 domains, 50-70 categories, at least 20 niches; ids and levels consistent.
do $$
declare n int; d int; c int; i int; x int;
begin
  select count(*), count(*) filter (where level = 1), count(*) filter (where level = 2),
         count(*) filter (where level = 3), count(*) filter (where level = 4)
    into n, d, c, i, x from public.interest_node where status = 'active';
  if n not between 350 and 450 then raise exception 'FAIL: % taxonomy nodes', n; end if;
  if d not between 10 and 14 then raise exception 'FAIL: % domains', d; end if;
  if c not between 50 and 70 then raise exception 'FAIL: % categories', c; end if;
  if x < 20 then raise exception 'FAIL: % niches', x; end if;
  if i < 200 then raise exception 'FAIL: % interests', i; end if;
  select count(*) into n from public.interest_node c
   where c.parent_id is not null and not exists (select 1 from public.interest_node p where p.id = c.parent_id);
  if n <> 0 then raise exception 'FAIL: % orphan nodes', n; end if;
  select count(*) into n from public.interest_node where (level = 1) <> (parent_id is null);
  if n <> 0 then raise exception 'FAIL: % nodes break level 1 <=> no parent', n; end if;
  select count(*) into n from public.interest_node p join public.interest_node ch on ch.parent_id = p.id
   where ch.level <> p.level + 1;
  if n <> 0 then raise exception 'FAIL: % children not one level below the parent', n; end if;
  select count(*) into n from public.interest_node
   where level <> array_length(string_to_array(id, '.'), 1)
      or parent_id is distinct from nullif(regexp_replace(id, '\.[^.]+$', ''), id);
  if n <> 0 then raise exception 'FAIL: % nodes with inconsistent id/level/parent', n; end if;
  select count(*) into n from (select lower(label), parent_id from public.interest_node group by 1, 2 having count(*) > 1) s;
  if n <> 0 then raise exception 'FAIL: % duplicate labels under one parent', n; end if;
  -- Every category has at least one interest under it.
  select count(*) into n from public.interest_node c where c.level = 2
     and not exists (select 1 from public.interest_node ch where ch.parent_id = c.id);
  if n <> 0 then raise exception 'FAIL: % empty categories', n; end if;
end $$;

-- The check constraint refuses an inconsistent node.
do $$
begin
  begin
    insert into public.interest_node(id, parent_id, level, label) values ('sports.racket.squash_x', 'sports', 3, 'X');
    raise exception 'FAIL: inconsistent parent accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.interest_node(id, parent_id, level, label) values ('sports.racket.squash_x', 'sports.racket', 2, 'X');
    raise exception 'FAIL: inconsistent level accepted';
  exception when check_violation then null;
  end;
end $$;

-- Clients may read the taxonomy.
begin;
set local role anon;
do $$
begin
  if (select count(*) from public.interest_node) < 350 then raise exception 'FAIL: anon cannot read the taxonomy'; end if;
  perform id, parent_id, level, label, status from public.interest_node limit 1;
  begin
    insert into public.interest_node(id, parent_id, level, label) values ('zz', null, 1, 'ZZ');
    raise exception 'FAIL: anon can insert a node';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- A valid 3-item payload stores 3 rows (missing mode = play) and sets the display copy in profiles.skills.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a3a3a3-0000-0000-0000-0000000000a3"}';
select public.set_member_interests('[
  {"interest_id":"sports.racket.tennis","points":6,"mode":"learn"},
  {"interest_id":"sports.racket.badminton","points":10},
  {"interest_id":"sports.racket.badminton.doubles","points":4,"mode":"teach"}]'::jsonb);
do $$
declare n int; s text[];
begin
  select count(*) into n from public.my_interests();
  if n <> 3 then raise exception 'FAIL: my_interests has % rows', n; end if;
  if (select mode from public.my_interests() where interest_id = 'sports.racket.badminton') <> 'play' then
    raise exception 'FAIL: missing mode is not play';
  end if;
  if (select points from public.my_interests() where interest_id = 'sports.racket.tennis') <> 6 then
    raise exception 'FAIL: tennis points';
  end if;
  if (select label from public.my_interests() where interest_id = 'sports.racket.badminton') is null then
    raise exception 'FAIL: label missing';
  end if;
  select skills into s from public.profiles where id = auth.uid();
  if s <> array[(select label from public.interest_node where id = 'sports.racket.badminton'),
                (select label from public.interest_node where id = 'sports.racket.tennis'),
                (select label from public.interest_node where id = 'sports.racket.badminton.doubles')] then
    raise exception 'FAIL: skills = %', s;
  end if;
end $$;
commit;

-- Ties are ordered by label ascending; a second call replaces the set.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b3b3b3b3-0000-0000-0000-0000000000b3"}';
select public.set_member_interests('[
  {"interest_id":"sports.racket.tennis","points":10,"mode":"play"},
  {"interest_id":"sports.racket.badminton","points":10,"mode":"build"}]'::jsonb);
do $$
declare s text[];
begin
  select skills into s from public.profiles where id = auth.uid();
  if s <> (select array_agg(label order by label) from public.interest_node
            where id in ('sports.racket.tennis', 'sports.racket.badminton')) then
    raise exception 'FAIL: tie order skills = %', s;
  end if;
end $$;
select public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":20,"mode":"build"}]'::jsonb);
do $$
begin
  if (select count(*) from public.my_interests()) <> 1 then raise exception 'FAIL: replace kept old rows'; end if;
  if (select array_length(skills, 1) from public.profiles where id = auth.uid()) <> 1 then raise exception 'FAIL: skills not replaced'; end if;
end $$;
commit;

-- Review Focus 5 (server): every bad payload raises 22023 'invalid interests' and leaves A's rows unchanged.
do $$
declare p text; st text; msg text; before text; after text;
begin
  select string_agg(interest_id || '/' || points || '/' || mode, ',' order by interest_id) into before
    from public.member_interest where member_id = 'a3a3a3a3-0000-0000-0000-0000000000a3';
  foreach p in array array[
    '[{"interest_id":"sports.racket.tennis","points":19}]',                                        -- sum 19
    '[{"interest_id":"sports.racket.tennis","points":21}]',                                        -- sum 21
    '[{"interest_id":"sports.racket.tennis","points":10},{"interest_id":"sports.racket.tennis","points":10}]', -- duplicate
    '[{"interest_id":"sports","points":20}]',                                                      -- domain
    '[{"interest_id":"sports.racket","points":20}]',                                               -- category
    '[{"interest_id":"sports.racket.no_such_thing","points":20}]',                                 -- unknown
    '[{"interest_id":"sports.racket.tennis","points":20,"mode":"watch"}]',                         -- bad mode
    '[{"interest_id":"sports.racket.tennis","points":20,"mode":7}]',                               -- non-text mode
    '[{"interest_id":"sports.racket.tennis","points":20,"mode":null}]',                            -- null mode
    '[]',                                                                                          -- 0 items
    '[{"interest_id":"sports.racket.tennis","points":0},{"interest_id":"sports.racket.badminton","points":20}]', -- 0 points
    '[{"interest_id":"sports.racket.tennis","points":-1},{"interest_id":"sports.racket.badminton","points":21}]', -- negative
    '[{"interest_id":"sports.racket.tennis","points":10.5},{"interest_id":"sports.racket.badminton","points":9.5}]', -- fractional
    '[{"interest_id":"sports.racket.tennis","points":"20"}]',                                      -- string points
    '[{"interest_id":"sports.racket.tennis"}]',                                                    -- missing points
    '[{"points":20}]',                                                                             -- missing id
    '[{"interest_id":20,"points":20}]',                                                            -- non-text id
    '[{"interest_id":"sports.racket.tennis","points":20}, 5]',                                     -- non-object item
    '{"interest_id":"sports.racket.tennis","points":20}',                                          -- not an array
    'null'
  ] loop
    st := null;
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"sub":"a3a3a3a3-0000-0000-0000-0000000000a3"}', true);
      perform public.set_member_interests(p::jsonb);
    exception when others then st := sqlstate; msg := sqlerrm;
    end;
    reset role;
    if st is distinct from '22023' or msg <> 'invalid interests' then
      raise exception 'FAIL: payload % gave % %', p, st, msg;
    end if;
  end loop;
  -- SQL NULL as the argument.
  st := null;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"a3a3a3a3-0000-0000-0000-0000000000a3"}', true);
    perform public.set_member_interests(null);
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  reset role;
  if st is distinct from '22023' then raise exception 'FAIL: null argument gave %', st; end if;
  select string_agg(interest_id || '/' || points || '/' || mode, ',' order by interest_id) into after
    from public.member_interest where member_id = 'a3a3a3a3-0000-0000-0000-0000000000a3';
  if after is distinct from before then raise exception 'FAIL: rows changed: % -> %', before, after; end if;
end $$;

-- 13 items is refused (12 is the maximum); 12 items of mixed points summing to 20 is accepted.
do $$
declare ids text[]; p13 jsonb; p12 jsonb; st text;
begin
  select array_agg(id order by id) into ids from (select id from public.interest_node where level = 3 and status = 'active' order by id limit 13) s;
  select jsonb_agg(jsonb_build_object('interest_id', x, 'points', case when o <= 7 then 2 else 1 end) order by o)
    into p13 from unnest(ids) with ordinality u(x, o);                                  -- 14 + 6 = 20 points
  select jsonb_agg(jsonb_build_object('interest_id', x, 'points', case when o <= 8 then 2 else 1 end) order by o)
    into p12 from unnest(ids[1:12]) with ordinality u(x, o);                            -- 16 + 4 = 20 points
  st := null;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"b3b3b3b3-0000-0000-0000-0000000000b3"}', true);
    perform public.set_member_interests(p13);
  exception when others then st := sqlstate;
  end;
  reset role;
  if st is distinct from '22023' then raise exception 'FAIL: 13 items gave %', st; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"b3b3b3b3-0000-0000-0000-0000000000b3"}', true);
  perform public.set_member_interests(p12);
  if (select count(*) from public.my_interests()) <> 12 then raise exception 'FAIL: 12 items not stored'; end if;
  reset role;
end $$;

-- A retired node is refused.
begin;
update public.interest_node set status = 'retired' where id = 'sports.racket.tennis';
do $$
declare st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"b3b3b3b3-0000-0000-0000-0000000000b3"}', true);
  begin
    perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');
  exception when others then st := sqlstate;
  end;
  reset role;
  if st is distinct from '22023' then raise exception 'FAIL: retired node gave %', st; end if;
end $$;
rollback;

-- A member without a profile row cannot set interests.
do $$
declare st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-0000000000c3"}', true);
  begin
    perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');
  exception when others then st := sqlstate;
  end;
  reset role;
  if st is null then raise exception 'FAIL: member without profile could set interests'; end if;
  if exists (select 1 from public.member_interest where member_id = 'c3c3c3c3-0000-0000-0000-0000000000c3') then
    raise exception 'FAIL: rows stored without a profile';
  end if;
end $$;

-- anon cannot call either RPC.
begin;
set local role anon;
do $$
begin
  begin
    perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');
    raise exception 'FAIL: anon can call set_member_interests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.my_interests();
    raise exception 'FAIL: anon can call my_interests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.member_interest;
    raise exception 'FAIL: anon can select member_interest';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Members read only their own interests, and only through my_interests().
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a3a3a3-0000-0000-0000-0000000000a3"}';
do $$
begin
  begin
    perform count(*) from public.member_interest;
    raise exception 'FAIL: authenticated can select member_interest';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.member_interest(member_id, interest_id, points) values (auth.uid(), 'sports.racket.tennis', 20);
    raise exception 'FAIL: authenticated can insert member_interest';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.my_interests()) <> 3 then raise exception 'FAIL: A sees % rows', (select count(*) from public.my_interests()); end if;
  if exists (select 1 from public.my_interests() where interest_id not in
             ('sports.racket.tennis', 'sports.racket.badminton', 'sports.racket.badminton.doubles')) then
    raise exception 'FAIL: A sees rows that are not A''s';
  end if;
end $$;
rollback;

do $$
begin
  if (select provolatile from pg_proc where oid = 'public.set_member_interests(jsonb)'::regprocedure) <> 'v' then
    raise exception 'FAIL: set_member_interests is not volatile';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.set_member_interests(jsonb)'::regprocedure) then
    raise exception 'FAIL: set_member_interests is not security definer';
  end if;
  if not has_function_privilege('authenticated', 'public.set_member_interests(jsonb)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute set_member_interests';
  end if;
end $$;

-- =============================================================================================
-- Fix round 1
-- =============================================================================================
-- M1: points 20.0 is an integer value and is accepted; 2.5 + 17.5 is refused.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b3b3b3b3-0000-0000-0000-0000000000b3"}';
select public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20.0}]'::jsonb);
do $$
declare st text; msg text;
begin
  if (select points from public.my_interests() where interest_id = 'sports.racket.tennis') is distinct from 20 then
    raise exception 'FAIL: points 20.0 not stored as 20';
  end if;
  begin
    perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":2.5},
                                          {"interest_id":"sports.racket.badminton","points":17.5}]'::jsonb);
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  if st is distinct from '22023' or msg <> 'invalid interests' then raise exception 'FAIL: 2.5 points gave % %', st, msg; end if;
end $$;
rollback;

-- I1: sensitive interests (health, mental health, religion/spirituality, LGBTQ+, sobriety) never reach the public
-- profiles.skills copy or search; they still count in member_interest and the owner still sees them.
do $$
declare bad text;
begin
  select string_agg(id, ', ') into bad from unnest(array[
    'community.social.lgbtq', 'wellbeing.health', 'wellbeing.health.peer_support', 'wellbeing.health.sober_social',
    'wellbeing.health.nutrition', 'wellbeing.health.sleep', 'wellbeing.health.healthy_ageing',
    'wellbeing.spirituality', 'wellbeing.spirituality.pilgrimages', 'wellbeing.spirituality.kirtan',
    'wellbeing.spirituality.scripture_study', 'wellbeing.spirituality.interfaith', 'music.singing.devotional']) i(id)
   where not coalesce((select sensitive from public.interest_node n where n.id = i.id), false);
  if bad is not null then raise exception 'FAIL: not marked sensitive: %', bad; end if;
  if (select sensitive from public.interest_node where id = 'sports.racket.badminton') then
    raise exception 'FAIL: badminton marked sensitive';
  end if;
end $$;

insert into auth.users(id) values
  ('a5a5a5a5-0000-0000-0000-0000000000a5'), ('b5b5b5b5-0000-0000-0000-0000000000b5')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('a5a5a5a5-0000-0000-0000-0000000000a5','A5','A5','a5@example.com','Pune'),
       ('b5b5b5b5-0000-0000-0000-0000000000b5','B5','B5','b5@example.com','Pune')
on conflict (id) do nothing;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5a5a5a5-0000-0000-0000-0000000000a5"}';
select public.set_member_interests('[{"interest_id":"community.social.lgbtq","points":12},
                                     {"interest_id":"sports.racket.badminton","points":8}]'::jsonb);
do $$
begin
  if (select skills from public.profiles where id = auth.uid()) is distinct from array['Badminton'] then
    raise exception 'FAIL: skills with a sensitive interest = %', (select skills from public.profiles where id = auth.uid());
  end if;
  if (select count(*) from public.my_interests()) <> 2
     or not exists (select 1 from public.my_interests() where interest_id = 'community.social.lgbtq') then
    raise exception 'FAIL: my_interests does not return the owner''s sensitive interest';
  end if;
end $$;
commit;
do $$
begin
  if not exists (select 1 from public.member_interest where member_id = 'a5a5a5a5-0000-0000-0000-0000000000a5'
                  and interest_id = 'community.social.lgbtq' and points = 12) then
    raise exception 'FAIL: member_interest lost the sensitive row';
  end if;
end $$;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b5b5b5b5-0000-0000-0000-0000000000b5"}';
do $$
begin
  if exists (select 1 from public.search_members('LGBTQ')) then raise exception 'FAIL: search finds a sensitive label'; end if;
  if exists (select 1 from public.search_members('LGBTQ+ community')) then raise exception 'FAIL: search finds the full sensitive label'; end if;
  if not exists (select 1 from public.search_members('Badminton') where id = 'a5a5a5a5-0000-0000-0000-0000000000a5') then
    raise exception 'FAIL: positive control: search does not find A5 by a normal interest';
  end if;
end $$;
rollback;

select 'orbit-interests.test.sql OK' as result;

-- I1 re-review: a member whose picks are all sensitive can still save (skills becomes '{}', not NULL).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"b5b5b5b5-0000-0000-0000-0000000000b5"}';
select public.set_member_interests('[{"interest_id":"wellbeing.spirituality.scripture_study","points":20}]'::jsonb);
do $$
begin
  if (select skills from public.profiles where id = auth.uid()) is distinct from '{}'::text[] then
    raise exception 'FAIL: all-sensitive skills = %', (select skills from public.profiles where id = auth.uid());
  end if;
  if (select count(*) from public.my_interests()) <> 1 then
    raise exception 'FAIL: all-sensitive member_interest rows missing';
  end if;
end $$;
rollback;

-- Task 8 ruling: profiles.skills is server-owned. A client cannot update it; the editable columns still save;
-- set_member_interests (SECURITY DEFINER) is the writer that counts.
insert into auth.users(id) values ('d8d8d8d8-0000-0000-0000-0000000000d8') on conflict do nothing;
do $$
declare failed boolean; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a3a3a3a3-0000-0000-0000-0000000000a3"}', true);
  failed := false;
  begin
    update public.profiles set skills = '{Self-disclosed}' where id = auth.uid();
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL: a client update of profiles.skills succeeded'; end if;
  -- The profile save the client sends (editable columns, no skills) still works.
  update public.profiles set name = 'A3', full_name = 'A3', phone = '1', phone_country_code = '+1',
    phone_number = '1', gender = 'Female', experience = 'x', looking_for = '{Friends}', updated_at = now()
   where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: editable profile update touched % rows', n; end if;
  -- First-time insert: the client's insert shape (no skills, no city/state) works. A skills value smuggled into the
  -- first insert does not survive completion: set_member_interests overwrites it.
  perform set_config('request.jwt.claims', '{"sub":"d8d8d8d8-0000-0000-0000-0000000000d8"}', true);
  insert into public.profiles (id, name, full_name, email, phone, phone_country_code, phone_number, gender,
                               experience, looking_for, photo_url, cover_url, skills, updated_at)
  values ('d8d8d8d8-0000-0000-0000-0000000000d8', 'D8', 'D8', 'd8@example.com', '', '', '', null, '', '{}', null, null,
          '{Self-disclosed}', now());
  perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":20}]'::jsonb);
  reset role;
  if (select skills from public.profiles where id = 'd8d8d8d8-0000-0000-0000-0000000000d8') is distinct from array['Badminton'] then
    raise exception 'FAIL: smuggled insert skills survived set_member_interests: %',
      (select skills from public.profiles where id = 'd8d8d8d8-0000-0000-0000-0000000000d8');
  end if;
  delete from public.profiles where id = 'd8d8d8d8-0000-0000-0000-0000000000d8';
end $$;
-- anon cannot write skills either.
do $$
declare failed boolean := false;
begin
  set local role anon;
  begin
    update public.profiles set skills = '{x}';
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL: anon update of skills allowed'; end if;
end $$;

select 'orbit-interests.test.sql skills ownership OK' as result;
