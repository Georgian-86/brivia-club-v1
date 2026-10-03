-- 0003_trust_hardening.sql: the Iteration 2 (Trust) migration (Ruling P5).
-- Apply after 0001_baseline.sql and 0002_p0_privacy_consent.sql, in the Supabase SQL editor, and ship
-- it together with the client changes of the same iteration (saveProfile in supabase.js now updates
-- editable columns only; a combined upsert would be denied by the column grants below; app.js reads other
-- members only through the candidate RPCs of Task 2, because members can no longer select public_profiles;
-- supabase.js no longer stores data: URLs in photo_url/cover_url, which Task 3b caps at 2048 characters).
-- Senders can no longer select their own outgoing connection_requests rows (Task 3b): any client view of
-- outgoing requests must call my_outgoing_requests().
-- RE-RUN ORDER: any re-run of 0001 or 0002 must be followed by a re-run of 0003. Re-running 0001 alone reverts
-- the community_posts select policy, the message insert policy and the public_profiles grant; re-running 0002
-- alone reverts objects that 0003 redefines (public_profiles grant, the request triggers,
-- respond_connection_request, the request/profile select policies). 0001 no longer changes the visibility of
-- an existing message-attachments bucket (0003 owns it: private).
-- DATA CHANGES on a populated project (take a backup first): over-long and non-storage photo_url/cover_url
-- values are cleared to null; over-long request notes are cut to 500 characters; message-attachments
-- becomes private. Pre-flight counts are next to each step below.
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

-- May the caller see posts by p_author? Own posts always; otherwise the caller AND the author must be
-- completed (Ruling I3), not blocked with the author in either direction, and in the author's world (Ruling I4).
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
          and public.brivia_is_completed(a.name, a.city)  -- the author must be completed too (final review M4)
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
  -- Pair lock (same as the completion trigger, re-entrant in this transaction) BEFORE the completion check,
  -- so a concurrent reverse insert is seen and a completing request is never capped by mistake.
  -- Lock order is always caps(sender) then pair, so two senders cannot deadlock.
  perform public.brivia_lock_pair(new.from_id, new.to_id);
  -- An expired own row would otherwise block this insert (primary key); expired requests are dead, so the
  -- new request replaces it (and a decline stays indistinguishable from an unanswered request).
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

-- The select policy with the expiry condition is defined once, in Task 3b below (recipient-only).

-- ---------------------------------------------------------------------------------------------
-- Task 3b: consent follow-ups from the P0 final review.
-- ---------------------------------------------------------------------------------------------
-- Clients insert only (from_id, to_id, note); status and created_at always come from the defaults, so a
-- client can neither pre-accept nor back-date a request (back-dating would dodge the caps or expiry).
revoke insert on public.connection_requests from public, anon, authenticated;
grant insert (from_id, to_id, note) on public.connection_requests to authenticated;

-- The sender never sees a decline. Senders read their outgoing requests only through
-- my_outgoing_requests(), which shows 'declined' as 'pending' and hides expired requests, blocked pairs
-- (either direction) and the other test world. Live declined and live pending rows also conflict the same
-- way on re-request (primary key), and both expire after 30 days, so nothing tells them apart.
create or replace function public.my_outgoing_requests()
returns table (to_id uuid, note text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.to_id, r.note,
         case when r.status = 'declined' then 'pending' else r.status end,
         r.created_at
  from public.connection_requests r
  join public.profiles me on me.id = auth.uid()
  join public.profiles p on p.id = r.to_id and p.is_test = me.is_test
  where r.from_id = auth.uid()
    and public.brivia_request_is_live(r.status, r.created_at)
    and not public.brivia_pair_is_blocked(r.from_id, r.to_id)
  order by r.created_at desc, r.to_id;
$$;
revoke all on function public.my_outgoing_requests() from public, anon;
grant execute on function public.my_outgoing_requests() to authenticated;

-- The base table shows a member only the requests addressed to them (the Requests list); the sender of a
-- request cannot read its status here. Expired requests stay hidden (Task 3).
drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    public.brivia_has_completed_profile()
    and to_id = auth.uid()
    and not public.brivia_is_blocked_between(from_id, to_id)  -- caller is a party, so this answers
    and public.brivia_request_is_live(status, created_at)
  );

-- A block withdraws the blocker's own unanswered request to the blocked member (pending, or declined: to
-- the blocker both read as pending). Otherwise, after an unblock, the blocked member's later request would
-- complete a match from consent the blocker gave before blocking. Requests from the blocked member stay
-- (hidden while blocked); after an unblock the blocker still has to accept them.
create or replace function public.brivia_on_block_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(new.blocker_id, new.blocked_id);
  delete from public.connection_requests
   where from_id = new.blocker_id and to_id = new.blocked_id and status <> 'accepted';
  return null;
end;
$$;
revoke all on function public.brivia_on_block_created() from public, anon, authenticated;

drop trigger if exists brivia_on_block_created on public.brivia_blocks;
create trigger brivia_on_block_created
  after insert on public.brivia_blocks
  for each row execute function public.brivia_on_block_created();

-- No oversized photos: photo_url and cover_url hold a storage URL (at most 2048 characters), never an
-- inline data: URL. The client stopped storing data URLs in the same release. DATA CLEANUP: existing values
-- longer than 2048 characters (old data-URL fallbacks) are cleared to null before the constraint is added;
-- those members fall back to their initials / the default cover until they upload again.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_photo_url_length'
                 and conrelid = 'public.profiles'::regclass) then
    update public.profiles set photo_url = null where char_length(photo_url) > 2048;
    alter table public.profiles
      add constraint profiles_photo_url_length check (photo_url is null or char_length(photo_url) <= 2048);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_cover_url_length'
                 and conrelid = 'public.profiles'::regclass) then
    update public.profiles set cover_url = null where char_length(cover_url) > 2048;
    alter table public.profiles
      add constraint profiles_cover_url_length check (cover_url is null or char_length(cover_url) <= 2048);
  end if;
end $$;

-- Consistent id comparison: 0002 compared the own-profile policy as text; ids are uuid everywhere (Ruling P6).
drop policy if exists "Members can view their own profile" on public.profiles;
create policy "Members can view their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- =============================================================================================
-- Task 4: private chat media, bucket limits, careers throttle
-- Ships together with the client change (attachment_path + signed URLs); see supabase.js / app.js.
-- =============================================================================================
update storage.buckets set public = false where id = 'message-attachments';

-- Uploader (own folder) or the sender / recipient of a message row that references the object.
drop policy if exists "Members can view their own message attachments" on storage.objects;
drop policy if exists "Participants can view message attachments" on storage.objects;
create policy "Participants can view message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.brivia_messages m
         where m.attachment_path = storage.objects.name
           -- the object must sit in the SENDER's folder: a message cannot claim someone else's file
           and (storage.foldername(storage.objects.name))[1] = m.sender_id::text
           and (select auth.uid()) in (m.sender_id, m.recipient_id)
      )
    )
  );

-- Defence in depth: a message may only reference a file in its own sender's folder.
alter table public.brivia_messages drop constraint if exists brivia_messages_attachment_path_owner;
alter table public.brivia_messages add constraint brivia_messages_attachment_path_owner
  check (attachment_path is null or split_part(attachment_path, '/', 1) = sender_id::text);

-- Size and type limits on every bucket (enforced by Storage itself).
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
  where id in ('profile-photos', 'profile-covers');
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
  where id = 'community-posts';
update storage.buckets set file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
  where id = 'message-attachments';
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  where id = 'career-resumes';

-- Careers form throttle: anon insert stays allowed, but at most 3 applications per email per 24 h and
-- 200 per hour overall. The error is deliberately generic.
create index if not exists career_applications_email_created_idx
  on public.career_applications (lower(email), created_at);
create index if not exists career_applications_created_idx on public.career_applications (created_at);

create or replace function public.brivia_career_application_throttle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();  -- always the server clock, even for the owner: a backdated row still counts (Ruling I11)
  new.email := lower(btrim(new.email));
  perform pg_advisory_xact_lock(hashtext('career_applications_throttle'));
  if (select count(*) from public.career_applications
       where lower(btrim(email)) = new.email and created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.career_applications where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Could not submit the application. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.brivia_career_application_throttle() from public, anon, authenticated;
drop trigger if exists career_applications_throttle on public.career_applications;
create trigger career_applications_throttle before insert on public.career_applications
  for each row execute function public.brivia_career_application_throttle();

-- Interaction log (Task 5): every like/pass/request/... with the served features, propensity and model version,
-- so ORBIT can be evaluated offline (spec section 8). Clients may append their own explicit actions only
-- (viewer, target, event; created_at defaults). 'impression' rows, with the served features, score, propensity,
-- model version and context, are written only by the ORBIT service through log_impressions(p_viewer, ...)
-- (spec section 9.1.6, Iteration 4), never by a client. Members never read impression rows or those columns:
-- context.ring would reveal what the k-anonymity floor hides.
create table if not exists public.interaction (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (event in ('like','pass','request','accept','decline','met','letgo','impression')),
  context jsonb not null default '{}'::jsonb,
  features jsonb check (features is null or pg_column_size(features) <= 8192),
  score real,
  propensity real check (propensity is null or (propensity >= 0 and propensity <= 1)),
  model_version text,
  created_at timestamptz not null default now(),
  check (viewer_id <> target_id)
);
create index if not exists interaction_viewer_created_idx on public.interaction (viewer_id, created_at desc);
create index if not exists interaction_target_created_idx on public.interaction (target_id, created_at desc);

alter table public.interaction enable row level security;
revoke all on public.interaction from public, anon, authenticated;
grant select (id, viewer_id, target_id, event, created_at) on public.interaction to authenticated;
grant insert (viewer_id, target_id, event) on public.interaction to authenticated;

drop policy if exists interaction_select_own on public.interaction;
create policy interaction_select_own on public.interaction for select to authenticated
  using (viewer_id = auth.uid() and event <> 'impression');
-- Labels need backing evidence: met/letgo need a match, accept/decline need a request addressed to the viewer.
create or replace function public.brivia_interaction_allowed(p_viewer uuid, p_target uuid, p_event text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer = auth.uid() and case
    when p_event in ('like','pass','request') then true
    when p_event in ('met','letgo') then exists (
      select 1 from public.matches m
      where (m.user1_id::text = p_viewer::text and m.user2_id::text = p_target::text)
         or (m.user1_id::text = p_target::text and m.user2_id::text = p_viewer::text))
    when p_event in ('accept','decline') then exists (
      select 1 from public.connection_requests r
      where r.to_id::text = p_viewer::text and r.from_id::text = p_target::text)
    else false
  end;
$$;
revoke all on function public.brivia_interaction_allowed(uuid, uuid, text) from public, anon;
grant execute on function public.brivia_interaction_allowed(uuid, uuid, text) to authenticated;

drop policy if exists interaction_insert_own on public.interaction;
create policy interaction_insert_own on public.interaction for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and event in ('like','pass','request','accept','decline','met','letgo')
    and public.brivia_same_world(viewer_id, target_id)
    and public.brivia_interaction_allowed(viewer_id, target_id, event)
  );

-- =============================================================================================
-- Final-review fix wave (Ruling I11)
-- =============================================================================================
-- Server-owned created_at. Member and anon sessions cannot choose created_at on insert: a forged date
-- would sort a profile to the top of the deck, a post to the top of the feed, a message into the past, or
-- dodge the careers throttle. Owner sessions (the seed script and the SQL editor: current_user AND
-- session_user are the table owner, the same rule as brivia_guard_is_test) may still set it.
-- career_applications ignores any supplied created_at, even from the owner (set in its throttle trigger).
-- Not SECURITY DEFINER on purpose: current_user must be the caller's role. The owner test is inlined (no
-- helper function), so member sessions need no execute grant for these triggers to run.
create or replace function public.brivia_server_created_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not (current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)
          and session_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)) then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_server_created_at() from public, anon, authenticated;

drop trigger if exists brivia_profiles_server_created_at on public.profiles;
create trigger brivia_profiles_server_created_at before insert on public.profiles
  for each row execute function public.brivia_server_created_at();
drop trigger if exists brivia_posts_server_created_at on public.community_posts;
create trigger brivia_posts_server_created_at before insert on public.community_posts
  for each row execute function public.brivia_server_created_at();
drop trigger if exists brivia_messages_server_created_at on public.brivia_messages;
create trigger brivia_messages_server_created_at before insert on public.brivia_messages
  for each row execute function public.brivia_server_created_at();

-- A member may edit only the caption of a post: author, image and created_at stay as inserted.
create or replace function public.brivia_posts_keep_immutable()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not (current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)
          and session_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid)) then
    new.id := old.id;
    new.author_id := old.author_id;
    new.image_path := old.image_path;
    new.image_url := old.image_url;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_posts_keep_immutable() from public, anon, authenticated;
drop trigger if exists brivia_posts_keep_immutable on public.community_posts;
create trigger brivia_posts_keep_immutable before update on public.community_posts
  for each row execute function public.brivia_posts_keep_immutable();

-- Careers: created_at is stamped unconditionally in brivia_career_application_throttle() (Task 4 section).

-- Storage-only image URLs. photo_url, cover_url and community_posts.image_url are shown to other members
-- and auto-load in their browsers, so an arbitrary URL would be a tracking pixel (viewer IP, time, who looked
-- at whom). They must be a public URL of this project's Storage for the right bucket AND the owner's own
-- folder. The project host is not hard-coded: the path must be exactly
--   /storage/v1/object/public/<bucket>/<owner uid>/<one file name>
-- (no '..', no query string, no userinfo). The client additionally renders these only from the Supabase
-- origin (VITE_SUPABASE_URL), so a foreign host that copies the path still never loads.
-- Preset covers (cover-assets.js) are same-site paths under /assets/ or /Images/Cover images/.
create or replace function public.brivia_is_storage_url(p_url text, p_bucket text, p_owner uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    p_url ~ ('^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/storage/v1/object/public/' || p_bucket || '/'
             || p_owner::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
    and p_url !~ '\.\.', false);
$$;
create or replace function public.brivia_is_preset_cover(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_url ~ '^/(assets/|Images/Cover(%20| )images/)[A-Za-z0-9][A-Za-z0-9._ -]*$' and p_url !~ '\.\.', false);
$$;

-- DATA CLEANUP (profiles): photo/cover values that are not storage URLs of the member's own folder (external
-- links, OAuth avatars, other members' files, old data: URLs) are cleared to null before the constraints are
-- added; those members show initials / the default cover until they upload again. Pre-flight count:
--   select count(*) from public.profiles where photo_url is not null
--     and not public.brivia_is_storage_url(photo_url, 'profile-photos', id);
update public.profiles set photo_url = null
 where photo_url is not null and not public.brivia_is_storage_url(photo_url, 'profile-photos', id);
update public.profiles set cover_url = null
 where cover_url is not null and not public.brivia_is_storage_url(cover_url, 'profile-covers', id)
   and not public.brivia_is_preset_cover(cover_url);
alter table public.profiles drop constraint if exists profiles_photo_url_storage;
alter table public.profiles add constraint profiles_photo_url_storage
  check (photo_url is null or public.brivia_is_storage_url(photo_url, 'profile-photos', id));
alter table public.profiles drop constraint if exists profiles_cover_url_storage;
alter table public.profiles add constraint profiles_cover_url_storage
  check (cover_url is null or public.brivia_is_storage_url(cover_url, 'profile-covers', id)
         or public.brivia_is_preset_cover(cover_url));

-- Posts: image_url is the public URL of image_path, and image_path is in the author's folder. Added NOT VALID:
-- existing posts are not deleted or rewritten (the client already refuses to render a non-storage image);
-- every new or edited post is checked. Pre-flight count of legacy posts that would fail:
--   select count(*) from public.community_posts where not (public.brivia_is_storage_url(image_url,
--     'community-posts', author_id) and image_path = author_id::text || '/' || regexp_replace(image_url, '^.*/', ''));
alter table public.community_posts drop constraint if exists community_posts_image_storage;
alter table public.community_posts add constraint community_posts_image_storage
  check (public.brivia_is_storage_url(image_url, 'community-posts', author_id)
         and image_path = author_id::text || '/' || regexp_replace(image_url, '^.*/', '')) not valid;

notify pgrst, 'reload schema';
