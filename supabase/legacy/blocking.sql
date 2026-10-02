-- Run once in the Supabase SQL editor to make chat blocking enforceable
-- for every device, not only in the current browser's localStorage.

create table if not exists public.brivia_blocks (
  blocker_id text not null references public.profiles(id) on delete cascade,
  blocked_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.brivia_blocks enable row level security;

create or replace function public.brivia_has_completed_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id::text = auth.uid()::text);
$$;
revoke all on function public.brivia_has_completed_profile() from public;
grant execute on function public.brivia_has_completed_profile() to authenticated;

drop policy if exists "Members can view their own blocks" on public.brivia_blocks;
create policy "Members can view their own blocks"
  on public.brivia_blocks for select to authenticated
  using (auth.uid()::text = blocker_id::text);

drop policy if exists "Members can create their own blocks" on public.brivia_blocks;
create policy "Members can create their own blocks"
  on public.brivia_blocks for insert to authenticated
  with check (auth.uid()::text = blocker_id::text);

drop policy if exists "Members can remove their own blocks" on public.brivia_blocks;
create policy "Members can remove their own blocks"
  on public.brivia_blocks for delete to authenticated
  using (auth.uid()::text = blocker_id::text);

create or replace function public.brivia_is_blocked_between(first_user text, second_user text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brivia_blocks
    where (blocker_id::text = first_user and blocked_id::text = second_user)
       or (blocker_id::text = second_user and blocked_id::text = first_user)
  );
$$;

revoke all on function public.brivia_is_blocked_between(text, text) from public;
grant execute on function public.brivia_is_blocked_between(text, text) to authenticated;

drop policy if exists "Members can send messages" on public.brivia_messages;
create policy "Members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    public.brivia_has_completed_profile()
    and auth.uid()::text = sender_id::text
    and not public.brivia_is_blocked_between(sender_id, recipient_id)
  );

notify pgrst, 'reload schema';
