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

`onboarding.spec.mjs` (Iteration 3, Task 8) loads `auth.html` the same way (Vite on :5198, stubbed Supabase) and checks
the 4-step signup: "STEP n OF 4" at 375 px and 1440 px, geolocation granted / denied / missing / timed out, the
keyboard-only Passion Budget, the submit order, the email-confirmation pending profile (no coordinates) and the
`my_onboarding_status` gate from `app.html`, including the "Profile under review" notice for a member whose every step
is done but `completed` is false, and that a failed save never withdraws a consent given before it (final fix F2). `E2E_SCREENSHOTS=<dir>` also saves screenshots of the key states.

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/onboarding.spec.mjs
```

`deck.spec.mjs` (Iteration 3, Task 10) loads `app.html` the same way (Vite on :5197) and checks the location-first deck:
the distance band and "You both" chips, no City/State anywhere even when the stub wrongly adds them, no PLACE filter,
one `interaction` pass POST per Pass, the A5 neutral pitch line, no wrap-around, every empty state (`caught_up`,
`no_members_yet`, `complete_profile`, filters) with its one action, and 375 px chip wrapping and 44 px targets.
`E2E_SCREENSHOTS=<dir>` saves the card, quota and empty states at 375 px and 1440 px.

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/deck.spec.mjs
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
