-- 0084 (D-278): the visibility helpers in plpgsql, same logic, same signatures, same security.
-- Found (2026-11-21, evening peak, 503s and statement timeouts across the app): brivia_visible_to took ~15 ms a call.
-- It and the helpers it calls were LANGUAGE sql with SECURITY DEFINER + SET search_path, so Postgres cannot inline
-- them and (before PG 18) re-plans an SQL function's body on every call. They run once per row in deck_candidates,
-- discover_people, post_activity, notifications and nearby, so one request made hundreds of re-plans.
-- plpgsql caches each statement's plan for the session. Measured on live data: 1,299 viewer/member pairs 3,845 ms ->
-- 729 ms, with 0 differences in brivia_visible_to, brivia_member_completed and brivia_in_test_world over every member.
-- CREATE OR REPLACE keeps the owner and grants. Idempotent.

create or replace function public.brivia_tester_world(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select p.is_test from public.profiles p where p.id = p_id), false)
      or exists (select 1 from public.brivia_tester t where t.member_id = p_id);
end
$$;

create or replace function public.brivia_test_world_open()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select s.open_test_world from public.brivia_world_switch s where s.id), false);
end
$$;

create or replace function public.brivia_in_test_world(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.brivia_tester_world(p_id)
      or (public.brivia_test_world_open() and exists (select 1 from public.profiles p where p.id = p_id));
end
$$;

create or replace function public.brivia_member_completed(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(
    exists (select 1 from public.profiles p where p.id = p_id and public.brivia_is_completed(p.name, 'x')
                                              and p.adult_declared_at is not null)
    -- an anonymous account (Supabase anonymous sign-in) is never completed (D-038 hygiene, B-F3)
    and not exists (select 1 from auth.users u where u.id = p_id and coalesce(u.is_anonymous, false))
    and exists (select 1 from public.member_orbit o where o.member_id = p_id)
    and (select count(*) between 1 and 12 and coalesce(sum(mi.points), 0) = 20
           from public.member_interest mi where mi.member_id = p_id)
    -- the completion floor (D-038 R3): at least one non-sensitive interest
    and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                 where mi.member_id = p_id and not nd.sensitive)
    -- a member under review (R4/R5) is not shown to anyone until an operator lifts the flag
    and not exists (select 1 from public.member_flag f where f.member_id = p_id and f.reason = 'suspended_pending_review'),
    false);
end
$$;

create or replace function public.brivia_visible_to(p_viewer uuid, p_target uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(
    p_viewer <> p_target
    and exists (select 1 from public.profiles a join public.profiles b
                  on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = p_viewer and b.id = p_target)
    and not exists (select 1 from public.brivia_blocks bl
                     where (bl.blocker_id = p_viewer and bl.blocked_id = p_target)
                        or (bl.blocker_id = p_target and bl.blocked_id = p_viewer))
    and public.brivia_member_completed(p_viewer)
    and public.brivia_member_completed(p_target),
    false);
end
$$;
