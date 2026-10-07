-- 0005_p0b_dpdp_safety.sql: iteration 4 (P0-B): DPDP consent, member safety, honesty.
-- Apply only this file on the live project (0001-0004 are applied and frozen). Idempotent: the harness runs it twice.
-- Sections (appended by task, in order):
--   1. 18+ declaration gate, consent history, consent column guard (R1, R3)
--   2. Sensitive consent: give and redistributing withdrawal (R2)
--   3. report_member, member_flag expiry, suspension, rejoin tombstone; brivia_require_adult withdrawal carve-out (R4, R6).
--      A report qualifies on a relation other than an automatic 'impression' (the deck and search write those).
--   4. Storage delete policies, delete_my_account, retention purge, city-wide label (R5, R7, R9)
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

-- =============================================================================================
-- 2. Sensitive consent: give and withdraw (R2)
-- =============================================================================================
-- set_sensitive_consent(p_consent), redefined (create or replace; the section 1 version is superseded):
--   true  -> coalesce(sensitive_consent_at, now()); a consent_event 'sensitive_give' only when it was null (give twice = one event);
--   false -> delete the member's sensitive member_interest rows and REDISTRIBUTE their points over the remaining rows by
--            largest remainder: base = floor(p_i * 20 / P) (P = the remaining sum; always >= 1 because p_i >= 1 > P/20),
--            the leftover units go one each to the largest fractional parts (p_i * 20 mod P), ties by interest_id;
--            profiles.skills is refreshed as set_member_interests does; NO interest_rewrite row (a withdrawal is not a
--            rewrite); sensitive_consent_at is nulled and a 'sensitive_withdraw' event is appended.
-- Both set brivia.consent_write locally so the consent column guard lets the owner-context update through.
create or replace function public.set_sensitive_consent(p_consent boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_had timestamptz;
  v_deleted int;
begin
  perform 1 from public.profiles where id = uid for update;
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if p_consent is null then
    raise exception 'invalid consent' using errcode = '22023';
  end if;
  select sensitive_consent_at into v_had from public.profiles where id = uid;
  perform set_config('brivia.consent_write', 'on', true);
  if p_consent then
    update public.profiles set sensitive_consent_at = coalesce(sensitive_consent_at, now()) where id = uid;
    if v_had is null then
      insert into public.consent_event (member_id, kind, notice_version)
      values (uid, 'sensitive_give', public.brivia_notice_version());
    end if;
  else
    delete from public.member_interest mi
     using public.interest_node nd
     where mi.member_id = uid and nd.id = mi.interest_id and nd.sensitive;
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 and exists (select 1 from public.member_interest where member_id = uid) then
      with cur as (
        select mi.interest_id, mi.points::int as p, sum(mi.points) over () as total
          from public.member_interest mi where mi.member_id = uid
      ), base as (
        select interest_id, (p * 20) / total::int as b, (p * 20) % total::int as frac, total::int as total
          from cur
      ), ranked as (
        select interest_id, b,
               row_number() over (order by frac desc, interest_id asc) as rk,
               20 - sum(b) over () as leftover
          from base
      )
      update public.member_interest mi
         set points = (r.b + case when r.rk <= r.leftover then 1 else 0 end)::smallint
        from ranked r
       where mi.member_id = uid and mi.interest_id = r.interest_id;
      update public.profiles
         set skills = coalesce((select array_agg(n.label order by mi.points desc, n.label asc)
                                  from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
                                 where mi.member_id = uid and not n.sensitive), '{}')
       where id = uid;
    end if;
    update public.profiles set sensitive_consent_at = null, updated_at = now() where id = uid;
    if v_had is not null or v_deleted > 0 then
      insert into public.consent_event (member_id, kind, notice_version)
      values (uid, 'sensitive_withdraw', public.brivia_notice_version());
    end if;
  end if;
  perform set_config('brivia.consent_write', 'off', true);
end;
$$;
revoke all on function public.set_sensitive_consent(boolean) from public, anon;
grant execute on function public.set_sensitive_consent(boolean) to authenticated;


-- =============================================================================================
-- 3. Reports, flags, suspension and the rejoin tombstone (R4, R6)
-- =============================================================================================
-- Carried-in fix (Task 3 review): the redistribution UPDATE inside set_sensitive_consent(false) must not be refused for
-- an undeclared member. brivia_require_adult is now SECURITY INVOKER so current_user is the real caller: it is the table
-- owner only inside a definer RPC (or an owner session). The carve-out is the narrowest one: an UPDATE of member_interest
-- while brivia.consent_write = 'on'. Inserts and member_orbit writes stay gated, so a stray flag opens nothing else.
create or replace function public.brivia_is_declared(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = p_id and p.adult_declared_at is not null) $$;
revoke all on function public.brivia_is_declared(uuid) from public, anon, authenticated;

create or replace function public.brivia_require_adult()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_owner text := (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.profiles'::regclass);
begin
  if current_user = v_owner and session_user = v_owner then
    return new;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'member_interest' and current_user = v_owner
     and coalesce(current_setting('brivia.consent_write', true), '') = 'on' then
    return new;
  end if;
  if not public.brivia_is_declared(new.member_id) then
    raise exception 'adult declaration required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_require_adult() from public, anon, authenticated;

-- Flags expire (automatic 'reported' flags after 90 days; founder flags and suspensions have no expiry).
alter table public.member_flag add column if not exists expires_at timestamptz;

-- Per-reporter attempt ledger for the cap (10 per rolling 24 h). Charged after the profile check; an argument error rolls the charge back. Owner-only.
create table if not exists public.report_attempt (
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists report_attempt_reporter_at_idx on public.report_attempt (reporter_id, at);
alter table public.report_attempt enable row level security;
revoke all on public.report_attempt from public, anon, authenticated;

-- Reports. target_id has no FK on purpose (the report outlives the target's account). Owner-only.
create table if not exists public.member_report (
  id bigint generated always as identity primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  target_id uuid not null,
  reason text not null,
  note text,
  evidence jsonb not null default '[]'::jsonb,
  qualifying boolean not null,
  created_at timestamptz not null default now()
);
alter table public.member_report drop constraint if exists member_report_reason_check;
alter table public.member_report add constraint member_report_reason_check
  check (reason in ('harassment', 'explicit', 'spam', 'fake', 'underage', 'safety', 'other'));
alter table public.member_report drop constraint if exists member_report_note_check;
alter table public.member_report add constraint member_report_note_check check (char_length(note) <= 500);
create index if not exists member_report_reporter_created_idx on public.member_report (reporter_id, created_at);
create index if not exists member_report_target_idx on public.member_report (target_id);
create index if not exists member_report_created_idx on public.member_report (created_at);
alter table public.member_report enable row level security;
revoke all on public.member_report from public, anon, authenticated;
revoke all on sequence public.member_report_id_seq from public, anon, authenticated;

-- report_member(p_target, p_reason, p_note). Order is binding (R4): profile (P0002) -> charge the cap (PT429 above 10
-- in 24 h) -> reason (22023) -> self or unknown target: return -> block -> same pair within 24 h: return -> report.
create or replace function public.report_member(p_target uuid, p_reason text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_note text;
  v_world boolean;
  v_qual boolean;
  v_evidence jsonb;
begin
  perform 1 from public.profiles where id = uid for update;   -- also serialises this member's calls (the cap)
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  insert into public.report_attempt (reporter_id) values (uid);
  if (select count(*) from public.report_attempt where reporter_id = uid and at > now() - interval '24 hours') > 10 then
    raise exception 'report_cap' using errcode = 'PT429';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'explicit', 'spam', 'fake', 'underage', 'safety', 'other') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  -- control characters (C0, DEL, C1), zero-width and bidi characters stripped; only newline and tab survive
  v_note := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]', '', 'g'), E' \t\r\n'), '');
  if char_length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    return;
  end if;
  -- Qualification and evidence are read BEFORE the block: a block deletes the pair's pending requests (0003), which are
  -- one of the relations that qualify a report.
  select (select is_test from public.profiles where id = uid) = (select is_test from public.profiles where id = p_target)
    into v_world;
  v_qual := coalesce(v_world, false)
    and public.brivia_member_completed(uid)
    and (select created_at <= now() - interval '7 days' from public.profiles where id = uid)
    and (exists (select 1 from public.interaction i
                  where i.event <> 'impression'   -- impressions are written automatically by the deck and search
                    and ((i.viewer_id = uid and i.target_id = p_target) or (i.viewer_id = p_target and i.target_id = uid)))
         or exists (select 1 from public.connection_requests c
                     where (c.from_id = uid and c.to_id = p_target) or (c.from_id = p_target and c.to_id = uid))
         or exists (select 1 from public.matches m
                     where (m.user1_id = uid and m.user2_id = p_target) or (m.user1_id = p_target and m.user2_id = uid))
         or exists (select 1 from public.brivia_messages b
                     where (b.sender_id = uid and b.recipient_id = p_target) or (b.sender_id = p_target and b.recipient_id = uid)));
  select coalesce(jsonb_agg(e.j order by e.at desc), '[]'::jsonb) into v_evidence
    from (select m.created_at as at,
                 jsonb_build_object('from_me', m.sender_id = uid, 'body', m.body, 'kind', m.message_type,
                                    'attachment_path', m.attachment_path, 'at', m.created_at) as j
            from public.brivia_messages m
           where (m.sender_id = uid and m.recipient_id = p_target) or (m.sender_id = p_target and m.recipient_id = uid)
           order by m.created_at desc, m.id desc
           limit 50) e;
  -- a report always blocks, for any existing profile in either world (exactly what a direct block insert allows)
  insert into public.brivia_blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  if exists (select 1 from public.member_report r
              where r.reporter_id = uid and r.target_id = p_target and r.created_at > now() - interval '24 hours') then
    return;
  end if;
  insert into public.member_report (reporter_id, target_id, reason, note, evidence, qualifying)
  values (uid, p_target, p_reason, v_note, v_evidence, v_qual);
  if v_qual then
    -- Serialise qualifying reports about one target (F8): two concurrent reports must not each count only themselves
    -- and both miss the 2-reporter threshold. The count below runs after the lock, on a fresh snapshot.
    perform pg_advisory_xact_lock(hashtext('report:' || p_target::text));
    if (select count(distinct r.reporter_id) from public.member_report r
         where r.target_id = p_target and r.qualifying and r.reporter_id is not null
           and r.created_at > now() - interval '30 days') >= 2 then
      insert into public.member_flag (member_id, reason, expires_at)
      values (p_target, 'reported', now() + interval '90 days') on conflict (member_id) do nothing;
    end if;
    if p_reason = 'underage' then
      insert into public.member_flag (member_id, reason, expires_at) values (p_target, 'suspended_pending_review', null)
      on conflict (member_id) do update
        set reason = 'suspended_pending_review', flagged_at = now(), expires_at = null
        where public.member_flag.reason in ('reported', 'rejoin_review');
    end if;
  end if;
end;
$$;
revoke all on function public.report_member(uuid, text, text) from public, anon;
grant execute on function public.report_member(uuid, text, text) to authenticated;

-- Delete-and-rejoin evasion (R6): a keyed digest of the lower-cased email, never the address itself.
create table if not exists public.moderation_pepper (
  id int primary key check (id = 1),
  pepper bytea not null
);
alter table public.moderation_pepper enable row level security;
revoke all on public.moderation_pepper from public, anon, authenticated;
insert into public.moderation_pepper (id, pepper) values (1, extensions.gen_random_bytes(32)) on conflict do nothing;

create table if not exists public.moderation_tombstone (
  digest text primary key,
  reasons text[],
  report_ids bigint[],
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.moderation_tombstone enable row level security;
revoke all on public.moderation_tombstone from public, anon, authenticated;

create or replace function public.brivia_email_digest(p_email text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.hmac(convert_to(lower(btrim(p_email)), 'utf8'), (select pepper from public.moderation_pepper where id = 1), 'sha256'::text), 'hex')
$$;
revoke all on function public.brivia_email_digest(text) from public, anon, authenticated;

-- declare_adult, redefined: the section 1 behaviour exactly, plus: on the first declaration, a live tombstone for the
-- caller's email digest puts the new account into founder review ('rejoin_review', no expiry).
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

-- =============================================================================================
-- 4. Account deletion, retention, city-wide label (R5, R7, R9)
-- =============================================================================================
-- Members may delete their own profile photos and covers (the client empties its folders through the Storage API before
-- calling delete_my_account; SQL never deletes from storage.objects).
drop policy if exists "Members can delete their profile photos" on storage.objects;
create policy "Members can delete their profile photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can delete their profile covers" on storage.objects;
create policy "Members can delete their profile covers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- delete_my_account(p_confirm): self-serve deletion. No uid parameter. Order: session (P0002), 'DELETE' (22023), a login
-- within 10 minutes (the newest `amr` timestamp of the JWT; else P0001 'reauth_required'), no stored objects (P0001
-- 'storage_not_empty': any object in the 4 member buckets under the member's folder, or owned by the member in any bucket
-- except career-resumes, a separate recruiting purpose). A member with a report against them or a flag leaves a
-- moderation_tombstone (R6). consent_event('account_deleted') is written, then auth.users is deleted; every FK to
-- profiles cascades (reports the member made keep their row with reporter_id null).
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
  v_last bigint;
  v_email text;
  v_reasons text[];
  v_reports bigint[];
begin
  if uid is null then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'confirmation required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_amr) = 'array' then
    select max((e ->> 'timestamp')::bigint) into v_last
      from jsonb_array_elements(v_amr) e
     where jsonb_typeof(e) = 'object' and e ->> 'timestamp' ~ '^[0-9]{1,12}$';
  end if;
  if v_last is null or v_last < extract(epoch from now())::bigint - 600 then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from storage.objects o
              where (o.bucket_id in ('profile-photos', 'profile-covers', 'message-attachments', 'community-posts')
                     and (storage.foldername(o.name))[1] = uid::text)
                 or (o.bucket_id <> 'career-resumes' and (o.owner_id = uid::text or o.owner = uid))) then
    raise exception 'storage_not_empty' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = uid;
  select coalesce(array_agg(r.id order by r.id), '{}'::bigint[]) into v_reports from public.member_report r where r.target_id = uid;
  select array(select distinct x from (select r.reason as x from public.member_report r where r.target_id = uid
                                       union all select f.reason from public.member_flag f where f.member_id = uid) q order by x)
    into v_reasons;
  if v_email is not null and (cardinality(v_reports) > 0 or exists (select 1 from public.member_flag f where f.member_id = uid)) then
    insert into public.moderation_tombstone (digest, reasons, report_ids, expires_at)
    values (public.brivia_email_digest(v_email), v_reasons, v_reports, now() + interval '365 days')
    on conflict (digest) do update
      set reasons = array(select distinct x from unnest(public.moderation_tombstone.reasons || excluded.reasons) x order by x),
          report_ids = array(select distinct x from unnest(public.moderation_tombstone.report_ids || excluded.report_ids) x order by x),
          deleted_at = now(),
          expires_at = greatest(public.moderation_tombstone.expires_at, excluded.expires_at);
  end if;
  insert into public.consent_event (member_id, kind, notice_version) values (uid, 'account_deleted', public.brivia_notice_version());
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- purge_expired_requests, redefined: the 0004 body unchanged, plus the retention schedule (R7; spec 9.1.6):
-- like/pass interactions 180 d; request/accept/decline/met/letgo 365 d (impressions stay at 30 d, above);
-- member_report 365 d; report_attempt 30 d; automatic flags past expires_at (founder flags have none);
-- moderation_tombstone past expires_at; every consent_event of a member whose account_deleted event is older than 1 y;
-- career_applications 180 d. Same signature and return value (request rows deleted); the cron command is unchanged.
create or replace function public.purge_expired_requests()
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.signal_ledger where at <= now() - interval '30 days';
  delete from public.interest_rewrite where at <= now() - interval '24 hours';
  delete from public.location_change where at <= now() - interval '24 hours';
  delete from public.interaction where event = 'impression' and created_at <= now() - interval '30 days';
  delete from public.interaction where event in ('like', 'pass') and created_at <= now() - interval '180 days';
  delete from public.interaction where event in ('request', 'accept', 'decline', 'met', 'letgo') and created_at <= now() - interval '365 days';
  delete from public.member_report where created_at <= now() - interval '365 days';
  delete from public.report_attempt where at <= now() - interval '30 days';
  delete from public.member_flag where expires_at < now();
  delete from public.moderation_tombstone where expires_at < now();
  delete from public.consent_event where member_id in
    (select c.member_id from public.consent_event c where c.kind = 'account_deleted' and c.at <= now() - interval '1 year');
  delete from public.career_applications where created_at <= now() - interval '180 days';
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  end if;
  delete from public.connection_requests where not public.brivia_request_is_live(status, created_at);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_expired_requests() from public, anon, authenticated;

-- my_onboarding_status, redefined: the 0004 body and type unchanged except place_label, which says "(city-wide)" for a
-- member who picked a city (precision 'place'): their cell is the city centroid, not where they live (R9).
create or replace function public.my_onboarding_status()
returns table(interests int, points int, has_cell boolean, place_label text, completed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::int from public.member_interest mi where mi.member_id = me.uid),
         (select coalesce(sum(mi.points), 0)::int from public.member_interest mi where mi.member_id = me.uid),
         exists (select 1 from public.member_orbit o where o.member_id = me.uid),
         (select case when o.precision = 'place' then pl.name || ' (city-wide)' else pl.name end
            from public.member_orbit o join public.place pl on pl.id = o.place_id where o.member_id = me.uid),
         public.brivia_member_completed(me.uid)
    from (select auth.uid() as uid) me
   where me.uid is not null
$$;
revoke all on function public.my_onboarding_status() from public, anon;
grant execute on function public.my_onboarding_status() to authenticated;
