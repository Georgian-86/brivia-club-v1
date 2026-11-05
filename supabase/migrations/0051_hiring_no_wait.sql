set lock_timeout = '5s';
-- 0051_hiring_no_wait.sql: a new hirer's role shows at once, no 14-day wait (founder decision 2026-11-04, D-173).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0047 (README "## 0051"). Idempotent.
-- What: brivia_hiring_bar drops the 14-day account age. Completed profile, a photo (seeded members exempt, 0047), a
-- confirmed email, no open flag and the hiring switch still apply. brivia_hiring_live_from is the account's first day,
-- so my_hiring_roles never promises a later date.

create or replace function public.brivia_hiring_bar(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.brivia_hiring_enabled()
    and public.brivia_member_completed(p_member)
    and exists (select 1 from public.profiles p
                 where p.id = p_member and (p.is_test or coalesce(btrim(p.photo_url), '') <> ''))
    and exists (select 1 from auth.users u where u.id = p_member and u.email_confirmed_at is not null)
    and not exists (select 1 from public.member_flag f
                     where f.member_id = p_member and (f.expires_at is null or f.expires_at > now())),
    false) $$;
revoke all on function public.brivia_hiring_bar(uuid) from public, anon, authenticated;

create or replace function public.brivia_hiring_live_from(p_member uuid)
returns date language sql stable security definer set search_path = public as $$
  select p.created_at::date from public.profiles p where p.id = p_member $$;
revoke all on function public.brivia_hiring_live_from(uuid) from public, anon, authenticated;
