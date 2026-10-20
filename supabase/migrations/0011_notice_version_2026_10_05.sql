-- 0011_notice_version_2026_10_05.sql: the 2026-10-05 privacy notice is current again, with no expiry (D-070).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0009 and 0010 (both live since 2026-10-14).
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Why. 0009 (Phase E, guided signup) made '2026-10-20' the current notice and accepted the old '2026-10-05' only until
-- '2026-10-20'::date + 14 = 2026-11-03 00:00 UTC. The guided signup was then removed (D-069): the live client sends
-- NOTICE_VERSION '2026-10-05' (site/scripts/notice-version.js) and site/privacy.html is version 2026-10-05, which is
-- the accurate notice again (phone and gender are collected). Left alone, from 2026-11-03 every declare_adult on the
-- live site fails with 22023 and no new member can finish signup. D-069 said the database needed nothing; that was
-- wrong because 0009 and 0010 had been applied live on 2026-10-14 (D-070).
--   * brivia_notice_version()            '2026-10-05' again. Server-written consent rows (sensitive_give,
--                                        sensitive_withdraw, account_deleted) record it from now on.
--   * brivia_notice_accepted(v, at)      true for '2026-10-05' and for '2026-10-20' at any date; false otherwise
--                                        (unknown, empty, null). '2026-10-20' stays accepted so a member who declared it
--                                        during 14-20 Oct (the guided signup) is never treated as stale, and a cached
--                                        guided-signup tab still completes. p_at is kept (same signature) and unused.
--   * declare_adult is NOT redefined: since 0009 its only version check is `not brivia_notice_accepted(p_notice_version)`,
--     and its consent row stores what the client declared. Nothing else compares a stored notice_version: consent_event
--     rows are append-only history, and deletion/retention never read the version.
-- Same signatures, volatility, security (invoker) and grants as 0009. Change the version together with privacy.html
-- and notice-version.js.

create or replace function public.brivia_notice_version()
returns text
language sql
immutable
set search_path = public
as $$ select '2026-10-05'::text $$;
revoke all on function public.brivia_notice_version() from public, anon;
grant execute on function public.brivia_notice_version() to authenticated;

create or replace function public.brivia_notice_accepted(p_version text, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_version = public.brivia_notice_version() or p_version = '2026-10-20', false)
$$;
revoke all on function public.brivia_notice_accepted(text, timestamptz) from public, anon;
grant execute on function public.brivia_notice_accepted(text, timestamptz) to authenticated;
