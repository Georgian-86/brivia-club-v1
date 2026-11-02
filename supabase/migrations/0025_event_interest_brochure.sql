set lock_timeout = '5s';

-- 0025_event_interest_brochure.sql: "Show interest" and the event brochure (founder request 2026-11-02, D-125).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0023 (README "## 0025"). Needs 0020, 0022 and 0023.
-- Idempotent: the local harness applies every migration twice.
--
-- 1. "Show interest" (a half registration for paid events). On an event with an entry fee, a member can show interest
--    without paying: an event_rsvp row with status 'interested'. It holds no seat (brivia_rsvp_active is unchanged, so
--    capacity and "spots left" count only confirmed seats and live payment holds), and it is not "going". It does put
--    the member in the event's companion pool: "Looking for a companion?" and Find a Companion work for everyone who
--    showed interest, reserved or paid, so people can find company before the payment is made (ORBIT §11.3).
--    Reserving later turns the same row into the 30-minute payment hold; cancelling the interest removes it.
--    Free events have no interest step: one tap registers (set_event_interest refuses them).
-- 2. The brochure: an optional PDF (at most 5 MB) per member event, in the organiser's own folder of the public
--    event-brochures bucket, set with set_event_brochure (the organiser only). list_events returns it.
--
-- Mutual consent is unchanged: being in a pool is never a connection; two right swipes (0023) or an accepted request
-- make one. Privacy is unchanged: interest is counted, never listed by name except to the member's own connections
-- ("friends" still lists confirmed seats only).
--
-- What changes:
--   * event_rsvp.status also allows 'interested'; brivia_companion_status(status) names the statuses in a pool.
--   * club_event.brochure_url (checked storage URL); bucket event-brochures (application/pdf, 5 MB) and its policies.
--   * list_events: two more columns (interested_count, brochure_url); my_status can be 'interested'; companion counts
--     and wants_companion follow the pool.
--   * set_event_rsvp: Reserve upgrades an interest to the payment hold; the companion choice needs a registration or
--     an interest.
--   * event_companions, brivia_companion_eligible, companion_events, companion_deck: the pool is
--     brivia_companion_status instead of confirmed seats only.
--   * New: set_event_interest(p_event, p_on, p_wants_companion), set_event_brochure(p_id, p_url).

-- 1. Interest --------------------------------------------------------------------------------------------------------
alter table public.event_rsvp drop constraint if exists event_rsvp_status_check;
alter table public.event_rsvp add constraint event_rsvp_status_check
  check (status in ('confirmed', 'pending_payment', 'interested'));

-- The statuses that put a member in an event's companion pool (with wants_companion): a confirmed seat, a payment
-- hold (live or lapsed: the member still means to go) and a shown interest.
create or replace function public.brivia_companion_status(p_status text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_status in ('confirmed', 'pending_payment', 'interested'), false)
$$;
revoke all on function public.brivia_companion_status(text) from public, anon, authenticated;

-- 2. Brochure --------------------------------------------------------------------------------------------------------
alter table public.club_event add column if not exists brochure_url text;
alter table public.club_event drop constraint if exists club_event_brochure_url_check;
alter table public.club_event add constraint club_event_brochure_url_check
  check (brochure_url is null or (creator_id is not null and public.brivia_is_storage_url(brochure_url, 'event-brochures', creator_id)
                                  and brochure_url ~* '\.pdf$'));

insert into storage.buckets (id, name, public) values ('event-brochures', 'event-brochures', true) on conflict (id) do nothing;
update storage.buckets set public = true, file_size_limit = 5242880, allowed_mime_types = array['application/pdf']
 where id = 'event-brochures';
drop policy if exists "Members can upload event brochures" on storage.objects;
create policy "Members can upload event brochures"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-brochures' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own event brochures" on storage.objects;
create policy "Members can view their own event brochures"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-brochures' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can delete their event brochures" on storage.objects;
create policy "Members can delete their event brochures"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-brochures' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- 3. Functions -------------------------------------------------------------------------------------------------------
-- list_events(p_category): as 0022, plus interested_count (interests the caller can see, the caller's own included)
-- and brochure_url. my_status: 'confirmed' | 'pending_payment' | 'expired' | 'interested' | null.
drop function if exists public.list_events(text);
create or replace function public.list_events(p_category text default null)
returns table(id uuid, title text, description text, category text, tags text[], venue_name text, venue_area text,
              starts_at timestamptz, ends_at timestamptz, image_key text, distance_km int, going_count int,
              companion_count int, going boolean, wants_companion boolean, friends jsonb,
              status text, is_mine boolean, organizer jsonb, image_url text, gallery_urls text[], venue_address text,
              map_url text, place_id text, capacity int, registered_count int, fee_inr int, my_status text, contact jsonb,
              custom_category text, interested_count int, brochure_url text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where auth.uid() is not null and public.brivia_member_completed(auth.uid())),
  home as (select o.home_cell from public.member_orbit o, me where o.member_id = me.id and o.precision = 'cell'),
  connections as (
    select case when m.user1_id = me.id then m.user2_id else m.user1_id end as id
      from public.matches m, me where me.id in (m.user1_id, m.user2_id)),
  ev as (
    select e.*,
           (select greatest(1, round(public.brivia_cell_km(h.home_cell, e.venue_cell)))::int from home h
             where e.venue_cell is not null) as km,
           (e.creator_id is not null and e.creator_id = me.id) as mine,
           case when e.cancelled_at is not null then 'cancelled' when e.is_published then 'published' else 'draft' end as st,
           (select case when r.status = 'interested' then 'interested'
                        else r.status || case when public.brivia_rsvp_active(r.status, r.created_at) then '' else ':expired' end end
              from public.event_rsvp r where r.event_id = e.id and r.member_id = me.id) as rsvp
      from public.club_event e, me
     where (p_category is null or lower(p_category) = 'all' or e.category = lower(p_category))
       and (
         (e.is_published and public.brivia_event_open(e.starts_at, e.ends_at)
          and e.starts_at < now() + interval '60 days'
          and (e.creator_id is null or e.creator_id = me.id or public.brivia_visible_to(me.id, e.creator_id)))
         or (e.creator_id = me.id and (e.starts_at is null or public.brivia_event_open(e.starts_at, e.ends_at)))
         or (e.cancelled_at is not null and public.brivia_event_open(e.starts_at, e.ends_at)
             and exists (select 1 from public.event_rsvp r where r.event_id = e.id and r.member_id = me.id))))
  select ev.id, ev.title, ev.description, ev.category, ev.tags, ev.venue_name, ev.venue_area, ev.starts_at, ev.ends_at,
         ev.image_key, ev.km,
         (select count(*)::int from public.event_rsvp r, me
           where r.event_id = ev.id and public.brivia_rsvp_active(r.status, r.created_at)
             and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         (select count(*)::int from public.event_rsvp r, me
           where r.event_id = ev.id and r.wants_companion and public.brivia_companion_status(r.status)
             and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         coalesce(ev.rsvp in ('confirmed', 'pending_payment'), false),
         coalesce((select r.wants_companion from public.event_rsvp r, me
                    where r.event_id = ev.id and r.member_id = me.id and public.brivia_companion_status(r.status)), false),
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'photo_url', x.photo_url) order by x.created_at desc)
                     from (select p.id, p.name, p.photo_url, r.created_at
                             from public.event_rsvp r join public.profiles p on p.id = r.member_id, me
                            where r.event_id = ev.id and r.status = 'confirmed'
                              and r.member_id in (select c.id from connections c)
                              and public.brivia_visible_to(me.id, r.member_id)
                            order by r.created_at desc limit 3) x), '[]'::jsonb),
         ev.st, ev.mine,
         (select jsonb_build_object('id', p.id, 'name', p.name, 'photo_url', p.photo_url)
            from public.profiles p where p.id = ev.creator_id),
         ev.image_url, ev.gallery_urls, ev.venue_address, ev.map_url, ev.place_id, ev.capacity,
         public.brivia_event_seats_taken(ev.id), ev.fee_inr,
         case when ev.rsvp like '%:expired' then 'expired' else ev.rsvp end,
         case when ev.mine then jsonb_build_object('email', ev.contact_email, 'phone', ev.contact_phone,
                                                   'link', ev.contact_link, 'public', ev.contact_public)
              when ev.contact_public and (ev.contact_email is not null or ev.contact_phone is not null or ev.contact_link is not null)
                then jsonb_strip_nulls(jsonb_build_object('email', ev.contact_email, 'phone', ev.contact_phone, 'link', ev.contact_link))
              else null end,
         ev.custom_category,
         (select count(*)::int from public.event_rsvp r, me
           where r.event_id = ev.id and r.status = 'interested'
             and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         ev.brochure_url
    from ev
   order by case when ev.starts_at is null then 3 when ev.km is null then 2 when ev.km <= 15 then 0 when ev.km <= 60 then 1 else 2 end,
            ev.starts_at nulls last, ev.id
   limit 80
$$;
revoke all on function public.list_events(text) from public, anon;
grant execute on function public.list_events(text) to authenticated;

-- set_event_rsvp(p_event, p_going, p_wants_companion): as 0022, except that Reserve on a shown interest turns it into
-- the payment hold (or, on a free or own event, a confirmed seat), and the companion choice needs a registration or an
-- interest. going is false for an interest.
drop function if exists public.set_event_rsvp(uuid, boolean, boolean);
create or replace function public.set_event_rsvp(p_event uuid, p_going boolean, p_wants_companion boolean default null)
returns table(going boolean, wants_companion boolean, status text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_ev public.club_event%rowtype;
  v_row public.event_rsvp%rowtype;
  v_default boolean;
  v_active boolean;
  v_exists boolean;
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  -- The row lock serialises registrations for one event: the capacity check below cannot race.
  select * into v_ev from public.club_event e where e.id = p_event for update;
  if not found or not v_ev.is_published or v_ev.cancelled_at is not null
     or not public.brivia_event_open(v_ev.starts_at, v_ev.ends_at)
     or (v_ev.creator_id is not null and v_ev.creator_id <> uid and not public.brivia_visible_to(uid, v_ev.creator_id)) then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  select * into v_row from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
  v_exists := found;
  v_active := found and public.brivia_rsvp_active(v_row.status, v_row.created_at);

  if p_going is not null and not p_going then
    delete from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
    return query select false, false, null::text;
    return;
  end if;

  if coalesce(p_going, false) and not v_active then
    if v_ev.capacity is not null and public.brivia_event_seats_taken(p_event) >= v_ev.capacity then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
    select coalesce((select p.companion_default from public.member_event_pref p where p.member_id = uid), false)
      into v_default;
    insert into public.event_rsvp as r (event_id, member_id, wants_companion, status, created_at)
    values (p_event, uid, coalesce(p_wants_companion, v_default),
            case when v_ev.fee_inr > 0 and v_ev.creator_id is distinct from uid then 'pending_payment' else 'confirmed' end, now())
    on conflict (event_id, member_id) do update
      set created_at = now(), status = excluded.status, wants_companion = coalesce(p_wants_companion, r.wants_companion);
    v_active := true;
  elsif p_wants_companion is not null then
    -- A registration or a shown interest (0025) carries the companion choice.
    if not v_exists then raise exception 'register first' using errcode = '22023'; end if;
    update public.event_rsvp r set wants_companion = p_wants_companion where r.event_id = p_event and r.member_id = uid;
  end if;

  return query select r.status <> 'interested', r.wants_companion, r.status from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
end;
$$;
revoke all on function public.set_event_rsvp(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_event_rsvp(uuid, boolean, boolean) to authenticated;

-- event_companions(p_event): as 0022, over the pool (brivia_companion_status) instead of confirmed seats only.
drop function if exists public.event_companions(uuid);
create or replace function public.event_companions(p_event uuid)
returns table(member_id uuid, name text, photo_url text, shared_interests int, is_connection boolean, shared_background int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id, p.looking_for, p.skills, p.experience
      from public.profiles p
     where p.id = auth.uid() and auth.uid() is not null and public.brivia_member_completed(auth.uid())
       and exists (select 1 from public.event_rsvp r join public.club_event e on e.id = r.event_id
                    where r.event_id = p_event and r.member_id = auth.uid() and r.wants_companion and public.brivia_companion_status(r.status)
                      and e.is_published and e.cancelled_at is null and public.brivia_event_open(e.starts_at, e.ends_at)))
  select p.id, p.name, p.photo_url,
         (select count(*)::int from public.member_interest a join public.member_interest b on b.interest_id = a.interest_id
           where a.member_id = me.id and b.member_id = p.id) as si,
         exists (select 1 from public.matches m
                  where (m.user1_id = me.id and m.user2_id = p.id) or (m.user2_id = me.id and m.user1_id = p.id)),
         (select count(*)::int from (select lower(x) from unnest(me.looking_for || me.skills) x
                                     intersect select lower(y) from unnest(p.looking_for || p.skills) y) q) as sb
    from me
    join public.event_rsvp r on r.event_id = p_event and r.wants_companion and public.brivia_companion_status(r.status) and r.member_id <> me.id
    join public.profiles p on p.id = r.member_id
   where public.brivia_visible_to(me.id, r.member_id)
   order by si desc, sb desc, (p.experience is not null and p.experience = me.experience) desc, r.created_at, p.id
   limit 50
$$;
revoke all on function public.event_companions(uuid) from public, anon;
grant execute on function public.event_companions(uuid) to authenticated;

-- Find a Companion (0023) over the same pool: a member who showed interest, reserved or paid, and opted in.
create or replace function public.brivia_companion_eligible(p_event uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.event_rsvp r join public.club_event e on e.id = r.event_id
                  where r.event_id = p_event and r.member_id = p_member and r.wants_companion and public.brivia_companion_status(r.status)
                    and e.is_published and e.cancelled_at is null and public.brivia_event_open(e.starts_at, e.ends_at))
$$;
revoke all on function public.brivia_companion_eligible(uuid, uuid) from public, anon, authenticated;

create or replace function public.companion_events()
returns table(event_id uuid, title text, starts_at timestamptz, ends_at timestamptz, venue_name text, venue_area text,
              to_see int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where auth.uid() is not null and public.brivia_member_completed(auth.uid()))
  select e.id, e.title, e.starts_at, e.ends_at, e.venue_name, e.venue_area,
         (select count(*)::int from public.event_rsvp r
           where r.event_id = e.id and r.member_id <> me.id and r.wants_companion and public.brivia_companion_status(r.status)
             and public.brivia_visible_to(me.id, r.member_id)
             and not public.brivia_is_connection(me.id, r.member_id)
             and not exists (select 1 from public.event_companion_swipe s
                              where s.event_id = e.id and s.actor_id = me.id and s.target_id = r.member_id))
    from me join public.club_event e on public.brivia_companion_eligible(e.id, me.id)
   order by e.starts_at, e.id
   limit 50
$$;
revoke all on function public.companion_events() from public, anon;
grant execute on function public.companion_events() to authenticated;

create or replace function public.companion_deck(p_event uuid, p_limit int default 20)
returns table(member_id uuid, name text, photo_url text, cover_url text, headline text, looking_for text[],
              interests text[], shared_interests text[], distance_band text, shared_count int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.looking_for, p.skills, o.home_cell, o.place_id, pl.country
      from public.profiles p
      left join public.member_orbit o on o.member_id = p.id
      left join public.place pl on pl.id = o.place_id
     where p.id = auth.uid() and auth.uid() is not null and public.brivia_member_completed(auth.uid())
       and public.brivia_companion_eligible(p_event, auth.uid())),
  pool as (
    select p.id, p.name, p.photo_url, p.cover_url, p.experience, p.looking_for, p.skills, r.created_at as opted_at,
           o.home_cell, pl.name as place_name, pl.country
      from me
      join public.event_rsvp r on r.event_id = p_event and r.member_id <> me.id and r.wants_companion and public.brivia_companion_status(r.status)
      join public.profiles p on p.id = r.member_id
      left join public.member_orbit o on o.member_id = p.id
      left join public.place pl on pl.id = o.place_id
     where public.brivia_visible_to(me.id, p.id)
       and not public.brivia_is_connection(me.id, p.id)
       and not exists (select 1 from public.event_companion_swipe s
                        where s.event_id = p_event and s.actor_id = me.id and s.target_id = p.id)),
  scored as (
    select pool.*,
           (select coalesce(array_agg(x.label order by x.shared desc, x.points desc, x.label), '{}')
              from (select n.label, mi.points, exists (select 1 from public.member_interest a, me
                                                         where a.member_id = me.id and a.interest_id = mi.interest_id) as shared
                      from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
                     where mi.member_id = pool.id
                     order by 3 desc, mi.points desc, n.label limit 4) x) as interests,
           (select coalesce(array_agg(n.label order by n.label), '{}')
              from public.member_interest a join public.member_interest b on b.interest_id = a.interest_id
              join public.interest_node n on n.id = a.interest_id, me
             where a.member_id = me.id and b.member_id = pool.id) as shared,
           (select count(*)::int from (select lower(x) from me, unnest(me.looking_for || me.skills) x
                                       intersect select lower(y) from unnest(pool.looking_for || pool.skills) y) q) as background,
           case when pool.country is not null and (select country from me) is not null and pool.country <> (select country from me) then 'Abroad'
                when pool.home_cell is not null and (select home_cell from me) is not null
                     and public.brivia_ring(public.brivia_cell_km((select home_cell from me), pool.home_cell)) = 0 then '~3 km'
                when pool.home_cell is not null and (select home_cell from me) is not null
                     and public.brivia_ring(public.brivia_cell_km((select home_cell from me), pool.home_cell)) = 1 then '~10 km'
                else pool.place_name end as band
      from pool)
  select s.id, s.name, s.photo_url, s.cover_url, nullif(btrim(coalesce(s.experience, '')), ''), s.looking_for,
         s.interests, s.shared[1:4], s.band, cardinality(s.shared)
    from scored s
   order by cardinality(s.shared) desc, s.background desc, s.opted_at, s.id
   limit greatest(1, least(coalesce(p_limit, 20), 50))
$$;
revoke all on function public.companion_deck(uuid, int) from public, anon;
grant execute on function public.companion_deck(uuid, int) to authenticated;

-- set_event_interest(p_event, p_on, p_wants_companion) -> (interested, wants_companion, status).
--   p_on true: show interest in a paid event (no seat is held). A new interest takes p_wants_companion, else the
--     member's companion default. A member who already has a seat or a live hold keeps it (only the companion choice
--     changes); a lapsed hold becomes an interest.
--   p_on false: withdraw the interest (or a lapsed hold); a seat or a live hold is never removed here.
-- Only published, open, not cancelled paid events the caller can see, and not their own (22023 'invalid event');
-- a free event answers 22023 'free event'. A member who is not completed gets 42501.
create or replace function public.set_event_interest(p_event uuid, p_on boolean, p_wants_companion boolean default null)
returns table(interested boolean, wants_companion boolean, status text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_ev public.club_event%rowtype;
  v_row public.event_rsvp%rowtype;
  v_default boolean;
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  select * into v_ev from public.club_event e where e.id = p_event for update;
  if not found or not v_ev.is_published or v_ev.cancelled_at is not null
     or not public.brivia_event_open(v_ev.starts_at, v_ev.ends_at)
     or v_ev.creator_id is not distinct from uid
     or (v_ev.creator_id is not null and not public.brivia_visible_to(uid, v_ev.creator_id)) then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  if coalesce(v_ev.fee_inr, 0) <= 0 then
    raise exception 'free event' using errcode = '22023';
  end if;
  select * into v_row from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;

  if not coalesce(p_on, false) then
    if found and not public.brivia_rsvp_active(v_row.status, v_row.created_at) then
      delete from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
    end if;
  elsif not found then
    select coalesce((select p.companion_default from public.member_event_pref p where p.member_id = uid), false)
      into v_default;
    insert into public.event_rsvp (event_id, member_id, wants_companion, status, created_at)
    values (p_event, uid, coalesce(p_wants_companion, v_default), 'interested', now());
  else
    update public.event_rsvp r
       set status = case when public.brivia_rsvp_active(r.status, r.created_at) then r.status else 'interested' end,
           wants_companion = coalesce(p_wants_companion, r.wants_companion)
     where r.event_id = p_event and r.member_id = uid;
  end if;

  if not exists (select 1 from public.event_rsvp r where r.event_id = p_event and r.member_id = uid) then
    return query select false, false, null::text;
    return;
  end if;
  return query select true, r.wants_companion, r.status from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
end;
$$;
revoke all on function public.set_event_interest(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_event_interest(uuid, boolean, boolean) to authenticated;

-- set_event_brochure(p_id, p_url) -> the brochure URL now set (null when removed). The organiser only (42501 'not your
-- event'), never on a cancelled or ended event (22023 'invalid event'). p_url: a PDF in the organiser's own folder of
-- the event-brochures bucket (22023 'invalid brochure_url'); null or '' removes it. The client deletes the old file.
create or replace function public.set_event_brochure(p_id uuid, p_url text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_ev public.club_event%rowtype;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  select * into v_ev from public.club_event e where e.id = p_id for update;
  if not found or v_ev.creator_id is distinct from uid then
    raise exception 'not your event' using errcode = '42501';
  end if;
  if v_ev.cancelled_at is not null or (v_ev.starts_at is not null and not public.brivia_event_open(v_ev.starts_at, v_ev.ends_at)) then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  if v_url is not null and (char_length(v_url) > 400 or v_url !~* '\.pdf$'
                            or not public.brivia_is_storage_url(v_url, 'event-brochures', uid)) then
    raise exception 'invalid brochure_url' using errcode = '22023';
  end if;
  update public.club_event e set brochure_url = v_url, updated_at = now() where e.id = p_id;
  return v_url;
end;
$$;
revoke all on function public.set_event_brochure(uuid, text) from public, anon;
grant execute on function public.set_event_brochure(uuid, text) to authenticated;
