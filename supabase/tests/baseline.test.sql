-- Baseline schema (supabase/migrations/0001_baseline.sql): shape, uuid ids, RLS, buckets, block rule.
-- Every data-touching block runs in a transaction that is rolled back.

-- 1. Every table the client uses exists, with the columns the client reads/writes.
do $$
declare
  want text[][] := array[
    ['profiles','id'],['profiles','name'],['profiles','full_name'],['profiles','email'],['profiles','phone'],
    ['profiles','phone_country_code'],['profiles','phone_number'],['profiles','gender'],['profiles','city'],
    ['profiles','state'],['profiles','experience'],['profiles','skills'],['profiles','looking_for'],
    ['profiles','photo_url'],['profiles','cover_url'],['profiles','created_at'],['profiles','updated_at'],
    ['profiles','is_test'],
    ['matches','id'],['matches','user1_id'],['matches','user2_id'],['matches','created_at'],
    ['brivia_messages','id'],['brivia_messages','sender_id'],['brivia_messages','recipient_id'],
    ['brivia_messages','body'],['brivia_messages','created_at'],['brivia_messages','message_type'],
    ['brivia_messages','attachment_url'],['brivia_messages','attachment_path'],['brivia_messages','attachment_name'],
    ['brivia_messages','attachment_mime'],['brivia_messages','attachment_size'],
    ['brivia_blocks','blocker_id'],['brivia_blocks','blocked_id'],['brivia_blocks','created_at'],
    ['community_posts','id'],['community_posts','author_id'],['community_posts','image_url'],
    ['community_posts','image_path'],['community_posts','caption'],['community_posts','created_at'],
    ['career_applications','id'],['career_applications','role'],['career_applications','name'],
    ['career_applications','email'],['career_applications','linkedin_url'],['career_applications','resume_path'],
    ['career_applications','resume_name'],['career_applications','resume_size'],['career_applications','created_at'],
    ['profile_credentials','user_id']
  ];
  i int;
begin
  for i in 1..array_length(want, 1) loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = want[i][1] and column_name = want[i][2]) then
      raise exception 'FAIL: missing column public.%.%', want[i][1], want[i][2];
    end if;
  end loop;
end $$;

-- 2. Every member id column is uuid, with the expected foreign key.
do $$
declare
  want text[][] := array[
    ['profiles','id','auth.users'],
    ['matches','user1_id','public.profiles'],['matches','user2_id','public.profiles'],
    ['brivia_messages','sender_id','public.profiles'],['brivia_messages','recipient_id','public.profiles'],
    ['brivia_blocks','blocker_id','public.profiles'],['brivia_blocks','blocked_id','public.profiles'],
    ['community_posts','author_id','public.profiles'],
    ['profile_credentials','user_id','auth.users']
  ];
  i int; t text; n int;
begin
  for i in 1..array_length(want, 1) loop
    select data_type into t from information_schema.columns
     where table_schema = 'public' and table_name = want[i][1] and column_name = want[i][2];
    if t is distinct from 'uuid' then
      raise exception 'FAIL: public.%.% is % (want uuid)', want[i][1], want[i][2], coalesce(t, 'missing');
    end if;
    select count(*) into n
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.conrelid = ('public.' || want[i][1])::regclass
       and array_length(c.conkey, 1) = 1 and a.attname = want[i][2]
       and c.confrelid = want[i][3]::regclass and c.confdeltype = 'c';
    if n <> 1 then
      raise exception 'FAIL: public.%.% has no on-delete-cascade FK to %', want[i][1], want[i][2], want[i][3];
    end if;
  end loop;
end $$;

-- 3. RLS is enabled on every public table.
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'FAIL: RLS disabled on public.%', r.relname;
  end loop;
end $$;

-- 4. profiles.is_test boolean not null default false (Ruling P7).
do $$
declare r record;
begin
  select data_type, is_nullable, column_default into r from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_test';
  if r.data_type is distinct from 'boolean' or r.is_nullable <> 'NO' or r.column_default is distinct from 'false' then
    raise exception 'FAIL: profiles.is_test is % / nullable % / default %', r.data_type, r.is_nullable, r.column_default;
  end if;
end $$;

-- 5. Storage buckets.
do $$
declare n int;
begin
  select count(*) into n from storage.buckets
   where (id, public) in (('profile-photos', true), ('profile-covers', true), ('message-attachments', true),
                          ('community-posts', true), ('career-resumes', false));
  if n <> 5 then raise exception 'FAIL: % of 5 storage buckets present with the right visibility', n; end if;
end $$;

-- 6. Realtime publishes brivia_messages.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brivia_messages') then
    raise exception 'FAIL: brivia_messages not in supabase_realtime';
  end if;
end $$;

-- 7. Exactly one insert policy on brivia_messages (two permissive ones would OR away the block rule).
do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' and cmd = 'INSERT';
  if n <> 1 then raise exception 'FAIL: brivia_messages has % insert policies (want 1)', n; end if;
end $$;

-- 8. Behaviour: block function, block rule on messages, own-row writes.
begin;
insert into auth.users(id) values
  ('11111111-0000-0000-0000-000000000001'), ('22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000003'), ('44444444-0000-0000-0000-000000000004');
insert into public.profiles(id, name, full_name, email) values
  ('11111111-0000-0000-0000-000000000001', 'One', 'One', 'one@test.brivia.club'),
  ('22222222-0000-0000-0000-000000000002', 'Two', 'Two', 'two@test.brivia.club'),
  ('33333333-0000-0000-0000-000000000003', 'Three', 'Three', 'three@test.brivia.club');
-- user 4 is authenticated but has no profile (not a member yet).

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001"}';
do $$
declare n int; ok boolean;
begin
  -- block: One blocks Two
  insert into public.brivia_blocks(blocker_id, blocked_id)
  values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');

  -- function works for uuid and text arguments, in both orders
  if not public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001'::uuid, '22222222-0000-0000-0000-000000000002'::uuid)
     then raise exception 'FAIL: uuid block check (1,2) false'; end if;
  if not public.brivia_is_blocked_between('22222222-0000-0000-0000-000000000002'::text, '11111111-0000-0000-0000-000000000001'::text)
     then raise exception 'FAIL: text block check (2,1) false'; end if;
  if public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003')
     then raise exception 'FAIL: block check (1,3) true'; end if;

  -- cannot block on behalf of someone else
  begin
    insert into public.brivia_blocks(blocker_id, blocked_id)
    values ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002');
    raise exception 'FAIL: blocked on behalf of another member';
  exception when insufficient_privilege then null; end;

  -- block rule: One cannot message Two
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'hi');
    raise exception 'FAIL: message to a blocked member allowed';
  exception when insufficient_privilege then null; end;

  -- cannot spoof the sender
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'spoof');
    raise exception 'FAIL: spoofed sender allowed';
  exception when insufficient_privilege then null; end;

  -- normal message, match, community post
  insert into public.brivia_messages(sender_id, recipient_id, body, message_type)
  values ('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'hello', 'text');
  insert into public.matches(user1_id, user2_id)
  values ('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003');
  insert into public.community_posts(author_id, image_url, image_path, caption)
  values ('11111111-0000-0000-0000-000000000001', 'https://x/y.jpg', '1/y.jpg', 'c');
  select count(*) into n from public.community_posts;
  if n <> 1 then raise exception 'FAIL: member sees % community posts', n; end if;

  -- own profile update works
  update public.profiles set city = 'Austin' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: own profile update touched % rows', n; end if;
  -- someone else's profile cannot be updated
  update public.profiles set city = 'X' where id = '33333333-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: updated another member profile'; end if;
end $$;

-- Three sees the message and the match; the legacy credentials table is closed to clients.
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  select count(*) into n from public.brivia_messages where recipient_id = '33333333-0000-0000-0000-000000000003';
  if n <> 1 then raise exception 'FAIL: recipient sees % messages', n; end if;
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: matched member sees % matches', n; end if;
  delete from public.matches;  -- either side may remove the connection
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: matched member removed % matches', n; end if;
  select count(*) into n from public.profile_credentials;
  if n <> 0 then raise exception 'FAIL: profile_credentials readable'; end if;
end $$;

-- An authenticated user without a profile is not a member: no messages, no posts.
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  select count(*) into n from public.community_posts;
  if n <> 0 then raise exception 'FAIL: non-member sees % community posts', n; end if;
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'x');
    raise exception 'FAIL: non-member can send messages';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  -- but can create their own profile
  insert into public.profiles(id, email) values ('44444444-0000-0000-0000-000000000004', 'four@test.brivia.club');
end $$;
rollback;

-- 9. Anonymous visitors can submit a career application, and nothing else.
begin;
set local role anon;
do $$
declare n int;
begin
  insert into public.career_applications(role, name, email, resume_path, resume_name, resume_size)
  values ('Engineer', 'Ann', 'ann@test.brivia.club', 'r.pdf', 'r.pdf', 10);
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'FAIL: anon reads % profiles', n; end if;
  begin
    perform public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001'::uuid, '22222222-0000-0000-0000-000000000002'::uuid);
    raise exception 'FAIL: anon can call brivia_is_blocked_between';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

select 'baseline.test.sql OK' as result;
