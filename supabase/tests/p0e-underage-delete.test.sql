set brivia.harness_autocomplete = 'off';
-- Phase E final fix I3: "No" at the 18+ screen deletes the just-created account through delete_my_account.
-- At that moment the member has an auth.users row and a fresh session (the code was just verified), but NO profiles
-- row and NO adult_declared_at ("Yes" creates the profile through ensureOwnProfile; "No" never does).
--   U1 a fresh otp amr: delete_my_account('DELETE') succeeds; the auth user is gone; no profile row ever existed;
--      consent_event('account_deleted') is written; no moderation_tombstone is left
--   U2 a stale amr (e.g. a Google session older than 600 s): P0001 reauth_required, and the auth user stays
--      (the client then still signs out and shows the adults-only copy)
-- One transaction, rolled back.
begin;

create or replace function pg_temp.id(n int) returns uuid language sql as
$$ select ('a5e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create or replace function pg_temp.del(p_uid uuid, p_amr jsonb) returns text language plpgsql as $f$
declare claims jsonb := jsonb_build_object('sub', p_uid, 'amr', p_amr); st text := ''; msg text := '';
begin
  set local session authorization authenticated; set local role authenticated;
  perform set_config('request.jwt.claims', claims::text, true);
  begin perform public.delete_my_account('DELETE');
  exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text; end;
  reset role; reset session authorization;
  perform set_config('request.jwt.claims', '', true);
  return st || '|' || msg;
end $f$;

insert into auth.users(id, email) values (pg_temp.id(1), 'under1@example.com'), (pg_temp.id(2), 'under2@example.com');

do $$
declare r text;
begin
  if exists (select 1 from public.profiles where id in (pg_temp.id(1), pg_temp.id(2))) then
    raise exception 'FAIL U0: fixture must have no profiles row';
  end if;

  -- U1
  r := pg_temp.del(pg_temp.id(1),
         jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - 20)));
  if r <> '|' then raise exception 'FAIL U1: delete_my_account without a profile row returned %', r; end if;
  if exists (select 1 from auth.users where id = pg_temp.id(1)) then raise exception 'FAIL U1: auth user still present'; end if;
  if exists (select 1 from public.profiles where id = pg_temp.id(1)) then raise exception 'FAIL U1: a profile row appeared'; end if;
  if not exists (select 1 from public.consent_event where member_id = pg_temp.id(1) and kind = 'account_deleted') then
    raise exception 'FAIL U1: no consent_event account_deleted';
  end if;
  if exists (select 1 from public.moderation_tombstone where digest = public.brivia_email_digest('under1@example.com')) then
    raise exception 'FAIL U1: an unreported member left a tombstone';
  end if;

  -- U2
  r := pg_temp.del(pg_temp.id(2),
         jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint - 700)));
  if r <> 'P0001|reauth_required' then raise exception 'FAIL U2: stale session returned %', r; end if;
  if not exists (select 1 from auth.users where id = pg_temp.id(2)) then raise exception 'FAIL U2: auth user was deleted'; end if;

  raise notice 'p0e-underage-delete: U1-U2 passed';
end $$;

rollback;
