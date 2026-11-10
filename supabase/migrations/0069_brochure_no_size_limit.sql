set lock_timeout = '5s';
-- 0069_brochure_no_size_limit.sql (D-227, founder 2026-11-10: "THERE SHOULD BE NO FILE SIZE CRITERIA FOR BROCHURE").
-- Apply after 0068 (README "## 0069"), with the client deploy. 0001-0068 are frozen. Idempotent.
--
-- The event-brochures bucket (0025) had file_size_limit = 5 MB. It now has none of its own, so a brochure is limited
-- only by the project's global upload limit (Supabase dashboard: Project Settings > Storage, "Upload file size
-- limit"). Still PDF only (allowed_mime_types unchanged), still public, still each member's own folder (0025 policies).
update storage.buckets set file_size_limit = null, allowed_mime_types = array['application/pdf']
 where id = 'event-brochures';
