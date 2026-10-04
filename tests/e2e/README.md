# E2E checks (stubbed Supabase, never a live project)

`consent.spec.mjs` loads `app.html` under Vite with `VITE_SUPABASE_URL=https://stub.supabase.local` and answers every
Supabase REST/RPC call with Playwright `route` stubs (Ruling P4). Playwright is **not** a repo dependency; install it
outside the repo and point the script at it:

```bash
npm install --prefix /tmp/pw playwright        # no `playwright install`; uses an existing Chromium
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node tests/e2e/consent.spec.mjs              # starts Vite on :5199 itself, prints PASS/FAIL per check
```

Other members are stubbed only at `/rest/v1/rpc/list_members`, `/rest/v1/rpc/get_candidates` and
`/rest/v1/rpc/search_members` (migration 0003); `/rest/v1/public_profiles` answers 403 and the script asserts it is never
called. Signals go only through `/rest/v1/rpc/send_signal` (one row `{ status, remaining, resets_at }`) and the
counter reads `/rest/v1/rpc/my_signal_quota` (migration 0004, D-032); a `POST /rest/v1/connection_requests` answers 403 and
the script asserts it is never made. A separate context checks the honest quota: the counter, the zero-quota state, a
`PT429 signal_quota_exhausted` race and 20 free passes. `E2E_SCREENSHOTS=<dir>` saves the quota states. A second browser context serves a 41-member directory in keyset pages to check load-more, name search and
post authors.

`onboarding.spec.mjs` (Iteration 3, Task 8) loads `auth.html` the same way (Vite on :5198, stubbed Supabase) and checks
the 4-step signup: "STEP n OF 4" at 375 px and 1440 px, geolocation granted / denied / missing / timed out, the
keyboard-only Passion Budget, the submit order, the email-confirmation pending profile (no coordinates) and the
`my_onboarding_status` gate from `app.html`. `E2E_SCREENSHOTS=<dir>` also saves screenshots of the key states.

```bash
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/onboarding.spec.mjs
```

Unit tests for the pure client helpers: `npm run test:unit` (`node --test tests/unit/*.test.mjs`; Node 22 does not
expand a bare directory argument).
