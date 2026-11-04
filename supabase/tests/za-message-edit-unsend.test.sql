-- 0046 (D-157): edit, unsend, delete for me. Ids 0e460000-0000-4000-8000-0000000000NN: 01 A, 02 B (A's match), 03 C.
-- E1 grants: anon runs none of the three; authenticated runs all; members still have no UPDATE/DELETE on messages.
-- E2 edit: the sender's text message within 15 minutes; trims; sets edited_at; refused for the recipient, an old
--    message, an attachment, an empty body, an unsent message.
-- E3 unsend: only the sender; body '' and attachment cleared for both sides; returns the chat upload path, never the
--    resume path (the resume row stays valid under 0012's check); repeat is harmless; then edit is refused.
-- E4 delete for me: hides the message from that member only (the other still reads it); a third member is refused.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.em(n int) returns uuid language sql immutable as $$
  select ('0e460000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate || ':' || sqlerrm; end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9716, 77.6412, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.em(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Edit ' || g, 'Edit ' || g, 'edit' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.em(1), pg_temp.em(2)), greatest(pg_temp.em(1), pg_temp.em(2))) on conflict do nothing;
  insert into public.brivia_messages (id, sender_id, recipient_id, body) values
    ('0e460000-0000-4000-8000-0000000000a1', pg_temp.em(1), pg_temp.em(2), 'Hello thre'),
    ('0e460000-0000-4000-8000-0000000000a2', pg_temp.em(1), pg_temp.em(2), 'An old line'),
    ('0e460000-0000-4000-8000-0000000000a3', pg_temp.em(2), pg_temp.em(1), 'B says hi'),
    ('0e460000-0000-4000-8000-0000000000a6', pg_temp.em(2), pg_temp.em(1), 'B second');
  insert into public.brivia_messages (id, sender_id, recipient_id, body, message_type, attachment_path, attachment_name, attachment_mime, attachment_size) values
    ('0e460000-0000-4000-8000-0000000000a4', pg_temp.em(1), pg_temp.em(2), '', 'image', pg_temp.em(1)::text || '/photo.jpg', 'photo.jpg', 'image/jpeg', 10),
    ('0e460000-0000-4000-8000-0000000000a5', pg_temp.em(1), pg_temp.em(2), '', 'resume', pg_temp.em(1)::text || '/resume.pdf', 'Resume', 'application/pdf', 10);
  update public.brivia_messages set created_at = now() - interval '20 minutes' where id = '0e460000-0000-4000-8000-0000000000a2';
  if not public.brivia_member_completed(pg_temp.em(1)) then raise exception 'FAIL setup: A must be completed'; end if;
end $$;

-- E1
do $$
declare f text;
begin
  foreach f in array array['public.edit_message(uuid, text)', 'public.unsend_message(uuid)', 'public.delete_message_for_me(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL E1: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL E1: authenticated may not execute %', f; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' and cmd in ('UPDATE', 'DELETE', 'ALL')) then
    raise exception 'FAIL E1: a policy lets members update or delete messages directly'; end if;
end $$;
do $$
declare n int;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.em(1));
  update public.brivia_messages set body = 'direct' where id = '0e460000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL E1: a direct update changed % rows', n; end if;
end $$;

-- E2
do $$
declare r record; code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.em(1));
  select * into r from public.edit_message('0e460000-0000-4000-8000-0000000000a1', '  Hello there  ');
  if r.body <> 'Hello there' or r.edited_at is null then raise exception 'FAIL E2: edit answered %', r; end if;
  code := pg_temp.code_of('select * from public.edit_message(''0e460000-0000-4000-8000-0000000000a2'', ''late'')');
  if code not like '22023:edit window closed%' then raise exception 'FAIL E2: an old message answered %', code; end if;
  code := pg_temp.code_of('select * from public.edit_message(''0e460000-0000-4000-8000-0000000000a4'', ''caption'')');
  if code not like '22023:message cannot be edited%' then raise exception 'FAIL E2: an attachment answered %', code; end if;
  code := pg_temp.code_of('select * from public.edit_message(''0e460000-0000-4000-8000-0000000000a1'', ''   '')');
  if code not like '22023:invalid message%' then raise exception 'FAIL E2: an empty body answered %', code; end if;
  code := pg_temp.code_of('select * from public.edit_message(''0e460000-0000-4000-8000-0000000000a3'', ''not mine'')');
  if code not like 'P0002:message not found%' then raise exception 'FAIL E2: editing the other member''s message answered %', code; end if;
  -- B reads the edit.
  perform pg_temp.as_member(pg_temp.em(2));
  if (select body from public.brivia_messages where id = '0e460000-0000-4000-8000-0000000000a1') <> 'Hello there' then
    raise exception 'FAIL E2: the recipient does not read the edit'; end if;
end $$;

-- E3
do $$
declare r record; code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.em(2));
  code := pg_temp.code_of('select * from public.unsend_message(''0e460000-0000-4000-8000-0000000000a1'')');
  if code not like 'P0002:message not found%' then raise exception 'FAIL E3: the recipient unsent a message (%)', code; end if;
  perform pg_temp.as_member(pg_temp.em(1));
  select * into r from public.unsend_message('0e460000-0000-4000-8000-0000000000a4');
  if r.unsent_at is null or r.removed_path is distinct from pg_temp.em(1)::text || '/photo.jpg' then raise exception 'FAIL E3: image unsend answered %', r; end if;
  select * into r from public.unsend_message('0e460000-0000-4000-8000-0000000000a5');
  if r.unsent_at is null or r.removed_path is not null then raise exception 'FAIL E3: resume unsend answered % (the resume file is the member''s own)', r; end if;
  select * into r from public.unsend_message('0e460000-0000-4000-8000-0000000000a1');
  select * into r from public.unsend_message('0e460000-0000-4000-8000-0000000000a1');
  if r.unsent_at is null then raise exception 'FAIL E3: a repeat unsend answered %', r; end if;
  code := pg_temp.code_of('select * from public.edit_message(''0e460000-0000-4000-8000-0000000000a1'', ''back'')');
  if code not like '22023:message cannot be edited%' then raise exception 'FAIL E3: editing an unsent message answered %', code; end if;
  perform pg_temp.as_member(pg_temp.em(2));
  if exists (select 1 from public.brivia_messages where id in ('0e460000-0000-4000-8000-0000000000a1', '0e460000-0000-4000-8000-0000000000a4', '0e460000-0000-4000-8000-0000000000a5')
              and (body <> '' or attachment_path is not null or unsent_at is null)) then
    raise exception 'FAIL E3: the recipient still reads unsent content'; end if;
end $$;

-- E4
do $$
declare code text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.em(1));
  perform public.delete_message_for_me('0e460000-0000-4000-8000-0000000000a6');
  perform public.delete_message_for_me('0e460000-0000-4000-8000-0000000000a6');
  if exists (select 1 from public.brivia_messages where id = '0e460000-0000-4000-8000-0000000000a6') then
    raise exception 'FAIL E4: the message is still visible to A'; end if;
  if not exists (select 1 from public.brivia_messages where id = '0e460000-0000-4000-8000-0000000000a3') then
    raise exception 'FAIL E4: another message went too'; end if;
  perform pg_temp.as_member(pg_temp.em(2));
  if not exists (select 1 from public.brivia_messages where id = '0e460000-0000-4000-8000-0000000000a6') then
    raise exception 'FAIL E4: the sender lost the message'; end if;
  perform pg_temp.as_member(pg_temp.em(3));
  code := pg_temp.code_of('select public.delete_message_for_me(''0e460000-0000-4000-8000-0000000000a3'')');
  if code not like 'P0002:message not found%' then raise exception 'FAIL E4: a third member answered %', code; end if;
end $$;

select 'za-message-edit-unsend.test.sql OK' as result;
