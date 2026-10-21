-- 0012_polish_wave.sql: the polish wave (spec docs/superpowers/specs/2026-10-21-polish-wave-design.md).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0011. 0001-0011 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each task fills only its own section below.

-- §A5 blocked sends are withheld

-- §C post likes and saves

-- §D resumes, resume messages, typing, deletion
