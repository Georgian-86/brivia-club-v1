set lock_timeout = '5s';
-- 0060_event_registration_notifications.sql (D-203, founder 2026-11-05: "when someone registers in user's event, the
-- user may get a notification"). Apply after 0059 (README "## 0060"), then deploy push-notify and the client.
-- 0001-0059 are frozen. Idempotent.
--
--   1. member_notification gains event_id and the type 'event_registered'. A trigger on event_rsvp writes one for the
--      event's organiser when a registration becomes confirmed (a free seat at once; a paid one when the payment is
--      confirmed; a held, unpaid seat never), never for the organiser's own registration, never between members who
--      cannot see each other. One per member and event; cancelling the registration removes it while it is unread.
--      snippet carries the event's title.
--   2. my_notifications_v4(): my_notifications_v3 (0043) plus event_id and the event's poster.

-- 1. ------------------------------------------------------------------------------------------------------------------
alter table public.member_notification add column if not exists event_id uuid references public.club_event(id) on delete cascade;
alter table public.member_notification drop constraint if exists member_notification_notification_type_check;
alter table public.member_notification add constraint member_notification_notification_type_check
  check (notification_type in ('nearby_appeared', 'post_like', 'post_comment', 'event_registered'));
create index if not exists member_notification_event_idx on public.member_notification (event_id) where event_id is not null;

create or replace function brivia_private.brivia_notify_event_registered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if tg_op = 'DELETE' then
    delete from public.member_notification
     where notification_type = 'event_registered' and event_id = old.event_id and source_user_id = old.member_id and read_at is null;
    return null;
  end if;
  if new.status is distinct from 'confirmed' or (tg_op = 'UPDATE' and old.status = 'confirmed') then return null; end if;
  select e.creator_id, e.title into v_owner, v_title from public.club_event e where e.id = new.event_id;
  if v_owner is null or v_owner = new.member_id or not public.brivia_visible_to(v_owner, new.member_id) then
    return null;
  end if;
  insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, event_id, snippet)
  values (v_owner, new.member_id, 'event_registered', 'event_registered:' || new.event_id || ':' || new.member_id,
          new.event_id, left(v_title, 80))
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;
revoke all on function brivia_private.brivia_notify_event_registered() from public, anon, authenticated;
drop trigger if exists event_rsvp_notify on public.event_rsvp;
create trigger event_rsvp_notify after insert or update of status or delete on public.event_rsvp
  for each row execute function brivia_private.brivia_notify_event_registered();

-- 2. ------------------------------------------------------------------------------------------------------------------
create or replace function public.my_notifications_v4()
returns table(id uuid, notification_type text, source_user_id uuid, name text, photo_url text, band text,
              created_at timestamptz, read_at timestamptz, dismissed_at timestamptz, place_name text,
              post_id uuid, comment_id uuid, snippet text, post_image_url text, event_id uuid, event_image_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  return query
  select m.id, m.notification_type, m.source_user_id, p.name, p.photo_url, m.band, m.created_at, m.read_at, m.dismissed_at,
         m.place_name, m.post_id, m.comment_id, m.snippet, cp.image_url, m.event_id, ce.image_url
    from public.member_notification m
    left join public.profiles p on p.id = m.source_user_id
    left join public.community_posts cp on cp.id = m.post_id
    left join public.club_event ce on ce.id = m.event_id
   where m.user_id = uid and m.created_at >= now() - interval '7 days'
     and (m.source_user_id is null or public.brivia_visible_to(uid, m.source_user_id))
   order by m.created_at desc
   limit 80;
end;
$$;
revoke all on function public.my_notifications_v4() from public, anon;
grant execute on function public.my_notifications_v4() to authenticated;
