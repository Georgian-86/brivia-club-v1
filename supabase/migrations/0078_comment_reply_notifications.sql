set lock_timeout = '5s';
-- 0078_comment_reply_notifications.sql (D-260, founder 2026-11-14: "allow notifications for if the person comments on
-- our post we must get notified"). Apply after 0077 (README "## 0078"), then deploy push-notify and the client.
-- 0001-0077 are frozen. Idempotent.
--
-- A comment already notifies the note's author ('post_comment', 0043). A REPLY now also notifies the writer of the
-- comment it answers ('comment_reply'), on anyone's note: never the replier themself, never twice (the note's author,
-- already told by 'post_comment', gets nothing more), never across a block or another world (brivia_visible_to).
-- The note's author is told about every comment, including on their own note's threads, as before; a member's comment
-- on their own note notifies only the person they replied to.

alter table public.member_notification drop constraint if exists member_notification_notification_type_check;
alter table public.member_notification add constraint member_notification_notification_type_check
  check (notification_type in ('nearby_appeared', 'post_like', 'post_comment', 'event_registered', 'post_new', 'comment_reply'));

create or replace function brivia_private.brivia_notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_parent_author uuid;
  v_snip text;
begin
  select p.author_id into v_author from public.community_posts p where p.id = new.post_id;
  if v_author is null then return null; end if;
  v_snip := btrim(regexp_replace(new.body, '\s+', ' ', 'g'));
  if char_length(v_snip) > 80 then v_snip := left(v_snip, 79) || '…'; end if;
  -- The note's author: every comment by someone else (0043).
  if v_author <> new.author_id and public.brivia_visible_to(v_author, new.author_id) then
    insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id, comment_id, snippet)
    values (v_author, new.author_id, 'post_comment', 'post_comment:' || new.id, new.post_id, new.id, v_snip)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  -- D-260: the writer of the comment this one answers.
  if new.parent_id is not null then
    select c.author_id into v_parent_author from public.community_post_comments c where c.id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id and v_parent_author <> v_author
       and public.brivia_visible_to(v_parent_author, new.author_id) then
      insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id, comment_id, snippet)
      values (v_parent_author, new.author_id, 'comment_reply', 'comment_reply:' || new.id, new.post_id, new.id, v_snip)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function brivia_private.brivia_notify_post_comment() from public, anon, authenticated;
