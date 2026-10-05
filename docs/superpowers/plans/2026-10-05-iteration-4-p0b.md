# Iteration 4 (P0-B: DPDP, member safety, honesty fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the P0-B go-live gate items before real members: an 18+ gate, a separate and withdrawable sensitive consent, self-serve account deletion including storage, a report path with a moderation contact, a privacy notice with a retention schedule, honest copy and contrast, and image compression that fails closed.

**Architecture:**
- New SQL only in `supabase/migrations/0005_p0b_dpdp_safety.sql` (R1–R7, R9) and `supabase/migrations/0006_perf_policies.sql` (R8). `0001`–`0004` are applied live and **frozen**: never edit them.
- Every new member action is one SECURITY DEFINER RPC pinned to `auth.uid()` (`declare_adult`, `report_member`, `delete_my_account`); new tables are owner-only (deny-all RLS, no client grants).
- Storage files are deleted by the client through the Storage API (SQL cannot: live `storage.protect_delete`); the deletion RPC refuses while any file remains.
- Client: `auth.html`/`script.js` (signup), `app.html`/`app.js` (card overflow, chat report, Privacy & account), new `privacy.html`, new pure modules `image-compress.js`, `account-deletion.js`, `notice-version.js`.

**Tech Stack:** Supabase Postgres (RLS, plpgsql, PostgREST RPC), vanilla JS + Vite, local harness `bash supabase/tests/run.sh` (PostgreSQL 16), Playwright route stubs (`tests/e2e/`, Playwright at `/tmp/pw`), `node --test` (`tests/unit/`), axe-core from `/tmp/pw/node_modules/axe-core` (not a repo dependency).

**Spec:** `docs/arena/2026-10-05-p0b-design.md` (rulings R1–R14 are binding; read the ruling named in each task). Also binding: `CLAUDE.md`, `docs/HANDOFF.md` §6, `docs/ORBIT_ENGINE.md` §6.4, §7, §9.1.4, §9.1.6, `docs/UX_SPEC.md`, `docs/DECISIONS.md` D-036–D-044.

## Global Constraints

- **Frozen:** `git diff 0eb76f7 -- supabase/migrations/000[1-4]*` must be empty at every commit. `docs/DECISIONS.md` only gains lines.
- **Idempotent SQL:** the harness applies every migration twice. Guarded backfills (`where ... is null`), `create table/index if not exists`, named constraints with `drop constraint if exists`, `create or replace`, no `concurrently`.
- **New tables:** `enable row level security` + `revoke all ... from public, anon, authenticated`. **Functions:** `set search_path = public` (add `extensions` only where pgcrypto is called; pgcrypto lives in schema `extensions` live and in the stub). **Definer RPCs:** `revoke all ... from public, anon` and `grant execute ... to authenticated`.
- **Error codes:** cap → SQLSTATE `PT429` (message as in each task); bad argument → `22023`; no profile → `P0002`; refused precondition → `P0001` with the exact message in the task.
- **Notice version:** `2026-10-05` — `brivia_notice_version()` returns it, `privacy.html` shows it, `notice-version.js` exports it. All three change together.
- **Moderation / grievance contact:** `thebrivia.club@gmail.com`. Emergency line: **112**.
- **Privacy:** no coordinates stored or shown; never another member's email/phone to a client; mutual matches only; landing page `index.html` is **not** touched.
- **UI:** deep-wine tokens only (`--brivia-*`, `--app-*`; no new raw hex except `#5e0b28` where R11 names it), SVG not emoji/text glyphs for new icons, visible labels, 44×44 px targets, ≥ 12 px informative text on the surfaces this plan touches, `prefers-reduced-motion` respected, dialogs are real dialogs (focus trap, Escape, focus return).
- **Spec and code together:** each task that changes behaviour updates `docs/ORBIT_ENGINE.md` / `docs/UX_SPEC.md` in the same commit (R14 lists sections).
- **Every commit:** harness, `npm run build`, `npm run test:unit`, `(cd orbit && npm test)`, and the e2e suites the task touches pass. Before any push all 3 e2e suites pass.

## Review Focus

1. A member who signed up with Google (OAuth) or before 0005 has no `adult_declared_at`: they must land on step 1 with the checkbox focused, not on step 3 — test in Task 7.
2. Account deletion interrupted half-way (network drop after some files are removed): a retry must finish; the account must never be signed out while it still exists — test in Task 9.
3. A member with more than 100 storage objects in one bucket: `list()` paging must reach empty before the RPC — test in Task 9 (unit, `account-deletion.js`).
4. Withdrawing consent when the private interests held most of the 20 points (e.g. 1 public + 19 private): redistribution gives the public one all 20 and the member stays completed — test in Task 3.
5. Reporting someone you already blocked, or who blocked you: no error, no difference in your blocks list or response — test in Task 4.

---

### Task 1: Harness fidelity and the 18+ gate (R1, R3 part)

**Files:**
- Modify: `supabase/tests/supabase-stub.sql` (add `storage.objects.owner_id text`; `storage.protect_delete()` statement trigger on `storage.objects` raising `Direct deletion from storage tables is not allowed` unless `current_setting('storage.allow_delete_query', true) = 'true'`; `auth.jwt()` returning `coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}')`)
- Modify: `supabase/tests/harness-autocomplete.sql` (also sets `adult_declared_at` via `update ... where adult_declared_at is null`)
- Modify: test files that switch the fixture off and complete members by hand (find with `grep -l brivia_member_completed supabase/tests/*.sql`): declare explicitly
- Modify: `supabase/tests/orbit-hygiene.test.sql` H3 allow-list (+ `declare_adult`, `report_member`, `delete_my_account`), `supabase/seed/test-members.sql` (declares)
- Create: `supabase/migrations/0005_p0b_dpdp_safety.sql` (section 1), `supabase/tests/p0b-adult.test.sql`
- Docs: `docs/ORBIT_ENGINE.md` §7 completion (adult gate), `supabase/migrations/README.md` (0005 section: apply only 0005, pre-flight `select count(*) from profiles where not is_test and adult_declared_at is null` after apply, expected advisor list + 3 RPCs)

**Interfaces — Produces:**
- `profiles.adult_declared_at timestamptz` (null on any non-owner insert; preserved on non-owner update).
- `public.brivia_notice_version() returns text` (immutable, `'2026-10-05'`), executable by `authenticated`.
- `public.consent_event(id bigint identity pk, member_id uuid not null /* no FK */, kind text check in ('adult','sensitive_give','sensitive_withdraw','account_deleted'), notice_version text, at timestamptz default now())` owner-only; index `(member_id, at)`.
- `public.declare_adult(p_notice_version text) returns void`: `P0002` without a profile; `22023` 'stale notice version' when ≠ `brivia_notice_version()`; sets `coalesce(adult_declared_at, now())` (using a local `set_config('brivia.consent_write','on',true)`); appends `consent_event('adult')` only on the first declaration. (Task 4 adds the tombstone check inside it.)
- `brivia_member_completed(uuid)` redefined: same body as 0004 plus `and p.adult_declared_at is not null` **inside the first `exists`**, plus `and not exists (select 1 from member_flag f where f.member_id = p_id and f.reason = 'suspended_pending_review')`.
- Guard: extend `brivia_profiles_consent_on_insert` (create or replace) to also null `adult_declared_at`; new BEFORE UPDATE trigger `brivia_profiles_consent_guard` keeps old `adult_declared_at` and `sensitive_consent_at` unless `current_setting('brivia.consent_write', true) = 'on'` or `session_user` is the table owner. **Redefine `set_sensitive_consent` in Task 3 to set that flag.** Until Task 3, 0005 must also redefine `set_sensitive_consent` minimally (0004 body + the `set_config` line) so consent still works.
- BEFORE INSERT OR UPDATE triggers on `member_orbit` and `member_interest`: when not the owner session and the member's `adult_declared_at` is null → `P0001` 'adult declaration required'.
- Backfill: `update profiles set adult_declared_at = now() where is_test and adult_declared_at is null` (as owner).

- [ ] **Step 1:** Stub changes + fixture changes; run harness: expect ALL PASSED still (0005 not written yet).
- [ ] **Step 2: failing test** `p0b-adult.test.sql` (one transaction, rolled back, style of `orbit-harvest.test.sql`):
  - A1 a member with name, cell, 20 points and **no** declaration is not completed and invisible both ways (`brivia_visible_to` false; `deck_candidates`/`search_members` of a declared viewer do not return them).
  - A2 as `authenticated`, `update profiles set adult_declared_at = now()` and `... sensitive_consent_at = now()` leave both unchanged (also after a temporary `grant update on profiles to authenticated` inside the test); an `insert` with the column set stores null.
  - A3 `declare_adult('1999-01-01')` raises 22023; `declare_adult(brivia_notice_version())` sets it, writes exactly one `consent_event('adult')`; a second call changes neither timestamp nor event count.
  - A4 before declaring, `set_home_city('in-mumbai')` and `set_member_interests(...)` raise P0001 'adult declaration required'.
  - A5 `authenticated` cannot select `consent_event`.
  - A6 a `member_flag(reason 'suspended_pending_review')` makes a completed member not completed.
- [ ] **Step 3:** Run harness → FAIL on p0b-adult (function/column missing).
- [ ] **Step 4:** Write 0005 section 1 to the interfaces above; update fixtures, seed, H3, README, spec §7.
- [ ] **Step 5:** Harness ALL PASSED (every pre-existing suite too); `bash supabase/tests/run.sh`.
- [ ] **Step 6:** Commit `feat(dpdp): 18+ declaration gate, consent events, consent column guard (R1, R3)`.

### Task 2: Signup 18+ step, step-3 rename, honest notices (R1 client, R11 signup part)

**Files:** Modify `auth.html`, `script.js`, `supabase.js` (add `declareAdult()`), `auth-polish.css`/`auth-theme.css`; Create `notice-version.js` (`export const NOTICE_VERSION = '2026-10-05'`); Test `tests/e2e/onboarding.spec.mjs`; Docs `docs/UX_SPEC.md` §A.

**Interfaces:**
- Consumes: `declare_adult(p_notice_version)` (Task 1), `profiles.adult_declared_at`.
- Produces: `supabase.js` `export const declareAdult = () => rpcCall('declare_adult', { p_notice_version: NOTICE_VERSION })`.

- [ ] **Step 1: failing e2e checks** in `onboarding.spec.mjs` (stub `rpc/declare_adult` → 204; record call order):
  - step 1 → Next without the box: stays on step 1, inline error "You need to be 18 or older to join Brivia." linked by `aria-describedby`, box focused; with the box: step 2.
  - label text "I confirm I'm 18 or older." and helper "Brivia is for adults only. We don't ask for your date of birth."; row ≥ 44 px tall; privacy link `href="/privacy.html"` `target="_blank"` on step 1 and step 2.
  - submit order with a session: `profiles` write → `declare_adult` → `set_home_*` → `set_member_interests`; `adult_declared_at` never in any `profiles` body.
  - email-confirm path: pending profile has `adultDeclared: true`; after login `declare_adult` runs before `set_home_city`.
  - a logged-in member whose own profile row has `adult_declared_at: null` but `my_onboarding_status` says `has_cell: true, interests: 3` lands on **step 1** with the box focused (OAuth / old account).
  - step 3 heading "What you care about"; step 2 notice reads exactly "We keep only a rough ~2 km square, never your exact location. Other members see a rounded distance or your city, and only once enough people are nearby."; promise line contains "nearby first, as your area fills up"; "01 / 02" counter hidden during signup.
- [ ] **Step 2:** run `node tests/e2e/onboarding.spec.mjs` → new checks FAIL.
- [ ] **Step 3:** implement: checkbox fieldset last in step 1 (above Next); validation inline (not `reportValidity`); `firstIncompleteStep` returns 1 when `!profileRow?.adult_declared_at`; `declareAdult()` after `saveProfile` in both submit paths and first in `applyPendingOnboarding`; failure → step 1 with "We couldn't record your confirmation. Please try again."; copy changes; UX_SPEC §A.
- [ ] **Step 4:** all onboarding checks PASS (existing ones updated only where copy changed by R11).
- [ ] **Step 5:** Commit `feat(signup): 18+ declaration step and honest notices (R1, R11)`.

### Task 3: Sensitive consent: give panel and redistributing withdrawal (R2)

**Files:** 0005 section 2; `supabase/tests/p0b-consent.test.sql`; `script.js`, `auth.html`, `passion-budget.js` (if a helper fits), CSS; `supabase.js` (`setSensitiveConsent(bool)`); `tests/e2e/onboarding.spec.mjs`; spec §7 + Passion Budget section; UX_SPEC consent panel.

**Interfaces — Produces:** `set_sensitive_consent(p_consent boolean) returns void` redefined: `true` → `coalesce(sensitive_consent_at, now())` + `consent_event('sensitive_give')` when it was null; `false` → delete sensitive `member_interest` rows, **redistribute** their points to the remaining rows by largest remainder (base = floor(p_i·20/Σp), each ≥ 1, leftovers to the largest fractional parts, ties by `interest_id`), refresh `profiles.skills` the way `set_member_interests` does, no `interest_rewrite` row, null the timestamp, `consent_event('sensitive_withdraw')`. Both set `brivia.consent_write` locally.

- [ ] **Step 1: failing harness** `p0b-consent.test.sql`: 8+8+4(sensitive) → withdraw → 10+10, completed, `interest_rewrite` count unchanged, one `sensitive_withdraw` event; 1 public + 19 sensitive → public gets 20; 3+3+3 public with 11 sensitive split → sums to 20, each ≥ 1, deterministic; give twice → one `sensitive_give`.
- [ ] **Step 2: failing e2e:** the "Private interests will be available soon." line is replaced by a text button "Add private interests (optional)"; it opens a panel with A's purpose copy (spec R2), an unticked checkbox "I consent to Brivia storing my private interests for this purpose.", "Continue" disabled until ticked and "Not now" of equal weight; sensitive chips appear only after Continue; submit with a sensitive pick calls `set_sensitive_consent` `{p_consent:true}` before `set_member_interests`; with no sensitive pick it is never called; a failed `set_member_interests` after consent calls `set_sensitive_consent` `{p_consent:false}`.
- [ ] **Step 3:** implement; remove the "coming soon" `SENSITIVE_CONSENT_ERROR` text in favour of opening the panel.
- [ ] **Step 4:** harness + onboarding e2e PASS.
- [ ] **Step 5:** Commit `feat(consent): separate private-interest consent; withdrawal redistributes points (R2)`.

### Task 4: `report_member`, flags, suspension, tombstone (R4, R6)

**Files:** 0005 section 3; `supabase/tests/p0b-report.test.sql`; spec §9.1.4, §7 (suspension).

**Interfaces — Produces:**
- `member_flag.expires_at timestamptz` (add column if not exists); reasons used: `reported`, `suspended_pending_review`, `rejoin_review`, founder `restricted`.
- `report_attempt(reporter_id uuid not null references profiles on delete cascade, at timestamptz default now())`, index `(reporter_id, at)`.
- `member_report(id bigint identity pk, reporter_id uuid references profiles on delete set null, target_id uuid not null /* no FK */, reason text check (...), note text check (char_length(note) <= 500), evidence jsonb not null default '[]', qualifying boolean not null, created_at timestamptz default now())`; indexes `(reporter_id, created_at)`, `(target_id)`, `(created_at)`.
- `report_member(p_target uuid, p_reason text, p_note text default null) returns void` — order exactly R4: P0002 no profile → charge `report_attempt` → >10 in 24 h → `PT429` 'report_cap' → reason in (`harassment`,`explicit`,`spam`,`fake`,`underage`,`safety`,`other`) else 22023 → self/unknown → return → block `on conflict do nothing` → same pair in 24 h → return → insert report (note: control chars stripped, trimmed, empty → null; evidence: last 50 `brivia_messages` between the pair, newest first, as `{from_me, body, kind, attachment_path, at}`) → flag rules: `qualifying` = reporter completed, same `is_test`, reporter `profiles.created_at <= now() - 7 days`, and a relation (any `interaction`, `connection_requests`, `matches` or `brivia_messages` row between them, either direction); ≥ 2 distinct qualifying reporters in 30 d → `member_flag(target,'reported', expires_at now()+90 d) on conflict do nothing`; a qualifying `underage` → `member_flag` set to `suspended_pending_review` unless the existing reason is `restricted` (upsert that only replaces `reported`/`rejoin_review`).
- `moderation_pepper(id int pk check (id=1), pepper bytea not null)` filled once with `extensions.gen_random_bytes(32)`; `moderation_tombstone(digest text pk, reasons text[], report_ids bigint[], deleted_at, expires_at)`; `brivia_email_digest(p_email text) returns text` = `encode(extensions.hmac(lower(trim(p_email)), pepper, 'sha256'), 'hex')` (owner-only).
- `declare_adult` redefined: after declaring, if the caller's `auth.users.email` digest matches a live tombstone → `member_flag(uid,'rejoin_review') on conflict do nothing`.

- [ ] **Step 1: failing harness** `p0b-report.test.sql`: R4 AC list verbatim (blocks snapshot identical for same-world vs other-world target; unknown id writes nothing; 11th call PT429 after 10 no-ops; duplicate within 24 h no second report; 1 qualifying report no flag, 2 → flag and target counted out by `refresh_cell_density`; non-qualifying (new account) never flags; underage → target not completed; evidence ≤ 50; reporting someone who blocked you or whom you blocked: no error; `authenticated` cannot read `member_report`, `report_attempt`, tombstone, pepper; tombstone rejoin → `rejoin_review` (simulate: insert tombstone with the digest of a new user's email, then `declare_adult`).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** Commit `feat(safety): report_member with cap-first, evidence, qualified flags, underage suspension, rejoin tombstone (R4, R6)`.

### Task 5: `delete_my_account`, storage delete policies, retention purge, city-wide label (R5, R7, R9)

**Files:** 0005 section 4; `supabase/tests/p0b-delete.test.sql`, `supabase/tests/p0b-retention.test.sql`; update `supabase/tests/orbit-completion.test.sql` stage 2 expectation to `'Mumbai (city-wide)'` (+ a `cell` case without suffix); spec §6.4, §9.1.6, §7 (L541 label).

**Interfaces — Produces:**
- Storage policies: "Members can delete their profile photos" / "... profile covers" `for delete to authenticated using (bucket_id = '<b>' and (storage.foldername(name))[1] = (select auth.uid()::text))`.
- `delete_my_account(p_confirm text) returns void`: uid not null else P0002; `p_confirm <> 'DELETE'` → 22023; recency: max `(elem->>'timestamp')::bigint` over `auth.jwt()->'amr'` must be ≥ `extract(epoch from now()) - 600`, else `P0001` 'reauth_required'; any `storage.objects` in buckets (`profile-photos`,`profile-covers`,`message-attachments`,`community-posts`) with folder = uid, or (any bucket except `career-resumes`) `owner_id = uid::text` or `owner = uid` → `P0001` 'storage_not_empty'; if the member has a `member_report` as target or a `member_flag` → insert/merge `moderation_tombstone` (digest of `auth.users.email`, reasons, report ids, expires +365 d); `consent_event('account_deleted')`; `delete from auth.users where id = uid`.
- `purge_expired_requests()` redefined (same signature/return): existing deletes + like/pass interactions > 180 d; other non-impression interaction events > 365 d; `member_report` > 365 d; `report_attempt` > 30 d; `member_flag where expires_at < now()`; `moderation_tombstone where expires_at < now()`; `consent_event` rows of members with an `account_deleted` event older than 1 y (all rows for that member); `career_applications` > 180 d.
- `my_onboarding_status()` redefined (type unchanged): `place_label || ' (city-wide)'` when `precision = 'place'`.

- [ ] **Step 1: failing harness** `p0b-delete.test.sql`: refuses without 'DELETE'; refuses with amr older than 10 min; refuses with an object by folder, by `owner_id`, by `owner` (career-resumes object by owner does **not** block); on success: for every FK to `public.profiles` (enumerate `pg_constraint`) no row references the uid; the member's report against someone keeps the row with `reporter_id` null; a report against the member survives; tombstone only when reported/flagged; `consent_event('account_deleted')` exists; the function never deletes from `storage.objects` (the stub trigger would raise). `p0b-retention.test.sql`: seed rows of every kind just inside and just outside each boundary; run `purge_expired_requests()`; assert kept vs deleted.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** harness PASS. **Step 5:** Commit `feat(dpdp): self-serve deletion RPC, storage delete policies, retention purge, city-wide label (R5, R7, R9)`.

### Task 6: `0006` performance policies and drift test (R8)

**Files:** Create `supabase/migrations/0006_perf_policies.sql`, `supabase/tests/policy-snapshot.sql` (helper, not `*.test.sql`); Modify `supabase/tests/run.sh` (new database `${DB}_drift`: stub + 0001–0005, snapshot `pg_policies` for schema `public` and `storage` into a table via `\copy` to `$STAGE`, apply 0006 twice, snapshot again, compare after normalising `( SELECT auth.uid() AS uid)` → `auth.uid()`; fail on any difference, any public policy qual/with_check still matching unwrapped `auth.uid()`, or a policy named "Members can send connection requests"); README 0006 section (apply only after 0005 verified; read-only pre-apply diff of live `pg_policies`).

**Interfaces:** the 17 policies and their source files are listed in the arena record (critic C, C1); copy each latest body; 4 indexes `brivia_blocks_blocked_idx`, `community_posts_author_idx`, `matches_user2_idx`, `member_orbit_place_idx`.

- [ ] Step 1: drift check in `run.sh` written first; run → FAIL (0006 missing → unwrapped `auth.uid()` found). Step 2: write 0006. Step 3: harness ALL PASSED. Step 4: Commit `perf(rls): wrap auth.uid() in 17 policies, 4 FK indexes, drift test (R8)`.

### Task 7: Media: `compressImage` fails closed, photo replace cleanup, video warning (R12)

**Files:** Create `image-compress.js` (`export async function compressImage(file, deps = browserDeps)`; `deps` = `{ createObjectURL, revokeObjectURL, loadImage(url) → {naturalWidth, naturalHeight, image}, createCanvas(w,h) → canvas, toBlob(canvas,type,q) → Blob|null, makeFile(blob,name,type) }`; throws `ImageProcessingError` with message "We couldn't process this photo. Try a JPG or PNG." on decode failure, null context, null blob; returns non-images unchanged); Modify `supabase.js` (import it; `uploadProfilePhoto/Cover(userId, file, previousUrl)` removes the previous own-folder object after a successful replace, ignoring its error), `script.js` and `app.js` (show the error inline beside the photo field, not as a toast; chat video picker shows inline before send: "Videos can include the place they were filmed. Send only if you're comfortable sharing that."); Test `tests/unit/image-compress.test.mjs`, `tests/e2e/consent.spec.mjs` (video warning + inline photo error).

- [ ] Step 1: failing unit tests (3 failure paths throw `ImageProcessingError`; success returns `image/jpeg` named `<base>.jpg` scaled to ≤ 1280; non-image passes through). Step 2: FAIL. Step 3: implement. Step 4: unit + consent e2e PASS. Step 5: Commit `fix(media): compressImage fails closed; old photo removed on replace; video location warning (R12)`.

### Task 8: Report UI: card overflow and chat (R4 client)

**Files:** `app.html` (the card's decorative `•••` becomes `<button class="card-more" aria-label="More options for {name}" aria-haspopup="menu">` 44×44 with menu items Report, Block), `app.js`, CSS, `supabase.js` (`reportMember(target, reason, note)`); Create `report-dialog.js` if it keeps `app.js` smaller (dialog markup + focus trap); Test `tests/e2e/deck.spec.mjs` (+ consent.spec for chat); UX_SPEC report section.

- Copy (exact): reasons "Harassment or hate" (harassment), "Sexual or explicit content" (explicit), "Spam or scam" (spam), "Fake profile or impersonation" (fake), "May be under 18" (underage), "I feel unsafe or threatened" (safety), "Something else" (other); note label "Anything else we should know? (optional)" + "Kept for up to a year so we can review it."; button "Report and block"; safety/underage inline "If anyone is in immediate danger, call 112."; contact line "Urgent? Email thebrivia.club@gmail.com"; success toast "Thanks. We've received your report, and you won't see {name} again."; PT429 "You've sent several reports today. For anything urgent, email thebrivia.club@gmail.com."; Blocked users list note "Unblocking doesn't cancel a report you've made."; chat `•••` item "Report and block" after "Block user".
- [ ] Step 1: failing e2e (stub `rpc/report_member`): overflow opens with keyboard, Escape closes and returns focus; submit sends `{p_target,p_reason,p_note}`; deck advances like a Pass (one card fewer, no pass interaction POST); toast text; PT429 text; 112 line only for safety/underage; dialog has no horizontal scroll at 375 px; chat menu item works and the chat closes with the member blocked locally. Step 2: FAIL. Step 3: implement. Step 4: deck + consent e2e PASS. Step 5: Commit `feat(safety): report from card overflow and chat (R4)`.

### Task 9: Privacy & account: withdraw consent, delete account (R2 withdraw, R5 client)

**Files:** Create `account-deletion.js` (pure, injectable: `export async function deleteAccount({ storage, rpc, signOut, clearLocal, buckets, uid })` → `{ ok: true } | { ok: false, stage: 'storage'|'rpc'|'reauth', error }`; pages `storage.from(b).list(uid, { limit: 100, offset })` until a page is short, removes in batches, re-lists until empty; calls `rpc('delete_my_account', { p_confirm: 'DELETE' })`; only on success `signOut({ scope: 'local' })` (errors ignored) and `clearLocal()` removing every `brivia-*` key); Modify `app.js` (profile settings menu gains "PRIVACY & ACCOUNT"; section with consent status + "Withdraw consent" dialog per R2 copy "Withdraw consent? We'll delete your private interests now and spread their points across your other interests. You can add them again later." buttons "Withdraw and delete" / "Keep"; "Delete my account" dialog listing what is deleted and what remains (R5 disclosure list), input labelled "Type DELETE to confirm" (`trim().toUpperCase()`), button aria-disabled until match; on `reauth` stage prompt for password and `signInWithPassword` (OAuth members: re-run OAuth with a return flag) then retry; failure copy in `role="alert"`: storage "We removed some of your files but couldn't finish. Nothing else was deleted. Try again." / rpc "Your photos and files are gone, but your account still exists. Try again to finish, or email thebrivia.club@gmail.com."; success → `location.assign('/privacy.html?deleted=1')`); Test `tests/unit/account-deletion.test.mjs`, `tests/e2e/consent.spec.mjs`.

- [ ] Step 1: failing unit tests: 230 objects in one bucket → all removed across pages before the RPC; storage error → `{ok:false, stage:'storage'}` and no RPC/signOut; RPC `reauth_required` → `stage:'reauth'`, no signOut; RPC error → `stage:'rpc'`, no signOut; success → signOut local + clearLocal; retry after partial failure finishes.
- [ ] Step 2: failing e2e: menu item, dialogs (focus trap/Escape), DELETE gating, mocked Storage `list`/`remove` + RPC success lands on `/privacy.html?deleted=1`; mid-way storage failure shows the storage copy and a retry succeeds; withdraw calls `set_sensitive_consent {p_consent:false}` and the member stays in the app.
- [ ] Step 3: implement. Step 4: unit + consent e2e PASS. Step 5: Commit `feat(dpdp): Privacy & account: withdraw consent and self-serve deletion (R2, R5)`.

### Task 10: `privacy.html`, honesty, contrast, 12 px, focus, glyphs, quota copy (R10, R11), axe checks

**Files:** Create `privacy.html` + `privacy.css` (add to `vite.config.mjs` inputs), `tests/unit/notice-version.test.mjs` (the version in `privacy.html`, `notice-version.js` and the `brivia_notice_version()` body in 0005 are equal); Modify `app.html`/`explore.html`/CSS (remove `.verified-mark`, `.explore-row-verified`), `auth.html` preview headline "THE KIND OF PEOPLE WE'RE BUILDING FOR." (cards unchanged pending founder consent confirmation), `signal-quota.js` (R7 copy: "N of 30 signals left · 24-hour window"; zero: "Your next signal frees up at 3 PM" with `hour: 'numeric'`) + `tests/unit/signal-quota.test.mjs`, deck caught-up copy and the note under place-name bands "Distances appear as your area fills up.", step label colour `#5e0b28`, quota line ≥ 12 px full ink, one SVG Pass glyph `aria-label="Pass"` and Like `aria-label="Pitch"`, `:focus:not(:focus-visible)` scoped to buttons and chips, ≥ 12 px on signup/deck/report/delete/privacy; e2e: `onboarding.spec.mjs` + `deck.spec.mjs` run axe `color-contrast` (from `AXE_PATH`, default `/tmp/pw/node_modules/axe-core/axe.min.js`) on signup steps 1–4 and the deck card, and assert computed font-size ≥ 12 px for visible text there; a privacy check (375 px no horizontal scroll, `?deleted=1` banner `role="status"` text "Your account and everything in it has been deleted. Sorry to see you go.", axe passes); README of e2e documents `npm install --prefix /tmp/pw playwright axe-core`.

privacy.html sections in order (R10): The short version (5 bullets); What we collect; Your area (~2 km square, rounded distances, city for city picks); Private interests; Who sees what; Adults only (18+); How long we keep things (`<table>` with caption, rows = R7 table, stacked < 480 px); Deleting your account (and what remains, R5 list); Where your data lives (Supabase, Mumbai, India, ap-south-1); Reports and safety (72 h review of under-18 reports, 112); Your rights (access, correction, erasure, withdraw consent, grievance, nominee, complain to the Data Protection Board of India); Grievance officer (the founder, thebrivia.club@gmail.com, reply within 7 days, resolve within 90 days); Version `2026-10-05` and effective date.

- [ ] Step 1: failing unit + e2e checks. Step 2: FAIL. Step 3: implement. Step 4: unit + all 3 e2e PASS, `npm run build` includes `privacy.html`. Step 5: Commit `feat(ux): privacy notice, honesty and contrast fixes, axe checks (R10, R11)`.

### Task 11: Runbook, records, controller check (R13, R14)

**Files:** Create `docs/BREACH_RUNBOOK.md` (R13 contents, templates, nightly orphan-folder report query: storage objects whose first folder is not an `auth.users` id); Modify `docs/arena/2026-10-03-iteration-3.md`? **No** (records are not rewritten); Modify `docs/HANDOFF.md` (later, session end); append `docs/DECISIONS.md` D-045 (P0-B delivered: what landed, deviations, counsel items, live apply steps for 0005 then 0006, amr-shape check to do on a live session).

- [ ] Step 1: controller check: harness ALL PASSED; build; unit; orbit; 3 e2e; `git diff 0eb76f7 -- supabase/migrations/000[1-4]*` empty; `git diff 0eb76f7 -- docs/DECISIONS.md | grep '^-[^-]'` empty; `dist/` grep shows no `service_role`. Step 2: Commit `docs: breach runbook; D-045 P0-B delivered`.

## Self-review notes
- Coverage: R1 → T1/T2; R2 → T3/T9; R3 → T1 (events written in T1/T3/T5); R4 → T4/T8; R5 → T5/T9; R6 → T4/T5; R7 → T5 + T10 table; R8 → T6; R9 → T5 (+ client append after `set_home_city` in T2); R10/R11 → T10 (+ signup copy T2); R12 → T7; R13 → T11; R14 → each task's docs line.
- R9 client part: Task 2 appends " (city-wide)" to the label shown after `set_home_city`.
