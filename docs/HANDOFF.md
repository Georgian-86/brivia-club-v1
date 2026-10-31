# Session handoff (read after CLAUDE.md)

Last updated: 2026-10-28 (D-100 chat inbox, D-101 post activity and 0015, D-102 photo and setup). Before that: 2026-10-20 (live-database correction D-070; "Send without a note" D-071). Before that: 2026-10-16 (design references, D-062). Before that: 2026-10-13, after Phase D of the experience iteration (the test world), on branch
`claude/jolly-edison-49xvza` (repo `Georgian-86/brivia-club-v1`). Phases C and D are not on `main` yet, and Phase D's SQL
is not applied: the founder applies it in the SQL editor (section 3, item 0).
Update this file at the end of every session. CLAUDE.md holds the aim; this file holds **where we are**.

## 1. What is done

**2026-10-31, signup About you (D-112):** after the photo, a required "About you" step: Looking for (a dropdown of the
Edit profile suggestions, or the member's own words, up to 8) and a bio (20 to 300 characters). It is now the last
signup step and creates the account ("Step n of 6", Google "of 5"). A signed-in member without looking for (or, once
0016 is live, a bio) resumes there; completed members are never sent back. The bio is stored only once
`0016_profile_bio.sql` is applied: before that the signup saves everything else. Proof: e2e signup 355, unit 376.

**2026-10-29, same branch (D-107 to D-110; plan `docs/superpowers/plans/2026-10-29-collab-requests-interests-presence.md`):**
- **Post cards (D-107, live):** counts inline beside the icons, one fixed 40 px footer on every card ("Liked by …" /
  "View N comments", or "Be the first to like this"), so action bars line up.
- **Requests (D-108, live):** no Accept / Decline; the notification panel shows "See who wants to collaborate with you"
  and Review opens a one-card-at-a-time sheet (Connect / Not now, drag or arrow keys; Not now declines quietly).
  `collab-requests.js`, e2e `collab-requests.spec.mjs`.
- **Interest catalogue (D-109, client live, needs `0017_interest_catalog.sql`, NOT applied):** the founder's A–Z list
  in both pickers under letter headings, and "Add … as your own interest" (`add_member_interest`). Source
  `supabase/catalog/interest-catalog.tsv` → `node scripts/build-interest-catalog.mjs`. ORBIT treats `member.*`
  interests as exact-match only (`placed: false`).
- **Active status (D-110, needs `0018_member_presence.sql`, NOT applied):** one green dot on a connection's avatar in
  the chat list (founder: one dot only, nothing in the open chat). Settings → Notifications → "Show when I'm active".
- Proof: unit 375; orbit 87; SQL harness ALL PASSED (new g-interest-catalog, h-member-presence); e2e signup 329,
  onboarding 269, profile-edit, collab-requests, presence, consent 184, app-shell 211, deck 196, fit 324, chat suites.
- Known, not fixed here: the chat list's older axe findings (a button inside the row button, inbox tab roles, a
  4.42:1 "Unread" tab label).

**2026-10-28, branch `claude/wizardly-volta-6hv7or` (D-100 to D-102):**
- **Chat (D-100):** the phone inbox scrolls as a page again (a chat-view `overflow: hidden` lock had clipped it), a wheel
  anywhere in the desktop sidebar scrolls the rows, conversations sort by last contact, and the Chat badge counts
  unread messages (`chat-unread.js`, read state per member in the browser). e2e `chat-inbox.spec.mjs`.
- **Explore (D-101):** counts on Like / Comment / Share, "Liked by <connection>", threaded comments with Reply and
  Delete in the post sheet, and a share sheet that sends the link to a connection in chat. Needs
  **`0015_post_activity.sql` (written, NOT applied)**; until then the client hides counts and comments. e2e
  `post-activity.spec.mjs`, SQL `e-post-activity.test.sql`.
- **Shared post card in chat (D-103)** and **Edit profile (D-104):** editable interests, Experience dropdown, saved
  city shown, bio (needs **`0016_profile_bio.sql`, NOT applied**).
- **Signup (D-102):** the photo is a required last signup step ("Create account"); area and interests are a mandatory
  "Set up" right after (or after the email link). No SQL.
- Proof: unit 349; SQL harness ALL PASSED; e2e signup 319, onboarding 269, location 64, app-shell 211, explore-cards 74,
  post-activity 43, chat-inbox 15, chat-extras 145, consent 182, deck 196, fit 324, profile-media 193, deck-tutorial,
  mobile-polish, launch-polish, password suites; build, assets, style ratchet OK. (deck-tutorial's axe check flaked once
  on a mid-animation stamp, then passed twice.) No agent-arena was run for D-101's privacy design: run one before 0015
  goes live if the founder wants it.

**Explore post cards (2026-10-21, release C of the polish wave), D-074.** Explore posts are wine cards (header bar,
5:4 image (squarer since 2026-10-22), two-line caption, action bar: Like, Comment, Share, Save); one, two or three columns. Like and Save are
private to the member (no counts) and live in `0012_polish_wave.sql` section C, which the founder applies once after
parts A, C and D are on `main`; until then Like and Save are hidden and the rest works. Share sends a link only; Comment
opens the detail sheet (no comment storage yet). Also: the badminton illustration lost its baked-in grey checkerboard
(solid cream, same file name). Proof: `tests/e2e/explore-cards.spec.mjs`.

**"Send without a note" on the pitch sheet (2026-10-20), D-071.** A secondary button under SEND PITCH sends the like
with no note, exactly as closing the sheet does (D-018 unchanged), never twice. The × has a 44 px target and an
aria-label. Client only; proof in `tests/e2e/consent.spec.mjs` section 9b (1440 and 375 px, axe).

**Live database recorded and the notice fixed (2026-10-20), D-070.** D-069 was wrong that the database needed nothing:
`0009` (notice `2026-10-20`, `2026-10-05` accepted only until 2026-11-03) and `0010` (open-test-world switch) were
applied live on 2026-10-14 from `claude/jolly-edison-49xvza`. Both are now in `supabase/migrations/` verbatim with their
tests. New `0011_notice_version_2026_10_05.sql` makes `2026-10-05` current again with no expiry (and keeps `2026-10-20`
accepted); it must be applied before 2026-11-03 or no new member can finish signup. Proof:
`supabase/tests/p0f-notice-restore.test.sql`.

**Signup back to the classic form (2026-10-19), D-069.** The guided one-question-per-screen signup (D-067, D-068) was
live for one day and is removed at the founder's request; the 4-step form (UX_SPEC §A) is the only signup. No SQL
involved. The design and code stay in git history (commits 7a74194, 4e708c8) if it is ever wanted again.

**Phones (2026-10-18), D-066.** Hero prefers a hardware-decoded codec, lighter matching cards (`npm run media:cards`),
one shared scroll frame, no stacked sound buttons. Probe: `node tests/e2e/landing-phone-smoothness.mjs` (after a stub
build). The matching scene still drops frames here only because this container composites in software; check it on a
real phone. The login/signup bottom quote and its rule line are removed.

**Repository reorganized (2026-10-18), D-065.** The site lives in `site/` (pages at its top, so URLs are unchanged;
`site/styles/`, `site/scripts/`, `site/media/`), raw originals in `source-media/` (never shipped), the 59 stray root
screenshots and the old .docx are gone. Vite's root is `site/`, output still `dist/`. Builds are pixel-identical
(visual parity, 38 shots); every unit and e2e suite passes. File paths below are relative to `site/` unless they start
with another top-level folder.

**Live-site fixes (2026-10-18), D-064.** PR #2 (D-062, D-063) is merged and live. Follow-up: the hero now plays on
connections Chrome labels "3g" (only 2g is poster-only), a refused autoplay starts on the first touch, and the chat
room photo is softly blurred again (baked into `media/assets/chat-room-soft.webp`) with the reference sidebar order.

**Landing smoothness and sound (2026-10-16), same branch.** See D-063. Lenis smooth scroll (desktop pointer only),
cheaper matching-scene layers, sound that starts on the first real gesture and stops after 5 minutes, and a sound
button. Checks: `node tests/e2e/landing-sound.spec.mjs` (15 checks, after a stub build) and the frame-time probe
`node tests/e2e/landing-smoothness.mjs` (`SMOOTH_ASSERT=1` fails on a p95 frame over 34 ms; this container has no GPU,
so judge desktop smoothness on a real laptop). Open: the original `source-media/Images/Videos/HEROSECTIONVI.MOV` carries a real
soundtrack (the 4K master has none); the landing still plays its synthesized chord. Ask the founder before swapping.

**Design references (2026-10-16): branch `claude/focused-johnson-pev1j6` off `main` 07d1f45 (the live build).** See D-062.
- Deck card restyled to the founder's Canva card, chat to the "Brivia Society" screenshot (sharp room photo, #5a061e
  wine, serif type), the discovery filter drawer suggests a full catalog (chess, music, guitar, hackathons...) plus
  popular picks, and the landing hero is 4K only (AV1 / HEVC / H.264, a portrait crop for phones). Look-only CSS lives
  in `reference-design.css` (loads last); colours are tokens in `tokens.css`. No backend, RPC or data-flow change.
- Review screenshots: `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/design-shots.mjs`
  (deck card, filter drawer and an open chat at 390, 1024 and 1440 px into `.superpowers/shots/`, git-ignored).
- Re-encode the hero: `npm run media:hero4k` (about 15 minutes on 4 cores). The poster
  `media/posters/hero-section-video.webp` is unchanged and stays the LCP.
- To go live: the founder reviews the preview deployment of this branch, then fast-forwards `main` (D-051).
- Open for the founder: the chat masthead says "BRIVIA SOCIETY" as in the reference (product name is Brivia Club);
  one `content` string in `reference-design.css` changes it.

**Founder live-test hotfix (2026-10-14): branch `claude/deck-swipe-hotfix` off `main` 741b77b, not pushed.** See D-061 (D-059 is the open-test-world switch and D-060 Phase E, both on the working branch).
- The deck: card and Pass / Pitch aligned on desktop (controls centred under the card, card never under the top bar),
  the heavy left/right swipe (`deck-swipe.js`, unit-tested maths in `tests/unit/deck-swipe.test.mjs`), the stacked next
  card, the pitched card staying until the sheet resolves, and a branded placeholder for a missing or broken cover.
- Seed follow-up for the founder: 34 seeded test members have no cover and no photo (rows 1-24, and 30-32, 38, 46-48,
  58-60); the client now shows the placeholder, but giving them preset covers in `supabase/seed/test-members.sql` would
  make the test deck look finished. Open question: should cancelling a pitch send nothing and keep the card (changes
  D-018)? Today it sends the plain like, as D-018 says.

**Experience iteration, Phase D (2026-10-13): done on `claude/jolly-edison-49xvza`, NOT applied live, not pushed.**
See D-057 and D-058.
- `supabase/migrations/0008_tester_world.sql`: the tester switch (`brivia_tester`, `brivia_in_test_world`, 14
  world-checked functions, cross-world pair hiding when a tester is on one side), the post-image trigger (preset
  illustrations for `is_test` authors only), and `deck_why` (section 5).
- Seed v2 (`supabase/seed/test-members.sql`): 60 test members in Mumbai, Thane, Pune, Bengaluru and Delhi, with posts,
  requests, matches and chats, flags, blocks and consent rows; the role table is in `supabase/seed/README.md`. The purge
  removes all of it, empties `brivia_tester` and never deletes a tester's own account.
- "Why this person?" on the deck card, testers only (`why-panel.js`, `app.js`, `deck.css`): the band label, "You both:
  …" and the deck's order keys. A real member's client asks `rpc/deck_why` once per page and never again.
- Far matches: the deck still has no escape-velocity lane (60 km pool); the far-strong member is found by search, and
  a unit test runs it through ORBIT's gate. Wiring ORBIT's far lane into the deck is founder backlog (the harness
  assertion "far partner absent from deck" must flip then).
- Commit trailer rule (founder, Phase D on): commits end with the `Claude-Session:` line only, **no `Co-Authored-By`**.

**Experience iteration, Phase C (2026-10-13): done on `claude/jolly-edison-49xvza`** (not yet on `main`). See D-055.
- One member nav (`app-nav.js`: header at desktop, tab bar at <= 780 px; Connect · Explore · Chat · Profile), one set of
  tokens (`tokens.css`), one type system (Bodoni Moda headings, Instrument Sans body, 12 px floor), a calm profile
  column, and skeletons, busy buttons and an action in every empty state (`app-skeletons.js`).
- Final review fixes (D-055 addendum): the tab bar hides over overlays, dialogs, the review notice and an open chat
  thread; the ⚙ menu survives a focus loss to nowhere; a refill that throws ends in Try again; 16 px app fields on phones;
  no my_interests re-read on a Profile re-tap. `APP_SHELL_FINAL_ONLY=1` runs only those app-shell checks.
  Known, not fixed: between 701 and 780 px the header bell sits behind the avatar and the chat panel's right edge is
  clipped (seen in review screenshots; also on 03d1062).
- Landing CSS split (`landing-entry.js`, `auth-entry.js`): Lighthouse mobile 0.89 -> 0.93 (median of 3), LCP 2.6 s, CLS 0.
- Style ratchet: `npm run check:styles` (per-file hex and font-family counts may only fall; after a cleanup,
  `node scripts/check-style-ratchet.mjs --write` lowers the baseline and refuses if anything rose).
- Visual parity guard (byte-exact; the landing stayed identical through every Phase C task). It serves the existing
  `dist/`, so build with the stub Supabase first:
  `VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build`, then
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node scripts/visual-parity.mjs compare .superpowers/sdd/2026-10-12-phase-c-consistency/landing-before --pages index`
  (`capture <dir>` takes a new baseline; `--pages index,auth`; `--expect-diff a,b` names intended changes).
- App shell e2e (Vite on **:5195**, stubbed Supabase with per-route `routes` delay/status overrides):
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs`;
  `APP_SHOTS=<dir>` saves the views, dialogs, profile, loading and empty-state screenshots instead (final set:
  `.superpowers/sdd/2026-10-12-phase-c-consistency/app-after/`).
- Founder backlog surfaced (not Phase C) is listed at the end of D-055.

**Experience iteration, Phases A and B (2026-10-12): done and on `main`.** See D-053 and D-054.
- Media pipeline: `npm run media:build` (sharp + ffmpeg write `media/`), `npm run media:repoint` (rewrites references from `media/manifest.json`), `npm run check:assets` (budget on `dist/assets`: image <= 400 KB, video <= 5 MB). Originals stay in `Images/` and `assets/`.
- Landing e2e: `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/landing.spec.mjs` (builds, serves `vite preview` on :5196; checks poster-first, intro cap, reduced motion, transfer, CLS, LCP, fonts, skeleton).
- Lighthouse: `CHROME_PATH=/opt/pw-browsers/chromium npx lighthouse@12 http://127.0.0.1:4173/ --preset=perf --form-factor=mobile --chrome-flags="--headless --no-sandbox"`. Last result 0.86 to 0.89, LCP 2.8 s (target 90 / 2.5 s); next step is splitting the auth CSS off the landing critical path.
- axe `color-contrast` is blind on the cream auth panel (those nodes come back "incomplete"), so contrast fixes need computed-ratio assertions, not axe alone.
- The Phase A screenshot checks are geometry and ratio assertions, not pixel baselines.
- Live checks still owed after deploy: hero video playback and gesture-unmute (the test Chromium has no H.264) (Bodoni Moda parity was checked: pixel-identical to the Google version).

| Area | State | Where |
|---|---|---|
| Vision and rules | Written | `docs/VISION.md`, `CLAUDE.md` |
| Old engine audit (arena, rated) | Done | `docs/ENGINE_AUDIT.md` |
| ORBIT engine spec (copyright asset) | Written, §10 has status | `docs/ORBIT_ENGINE.md` |
| ORBIT library | Pure JS, 86 tests, **not wired to members yet** | `orbit/src`, `orbit/test` |
| IP plan | Written | `docs/IP_NOTES.md` |
| Iteration 3 (cells, taxonomy, Passion Budget, k-anonymity, signals, interim deck) and P0-A (0004) | Done, 0004 live | D-037–D-042 |
| **Iteration 4, P0-B** (18+ gate, sensitive consent, report, self-serve deletion, retention, privacy notice, honesty/contrast, media fail-closed, 0006 perf policies) | **Done on the branch, reviewed; NOT applied or deployed** | plan `docs/superpowers/plans/2026-10-05-iteration-4-p0b.md`; D-044, D-045 |
| Iteration 4 arenas (P0-B design; end-of-iteration critique → P0-C backlog) | Done | `docs/arena/2026-10-05-p0b-design.md`, `docs/arena/2026-10-07-iteration-4.md`; D-044, D-046 |
| Landing page | Yashika's original UI, unchanged (founder rule: optimise, never redesign) | `index.html`, CSS |
| **Live signup walkthrough** (real browser on the live URL; 7 UI bugs fixed incl. lost signup photo, typed-city refusal, invalid phone pattern) | Done, pushed (auto-deploys) | D-049 |
| Experience iteration A-C (signup guide, landing speed, consistency) | Done on the branch; A and B on `main`, C awaiting the founder's OK | D-053, D-054, D-055 |
| Experience iteration D (test world: 0008, seed v2, "Why this person?") | Done on the branch; SQL not applied, not pushed | D-057, D-058 |
| Decisions | D-001 … D-058, append-only | `docs/DECISIONS.md` |

Test status after D-058 (2026-10-13): SQL harness ALL PASSED; build OK; `test:unit` 173/173; orbit 86/86;
`check:assets` and `check:styles` OK; landing parity identical (22 shots); e2e onboarding 269, consent 154, deck 123,
landing all passed, app-shell 208.
**Live UI testing:** this sandbox cannot reach `*.vercel.app` / `*.supabase.co`. Use a Vercel Sandbox in project
`brivia-club` (Vercel MCP `create_sandboxes_v4`, no failover regions on this plan, ~45 min max) with Playwright, and a
Gmail plus-address of the founder's inbox for confirmation emails (disposable inboxes did not receive them).
Tooling: Playwright **and axe-core** at `/tmp/pw` (`npm install --prefix /tmp/pw playwright axe-core`).

- **2026-10-25, deck and landing polish (D-094):** favicon (burgundy gradient "B", all pages), the landing's camera
  ("playground") video section removed, a shorter deck card with no round Pass / Pitch on screen (keyboard users still
  reach them), and a first-run deck tutorial with "Don't show this again". New e2e `tests/e2e/deck-tutorial.spec.mjs`.
  Still open from the same founder message: chat close button + Escape, mobile profile/login after the attachments,
  Explore spacing, fewer dots in deck copy, the phone on "Where ideas begin", the Resend sender.
- **2026-10-25, interests dropdown (D-095):** signup step "What are you into?" is now one dropdown (a combobox with a
  multi-select list grouped by category, Popular first; type to search) instead of tabs and chips. Picks show in the
  "Your picks" tray above the field. The login "or" above Continue with Google sits 14 px from each neighbour (was ~28).
- **2026-10-25, mobile polish (D-096):** phone login with the telephone and outlined icons, chat × and Escape, the
  phone inbox as one page, the phone profile hero, equal header icons, roomier Explore, one-line "Where ideas begin",
  fewer dots. Email: point Supabase SMTP at Resend (D-096 has the settings) with a new key. e2e `mobile-polish.spec.mjs`.
- **2026-10-25, auth heading (D-097):** "Your kind is already here." is Instrument Sans 700, tight tracking, as in the
  founder's screenshot (was Bodoni Moda since D-078).
- **2026-10-25, phone login and profile (D-098):** the handset sized to the space the form leaves (Google always
  on screen, `vh` fallback without `svh`); the profile name on one line, a slim EDIT PROFILE pill and a round ⚙ in the photo.
- **2026-10-25, phone sign-up start (D-099):** the login's composition on the first sign-up screen: one Log in pill top
  right, a centred head, the tagline on one line. Later steps unchanged.
- **2026-10-25, launch polish (D-092):** OR divider, the profile dialog, smaller Explore cards, filter dropdowns, the
  profile sidebar and framed hero, the hero video's own soundtrack, area changes from Edit profile, and the decorative
  dead ends removed. New e2e `tests/e2e/launch-polish.spec.mjs`; every control clicked at 1440 and 390 px (D-092).
- **2026-10-24, show / hide password (D-091):** every password field has a working eye button (`password-reveal.js`);
  "Forgot password?" is unchanged from D-090. e2e password-reveal 56, signup 285, onboarding 269, password-reset 18.
- **2026-10-23, signup in the classic look (D-086):** the guided signup (same screens, Google, no points) now looks like
  the old "FIND YOUR PEOPLE" form (`signup-classic.css`, CSS and one static head only). e2e signup 285, onboarding 269.
- **2026-10-23, login look restored (D-085):** the login screen is back to the pre-B4 "JOIN THE CLUB" UI (markup only;
  the B4 card CSS is inert). Login and the guided signup work exactly as before. e2e signup 285, onboarding 269 passed.
- **2026-10-22, release A of the polish wave live (D-072):** location fix, chat fit, notifications over chat, compact
  account menu (bottom sheet on phones), Yugansh/Keshav cards removed. Founder: check "Use my location" and the
  account menu on the real Mac (Safari) and phone. Next: A5 with `0013`, then part B (guided signup, interests only).

## 2. Live Supabase state (project `wfbddovczpfdrspmxgfo`, ap-south-1)

- **2026-10-22:** `0012_polish_wave.sql` (sections C and D) is **applied** and verified read-only (D-075): Explore
  likes and saves, the private `resumes` bucket, resume messages, typing authorization, deletion covers resumes.
  Blocked-send withholding (A5) will be `0013`. Live `brivia_notice_version()` is still `2026-10-20`: `0011` is **applied** (2026-10-22, verified: version `2026-10-05`, accepted after 2026-11-03).
- **Corrected 2026-10-20 (D-070), verified read-only on the live project:** `0001`–`0006`, `0008`, `0009` and `0010`
  are applied and frozen (`0009` and `0010` on 2026-10-14 from `claude/jolly-edison-49xvza`; `0010` needs `0008`'s
  `brivia_tester`, so `0008` is live too). Live `brivia_notice_version()` = `2026-10-20`, and
  `brivia_notice_accepted('2026-10-05')` = `true` only until 2026-11-03. **`0011` is written, NOT applied: apply it
  before 2026-11-03** (`supabase/migrations/README.md`, "0011"). The **open-test-world switch is ON**
  (`brivia_world_switch.open_test_world = true`): real members see seeded test members. Close it (README, "0010"):
  it was meant to stay open at most 6 nights, and run the purge before real launch. The bullets below are older and
  are superseded where they disagree.
- `0001`–`0004` are **applied and frozen**. Never edit or re-run them.
- **Test-member seed: live** (D-043): 24 `is_test` profiles, all completed. To refresh, purge and re-seed (see
  `supabase/seed/README.md`; the purge leaves storage files, remove them via the Storage API first).
- **`0005` and `0006` are applied (2026-10-08) and frozen** (D-047, D-048), verified read-only: the policies match
  `supabase/tests/policies-0006.expected.tsv` exactly, and the advisors are as the README expects. New SQL goes in
  **`0007+`**, starting with the D-046 P0-C items. **`0008_tester_world.sql` is written but NOT applied** (Phase D;
  section 3, item 0, has the order). Until it is, the deck stays empty for the founder's real accounts.
- **Client deployed:** Vercel project `brivia-club` (team "Golu's projects") at `https://brivia-club.vercel.app`.
  **Production deploys from `main`** (D-051): `main` was fast-forwarded to the working branch on 2026-10-12. A push
  to the working branch builds a preview only; to go live, fast-forward `main` to it (founder OK) and Vercel deploys.
  The Supabase Auth Site URL and redirect are set to it.
  Vercel Deployment Protection is on by default; turn it off if testers without a Vercel login need access.
- **Live checks:** the `amr` re-auth on deletion **works** (D-049: `reauth_required` → password → deleted, zero rows
  left). Still open: the Google re-auth round trip.
- **Founder dashboard items from D-049/D-050:** **custom SMTP now blocks any public test**: the default sender hit
  `over_email_send_rate_limit` after 2 sign-ups in an hour. Also: a Brivia-branded confirmation email, and delete the
  unconfirmed QA user `brivia.qa.muzfgszm@maxxspace.com`.
- Real members are **not allowed yet**: see the gate table in `docs/arena/2026-10-07-iteration-4.md`.

## 3. What to do next (in order)

**Database owed (2026-10-29):** in order, whichever are not yet applied: `0015`, `0016`, `0017_interest_catalog.sql`
(long: the catalogue rows; paste all of it), `0018_member_presence.sql`. README sections "0015"–"0018" have the verify
queries. The client is live and hides each feature until its file is applied.

**Database owed (2026-10-28):** apply `0015_post_activity.sql` (comments, shares, counts) and then `0016_profile_bio.sql` (bio); README "0015" / "0016". The client is live and hides those features until each file is applied. Earlier note: review the preview of `claude/wizardly-volta-6hv7or`, then apply `0015_post_activity.sql`
(README "0015": pre-flight, apply, verify; either order with the client works) and merge. Existing members without a
photo are not forced to add one; only new signups and incomplete members are.

**Done 2026-10-22:** `0011` is applied (D-070). Then close the open test world
(`update public.brivia_world_switch set open_test_world = false, changed_at = now();`) and purge the test members
before real launch. Item 0 below is partly done: `0008`, `0009` and `0010` are live (the seed and tester rows were not
re-checked).

0. **Go live with Phase D, the test world** (D-058; all three tasks are done on the branch). First the founder reviews
   the Phase C before/after screenshots and OKs pushing and fast-forwarding `main`. Then, in the SQL editor as
   `postgres`, in the same window as the client deploy (details in `supabase/migrations/README.md`, "0008"):
   1. apply `0008_tester_world.sql` (with `set lock_timeout = '5s';` on the first line) and run its read-only checks;
   2. run seed v2, `supabase/seed/test-members.sql`;
   3. for each of the founder's accounts:
      `insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;`
   4. `select public.refresh_cell_density();` (it does nothing if that night's run already happened). Cards show
      `~3 km`/`~10 km` only once the target's g7 cell is `ok10` (7 consecutive nightly runs with at least 10 counted
      members, who must be over 14 days old); with the seed's under-2 km spread, expect place names (Thane, Mumbai)
      for a long time. That is safe, not a fault.
   The deck then shows test members near Thane and Bengaluru, and each card has "Why this person?".
   **To stop being a tester:**
   `delete from public.brivia_tester where member_id = (select id from auth.users where email = '<your email>');`
   The account is back in the real world at once; until the purge it can still read its old test-world matches,
   messages and pending requests, but cannot message test members (Ruling 5). The purge
   (`supabase/seed/purge-test-members.sql`) deletes the test members and everything tied to them and empties
   `brivia_tester`; it never deletes a tester's own account.
   **After 0008, the next live policy comparison must expect a change:** `supabase/tests/policies-0006.expected.tsv`
   no longer matches the live `matches` and `messages` select policies (0008 rewrites them to add the cross-world pair
   check). The repo has no generator for a 0008 snapshot, so the comparison must expect exactly those two policy
   differences (or the next session adds a `policies-0008.expected.tsv`).
   Founder backlog from Phase D: wire ORBIT's far lane into the deck (then flip the harness's "far partner absent from
   deck" assertion).
1. **P0-C** (D-046; table "P0-C" in `docs/arena/2026-10-07-iteration-4.md`, each item has acceptance criteria).
   0005 is now live and frozen (D-047), so the SQL items go in **new migrations `0007+`**:
   1. R1 corroborated underage suspension (2 qualifying reporters, or 1 matched); a reporter's own `request`
      rows never qualify; single report → alert + review queue (`reviewed_at`).
   2. R3 ladder: `banned`, Restrict never un-hides, `moderation_remove_member`, rejoin with underage/banned
      tombstone → suspended, tombstones only for qualifying.
   3. R4 deletion hold (`deletion_held`) for flagged / open-report members.
   4. R5 `0007_moderation_alert.sql` (pg_cron + pg_net webhook, counts only, digest row). Pre-flight `pg_net`.
   5. R7 under-review notice links Privacy & account.
   6. R8: 0005 is frozen, so instead of collapsing it, the new migration redefines each function once (final form).
   7. R10 honesty copy, starting with the untrue `app.js:1577` profile helper sentence.
   8. R6 live rehearsal of deletion: password path done (D-049); Google re-auth still to do.
2. **Apply each new migration** in the SQL editor, verify its last object, and let the linked Vercel project redeploy.
3. **Founder-only gate items** (remind the founder):
   - auth hardening, recorded with dates (R11): email confirm, CAPTCHA, rate limits, leaked-password protection,
     anonymous sign-ins off, exact OAuth redirect list;
   - PITR and backups; error tracking; private repos; sign-off;
   - name the grievance officer; confirm the operational promises in `privacy.html` (7/90-day replies, 72 h
     under-18 review, "we do not sell your data", access by email, "ask again before matching on private
     interests", the 180-day resume sweep);
   - consent of each named person on the `auth.html` preview cards (now labelled "Example profiles");
   - counsel: IT Rules 180-day retention, DPDP log retention, CERT-In logs, deletion-before-report evidence;
   - **rotate the DB password that was once pasted in chat**.
4. **P1** (record "P1" list): A-I UX items, parked ledger items, private photo URLs + card budget, P0-E grid1
   adapter and sensitive firewall, IP dossier; then iteration-3 P1 items 15–25.
5. **Later, its own iteration:** the student world (D-040), after counsel on DPDP "verifiable consent".
6. **Open founder question:** should a ring-0 neighbour outrank a distant member with better shared interests?
   It is currently "interest qualifies, location orders".

## 4. How to work (the founder's required process)

Every iteration runs these steps:

1. **superpowers:** brainstorming → writing-plans (`docs/superpowers/plans/`) → subagent-driven execution. One
   implementer per task, then a reviewer, a fix round, and a controller check.
2. **TDD:** write the harness, unit or e2e test first, and see it fail.
3. **agent-arena for every significant decision.** Critics A (UX), B (privacy and security) and C (engine and
   IP), then a judge. Record the arena in `docs/arena/`, and the outcome in `docs/DECISIONS.md` (append-only, next
   free D-number).
4. **Criticise the current implementation with arena at the end of each iteration** (founder request), and turn it into the next backlog.
5. **ui-ux-pro-max** for UX rules, keeping the deep-wine brand (`docs/UX_SPEC.md`). **webapp-testing**/Playwright for UI.
6. Supabase for both live data and test data. Test members are `is_test`-isolated, with seed and purge in `supabase/seed/`.
7. Controller check before each push:
   - all suites green;
   - `git diff` shows 0001–0003 unchanged;
   - DECISIONS has only added lines;
   - the spec is updated in the same commit as behaviour changes.

Commands are in `CLAUDE.md`. Playwright lives outside the repo, at `/tmp/pw` (`tests/e2e/README.md` shows how to
install it).

## 5. Which file to read for what

| Need | File |
|---|---|
| Aim, rules, commands | `CLAUDE.md` |
| Product vision and who it is for | `docs/VISION.md` |
| Matching math, rings, Escape-Velocity, Passion Budget, privacy model | `docs/ORBIT_ENGINE.md` |
| Why things are the way they are | `docs/DECISIONS.md` (D-026+ is the ORBIT era) |
| The current backlog and go-live gate | `docs/arena/2026-10-07-iteration-4.md` (P0-C, P1, P2, gate table); older: `docs/arena/2026-10-03-iteration-3.md` |
| Privacy notice, account & safety UI | `privacy.html`, `privacy-account.js`, `account-deletion.js`, `report-dialog.js`, `image-compress.js` |
| Brand, tokens, flows, copy | `docs/UX_SPEC.md` |
| Applying SQL to live | `supabase/migrations/README.md` |
| Test members | `supabase/seed/README.md` |
| Data breach response (containment, notices, orphan-folder report) | `docs/BREACH_RUNBOOK.md` |
| Daily moderation (new reports, flags, the 72 h suspension queue, rejoin reviews; SQL editor as owner) | `docs/MODERATION.md` |
| SQL behaviour tests | `supabase/tests/*.test.sql` (run with `run.sh`) |
| Signup (4 steps) | `auth.html`, `script.js`, `passion-budget.js`, `pending-profile.js` |
| App, deck, quota | `app.html`, `app.js`, `deck-view.js`, `signal-quota.js` |
| Test world (tester switch, why panel) | `supabase/migrations/0008_tester_world.sql`, `why-panel.js`, `supabase/tests/d-tester-world.test.sql`, `supabase/seed/README.md` |
| App nav, tokens, skeletons, profile checklist | `app-nav.js`, `app-shell.css`, `tokens.css`, `app-skeletons.js`, `profile-checklist.js`, `profile-view.css` |
| e2e (stubbed Supabase) | `tests/e2e/*.spec.mjs` |
| Old engine to reuse plumbing from | repo `brivia-club`, `server/src/engine/` |
| Skills manifest | `docs/SKILLS.md` (vendored in `.claude/skills/`) |

## 6. Hard constraints (never break)

- Never store, echo or commit DB passwords or connection strings.
- Never connect to the live DB directly (psql). Use the founder's SQL-editor runs, or read-only connector checks.
- Never edit an applied migration.
- No exact coordinates are stored or shown. Members see bands and place names only. Never send another member's email or phone to the client.
- Matches are mutual only.
- The landing page keeps Yashika's UI.
- No third-party ranking code in ORBIT.
- Adults only until the student world ships.
- Never push to any branch except `claude/jolly-edison-49xvza`. Never open a PR unless the founder asks.
