set lock_timeout = '5s';
-- 0073_newcomer_cards.sql (D-241, founder 2026-11-12: "do show the profiles of the people who started but didn't
-- finish on swipes in the connect section, don't discard those profiles, we desperately need users"). Apply after
-- 0072 (README "## 0073"), then deploy the client. 0001-0072 are frozen. Idempotent.
--
-- A NEWCOMER is a real account whose profile is started but whose setup is not finished: it has a real name, a photo
-- and the 18+ declaration, is not under review and is not anonymous, but has no interests or area yet. (Without the 18+
-- declaration nobody is shown: an unconfirmed age is never put in front of strangers. Without a name and a photo there
-- is no card to show.) Completed members stay governed by brivia_visible_to, unchanged.
--
--   1. brivia_private.brivia_newcomer_visible(viewer, target): the viewer is a completed member, the target is a
--      newcomer, both in the same world, no block either way.
--   2. newcomer_cards(p_exclude, p_limit): newcomer cards for the caller (the deck's card columns, distance_band
--      'New to Brivia', no shared interests), newest first, minus the deck's own-history exclusions (connected, a
--      signal in 30 days, a live request, a pass in 7 days) and the ids the client already holds.
--   3. send_signal: a request to a newcomer is recorded (it used to be charged and dropped, as for any non-visible
--      target). Mutual consent is unchanged: the newcomer sees it, and can accept, only once their setup is finished
--      (incoming requests are read through brivia_visible_to, which needs both completed). No match can form before.

-- 1. ------------------------------------------------------------------------------------------------------------------
create or replace function brivia_private.brivia_newcomer_visible(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_viewer is not null and p_target is not null and p_viewer <> p_target
    and public.brivia_member_completed(p_viewer)
    and not public.brivia_member_completed(p_target)
    and exists (select 1 from public.profiles t join auth.users u on u.id = t.id
                 where t.id = p_target
                   and not coalesce(u.is_anonymous, false)
                   and btrim(coalesce(t.name, '')) not in ('', 'New Member')
                   and coalesce(t.photo_url, '') <> ''
                   and t.adult_declared_at is not null)
    and not exists (select 1 from public.member_flag f where f.member_id = p_target and f.reason = 'suspended_pending_review')
    and public.brivia_in_test_world(p_viewer) = public.brivia_in_test_world(p_target)
    and not exists (select 1 from public.brivia_blocks bl
                     where (bl.blocker_id = p_viewer and bl.blocked_id = p_target)
                        or (bl.blocker_id = p_target and bl.blocked_id = p_viewer)),
    false)
$$;
revoke all on function brivia_private.brivia_newcomer_visible(uuid, uuid) from public, anon, authenticated;

-- 2. ------------------------------------------------------------------------------------------------------------------
create or replace function public.newcomer_cards(p_exclude uuid[] default '{}', p_limit int default 6)
returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[],
              looking_for text[], distance_band text, shared_interests text[])
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where public.brivia_member_completed(auth.uid())),
  ex as (select coalesce(array_agg(e), '{}'::uuid[]) as ids from (select unnest(coalesce(p_exclude, '{}'::uuid[])) e limit 500) x)
  select t.id, t.name, t.photo_url, t.cover_url, t.experience, t.skills, t.looking_for, 'New to Brivia'::text, '{}'::text[]
    from public.profiles t cross join me cross join ex
   where t.id <> me.id
     and not (t.id = any(ex.ids))
     and not public.brivia_member_completed(t.id)
     and brivia_private.brivia_newcomer_visible(me.id, t.id)
     and public.brivia_in_test_world(t.id) = public.brivia_in_test_world(me.id)   -- explicit (the guard reads it); also in the helper
     and not exists (select 1 from public.matches m
                      where (m.user1_id = me.id and m.user2_id = t.id) or (m.user1_id = t.id and m.user2_id = me.id))
     and not exists (select 1 from public.signal_ledger l
                      where l.sender_id = me.id and l.to_id = t.id and l.at > now() - interval '30 days')
     and not exists (select 1 from public.connection_requests r
                      where r.from_id = me.id and r.to_id = t.id and public.brivia_request_is_live(r.status, r.created_at))
     and not exists (select 1 from public.interaction i
                      where i.viewer_id = me.id and i.target_id = t.id and i.event = 'pass'
                        and i.created_at > now() - interval '7 days')
   order by t.created_at desc, t.id
   limit greatest(1, least(coalesce(p_limit, 6), 20))
$$;
revoke all on function public.newcomer_cards(uuid[], int) from public, anon;
grant execute on function public.newcomer_cards(uuid[], int) to authenticated;

-- 3. send_signal: ONE condition changes (step 5: visible OR newcomer). The live function differs from the repo's 0008
--    copy (a live-only edit: the 3-argument brivia_request_is_live with chat_accepted_at, D-129 "still owed"), so it is
--    not re-created from a copy here, which would undo that edit: the installed body is read, that one line is
--    replaced, and the function is re-created from it. Idempotent (an already patched body is left alone); refuses
--    rather than guessing when the line is not there.
do $mig$
declare
  src text;
  patched text;
begin
  select prosrc into src from pg_proc where oid = 'public.send_signal(uuid, text)'::regprocedure;
  if position('brivia_newcomer_visible' in src) > 0 then return; end if;
  patched := replace(src, 'if public.brivia_visible_to(me, p_to) then',
                     'if public.brivia_visible_to(me, p_to) or brivia_private.brivia_newcomer_visible(me, p_to) then');
  if patched = src then raise exception '0073: send_signal step 5 not found; nothing changed'; end if;
  execute format($f$create or replace function public.send_signal(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as %L$f$, patched);
end
$mig$;
revoke all on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;
