-- Polish wave, Task A5 (0013): a blocked sender's messages are stored and withheld, never refused.
-- A and B are matched; B blocks A. A must see no difference at all; B must see nothing A sends after the block.
-- S1 A inserts to B as authenticated (text, image, resume): no error. The blocker B writing to A is stored too.
-- S2 A selects the rows (own thread): every one, and brivia_messages has exactly its usual columns (no withheld flag)
-- S3 B selects messages from A: only the one sent before the block; A sees nothing B sent after the block
-- S3r Realtime: brivia_messages is in supabase_realtime, and the per-subscriber check Realtime runs for
--     postgres_changes (a select of the new row as the subscriber) finds no withheld row for B
-- S4 B cannot read the withheld image's object (message-attachments) or the resume through the withheld resume
--    message; A still reads both
-- S5 unblock: the withheld rows stay withheld (message, image, resume); a new message and a new resume message reach B
-- S6 an unmatched pair (A -> C) is still refused (insufficient_privilege), blocked or not
-- S7 brivia_private.withheld_message is not readable or writable by anon or authenticated (privilege and select);
--    the trigger function is not executable by them; brivia_messages keeps exactly one insert policy
-- S8 report_member evidence (moderation only) still includes the withheld rows
-- Ids: a5000000-0000-4000-8000-0000000000NN: 01 A, 02 B, 03 C (all completed). One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.am(n int) returns uuid language sql immutable as $$
  select ('a5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create or replace function pg_temp.as_member(p_uid uuid) returns void language plpgsql as $f$
begin
  if p_uid is null then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  end if;
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;

-- Rows the current client can see from p_from to p_to, by body.
create or replace function pg_temp.bodies(p_from uuid, p_to uuid) returns text language sql as $$
  select coalesce(string_agg(body, ',' order by body), '')
    from public.brivia_messages where sender_id = p_from and recipient_id = p_to $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.am(g);
    insert into auth.users(id, email) values (mid, 'withheld' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Withheld ' || g, 'Withheld ' || g, 'withheld' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  if not (public.brivia_member_completed(pg_temp.am(1)) and public.brivia_member_completed(pg_temp.am(2))
          and public.brivia_member_completed(pg_temp.am(3))) then
    raise exception 'FAIL setup: A, B and C must be completed'; end if;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.am(1), pg_temp.am(2)), greatest(pg_temp.am(1), pg_temp.am(2)));
  -- A's files: a chat picture and the resume
  insert into storage.objects (bucket_id, name) values
    ('message-attachments', pg_temp.am(1)::text || '/pic.png'), ('resumes', pg_temp.am(1)::text || '/resume.pdf');
end $$;

-- Before the block: one message each way, visible to both.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2);
begin
  perform pg_temp.as_member(a);
  insert into public.brivia_messages (sender_id, recipient_id, body) values (a, b, 'a-before');
  perform pg_temp.as_member(b);
  insert into public.brivia_messages (sender_id, recipient_id, body) values (b, a, 'b-before');
  if pg_temp.bodies(a, b) <> 'a-before' then raise exception 'FAIL setup: B sees "%" before the block', pg_temp.bodies(a, b); end if;
  perform pg_temp.as_owner();
  insert into public.brivia_blocks (blocker_id, blocked_id) values (b, a);
end $$;

-- S1: sends after the block succeed, exactly as before.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2); st text;
begin
  perform pg_temp.as_member(a);
  st := '';
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (a, b, 'a-after');
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path, attachment_name)
    values (a, b, 'a-pic', 'image', a::text || '/pic.png', 'pic.png');
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path)
    values (a, b, 'a-resume', 'resume', a::text || '/resume.pdf');
  exception when others then st := sqlstate || ' ' || sqlerrm; end;
  if st <> '' then perform pg_temp.as_owner(); raise exception 'FAIL S1: the blocked sender''s insert was refused (%)', st; end if;
  -- the blocker writing to the member they blocked is stored the same way (either direction is withheld)
  perform pg_temp.as_member(b);
  st := '';
  begin insert into public.brivia_messages (sender_id, recipient_id, body) values (b, a, 'b-after');
  exception when others then st := sqlstate || ' ' || sqlerrm; end;
  if st <> '' then perform pg_temp.as_owner(); raise exception 'FAIL S1: the blocker''s insert was refused (%)', st; end if;
  perform pg_temp.as_owner();
end $$;

-- S2: the sender's own thread shows everything; no column tells a withheld row apart.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2); cols text;
begin
  perform pg_temp.as_member(a);
  if pg_temp.bodies(a, b) <> 'a-after,a-before,a-pic,a-resume' then
    perform pg_temp.as_owner(); raise exception 'FAIL S2: A sees own rows "%"', pg_temp.bodies(a, b); end if;
  perform pg_temp.as_member(b);
  if pg_temp.bodies(b, a) <> 'b-after,b-before' then
    perform pg_temp.as_owner(); raise exception 'FAIL S2: B sees own rows "%"', pg_temp.bodies(b, a); end if;
  perform pg_temp.as_owner();
  select string_agg(column_name, ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'brivia_messages';
  if cols <> 'id,sender_id,recipient_id,body,message_type,attachment_url,attachment_path,attachment_name,attachment_mime,attachment_size,created_at' then
    raise exception 'FAIL S2: brivia_messages columns changed: %', cols; end if;
end $$;

-- S3: the recipient sees only what was sent before the block. S3r: what Realtime would deliver.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2); wid uuid; bid uuid;
begin
  select id into wid from public.brivia_messages where body = 'a-after';
  select id into bid from public.brivia_messages where body = 'a-before';
  perform pg_temp.as_member(b);
  if pg_temp.bodies(a, b) <> 'a-before' then
    perform pg_temp.as_owner(); raise exception 'FAIL S3: B sees "%" from A after blocking', pg_temp.bodies(a, b); end if;
  -- the notification and unread read path: everything addressed to me
  if (select count(*) from public.brivia_messages where recipient_id = b) <> 1 then
    perform pg_temp.as_owner(); raise exception 'FAIL S3: B''s inbox counts a withheld row'; end if;
  -- Realtime postgres_changes checks the subscriber's select policy on the new row before delivering it
  if exists (select 1 from public.brivia_messages where id = wid) then
    perform pg_temp.as_owner(); raise exception 'FAIL S3r: the withheld row passes B''s select policy (Realtime would deliver it)'; end if;
  if not exists (select 1 from public.brivia_messages where id = bid) then
    perform pg_temp.as_owner(); raise exception 'FAIL S3: B lost the message from before the block'; end if;
  perform pg_temp.as_member(a);
  if pg_temp.bodies(b, a) <> 'b-before' then
    perform pg_temp.as_owner(); raise exception 'FAIL S3: A sees "%" from B after the block', pg_temp.bodies(b, a); end if;
  if not exists (select 1 from public.brivia_messages where id = wid) then
    perform pg_temp.as_owner(); raise exception 'FAIL S3r: the sender''s own row fails the sender''s select policy'; end if;
  perform pg_temp.as_owner();
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brivia_messages') then
    raise exception 'FAIL S3r: brivia_messages is not in the supabase_realtime publication'; end if;
end $$;

-- S4: no attachment and no resume through a withheld message.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2);
begin
  perform pg_temp.as_member(b);
  if exists (select 1 from storage.objects where bucket_id = 'message-attachments' and name = a::text || '/pic.png') then
    perform pg_temp.as_owner(); raise exception 'FAIL S4: B reads the withheld picture'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf') then
    perform pg_temp.as_owner(); raise exception 'FAIL S4: B reads the resume through a withheld message'; end if;
  perform pg_temp.as_member(a);
  if not exists (select 1 from storage.objects where bucket_id = 'message-attachments' and name = a::text || '/pic.png') then
    perform pg_temp.as_owner(); raise exception 'FAIL S4: A cannot read the own picture'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf') then
    perform pg_temp.as_owner(); raise exception 'FAIL S4: A cannot read the own resume'; end if;
  perform pg_temp.as_owner();
end $$;

-- S5: withheld is permanent; new messages after the unblock flow normally.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2);
begin
  delete from public.brivia_blocks where blocker_id = b and blocked_id = a;
  perform pg_temp.as_member(b);
  if pg_temp.bodies(a, b) <> 'a-before' then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: unblocking released "%"', pg_temp.bodies(a, b); end if;
  if exists (select 1 from storage.objects where bucket_id = 'message-attachments' and name = a::text || '/pic.png') then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: unblocking released the withheld picture'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf') then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: unblocking released the resume through the withheld message'; end if;
  perform pg_temp.as_member(a);
  if pg_temp.bodies(b, a) <> 'b-before' then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: unblocking released "%" to A', pg_temp.bodies(b, a); end if;
  insert into public.brivia_messages (sender_id, recipient_id, body) values (a, b, 'a-later');
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, attachment_path)
  values (a, b, 'a-resume-later', 'resume', a::text || '/resume.pdf');
  perform pg_temp.as_member(b);
  if pg_temp.bodies(a, b) <> 'a-before,a-later,a-resume-later' then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: after the unblock B sees "%"', pg_temp.bodies(a, b); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'resumes' and name = a::text || '/resume.pdf') then
    perform pg_temp.as_owner(); raise exception 'FAIL S5: a resume shared after the unblock does not open'; end if;
  perform pg_temp.as_owner();
  if (select count(*) from brivia_private.withheld_message w join public.brivia_messages m on m.id = w.message_id
       where m.sender_id in (a, b)) <> 4 then
    raise exception 'FAIL S5: expected 4 withheld rows'; end if;
end $$;

-- S6: no match, no message (blocked or not).
do $$
declare a uuid := pg_temp.am(1); c uuid := pg_temp.am(3); st text;
begin
  foreach st in array array['open', 'blocked'] loop
    if st = 'blocked' then insert into public.brivia_blocks (blocker_id, blocked_id) values (c, a); end if;
    perform pg_temp.as_member(a);
    begin
      insert into public.brivia_messages (sender_id, recipient_id, body) values (a, c, 'unmatched');
      perform pg_temp.as_owner(); raise exception 'FAIL S6: a message to an unmatched member (%) was stored', st;
    exception when insufficient_privilege then null; end;
    perform pg_temp.as_owner();
  end loop;
  delete from public.brivia_blocks where blocker_id = c;
end $$;

-- S7: the withheld table is private to the server.
do $$
declare r text; p text; st text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege(r, 'brivia_private.withheld_message', p) then
        raise exception 'FAIL S7: % has % on brivia_private.withheld_message', r, p; end if;
    end loop;
    if has_function_privilege(r, 'public.brivia_withhold_blocked_message()', 'execute') then
      raise exception 'FAIL S7: % can execute brivia_withhold_blocked_message', r; end if;
  end loop;
  perform pg_temp.as_member(pg_temp.am(2));
  st := '';
  begin perform count(*) from brivia_private.withheld_message;
  exception when insufficient_privilege then st := 'denied'; end;
  perform pg_temp.as_owner();
  if st <> 'denied' then raise exception 'FAIL S7: authenticated can select brivia_private.withheld_message'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' and cmd = 'INSERT') <> 1 then
    raise exception 'FAIL S7: brivia_messages must keep exactly one insert policy'; end if;
end $$;

-- S8: moderation evidence still carries the withheld rows.
do $$
declare a uuid := pg_temp.am(1); b uuid := pg_temp.am(2); ev jsonb;
begin
  perform pg_temp.as_member(b);
  perform public.report_member(a, 'spam', null);
  perform pg_temp.as_owner();
  select evidence into ev from public.member_report where reporter_id = b and target_id = a;
  if not (ev @> '[{"body": "a-after"}]' and ev @> '[{"body": "a-pic"}]') then
    raise exception 'FAIL S8: report evidence lacks the withheld rows: %', ev; end if;
end $$;

select 'a5-blocked-send.test S1-S8 blocked sends are stored and withheld OK' as result;
rollback;
