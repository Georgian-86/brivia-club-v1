set lock_timeout = '5s';
-- 0050_hiring_open_world.sql: seeded hiring posts follow the open test world (founder request 2026-11-04, D-171).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0047 (README "## 0050"). Idempotent.
--
-- Why: the founder tests with real accounts that are not testers and wants every member to see all the hiring posts,
-- nearest first. 0047 kept seeded roles to the strict test world (brivia_tester_world) even while open_test_world shows
-- the seeded members themselves to everyone; that left real accounts with an empty Hiring switch.
-- What: brivia_hiring_seen_by now uses brivia_in_test_world(viewer), the same world rule as the deck and get_candidates.
-- While open_test_world is on, every member sees the seeded roles and seeded "Open to roles"; switching it off
-- (update public.brivia_world_switch set open_test_world = false;) hides them again from everyone but testers.
-- Real members' roles are unchanged. Nothing else in 0047 changes.

create or replace function public.brivia_hiring_seen_by(p_viewer uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select p.is_test from public.profiles p where p.id = p_member), false)
      or p_member = p_viewer
      or (p_viewer is not null and public.brivia_in_test_world(p_viewer)) $$;
revoke all on function public.brivia_hiring_seen_by(uuid, uuid) from public, anon, authenticated;
