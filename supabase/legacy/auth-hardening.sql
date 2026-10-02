-- Run after schema.sql in the Supabase SQL Editor.
-- An authenticated session is not a Brivia membership until a profile row exists.

create or replace function public.brivia_has_completed_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id::text = auth.uid()::text
  );
$$;

revoke all on function public.brivia_has_completed_profile() from public;
grant execute on function public.brivia_has_completed_profile() to authenticated;

drop policy if exists "Members can view profiles" on public.profiles;
drop policy if exists "Completed members can view profiles" on public.profiles;
create policy "Completed members can view profiles"
  on public.profiles for select to authenticated
  using (id::text = auth.uid()::text or public.brivia_has_completed_profile());

drop policy if exists "Members can view their matches" on public.matches;
drop policy if exists "Completed members can view their matches" on public.matches;
create policy "Completed members can view their matches"
  on public.matches for select to authenticated
  using (
    public.brivia_has_completed_profile()
    and (auth.uid() = user1_id or auth.uid() = user2_id)
  );

drop policy if exists "Members can create their matches" on public.matches;
drop policy if exists "Completed members can create their matches" on public.matches;
create policy "Completed members can create their matches"
  on public.matches for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and auth.uid() = user1_id
  );

drop policy if exists "Members can remove their matches" on public.matches;
drop policy if exists "Completed members can remove their matches" on public.matches;
create policy "Completed members can remove their matches"
  on public.matches for delete to authenticated
  using (
    public.brivia_has_completed_profile()
    and (auth.uid()::text = user1_id::text or auth.uid()::text = user2_id::text)
  );

drop policy if exists "Members can view their messages" on public.brivia_messages;
drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using (
    public.brivia_has_completed_profile()
    and (auth.uid()::text = sender_id or auth.uid()::text = recipient_id)
  );

drop policy if exists "Members can send messages" on public.brivia_messages;
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and auth.uid()::text = sender_id
  );

-- The app no longer reads or writes plain-text passwords. Keep the legacy
-- table and its rows intact for now, but remove client access to those values.
drop policy if exists "Members can view their own login credential" on public.profile_credentials;
drop policy if exists "Members can save their own login credential" on public.profile_credentials;
drop policy if exists "Members can update their own login credential" on public.profile_credentials;
