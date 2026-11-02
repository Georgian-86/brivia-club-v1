# Hiring: a banner on hirers' profiles, matched to members who want a role (design, 2026-11-02)

Founder request, 2026-11-02: "I need to show a hiring banner in the profiles of the people whose looking for is hiring
candidates. They shall be suggested to people whose looking for is referral or a similar position the hiring people are
offering, such as software dev." Design it end to end (product management, superpowers, agent-arena for conflicts,
ui-ux-pro-max for the pages), strictly on brand, nothing that hurts the existing experience, best-in-class on phones.
Cover when and how hirers post, when and where everyone else sees them, and a chart from every role's point of view.
**Status: design for sign-off. Nothing is built.** Mock screenshots: project folder `hiring/` (390 and 1440 px).

## 1. What it is, in one line

A member who is hiring adds up to three roles. Their card and profile carry a **HIRING** banner, and members who said
they want a job referral or a role like it see them first, nearest first, and can **Ask about this role**: a pitch
with a note that the hirer accepts or quietly declines, exactly like a connection request.

## 2. Why it belongs in Brivia (and what it is not)

- Referrals are the most common way people in our audience (students, early-career, founders in Bengaluru and other
  Indian cities) get hired, and a referral is a relationship, which is what Brivia is for.
- It stays **location-first**: on-site and hybrid roles follow the deck's bands (neighbourhood, city, region). Only
  remote roles may reach further, and only for verified hirers with a strong fit (the Escape-Velocity idea).
- It stays **mutual**: an ask is a request. No chat opens until the hirer connects.
- Shared interests still lead: the hirer sees "You both care about Badminton" on every ask, so the first message is
  human, not a cover letter.

It is **not** a job board: no job tab, no listings feed, no applications, no CVs, no external apply links. Members who
are not looking for work keep the deck they have today, with one word changed in a hirer's card bar.

## 3. The roles and what each one wants

| Role | Who | What they want | What we must protect |
|---|---|---|---|
| **Hirer** | A member with "Hiring" in Looking for and at least one open role. Either the hiring person ("I'm hiring") or an employee who can refer ("I can refer"). | Fitting people nearby, a manageable number of asks, no spam. | Their inbox (caps), their location (bands only). |
| **Seeker** | A member with "Job Referral", "Internship Referral" or "Job opportunities" in Looking for, plus "Roles I'm open to". | To see who is hiring for their kind of role, and a safe way to ask. | Their current employer must not find out (hirers-only visibility by default); scams. |
| **Everyone else** | Any other member. | The deck they already like. | No clutter: they see the banner in the card's existing bar, nothing more. |
| **Moderator** | The founder (MODERATION.md). | Fast takedown of fake jobs. | Evidence: the role, the asks, the reports. |

## 4. Hirers: when and how they post

### 4.1 Entry points (all open the same "Add a role" sheet)

1. **Edit profile → Looking for**: picking the new suggestion **Hiring** opens "Add a role" right away. Closing the
   sheet without a role keeps "Hiring" as a plain looking-for value and shows no banner (a banner needs a role).
2. **Profile → "You're hiring" card → Add a role** (up to 3).
3. **Signup, About you**: picking Hiring does not add a step. After signup, the profile checklist shows one extra row,
   "Add the role you're hiring for". Signup stays the length it is.

### 4.2 The "Add a role" sheet (mock: `add-role-*.png`)

A centred 500 px sheet on desktop, a bottom sheet at 640 px and below (safe-area padding, 16 px inputs so iOS does not
zoom, the primary button always reachable). Fields, in order:

| Field | Rule |
|---|---|
| Role title (required) | A combobox (the shared `.b-combo`): the role catalogue (section 7.1) or the member's own words, 3 to 60 characters. The role family shows under it ("Software & engineering"); own words get a family from the closest catalogue match, or "Other". |
| Level (required) | Internship, Entry level (0-2 yrs), Mid level (2-5), Senior (5+), Lead. |
| Company (optional) | 2 to 60 characters, shown as written with "Self-reported" until verified (section 9). |
| Where (required) | A three-way segment: **On-site, Hybrid, Remote**. No city field: the role's place is the hirer's own area band (privacy rule; both arena panelists ruled out a typed city). |
| How you can help (required) | **I'm hiring** or **I can refer**. ("Recruiter" waits for work-email verification, phase 2.) |
| A line about it (optional) | Up to 200 characters. URLs, phone numbers and emails are refused with the inline line "Links and contact details go in chat, after you connect." |

**Post role** saves and the sheet closes to the profile with the toast "Your role is up. Members open to it will see
it." A role stays open **30 days**. Three days before, the hirer gets a panel row "Still hiring a Frontend
Developer? Keep it open / Close it". Renewal is one tap, but a role that has had asks and **no answer to any of them**
cannot be renewed until the hirer answers them (no abandoned banners collecting asks).

### 4.3 Managing roles (mock: `hirer-profile-*.png`)

The profile gets a **You're hiring** card above "Complete your profile": each role with its level, mode, waiting asks
and days left, and an Open / Paused / Not taking asks state; a row opens Manage (Edit, Pause, Close role). Buttons:
**Review N asks** and **Add a role**. The hero's kicker reads "HIRING" instead of "MEMBER".

- **Pause** hides the banner and the role from matching, keeps pending asks.
- **Close** (or "Role filled") removes the role; each pending ask gets one gentle line on the seeker's side: "Riya
  closed the Frontend Developer role." The ask itself stays a normal connection request.
- **Not taking asks**: at 25 pending asks a role stops accepting new ones automatically (it says so on the banner)
  until the hirer works the queue down.
- Removing "Hiring" from Looking for closes every role (with a confirm).

## 5. Seekers: how they say what they want (mock: `seeker-setup-390.png`, `seeker-profile-*.png`)

- New Looking-for suggestions: **Job opportunities** (next to the existing **Job Referral** and **Internship
  Referral**). Picking any of the three opens "What roles are you open to?": up to 3 role titles (same catalogue),
  level, where (On-site / Hybrid / Remote / Any), and **Who can see this**.
- **Who can see this** (a separate, withdrawable consent, recorded with a timestamp, DPDP): **Only members who are
  hiring** (default, recommended: the seeker's public card never says they are looking) or **Everyone** (an "Open to
  roles" line on their profile).
- **Let hirers find me** (off by default): hirers with a fitting open role see this seeker ranked higher in their deck.
- **Private: my current company** (optional, never shown): hirers whose company matches never see the seeker's role
  intent and never get them recommended. This is what stops a colleague finding out.
- Withdrawing (removing the looking-for value, or "Stop showing me roles") deletes the role intent at once.
- Catalogue values come from PR #35 (D-122): "Hiring", "Job Opportunities" and "Can Give Referrals" are already in
  `LOOKING_FOR_CATALOG`. "Can Give Referrals" is treated like "Hiring" with "I can refer" preselected. Every match on
  these values is case-insensitive (members type their own spelling).
- "Developer", "Designer" and similar looking-for values on their own are **not** job seeking: they usually mean "I want
  to find a developer". Only the three explicit values above make someone a seeker.
- Profile card **Open to roles**: the roles, level and mode, a lock line ("Only members who are hiring see this"),
  "3 hiring near you", **See who's hiring** (opens the deck with the Hiring lens on) and **Edit**.

## 6. Where everyone sees hirers

| Surface | Seeker with a fitting role | Everyone else | Mock |
|---|---|---|---|
| **Connect deck card** | The oxblood bar reads "HIRING · FRONTEND DEVELOPER" (or "HIRING · 2 ROLES" when the title does not fit, measured, never an ellipsis); a one-line role strip under the distance: "Frontend Developer · Hybrid / Fits what you're open to · Can refer". The duplicate "Hiring" chip is dropped (say it once). | The same bar, no strip. Nothing else changes. | `deck-seeker-*`, `deck-everyone-*` |
| **Public profile (View profile)** | The **Hiring** banner first in the body: oxblood header ("HIRING", "Self-reported · Can refer"), each role (title in Bodoni, level · mode · company, the line, "Fits what you're open to"), **Ask about this role** on the best fit and **Ask** on others, a foot "Open 6 days · Replies to most asks". | The same banner; the Ask buttons too (anyone may ask, the caps apply). | `profile-banner-*` |
| **Deck ranking** | Fitting hirers move up, at most **1 in every 5 cards**, only when the seeker has an explicit seeker value. | No ranking change at all. | |
| **Hiring lens** (filter drawer) | A switch "Hiring for roles like mine" that shows only fitting hirers. | A switch "Only people who are hiring". | |
| **Notification panel** | At most once a day, only when a **new** fitting role appeared: "2 people near you are hiring / For roles like yours · Frontend Developer", **Review** opens the one-card review sheet (D-108 pattern) with **Ask** / **Not now**. | Never. | `notification-*` |
| **Search** | "hiring", a role title or a company finds open roles' hirers (search reaches everyone, rule 3). | The same. | |

A hirer appears in the banner surfaces only while the hiring bar (section 9) is met and at least one role is open and
not paused.

## 7. Matching (the fit score)

### 7.1 Role catalogue

`supabase/catalog/role-catalog.tsv`: about 120 titles in 12 families (Software & engineering, Data & AI, Design,
Product, Marketing & growth, Sales & business development, Content & media, Operations & support, Finance & accounts,
People & HR, Research & science, Other). Each title lists close synonyms (SDE, Software Engineer, Full-stack
Developer...) and adjacent families (Software ↔ Data & AI, Design ↔ Product).

### 7.2 Fit (a new ORBIT term, added to `docs/ORBIT_ENGINE.md` §9 in the build commit)

For a seeker S and a hirer's open role R:

```
title_fit  = 1.0 same title or synonym · 0.7 same family · 0.4 adjacent family · 0 otherwise
level_fit  = 1.0 same level · 0.6 one step apart · 0 two or more (Internship only matches Internship / Entry)
mode_fit   = 1.0 S accepts R's mode · 0 otherwise (S "Any" accepts all)
skill_fit  = min(1, |S.skills ∩ R.hirer.skills| / 3)
role_fit   = title_fit × level_fit × mode_fit × (0.8 + 0.2 × skill_fit)       in [0, 1]
```

A role **fits** when `role_fit ≥ 0.5`. The best role of a hirer is the one shown on the card strip.

### 7.3 Ranking and location

- The deck keeps its order (location band, then shared interests). For a seeker, fitting hirers are lifted to the
  front of their band, with at most 1 in every 5 cards being a lifted hirer. A hirer is never lifted across bands
  except a **remote** role from a verified hirer with `role_fit ≥ 0.8` (the remote Escape-Velocity gate).
- The notification row and the lens use the same fit, the same bands and the same gate.
- Shared interests are shown on the ask (to the hirer) and on the card (to the seeker), unchanged.
- Hirer side ("Let hirers find me" on): opted-in seekers with `role_fit ≥ 0.5` for one of the hirer's open roles get
  the same lift in the hirer's deck, under the same 1 in 5 cap.

## 8. Asking about a role (mock: `ask-sheet-*`, `hirer-review-*`)

- **Ask about this role** opens the pitch sheet in a role variant: "Introduce yourself to Riya", a tag with the role,
  the note (required, 20 to 500 characters, the placeholder suggests what to say), and the safety line "Real referrals
  are free. Never pay a fee or share ID or bank details to be referred. Report it if anyone asks."
- It is one **signal** (send_signal with the role id) and also counts against **3 role asks a day** (shown: "Uses 1 of
  your 30 signals · 2 role asks left today"). One ask per role per member, ever.
- The hirer reviews asks in the existing request sheet (D-108), with "Asking about: Frontend Developer", the note,
  "You both care about…" and "Skills in common…". **Connect** opens a chat; **Not now** is silent, as today.
- An ask nobody answers leaves the hirer's queue after **14 days** (the seeker sees nothing, as with any request).
- The first chat on a role-tagged connection shows a one-time safety line above the messages, same wording.

## 9. Trust and safety (the hiring bar)

The banner, the lift and the notification row need all of: account at least **14 days** old, a complete profile
**with a photo**, a confirmed email, and **no open report**. Until then the hirer can post roles and sees "Your
banner goes live on 16 Nov, when your account is two weeks old."

- The company is labelled **Self-reported**. Phase 2: a work-email check (a code to `name@company.com`) earns a
  **Verified** mark, the "Recruiter" option and remote reach beyond the region.
- No links, phone numbers or emails in role text (section 4.2). Links can be shared in chat after connecting.
- New report reason **"Fake job or asked for money"**. One such report pauses all of that member's roles until the
  moderator reviews (MODERATION.md gets a hiring section); the reporter is never named.
- Caps: 3 open roles per hirer; 25 pending asks per role; 3 asks a day per seeker; 1 ask per role per seeker.
- Kill switch: `app_config.hiring_enabled`. Health metrics before and after launch: like rate and report rate in the
  deck for non-seekers (must not drop), ask → connect rate, "Fake job" reports per 100 roles.

## 10. Privacy contract

| Rule | Why |
|---|---|
| A role's place is the hirer's own area band ("~3 km", the city band, the region) plus On-site / Hybrid / Remote. No typed city, never coordinates. | CLAUDE.md location rule; a typed city leaks where the hirer lives. |
| A seeker's role intent is visible only to members with an open role, unless the seeker picks Everyone. | Their employer must not find out. |
| A seeker's private current company is never sent to any other client; it is only used server-side to exclude. | Same. |
| Role intent is its own consent (timestamped), withdrawable, deleted at once on withdrawal. | DPDP purpose limitation. |
| Email and phone never reach other clients, roles included. | CLAUDE.md. |

## 11. Data model and RPCs (migration `0023_hiring.sql`, written at build; 0022 is PR #35's catalogue additions; the build's decision is numbered after D-122)

- `hiring_roles` (id, member_id, title, family, level, work_mode, help ('hiring' | 'refer'), company, about, status
  ('open' | 'paused' | 'closed'), opened_at, expires_at, renewals, created_at). RLS: the owner reads and writes their
  rows; nobody else selects the table.
- `role_intent` (member_id, titles[1..3], families, level, work_mode, visibility ('hirers' | 'everyone'),
  findable bool, private_company, consented_at). Owner only.
- `role_asks` (id, role_id, seeker_id, hirer_id, note, created_at, status): the role tag on a signal; the connection
  itself is the existing request.
- RPCs (security definer, the D-032 pattern): `save_hiring_role`, `set_role_status`, `my_hiring_roles`,
  `save_role_intent`, `withdraw_role_intent`, `ask_about_role(role_id, note)` (calls the signal path, checks every
  cap), `member_hiring(member_id)` (the banner for one member, with `fits` for the caller), and `deck_candidates` /
  `get_candidates` / `search_members` gain one `hiring` jsonb column (best role title, mode, level, help, count, fits).
- SQL tests `supabase/tests/k-hiring.test.sql`: caps, the hiring bar, visibility, private company exclusion, no
  coordinates or city anywhere in the payloads, expiry and renewal rules.

## 12. Phasing

- **Phase 1 (this build):** catalogue, roles and intent, banner on card / profile / own profile, the ask, the review
  tag, ranking lift, lens, notification row, caps, hiring bar, report reason, kill switch.
- **Phase 2 (founder call):** work-email verification (Verified mark, Recruiter, remote beyond the region), weekly
  digest email, analytics view in MODERATION.md.

## 13. Agent-arena record (design_debate, quick_panel of two independent agents, 2026-11-02)

Run with two independent panelists (a product manager and a trust-and-safety red team). Both are the same model family
as the author: disclosed as reduced heterogeneity (no second model route here, as in D-119).

| Conflict | Panel | Ruling |
|---|---|---|
| Surface | Both: deck ranking + lens + notification row, no new tab; lift only for explicit seekers (1 in 5 / no lift otherwise). | As the panel. |
| Ask quota | Both: spend a signal and a sub-cap (PM 5, red team 3); per-role cap ~25. | 3 a day (safer to start; revisit with data), 25 per role. |
| External link | Both: none in v1; links in chat after connecting. | As the panel. |
| Seeker visibility | PM: hirers-only default, hirers' deck shows opted-in seekers. Red team: hirers-only and finding off by default. | Hirers-only by default; "Let hirers find me" off by default. |
| Verification | PM: 14 days, photo, verified email, no open reports; self-reported label. Red team: work email for the banner. | PM's bar for v1 (work email for everyone blocks founders and freelancers); work email earns Verified in phase 2 and is required for Recruiter and remote reach. |
| Job location | Both: derive from the band, no typed city. | As the panel. |
| Banner for non-seekers | PM: full bar only for fitting seekers. Red team: compact chip. Founder asked for a banner on hirers' profiles. | The card's existing bar carries "HIRING · …" for everyone (no added chrome, so nothing new to clutter); the role strip and the lift only for fitting seekers; the full banner in the profile dialog for everyone, as asked. |
| Misses adopted | Scam report reason and pause; safety line; no-answer renewal block; employer exposure (private company); 14-day ask expiry; kill switch and metrics; role intent as separate consent. | All adopted. |

## 14. Copy (voice: short, warm, no job-board words like "apply", "candidate", "vacancy")

Card bar "HIRING · FRONTEND DEVELOPER" · strip "Fits what you're open to · Can refer" · banner "Hiring" / "Self-reported
· Can refer" · button "Ask about this role" · sheet "Introduce yourself to Riya." · hirer "People who'd like a referral"
/ "Asking about: Frontend Developer" · notification "2 people near you are hiring / For roles like yours" · seeker
"What roles are you open to?" / "Only members who are hiring see this" · empty lens "No one near you is hiring for
these roles yet. We'll tell you when someone is."
