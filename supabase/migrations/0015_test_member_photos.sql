set lock_timeout = '5s';
-- 0015_test_member_photos.sql: test members may show a photo shipped with the site (test world v3, D-100).
-- Spec: docs/superpowers/specs/2026-10-25-test-world-v3-design.md. Applied by hand in the Supabase SQL editor, as
-- postgres, after 0014 and before supabase/seed/test-members-v3.sql (see README.md "## 0015"). 0001-0014 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Based on the latest definition (grep of every migration, 2026-10-25):
--   * profiles_photo_url_storage CHECK (0003_trust_hardening.sql:757): photo_url is null or a public Storage URL of
--     the member's own 'profile-photos' folder (brivia_is_storage_url). Nothing later changed it.
--
-- What changes: the same CHECK also accepts exactly '/media/test-members/t<3 digits>.webp' when is_test is true. Only
-- the table owner can set is_test (0003 brivia_guard_is_test), so a real member still can only store a Storage URL of
-- their own folder. The client already renders same-site paths (app.js safeImageUrl) and nothing else from a foreign
-- host. Re-adding the CHECK validates every row: real rows already satisfy the 0003 rule, so nothing is rewritten.

create or replace function public.brivia_is_test_member_photo(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_url ~ '^/media/test-members/t[0-9]{3}\.webp$', false);
$$;
-- Executable by everyone on purpose: the CHECK runs it as whoever writes the row (a pure pattern test, no data read).

alter table public.profiles drop constraint if exists profiles_photo_url_storage;
alter table public.profiles add constraint profiles_photo_url_storage
  check (photo_url is null
         or public.brivia_is_storage_url(photo_url, 'profile-photos', id)
         or (is_test and public.brivia_is_test_member_photo(photo_url)));
