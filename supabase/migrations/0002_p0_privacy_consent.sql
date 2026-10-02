-- WARNING (Ruling P5): apply this ONLY together with the client change that reads
-- public_profiles and sends connection_requests (never inserts matches). Applied alone, the deck
-- is empty (it shows only the member's own row), matches cannot be created, and members without
-- a match cannot message each other.
--
-- public_profiles is intentionally an owner-run (security-definer) view, so the Supabase
-- advisor lint 0010 is expected; do NOT switch it to security_invoker. It depends on
-- profiles never having FORCE ROW LEVEL SECURITY, and on the view owner owning profiles.
--
-- P0 privacy: members must never read each other's email/phone.
-- Run once in the Supabase SQL editor, after 0001_baseline.sql. Idempotent.
--
-- Other members read profiles only through public.public_profiles (no contact fields).
-- The base table becomes owner-only, so email/phone/phone_country_code/phone_number
-- are visible to the member who owns the row and nobody else.

-- The view runs as its owner (default, NOT security_invoker) so it can read rows the
-- base-table policy now hides. The where clause keeps it members-only.
create or replace view public.public_profiles as
  select id, name, full_name, gender, city, state, experience, skills, looking_for,
         photo_url, cover_url, created_at
  from public.profiles
  where public.brivia_has_completed_profile();

-- Supabase default privileges grant authenticated ALL on new public objects; the view is
-- auto-updatable and owner-run, so writes would bypass RLS. Make it strictly read-only.
revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to authenticated;

drop policy if exists "Completed members can view profiles" on public.profiles;
drop policy if exists "Members can view profiles" on public.profiles;
drop policy if exists "Members can view their own profile" on public.profiles;
create policy "Members can view their own profile"
  on public.profiles for select to authenticated
  using (id::text = auth.uid()::text);

notify pgrst, 'reload schema';

-- =============================================================================================
-- P0 consent: a connection (match) exists only after both members agree.
-- =============================================================================================
-- A member sends a connection request. The match is created server-side, never by the client:
--   * by the trigger below, when the other member has already requested them (mutual request), or
--   * by respond_connection_request(), when the recipient accepts.
-- Blocked pairs can neither request nor match, and do not see each other's requests. Messages
-- require a match.
-- A request is final for its sender: there is no client update or delete, so after a decline the
-- sender cannot re-request (the primary key conflicts and an upsert has no update policy to use).
-- The member who declined can change their mind by requesting back (Ruling P11). Deleting a match
-- clears the pair's requests, so they can reconnect only by mutual consent again (Ruling P10).

create table if not exists public.connection_requests (
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  status text not null default 'pending'
    constraint connection_requests_status_check check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  constraint connection_requests_not_self check (from_id <> to_id)
);
create index if not exists connection_requests_to_idx on public.connection_requests (to_id);
alter table public.connection_requests enable row level security;

-- Supabase default privileges grant anon/authenticated ALL on new tables. Members only read and
-- create requests; status changes go through the trigger and respond_connection_request().
revoke all on public.connection_requests from public, anon, authenticated;
grant select, insert on public.connection_requests to authenticated;

drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    public.brivia_has_completed_profile()
    and auth.uid() in (from_id, to_id)
    and not public.brivia_is_blocked_between(from_id, to_id)  -- caller is a party, so this answers
  );

drop policy if exists "Members can send connection requests" on public.connection_requests;
create policy "Members can send connection requests"
  on public.connection_requests for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and from_id = auth.uid()
    and to_id <> auth.uid()
    and status = 'pending'
    and not public.brivia_is_blocked_between(from_id, to_id)
  );

-- Serialises consent decisions for one pair, so A->B and B->A committed concurrently still meet:
-- the second trigger waits for the first transaction, then sees its row (READ COMMITTED).
create or replace function public.brivia_lock_pair(first_user uuid, second_user uuid)
returns void
language sql
volatile
set search_path = public
as $$
  select pg_advisory_xact_lock(
    hashtextextended(least(first_user, second_user)::text || ':' || greatest(first_user, second_user)::text, 0));
$$;
revoke all on function public.brivia_lock_pair(uuid, uuid) from public, anon, authenticated;

-- Blocks checked directly (brivia_is_blocked_between answers false unless auth.uid() is a party).
create or replace function public.brivia_pair_is_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.brivia_blocks
    where (blocker_id = first_user and blocked_id = second_user)
       or (blocker_id = second_user and blocked_id = first_user)
  );
$$;
revoke all on function public.brivia_pair_is_blocked(uuid, uuid) from public, anon, authenticated;

-- Creates the ordered match row unless the pair already has one in either orientation (Ruling P3).
create or replace function public.brivia_create_match(first_user uuid, second_user uuid)
returns void
language sql
volatile
set search_path = public
as $$
  insert into public.matches(user1_id, user2_id)
  select least(first_user, second_user), greatest(first_user, second_user)
  where not exists (
    select 1 from public.matches m
    where (m.user1_id = first_user and m.user2_id = second_user)
       or (m.user1_id = second_user and m.user2_id = first_user)
  )
  on conflict (user1_id, user2_id) do nothing;
$$;
revoke all on function public.brivia_create_match(uuid, uuid) from public, anon, authenticated;

-- A request to someone who already requested you completes the match: their request is pending,
-- or you declined it earlier and have changed your mind (Ruling P11). An 'accepted' reverse row
-- never counts: it belongs to a match that exists or was deleted (and then cleared, Ruling P10).
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

drop trigger if exists brivia_on_connection_request on public.connection_requests;
create trigger brivia_on_connection_request
  after insert on public.connection_requests
  for each row execute function public.brivia_on_connection_request();

-- The recipient accepts or declines a pending request from p_from. Anyone else (the sender, a
-- third party) gets no_data_found, the same answer as for a request that does not exist.
-- Accepting on a blocked pair silently records 'declined' and creates no match (Ruling P12).
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

-- Deleting a match (either side may, see 0001) clears the pair's requests in both directions, so
-- an old 'accepted' row can never re-create the match without fresh consent (Ruling P10).
create or replace function public.brivia_on_match_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(old.user1_id, old.user2_id);
  delete from public.connection_requests
   where (from_id = old.user1_id and to_id = old.user2_id)
      or (from_id = old.user2_id and to_id = old.user1_id);
  return null;
end;
$$;
revoke all on function public.brivia_on_match_deleted() from public, anon, authenticated;

drop trigger if exists brivia_on_match_deleted on public.matches;
create trigger brivia_on_match_deleted
  after delete on public.matches
  for each row execute function public.brivia_on_match_deleted();

-- Clients never create matches directly (already true in 0001; kept so this file stands alone).
drop policy if exists "Members can create their matches" on public.matches;
drop policy if exists "Completed members can create their matches" on public.matches;

-- Messages require a match (either orientation, Ruling P3). ONE insert policy: a second
-- permissive policy would OR away these checks.
drop policy if exists "Members can send messages" on public.brivia_messages;
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and sender_id = auth.uid()
    and not public.brivia_is_blocked_between(sender_id, recipient_id)
    and exists (
      select 1 from public.matches m
      where (m.user1_id = sender_id and m.user2_id = recipient_id)
         or (m.user1_id = recipient_id and m.user2_id = sender_id)
    )
  );

notify pgrst, 'reload schema';
