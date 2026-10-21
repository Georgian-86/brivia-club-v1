-- Polish wave, Task D1 (0012 section D): the private resumes bucket, resume messages, deletion covers resumes.
-- R1 the bucket row is private, 5242880 bytes, {application/pdf}; R1b re-applying the bucket statement resets it
-- R2 a can insert a/resume.pdf but not a/cv.pdf or b/resume.pdf; a cannot rename it away; b cannot touch a's file
-- R3 b cannot select a/resume.pdf without a message (anon neither)
-- R4 with a match and a 'resume' message a -> b, b can select it; c (not the recipient) cannot
-- R4b that resume message does not open a same-named message-attachments file (a/resume.pdf) to b
-- R5 after b blocks a, a blocks b, or the match is deleted, b cannot; a message without a match grants nothing
-- R6 a message of type 'resume' with any other path, or none, is refused by the constraint (23514)
-- R7 resume_path is not a column of public_profiles nor in the result type of get_candidates, search_members,
--    deck_candidates, list_members; a can set resume_path to a/resume.pdf but not b/resume.pdf; b cannot read a's
-- R8 delete_my_account('DELETE') with a fresh amr raises storage_not_empty while a/resume.pdf exists (no owner set,
--    so the folder rule is what catches it) and succeeds after it is removed
-- Ids: d1200000-0000-4000-8000-0000000000NN: 01 A, 02 B, 03 C (all completed). One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.rm(n int) returns uuid language sql immutable as $$
  select ('d1200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Act as a client: role authenticated with the member's claims (or anon when p_uid is null).
create or replace function pg_temp.as_member(p_uid uuid, p_amr jsonb default null) returns void language plpgsql as $f$
declare claims jsonb;
begin
  if p_uid is null then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  else
    claims := jsonb_build_object('sub', p_uid, 'role', 'authenticated');
    if p_amr is not null then claims := claims || jsonb_build_object('amr', p_amr); end if;
    set local role authenticated;
    perform set_config('request.jwt.claims', claims::text, true);
  end if;
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;

-- How many rows of resumes/<name> the current client can see.
create or replace function pg_temp.sees(p_name text) returns int language sql as $$
  select count(*)::int from storage.objects where bucket_id = 'resumes' and name = p_name $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.rm(g);
    insert into auth.users(id, email) values (mid, 'resume' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Resume ' || g, 'Resume ' || g, 'resume' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  if not (public.brivia_member_completed(pg_temp.rm(1)) and public.brivia_member_completed(pg_temp.rm(2))
          and public.brivia_member_completed(pg_temp.rm(3))) then
    raise exception 'FAIL setup: A, B and C must be completed'; end if;
end $$;

-- R1: the bucket row.
do $$
declare r record;
begin
  select * into r from storage.buckets where id = 'resumes';
  if not found then raise exception 'FAIL R1: bucket resumes is missing'; end if;
  if r.public is distinct from false then raise exception 'FAIL R1: bucket resumes must be private, public = %', r.public; end if;
  if r.file_size_limit is distinct from 5242880 then raise exception 'FAIL R1: file_size_limit = %', r.file_size_limit; end if;
  if r.allowed_mime_types is distinct from array['application/pdf'] then
    raise exception 'FAIL R1: allowed_mime_types = %', r.allowed_mime_types; end if;
end $$;

-- R1b: re-applying the section D bucket statement resets a loosened bucket (the statement below is copied verbatim
-- from 0012 section D).
do $$
declare r record;
begin
  update storage.buckets set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/png'] where id = 'resumes';
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
  select * into r from storage.buckets where id = 'resumes';
  if r.public is distinct from false or r.file_size_limit is distinct from 5242880
     or r.allowed_mime_types is distinct from array['application/pdf'] then
    raise exception 'FAIL R1b: the bucket was not reset: public %, limit %, types %', r.public, r.file_size_limit, r.allowed_mime_types;
  end if;
end $$;

-- R2: owner-only writes on exactly <uid>/resume.pdf.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); st text; n int;
begin
  perform pg_temp.as_member(a);
  insert into storage.objects (bucket_id, name) values ('resumes', a::text || '/resume.pdf');
  if pg_temp.sees(a::text || '/resume.pdf') <> 1 then raise exception 'FAIL R2: a cannot read back a/resume.pdf'; end if;
  st := '';
  begin insert into storage.objects (bucket_id, name) values ('resumes', a::text || '/cv.pdf');
  exception when others then st := sqlstate; end;
  if st <> '42501' then raise exception 'FAIL R2: a/cv.pdf was not refused (sqlstate "%")', st; end if;
  st := '';
  begin insert into storage.objects (bucket_id, name) values ('resumes', b::text || '/resume.pdf');
  exception when others then st := sqlstate; end;
  if st <> '42501' then raise exception 'FAIL R2: a wrote b/resume.pdf (sqlstate "%")', st; end if;
  st := '';
  begin update storage.objects set name = a::text || '/cv.pdf' where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
  exception when others then st := sqlstate; end;
  if st <> '42501' then raise exception 'FAIL R2: a renamed the resume to another path (sqlstate "%")', st; end if;
  -- replace (upsert) is an update of the own row
  update storage.objects set owner_id = a::text where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL R2: a cannot update the own resume row'; end if;
  perform pg_temp.as_member(b);
  update storage.objects set owner_id = b::text where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL R2: b updated a''s resume'; end if;
  perform pg_temp.as_owner();
  -- the RLS policy decides whether a delete is allowed; the stub's Storage guard needs the API flag
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.as_member(b);
  delete from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL R2: b deleted a''s resume'; end if;
  perform pg_temp.as_owner();
  perform set_config('storage.allow_delete_query', 'false', true);
  update storage.objects set owner_id = null where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
end $$;

-- R3: no message, no access.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2);
begin
  perform pg_temp.as_member(b);
  if pg_temp.sees(a::text || '/resume.pdf') <> 0 then raise exception 'FAIL R3: b reads a''s resume without a message'; end if;
  perform pg_temp.as_member(null);
  if pg_temp.sees(a::text || '/resume.pdf') <> 0 then raise exception 'FAIL R3: anon reads a''s resume'; end if;
  perform pg_temp.as_owner();
end $$;

-- R4: a match and a resume message a -> b open the file to b only. R5: a block or an unmatch closes it again.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); c uuid := pg_temp.rm(3); p text := pg_temp.rm(1)::text || '/resume.pdf';
begin
  -- a message without a match grants nothing (a -> c, never matched)
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path) values (a, c, 'Resume', 'resume', p);
  perform pg_temp.as_member(c);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R5: c reads the resume without a match'; end if;
  perform pg_temp.as_owner();

  insert into public.matches (user1_id, user2_id) values (least(a, b), greatest(a, b));
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R3: a match alone opens the resume to b'; end if;
  perform pg_temp.as_owner();
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path) values (a, b, 'Resume', 'resume', p);
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 1 then raise exception 'FAIL R4: b cannot read the resume a shared'; end if;
  perform pg_temp.as_member(c);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R4: c reads the resume a shared with b'; end if;
  perform pg_temp.as_member(a);
  if pg_temp.sees(p) <> 1 then raise exception 'FAIL R4: a cannot read the own resume'; end if;
  perform pg_temp.as_owner();
  -- R4b: a resume message never aliases a same-named file in message-attachments
  insert into storage.objects (bucket_id, name) values ('message-attachments', p);
  perform pg_temp.as_member(b);
  if (select count(*) from storage.objects where bucket_id = 'message-attachments' and name = p) <> 0 then
    raise exception 'FAIL R4b: a resume message opens message-attachments/% to b', p; end if;
  perform pg_temp.as_owner();
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'message-attachments' and name = p;
  perform set_config('storage.allow_delete_query', 'false', true);

  insert into public.brivia_blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R5: b still reads the resume after blocking a'; end if;
  perform pg_temp.as_owner();
  delete from public.brivia_blocks where blocker_id = b and blocked_id = a;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (a, b);
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R5: b still reads the resume after a blocked b'; end if;
  perform pg_temp.as_owner();
  delete from public.brivia_blocks where blocker_id = a and blocked_id = b;
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 1 then raise exception 'FAIL R5: unblocking did not restore the shared resume'; end if;
  perform pg_temp.as_owner();
  delete from public.matches where (user1_id, user2_id) = (least(a, b), greatest(a, b));
  perform pg_temp.as_member(b);
  if pg_temp.sees(p) <> 0 then raise exception 'FAIL R5: b still reads the resume after the match was deleted'; end if;
  perform pg_temp.as_owner();
  insert into public.matches (user1_id, user2_id) values (least(a, b), greatest(a, b));
end $$;

-- R6: a resume message carries only its sender's resume path.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); bad text; st text;
begin
  foreach bad in array array[a::text || '/cv.pdf', b::text || '/resume.pdf', a::text || '/resume.pdf.exe', 'resume.pdf', null] loop
    st := '';
    begin
      insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path)
      values (a, b, 'Resume', 'resume', bad);
    exception when others then st := sqlstate; end;
    if st <> '23514' then raise exception 'FAIL R6: resume message with path % was not refused (sqlstate "%")', bad, st; end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'brivia_messages_resume_path'
                  and conrelid = 'public.brivia_messages'::regclass) then
    raise exception 'FAIL R6: constraint brivia_messages_resume_path is missing'; end if;
end $$;

-- R7: resume_path stays private to its owner.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); f text; r text; st text; n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'resume_path') then
    raise exception 'FAIL R7: profiles.resume_path is missing'; end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'public_profiles' and column_name = 'resume_path') then
    raise exception 'FAIL R7: public_profiles exposes resume_path'; end if;
  foreach f in array array['get_candidates', 'search_members', 'deck_candidates', 'list_members'] loop
    if not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace) then
      raise exception 'FAIL R7: public.% is missing', f; end if;
    for r in select pg_get_function_result(oid) from pg_proc where proname = f and pronamespace = 'public'::regnamespace loop
      if r ilike '%resume%' or r ~* '\mprofiles\M' then
        raise exception 'FAIL R7: public.% returns %', f, r; end if;
    end loop;
  end loop;

  perform pg_temp.as_member(a);
  update public.profiles set resume_path = a::text || '/resume.pdf' where id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL R7: a cannot set the own resume_path'; end if;
  st := '';
  begin update public.profiles set resume_path = b::text || '/resume.pdf' where id = a;
  exception when others then st := sqlstate; end;
  if st <> '23514' then raise exception 'FAIL R7: a set resume_path to b/resume.pdf (sqlstate "%")', st; end if;
  update public.profiles set resume_path = null where id = a;
  update public.profiles set resume_path = a::text || '/resume.pdf' where id = a;
  perform pg_temp.as_member(b);
  if exists (select 1 from public.profiles where id = a) then raise exception 'FAIL R7: b reads a''s profile row'; end if;
  perform pg_temp.as_member(null);
  st := '';
  begin update public.profiles set resume_path = null where id = a;
  exception when others then st := sqlstate; end;
  if st <> '42501' then raise exception 'FAIL R7: anon may update resume_path (sqlstate "%")', st; end if;
  perform pg_temp.as_owner();
end $$;

-- R8: the account cannot be deleted while the resume is stored; it can once the file is gone.
do $$
declare a uuid := pg_temp.rm(1); st text; msg text;
  fresh jsonb := jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 30));
begin
  if exists (select 1 from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf'
               and (owner is not null or owner_id is not null)) then
    raise exception 'FAIL setup R8: the resume must have no owner so the folder rule is tested'; end if;
  st := ''; msg := '';
  perform pg_temp.as_member(a, fresh);
  begin perform public.delete_my_account('DELETE');
  exception when others then st := sqlstate; msg := sqlerrm; end;
  perform pg_temp.as_owner();
  if st <> 'P0001' or msg <> 'storage_not_empty' then
    raise exception 'FAIL R8: deletion with a stored resume gave sqlstate "%" message "%"', st, msg; end if;

  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf';
  perform set_config('storage.allow_delete_query', 'false', true);

  st := ''; msg := '';
  perform pg_temp.as_member(a, fresh);
  begin perform public.delete_my_account('DELETE');
  exception when others then st := sqlstate; msg := sqlerrm; end;
  perform pg_temp.as_owner();
  if st <> '' then raise exception 'FAIL R8: deletion after removing the resume gave sqlstate "%" message "%"', st, msg; end if;
  if exists (select 1 from public.profiles where id = a) or exists (select 1 from auth.users where id = a) then
    raise exception 'FAIL R8: the account still exists'; end if;
end $$;

select 'd-resume.test R1-R8 private resumes, resume messages, deletion OK' as result;
rollback;
