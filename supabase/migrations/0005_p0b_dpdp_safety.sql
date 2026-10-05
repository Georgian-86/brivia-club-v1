-- 0005_p0b_dpdp_safety.sql: iteration 4 (P0-B): DPDP consent, member safety, honesty.
-- Apply only this file on the live project (0001-0004 are applied and frozen). Idempotent: the harness runs it twice.
-- Sections (appended by task, in order):
--   1. 18+ declaration gate, consent history, consent column guard (R1, R3)
-- Spec: docs/ORBIT_ENGINE.md section 7; rulings: docs/arena/2026-10-05-p0b-design.md.

-- =============================================================================================
-- 1. The 18+ gate and consent history (R1, R3)
-- =============================================================================================
-- The notice version a declaration or consent refers to. Change together with privacy.html and notice-version.js.
create or replace function public.brivia_notice_version()
returns text
language sql
immutable
set search_path = public
as $$ select '2026-10-05'::text $$;
revoke all on function public.brivia_notice_version() from public, anon;
grant execute on function public.brivia_notice_version() to authenticated;

-- "I am 18 or older", with the moment it was said. Written only by declare_adult (or an owner session).
alter table public.profiles add column if not exists adult_declared_at timestamptz;

-- Append-only consent history. member_id has no FK on purpose: rows outlive the account (R3). Owner-only.
create table if not exists public.consent_event (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  kind text not null,
  notice_version text,
  at timestamptz not null default now()
);
alter table public.consent_event drop constraint if exists consent_event_kind_check;
alter table public.consent_event add constraint consent_event_kind_check
  check (kind in ('adult', 'sensitive_give', 'sensitive_withdraw', 'account_deleted'));
create index if not exists consent_event_member_at_idx on public.consent_event (member_id, at);
alter table public.consent_event enable row level security;
revoke all on public.consent_event from public, anon, authenticated;
revoke all on sequence public.consent_event_id_seq from public, anon, authenticated;

-- Owner session = current_user AND session_user own the table (the seed / SQL editor). A definer RPC called by a client
-- has current_user = owner but session_user = the API role, so it is not an owner session.
-- Insert guard: 0004 body plus adult_declared_at (one trigger, create or replace).
create or replace function public.brivia_profiles_consent_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not (current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)
          and session_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)) then
    new.sensitive_consent_at := null;
    new.adult_declared_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_profiles_consent_on_insert() from public, anon, authenticated;

-- Update guard (B-I5): the two consent columns survive any update that is not (a) an owner session or (b) a definer
-- consent RPC that set brivia.consent_write locally. A client cannot reach (b): current_user must be the owner too,
-- so a client that sets the flag itself (even with a temporary UPDATE grant) changes nothing.
create or replace function public.brivia_profiles_consent_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_owner text := (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid);
begin
  if current_user = v_owner
     and (session_user = v_owner or coalesce(current_setting('brivia.consent_write', true), '') = 'on') then
    return new;
  end if;
  new.adult_declared_at := old.adult_declared_at;
  new.sensitive_consent_at := old.sensitive_consent_at;
  return new;
end;
$$;
revoke all on function public.brivia_profiles_consent_guard() from public, anon, authenticated;
drop trigger if exists brivia_profiles_consent_guard on public.profiles;
create trigger brivia_profiles_consent_guard before update on public.profiles
  for each row execute function public.brivia_profiles_consent_guard();

-- set_sensitive_consent: the 0004 body plus the local guard flag (consent_event rows are added in a later section).
create or replace function public.set_sensitive_consent(p_consent boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  perform 1 from public.profiles where id = uid for update;
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if p_consent is null then
    raise exception 'invalid consent' using errcode = '22023';
  end if;
  perform set_config('brivia.consent_write', 'on', true);
  if p_consent then
    update public.profiles set sensitive_consent_at = coalesce(sensitive_consent_at, now()) where id = uid;
  else
    delete from public.member_interest mi
     using public.interest_node nd
     where mi.member_id = uid and nd.id = mi.interest_id and nd.sensitive;
    update public.profiles set sensitive_consent_at = null, updated_at = now() where id = uid;
  end if;
  perform set_config('brivia.consent_write', 'off', true);
end;
$$;
revoke all on function public.set_sensitive_consent(boolean) from public, anon;
grant execute on function public.set_sensitive_consent(boolean) to authenticated;

-- declare_adult(p_notice_version): "I am 18 or older". The first call stamps the profile and appends a consent_event;
-- later calls change nothing. A stale notice version is refused (22023); no profile is P0002.
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
  if p_notice_version is distinct from public.brivia_notice_version() then
    raise exception 'stale notice version' using errcode = '22023';
  end if;
  select adult_declared_at is null into v_first from public.profiles where id = uid;
  if v_first then
    perform set_config('brivia.consent_write', 'on', true);
    update public.profiles set adult_declared_at = coalesce(adult_declared_at, now()) where id = uid;
    perform set_config('brivia.consent_write', 'off', true);
    insert into public.consent_event (member_id, kind, notice_version) values (uid, 'adult', p_notice_version);
  end if;
end;
$$;
revoke all on function public.declare_adult(text) from public, anon;
grant execute on function public.declare_adult(text) to authenticated;

-- Completion: 0004 body plus the declaration (inside the first EXISTS) and the suspension flag.
create or replace function public.brivia_member_completed(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.profiles p where p.id = p_id and public.brivia_is_completed(p.name, 'x')
                                              and p.adult_declared_at is not null)
    -- an anonymous account (Supabase anonymous sign-in) is never completed (D-038 hygiene, B-F3)
    and not exists (select 1 from auth.users u where u.id = p_id and coalesce(u.is_anonymous, false))
    and exists (select 1 from public.member_orbit o where o.member_id = p_id)
    and (select count(*) between 1 and 12 and coalesce(sum(mi.points), 0) = 20
           from public.member_interest mi where mi.member_id = p_id)
    -- the completion floor (D-038 R3): at least one non-sensitive interest
    and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                 where mi.member_id = p_id and not nd.sensitive)
    -- a member under review (R4/R5) is not shown to anyone until an operator lifts the flag
    and not exists (select 1 from public.member_flag f where f.member_id = p_id and f.reason = 'suspended_pending_review'),
    false)
$$;
revoke all on function public.brivia_member_completed(uuid) from public, anon, authenticated;

-- Location and interests are never processed before the declaration: a non-owner write for an undeclared member is
-- refused (P0001). Owner sessions (seed, cron, SQL editor) are unaffected.
create or replace function public.brivia_require_adult()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner text := (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.profiles'::regclass);
begin
  if current_user = v_owner and session_user = v_owner then
    return new;
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.member_id and p.adult_declared_at is not null) then
    raise exception 'adult declaration required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_require_adult() from public, anon, authenticated;
drop trigger if exists brivia_require_adult on public.member_orbit;
create trigger brivia_require_adult before insert or update on public.member_orbit
  for each row execute function public.brivia_require_adult();
drop trigger if exists brivia_require_adult on public.member_interest;
create trigger brivia_require_adult before insert or update on public.member_interest
  for each row execute function public.brivia_require_adult();

-- Backfill (guarded): test members are declared by the seed; real members declare in the app.
update public.profiles set adult_declared_at = now() where is_test and adult_declared_at is null;
