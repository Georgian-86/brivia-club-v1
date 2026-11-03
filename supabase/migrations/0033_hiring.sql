set lock_timeout = '5s';
-- 0033_hiring.sql: Hiring, phase 1 (founder request 2026-11-02, signed off 2026-11-03, D-137). Spec
-- docs/superpowers/specs/2026-11-02-hiring-design.md; ORBIT_ENGINE.md §9.1.6 (the hiring lane).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0032 (README "## 0033"). Idempotent: the local
-- harness applies every migration twice. Until this runs, every hiring RPC is missing and the client hides the feature.
--
-- What:
--   * hiring_role: up to 3 open or paused roles per member (title, family, level, where, how they help, optional
--     company, one line), 30 days, renewable. Never a city or a coordinate: a role's place is the hirer's own area band.
--   * role_intent: a seeker's "Roles I'm open to" (1-3 titles, level, accepted modes, who can see it, "let hirers find
--     me", an optional private current company that is only ever compared server-side). Its own consent timestamp;
--     withdrawing deletes the row.
--   * role_ask: the role tag on a connection request sent through ask_about_role (3 a day, 1 per role, 25 waiting per
--     role). The connection itself is the existing request (send_connect_request), so mutual consent is unchanged.
--   * The hiring bar (brivia_hiring_bar): a banner is live only for a completed member whose account is 14+ days old,
--     with a photo, a confirmed email and no open flag (report or review).
--   * brivia_role_fit: the fit score (spec §7.2). hiring_suggestions applies the deck's location admission (the same
--     ~3 km / ~10 km rings or a place within 60 km) and the deck's own-history checks.
--   * report_fake_job: a "Fake job or asked for money" report (report_member reason 'fake') that pauses every open
--     role of the reported member until the moderator reopens them.
--   * Kill switch: brivia_feature('hiring'). update public.brivia_feature set enabled = false where name = 'hiring';
-- Every table is owner-only (RLS on, no client grants); clients use the RPCs below.

-- Tables -------------------------------------------------------------------------------------------------------------
create table if not exists public.brivia_feature (
  name text primary key,
  enabled boolean not null default true
);
alter table public.brivia_feature enable row level security;
revoke all on public.brivia_feature from public, anon, authenticated;
insert into public.brivia_feature (name, enabled) values ('hiring', true) on conflict (name) do nothing;

create table if not exists public.hiring_role (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  family text not null check (family in ('software', 'data', 'design', 'product', 'marketing', 'sales', 'content',
                                         'operations', 'finance', 'people', 'research', 'other')),
  level text not null check (level in ('intern', 'entry', 'mid', 'senior', 'lead')),
  work_mode text not null check (work_mode in ('onsite', 'hybrid', 'remote')),
  help text not null check (help in ('hiring', 'refer')),
  company text check (company is null or char_length(company) between 2 and 60),
  about text check (about is null or char_length(about) <= 200),
  status text not null default 'open' check (status in ('open', 'paused', 'closed')),
  paused_by_report boolean not null default false,
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  renewals int not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hiring_role_member_idx on public.hiring_role (member_id, status);
alter table public.hiring_role enable row level security;
revoke all on public.hiring_role from public, anon, authenticated;

create table if not exists public.role_intent (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  titles text[] not null check (cardinality(titles) between 1 and 3),
  families text[] not null,
  level text check (level is null or level in ('intern', 'entry', 'mid', 'senior', 'lead')),
  work_modes text[] not null check (cardinality(work_modes) between 1 and 3
                                    and work_modes <@ array['onsite', 'hybrid', 'remote']::text[]),
  visibility text not null default 'hirers' check (visibility in ('hirers', 'everyone')),
  findable boolean not null default false,
  private_company text check (private_company is null or char_length(private_company) between 2 and 60),
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.role_intent enable row level security;
revoke all on public.role_intent from public, anon, authenticated;

create table if not exists public.role_ask (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.hiring_role(id) on delete cascade,
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  hirer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, seeker_id)
);
create index if not exists role_ask_seeker_idx on public.role_ask (seeker_id, created_at);
create index if not exists role_ask_hirer_idx on public.role_ask (hirer_id, created_at);
alter table public.role_ask enable row level security;
revoke all on public.role_ask from public, anon, authenticated;

-- Helpers (no client may execute them) ---------------------------------------------------------------------------
create or replace function public.brivia_hiring_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.brivia_feature where name = 'hiring'), false) $$;
revoke all on function public.brivia_hiring_enabled() from public, anon, authenticated;

-- Role text carries no links, emails or phone numbers (spec §4.2, §9): those go in chat after connecting.
create or replace function public.brivia_role_text_ok(p text)
returns boolean language sql immutable set search_path = public as $$
  select p is null or not (
    p ~* '(https?://|www\.|[a-z0-9-]+\.(com|in|io|co|net|org|me|ly|gl|app|dev|link|xyz)(/|\b))'
    or p ~ '@'
    or regexp_replace(p, '[\s().+-]', '', 'g') ~ '\d{7,}'
    or p ~* '(wa\.me|t\.me|telegram|whatsapp)'
  ) $$;
revoke all on function public.brivia_role_text_ok(text) from public, anon, authenticated;

create or replace function public.brivia_family_adjacent(a text, b text)
returns boolean language sql immutable set search_path = public as $$
  select (least(a, b), greatest(a, b)) in (('data', 'software'), ('design', 'product'), ('product', 'software'),
    ('content', 'marketing'), ('marketing', 'sales'), ('operations', 'people'), ('finance', 'operations'),
    ('data', 'research')) $$;
revoke all on function public.brivia_family_adjacent(text, text) from public, anon, authenticated;

create or replace function public.brivia_level_rank(p text)
returns int language sql immutable set search_path = public as $$
  select case p when 'intern' then 0 when 'entry' then 1 when 'mid' then 2 when 'senior' then 3 when 'lead' then 4 end $$;
revoke all on function public.brivia_level_rank(text) from public, anon, authenticated;

-- The hiring bar (spec §9).
create or replace function public.brivia_hiring_bar(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.brivia_hiring_enabled()
    and public.brivia_member_completed(p_member)
    and exists (select 1 from public.profiles p
                 where p.id = p_member and p.created_at <= now() - interval '14 days'
                   and coalesce(btrim(p.photo_url), '') <> '')
    and exists (select 1 from auth.users u where u.id = p_member and u.email_confirmed_at is not null)
    and not exists (select 1 from public.member_flag f
                     where f.member_id = p_member and (f.expires_at is null or f.expires_at > now())),
    false) $$;
revoke all on function public.brivia_hiring_bar(uuid) from public, anon, authenticated;

-- The day a member's banner can go live (account age only; the other parts of the bar are the member's to fix).
create or replace function public.brivia_hiring_live_from(p_member uuid)
returns date language sql stable security definer set search_path = public as $$
  select (p.created_at + interval '14 days')::date from public.profiles p where p.id = p_member $$;
revoke all on function public.brivia_hiring_live_from(uuid) from public, anon, authenticated;

-- An ask still waiting for the hirer: its connection request is pending and live, and it is under 14 days old.
create or replace function public.brivia_role_ask_waiting(p_ask public.role_ask)
returns boolean language sql stable security definer set search_path = public as $$
  select p_ask.created_at > now() - interval '14 days'
     and exists (select 1 from public.connection_requests r
                  where r.from_id = p_ask.seeker_id and r.to_id = p_ask.hirer_id and r.status = 'pending'
                    and public.brivia_request_is_live(r.status, r.created_at)) $$;
revoke all on function public.brivia_role_ask_waiting(public.role_ask) from public, anon, authenticated;

create or replace function public.brivia_role_waiting_count(p_role uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.role_ask a where a.role_id = p_role and public.brivia_role_ask_waiting(a) $$;
revoke all on function public.brivia_role_waiting_count(uuid) from public, anon, authenticated;

-- A role that is shown: open, not expired, its hirer over the bar.
create or replace function public.brivia_role_shown(p_role public.hiring_role)
returns boolean language sql stable security definer set search_path = public as $$
  select p_role.status = 'open' and p_role.expires_at > now() and public.brivia_hiring_bar(p_role.member_id) $$;
revoke all on function public.brivia_role_shown(public.hiring_role) from public, anon, authenticated;

-- The fit of a seeker's saved intent to one role (spec §7.2), in [0, 1]; 0 without an intent.
create or replace function public.brivia_role_fit(p_seeker uuid, p_role uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with x as (
    select r.title, r.family, r.level, r.work_mode, r.member_id, i.titles, i.families, i.level as want_level, i.work_modes
      from public.hiring_role r join public.role_intent i on i.member_id = p_seeker
     where r.id = p_role and r.member_id <> p_seeker
  ), f as (
    select
      case when lower(x.title) = any (select lower(t) from unnest(x.titles) t) then 1.0
           when x.family <> 'other' and x.family = any (x.families) then 0.7
           when exists (select 1 from unnest(x.families) fa where public.brivia_family_adjacent(fa, x.family)) then 0.4
           else 0 end as title_fit,
      case when x.want_level is null then 1.0
           when x.want_level = x.level then 1.0
           when 'intern' in (x.want_level, x.level) and not (x.want_level in ('intern', 'entry') and x.level in ('intern', 'entry')) then 0
           when abs(public.brivia_level_rank(x.want_level) - public.brivia_level_rank(x.level)) = 1 then 0.6
           else 0 end as level_fit,
      case when x.work_mode = any (x.work_modes) then 1.0 else 0 end as mode_fit,
      least(1.0, (select count(distinct lower(btrim(a)))::numeric
                    from public.profiles s, public.profiles h, unnest(coalesce(s.skills, '{}')) a
                   where s.id = p_seeker and h.id = x.member_id
                     and lower(btrim(a)) in (select lower(btrim(b)) from unnest(coalesce(h.skills, '{}')) b)) / 3) as skill_fit
      from x
  )
  select coalesce((select round(title_fit * level_fit * mode_fit * (0.8 + 0.2 * skill_fit), 4) from f), 0) $$;
revoke all on function public.brivia_role_fit(uuid, uuid) from public, anon, authenticated;

-- Hirers ---------------------------------------------------------------------------------------------------------
create or replace function public.save_hiring_role(p_id uuid, p_title text, p_family text, p_level text,
                                                   p_work_mode text, p_help text, p_company text default null,
                                                   p_about text default null)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_title text := nullif(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
  v_company text := nullif(regexp_replace(btrim(coalesce(p_company, '')), '\s+', ' ', 'g'), '');
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
  v_id uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.brivia_hiring_enabled() then raise exception 'hiring is off' using errcode = 'P0001'; end if;
  if not public.brivia_member_completed(me) then raise exception 'complete your profile' using errcode = '22023'; end if;
  if v_title is null or char_length(v_title) not between 3 and 60 then raise exception 'role title' using errcode = '22023'; end if;
  if v_company is not null and char_length(v_company) not between 2 and 60 then raise exception 'company' using errcode = '22023'; end if;
  if v_about is not null and char_length(v_about) > 200 then raise exception 'about too long' using errcode = '22001'; end if;
  if not (public.brivia_role_text_ok(v_title) and public.brivia_role_text_ok(v_company) and public.brivia_role_text_ok(v_about)) then
    raise exception 'no links or contact details' using errcode = '22023';
  end if;
  if p_family not in ('software', 'data', 'design', 'product', 'marketing', 'sales', 'content', 'operations', 'finance',
                      'people', 'research', 'other')
     or p_level not in ('intern', 'entry', 'mid', 'senior', 'lead')
     or p_work_mode not in ('onsite', 'hybrid', 'remote') or p_help not in ('hiring', 'refer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia_hiring_role:' || me::text, 0));
  if p_id is null then
    if (select count(*) from public.hiring_role r where r.member_id = me and r.status in ('open', 'paused')
          and r.expires_at > now()) >= 3 then
      raise exception 'role_cap' using errcode = 'PT429';
    end if;
    insert into public.hiring_role (member_id, title, family, level, work_mode, help, company, about)
    values (me, v_title, p_family, p_level, p_work_mode, p_help, v_company, v_about)
    returning id into v_id;
  else
    update public.hiring_role r
       set title = v_title, family = p_family, level = p_level, work_mode = p_work_mode, help = p_help,
           company = v_company, about = v_about, updated_at = now()
     where r.id = p_id and r.member_id = me and r.status <> 'closed'
    returning r.id into v_id;
    if v_id is null then raise exception 'role not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_hiring_role(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_hiring_role(uuid, text, text, text, text, text, text, text) to authenticated;

-- 'pause' | 'open' | 'close' | 'renew'.
create or replace function public.set_hiring_role_status(p_id uuid, p_action text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.hiring_role;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into r from public.hiring_role where id = p_id and member_id = me and status <> 'closed' for update;
  if not found then raise exception 'role not found' using errcode = 'P0002'; end if;
  if p_action = 'pause' then
    update public.hiring_role set status = 'paused', updated_at = now() where id = r.id;
  elsif p_action = 'open' then
    if r.paused_by_report then raise exception 'under review' using errcode = '42501'; end if;
    if r.expires_at <= now() then raise exception 'role expired' using errcode = '22023'; end if;
    update public.hiring_role set status = 'open', updated_at = now() where id = r.id;
  elsif p_action = 'close' then
    update public.hiring_role set status = 'closed', closed_at = now(), updated_at = now() where id = r.id;
  elsif p_action = 'renew' then
    if exists (select 1 from public.role_ask a where a.role_id = r.id and public.brivia_role_ask_waiting(a)) then
      raise exception 'answer_asks_first' using errcode = 'PT409';
    end if;
    update public.hiring_role
       set expires_at = now() + interval '30 days', renewals = renewals + 1,
           status = case when paused_by_report then 'paused' else 'open' end, updated_at = now()
     where id = r.id;
  else
    raise exception 'invalid action' using errcode = '22023';
  end if;
end $$;
revoke all on function public.set_hiring_role_status(uuid, text) from public, anon;
grant execute on function public.set_hiring_role_status(uuid, text) to authenticated;

create or replace function public.my_hiring_roles()
returns table(id uuid, title text, family text, level text, work_mode text, help text, company text, about text,
              status text, paused_by_report boolean, opened_at timestamptz, expires_at timestamptz, waiting_asks int,
              banner_live boolean, live_from date)
language sql stable security definer set search_path = public as $$
  select r.id, r.title, r.family, r.level, r.work_mode, r.help, r.company, r.about,
         r.status, r.paused_by_report, r.opened_at, r.expires_at, public.brivia_role_waiting_count(r.id),
         public.brivia_hiring_bar(r.member_id), public.brivia_hiring_live_from(r.member_id)
    from public.hiring_role r
   where r.member_id = auth.uid() and r.status <> 'closed' and public.brivia_hiring_enabled()
   order by r.status = 'open' desc, r.opened_at $$;
revoke all on function public.my_hiring_roles() from public, anon;
grant execute on function public.my_hiring_roles() to authenticated;

-- Seekers --------------------------------------------------------------------------------------------------------
create or replace function public.save_role_intent(p_titles text[], p_families text[], p_level text, p_work_modes text[],
                                                   p_visibility text default 'hirers', p_findable boolean default false,
                                                   p_private_company text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_titles text[];
  v_company text := nullif(regexp_replace(btrim(coalesce(p_private_company, '')), '\s+', ' ', 'g'), '');
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.brivia_hiring_enabled() then raise exception 'hiring is off' using errcode = 'P0001'; end if;
  select array_agg(t order by o) into v_titles
    from (select distinct on (lower(t)) t, o
            from unnest(p_titles) with ordinality u(raw, o), lateral (select regexp_replace(btrim(raw), '\s+', ' ', 'g') as t) c
           where t <> '' order by lower(t), o) d;
  if v_titles is null or cardinality(v_titles) not between 1 and 3
     or exists (select 1 from unnest(v_titles) t where char_length(t) not between 2 and 60 or not public.brivia_role_text_ok(t)) then
    raise exception 'roles' using errcode = '22023';
  end if;
  if p_families is null or cardinality(p_families) = 0
     or not (p_families <@ array['software', 'data', 'design', 'product', 'marketing', 'sales', 'content', 'operations',
                                 'finance', 'people', 'research', 'other']::text[])
     or (p_level is not null and p_level not in ('intern', 'entry', 'mid', 'senior', 'lead'))
     or p_work_modes is null or cardinality(p_work_modes) = 0
     or not (p_work_modes <@ array['onsite', 'hybrid', 'remote']::text[])
     or p_visibility not in ('hirers', 'everyone') then
    raise exception 'invalid intent' using errcode = '22023';
  end if;
  if v_company is not null and (char_length(v_company) not between 2 and 60 or not public.brivia_role_text_ok(v_company)) then
    raise exception 'company' using errcode = '22023';
  end if;
  insert into public.role_intent (member_id, titles, families, level, work_modes, visibility, findable, private_company)
  values (me, v_titles, (select array_agg(distinct f) from unnest(p_families) f), p_level,
          (select array_agg(distinct m) from unnest(p_work_modes) m), p_visibility, coalesce(p_findable, false), v_company)
  on conflict (member_id) do update
     set titles = excluded.titles, families = excluded.families, level = excluded.level,
         work_modes = excluded.work_modes, visibility = excluded.visibility, findable = excluded.findable,
         private_company = excluded.private_company, updated_at = now();
end $$;
revoke all on function public.save_role_intent(text[], text[], text, text[], text, boolean, text) from public, anon;
grant execute on function public.save_role_intent(text[], text[], text, text[], text, boolean, text) to authenticated;

create or replace function public.withdraw_role_intent()
returns void language sql volatile security definer set search_path = public as $$
  delete from public.role_intent where member_id = auth.uid() $$;
revoke all on function public.withdraw_role_intent() from public, anon;
grant execute on function public.withdraw_role_intent() to authenticated;

create or replace function public.my_role_intent()
returns table(titles text[], families text[], level text, work_modes text[], visibility text, findable boolean,
              private_company text, consented_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.titles, i.families, i.level, i.work_modes, i.visibility, i.findable, i.private_company, i.consented_at
    from public.role_intent i where i.member_id = auth.uid() and public.brivia_hiring_enabled() $$;
revoke all on function public.my_role_intent() from public, anon;
grant execute on function public.my_role_intent() to authenticated;

-- Everyone: the banner -------------------------------------------------------------------------------------------
-- member_hiring(ids): the Hiring banner for each listed member whose banner is live and who is visible to the caller
-- (at most 50 ids). roles: shown roles, best fit for the caller first, each with its fit (null when the caller has no
-- intent), accepting (fewer than 25 waiting asks) and asked (the caller already asked about it).
create or replace function public.member_hiring(p_ids uuid[])
returns table(member_id uuid, roles jsonb, best_title text, fits boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id, exists (select 1 from public.role_intent i where i.member_id = auth.uid()) as seeking),
  ids as (select distinct u.id from unnest(coalesce(p_ids, '{}')) with ordinality u(id, o) where u.o <= 50),
  shown as (
    select r.*, case when me.seeking and r.member_id <> me.id then public.brivia_role_fit(me.id, r.id) end as fit,
           public.brivia_role_waiting_count(r.id) < 25 as accepting,
           exists (select 1 from public.role_ask a where a.role_id = r.id and a.seeker_id = me.id) as asked
      from public.hiring_role r join ids on ids.id = r.member_id cross join me
     where public.brivia_role_shown(r) and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))
  )
  select s.member_id,
         jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'family', s.family, 'level', s.level,
                                      'work_mode', s.work_mode, 'help', s.help, 'company', s.company, 'about', s.about,
                                      'opened_days', greatest(0, (current_date - s.opened_at::date)),
                                      'fit', s.fit, 'accepting', s.accepting, 'asked', s.asked)
                   order by coalesce(s.fit, 0) desc, s.opened_at),
         (array_agg(s.title order by coalesce(s.fit, 0) desc, s.opened_at))[1],
         coalesce(max(s.fit), 0) >= 0.5
    from shown s group by s.member_id $$;
revoke all on function public.member_hiring(uuid[]) from public, anon;
grant execute on function public.member_hiring(uuid[]) to authenticated;

-- member_open_to(id): a seeker's "Open to roles", only when they chose Everyone, or the caller has an open role and is
-- not at the seeker's private current company.
create or replace function public.member_open_to(p_id uuid)
returns table(titles text[], level text, work_modes text[])
language sql stable security definer set search_path = public as $$
  select i.titles, i.level, i.work_modes
    from public.role_intent i
   where i.member_id = p_id and public.brivia_hiring_enabled() and public.brivia_visible_to(auth.uid(), p_id)
     and (i.visibility = 'everyone'
          or (exists (select 1 from public.hiring_role r where r.member_id = auth.uid() and r.status = 'open' and r.expires_at > now())
              and not exists (select 1 from public.hiring_role r
                               where r.member_id = auth.uid() and r.status <> 'closed' and i.private_company is not null
                                 and lower(btrim(r.company)) = lower(btrim(i.private_company))))) $$;
revoke all on function public.member_open_to(uuid) from public, anon;
grant execute on function public.member_open_to(uuid) to authenticated;

-- hiring_suggestions(limit): the cards to lift (spec §7.3). For a seeker: hirers with a live banner and a role that
-- fits (0.5 or more). For a hirer: seekers who turned on "let hirers find me" and fit one of the hirer's open roles,
-- never at a company the seeker named as private. Both: the deck's location admission and own-history checks.
create or replace function public.hiring_suggestions(p_limit int default 10)
returns table(id uuid, fit numeric, role_title text, distance_band text)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country,
           vp.lat as place_lat, vp.lng as place_lng
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id) and public.brivia_hiring_enabled()
  ),
  as_seeker as (
    select r.member_id as tid, public.brivia_role_fit(me.id, r.id) as fit, r.title
      from me join public.role_intent i on i.member_id = me.id
      join public.hiring_role r on r.member_id <> me.id
     where public.brivia_role_shown(r)
  ),
  as_hirer as (
    select i.member_id as tid, public.brivia_role_fit(i.member_id, r.id) as fit, r.title
      from me join public.hiring_role r on r.member_id = me.id and r.status = 'open' and r.expires_at > now()
      join public.role_intent i on i.member_id <> me.id and i.findable
     where public.brivia_hiring_bar(me.id)
       and not exists (select 1 from public.hiring_role c
                        where c.member_id = me.id and c.status <> 'closed' and i.private_company is not null
                          and lower(btrim(c.company)) = lower(btrim(i.private_company)))
  ),
  best as (
    select distinct on (tid) tid, fit, title from (select * from as_seeker union all select * from as_hirer) u
     where fit >= 0.5 order by tid, fit desc, title
  ),
  placed as (
    select b.*, tp.name as place_name, tp.country,
           case when me.precision = 'cell' and o.precision = 'cell' and o.home_cell ~ '^g7:'
                     and public.brivia_cell_ok(o.home_cell, me.in_test_world, 10)
                then public.brivia_ring(public.brivia_cell_km(me.home_cell, o.home_cell)) end as fine_ring,
           public.brivia_haversine_km(me.place_lat, me.place_lng, tp.lat, tp.lng) as place_km
      from best b cross join me
      join public.member_orbit o on o.member_id = b.tid and o.cell_scheme = 'grid1'
      join public.place tp on tp.id = o.place_id
  )
  select pl.tid, pl.fit, pl.title,
         case when pl.country is distinct from me.country then 'Abroad'
              when pl.fine_ring = 0 then '~3 km' when pl.fine_ring = 1 then '~10 km' else pl.place_name end
    from placed pl cross join me
   where (pl.fine_ring <= 1 or pl.place_km <= 60)
     and public.brivia_visible_to(me.id, pl.tid)
     and not exists (select 1 from public.matches m
                      where (m.user1_id = me.id and m.user2_id = pl.tid) or (m.user1_id = pl.tid and m.user2_id = me.id))
     and not exists (select 1 from public.signal_ledger l
                      where l.sender_id = me.id and l.to_id = pl.tid and l.at > now() - interval '30 days')
     and not exists (select 1 from public.connection_requests r
                      where r.from_id = me.id and r.to_id = pl.tid and public.brivia_request_is_live(r.status, r.created_at))
     and not exists (select 1 from public.interaction i
                      where i.viewer_id = me.id and i.target_id = pl.tid and i.event = 'pass'
                        and i.created_at > now() - interval '7 days')
   order by pl.fit desc, coalesce(pl.fine_ring, 2), pl.place_km, pl.tid
   limit greatest(1, least(coalesce(p_limit, 10), 20)) $$;
revoke all on function public.hiring_suggestions(int) from public, anon;
grant execute on function public.hiring_suggestions(int) to authenticated;

-- Asking ---------------------------------------------------------------------------------------------------------
-- ask_about_role(role, note): a connection request (send_connect_request: the signal, the quota, mutual consent)
-- tagged with the role. 20-500 characters; 1 ask per role; 3 a day; a role with 25 waiting asks takes no more.
create or replace function public.ask_about_role(p_role uuid, p_note text)
returns table(status text, remaining int, resets_at timestamptz, asks_left int)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.hiring_role;
  v_note text := btrim(coalesce(p_note, ''));
  v_today int;
  s record;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.brivia_hiring_enabled() then raise exception 'hiring is off' using errcode = 'P0001'; end if;
  if not public.brivia_member_completed(me) then raise exception 'complete your profile' using errcode = '22023'; end if;
  select * into r from public.hiring_role where id = p_role;
  -- Not found, closed, paused, expired, the hirer under the bar, blocked or in another world: one answer.
  if not found or r.member_id = me or not public.brivia_role_shown(r) or not public.brivia_visible_to(me, r.member_id) then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  if char_length(v_note) < 20 then raise exception 'note too short' using errcode = '22023'; end if;
  if char_length(v_note) > 500 then raise exception 'note too long' using errcode = '22001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia_role_ask:' || me::text, 0));
  if exists (select 1 from public.role_ask a where a.role_id = r.id and a.seeker_id = me) then
    raise exception 'already asked' using errcode = '23505';
  end if;
  select count(*) into v_today from public.role_ask a where a.seeker_id = me and a.created_at > now() - interval '24 hours';
  if v_today >= 3 then raise exception 'role_ask_cap' using errcode = 'PT429'; end if;
  if public.brivia_role_waiting_count(r.id) >= 25 then raise exception 'role_not_taking_asks' using errcode = 'PT429'; end if;
  select * into s from public.send_connect_request(r.member_id, v_note);
  insert into public.role_ask (role_id, seeker_id, hirer_id) values (r.id, me, r.member_id);
  return query select s.status, s.remaining, s.resets_at, greatest(0, 2 - v_today);
end $$;
revoke all on function public.ask_about_role(uuid, text) from public, anon;
grant execute on function public.ask_about_role(uuid, text) to authenticated;

-- The hirer's waiting asks (the role tag on each pending request in the review sheet).
create or replace function public.my_role_asks()
returns table(seeker_id uuid, role_id uuid, role_title text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.seeker_id, a.role_id, r.title, a.created_at
    from public.role_ask a join public.hiring_role r on r.id = a.role_id
   where a.hirer_id = auth.uid() and public.brivia_role_ask_waiting(a) and public.brivia_hiring_enabled()
   order by a.created_at desc $$;
revoke all on function public.my_role_asks() from public, anon;
grant execute on function public.my_role_asks() to authenticated;

-- The seeker's asks of the last 30 days, with the role's state ("Riya closed the Frontend Developer role.").
create or replace function public.my_sent_role_asks()
returns table(role_id uuid, hirer_id uuid, role_title text, role_status text, closed_at timestamptz, asked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.role_id, a.hirer_id, r.title, r.status, r.closed_at, a.created_at
    from public.role_ask a join public.hiring_role r on r.id = a.role_id
   where a.seeker_id = auth.uid() and a.created_at > now() - interval '30 days' and public.brivia_hiring_enabled()
     and public.brivia_visible_to(auth.uid(), a.hirer_id)
   order by a.created_at desc $$;
revoke all on function public.my_sent_role_asks() from public, anon;
grant execute on function public.my_sent_role_asks() to authenticated;

-- Safety ---------------------------------------------------------------------------------------------------------
-- "Fake job or asked for money": an ordinary report (reason 'fake', its caps and evidence), then every open role of
-- that member pauses until the moderator reopens it (MODERATION.md "Hiring").
create or replace function public.report_fake_job(p_target uuid, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.report_member(p_target, 'fake',
    left('Hiring: fake job or asked for money' || coalesce(' / ' || nullif(btrim(p_note), ''), ''), 500));
  update public.hiring_role set status = 'paused', paused_by_report = true, updated_at = now()
   where member_id = p_target and status = 'open';
end $$;
revoke all on function public.report_fake_job(uuid, text) from public, anon;
grant execute on function public.report_fake_job(uuid, text) to authenticated;

-- Housekeeping (owner only; MODERATION.md): closed or long-expired roles older than 90 days.
create or replace function public.purge_hiring()
returns int language sql volatile security definer set search_path = public as $$
  with gone as (delete from public.hiring_role
                 where (status = 'closed' and closed_at < now() - interval '90 days')
                    or expires_at < now() - interval '90 days' returning 1)
  select count(*)::int from gone $$;
revoke all on function public.purge_hiring() from public, anon, authenticated;
