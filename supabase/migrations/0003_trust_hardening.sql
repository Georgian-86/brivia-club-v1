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
-- Every function hides: the caller; profiles that are not completed (Ruling I3, brivia_is_completed);
-- blocked pairs in both directions; the other test world (Ruling P14). A caller who is not a completed
-- profile (or has no profile row) sees nothing (Ruling I5). Ship with the client change that calls these RPCs.
-- ---------------------------------------------------------------------------------------------
do $$ begin
  if to_regtype('public.public_profile_card') is null then
    create type public.public_profile_card as (
      id uuid, name text, full_name text, gender text, city text, state text, experience text,
      skills text[], looking_for text[], photo_url text, cover_url text, created_at timestamptz
    );
  end if;
end $$;

-- Ruling I3: the single definition of a completed profile (trimmed name not empty and not 'New Member',
-- trimmed city not empty). Pure function; used by the candidate RPCs and the community_posts policy.
create or replace function public.brivia_is_completed(p_name text, p_city text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(p_name), '') is not null and btrim(p_name) <> 'New Member'
     and nullif(btrim(p_city), '') is not null;
$$;
revoke all on function public.brivia_is_completed(text, text) from public, anon;
grant execute on function public.brivia_is_completed(text, text) to authenticated;

create or replace function public.get_candidates(p_ids uuid[])
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed profile
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_is_completed(name, city)),
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
    and public.brivia_is_completed(p.name, p.city)
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
  with me as (  -- Ruling I5: the caller must be a completed profile
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_is_completed(name, city)),
  q as (  -- LIKE wildcards in the query are literal; empty or whitespace-only queries match nothing
    select '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    where coalesce(btrim(p_query), '') <> ''
  )
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  cross join q
  where public.brivia_is_completed(p.name, p.city)
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
  with me as (  -- Ruling I5: the caller must be a completed profile
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_is_completed(name, city))
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  where public.brivia_is_completed(p.name, p.city)
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

-- ---------------------------------------------------------------------------------------------
-- Task 2 fix round 1: post visibility (Ruling I4) and world isolation for requests and messages (I6).
-- profiles is owner-only under RLS, so the world and completed checks run in SECURITY DEFINER helpers.
-- ---------------------------------------------------------------------------------------------
-- True when the caller is one of the two members and both are in the same world (is_test equal).
-- A third party always gets false, so it cannot probe who is a test member.
create or replace function public.brivia_same_world(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() in (first_user, second_user)
     and exists (
       select 1 from public.profiles a join public.profiles b on a.is_test = b.is_test
       where a.id = first_user and b.id = second_user
     );
$$;
revoke all on function public.brivia_same_world(uuid, uuid) from public, anon;
grant execute on function public.brivia_same_world(uuid, uuid) to authenticated;

-- May the caller see posts by p_author? Own posts always; otherwise the caller must be completed
-- (Ruling I3), not blocked with the author in either direction, and in the author's world (Ruling I4).
create or replace function public.brivia_can_see_author(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_author = auth.uid()
      or exists (
        select 1 from public.profiles me
        join public.profiles a on a.id = p_author and a.is_test = me.is_test
        where me.id = auth.uid() and public.brivia_is_completed(me.name, me.city)
          and not exists (
            select 1 from public.brivia_blocks b
            where (b.blocker_id = me.id and b.blocked_id = a.id) or (b.blocker_id = a.id and b.blocked_id = me.id)
          )
      );
$$;
revoke all on function public.brivia_can_see_author(uuid) from public, anon;
grant execute on function public.brivia_can_see_author(uuid) to authenticated;

drop policy if exists "Members can view community posts" on public.community_posts;
create policy "Members can view community posts"
  on public.community_posts for select to authenticated
  using (author_id = auth.uid() or public.brivia_can_see_author(author_id));

-- Requests: same checks as 0002 plus the world check (Ruling I6). A cross-world insert is refused.
drop policy if exists "Members can send connection requests" on public.connection_requests;
create policy "Members can send connection requests"
  on public.connection_requests for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and from_id = auth.uid()
    and to_id <> auth.uid()
    and status = 'pending'
    and not public.brivia_is_blocked_between(from_id, to_id)
    and public.brivia_same_world(from_id, to_id)
  );

-- Messages: still ONE insert policy (a second permissive policy would OR away these checks).
-- Same checks as 0002 plus the world check (Ruling I6), so even a legacy cross-world match cannot chat.
drop policy if exists "Members can send messages" on public.brivia_messages;
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and sender_id = auth.uid()
    and not public.brivia_is_blocked_between(sender_id, recipient_id)
    and public.brivia_same_world(sender_id, recipient_id)
    and exists (
      select 1 from public.matches m
      where (m.user1_id = sender_id and m.user2_id = recipient_id)
         or (m.user1_id = recipient_id and m.user2_id = sender_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Task 3: abuse caps on connection requests, 30-day expiry, purge.
-- NOTE: this section redefines brivia_on_connection_request() and respond_connection_request() from 0002
-- (adding the expiry rule). Re-running 0002 alone would restore the old versions: re-run 0003 afterwards.
-- ---------------------------------------------------------------------------------------------
-- A note is at most 500 characters (the pitch sheet enforces the same limit). Longer legacy notes are cut
-- first, so adding the constraint cannot fail at apply time.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'connection_requests_note_length'
                 and conrelid = 'public.connection_requests'::regclass) then
    update public.connection_requests set note = left(note, 500) where char_length(note) > 500;
    alter table public.connection_requests
      add constraint connection_requests_note_length check (note is null or char_length(note) <= 500);
  end if;
end $$;

-- Expiry: a request that is not accepted (pending, or declined: the sender cannot tell them apart) expires
-- 30 days after it was sent. An expired request is hidden from the recipient, cannot be accepted, does not
-- complete a match, does not count toward the caps, and is replaced if its sender requests again.
create or replace function public.brivia_request_is_live(p_status text, p_created_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'accepted' or p_created_at > now() - interval '30 days';
$$;
revoke all on function public.brivia_request_is_live(text, timestamptz) from public, anon;
grant execute on function public.brivia_request_is_live(text, timestamptz) to authenticated;

-- Caps (Review Focus 5): at most 30 requests per sender in 24 hours and at most 100 live unanswered
-- (pending or declined) requests. A capped insert is dropped SILENTLY (the trigger returns NULL): no error,
-- no row, and the client shows the usual "Signal sent", so the cap is never revealed. A request that
-- completes a match (the other member already asked) is never capped. Owner sessions (no auth.uid()) and
-- spoofed senders are left to RLS, which refuses the spoof; this trigger never acts for another member.
create or replace function public.brivia_before_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.from_id is distinct from auth.uid() then
    return new;
  end if;
  -- One sender at a time, so parallel inserts cannot overshoot the caps.
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || new.from_id::text, 0));
  -- The sender's own expired request to this member is replaced by the new one.
  delete from public.connection_requests
   where from_id = new.from_id and to_id = new.to_id
     and not public.brivia_request_is_live(status, created_at);
  if exists (
    select 1 from public.connection_requests
    where from_id = new.to_id and to_id = new.from_id
      and public.brivia_request_is_live(status, created_at)
      and (status = 'pending' or status = 'declined')
  ) then
    return new;  -- completes a match: never capped
  end if;
  if (select count(*) from public.connection_requests
       where from_id = new.from_id and created_at > now() - interval '24 hours') >= 30
     or (select count(*) from public.connection_requests
          where from_id = new.from_id and status in ('pending', 'declined')
            and public.brivia_request_is_live(status, created_at)) >= 100 then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_before_connection_request() from public, anon, authenticated;

drop trigger if exists brivia_before_connection_request on public.connection_requests;
create trigger brivia_before_connection_request
  before insert on public.connection_requests
  for each row execute function public.brivia_before_connection_request();

-- Completion (0002, Ruling P11) with the expiry rule: an expired reverse request never completes a match.
create or replace function public.brivia_on_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(new.from_id, new.to_id);
  if public.brivia_pair_is_blocked(new.from_id, new.to_id) then
    return null;
  end if;
  if exists (
    select 1 from public.connection_requests
    where from_id = new.to_id and to_id = new.from_id
      and (status = 'pending' or (status = 'declined' and to_id = new.from_id))
      and public.brivia_request_is_live(status, created_at)
  ) then
    update public.connection_requests set status = 'accepted'
     where (from_id = new.from_id and to_id = new.to_id)
        or (from_id = new.to_id and to_id = new.from_id);
    perform public.brivia_create_match(new.from_id, new.to_id);
  end if;
  return null;
end;
$$;
revoke all on function public.brivia_on_connection_request() from public, anon, authenticated;

-- respond_connection_request (0002, Ruling P12) with the expiry rule: an expired request answers
-- no_data_found, exactly like one that does not exist.
create or replace function public.respond_connection_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_from is null or p_accept is null then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  perform public.brivia_lock_pair(p_from, me);
  if not exists (
    select 1 from public.connection_requests
    where from_id = p_from and to_id = me and status = 'pending'
      and public.brivia_request_is_live(status, created_at)
  ) then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not p_accept or public.brivia_pair_is_blocked(p_from, me) then
    update public.connection_requests set status = 'declined' where from_id = p_from and to_id = me;
    return;
  end if;
  update public.connection_requests set status = 'accepted'
   where (from_id = p_from and to_id = me) or (from_id = me and to_id = p_from and status = 'pending');
  perform public.brivia_create_match(p_from, me);
end;
$$;
revoke all on function public.respond_connection_request(uuid, boolean) from public, anon;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;

-- Deletes expired requests (pending or declined, older than 30 days). Owner-only: run it from the SQL
-- editor or a scheduled job (pg_cron) as postgres. Returns the number of rows deleted.
create or replace function public.purge_expired_requests()
returns integer
language sql
volatile
set search_path = public
as $$
  with gone as (
    delete from public.connection_requests
     where not public.brivia_request_is_live(status, created_at)
    returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function public.purge_expired_requests() from public, anon, authenticated;

-- The Requests list hides expired requests.
drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    public.brivia_has_completed_profile()
    and auth.uid() in (from_id, to_id)
    and not public.brivia_is_blocked_between(from_id, to_id)  -- caller is a party, so this answers
    and public.brivia_request_is_live(status, created_at)
  );
