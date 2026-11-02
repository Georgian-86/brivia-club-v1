set lock_timeout = '5s';
-- 0022_member_events.sql: members create their own events (founder request 2026-11-02, D-121). "Create Event": a member
-- names an event, picks a category, writes a description, sets the date, start and end time, the venue (name, address,
-- city, an optional map link or a pin from where they are), a capacity, Free or Paid (INR), an optional contact, a
-- poster and an optional gallery; saves it as a draft or publishes it. Published events join Explore beside the club's
-- own (0020), with registration, capacity and "Find a companion".
-- Applied by hand in the Supabase SQL editor, as postgres, after 0021 (see README.md "## 0022"). Needs 0020.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Location privacy (CLAUDE.md, spec §9.1.4, §11): a venue is a public place. Its cell is the g7 cell of the picked city
-- centre, or of a pin the organiser drops while at the venue; the pin's coordinates are turned into the cell inside
-- save_member_event and never stored. Members still get only "~N km".
--
-- Who sees what:
--   * A draft is seen only by its creator. A published event is listed to members who can see its creator
--     (brivia_visible_to: same world, no block, both completed). A cancelled event stays listed to its creator and to
--     the members registered for it (marked cancelled), until it ends.
--   * The organiser sees counts (registered, spots left, looking for a companion), never who wants a companion: there
--     is no function that lists registrants or companion choices to the organiser.
--   * Contact: the organiser types it for this event (never the account email or phone). It reaches other members only
--     when the organiser ticks "Show on the event page" (contact_public). Otherwise only the organiser reads it back.
--
-- Registration (server-side rules):
--   * Capacity is checked under a row lock on the event, so two members can never take the last seat.
--   * Free event: the registration is 'confirmed'. Paid event: it is 'pending_payment' (a 30-minute hold that counts
--     toward capacity) and becomes 'confirmed' only through confirm_event_payment, which no member can call: it is
--     for the payment provider's webhook (service_role), owed with the gateway choice (D-121).
--   * One registration per member per event (primary key); registering again changes nothing. Cancelling deletes it.
--   * Companion opt-in is a separate choice on the registration: it needs a registration, and companions are listed
--     only among confirmed registrations that opted in, for a confirmed caller who opted in (§11).
--
-- What changes:
--   1. club_event gains creator_id, venue_address, map_url, image_url, gallery_urls, capacity, fee_inr, the contact
--      fields, cancelled_at, published_at, updated_at; drafts may leave venue, category and time empty (a published
--      row must be complete); the category list grows to the fourteen of the create form, and "Other" carries the
--      organiser's own name for it (custom_category); descriptions up to 2000.
--   2. event_rsvp gains status ('confirmed' | 'pending_payment'), paid_at and payment_ref.
--   3. Storage bucket event-posters (public, 10 MB, JPEG/PNG/WebP, owner folder only), like community-posts.
--   4. list_events (more columns), set_event_rsvp (capacity, paid holds, companion needs a registration),
--      event_companions (confirmed only, background as a tie-break), new save_member_event, cancel_member_event,
--      delete_member_event (authenticated) and confirm_event_payment (service_role only).

-- 1. Events ------------------------------------------------------------------------------------------------------------
alter table public.club_event add column if not exists creator_id uuid references public.profiles(id) on delete cascade;
alter table public.club_event add column if not exists venue_address text;
alter table public.club_event add column if not exists map_url text;
alter table public.club_event add column if not exists image_url text;
alter table public.club_event add column if not exists gallery_urls text[] not null default '{}';
alter table public.club_event add column if not exists capacity int;
alter table public.club_event add column if not exists fee_inr int not null default 0;
alter table public.club_event add column if not exists contact_email text;
alter table public.club_event add column if not exists contact_phone text;
alter table public.club_event add column if not exists contact_link text;
alter table public.club_event add column if not exists contact_public boolean not null default false;
alter table public.club_event add column if not exists cancelled_at timestamptz;
alter table public.club_event add column if not exists published_at timestamptz;
alter table public.club_event add column if not exists updated_at timestamptz not null default now();
create index if not exists club_event_creator_idx on public.club_event (creator_id) where creator_id is not null;

alter table public.club_event alter column category drop not null;
alter table public.club_event alter column venue_name drop not null;
alter table public.club_event alter column venue_area drop not null;
alter table public.club_event alter column venue_cell drop not null;
alter table public.club_event alter column starts_at drop not null;

alter table public.club_event drop constraint if exists club_event_category_check;
alter table public.club_event add constraint club_event_category_check
  check (category is null or category in ('tech', 'startups', 'networking', 'music', 'sports', 'games', 'food', 'art',
                                          'culture', 'wellness', 'outdoors', 'education', 'workshops', 'community', 'other'));
-- "Other": the organiser names the category themselves (shown instead of "Other"); only with category 'other'.
alter table public.club_event add column if not exists custom_category text;
alter table public.club_event drop constraint if exists club_event_custom_category_check;
alter table public.club_event add constraint club_event_custom_category_check
  check (custom_category is null or (category = 'other' and char_length(custom_category) between 2 and 24
                                     and custom_category ~ '^[[:alnum:]][[:alnum:] &''/+-]*$'));
alter table public.club_event drop constraint if exists club_event_description_len;
alter table public.club_event add constraint club_event_description_len check (char_length(description) <= 2000);
alter table public.club_event drop constraint if exists club_event_published_complete;
alter table public.club_event add constraint club_event_published_complete
  check (not is_published or (category is not null and venue_name is not null and venue_area is not null
                              and venue_cell is not null and starts_at is not null));
alter table public.club_event drop constraint if exists club_event_text_lengths;
alter table public.club_event add constraint club_event_text_lengths
  check (coalesce(char_length(venue_name), 0) <= 120 and coalesce(char_length(venue_address), 0) <= 240
         and coalesce(char_length(venue_area), 0) <= 120);
alter table public.club_event drop constraint if exists club_event_capacity_check;
alter table public.club_event add constraint club_event_capacity_check check (capacity is null or capacity between 1 and 5000);
alter table public.club_event drop constraint if exists club_event_fee_check;
alter table public.club_event add constraint club_event_fee_check check (fee_inr between 0 and 100000);
-- A member's event always has a capacity once published (the club's own may be open).
alter table public.club_event drop constraint if exists club_event_member_capacity;
alter table public.club_event add constraint club_event_member_capacity
  check (creator_id is null or not is_published or capacity is not null);
-- Images: the creator's own event-posters files (0003's storage-URL shape); at most 6 gallery images.
alter table public.club_event drop constraint if exists club_event_image_url_check;
alter table public.club_event add constraint club_event_image_url_check
  check (image_url is null or (creator_id is not null and public.brivia_is_storage_url(image_url, 'event-posters', creator_id)));
create or replace function public.brivia_event_gallery_ok(p_urls text[], p_owner uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select cardinality(coalesce(p_urls, '{}')) <= 6
     and (cardinality(coalesce(p_urls, '{}')) = 0
          or (p_owner is not null
              and not exists (select 1 from unnest(p_urls) u where not public.brivia_is_storage_url(u, 'event-posters', p_owner))))
$$;
revoke all on function public.brivia_event_gallery_ok(text[], uuid) from public, anon, authenticated;
alter table public.club_event drop constraint if exists club_event_gallery_check;
alter table public.club_event add constraint club_event_gallery_check check (public.brivia_event_gallery_ok(gallery_urls, creator_id));
-- Map links: only the well-known map sites, https, no quotes or spaces (rendered as a link, never fetched).
alter table public.club_event drop constraint if exists club_event_map_url_check;
alter table public.club_event add constraint club_event_map_url_check
  check (map_url is null or (char_length(map_url) <= 300 and map_url !~ '["''<>\s\\]'
    and map_url ~ '^https://((www\.)?google\.[a-z.]{2,8}/maps|maps\.google\.[a-z.]{2,8}/|maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.apple\.com/|(www\.)?openstreetmap\.org/)'));
alter table public.club_event drop constraint if exists club_event_contact_check;
alter table public.club_event add constraint club_event_contact_check
  check ((contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s<>"'']+@[^@\s<>"'']+\.[^@\s<>"'']+$'))
     and (contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$')
     and (contact_link is null or (char_length(contact_link) <= 300 and contact_link ~ '^https://[^\s"''<>\\]+$')));

-- 2. Registrations ----------------------------------------------------------------------------------------------------
alter table public.event_rsvp add column if not exists status text not null default 'confirmed';
alter table public.event_rsvp add column if not exists paid_at timestamptz;
alter table public.event_rsvp add column if not exists payment_ref text;
alter table public.event_rsvp drop constraint if exists event_rsvp_status_check;
alter table public.event_rsvp add constraint event_rsvp_status_check check (status in ('confirmed', 'pending_payment'));
alter table public.event_rsvp drop constraint if exists event_rsvp_payment_ref_len;
alter table public.event_rsvp add constraint event_rsvp_payment_ref_len check (payment_ref is null or char_length(payment_ref) <= 120);

-- A registration holds a seat while it is confirmed, or pending payment for under 30 minutes.
create or replace function public.brivia_rsvp_active(p_status text, p_created timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'confirmed' or (p_status = 'pending_payment' and p_created > now() - interval '30 minutes')
$$;
revoke all on function public.brivia_rsvp_active(text, timestamptz) from public, anon, authenticated;

create or replace function public.brivia_event_seats_taken(p_event uuid)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from public.event_rsvp r where r.event_id = p_event and public.brivia_rsvp_active(r.status, r.created_at)
$$;
revoke all on function public.brivia_event_seats_taken(uuid) from public, anon, authenticated;

-- 3. Poster storage ---------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('event-posters', 'event-posters', true) on conflict (id) do nothing;
update storage.buckets set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'event-posters';
drop policy if exists "Members can upload event posters" on storage.objects;
create policy "Members can upload event posters"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-posters' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can view their own event posters" on storage.objects;
create policy "Members can view their own event posters"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-posters' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Members can delete their event posters" on storage.objects;
create policy "Members can delete their event posters"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-posters' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- 4. Functions --------------------------------------------------------------------------------------------------------
-- list_events(p_category): as 0020 (band, then soonest; at most 80; within 60 days), plus member events:
--   published ones whose creator the caller can see; every not-yet-ended event the caller created (drafts too, a
--   draft without a date last); cancelled ones the caller is registered for. status: 'published' | 'draft' |
--   'cancelled'. registered_count: seats taken (everyone, so spots are right); going_count stays the visible count.
--   my_status: the caller's registration ('confirmed' | 'pending_payment' | 'expired') or null. contact: for the
--   organiser always, for others only when contact_public. organizer: {id, name, photo_url}, null for the club's own.
drop function if exists public.list_events(text);
create or replace function public.list_events(p_category text default null)
returns table(id uuid, title text, description text, category text, tags text[], venue_name text, venue_area text,
              starts_at timestamptz, ends_at timestamptz, image_key text, distance_km int, going_count int,
              companion_count int, going boolean, wants_companion boolean, friends jsonb,
              status text, is_mine boolean, organizer jsonb, image_url text, gallery_urls text[], venue_address text,
              map_url text, place_id text, capacity int, registered_count int, fee_inr int, my_status text, contact jsonb,
              custom_category text)
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
           (select r.status || case when public.brivia_rsvp_active(r.status, r.created_at) then '' else ':expired' end
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
           where r.event_id = ev.id and r.wants_companion and r.status = 'confirmed'
             and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         coalesce(ev.rsvp in ('confirmed', 'pending_payment'), false),
         coalesce((select r.wants_companion from public.event_rsvp r, me
                    where r.event_id = ev.id and r.member_id = me.id and public.brivia_rsvp_active(r.status, r.created_at)), false),
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
         ev.custom_category
    from ev
   order by case when ev.starts_at is null then 3 when ev.km is null then 2 when ev.km <= 15 then 0 when ev.km <= 60 then 1 else 2 end,
            ev.starts_at nulls last, ev.id
   limit 80
$$;
revoke all on function public.list_events(text) from public, anon;
grant execute on function public.list_events(text) to authenticated;

-- set_event_rsvp(p_event, p_going, p_wants_companion) -> (going, wants_companion, status).
--   p_going true: register (or keep the registration). A new one takes the companion default; a paid event's is a
--     30-minute 'pending_payment' hold (the organiser's own is confirmed); an expired hold is renewed. Refused with
--     'event_full' (P0001) when no seat is left.
--   p_going false: cancel the registration (and with it the companion choice).
--   p_wants_companion true/false: the companion choice; it needs a registration ('register first', 22023).
-- Only published, open, not cancelled events (22023); a member who is not completed gets 42501.
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
      set created_at = now(), wants_companion = coalesce(p_wants_companion, r.wants_companion);
    v_active := true;
  elsif p_wants_companion is not null then
    if not v_active then raise exception 'register first' using errcode = '22023'; end if;
    update public.event_rsvp r set wants_companion = p_wants_companion where r.event_id = p_event and r.member_id = uid;
  end if;

  return query select true, r.wants_companion, r.status from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
end;
$$;
revoke all on function public.set_event_rsvp(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_event_rsvp(uuid, boolean, boolean) to authenticated;

-- event_companions(p_event): as 0020, but only confirmed registrations (a paid seat counts once paid), for a confirmed
-- caller who opted in. Order (§11): exact shared interests, then shared goals and skills (looking_for and skills in
-- common), then the same experience band, then who joined first. No location, email or phone is returned.
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
                    where r.event_id = p_event and r.member_id = auth.uid() and r.wants_companion and r.status = 'confirmed'
                      and e.is_published and e.cancelled_at is null and public.brivia_event_open(e.starts_at, e.ends_at)))
  select p.id, p.name, p.photo_url,
         (select count(*)::int from public.member_interest a join public.member_interest b on b.interest_id = a.interest_id
           where a.member_id = me.id and b.member_id = p.id) as si,
         exists (select 1 from public.matches m
                  where (m.user1_id = me.id and m.user2_id = p.id) or (m.user2_id = me.id and m.user1_id = p.id)),
         (select count(*)::int from (select lower(x) from unnest(me.looking_for || me.skills) x
                                     intersect select lower(y) from unnest(p.looking_for || p.skills) y) q) as sb
    from me
    join public.event_rsvp r on r.event_id = p_event and r.wants_companion and r.status = 'confirmed' and r.member_id <> me.id
    join public.profiles p on p.id = r.member_id
   where public.brivia_visible_to(me.id, r.member_id)
   order by si desc, sb desc, (p.experience is not null and p.experience = me.experience) desc, r.created_at, p.id
   limit 50
$$;
revoke all on function public.event_companions(uuid) from public, anon;
grant execute on function public.event_companions(uuid) to authenticated;

-- save_member_event(p_id, p_fields, p_publish) -> the event id. p_id null creates; otherwise only the creator may edit
-- (42501), never a cancelled or ended event (22023). p_fields (jsonb): title, category, description, date
-- (YYYY-MM-DD), start_time, end_time (HH:MM, IST), custom_category (with 'other': the organiser's own name), venue_name, venue_address, place_id, pin {lat, lng} (optional,
-- turned into the g7 cell and dropped), map_url, capacity, fee_inr, contact_email, contact_phone, contact_link,
-- contact_public, image_url, gallery_urls. A draft needs only a title; publishing needs every mandatory field and a
-- start in the future. A published event cannot go back to draft. With registrations, the capacity cannot drop under
-- the seats taken and the fee cannot change. At most 10 new events per member per 24 hours (P0001 'event_limit').
-- Errors name the field: 22023 'invalid <field>'.
create or replace function public.save_member_event(p_id uuid, p_fields jsonb, p_publish boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_old public.club_event%rowtype;
  v_id uuid;
  v_title text := nullif(btrim(coalesce(f ->> 'title', '')), '');
  v_category text := nullif(lower(btrim(coalesce(f ->> 'category', ''))), '');
  v_custom text := nullif(regexp_replace(btrim(coalesce(f ->> 'custom_category', '')), '\s+', ' ', 'g'), '');
  v_description text := btrim(coalesce(f ->> 'description', ''));
  v_venue text := nullif(btrim(coalesce(f ->> 'venue_name', '')), '');
  v_address text := nullif(btrim(coalesce(f ->> 'venue_address', '')), '');
  v_place text := nullif(btrim(coalesce(f ->> 'place_id', '')), '');
  v_map text := nullif(btrim(coalesce(f ->> 'map_url', '')), '');
  v_email text := nullif(btrim(coalesce(f ->> 'contact_email', '')), '');
  v_phone text := nullif(btrim(coalesce(f ->> 'contact_phone', '')), '');
  v_link text := nullif(btrim(coalesce(f ->> 'contact_link', '')), '');
  v_contact_public boolean := coalesce(f ->> 'contact_public', '') in ('true', 't');
  v_image text := nullif(btrim(coalesce(f ->> 'image_url', '')), '');
  v_gallery text[];
  v_date date;
  v_start time;
  v_end time;
  v_starts timestamptz;
  v_ends timestamptz;
  v_capacity int;
  v_fee int;
  v_area text;
  v_cell text;
  v_lat double precision;
  v_lng double precision;
  v_publish boolean := coalesce(p_publish, false);
  v_taken int := 0;
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if p_id is not null then
    select * into v_old from public.club_event e where e.id = p_id for update;
    if not found or v_old.creator_id is distinct from uid then
      raise exception 'not your event' using errcode = '42501';
    end if;
    if v_old.cancelled_at is not null or (v_old.starts_at is not null and not public.brivia_event_open(v_old.starts_at, v_old.ends_at)) then
      raise exception 'invalid event' using errcode = '22023';
    end if;
    if v_old.is_published and not v_publish then
      raise exception 'invalid publish' using errcode = '22023';
    end if;
    v_taken := public.brivia_event_seats_taken(p_id);
  elsif (select count(*) from public.club_event e where e.creator_id = uid and e.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'event_limit' using errcode = 'P0001';
  end if;

  -- Parse (a malformed value is the field's error, never a 500).
  if v_title is null or char_length(v_title) > 80 then raise exception 'invalid title' using errcode = '22023'; end if;
  if v_category is not null and v_category not in ('tech', 'startups', 'networking', 'music', 'sports', 'games', 'food',
                                                   'art', 'wellness', 'outdoors', 'education', 'workshops', 'community', 'other') then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  if v_category is distinct from 'other' then v_custom := null; end if;
  if v_custom is not null and (char_length(v_custom) not between 2 and 24 or v_custom !~ '^[[:alnum:]][[:alnum:] &''/+-]*$') then
    raise exception 'invalid custom_category' using errcode = '22023';
  end if;
  if char_length(v_description) > 2000 then raise exception 'invalid description' using errcode = '22023'; end if;
  begin v_date := nullif(f ->> 'date', '')::date; exception when others then raise exception 'invalid date' using errcode = '22023'; end;
  begin v_start := nullif(f ->> 'start_time', '')::time; exception when others then raise exception 'invalid start_time' using errcode = '22023'; end;
  begin v_end := nullif(f ->> 'end_time', '')::time; exception when others then raise exception 'invalid end_time' using errcode = '22023'; end;
  begin v_capacity := nullif(f ->> 'capacity', '')::int; exception when others then raise exception 'invalid capacity' using errcode = '22023'; end;
  begin v_fee := coalesce(nullif(f ->> 'fee_inr', '')::int, 0); exception when others then raise exception 'invalid fee_inr' using errcode = '22023'; end;
  if v_capacity is not null and (v_capacity < 1 or v_capacity > 5000) then raise exception 'invalid capacity' using errcode = '22023'; end if;
  if v_fee < 0 or v_fee > 100000 then raise exception 'invalid fee_inr' using errcode = '22023'; end if;
  if v_venue is not null and char_length(v_venue) > 120 then raise exception 'invalid venue_name' using errcode = '22023'; end if;
  if v_address is not null and char_length(v_address) > 240 then raise exception 'invalid venue_address' using errcode = '22023'; end if;
  if v_date is not null and v_start is not null then
    v_starts := (v_date + v_start) at time zone 'Asia/Kolkata';
    if v_end is not null then
      if v_end <= v_start then raise exception 'invalid end_time' using errcode = '22023'; end if;
      v_ends := (v_date + v_end) at time zone 'Asia/Kolkata';
    end if;
  end if;
  if v_place is not null then
    select p.name into v_area from public.place p where p.id = v_place;
    if v_area is null then raise exception 'invalid place_id' using errcode = '22023'; end if;
    if jsonb_typeof(f -> 'pin') = 'object' then
      begin
        v_lat := (f -> 'pin' ->> 'lat')::double precision;
        v_lng := (f -> 'pin' ->> 'lng')::double precision;
      exception when others then raise exception 'invalid pin' using errcode = '22023';
      end;
      if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        raise exception 'invalid pin' using errcode = '22023';
      end if;
      v_cell := public.brivia_grid_cell(v_lat, v_lng, 7);
    elsif p_id is not null and v_old.place_id is not distinct from v_place and v_old.venue_cell is not null then
      v_cell := v_old.venue_cell;   -- an edit keeps an earlier pin while the city is unchanged
    else
      select public.brivia_grid_cell(p.lat, p.lng, 7) into v_cell from public.place p where p.id = v_place;
    end if;
  end if;
  if v_map is not null and (char_length(v_map) > 300 or v_map ~ '["''<>\s\\]' or v_map !~
      '^https://((www\.)?google\.[a-z.]{2,8}/maps|maps\.google\.[a-z.]{2,8}/|maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.apple\.com/|(www\.)?openstreetmap\.org/)') then
    raise exception 'invalid map_url' using errcode = '22023';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s<>"'']+@[^@\s<>"'']+\.[^@\s<>"'']+$') then
    raise exception 'invalid contact_email' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{6,19}$' then raise exception 'invalid contact_phone' using errcode = '22023'; end if;
  if v_link is not null and (char_length(v_link) > 300 or v_link !~ '^https://[^\s"''<>\\]+$') then
    raise exception 'invalid contact_link' using errcode = '22023';
  end if;
  if v_image is not null and not public.brivia_is_storage_url(v_image, 'event-posters', uid) then
    raise exception 'invalid image_url' using errcode = '22023';
  end if;
  if jsonb_typeof(f -> 'gallery_urls') = 'array' then
    select coalesce(array_agg(x), '{}') into v_gallery from jsonb_array_elements_text(f -> 'gallery_urls') x;
  else
    v_gallery := '{}';
  end if;
  if not public.brivia_event_gallery_ok(v_gallery, uid) then raise exception 'invalid gallery_urls' using errcode = '22023'; end if;

  if v_publish then
    if v_category is null then raise exception 'invalid category' using errcode = '22023'; end if;
    if v_category = 'other' and v_custom is null then raise exception 'invalid custom_category' using errcode = '22023'; end if;
    if char_length(v_description) < 20 then raise exception 'invalid description' using errcode = '22023'; end if;
    if v_date is null then raise exception 'invalid date' using errcode = '22023'; end if;
    if v_start is null then raise exception 'invalid start_time' using errcode = '22023'; end if;
    if v_end is null then raise exception 'invalid end_time' using errcode = '22023'; end if;
    -- A new start must be in the future; an edit of a published event may keep its (already passed) start time.
    if v_starts <= now() and (p_id is null or not v_old.is_published or v_starts is distinct from v_old.starts_at) then
      raise exception 'invalid date' using errcode = '22023';
    end if;
    if v_venue is null then raise exception 'invalid venue_name' using errcode = '22023'; end if;
    if v_address is null then raise exception 'invalid venue_address' using errcode = '22023'; end if;
    if v_place is null then raise exception 'invalid place_id' using errcode = '22023'; end if;
    if v_capacity is null then raise exception 'invalid capacity' using errcode = '22023'; end if;
    if v_contact_public and v_email is null and v_phone is null and v_link is null then
      raise exception 'invalid contact_public' using errcode = '22023';
    end if;
  end if;
  if p_id is not null and v_taken > 0 then
    if v_capacity is not null and v_capacity < v_taken then raise exception 'invalid capacity' using errcode = '22023'; end if;
    if v_fee is distinct from v_old.fee_inr then raise exception 'invalid fee_inr' using errcode = '22023'; end if;
  end if;

  if p_id is null then
    v_id := gen_random_uuid();
    insert into public.club_event (id, slug, title, description, category, tags, venue_name, venue_area, venue_cell,
                                   place_id, starts_at, ends_at, image_key, is_published, creator_id, venue_address,
                                   map_url, image_url, gallery_urls, capacity, fee_inr, contact_email, contact_phone,
                                   contact_link, contact_public, published_at, updated_at, custom_category)
    values (v_id, 'm-' || v_id::text, v_title, v_description, v_category, '{}', v_venue, v_area, v_cell, v_place,
            v_starts, v_ends, '', v_publish, uid, v_address, v_map, v_image, v_gallery, v_capacity, v_fee, v_email,
            v_phone, v_link, v_contact_public, case when v_publish then now() end, now(), v_custom);
  else
    v_id := p_id;
    update public.club_event e
       set title = v_title, description = v_description, category = v_category, custom_category = v_custom, venue_name = v_venue,
           venue_area = v_area, venue_cell = v_cell, place_id = v_place, starts_at = v_starts, ends_at = v_ends,
           is_published = v_publish, venue_address = v_address, map_url = v_map, image_url = v_image,
           gallery_urls = v_gallery, capacity = v_capacity, fee_inr = v_fee, contact_email = v_email,
           contact_phone = v_phone, contact_link = v_link, contact_public = v_contact_public,
           published_at = coalesce(e.published_at, case when v_publish then now() end), updated_at = now()
     where e.id = p_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_member_event(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_member_event(uuid, jsonb, boolean) to authenticated;

-- cancel_member_event(p_id): the creator cancels a published event. It leaves the listing for everyone except the
-- creator and the members registered for it, who see it marked cancelled. Registrations are kept (so they see it).
create or replace function public.cancel_member_event(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  update public.club_event e set is_published = false, cancelled_at = coalesce(e.cancelled_at, now()), updated_at = now()
   where e.id = p_id and e.creator_id = uid and e.is_published;
  if not found then
    if exists (select 1 from public.club_event e where e.id = p_id and e.creator_id = uid and e.cancelled_at is not null) then
      return true;
    end if;
    raise exception 'not your event' using errcode = '42501';
  end if;
  return true;
end;
$$;
revoke all on function public.cancel_member_event(uuid) from public, anon;
grant execute on function public.cancel_member_event(uuid) to authenticated;

-- delete_member_event(p_id): the creator deletes a draft or a cancelled event (a published one is cancelled first, so
-- the members registered are told). Registrations go with it. The client then removes the poster files.
create or replace function public.delete_member_event(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if exists (select 1 from public.club_event e where e.id = p_id and e.creator_id = uid and e.is_published) then
    raise exception 'cancel first' using errcode = '22023';
  end if;
  delete from public.club_event e where e.id = p_id and e.creator_id = uid and not e.is_published;
  if not found then raise exception 'not your event' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.delete_member_event(uuid) from public, anon;
grant execute on function public.delete_member_event(uuid) to authenticated;

-- confirm_event_payment(p_event, p_member, p_ref): turns a pending hold (or an expired one, if a seat is still free)
-- into a confirmed registration once the payment provider reports success. Never callable by a member.
create or replace function public.confirm_event_payment(p_event uuid, p_member uuid, p_ref text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ev public.club_event%rowtype;
  v_row public.event_rsvp%rowtype;
begin
  select * into v_ev from public.club_event e where e.id = p_event for update;
  if not found then raise exception 'invalid event' using errcode = '22023'; end if;
  select * into v_row from public.event_rsvp r where r.event_id = p_event and r.member_id = p_member;
  if not found then raise exception 'no registration' using errcode = '22023'; end if;
  if v_row.status = 'confirmed' then return 'confirmed'; end if;
  if not public.brivia_rsvp_active(v_row.status, v_row.created_at) and v_ev.capacity is not null
     and public.brivia_event_seats_taken(p_event) >= v_ev.capacity then
    return 'full';   -- the hold expired and the seat was taken: the provider refunds
  end if;
  update public.event_rsvp r set status = 'confirmed', paid_at = now(), payment_ref = left(p_ref, 120)
   where r.event_id = p_event and r.member_id = p_member;
  return 'confirmed';
end;
$$;
revoke all on function public.confirm_event_payment(uuid, uuid, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.confirm_event_payment(uuid, uuid, text) to service_role';
  end if;
end $$;
