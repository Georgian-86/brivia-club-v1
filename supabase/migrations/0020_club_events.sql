set lock_timeout = '5s';
-- 0020_club_events.sql: Explore becomes events near you (founder request 2026-11-01, D-117). "In the explore I want to
-- add nearby events and all", with the founder's mockup: event cards with a date, a distance, tags, a going count and
-- "Find a companion", and an event panel with "Looking for a companion?" and "See companions". The old Explore feed
-- (community posts) moves, unchanged, to its own Posts tab.
-- Applied by hand in the Supabase SQL editor, as postgres, after 0019 (see README.md "## 0020"). 0001-0019 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Location privacy (CLAUDE.md, spec §9.1.4): a venue is a public place, so it is stored as the g7 cell of its public
-- address (no coordinates are kept). A member's distance to it is computed from their home cell and returned rounded
-- to whole kilometres (never under 1), and only to members whose area came from their own location (precision 'cell');
-- a city pick ('place') gets no distance, only the venue's area. Nothing about one member's location reaches another.
--
-- Who sees whom (mutual consent, CLAUDE.md): going is private to the member. Others learn only counts, and names only
-- for the caller's CONNECTIONS (mutual matches) who are going. "Find a companion" is opt-in both ways: event_companions
-- lists only members who also opted in, and only to a caller who has opted in for that event. Listing someone is not a
-- connection: saying hi sends an ordinary signal (send_signal), which still needs the other member to agree.
--
-- What changes:
--   1. club_event: events the club curates (no member-created events yet). RLS on, no grants: read via list_events.
--   2. event_rsvp(event_id, member_id, wants_companion): "I'm going", and whether the member wants a companion.
--      RLS on, no grants. Deleted with the profile or the event.
--   3. member_event_pref(member_id, companion_default): the page's "Find a companion" switch. On: every event the
--      member goes to (now and later) is marked as wanting a companion. RLS on, no grants.
--   4. list_events(p_category), set_event_rsvp(p_event, p_going, p_wants_companion), set_companion_default(p_on),
--      my_event_prefs(), event_companions(p_event). All need a completed member (brivia_member_completed); counts and
--      names include only members the caller can see (brivia_visible_to: same world, no block, both completed).
--   5. Seed: eight Bengaluru (Whitefield) events, dated from the day this file is first applied, so they are
--      upcoming when it goes live. A re-run never adds or moves them (on conflict (slug) do nothing).

-- 1. Events -------------------------------------------------------------------------------------------------------------
create table if not exists public.club_event (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null,
  tags text[] not null default '{}',
  venue_name text not null,
  venue_area text not null,
  venue_cell text not null,
  place_id text references public.place(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  image_key text not null default '',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint club_event_title_len check (char_length(btrim(title)) between 1 and 80),
  constraint club_event_description_len check (char_length(description) <= 600),
  constraint club_event_category_check
    check (category in ('tech', 'music', 'sports', 'food', 'art', 'games', 'networking', 'culture')),
  constraint club_event_tags_len check (cardinality(tags) <= 4),
  constraint club_event_venue_cell_check check (venue_cell ~ '^g7:(0|[1-9][0-9]{0,5}):(0|[1-9][0-9]{0,5})$'),
  constraint club_event_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint club_event_image_key_check check (image_key ~ '^[a-z0-9-]{0,40}$')
);
create index if not exists club_event_starts_idx on public.club_event (starts_at) where is_published;
alter table public.club_event enable row level security;
revoke all on public.club_event from public, anon, authenticated;

-- An event is listed until it ends; an open-ended one ("till late") until 6 hours after it starts.
create or replace function public.brivia_event_open(p_starts timestamptz, p_ends timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_ends, p_starts + interval '6 hours') > now()
$$;
revoke all on function public.brivia_event_open(timestamptz, timestamptz) from public, anon, authenticated;

-- 2. RSVPs --------------------------------------------------------------------------------------------------------------
create table if not exists public.event_rsvp (
  event_id uuid not null references public.club_event(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  wants_companion boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists event_rsvp_member_idx on public.event_rsvp (member_id);
alter table public.event_rsvp enable row level security;
revoke all on public.event_rsvp from public, anon, authenticated;

-- 3. The page's "Find a companion" switch -------------------------------------------------------------------------------
create table if not exists public.member_event_pref (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  companion_default boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.member_event_pref enable row level security;
revoke all on public.member_event_pref from public, anon, authenticated;

-- 4. Functions ----------------------------------------------------------------------------------------------------------
-- list_events(p_category): upcoming published events (at most 60, starting within 60 days), nearest first by band
-- (within 15 km, then 60 km, then the rest or no distance), then soonest. p_category null or 'all' lists every category.
-- distance_km: whole km, at least 1; null without a home cell or for a city pick. friends: up to 3 of the caller's
-- connections who are going, as [{id, name, photo_url}]. Everyone else is only counted.
drop function if exists public.list_events(text);
create or replace function public.list_events(p_category text default null)
returns table(id uuid, title text, description text, category text, tags text[], venue_name text, venue_area text,
              starts_at timestamptz, ends_at timestamptz, image_key text, distance_km int, going_count int,
              companion_count int, going boolean, wants_companion boolean, friends jsonb)
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
           (select greatest(1, round(public.brivia_cell_km(h.home_cell, e.venue_cell)))::int from home h) as km
      from public.club_event e, me
     where e.is_published
       and public.brivia_event_open(e.starts_at, e.ends_at)
       and e.starts_at < now() + interval '60 days'
       and (p_category is null or lower(p_category) = 'all' or e.category = lower(p_category)))
  select ev.id, ev.title, ev.description, ev.category, ev.tags, ev.venue_name, ev.venue_area, ev.starts_at, ev.ends_at,
         ev.image_key, ev.km,
         (select count(*)::int from public.event_rsvp r, me
           where r.event_id = ev.id and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         (select count(*)::int from public.event_rsvp r, me
           where r.event_id = ev.id and r.wants_companion
             and (r.member_id = me.id or public.brivia_visible_to(me.id, r.member_id))),
         exists (select 1 from public.event_rsvp r, me where r.event_id = ev.id and r.member_id = me.id),
         coalesce((select r.wants_companion from public.event_rsvp r, me where r.event_id = ev.id and r.member_id = me.id), false),
         coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'photo_url', x.photo_url) order by x.created_at desc)
                     from (select p.id, p.name, p.photo_url, r.created_at
                             from public.event_rsvp r join public.profiles p on p.id = r.member_id, me
                            where r.event_id = ev.id and r.member_id in (select c.id from connections c)
                              and public.brivia_visible_to(me.id, r.member_id)
                            order by r.created_at desc limit 3) x), '[]'::jsonb)
    from ev
   order by case when ev.km is null then 2 when ev.km <= 15 then 0 when ev.km <= 60 then 1 else 2 end, ev.starts_at, ev.id
   limit 60
$$;
revoke all on function public.list_events(text) from public, anon;
grant execute on function public.list_events(text) to authenticated;

-- set_event_rsvp(p_event, p_going, p_wants_companion): going true adds or keeps the caller's RSVP; false removes it.
-- p_wants_companion null keeps the current value (a new RSVP takes the caller's companion_default). Turning
-- p_wants_companion on implies going. Only upcoming published events; a member who is not completed gets 42501.
drop function if exists public.set_event_rsvp(uuid, boolean, boolean);
create or replace function public.set_event_rsvp(p_event uuid, p_going boolean, p_wants_companion boolean default null)
returns table(going boolean, wants_companion boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_default boolean;
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.club_event e
                  where e.id = p_event and e.is_published and public.brivia_event_open(e.starts_at, e.ends_at)) then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  if not coalesce(p_going, false) and not coalesce(p_wants_companion, false) then
    delete from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
    return query select false, false;
    return;
  end if;
  select coalesce((select p.companion_default from public.member_event_pref p where p.member_id = uid), false)
    into v_default;
  insert into public.event_rsvp as r (event_id, member_id, wants_companion)
  values (p_event, uid, coalesce(p_wants_companion, v_default))
  on conflict (event_id, member_id) do update set wants_companion = coalesce(p_wants_companion, r.wants_companion);
  return query select true, r.wants_companion from public.event_rsvp r where r.event_id = p_event and r.member_id = uid;
end;
$$;
revoke all on function public.set_event_rsvp(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_event_rsvp(uuid, boolean, boolean) to authenticated;

-- set_companion_default(p_on): the page switch. Also applies to every upcoming event the caller is going to.
create or replace function public.set_companion_default(p_on boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_on boolean := coalesce(p_on, false);
begin
  if uid is null or not public.brivia_member_completed(uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  insert into public.member_event_pref (member_id, companion_default, updated_at) values (uid, v_on, now())
  on conflict (member_id) do update set companion_default = excluded.companion_default, updated_at = now();
  update public.event_rsvp r set wants_companion = v_on
    from public.club_event e
   where r.member_id = uid and e.id = r.event_id and public.brivia_event_open(e.starts_at, e.ends_at)
     and r.wants_companion is distinct from v_on;
  return v_on;
end;
$$;
revoke all on function public.set_companion_default(boolean) from public, anon;
grant execute on function public.set_companion_default(boolean) to authenticated;

create or replace function public.my_event_prefs()
returns table(companion_default boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.companion_default from public.member_event_pref p where p.member_id = auth.uid()), false)
   where auth.uid() is not null
$$;
revoke all on function public.my_event_prefs() from public, anon;
grant execute on function public.my_event_prefs() to authenticated;

-- event_companions(p_event): members going to the event who also want a companion, for a caller who is going and has
-- opted in too (otherwise no rows). Ordered by shared interests (ORBIT spec §11: exact interest overlap only, no
-- distance; everyone here is going to the same place), then who joined first. At most 50. is_connection marks a
-- member the caller is already matched with. No location, email or phone is returned.
drop function if exists public.event_companions(uuid);
create or replace function public.event_companions(p_event uuid)
returns table(member_id uuid, name text, photo_url text, shared_interests int, is_connection boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id
     where auth.uid() is not null and public.brivia_member_completed(auth.uid())
       and exists (select 1 from public.event_rsvp r join public.club_event e on e.id = r.event_id
                    where r.event_id = p_event and r.member_id = auth.uid() and r.wants_companion
                      and e.is_published and public.brivia_event_open(e.starts_at, e.ends_at)))
  select p.id, p.name, p.photo_url,
         (select count(*)::int from public.member_interest a join public.member_interest b on b.interest_id = a.interest_id
           where a.member_id = me.id and b.member_id = p.id),
         exists (select 1 from public.matches m
                  where (m.user1_id = me.id and m.user2_id = p.id) or (m.user2_id = me.id and m.user1_id = p.id))
    from me
    join public.event_rsvp r on r.event_id = p_event and r.wants_companion and r.member_id <> me.id
    join public.profiles p on p.id = r.member_id
   where public.brivia_visible_to(me.id, r.member_id)
   order by 4 desc, r.created_at, p.id
   limit 50
$$;
revoke all on function public.event_companions(uuid) from public, anon;
grant execute on function public.event_companions(uuid) to authenticated;

-- 5. Seed ---------------------------------------------------------------------------------------------------------------
-- Venue cells come from the venues' public addresses (approximate, Whitefield, Bengaluru). Dates are relative to the
-- first apply (IST evenings), so the events are upcoming when this file goes live; on conflict keeps a re-run still.
insert into public.club_event (slug, title, description, category, tags, venue_name, venue_area, venue_cell, place_id,
                               starts_at, ends_at, image_key)
select s.slug, s.title, s.description, s.category, s.tags, s.venue_name, s.venue_area,
       public.brivia_grid_cell(s.lat, s.lng, 7), 'in-bengaluru',
       ((current_date + s.day_offset) + s.start_time) at time zone 'Asia/Kolkata',
       case when s.hours is null then null
            else (((current_date + s.day_offset) + s.start_time) at time zone 'Asia/Kolkata') + s.hours end,
       s.image_key
  from (values
    ('acoustic-jam-session', 'Acoustic Jam Session',
     'An evening of music, conversations and new people. Bring your instrument or just your playlist energy. Good vibes, better company.',
     'music', array['Music', 'Networking', 'Chill'], 'The Whitefield Social', 'Whitefield, Bengaluru',
     12.9698, 77.7499, 1, time '18:00', interval '3 hours', 'jam'),
    ('tech-coffee-night', 'Tech & Coffee Night',
     'Builders, designers and the curious, over pour-overs. Show what you are making or come to listen.',
     'tech', array['Tech', 'Startups', 'Networking'], 'Third Wave Coffee', 'Whitefield, Bengaluru',
     12.9784, 77.7408, 2, time '17:00', interval '3 hours', 'tech'),
    ('blitz-chess-meetup', 'Blitz Chess Meetup',
     'Five-minute games, rotating boards and a friendly ladder. All levels welcome; boards provided.',
     'games', array['Games', 'Strategy', 'Community'], 'Battle Chess Skool', 'Whitefield, Bengaluru',
     12.9591, 77.7300, 3, time '10:00', interval '3 hours', 'chess'),
    ('dandiya-night', 'Dandiya Night',
     'Sticks, music and a courtyard full of people. First-timers get a five-minute crash course.',
     'culture', array['Culture', 'Dance', 'Social'], 'The Courtyard', 'Whitefield, Bengaluru',
     12.9850, 77.7280, 4, time '19:00', null, 'dandiya'),
    ('badminton-and-chill', 'Badminton & Chill',
     'Doubles on rotation, then cold drinks courtside. Rackets available if you need one.',
     'sports', array['Sports', 'Fitness', 'Community'], 'Play Arena', 'Whitefield, Bengaluru',
     12.9520, 77.7010, 6, time '18:00', interval '3 hours', 'badminton'),
    ('food-explorers-club', 'Food Explorers Club',
     'A shared table and a tasting menu from the city''s kitchens. Come hungry, leave with new people.',
     'food', array['Food', 'Exploration', 'Social'], 'Bengaluru Kitchen Club', 'Whitefield, Bengaluru',
     12.9960, 77.7590, 9, time '19:00', interval '3 hours', 'food'),
    ('vinyl-and-conversation', 'Vinyl & Conversation',
     'Bring a record that changed you. We play one side each and talk about why.',
     'music', array['Music', 'Culture', 'Chill'], 'Slow Rooms', 'Indiranagar, Bengaluru',
     12.9719, 77.6412, 11, time '19:30', interval '2 hours 30 minutes', 'vinyl'),
    ('sunset-photo-walk', 'Sunset Photo Walk',
     'A slow walk at golden hour with cameras or phones. We share our three best frames at the end.',
     'art', array['Art', 'Photography', 'Outdoors'], 'Varthur Lake Promenade', 'Varthur, Bengaluru',
     12.9406, 77.7470, 13, time '17:00', interval '2 hours', 'photo')
  ) as s(slug, title, description, category, tags, venue_name, venue_area, lat, lng, day_offset, start_time, hours, image_key)
on conflict (slug) do nothing;
