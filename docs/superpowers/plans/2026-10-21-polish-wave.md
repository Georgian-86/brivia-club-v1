# Polish Wave (2026-10-21) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six live-site faults (A), bring back the one-question-per-screen signup with Google kept and no points
screen (B), restyle Explore posts as wine post cards with persistent like/save (C), and add resume upload, chat
quick-share and a typing indicator (D), each part shippable to `main` on its own.

**Architecture:** Client stays Vite + vanilla JS in `site/`. New behaviour goes into small pure modules
(`geo-locate.js`, `signup-flow.js`, `post-card.js`, `post-reactions.js`, `resume-file.js`, `chat-typing.js`) that are
unit-tested with `node --test` and wired into the existing `app.js` / `script.js` in named regions. Each part has its
own new stylesheet (created empty in Task 0, so no part edits another's CSS or import lines). All SQL goes into one
idempotent `supabase/migrations/0012_polish_wave.sql` with one section per part (A5, C, D), each with its own harness
test; the founder applies it once (see "Release and 0012").

**Tech Stack:** Vite, vanilla JS/CSS, supabase-js (PostgREST, Storage, Realtime broadcast with private channels),
PostgreSQL 16 harness (`supabase/tests/run.sh`), `node --test`, Playwright + axe-core at `/tmp/pw` against a stubbed
Supabase (`tests/e2e/app-stub.mjs`, `st.routes` overrides).

**Spec:** `docs/superpowers/specs/2026-10-21-polish-wave-design.md` (founder-approved). Read with `CLAUDE.md`,
`docs/HANDOFF.md`, `docs/UX_SPEC.md`, `docs/ORBIT_ENGINE.md` §4.1 and §9.1.4, `supabase/migrations/README.md`, and
DECISIONS D-065 to D-071.

## Global Constraints

- **Brand:** deep-wine tokens only (`--brivia-deep-wine #430416`, `--brivia-wine #5e0b28`, `--brivia-wine-soft`,
  `--color-oxblood`, `--color-chat-wine`, from `tokens.css` / `deep-wine-theme.css`). No raw hex and no new font
  families in new CSS; headings `var(--font-heading)` (Bodoni Moda), body `var(--font-body)` (Instrument Sans).
  `npm run check:styles` may only fall. The Anthropic brand kit is not applied.
- **UX floor (ui-ux-pro-max):** targets ≥ 44×44 px; text contrast ≥ 4.5:1 (computed ratio, axe is blind on cream);
  no horizontal overflow from 320 to 2560 px; `prefers-reduced-motion` respected (fade, no movement); focus visible;
  one primary action per screen; no text under 12 px; 16 px form fields on phones; SVG icons, never emoji, in new UI.
- **Viewports for every e2e and screenshot set:** 320, 375, 390, 768, 1280×800, 1440×900, 1920×1080; part A2 also
  1280×720, 1366×768, 1536×864.
- **Location privacy:** coordinates exist only in the POST body of `set_home_location`; never stored, logged, shown or
  sent in chat. Shared area = the member's own `place_label` text only.
- **Contact privacy:** never send email or phone to other clients. Resume files are never public; links are signed
  on open, 60 s.
- **Mutual consent:** resume share only inside an existing match (`brivia_private.brivia_can_message`).
- **Blocks are never revealed:** no response, row, column, count or error differs for a blocked sender.
- **SQL:** `0001`–`0011` are frozen (never edit). Every change goes into `0012_polish_wave.sql`, idempotent (the
  harness applies it twice), `set search_path = public` on every function, revokes from `public, anon` before grants,
  policy helpers in `brivia_private`. Never write the live database; the founder applies SQL.
- **Notice version** stays `2026-10-05` (`site/scripts/notice-version.js`, `site/privacy.html`, 0011).
- **Commits:** end with exactly `Claude-Session: https://claude.ai/code/session_01BPtSsvGbTkCpzEXTbQkfEX`; no
  `Co-Authored-By`. DECISIONS is append-only (D-072 A, D-073 B, D-074 C, D-075 D).
- **Spec drift rule:** a change to location, search or matching behaviour updates `docs/ORBIT_ENGINE.md` in the same
  commit.

**Gate (every release task; "full gate"):**
```bash
npm run test:unit                      # all pass
(cd orbit && npm test)                 # 86/86
bash supabase/tests/run.sh             # ends with "ALL PASSED"
npm run check:styles && npm run check:assets
VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
export PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium
for s in consent deck onboarding app-shell landing landing-sound location fit signup explore-cards chat-extras; do
  [ -f tests/e2e/$s.spec.mjs ] && node tests/e2e/$s.spec.mjs; done      # each prints "N passed, 0 failed"
node scripts/visual-parity.mjs compare .superpowers/sdd/2026-10-12-phase-c-consistency/landing-before --pages index,auth --expect-diff <intended>
```

## Review Focus

1. **A blocked sender sees no difference at all**: send succeeds, own thread shows it, no toast, same latency, no
   error code; the recipient sees no row, no realtime event, no notification, no attachment, no typing. Pinned in A5
   (SQL S1–S7) and D5 (typing suppression).
2. **Geolocation answered late or failing on macOS** (permission prompt answered after 15 s; "Location Services off"
   → `POSITION_UNAVAILABLE`): a reasonable person expects their "Allow" to count and a specific line when it cannot.
   Pinned in A1 (`location.spec.mjs` L2, L4).
3. **A resume link outliving the match or the block**: unmatch, block or delete the resume, then open an old resume
   message: no file, honest copy "This resume is no longer shared." Pinned in D1 (R5, R6) and D4 (e2e Q4).
4. **A file that claims to be a PDF but is not** (renamed .docx, 0-byte, 5 MB + 1 byte, `%PDF` missing): refused
   before upload with the field error; the bucket refuses non-PDF MIME and > 5 MB server-side. Pinned in D3 unit
   tests and D1 (R2).
5. **Double taps and failures on like/save** (two quick taps, offline, 403): one row at most, the UI returns to the
   server truth with a toast. Pinned in C2 (unit) and C3 (e2e E4).

---

## File ownership and parallelism

| Part | Owns (exclusive) | Shared file, exact region it may touch |
|---|---|---|
| Task 0 | the four empty `app.js` CSS imports, two `auth-entry.js` imports, `0012` skeleton, README 0012 skeleton | — |
| A | `geo-locate.js`, `chat-fit.css`, `menus-fit.css`, `tests/e2e/location.spec.mjs`, `tests/e2e/fit.spec.mjs`, `tests/unit/geo-locate.test.mjs`, `tests/unit/showcase-cards.test.mjs`, `supabase/tests/a5-blocked-send.test.sql` | `script.js` 960–1100 (`GEO_OPTIONS` … `keepCurrentArea`); `app.js` 283–377 (notifications) and 423–470 + 1806–1830 (settings menu); `auth.html` 205–223 (marquee); `auth-polish.css` line 2576 only; `0012` §A5; README §0012 "A5"; `orbit-hygiene.test.sql` H3 (lines 150–165) |
| B | `signup-flow.js`, `signup-screens.js`, `signup.css`, `auth-refresh.css`, `tests/e2e/signup.spec.mjs`, `tests/unit/signup-flow.test.mjs` | `script.js` 700–720 (view switch), 1540–1600 (auth views, Google), 1660–1700 (routing), 2180–2290 (submit); `auth.html` 1–199 (login/signup views; not the marquee); `passion-budget.js` (append `evenSplit`); `onboarding.spec.mjs`/`consent.spec.mjs` vite `env` line only; `.env.example` |
| C | `post-card.js`, `post-reactions.js`, `explore-cards.css`, `tests/e2e/explore-cards.spec.mjs`, `tests/unit/post-card.test.mjs`, `tests/unit/post-reactions.test.mjs`, `supabase/tests/c-post-reactions.test.sql` | `app.js` 2230–2340 (community posts) + `routeFromUrl` (503–507, `?post=`); `app.html` 34–46 (posts view); `app-skeletons.js` `posts` kind; `0012` §C; README §0012 "C" |
| D | `resume-file.js`, `chat-typing.js`, `chat-extras.css`, `tests/e2e/chat-extras.spec.mjs`, `tests/unit/resume-file.test.mjs`, `tests/unit/chat-typing.test.mjs`, `supabase/tests/d-resume.test.sql`, `supabase/tests/d-typing.test.sql` | `app.js` 22–24 (imports), 1582–1691 (`openChat`, `renderMessages`, `closeSelectedChat`), 2196–2229 (`renderProfile`), 2645–2746 (`ensureChatComposer`, `insertChatMessage`); `app.html` profile column (after line 68); `supabase.js` (append after line 321); `account-deletion.js` `DELETE_BUCKETS`; `supabase/tests/supabase-stub.sql` (append realtime stub); `0012` §D; README §0012 "D"; `ORBIT_ENGINE.md` §4.1 one bullet |

**Order.** Task 0 first (one commit). Then A, C and D run in parallel. B1 and B4 can start at once; B2–B3 start after
A1 is merged (they import `geo-locate.js`). Inside a part, tasks are sequential. Line numbers are for `main` at
f15fb31; after a neighbour's merge, find the region by its function name.

**Release and 0012.** The client of every part degrades when 0012 is absent (the existing "Run the SQL files…"
pattern: a missing relation/column/bucket hides the control or shows the existing copy, never a crash). 0012 is
complete when A, C and D are on `main`; the founder applies it once then (D6). If the founder wants A5 live before C
and D are done, A7 ships 0012 with §A5 only and C/D move their sections to `0013_polish_wave_2.sql` unchanged.

---

## Task 0: Shared scaffolding

**Files:**
- Create: `site/styles/chat-fit.css`, `site/styles/menus-fit.css`, `site/styles/explore-cards.css`, `site/styles/chat-extras.css`, `site/styles/signup.css`, `site/styles/auth-refresh.css` (each a one-line comment naming its owner task)
- Create: `supabase/migrations/0012_polish_wave.sql` (header + three section banners, no statements)
- Modify: `site/scripts/app.js:49` (four imports after `reference-design.css`, in the order chat-fit, menus-fit, explore-cards, chat-extras), `site/scripts/auth-entry.js:13` (signup.css, auth-refresh.css after `auth-a11y.css`), `supabase/migrations/README.md` (append "## 0012" with three empty subsections A5, C, D)

**Interfaces:**
- Produces: the section banners `-- §A5 blocked sends are withheld`, `-- §C post likes and saves`, `-- §D resumes, resume messages, typing, deletion` that A5, C1 and D1/D2 fill.

- [ ] **Step 1:** create the files and imports above.
- [ ] **Step 2:** `bash supabase/tests/run.sh` → `ALL PASSED`; `npm run check:styles` → `Style ratchet OK.`; stub build succeeds; `node tests/e2e/app-shell.spec.mjs` → 0 failed (no visual change).
- [ ] **Step 3: Commit** `chore(polish): scaffold polish-wave styles and 0012 sections`.

---

## Part A: fixes on the live site

### Task A1: "Use my location" (systematic debugging)

**Files:**
- Create: `site/scripts/geo-locate.js`, `tests/unit/geo-locate.test.mjs`, `tests/e2e/location.spec.mjs` (Vite on :5192, auth.html, classic form step 2)
- Modify: `site/scripts/script.js:960-1100` (`GEO_OPTIONS`, `AREA_FALLBACK_TEXT`, `useMyLocation`); `tests/e2e/onboarding.spec.mjs` only the options assertion (~line 362) if the options change; `docs/ORBIT_ENGINE.md` §9.1.4 only if the client contract changes

**Interfaces:**
- Produces (B2 consumes):
  - `locateOnce(geo, { secure, options = GEO_OPTIONS, promptGraceMs = 30000 }) -> Promise<LocateResult>`
    where `LocateResult = { ok: true, lat: number, lng: number } | { ok: false, reason: 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' }`
  - `GEO_OPTIONS` (exported; the values the root cause dictates)
  - `fallbackCopy(reason) -> string` with exact copy:
    `denied` → "Location is blocked for this site. Allow it in your browser's site settings, or pick your city.";
    `unavailable` → "Your device couldn't find a location. Check that location services are on, or pick your city.";
    `timeout` → "Finding your location took too long. Try again, or pick your city.";
    `insecure`/`unsupported` → "No problem. Pick your city instead."

- [ ] **Step 1: Reproduce in Playwright.** Write `location.spec.mjs` cases with a mocked `navigator.geolocation` (init script, like `onboarding.spec.mjs:198`), each asserting what a member should see:
  - L1 granted at once → status "Got it. We keep only the ~2 km square you're in.", city list closed, submit posts `set_home_location` with finite `lat`/`lng` and nothing else carries them (`COORD_RE` absent from storage and other requests).
  - L2 granted after 16 s (the prompt answered late) → the location still counts (status as L1) unless the member picked a city meanwhile.
  - L3 `PERMISSION_DENIED` (code 1) → city list open, `fallbackCopy('denied')` visible.
  - L4 `POSITION_UNAVAILABLE` (code 2) → city list open, `fallbackCopy('unavailable')`.
  - L5 `TIMEOUT` (code 3) → `fallbackCopy('timeout')` and a "Try again" button that calls `getCurrentPosition` once more.
  - L6 no `navigator.geolocation` / insecure → the plain copy.
  - L7 `set_home_location` answers 400 `P0001 try again later` → "Try again later." beside the area step (existing copy).
  Run: `node tests/e2e/location.spec.mjs`. Record which cases FAIL; that list is the evidence.
- [ ] **Step 2: Inspect, one hypothesis at a time** (write each finding into the commit message):
  - H1: the 15 s `guard` in `useMyLocation` sets `settled` and drops a late success (L2).
  - H2: code 2 on macOS when the browser lacks OS location permission, shown with the generic copy (L4).
  - H3: `enableHighAccuracy: false` + `timeout: 10000` times out on desktop without Wi-Fi (L5).
  - H4: a `Permissions-Policy` header blocks geolocation: `vercel.json` sets none; confirm on the live response with
    the Vercel MCP `web_fetch_vercel_url` for `https://brivia-club.vercel.app/auth.html` (this sandbox cannot reach
    `*.vercel.app`).
  - H5: the RPC fails at submit (3 changes/day cap, `brivia_apply_home_change`; or `profile required` P0002 before the
    profile row exists): read `supabase/migrations/0004_orbit_onboarding.sql:637-652` and the submit order in
    `finishOnboarding`.
  - H6: the founder tried in Profile, where the area is "coming soon" (`app.js:1867`): out of scope; ask, don't build.
- [ ] **Step 3: Write the failing unit tests** in `tests/unit/geo-locate.test.mjs` for the confirmed causes, e.g.:
```js
test('a success after the prompt grace still resolves ok', async () => { /* fake geo calls success at 16 s */ assert.deepEqual(await p, { ok: true, lat: 12.97, lng: 77.59 }); });
test('error codes map to reasons', async () => { assert.equal((await locateOnce(fail(1), { secure: true })).reason, 'denied'); /* 2 → unavailable, 3 → timeout */ });
test('insecure context never calls the API', async () => { assert.equal(calls, 0); });
```
  Run `node --test tests/unit/geo-locate.test.mjs` → FAIL (module missing).
- [ ] **Step 4: Implement** `locateOnce`/`fallbackCopy` in `geo-locate.js` and rewire `useMyLocation` to it: the guard opens the city list with a "Still waiting for your browser…" line but keeps listening until `promptGraceMs`; a late success applies only while `areaChoice` is still null. Change `GEO_OPTIONS` only if H3 is confirmed (then update the onboarding options assertion).
- [ ] **Step 5:** `node --test tests/unit/geo-locate.test.mjs` and `node tests/e2e/location.spec.mjs` → all PASS; `node tests/e2e/onboarding.spec.mjs` → 0 failed.
- [ ] **Step 6: Commit** `fix(area): "Use my location" keeps a late answer and says why it fell back (A1)`.

### Task A2: Chat fits shorter laptop screens

**Files:**
- Modify: `site/styles/chat-fit.css` (only file)
- Create: `tests/e2e/fit.spec.mjs` (app stub on :5191; sections "chat", "notifications", "menu", "blocked send")

**Interfaces:** Consumes the chat DOM as is: `.chat-layout`, `#chat-list`, `#chat-window`, `.chat-window-head`, `#chat-messages`, `#chat-form`, `.chat-attachment-preview` and message images.

- [ ] **Step 1: Failing test** "chat fits": for each of 1280×720, 1280×800, 1366×768, 1440×900, 1536×864, 1920×1080, 375×812, 390×844 open a thread with 30 messages and one 3000×4000 image (`st.messages`):
```js
assert.ok(win.bottom <= innerHeight + 0.5 && composer.bottom <= innerHeight + 0.5); // composer always visible
assert.ok(img.height <= Math.round(innerHeight * 0.45) + 1 && img.width <= bubbleMax + 1);
assert.equal(document.documentElement.scrollWidth, innerWidth);   // no side gutter / overflow
assert.ok(Math.abs(layout.left - mainLeft) <= 1 && Math.abs(layout.right - mainRight) <= 1); // no side margins
```
  Run `node tests/e2e/fit.spec.mjs` → FAIL at 1280×800 / 1440×900.
- [ ] **Step 2: Implement** in `chat-fit.css`: the chat view as a `100dvh` column (header, list/thread, composer), the thread `min-height:0; overflow:auto`, message images `max-height: min(45dvh, 420px); width:auto; max-width:100%; object-fit:contain`, bubbles `max-width: min(72%, 560px)`, no horizontal padding on `.chat-layout` at ≥ 781 px.
- [ ] **Step 3:** test PASS; `node tests/e2e/app-shell.spec.mjs` → 0 failed.
- [ ] **Step 4: Commit** `fix(chat): thread, list and composer fit 720-1080 px tall screens (A2)`.

### Task A3: Notifications above every view

**Files:**
- Modify: `site/scripts/app.js:283-377` (`closeNotificationPanel`, `ensureNotificationControls`), `site/styles/menus-fit.css` (section `/* A3 */`), `tests/e2e/fit.spec.mjs` ("notifications")

**Interfaces:** Produces `placeNotificationPanel() -> void` (fixed position under the bell, right edge on the bell's right edge, inside 8 px of the viewport).

- [ ] **Step 1: Failing test**: in the chat view with a thread open, at 375, 768, 1440×900, open the bell:
```js
assert.equal(document.elementFromPoint(cx, cy).closest('#app-notification-panel') !== null, true); // on top at its centre
assert.ok(panel.top >= bell.bottom - 1 && panel.right <= innerWidth - 8 + 0.5);
```
  plus Escape and outside click close it and focus returns to the bell.
- [ ] **Step 2: Implement**: open the panel in the top layer (`popover="manual"` + `showPopover()` when `POPOVER`, the same pattern as the settings menu), position with `placeNotificationPanel` on open, resize and scroll; fallback `position:fixed; z-index` above `.chat-window` without popover.
- [ ] **Step 3:** test PASS; app-shell 0 failed.
- [ ] **Step 4: Commit** `fix(notifications): the panel opens above the chat list, anchored to the bell (A3)`.

### Task A4: Compact account menu, bottom sheet on phones

**Files:**
- Modify: `site/scripts/app.js:423-470` (`placeProfileSettingsMenu`) and `:1806-1830` (menu builder: add a sheet grabber and `aria-label="Account menu"`), `site/styles/menus-fit.css` (section `/* A4 */`), `tests/e2e/fit.spec.mjs` ("menu")

**Interfaces:** Produces `menuLayout(viewportWidth) -> 'popover' | 'sheet'` (sheet at ≤ 600 px), local to `app.js` next to `placeProfileSettingsMenu`.

- [ ] **Step 1: Failing test** at 320, 375, 768, 1280×800, 1440×900:
```js
for (const item of items) assert.ok(item.height >= 44 && item.height <= 52);        // natural height, not stretched
assert.ok(menu.width <= 320 || layout === 'sheet');
if (innerWidth <= 600) { assert.ok(Math.abs(menu.bottom - innerHeight) <= 1 && menu.left === 0 && menu.width === innerWidth); }
```
  and Tab order ⚙ → five items → EDIT PROFILE unchanged; Escape closes and returns focus.
- [ ] **Step 2: Implement**: `width: max-content; min-width: 240px; max-width: 320px`, items `min-height:44px` with no flex-grow; at ≤ 600 px the menu is a bottom sheet (`inset: auto 0 0 0`, rounded top, safe-area padding, backdrop click closes); `placeProfileSettingsMenu` skips positioning in sheet mode.
- [ ] **Step 3:** test PASS; app-shell 0 failed (its menu checks still hold).
- [ ] **Step 4: Commit** `fix(account-menu): compact menu, bottom sheet on phones (A4)`.

### Task A5: A blocked sender's messages are withheld, never refused

**Files:**
- Modify: `supabase/migrations/0012_polish_wave.sql` §A5 only; `supabase/tests/orbit-hygiene.test.sql:150-165` (H3); `supabase/migrations/README.md` §0012 "A5"; `tests/e2e/fit.spec.mjs` ("blocked send")
- Create: `supabase/tests/a5-blocked-send.test.sql`

**Interfaces:**
- Produces (SQL):
  - `brivia_private.withheld_message(message_id uuid primary key references public.brivia_messages(id) on delete cascade, created_at timestamptz not null default now())`; no grants to `anon`/`authenticated`.
  - `brivia_private.brivia_can_send(p_recipient uuid) returns boolean` (stable, security definer): the 0008 `brivia_can_message` body without the block clause (match exists + same world).
  - `brivia_private.brivia_message_visible(p_id uuid, p_sender uuid, p_recipient uuid) returns boolean` (stable, security definer): `auth.uid() = p_sender or (auth.uid() = p_recipient and not exists (withheld row))`.
  - `public.brivia_withhold_blocked_message()` trigger, `after insert on public.brivia_messages for each row`: inserts a withheld row when `public.brivia_pair_is_blocked(new.sender_id, new.recipient_id)` (either direction). Execute revoked from `public, anon, authenticated`.
  - Policies redefined (still exactly one insert policy): select "Completed members can view their messages" = 0008's expression `and brivia_private.brivia_message_visible(id, sender_id, recipient_id)`; insert "Completed members can send messages" = completed `and sender_id = (select auth.uid()) and brivia_private.brivia_can_send(recipient_id)`; storage "Participants can view message attachments" = 0003's expression with `and brivia_private.brivia_message_visible(m.id, m.sender_id, m.recipient_id)` inside the `exists`.
- Rules: withheld is permanent (unblocking does not release it); `report_member` evidence still includes withheld rows (moderation only).

- [ ] **Step 1: Failing harness test** `a5-blocked-send.test.sql` (one transaction, rolled back; members a, b matched, b blocks a):
  - S1 a inserts to b as `authenticated`: no error.
  - S2 a selects the row (own thread): 1 row, same columns as an unblocked message (no extra column exists on `brivia_messages`).
  - S3 b selects messages from a after the block: 0 rows; rows from before the block still 1.
  - S4 b cannot read the withheld message's attachment object (`storage.objects` select returns 0) while a can.
  - S5 unblock (`delete from brivia_blocks`): S3 still 0 for the withheld row; a new message is visible to b.
  - S6 a pair that is not matched: insert still refused (`insufficient_privilege`), as before.
  - S7 `brivia_private.withheld_message` is not selectable by `authenticated` and `has_table_privilege` is false; `trust.test.sql` I6 still sees one insert policy.
  Update H3 in `orbit-hygiene.test.sql`: "a message to a blocking match is stored and withheld" (insert succeeds; b sees 0 rows) instead of "refused".
  Run `bash supabase/tests/run.sh` → FAIL at S1.
- [ ] **Step 2: Implement §A5** with the interfaces above (`create table if not exists`, `create or replace`, `drop policy if exists` / `create policy`, `drop trigger if exists`).
- [ ] **Step 3:** `bash supabase/tests/run.sh` → `ALL PASSED`.
- [ ] **Step 4: e2e** "blocked send" in `fit.spec.mjs`: with `routes['POST brivia_messages'] = 201`, the blocked member presses Enter: the bubble shows as sent, no error toast, the composer clears. (The client already treats a 201 as sent; no `app.js` change. If one is needed, it is limited to `insertChatMessage`.)
- [ ] **Step 5:** README §0012 "A5": what it does, the read-only post-apply check `select count(*) from brivia_private.withheld_message;` (runs, 0 at first), and the expected advisor note (security definer helpers in `brivia_private`).
- [ ] **Step 6: Commit** `feat(db): a blocked sender's messages are stored and withheld, never refused (A5)`.

### Task A6: Remove the Yugansh and Keshav showcase cards

**Files:**
- Modify: `site/auth.html:210-211,221-222` (delete the four `<article>`s), `site/media/manifest.json` (delete the `Keshav-Jha.jpeg` and `Yugansh-Tyagi.PNG` entries), `site/styles/auth-polish.css:2576` (duration 38s → 31s, so the speed per card is unchanged: 38 × 9/11)
- Delete: `site/media/assets/Yugansh-Tyagi.webp`, `site/media/assets/Keshav-Jha.webp`, `source-media/assets/Yugansh-Tyagi.PNG`, `source-media/assets/Keshav-Jha.jpeg` (else `npm run media:build` recreates them)
- Create: `tests/unit/showcase-cards.test.mjs`

- [ ] **Step 1: Failing test**:
```js
test('no Yugansh or Keshav anywhere shipped', () => { assert.doesNotMatch(authHtml, /Yugansh|Keshav/i); assert.doesNotMatch(manifestText, /Yugansh|Keshav/i); assert.equal(existsSync('site/media/assets/Keshav-Jha.webp'), false); });
test('the marquee is two identical halves; the second is aria-hidden', () => { assert.equal(cards.length, 18); assert.deepEqual(first9.map(src), second9.map(src)); assert.ok(second9.every(c => c.ariaHidden === 'true')); });
```
- [ ] **Step 2:** run → FAIL; make the edits; run → PASS.
- [ ] **Step 3:** geometry check in A7's screenshot run: at 2560 px one half of `.community-track` is wider than the viewport (no gap appears before the loop).
- [ ] **Step 4: Commit** `chore(auth): remove the Yugansh and Keshav showcase cards (A6)`.

### Task A7: Release A

**Files:** `docs/DECISIONS.md` (append D-072), `docs/HANDOFF.md` (§1 new top entry, §3 founder actions), screenshots in `.superpowers/sdd/2026-10-21-polish-wave/a/` (git-ignored).

- [ ] **Step 1:** full gate (top of plan); `--expect-diff auth` for the parity compare (marquee only).
- [ ] **Step 2:** screenshots: chat thread at the ten A2 sizes, notifications open over chat (375, 1440), account menu (320 sheet, 1440 popover), location states L1–L6, auth marquee at 375/1440/2560. A separate reviewer looks at them.
- [ ] **Step 3:** D-072: root cause of A1 (the confirmed hypotheses), the A2–A4 layout rules, A5's withheld design (side table, either direction, permanent, report evidence keeps it), A6. HANDOFF: 0012 not yet applied; founder checks A1 on a real Mac and phone on the preview.
- [ ] **Step 4: Commit** `docs: release A of the polish wave (D-072)`; push the branch. The founder fast-forwards `main` (D-051).

---

## Part B: signup again, one question per screen

### Task B1: Flow model and the even split

**Files:**
- Create: `site/scripts/signup-flow.js` (adapted from `git show 9433554^:site/scripts/signup-flow.js`), `tests/unit/signup-flow.test.mjs`
- Modify: `site/scripts/passion-budget.js` (append `evenSplit`, verbatim from `9433554^`)

**Interfaces:**
- Produces:
  - `SCREENS = { email: ['welcome','account','adult','name','details','area','interests','reveal'], google: ['welcome','adult','name','details','area','interests','reveal'] }` (`verify` is a terminal screen of the email path when signup needs email confirmation; it is not a step)
  - `STEP_ICONS = { account: 'mail', adult: 'shield', name: 'person', details: 'phone', area: 'pin', interests: 'spark' }`
  - `stepLabel(path, screen) -> string | null` ("Step n of N", N = 6 email, 5 Google)
  - `stepStates(path, screen) -> Array<{ screen, state: 'done'|'current'|'pending' }>`
  - `resumeScreen({ session, status }) -> screen | 'done'` with `status = { adult_declared, has_name, has_phone, has_gender, has_cell, interests, points, completed }`
  - `backTarget(path, screen, hasSession) -> screen | null` (never back to `account` once a session exists)
  - `signupFlowMode(env) -> 'guided' | 'classic'` (`VITE_SIGNUP_FLOW=classic` → classic; anything else → guided)
  - `evenSplit(items, budget = 20) -> Array<{ interest_id, points, mode }>`

- [ ] **Step 1: Failing tests** (restore `9433554^:tests/unit/signup-flow.test.mjs`, then adapt):
```js
test('screen lists: email has 6 question screens, Google 5; 18+ and name are separate', ...);
test('resumeScreen: adult before name before details before area before interests', () => { assert.equal(resumeScreen({ session: {}, status: { adult_declared: true, has_name: false } }), 'name'); });
test('backTarget: never back to account once signed in', () => { assert.equal(backTarget('email', 'adult', true), 'welcome'); });
test('evenSplit: 20 points, largest remainder, each at least 1, ties to earlier picks', () => { assert.deepEqual(evenSplit(ids(3)).map(r => r.points), [7, 7, 6]); assert.deepEqual(evenSplit(ids(12)).map(r => r.points), [2,2,2,2,2,2,2,2,1,1,1,1]); assert.throws(() => evenSplit(ids(13))); });
test('signupFlowMode: classic only when asked', () => { assert.equal(signupFlowMode('classic'), 'classic'); assert.equal(signupFlowMode(undefined), 'guided'); });
```
- [ ] **Step 2:** run → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** `feat(signup): guided flow model and the even split (B1)`.

### Task B2: The guided screens

Starts after A1 is merged.

**Files:**
- Create: `site/scripts/signup-screens.js` (adapted from `9433554^`, minus code/OTP/password-later), `site/styles/signup.css` (restored from `9433554^`, restyled to tokens)
- Modify: `site/auth.html` (add `<div class="auth-view auth-signup auth-guided" data-auth-view="guided" hidden>` with `#guided-signup`, as in `9433554^`)

**Interfaces:**
- Consumes: B1 exports; A1 `locateOnce`, `fallbackCopy`; `searchPlaces`, `fetchInterestNodes` from `supabase.js`; `matchTypedCity` from `area-pick.js`.
- Produces: `initGuidedSignup({ root, path, startGoogle, submit, redirectToApp, resumeAt }) -> { show(screen) }` where
  `submit(answers) -> Promise<{ ok: true, session: boolean } | { ok: false, screen, message }>` and
  `answers = { email, password, adult: true, name, phoneCountryCode, phoneNumber, gender, area: {kind:'geo',lat,lng}|{kind:'city',placeId,label}, interests: Array<{id,label,mode}> }`.
- Screens and exact copy owner: Welcome ("Continue with Google" / "Continue with email" / "I already have an account"), Account (email, password ≥ 8, confirm), 18+ (one checkbox "I'm 18 or older", the notice link), Name, Details (phone + gender: Male / Female / Prefer not to say), Area (A1 button + city search), Interests (1–12 picks, non-sensitive only, animated "Your picks" tray), Reveal (qualitative copy, no counts), Verify ("Check your email." as the classic success copy).

- [ ] **Step 1: Failing e2e** `tests/e2e/signup.spec.mjs` (restore `9433554^`, Vite :5193, adapt) at 375 and 1440:
  - one question per screen (exactly one `[data-question]` visible), "Step n of 6" / "of 5", bubbles done/current/pending;
  - Enter = Continue; Back on every question screen; 18+ required; password mismatch blocks;
  - Area: geolocation granted → status line; denied → `fallbackCopy('denied')` and the city list;
  - Interests: 0 picks disables Continue; 13th pick refused with a line; the tray animates (none under reduced motion);
  - axe clean per screen; 44 px targets; no sideways scroll at 320.
- [ ] **Step 2:** run → FAIL; implement; run the screen checks → PASS (the submit checks wait for B3).
- [ ] **Step 3: Commit** `feat(signup): one question per screen, Google kept, no points screen (B2)`.

### Task B3: Wire the guided flow into today's signup pipeline

**Files:**
- Modify: `site/scripts/script.js` (700–720 view switch: `#signup` → guided unless classic; 1540–1600 Google start lands on the guided `adult` screen; 1660–1700 `routeAfterProfile` resumes the guided flow at `resumeScreen`; 2180–2290 a `submitGuidedSignup(answers)` adapter), `tests/e2e/onboarding.spec.mjs` and `tests/e2e/consent.spec.mjs` (vite `env` gets `VITE_SIGNUP_FLOW: 'classic'`), `.env.example` (`VITE_SIGNUP_FLOW=` with a comment)

**Interfaces:**
- Consumes: B2 `initGuidedSignup`, B1 `evenSplit`, existing `saveProfile`, `finishOnboarding`, `buildPendingOnboarding`, `declareAdult`.
- Produces: `submitGuidedSignup(answers) -> Promise<{ ok, session } | { ok:false, screen, message }>`: sets `areaChoice` and `budget` (`{ items: evenSplit(answers.interests) }`) then runs the existing classic pipeline unchanged: `signUp` (email path, at the end) or the session path (Google) → `saveProfile` → `finishOnboarding` (`declare_adult` before area and interests). Without a session (email confirmation on) → the pending profile (no coordinates) and the Verify screen. Notice version unchanged (`NOTICE_VERSION` = `2026-10-05`).

- [ ] **Step 1: Failing e2e** (signup.spec.mjs, submit section): the order of calls is `signUp` → `profiles` upsert → `rpc/declare_adult` (`p_notice_version: '2026-10-05'`) → `rpc/set_home_location` → `rpc/set_member_interests` with points summing to 20; phone digits, country code and gender on the member's own row; no coordinates in localStorage on the Verify path; Google path skips Account; a returning incomplete member resumes at the first unfinished screen; `VITE_SIGNUP_FLOW=classic` shows the 4-step form.
- [ ] **Step 2:** run → FAIL; implement; run → PASS. `node tests/e2e/onboarding.spec.mjs` and `consent.spec.mjs` → 0 failed (pinned to classic).
- [ ] **Step 3: Commit** `feat(signup): guided answers save through the existing pipeline (B3)`.

### Task B4: Beautified login and signup frame

Independent of A1; can run first.

**Files:**
- Modify: `site/auth.html` login view and the shared auth frame markup (lines ~40–120; not the marquee), `site/styles/auth-refresh.css` (only file for the new look)

**Interfaces:** none new. Keeps `.auth-google-trigger`, `#login-form`, "Forgot password?", "CREATE AN ACCOUNT" behaviour and ids.

- [ ] **Step 1: Failing e2e** in `signup.spec.mjs` "login look": a calm one-column card (max-width 480 px at ≥ 781 px, full width minus 16 px gutters below), "Continue with Google" is a full-width labelled button (text, not only "G"), heading in Bodoni Moda, computed contrast ≥ 4.5:1 for every text node in the card, 44 px targets, no sideways scroll at 320.
- [ ] **Step 2:** run → FAIL; implement; run → PASS; `node tests/e2e/onboarding.spec.mjs` → 0 failed.
- [ ] **Step 3: Commit** `style(auth): editorial deep-wine login and signup card (B4)`.

### Task B5: Release B

**Files:** `docs/UX_SPEC.md` (§A0 "Guided signup" restored from `9433554^` and adapted: screens, copy, classic switch), `docs/ORBIT_ENGINE.md` §3.2 (the even-split note restored from `7a74194`), `docs/DECISIONS.md` (D-073), `docs/HANDOFF.md`.

- [ ] **Step 1:** full gate; parity `--expect-diff auth`.
- [ ] **Step 2:** screenshots of every guided screen at 375 and 1440, login at 320/375/1440; reviewer pass.
- [ ] **Step 3:** D-073: guided flow back (reverses D-069 at the founder's request), email + password with the account created at the end (no email code, so no Supabase template dependency), 18+ and Name on separate screens, phone and gender kept (D-068), interests only with `evenSplit`, private interests not offered, Google kept, classic behind `VITE_SIGNUP_FLOW=classic` for one release, notice `2026-10-05`.
- [ ] **Step 4: Commit** `docs: release B of the polish wave (D-073)`; push.

---

## Part C: Explore post cards

### Task C1: Likes and saves in 0012 §C

**Files:**
- Modify: `supabase/migrations/0012_polish_wave.sql` §C only; `supabase/migrations/README.md` §0012 "C"
- Create: `supabase/tests/c-post-reactions.test.sql`

**Interfaces:**
- Produces: `public.community_post_likes` and `public.community_post_saves`, each `(post_id uuid not null references public.community_posts(id) on delete cascade, member_id uuid not null default auth.uid() references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, member_id))`; RLS on; `grant select, insert, delete` to `authenticated` (no update); policies: select own (`member_id = (select auth.uid())`), insert own when `(select public.brivia_has_completed_profile())` and `exists (select 1 from public.community_posts p where p.id = post_id)` (evaluated under the posts select policy), delete own. No counts, no RPC.

- [ ] **Step 1: Failing harness test** (P1–P6): P1 a completed member likes and saves a post (one row each); P2 a second like → `unique_violation` (client treats 23505 as done); P3 member b sees none of a's rows; P4 an incomplete member cannot insert; P5 a like on a non-existent post is refused; P6 deleting the post or the member removes the rows (cascade); `anon` has no privilege.
- [ ] **Step 2:** run → FAIL; implement §C; run → `ALL PASSED`.
- [ ] **Step 3: Commit** `feat(db): community post likes and saves (C1)`.

### Task C2: Card markup and reactions (pure)

**Files:**
- Create: `site/scripts/post-card.js`, `site/scripts/post-reactions.js`, `tests/unit/post-card.test.mjs`, `tests/unit/post-reactions.test.mjs`

**Interfaces:**
- Produces:
  - `postCardMarkup(post, author, { liked, saved, imageSrc, dateLabel }, { escapeHtml, renderAvatar }) -> string`: `<article class="post-card" data-post-id>` with a header bar (avatar, author name as a profile trigger, date), a 4:5 media block (image or the existing `community-post-image-missing` placeholder), the caption (2-line clamp), and an action bar of four `<button type="button">` with SVG icon + label: `data-post-action="like|comment|share|save"`, `aria-pressed` on like and save, labels "Like"/"Liked", "Comment", "Share", "Save"/"Saved".
  - `shareData(post, origin) -> { title: 'A post on Brivia Club', url: `${origin}/explore.html?post=${post.id}` }` (no caption, no name).
  - `loadReactions(client, memberId, postIds) -> Promise<{ liked: Set<string>, saved: Set<string>, error }>`
  - `setReaction(client, kind: 'like'|'save', postId, memberId, on: boolean) -> Promise<{ error }>` (23505 on insert = success; delete of a missing row = success).
  - `createReactionGuard() -> { begin(key) -> boolean, end(key) }` (one request in flight per post+kind).

- [ ] **Step 1: Failing tests**: markup escapes caption and name (`<img onerror>` stays text); four buttons with labels in order like, comment, share, save; `aria-pressed="true"` when liked; share data has no caption; `setReaction` maps 23505 to `{ error: null }`; the guard refuses a second `begin` for the same key until `end`.
- [ ] **Step 2:** run → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** `feat(explore): post card markup and like/save persistence helpers (C2)`.

### Task C3: Explore view

**Files:**
- Modify: `site/scripts/app.js:2230-2340` (`renderCommunityPosts` uses `postCardMarkup`; `loadCommunityPosts` calls `loadReactions`; new `bindCommunityPostActions()`, `openCommunityPostDetail(postId)` next to them), `routeFromUrl` (`?post=<id>` opens the detail once posts load), `site/app.html:34-46` ("New post" wide wine button `#open-community-post` keeps its id; the grid container keeps `#community-post-list`), `site/scripts/app-skeletons.js` (`posts` skeleton in the new card shape), `site/styles/explore-cards.css`
- Create: `tests/e2e/explore-cards.spec.mjs` (app stub :5189; `st.posts`, `st.routes['community_post_likes']`, `['community_post_saves']`)

**Interfaces:**
- Consumes: C2 exports; existing `postImageSrc`, `openPublicProfile`, `hasMatchWith`, `openChat`.
- Behaviour: like/save optimistic, rolled back with toast "That didn't save. Please try again." on error; share uses `navigator.share(shareData)` when present, else `navigator.clipboard.writeText(url)` with toast "Link copied."; comment opens `openCommunityPostDetail` (image, caption, author, date) whose single action is "Reply in chat" (opens the chat with the composer prefilled `Re: “<caption, first 60 chars>” `) when matched, else "View profile". When 0012 is absent (`relation … does not exist`), like and save are hidden.

- [ ] **Step 1: Failing e2e** (E1–E7): E1 columns: 1 at 375/390, 2 at 768, 3 at 1280 and 1440 and 1920 (count distinct `offsetLeft`); E2 every card's media box ratio 0.8 ± 0.01 and equal card heights per row; E3 header and action bar backgrounds equal `--brivia-wine` and text contrast ≥ 4.5:1; E4 a double tap on Like sends one POST, `aria-pressed` true; a 403 rolls back with the toast; E5 Save persists across reload (stub returns the row); E6 Share calls `navigator.share` with no caption, and without it the clipboard gets the URL; E7 skeleton cards while `community_posts` is delayed 1 s, `aria-busy` cleared after; axe clean; no sideways scroll at 320.
- [ ] **Step 2:** run → FAIL; implement; run → PASS; `node tests/e2e/app-shell.spec.mjs` → 0 failed (its posts checks updated only where the old card class is asserted).
- [ ] **Step 3: Commit** `feat(explore): wine post cards with like, comment, share and save (C3)`.

### Task C4: Release C

- [ ] **Step 1:** full gate.
- [ ] **Step 2:** screenshots of Explore at all seven sizes, a liked+saved card, the detail sheet, loading; reviewer pass.
- [ ] **Step 3:** D-074: card anatomy, grid, persistence tables (own rows only, no counts shown), share = link only, comment = detail sheet (no comment storage in this wave), name shown instead of an `@handle` (profiles have no handle). HANDOFF updated.
- [ ] **Step 4: Commit** `docs: release C of the polish wave (D-074)`; push.

---

## Part D: resume, quick-share and typing

### Task D1: Resumes and resume messages in 0012 §D

**Files:**
- Modify: `supabase/migrations/0012_polish_wave.sql` §D (resume part); `supabase/migrations/README.md` §0012 "D"
- Create: `supabase/tests/d-resume.test.sql`

**Interfaces:**
- Produces:
  - bucket `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('resumes', 'resumes', false, 5242880, array['application/pdf']) on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf']`
  - storage policies on `storage.objects` for `authenticated`: insert, update, delete when `bucket_id = 'resumes' and name = (select auth.uid())::text || '/resume.pdf'`; select "Members can read their resume or one shared with them" = owner path, or `exists (select 1 from public.brivia_messages m where m.message_type = 'resume' and m.attachment_path = storage.objects.name and m.recipient_id = (select auth.uid()) and brivia_private.brivia_can_message(m.sender_id))`
  - `alter table public.profiles add column if not exists resume_path text`; constraint `profiles_resume_path_own check (resume_path is null or resume_path = id::text || '/resume.pdf')`; `grant update (resume_path) on public.profiles to authenticated`
  - constraint `brivia_messages_resume_path check (message_type <> 'resume' or attachment_path = sender_id::text || '/resume.pdf')`
  - `public.delete_my_account(p_confirm text)` redefined: the 0005 body with `'resumes'` added to the folder bucket list (same signature, grants, errors)

- [ ] **Step 1: Failing harness test** (R1–R8): R1 bucket row is private, 5242880, `{application/pdf}`; R2 a can insert `a/resume.pdf` but not `a/cv.pdf` or `b/resume.pdf`; R3 b cannot select `a/resume.pdf` without a message; R4 with a match and a `resume` message a→b, b can select it; R5 after b blocks a (or the match is deleted), b cannot; R6 a message of type `resume` with any other path is refused by the constraint; R7 `resume_path` is not a column of `public_profiles` and not in the result type of `get_candidates`, `search_members`, `deck_candidates`, `list_members` (`pg_get_function_result`); a cannot set `resume_path = 'b/resume.pdf'`; R8 `delete_my_account('DELETE')` with a fresh `amr` raises `storage_not_empty` while `a/resume.pdf` exists, and succeeds after it is removed.
- [ ] **Step 2:** run → FAIL; implement; run → `ALL PASSED`.
- [ ] **Step 3: Commit** `feat(db): private resumes bucket, resume messages, deletion covers resumes (D1)`.

### Task D2: Typing broadcast authorization in 0012 §D

**Files:**
- Modify: `supabase/migrations/0012_polish_wave.sql` §D (typing part, guarded by `to_regclass('realtime.messages') is not null`); `supabase/tests/supabase-stub.sql` (append: schema `realtime`, table `realtime.messages(id bigserial primary key, topic text not null, extension text not null, event text, payload jsonb, private boolean default true, inserted_at timestamptz default now())` with RLS on, `realtime.topic()` = `nullif(current_setting('realtime.topic', true), '')`)
- Create: `supabase/tests/d-typing.test.sql`

**Interfaces:**
- Produces:
  - topic format `typing:<lower uuid>:<higher uuid>` (text sort of the two member ids)
  - `brivia_private.brivia_typing_topic_ok(p_topic text) returns boolean` (stable, security definer): the caller is one of the two ids, the format matches exactly, and `brivia_private.brivia_can_message(<other id>)`
  - policies on `realtime.messages` for `authenticated`: select and insert when `extension = 'broadcast' and brivia_private.brivia_typing_topic_ok((select realtime.topic()))`

- [ ] **Step 1: Failing harness test** (T1–T5): T1 matched a and b both pass for their topic; T2 c fails for a/b's topic; T3 after a block (either direction) both fail; T4 malformed topics (`typing:a`, wrong order, extra suffix, another prefix) fail; T5 `anon` fails.
- [ ] **Step 2:** run → FAIL; implement; run → `ALL PASSED`. README §0012 "D": the founder keeps Realtime "private channels" working (no setting change needed); post-apply check lists the two `realtime.messages` policies.
- [ ] **Step 3: Commit** `feat(db): typing broadcast only between matched, unblocked members (D2)`.

### Task D3: Resume upload in Profile

**Files:**
- Create: `site/scripts/resume-file.js`, `tests/unit/resume-file.test.mjs`, `tests/e2e/chat-extras.spec.mjs` (app stub :5186; section "resume")
- Modify: `site/scripts/supabase.js` (append), `site/scripts/account-deletion.js:12` (`DELETE_BUCKETS` gains `'resumes'`), `tests/unit/account-deletion.test.mjs`, `site/app.html` (a `section.profile-card.profile-resume#profile-resume` after `#profile-experience`), `site/scripts/app.js:2196-2229` (`renderProfile` → `renderProfileResume()`), `site/styles/chat-extras.css`

**Interfaces:**
- Produces:
  - `RESUME_MAX_BYTES = 5242880`
  - `validateResume(file, headBytes: Uint8Array) -> { ok: true } | { ok: false, message }` with messages: not PDF type or extension → "Upload a PDF file."; size 0 → "This file is empty."; size > 5242880 → "Your resume must be 5 MB or smaller."; first 4 bytes ≠ `%PDF` (`25 50 44 46`) → "This file isn't a valid PDF."
  - `uploadResume(userId, file) -> Promise<{ path, error }>` (`storage.from('resumes').upload(`${userId}/resume.pdf`, file, { upsert: true, contentType: 'application/pdf' })`, then `profiles.update({ resume_path })`)
  - `removeResume(userId) -> Promise<{ error }>` (remove object, set `resume_path` null)
  - `resumeSignedUrl(path, seconds = 60) -> Promise<{ url, error }>`
- Profile card: "Resume (PDF, up to 5 MB)", Upload / Replace / Remove (confirm "Remove your resume? Matches you shared it with can no longer open it."), file name and size only. Hidden when the bucket is missing (0012 not applied).

- [ ] **Step 1: Failing unit tests**: each message above with an exact boundary (5242880 ok, 5242881 refused; `%PDF-1.7` ok; `PK\x03\x04` refused; `.pdf` with type `''` but magic ok → ok); `DELETE_BUCKETS` includes `'resumes'` and deletion empties it before the RPC.
- [ ] **Step 2: Failing e2e** "resume": upload a valid PDF → one storage POST to `resumes/<me>/resume.pdf`, one `profiles` PATCH with `resume_path`; a 6 MB file → field error, no request; Replace → upsert; Remove → DELETE + PATCH null; 44 px targets, axe clean.
- [ ] **Step 3:** run → FAIL; implement; run → PASS.
- [ ] **Step 4: Commit** `feat(profile): resume upload with PDF checks, replace and remove (D3)`.

### Task D4: Chat "+" quick-share

**Files:**
- Modify: `site/scripts/app.js:2645-2724` (`ensureChatComposer`: a "+" button `aria-label="Share"` with a menu of "Share my resume" and "Share my area"), `:2725-2746` (`insertChatMessage`: never calls `removeMessageAttachment` for `kind === 'resume'`), `:1623-1680` (`renderMessages`: resume and area bubbles), `site/styles/chat-extras.css`, `tests/e2e/chat-extras.spec.mjs` (section "share")
- Modify: `docs/ORBIT_ENGINE.md` §4.1 (one bullet: a member may send their own `place_label` in chat by choice, D-075; never coordinates or a cell id)

**Interfaces:**
- Consumes: D3 `resumeSignedUrl`; `memberProfile.resumePath` (from `rowToProfile`, add `resumePath: row.resume_path || ''`); `memberPlaceLabel` (`my_onboarding_status.place_label`, already "(city-wide)" for a city pick); `hasMatchWith`.
- Produces: resume message payload `{ message_type: 'resume', body: 'Shared their resume', attachment_path: `${me}/resume.pdf`, attachment_name: 'resume.pdf', attachment_mime: 'application/pdf', attachment_size }`; area message `{ message_type: 'text', body: `My area: ${placeLabel}` + (placeLabel ends with "(city-wide)" ? '' : ' (about a 2 km area)') }`, sent after a confirm sheet "Send your area to {name}? They'll see: …".
- Opening a resume bubble calls `resumeSignedUrl(path, 60)` and opens the URL in a new tab (`noopener`); an error shows "This resume is no longer shared." Nothing signed is stored.
- "Share my resume" is disabled with "Add a resume in your profile first." when `resumePath` is empty, and absent unless `hasMatchWith(selectedChat.id)`.

- [ ] **Step 1: Failing e2e** (Q1–Q5): Q1 "+" menu opens with two items, 44 px, Escape closes; Q2 share resume posts one message with the payload above and no URL in it; Q3 share area posts the exact text and no digits matching `COORD_RE`; Q4 opening a resume bubble requests `POST /storage/v1/object/sign/resumes/...` with `expiresIn: 60`; a 400 shows "This resume is no longer shared."; Q5 without a resume the item is disabled with the hint.
- [ ] **Step 2:** run → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** `feat(chat): quick-share your resume or your area (D4)`.

### Task D5: Typing indicator

**Files:**
- Create: `site/scripts/chat-typing.js`, `tests/unit/chat-typing.test.mjs`
- Modify: `site/scripts/app.js:1582-1622` (`openChat` joins), `:1681-1691` (`closeSelectedChat` leaves), the `#chat-input` input listener inside `ensureChatComposer`, `site/styles/chat-extras.css` (dots under the thread header; static "typing…" under reduced motion), `tests/e2e/chat-extras.spec.mjs` (section "typing")

**Interfaces:**
- Produces:
  - `typingTopic(a, b) -> string` (`typing:<lower>:<higher>`, matches D2)
  - `createTypingSender({ send, now, throttleMs = 2000 }) -> { onInput(), stop() }` (at most one `send({ typing: true })` per 2000 ms; `stop()` sends `{ typing: false }` once)
  - `createTypingReceiver({ onChange, setTimeout, clearTimeout, idleMs = 4000 }) -> { onSignal({ typing }), reset() }` (shows on `true`, hides on `false` or after 4000 ms idle)
- Channel: `supabase.channel(typingTopic(me, other), { config: { private: true, broadcast: { self: false } } })`, event `'typing'`. Not joined when the other member is in `readBlockedUserIds()`; a join refused by the server (blocked by the other side) shows nothing and logs nothing visible.

- [ ] **Step 1: Failing unit tests**: three inputs within 2 s send once; an input at 2.1 s sends again; `stop` sends one `false`; the receiver hides after 4000 ms without a signal and immediately on `false`; `typingTopic(b, a) === typingTopic(a, b)`.
- [ ] **Step 2: Failing e2e** with `page.routeWebSocket(/realtime\/v1\/websocket/)` answering `phx_join` with `ok`: a pushed `broadcast` `typing: true` shows "typing…" under the header, gone after 4 s; typing in the composer sends one frame per 2 s; with the other member in the local blocked list no `phx_join` for a typing topic is sent; the join error reply shows nothing.
- [ ] **Step 3:** run → FAIL; implement; run → PASS.
- [ ] **Step 4: Commit** `feat(chat): typing indicator over a private broadcast channel (D5)`.

### Task D6: Release D and 0012

- [ ] **Step 1:** full gate; `bash supabase/tests/run.sh` with every 0012 section present.
- [ ] **Step 2:** screenshots: profile resume card (empty, uploaded, error), "+" menu, resume and area bubbles, typing dots, at 375/1440 and 1280×800; reviewer pass.
- [ ] **Step 3:** README §0012 complete: pre-flight (read-only: `select id from storage.buckets where id = 'resumes';` → none; `select to_regclass('realtime.messages');` → not null), apply with `set lock_timeout = '5s';`, post-apply checks per section, expected advisor notes; the order "apply 0012, then deploy D". HANDOFF §2/§3: 0012 written, not applied.
- [ ] **Step 4:** D-075: resume storage design, signed-on-open 60 s links gated by `brivia_can_message`, area share = own `place_label` text only (ORBIT §4.1 bullet), typing over private broadcast with `realtime.messages` RLS, deletion covers `resumes`. Open founder/counsel question: whether `privacy.html` should list the optional resume (notice version unchanged in this wave).
- [ ] **Step 5: Commit** `docs: release D of the polish wave and the 0012 runbook (D-075)`; push.

---

## Self-review notes

- Spec coverage: A1–A6 → A1–A6; B bullets → B1–B4; C → C1–C3; D resume → D1, D3; quick-share → D4; typing → D2, D5;
  0012 → Task 0 + A5/C1/D1/D2; testing sizes and axe → Global Constraints and each e2e; D-072..D-075 → release tasks.
- Decisions the spec left open (recorded in the release DECISIONS entries): withheld in either direction and permanent;
  account created at the end of the email path (no email code); name instead of `@handle`; no like counts; comment
  opens a detail sheet; 0012 applied once after A, C and D (or split into 0013 if A5 must go first).
