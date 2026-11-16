<div align="center">

# The Brivia Club

**A location-first, interest-matched networking platform.**
Meet people who care about what you care about, starting with your own neighbourhood.

[**thebriviaclub.live**](https://thebriviaclub.live) · [Vision](docs/VISION.md) · [Where we are now](docs/HANDOFF.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## What it is

Brivia Club matches members on the interests they genuinely care about, weighted by how much they care, and shows
the people nearby first: the neighbourhood, then the city, then the region. Search reaches everyone, and someone far
away is only recommended when the match is strong enough to justify the distance.

The matching engine is our own work and is called **ORBIT** (spec in [`docs/ORBIT_ENGINE.md`](docs/ORBIT_ENGINE.md)).

Product rules that every change must respect:

- **Privacy:** exact coordinates are never stored or shown to other members. Only a coarse cell is kept and distances
  are rounded ("~3 km"). Email and phone never reach another member's client.
- **Mutual consent:** a connection exists only after both people agree.
- **ORBIT is original IP:** never paste another platform's ranking code into it.

## Tech stack

| Layer | What we use |
|---|---|
| Front end | [Vite](https://vitejs.dev), vanilla JavaScript (ES modules), plain CSS, GSAP and Lenis for motion |
| Backend | [Supabase](https://supabase.com): Postgres with row-level security, Auth, Storage, Realtime, Edge Functions |
| Matching | `orbit/`, a pure JavaScript library (Node 22, `h3-js`), unit tested |
| Hosting | [Vercel](https://vercel.com) (static build from `dist/`), with Vercel Analytics and Speed Insights |
| Payments | Razorpay, through Supabase Edge Functions |

## Quick start

You need **Node.js 22** (see [`.nvmrc`](.nvmrc)) and npm.

```bash
git clone https://github.com/Georgian-86/brivia-club-v1.git
cd brivia-club-v1
npm install
cp .env.example .env.local      # then fill in the two Supabase values
npm run dev                     # http://localhost:5173
```

The landing page (`/`), `about.html`, `careers.html` and `privacy.html` work without a backend. Sign-in, the app,
chat and explore need a Supabase project; see [Database](#database-supabase) below.

### Environment variables

Set these in `.env.local` for local work and in the Vercel project settings for deploys. Vite only exposes
variables that start with `VITE_`, and everything here ends up in the browser, so never put a secret in it.

| Variable | Required | What it does |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | yes | The project's public anon key (`VITE_SUPABASE_PUBLISHABLE_KEY` also works). Row-level security is what protects the data. |
| `VITE_SIGNUP_FLOW` | no | Empty for the guided one-question-per-screen signup; `classic` brings back the old 4-step form |
| `VITE_VAPID_PUBLIC_KEY` | no | Web push public key; `site/scripts/web-push.js` has a default |

Server-side secrets (VAPID private key, Razorpay keys, Resend key) live only in Supabase Edge Function secrets,
never in this repo. See [`supabase/migrations/README.md`](supabase/migrations/README.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Client unit tests (`node --test`, no browser needed) |
| `npm run test:orbit` | ORBIT engine unit tests (installs `orbit/` deps on first run) |
| `npm run check:assets` | Fails if shipped media goes over the size budget |
| `npm run check:styles` | Style ratchet: new CSS must use design tokens, not raw hex colours |
| `npm run media:build` | Re-encode media from `source-media/` into `site/media/` (needs `ffmpeg`) |
| `bash supabase/tests/run.sh` | SQL harness: every migration twice, every `*.test.sql`, seed and purge (needs local PostgreSQL 16) |

End-to-end checks run in a real browser against a stubbed Supabase; they never touch a live project:

```bash
npm install --prefix /tmp/pw playwright axe-core
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/deck.spec.mjs
```

Each spec starts its own Vite server. [`tests/e2e/README.md`](tests/e2e/README.md) lists what each one covers.

## Project structure

```text
brivia-club-v1/
├── site/                 Vite root. Everything the website ships.
│   ├── index.html        Landing page (+ about, auth, app, explore, chat, profile, careers, privacy)
│   ├── scripts/          All client JavaScript, one module per feature (deck-view.js, chat-*.js, events-*.js, ...)
│   ├── styles/           All CSS. Design tokens live in tokens.css; brand is deep wine (docs/UX_SPEC.md)
│   ├── media/            Optimised images, video and audio (generated from source-media/)
│   └── public/           Copied as-is: favicon, manifest, service worker, robots.txt, sitemap, city/company data
├── orbit/                ORBIT matching engine: pure JS library with its own tests (orbit/README.md)
├── supabase/
│   ├── migrations/       Numbered SQL migrations, applied in order. README.md is the go-live runbook
│   ├── functions/        Edge Functions (Deno): push-notify, directory, event-ticket, razorpay-*
│   ├── tests/            SQL harness (run.sh) and *.test.sql files
│   ├── seed/             Test members for local and tester worlds, plus the purge script
│   ├── catalog/          Interest catalogue and company lists the migrations load
│   └── legacy/           Archive only. Do not run.
├── tests/
│   ├── unit/             node --test unit tests for client helpers
│   └── e2e/              Playwright specs against a stubbed Supabase
├── scripts/              Build tooling: media encoding, catalogue builders, style and asset checks
├── source-media/         Raw originals and 4K masters. Never shipped (.vercelignore)
├── docs/                 Product, engine and decision docs (see below)
├── .claude/              Vendored Claude Code skills and settings used by AI-assisted sessions
├── vite.config.mjs       Multi-page build: one entry per HTML page
└── vercel.json           Build command, cache headers and noindex rules for app pages
```

Page URLs map one-to-one to files in `site/` (`/chat.html` is `site/chat.html`), so links never change when code moves.

## Database (Supabase)

Migrations live in [`supabase/migrations/`](supabase/migrations/) and are applied by hand in the Supabase SQL editor,
in numeric order. [`supabase/migrations/README.md`](supabase/migrations/README.md) is the runbook: it says what each
migration does, what to check before and after, and which Edge Function to redeploy with it.

Ground rules:

- Never edit a migration that has been applied to production. Add a new numbered file instead.
- Every migration must be idempotent. The SQL harness applies the whole chain twice to prove it.
- Every table has row-level security. Members read other members only through the intended RPCs and views.
- Run `bash supabase/tests/run.sh` before you open a pull request that touches SQL.

To set up your own project for development: create a Supabase project, put its URL and anon key in `.env.local`,
run the migrations in order, then load `supabase/seed/test-members.sql` if you want people in the deck.

## Deploying

The site deploys to Vercel from `main`. Every pull request gets a preview deployment, and merging to `main`
publishes to **[thebriviaclub.live](https://thebriviaclub.live)** (the same build is also served on thebriviaclub.com).

1. Open a pull request. Check the Vercel preview link it gets.
2. If it ships SQL, apply the migration in the Supabase SQL editor in the same window as the merge, as the
   migrations README describes, and redeploy any Edge Function it names.
3. Merge. Vercel builds with `npm run build` and serves `dist/`.

Daily moderation and incident handling: [`docs/MODERATION.md`](docs/MODERATION.md),
[`docs/BREACH_RUNBOOK.md`](docs/BREACH_RUNBOOK.md).

## Documentation

| Doc | Read it when |
|---|---|
| [`docs/VISION.md`](docs/VISION.md) | You want the product aim and the rules that never change |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | You are picking up work: what is done, what is live, what is next |
| [`docs/ORBIT_ENGINE.md`](docs/ORBIT_ENGINE.md) | You touch matching, ranking, search or location (read it first, every time) |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | You want to know why something is the way it is. Append only |
| [`docs/UX_SPEC.md`](docs/UX_SPEC.md) | You change anything a member sees |
| [`docs/IP_NOTES.md`](docs/IP_NOTES.md) | You want to know how the engine is protected |
| [`docs/ENGINE_AUDIT.md`](docs/ENGINE_AUDIT.md) | You want the audit of the older engine ORBIT replaces |
| [`CLAUDE.md`](CLAUDE.md) | You work with Claude Code in this repo |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, conventions and the checklist a pull request needs.

## License

All rights reserved. This is proprietary software, and the ORBIT engine and its specification are original work
intended for copyright registration. Third-party code and data keep their own licenses; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
