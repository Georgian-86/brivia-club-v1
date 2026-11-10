set lock_timeout = '5s';
-- 0071_new_post_notifications.sql (D-234, founder 2026-11-10: "when our connection posts something, we may get a
-- notification"). Apply after 0070 (README "## 0071"), then deploy push-notify and the client. 0001-0070 are frozen.
-- Idempotent.
--
--   1. member_notification gains the type 'post_new'. A trigger on community_posts writes one for each of the
--      author's connections (a row in matches: mutual consent) when a note is posted, never for the author, never
--      between members who cannot see each other (blocked, other world). One per connection and note; deleting the
--      note removes them (post_id cascades). snippet carries the start of the caption (80 characters).
--   2. When the author edits the caption, unread 'post_new' notifications get the new snippet.
--   my_notifications_v4 (0060) already returns post_id, snippet and the note's image, so the client reads them as is.

-- 1. ------------------------------------------------------------------------------------------------------------------
alter table public.member_notification drop constraint if exists member_notification_notification_type_check;
alter table public.member_notification add constraint member_notification_notification_type_check
  check (notification_type in ('nearby_appeared', 'post_like', 'post_comment', 'event_registered', 'post_new'));

create or replace function brivia_private.brivia_post_snippet(p_caption text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(case when char_length(s) > 80 then left(s, 79) || '…' else s end, '')
    from (select btrim(regexp_replace(coalesce(p_caption, ''), '\s+', ' ', 'g')) as s) t
$$;
revoke all on function brivia_private.brivia_post_snippet(text) from public, anon, authenticated;

create or replace function brivia_private.brivia_notify_post_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.caption is distinct from old.caption then
      update public.member_notification
         set snippet = brivia_private.brivia_post_snippet(new.caption)
       where notification_type = 'post_new' and post_id = new.id and read_at is null;
    end if;
    return null;
  end if;
  insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id, snippet)
  select distinct c.other, new.author_id, 'post_new', 'post_new:' || new.id, new.id, brivia_private.brivia_post_snippet(new.caption)
    from (select case when m.user1_id = new.author_id then m.user2_id else m.user1_id end as other
            from public.matches m
           where m.user1_id = new.author_id or m.user2_id = new.author_id) c
   where c.other is not null and c.other <> new.author_id
     and public.brivia_visible_to(c.other, new.author_id)
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end;
$$;
revoke all on function brivia_private.brivia_notify_post_new() from public, anon, authenticated;
drop trigger if exists community_posts_notify_new on public.community_posts;
create trigger community_posts_notify_new after insert or update of caption on public.community_posts
  for each row execute function brivia_private.brivia_notify_post_new();
