-- 0006: performance policies (R8, D-042/D-043). Apply only after 0005 is applied and verified live.
-- 1) 17 RLS policies rewritten so auth.uid() is evaluated once per statement ((select auth.uid())) instead of once per
--    row (advisor: auth_rls_initplan). Meaning is unchanged: every body is the latest definition from 0001-0004
--    (0005 touches none of them), command, roles and permissive flag identical. supabase/tests/run.sh proves it.
-- 2) 4 foreign-key indexes (advisor: unindexed_foreign_keys).
-- NEVER recreate "Members can send connection requests" (0003): 0004 dropped it on purpose, and recreating it would
-- re-open raw connection_requests inserts that bypass send_signal. Idempotent: the harness applies this file twice.

-- profiles (0001; the own-profile select is the 0003 version, not 0002)
drop policy if exists "Members can create their profile" on public.profiles;
create policy "Members can create their profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Members can update their profile" on public.profiles;
create policy "Members can update their profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Members can view their own profile" on public.profiles;
create policy "Members can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- brivia_blocks (0001)
drop policy if exists "Members can view their own blocks" on public.brivia_blocks;
create policy "Members can view their own blocks"
  on public.brivia_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists "Members can create their own blocks" on public.brivia_blocks;
create policy "Members can create their own blocks"
  on public.brivia_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "Members can remove their own blocks" on public.brivia_blocks;
create policy "Members can remove their own blocks"
  on public.brivia_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- community_posts (update, delete: 0001; view: 0003; create: 0004)
drop policy if exists "Members can update their own community posts" on public.community_posts;
create policy "Members can update their own community posts"
  on public.community_posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Members can delete their own community posts" on public.community_posts;
create policy "Members can delete their own community posts"
  on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists "Members can view community posts" on public.community_posts;
create policy "Members can view community posts"
  on public.community_posts for select to authenticated
  using (author_id = (select auth.uid()) or public.brivia_can_see_author(author_id));

drop policy if exists "Members can create their own community posts" on public.community_posts;
create policy "Members can create their own community posts"
  on public.community_posts for insert to authenticated
  with check ((select public.brivia_has_completed_profile()) and author_id = (select auth.uid()));

-- connection_requests (0004; select only)
drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    (select public.brivia_has_completed_profile())
    and to_id = (select auth.uid())
    and public.brivia_request_is_live(status, created_at)
    and brivia_private.brivia_incoming_request_visible(from_id)
  );

-- matches (0004)
drop policy if exists "Completed members can view their matches" on public.matches;
create policy "Completed members can view their matches"
  on public.matches for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (user1_id, user2_id));

drop policy if exists "Completed members can remove their matches" on public.matches;
create policy "Completed members can remove their matches"
  on public.matches for delete to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (user1_id, user2_id));

-- brivia_messages (0004)
drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    (select public.brivia_has_completed_profile())
    and sender_id = (select auth.uid())
    and brivia_private.brivia_can_message(recipient_id)
  );

-- interaction (select: 0003; insert: 0004)
drop policy if exists interaction_select_own on public.interaction;
create policy interaction_select_own on public.interaction for select to authenticated
  using (viewer_id = (select auth.uid()) and event <> 'impression');

drop policy if exists interaction_insert_own on public.interaction;
create policy interaction_insert_own on public.interaction for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and event in ('like','pass','request','accept','decline','met','letgo')
    and brivia_private.brivia_interaction_insert_ok(target_id, event)
  );

-- Foreign-key indexes (the lead column of each primary/unique key is already covered).
create index if not exists brivia_blocks_blocked_idx on public.brivia_blocks (blocked_id);
create index if not exists community_posts_author_idx on public.community_posts (author_id);
create index if not exists matches_user2_idx on public.matches (user2_id);
create index if not exists member_orbit_place_idx on public.member_orbit (place_id);
