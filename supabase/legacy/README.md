# Legacy SQL (archived, do not run)

These are the original v1 SQL files, kept for history only. They are superseded by
`supabase/migrations/0001_baseline.sql` (Ruling P6, decision D-012). A fresh Supabase project runs
`supabase/migrations/*.sql` in order and never these files.

Why they were retired: they disagreed with each other. `fix-profile-columns.sql` made `profiles.id`
`text` while `schema.sql` made it `uuid`; `schema.sql`/`blocking.sql` declared `text` columns with a
foreign key to `profiles(id uuid)`, which PostgreSQL rejects; and `auth-hardening.sql` and
`blocking.sql` each created a different permissive insert policy on `brivia_messages`, so applied
together the policy without the block check let blocked members message each other.

## How the baseline resolved each conflict

| Topic | Legacy files | Baseline choice | Why |
|---|---|---|---|
| Member id types | `schema.sql` (profiles/matches uuid, messages/blocks text), `fix-profile-columns.sql` (profiles text), `community-posts.sql`, `blocking.sql` (text) | **uuid everywhere**, FK to `profiles(id)` on delete cascade (`profiles.id` FK to `auth.users`) | auth.users ids are uuid; text ids could not carry the FKs |
| `profiles` columns | `schema.sql` (not-null defaults, gender check), `fix-profile-columns.sql` (nullable), `gender-phone-fields.sql` (named `profiles_gender_check`, allows null) | `schema.sql` shape + `gender-phone-fields.sql` named check + new `is_test` (Ruling P7) | Latest and strictest definition the client satisfies (`profileToRow` always sends name, email, arrays; gender is a valid value or null) |
| profiles select | `schema.sql` "Members can view profiles", `auth-hardening.sql` "Completed members can view profiles" | **Neither** (fix round 1): owner-only "Members can view their own profile" plus the read-only `public_profiles` view, identical to `0002` (which re-applies as a no-op) | Both legacy forms let every member read every email and phone. Secure by default even if only 0001 is applied |
| matches select/delete | `schema.sql` "Members ...", `auth-hardening.sql`/`connection-removal.sql` "Completed members ..." | "Completed members ..." | Latest |
| matches insert | `schema.sql`, `auth-hardening.sql` (any `user2_id`, no consent, no block check) | **No client insert policy** (fix round 1) | Mutual consent: matches are created server-side only (Task 2) |
| brivia_messages insert | `auth-hardening.sql` (no block check), `blocking.sql` (block check) | **one** policy, "Completed members can send messages", with the block check | Global constraint: no message between blocked members. Two permissive policies would OR the check away |
| `brivia_is_blocked_between` | `(text, text)` in `schema.sql`/`blocking.sql`, answers for any pair | `(uuid, uuid)` canonical plus `(text, text)`; both return false unless `auth.uid()` is one of the two members (fix round 1) | uuid columns; text form keeps `::text` callers (Task 2) working; the legacy form was a block-status oracle for third parties |
| storage update policies | `schema.sql`/`fix-profile-columns.sql` (using only), `add-cover-support.sql` (using + with check) | `add-cover-support.sql` | Latest; also stops moving an object into another member's folder |
| storage select policies | "Anyone can view ..." `to public`, bucket check only, on profile-photos, profile-covers, message-attachments, community-posts | **Dropped** (fix round 1, Ruling P9). Owner-folder-only select `to authenticated` on all four | Public URLs need no select policy; the legacy policies let anyone with the anon key list every member uuid and every chat attachment path |
| message attachments columns | `schema.sql`, `chat-attachments.sql` | same columns, in the create table | Identical definitions |

## Deliberately dropped

- `fix-profile-columns.sql`'s `create table ... id text` and the long `add column if not exists`
  lists in `schema.sql`/`fix-profile-columns.sql`: upgrade paths for databases that no longer exist.
- `profile_credentials` (fix round 1): the whole table, which held `login_password` in plain text.
  The client never reads or writes it (`auth-hardening.sql` already cut client access), and a fresh
  project has no rows to keep. Passwords live only in Supabase Auth.
- The "Anyone can view ..." storage select policies (see table above).
- `execute` on `brivia_has_completed_profile` and `brivia_is_blocked_between` for `anon` (Supabase
  grants it by default): anon has no use for them, and the block check would leak who blocked whom.
