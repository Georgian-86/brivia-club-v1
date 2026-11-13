set lock_timeout = '5s';
-- 0077_admin_post_broadcast.sql (D-250, founder 2026-11-13: "the admin post notifications must go to everyone on the
-- app whether they use it or not"). Apply after 0076 (README "## 0077"), then deploy push-notify. 0001-0076 are
-- frozen. Idempotent.
--
-- A note posted by a member with the Admin badge (member_badge, 0076) is an announcement: its 'post_new' notification
-- goes to every real account (not anonymous, not the author), active or not, set up or not, in the author's world, with
-- no block either way. Any other member's note still notifies only their connections (0071, unchanged). Phones get it
-- through the same push (push-notify, called by the author's app after posting). Accounts whose setup is unfinished see
-- it in the app once they finish (notifications are read through brivia_visible_to).
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
  if exists (select 1 from public.member_badge b where b.member_id = new.author_id and b.badge = 'admin') then
    insert into public.member_notification (user_id, source_user_id, notification_type, dedupe_key, post_id, snippet)
    select p.id, new.author_id, 'post_new', 'post_new:' || new.id, new.id, brivia_private.brivia_post_snippet(new.caption)
      from public.profiles p join auth.users u on u.id = p.id
     where p.id <> new.author_id
       and not coalesce(u.is_anonymous, false)
       and public.brivia_in_test_world(p.id) = public.brivia_in_test_world(new.author_id)
       and not exists (select 1 from public.brivia_blocks bl
                        where (bl.blocker_id = p.id and bl.blocked_id = new.author_id)
                           or (bl.blocker_id = new.author_id and bl.blocked_id = p.id))
    on conflict (user_id, dedupe_key) do nothing;
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
