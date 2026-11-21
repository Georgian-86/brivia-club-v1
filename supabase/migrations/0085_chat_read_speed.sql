-- 0085 (D-279): faster chat reads.
-- 1. brivia_pair_world_ok (public and brivia_private) in plpgsql: same logic, signatures, security and grants. They
--    were LANGUAGE sql + SECURITY DEFINER + SET search_path, which Postgres cannot inline and re-plans on every call
--    (as in 0084). The brivia_messages read policy calls it through my_other_world_peers() for every conversation
--    partner of the reader on every thread read, and Realtime evaluates that policy for every subscriber on every
--    new message.
-- 2. An index matching the thread read (D-258): sender_id in (a,b) and recipient_id in (a,b), newest first, limit 300.
-- Idempotent.

create or replace function public.brivia_pair_world_ok(p_a uuid, p_b uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.brivia_in_test_world(p_a) = public.brivia_in_test_world(p_b)
      or not exists (select 1 from public.brivia_tester t where t.member_id in (p_a, p_b));
end
$$;

create or replace function brivia_private.brivia_pair_world_ok(p_user1 uuid, p_user2 uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(auth.uid() in (p_user1, p_user2) and public.brivia_pair_world_ok(p_user1, p_user2), false);
end
$$;

create index if not exists brivia_messages_pair_created_idx
  on public.brivia_messages (sender_id, recipient_id, created_at desc);
