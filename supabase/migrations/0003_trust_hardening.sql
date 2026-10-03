-- 0003_trust_hardening.sql: the Iteration 2 (Trust) migration (Ruling P5).
-- Apply after 0001_baseline.sql and 0002_p0_privacy_consent.sql, in the Supabase SQL editor, and ship
-- it together with the client changes of the same iteration (saveProfile in supabase.js now updates
-- editable columns only; a combined upsert would be denied by the column grants below).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------
-- Task 1: column-locked profiles. Members may update only the editable columns of their own row.
-- id, email, created_at and is_test can never be changed by a client (email is set at insert only).
-- Row scope (id = auth.uid()) stays in the RLS update policy from 0001.
-- ---------------------------------------------------------------------------------------------
revoke update on public.profiles from public, anon, authenticated;
grant update (
  name, full_name, phone, phone_country_code, phone_number, gender, city, state,
  experience, skills, looking_for, photo_url, cover_url, updated_at
) on public.profiles to authenticated;

-- is_test (Ruling P14) is set only by the table owner (the seed script / SQL editor).
-- Clients cannot choose it on insert and cannot change it on update, even if a grant is added later.
create or replace function public.brivia_guard_is_test()
returns trigger
language plpgsql
as $$
begin
  if current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.profiles'::regclass) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_test := false;
  else
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;

drop trigger if exists brivia_profiles_guard_is_test on public.profiles;
create trigger brivia_profiles_guard_is_test
  before insert or update on public.profiles
  for each row execute function public.brivia_guard_is_test();
