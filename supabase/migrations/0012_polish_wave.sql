-- 0012_polish_wave.sql: the polish wave (spec docs/superpowers/specs/2026-10-21-polish-wave-design.md).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0011. 0001-0011 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each task fills only its own section below.

-- §A5 blocked sends are withheld

-- §C post likes and saves
-- Private to the member: a like or save is visible only to its owner (no counts, no RPC). The insert policy checks
-- that the post exists under the posts select policy (a post the member cannot see cannot be liked).
-- A repeated insert is a unique_violation (23505); the client treats it as done.
do $c$
declare t text;
begin
  foreach t in array array['community_post_likes', 'community_post_saves'] loop
    execute format($f$create table if not exists public.%I (
      post_id uuid not null references public.community_posts(id) on delete cascade,
      member_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (post_id, member_id)
    )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);
    -- the client lists by member_id; the primary key leads with post_id
    execute format('create index if not exists %I on public.%I (member_id, created_at desc)', t || '_member_idx', t);
    execute format('drop policy if exists %I on public.%I', 'Members can view their own ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (member_id = (select auth.uid()))',
      'Members can view their own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Members can add their own ' || t, t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (
      member_id = (select auth.uid())
      and (select public.brivia_has_completed_profile())
      and exists (select 1 from public.community_posts p where p.id = post_id))$f$,
      'Members can add their own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Members can remove their own ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (member_id = (select auth.uid()))',
      'Members can remove their own ' || t, t);
  end loop;
end $c$;

-- §D resumes, resume messages, typing, deletion
