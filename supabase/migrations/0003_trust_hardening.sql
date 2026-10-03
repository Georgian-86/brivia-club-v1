-- 0003_trust_hardening.sql: the Iteration 2 (Trust) migration (Ruling P5).
-- Apply after 0001_baseline.sql and 0002_p0_privacy_consent.sql, in the Supabase SQL editor, and ship
-- it together with the client changes of the same iteration (saveProfile in supabase.js now updates
-- editable columns only; a combined upsert would be denied by the column grants below; app.js reads other
-- members only through the candidate RPCs of Task 2, because members can no longer select public_profiles).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- Task 1: column-locked profiles. Members may update only the editable columns of their own row.
-- id, email, created_at and is_test can never be changed by a client (email is set at insert only).
-- Row scope (id = auth.uid()) stays in the RLS update policy from 0001.
-- ---------------------------------------------------------------------------------------------
revoke update on public.profiles from public, anon, authenticated;
grant update (
  name, full_name, phone, phone_country_code, phone_number, gender, city, state,
  experience, skills, looking_for, photo_url, cover_url, updated_at
) on public.profiles to authenticated;

-- is_test (Ruling P14) is set only by the table owner (the seed script / SQL editor).
-- Clients cannot choose it on insert and cannot change it on update, even if a grant is added later.
-- Rule: the bypass applies only when BOTH current_user and session_user are the table owner. Checking
-- current_user alone would let a member-called SECURITY DEFINER function owned by postgres set is_test;
-- on Supabase a member's session_user is authenticator, so that path stays closed.
-- Seeding must therefore run in the SQL editor as postgres. The service_role key will not work.
create or replace function public.brivia_guard_is_test()
returns trigger
language plpgsql
as $$
begin
  if current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.profiles'::regclass)
     and session_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.profiles'::regclass) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_test := false;
  else
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;

drop trigger if exists brivia_profiles_guard_is_test on public.profiles;
create trigger brivia_profiles_guard_is_test
  before insert or update on public.profiles
  for each row execute function public.brivia_guard_is_test();

-- ---------------------------------------------------------------------------------------------
-- Task 2: candidate RPCs replace the open directory.
-- Members no longer select public.public_profiles. They read other members only through three
-- SECURITY DEFINER functions that return public_profile_card rows (no email, phone or is_test):
--   get_candidates(p_ids)            cards for specific ids (requests list, post authors, chats); max 50 ids
--   search_members(p_query, p_limit) case-insensitive search, at most 20 rows ("search reaches everyone")
--   list_members(p_limit, p_after, p_after_id)  the deck until ORBIT is wired; keyset paged newest first
-- Every function hides: the caller; profiles that are not completed (Ruling I1: name <> 'New Member'
-- and city is not null); blocked pairs in both directions; the other test world (Ruling P14).
-- A session without a profile row sees nothing. Ship with the client change that calls these RPCs.
-- ---------------------------------------------------------------------------------------------
do $$ begin
  if to_regtype('public.public_profile_card') is null then
    create type public.public_profile_card as (
      id uuid, name text, full_name text, gender text, city text, state text, experience text,
      skills text[], looking_for text[], photo_url text, cover_url text, created_at timestamptz
    );
  end if;
end $$;

create or replace function public.get_candidates(p_ids uuid[])
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, is_test from public.profiles where id = auth.uid()),
  wanted as (  -- the first 50 distinct ids, in the order given
    select id from (
      select distinct on (u.id) u.id, u.ord from unnest(p_ids) with ordinality as u(id, ord)
      where u.id is not null order by u.id, u.ord
    ) d order by d.ord limit 50
  )
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  where p.id in (select id from wanted)
    and p.name <> 'New Member' and p.city is not null
    and not exists (
      select 1 from public.brivia_blocks b
      where (b.blocker_id = me.id and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = me.id)
    )
  order by p.created_at desc, p.id desc;
$$;
revoke all on function public.get_candidates(uuid[]) from public, anon;
grant execute on function public.get_candidates(uuid[]) to authenticated;

create or replace function public.search_members(p_query text, p_limit int default 20)
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, is_test from public.profiles where id = auth.uid()),
  q as (  -- LIKE wildcards in the query are literal; empty or whitespace-only queries match nothing
    select '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    where coalesce(btrim(p_query), '') <> ''
  )
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  cross join q
  where p.name <> 'New Member' and p.city is not null
    and not exists (
      select 1 from public.brivia_blocks b
      where (b.blocker_id = me.id and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = me.id)
    )
    and (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\'
         or p.city ilike q.pattern escape '\'
         or exists (select 1 from unnest(p.skills) s where s ilike q.pattern escape '\')
         or exists (select 1 from unnest(p.looking_for) l where l ilike q.pattern escape '\'))
  order by (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\') desc,
           p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;
revoke all on function public.search_members(text, int) from public, anon;
grant execute on function public.search_members(text, int) to authenticated;

-- Keyset paging: pass the created_at and id of the last row of the previous page.
create or replace function public.list_members(p_limit int default 20, p_after timestamptz default null,
                                               p_after_id uuid default null)
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, is_test from public.profiles where id = auth.uid())
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  where p.name <> 'New Member' and p.city is not null
    and not exists (
      select 1 from public.brivia_blocks b
      where (b.blocker_id = me.id and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = me.id)
    )
    and (p_after is null
         or p.created_at < p_after
         or (p_after_id is not null and p.created_at = p_after and p.id < p_after_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;
revoke all on function public.list_members(int, timestamptz, uuid) from public, anon;
grant execute on function public.list_members(int, timestamptz, uuid) to authenticated;

-- Close the open directory. The view stays for owner/definer use; 0001/0002 grant select on it, and
-- this revoke must run after them (re-running 0002 alone would reopen it: re-run 0003 afterwards).
revoke select on public.public_profiles from authenticated;
