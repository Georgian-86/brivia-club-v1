# Phase E: Guided Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new member signs up in a calm, premium flow: one question per screen on phone and desktop. Nobody feels lost and nobody hits a points form, and at least 85% of starters reach their first deck.

**Architecture:**
- **Navigation:** a pure flow model (`signup-flow.js`) decides the screen list per path (email code or Google) and where a returning member resumes. It reads `my_onboarding_status` and the session.
- **Screens:** `signup-screens.js` renders one screen at a time into a new `#guided-signup` section of `auth.html`. It reuses the existing area picker and interest catalogue.
- **Saving:** each answer saves on Next through the existing RPCs. Interests save with an even split of the 20-point budget (D-056), so no server-side matching change is needed.
- **Migration:** `0007` only bumps the privacy-notice version, with a 14-day grace window.

**Tech Stack:**
- Vite, vanilla JS/CSS, and supabase-js auth: `signInWithOtp`/`verifyOtp` (email code) and `signInWithOAuth` (Google).
- SQL migration with the existing harness.
- `node --test` unit tests, and Playwright e2e against a stubbed Supabase (Playwright at `/tmp/pw`, Chromium `/opt/pw-browsers/chromium`).

**Spec:** `docs/superpowers/specs/2026-10-12-experience-iteration-design.md` §1, as amended by **D-056** (no points screen; one question per screen on all sizes; animated interest picking). See also D-052 (arena: what signup requires) and D-055 (Phase C tokens, type and guards).

## Global Constraints

- **Brand:** keep the deep-wine brand and the existing auth imagery. Use tokens only (`tokens.css`); headings `var(--font-heading)` (Bodoni Moda); body `var(--font-body)` (Instrument Sans). No text under 12 px. Form controls are 16 px on phones. Add no new colours. `npm run check:styles` counts may only fall.
- **One question per screen at every width:**
  - **Desktop (≥ 781 px):** the same single-question card, max 560 px wide, next to the existing auth image panel.
  - **Phone:** a full-height card with the primary button pinned above the on-screen keyboard (`visualViewport`).
- **Screens and order:** the email path is Welcome → Email → Code → 18+ → Name → Area → Interests → Reveal (6 question steps). The Google path is Welcome → 18+ → Name → Area → Interests → Reveal (4 question steps).
- **Progress and labels:**
  - "Step n of N" counts the question screens (everything except Welcome and Reveal): N = 6 on the email path, 4 on Google. Welcome and Reveal show no step label.
  - A wine progress bar.
  - An `aria-live` step label.
  - Focus moves to the screen heading on change (no visible ring on headings, as in the Phase C polish).
- **Navigation:**
  - Enter = Next.
  - Back is always visible, except: on Welcome; and after the session exists, Back never returns to Email or Code. The earliest Back target is 18+.
- **What is collected:** a verified account, the 18+ declaration, the name, the area, and 1–12 interests (at least one non-sensitive; the server floor). **No phone, no gender, no points screen.**
- **Interests save** with `evenSplit` (20 points, largest remainder, each ≥ 1, ties broken by pick order). The mode defaults to `play`.
- **Privacy:**
  - Coordinates go only in the POST body of `set_home_location`.
  - The Reveal shows **no member counts** (the same rule as `deck_status`, "never a count"). It shows qualitative copy only.
- **Motion:** 150–250 ms from the `--motion-*` tokens. Under reduced motion, screen changes and interest picks fade, with no movement.
- **Feature switch:** `VITE_SIGNUP_METHODS` (comma list of `google`, `email`).
  - Welcome shows only the configured methods.
  - Empty or unset shows "Signups open soon" plus Log in (the spec §1.5 fallback).
  - Stub e2e runs with `google,email`.
- **Migrations:** 0001–0006 are frozen. The only new SQL is `0007`. The founder applies it in the SQL editor in the same window as the client deploy.
- **DECISIONS** is append-only.
- **Commits:** end every commit message with the line `Claude-Session: https://claude.ai/code/session_01BPtSsvGbTkCpzEXTbQkfEX` and **no `Co-Authored-By` line** (founder, 2026-10-13).
- **Gate before every push** (suites one at a time):
  - `bash supabase/tests/run.sh`
  - `npm run build`
  - `npm run test:unit`
  - `(cd orbit && npm test)`
  - `npm run check:assets`
  - `npm run check:styles`
  - landing parity (`node scripts/visual-parity.mjs compare <baseline> --pages index`; take the baseline from `main` before Task 1)
  - e2e suites: onboarding (5198), consent (5199), deck (5197), landing (5196), app-shell (5195), and the new signup suite (5193).

## Review Focus

- **The code arrives by SMS-style autofill or paste on iOS.** The 6 boxes fill from `autocomplete="one-time-code"` and from a pasted "123 456" or "Your code is 123456", and verify automatically. A wrong code shows "That code didn't work" and keeps the boxes. Resend is disabled for 60 s, and a 429 shows the rate-limit copy. (Task 3 tests.)
- **A member who leaves mid-flow and comes back.** This covers a new tab, a Google return redirect, and `?complete-profile=1` from the app gate. They resume at the first incomplete screen with earlier answers kept. A completed member landing on signup goes straight to the app. (Task 2 unit, Task 5 e2e.)
- **Back after verification.** Back from 18+ never shows Email or Code again; it goes to Welcome with a "You're signed in as …, Sign out" line. Browser Back behaves the same. (Task 3 e2e.)
- **Picking interests on a phone with one thumb.**
  - Each tap visibly flies the chip into the "Your picks" tray and bumps the count.
  - Tapping a pick in the tray removes it, and it flies back.
  - The 13th pick shows the cap message.
  - A sensitive pick opens the existing private-interest consent dialog first.
  - Next stays disabled until at least one non-sensitive interest is picked.
  - (Task 4 e2e at 375 and 1440.)
- **A save failure on Next** (network or 5xx on `declare_adult`, `set_home_*`, `set_member_interests`, or the name save). The screen stays, shows a retry message, and the button is `aria-busy` while pending and never stuck. (Task 4 e2e.)

---

### Task 1: Migration 0007 — the notice version with a 14-day grace window

**Files:**
- Create: `supabase/migrations/0007_signup_minimisation.sql`, `supabase/tests/p0e-notice.test.sql`
- Modify: `notice-version.js`, `privacy.html` ("What we collect": phone and gender removed for new members; "older accounts only" note; the new version date), `supabase/migrations/README.md` (0007 apply steps and pre-flight), `supabase/tests/p0b-adult.test.sql` (only if it pins the old version literal)

**Interfaces:**
- Produces:
  - SQL `public.brivia_notice_version() returns text` → the new date (use `'2026-10-20'` as the placeholder release date; the founder can change it, and if they do, change it in `0007`, `notice-version.js` and `privacy.html` together).
  - SQL `public.brivia_notice_accepted(p_version text) returns boolean`: true for the current version, and for `'2026-10-05'` until `'2026-10-20'::date + 14`.
  - `declare_adult(p_notice_version text)` is redefined **once**, refusing with `22023 'stale notice version'` only when `not brivia_notice_accepted(...)`.
  - JS: `NOTICE_VERSION = '2026-10-20'`.

- [ ] **Step 1: Write the failing SQL tests** in `p0e-notice.test.sql`:
  - `declare_adult accepts the new version`;
  - `declare_adult accepts 2026-10-05 inside the window` (freeze `now()` via the harness's existing time helper, or test `brivia_notice_accepted` with an explicit `p_at timestamptz default now()` parameter);
  - `refuses 2026-10-05 after the window`;
  - `refuses an unknown version`;
  - `consent rows written after 0007 record the new version`.
- [ ] **Step 2: Run** `bash supabase/tests/run.sh`. Expect FAIL (function missing).
- [ ] **Step 3: Implement 0007.** It must be idempotent: running the harness twice passes, as it does for 0001–0006. Do not touch 0001–0006.
- [ ] **Step 4: Run** the harness twice, then `npm run test:unit` (notice-version test updated) and the consent e2e. Expect PASS.
- [ ] **Step 5: Commit** `feat(db): 0007 notice version with a 14-day grace window (Phase E)`.

### Task 2: Flow model, even split and code-input helpers (pure)

**Files:**
- Create: `signup-flow.js`, `otp-input.js`
- Modify: `passion-budget.js` (add `evenSplit`)
- Test: `tests/unit/signup-flow.test.mjs`, `tests/unit/otp-input.test.mjs`, `tests/unit/passion-budget.test.mjs`

**Interfaces:**
- Produces:
  - `SCREENS = { email: ['welcome','email','code','adult','name','area','interests','reveal'], google: ['welcome','adult','name','area','interests','reveal'] }`.
  - `stepLabel(path, screen) => string|null`: returns `"Step n of N"` for the question screens, and `null` for Welcome and Reveal. N = 6 on email, 4 on Google.
  - `resumeScreen({ session, status, path }) => screen`:
    - no session → `'welcome'`;
    - `status.completed` → `'done'`;
    - otherwise the first of `adult`/`name`/`area`/`interests` that is not done, read from `status`:
      - `status.adult_declared` (boolean);
      - `status.has_name`;
      - `status.has_cell`;
      - `status.interests` (count) with points summing to 20.

    Where `my_onboarding_status` lacks `adult_declared`/`has_name`, the client derives them from the member's own profile row (`adult_declared_at`, `name`). The caller passes them in `status`.
  - `backTarget(path, screen, hasSession) => screen|null`: never `'email'` or `'code'` when `hasSession`.
  - `evenSplit(items: {id,label,mode?}[], budget = 20) => {interest_id, points, mode}[]`: largest remainder, each ≥ 1, ties to earlier picks, mode default `'play'`. Throws on 0 or more than 12 items.
  - `parseOtp(text) => string|null`: exactly 6 digits after stripping spaces and dashes; takes the first 6-digit run in a longer string like "Your code is 123456."; `null` otherwise.
  - `otpBoxesAfterInput(boxes: string[], index, value) => { boxes, focus }`: handles typing, paste and backspace.

- [ ] **Step 1: Write failing tests** (exact values):
  - `evenSplit of 3 → [7,7,6]`;
  - `of 1 → [20]`;
  - `of 12 → eight 2s then four 1s` (sum 20);
  - `of 7 → [3,3,3,3,3,3,2]`;
  - `throws on 0 and 13`;
  - `stepLabel email/code → "Step 2 of 6"`;
  - `stepLabel google/interests → "Step 4 of 4"`;
  - `stepLabel reveal → null`;
  - `resumeScreen` cases: no session; completed; declared without name; name without area; area without interests;
  - `backTarget email/adult with session → 'welcome'`;
  - `parseOtp("123 456") → "123456"`;
  - `parseOtp("Your code is 654321.") → "654321"`;
  - `parseOtp("12345") → null`;
  - otp backspace on an empty box moves focus back.
- [ ] **Step 2: Run** `npm run test:unit`. Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** `feat(signup): flow model, even split, code-input helpers (Phase E)`.

### Task 3: Guided shell and the account screens (Welcome, Email, Code, Google)

**Files:**
- Create: `signup-screens.js` (renders and wires screens into `#guided-signup`), `signup.css` (tokens only; imported by `auth-entry.js` after `auth-a11y.css`), `tests/e2e/signup.spec.mjs` (port `E2E_PORT || 5193`, stubbed Supabase as in `onboarding.spec.mjs`; stub auth endpoints `/auth/v1/otp`, `/auth/v1/verify`, `/auth/v1/authorize`)
- Modify:
  - `auth.html`: add `<section id="guided-signup" aria-labelledby="signup-screen-title">` with the shell (progress bar, step label, screen host, Back, primary button). `#signup` opens it.
  - `auth-entry.js`: import `signup.css`.
  - `supabase.js`: add `sendEmailCode(email)` → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` and `verifyEmailCode(email, token)` → `verifyOtp({ email, token, type: 'email' })`.
  - `script.js`: the signup entry points (`.auth-welcome-signup`, `#signup`) open the guided flow; the Google trigger reuses `startGoogleAuth`.

**Interfaces:**
- Consumes: `SCREENS`, `stepLabel`, `backTarget`, `resumeScreen`, `parseOtp`, `otpBoxesAfterInput` (Task 2); `signupErrorCopy` (`signup-errors.js`).
- Produces: `openGuidedSignup({ path?, screen? })`, `showScreen(name)` (animated swap: outgoing fades and slides 8 px, incoming fades in; fade only under reduced motion; focus moves to `#signup-screen-title`), and `registerScreen(name, { render, next })` for Task 4.

- [ ] **Step 1: Write the failing e2e** (375 and 1440):
  - `Welcome shows Continue with Google and Continue with email, and no step label`;
  - `exactly one question (one h2 and one primary action) is visible per screen at 1440 and at 375`;
  - `email → code: the code request was POSTed with that email and the screen says "We sent a 6-digit code to …" with "Wrong email?"`;
  - `typing 6 digits verifies automatically`;
  - `pasting "123 456" fills all 6 boxes and verifies`;
  - `the boxes have autocomplete="one-time-code" (first) and inputmode="numeric"`;
  - `a wrong code shows "That code didn't work. Check it, or send a new one." and keeps focus in the boxes`;
  - `Resend is disabled with a 60 s countdown, then enabled; a 429 shows the rate-limit copy`;
  - `after verify the 18+ screen shows "Step 3 of 6" and Back goes to Welcome with "Signed in as …", never to Code`;
  - `VITE_SIGNUP_METHODS=google hides the email option`; `empty hides both and shows "Signups open soon" and Log in`;
  - `Enter submits the email screen`;
  - `the primary button stays visible above a 300 px simulated keyboard at 375` (`visualViewport` resize);
  - axe clean on every screen.
- [ ] **Step 2: Run** `node tests/e2e/signup.spec.mjs` (with `PLAYWRIGHT_MODULE`). Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the signup suite, the onboarding suite (the old flow is still present until Task 5) and landing parity. Expect PASS.
- [ ] **Step 5: Commit** `feat(signup): guided shell, email code and Google entry (Phase E)`.

### Task 4: Profile screens — 18+, Name, Area, Interests (premium picking), Reveal

**Files:**
- Modify:
  - `signup-screens.js`: register `adult`, `name`, `area`, `interests`, `reveal`. Area reuses the existing city-picker and geolocation markup and logic from the old step 2 (move the shared code into `area-pick.js` functions; do not duplicate it).
  - `signup.css`
  - `script.js`: remove the moved area code only.
- Test: `tests/e2e/signup.spec.mjs`

**Interfaces:**
- Consumes:
  - `declareAdult`, `setHomeLocation`, `setHomeCity`, `setMemberInterests`, `setSensitiveConsent`, `fetchInterestNodes`, `onboardingStatus` (`supabase.js`);
  - `evenSplit` (Task 2);
  - `registerScreen` and `showScreen` (Task 3);
  - the name save via `supabase.from('profiles').update({ name })` for the member's own row (the column is already writable by the owner);
  - `setBusy` (`app-skeletons.js`) for the busy primary button.
- Produces: nothing for later tasks beyond the registered screens.
- **Copy (exact):**
  - **18+:** "Are you 18 or older?" with "Yes, I'm 18 or older" (primary) and "No". "No" shows "Brivia Club is for adults. Come back when you're 18." and signs out.
  - **Name:** "What should members call you?", helper "Members see this name.", prefilled from Google `full_name`.
  - **Area:** "Where are you based?", helper "We show people near you first. Members only ever see a rounded distance."
  - **Interests:** "What are you into?", helper "Pick what you genuinely care about. 3–6 works best.", tray label "Your picks", count "n picked".
  - **Reveal:** "You're in, {first name}." then either "People near you are into {first pick}. Your deck is ready." (when the deck call returns at least one row sharing an interest) or "You're one of the first in {area}. We'll bring people to you as the club grows." Button: "See my deck".
- **Interest picking (D-056, premium):**
  - A tapped chip is cloned and animated (FLIP: first and last rects, transform and opacity, 220 ms, `--ease`) into its slot in the sticky "Your picks" tray. The source chip switches to a selected state (wine fill, tick).
  - The count pill bumps (scale 1→1.12→1, 150 ms).
  - `navigator.vibrate?.(8)` where supported.
  - Tapping a tray pick or the selected chip reverses the animation.
  - Under reduced motion: fades only, no transform.
  - The tray is a live region announcing "{label} added" or "{label} removed".
  - On desktop the tray sits beside the catalogue; on phones it is a sticky strip above the pinned button.

- [ ] **Step 1: Write the failing e2e** (375 and 1440 unless noted):
  - `18+ Yes calls declare_adult with the current NOTICE_VERSION, then shows Name`;
  - `No signs out with the adults-only copy`;
  - `Name is prefilled from Google metadata and saves on Next`;
  - `Area: picking a city calls set_home_city once; geolocation calls set_home_location with coordinates only in the POST body`;
  - `Interests: a tap adds the chip to the tray (tray count text "1 picked"), a cloned element animates during the pick (a transform is present at the 100 ms mark), and the chip is aria-pressed=true`;
  - `tapping it in the tray removes it`;
  - `under reduced motion no transform is applied`;
  - `13th pick shows the cap message`;
  - `a sensitive pick opens the private-interest consent dialog before it is added`;
  - `Next is disabled until a non-sensitive interest is picked`;
  - `Next calls set_member_interests with evenSplit points (3 picks → 7,7,6) and mode play`;
  - `no points, stepper or "points left" text appears anywhere in the flow`;
  - `each save failure (500) keeps the screen, shows a retry message, and the button is not left aria-busy`;
  - `Reveal shows the right copy for each deck answer and contains no member count (no digits)`;
  - `See my deck goes to /app.html`;
  - axe clean.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** signup, onboarding, deck, app-shell suites and landing parity. Expect PASS.
- [ ] **Step 5: Commit** `feat(signup): one-question profile screens with animated interest picking (Phase E)`.

### Task 5: Resume, login by code, retire the old 4-step form

**Files:**
- Modify:
  - `script.js`:
    - On load of `auth.html` with a session (including a Google return, `?complete-profile=1`, or `#signup`), call `resumeScreen` and open the guided flow there, or go to `/app.html` when `done`.
    - Login gains "Email me a code instead" (same code screen, with `shouldCreateUser: false`).
    - Delete the old 4-step form logic, the phone and gender handling, and the points UI. **Keep** the pending-profile application path (script.js ~1534) for one release, for accounts that signed up with the old flow and haven't confirmed yet (spec §1.4).
  - `auth.html`: remove the old `#signup-form` steps markup.
  - `account-deletion.js` / `privacy-account.js`: for a member without a password (`user.identities` has no `email` provider with a password, or `app_metadata.provider` is `email` and `user.user_metadata.has_password` is not true), offer "Send me a code" re-auth (`signInWithOtp` with `shouldCreateUser: false`, then `verifyOtp`) instead of the password field.
  - `tests/e2e/onboarding.spec.mjs`: retire the checks for the deleted 4-step form; keep the app-gate and under-review checks, pointed at the new flow.
- Test: `tests/e2e/signup.spec.mjs`, `tests/e2e/onboarding.spec.mjs`, `tests/e2e/consent.spec.mjs`

**Interfaces:**
- Consumes: Tasks 2–4.

- [ ] **Step 1: Write the failing e2e:**
  - `a session with adult+name but no area opens at Area with "Step 5 of 6"` (email) or `"Step 3 of 4"` (Google);
  - `a completed member opening auth.html#signup lands on /app.html`;
  - `?complete-profile=1 resumes at the first incomplete screen`;
  - `login "Email me a code instead" sends the code with shouldCreateUser false and signs in`;
  - `no phone, gender or points input exists anywhere in auth.html`;
  - `a passwordless member's delete dialog offers "Send me a code" and deletes after verifying`;
  - `the old pending-profile path still applies a stored pending profile once` (keeps the existing check).
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all e2e suites and landing parity. Expect PASS.
- [ ] **Step 5: Commit** `feat(signup): resume anywhere, login by code, old form retired (Phase E)`.

### Task 6: Docs, screenshots, gate

**Files:**
- Modify:
  - `docs/UX_SPEC.md` §A (signup screens);
  - `docs/ORBIT_ENGINE.md` (a note: signup interests enter with an even split, model unchanged);
  - `privacy.html` (if not complete in Task 1);
  - `docs/DECISIONS.md` (append D-057: Phase E results, the 0007 apply steps, the switch values for production, the founder dependencies);
  - `docs/HANDOFF.md` (Phase E state, the signup e2e command and port 5193, the commit-trailer rule);
  - `.env.example` (`VITE_SIGNUP_METHODS`).

- [ ] **Step 1:** Capture founder screenshots of every screen at 375 and 1440, including mid-animation frames of a pick, into the scratchpad, and look at them.
- [ ] **Step 2:** Full gate (Global Constraints).
- [ ] **Step 3: Commit** `docs: D-057 Phase E guided signup; HANDOFF, UX_SPEC, ORBIT note`. Push to `claude/jolly-edison-49xvza`. Ask the founder before `main`. Production needs, in the same window:
  1. apply `0007`;
  2. set `VITE_SIGNUP_METHODS` in Vercel;
  3. SMTP with the `{{ .Token }}` template, and/or Google OAuth live.

## Founder dependencies (unchanged from spec §1.5)

- **Custom SMTP** in Supabase Auth: the "Magic Link"/OTP template must contain `{{ .Token }}` (6 digits), with Brivia branding and a raised rate limit. Without it, ship with `VITE_SIGNUP_METHODS=google`.
- **Google OAuth** production configuration (Supabase and Google Cloud). Without either, keep `VITE_SIGNUP_METHODS` empty: public signup stays closed, and testers use test accounts.
- **Apply `0007`** in the SQL editor when the client ships. The 14-day window makes the order safe in either direction.
