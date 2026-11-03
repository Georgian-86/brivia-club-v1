set lock_timeout = '5s';
-- 0043_receipts_switch_post_notifications.sql: a "Read receipts" switch, and a notification when someone likes or
-- comments on your note (founder request 2026-11-04, D-151). Applied after 0042 (README "## 0043"). 0001-0042 are
-- frozen. Idempotent.
--   1. member_presence.read_receipts (default on), set_read_receipts(on) / my_read_receipts(). Like WhatsApp, it works
--      both ways: mark_conversation_read (0042's, redefined) sets read_at only when the reader AND the sender both have
--      it on; otherwise it only marks the messages delivered. Off: others never see your Read, and you never see theirs.
--   2. member_notification gains post_like and post_comment (with post_id, comment_id and a short snippet of the
--      comment). Triggers on community_post_likes / community_post_comments write one for the note's author, never for
--      their own like or comment, never between members who cannot see each other (blocked, other world). One per
--      liker and note (unlike and like again does not notify twice); un-liking or deleting the comment removes it.
--   3. my_notifications_v3(): my_notifications_v2 (0034) plus post_id, comment_id, snippet and the note's image.

-- 1. ------------------------------------------------------------------------------------------------------------------
alter table public.member_presence add column if not exists read_receipts boolean not null default true;

create or replace function public.set_read_receipts(p_on boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  insert into public.member_presence (member_id, read_receipts) values (uid, coalesce(p_on, true))
  on conflict (member_id) do update set read_receipts = excluded.read_receipts;
  return coalesce(p_on, true);
end;
$$;
revoke all on function public.set_read_receipts(boolean) from public, anon;
grant execute on function public.set_read_receipts(boolean) to authenticated;

create or replace function public.my_read_receipts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.read_receipts from public.member_presence p where p.member_id = auth.uid()), true)
$$;
revoke all on function public.my_read_receipts() from public, anon;
grant execute on function public.my_read_receipts() to authenticated;

create or replace function public.mark_conversation_read(p_other uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_share boolean;
  n int;
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if p_other is null or p_other = uid then
    return 0;
  end if;
  v_share := coalesce((select p.read_receipts from public.member_presence p where p.member_id = uid), true)
         and coalesce((select p.read_receipts from public.member_presence p where p.member_id = p_other), true);
  if v_share then
    update public.brivia_messages m
       set read_at = now(),
           delivered_at = coalesce(m.delivered_at, now())
     where m.recipient_id = uid
       and m.sender_id = p_other
       and m.read_at is null
       and brivia_private.brivia_pair_world_ok(m.sender_id, m.recipient_id)  -- the select policy's world rule (0013)
       and not exists (select 1 from brivia_private.withheld_message w where w.message_id = m.id);
  else
    update public.brivia_messages m
       set delivered_at = now()
     where m.recipient_id = uid
       and m.sender_id = p_other
       and m.delivered_at is null
       and brivia_private.brivia_pair_world_ok(m.sender_id, m.recipient_id)
       and not exists (select 1 from brivia_private.withheld_message w where w.message_id = m.id);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 2. ------------------------------------------------------------------------------------------------------------------
alter table public.member_notification add column if not exists post_id uuid references public.community_posts(id) on delete cascade;
alter table public.member_notification add column if not exists comment_id uuid references public.community_post_comments(id) on delete cascade;
alter table public.member_notification add column if not exists snippet text;
alter table public.member_notification drop constraint if exists member_notification_notification_type_check;
alter table public.member_notification add constraint member_notification_notification_type_check
  check (notification_type in ('nearby_appeared', 'post_like', 'post_comment'));
create index if not exists member_notification_post_idx on public.member_notification (post_id) where post_id is not null;
create index if not exists member_notification_comment_idx on public.member_notification (comment_id) where comment_id is not null;

create or replace function brivia_private.brivia_notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.member_notification
     where notification_type = 'post_like' and post_id = old.post_id and source_user_id = old.member_id and read_at is null;
    return null;
  end if;
  select p.author_id into v_author from public.community_posts p where p.id = new.post_id;
  if v_author is null or v_author = new.member_id or not public.brivia_visible_to(v_author, new.member_id) then
    return null;
  end if;
  insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id)
  values (v_author, new.member_id, 'post_like', 'post_like:' || new.post_id || ':' || new.member_id, new.post_id)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;
revoke all on function brivia_private.brivia_notify_post_like() from public, anon, authenticated;
drop trigger if exists community_post_likes_notify on public.community_post_likes;
create trigger community_post_likes_notify after insert or delete on public.community_post_likes
  for each row execute function brivia_private.brivia_notify_post_like();

create or replace function brivia_private.brivia_notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_snip text;
begin
  select p.author_id into v_author from public.community_posts p where p.id = new.post_id;
  if v_author is null or v_author = new.author_id or not public.brivia_visible_to(v_author, new.author_id) then
    return null;
  end if;
  v_snip := btrim(regexp_replace(new.body, '\s+', ' ', 'g'));
  if char_length(v_snip) > 80 then v_snip := left(v_snip, 79) || '…'; end if;
  insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id, comment_id, snippet)
  values (v_author, new.author_id, 'post_comment', 'post_comment:' || new.id, new.post_id, new.id, v_snip)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;
revoke all on function brivia_private.brivia_notify_post_comment() from public, anon, authenticated;
drop trigger if exists community_post_comments_notify on public.community_post_comments;
create trigger community_post_comments_notify after insert on public.community_post_comments
  for each row execute function brivia_private.brivia_notify_post_comment();

-- 3. ------------------------------------------------------------------------------------------------------------------
create or replace function public.my_notifications_v3()
returns table(id uuid, notification_type text, source_user_id uuid, name text, photo_url text, band text,
              created_at timestamptz, read_at timestamptz, dismissed_at timestamptz, place_name text,
              post_id uuid, comment_id uuid, snippet text, post_image_url text)
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
         m.place_name, m.post_id, m.comment_id, m.snippet, cp.image_url
    from public.member_notification m
    left join public.profiles p on p.id = m.source_user_id
    left join public.community_posts cp on cp.id = m.post_id
   where m.user_id = uid and m.created_at >= now() - interval '7 days'
     and (m.source_user_id is null or public.brivia_visible_to(uid, m.source_user_id))
   order by m.created_at desc
   limit 80;
end;
$$;
revoke all on function public.my_notifications_v3() from public, anon;
grant execute on function public.my_notifications_v3() to authenticated;
