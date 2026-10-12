# Arena: what signup should require (2026-10-12)

**Mode:** deliberative_analysis, open. **Participants:** 4 independent critics (growth, matching/ORBIT, trust/DPDP, UX/brand) and a separate judge. **Heterogeneity (disclosed):** all are Claude models (no Codex/other family installed), so blind spots may be shared. Critics did not see each other's answers.

## Packet

### Arena packet: what should Brivia Club's signup require? (2026-10-12)

Repo: /home/user/brivia-club-v1 (read-only for you). Read CLAUDE.md, docs/VISION.md, docs/UX_SPEC.md (§A onboarding),
docs/ORBIT_ENGINE.md (§3 Passion Budget, cold start / what the engine needs), docs/DECISIONS.md D-029..D-051 as needed,
auth.html + script.js (signup), app.js (what an incomplete member sees), supabase/migrations/0004*.sql and 0005*.sql
(`brivia_member_completed`, `declare_adult`, `my_onboarding_status` — what the SERVER requires before a member is visible).

## Product and goal
Location-first, interest-matched networking (India, adults only, DPDP Act 2023). Founder's goals, verbatim intent:
"retain at least 85% of the users who visit"; signup must be "super immersive and helpful, no one should feel lost";
"one screen one question"; "the point system is not very good without any explanation"; keep existing images/styles/brand
(deep wine), enhance UX rather than redesign.

## Today's signup (4 steps, many fields per step)
Step 1: name, email, phone (required, country code), gender (required), experience (required), 18+ checkbox.
Step 2: area (geo or pick city). Step 3: 1–12 interests + spread exactly 20 "passion points" + mode (learn/play/teach/build)
+ "looking for" (required). Step 4: password, photo (optional), cover. Email confirmation follows (default Supabase sender,
rate-limited; custom SMTP pending). Server-side "completed" (visible in the deck) currently needs: real name, adult
declaration, a home cell, interests summing to 20.

## Options on the table
A. Minimum then in: Google or email+password → 18+ → area → interests with an explained points step (≈5 short screens) →
   first matches. Phone (optional), gender, experience, photo, cover, looking-for move to an in-app "complete your profile"
   checklist.
B. Same fields as today, one per screen (~12 screens), nothing optional.
C. Middle: A + gender and looking-for stay in signup; phone/experience/photo/cover later.

## Your task
Give an INDEPENDENT recommendation from your assigned lens (below). You may propose a better option D. Return, in under
600 words: recommendation; ordered screen list for your preferred flow (one question per screen); which fields are
required at signup vs later and why; how to explain the 20 points simply (or whether to change the mechanic's UX without
changing the ORBIT model); top 3 risks of your pick; what would change your mind. Cite file paths for code/spec claims.
You have ~20 tool calls; by call 18 stop reading and answer. Do not edit files.

## Judge ruling

### Judge ruling: signup flow (2026-10-12)

**Verdict: D-variant.** Use A's minimum and create the account first (Google, or email plus a 6-digit code). The 18+ question comes before the name. Points come from tier taps with one required "top" pick. Phone and gender are not collected at all.

## Final screens (one question each; existing deep-wine shell, imagery and type)
1. **Welcome:** "Continue with Google" / "Continue with email" (keep the existing preview band).
2. **Your email** (email path only).
3. **Enter the 6-digit code.** Use `one-time-code`, let paste fill all boxes, allow resend after 60 s, and offer "Wrong email?". The session starts here, and every later screen saves to the server.
4. **"I'm 18 or older"**: an unticked box that calls `declare_adult`.
5. **"What should members call you?"** Prefill it from Google.
6. **Your area** (today's step, unchanged, with the ~2 km explainer).
7. **What are you into?** Pick 1–12 ("3–6 works best"). The sensitive-interest consent dialog stays as it is. Interests are held in memory until screen 8.
8. **Which one matters most?** Then the single `set_member_interests` save.
9. **Reveal:** "N people near you share X". This leads into the deck and the "Complete your profile" checklist.

**Copy for the points screen:**
> **Which one matters most?**
> You have 20 points to share across your interests. The more points an interest has, the more we match you with people who love it too.
> Tap your top passion and we'll split the rest. Tap any other interest to switch it between *Really into* and *Curious*.
> *Example: Chess 8 · Hiking 4 · Jazz 4 · Cooking 4.* The total always stays 20, and you can change it later.

**How the taps become points:**
- Tiers carry weights: Obsessed 4, Really into 2, Curious 1.
- The client scales them to 20 by largest remainder, with a floor of 1 per interest.
- An optional "Fine-tune" control opens zero-sum steppers.
- Next is enabled once a top pick exists, and it is enabled straight away when only one interest is picked.

## Required at signup, later, and never
- **At signup:**
  - a verified account (Google, or email by code);
  - the 18+ declaration;
  - a name;
  - an area;
  - 1–12 interests with points.

  This is exactly the server's visibility gate (`0005_p0b_dpdp_safety.sql:153-174`).
- **Later checklist:**
  - photo (nudged at the first like or request);
  - looking-for (prompted at the first request);
  - mode (defaults to `play`);
  - experience;
  - cover;
  - password (optional for code and Google users).
- **Not collected:** phone and gender, until a named feature with its own purpose copy needs them.

## Rulings on the 5 disagreements
1. **Points: tiers with a required top pick, not an even pre-split.** I checked `ORBIT_ENGINE.md:161`. In `√p_B(j)/√max_k p_B(k)`, an even split gives every one of B's interests a factor of 1, so other members' R(→B) is maximised whichever interest they share. The member's own R(B→) gets the dilute weight 1/n, and the harmonic mean (`:167`) dampens the result.
   - The matching critic is right about **signal loss**. An even split is a hedge that erases the ordering.
   - "Inflation" overstates it, because the effect is only partial.
   - A pre-split that nobody adjusts produces flat data for good, because only the first save is free and the 4th rewrite in 24 h is refused (`ORBIT_ENGINE.md:124-126`).
   - The required top tap costs one tap and guarantees an ordering. It keeps the UX critic's best ideas: the screen never looks broken, points never show as "left", and the stepper is zero-sum. It also fixes the bug where Next is disabled until all points are placed (`script.js:1045-1046`).
   - Following the matching critic, allow at most 2 Obsessed.
2. **Account first, Google primary, email by 6-digit OTP (Confirm email ON).**
   - Today's localStorage draft is lost across devices.
   - Trust's alternative is to turn off Confirm email and gate on `email_confirmed_at`. It is probably vacuous: with confirmation off, GoTrue autoconfirms and sets `email_confirmed_at` at signup. I have not checked this against current Supabase docs, so verify it before anyone relies on that path.
   - OTP keeps `email_confirmed_at` genuine for the rejoin tombstone, which matches on the email digest (`0005:508`).
   - OTP still needs SMTP, so it does not fix the 429.
   - **Fallback ladder:**
     1. Custom SMTP live: run the full flow.
     2. Only Google configured: Google-only signup, and the email path shows "Email sign-up opens soon".
     3. Neither configured: do not open public signup. The default sender handles about 2 signups an hour, which cannot support launch.
3. **Looking-for goes on the later checklist, with a contextual prompt at the first request.**
   - It is display only and not a key in the deck order (`ORBIT_ENGINE.md:518-528`).
   - `UX_SPEC.md:123` currently makes it required, so update that line.
   - The UX critic's skippable screen 9 would add a screen and buy no visibility or ranking.
4. **18+ comes before the name.**
   - The server only forces adult before writes to `member_orbit` and `member_interest` (`0005:179-203`). The name write is not gated.
   - DPDP s.9 argues for gating any further personal data behind the declaration.
   - Google allows accounts from age 13.
   - The friction is equal either way, one tap. A Google prefill is just held until after the declaration.
5. **Phone and gender: remove them, and do not move them to the checklist.**
   - Both are required today (`auth.html:90,93`).
   - Gender is null in every card RPC (`0004:741`, `ORBIT_ENGINE.md:853`).
   - Phone is unverified and never shown.
   - These changes must ship together:
     - `privacy.html:60` drops phone and gender;
     - a new migration `0007` bumps `brivia_notice_version()`, with `notice-version.js` in the same deploy window;
     - decide whether to null the existing phone and gender values in 0007 (minimisation);
     - D-entry in `DECISIONS.md`.

## Dependencies and blockers
- **Custom SMTP** (launch blocker for the email path; noted in HANDOFF:45). Also make the email template send `{{ .Token }}`.
- **Google OAuth production config** (`script.js:1331` says it is not configured), plus the exact redirect list.
- **Deletion re-auth for passwordless members.** The `amr` re-auth path today expects a password (D-049), so add an OTP re-auth path.
- **Migrations:** 0005 and 0006 are live and frozen (HANDOFF:35; CLAUDE.md is stale on this). New SQL goes in `0007`.
- **Notice version.** `declare_adult` raises 22023 on a stale version (`0005:137`). Either deploy the client in the same window as 0007, or have 0007 accept the previous version for 24 h.
- **Same-commit doc updates:** `UX_SPEC.md` §A, `ORBIT_ENGINE.md` (a note on the tier-to-points mapping; the model is unchanged), the onboarding e2e test, and `DECISIONS.md`.

**Ship order:**
1. SMTP and Google config.
2. 0007, `privacy.html` and the notice bump, together with the client.
3. Verify a live signup on both paths.
4. Measure the 85% as **signup started → first deck seen**, per screen.

## Preserved dissent
- **Trust's "finish now, become visible once verified."** This takes email delivery off the critical path for finishing onboarding. It is the strongest minority view. The verdict changes if Supabase confirm-off does *not* autoconfirm, or if a cheap server-side verified flag exists (for example an auth hook).
- **UX's even pre-split with zero required taps.** The verdict changes if the required top pick costs more than about 2 percentage points of completion. Then pre-split, keep "Tap your top one" as an optional nudge, and track the share of members who adjust.
- **Growth and matching** both say looking-for or a photo becomes a soft gate if data shows it drives accepts.

**Disclosure:** all four critics and this judge are the same model family (Claude), so the views are less independent than four different models would be.

## Critic: growth

### Critic: GROWTH / FUNNEL CONVERSION

## Recommendation: Option D (A, account-first, verification out of the way)
A is right, but it misses the two biggest leaks:
1. **The account is created last.** `supabase.auth.signUp` runs after step 4 (script.js ~1962). Then comes an email-confirmation wall on a rate-limited default sender, and the pending profile lives in localStorage (script.js 1467-1593), so it is lost if the member confirms on another device. Estimate: 20-40% never confirm.
   - Create the account on screen 1 and save every screen server-side. The re-entry gate already resumes at the first incomplete step (UX_SPEC.md §A).
   - Make Google primary (script.js 1340). On the email path, use an in-page 6-digit code instead of a link.
2. **Ask only what the server needs.** `brivia_member_completed` (0005 ~153) requires a name, adult declaration, cell and 1-12 interests summing to 20, nothing else.

On "85%": measure it from signup started to first matches seen. Visit-to-complete in consumer social is typically 20-40% (estimate).

## Screens (one question each)
1. Continue with Google / email
2. (email only) 6-digit code
3. Your name (prefilled from Google)
4. "Are you 18 or older?" The server refuses cell and interest writes before this (0005 `brivia_require_adult`).
5. Your area
6. Pick interests, with a live "38 people near you share these"
7. Which matter most? (points)
8. **First matches**, then a "Complete your profile" checklist with progress (photo first)

## Required now vs later
- **Required now:** auth, name, 18+, area, interests and points. That is exactly the server's visibility rule.
- **Phone: optional, later.** It is never shown to members (D-005, D-013). A required phone field typically costs 10-25% (estimate).
- **Gender: drop it from signup.** Card RPCs return it as null (DECISIONS.md ~401, ORBIT_ENGINE.md ~853), so it feeds nothing, and asking it early costs trust (estimate 5-10%, higher for women). This is why I reject C.
- **Looking-for and mode:** ask at the first request (mode defaults to `play`, §3.2).
- **Photo:** nudge it on the first like ("more replies with a photo").
- **Experience and cover:** checklist.

## Explaining the 20 points (UX only, ORBIT unchanged)
- Auto-spread evenly the moment interests are picked (`spreadRemaining`, passion-budget.js), so the member starts valid and only adjusts.
- Copy: "You have 20 points. Give more to what you care about most, and we match you more on it." Example line: "Chess 10 · Hiking 6 · Jazz 4".
- Use +/- steppers, plus optional Love/Like/Curious chips. The client converts the chips to integers summing to 20 by largest remainder (the spec's own method), so the server still gets exact points.

## Top 3 risks
1. **Thin first deck kills the aha moment.** Fall back to city or region with honest labels, plus invite-a-friend.
2. **Weaker profiles.** No photo or looking-for lowers the accept rate. It needs nudges, or a soft gate: a photo before the first outbound request.
3. **Pending infrastructure.** Google OAuth production config and custom SMTP/OTP are not done yet. If they slip, the email path stays leaky.

## What would change my mind
- Per-screen data showing looking-for at signup lifts the accept rate more than it costs completion. Then add it back as screen 7b.
- The OTP step dropping more than the link does. Then use "confirm later" with a banner.
- Abuse data tied to photo-less accounts. Then require a photo before the first request, still not at signup.

## Critic: matching

### Critic: matching quality / ORBIT lens

## Recommendation
**Option A, refined (call it A+)**: only what the engine reads at signup; keep the Passion Budget as data but replace the manual 20-point chore with an assisted "how much do you care" step. No migration is needed.

What the server requires before a member can be seen (`brivia_member_completed`, `supabase/migrations/0005_p0b_dpdp_safety.sql:153-174`):
- a real name, not 'New Member';
- `adult_declared_at`;
- an account that is not anonymous;
- a `member_orbit` cell;
- 1–12 interests summing to 20, at least one of them non-sensitive;
- no suspension flag.

Phone, gender, experience, looking-for, photo and cover play no part. In `0001_baseline.sql:23-35`, gender is nullable and `looking_for` defaults to `'{}'`. So option A is a client and spec change only: script.js, app.js routing and `docs/UX_SPEC.md` §A (which today makes looking-for required), plus the onboarding e2e test.

## What affects ranking or safety today
- **Gender:** none. Every card RPC returns null for it (`0004:741`, D-038 R4), and nothing ranks on it. No match value; asking for it works against DPDP data minimisation.
- **Looking-for and experience:** display only. Looking-for is also matched by `search_members` (`0004:796`) and is a client-side filter on the loaded deck (UX_SPEC.md:193). Neither is a key in the `deck_candidates` order (ORBIT_ENGINE.md:518-528).
- **Mode:** used by ORBIT resonance (`orbit/src/resonance.js:52`) but not by the interim deck. It defaults to `play`, so deferring it is safe.

## Screens (one question each)
1. Continue with Google, or email + password. Google is not configured yet (`script.js:1331`).
2. "What should we call you?" Prefill from Google. This is a hard requirement.
3. "Are you 18 or older?" This calls `declare_adult`. It must come first: the `brivia_require_adult` trigger refuses location and interest writes before it (`0005:179-203`).
4. "Where do you spend most of your time?" GPS or a city pick.
5. "What are you into?" Pick 1–12, nudged towards 3–6.
6. "How much do you care about each?" Three taps per interest: **Obsessed / Really into / Curious**, weighted 4/2/1. Scale to 20 by largest remainder with a floor of 1 point each, the same arithmetic as `0005:213-215`. Show the split as a bar, with an optional stepper.
7. First matches. A "complete your profile" checklist then collects photo, looking-for, mode, experience, phone and cover.

## Required now vs later
- **Required:** name, 18+, area, interests, intensity. These are what makes a member visible and ranked.
- **Later:** everything else. It affects whether a card gets accepted, not who appears.

## Explaining the 20 points
Use this copy: "You have 20 points to show what you care about most. Sharing a top passion with someone counts for more than sharing a passing interest." The tier taps keep the model unchanged (`p = points/20`, ORBIT_ENGINE.md §3.2).

**Do not default to an even split.** In ORBIT's resonance term `√p_B(j)/√max_k p_B(k)` (ORBIT_ENGINE.md:161), an even split gives every one of the member's interests the maximum factor of 1. That member looks "all-in" on everything, which inflates their scores. Tiers keep the ordering. The existing "Spread evenly" button (D-049) has the same weakness and should be secondary.

The rewrite cap also matters. Only the first interest save is free, and the 4th rewrite in 24 hours is refused (ORBIT_ENGINE.md §3.2). So the first save must be real, not a placeholder.

## Top 3 risks
1. **Tier inflation.** If everyone taps "Obsessed" on everything, the split comes out even and the signal is lost. Mitigation: allow at most 2 "Obsessed", or ask "Which one matters most?" when every tier is the same.
2. **Thin cards.** Cards with no photo or looking-for may get fewer likes, which slows mutual matches. The checklist has to nudge members before their first like or request, not after.
3. **First-match quality is limited by density, not by signup fields.** The k-anonymity floor and a sparse pool still produce empty decks. Fewer fields only reach that empty state faster.

## What would change my mind
- Data showing likes collapse without a photo or looking-for. Then I would make one of them a soft step before the first like.
- A women-safety feature (for example, women-only visibility) that needs gender at entry.
- ORBIT going live with strong mode complementarity. Then I would add an optional "Learn / Teach?" chip to screen 6.

## Critic: trust

### Critic: Trust, safety, DPDP 2023

## Recommendation: Option D (A, minus phone and gender, plus "verified before visible")
DPDP s.6(1) limits consent to data "necessary for the specified purpose". Today's signup collects fields with no working purpose:
- **Phone** is required (`auth.html:90`) but never verified. It is never shown (D-005), and its tombstone is deferred to P1 (D-044). An unverified number stops no abuse, and it is the field users most fear will bring spam.
- **Gender** is required (`auth.html:93`), but card RPCs return it as null and ORBIT never reads it (`docs/ORBIT_ENGINE.md:853`).

C fails this purpose test for gender. B maximises both friction and over-collection.

## Screens (one question each)
1. **Welcome**: Google or email. "We ask only what matching needs. How we use your data →"
2. Email (email path only).
3. Password (email path only).
4. **18+**: an unticked box on its own: "I confirm I'm 18 or older. We don't ask your date of birth." It goes before area and interests, because the server refuses those writes before `declare_adult` (D-044 R1). Google users see it too, since Google allows 13+ accounts.
5. **Name** (prefilled from Google, editable): "Members see this name."
6. **Area**: keep the explainer: "A rough ~2 km square, never your exact spot. Others see '~3 km' or your city."
7. **Interests**: the private-interest consent stays a separate opt-in dialog (`auth.html:133`).
8. **Points**: "20 points. Give more to what you care about most." Add a privacy line on who sees points only after checking it against the card contract.
9. **Email path**: "Confirm your email to become visible." **Google**: first matches.

Later, as optional checklist items, each with a line saying who sees it: photo, cover, experience (shown on cards), looking-for.
Never collect until there is a purpose: phone (only with OTP and a stated ban-evasion use) and gender (only with a named feature and its own copy).

## Required at signup, and why
- 18+ declaration: DPDP s.9; completion requires it (`supabase/migrations/0005_p0b_dpdp_safety.sql:153-170`).
- Real name: accountability for reports.
- Coarse cell and interests summing to 20: the matching purpose itself.
- **Verified email**: the rejoin tombstone matches on an email digest (`0005…:482-510`), so a throwaway unverified address defeats it. Proposal: turn Supabase "Confirm email" off, and add `email_confirmed_at is not null` to `brivia_member_completed`. Members finish onboarding at once and stay invisible until they confirm. Record this in `docs/DECISIONS.md` after an arena check. Google gives a verified email for free.

## Copy and process
- `privacy.html` "What we collect" lists phone and gender. Change it in the same release: bump `brivia_notice_version()` (a new migration), `privacy.html` and `notice-version.js` together (`0005…:14`).
- Google: "We get your name and email from Google, nothing else." Do not store the avatar (already ruled).

## Top 3 risks
1. **Notice-version drift.** `declare_adult` raises 22023 on a stale version, so a bad deploy order blocks every signup.
2. **Email delivery.** The default Supabase SMTP is rate-limited, so email-path members could stay invisible. Custom SMTP is a launch blocker for the email path.
3. **Ban evasion.** Without a phone, rejoining costs only a new Gmail account. Mitigation: the tombstone plus report caps now, and phone OTP if `docs/MODERATION.md` reviews show abuse.

## What would change my mind
- Counsel says the IT Rules 2021 or the DPDP Rules require phone or KYC at our scale.
- Moderation data shows ban-evasion rings: then add phone OTP as a verified step, never as a free-text field.
- A women-safety feature (for example, filtering who can send you requests) is approved: then gender returns as optional, with its own purpose copy.

## Critic: ux

### Critic: UX / interaction / brand

## Recommendation: Option D (A's minimum, account first, email code instead of link)
Ask only for what the server gate needs: name, adult, cell, 1–12 interests summing to 20 with one non-sensitive (`supabase/migrations/0005*.sql:153-174`). Put the account first, using Google or a **6-digit email OTP** instead of a confirmation link. That gives a session from screen 3, so every answer is saved on the server and nobody is left at "Check your email" after doing all the work (`auth.html:198`). The link flow keeps answers in localStorage (`docs/UX_SPEC.md` §A). That copy is lost when the link opens in a mail app or on another device, and a geo choice has to be redone anyway. B means about 12 screens for fields the gate ignores, which works against the 85% retention goal.

## Screens (one question each; deep-wine shell, Instrument Sans, existing imagery)
1. Welcome, with the existing preview band: "Continue with Google" / "Continue with email"
2. Your email
3. Enter the 6-digit code: `autocomplete="one-time-code"`, paste fills all boxes, resend after 60 s, "Wrong email?"
4. What should members call you?
5. I'm 18 or older (existing copy and inline error)
6. Your area (today's step 2, unchanged)
7. Pick what you care about (1–12 chips, "3–6 works best")
8. Which matter most? (points)
9. What are you looking for? One tap, with "Skip for now"
10. Reveal: "N people near you share Photography" leads into the deck

On every screen:
- A wine progress bar with "4 of 9" text.
- Back always visible, and Enter means Next.
- A 44 px primary button pinned above the mobile keyboard.
- Focus moves to the heading when the screen changes.

Screens 4–6 save on Next. Interests stay in memory until screen 8, because each `set_member_interests` call after the first counts as a rewrite and the 4th within 24 h returns PT429 (`docs/ORBIT_ENGINE.md` §3.2).

## Required now vs later
- **Now:** email or Google, name, 18+, area, interests with points.
- **Later**, in an in-app "Complete your profile" checklist:
  - Photo, cover
  - Looking-for, if skipped
  - Per-interest mode (the spec already defaults it to `play`)
  - Experience
  - Gender (sensitive, and the deck doesn't use it)
  - Phone (optional)
  - Password (optional with OTP or Google)

## Making the 20 points obvious (UX only; ORBIT model unchanged)
Signup looked "broken" for two reasons. Each new interest starts at 1 point, so the counter reads "17 of 20 left". And Next stays `aria-disabled` until all 20 points are placed (`script.js:1045-1046`). The fixes:
- **Never start incomplete.** Picking interests pre-splits the 20 evenly by largest remainder. Screen 8 opens complete, and Next is always enabled.
- **Zero-sum steppers.** "+" takes one point from the interest with the most points (never below 1). The total never changes, so there is never a "points left" count.
- **Make it visible.** A 20-segment bar in wine tints, with each row reading "Photography · 8 / 20".
- **Copy:**
  - "You have 20 points. Give more to what you'd cross town for."
  - "We split them evenly. Move them if some matter more."
  - On the first "+", a one-time tip: "Points move between interests; the total stays 20."

## Top 3 risks
1. **OTP delivery.** The default Supabase sender is rate-limited and custom SMTP is still pending. Ship SMTP first, make Google the primary option, and show clear resend and limit messages.
2. **Flat defaults weaken the signal.** Track how many members adjust their points. If too few do, add "Tap your top one", which gives that interest 8 points.
3. **Thin first profiles make the reveal and deck feel empty.** Mitigate with checklist nudges and a branded monogram placeholder.

## What would change my mind
- Funnel data showing people drop off at the up-front account step. I would then move the account to after screen 8 (OTP still inside the tab), keep a local draft with no coordinates, and declare adult before saving area or interests (`brivia_require_adult`).
- Evidence that looking-for drives first-week connections. I would then make it required.
- Supabase OTP templates turning out not to support our brand or locale.
