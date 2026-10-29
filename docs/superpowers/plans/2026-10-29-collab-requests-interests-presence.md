# Collaboration requests, interest catalogue, active status, post-card polish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four founder asks, one PR each, in order: tidy post cards, a swipeable "See who wants to collaborate
with you" review sheet, the founder's A–Z interest catalogue with "Other", and an active-status dot for connections.

**Architecture:** Tasks 1–2 are client only (Vite, vanilla JS in `site/scripts/`, CSS in `site/styles/`). Task 3 adds
migration 0017 (catalogue nodes, `catalog_order`, `add_member_interest`) generated from a checked-in classification
file. Task 4 adds migration 0018 (`member_presence` and three definer RPCs). Every new call degrades silently when its
migration is not applied.

**Tech Stack:** Vite, vanilla ES modules, Supabase (Postgres RLS + SECURITY DEFINER RPCs), node:test, Playwright e2e
with the stubbed Supabase in `tests/e2e/app-stub.mjs`, axe-core.

**Spec:** `docs/superpowers/specs/2026-10-29-collab-requests-interests-presence-design.md`

## Global Constraints

- Brand: deep wine, cream, Bodoni Moda + Instrument Sans; reuse the shared components in `site/styles/components.css`
  (`.b-field`, `.b-combo`, `.b-listbox`, `.b-option`, `.b-chips`, `.b-chip`) and the toast; rules in `docs/UX_SPEC.md`.
- Request wording: collaborate, connect, not now, request. Never match, like, pass, swipe right, crush or hearts.
- Location privacy: distance shown only as the existing band; presence never returns a time, only `true`/`false`.
- Migrations 0001–0016 are frozen: never edit them. New SQL goes in 0017 and 0018 only.
- Every new definer RPC is added (alphabetically) to the allowlist in `supabase/tests/orbit-hygiene.test.sql`.
- Missing function or table → feature hides, no toast. Toasts only for actions the member took (Connect, Not now, Add interest).
- Each task appends a `docs/DECISIONS.md` entry (next is D-107) and updates `docs/UX_SPEC.md` / `docs/HANDOFF.md`;
  migration tasks also add a section to `supabase/migrations/README.md`.
- Commits end with the session's Co-Authored-By and Claude-Session lines; never commit regenerated `__pycache__` files.
- Ship per task: unit + SQL + e2e green, `npm run -s check:styles`, `npx vite build`, screenshots at 1440 and 390 px
  reviewed, PR → Vercel preview + GitGuardian green → merge → production deploy verified.

## Review Focus

1. A request whose sender profile could not load (`person: null`) → the review card still renders ("A Brivia member",
   initials avatar, no shared interests row), never a blank card. Test in Task 2.
2. Connect fails on the network → card stays, toast "That request could not be updated. Please try again.", buttons
   re-enabled; a double tap on Connect sends one RPC. Test in Task 2.
3. "Other" typed with the same label as a catalogue node in a different case ("python") → the existing node is picked,
   no new node; leading/trailing/double spaces collapsed. SQL test in Task 3.
4. A member who already holds a non-catalogue interest (from 0004) opens Edit profile → the chip stays and saves; it is
   just not offered in the dropdown. e2e in Task 3.
5. Presence for an id that is not the caller's match, or after either side turns visibility off → `false`; the dot
   disappears on the next 60 s refresh. SQL test + e2e in Task 4.

---

### Task 1: Post-card polish

**Files:**
- Modify: `site/scripts/post-card.js` (`actionButton`, `activityLine`)
- Modify: `site/scripts/app.js:3237` (`paintPostActivity`)
- Modify: `site/styles/explore-cards.css` (drop `.post-card-count` badge; add inline count and `.post-card-footer`)
- Test: `tests/unit/post-card.test.mjs`, `tests/e2e/explore-cards.spec.mjs`, `tests/e2e/post-activity.spec.mjs`

**Interfaces:**
- Produces: `export const postFooterMarkup = (activity, summary, escapeHtml) => string` in `post-card.js`, used by both
  `postCardMarkup` and `paintPostActivity` (the repaint replaces the footer's innerHTML/outerHTML with it).
- Markup: count is `<span class="post-card-count" data-post-count="like|comment|share">N</span>` placed right after the
  svg, before the label; absent when 0. Footer is always present:
  `<div class="post-card-footer">` + left `<p class="post-card-likes" data-post-likes>` + right
  `<button class="post-card-comments-link" data-post-action="comment">View N comments|View the comment</button>`;
  with no likes and no comments: `<p class="post-card-likes is-empty">Be the first to like this</p>`.

- [ ] **Step 1: Write failing unit tests** in `post-card.test.mjs`: `footer always present` (no activity → contains
  `post-card-footer` and `Be the first to like this`); `inline count` (likeCount 3 → `data-post-count="like">3<` and no
  `aria-label="3"` badge); `999+ cap` kept; `footer with likes and comments` (summary "Liked by Asha and 2 others",
  commentCount 3 → both texts, `View 3 comments`); `save never shows a count`.
- [ ] **Step 2: Run** `node --test tests/unit/post-card.test.mjs` → FAIL (`postFooterMarkup` missing / old badge).
- [ ] **Step 3: Implement** `postFooterMarkup`, inline counts; make `paintPostActivity` update the inline count spans
  and replace `.post-card-footer` with `postFooterMarkup(...)`. CSS: footer `min-height` fixed (one line, 
  `white-space: nowrap; text-overflow: ellipsis`), counts `font-variant-numeric: tabular-nums`, muted empty text;
  remove the absolute badge rule.
- [ ] **Step 4: Run** `npm run test:unit` → all pass.
- [ ] **Step 5: Update e2e** in `explore-cards.spec.mjs`: every card in a grid row has equal `offsetHeight` and its
  `.post-card-actions` top equal (1440 and 390); in `post-activity.spec.mjs` replace badge selectors with
  `[data-post-count]` text and assert the footer flips from "Be the first to like this" to "Liked by You" after a like.
- [ ] **Step 6: Run** both specs + `npm run -s check:styles` → ALL PASSED; take screenshots, review.
- [ ] **Step 7: Commit** (D-107 in DECISIONS, UX_SPEC post-card section) and ship PR 1.

### Task 2: Collaboration requests review sheet

**Files:**
- Create: `site/scripts/collab-requests.js` (pure helpers + sheet controller)
- Create: `site/styles/collab-requests.css` (loaded from `app.js` before `components.css`)
- Modify: `site/scripts/app.js:413-460` (`renderNotifications` requests section), `:1275` (`respondToRequest` returns
  `{ ok, connected }` and stops toasting when called from the sheet)
- Test: `tests/unit/collab-requests.test.mjs`, create `tests/e2e/collab-requests.spec.mjs`; update any app-shell
  assertions that click `data-request-respond`.

**Interfaces:**
- Consumes: `createDeckSwipe({ card, stack, canDrag, onCommit })` from `deck-swipe.js` (`onCommit(direction)` with
  `'pitch'` = right = Connect, `'pass'` = left = Not now); `pendingRequests` items `{ fromId, note, createdAt, person }`.
- Produces:
  - `collabSummary(requests) => { avatars: person[] (≤3), text: '1 person wants to connect' | 'N people want to connect' }`
  - `reviewCardModel(request, myInterestLabels: string[]) => { name, role, band, shared: string[] (≤3), note, initials }`
    (`name` falls back to "A Brivia member"; `shared` = case-insensitive intersection of `person.skills` labels with
    the member's own interest labels).
  - `openCollabReview({ requests, respond: (fromId, accept) => Promise<{ok, connected}>, onMessage: (person) => void, returnFocus: HTMLElement, myInterests: string[] }) => { close() }`
- Section markup in the panel: `<section class="notification-collab">` with title "See who wants to collaborate with
  you", overlapping avatars, the summary text, `<button data-collab-review>Review</button>`.
- Sheet: `role="dialog" aria-modal="true" aria-labelledby`; counter "1 of 3"; buttons "Not now" and "Connect"; stamps
  CONNECT / NOT NOW; after Connect with `connected` → "You're connected" + Message button (1.6 s, or until tapped) then
  next card; end state "You're all caught up." + Done. ArrowRight = Connect, ArrowLeft = Not now, Escape closes; Tab is trapped inside the sheet and focus returns to Review (or the bell when the panel is gone);
  `prefers-reduced-motion` → opacity fade, no fly. Bottom sheet ≤640 px, centred 420 px card above.

- [ ] **Step 1: Write failing unit tests**: `collabSummary` (0, 1, 4 requests: text and avatars capped at 3);
  `reviewCardModel` with `person: null` (Review Focus 1) and with shared interests (case-insensitive, capped at 3);
  `wording` test: rendered sheet HTML string from an exported `reviewCardMarkup(model, escapeHtml)` contains none of
  /match|like|pass|swipe|crush|heart/i.
- [ ] **Step 2: Run** `node --test tests/unit/collab-requests.test.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement** helpers, `reviewCardMarkup`, `openCollabReview`; swap the panel's REQUESTS block for the
  section; Review closes the panel and opens the sheet; a busy flag per card blocks double RPCs (Review Focus 2).
- [ ] **Step 4: Run** `npm run test:unit` → pass.
- [ ] **Step 5: Write e2e** `collab-requests.spec.mjs` (stub seeds 3 pending requests; 1440 and 390): section text and
  "3 people want to connect"; Review opens dialog with "1 of 3"; Connect posts `respond_connection_request` with
  `p_accept: true` and shows "You're connected"; drag left > threshold posts `p_accept: false`; ArrowRight works; after
  last card "You're all caught up."; focus returns to the bell; RPC 500 → toast + card stays + one request only; axe
  clean on the open sheet; no forbidden words in `document.body.innerText` of the sheet.
- [ ] **Step 6: Run** the new spec, `app-shell`, `chat-inbox`, `deck` specs → ALL PASSED; screenshots reviewed.
- [ ] **Step 7: Commit** (D-108, UX_SPEC "Collaboration requests") and ship PR 2.

### Task 3: Interest catalogue (0017) and "Other"

**Files:**
- Create: `supabase/catalog/interest-catalog.tsv` (columns: `label<TAB>node_id`; one row per unique founder label,
  A–Z; `node_id` is either an existing 0004 id reused because its label matches case-insensitively, or a new
  `domain.category.slug` under the closest existing level-2 category — the classification is decided here, once)
- Create: `scripts/build-interest-catalog.mjs` (reads the TSV, validates, prints `0017` data section)
- Create: `supabase/migrations/0017_interest_catalog.sql`
- Create: `supabase/tests/g-interest-catalog.test.sql`
- Modify: `supabase/tests/orbit-hygiene.test.sql` (allowlist `add_member_interest`)
- Modify: `site/scripts/supabase.js:302` (`fetchInterestNodes` selects `catalog_order` too; falls back to the old
  column list when the column is missing — Postgres error `42703`), add `addMemberInterest(label)`
- Modify: `site/scripts/signup-flow.js` (new `catalogGroups`), `site/scripts/signup-screens.js:561-666` (menu uses
  `catalogGroups` when any node has `catalog_order`, else `groupInterests`; "Other" row), `site/scripts/app.js:2479`
  (`wireChipPicker` gains optional `groups` + `onCustom`), `:2573` (`wireInterestEditor` passes them)
- Test: `tests/unit/interest-catalog.test.mjs`, `tests/unit/signup-flow.test.mjs`, `tests/e2e/profile-edit.spec.mjs`,
  `tests/e2e/onboarding.spec.mjs` (or `signup.spec.mjs`, whichever drives the interests screen), stub support in
  `tests/e2e/app-stub.mjs` for `catalog_order` and `add_member_interest`.

**Interfaces:**
- SQL: `alter table public.interest_node add column if not exists catalog_order int;` catalogue rows get 1..N in A–Z
  order (`lower(label)`); new nodes inserted with `parent_id` = their level-2 category, `level` 3, `sensitive` false.
  Level-1 `member` "Member interests" and level-2 `member.custom` "Your own" created (no `catalog_order`).
- SQL: `public.add_member_interest(p_label text) returns text` (security definer, `search_path = ''`, granted to
  `authenticated` only). Normalise `regexp_replace(btrim(p_label), '\s+', ' ', 'g')`; reject length <2 or >40, any
  char outside letters (any script), digits, space and `& + - . ' /` (`!~ '^[[:alpha:][:digit:] &+./''-]+$'`), or a word on an inline blocked list
  → `raise exception 'not allowed' using errcode = '22023'`. Existing active node with `lower(label) = lower(v)` →
  return its id. Else cap: `> 5` nodes created by this member in 24 h → errcode `PT429` 'try again later' (track in a
  new `public.member_custom_interest(member_id uuid references profiles on delete cascade, node_id text, created_at
  timestamptz default now())`, RLS on, no grants). Slug: `lower`, non-alnum → `_`, trimmed, max 40; on collision
  append `_2`, `_3`…; insert `member.custom.<slug>` level 3; return id. Anon / no profile → `42501`.
- JS: `catalogGroups(nodes) => [{ id: 'A', label: 'A', items: node[] }, …]` — only nodes with `catalog_order` that
  pass `isOffered`, sorted by `catalog_order`, grouped by the upper-cased first letter (non A–Z → '#', last).
- JS: `addMemberInterest(label) => Promise<{ data: string|null, error }>` (rpc `add_member_interest`).
- JS: `normalizeInterestLabel(text) => string` (same rule as SQL; client pre-check, returns '' when invalid) in
  `signup-flow.js`.
- UI: search narrows across all catalogue items (letter headings hidden while searching); last row when the typed
  text matches no label exactly: `Add “…” as your own interest` (class `b-option-add` / `guided-menu-option is-add`);
  choosing it calls `addMemberInterest`, adds the returned id with the typed label as a chip, status "… added. Save
  changes to keep it." Errors: `22023` → "That interest can't be added. Try different wording."; `PT429` → "You've
  added 5 of your own today. Try again tomorrow."; missing function → the Add row is not shown.

- [ ] **Step 1: Build the TSV**: dedupe the founder list (case-insensitive; "UI Design", "UX Research", "Extreme
  Programming" collapse), match each label to existing 0004 labels, classify the rest into existing level-2
  categories (no `member.*`, nothing sensitive). Commit the TSV on its own so the classification can be reviewed.
- [ ] **Step 2: Write failing SQL tests** in `g-interest-catalog.test.sql`: every TSV label present once with
  `catalog_order` (count equals TSV rows); every catalogue node is level 3–4, not sensitive, parent exists;
  `add_member_interest(' python ')` returns the existing Python node (Review Focus 3); `'Kite  Surfing Club'` creates
  `member.custom.kite_surfing_club`, second call returns the same id; colliding slug gets `_2`; `'a'`, 41 chars,
  `'<script>'` and a blocked word raise 22023; sixth new label in 24 h raises PT429; anon raises 42501; the new node is
  accepted by `set_member_interests`; migration re-runs cleanly (harness runs it twice).
- [ ] **Step 3: Run** `bash supabase/tests/run.sh` → FAIL (0017 missing).
- [ ] **Step 4: Implement** `build-interest-catalog.mjs` and `0017_interest_catalog.sql` (idempotent: `on conflict (id)
  do update set label, catalog_order`, never un-retire), hygiene allowlist, README section.
- [ ] **Step 5: Run** `bash supabase/tests/run.sh` → ALL PASSED.
- [ ] **Step 6: Write failing unit tests**: `catalogGroups` (letter grouping, order by `catalog_order`, excludes
  sensitive/uncatalogued, '#' last); `normalizeInterestLabel` (spaces collapsed, 2/40 bounds, disallowed chars → '').
- [ ] **Step 7: Run** `npm run test:unit` → FAIL; implement; run → pass.
- [ ] **Step 8: Wire the UI** in the guided signup menu and `wireChipPicker` as specified above.
- [ ] **Step 9: Write e2e**: Edit profile dropdown shows "A" then "B" headings with founder labels; typing "zym" finds
  Zymology; typing "Kite surfing club" shows the Add row, choosing it adds a chip and Save sends the returned id in
  `set_member_interests`; a member holding an uncatalogued node keeps the chip and it saves (Review Focus 4); signup
  interests screen shows letter headings and the Add row; stub without `add_member_interest` hides the Add row; axe
  clean on the open listbox at 1440 and 390.
- [ ] **Step 10: Run** profile-edit, onboarding/signup, deck, consent specs → ALL PASSED; screenshots reviewed.
- [ ] **Step 11: Commit** (D-109; ORBIT spec note in `docs/ORBIT_ENGINE.md` §3.1 that catalogue and member-custom
  nodes are ordinary level-3 nodes, in the same commit) and ship PR 3. Ask the founder to apply 0017.

### Task 4: Active status (0018)

**Files:**
- Create: `supabase/migrations/0018_member_presence.sql`, `supabase/tests/h-member-presence.test.sql`
- Create: `site/scripts/presence.js`
- Modify: `supabase/tests/orbit-hygiene.test.sql` (allowlist `connection_presence`, `set_presence_visible`,
  `touch_presence`), `site/scripts/app.js:1772` (chat row avatar dot), chat header (`#chat-avatar`, `#chat-status`),
  `:1907` (sync loop), `:2800` (Settings toggle), `site/styles/chat-extras.css` (dot), privacy notice page line.
- Test: `tests/unit/presence.test.mjs`, create `tests/e2e/presence.spec.mjs`, stub support in `app-stub.mjs`.

**Interfaces:**
- SQL: `public.member_presence(member_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(), visible boolean not null default true)`, RLS on, no grants.
- SQL (all definer, `search_path = ''`, `authenticated` only):
  - `touch_presence() returns void` — upsert own row; skip the write when `last_seen_at > now() - interval '30 seconds'`.
  - `connection_presence(p_ids uuid[]) returns table(member_id uuid, active boolean)` — at most 100 ids; one row per
    id that is the caller's match (via `public.matches`); `active` true only when both rows have `visible`, and the
    other's `last_seen_at >= now() - interval '3 minutes'`; non-matches are omitted.
  - `set_presence_visible(p_visible boolean) returns void` — upsert own row's `visible`.
  - `my_presence_visible() returns boolean` (default true when no row) for the Settings toggle; allowlisted too.
- JS `presence.js`: `createPresence({ touch, fetch, intervalMs = 60000, onChange })` → `{ start(), stop(), isActive(id) }`
  where `touch()`/`fetch(ids)` are injected RPC wrappers; touches on start, every interval while
  `document.visibilityState === 'visible'`, and on `focus`; a missing-function error (`PGRST202`/`42883`) stops the loop
  and `isActive` stays false. `presenceDot(active) => string` (`<span class="presence-dot" aria-hidden="true">` or '').
- UI: dot (green `#2f9e68`, 2 px cream ring) bottom-right of chat-row and chat-header avatars; the row's accessible
  name gets ", active now"; `#chat-status` reads "Active now" when active. Settings row "SHOW WHEN I'M ACTIVE" /
  "Connections see a dot when you're here. Turn it off to hide it both ways."

- [ ] **Step 1: Write failing SQL tests**: touch twice inside 30 s writes once; match + both visible + recent → true;
  stale (4 min) → false; non-match id omitted; either side `visible = false` → false (Review Focus 5); >100 ids raises
  22023; anon refused; profile delete cascades; no time column is returned.
- [ ] **Step 2: Run** `bash supabase/tests/run.sh` → FAIL; implement 0018, allowlist, README; run → ALL PASSED.
- [ ] **Step 3: Write failing unit tests** for `createPresence` with fake timers/injected fns (touch on start; no touch
  while hidden; stop on missing function; `onChange` only when the set changes) and `presenceDot`.
- [ ] **Step 4: Run** `npm run test:unit` → FAIL; implement; run → pass.
- [ ] **Step 5: Wire UI** (chat list, header, Settings toggle, privacy notice line).
- [ ] **Step 6: Write e2e** `presence.spec.mjs` (1440, 390): an active connection shows the dot in the list and header
  and "Active now"; an inactive one shows neither; toggling Settings off calls `set_presence_visible(false)` and dots
  vanish on the next refresh (fast interval via stub); stub without the RPCs → no dots, no errors, no toast; axe clean.
- [ ] **Step 7: Run** presence, chat-inbox, chat-extras, app-shell specs → ALL PASSED; screenshots reviewed.
- [ ] **Step 8: Commit** (D-110, UX_SPEC, HANDOFF, privacy notice) and ship PR 4. Ask the founder to apply 0018.
