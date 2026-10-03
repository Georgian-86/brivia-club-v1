# Iteration 2 (Trust) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Supabase project safe for seeded test members and the first real sign-ups. This closes the P0 trust backlog from arena iteration 1.

**Architecture:** One new idempotent migration, `supabase/migrations/0003_trust_hardening.sql`, plus small client changes:
- Members read other members only through SECURITY DEFINER RPCs that apply blocks, test-world isolation and paging caps. The open `public_profiles` view is no longer client-readable.
- Profile writes are column-limited.
- Chat media moves to a private bucket with signed URLs.
- Abuse caps are enforced in SQL.
- The ORBIT service trust boundary is designed in the spec, with no code yet.
- An interaction-log table is created now, so no data is lost later.

**Tech Stack:** Supabase Postgres (RLS, plpgsql), vanilla JS client, the local harness `supabase/tests/run.sh`, and Playwright with stubs (`tests/e2e/`).

**Spec:** `docs/arena/2026-10-03-iteration-1.md` (P0 backlog items 1–5, plus the B2 design and the interaction-log schema). Also binding: `CLAUDE.md` rules, `docs/ORBIT_ENGINE.md` §4.1 and §9, and `docs/UX_SPEC.md`.

## Global Constraints

- Members never receive another member's email, phone or coordinates. Connections and messages require mutual consent (CLAUDE.md).
- Migrations are idempotent. They are verified only on the local harness. The controller applies them to live (Ruling P8).
- **Test-world isolation (Ruling P14):** members with `is_test = true` and real members never see, search, request or message each other. Only the seed script (run as the database owner) can set `is_test`.
- No new client dependencies. Every changed client path keeps its existing e2e test passing, and new paths get one.

## Review Focus

1. A real member searching for a name that only a test member has gets 0 results, and the reverse also holds.
2. `get_candidates` called with 500 ids returns at most 50 rows and never the caller.
3. A blocked pair is invisible to each other in every RPC, in both directions.
4. An old chat attachment URL saved before the bucket became private no longer downloads. Signed URLs expire.
5. A sender who hits the daily request cap gets the same "Signal sent" UX, so the cap isn't revealed. No row is written.

---

### Task 1: Column-locked profiles and test-world flag

**Files:** Create `supabase/migrations/0003_trust_hardening.sql`. Test: `supabase/tests/trust.test.sql`.

- [ ] Test: as authenticated A, `update profiles set is_test=true` fails; so do updates to `email`, `created_at` and `id`. Updating `name`, `city`, `skills` and the other editable columns the client sends (read `supabase.js` `profileToRow`) succeeds.
- [ ] Run the harness. It must FAIL.
- [ ] Implement:
  - `revoke update on public.profiles from authenticated, anon`;
  - `grant update (<editable columns>) on public.profiles to authenticated`;
  - a BEFORE INSERT trigger that forces `is_test = false` unless `current_user` is the table owner (so the seed script runs as owner).
- [ ] Run the harness. It must PASS. Commit.

### Task 2: Candidate RPCs replace the open directory

**Files:** Modify `0003_trust_hardening.sql`; `app.js` (the deck load near `public_profiles` ≈1970, post authors ≈1418, and the requests list). Test: `trust.test.sql` and `tests/e2e/consent.spec.mjs`.

**Interfaces:**
- Produces:
  - `public.get_candidates(p_ids uuid[]) returns setof public_profile_card`, capped at 50 ids;
  - `public.search_members(p_query text, p_limit int default 20) returns setof public_profile_card`, with `p_limit` clamped to [1, 20];
  - `public.list_members(p_limit int default 20, p_after timestamptz default null)`, keyset-paged newest first, for the current deck until ORBIT is wired.
- `public_profile_card` is the same column list as `public_profiles`.
- All three functions exclude:
  - the caller;
  - rows of members without a completed profile;
  - blocked pairs, in both directions;
  - the other test world (Ruling P14).
- `revoke select on public.public_profiles from authenticated`.

- [ ] Write the tests: Review Focus 1–3; paging returns disjoint pages; anon is denied.
- [ ] Run the harness. It must FAIL.
- [ ] Implement the SQL: SECURITY DEFINER, `search_path = public`, revoke from public and anon, grant execute to authenticated.
- [ ] Client: the deck uses `list_members` (load more pages on demand), post authors and the requests list use `get_candidates`, and search uses `search_members`. Update e2e stubs and assertions (calls go to `/rest/v1/rpc/...`, never `/rest/v1/public_profiles` or `/rest/v1/profiles` for other members).
- [ ] Run the harness, `npm run build` and e2e. All must PASS. Commit.

### Task 3: Abuse caps on requests

**Files:** `0003_trust_hardening.sql`, `trust.test.sql`.

- [ ] Tests:
  - a note over 500 characters is rejected;
  - the 31st request in 24 h, or the 101st pending request, is silently not inserted (no error, no row);
  - a pending request older than 30 days counts as expired: it does not complete a match and is hidden from the Requests list;
  - `purge_expired_requests()` deletes such requests.
- [ ] Run the harness. It must FAIL.
- [ ] Implement:
  - a `check (char_length(note) <= 500)` constraint;
  - a BEFORE INSERT trigger that returns NULL when a cap is hit (silent, per Review Focus 5);
  - the expiry condition in the completion trigger and in the select policy;
  - the purge function (owner-only execute).
- [ ] Run the harness. It must PASS. Commit.

### Task 3b: Consent follow-ups from the P0 final review

**Files:** `0003_trust_hardening.sql`, `trust.test.sql`; `app.js`; `supabase.js`; `tests/e2e/consent.spec.mjs`.

- [ ] SQL tests and fixes:
  - **A block withdraws the blocker's own pending request.** Add an AFTER INSERT trigger on `brivia_blocks` that deletes the blocker's pending request to the blocked member. Test: A requests B, A blocks B, A unblocks B, B requests A → no match.
  - **Tighter insert grant.** Use `grant insert (from_id, to_id, note)` on `connection_requests`, so clients can't set `created_at` or `status`.
  - **The sender never sees a decline.** Senders read their outgoing requests only through `my_outgoing_requests()`, an RPC that shows `declined` as `pending`. Remove sender read access to `status` in the base table. Test.
  - **No oversized photos.** Add `check (photo_url is null or char_length(photo_url) <= 2048)` and the same for `cover_url`.
  - **Consistent id comparison.** Compare ids as uuid in the 0002 policy (`id = auth.uid()`).
- [ ] Client fixes:
  - `supabase.js`: a failed photo upload fails visibly. Never store a data URL.
  - Escape while a submit is in flight must not restore a pending like when the sheet is hidden. Restore only if `#pitch-modal` is visible.
  - Ignore Like clicks while the pitch sheet is opening, to prevent the double-click plain-like.
  - Use `safeImageUrl` for the CSS url() of the public-profile cover.
  - Escape the attachment `<img src>` (app.js≈1058) and `previewUrl` (≈1821).
  - Extend e2e for each change.
- [ ] Run the harness, build and e2e. All must PASS. Commit.

### Task 4: Private chat media, bucket limits, careers throttle

**Files:** `0003_trust_hardening.sql`; `supabase.js` (the `uploadMessageAttachment` area ≈110-160); `app.js` (attachment rendering); and tests.

- [ ] Tests:
  - `message-attachments` is `public = false`;
  - a select on its objects is allowed for the uploader, or for a member who is the sender or recipient of a `brivia_messages` row whose `attachment_path` equals the object name; a third party is denied;
  - every bucket has `file_size_limit` set (profile photo and cover 5 MB, community posts 10 MB, chat attachments 20 MB, résumés 5 MB) and `allowed_mime_types` set;
  - careers: more than 3 applications per email per 24 h, or more than 200 per hour overall, are rejected.
- [ ] Run the harness. It must FAIL.
- [ ] Implement the SQL. In the client:
  - store `attachment_path`;
  - render chat media through `createSignedUrl(path, 3600)`, with no `getPublicUrl` for chat media;
  - for legacy rows that have only `attachment_url`, show "Attachment unavailable".
  - Also check the protocol of attachment links (`https:` only), to close the gap noted in the Task 4 P0 report.
- [ ] Run the harness, build and e2e (add an attachment-render assertion with a stubbed signed URL). All must PASS. Commit.

### Task 5: Interaction log table

**Files:** `0003_trust_hardening.sql`, `trust.test.sql`.

- [ ] Tests:
  - an authenticated member can insert only rows with `viewer_id = auth.uid()`, only for the events `like | pass | request | accept | decline | met | letgo`;
  - a member can select only their own rows;
  - anon is denied;
  - the columns exist: `id, viewer_id, target_id, event, context, features jsonb, score real, propensity real, model_version text, created_at`.
- [ ] Run the harness. It must FAIL.
- [ ] Implement the table, an index on `(viewer_id, created_at)`, RLS, and grants.
- [ ] Run the harness. It must PASS. Commit.

### Task 6: ORBIT service trust boundary (design only)

**Files:** `docs/ORBIT_ENGINE.md` §9; `docs/DECISIONS.md`.

- [ ] Write §9.1 "Trust boundary":
  - Postgres role `orbit_svc` (never `service_role`), with explicit grants: read on profiles' public columns, `member_interest` and `member_orbit`; insert on `interaction`.
  - JWT verified locally against the project JWKS (issuer and audience checked; `sub` is the viewer).
  - Every candidate query runs with `set local request.jwt.claims` so RLS and block rules apply.
  - `toCard` is the only serializer, and a contract test enforces the whitelist.
  - Per-viewer rate limit, and a deck cache keyed by `(viewer, cell, day)`.
  - Logs carry no PII (ids only), plus health and readiness endpoints.
  - Location enters only through `set_home_location(lat, lng)`, an RPC that snaps to the H3 cell and stores only the cell.
  - A k-anonymity floor: distance bands coarsen when a cell has fewer than 5 members.
- [ ] Add decision entry D-015. Commit.

### Task 7: Seed and purge scripts for test members

**Files:** `supabase/seed/test-members.sql`, `supabase/seed/purge-test-members.sql`, `supabase/seed/README.md`. Test: `supabase/tests/seed.test.sql`.

- [ ] Tests (run after seeding in the harness):
  - 24 test members exist with `is_test = true` and emails `@test.brivia.club`, spread across 4 cities, with varied skills and looking-for;
  - a few pending requests and one match between test members;
  - a real member sees none of them through any RPC;
  - after the purge, 0 rows remain for those ids in every table (auth.users included).
- [ ] Run the harness. It must FAIL.
- [ ] Implement the seed (inserts into `auth.users` with minimal columns, then profiles) and the purge (one transaction).
- [ ] Run the harness. It must PASS. Commit.
