-- Run once in the Supabase SQL editor to allow a member to remove either
-- orientation of a connection from the profile settings menu.

drop policy if exists "Members can remove their matches" on public.matches;
drop policy if exists "Completed members can remove their matches" on public.matches;
create policy "Completed members can remove their matches"
  on public.matches for delete to authenticated
  using (
    public.brivia_has_completed_profile()
    and (auth.uid()::text = user1_id::text or auth.uid()::text = user2_id::text)
  );

notify pgrst, 'reload schema';
