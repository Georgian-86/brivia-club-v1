# Phase C: Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The member app feels like one professionally designed product: one navigation, one type system, one set of tokens, a calm profile page, and no screen that ever looks stuck. The landing page and every image stay exactly as they are.

**Architecture:** A `tokens.css` layer is imported first by every page entry, and a ratchet script stops new raw colours and font stacks from being added outside it. One nav model (`app-nav.js`) renders the desktop header and the mobile tab bar, so they cannot drift apart. The profile view is rebuilt from existing data only (no schema change). It includes a pure checklist helper. Skeletons and button states come from small shared helpers. Landing and auth get their own CSS entries. A byte-identical landing screenshot guard proves Yashika's design is untouched.

**Tech Stack:** Vite and vanilla JS/CSS, `node --test` unit tests, and a Playwright e2e suite against a stubbed Supabase. Playwright lives at `/tmp/pw` and Chromium at `/opt/pw-browsers/chromium`. Lighthouse runs via `npx lighthouse` with `CHROME_PATH`.

**Spec:** `docs/superpowers/specs/2026-10-12-experience-iteration-design.md` §5.2–5.6. It also covers the §2.4 app skeletons and the items Phase B deferred to here (D-054, Ruling H: landing/auth CSS split; Phase A: focus order at ≤ 780 px, `.auth-success-mark` aria-hidden).

## Founder decision needed before Task 2

The spec lists **Home · Connect · Explore · Chat · Profile**. Today, "Home" leaves the app for the landing page (`href="/"`), and both the `home` and `explore` routes show the same deck.
- **Recommended:** four tabs, **Connect · Explore · Chat · Profile**. The wordmark goes to the landing page, and the `home` route stays as an alias of `explore` so old links keep working.
- **Alternative:** keep a fifth "Home" tab that goes to the landing page.

Task 2 is written for the recommended four tabs. If the founder picks the alternative, add one entry to `NAV_ITEMS`.

**Also noted:** the spec's profile lists "about". There is no about/bio column, and adding one needs a migration (not allowed in this client-only phase). So Task 5 shows the existing "experience" field in that slot, and a real bio is proposed for Phase D or E.

## Global Constraints

- Keep the deep-wine brand: `--brivia-deep-wine #430416`, `--brivia-wine #5e0b28`, `--brivia-wine-soft #76243f`, ink-soft `#5f5651`, cream `#fffaf1`. Add no new colours, change no images or crops, and change no copy except where a task names it.
- **Landing parity:** before and after every task, Playwright screenshots of `index.html` must be byte-identical (`Buffer.equals`). Take them at 375 and 1440, with the hero plus each section scrolled into view, and with the intro skipped (`localStorage['brivia-intro-seen']='1'`) and reduced motion on.
- Type: headings use `var(--font-heading)` ('Bodoni Moda', 500, already self-hosted). Everything else uses `var(--font-body)` ('Instrument Sans'). In app and auth CSS: no Georgia, Arial, or 'Snell Roundhand'/'Brush Script MT'/'Segoe Script'. Scale tokens: 12/14/16/20/24/32/44/60 px. No visible text under 12 px in app views or auth.
- Motion: 150–250 ms transitions from tokens. Under `prefers-reduced-motion: reduce`, durations are 0 and the shimmer is static.
- Client only: no SQL, and migrations 0001–0006 stay frozen. DECISIONS is append-only. No Supabase writes.
- Location privacy: the profile shows only `memberPlaceLabel` (the server's area label). Never coordinates, and never another member's email.
- Gate before push, run one at a time:
  - `bash supabase/tests/run.sh`
  - `npm run build`
  - `npm run test:unit`
  - `(cd orbit && npm test)`
  - `npm run check:assets`
  - `npm run check:styles`
  - the e2e suites: onboarding (5198), consent (5199), deck (5197), landing (5196), and the new `app-shell` (5195).

## Review Focus

- A brand-new member (no photo, default cover, no "looking for", no experience) and a complete member. The checklist must read 1/5 and 5/5 respectively; each item's action opens the right editor; at 5/5 the checklist collapses to one "Profile complete" line. (Task 5 test.)
- A long name ("Aleksandra Venkataraman-Fitzgerald") and a long area ("Navi Mumbai, Maharashtra") at 375 px. The header, tab bar and profile hero must not overflow or overlap, so `scrollWidth <= clientWidth` on `document.documentElement`. (Task 2 for the header, Task 5 for the hero.)
- Deep links and history: `?view=chat`, `#profile`, `?view=home`, then Back. The active tab (`aria-current="page"`) always matches the visible view in both the header and the tab bar. (Task 2 test.)
- A slow or failing deck: `deck_candidates` delayed 3 s shows a skeleton card with `aria-busy="true"`, then the card with CLS < 0.1. A 500 replaces the skeleton with the existing error/empty state that has a retry action, never an endless shimmer. (Task 6 test.)
- Keyboard and reduced motion: Tab reaches every tab-bar item with a visible focus ring, and under reduced motion computed `transition-duration` is `0s` on nav buttons. The unread chat badge shows in both header and tab bar. (Task 2 and Task 6 tests.)

---

### Task 1: Tokens and the style ratchet

**Files:**
- Create: `tokens.css`, `scripts/style-ratchet.js` (pure), `scripts/check-style-ratchet.mjs` (CLI), `scripts/style-baseline.json`
- Modify: `app.js`, `script.js`, `careers.js`, `privacy.js` (import `./tokens.css` as the first line), `package.json` (`"check:styles": "node scripts/check-style-ratchet.mjs"`)
- Test: `tests/unit/style-ratchet.test.mjs`

**Interfaces:**
- Produces:
  - CSS custom properties on `:root`:
    - `--color-wine-deep`, `--color-wine`, `--color-wine-soft`, `--color-ink`, `--color-ink-soft`, `--color-cream`, `--color-line` (values copied from the existing `--brivia-*`, `--a11y-*` and `--app-line` definitions; no new colours);
    - `--space-1..8` = 4/8/12/16/24/32/48/64 px;
    - `--radius-s/m/l/pill`;
    - `--shadow-1/2`;
    - `--font-heading: 'Bodoni Moda', serif`;
    - `--font-body: 'Instrument Sans', sans-serif`;
    - `--text-12 … --text-60` (the 8 scale steps);
    - `--motion-fast: 150ms`, `--motion-base: 200ms`, `--motion-slow: 250ms`, `--ease: cubic-bezier(.2,.7,.2,1)`;
    - all `--motion-*` set to `0ms` under reduced motion.
  - `countStyleDebt(cssText: string) => { hex: number, fontFamily: number }`. Hex counts `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa` colour literals and ignores comments; fontFamily counts `font-family` declarations whose value is not only `var(...)`/`inherit`.
  - `compareToBaseline(current: Record<file, counts>, baseline) => { ok: boolean, increases: {file, kind, from, to}[] }`. A file missing from the baseline has baseline 0.
  - The CLI scans every root `*.css` except `tokens.css` and `fonts*.css`, and exits 1 on any increase. `--write` rewrites the baseline but refuses (exit 1) if any count rose.

- [ ] **Step 1:** Capture the landing parity screenshots (Global Constraints) to `.superpowers/sdd/phase-c/landing-before/`. That directory is the reference for every later task.
- [ ] **Step 2: Write failing tests:**
  - `counts 6- and 3-digit hex, ignores hex inside comments`;
  - `counts font-family but not font-family: var(--font-body) or inherit`;
  - `a rise in one file fails with that file named`;
  - `a new file with any debt fails`;
  - `lower counts pass`.
- [ ] **Step 3: Run** `node --test tests/unit/style-ratchet.test.mjs` and expect FAIL (module missing).
- [ ] **Step 4: Implement** `tokens.css`, the ratchet and the CLI. Generate the baseline with `--write`, then add the imports.
- [ ] **Step 5: Run** the unit tests, `npm run build`, `npm run check:styles` and the landing parity diff. Expect PASS and the landing screenshots byte-identical.
- [ ] **Step 6: Commit** `feat(style): design tokens and style ratchet (Phase C)`.

### Task 2: One navigation (header and mobile tab bar)

**Files:**
- Create:
  - `app-nav.js` (nav model and markup);
  - `app-shell.css` (header plus tab bar; tokens only);
  - `tests/e2e/app-stub.mjs` (the stubbed Supabase server and routes, moved out of `deck.spec.mjs`, which now imports it);
  - `tests/e2e/app-shell.spec.mjs` (port `E2E_PORT || 5195`).
- Modify:
  - `app.html`:
    - the header keeps the brand, `<nav class="app-header-nav" data-nav-host="header">`, the notification bell and the avatar;
    - add `<nav class="app-tabbar" data-nav-host="tabbar" aria-label="Member navigation">` after `</main>`;
    - move `#open-discovery-filters` into `.home-heading`;
    - delete `#app-logout-button`, `.profile-sidebar`, `.profile-board-nav` and `.profile-board-user`.
  - `app.js`:
    - fill both nav hosts from `navMarkup` before `routeFromUrl()`;
    - `setView` sets `aria-current="page"` on the active items;
    - delete `renameExploreToConnect` and its `MutationObserver`;
    - fix the inbox empty copy at its source (line ~1160): "Send a signal from Connect to start one." and "CONNECT WITH PEOPLE ↗";
    - delete the `.chat-sidebar-brand` block from the inbox markup (line ~1165).
  - `app-navigation.css`, `profile-theme.css`, `mobile-app.css`, `mobile-final-fixes.css`: delete the rules for the removed elements and the 6–8 px nav label rules.
  - `explore.html`, `chat.html`, `profile.html`: reduce each to the redirect script, a `<noscript><a href>` link and the title. All fake people and data are removed.
- Test: `tests/unit/app-nav.test.mjs`, `tests/e2e/app-shell.spec.mjs`

**Interfaces:**
- Consumes: tokens (Task 1).
- Produces:
  - `NAV_ITEMS: {view: 'explore'|'posts'|'chat'|'profile', label: string, icon: string /* inline SVG, aria-hidden */}[]`, with labels `Connect`, `Explore`, `Chat`, `Profile` in that order;
  - `navMarkup(variant: 'header'|'tabbar', activeView: string) => string`. Each item is `<a class="app-nav-button" href="/app.html?view=<view>" data-nav="<view>">`, and `aria-current="page"` goes on the active item. `activeView` `'home'` counts as `'explore'`. The chat item contains `<i class="nav-badge" data-chat-badge hidden></i>`.
  - The badge updater writes every `[data-chat-badge]`, not `#chat-badge`.
  - `app-stub.mjs`: `startAppStub({ port, state }) => Promise<{ url, close, calls }>` with the deck.spec state shape, plus `my_interests` (default 3 rows) and `community_posts`.

- [ ] **Step 1:** Before any change, capture app baseline screenshots (home/deck, posts, chat, profile at 375 and 1440, via the stub) to `.superpowers/sdd/phase-c/app-before/` for the founder's before/after review.
- [ ] **Step 2: Write failing unit tests:**
  - `navMarkup header and tabbar list the same four views in the same order`;
  - `the active item alone has aria-current="page"`;
  - `home is treated as explore`;
  - `every icon svg is aria-hidden`.
- [ ] **Step 3: Write failing e2e checks** (at 375 and 1440 unless noted):
  - `exactly one visible member nav`: the header nav at 1440 and the tab bar at 375;
  - `no .profile-sidebar, .profile-board-nav, #app-logout-button or .chat-sidebar-brand in the DOM`;
  - `tab bar items are ≥ 44×44 px with ≥ 12 px labels` (375);
  - `?view=chat, #profile, ?view=home, then Back: aria-current matches the visible [data-view] each time`;
  - `long name and area: no horizontal page scroll` (375);
  - `Tab reaches each tab bar item and the focus outline is visible`;
  - `an unread message shows the badge in header and tab bar`;
  - `axe: no violations on the nav`.
- [ ] **Step 4: Run** the unit and e2e tests. Expect FAIL. `deck.spec.mjs` must still pass after the stub move.
- [ ] **Step 5: Implement.** The tab bar is fixed to the bottom at ≤ 780 px with `padding-bottom: env(safe-area-inset-bottom)`, and `.app-main` gets matching bottom padding. The header nav is hidden at ≤ 780 px.
- [ ] **Step 6: Run** the unit tests, all five e2e suites, `check:styles` (counts may only fall) and landing parity. Expect PASS.
- [ ] **Step 7: Commit** `feat(app): one navigation, mobile tab bar, duplicate navs removed (Phase C)`.

### Task 3: Separate landing and auth CSS, auth focus order

**Files:**
- Create: `landing-entry.js`, `auth-entry.js`. Each is a few CSS imports (tokens first), then `import './script.js'`.
- Modify:
  - `script.js` (drop its CSS imports);
  - `index.html` and `auth.html` (point `<script type="module">` at their entry);
  - `auth.html` (`.auth-success-mark` gets `aria-hidden="true"`);
  - `auth-a11y.css` (remove the ≤ 780 px `order` rule so the visual order matches the DOM: Back above Create).
- Test: extend `tests/e2e/onboarding.spec.mjs` (new block 15) and `tests/e2e/landing.spec.mjs`.

**Interfaces:**
- Consumes: `tokens.css` (Task 1).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write failing checks:**
  - landing: `the landing CSS bundle contains no .signup-step or .auth-success selectors`, read from the built `dist/assets/*.css` linked by `dist/index.html`;
  - onboarding 15: `at 375 the Tab order of the step-4 actions matches their visual top-to-bottom order` and `.auth-success-mark is aria-hidden`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Split the imports so each page loads only what it renders. The deciding test is screenshot parity: landing byte-identical (Global Constraints), and auth signup steps 1–4 plus the success panel at 375 and 1440 byte-identical to before. The one exception is the step-4 actions at ≤ 780 px, whose order change is intended.
- [ ] **Step 4: Run** the onboarding and landing e2e, the build, landing and auth parity, and Lighthouse mobile on `vite preview`. Record the score in the commit body and D-055; the target is ≥ 0.90 (Ruling H).
- [ ] **Step 5: Commit** `perf(css): separate landing and auth CSS; auth focus order (Phase C)`.

### Task 4: One type system

**Files:**
- Modify: every CSS file imported by `app.js` or `auth-entry.js`, and `privacy.css`/`careers.css` only where they share selectors with them:
  - `font-family` → `var(--font-heading)` for headings, wordmark and `h1–h3`/display classes; `var(--font-body)` for the rest;
  - font sizes under 12 px → `var(--text-12)`;
  - remaining sizes snapped to the nearest scale token.
- Test: `tests/e2e/app-shell.spec.mjs` (new checks), `tests/e2e/onboarding.spec.mjs` (one check).

**Interfaces:**
- Consumes: `--font-heading`, `--font-body`, `--text-*` (Task 1).

- [ ] **Step 1: Write failing e2e checks:**
  - `every visible text node in each app view has computed font-size ≥ 12px`: walk text nodes with non-empty trimmed text and a non-zero rect;
  - `computed font-family of every visible text node starts with "Bodoni Moda" or "Instrument Sans"` (app views and auth steps 1–4);
  - `h1/h2 in app views use Bodoni Moda`.
- [ ] **Step 2: Run.** Expect FAIL, listing offending selectors.
- [ ] **Step 3: Implement** the replacements. Landing-only rules stay untouched (the parity guard decides). `check:styles` font-family counts must fall.
- [ ] **Step 4: Run** all e2e suites, landing parity and `check:styles`. Expect PASS.
- [ ] **Step 5: Commit** `style(app): Bodoni headings, Instrument Sans body, 12px floor (Phase C)`.

### Task 5: Profile declutter and "Complete your profile"

**Files:**
- Create: `profile-checklist.js` (pure), `profile-view.css` (tokens only)
- Modify:
  - `app.html` (the profile section): keep `.profile-hero` (cover, photo, name, area, Edit profile, ⚙). Add `<section id="profile-checklist">` and `<section id="profile-interests">`, the "looking for" and experience sections. Delete `.profile-stat-grid`, `.profile-dashboard` ("Show up as yourself"), `.profile-quick-stats`, `.profile-details-card`, `.profile-login-card`.
  - `app.js`:
    - `renderProfile` fills the new sections and drops the writes to the deleted ids;
    - load `fetchMyInterests()` once per profile visit;
    - the ⚙ menu starts with a non-interactive `<p class="profile-settings-account">Signed in as <strong>{own email}</strong></p>`.
  - `profile-theme.css`, `member-polish.css`: delete the rules for the removed blocks.
- Test: `tests/unit/profile-checklist.test.mjs`, `tests/e2e/app-shell.spec.mjs`

**Interfaces:**
- Consumes:
  - `fetchMyInterests()` → rows `{interest_id, label, points, mode}` (`supabase.js:287`);
  - `defaultCoverUrl`, `normalizeCoverUrl` (`cover-assets.js`);
  - `app-stub.mjs` `my_interests`.
- Produces: `profileChecklist(profile, interests, defaultCover) => { items: {key, label, done, action}[], done: number, total: 5, complete: boolean }`.
  - Keys, in this order:
    - `photo` ("Add a profile photo", done when `photoUrl`);
    - `cover` ("Choose a cover", done when the normalized `coverUrl` is set and ≠ the normalized default);
    - `interests` ("Pick 3 or more interests", done when `interests.length >= 3`);
    - `looking` ("Say what you're looking for", done when `lookingFor` is non-empty);
    - `experience` ("Add your experience", done when `experience` is non-empty).
  - `action` is `'editor'` for all five, and opens `openProfileEditor()`.

- [ ] **Step 1: Write failing unit tests:**
  - `a new member is 1/5` (interests 3, nothing else);
  - `the default cover does not count, a legacy hashed default cover does not count`;
  - `a complete member is 5/5 and complete`;
  - `whitespace-only lookingFor is not done`;
  - `order is photo, cover, interests, looking, experience`.
- [ ] **Step 2: Write failing e2e checks:**
  - `profile shows hero, then checklist, then interests, looking for, experience, in DOM order`;
  - `no element contains the member's email outside the ⚙ menu`;
  - `none of the removed sections is in the DOM` (stat grid, dashboard, quick stats, details card, login card);
  - `checklist reads "1 of 5" for a new member and its first item opens the profile editor`;
  - `a complete member sees only "Profile complete"`;
  - `interests list each label with a bar whose width ∝ points/20; a private interest is labelled Private`;
  - `long name and area: no horizontal scroll at 375`;
  - `axe clean on the profile`.
- [ ] **Step 3: Run.** Expect FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the unit tests, all e2e suites, `check:styles` and landing parity. Expect PASS.
- [ ] **Step 6: Commit** `feat(profile): calm profile with a completion checklist and interest points (Phase C)`.

### Task 6: Feel (skeletons, states, transitions, empty states)

**Files:**
- Create: `app-skeletons.js` (pure markup and busy helpers)
- Modify:
  - `app.js`:
    - the deck load (`deck.loading`, line ~603), `renderChats`, `loadCommunityPosts` and the profile interests load show skeletons and set `aria-busy`;
    - pitch submit, post submit and profile save use `setBusy`;
    - the posts empty state gets a "Write the first post" button that focuses `#community-post-form textarea`.
  - `app-shell.css`: hover, `:active` (`transform: scale(.98)`), `:focus-visible` and `[aria-busy="true"]` states for `button`, `.app-nav-button` and `a.button`-like classes, with transitions on `var(--motion-base) var(--ease)`.
  - `skeleton.css`: take its colours from tokens. The visual result must not change: landing parity.
- Test: `tests/unit/app-skeletons.test.mjs`, `tests/e2e/app-shell.spec.mjs`

**Interfaces:**
- Consumes: `.skeleton` (`skeleton.css`), tokens, `app-stub.mjs` (add a per-route `delayMs` and `status` override).
- Produces:
  - `skeletonMarkup(kind: 'deck'|'list'|'posts'|'chips', count = 3) => string`. The root is `<div class="skeleton-group" aria-hidden="true">`, and it contains `count` `.skeleton` blocks (`deck` always 1);
  - `setBusy(el: HTMLElement, busy: boolean) => void`. It toggles `aria-busy` and `disabled` and keeps the label width (sets `min-width` to the current width while busy).

- [ ] **Step 1: Write failing unit tests:**
  - `deck skeleton has one card block`;
  - `list skeleton has count rows`;
  - `skeleton group is aria-hidden`;
  - `setBusy toggles aria-busy and disabled and restores both` (a minimal fake element).
- [ ] **Step 2: Write failing e2e checks:**
  - `deck_candidates delayed 3s: skeleton visible and container aria-busy within 300 ms; card replaces it; CLS < 0.1`;
  - `deck_candidates 500: no .skeleton remains after 2 s and the retry action is visible`;
  - `chat list and posts show skeletons while delayed`;
  - `every empty state (deck caught up, inbox, posts, notifications) contains a button or link`;
  - `reduced motion: transition-duration 0s on .app-nav-button and no shimmer animation`;
  - `post submit button is aria-busy while the insert is pending`.
- [ ] **Step 3: Run.** Expect FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Full gate** (Global Constraints) plus landing parity. Then:
  - capture the app "after" screenshots to `.superpowers/sdd/phase-c/app-after/`;
  - append D-055 (Phase C results: nav decision, tokens and ratchet, Lighthouse score, landing parity held) to `docs/DECISIONS.md`;
  - update `docs/HANDOFF.md` (Phase C done, the `app-shell` e2e command, `check:styles`).
- [ ] **Step 6: Commit and push** `feat(app): skeletons, button states, transitions, empty-state actions; D-055 (Phase C)` to `claude/jolly-edison-49xvza`. Show the founder the before/after screenshots and ask before fast-forwarding `main`.
