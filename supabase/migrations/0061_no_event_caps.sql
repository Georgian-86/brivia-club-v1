set lock_timeout = '5s';
-- 0061_no_event_caps.sql (D-204, founder 2026-11-05: "remove the 10 events listing limit"). Apply after 0060
-- (README "## 0061"), with the client deploy. 0001-0060 are frozen. Idempotent.
--   1. save_member_event (0058's) without the daily cap: a member may create any number of events (it was 10 per 24 h,
--      P0001 'event_limit', D-121). Everything else is unchanged.
--   2. list_events (0025's) without its 80-row cap and without its 60-day window: Explore lists every open event,
--      however far ahead it starts.

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
  v_end_date date;
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
  end if;   -- D-204: no daily cap on new events (was 10 per 24 h)

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
  begin v_end_date := nullif(f ->> 'end_date', '')::date; exception when others then raise exception 'invalid end_date' using errcode = '22023'; end;
  begin v_capacity := nullif(f ->> 'capacity', '')::int; exception when others then raise exception 'invalid capacity' using errcode = '22023'; end;
  begin v_fee := coalesce(nullif(f ->> 'fee_inr', '')::int, 0); exception when others then raise exception 'invalid fee_inr' using errcode = '22023'; end;
  if v_capacity is not null and (v_capacity < 1 or v_capacity > 5000) then raise exception 'invalid capacity' using errcode = '22023'; end if;
  if v_fee < 0 or v_fee > 100000 then raise exception 'invalid fee_inr' using errcode = '22023'; end if;
  if v_venue is not null and char_length(v_venue) > 120 then raise exception 'invalid venue_name' using errcode = '22023'; end if;
  if v_address is not null and char_length(v_address) > 240 then raise exception 'invalid venue_address' using errcode = '22023'; end if;
  if v_date is not null then
    -- D-197: an event may run over several days (end_date, default the start date) (D-200: no upper limit).
    -- D-198: the times are optional. No start time starts it at 00:00 IST; no end time ends it at 23:59 IST on its end
    -- day, except a timed one-day event, which stays open-ended (ends_at null, as before).
    v_end_date := coalesce(v_end_date, v_date);
    if v_end_date < v_date then raise exception 'invalid end_date' using errcode = '22023'; end if;
    v_starts := (v_date + coalesce(v_start, time '00:00')) at time zone 'Asia/Kolkata';
    if v_end is not null then
      v_ends := (v_end_date + v_end) at time zone 'Asia/Kolkata';
    elsif v_start is null or v_end_date > v_date then
      v_ends := (v_end_date + time '23:59') at time zone 'Asia/Kolkata';
    end if;
    if v_ends is not null and v_ends <= v_starts then raise exception 'invalid end_time' using errcode = '22023'; end if;
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
    -- D-198: the start may have passed (an event already under way); the event must not have ended.
    if not public.brivia_event_open(v_starts, v_ends) then
      raise exception '%', case when v_end_date > v_date then 'invalid end_date' else 'invalid date' end using errcode = '22023';
    end if;
    if v_venue is null then raise exception 'invalid venue_name' using errcode = '22023'; end if;
    if v_address is null then raise exception 'invalid venue_address' using errcode = '22023'; end if;
    if v_place is null then raise exception 'invalid place_id' using errcode = '22023'; end if;
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
         (e.is_published and public.brivia_event_open(e.starts_at, e.ends_at)   -- D-204: any start date (was the next 60 days)
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
   -- D-204: no row cap (was 80)
$$;
revoke all on function public.list_events(text) from public, anon;
grant execute on function public.list_events(text) to authenticated;
