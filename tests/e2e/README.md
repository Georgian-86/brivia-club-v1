# E2E checks (stubbed Supabase, never a live project)

`consent.spec.mjs` loads `app.html` under Vite with `VITE_SUPABASE_URL=https://stub.supabase.local` and answers every
Supabase REST/RPC call with Playwright `route` stubs (Ruling P4). Playwright is **not** a repo dependency; install it
outside the repo and point the script at it:

```bash
npm install --prefix /tmp/pw playwright axe-core   # no `playwright install`; uses an existing Chromium
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node tests/e2e/consent.spec.mjs              # starts Vite on :5199 itself, prints PASS/FAIL per check
```

Other members are stubbed only at `/rest/v1/rpc/deck_candidates` (rows in the 0004 Task 7 shape, with
`distance_band` and `shared_interests`; `deck_status` and the pass `POST /rest/v1/interaction` too),
`/rest/v1/rpc/get_candidates` and `/rest/v1/rpc/search_members`; the app never calls `rpc/list_members` any more; `/rest/v1/public_profiles` answers 403 and the script asserts it is never
called. Signals go only through `/rest/v1/rpc/send_signal` (one row `{ status, remaining, resets_at }`) and the
counter reads `/rest/v1/rpc/my_signal_quota` (migration 0004, D-032); a `POST /rest/v1/connection_requests` answers 403 and
the script asserts it is never made. A separate context checks the honest quota: the counter, the zero-quota state, a
`PT429 signal_quota_exhausted` race and 20 free passes. `E2E_SCREENSHOTS=<dir>` saves the quota states. A second browser context serves a 41-member directory in keyset pages to check load-more, name search and
post authors.

`onboarding.spec.mjs` loads `auth.html` the same way (Vite on :5198, stubbed Supabase). Phase E Task 5 retired the
4-step form it used to drive; it now checks the old pending profile (an account made with that form that confirmed its
email later) applied once at the next login (declaration, then city, then interests; never a coordinate; a second login
never re-applies the city; an 8-day-old one is dropped; its photo preview uploads once), what the guided flow shows when
part of it fails, and the `my_onboarding_status` gate from `app.html` (to the first incomplete guided screen), including
the "Profile under review" notice for a member whose every step is done but `completed` is false, and that a failed save
never withdraws a consent given before it (final fix F2).

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/onboarding.spec.mjs
```

`signup.spec.mjs` (Phase E, Task 3) checks the guided signup on `auth.html#signup` (Vite on :5193, stubbed Supabase
including `/auth/v1/otp`, `/auth/v1/verify` and `/auth/v1/authorize`). One command runs three Vite servers in turn, one per
`VITE_SIGNUP_METHODS` value (`google,email`, `google`, empty). It covers Welcome, Email, the six-box Code screen (typing,
paste of "123 456", a wrong and an expired code, Resend's 60 s countdown with Playwright's fake clock and a 429, a 429 on
the Email screen's first send, and no new send for the same address inside the countdown), the four-colour Google mark, Back and
browser Back after verification (Welcome "Signed in as …", never Email or Code), the pinned primary button above a simulated
300 px keyboard (a fake `visualViewport`), reduced motion, and axe (full rule set), 12 px text and one heading plus one
primary action on every screen at 320, 375 and 1440 px (at 320 the step label must not overlap the page's ×). `E2E_SCREENSHOTS=<dir>` saves every screen. Task 5 added: a session on
`auth.html` (`#signup`, `?complete-profile=1`) resumes at the first incomplete screen ("Step 5 of 6" / "Step 3 of 4" on
Area) or lands a completed member on `/app.html`; login's "Email me a code instead" (`create_user: false`, the same
Code screen without a step label); the verify 429 copy; no phone, gender or points input in `auth.html`; browser Back
after the Reveal never shows a profile screen again; and the expanded phone tray scrolling a new pick into view.
`consent.spec.mjs` covers the passwordless member's "Send me a code" delete re-auth, and (Phase E Task 6) a profile
editor with no phone field whose PATCH carries no phone or gender key. `onboarding.spec.mjs` 9c checks that the Area
screen's ~2 km privacy explainer is visible when the browser's location prompt is requested.

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs
```

`deck.spec.mjs` (Iteration 3, Task 10) loads `app.html` the same way (Vite on :5197) and checks the location-first deck:
the distance band and "You both" chips, no City/State anywhere even when the stub wrongly adds them, no PLACE filter,
one `interaction` pass POST per Pass, the A5 neutral pitch line, no wrap-around, every empty state (`caught_up`,
`no_members_yet`, `complete_profile`, filters) with its one action, and 375 px chip wrapping and 44 px targets.
`E2E_SCREENSHOTS=<dir>` saves the card, quota and empty states at 375 px and 1440 px.

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/deck.spec.mjs
```

`app-stub.mjs` (Phase C, Task 2) is the shared stubbed Supabase for `app.html` specs, moved out of `deck.spec.mjs`:
`startAppStub({ port, state })` starts Vite and returns `{ url, close, calls, newContext, open }`; `state` is the deck.spec
shape plus `my_interests` (3 rows by default), `community_posts`, `brivia_messages`, `own` and `placeLabel`.
`app-shell.spec.mjs` (Vite on :5195) checks the one member navigation: the header nav at 1440 px and the tab bar at
375 px (never both), no duplicate navs, 44 px tab targets with 12 px labels, `aria-current` through `?view=`, `#hash`,
the `home` alias, a tab click without reload and Back, no sideways scroll with a long name and area, keyboard focus,
the chat badge in both navs, and axe on the nav. Since Phase C Task 4 it also checks one type system on Connect, Explore,
Chat (list and an open thread), Profile, the notification panel and the discovery-filter drawer at 375 and 1440 px: every
visible text (and `::before`/`::after` text) is at least 12 px and set in Bodoni Moda or Instrument Sans, visible h1/h2 use
Bodoni Moda, and the Bodoni Moda 500 italic face (`fonts-app.css`) loads. `a11y.mjs` `textAudit` returns both lists
(`smallText` is its size half); `onboarding.spec.mjs` runs the family check on signup steps 1-4 too. The pre-review fixes added: the chat badge inside its nav item and the viewport (and the
bell badge inside the viewport), the deck card's VIEW PROFILE inside the card, the chat compose placeholder inside its
field, and every profile ⚙ menu item on top and 44 px tall; Enter on ⚙ opens the menu, Tab walks its five items in order,
Escape closes it and returns focus to ⚙, and a view change or resize closes it. `APP_SHOTS` also saves the profile edit dialog, the ⚙ menu,
the report dialog and the post composer at 375 px. `APP_SHOTS=<dir>` only saves home/posts/chat/profile screenshots at
375 px and 1440 px (the Phase C before/after review).
Phase D Task 3 added "Why this person?" to `deck.spec.mjs`: `state.why` (`{ [target id]: row }`) makes the stub answer
`rpc/deck_why` as for a tester; the default (`null`) answers `[]`, as for a real member. It checks the toggle (44 px,
`aria-expanded`/`aria-controls`, Enter/Space/Escape), the panel's shared interests, band and order keys at 1440 and
375 px (inside the card, clear of Pass/Pitch, text >= 12 px, axe), the next card's panel, and that a real member asks
`rpc/deck_why` once and never again. `WHY_SHOTS=<dir>` saves the card closed and open at both widths.
Phase D Task 2 added a post-image check to `app-shell.spec.mjs`: a preset illustration path renders the shipped asset (an
`<img>` under `/media/` or `/assets/` that loads), an external URL and an unknown preset name show the placeholder.
Phase C Task 6 added `state.routes`, per-route overrides keyed by the path after `/rest/v1/` (optionally prefixed by the
method, e.g. `'POST community_posts'`): `{ delayMs, status }` delays the answer and/or turns it into an error. The stub
also accepts Storage uploads. With it `app-shell.spec.mjs` checks the loading states (the deck skeleton and `aria-busy`
within 300 ms, the card replacing it with CLS < 0.1, no skeleton left after a 500 and a Try again that retries, chat list
and posts skeletons), an action in every empty state (deck caught up, inbox, posts, notifications), reduced motion
(0s nav transitions, no shimmer) and a busy post button; `APP_SHOTS` also saves the loading states, the deck error and the
empty posts and notifications at 375 px and 1440 px.
The Phase C final review added `{ body }` to `state.routes` (answer 200 with that JSON as is) and checks, at 375x667 and
390x844, that the tab bar is hidden and every control is on top while each overlay or dialog is open (filter drawer, public
profile, report, profile editor, notification / blocked / removed / privacy dialogs, pitch sheet), that a tap at SEND
PITCH's centre sends exactly one `rpc/send_signal`, that the under-review notice and an open chat thread (375 px) show no
tab bar, that the ⚙ menu survives a blur to nowhere and a click on "Signed in as", that a refill that throws ends in Try
again, that every visible text field is >= 16 px at 375 px (also each signup step in `onboarding.spec.mjs`), and that
re-tapping Profile reads `my_interests` no more. `APP_SHELL_FINAL_ONLY=1` runs only those checks. `APP_SHOTS` also saves
the pitch sheet (375, 1440), an open chat thread and the under-review notice (375).

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs
```

`consent.spec.mjs` section 10 (Iteration 4, Task 9) also covers PRIVACY & ACCOUNT with mocked Storage `list`/`remove`
(`/storage/v1/object/list/<bucket>`, `DELETE /storage/v1/object/<bucket>`), `delete_my_account` (`reauth_required` before any
Storage call, `storage_not_empty` while files remain, then `ok`, a 500), `set_sensitive_consent` and the password / Google re-auth paths; the `deleted=1` landing is stubbed there, and section 11 checks the real page.

**Accessibility checks (Iteration 4, Task 10).** `a11y.mjs` is a shared helper, not a spec. It injects
`/tmp/pw/node_modules/axe-core/axe.min.js` (override with `AXE_PATH`) through `page.addScriptTag`. `onboarding.spec.mjs` runs
only axe's `color-contrast` rule on signup steps 1-4 and `deck.spec.mjs` on the deck card (a place-band card too); both
also assert that every visible text node there, and every `::before` / `::after` text, has a computed font-size of
at least 12 px. `consent.spec.mjs` section 11 loads the real `privacy.html` and runs axe's full default rule set
(plain and `?deleted=1`), checks 375 px (no sideways scroll, stacked retention table), the `role="status"` banner and 12 px
text. Any violation fails the run. The only element hidden for axe is a purely decorative pseudo-element overlay
(`.auth-shell::before`, `.swipe-card-info::before`), because axe cannot compute a background underneath one. The deck page
background is a photo, so axe reports its kicker, heading and hint line as "incomplete" (not decidable); `A11Y_DEBUG=1`
prints what axe could not decide.

Unit tests for the pure client helpers: `npm run test:unit` (`node --test tests/unit/*.test.mjs`; Node 22 does not
expand a bare directory argument).
The founder live-test hotfix (D-061) added the heavy swipe to `deck.spec.mjs`: a short drag springs back and sends
nothing; mid-drag the card turns (<= 12 deg) with the PASS / PITCH stamp; a drag right past 30% opens the pitch for the
card that stays on screen (nothing sent until the sheet resolves; sending carries the note); a drag left past 30% and an
80 px fling (raw CDP mouse events with timestamps) pass; no click-through from VIEW PROFILE; the Pitch button keeps the
card behind the sheet and Escape then sends the plain like (D-018); ArrowLeft / ArrowRight; the buttons fly the card;
reduced motion has no rotation; at 1920x1080, 1366x768, 1440x900 and 1280x720 the card is below the top bar and Pass /
Pitch are centred under it (axe clean); a missing or broken cover shows the placeholder; touch (CDP touch events at 390
px): a vertical drag scrolls, a horizontal one passes. `SWIPE_SHOTS=<dir>` saves the stack, mid-drag, pitch-behind-sheet,
layout and broken-cover screenshots.
