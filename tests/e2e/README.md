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
called. A second browser context serves a 41-member directory in keyset pages to check load-more, name search and
post authors.
