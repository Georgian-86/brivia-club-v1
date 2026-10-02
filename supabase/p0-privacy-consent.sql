-- Apply this ONLY together with the client change that reads public_profiles
-- (Ruling P5). Applied alone, the deck shows only the member's own row.
--
-- public_profiles is intentionally an owner-run (security-definer) view, so the Supabase
-- advisor lint 0010 is expected; do NOT switch it to security_invoker. It depends on
-- profiles never having FORCE ROW LEVEL SECURITY, and on the view owner owning profiles.
--
-- P0 privacy: members must never read each other's email/phone.
-- Run once in the Supabase SQL editor, after schema.sql and the other migrations. Idempotent.
--
-- Other members read profiles only through public.public_profiles (no contact fields).
-- The base table becomes owner-only, so email/phone/phone_country_code/phone_number
-- are visible to the member who owns the row and nobody else.

-- The view runs as its owner (default, NOT security_invoker) so it can read rows the
-- base-table policy now hides. The where clause keeps it members-only.
create or replace view public.public_profiles as
  select id, name, full_name, gender, city, state, experience, skills, looking_for,
         photo_url, cover_url, created_at
  from public.profiles
  where public.brivia_has_completed_profile();

-- Supabase default privileges grant authenticated ALL on new public objects; the view is
-- auto-updatable and owner-run, so writes would bypass RLS. Make it strictly read-only.
revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to authenticated;

drop policy if exists "Completed members can view profiles" on public.profiles;
drop policy if exists "Members can view profiles" on public.profiles;
drop policy if exists "Members can view their own profile" on public.profiles;
create policy "Members can view their own profile"
  on public.profiles for select to authenticated
  using (id::text = auth.uid()::text);

notify pgrst, 'reload schema';
