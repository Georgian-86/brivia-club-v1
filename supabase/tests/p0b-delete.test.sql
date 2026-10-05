set brivia.harness_autocomplete = 'off';
-- Iteration 4 (P0-B), Task 5: delete_my_account and the storage delete policies (R5, R6 at deletion).
--   D1 refused without 'DELETE' (22023); no session (P0002); stale or missing amr (P0001 reauth_required)
--   D2 refused with a member-bucket object by folder, by owner_id, by owner (P0001 storage_not_empty);
--      a career-resumes object owned by the member does not block
--   D3 success: no row references the uid through any FK to public.profiles (enumerated from pg_constraint),
--      the profile and auth user are gone, consent_event('account_deleted') exists, nothing was deleted from storage
--   D4 the member's report against someone survives with reporter_id null; a report against the member survives
--   D5 tombstone only for a reported or flagged member (digest of the auth email, reasons, report ids, +365 d)
--   D6 the storage delete policies exist for profile-photos and profile-covers
--   D7 clients can run the RPC (authenticated) and anon cannot
-- Client sessions use SET LOCAL SESSION AUTHORIZATION. One transaction, rolled back.
begin;

create or replace function pg_temp.id(n int) returns uuid language sql as
$$ select ('a5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create or replace function pg_temp.mk(n int) returns void language plpgsql as $f$
declare mid uuid := pg_temp.id(n); cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  insert into auth.users(id, email) values (mid, 'dl' || n || '@example.com') on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values (mid, 'Del ' || n, 'Del ' || n, 'dl' || n || '@example.com')
  on conflict (id) do nothing;
  update public.profiles set adult_declared_at = now() where id = mid;
  insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
  values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune') on conflict (member_id) do nothing;
  insert into public.member_interest (member_id, interest_id, points, mode)
  values (mid, 'sports.racket.badminton', 20, 'play') on conflict do nothing;
end $f$;

-- Call delete_my_account as a client; returns the sqlstate and message ('' when it succeeded).
create or replace function pg_temp.del(p_uid uuid, p_confirm text, p_amr jsonb) returns text language plpgsql as $f$
declare claims jsonb := jsonb_build_object('sub', p_uid); st text := ''; msg text := '';
begin
  if p_amr is not null then claims := claims || jsonb_build_object('amr', p_amr); end if;
  set local session authorization authenticated; set local role authenticated;
  perform set_config('request.jwt.claims', claims::text, true);
  begin perform public.delete_my_account(p_confirm);
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text; end;
  reset role; reset session authorization;
  perform set_config('request.jwt.claims', '', true);
  return st || '|' || msg;
end $f$;

create or replace function pg_temp.fresh() returns jsonb language sql as
$$ select jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 30)) $$;
create or replace function pg_temp.stale() returns jsonb language sql as
$$ select jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 700),
                            jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - 5000)) $$;

select pg_temp.mk(n) from generate_series(1, 8) n;
-- 1 = deleter with relations; 2 = peer; 3 = reported member; 4 = unreported control; 5 = reporter of 3 and flagged-only 6
insert into storage.buckets (id, name) values ('profile-photos', 'profile-photos'), ('career-resumes', 'career-resumes'),
  ('message-attachments', 'message-attachments'), ('profile-covers', 'profile-covers'), ('community-posts', 'community-posts')
  on conflict do nothing;

-- D6/D7: policies and grants
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE'
         and policyname in ('Members can delete their profile photos', 'Members can delete their profile covers')) <> 2 then
    raise exception 'FAIL D6: storage delete policies for profile photos/covers are missing';
  end if;
  if has_function_privilege('anon', 'public.delete_my_account(text)', 'execute') then raise exception 'FAIL D7: anon may delete'; end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute') then raise exception 'FAIL D7: authenticated cannot'; end if;
end $$;

-- relations for member 1 (every kind of row the member owns)
insert into public.interaction (viewer_id, target_id, event) values (pg_temp.id(1), pg_temp.id(2), 'like'), (pg_temp.id(2), pg_temp.id(1), 'like');
insert into public.brivia_messages (sender_id, recipient_id, body) values (pg_temp.id(1), pg_temp.id(2), 'a'), (pg_temp.id(2), pg_temp.id(1), 'b');
insert into public.connection_requests (from_id, to_id) values (pg_temp.id(1), pg_temp.id(2));
insert into public.matches (user1_id, user2_id) values (pg_temp.id(1), pg_temp.id(2));
insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.id(1), pg_temp.id(7)), (pg_temp.id(7), pg_temp.id(1));
insert into public.community_posts (author_id, image_url, image_path) values (pg_temp.id(1), 'https://proj.supabase.co/storage/v1/object/public/community-posts/' || pg_temp.id(1) || '/ok.jpg', pg_temp.id(1) || '/ok.jpg');
insert into public.signal_ledger (sender_id, to_id) values (pg_temp.id(1), pg_temp.id(2));
insert into public.interest_rewrite (member_id) values (pg_temp.id(1));
insert into public.location_change (member_id) values (pg_temp.id(1));
insert into public.report_attempt (reporter_id) values (pg_temp.id(1));
insert into public.member_report (reporter_id, target_id, reason, qualifying) values (pg_temp.id(1), pg_temp.id(2), 'spam', false);
insert into public.member_report (reporter_id, target_id, reason, qualifying)
values (pg_temp.id(5), pg_temp.id(1), 'harassment', true), (pg_temp.id(7), pg_temp.id(3), 'spam', true), (pg_temp.id(5), pg_temp.id(3), 'fake', true);
insert into public.member_flag (member_id, reason) values (pg_temp.id(1), 'reported');

-- D1: argument and recency refusals (each leaves the member in place)
do $$
declare r text; m uuid := pg_temp.id(1);
begin
  r := pg_temp.del(m, 'delete', pg_temp.fresh());
  if split_part(r, '|', 1) <> '22023' then raise exception 'FAIL D1: lowercase confirm gave %', r; end if;
  r := pg_temp.del(m, null, pg_temp.fresh());
  if split_part(r, '|', 1) <> '22023' then raise exception 'FAIL D1: null confirm gave %', r; end if;
  r := pg_temp.del(m, 'DELETE', pg_temp.stale());
  if r <> 'P0001|reauth_required' then raise exception 'FAIL D1: stale amr gave %', r; end if;
  r := pg_temp.del(m, 'DELETE', null);
  if r <> 'P0001|reauth_required' then raise exception 'FAIL D1: missing amr gave %', r; end if;
  r := pg_temp.del(m, 'DELETE', '[]'::jsonb);
  if r <> 'P0001|reauth_required' then raise exception 'FAIL D1: empty amr gave %', r; end if;
  r := pg_temp.del(m, 'DELETE', '"password"'::jsonb);
  if r <> 'P0001|reauth_required' then raise exception 'FAIL D1: scalar amr gave %', r; end if;
  -- a boundary-fresh login (599 s ago) counts; one older than 10 minutes does not (checked above with 700 s)
  -- no session at all
  set local session authorization authenticated; set local role authenticated;
  perform set_config('request.jwt.claims', '', true);
  begin perform public.delete_my_account('DELETE'); raise exception 'FAIL D1: no session accepted';
  exception when sqlstate 'P0002' then null; end;
  reset role; reset session authorization;
  if not exists (select 1 from public.profiles where id = m) then raise exception 'FAIL D1: a refused call deleted the member'; end if;
end $$;

-- D2: a stored object blocks deletion: by folder in each of the 4 buckets, by owner_id, by owner
do $$
declare r text; m uuid := pg_temp.id(1); b text; oid uuid;
begin
  foreach b in array array['profile-photos', 'profile-covers', 'message-attachments', 'community-posts'] loop
    insert into storage.objects (bucket_id, name) values (b, m || '/x.png') returning id into oid;
    r := pg_temp.del(m, 'DELETE', pg_temp.fresh());
    if r <> 'P0001|storage_not_empty' then raise exception 'FAIL D2: folder object in % gave %', b, r; end if;
    set local storage.allow_delete_query = 'true'; delete from storage.objects where id = oid; set local storage.allow_delete_query = 'false';
  end loop;
  insert into storage.objects (bucket_id, name, owner_id) values ('message-attachments', pg_temp.id(2) || '/theirs.png', m::text) returning id into oid;
  r := pg_temp.del(m, 'DELETE', pg_temp.fresh());
  if r <> 'P0001|storage_not_empty' then raise exception 'FAIL D2: owner_id object gave %', r; end if;
  set local storage.allow_delete_query = 'true'; delete from storage.objects where id = oid; set local storage.allow_delete_query = 'false';
  insert into storage.objects (bucket_id, name, owner) values ('community-posts', 'loose/y.png', m) returning id into oid;
  r := pg_temp.del(m, 'DELETE', pg_temp.fresh());
  if r <> 'P0001|storage_not_empty' then raise exception 'FAIL D2: owner object gave %', r; end if;
  set local storage.allow_delete_query = 'true'; delete from storage.objects where id = oid; set local storage.allow_delete_query = 'false';
  -- another member's object in their own folder does not block
  insert into storage.objects (bucket_id, name, owner_id) values ('profile-photos', pg_temp.id(2) || '/z.png', pg_temp.id(2)::text);
  -- career-resumes (a separate recruiting purpose) never blocks, by owner_id or owner
  insert into storage.objects (bucket_id, name, owner, owner_id) values ('career-resumes', 'cv/' || m || '.pdf', m, m::text);
  if not exists (select 1 from public.profiles where id = m) then raise exception 'FAIL D2: a refused call deleted the member'; end if;
end $$;

-- D3/D4/D5: success. Snapshot what must change, delete, check.
do $$
declare r text; m uuid := pg_temp.id(1); n int; before_refs int := 0; rec record; c bigint; cnt_obj int;
begin
  -- non-vacuity: the member is referenced from many tables through FKs to profiles
  for rec in select conrelid::regclass as t, a.attname as col
               from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
              where k.contype = 'f' and k.confrelid = 'public.profiles'::regclass loop
    execute format('select count(*) from %s where %I = $1', rec.t, rec.col) into c using m;
    if c > 0 then before_refs := before_refs + 1; end if;
  end loop;
  if before_refs < 10 then raise exception 'FAIL D3 setup: only % tables reference the member', before_refs; end if;
  select count(*) into cnt_obj from storage.objects;

  r := pg_temp.del(m, 'DELETE', pg_temp.fresh());
  if r <> '|' then raise exception 'FAIL D3: deletion failed: %', r; end if;

  for rec in select conrelid::regclass as t, a.attname as col
               from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
              where k.contype = 'f' and k.confrelid = 'public.profiles'::regclass loop
    execute format('select count(*) from %s where %I = $1', rec.t, rec.col) into c using m;
    if c <> 0 then raise exception 'FAIL D3: % rows in % (%) still reference the member', c, rec.t, rec.col; end if;
  end loop;
  if exists (select 1 from public.profiles where id = m) or exists (select 1 from auth.users where id = m) then
    raise exception 'FAIL D3: profile or auth user remains';
  end if;
  if (select count(*) from storage.objects) <> cnt_obj then raise exception 'FAIL D3: storage.objects changed'; end if;
  if (select count(*) from public.consent_event where member_id = m and kind = 'account_deleted') <> 1 then
    raise exception 'FAIL D3: no account_deleted consent event';
  end if;
  -- D4
  if not exists (select 1 from public.member_report where target_id = pg_temp.id(2) and reporter_id is null and reason = 'spam') then
    raise exception 'FAIL D4: the member''s own report lost or still carries the reporter id';
  end if;
  if not exists (select 1 from public.member_report where target_id = m and reason = 'harassment' and reporter_id = pg_temp.id(5)) then
    raise exception 'FAIL D4: the report against the member did not survive';
  end if;
  -- D5: member 1 had a report and a flag: tombstone with the digest of the auth email
  select count(*) into n from public.moderation_tombstone;
  if n <> 1 then raise exception 'FAIL D5: % tombstones', n; end if;
  if not exists (select 1 from public.moderation_tombstone t
                  where t.digest = public.brivia_email_digest('dl1@example.com') and 'harassment' = any (t.reasons)
                    and 'reported' = any (t.reasons) and t.report_ids is not null and cardinality(t.report_ids) = 1
                    and t.expires_at between now() + interval '364 days' and now() + interval '366 days') then
    raise exception 'FAIL D5: tombstone content wrong: %', (select row_to_json(t) from public.moderation_tombstone t limit 1);
  end if;
end $$;

-- D5 (continued): a member with a report only, a flag only, and a clean member
insert into public.member_flag (member_id, reason) values (pg_temp.id(6), 'restricted');
do $$
declare r text; n int;
begin
  r := pg_temp.del(pg_temp.id(4), 'DELETE', pg_temp.fresh());
  if r <> '|' then raise exception 'FAIL D5: clean member delete: %', r; end if;
  if (select count(*) from public.moderation_tombstone) <> 1 then raise exception 'FAIL D5: a clean member left a tombstone'; end if;
  r := pg_temp.del(pg_temp.id(6), 'DELETE', pg_temp.fresh());
  if r <> '|' then raise exception 'FAIL D5: flagged member delete: %', r; end if;
  if not exists (select 1 from public.moderation_tombstone where digest = public.brivia_email_digest('dl6@example.com') and 'restricted' = any (reasons)) then
    raise exception 'FAIL D5: a flagged member left no tombstone';
  end if;
  r := pg_temp.del(pg_temp.id(3), 'DELETE', pg_temp.fresh());
  if r <> '|' then raise exception 'FAIL D5: reported member delete: %', r; end if;
  if (select cardinality(report_ids) from public.moderation_tombstone where digest = public.brivia_email_digest('dl3@example.com')) <> 2 then
    raise exception 'FAIL D5: reported member tombstone lacks both report ids';
  end if;
  -- the reporter (member 5) is untouched and still present
  if not exists (select 1 from public.profiles where id = pg_temp.id(5)) then raise exception 'FAIL D4: a bystander was deleted'; end if;
end $$;

-- D5 (merge): the same email deleting again merges into its tombstone (no unique violation)
do $$
declare r text;
begin
  perform pg_temp.mk(9);
  update auth.users set email = 'dl3@example.com' where id = pg_temp.id(9);
  insert into public.member_flag (member_id, reason) values (pg_temp.id(9), 'rejoin_review');
  r := pg_temp.del(pg_temp.id(9), 'DELETE', pg_temp.fresh());
  if r <> '|' then raise exception 'FAIL D5: merge delete: %', r; end if;
  if not exists (select 1 from public.moderation_tombstone where digest = public.brivia_email_digest('dl3@example.com')
                   and 'rejoin_review' = any (reasons) and 'fake' = any (reasons)) then
    raise exception 'FAIL D5: tombstone not merged';
  end if;
end $$;

rollback;
select 'p0b-delete: ok' as result;
