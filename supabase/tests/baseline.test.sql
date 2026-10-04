-- Baseline schema (supabase/migrations/0001_baseline.sql): shape, uuid ids, RLS, buckets, block rule,
-- secure-by-default policies. run.sh runs this file twice: against 0001 alone, and after all migrations.
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
    ['public_profiles','id']
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
    ['community_posts','author_id','public.profiles']
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
                          ('community-posts', true), ('career-resumes', false))
      -- 0003 makes message-attachments private (trust.test.sql checks that); the baseline alone keeps it public.
      or (id = 'message-attachments' and exists (select 1 from pg_policies where policyname = 'Participants can view message attachments'));
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

-- 8. Secure-by-default policy shape.
do $$
declare n int;
begin
  if to_regclass('public.profile_credentials') is not null then
    raise exception 'FAIL: legacy profile_credentials (login_password) table exists';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'matches' and cmd in ('INSERT', 'ALL');
  if n <> 0 then raise exception 'FAIL: matches has % client insert policies (want 0)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT';
  if n <> 1 then raise exception 'FAIL: profiles has % select policies (want 1, owner-only)', n; end if;
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
     and (roles && array['public', 'anon']::name[]);
  if n <> 0 then raise exception 'FAIL: % storage select policies open to public/anon', n; end if;
end $$;

-- 9. Behaviour: privacy, consent, block function, block rule on messages, own-row writes, storage.
begin;
insert into auth.users(id) values
  ('11111111-0000-0000-0000-000000000001'), ('22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000003'), ('44444444-0000-0000-0000-000000000004');
-- A city makes them completed members in the full chain (0004 completion, via the harness autocomplete fixture).
insert into public.profiles(id, name, full_name, email, phone, phone_number, city) values
  ('11111111-0000-0000-0000-000000000001', 'One', 'One', 'one@test.brivia.club', '+1 1', '1', 'Pune'),
  ('22222222-0000-0000-0000-000000000002', 'Two', 'Two', 'two@test.brivia.club', '+1 2', '2', 'Pune'),
  ('33333333-0000-0000-0000-000000000003', 'Three', 'Three', 'three@test.brivia.club', '+1 3', '3', 'Pune');
-- user 4 is authenticated but has no profile (not a member yet).
-- A server-created (consented) match, and objects in every member bucket for One and Three.
insert into public.matches(user1_id, user2_id)
values ('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003');
insert into storage.objects(bucket_id, name)
select b, u || '/f.jpg'
from unnest(array['profile-photos', 'profile-covers', 'message-attachments', 'community-posts']) b,
     unnest(array['11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003']) u;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  -- privacy: One reads only their own base row; others only via public_profiles (no contact fields)
  select count(*) into n from public.profiles where id <> '11111111-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: member reads % other base profile rows', n; end if;
  select count(*) into n from public.profiles where email = 'three@test.brivia.club' or phone_number = '3';
  if n <> 0 then raise exception 'FAIL: member reads another member email/phone'; end if;
  -- With 0003 applied (full chain) the view is closed to members; candidate RPCs replace it (trust.test.sql).
  if has_table_privilege('authenticated', 'public.public_profiles', 'select') then
    select count(*) into n from public.public_profiles where id = '33333333-0000-0000-0000-000000000003';
    if n <> 1 then raise exception 'FAIL: public_profiles missing another member (% rows)', n; end if;
  end if;
  select count(*) into n from public.profiles where id = '11111111-0000-0000-0000-000000000001' and email = 'one@test.brivia.club';
  if n <> 1 then raise exception 'FAIL: member cannot read own full row'; end if;

  -- consent: clients cannot create matches, in either orientation
  begin
    insert into public.matches(user1_id, user2_id)
    values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
    raise exception 'FAIL: client inserted a match';
  exception when insufficient_privilege then null; end;

  -- storage: One lists only their own folder in every member bucket
  select count(*) into n from storage.objects;
  if n <> 4 then raise exception 'FAIL: member lists % storage objects (want own 4)', n; end if;
  select count(*) into n from storage.objects where name like '33333333-%';
  if n <> 0 then raise exception 'FAIL: member lists another member''s storage objects'; end if;

  -- block: One blocks Two
  insert into public.brivia_blocks(blocker_id, blocked_id)
  values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');

  -- the blocker gets correct answers for uuid and text arguments, in both orders
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

  -- normal message and community post
  insert into public.brivia_messages(sender_id, recipient_id, body, message_type)
  values ('11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', 'hello', 'text');
  insert into public.community_posts(author_id, image_url, image_path, caption)
  values ('11111111-0000-0000-0000-000000000001',
          'https://proj.supabase.co/storage/v1/object/public/community-posts/11111111-0000-0000-0000-000000000001/y.jpg',
          '11111111-0000-0000-0000-000000000001/y.jpg', 'c');
  select count(*) into n from public.community_posts;
  if n <> 1 then raise exception 'FAIL: member sees % community posts', n; end if;

  -- own profile update works; someone else's cannot be updated
  update public.profiles set experience = 'Austin' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: own profile update touched % rows', n; end if;
  update public.profiles set experience = 'X' where id = '33333333-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: updated another member profile'; end if;
end $$;

-- Two (the blocked party) also gets the correct answer, and cannot message One.
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002"}';
do $$
begin
  if not public.brivia_is_blocked_between('22222222-0000-0000-0000-000000000002'::uuid, '11111111-0000-0000-0000-000000000001'::uuid)
     then raise exception 'FAIL: blocked party gets false'; end if;
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'hi');
    raise exception 'FAIL: blocked member can message the blocker';
  exception when insufficient_privilege then null; end;
end $$;

-- Three is a third party to the One/Two block: no information. Three sees the message and match.
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  if public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001'::uuid, '22222222-0000-0000-0000-000000000002'::uuid)
     or public.brivia_is_blocked_between('22222222-0000-0000-0000-000000000002'::text, '11111111-0000-0000-0000-000000000001'::text)
     or public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002')
  then raise exception 'FAIL: third party learns the One/Two block status'; end if;
  select count(*) into n from public.brivia_blocks;
  if n <> 0 then raise exception 'FAIL: third party sees % blocks', n; end if;
  select count(*) into n from public.brivia_messages where recipient_id = '33333333-0000-0000-0000-000000000003';
  if n <> 1 then raise exception 'FAIL: recipient sees % messages', n; end if;
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: matched member sees % matches', n; end if;
  delete from public.matches;  -- either side may remove the connection
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: matched member removed % matches', n; end if;
end $$;

-- An authenticated user without a profile is not a member: no messages, no posts.
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  select count(*) into n from public.community_posts;
  if n <> 0 then raise exception 'FAIL: non-member sees % community posts', n; end if;
  if has_table_privilege('authenticated', 'public.public_profiles', 'select') then
    select count(*) into n from public.public_profiles;
    if n <> 0 then raise exception 'FAIL: non-member sees % public_profiles rows', n; end if;
  end if;
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'x');
    raise exception 'FAIL: non-member can send messages';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  -- but can create their own profile
  insert into public.profiles(id, email) values ('44444444-0000-0000-0000-000000000004', 'four@test.brivia.club');
end $$;
rollback;

-- 10. Anonymous visitors can submit a career application, and nothing else.
begin;
insert into storage.objects(bucket_id, name)
select b, '11111111-0000-0000-0000-000000000001/f.jpg'
from unnest(array['profile-photos', 'profile-covers', 'message-attachments', 'community-posts']) b;
set local role anon;
do $$
declare n int;
begin
  insert into public.career_applications(role, name, email, resume_path, resume_name, resume_size)
  values ('Engineer', 'Ann', 'ann@test.brivia.club', 'r.pdf', 'r.pdf', 10);
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'FAIL: anon reads % profiles', n; end if;
  select count(*) into n from storage.objects;
  if n <> 0 then raise exception 'FAIL: anon lists % storage objects', n; end if;
  begin
    perform public.brivia_is_blocked_between('11111111-0000-0000-0000-000000000001'::uuid, '22222222-0000-0000-0000-000000000002'::uuid);
    raise exception 'FAIL: anon can call brivia_is_blocked_between';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

select 'baseline.test.sql OK' as result;
