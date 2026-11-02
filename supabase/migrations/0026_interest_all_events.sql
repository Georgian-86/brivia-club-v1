set lock_timeout = '5s';

-- 0026_interest_all_events.sql: "Show interest" on every event, free or paid (founder request 2026-11-02, D-126).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0025 (README "## 0026"). Idempotent.
--
-- 0025 allowed an interest only on paid events. The founder wants it on all events: on a free event an interest is
-- the same half registration (no seat, not going, counted as interested, in the companion pool), and Register turns
-- it into a confirmed seat (set_event_rsvp already upgrades the row: status = excluded.status). Nothing else changes.

-- set_event_interest(p_event, p_on, p_wants_companion) -> (interested, wants_companion, status): as 0025, for any
-- published, open, not cancelled event the caller can see and did not create (22023 'invalid event').
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
