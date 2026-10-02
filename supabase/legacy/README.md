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
| Member id types | `schema.sql` (profiles/matches uuid, messages/blocks text), `fix-profile-columns.sql` (profiles text), `community-posts.sql`, `blocking.sql` (text) | **uuid everywhere**, FK to `profiles(id)` on delete cascade (`profile_credentials.user_id` and `profiles.id` FK to `auth.users`) | auth.users ids are uuid; text ids could not carry the FKs |
| `profiles` columns | `schema.sql` (not-null defaults, gender check), `fix-profile-columns.sql` (nullable), `gender-phone-fields.sql` (named `profiles_gender_check`, allows null) | `schema.sql` shape + `gender-phone-fields.sql` named check + new `is_test` (Ruling P7) | Latest and strictest definition the client satisfies (`profileToRow` always sends name, email, arrays; gender is a valid value or null) |
| profiles select | `schema.sql` "Members can view profiles", `auth-hardening.sql` "Completed members can view profiles" | `auth-hardening.sql` | Latest. `0002_p0_privacy_consent.sql` then replaces it with owner-only + `public_profiles` |
| matches select/insert/delete | `schema.sql` "Members ...", `auth-hardening.sql`/`connection-removal.sql` "Completed members ..." | "Completed members ..." | Latest. Task 2 drops the insert policy (mutual consent) |
| brivia_messages insert | `auth-hardening.sql` (no block check), `blocking.sql` (block check) | **one** policy, "Completed members can send messages", with the block check | Global constraint: no message between blocked members. Two permissive policies would OR the check away |
| `brivia_is_blocked_between` | `(text, text)` in `schema.sql`/`blocking.sql` | `(uuid, uuid)` canonical plus `(text, text)` wrapper | uuid columns; text form keeps `::text` callers (Task 2) working |
| storage update policies | `schema.sql`/`fix-profile-columns.sql` (using only), `add-cover-support.sql` (using + with check) | `add-cover-support.sql` | Latest; also stops moving an object into another member's folder |
| message attachments columns | `schema.sql`, `chat-attachments.sql` | same columns, in the create table | Identical definitions |

## Deliberately dropped

- `fix-profile-columns.sql`'s `create table ... id text` and the long `add column if not exists`
  lists in `schema.sql`/`fix-profile-columns.sql`: upgrade paths for databases that no longer exist.
- `profile_credentials` login-credential policies: already dropped by `auth-hardening.sql`; the table
  stays (RLS on, no policies) for compatibility only.
- `execute` on `brivia_has_completed_profile` and `brivia_is_blocked_between` for `anon` (Supabase
  grants it by default): anon has no use for them, and the block check would leak who blocked whom.
