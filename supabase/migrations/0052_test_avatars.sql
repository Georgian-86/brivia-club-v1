set lock_timeout = '5s';
-- 0052_test_avatars.sql: seeded test members may use a faceless profile photo shipped with the site (founder request
-- 2026-11-04, D-177). Applied by hand in the Supabase SQL editor, as postgres, after 0003 (README "## 0052").
-- Idempotent.
--
-- Why: the founder wants the test hirers to have real-looking profile pictures in which no face is visible (hands at
-- a laptop, a handshake, a suit with the face out of frame), so no stranger's likeness sits on an invented profile
-- (D-156). Unsplash License photos, cropped to 480 px WebP and served by the site at /test-avatars/tNN.webp
-- (site/public/test-avatars; sources in supabase/seed/README.md).
-- What: profiles_photo_url_storage also accepts '/test-avatars/tNN.(webp|jpg|svg)', and only on a seeded row (is_test). A real
-- member can never set it: is_test is guarded (0003, brivia_guard_is_test) and every client write still has to be a
-- storage URL in the member's own folder.

alter table public.profiles drop constraint if exists profiles_photo_url_storage;
alter table public.profiles add constraint profiles_photo_url_storage
  check (photo_url is null
         or public.brivia_is_storage_url(photo_url, 'profile-photos', id)
         or (is_test and photo_url ~ '^/test-avatars/t[0-9]{2}\.(svg|webp|jpg)$'));
