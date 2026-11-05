set lock_timeout = '5s';
-- 0056_multi_day_events.sql: an event may run over several days (founder request 2026-11-05, D-197: "the event can take
-- more days as well"). Apply after 0022 (README "## 0056"). 0001-0055 are frozen. Idempotent.
--
-- save_member_event (0022) is redefined with one change: p_fields may carry end_date (YYYY-MM-DD). Absent or empty, the
-- event ends on its start date, exactly as before (an older client keeps working). The end date may not be before the
-- start date or more than 30 days after it, and the end (date + time, IST) must come after the start ('invalid
-- end_time'). club_event already stores ends_at as a full timestamp and its open/listing rules use it, so nothing else
-- changes. Grants as 0022.

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
  begin v_end_date := nullif(f ->> 'end_date', '')::date; exception when others then raise exception 'invalid end_date' using errcode = '22023'; end;
  begin v_capacity := nullif(f ->> 'capacity', '')::int; exception when others then raise exception 'invalid capacity' using errcode = '22023'; end;
  begin v_fee := coalesce(nullif(f ->> 'fee_inr', '')::int, 0); exception when others then raise exception 'invalid fee_inr' using errcode = '22023'; end;
  if v_capacity is not null and (v_capacity < 1 or v_capacity > 5000) then raise exception 'invalid capacity' using errcode = '22023'; end if;
  if v_fee < 0 or v_fee > 100000 then raise exception 'invalid fee_inr' using errcode = '22023'; end if;
  if v_venue is not null and char_length(v_venue) > 120 then raise exception 'invalid venue_name' using errcode = '22023'; end if;
  if v_address is not null and char_length(v_address) > 240 then raise exception 'invalid venue_address' using errcode = '22023'; end if;
  if v_date is not null and v_start is not null then
    v_starts := (v_date + v_start) at time zone 'Asia/Kolkata';
    if v_end is not null then
      -- D-197: an event may run over several days (end_date, default the start date), at most 30 days after it starts.
      v_end_date := coalesce(v_end_date, v_date);
      if v_end_date < v_date or v_end_date > v_date + 30 then raise exception 'invalid end_date' using errcode = '22023'; end if;
      v_ends := (v_end_date + v_end) at time zone 'Asia/Kolkata';
      if v_ends <= v_starts then raise exception 'invalid end_time' using errcode = '22023'; end if;
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
