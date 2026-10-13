-- 0009_signup_minimisation.sql: the privacy notice version with a 14-day grace window (Phase E, Task 1).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0001-0006 and 0008 (0007 is independent).
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Phase E rebuilds signup (no phone, no gender, no points screen), so the privacy notice changes and new declarations
-- carry a new version. A client deployed before this file still sends the previous version; it keeps working until
-- the window closes, so the deploy order never locks anyone out.
--   * brivia_notice_version()            the current version, '2026-10-20'. Every consent row written by the server
--                                        (sensitive_give, sensitive_withdraw, account_deleted) uses it unchanged.
--   * brivia_notice_accepted(v, at)      true for the current version; true for the previous version '2026-10-05'
--                                        until '2026-10-20'::date + 14 (exclusive); false otherwise.
--   * declare_adult(p_notice_version)    redefined once (from 0005's later definition; 0008 does not touch it): the
--                                        only change is that the stale check is now `not brivia_notice_accepted(...)`.
-- Change the version together with privacy.html and notice-version.js.

create or replace function public.brivia_notice_version()
returns text
language sql
immutable
set search_path = public
as $$ select '2026-10-20'::text $$;
revoke all on function public.brivia_notice_version() from public, anon;
grant execute on function public.brivia_notice_version() to authenticated;

create or replace function public.brivia_notice_accepted(p_version text, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    p_version = public.brivia_notice_version()
    or (p_version = '2026-10-05' and p_at < ('2026-10-20'::date + 14)::timestamptz),
    false)
$$;
revoke all on function public.brivia_notice_accepted(text, timestamptz) from public, anon;
grant execute on function public.brivia_notice_accepted(text, timestamptz) to authenticated;

-- declare_adult: the 0005 body (tombstone check included), with only the version check changed.
create or replace function public.declare_adult(p_notice_version text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_first boolean;
begin
  perform 1 from public.profiles where id = uid for update;
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if not public.brivia_notice_accepted(p_notice_version) then
    raise exception 'stale notice version' using errcode = '22023';
  end if;
  select adult_declared_at is null into v_first from public.profiles where id = uid;
  if v_first then
    perform set_config('brivia.consent_write', 'on', true);
    update public.profiles set adult_declared_at = coalesce(adult_declared_at, now()) where id = uid;
    perform set_config('brivia.consent_write', 'off', true);
    insert into public.consent_event (member_id, kind, notice_version) values (uid, 'adult', p_notice_version);
    if exists (select 1 from public.moderation_tombstone t
                where t.expires_at > now()
                  and t.digest = public.brivia_email_digest((select u.email from auth.users u where u.id = uid))) then
      insert into public.member_flag (member_id, reason) values (uid, 'rejoin_review') on conflict (member_id) do nothing;
    end if;
  end if;
end;
$$;
revoke all on function public.declare_adult(text) from public, anon;
grant execute on function public.declare_adult(text) to authenticated;
