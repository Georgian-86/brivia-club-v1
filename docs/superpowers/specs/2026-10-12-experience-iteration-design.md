# Experience iteration: guided signup, fast landing, test world, growth kit, consistency (design spec)

Date: 2026-10-12. Status: **design approved section by section by the founder in chat; this written spec awaits review.**
Decision record: D-052 (signup arena, approved), D-053 (this spec). Arena: `docs/arena/2026-10-12-signup-fields.md`.

## 0. Intent (what the founder asked for)

- A product a designer would praise. It never feels stuck or confusing and never annoys anyone, and it keeps the
  existing images, colours and deep-wine style. Enhance, don't redesign. The landing page stays Yashika's design.
- **Retain at least 85% of people who start signup.** Signup must be immersive and helpful: one question per screen,
  points explained, nobody lost.
- Test data, so the founder can exercise the matching engine.
- A landing page that loads fast and smooth on a first visit.
- A marketing-ready growth kit: search presence and rank, analytics, recordings, visit timing, campaign attribution.

**Success measures:**
- **Signup:** signup started → first deck seen ≥ 85% (measured in PostHog).
- **Landing:** LCP < 2.5 s and CLS < 0.1 on a mid-range phone over 4G; Lighthouse performance ≥ 90; initial landing
  transfer < 3 MB.
- **Pages:** no axe contrast violations on any page; screenshot tests pass at 375 px and 1440 px.

**Non-goals:**
- Redesigning the landing page.
- Changing the ORBIT model or server matching rules (except the world helper in §3).
- The P0-C moderation work (D-046). It stays queued and does not block this iteration, but real members are still
  not allowed until P0-C ships.

## 1. Guided signup (D-052, approved)

### 1.1 Screens (one question each)

| # | Screen | Saves | Notes |
|---|---|---|---|
| 1 | Welcome: **Continue with Google** (primary) / **Continue with email** | — | Existing auth imagery and brand. Link "How we use your data". |
| 2 | Email | — | Email path only. |
| 3 | 6-digit code | session | `signInWithOtp({ email, shouldCreateUser: true })` then `verifyOtp({ type: 'email' })`. `autocomplete="one-time-code"`, paste fills all boxes, resend after 60 s, "Wrong email?". |
| 4 | "Are you 18 or older?" | `declare_adult` | Before name, area and interests. The server refuses area and interest writes before it (0005 `brivia_require_adult`). |
| 5 | "What should members call you?" | profile name | Prefilled from Google. Copy: "Members see this name." |
| 6 | Your area | `set_home_location` / `set_home_city` | Today's step 2, unchanged (incl. D-049 typed-city match). |
| 7 | Pick interests (1–12, "3–6 works best") | memory only | Private-interest consent dialog unchanged. Nothing is saved yet: only the first interest save is free (rewrite cap, ORBIT §3.2). |
| 8 | "Which one matters most?" (points) | `set_member_interests` | See 1.2. The single save. |
| 9 | Reveal: "N people near you share {top interest}" | — | Then the deck. Shows the "Complete your profile" checklist entry. |

**Every screen has:**
- a wine progress bar with "Step n of N" text (N = 8 on the email path, 6 on Google);
- Back always visible, and Enter = Next;
- a 44 px primary button pinned above the mobile keyboard;
- focus moved to the screen heading on change, and an `aria-live` step label.

**Answers save on Next.** A member who leaves resumes at the first incomplete screen. The existing completion gate
(`my_onboarding_status`) already routes to it.

### 1.2 Points screen ("which matters most?")

- **Copy:**
  - "You have 20 points to share across your interests. The more points an interest has, the more we match you with
    people who love it too."
  - "Tap your top passion and we'll split the rest. Tap any other interest to switch it between *Really into* and
    *Curious*."
  - Example line: "Chess 8 · Hiking 4 · Jazz 4 · Cooking 4". Footer: "The total always stays 20, and you can change it
    later."
- **Tiers and weights:**
  - Top passion: weight 4, required, at most 2.
  - Really into: weight 2, the default for the others.
  - Curious: weight 1.
- **Points calculation:** weights → 20 points by largest remainder, every interest ≥ 1, the same arithmetic as the
  0005 redistribution. Pure helper `tiersToBudget(items)` in `passion-budget.js`, unit-tested.
- **Never incomplete:** the screen opens complete once a top pick exists. There is no "points left" count, and Next
  is enabled as soon as a top passion is tapped.
- **Fine-tune:** an optional, collapsed section with zero-sum steppers. "+" takes a point from the largest other
  interest, never below 1, so the total is always 20.
- **What changes:**
  - The "Spread evenly" button (D-049) is removed from signup. It remains as a reset inside Fine-tune.
  - Per-interest mode defaults to `play` and moves to the profile.
- **Experiment flag:** `points_entry = top_pick | even_split`, PostHog. If top_pick costs more than 2 points of
  completion, revisit (arena dissent).

### 1.3 What is collected

- **Required at signup:** a verified account (Google, or email OTP), the 18+ declaration, name, area, and interests
  with points. This is exactly `brivia_member_completed` (0005:153-174), so the visibility gate needs no server change.
- **Later checklist** (profile and contextual nudges):
  - photo (nudged at the first like);
  - looking-for (asked at the first request);
  - experience;
  - cover;
  - per-interest mode;
  - an optional password (email-OTP members can add one).
- **Not collected:** phone and gender. Their signup inputs are removed.
  - Existing stored values are kept, not shown to others (as today), and listed in `privacy.html` as "older accounts
    only".
  - Whether to null them is a founder decision in D-053, default **keep**.

### 1.4 Server and docs that ship with it

- **Migration `0007_signup_minimisation.sql`:**
  - bumps `brivia_notice_version()` to the release date of Phase E (written into `0007`, `notice-version.js` and
    `privacy.html` together);
  - `declare_adult` accepts the new and the previous version for 14 days, so client and DB deploy order cannot block
    signups.
- **Same deploy window:** `privacy.html` (what we collect: phone and gender removed), `notice-version.js`,
  `UX_SPEC.md` §A, `ORBIT_ENGINE.md` (a note on tier entry; model unchanged), and the onboarding e2e tests.
- **Deletion re-auth for passwordless members:** the RPC already accepts any `amr` method within 10 minutes (0005:546),
  so the client offers "Send me a code" (OTP re-auth) when the account has no password. Verified live after deploy.
- **The old 4-step flow and the localStorage pending profile:**
  - kept for one release behind the OTP flow, for accounts that were mid-signup;
  - then removed (D-053 follow-up).

### 1.5 Dependencies (founder)

1. **Custom SMTP** in Supabase Auth, with the email template sending `{{ .Token }}` (the 6-digit code) and Brivia
   branding. Also raise the email rate limit.
2. **Google OAuth** production configuration in Supabase and Google Cloud.

**Fallbacks:**
- SMTP not ready → Google-only signup.
- Neither ready → public signup stays closed; testers use test accounts.

## 2. Landing speed (approved)

1. **Videos:**
   - Re-encode the hero as 1080p H.264, ≤ 3 MB, plus 720p (≤ 1.5 MB) for phones. WebM/AV1 alternatives where smaller.
   - Remove `hero-section-video-4k.mp4` (45 MB) from delivery.
   - Poster frames (AVIF/WebP) shown instantly. `preload="none"`, and playback starts on idle or in view.
   - `prefers-reduced-motion` or `Save-Data` → poster only.
2. **Intro animation:**
   - first visit only (a `sessionStorage`/`localStorage` flag);
   - hard cap of 2.5 s, with "Skip";
   - never blocks interaction, and fades straight to the page if the video has not started within 800 ms.
3. **Images:**
   - The `/Images/*.PNG` (2–3 MB each) are converted to AVIF + WebP at displayed sizes (≤ 250 KB each), with a
     `<picture>` element, `loading="lazy"` and `decoding="async"` below the fold.
   - Explicit `width`/`height` or `aspect-ratio` to prevent layout shift.
   - Originals stay in the repo as source.
   - Conversion is a reproducible script (`scripts/optimize-media.mjs`, sharp + ffmpeg) whose outputs are committed.
4. **Skeletons:**
   - Brand-tinted shimmer placeholders: the hero (poster colour), image cards, and the app deck, profile, chat list
     and posts while data loads.
   - The shimmer is static when reduced motion is on.
5. **Fonts and JS:**
   - Preload the heading font and self-host the two families (removes the Google Fonts round trip).
   - The landing bundle excludes app code (Vite entry split already exists; verify).
   - Long-cache headers for `/assets/*` in `vercel.json`.
6. **Guardrail:** `scripts/check-asset-budget.mjs` in the gate fails the build when a delivered image is over 400 KB,
   a video over 5 MB, or the landing initial payload is over 3 MB. A Lighthouse CI run on the landing page is
   recorded in the PR or commit notes.

## 3. Test world for the founder (approved)

1. **Tester switch**, in migration `0008_tester_world.sql`:
   - table `brivia_tester(member_id uuid primary key references profiles on delete cascade, added_at)`, owner-only,
     deny-all RLS, no client grants;
   - `brivia_in_test_world(uid) = is_test or exists(tester row)`;
   - every `is_test` world comparison in the live functions and policies (about 38 references in 0003–0005,
     including `brivia_same_world`; the plan lists each one) is redefined once to use it, with semantics otherwise unchanged;
   - harness tests: a tester sees test members and no real members; a real member sees neither the tester nor test
     members; the purge removes test members (cascading the tester's test matches, requests and messages) and clears
     `brivia_tester`, never deleting the tester's own account.
2. **Seed v2** (`supabase/seed/test-members.sql`, idempotent; purge updated):
   - ~60 members in Mumbai, Thane, Pune, Bengaluru and Delhi;
   - placed to exercise ORBIT: neighbours with shared interests, cross-city members, and one far-but-strong match per
     city (the escape-velocity gate);
   - weak and strong overlaps, all modes, a few private interests, a few flagged or blocked;
   - ~30 community posts, requests in both directions, 3 matches with short chats, and notifications;
   - generated monogram/illustration avatars only, no real photos, `@test.brivia.club`;
   - `t01` stays the demo login.
3. **"Why this person?" (testers only):** a small panel on each deck card showing the existing explanation data
   (shared interests, distance band, ordering keys). It is gated server-side on the tester world, and hidden for
   real members.

## 4. Growth and analytics kit (approved)

1. **Search presence:**
   - own domain with redirects from `*.vercel.app`;
   - `sitemap.xml`, `robots.txt` (app routes `noindex`), canonical URLs, per-page title and description;
   - JSON-LD `Organization` + `WebSite`;
   - Open Graph and Twitter cards with branded preview images;
   - Google Search Console and Bing Webmaster verification (founder adds DNS). Search Console average position per
     query is the "rank in niche" metric; Ahrefs Webmaster Tools (free) is optional.
   - Google Business Profile copy prepared, optional (only if there is an office or events).
2. **PostHog (EU cloud)**, loaded only after consent:
   - **Events:**
     - every signup screen (`signup_step_viewed` and `signup_step_completed`, with step id);
     - `deck_viewed`, `like`, `request_sent`, `match`, `post_created`;
     - UTM and referrer on the first visit.
   - **Insights:**
     - funnels (the 85% goal);
     - retention (D1/D7/D30);
     - an hour × weekday visit heatmap per city;
     - acquisition channel.
   - **Session replay:** masks every input and all text marked `data-ph-mask`. Chat, Privacy & account and
     private-interest UI are excluded. Heatmaps on.
   - **Identity:** members are identified by internal uuid only, never by email or phone.
   - **Feature flags** for A/B tests (the `points_entry` flag from §1.2 first).
3. **Consent:**
   - a small brand banner: "Essential only" / "Allow analytics";
   - the choice is stored and can be changed in Privacy & account;
   - `privacy.html` lists PostHog and Sentry as processors, with purpose and retention.
4. **Marketing plumbing:**
   - UTM captured at signup (coarse, stored on the profile as `acquisition_source`);
   - invite links with a tracked code;
   - lifecycle emails (welcome, "complete your profile", "new match") through the SMTP provider; marketing email
     needs a separate opt-in.
5. **Health:**
   - Sentry (errors, no PII, release tags);
   - an uptime monitor (e.g. Better Stack free tier);
   - a weekly KPI dashboard in PostHog: visitors, signup start→finish, first like, first match, D1/D7 retention,
     matches per member.

**Founder actions:** buy the domain; create PostHog, Sentry and uptime accounts; verify Search Console and Bing.
Keys go in Vercel env as public-by-design project keys.

## 5. Consistency and hotfix (approved)

1. **Hotfix (ships first):**
   - gender buttons uneven (until gender leaves signup);
   - "Check your email" panel white text on cream;
   - Back and "Create my profile" overlapping.
   - Each gets a screenshot test at 375 px and 1440 px.
2. **One navigation:**
   - one deep-wine header on every app view (Home · Connect · Explore · Chat · Profile + avatar);
   - on phones (≤ 780 px) a bottom tab bar;
   - the side nav, profile-board nav and duplicate top bars are removed.
3. **Type:**
   - headings in Bodoni Moda, the wordmark face already in the app, replacing scattered Georgia;
   - everything else in Instrument Sans;
   - Arial and the script font removed;
   - one modular type scale (12/14/16/20/24/32/44/60).
   - Switching headings back to Georgia is one token.
4. **Profile:**
   - cover + photo, name, area, "Edit profile";
   - then the "Complete your profile" checklist with progress;
   - then interests (with points bar), looking-for, about;
   - settings behind ⚙;
   - removed: the duplicate email card and the "Show up as yourself" banner.
5. **Tokens:**
   - `tokens.css` (colour, spacing, radius, shadow, type, motion) imported first by every page;
   - the 34 legacy CSS files are reduced as pages are touched, with no big-bang rewrite;
   - a check that no new raw hex colour or font-family is added outside `tokens.css`.
6. **Feel:**
   - skeletons on every load;
   - 150–250 ms transitions (off for reduced motion);
   - hover, press and loading states on every button;
   - every empty state offers a next step.

## 6. Build order (each phase: plan tasks → TDD → review → full gate → push → founder OK → fast-forward `main`)

1. **Phase A, hotfix (§5.1).** Client only.
2. **Phase B, landing speed (§2).** Client and assets.
3. **Phase C, consistency (§5.2–5.6).** Client only; screenshot baselines first.
4. **Phase D, test world (§3).** Migration 0008 + seed v2 + why panel. The founder applies the SQL in the editor;
   the purge is updated with it.
5. **Phase E, guided signup (§1).** Needs SMTP (OTP template) or Google; migration 0007 + privacy in one window.
   It can be built and fully tested against stubs before SMTP exists, then switched on.
6. **Phase F, growth kit (§4).** Needs the founder's accounts and domain; consent first, then PostHog, then Sentry,
   SEO files and emails.

**Migration numbering:** 0007 = signup minimisation, 0008 = tester world. The P0-C moderation migrations take the
next free numbers.

## 7. Testing

- **Unit (node --test):**
  - `tiersToBudget` (sums to 20, floor 1, at most 2 top, ties, 12 interests);
  - OTP input helper;
  - the consent store;
  - the asset-budget checker.
- **SQL harness:**
  - 0007 version window;
  - 0008 world semantics, real/test isolation, and purge (as §3.1);
  - the drift check updated.
- **e2e (Playwright, stubbed Supabase):**
  - every new signup screen (keyboard and mouse, 375/1440, axe);
  - resume after leaving;
  - OTP resend/wrong code;
  - the points screen;
  - the profile checklist;
  - nav parity across views;
  - consent gating (no PostHog request before "Allow");
  - landing posters before video, and no CLS;
  - hotfix screenshots.
- **Live checks after each deploy:**
  - a signup walkthrough on production (Vercel sandbox, as D-049);
  - Lighthouse on the landing page;
  - deletion re-auth by OTP.
- **The existing gate stays:** harness, build, unit, orbit, the three e2e suites, frozen migrations unchanged, and
  DECISIONS append-only.

## 8. Risks

- **OTP deliverability** (spam folders, rate limits): custom SMTP with SPF/DKIM, and Google as primary.
- **The 36-site world refactor (0008)** could break isolation: the harness isolation tests come first, and each
  function is redefined once.
- **Media re-encoding visibly lowers quality:** side-by-side review with the founder before replacing the delivered
  files.
- **Analytics under DPDP:** consent gate, masking, documented processors, and a retention setting (PostHog 1 year).
