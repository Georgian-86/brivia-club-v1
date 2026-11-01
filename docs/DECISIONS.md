# Decision log

Append-only. Format: `D-NNN · date · status · decision · why`. Never edit a past entry. Add a new one that
supersedes it.

| ID | Date | Status | Decision | Why |
|---|---|---|---|---|
| D-001 | 2026-10-02 | Accepted | `brivia-club-v1` is the product UI we ship. `brivia-club` is the backend and engine reference. | The v1 UI is the chosen design. The older repo has the only real backend and matching engine. |
| D-002 | 2026-10-02 | Accepted | The product is **location-first, interest-matched networking**. Far recommendations are allowed only for very strong matches. Search and requests can reach anyone. | The founder's stated aim (see `VISION.md`). |
| D-003 | 2026-10-02 | Accepted | Replace the engine v1 *scoring model* with **ORBIT** (`ORBIT_ENGINE.md`). Reuse engine v1 *plumbing*: embeddings, vector store, interaction log, taste learning, diversity and exploration, evidence-only explanations. | The audit (`ENGINE_AUDIT.md`) rates v1 plumbing ~7/10 but its fit to the location-first vision ~2/10. ORBIT must be original for copyright. |
| D-004 | 2026-10-02 | **Open** | Where does ORBIT run: (a) a Node service reusing `brivia-club/server` with Supabase JWT auth, or (b) Supabase Edge Functions plus SQL? | The audit recommends (a): it reuses the engine code, keeps ranking and location server-side, and is testable. Needs a founder call on hosting cost. |
| D-005 | 2026-10-02 | Accepted | P0 before launch: hide email and phone from other members, and make connections mutual-consent. | Audit E9/E10: currently any member can read every profile's email and phone, and a one-sided like opens chat. |
| D-006 | 2026-10-02 | Pending approval | Vendor the required Claude Code skills into `.claude/skills/` (manifest in `SKILLS.md`). | Lets every session reuse them without re-downloading. Installing third-party code requires user approval. |
| D-007 | 2026-10-02 | Accepted | Skills vendored into `.claude/` (supersedes D-006). The arena skill is `zhjai/agent-arena`. | The founder approved the install and the arena choice. |
| D-008 | 2026-10-02 | Accepted | ORBIT runs as a **Node service** that reuses `brivia-club/server` engine plumbing and verifies Supabase JWTs (resolves D-004, option a). | The founder approved the recommendation. |
| D-009 | 2026-10-02 | Accepted | ORBIT's signature mechanism is the **Roche Limit** (receiver-declared capacity, spec §6.4). Constellations (quorum micro-groups) is deferred to an appendix draft for Phase 6. | Arena run `docs/arena/2026-10-02-signature-mechanism.md` scored it 40 vs 25. Constellations has shipped prior art (Timeleft, Pie, 222) and needs liquidity we don't have. Roche Limit is an engine-level factor, buildable now, and its expression is original. |
| D-010 | 2026-10-02 | Accepted | Keep the v1 deep-wine brand. ui-ux-pro-max is used for UX rules, not palette (`docs/UX_SPEC.md`). | The skill's generic palette (orange with Poppins) conflicts with the brand the founder chose. |
| D-011 | 2026-10-02 | Accepted | ORBIT core final-review rulings: R11 (supersedes R9) a Worth-the-Distance card takes its fixed slot or the last deck position, never ahead of local cards; R12 non-finite inputs fall back to safe defaults so a bad row never empties a deck; R13 rare and teach/learn chips cite only an interest both members hold. Spec §5.2, §6.2, §6.3 and §6.4 updated. | Final whole-branch review: chips stated false facts through related interests, one bad row emptied the deck, a short deck put a far card first, and orbits with no message or ISO dates never closed. |
| D-012 | 2026-10-02 | Accepted | One canonical baseline migration, `supabase/migrations/0001_baseline.sql`, with uuid member ids and FKs everywhere, replaces the 11 legacy `supabase/*.sql` files (archived in `supabase/legacy/`). Later migrations are `migrations/NNNN_*.sql`, applied in order (Ruling P6). | The live project is new and empty; the legacy files contradicted each other (text vs uuid ids, an FK PostgreSQL rejects, two message insert policies that cancelled the block rule). |
| D-013 | 2026-10-02 | Accepted | The baseline is **secure by default** (security review, fix round 1): profiles are owner-only with others read through `public_profiles`; clients cannot insert matches; storage select is owner-folder only (no listing, Ruling P9); `brivia_is_blocked_between` answers only the two members involved; the legacy `profile_credentials` password table is gone. | Applying 0001 alone must never expose email/phone, allow one-sided connections, or let anyone enumerate member ids, chat media, or who blocked whom. |
| D-014 | 2026-10-03 | Accepted | Founder asked for an arena critique every iteration. Iteration 1 (`docs/arena/2026-10-03-iteration-1.md`) sets the order: **Iteration 2 (trust)**, then **Iteration 3 (onboarding + location + calibrated gate)**, then **Iteration 4 (ORBIT service live)**. Seeding test data or opening sign-ups is blocked until P0 trust items 1–4 land. | The judge verified that the open directory (B1), member-writable `is_test`/`email` (B5) and unlimited anonymous careers uploads (B4) are live-data risks. It also verified that the gate is uncalibrated (C1) and that the Roche Limit can be pushed to its exposure floor by sybil accounts (C2). |
| D-015 | 2026-10-03 | Accepted | Consent ruling P10: deleting a match also clears that pair's connection requests in both directions (database trigger in `0002_p0_privacy_consent.sql`). The pair can reconnect, but only by fresh mutual consent. | An old "accepted" request row left behind would otherwise re-create a deleted match without either person agreeing again. |
| D-016 | 2026-10-03 | Accepted | Consent ruling P11: if someone requests a person who already requested them, the match completes when the earlier request is still pending, or when the earlier request was declined by the person now requesting (they changed their mind). An "accepted" earlier request never counts. | Both people have then asked for each other, so the connection is mutual. A declined member must be able to change their mind without being locked out, and a stale accepted row must not revive a match. |
| D-017 | 2026-10-03 | Accepted | Consent ruling P12: accepting a request on a blocked pair silently records it as declined. No error is shown and no match is created. | An error would reveal that a block exists. Blocks must stay invisible to the blocked person, and the block always wins over consent. |
| D-018 | 2026-10-03 | Accepted | Consent ruling P13: a like opens the pitch sheet and the request waits for it to resolve. Submitting sends one request with the note. Closing, Escape, tapping the backdrop or moving to the next card sends one request without a note. A note is never dropped and exactly one request is inserted. | The like and the pitch note must travel together in a single request. Sending on like and again on submit would double-insert, and sending early would lose the note. |
| D-019 | 2026-10-03 | Accepted | Request abuse caps and expiry (Iteration 2, Tasks 3/3b; Ruling I8). A sender gets at most 30 requests per 24 h and 100 live unanswered requests. Over a cap, the request is dropped silently (no error, no row, same "Signal sent"). A request that completes a match is never capped. Unaccepted requests (pending or declined) expire after 30 days and are then hidden, cannot be accepted, never complete a match, and are replaced on re-request; Roche load still counts only likes at most 10 days old. Senders see declines as pending (`my_outgoing_requests()`). A block withdraws the blocker's pending and declined requests. Consequence: the P11 change-of-mind window is 30 days from the original request. | Caps limit spam without revealing that a limit exists. Expiring declined rows like pending ones keeps a decline indistinguishable from silence. The block rule stops block → unblock from reviving earlier consent. Spec §6.4 updated. |

## D-020: Private chat media, bucket limits, careers throttle (Iteration 2, Task 4)
- message-attachments is private. Select on its objects: the uploader (own folder) or the sender/recipient of a brivia_messages row whose attachment_path equals the object name. The client stores attachment_path only and renders through createSignedUrl(path, 3600), cached per path per session and refreshed 5 minutes before expiry. Rows with only attachment_url (legacy, no path) show "Attachment unavailable"; external GIF links (kind gif, no path) still use their https URL.
- Every bucket has file_size_limit and allowed_mime_types (photos/covers 5 MB, community posts 10 MB, chat 20 MB, résumés 5 MB).
- career_applications: BEFORE INSERT throttle, more than 3 per lower(email) per 24 h or more than 200 per hour raises a generic error; anon insert stays allowed.
- D-020 amendment (fix round 1): the select policy also requires the object to sit in the message SENDER's folder, and brivia_messages has a CHECK that attachment_path starts with the sender id, so a message cannot claim another member's file. After an unmatch or block, the recipient keeps access to files they already received (their message rows remain). External GIF links auto-load only from the picker's hosts (Ruling I9); other https links are click-to-open. Careers emails are normalised with lower(btrim()).

## D-021: ORBIT service trust boundary (Iteration 2, Task 6; design only, built in Iteration 4)
- Accepted 2026-10-03 (superseded by D-025). Spec `ORBIT_ENGINE.md` §9.1. The ORBIT Node service connects as its own login role `orbit_svc`: never `service_role`, no `BYPASSRLS`, no grant on `profiles` (so never email/phone/`is_test`), no `auth`/`storage` schema access. It reads candidates only through `orbit_candidate_pool` (SECURITY DEFINER, same exclusions as `get_candidates`) and card columns only through `get_candidates` called as the member; it writes impressions only through `log_impressions`, which stamps `viewer_id` from the verified claims.
- Member JWTs are verified locally against the project JWKS (`iss`, `aud = authenticated`, `role = authenticated`, `exp`, alg allowlist ES256/RS256; HS256 and `none` rejected). Moving the project to asymmetric signing keys is a prerequisite for go-live. JWKS unavailable means 503, never an unverified fallback.
- Every query runs in a transaction with `set_config('request.jwt.claims', …, true)` and, for member-scoped reads, `set local role authenticated` (deck and search transactions are read-only), so RLS and the `auth.uid()` helpers apply as that member.
- Location enters only via `set_home_location` (server-side H3 res-7 snap, cell-only `member_orbit`, 3 changes per 24 h). k-anonymity floor: a candidate in a cell with fewer than 5 completed same-world members is shown at the ring-2 band label. `toCard` is the only serializer, enforced by a per-endpoint key-whitelist contract test. Logs carry ids only. Per-viewer rate limits, a `(viewer, cell, day)` deck cache, health and readiness endpoints. Impressions carry propensity, model version and a 5% holdout flag (critic C5).
- Why: arena iteration 1 (B2, B6; judge P1 backlog). Accepted residual risk: `orbit_svc` may `SET ROLE authenticated` with any claims, so a stolen orbit_svc credential can act as any member within member rights. Mitigated by secret storage, network restriction, read-only transactions, a static statement allowlist and session auditing. Also accepted: a token stays valid until `exp` after sign-out.

## D-022: list_members enumeration accepted as interim (Ruling I5)
- Accepted 2026-10-03. `list_members` lets a completed member page through every completed, unblocked, same-world member (newest first, at most 20 per page). This is accepted only until ORBIT serves decks (Iteration 4, rollout phase 3), when `list_members` is retired. A caller who is not a completed profile (Ruling I3) gets nothing from `list_members`, `get_candidates` or `search_members`.
- Why: the v1 deck needs a source before ORBIT exists. Requiring a completed caller, hiding blocked pairs and the other test world, and capping pages removes the worst of finding B1; full enumeration resistance comes from ranked, capped ORBIT decks.

## D-023: list_members keyset parameter `p_after_id` (beyond the plan)
- Accepted 2026-10-03. `list_members(p_limit, p_after, p_after_id)` pages by `(created_at, id)` descending instead of `created_at` alone. This parameter was not in the Iteration 2 plan.
- Why: paging by timestamp alone skips or repeats members who share a `created_at` (bulk seeding creates many). The id tie-breaker makes paging exact. Clients pass the last row's `created_at` and `id`.

## D-024: Test-world isolation scope (Rulings P14 and I6)
- Accepted 2026-10-03. Test members (`is_test = true`, set only by the seed script as DB owner) and real members are disjoint worlds. The isolation covers: profiles (candidate RPCs and search), community posts, connection requests (cross-world inserts refused), messages (cross-world inserts refused, even for a legacy cross-world match), and interactions (client rows require `brivia_same_world`; `log_impressions` skips cross-world targets). ORBIT's pool keeps the same rule (§9.1.1).
- Why: seeded test data must never reach, or be reachable by, a real member, and must be purgeable in one statement without touching real members' data.

## D-025: ORBIT service trust boundary v2 (Ruling I10; SUPERSEDES D-021)
- Accepted 2026-10-03. Spec `ORBIT_ENGINE.md` §9.1 (rewritten). `orbit_svc` is a login role that is never `service_role`, has no `BYPASSRLS`, has **no membership in `authenticated`, never uses `SET ROLE` and never sets `request.jwt.claims`**. It has no table grants. It verifies the member JWT locally (JWKS; `kid` required; ES256/RS256 only; `iss` from config; `aud`/`role` = `authenticated`; `exp`/`nbf`/`iat` checked; keys dropped 10 minutes after leaving the JWKS; JWKS outage means 503). It passes the verified `sub` explicitly as `p_viewer` to narrow SECURITY DEFINER functions granted to it alone: read-only `orbit_viewer`, `orbit_candidate_pool` and `orbit_cards` (card columns only, same exclusion helper as `get_candidates`), plus `log_impressions` as the single append. Member writes (likes, requests, accepts, messages, blocks, profile edits) stay client → Supabase under the member's own JWT. Optional hardening: re-check final cards through PostgREST `get_candidates` with the member's bearer token.
- Also changed from D-021: a 10–15 minute access-token lifetime or a cached `orbit_session_alive` check; k-anonymity counts only completed, same-world, unflagged members older than 14 days, with k = 10 for rings 0–1 and 5 beyond, coarsening up the H3 hierarchy (res-6, then res-5) with 7-night hysteresis; home and travel changes share the 3-per-24 h cap; `set_home_location` is volatile and POST-only, with no parameter logging and a log-grep test. Ranked slots have propensity 1 and the explore card 1/|explore set|, and offline replay uses only the explore lane plus a sha256-salted 5% holdout. Members can no longer read impression rows or model columns, and clients insert only viewer, target and event (`0003_trust_hardening.sql`).
- Blast radius of a stolen orbit_svc credential: public card data (name, photo, city, state), interests, cells and engine state of every member, plus **forged impression rows**. It never reaches email, phone, messages, requests, matches or blocks, and cannot act as any member. The service seeing every member's cell is inherent to ring retrieval.
- Why: the Task 6 red-team review found that D-021's impersonation model (`SET ROLE authenticated` with service-chosen claims) let a compromised or buggy service read email/phone through the member's own profile access and messages, and forge consent (likes, requests, accepts) as any member. Passing `p_viewer` to narrow read-only functions removes all of that.

## D-026: Arena iteration 2 outcome and the honest own-quota ruling (supersedes D-019 in part)
- Accepted 2026-10-03. Record: `docs/arena/2026-10-03-iteration-2.md`. All participants, including the judge, were Claude models, so heterogeneity was reduced.
- **Ruling A1 (honest own quota, silent recipient).**
  - Senders see their own signal quota honestly: "N signals left today", "More at HH:MM" (the reset time is rounded to the hour), and the same for the 100-live-unanswered cap. These come from `my_signal_quota()`.
  - Over a cap, the send fails visibly and does not consume the card.
  - Sends go through one `send_signal(p_to, p_note)` SECURITY DEFINER RPC. It charges every attempt to a sender-only ledger *before* looking at the recipient. Blocked, cross-world, duplicate, declined and saturated targets all return the same "Signal sent" and cost exactly one unit, so the counter can't be used to probe recipient state. This also fixes the RLS error that revealed blocks (J3, D-017).
  - A request that completes a match is never refused, and it still costs one unit.
  - The localStorage 15-swipe limit is removed. Passes are free, and the server quota (default 30 per 24 h, a private config value) is the only signal limit. Worth-the-Distance and long-range signals get their own server counters.
  - **This supersedes D-019 in part:** only its silent drop at the cap and the same "Signal sent" for the sender's own quota. D-019's caps, 30-day expiry, decline masking and block withdrawal stand.
  - Dissent (D-019 / Ruling I8 position): showing the cap lets scripted senders pace at it. Mitigated by the coarse reset time. A counter shown only near the cap was rejected.
- **Iteration 3 scope (P0):** the iteration-2 security fixes (I1, I2, M3–M5, cached password); onboarding (taxonomy, Passion Budget, "Your orbit" through `set_home_location` with an H3 res-7 server snap, k-anonymity counting, a geolocation explainer, and a city-picker fallback; free-text City/State removed); the `send_signal` quota path; and a location-first interim deck, `deck_candidates`, ordered by ring then shared-interest count, returning distance bands and shared-interest chips, never `City, State`, a cell or km. ORBIT formulas are not ported to SQL. R, the gate and the Roche Limit reach members only through the ORBIT service (iteration 4).
- **P1:** the engine fixes, with spec text in the same commit:
  - C3: semantic as a bonus only.
  - C4: rarity shrinkage, and a minimum N for the rare chip.
  - C2 + J1: the liker bar becomes 14 days, completed and unflagged; unproven load is capped at K/2; `effectiveK` counts only trusted likers.
  - C1: a calibration study with per-ring quantile θ, a breadth correction, and golden tests: a 4-interest pair with 2 shared interests is eligible at ring 3, and a 1-interest profile at the rarity floor is not.
  - Also P1: empty states and launch-city scope, seen-card memory with an end-of-deck state, a Sent tab with an expiry notice, and the pitch-template fix.

  No gate or Roche Limit serves a real deck before C1 and C2 land.
- **P2:**
  - C5: the logged below-gate exploration lane, the north-star metric and a power calculation.
  - A7: ranked search and the Long-Range Request flow.
  - IP placeholder marking.
- **Go-live gate for real members** (the full checklist is in the arena record): the security fixes have tests; migrations are applied and the harness is green; the security advisor is clean; only the anon key is in the bundle; no coordinates anywhere; consent and quota tests pass; test-world isolation is verified and the purge rehearsed; auth hardening is done (confirmation, CAPTCHA, rate limits, no cached password); block, report and delete work end to end; the privacy notice and terms are published; backups and PII-scrubbed error tracking are on; and the founder's sign-off is recorded as a DECISIONS entry. A closed beta in one launch city may start at the gate. Open sign-ups also wait for the ORBIT service.
- Why: the judge confirmed C1, C2 (8 clones evict a K=2 member, and the anti-gaming rule cuts K from 5 to 3), C3, C4, C5, A1 and A2–A6 against the code. A silent cap lies to the most engaged members while the client already shows a limit (`app.js:367,820`). Recipient-state privacy is what needs protecting, and uniform charging protects it.

## D-027: Iteration 2 final-review fixes (Ruling I11)
- **Decision:** before the iteration-2 apply, close the final review's I1, I2, M3, M4, M5 and the cached plaintext password:
  - `created_at` on `profiles`, `community_posts` and `brivia_messages` is set to `now()` by a BEFORE INSERT trigger for every non-owner session; `career_applications.created_at` is always `now()` (stamped in the throttle trigger, so a backdated application still counts). A member can change only a post's caption (BEFORE UPDATE keeps id, author, image and `created_at`). The client no longer sends `created_at` for a profile.
  - `photo_url`, `cover_url` and post `image_url` must match `/storage/v1/object/public/<bucket>/<owner uid>/<file>` (CHECK; the host is not hard-coded) or, for covers, a bundled preset path. Non-conforming profile values are cleared at apply time; the post constraint is NOT VALID (legacy posts are kept, new and edited posts are checked). The client renders member images only from the `VITE_SUPABASE_URL` origin (or same-site assets / local previews); anything else shows initials or a placeholder. OAuth avatar URLs are no longer stored.
  - 0001 no longer resets bucket visibility on conflict for `message-attachments` (0003 owns it); any re-run of 0001 or 0002 must be followed by 0003.
  - Posts are visible to others only when the author is a completed profile.
  - Blocking inserts (no upsert, which needs an update policy) and treats 23505 as already blocked.
  - No password is ever stored or shown client-side: the profile.html password row is removed and stale `loginPassword` / `password` / `passwordConfirm` keys are scrubbed from cached profiles on load.
- **Why:** each was a member-controlled input that other members' browsers trusted (feed order, auto-loading images) or a credential at rest in localStorage. Cost: members with an external avatar or cover show initials / the default cover until they upload again.

## D-028: Snap location to a coarse cell in SQL without h3-pg (equal-area grid `grid1`)
- Accepted 2026-10-03 (Iteration 3, Task 1). Arena-style comparison recorded in
  `docs/superpowers/plans/2026-10-03-iteration-3-orbit-onboarding.md` ("Decision: snapping to a coarse cell").
- **What was checked:** the live project (Postgres 17) offers no `h3` or `h3_postgis` extension (it offers `postgis`
  3.3.7, `earthdistance` and `cube`, none installed). The local harness (PostgreSQL 16) has `cube` and
  `earthdistance`, no PostGIS and no h3. Assumption: h3-pg stays unavailable for this iteration.
- **Options and scores (/30; privacy, harness-testable, effort/risk, IP hygiene, H3 fit for iteration 4, ops surface):**
  - A. Port H3 `latLngToCell` to PL/pgSQL: 5, 5, 1, 2, 5, 5 = **23**.
  - **B. Equal-area lat/lng grid in SQL, scheme-tagged ids, centroid-defined hierarchy, one-time remap to H3: 5, 5, 5, 5, 3, 5 = 28.**
  - C. Supabase Edge Function with `npm:h3-js` calling a definer `store_home_cell`: 3, 1, 3, 5, 5, 2 = **19**.
  - D. h3-js in the client: rejected (a new client dependency, and the client would pick its own cell).
  - E. Wait for ORBIT `POST /v1/location` (iteration 4): rejected (blocks P0 onboarding).
  - F. PostGIS `ST_HexagonGrid` in Web Mercator: 5, 1, 3, 5, 2, 3 = **19**.
- **Ruling: B.** Privacy equals H3 (a g7 cell is ~2.32 km × 2.32 km, ~5.4 km², against H3 r7's 5.16 km² average); it is
  fully testable locally; it adds no extension, no service and no third-party code; ORBIT does not consume cells
  until iteration 4.
- **Grid (normative, spec §4.1):** `n_L` rows per degree = 48 (g7), 16 (g6), 16/3 (g5);
  `row = least(floor((lat + 90)·n_L), 180·n_L − 1)`, `φc = −90 + (row + 0.5)/n_L`,
  `ncols = greatest(1, floor(360·n_L·cos(radians(φc))))`, `col = floor((lng + 180)/360·ncols) mod ncols`,
  id `g<L>:<row>:<col>`, centroid `(φc, −180 + (col + 0.5)·360/ncols)`. A parent is the snap of the child's centroid
  at the coarser level (approximately nested, like H3). Distance is haversine between centroids (R = 6371.0088 km);
  rings 3/15/60/350/2500 km. Invalid input raises `22023 invalid location` with no value in the message. The grid
  helpers are internal (no client execute). `place` holds public city centroids; clients get its names only.
- **Migration path:** `member_orbit.cell_scheme = 'grid1'` now; in iteration 4 the ORBIT service backfills
  `h3 = latLngToCell(gridCentroid(home_cell), 7)` once through `orbit_store_home_cell` and sets `'h3r7'` (displacement
  ≤ ~1.64 km, below the ring-0 radius). If h3-pg appears, `set_home_location` switches to `h3_lat_lng_to_cell` with the
  same signature and the backfill runs in SQL. `orbit/src/rings.js` gains a scheme adapter in iteration 4.
- **Dissent preserved (A):** exact H3 from day one. Rejected because a hand port of H3's face/IJK code is the
  iteration's largest correctness risk, and it would put third-party algorithm code inside the repository we intend to
  register for copyright (`IP_NOTES.md`).
- Supersedes, in part, the "H3 res-7 server snap" wording of D-021 and D-026 (and the H3 coarsening levels of D-025): until H3 is available the snap and the coarsening levels are `grid1` g7/g6/g5.

## D-029: Sensitive interests are private by default
- Accepted 2026-10-03 (Iteration 3, fix round 1 for Tasks 1–3; controller ruling on review finding I1).
- **Decision:** `interest_node.sensitive` marks special-category topics: health and mental health, religion and
  spirituality, sexual orientation and gender identity, and sobriety or addiction recovery (and political affiliation,
  if such a node is ever added). A member can still pick them, and they count toward resonance like any other interest
  (they are stored in `member_interest`). But they are never shown to other members:
  - `set_member_interests` leaves them out of the `profiles.skills` display copy, so `search_members`, `get_candidates`
    and `list_members` never show or match them;
  - ORBIT never puts them on cards, in chips, in explanations or in search (spec §3.1, §9.1.5).
  - The owner still sees them through `my_interests()`.
- The seed marks 13 nodes: Health habits, Nutrition, Better sleep, Mental-health peer support, Sober socialising,
  Healthy ageing, Spirituality, Pilgrimages, Kirtan and chanting, Scripture study, Interfaith dialogue, Devotional
  singing, and LGBTQ+ community.
- **Why:** these are special-category data under GDPR-style rules (GDPR Art. 9: health, religious or philosophical
  beliefs, sex life or sexual orientation, political opinions), which India's DPDP Act 2023 also treats as personal data
  that needs care. Publishing them on a profile that every completed member can search would disclose them to people
  the member never chose, and could out someone or expose them to discrimination. Keeping them private, while still
  counting them for matching, means consent covers only the use the member expects: being matched on what they care
  about.
- **Alternative rejected:** dropping these nodes from the taxonomy. That is simpler and leaks nothing, but members
  would lose matching on things they genuinely care about (faith communities, recovery and peer support, queer
  community), which goes against the north star (mutual interests drive a match).
- **Not marked (judgement calls):** Sufi and qawwali (a music genre), Mythology and epics (literature), Women's circles
  (gender is already a profile field), Public policy and Climate action (topics, not party affiliation), and the yoga
  and meditation nodes (practices, not health conditions). A moderator can mark more nodes, but the next migration
  re-run resets the flag from the seed list, so add them to the list in `0004` as well.

## D-030: Completion means a name, a spent Passion Budget and a cell
- Accepted 2026-10-03 (Iteration 3, Task 4; plan open choice 2).
- **Decision:** a member is completed when they have a name (trimmed, not empty, not 'New Member'), 1–12 interests
  whose points sum to exactly 20 (`member_interest`), and a home cell (`member_orbit`). The legacy `city` column is no
  longer part of it. `brivia_member_completed(id)` is the single definition and `brivia_visible_to(viewer, target)` the
  single member-facing visibility rule (both completed, different, same world, no block either way). `get_candidates`,
  `search_members`, `list_members` and `brivia_can_see_author` are rebuilt on them in `0004` with unchanged contracts.
  `my_onboarding_status()` shows the caller their own progress (counts, `has_cell`, place name, `completed`).
- **Why:** ORBIT matches on interests weighted by the Passion Budget and ranks by ring from the home cell. A member
  without both cannot be matched or placed, so showing them (or showing others to them) would put people in the deck
  that the engine cannot reason about. Completion reads only server-written tables, never `profiles.skills`, which a
  client can write.
- **Consequences:** new sign-ups stop writing `city`/`state` (client change later in this iteration), but the columns and grants stay, and `search_members`
  still matches legacy city text. Members who completed under the old rule become invisible until they pick
  interests and a location. The iteration 0–2 harness suites keep their meaning through a harness-only fixture
  (`supabase/tests/harness-autocomplete.sql`, never a migration); the seed gives each test member 3–5 non-sensitive
  interests and a cell.
- **Alternative rejected:** keeping city as an alternative to a cell. It would let a member with no cell into decks
  where ring ordering is undefined, and it keeps a free-text, client-written column in a visibility rule.

## D-031: k-anonymity density table and the interim flag source
- Accepted 2026-10-03 (Iteration 3, Task 5 and its fix round 1).
- **Decision:**
  - "Flagged (reported or restricted)" in the k-anonymity count means a row in the owner-only
    `member_flag(member_id, reason, flagged_at)` table (RLS on, no client grants) until moderation tooling exists.
  - Populations live in the owner-only `cell_density(cell, is_test, n, streak10, streak5, ok10, ok5, as_of)` table.
    It replaces the spec's earlier `cell_density(cell, res, is_test, n, met_since)` design: the level is in the
    scheme-tagged cell id (g7/g6/g5), and per-k streak columns replace `met_since`, so k = 10 and k = 5 each have their
    own hysteresis.
  - `refresh_cell_density(p_as_of)` (owner only, nightly) counts by the stored `home_cell`, `home_cell_g6` and
    `home_cell_g5`. `streakK` carries over only from the night before; a gap of more than one day restarts it at 1
    (or 0 below k), so "7 consecutive nightly counts" means 7 actual consecutive nights. `okK = streakK ≥ 7`; it drops
    at the first count below k. A global watermark makes a same-day or older re-run a no-op; rows with `n = 0` and no
    streak are deleted.
- **Why:** the conservative reset means that a missed cron run can only delay un-coarsening, never shorten it. The
  watermark stops a second same-day run from inserting rows for cells whose population changed since the nightly
  count. Without it, those rows would start a fresh streak out of step with the rest.
- **Alternative rejected:** counting refreshes instead of nights (a missed night keeps the streak). It is simpler, but
  a stalled cron followed by a burst of catch-up runs could un-coarsen a cell sooner than 7 real nights.

## D-032: `send_signal`, the sender-only ledger and the honest own quota (Ruling A1)
- Accepted 2026-10-03 (Iteration 3, Task 6). Implements D-026 Ruling A1; supersedes the iteration-2 silent cap
  (D-019 in part, as D-026 already ruled).
- **Decision:**
  - Members send requests only through `send_signal(p_to, p_note)` (SECURITY DEFINER, volatile). Raw client inserts
    into `connection_requests` are revoked and the member insert policy is dropped. The before-insert trigger keeps
    the pair lock and the expired-row replacement but no longer applies caps.
  - Every send that passes the caller checks is charged one row in the sender-only `signal_ledger` (RLS on, no client
    grants, `to_id` without a foreign key) **before** the recipient is looked at. Blocked (either direction),
    cross-world, duplicate, declined, not-completed and unknown targets all answer `sent` and cost one unit. Only a
    `brivia_visible_to` target gets a request row. `send_signal` writes no `interaction` row.
  - The sender's own caps (30 per rolling 24 h, 100 live unanswered within 30 days; private `brivia_config` values)
    fail visibly with `PT429 signal_quota_exhausted` / `signal_live_cap` and are not charged. A send that completes a
    match is never refused and still costs one unit. `my_signal_quota()` returns `daily_limit`, `remaining`,
    `resets_at` (rounded up to the hour), `live_unanswered` and `live_limit`.
  - Live unanswered is counted from the ledger (distinct targets in 30 days without a match), not from
    `connection_requests`, which would differ for blocked or cross-world targets and turn the counter into a probe.
    It counts every ledger kind; the daily counter counts kind `signal` only (`long_range` and `wtd` get their own
    counters, spec §7).
  - Completion gates every consent path: `brivia_has_completed_profile()` (same signature, used by the request,
    message, match and post policies) now means `brivia_member_completed(auth.uid())` (D-030), and
    `respond_connection_request` refuses a caller who is not completed with `22023 'complete your profile'`.
- **Why:** uniform charging hides recipient state completely while the sender's own budget is shown honestly
  (arena record `docs/arena/2026-10-03-iteration-2.md`, Ruling A1). Gating consent on the new completion closes the
  path where a member without interests or a cell could still request, accept or message.
- **Consequences:** the client must switch to `send_signal` / `my_signal_quota()` (Task 9); until then a raw insert
  from the old client fails. Members who completed under the legacy rule cannot message or accept until they finish
  onboarding. The older harness suites send through `send_signal`; their "silent cap" and `23505` re-request
  assertions now expect the honest error and a uniform `sent`. The purge script deletes `signal_ledger` rows in both
  directions, because `to_id` has no foreign key.
- **Alternatives rejected:** counting the live cap from `connection_requests` (a probe, see above); returning a
  distinct status for a duplicate (it would reveal a decline, since a live declined request reads as pending);
  charging after the recipient lookup (the charge would differ by recipient state).
- **Fix round 1 (2026-10-04):** `matched` reflects any match row the sender can read, independent of visibility (no
  block or completion leak); requests from senders who are no longer completed are hidden and unanswerable; the
  completion-gated policies evaluate once per statement; `purge_expired_requests()` prunes ledger rows older than
  30 days; out-of-range config values fall back to the defaults.

## D-033: The interim deck orders by ring, then shared interests, with k-anonymous bands
- Accepted 2026-10-04 (Iteration 3, Task 7; plan entry "D-030", renumbered to the next free number). Implements
  arena P0-4 (`docs/arena/2026-10-03-iteration-2.md`).
- **Decision:**
  - `deck_candidates(p_limit default 12)` (SECURITY DEFINER, stable, `authenticated` only) replaces the newest-first
    `list_members` deck. Pool: `brivia_visible_to` targets in true rings 0–2. It hides matched members, members
    signalled in the last 30 days (the caller's `signal_ledger`, plus any live outgoing request), and members passed
    in the last 7 days. Order: true ring, then the shared-interest count, then `md5(caller || target)`.
  - Each card returns exactly `id, name, photo_url, cover_url, experience, skills, looking_for, distance_band,
    shared_interests`. No cell, km, ring, City, State, coordinate, email or phone.
  - `distance_band` follows the §9.1.4 k-anonymity floors through `brivia_cell_ok` on the stored g7/g6/g5 cells. It
    falls back g7 → g6 → g5 → place, and below g7 the display ring is at least 2 (the place name), so `~3 km` and
    `~10 km` appear only when the target's own g7 cell meets k.
  - Shared interests count and label only active, non-sensitive nodes. Sensitive interests (D-029) and retired
    nodes (including the harness fixture `zz.harness.any`) are excluded from the labels **and** from the ordering
    count (controller ruling: the brief did not ask for sensitive interests to affect order).
  - `deck_status()` returns `complete_profile`, `no_members_yet` or `caught_up` for the empty state, never a count.
- **Why:** location first, interests second, is the product's core promise (VISION rules 1–2). A ring-0 member with no
  shared interest outranks a ring-2 member with three. Excluding sensitive interests from the count matters as much
  as hiding their labels: a card ranked above its visible chips would let a member infer a hidden shared topic.
- **Consequences:** the order still reveals relative proximity among cards whose bands are coarsened (a ring-0 card
  comes before a ring-2 card even when both say the place name). That is inherent to a location-first deck and
  is accepted until ORBIT's §6.2 composition. The pool scan is linear in members (with a cheap latitude prefilter);
  ORBIT's candidate generation replaces it in phase 3. Passing a card needs only the existing `interaction` insert
  (`event = 'pass'`). Task 10 switches the client deck to `deck_candidates` / `deck_status`.
- **Alternatives rejected:** porting `R` and the Escape-Velocity gate to SQL (arena ruling: one engine, in ORBIT);
  counting sensitive interests for order only (a positional leak, see above); returning the ring or km for the
  client to band (a probe of what k-anonymity hides).

## D-034: Deck order uses the k-safe display ring (supersedes D-033 in part)
- Accepted 2026-10-04 (Iteration 3, Task 7 fix round 1; controller ruling I1, privacy over precision). It replaces
  only D-033's ordering key: `deck_candidates` now orders by the display ring, the ring the card's `distance_band`
  shows, instead of the true ring. The rest of D-033 stands.
- **Decision:** the band (and so the display ring) is computed for the whole pool **before** the limit. The order
  is display ring ascending, then shared count descending, then `md5(caller || target)`. A true ring-0 member in a
  sparse cell, whose band is coarsened to the place name, sorts with the other place-name cards. It never comes
  ahead of `~3 km` cards, and it comes behind a ring-2 place-name card with more shared interests. Its position
  does not change as its true ring moves from 0 to 2.
- **Why (the triangulation attack):** under D-033 a coarsened card's position still told its true ring. A member
  could walk the pool by passing cards (each pass hides one for 7 days, revealing the next) and note where a target
  lands relative to the `~3 km` / place-name boundary. Combined with 3 home moves a day (§9.1.4), each from a
  different cell, the ring-0 / ring-1 / ring-2 boundaries from several vantage points intersect to a small area. That
  recovers what the k-anonymity floor exists to hide, for exactly the sparse cells it protects.
- **Cost:** in sparse areas (no cell meeting k), location-first ordering degrades to shared-count order within the
  place band: a ring-0 neighbour with no shared interest no longer outranks a ring-2 member with three. The P0-4
  acceptance order (ring 0 with 0 shared before ring 2 with 3 shared) still holds wherever the ring-0 band is
  `~3 km`, which the test asserts. Dense launch cells are unaffected.
- **Open:** this goes to the iteration-3 arena for challenge (for example, ordering by true ring only within a band
  that already shows `~3 km` / `~10 km`, or adding noise instead of coarsening the order).
- **Alternatives rejected:** keeping the true-ring order (the triangulation above); ordering by true ring only before
  the limit, then by display ring (the limit would still select by true ring, which is the same leak).

## D-035: `profiles.skills` is server-owned; the signup client never persists coordinates
- Accepted 2026-10-04 (Iteration 3, Task 8; controller rulings on skills ownership, sensitive interests and coordinates).
- **Decision (skills):** 0004 replaces the 0003 `update` column grant on `profiles` with the same editable columns minus
  `skills`. The client no longer sends `skills` (`profileToRow`, signup, profile editor); the editor shows it read-only.
  `set_member_interests` is its only writer. Insert is unchanged: a `skills` value sent with a first insert is
  overwritten by `set_member_interests`, which completion (D-030) requires before anyone can see the member, so it can
  never reach another member. A harness test asserts that a client update of `skills` fails and that the client's
  profile save still works.
- **Decision (client capture):** coordinates live in one in-memory variable from the geolocation callback until
  `set_home_location` succeeds, then are dropped. They are never written to `localStorage` / `sessionStorage`, a URL,
  the DOM, a log or auth metadata. Geolocation is requested only on "Use my location", after the privacy explainer;
  any failure opens "Pick my city". A signup waiting for email confirmation stores only `{ kind: 'city', placeId }` or
  `{ kind: 'geo' }`; a geo choice is asked for again after login. Auth metadata no longer carries `skills`, `city` or
  `state`.
- **Decision (gate):** `my_onboarding_status().completed = false` routes a member from auth or the app to the
  completion flow at the first incomplete step (2 without a cell, else 3). Only an explicit `false` redirects; an
  unreadable status lets the app load, because the server already hides incomplete members (D-030).
- **Why:** a client-writable `skills` let a member publish a label outside their Passion Budget, including a sensitive
  one (D-029). Persisting coordinates anywhere in the browser would outlive the coarse cell that is the whole point of
  §9.1.4.
- **Cost:** members can no longer free-type skills; they change them through their interests. A member who signed up
  with "Use my location" and confirmed by email is asked for their area once more.
- **Alternatives rejected:** also revoking `insert (skills)` (it would break the existing client-insert `is_test`
  guard test for no privacy gain, since the value is overwritten before visibility); keeping coordinates in
  `sessionStorage` across the email round trip (a stored coordinate, against CLAUDE.md).

## D-036: Free-text city/state are private (supersedes D-030 in part)
- Accepted 2026-10-04 (Iteration 3 final whole-branch review, item I-1; with the I-2/I-3/I-4 runbook and Minors 1, 2, 6).
- **Decision:** the legacy `profiles.city` / `profiles.state` free text never leaves the member's own row.
  - `0004` redefines `get_candidates`, `search_members` and `list_members` to return `city` and `state` as `null::text`.
    The `public_profile_card` type and the signatures are unchanged.
  - `search_members` no longer matches city text (D-030 had kept that match).
  - The `update` column grant on `profiles` drops `city` and `state`. A client update of either fails.
  - The profile editor has no City/State inputs. It shows the member's area (`my_onboarding_status().place_label`)
    read-only, with "Change your area: coming soon". Changing the area from the profile is out of scope for this iteration.
  - The profile page labels email and phone as private. It no longer says "visible to members".
- **Why:** after D-030 the area is the coarse cell and other members see only `distance_band`. The free text a member
  once typed (it can be a street or a neighbourhood) still went to every viewer through the card RPCs, and it was
  searchable. The client dropped it on display, but the server still sent it, and the location-privacy rule in
  CLAUDE.md is about what the server sends.
- **Also in this round:**
  - `0004` gains `brivia_schedule_nightly_jobs()` (owner only). When pg_cron is installed, it schedules
    `refresh_cell_density()` and `purge_expired_requests()` nightly. It unschedules each job by name first, so a
    re-run never duplicates a job.
  - `supabase/migrations/README.md` is the apply-and-deploy runbook. It covers enabling pg_cron first, the log
    settings check (`log_parameter_max_length` must be 0 whenever statement logging is on, recorded in the go-live
    entry), and the deploy order: migrations and client in one window, members told to redo onboarding, then the
    seed, then the advisors.
  - After an email confirmation, a pending city that `set_home_city` applied is dropped from the stored pending
    profile at once. A later login therefore never spends another of the 3 daily location changes.
  - Search results that join the deck skip members you are already matched with, and cards you already swiped.
  - The band list in spec §4.1 now matches the shipped set.
- **Cost:** members cannot edit City/State, and their old text is now dead data. Search by city is gone until ORBIT
  search (§7) adds place-aware search on the cell.
- **Alternatives rejected:**
  - Dropping the columns. This would change the composite type and break the 0003 contract tests and older rows for
    no privacy gain, since nothing reads them now.
  - Returning the place name of the target's cell in the card RPCs. That is a new location surface, and it would
    bypass the k-anonymity coarsening that `deck_candidates` applies (§9.1.4).

## D-037: Iteration 3 delivered (ORBIT onboarding, honest signals, location-first deck)

- **Date:** 2026-10-04. **Branch:** `claude/jolly-edison-49xvza`. **Migration set:** `0001`–`0004`; `0004_orbit_onboarding.sql` is new.
- **Delivered:**
  - a server-side `grid1` cell (D-028);
  - the interest taxonomy and Passion Budget, with sensitive interests private (D-029);
  - completion that requires interests, all 20 points and a cell (D-030);
  - k-anonymity density (D-031);
  - `send_signal` with the honest own quota (D-032);
  - the interim deck `deck_candidates`, ordered by the k-safe display ring (D-033, D-034);
  - server-owned skills and no client-side coordinates (D-035);
  - private free-text city and state (D-036);
  - client: the 4-step signup, the quota counter, deck cards with bands and "You both" chips, and empty states.
- **Verified locally at delivery:** SQL harness ALL PASSED (coordinate log grep clean). ORBIT 86/86. Unit 42/42. e2e: consent 99/99, deck 57/57, onboarding 121/121. Build OK. `dist/` has no `service_role` or legacy swipe-limit keys; the only `latitude`/`longitude` are the geolocation reads.
- **Not yet done:** applying to the live project. The Supabase connector's `apply_migration` was refused, so the founder must allow it or run the SQL editor (runbook `supabase/migrations/README.md`).
- **Go-live gate:** test members only is ready once applied. A closed beta still waits on gate items 7–11 of the iteration-2 arena record: auth hardening, account deletion end to end, legal notice, operations, and founder sign-off.
- **Carried to the iteration-3 arena:**
  - ring-2 place labels in metro clusters;
  - residual probe surfaces (`brivia_can_see_author`, `brivia_request_sender_completed`, the interaction-insert world oracle, `get_candidates`, `my_outgoing_requests`);
  - `deck_status` in a tiny world;
  - the D-034 trade-off.

## D-038: Iteration-3 arena outcome: deck membership follows the band, interest-then-ring order, amend 0004 before the first apply
- Accepted 2026-10-04 (iteration-3 arena judge; record `docs/arena/2026-10-03-iteration-3.md`). Every participant
  was a Claude model, so heterogeneity was reduced (disclosed in the record). Supersedes D-033/D-034 in part (pool and
  order), D-029 in part (the sensitive list and completion), and the spec's "true ring is used for the pool"
  (`ORBIT_ENGINE.md` §9.1.5).
- **Evidence:** the judge reproduced all three Criticals locally.
  - **B-F1:** `deck_candidates` admits a target on the true g7 ring ≤ 2. With free `pass` isolation and 3 moves a
    day per sybil, the 60 km pool edge was pinned to about 1.5 km while the card said only "Pune".
  - **A-F2:** 12 "Pick my city" members share one centroid cell, which reaches `ok10` and shows them to each other
    as "~3 km".
  - **C-1:** `orbit/src/rings.js` returns 0 km for any two `grid1` ids, or for garbage.
- **Decision (pool membership):** a target's membership and position may depend only on what its card shows and on
  the viewer's own state.
  - A *fine* target (both members `precision = 'cell'`, target g7 cell `ok10`) is admitted at ≤ 15 km on g7 and
    banded `~3 km` / `~10 km`.
  - Every other admission uses the place rule: place centroids within 60 km, band = place name, region or "Abroad".
  - Nobody is admitted on the true g7 ring 2 any more.
  - `like` and `pass` rows are accepted only for targets served in the last 7 days, otherwise silently ignored.
  - A harness test replays the probe.
- **Decision (order):**
  1. at least one shared non-sensitive exact interest, first;
  2. display ring (0, 1, place tier);
  3. budget-bounded overlap `Σ min(p_v, p_t)/20`;
  4. a daily rotating tie key `md5(caller || target || current_date)`.

  `deck_candidates` becomes volatile and writes owner-only `impression` rows (`policy = 'interim-v1'`).
- **Decision (other rulings):**
  - City-picked members get `member_orbit.precision = 'place'`: excluded from g7/g6 density, always place-banded.
  - Sensitive set:
    - nutrition, sleep and healthy ageing become public;
    - Sufi/qawwali, Indian Sign Language, Women's circles and Women travelling solo become sensitive;
    - completion needs at least one non-sensitive interest;
    - sensitive interests need a separate, withdrawable consent;
    - interest rewrites are capped at 3 per 24 h;
    - ORBIT keeps sensitive hits out of R, the gate, the order and the chips (spec §9.1.5 amended with that work).
  - `list_members` is revoked from `authenticated`, and card RPCs return `gender` as null.
  - `my_outgoing_requests` keeps blocked pairs as pending until natural expiry.
  - The rolling 24 h quota stays, with copy that says so.
- **Decision (migrations):** nothing is live, so the P0-A SQL changes amend `0004` before its first apply. The
  founder should not run 0004 on the live project until the amendment lands.
  - From now on, a migration file applied to the live project is frozen; later changes go in a new numbered file.
  - If 0004 is applied first anyway (test members only is safe), the same items ship as `0005` with the same
    acceptance criteria.
- **Why:**
  - Membership on the true ring was an oracle that D-034's ordering fix did not reach.
  - Interest qualifies a person and location orders the qualified (CLAUDE.md rules 1–2). The exact-count key rewarded
    spreading points thinly and gave C1 no usable data.
  - A city pick is not a neighbourhood, so showing it as one was false precision.
- **Go-live gate:** item 4 (location privacy) is reopened. New items:
  - harvest closure and the completion floor;
  - the UX honesty fixes;
  - an 18+ gate, separate sensitive consent and a retention schedule (under item 9);
  - a report path (under item 8).

  The grid1 adapter and the sensitive firewall block any ORBIT wiring. C1–C4, J1 and a 2-week shadow run block ORBIT
  serving. None of these blocks the closed beta while the interim deck serves.
- **Dissent preserved:**
  - Location-first purists would put the display ring ahead of shared interest. That is open for the founder: the swap
    is privacy-neutral.
  - B's 24 h settling delay and 50 % public-share rule were not adopted.
  - C would keep Sufi/qawwali public.
  - A wanted the launch-city cold-start flow ahead of engine work. It is P1, run in parallel.

## D-039: P0-A implementation of D-038 (0004 amended in place): where it differs from or adds to D-038
- **Date:** 2026-10-04. **Branch:** `claude/jolly-edison-49xvza`. **Migration set:** `0001`–`0003` are applied live
  and frozen; every change is in `0004_orbit_onboarding.sql`, still unapplied, amended in place and idempotent.
  Report: `.superpowers/sdd/2026-10-03-iteration-3-orbit-onboarding/p0a-report.md`.
- **As D-038, no deviation:** coarse pool membership (fine ≤ 15 km at `ok10` between two `cell`-precision members,
  else place centroids ≤ 60 km); the interest-first order with budget-bounded overlap and a daily tie key; volatile
  `deck_candidates` / `search_members` with `interim-v1` impressions; served-id like/pass; `precision`; harvest
  closure; the sensitive set, consent, completion floor and rewrite cap; R6; the hygiene list.
- **Deviations and additions (implementation choices, none changes a D-038 rule):**
  1. **`get_candidates` does not count as serving.** D-038 listed deck, search or `get_candidates`. No client sends a
     like or pass from `get_candidates` surfaces (chats, request senders, post authors), and counting it would let any
     known id be "served" for free, so only `deck_candidates` and `search_members` write impressions. Stricter.
  2. **The served check applies to a member's own rows only** (`viewer_id = auth.uid()`). A row for another viewer
     still fails at the insert policy, and owner or service rows are untouched. An unserved like/pass for a
     cross-world member is also silently ignored (it used to raise), so the answer says nothing about the world.
  3. **The g6 / g5 band levels are gone from the interim deck.** Every non-fine card is banded by its place name (or
     "Abroad"); the region label cannot occur under the 60 km place rule. J2 had already shown the levels did not
     change any label.
  4. **Withdrawal does not redistribute points.** `set_sensitive_consent(false)` deletes the sensitive rows, so the
     member is below 20 points and not completed until they re-spend them. Moving points without the member was
     rejected.
  5. **A rewrite is a call by a member who is completed before it.** The first save, and a re-save after falling
     below completion (for example after withdrawal), are free; the ledger is `interest_rewrite`.
  6. **`sensitive_consent_at` is guarded on insert by a trigger.** `authenticated` holds table-wide insert on
     `profiles` (Supabase default privileges), so a client insert has the column nulled; it has no update grant.
  7. **Advisor findings, beyond the two named helpers:** both `brivia_is_blocked_between` overloads are revoked from
     every client role too (they answered "has this member blocked me?" for any member: B-F5). Policies use pinned
     wrappers (`brivia_can_message`, `brivia_incoming_request_visible`, `brivia_interaction_insert_ok`);
     `brivia_request_sender_completed` is now owner-only. `brivia_can_see_author` stays until `community_feed()` (P1).
  8. **`is_anonymous` is read from `auth.users`**, not from the JWT, because completion is evaluated for other members.
  9. **Client changes forced by the SQL (each with an e2e check):** search sends nothing under 2 non-space characters
     and the field says "2+ letters"; another member's gender is never rendered; a consent-refused interest save shows
     "Private interests need a separate consent, which is coming soon. Remove the ones marked Private to continue."
     The consent step itself is P0-B.
- **Open:** impression rows have no retention purge yet (they grow with every deck and search call); the P0-B
  retention schedule should set one. The `my_onboarding_status` "(city-wide)" state for `place` members is P0-B.

## D-040: Launch is 18+ only; a separate student world comes later (founder decision)

- **Date:** 2026-10-04. **Decided by:** the founder, choosing between options the controller set out.
- **Decision:** the first launch is adults only (18+). The 18+ gate stays a P0-B item before real members.
- **Planned later:** a separate student world, as its own iteration with its own arena review. It has these properties:
  - Ages 13–17 only.
  - Parental or guardian approval by email before the account becomes visible.
  - Students see, search, request and message only other students within about ±2 years of their age.
  - Adults can never find students, and students can never find adults. This works like the test world (P14).
  - City-level location only.
  - No taste learning and no behavioural profiling.
  - No targeted advertising.
- **Why:**
  - DPDP Act 2023 s.9 requires verifiable parental consent for anyone under 18.
  - It also forbids tracking and behavioural monitoring of children and targeted advertising at them.
  - A location-first feed that tells strangers "similar interests, ~3 km away" is a grooming risk when adults and children are mixed.
- **Alternatives rejected:**
  - Students in a restricted mode alongside adults: much riskier and hard to enforce.
  - School invite codes as the only route: stronger verification, but kept as a fallback.
- **Open:** a lawyer must confirm whether email approval meets "verifiable" parental consent under the DPDP Rules. If it does not, use school or teacher invite codes.

## D-041: Interest-rewrite cap counts every save after the first (corrects D-039 item 5)
- **Date:** 2026-10-05 (P0-A fix round 1, pre-apply review of `0004`).
- **Correction:** D-039 item 5 counted a rewrite only when the member was completed before the call. That let a member
  reset the cap by dropping below completion (a 'New Member' name, or a `set_sensitive_consent(false/true)` cycle).
  Now every `set_member_interests` call by a member who already has `member_interest` rows counts, completed or not;
  only the very first save is free. 3 per rolling 24 h, the 4th raises `PT429`. Harness: `orbit-sensitive.test.sql` §7.
- **Same round (no rule change):** impressions are deduped to one per (viewer, target, surface, UTC day) and purged
  after 30 days; the policy wrappers moved to the non-exposed schema `brivia_private`; the deck's overlap key is
  bucketed into 4 levels; sensitive interests are hidden in the signup picker until the consent step (P0-B).

## D-042: Migration 0004 applied to live (verified read-only)
- **Date:** 2026-10-05. **Applied by:** the founder, in the Supabase SQL editor, from commit `c42e805`
  (`0004_orbit_onboarding.sql`). `0004` is now **frozen**; later SQL goes in `0005+`.
- **Verified by Claude through the Supabase connector (read-only selects and advisors only):**
  - 432 taxonomy nodes, 14 of them sensitive.
  - Both pg_cron jobs exist: `brivia-refresh-cell-density 17 20 * * *` and `brivia-purge-expired-requests 37 20 * * *`.
  - The `brivia_private` schema exists. `authenticated` has usage on it; `anon` does not.
  - `interaction_impression_daily_idx` exists.
  - `list_members` and `refresh_cell_density` cannot be executed by `anon` or `authenticated`.
    `deck_candidates` can be executed by `authenticated` only.
  - 0 profiles, so no real accounts exist yet and the seed has not been run.
- **Log settings (runbook step 2):**

  | Setting | Value |
  |---|---|
  | `log_statement` | `ddl` |
  | `log_min_duration_statement` | `-1` |
  | `log_parameter_max_length` | `-1` |

  Statement logging covers DDL only, and `set_home_location` calls are not DDL, so coordinates do not reach the log.
  If `log_statement` is ever raised to `mod`/`all`, or a duration threshold is set, `log_parameter_max_length` must
  be set to `0` first.
- **Security advisor:** the 16 WARN are exactly the intended member RPCs listed in `supabase/migrations/README.md`.
  The 8 INFO "RLS enabled, no policy" are the deny-all internal tables, which are reached only through definer RPCs:
  `brivia_config`, `cell_density`, `interest_rewrite`, `location_change`, `member_flag`, `member_interest`,
  `member_orbit` and `signal_ledger`. The 0003-era findings (mutable `search_path` on `brivia_guard_is_test`, and the
  `brivia_same_world`/`brivia_interaction_allowed` oracles) are gone.
- **Performance advisor:** none of these block a closed beta. They are queued for `0005` (P1 hygiene):
  - 17 `auth_rls_initplan` WARN: wrap `auth.uid()` as `(select auth.uid())` in the policies.
  - 4 unindexed foreign keys: `brivia_blocks.blocked_id`, `community_posts.author_id`, `matches.user2_id` and
    `member_orbit.place_id`.
  - Unused-index INFO: expected while the database is empty.
- **Still not met for real members:** the go-live gate items for P0-B, auth hardening, operations and founder
  sign-off. See `docs/arena/2026-10-03-iteration-3.md`.

## D-043: Test members are live (go-live entry for the test world; verified read-only)
- **Date:** 2026-10-05. **Migration set live:** `0001`–`0004` (all frozen). **Seed:** `supabase/seed/test-members.sql`,
  run by the founder in the SQL editor. **Client:** not yet deployed from this branch (HANDOFF step 1).
- **Verified by Claude through the Supabase connector (read-only `select`s and the advisors only, 2026-10-05):**
  - 24 profiles, all `is_test`, all completed (`brivia_member_completed`); 0 real profiles.
  - 24 `member_orbit` rows across 4 places; every member has exactly 20 budget points.
  - 6 connection requests, 1 match; 0 `member_flag` rows; 0 storage objects.
  - 432 taxonomy nodes; both pg_cron jobs as D-042 (`17 20 * * *`, `37 20 * * *`).
  - Log settings unchanged from D-042: `log_statement = ddl`, `log_min_duration_statement = -1`,
    `log_parameter_max_length = -1` (safe while statement logging stays DDL-only).
  - Buckets: `profile-photos`, `profile-covers`, `community-posts` public; `message-attachments`, `career-resumes`
    private (private photo URLs are P1 item 21).
- **Advisors, compared with `supabase/migrations/README.md`:** security shows the same 16 intended member-RPC WARN and
  8 deny-all INFO as D-042, plus one new **founder setting**: *Leaked password protection disabled* (Auth). It joins
  gate item 7 (auth hardening). Performance is unchanged from D-042 (17 `auth_rls_initplan`, 4 unindexed foreign keys,
  unused-index INFO); the fix is queued for `0005`.
- **Gate:** test members only — **met** on the live project. Real members still wait on P0-B, gate items 7, 10, 11.

## D-044: P0-B design arena: 18+ gate, consent history, report_member, self-serve deletion, retention (iteration 4)
- **Date:** 2026-10-05. **Record:** `docs/arena/2026-10-05-p0b-design.md` (critics A UX, B privacy/security/DPDP,
  C data/ops/engine, and a judge; all Claude models, heterogeneity reduced and disclosed). Snapshot `0eb76f7`.
- **Decision (binding rulings R1–R14), summarised:**
  - **18+ (R1):** `profiles.adult_declared_at`, settable only by `declare_adult(p_notice_version)`; completion requires
    it; location and interest writes are refused before it; a BEFORE UPDATE guard protects it and
    `sensitive_consent_at`; test members are backfilled. The client gate sits at the end of step 1 and routing reads
    the member's own row (covers OAuth).
  - **Sensitive consent (R2, R3):** separate opt-in panel; withdrawing deletes the private interests and
    **redistributes** their points, so withdrawing is as easy as giving. Every give/withdraw/adult/deletion is an
    append-only `consent_event` (owner-only, account life + 1 year).
  - **Reports (R4):** `report_member` charges a sender-only cap first (10 / 24 h), always blocks any existing id (no new
    oracle), keeps the report after the target deletes (no FK), stores the last 50 messages as evidence, flags only at
    2 qualifying reporters in 30 days (auto flags expire at 90 days), and a qualifying `underage` report suspends the
    target pending a 72 h founder review.
  - **Deletion (R5, R6):** client removes Storage files first; `delete_my_account('DELETE')` needs a sign-in within
    10 minutes and an empty folder, then deletes `auth.users` (cascade). A reported or flagged member leaves an
    email-HMAC tombstone for 365 days; a rejoin is flagged for review.
  - **Retention (R7)** as the table in the record; three questions go to counsel (IT Rules 180-day retention, DPDP
    Rules log retention, CERT-In logs). Gate item 9 needs counsel's answer or a recorded founder decision.
  - **Migrations (R8, R14):** `0005` holds R1–R7 and R9; the 17 `(select auth.uid())` policy rewrites and 4 FK
    indexes go in a separate `0006` with a `pg_policies` drift test. The dropped 0003 request-insert policy is never
    recreated.
  - **Client (R9–R12):** `(city-wide)` label, `privacy.html` (version tied to `brivia_notice_version()`), honesty fixes
    (no unverified ticks, no "already here" claim), ≥ 12 px and contrast on the safety surfaces, `compressImage` fails
    closed, video location warning. **R13:** `docs/BREACH_RUNBOOK.md`.
- **Deferred to P1:** phone/provider tombstone with a Vault key, storage insert policies that check the user still
  exists, an orphan-attachment queue, an Edge Function deletion, inactive-account deletion, moderation tooling and
  appeals, and the 12 px rule app-wide.
- **Dissent preserved:** see the record (the packet's withdraw→recompletion and single migration; B's wider tombstone
  and relation-before-block; B's career-resumes check; C's 14-day reporter age and suffix in `set_home_city`).
- **Founder to confirm:** the named member cards on the `auth.html` preview stay only if each person consented
  (otherwise they become unnamed "Example" cards); the moderation and grievance contact `thebrivia.club@gmail.com`.

## D-045: P0-B delivered on the branch (iteration 4); not yet applied live
- **Dates:** 2026-10-05 to 2026-10-07. **Branch:** `claude/jolly-edison-49xvza`, range `bc7542e..c208bdc`.
  **Plan:** `docs/superpowers/plans/2026-10-05-iteration-4-p0b.md`. **Spec:** D-044 / `docs/arena/2026-10-05-p0b-design.md`.
- **Delivered:**
  - `0005_p0b_dpdp_safety.sql`:
    - the 18+ declaration gate and `consent_event`;
    - sensitive consent give and withdraw, with the points redistributed on withdrawal;
    - `report_member` (cap first, evidence, qualified flags, underage suspension, a per-target lock);
    - the rejoin tombstone;
    - `delete_my_account` (re-auth within 10 minutes, empty storage, cascade), plus owner storage-delete policies;
    - the retention purge;
    - the "(city-wide)" label.
  - `0006_perf_policies.sql`: 17 policies use `(select auth.uid())` and 4 foreign-key indexes are added. A drift test
    is pinned to committed TSVs, and the live policies were verified equal to that snapshot read-only.
  - **Client:**
    - the 18+ step;
    - the private-interest consent panel;
    - the card overflow menu and the chat report dialog;
    - Privacy & account (withdraw, and deletion with re-auth, asking the server before any file is touched);
    - the under-review notice;
    - fail-closed image compression with extension-aware detection, and the video location warning;
    - `privacy.html` (version `2026-10-05`);
    - honesty, contrast and 12 px fixes, with axe and per-pixel photo-contrast checks.
  - **Docs:** `docs/BREACH_RUNBOOK.md`, `docs/MODERATION.md`, and the 0005/0006 apply runbook in
    `supabase/migrations/README.md`.
- **Gate at `c208bdc`:**
  - SQL harness ALL PASSED, including the drift check; unit tests 88 (also under TZ=Asia/Kolkata); ORBIT 86.
  - e2e: consent 153, onboarding 198, deck 103 (three runs); build OK.
  - `0001`–`0004` and `index.html` are unchanged.
- **Process:** 11 tasks, each with an implementer, a task review and fix rounds, then a two-part final review (SQL
  and client) and one fix wave. Every participant was a Claude model.
- **Controller rulings made during execution** (each with its cost if wrong; full ledger in the session):
  1. The H3 allow-list grew per task, so no test names a function before it exists.
  2. The test purge sets `storage.allow_delete_query`. It removes metadata only, and the README says so.
  3. Pending interests are kept when the 18+ declaration fails.
  4. The 18+ trigger allows the withdrawal redistribution, as a narrow, invoker-checked carve-out.
  5. Impressions never count as a relation for report qualification. This is superseded and tightened by D-046 R1.
  6. A file is image-like by MIME type or by extension, and must re-encode or be refused. `image/gif` passes through
     only in chat.
  7. The quota reset shows the true local time ("8:30 PM" in India) rather than rounding.
  8. The flaky deck focus check was root-caused (focus returns in the async `close` event) and fixed with a bounded
     wait.
  9. Several review minors were folded into the fix rounds where they were cheap and touched the same code.
- **Live facts verified read-only:**
  - `postgres` has `rolbypassrls = true` and DELETE on `auth.users`;
  - `storage.protect_delete` is present;
  - pgcrypto is in the `extensions` schema;
  - `career_applications` has 0 rows;
  - the orphan-folder query returns 0 rows;
  - the region is ap-south-1.
- **Not done:** 0005, 0006 and the client are **not** applied or deployed. D-046 amends 0005 in place before its
  first apply. The `app.js:1577` profile helper sentence is still untrue; it is D-046 R10.

## D-046: Iteration-4 arena outcome: corroborated underage suspension, enforcement ladder, deletion hold, founder alert, amend 0005 before its first apply
- **Date:** 2026-10-07. **Record:** `docs/arena/2026-10-07-iteration-4.md`. Critics: A (UX), B (privacy, security
  and DPDP), C (data, ops, engine and IP), and a judge. All were Claude models, so heterogeneity is reduced; this is
  disclosed. Snapshot `c208bdc`.
- **Evidence:**
  - One sock account aged 7 days or more can insert a raw `'request'` interaction row for any same-world id. That row
    counts as a relation, so one underage report suspends any adult with no expiry (J1, confirmed by the judge).
  - A member under review cannot reach Privacy & account.
  - `restricted` hides no one, and the Restrict statement in MODERATION.md un-hides a suspended member.
  - Messages vanish if a harasser deletes before anyone reports them.
  - **Rejected:** "attachments are public" (the bucket is private, with signed URLs) and "region unverified" (live is
    ap-south-1).
- **Decision (binding; 0005 is amended in place before its first live apply, as D-038 did for 0004; the alert is a
  new 0007):**
  - **R1:** an underage report hides the target only with two distinct qualifying reporters within 30 days, or one
    qualifying reporter who has a match with the target. A reporter's own `request` rows never count. A single report
    is stored, raises an alert and enters a 72 h review queue (`member_report.reviewed_at`).
  - **R3, the enforcement ladder:**
    - a `banned` flag;
    - Restrict never replaces `suspended_pending_review` or `banned`;
    - an owner-only `moderation_remove_member`;
    - a rejoin whose tombstone has `underage` or `banned` is suspended;
    - tombstones only for qualifying reports or flags.
  - **R4:** deletion is held (`deletion_held`) for a flagged member, or one with an open qualifying report from the
    last 30 days. The founder completes it within 30 days. **Counsel question** recorded: deletion before any report.
  - **R5:** `0007_moderation_alert.sql` runs an hourly pg_cron job that posts counts only to a founder webhook through
    pg_net, plus a digest row. This adds a new live dependency, `pg_net`, which needs a pre-flight check.
  - **R6:** a live deletion rehearsal on a throwaway test-world member, covering password and Google re-auth, the
    `amr` shape and zero residual rows.
  - **R7:** the under-review notice links Privacy & account, and deletion from there takes the R4 hold.
  - **R8:** collapse the duplicate definitions in 0005 to one each.
  - **R9:** the purge fails loudly and alerts.
  - **R10:** honesty copy, including `app.js:1577`, the reporter-identifiability caveat, the under-18 text per R1,
    and career data under "What remains".
  - **R11:** auth hardening is a founder gate, recorded as a dated DECISIONS entry.
- **Backlog:** P0-C items 1–10 (the record's table, each with acceptance criteria). P1 holds the A-I UX items, the
  parked ledger items, private photo URLs and the card budget, the P0-E grid1 adapter and sensitive firewall, and the
  IP dossier. P2 holds Gmail normalisation, pepper rotation, age assurance, inactivity deletion, re-consent, a
  localised emergency number, reporter feedback and ring forensics.
- **Go-live gate at `c208bdc`:**
  - met: rows 1 and 5;
  - met live: rows 4 and 12;
  - met locally: row 3;
  - partly met: rows 2 and 6;
  - in the build but not deployed: row 13;
  - not met: rows 7–11 and 14 (row 14 is not needed for the closed beta).
- **Dissent preserved:**
  - C wanted a mutual relation for all qualification, and wanted purge failures non-blocking.
  - B wanted every deletion held.
  - A wanted the paused member's full app.
  - The judge's own trade-off: a minor seen only in the deck stays visible until the founder reviews.

## D-047: Apply 0005 and 0006 to live now, for testing with test members only (founder decision; supersedes D-046 "amend 0005 in place")
- **Date:** 2026-10-07. **Decided by:** the founder, choosing between options the controller set out: a staging
  project, which the free plan blocks (2 active projects already), apply now, upgrade, or screens only.
- **Decision:** 0005 and then 0006 are applied to the live project from commit `ff937d7`, by the founder in the SQL
  editor, and the matching client is deployed to test. Once applied, `0005` and `0006` are **frozen**. The D-046 P0-C
  SQL items (R1 corroboration, R3 ladder, R4 deletion hold, R8 collapse, R9 purge) ship as new migrations `0007+`,
  and the R5 alert moves to the next free number.
- **Why:** there are 0 real members and 24 `is_test` members, so the risks D-046 found (single-report suspension,
  `restricted` that hides no one, evidence loss on deletion) cannot hurt a real person while only testers use the app.
- **Pre-flight, verified read-only 2026-10-07 21:06 UTC:**
  - `postgres` has `rolbypassrls = t` and DELETE on `auth.users`;
  - pgcrypto is in `extensions`;
  - 0 non-cascading foreign keys to `profiles` or `auth.users`;
  - 0 career applications older than 180 days;
  - 0 real and 24 test profiles;
  - both cron jobs unchanged;
  - `log_statement = ddl`;
  - none of the 0005 functions exist yet.
- **Condition:** no real member may join until the P0-C items and the founder gate items in D-046 are met. The
  deletion UI also stays behind the live `amr` check (README gate 2).

## D-048: 0005 and 0006 applied to live and verified; client deployed to Vercel (test members only)
- **Date:** 2026-10-08. **Applied by:** the founder in the SQL editor (D-047). **Code:** `65e8a09`.
- **0005 verified read-only:**
  - `moderation_pepper` has 1 row;
  - all 24 `is_test` members are declared and still completed;
  - the triggers are `brivia_profiles_consent_guard` on `profiles` and `brivia_require_adult` on `member_interest`
    and `member_orbit`;
  - `declare_adult`, `report_member`, `delete_my_account` and `brivia_notice_version()` (= `2026-10-05`) exist;
  - the "(city-wide)" label, the new purge, the report lock and `delete_my_account` `search_path=public` are all live;
  - grants as the README says (`purge_expired_requests` is not client-executable; `delete_my_account` is not `anon`);
  - the cron jobs are unchanged.
- **0006:** the first run was a **truncated paste** (lines 100–118 missing: the two `interaction` policies and the 4
  indexes). The founder then ran the missing tail, unchanged. **Verified read-only:**
  - live `pg_policies`, normalised, has an md5 equal to `supabase/tests/policies-0006.expected.tsv`
    (`a8c1fee8…`): 35 policies, 17 wrapped, 0 unwrapped in `public`;
  - "Members can send connection requests" is absent;
  - all 4 foreign-key indexes are present.
  - **Lesson:** after any SQL-editor apply, verify the file's last object before moving on. The README's post-apply
    checks do this.
- **Advisors after apply:**
  - Security: 19 intended definer-RPC WARN (16 + `declare_adult`, `report_member`, `delete_my_account`); 13 "RLS
    enabled, no policy" INFO (8 + the 5 new owner-only tables); the founder's leaked-password-protection WARN.
  - Performance: the 17 `auth_rls_initplan` and 4 unindexed-FK findings are **gone**. Left: `report_attempt` "no
    primary key" (expected) and unused-index INFO (expected while the database is empty).
- **Client:** Vercel project `brivia-club` (team "Golu's projects"), linked to `Georgian-86/brivia-club-v1`.
  - Production alias `https://brivia-club.vercel.app`, first deployment from `65e8a09`.
  - Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design).
  - Vercel's default Deployment Protection is on, so the URL may need a Vercel login.
  - The founder set the Supabase Auth Site URL and the redirect `https://brivia-club.vercel.app/**`.
- **Still open:**
  - the JWT `amr` check, done by deleting a throwaway account in the app;
  - the Google re-auth round trip;
  - the D-046 P0-C items, now as new migrations from `0007`;
  - the founder gate items.
  - **Real members are still not allowed.**

## D-049: Live signup walkthrough on brivia-club.vercel.app; UI fixes from it (2026-10-08)

**Why.** The founder asked for a real signup on the live URL through the UI, "not just API calls".

**How it was run.**
- The session sandbox cannot reach `*.vercel.app` or `*.supabase.co`, so a Vercel Sandbox (project `brivia-club`) ran
  headless Chromium against `https://brivia-club.vercel.app` and live Supabase.
- It used a 390 px phone viewport, typed input, real clicks and a real photo file.
- Screens were checked as text, DOM state, console and network. Screenshots were taken locally from the same code
  with the e2e stubs.
- After each step, the stored data was verified read-only through the Supabase connector.

**Accounts it created (both real, non-test rows).**
- `brivia.qa.muzfgszm@maxxspace.com`: the confirmation email never reached the disposable inbox. The account is
  unconfirmed, has no profile, and the founder can delete it in Auth → Users.
- `optimus4586prime+briviaqa1008@gmail.com`: confirmed, completed onboarding, Bengaluru (city-wide), 2 interests.
  It was then **deleted through the in-app flow**. This closes the D-048 "amr" item.
  - The flow: Profile ⚙ → Privacy & account → Delete my account → typed "delete".
  - The server answered `reauth_required` (the sign-in was over 10 minutes old), and the dialog asked for the
    password.
  - After the password, the account was deleted and the member landed on `privacy.html?deleted=1`.
  - Verified read-only: 0 auth users, 0 profiles, 0 orphan interests, 0 storage files left for it.
  - One cosmetic console 403 remains: sign-out after deletion gets `user_not_found`.

**Found and fixed (client only; no SQL).**
1. **Phone pattern was invalid.** The pattern `[0-9 ()-]{7,20}` is not valid under the browser's `v` flag, so it threw
   a console error and phone validation was silently off. It is now `[0-9 \(\)\-]{7,20}`.
2. **Typed city refused.** Typing a city and pressing Next said "Choose your area to continue."; only a click on the
   suggestion worked (the founder hit this). Now:
   - an unambiguous typed city is accepted on Next or Enter (`area-pick.js`);
   - Next waits for a search still in flight;
   - a hint reads "Type your city, then pick it from the list.";
   - an ambiguous city gets "Pick your city from the list below."
3. **Wrong step-3 gate message.** It said "Place all 20 points to continue." even with no interest picked. It is now
   "Pick at least one interest to continue.", then "Place all 20 points to continue (N left).", tracking the points
   left.
4. **Placing 20 points took about 18 taps.** Two picks leave 18 points to place one tap at a time. Added "Spread the
   remaining points evenly" (`spreadRemaining`). It only fills the budget and keeps the points already placed. The
   ORBIT model and the server rule (20 points, 1–12 interests) are unchanged.
5. **The signup photo was lost on the email-confirmation path.**
   - The cause: the photo waited in `brivia-pending-profile` as a data:image preview, and the post-login save drops
     data URLs, so it was never uploaded. Live, `photo_url` was null.
   - Now: after login, both on the verify link and on the password login, the preview becomes a File and is uploaded
     to `profile-photos/<id>/`. Then it is removed from the pending profile so a retry never uploads it twice.
6. **Avatars.** The Profile board avatar was a static "YU" placeholder, and the header showed the first two letters
   ("QA" for "Qa Tester"). All three avatars now show the same initials, or the photo.
7. **Copy and layout.**
   - The check-your-email copy now says the link signs you in, and to check spam.
   - The duplicate "STEP 0n" eyebrow under the progress label is hidden.
   - Back and Next are the same height (they differed at 1440 px).

**Checked and fine:**
- the 18+ gate error;
- "Use my location", with the coordinate dropped;
- the city label " (city-wide)";
- interests and modes saved with exactly 20 points;
- "looking for" saved;
- verification lands in the app signed in;
- `skills` filled server-side only;
- no horizontal scroll at 390 px.

An empty deck for a real member is expected: the test members are in the test world (D-043).

**Founder actions (dashboard, not code).**
- Configure custom SMTP and a Brivia-branded confirmation template before real members. The default sender is
  rate-limited, and the email reads "an application powered by Supabase". The disposable inbox never received it.
- Delete the unconfirmed QA account above.

**Review (independent subagent).** It found 1 blocking issue, 5 should-fix and 6 nits. Fixed:
- **B1:** a retry login after a failed onboarding wrote `photo_url = null`. The pending preview is now replaced by the
  stored URL, not deleted.
- **S1:** a failed photo upload blocked sign-in. Now the profile is saved without the photo and the member moves on.
- **S2:** the board-avatar photo is sized to its circle.
- **S3:** focus moves to Next after "Spread".
- **S4:** a single city option is taken only when its name starts with the typed text.
- **S5:** the async Next handler stops if the member went Back meanwhile.
- **N1:** the cached profile never keeps the data: preview.
- **N3:** the gate flag resets.
- **N5:** the phone number needs 7 digits.

Left as is:
- N2: orphaned uploads after a failed row write.
- N4: Enter in another step-2 field.
- N6: the pending file name.
- The 34 px board avatar (it predates this change).

**Tests.**
- `tests/unit/signup-live-fixes.test.mjs` (8 tests).
- Onboarding e2e:
  - block 13 (13 checks);
  - block 13b (retry login and failed upload).
- The photo-upload checks were confirmed to fail on the old code.
- Consent e2e: an avatar-initials check.
- The step-3 Tab limit was raised for the new button.

## D-050: Production deploys are manual; the default auth email sender rate-limits real sign-ups (2026-10-08)

**Deploys are manual (this corrects D-048 and the handoff).**
- A push to `claude/jolly-edison-49xvza` builds a **preview** deployment only. Production
  (`https://brivia-club.vercel.app`) moves only by a production deployment of a commit.
- Promoting a preview with `request_promote` is refused on this plan (422).
- `3fe26f4` (D-049) was deployed to production this way, with Vercel MCP `create_deployment`, `target: production`
  and `gitSource` = the branch and sha.
- Do the same after each push until the founder sets the Vercel production branch to this branch, or merges to the
  production branch.

**Live re-test of D-049 on production.** Confirmed:
- a typed city with Next (no click) moves to step 3;
- "Pick at least one interest to continue.", then "Place all 20 points to continue (18 left).";
- "Spread the remaining points evenly" makes it 0 of 20 left;
- the city hint is shown.

**The submit then failed.** Supabase answered `429 over_email_send_rate_limit`.
- The default sender allows only a few emails an hour, and this session had already sent 2.
- The form showed the raw "email rate limit exceeded". No auth user was created, so a later retry works.
- **Fix:** `signup-errors.js` (`signupErrorCopy`) shows "We can't send the confirmation email right now: too many
  sign-ups at once. Your account was not created. Please try again in about an hour." An already-registered email
  points to log in. The form stays usable.
- **Tests:** 3 unit tests; onboarding e2e block 13c.
- **Founder action, now a blocker for any public test:** configure custom SMTP in Supabase Auth (for example Resend,
  Brevo or SES). Raise the email rate limit, and use a Brivia-branded confirmation template.
- The photo-upload re-test on live waits until the limit resets or SMTP is set. It is covered by the e2e blocks 13
  and 13b.

## D-051: `main` fast-forwarded to the working branch; production now deploys from `main` (2026-10-12)

- **What happened.** At the founder's request, `main` was fast-forwarded from `9b911d3` to `3a51671`. That is all 116
  commits of `claude/jolly-edison-49xvza`: no merge commit, and nothing on `main` was lost.
- **Confirmed.** `main` is the Vercel production branch. The push started a production build of `main` on its own.
- **From now on:**
  - A change reaches `https://brivia-club.vercel.app` when it lands on `main`.
  - Work continues on the working branch, with the full gate before every push.
  - When a change is ready to go live, fast-forward `main` to the branch, with the founder's OK.
  - The manual `create_deployment` step from D-050 is no longer needed.

## D-052: Arena on what signup requires: a D-variant of option A (PROPOSED, awaiting founder approval) (2026-10-12)

The founder asked which signup option is best (A minimum / B everything one-per-screen / C middle). Record:
`docs/arena/2026-10-12-signup-fields.md`. The panel was 4 independent critics plus a judge, all Claude models (reduced
heterogeneity, disclosed). All four rejected B and C.

**Judge's verdict (D-variant of A).**
- **Account first.** Google is primary. The email path signs in with a 6-digit code, so answers save on the server from
  screen 3 and nobody is left at "check your email".
- **Screens:** welcome → email → code → 18+ → name → area → interests → "which matters most?" → reveal and deck.
- **Points:** tier taps with one required "top passion". Weights 4/2/1, converted to 20 points by largest remainder,
  each interest at least 1 point. "Fine-tune" steppers are optional. Never shown incomplete, never a "points left" count.
  - An even default split was rejected: it erases the ordering ORBIT's resonance term relies on, and only the first
    interest save is free.
- **Later checklist:** photo (nudged at the first like), looking-for (at the first request), mode, experience, cover.
- **Not collected:** phone and gender. Neither has a working purpose today (DPDP s.6 minimisation; gender is null in
  every card RPC).
- **Blockers and order:**
  1. Custom SMTP (the code email) and Google OAuth production config.
  2. Migration 0007 to bump the notice version, shipped with `privacy.html` and `notice-version.js` in one window.
  3. Deletion re-auth for passwordless members.
  4. UX_SPEC §A and the e2e tests updated in the same commit.
- **Preserved dissent:**
  - Trust: let members finish now and stay invisible until their email is verified. This wins if that is cheap
    server-side.
  - UX: an even pre-split. This wins back if the required top pick costs more than about 2 points of completion.

## D-053: Experience iteration spec; D-052 approved (2026-10-12)

**D-052 is approved by the founder:** guided signup with Google or email-OTP first, 18+, name, area, interests and a
"which matters most?" points screen; phone and gender are no longer collected.

The founder approved, section by section in chat, the design written up in
`docs/superpowers/specs/2026-10-12-experience-iteration-design.md`:
- the guided signup (§1);
- landing speed with the same look (§2);
- a tester switch and seed v2 for testing matching (§3);
- a consent-first growth kit: SEO, PostHog, Sentry, UTM, lifecycle email (§4);
- consistency and a hotfix (§5): one nav with a mobile tab bar, Bodoni Moda for headings and Instrument Sans for the
  rest, a calmer profile, tokens.

**Build order:** A hotfix → B landing → C consistency → D test world (0008) → E signup (0007, needs SMTP or Google)
→ F growth kit (needs the founder's accounts).

**Existing phone and gender values:** kept (not shown to others), unless the founder decides otherwise.

**P0-C moderation stays queued.** Real members remain disallowed until it ships.

## D-054: Phase B landing speed, results and rulings (2026-10-12)

Phase B of the experience iteration (spec §2) is done on the branch (not yet on `main`). Same look, much lighter.

**Results (measured):**
- `dist/assets`: 159.6 MB -> about 13.6 MB (`npm run check:assets` passes: every image <= 400 KB, every video <= 5 MB).
- Initial transfer (no scroll, until `load` + 2 s idle, local preview): 0.70 MB at 375 px and 0.73 MB at 1440 px, hero
  video excluded (Ruling G). With the hero file a real browser would stream: about 2.25 MB (720p) and 5.17 MB (1080p).
  The 1080p figure is printed as a WARN: the Playwright Chromium has no H.264, so it downloads both `<source>` files.
- CLS 0.0000 at both widths. LCP (Playwright observer, local, unthrottled): 292 ms at 375 px (hero `<video poster>`),
  276 ms at 1440 px (the H1). The poster is requested once (the `<link rel=preload as=image fetchpriority=high>` is
  reused by `<video poster>`; one request, not two).
- Lighthouse 12.8 mobile (simulated 4G, `vite preview`, first visit so the intro runs): performance 0.86 to 0.89 over two
  runs after the last change (0.78 before the font preload was set to `fetchpriority="low"`), LCP 2.8 s, FCP 2.8 s,
  TBT 130 to 230 ms, CLS 0. **Below the 90 / 2.5 s target.** The sandbox CPU is slower than Lighthouse expects (it warned),
  so TBT is noisy. Top remaining opportunity: render-blocking CSS. `script-*.css` is about 38 KB gzipped (210 KB raw),
  because the landing page also carries the auth modal and `script.js` imports all the auth styles, plus three small
  shared CSS chunks. Splitting the auth styles out of the landing critical path is the next step (Phase C).
  Re-run Lighthouse on the live URL after deploy for the real number.

**Deviation from spec §2.3:** WebP only, AVIF dropped. WebP alone meets the 400 KB budget with one code path.

**Controller rulings:**
- Ruling F: hero video 1080p at crf 30 (about 4.24 MiB, the sharper version the founder approved).
- Ruling G: the hero video is excluded from the 3 MB initial budget and reported separately.
- Ruling D/E: stored cover identifiers are kept, and legacy hashed cover URLs are resolved to the optimized files.

**Also shipped in this task:** self-hosted fonts (`fonts.css`: Instrument Sans 500/600/700 + italic 700, Bodoni Moda 500,
latin woff2 only; no Google Fonts requests; the Instrument Sans 700 preload is `fetchpriority="low"` because a high
priority preload delayed the poster and CSS), `skeleton.css` (`.skeleton` brand shimmer, `markLoaded(img)`), and
`Cache-Control: public, max-age=31536000, immutable` for `/assets/(.*)` in `vercel.json`. Bodoni Moda is now the static
500 weight, not the Google variable `opsz` axis; check the large home heading against the live site.

**Deferred:**
- The Playwright Chromium lacks H.264, so video playback and the gesture-unmute are verified live after deploy.
- The `app.js` `exploreCoverImages` 404 is pre-existing and goes to Phase C.

**D-054 addendum (2026-10-12):** the Bodoni Moda caveat in D-054 is withdrawn. Rendering the privacy.html h1 at 92 px
before (Google Fonts, pre-Phase-B build) and after (static fontsource 500) gives pixel-identical output (mean abs diff
0.000); Google's CSS never exposed the `opsz` axis, so it served the default optical instance. A variable `opsz` file was
tried and rejected: it renders hairline display text and does not match. Also: careers.html's Instrument Sans 400 is
restored (`fonts-careers.css`, imported only from `careers.js`), and `markLoaded` now clears the skeleton for an image
that had already failed before the module ran.

### D-054 correction (2026-10-12, final review of Phase B)

Two statements in D-054 above were inaccurate. This block corrects them; the lines above stay as written.
- "Stored cover identifiers kept" holds only for the default, hidden `coverUrl`. A cover the member picks is stored as the built `/assets/<stem>-<hash>.webp` URL (`coverOptionUrl` in `script.js` reads the `<img src>`), and the stem resolution in `cover-name.js` is what keeps old stored values working. Legacy hashed `.PNG` values and the original `/Images/Cover%20images/<name>.PNG` paths are resolved by `normalizeCoverUrl`, now applied once in `toMemberPerson` so other members' swipe cards resolve them too (before this fix the deck card showed a broken cover for them).
- `exploreCoverImages` in `app.js` was a dead constant, never referenced; nothing requested those files. It is deleted in this fix.

## D-055: Phase C consistency, results and rulings (2026-10-13)

Phase C of the experience iteration (spec §4, plan `docs/superpowers/plans/2026-10-12-phase-c-consistency.md`) is done on
the branch (not yet on `main`). One app: one nav, one set of tokens, one type system, a calm profile, and loading, busy and
empty states that always offer a next step. The landing page stayed byte-identical throughout.

**Founder decisions:** the plan was approved; **four tabs, Connect · Explore · Chat · Profile** (the wordmark goes to the
landing; `?view=home` is an alias of Connect); subagent-driven execution.

**Results (measured):**
- Tokens: `tokens.css` (colour, space, radius, shadow, type 12/14/16/20/24/32/44/60, motion 150/200/250 ms, 0 under
  reduced motion) is imported first by every entry. Style ratchet `npm run check:styles` (`scripts/style-ratchet.js`,
  `check-style-ratchet.mjs`, `style-baseline.json`): per-file hex and font-family counts may only fall.
  font-family declarations 134 -> 15 (only the landing, careers and privacy files keep theirs).
- Landing parity guard: `scripts/visual-parity.mjs` (+ `parity-images.mjs`) takes byte-exact screenshots of index
  (22 shots) and auth (16 shots, including steps 2-4 and the success panel, from in-guard Supabase fixtures). It is
  deterministic (software raster, lazy images forced and decoded with a bounded wait, 3 identical frames or it throws,
  no retries); `--expect-diff` names an intended change. **The landing stayed byte-identical through every Phase C task.**
- Nav: `app-nav.js` is the single model; it renders the desktop header and the <= 780 px bottom tab bar. The profile
  sidebar and board nav, the header logout, the chat sidebar brand and the `renameExploreToConnect` MutationObserver are
  gone; `explore.html`, `chat.html` and `profile.html` are redirects. Every `[data-nav]` click runs `setView` once with one
  history entry. Checked by `tests/e2e/app-shell.spec.mjs` (port 5195).
- CSS split: `landing-entry.js` / `auth-entry.js`; landing CSS 245 KB -> 134 KB. **Lighthouse mobile (median of 3,
  `vite preview`) 0.89 -> 0.93, LCP 2.6 s, CLS 0**: meets Ruling H's 0.90 target.
- Auth: focus order matches the visual order on steps 2-4 at <= 780 px; `.auth-success-mark` is aria-hidden; the signup
  form is hidden after a session-less signup (it stayed visible above "Check your email"); the success panel scrolls to
  the top and focuses its title.
- Type: Bodoni Moda headings (500 italic self-hosted in `fonts-app.css`, app and auth only), Instrument Sans body, a 12 px
  floor in app and auth; Georgia, Arial and the script fonts are gone from app and auth CSS.
- Profile: one calm column: hero, a "Complete your profile" checklist (`profile-checklist.js`, 5 items), interests with
  points bars (`my_interests`), Looking for, Experience. The stat tiles, the duplicate email and login cards and "Show up as
  yourself" are gone; the own email appears once ("Signed in as" in the ⚙ menu). The ⚙ menu is a keyboard-reachable
  popover (Tab order, Escape returns focus).
- Feel (Task 6): `app-skeletons.js` (`skeletonMarkup`, `setBusy`). The deck card keeps its box and shows a skeleton while
  the deck loads, refills or retries (home view `aria-busy`; CLS 0 once the app is shown); a failure ends in the existing
  Try again state, never a skeleton. The chat list, posts feed and profile interests show skeletons with `aria-busy`.
  Pitch, post and profile-save buttons are `aria-busy` and disabled while pending. Press, focus and busy states with
  motion-token transitions are zero-specificity, so no resting look changed. Every empty state has an action ("Write the
  first post", posts "Try again", "Notification settings"). `skeleton.css` takes its two tones from tokens
  (`--color-skeleton`, `--color-skeleton-glint`, the same values, so no new colours; landing parity identical). The
  profile now renders as soon as the member's own row is read, not after the deck (a slow deck showed "New Member").

**Controller rulings (Phase C ledger):**
1. Screenshot dirs live in the plan workspace (`.superpowers/sdd/2026-10-12-phase-c-consistency/`).
2. One reusable visual-parity guard (index and auth), not per-task scripts.
3. The chat badge keeps `conversations.length` and is hidden at 0.
4. The header stays cream with wine type (the spec's "deep-wine header" was read as the palette).
5. Auth parity is extended with `--expect-diff` for the intended changes.
6. The focus-order fix applies to steps 2-4 (the same WCAG 2.4.3 fault on each).
7. The hidden-form bug was fixed in Task 3.
8. The Bodoni italic lives in `fonts-app.css` only, so the landing's fonts stay as they were.
9. The profile is a centred ~880 px column.
10. The interests empty-state action is accepted: the state is unreachable after onboarding (server-enforced >= 3).
11. The 'private' interest label is inert (the server has no such mode).

**Founder backlog surfaced (not Phase C):** interest editing after onboarding; a real bio/about field (needs a
migration); a private/sensitive interest flag; the test cover "badminton" art has a baked-in grey checkerboard; the
success panel alignment at 1440 px (Phase E rebuilds signup); the header avatar is clipped under a classic 15 px
scrollbar at 375 px in desktop Chromium.

**Next:** Phase D, the test world (spec §3: migration 0008, seed v2, the why panel).

**D-055 addendum (2026-10-13, final review of Phase C):** the <= 780 px tab bar is hidden whenever something takes the
phone: any overlay or modal dialog (the pitch sheet, the discovery-filter drawer, a public profile, the profile editor,
the notification / blocked / removed / privacy dialogs, the chat camera, any `dialog[open]`), the "Profile under review"
notice, and an open chat thread (the messaging-app pattern; the chat list keeps the bar, and the thread's Back returns to
it). Reason: the fixed bar (z-index 90) sat above the z-50 pitch sheet and took the tap meant for SEND PITCH. One CSS
`:has()` rule in `app-shell.css`, so a new overlay class must be added to that list. Also in this wave: the ⚙ menu ignores
a focus loss to nowhere (Safari and macOS Firefox do not focus a clicked button), a refill that throws ends in Try again,
app form fields are 16 px on phones (no iOS focus zoom), re-tapping Profile keeps the loaded interests, page scrolling (a
view change, `html{scroll-behavior}`) is instant under reduced motion, and `app.html` (only) has `viewport-fit=cover` so the bar's
safe-area padding works on notched iPhones.

## D-056: Signup has no points distribution; one question per screen on phone and desktop; premium interest picking (2026-10-13)

**Decided by:** the founder, in chat ("the signup questions should also be 1 ques per screen and no points distribution.
But interest CTA shall be well animated so that it is felt that one thing is selected and it is now in the list. It
should give a premium feel both in desktop and mobile").

**What changes in spec §1 (Phase E):**
- Screen 8 ("Which one matters most?", tiers and weights) is removed. The interests screen saves on Next with an even
  split of the 20-point Passion Budget (largest remainder, every interest at least 1), using the existing
  `set_member_interests`, so there is no migration and no ORBIT model change.
- One question per screen applies to desktop too, not only phones.
- The interest picker animates each pick into a visible "Your picks" tray (and back out on removal) with a count
  confirmation and a light haptic where supported; reduced motion gets a fade.

**Cost, recorded honestly:** at signup, matching can no longer tell a member's main passion from a side interest; all
picks weigh the same until the member changes them. A "Which matters most?" weighting becomes an optional profile action
in a later phase. The `points_entry` A/B flag in spec §4 is dropped.

**Also:** Phase C was approved by the founder for production ("good to go", 2026-10-13); the fast-forward of `main` is
pending the founder's own push or permission (the session's auto-mode guard refused a production push).

## D-057: Test world v2: preset post images for test members only; the far match is checked through ORBIT's gate (2026-10-13)

**Decided by:** the Phase D coordinator's rulings on the Task 2 NEEDS_CONTEXT report (the brief could not be met as written).

1. **Post images.** The 0003 CHECK `community_posts_image_storage` refused any post image that is not the author's own
   Storage file, for every writer, so a SQL seed could not show an image. 0008 (still unapplied, so open) replaces the
   CHECK with the trigger `brivia_zz_posts_image_rule`: the same rule for everyone (same 23514 error, every insert and
   update, the owner included), plus a preset illustration path with an empty `image_path` **only when the author's
   profile `is_test`**. Real members and testers keep exactly the 0003 rule. The feed renders a preset path through
   `normalizeCoverUrl` (`post-image.js`); anything else still shows the placeholder. Rejected: relaxing the rule for
   everyone (changes real members' behaviour), storage-shaped URLs with no file (every seed post "Image unavailable"),
   and DDL inside the seed.
2. **The far-but-strong match.** The interim deck has no escape-velocity gate (its pool stops at 60 km), so no server
   path can show a far match. Accepted interpretation: the harness checks the far partner is never in the deck and is
   found by search (3+ shared interests, more than 350 km apart), and a unit test runs the seed's far pairs through the
   ORBIT library's gate (each is Worth-the-Distance from both sides, R 0.88-0.94; a one-interest far pair is not even
   eligible at L = 0). ORBIT is not wired into the deck.
3. **Roles.** Each city's "first member" is its first v2 member (t25, t33, t39, t49, t53): the v1 members' interests
   are fixed and share nothing with a city-mate, and Pune has only 4 new slots. Neighbours are the only members at
   the top overlap level in their area, so they lead the deck whatever the daily tie-break. Three v1 members are
   flagged and two are blocked (their rows are unchanged). The purge deletes test members' `consent_event` rows
   explicitly (no foreign key) and reports `member_flag` and `consent_event`.

## D-058: Phase D, the test world: results, rulings and the founder's apply order (2026-10-13)

Phase D of the experience iteration (spec §3, plan `docs/superpowers/plans/2026-10-13-phase-d-test-world.md`) is done on
the branch `claude/jolly-edison-49xvza` (commits 4346936..HEAD). Nothing is applied live and nothing is pushed.

**Founder ask (2026-10-13):** "deck should not be empty; I want the test profiles over there". At plan time the live
project had 24 completed test members (6 each in Bengaluru, Mumbai, Delhi and Pune), and the founder's two real accounts
(Thane, Bengaluru) saw an empty deck, because the test world and the real world are isolated by design.

**What was built:**
- **`0008_tester_world.sql`** (one idempotent transaction; still unapplied):
  - an owner-only `public.brivia_tester` (RLS on, no policies, no client grants) and
    `public.brivia_in_test_world(uid)` (`is_test`, or a `brivia_tester` row). A tester is a real account that joins
    the test world without becoming `is_test`, so the purge never deletes it.
  - 14 functions that compared two members' worlds (enumerated from the catalogue, including
    `brivia_private.brivia_can_message`) are redefined verbatim except for the world check, with the same grants.
  - Cross-world requests, matches and messages are hidden only when a tester is on one side (`brivia_pair_world_ok`;
    Ruling 4). After a tester stops, it again sees its old test-world match, messages and pending requests until the
    purge, but cannot message test members (Ruling 5, documented truthfully in the file and the runbook).
  - The 0003 `community_posts` image CHECK becomes an equally strict trigger that also accepts a preset cover
    identifier, only for an `is_test` author (Ruling 7, D-057).
  - `deck_why(p_target)` (section 5): for a caller in the test world only, the deck card's shared interests and band
    and the interim deck's order keys for that target (same pool and visibility rules as `deck_candidates`, `stable`,
    no impression). Anyone else gets no row, not an error. Executable by `authenticated` only.
- **Seed v2** (`supabase/seed/test-members.sql`): 60 members (Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14),
  t01-t24 unchanged; 30 posts on preset illustrations; 11 requests (6 accepted, 5 pending); 3 matches with 15 messages;
  10 flagged (2 per city in 5 cities); 5 blocks; 15 private-interest consent rows. The purge removes all of it
  (including `consent_event` and `member_flag`), empties `brivia_tester` and keeps every tester's own account.
- **"Why this person?"** (`why-panel.js`, `app.js`, `deck.css`): on a deck card, a tester sees a 44 px "Why this
  person?" toggle (`aria-expanded`, `aria-controls`, Escape closes) that opens a panel over the card face (never over
  Pass/Pitch): "You both: …", the band label (never a km figure) and the order keys as a definition list with plain
  labels (Shares an interest, Distance tier, Interest overlap, Tie-break). A real member's client asks `deck_why`
  once per page and caches the negative in memory, so it never asks again.

**Far matches (Ruling 8):** the server deck has no escape-velocity lane yet (its pool stops at 60 km). The strong far
member is found by search, and a unit test proves the ORBIT library's gate passes the seed's strong far pairs (R
0.88-0.94 against the 0.86 cut) and rejects weak ones. Wiring ORBIT's far lane into `deck_candidates` stays on the
founder backlog; when it lands, the harness assertion "far partner absent from deck" must flip.

**Rulings (Phase D ledger, `.superpowers/sdd/2026-10-13-phase-d-test-world/progress.md`):**
1. Phase D runs before Phase E: the empty deck is the immediate ask, and E's Reveal screen benefits from a populated
   tester deck.
2. Flagged count: 2 per city in 5 cities (Delhi excluded) = 10, as the result row states.
3. The session never writes the live database; the founder applies 0008, seed v2 and the tester insert in the SQL editor.
4. Cross-world hiding of requests, matches and messages applies only when a tester is on one side; pairs without a
   tester keep the pre-0008 behaviour (e.g. a legacy real-test match stays 'matched').
5. After stopping, an ex-tester again sees its test-world match, messages and pending requests until the purge (deck
   and search stay real-world); this is documented and pinned by assertions rather than tracked with a `removed_at`.
6. Seeded posts use preset cover URLs, and the feed renders a URL that `isPresetCoverUrl()` accepts (a same-origin
   static asset).
7. Posts: in 0008 the image CHECK becomes an equivalent trigger that additionally allows a preset cover identifier
   only when the author `is_test`; the real-member rule is unchanged.
8. Far match: the harness asserts the far-strong member is absent from the deck but found by search (3+ shared
   interests, more than 350 km); a unit test runs the seed pair through ORBIT's gate. Wiring the far lane is later.
9. Each city's "first member" is its first new member (t25/t33/t39/t49/t53); some v1 members (t12, t20, t24 flagged;
   t11, t23 blocked) take flag and block roles through new rows only; t01, the demo login, is untouched.

**Founder's apply order (SQL editor, as `postgres`, in the same window as the client deploy):**
1. `0008_tester_world.sql` (with `set lock_timeout = '5s';` on the first line);
2. seed v2, `supabase/seed/test-members.sql`;
3. `insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;`
   for each of the founder's accounts;
4. `select public.refresh_cell_density();` (the name in the plan, `brivia_refresh_cell_density`, does not exist).

**Verified (local):** SQL harness ALL PASSED (every migration twice); build OK; `test:unit` 173/173; orbit 86/86;
`check:assets` and `check:styles` OK; landing parity identical (22 shots); e2e onboarding 269, consent 154, deck 123,
landing all passed, app-shell 208.

**Commit trailer rule (founder):** Phase D commits end with the `Claude-Session:` line only, with no `Co-Authored-By`.

### D-058 addendum (final review, 2026-10-13): who may call deck_why

`deck_why` stays open to any test-world caller, including logins of test members created by the founder, because the
seed README's demo flow ("sign in as F") needs it. The extra overlap level it shows reaches only logins the founder
controls (a tester or a seeded test member), never a real member, so no new exposure is added.

## D-061: The deck for the founder's live test: aligned layout, the heavy swipe, the pitched card stays (2026-10-14)
- Accepted 2026-10-14 (founder live-test hotfix, branch `claude/deck-swipe-hotfix`). No agent-arena round: a same-day
  hotfix; the one open product question is flagged below for the founder instead.
- **Layout (desktop >= 850 px).** The editorial headline stays in the left column; the card, Pass / Pitch and the hint
  sit stacked in the right column, Pass / Pitch centred under the card. The card's height comes from the viewport
  (`clamp(400px, 100svh - 262px, 650px)`), so its top is below the top bar from 1280x720 to 1920x1080. The old
  `top: -76px` / `translate(-128px, 200px)` offsets are overridden in `deck.css`. Phones are unchanged.
- **The heavy swipe (`deck-swipe.js`).** Pointer events (mouse, touch, pen); the card follows 1:1 with a rotation up to
  12 deg at half the card width and lifts while held; PASS / PITCH stamps fade in with the drag. Commit past 30% of
  the card width or on a fling over 0.6 px/ms in the drag's direction; otherwise it springs back with an overshoot.
  The fly-off time comes from the release speed (260-420 ms; buttons and arrow keys 280 ms). Only horizontal drags
  are captured (`touch-action: pan-y`, 8 px axis lock), so the page still scrolls. A drag never clicks through to
  VIEW PROFILE or "Why this person?". Reduced motion: no rotation, no fling, a 140 ms fade. `navigator.vibrate(10)` on
  commit. The next member waits underneath as a decorative stacked card (`aria-hidden`).
- **Left = Pass, right = Pitch, and consent is unchanged.** A right swipe does exactly what the Pitch button does: it
  opens the pitch sheet and sends nothing. D-018 (P13) is unchanged: submit sends one signal with the note; close /
  Escape / backdrop / next card sends one with `note: null`. Signal counts and caps are unchanged.
- **The pitched card stays.** It used to advance to the next member 280 ms after Pitch, under the open sheet. Now it
  stays on screen, parked a little to the right with the PITCH stamp, until the sheet resolves: on a send (with or
  without a note, per D-018) it flies off and the next card rises; on a failed send it springs back to the centre
  (F1). consent.spec's quota checks that asserted the old advance-under-the-sheet now assert the card stays.
- **Cover placeholder.** A card with no usable cover or photo, or one that fails to load, shows a branded deep-wine
  placeholder with the orbit mark, never the img alt text (`deckCoverSrc` in `deck-view.js`, `setCardImage` in
  `app.js`). Cause on the live deck: 34 seeded test members have no `cover_url` and no photo (v1 rows 1-24 have no
  cover column at all; 30, 31, 32, 38, 46, 47, 48, 58, 59, 60 have `null`), so the card set `<img src="">`. The seed is
  not changed here (the live database is never written from a session); giving those rows preset covers is a seed
  follow-up for the founder.
- **Open for the founder (NEEDS_CONTEXT).** The brief also said a cancelled pitch should leave the card "staying". Under
  D-018 cancelling *is* a plain like (one signal, note null), so the card leaves after a cancel. Making cancel send
  nothing and keep the card would change D-018 and the consent suite; it needs the founder's ruling first.

## D-062: The founder's design references: the Canva deck card, the "Brivia Society" chat, the full filter catalog, a 4K-only hero (2026-10-16)
- Accepted 2026-10-16 (founder request with four reference images: the Canva "Dating, but professionally" card, the
  "Brivia Society" chat screenshot, a photo of the live card and the landing mock-up). Branch
  `claude/focused-johnson-pev1j6`. No agent-arena round: the founder supplied the target look; nothing in matching,
  ranking, consent, location or privacy changes. Process: superpowers (brainstorming → bounded change, TDD for the new
  helpers, verification), ui-ux-pro-max rules (44 px targets, 12 px floor, contrast, reduced motion).
- **Look only, one new sheet.** `reference-design.css` loads last in `app.js`; tokens for the sampled colours are in
  `tokens.css` (`--color-oxblood` #4c1315 from the Canva card, `--color-chat-wine` #5a061e from the chat screenshot,
  paper, chip and name ink). No element, id, handler or RPC changed; the backend is untouched.
- **Deck card = the Canva card.** Paper face with a thin oxblood edge; an inset oxblood title bar (Bodoni small caps);
  the cover flush under it; a large ringed avatar over the cover's lower-left corner; the name in Bodoni Moda; a quiet
  line and a short rule; beige pills; a full-width oxblood VIEW PROFILE. The card is now a flex column, so the cover
  takes the free height and the info never overlaps it (1280x720 to phones). Desktop keeps the Canva proportions
  (width about 0.58 x height, never under 352 px). **The Canva @handle is not copied:** members have no handle field,
  and inventing one from the name would look like a real username. The distance band ("~3 km", a place) sits in its
  place, as the location-first rule wants. On phones the headline is a little smaller so the card shows on arrival.
- **Chat = the reference.** The live chat used the right wine (#5a061f) but drew the room photo at 3 px blur and 80 %
  opacity over cream (`app-navigation.css`), which washed it out; the new rule paints the photo sharp, at full
  strength, as the scroller's own background (it stays put while messages scroll). Selected row and sent bubble use
  #5a061e; serif (Bodoni Moda) names, header and bubbles; the sidebar masthead reads "BRIVIA SOCIETY" with "PEOPLE /
  IDEAS / POSSIBILITIES" exactly as in the reference (one CSS `content` string to change if the founder prefers
  "Brivia Club"). The old "BRIVIA AI · THOUGHTFUL CONNECTIONS" footer and the desktop back arrow are hidden.
- **Filters suggest everything.** `discovery-catalog.js` (unit-tested): a standard interest list (chess, music,
  guitar, hackathons, sport, arts, tech, life) and looking-for list, merged with the labels on loaded cards and the
  live taxonomy's selectable, **non-sensitive** labels (read once when the drawer opens; a failure keeps the
  standard list). A row of 12 popular picks sits above the box; an empty focused box lists the whole catalog in a
  scrolling list. Matching is unchanged (a value with no card shows "0 people match"). Fixed a mojibake "Ã—" on the
  selected-chip remove mark.
- **The hero is 4K only.** The 1080p downscale (crf 30) was soft. `npm run media:hero4k` (`scripts/encode-hero-4k.mjs`)
  encodes the 4K master into a full 3840x2160 frame and a 1216x2160 centre crop for portrait phones (object-fit:cover
  only ever shows that slice there, so phones get native 4K pixels for about a third of the bytes), each in AV1, HEVC
  (Safari) and H.264. `index.html` lists them with exact codec types, so a browser fetches exactly one; before the
  first byte, MediaCapabilities drops a source the device would not decode smoothly (`pickHeroSource`). Load speed is
  kept by what was already there: the poster is the LCP, the video starts only after idle, +faststart streams it, and
  reduced-motion, save-data and now 2g/3g links get the poster only. `check:assets` gives `hero-4k-*` /
  `hero-portrait-4k-*` their own 20 MB cap (every other video keeps 5 MB; AV1 is 11.6 MB, HEVC 12.5, the H.264 last resort 17.8; the portrait crop 4.2 / 4.6 / 6.3). The old 1080/720 hero files are removed.

## D-063: A smoother landing (Lenis, cheaper scene layers) and sound that starts on the first gesture, stops after 5 minutes, with a mute button (2026-10-16)
- Accepted 2026-10-16 (founder: "super smooth like arovas.in; the audio starts way later than it should; stop it
  after 5 minutes; a mute button that does not spoil the look"). Branch `claude/focused-johnson-pev1j6`. No
  agent-arena round: the founder named the reference and the behaviour; the landing's look is unchanged (founder rule:
  optimise, never redesign), apart from the new sound button.
- **Why the sound was late (root cause).** The music (a soft synthesized chord every 3.2 s; the hero video has no audio
  track) waited for `pointerdown` / `touchstart` / `keydown` with `{ once: true }`. Browsers start audio only on an
  activation gesture, and scrolling never is one, so a visitor who only scrolled heard nothing until a click. On
  phones `touchstart` is not an activation either: the one-shot listener was spent, the AudioContext stayed suspended,
  and nothing retried. Fix (`landing-sound.js`, unit-tested; `script.js`): listen for every activation gesture
  (keydown except Escape, mousedown, a mouse pointerdown, a touch/pen pointerup, touchend, click) until the music has
  really started; also try at load, so a browser that allows it plays at once. A 1.2 s fade-in, bars queued on the
  audio clock a second ahead (no gaps when the main thread is busy), paused with the tab hidden.
- **5 minutes, then it stops.** Counted in visible time; then a 2.5 s fade-out. The sound button plays it again (a
  fresh 5 minutes).
- **The sound button.** Bottom right, 44 px, the playground toggle's cream-and-wine family, four thin bars that move
  while playing and lie flat when not. It mutes everything (music, the playground video, its hits) and the choice is
  remembered (`localStorage` `brivia-landing-sound`); it fades in after the intro and hides under the menu and the
  auth modal. Honest limit: no browser lets a page start sound before a first tap, click or key; scrolling alone can
  never start it.
- **Smooth scroll = arovas.in's.** Their bundle runs Lenis (`lerp: 0.1`, anchor offset -72). The landing now does the
  same (`lenis@1.3.26`, pinned; the 2026-10-15 1.3.27 was too new), for a mouse or trackpad only: phones keep the
  browser's momentum scrolling, reduced motion keeps plain scrolling, and the auth page is untouched. The menu and the
  auth modal stop it while open. `html { scroll-behavior: smooth }` is switched off under Lenis.
- **Cheaper frames (measured, `tests/e2e/landing-smoothness.mjs` and a Chrome trace).** The only janky region was the
  matching scene: its endless loops re-rasterized a 1,500 px SVG, and the scroll drift restarted 0.8-1.2 s CSS
  transform transitions on large layers every frame. Now: the drift and pointer values are non-inherited registered
  properties (an update restyles one element, not the SVG subtree); the CSS transform transitions are gone (Lenis
  smooths the scroll, a rAF loop eases the pointer); the moving layers have their own GPU layer; the scene's
  decorative loops pause while it is scrolling and when it is off screen (the showreel's too); the nav-contrast check
  and the custom cursor write once per frame (the cursor as a transform). Result in the scene, per rendered frame:
  3.7 ms of main/raster work instead of 5.7 (style halved, raster -38%), while rendering about 50 % more frames
  (the Lenis glide). The phone probe is a steady 60 fps. The container has no GPU, so desktop headless frame times
  still drop in that scene; check it on a real laptop.

## D-064: The hero plays on "3g" connections; the chat room photo is softly blurred again (2026-10-18)
- Accepted 2026-10-18 (founder, from the live site: "the hero video is not playing" on a phone; the chat "a little
  blur and classy, like the picture, same wine").
- **Hero root cause.** D-063 made `effectiveType` "2g" and "3g" poster-only. Chrome derives "3g" from latency alone
  (round trip of 270 ms or more), so Wi-Fi calling and many mobile networks in India report it with plenty of
  bandwidth; the founder's phone got the poster only. Reproduced in Playwright (navigator.connection stubbed): "3g"
  requested no hero file before the fix and plays the portrait AV1 after it. Now only "slow-2g" and "2g" are
  poster-only (`landing-motion.js`, unit-tested; the inline intro check in `index.html` matches). Also: if a muted
  autoplay is refused (Low Power Mode on iPhone, some Android battery savers), the first touch, click or key starts
  the hero (it has no audio track, so this never plays sound).
- **Chat.** The founder's reference is the earlier soft look: the room photo lightly blurred under a cream veil. It is
  now baked into `media/assets/chat-room-soft.webp` (sharp: blur 5 at 1600 px, a 20 % cream veil; 21 KB), so there is
  no live CSS filter to repaint while scrolling. The wine stays `#5a061e` (sampled from the reference: identical).
  Sidebar order as in the reference: search, then "BRIVIA SOCIETY", then the tagline and conversations; the
  "BRIVIA AI · THOUGHTFUL CONNECTIONS" footer line is back, in the serif face.

## D-065: The repository is organized into site/ and source-media/ (2026-10-18)
- Accepted 2026-10-18 (founder: "first of all organizing the repository", option "Full reorganize").
- **Before.** 162 items at the root: 8 pages, 46 stylesheets, 33 scripts, 59 stray review screenshots (25 MB, none
  referenced) and a product .docx next to the configs, plus `Images/` and `assets/` (raw originals, 258 MB) beside the
  optimized `media/`.
- **After.** `site/` is the Vite root: pages at its top (so every URL, the Vercel rewrites and the stored cover paths
  stay the same), `site/styles/`, `site/scripts/`, `site/media/`. Raw originals moved to `source-media/` and are
  excluded from deploys (nothing shipped reads them). The screenshots and the .docx are deleted. Only paths changed:
  relative imports and `url()`s were rewritten, `vite.config.mjs` sets `root: 'site'`, `outDir: '../dist'`,
  `envDir: '..'`; the media scripts, the style ratchet and the tests point at the new folders.
- **Proof.** The production build is pixel-identical before and after (`scripts/visual-parity.mjs`, 38 shots of the
  landing and auth pages at three widths); unit, ORBIT and every e2e suite pass; style and asset budgets unchanged.

## D-066: The landing on phones: hardware video decode, lighter cards, one scroll frame (2026-10-18)
- Accepted 2026-10-18 (founder: on phones "the animation and scrolling is not looking good"; keep the look).
- **Measured, not guessed.** New probe `tests/e2e/landing-phone-smoothness.mjs`: a 390x844 phone (touch, DPR 3, CPU
  slowed 4x), thumb flings top to bottom (raw touch events; `synthesizeScrollGesture` does not scroll headless).
  Every section but one holds 60 fps; all dropped frames sit in the matching scene. A trace there shows the main
  thread at ~3 ms per frame (real speed) and the frame time dominated by this container's software compositor (no
  GPU), so that scene must be judged on a real phone. Switching every animation in the scene off changed nothing
  measurable, so its look stays as it is.
- **Fixed (no visual change).**
  1. The hero kept the first codec the browser called "smooth": AV1. Phones without an AV1 chip (most mid-range
     Android) decode the 4K portrait stream on the CPU, the same CPU that scrolls the page. `pickHeroSource` now
     prefers a smooth *and* power-efficient (hardware) decode, so those phones get the same picture in HEVC or
     H.264 (unit-tested).
  2. The eight matching-scene cards (~160 px wide on a phone) were decoded from 1,450-1,600 px files mid-scroll.
     They now offer an 800 px copy through `srcset` (`npm run media:cards`), still sharp on a 3x screen; 60 % fewer
     bytes. The full-bleed backgrounds keep the full files.
  3. Three scroll handlers each read layout, and the services counter rewrote its text on every scroll frame of the
     whole page. Now one scroll frame runs all reads, then all writes, and the counter writes only when its number
     changes while it is on screen.
  4. The page sound button and the playground's own sound button stacked in the bottom-right corner as the
     playground scrolled past; the page button now steps aside while the playground stage is on screen.

## D-067: Guided signup, one question per screen (Phase E, 2026-10-18)
- Accepted 2026-10-18 (founder: "one question per screen, specially for mobile... similar to the one we will build for
  the app. With icons above showing the present, done and pending pages in bubbles that go with the theme"; scope
  "Full Phase E plan": email-code login, Google, no phone or gender, migration 0007).
- **What ships.** `auth.html#signup` opens the guided flow (UX_SPEC §A0): email code or Google, then 18+, name, area,
  interests, reveal. A bubble stepper (done / current / pending, with icons) and "Step n of N". Each answer saves on
  its button through the existing RPCs; a returning member resumes where they stopped. No phone, gender, password or
  points are asked. Interests are saved with an even split of the 20 points (ORBIT §3.2 note; the engine and the
  server rules are unchanged). Private (sensitive) interests are not offered during signup (they need their own
  consent screen); the app has no screen to add them or to re-weight interests yet: a follow-up.
- **Passwordless members.** They log in with "Email me a code instead" (`shouldCreateUser: false`) and confirm an
  account deletion with an emailed code (`reauthMethod` → `code`, set by `user_metadata.passwordless`).
- **0007.** The notice moves to 2026-10-20 (new members give no phone or gender); 2026-10-05 stays accepted for 14 days.
  Apply it **before** deploying this client (a database without it refuses the new version).
- **Switches.** `VITE_SIGNUP_METHODS` (default `google,email`; `none` closes signup). `VITE_SIGNUP_FLOW=classic`
  restores the old 4-step form for one release, as a no-code rollback; its code and its e2e suites (onboarding,
  consent, pinned to classic) stay until then. The classic form still asks for a phone and gender, so the privacy
  notice's "we do not ask new members" holds only while the guided flow is on.
- **Deviations from the plan file.** The old form is kept behind the switch rather than deleted (rollback, and its 269
  onboarding checks); the Reveal uses qualitative copy without a deck call; private interests are not offered (no consent screen in it).
- **Founder dependencies.** (1) Apply 0007. (2) Supabase Auth email template: add `{{ .Token }}` (the 6-digit code) to
  the Magic Link template; until then the email's link still signs the member in and resumes the flow. Custom SMTP
  is strongly advised (the built-in sender is heavily rate limited). (3) Google provider enabled for "Continue with
  Google" (already offered on login). Proof: `node tests/e2e/signup.spec.mjs` (56 checks, port 5193).

## D-068: The guided signup keeps phone, gender and password; only the points screen goes (2026-10-18)
- Accepted 2026-10-18 (founder, after D-067: "we need these as well... we can add 2 questions per screen, remove only
  the points, but we will need the interests").
- **Screens.** Email path: Email → Code → Password (password + confirm) → About you (name + "I'm 18 or older") →
  Details (phone + gender) → Area → Interests (7 steps). Google path: About you → Details → Area → Interests (4 steps,
  no password). Two questions share a screen only where they belong together. The points screen stays gone: interests
  save with the even split (D-067).
- **Password.** A brand-new account made by the email code is marked passwordless and gets the Password screen next;
  saving it (`updateUser({ password })`) clears the mark, so login and account deletion use the password as before.
  "Email me a code instead" stays as a second way in. An existing member who logs in by code keeps their password.
- **Phone and gender** are written to the same `profiles` columns the classic form used (`phone`,
  `phone_country_code`, `phone_number` digits, `gender` as Male / Female / Prefer not to say); the phone stays private.
- **0007 withdrawn.** Its only purpose was a new notice saying new members give no phone or gender. With both collected
  again, the live notice 2026-10-05 is accurate, so 0007, its test and the client version bump are removed before ever
  being applied (0007 was never live; 0001–0006 are untouched). The deploy no longer needs a SQL step.
- **Proof.** `node tests/e2e/signup.spec.mjs`: 68 checks at 1440 and 375 px, including mismatched passwords, the 18+
  box being required, declare_adult before the name save, and phone + gender saved on the member's own row.

## D-069: Back to the classic signup form; the guided one-question-per-screen flow is removed (2026-10-19)
- Accepted 2026-10-19 (founder: "Revert the sign up flow to the previous form. Remove this one screen one ques").
- **What changes.** D-067 and D-068 are reverted in code: the 4-step form (UX_SPEC §A, with phone, gender, password,
  experience and the Passion Budget) is the only signup again. Removed: `signup-screens.js`, `signup-flow.js`,
  `otp-input.js`, `signup.css`, `#guided-signup`, the email-code login link, the code re-check in the delete dialog,
  `evenSplit`, the `VITE_SIGNUP_FLOW` / `VITE_SIGNUP_METHODS` switches and the signup e2e suite. The privacy notice stays
  2026-10-05; no migration was ever applied for D-067, so the database needs nothing.
- **Members who signed up with the guided flow** keep their accounts. Each set a password on the screen after the code
  (D-068); one who stopped before it can use "Forgot password?" on the login page.
- **Kept from the same period:** the repository layout (D-065), the removed login/signup quote, and the phone
  smoothness work (D-066).

## D-070: The database did need a change after D-069: 0009 and 0010 are live; 0011 restores the 2026-10-05 notice (2026-10-20)
- Accepted 2026-10-20 (founder-directed correction). No agent-arena round: a factual correction of D-069 with one
  forced fix; the only design choice (keep accepting `2026-10-20`) is recorded below.
- **What D-069 got wrong.** It said "no migration was ever applied for D-067, so the database needs nothing". In fact
  the founder applied `0009_signup_minimisation.sql` and `0010_open_test_world.sql` on the live project on 2026-10-14
  from branch `claude/jolly-edison-49xvza`, and neither file was on `main`. Verified read-only on 2026-10-20: live
  `brivia_notice_version()` = `2026-10-20` and `brivia_notice_accepted('2026-10-05')` = `true`, but only until
  `'2026-10-20'::date + 14` = 2026-11-03. `main`'s client sends `2026-10-05` (`site/scripts/notice-version.js`) and
  `site/privacy.html` is 2026-10-05, so from 2026-11-03 every `declare_adult` on the live site would fail with 22023
  and no new member could finish signup. D-069 itself stays as written (append-only); this entry corrects it.
- **Recorded.** `0009` and `0010` are copied into `supabase/migrations/` verbatim from that branch (they are live, so
  frozen), with their tests (`p0e-notice`, `d-open-world`, `p0e-underage-delete`) and the `d-tester-world` guard
  allow-list entry for `brivia_tester_world`. `p0e-notice` is changed only where `0011` supersedes it (each change is
  commented). `0010` needs `0008`'s `brivia_tester`, so `0008` is live too.
- **Fixed in `0011_notice_version_2026_10_05.sql`.** `brivia_notice_version()` returns `2026-10-05` again, the accurate
  notice now that the classic form collects phone and gender (D-068/D-069). `brivia_notice_accepted(v, at)` is true for
  `2026-10-05` and for `2026-10-20` at any date, false otherwise. `2026-10-20` stays accepted so the members who
  declared it during 14–20 Oct (and any cached guided-signup tab) are never treated as stale; nothing else compares a
  stored `notice_version` (consent rows are append-only history; deletion and retention never read it), so their rows
  stay as declared. Same signatures, volatility, invoker security and grants as `0009`; `declare_adult` is unchanged
  (it already defers to `brivia_notice_accepted`). Server-written consent rows record `2026-10-05` from then on. No
  client change. Proof: `supabase/tests/p0f-notice-restore.test.sql`, which simulates a date after 2026-11-03 and fails
  against `0009` alone.
- **Founder actions.** Apply `0011` before 2026-11-03 and run the read-only check in `supabase/migrations/README.md`
  ("0011"). The open-test-world switch is **on** live: close it (it should be open at most 6 nights, so no ~3 km band is
  earned on test members) and run the purge before real launch. The `0010` header's backlog item ("0011 keys density on
  `brivia_tester_world`") moves to a later migration number.

## D-071: "Send without a note" on the pitch sheet; the D-018 close rule is unchanged (2026-10-20)
- Accepted 2026-10-20 (founder request: a clear way to send the like without writing a note). No agent-arena round:
  a small additive control that reuses an existing, already-ruled path; consent and quotas are untouched.
- **What ships.** Under SEND PITCH, a secondary text button "Send without a note" (`.pitch-no-note`, `type="button"`,
  full width, at least 44 px tall, deep-wine underlined text, tokens only). It calls the same path as closing the sheet
  (`closeOverlays` → `dismissPendingPitch`): exactly one `send_signal` with `p_note: null`, the same quota decrement and
  re-read, the same toast and the same card advance; a failed send brings the card back, as for close.
- **Never twice.** `claimPendingPitch` already resolves a like once; on top of that the button does nothing when no
  like is pending, while SEND PITCH is in flight (it is disabled then), and within 400 ms of the sheet opening (the
  same ghost-tap window as the backdrop, since on phones the button sits low where the Pitch tap landed).
- **D-018 unchanged.** Closing, Escape, the backdrop and moving to the next card still send one request without a note;
  SEND PITCH still sends one with the note. The founder's open question from D-061 (should cancel send nothing?) stays
  open; this button makes the no-note send explicit without changing what close does.
- **Also.** The sheet's × keeps its 29 px circle but gets a 44 px target, `type="button"` and
  `aria-label="Close and send without a note"` (honest about what closing does). axe flagged the sheet's
  "Tell {name} why..." line at 4.42:1; it now uses `--color-ink-soft` (7:1).
- **Proof.** `tests/e2e/consent.spec.mjs` section 9b at 1440 and 375 px: one POST with note null and the card advances
  and the counter drops; a double tap sends one; a tap in the opening window sends nothing; SEND PITCH with a note
  still sends the note once even with a tap on the new button in flight; the × is 44 px with a label; no sideways
  scroll; axe clean on the open sheet. The existing D-018 checks (sections 1-5, 8, 9) pass unchanged.

## D-074: Explore post cards, private likes and saves, and the clean badminton illustration (release C of the polish wave, 2026-10-21)
- Accepted 2026-10-21 (founder request: Explore posts become wine cards with Like, Comment, Share and Save). Spec:
  `docs/superpowers/specs/2026-10-21-polish-wave-design.md`, part C. D-072 (A), D-073 (B) and D-075 (D) are separate.
- **Card anatomy.** A cream sheet (24 px radius, soft wine shadow) with a `--brivia-wine` header bar (avatar, the author's
  name in Bodoni Moda as a 44 px profile trigger, the date), a 4:5 image, a fixed two-line caption so every card in a row
  is the same height, and a `--brivia-wine` action bar of four cream icon buttons with 12 px labels (Like, Comment,
  Share, Save), each at least 44 px. Tokens only. Reduced motion: no movement. `site/scripts/post-card.js`,
  `site/styles/explore-cards.css`.
- **Grid.** One column up to 480 px, two from 640 px, three from 1024 px. No sideways scroll from 320 to 2560 px.
  "New post" is a wide wine button above the feed. Loading shows card-shaped skeletons of the same size.
- **Name, not a handle.** Cards show the member's display name. Profiles have no `@handle`, so none is invented.
- **Persistence (own rows only, no counts).** `community_post_likes` and `community_post_saves` hold one row per
  (member, post); RLS lets a member read, insert and delete only their own rows. There is no count, no RPC and no
  public total: a member sees only their own Liked and Saved state, and nobody sees who liked what. Blocked and
  cross-world posts are refused (tests in `supabase/tests`). Taps are optimistic with an in-flight guard (a double tap
  sends one request); a failure rolls back to the server truth, with the toast "That didn't save. Please try again."
  except for a 42501 refusal, which rolls back silently.
- **Share is a link only.** `navigator.share({ title, url })` with the post's `?post=<id>` link (no caption, no name);
  without it the link is copied and "Link copied." shows. `explore.html` forwards `?post=` so the link opens the post.
- **Comment opens the detail sheet; no comment storage in this wave.** The sheet shows the image, caption, author and
  date. Its one action is "Reply in chat" when the two members are matched (the chat opens with the composer prefilled
  `Re: "<start of caption>"`), otherwise "View profile". Mutual consent is unchanged: a stranger's post never opens a
  chat. Public comments are a later decision.
- **The 0012 tables are applied once by the founder.** The likes/saves tables live in `0012_polish_wave.sql` section C.
  The founder applies 0012 once, after parts A, C and D are on `main` (the file holds A's, C's and D's SQL). Until
  then, Explore hides Like and Save gracefully: a missing table (`42P01` "does not exist" or PostgREST `PGRST205`
  schema-cache error) hides those two buttons, Comment and Share stay, every card still renders and nothing throws.
  Proof: `tests/e2e/explore-cards.spec.mjs` scenario 11 (both error shapes, card count, no page errors).
- **Clean badminton illustration.** `site/media/assets/badminton-premium-no-shuttle.webp` (landing hero art and a
  sample post image) had a grey checkerboard, the fake-transparency pattern, baked into its pixels behind the players.
  Rebuilt in this session with Python and Pillow: the low-saturation grey checker cells (including those showing
  through the racket meshes) are replaced by the solid brand cream `#fffaf1` (`--color-cream`), the anti-aliased grey
  fringe is blended away, and specks are removed; the player art is untouched. Same name, same 1555x1011 size, now 75 KB
  (was 258 KB); the source original `source-media/assets/badminton-premium-no-shuttle.png` was replaced the same way.
  The other presets were checked visually: the 18 cover photos and `guitar-premium.webp` (true alpha) have no
  checkerboard. `badminton-premium.png` (with shuttle) is not shipped. `npm run check:assets` passes.
- **Proof.** Unit tests for the card markup and reaction helpers; `tests/e2e/explore-cards.spec.mjs` (columns, 4:5
  media, wine bars and contrast computed, targets, double tap, rollback, persistence across reload, share, detail,
  deep link, skeletons, axe at 375 and 1440). Screenshots at 320, 375, 390, 768, 1280, 1440 and 1920.

## D-075: Resumes, chat quick-share and the typing indicator (release D of the polish wave, 2026-10-22)

- **Resume storage.** One PDF per member at `resumes/<uid>/resume.pdf` in a private bucket (5 MB, PDF only, enforced by
  Storage and checked in the client: type, size and the `%PDF` magic bytes). `profiles.resume_path` is readable only by
  the owner. Replace and remove are supported; a failed profile write after a first upload rolls the file back.
  Account deletion counts a stored resume as a member file (the client removes it first).
- **Sharing a resume is a message, not a link.** "Share my resume" sends a `resume` message that carries only the
  sender's own path. The recipient opens it with a 60 s signed URL created on open and never stored. Storage allows
  that only while the pair can still message (`brivia_can_message`: matched, not blocked either way, same world), so an
  unmatch or block closes every old share at once. Copy: "They'll always see your latest resume."
- **Sharing your area is text only.** "Share my area" sends the member's own `place_label` (with "about a 2 km area"
  unless it is city-wide) after a confirm sheet. Never coordinates or a cell id (ORBIT section 4.1 bullet).
- **Typing indicator.** A Realtime broadcast on the private channel `typing:<lower id>:<higher id>`, authorised by
  `realtime.messages` policies: matched, same world, and the caller has not blocked the other. A blocked member's join
  still succeeds, so a block is never revealed; nothing reaches them or from them. The client never joins for a
  blocked pair and drops typing at once on a block. Payload is only `{ typing: boolean }`. One re-join is attempted when
  the tab becomes visible or the network returns; a refused join is never retried in a loop.
- **0012 split.** 0012 went live with sections C and D only, because C's client was already live without its tables
  (Like and Save were hidden). A5 (blocked sends withheld) moves to `0013`.
- **Open question for the founder/counsel:** whether `privacy.html` should list the optional resume. The notice
  version is unchanged in this wave.

## D-072: Location, chat fit, notifications over chat, the account menu, and the showcase cards (release A of the polish wave, 2026-10-22)

- **"Use my location" (A1).** Most likely cause (reasoned from code and reproduced locally, not on the founder's device):
  a 15 s guard started at the click covered both the permission prompt and the first fix, so a member who read the
  prompt and pressed Allow could still be told to pick a city, and the late answer was thrown away. Now a late answer
  is kept up to 30 s from the click; at 15 s the city list opens with "Still waiting for your browser…". A blocked or
  OS-disabled location (codes 1 and 2) gets its own line, the denied one pointing to device settings; a timeout offers
  "Try again". Coordinates are still never stored or shown (only the ~2 km cell).
- **Chat fits short laptop screens (A2).** Thread, list and composer fit 720-1080 px tall viewports; photo bubbles are
  capped at `min(38dvh, 320px)` (tap opens full size); safe-area insets on the sides; no side gutter in the chat view.
- **Notifications open above the chat list (A3).** The panel is a manual popover in the top layer, anchored to the
  bell; it closes when another layer opens; Escape closes only the topmost layer.
- **Account menu (A4).** A compact popover on desktop that sizes to its rows, sets the insets it does not own to
  auto (the founder's tall Safari box, most likely leaked popover insets; not reproducible in Chromium, covered by a
  regression test that injects them), is capped below the header and never covers the gear. On phones (600 px and
  less) it is a bottom sheet with a solid scrim (taps never reach the page), swipe down to close, and page scroll lock.
- **Showcase cards (A6).** "Yugansh Tyagi" and "Keshav Jha" were never accounts; their cards, photos and sources are
  removed from the auth page marquee, which loops 9 cards at the same per-card speed (31 s).
- **Blocked sends withheld (A5)** ships separately with migration `0013`.

## D-076: The Connect card is always tall on desktop, like the phone card (founder, 2026-10-22)

- **What happened.** D-059 (2026-10-14, "card and controls aligned") sized the desktop card from the window height so
  the card and Pass / Pitch always fit on screen. On a short laptop window (1366x633, a 768 px screen minus browser
  bars) that squashed the card to 352x400: nearly square, the View profile button cut off. The polish wave did not
  change it (measured identical before and after).
- **Decision.** The founder wants the card long, not wide, like the phone card. On desktop the card height is now
  `clamp(600px, 100svh - 262px, 700px)` (the signal-limit state `clamp(600px, ..., 640px)`) at the same 352 px+ width,
  so it is always at least 1.6 tall per 1 wide. On a short window the page scrolls to Pass / Pitch, which stay
  centred under the card. Phones are unchanged.
- **Proof.** `tests/e2e/deck.spec.mjs` desktop layout check at 1920x1080, 1366x768, 1440x900, 1280x720 and 1366x633:
  card height at least 1.6x its width, controls centred under it and reachable; on screen at 880 px tall and above.

## D-077: A blocked member's messages are stored and withheld, never refused (A5 of the polish wave, 0013, 2026-10-22)

- **Founder ask.** A blocked member could not send at all, which looked like a bug and revealed the block. Now they
  type and send as normal; the message shows as sent in their own thread only.
- **How.** `0013_blocked_sends_withheld.sql` (0012 is live and frozen, so A5 left 0012). The insert policy uses
  `brivia_can_send` (matched + same world, no block clause). An AFTER INSERT trigger, under the same pair lock as the
  block trigger, marks a message withheld when either member has blocked the other (`brivia_private.withheld_message`,
  no grants). Every recipient read path excludes withheld rows: the messages select policy (so the inbox, unread
  counts, notifications and Realtime `postgres_changes`), the message-attachments policy and the resume policy.
- **Rules.** Either direction; permanent (an unblock never releases a withheld message); the block is never
  revealed; `report_member` evidence still includes withheld rows (moderation only). An unmatched pair is still
  refused, and the client's refusal copy is now neutral ("You can no longer message this member.").
- **Known trade-off.** A blocked member can keep storing messages that nobody sees; `report_member` evidence is the
  latest 50 rows, so a long withheld flood can push older messages out of that window. Revisit with the P0-C
  moderation work (rate limit or evidence that keeps pre-block messages).

## D-078: The auth page profiles heading reads "Your kind is already here." again (founder, 2026-10-22)

- The founder asked for the original line on the login page's profile section: eyebrow "A FEW PEOPLE IN THE ROOM",
  heading "YOUR KIND / IS ALREADY HERE.", keeping the current Bodoni serif heading font (only the words change).
- This reverses the R10 honesty copy on that heading (29f1e24: "EXAMPLE PROFILES", "THE KIND OF PEOPLE WE'RE BUILDING
  FOR."). The founder owns the product copy; the marquee cards are still showcase cards, not live members.

## D-079: The Connect card stays tall AND fits one screen on desktop (founder, 2026-10-22; refines D-076)

- After D-076 the tall card made short laptop windows scroll. The founder wants it in one frame, still long (not
  wide), with "Connection, curated." in the centre.
- The card height follows the window again (`clamp(400px, 100svh - 262px, 700px)`; under 820 px tall
  `clamp(360px, 100svh - 230px, 700px)` with smaller Pass / Pitch and a one-line-each hint), and the WIDTH now follows
  the height (`clamp(260px, 0.58 x height, 480px)`), so a short window gets a narrower tall card instead of a squashed
  one. Under 700 px tall the avatar, bar and cover shrink, and interest chips show in whole rows only (two rows under
  820 px tall, one under 700 px; "You both" chips first), so View profile always stays inside the card. The headline is level
  with the middle of the card. Phones are unchanged.
- Proof: `tests/e2e/deck.spec.mjs` desktop layout at 1920x1080, 1366x768, 1440x900, 1280x720, 1366x633, 1280x650 and
  1536x730: no scrolling, card at least 1.5 tall per 1 wide, View profile inside, controls centred under it, headline
  centred with the card.

## D-073: Guided signup again, interests only, Google kept; editorial login card (release B of the polish wave, 2026-10-22)

- **Founder ask:** one question per screen again; no points at signup, interests only; keep "Continue with Google";
  beautify login and signup "a class apart". This reverses D-069 (the classic form) at the founder's request.
- **Flow:** Welcome → Account (email path) → 18+ → Name → Details → Area → Interests → Reveal / Verify (UX_SPEC A0).
  Email + password with the account created at the end (no email code, so no Supabase template dependency); 18+ and
  Name on separate screens; phone and gender kept (D-068); interests only with `evenSplit` (ORBIT 3.2), private
  interests not offered; the answers go through the existing pipeline unchanged (`declare_adult` before area and
  interests). Notice version `2026-10-05` (0011). Classic behind `VITE_SIGNUP_FLOW=classic` for one release; Vercel
  leaves it unset, so production is guided.
- **Login:** one editorial deep-wine card (max 480 px) next to the telephone art, "Continue with Google" as a full
  labelled button, Bodoni headings, sentence-case buttons ("Log in", "Create an account"); the top-bar "Create account"
  pill is hidden on the login view. Ids and behaviour unchanged.
- **Review fixes:** Finish submits once (busy until the next screen; Back disabled meanwhile), the question is each
  field's description, Google start shows busy and a visible error, a resumed signup with unchanged picks keeps its
  points and modes.
- **Follow-ups:** "Forgot password?" is still a dead button (pre-existing; needs a reset flow and SMTP).

## D-081: The Connect card is the hero on desktop (founder, 2026-10-22; refines D-076 and D-079)

- **Founder ask** (1366x633 screenshot): "the main feature is taking the least place in the entire screen ... The ratio
  should be professionally allotted and the main feature shall grab the attention." The card was 260x403, pushed to
  the far right, while "CONNECTION, CURATED." filled most of the screen.
- **Decision.** From 850 px wide the deck is a two-part composition: a quiet headline column (40% of the content width,
  headline `clamp(44px, 5vw, 88px)`, eyebrow and filter button kept) and a card stage (60%) with the card centred in it.
  The card height uses the window (`100svh` minus the top bar, padding and, under 1100 px, the controls; 400-880 px,
  up to 1040 px on screens 1200 px and taller) and its width is 0.64 x the height (about 1.56 tall per 1 wide). From
  1100 px Pass sits left of the card and Pitch right of it, level with its middle; under 1100 px they stay centred
  under the card. The hint ("PASS WITH INTENTION · PITCH WITH PURPOSE", then the signal counter) becomes a quiet
  two-line caption in the headline column, level with the card's bottom edge, so the card gets the full height.
  Content is capped at 1600 px and centred on very wide screens. The card has a deeper wine shadow; the stacked next
  card behind it is unchanged. Phones (780 px and less) are unchanged. CSS: `reference-design.css` (D-081 block); the
  old D-059/D-079 grid in `deck.css` is removed.
- **Numbers.** 1366x633: card 260x403 (104,780 px²) -> 327x511 (167,387 px²). 1440x900: 370x638 -> 486x759.
  1920x1080: 406x700 -> 563x880.
- **Proof.** `tests/e2e/deck.spec.mjs` desktop composition at 1366x633, 1280x650, 1280x720, 1366x768, 1440x900,
  1536x730, 1920x1080, 2560x1440 and 1024x768: no document or sideways scroll, card at least 1.45 tall per 1 wide and
  below the top bar, View profile inside, headline within 20 px of the card's middle, Pass / Pitch at least 56 px
  (flanking within ±20 px from 1100 px, under the card below), no overlap between headline, card, controls and hint,
  the stacked card lined up, at 1366x633 height >= 470 and area >= 145,000 px², and larger cards at 1440x900 and
  1920x1080. The swipe, stamp, pitch-sheet, keyboard and reduced-motion checks run at 1440x900 on the new size.

## D-080: Frame your photo before upload; covers only from the provided set (founder, 2026-10-22)

- The founder: "for profile picture i want the portion selector feature so that the user can select which part of the
  picture will be visible and it shall match the theme of the Brivia. Then i also need to remove the change cover picture
  options. I don't want anyone to use their own cover pictures. They can change between what all options is provided
  but not from their own."
- **Photo.** Picking a profile photo (Profile → EDIT PROFILE and signup step 4) opens "Frame your photo", our own small
  module (`site/scripts/photo-crop.js`, pure maths in `photo-crop-math.js`; no third-party cropper, to keep the bundle
  small and the brand exact). A circular mask over a cream square stage (avatars are round); drag, pinch, wheel, a
  1x–4x slider and the keyboard; the photo can never leave empty space in the circle. The member's choice becomes an
  800 × 800 JPEG (EXIF orientation applied), which then takes the existing re-encode (R12) and upload path. Cancel
  uploads nothing. The module loads only when a photo is picked, so the landing and auth bundles do not grow.
- **Covers.** Members choose from the 18 provided covers only; no surface can upload one. The profile editor's "COVER
  PHOTO" file field is replaced by a picker of the same covers (and titles) as signup, the current one marked; the
  upload code (`uploadProfileCover`) is removed. A cover is stored as `/Images/Cover%20images/<file>` (the signup
  picker used to store the build URL of the image, which is where the live `/assets/<name>-<hash>` values came from).
- **Server (0014).** A trigger (not a CHECK, so untouched rows are never re-validated) allows only null, `''` or one of
  the 18 paths on insert or update of `cover_url`; an unchanged value passes. The `profile-covers` insert and update
  Storage policies are dropped; select and delete stay (old files can be removed; account deletion still works). A
  one-time cleanup maps the two live legacy `/assets/` values to their preset and nulls the one uploaded cover; seeded
  test members are untouched. SQL never deletes Storage objects: the founder removes the old file in the dashboard
  (README "## 0014"). Deploy the client before applying 0014.
- The 18-name list exists three times (client `preset-cover.js`, `cover-assets.js`, SQL); `tests/unit/preset-cover.test.mjs`
  pins them, and the signup page, equal. Adding a cover means a new migration that redefines
  `brivia_private.brivia_offered_cover_keys()`.
- Proof: `tests/unit/photo-crop.test.mjs`, `tests/unit/preset-cover.test.mjs`, `supabase/tests/media-covers.test.sql`
  (V1-V5) and `tests/e2e/profile-media.spec.mjs` (crop, cancel, covers; 320-1920, axe at 375 and 1440).

## D-082: Register lines up with login, login fits one screen, no swipe tagline; the Connect card reads as a stack (founder, 2026-10-22)

- **Founder ask** (screenshots from a 1920x1080 screen in Chrome; the card widths show 125% scaling, so the CSS
  viewport is about 1536x709): the register Welcome card sat left of the login card (x ≈ 805-1480 vs 955-1555 device
  px) and "Find your people." wrapped; the login card was cut off at "New here? Create an account"; drop "SWIPE /
  DISCOVER / CONNECT" from login and register; the Connect card should read as a deck again.
- **Register.** From 781 px every guided screen starts at the login card's left edge (the panel's centre minus 240 px,
  never past the panel's right edge) and is 576 px wide, so the card does not move between login and register or
  between steps. The question heading takes the login heading's size (`clamp(34px, 3.6vw, 46px)`): a legacy
  `.auth-signup h1` rule in auth-polish.css had outranked signup.css and set it to 4vw (up to 76 px). From 1100 px the
  Welcome title and subtitle are one line each. Phones (780 px and less) are unchanged. Between 781 and about 1000 px
  login and register keep their different pre-existing compositions (login has no phone art there).
- **Login.** The card's padding and inner gaps follow the window height (`svh` clamps; inputs 46-52 px, buttons 48-56
  px, every target still at least 44 px), and the panel's top and bottom padding shrink on short windows. 1366x633:
  card 703 -> 584 px tall, bottom 728 -> 609 (of 633); 1536x709: bottom 732 -> 658; 1280x720: 729 -> 665. Tall screens
  keep the generous card.
- **Tagline.** The span "SWIPE / DISCOVER / CONNECT" beside "Your kind is already here." is removed from auth.html,
  with its now-dead CSS.
- CSS: `auth-refresh.css` (D-082 block). Proof: `tests/e2e/signup.spec.mjs` (left edges within 2 px at 1100-1920,
  Account and 18+ on the same column, title and subtitle one line each, the whole login card on screen with 8 px to
  spare and no panel scroll at 1920x886, 1536x709, 1440x780, 1366x633 and 1280x720) and
  `tests/unit/showcase-cards.test.mjs` (no tagline).
- **Connect deck as a stack** (founder: "the card should look stacked, as it did earlier"; refines D-081). The next
  member's card peeks out 12 px below the top card at 96% width, and a plain deeper layer (`#swipe-card-back`,
  decorative, aria-hidden) 24 px below at 92%, both opaque, in the card's paper with the same oxblood edge and a soft
  shadow (the next card used to sit at 72% opacity and a fainter edge, which hid the stack). The deeper layer shows
  only while two or more members wait behind the top card, and neither layer exists behind the last card. While the
  top card is dragged the deeper layer never moves and the next card only rises in place, as before. Desktop reserves
  24 px under the stage (`--deck-peek`; the card is 24 px shorter, and the headline, Pass / Pitch and hint keep their
  D-081 alignment with the card); phones keep their layout with 24 px more under the card. Reduced motion: no layer
  animates. CSS: `deck.css`, `reference-design.css`; markup `app.html`; `renderNextCard` in `app.js`. Numbers:
  1366x633 card 327x511 -> 312x487 (152,045 px², still >= 145,000), 1440x900 486x759 -> 471x735, 1920x1080 563x880
  -> 563x880 (width-bound). Proof: `tests/e2e/deck.spec.mjs` (two layers +12 / +24 px, narrower, opaque, inside the
  stage, at every D-081 size and at 375x812 and 320x640; layers still mid-drag; one layer with one member left, none
  behind the last; reduced motion).

## D-082b: Guided signup: a bar stepper, calmer questions in the right half, the interest picker by category (founder, 2026-10-22)

- **Founder ask** (1920x886): drop the big icon circles and step names; centre the card in the right half of the
  screen (the telephone keeps the left half), and centre the login card the same way, replacing D-082's "line up with
  the login card"; smaller questions on one line; the interests "wall of capsules" should look professionally
  designed, with the "Your picks" tray no longer floating over the chips. A dropdown was considered and rejected: it
  hides the options and is poor for multi-select, especially on phones.
- **Stepper.** One thin bar per question (6 on email, 5 on Google): done = filled wine, current = part-filled, pending
  = the bare track. The container is a `progressbar` (aria-valuenow / valuemax / valuetext "Step n of N") and
  "Step n of N" stays as visually hidden live text. No icons, no step names.
- **Position and type.** From 1100 px the auth shell is two equal columns on login and every guided screen; the
  login card (480 px) and the guided card (up to 620 px) are centred in the right half, across and down. The
  question heading and "Welcome back." are `clamp(28px, 2.4vw, 40px)` (phones `clamp(28px, 8vw, 34px)`): "Find your
  people." and "Are you 18 or older?" are one line at 1440 and 1920. Under 760 px tall the guided card is tighter.
- **Interests.** Search on top (it searches every category and sets the tabs aside), a compact one-row "Your picks"
  tray in the flow (its picks scroll sideways; it can no longer cover a chip), a scrollable tablist ("Popular", then
  one tab per top-level category; roving tabindex, arrow keys, Home and End, arrow buttons and edge fades on desktop
  pointers), and one category's chips at a time in a fixed-height panel that scrolls inside, with a fade while more
  chips are below. "Popular" is the popular labels found, topped up across the categories to 16
  (`groupInterests` in `signup-flow.js`, unit-tested). The 1-12 limit, the toggle buttons with aria-pressed, the
  flying chip and the even split are unchanged. The whole screen fits 1920x886 and 1440x900 with Back and Finish in
  view; on phones the page scrolls and the action bar stays pinned.
- Proof: `tests/e2e/signup.spec.mjs` (bars and their fills, progressbar values, no icons or names; login and guided
  centres within 24 px of 75% of the width and of the middle at 1100-1920; headings at most 40 px and one line;
  tabs, arrow keys, one category per tab, search across categories, the tray never intersecting the tabs, the panel or
  a chip, Back and Finish on screen at 1920x886 and 1440x900, axe, 44 px targets and contrast on the picker at 1920,
  1440 and 375), `tests/unit/signup-flow.test.mjs` (`groupInterests`).

## D-083: Public contact address moves to hello@thebriviaclub.live (founder, 2026-10-23)

- **Founder ask:** use the verified domain `thebriviaclub.live` for email. Every member-facing contact (landing CTA and
  footer, privacy notice and grievance officer, report dialog, under-review notice, account and deletion errors) now
  says `hello@thebriviaclub.live` instead of `thebrivia.club@gmail.com`. `UX_SPEC.md` and `BREACH_RUNBOOK.md` follow;
  older plans and arena records keep the address they were written with.
- **Prerequisite (founder):** Resend only sends. Mail to `hello@` must be received (name.com email forwarding to the
  founder's inbox) before this ships, or safety reports and deletion requests bounce. 2FA covers the name.com account.
- **Notice version unchanged:** the privacy notice's substance is the same; only the contact address changed.
- **Domain:** `thebriviaclub.live` (and `www`, 308 to the bare domain) were added to the Vercel project on
  2026-10-23; DNS at name.com is the founder's step.
- Proof: `npm run test:unit` 313/313 (copy assertions updated); stub build OK, the new address is in `dist/`.

## D-084: Landing page title, description and link preview are Brivia's, not the template's (founder, 2026-10-24)

- **Found by the founder:** a WhatsApp share of thebriviaclub.live previewed "Balavignesh | Senior Product Designer".
  The landing still carried the portfolio template's `<title>` and meta description, plus a hidden contact section
  with the template author's portrait and bio.
- **Change:** a Brivia title and description, a canonical URL, Open Graph and Twitter card tags, and a 1200x630
  preview image (`site/public/og-image.jpg`: the hero poster under a deep-wine band, "BRIVIA CLUB" and the one-line
  vision). The hidden template section is removed; nothing referenced it and it was never visible.
- **Open:** `app.html`'s initial deck image `src` is still the template portrait (`media/assets/bala.webp`); the script
  replaces it before a card shows. Swap it for the branded placeholder when the deck is next touched.
- **Caches:** WhatsApp, LinkedIn and others cache previews; re-check with each platform's inspector after deploy.
- Proof: `npm run test:unit` 313/313; stub build OK; `dist/index.html` has 9 `og:` tags and no "bala"; asset budget OK.

## D-085: The login screen goes back to its pre-B4 look; login and signup behaviour unchanged (founder, 2026-10-23)

- **Founder ask:** "restore the previous login system UI. Do not alter the present flow for login or signup, but in the
  previous UI."
- **What changed:** only the login view's markup in `site/auth.html`, restored byte for byte from the commit before B4
  (`6bda976^`): "RETURNING MEMBER / JOIN THE CLUB / THOUGHTFUL PEOPLE. REAL MOMENTUM.", the glyph field icons, LOG IN,
  "Forgot password?", "OR CONTINUE WITH" and the round Google button, and "NEW HERE? CREATE ACCOUNT" in the panel's top
  bar. Without the `auth-card` class the B4 / D-082 login CSS in `auth-refresh.css` no longer matches anything, so the
  older auth CSS draws the screen again; the build renders pixel-identical to the pre-B4 build at 1440x900 and 375x812.
- **Unchanged:** `#login-form`, `#login-note`, `.auth-submit`, `.auth-forgot`, `.auth-google-trigger` and the create
  triggers keep their handlers in `script.js`; the guided signup (B2/B3, D-082b styling, Google) is untouched.
- The B4 login rules stay in `auth-refresh.css`, inert, so the editorial card can come back by re-adding the class
  and markup. B4's "Continue with Google" label and one-column checks are replaced in `tests/e2e/signup.spec.mjs` by
  checks on the restored screen and its behaviour (Google starts, "Create account" opens the guided Welcome); the
  D-082 login-centring and login-fit checks are dropped because they measured the B4 card.

## D-086: The guided signup wears the classic signup look; flow unchanged, no points screen (founder, 2026-10-23)

- **Founder ask:** "do the same with sign up as well but do not change the functionality as of now. I don't want the
  points system back."
- **Reading:** "the previous signup UI" is the classic 4-step form's look ("FIND YOUR PEOPLE", the one with the
  passion points). The functionality stays the guided flow's: the same screens in the same order (Welcome, Account,
  18+, Name, Details, Area, Interests, Reveal/Verify), the same checks, Google, the even split and the save pipeline.
  Bringing back the classic form itself was rejected: it has the points step and different fields (experience,
  looking-for, photo, cover), so it would change the flow.
- **What changed (look only):** a static classic head in the guided view (`auth.html`, `aria-hidden`, styled by the
  legacy `.auth-signup` rules like the classic view); `site/styles/signup-classic.css` (new, loaded last) restyles the
  guided screens with the classic form's computed values: no card, a 560 px column, "STEP n OF N" visible over a thin
  wine track (done and current filled), uppercase wine labels, classic inputs and square gender boxes, outlined and wine
  pill buttons, "ALREADY A MEMBER? LOG IN" in the top bar. On Welcome the screen's kicker and h1 are visually hidden
  (still the dialog's name). The B4/D-082/D-082b guided frame rules in `auth-refresh.css` are removed; the laptop
  interests panel is shorter (`100svh - 700px`, 112-300 px) so Back and Finish stay on screen at 1920x886 and 1440x900.
  No JS changed.
- **A11y kept:** 44 px targets, contrast >= 4.5:1 (the "or pick your city" divider uses the label colour, 74% wine),
  inputs 16 px on phones, the progressbar role and values, axe clean on every screen the spec audits.
- Proof: `tests/e2e/signup.spec.mjs` 285 passed (D-082b layout checks replaced by classic-column, one-line head and
  classic-track checks; text matches made case-insensitive for the uppercase labels), onboarding 269, location 64,
  unit 313.

## D-087: Light "aura" background after vampr.me, on preview only (founder, 2026-10-24)

- **Asked:** a background like vampr.me's (a light mesh of soft pastel glows, "not so dark") that merges with the
  existing theme. Preview branch only; **not merged to main until the founder says so.**
- **Done:** `site/styles/aura-theme.css` (loaded last by every entry) paints one fixed `body::before` layer: lilac,
  mint, blush and peach radial glows on a warm near-white (`--aura-*` in `tokens.css`, tinted to the wine brand).
  Flat cream page surfaces go transparent (app shell, profile page, inbox, login/signup frame, careers and privacy
  bodies, the landing's light bands); the top bar and chat list become frosted glass. The login phone uses the
  existing cut-out so it floats on the aura. Cards, photo and video art, and the landing's dark cinematic bands are
  unchanged, so text contrast is unchanged.
- **Why `!important`:** these surfaces are set by layered rules with `:has()` weight and `!important`
  (auth-polish.css, reference-design.css); the theme layer overrides `background` only.
- **Open:** the landing's dark bands (Meet your kind, Discover/Swipe, principles, process, footer), the careers header,
  and the pillars text panel keep their colours; lighten them next if the founder wants the whole landing on the aura.
- Proof: style ratchet OK, asset budget OK, `npm run test:unit` 313/313, build OK; screenshots at 390 and 1440 px.
- **Follow-up (founder, same day):** the aura also on Profile and Explore. Explore (`?view=posts`, the community
  feed) painted its own flat cream; it is now transparent. Profile and Explore cards (`--aura-card`, 66% paper) and the
  mobile tab bar are frosted glass so the glows show; dark ink on the card stays about 15:1, helper text about 6.5:1.

## D-088: Sign-in hand-off: one branded screen from sign-in to the app (founder, 2026-10-24)

- **Reported:** after logging in with email or Google, members saw the login (or landing) page for a few seconds
  before Connect.
- **Root cause (reproduced with a filmstrip, stubbed Supabase at 300 ms per call):** (1) `auth.html` showed the
  login card while `restoreAuthPageSession` checked an existing session, and kept it on "Checking your membership..."
  after an email sign-in, through `profiles` then `my_onboarding_status` one after another; (2) the hard navigation to
  `app.html` then showed a blank page (with a stray filter button and toast box) while the app repeated the same two
  reads in sequence; (3) the deck waited on blocks, then matches, then messages. A Google return that Supabase sends to
  the Site URL (redirect URL not allowlisted) left the member on the landing page.
- **Done:** `handoff.css` + one `.brivia-handoff` splash (wordmark, thin wine progress line, "Opening your club") on
  `auth.html` and `app.html`, on the aura. `auth.html` shows it before first paint when a session is stored
  (`html.brivia-handing-off`, inline head script, 8 s safety timer); `script.js` shows it after a successful email
  sign-in ("Signing you in"), when leaving for Google ("Opening Google") and on every redirect to the app, and ends it
  in `setAuthView` (so any form that has to show, such as onboarding, is never hidden or unfocusable) and on a
  back/forward-cache return. `app.html` shows it while `app-auth-pending`; nothing else leaks through and the app fades
  in. Independent reads run together: profile + onboarding status (app boot, login form, session restore) and
  blocks + matches + inbox. `index.html` forwards an OAuth return straight to the app, as `auth.html` does.
- **Measured (production build, 300 ms/call):** signed-in member opening `auth.html`: never sees the login card, app at
  ~1.2 s (was login card, blank, app at ~1.8 s); email sign-in app at ~1.5 s (was ~1.9 s); Google return ~1.0 s
  (was ~1.3 s), all on one continuous splash.
- **Tried and dropped:** a cross-document view transition; its mid-frame flashed white between two identical splashes.
- **Founder action:** in Supabase Auth → URL Configuration, the Redirect URLs must include
  `https://thebriviaclub.live/auth.html` and the preview pattern (`https://*-golus-projects.vercel.app/auth.html`),
  otherwise Google returns to the Site URL.
- Proof: `npm run test:unit` 313/313; e2e onboarding 269/269, signup 339/339, app-shell 208/208, consent 182/182,
  deck 195/195, landing 47/47; style ratchet, asset budget and build OK.

## D-089: "Continue with Google" is a full-width button matching LOG IN on the login page (founder, 2026-10-24)

- **Asked:** expand the Google button (a 34 px "G" circle under "OR CONTINUE WITH") to look like the login button.
- **Done:** on `auth.html` (`body.auth-page`) the Google trigger is a full-width pill with the same width, height,
  radius and letter-spacing as LOG IN (measured equal at 390, 1440 and 1920 px), outlined in chat-wine on cream as
  the secondary action, the coloured "G" and the visible label "Continue with Google" (accessible name unchanged).
  The landing's modal keeps its row of round social marks. CSS at the end of `auth-refresh.css`, tokens only.
- **Merged main (PR #6, D-085 and D-086 there):** this branch's aura and hand-off decisions were renumbered D-087
  and D-088.
- **Found, not fixed (founder to decide):** the login page's "Forgot password?" button has no handler, so a member
  who mistypes or forgets a password cannot reset it.
- Proof: `npm run test:unit` 313/313; e2e signup 285/285, onboarding 269/269, app-shell 208/208, landing 47/47;
  style ratchet, asset budget and build OK.

## D-090: "Forgot password?" works: reset by email inside the login card (founder, 2026-10-24)

- **Reported:** "Forgot password is not working on the live site." The button on `auth.html` had no handler at all
  (found in D-089), so a member with a wrong or forgotten password had no way back in by email.
- **Done:** inside the login card (same layout and styles; heading follows the step):
  1. "Forgot password?" swaps the login form for RESET PASSWORD / "We'll email you a link." (the typed email is kept),
     SEND RESET LINK calls `resetPasswordForEmail(email, { redirectTo: <origin>/auth.html })` and shows the same line
     whether or not the account exists ("If an account exists for ..."); rate limits read as "wait"; Back to log in.
  2. The emailed link returns with `#...&type=recovery`: the head scripts of `auth.html` (and `index.html`, if Supabase
     falls back to the Site URL) no longer forward it to the app or show the hand-off screen; the card shows NEW
     PASSWORD (twice, at least 8 characters like signup), `updateUser({ password })`, then the app.
  3. An expired or used link (`#error_code=otp_expired`, or no recovery session) returns to step 1 with "That reset
     link has expired or was already used." The landing's modal "Forgot password?" opens `auth.html?forgot=1`.
  Pure logic in `site/scripts/password-reset.js` (unit tested); `tests/e2e/password-reset.spec.mjs` covers the flow.
- **Founder check:** Supabase's built-in mailer is heavily rate limited and, on projects without custom SMTP, may only
  deliver to the project team's addresses. For members to receive reset emails, set up SMTP under Auth → Emails →
  SMTP Settings. The "Reset Password" template's link must keep `{{ .ConfirmationURL }}`.
- Proof: `npm run test:unit` 321/321 (8 new); e2e password-reset 18/18, signup 285/285, onboarding 269/269, landing
  47/47; style ratchet, asset budget and build OK.

## D-091: Show / hide password on every password field; "Forgot password?" stays as D-090 built it (founder, 2026-10-24)

- **Asked:** "add the see password while typing and forgot password".
- **Found:** "Forgot password?" already works end to end (D-090: reset link by email, then a new password inside the
  login card); nothing changes there. The login field's eye (`◉`, `.auth-field-eye`) was decoration only
  (`aria-hidden`, no handler), and no other password field had one.
- **Done:** `site/scripts/password-reveal.js` gives every password field (login, the reset new-password step, the
  guided signup's account screen, the classic signup, the landing's login modal) a real eye button, attached on load
  and to fields the guided signup renders later (a `MutationObserver`). It switches the field between dots and text;
  focus and caret stay in the field, so the member keeps typing; it is a 44 px `type="button"` with "Show password" /
  "Hide password" and `aria-pressed`, reachable by Tab; each eye toggles only its own field; every field of a form goes
  back to dots on submit (password managers save it, nothing stays on screen). The decorative glyph is removed from
  `auth.html` and `index.html`. Look: `site/styles/password-reveal.css` (tokens only, loads last on both pages).
- Proof: `npm run test:unit` 324/324 (3 new); e2e `tests/e2e/password-reveal.spec.mjs` 56/56 (new, 1440 and 390 px,
  axe), signup 285/285, onboarding 269/269, password-reset 18/18, location 64/64, landing 47/47; style ratchet, asset
  budget and build OK.

## D-092: Launch polish: divider, profile dialog, smaller Explore cards, filter dropdowns, profile sidebar and hero, the hero video's own soundtrack, area changes, and no decorative dead ends (founder, 2026-10-25)

- **Asked (before the public launch):** drop the repeated "continue with" from the login divider; beautify the member
  profile dialog; smaller Explore cards with the same proportions; a dropdown instead of the capsule cloud in "Find
  your people"; the profile page's sidebar and cover/photo after the founder's reference (only those parts); the hero
  music from the original video; and nothing on the live site that only looks like it works.
- **Done:**
  1. Login (and the landing modal): the divider reads OR.
  2. Profile dialog (`app.js` openPublicProfile, `profile-theme.css`): cover, a framed photo over its edge, the name
     and band, a real bio only (the invented "X is open to meaningful connections." is gone from the deck mapping and
     the dialog), interests and "looking for" once each as chips, Message for a match (opens that chat), Escape and
     focus kept inside, a bottom sheet on phones.
  3. Explore cards about 280 px wide (4 columns from 1240 px, 3 from 960, 2 from 640, 340 px on phones); slimmer bars
     keep the card at about 1.25-1.35 tall per 1 wide; the 5:4 image is unchanged.
  4. "Find your people": the 12 capsules are gone; Skills & interests and Looking for are comboboxes (Popular on top,
     type to search, arrow keys, Enter, Escape closes the list only, picks stay open, chips remove). Pure ordering in
     `discovery-catalog.js` `dropdownOptions` (unit tested). The drawer is a `section` (an `aside` cannot be a dialog),
     its legend and result line reach 4.5:1, and RESET FILTERS is named by its words.
  5. Profile page (`profile-layout.css`, loads last; an old !important phone block in `mobile-final-fixes.css` is
     removed): a quiet brand sidebar from 1100 px (aria-hidden, no controls), and a hero with MEMBER, the name, area and
     a short line on the cover's left and the photo in a tall framed card on the right with EDIT PROFILE and ⚙. The
     "MEMBER PROFILE" pill (a green dot that read like an online status) is gone. Everything below the hero is unchanged.
  6. Landing sound: the original `HEROSECTIONVI.MOV` soundtrack (`npm run media:heroaudio`, AAC 128 kb/s, 318 KB),
     fetched only once sound starts, looped with a 2 s crossfade through the same gain bus (gesture start, 5-minute
     stop, mute button and remembered choice unchanged); stopping ends the queued passes, so it never layers.
  7. Change your area from Edit profile (it said "coming soon"): city search (`set_home_city`) or "Use my location"
     (`set_home_location`, snapped to a ~2 km cell in SQL; coordinates never stored), the server's 3-a-day cap shown in
     words, the hero follows and the deck starts again from the new area. No SQL change. Copy in `area-change.js`
     (unit tested); the old helper's claim that others never see the area's name was untrue (the deck shows a city
     beyond ~10 km) and is replaced. The area block's missing `</div>` (every later field was nested in it) is fixed.
  8. Decorative dead ends removed: the landing's hidden template footer ("©2026 BDSN.CLUB") and "Webflow Honors" tab;
     the chat list's "BRIVIA AI · THOUGHTFUL CONNECTIONS" line (there is no AI) now reads THE BRIVIA CLUB; the hidden
     mock "Brivia AI" chat window CSS; a GIF picker whose GIFs cannot load (Giphy blocked or offline) now says so.
- **Audit:** every visible control on every page and app view was clicked from a fresh load, at 1440 and 390 px
  (signed in: 106 and 107 controls; signed out: landing, login, signup, privacy, careers). None was dead (one artefact:
  a click during the deck's card animation). Menus and composer tools were checked one by one (card ⋯, ⚙ account menu,
  chat ⋯, emoji, document, photo, GIF, camera, +).
- **Open for the founder (not code):** the chat masthead still says "BRIVIA SOCIETY" (product name: Brivia Club);
  chat GIFs are hot-linked from Giphy (each viewer's browser contacts Giphy); the grievance officer in `privacy.html`
  is "the founder", not a named person; custom SMTP for reset and confirmation emails.

## D-093: A touch of burgundy in the aura, everywhere (founder, 2026-10-25)

- The aura (D-087) gains two glows in the brand wine: `--aura-wine` (rgba(110, 14, 46, .30)) low behind the left of
  the page and `--aura-wine-soft` (rgba(128, 30, 62, .20)) faint near the top. Defined once in `tokens.css`
  `--aura-bg`, so every page with the aura gets it (login, signup, app, profile, explore, chat list, hand-off);
  photo and video art is untouched. The founder chose it from a screenshot of the login page.
- Proof: e2e signup 285, onboarding 269, app-shell 210, explore-cards 74 (their contrast and axe checks included),
  launch-polish 40, password-reveal 57, landing 47; unit 330; build, style ratchet and asset budget OK.

## D-094: A favicon, no camera video, a shorter deck card without side buttons, and a first-run deck tutorial (founder, 2026-10-25)

- **Asked:** "Add a professional looking favicon matching the theme. Remove the camera video from the landing page.
  Shorten the matching cards a bit, they are looking too big now; remove the cross and tick buttons from either side;
  add a tutorial with don't show next time of what happens when you do a left swipe or a right swipe."
- **Done:**
  1. Favicon: a rounded square in the burgundy gradient (#8f2f4f to #5e0b28 to #2f0210, a soft light top left) with a
     cream Bodoni Moda 700 "B" drawn as a path (no font needed). `site/public/favicon.svg`, `favicon.ico` (16/32/48) and
     a full-bleed `apple-touch-icon.png` (180), linked from all 8 pages.
  2. The camera video was the landing's "playground" section (`write_Its_a_in_black_color*.mp4`, a camera that turns
     into "IT'S A MATCH."). The whole section is gone, with the badminton / guitar scene that sat under it (never seen),
     its JS (rally, synthesized hits, audio toggle) and `playground.css`. The sound button no longer steps aside for it.
     The video files stay in `site/media/` (unreferenced, so not shipped).
  3. The deck card: desktop height is about 84% of the free height, at least 560 px when the window has it and at most
     660 px (it reached 880 px), at 0.68 wide per 1 tall; phones `clamp(460px, 100svh - 250px, 560px)` (was up to
     660 px). Short laptop windows keep their height. `deck-compact.css`, loaded last.
  4. No round Pass / Pitch beside or under the card: a swipe or the arrow keys answers it. The two buttons stay in the
     page, clipped out of sight, so keyboard and screen-reader users still have them: on keyboard focus they show as a
     small frosted bar under the card (56 px targets). On phones the hint under the stack is a frosted label in three
     centred lines without the separating dots, and on the deck the phone tab bar is near-solid paper (the shorter card
     left the darker photo behind it, and the 62% glass dropped its labels under 4.5:1).
  5. First-run tutorial (`deck-tutorial.js`): a modal dialog over the deck once a card is on screen, "Two ways to answer
     a card": swipe left to pass (they are never told), swipe right to pitch (a note if you like; if they pitch back,
     you match and can chat), the arrow keys on a keyboard (hidden on touch screens), an unticked "Don't show this
     again" and GOT IT. Without the tick it shows once per visit (sessionStorage); with it, never again
     (`localStorage brivia-deck-tutorial = hidden`, cleared with the other `brivia-` keys on account deletion). It sends
     nothing, and the deck's arrow keys are off while it is open.
- **Not in this change** (same founder message, left for a follow-up): the chat close button and Escape, the mobile
  profile and login after the founder's attachments, Explore spacing and equal icons, fewer dots in the deck copy, the
  login OR spacing, the telephone on the "Where ideas begin" slide on phones, and the Resend sender address.
- Proof: e2e deck 196 and the new deck-tutorial 25 at 1440 and 375 px (open, axe, arrow keys inert, once per visit,
  ticked never again, Escape, the keyboard bar); specs that pressed Pass / Pitch now press them as a keyboard user
  would; landing 47, landing-sound 17, app-shell 210, consent 182, launch-polish 39, explore-cards 74, fit 324,
  chat-extras 145, profile-media 193, onboarding 269, signup 285, location 64, password-reset 18, password-reveal 56;
  unit 335 (new `deck-tutorial.test.mjs`); orbit tests; build, style ratchet and asset budget OK.

## D-095: The interests step is a dropdown, and the login "or" sits closer (founder, 2026-10-25)

- **Asked:** "make the interests here also like dropdown" (signup step "What are you into?", which had a search box,
  category tabs and chips) and "reduce the top and bottom margin in 'or' continue with google".
- **Done:**
  1. Interests (refines D-082b): one field like the "Find your people" dropdowns (D-092): `role="combobox"` with a
     chevron, opening a multi-select `role="listbox"`. With no text it lists every interest grouped by category,
     Popular first (an interest already under Popular is not repeated); typing filters to a flat list, prefix matches
     first, up to 40. A click or Enter picks or unpicks (a tick marks picked rows) and the list stays open for the
     next pick; arrows, Home and End move; Escape, Tab or a press outside closes it. Enter with nothing to pick still
     submits the step. The 12-pick cap, the tray, the count and the announcements are unchanged. The "Your picks"
     tray now sits above the field so the open list never covers it. On phones the list opens in the page flow, so
     Back and Finish move under it.
  2. Login "or" (refines D-092): margin `clamp(12px, 1.6vh, 16px)` above and below (was `clamp(22px, 3.2vh, 32px)`),
     about 14 px each side at 1440 and 390 px, asserted in `launch-polish.spec.mjs`.
- **Proof:** e2e signup 288 (listbox groups, 44 px rows, keyboard pick, search, Escape, outside press, axe at 1440 and
  375), onboarding 269, launch-polish; unit 335; build, style ratchet and asset budget OK.

## D-096: Pixel-level mobile polish: login with the telephone, a closable chat and a one-page inbox, the profile hero, equal header icons, roomier Explore, one-line "Where ideas begin", and fewer dots (founder, 2026-10-25)

- **Asked:** the profile page and login on phones like the founder's two references; Explore with more space between
  and around the posts; the bell and the avatar the same size; fewer middle dots ("it feels AI generated"); the phone
  login without its cut Google button and with the telephone back; a close button (and Escape) for an open chat; the
  phone inbox scrolling as a page instead of a small box; on phones "Where ideas begin" without the telephone and on
  one line; the Resend sender for email. (Favicon, the camera video, the shorter deck, the side buttons, the tutorial
  and the closer "or" were done in D-094 and D-095.)
- **Done:**
  1. Login on phones (`auth-mobile.css`, loads last): the hanging telephone at the top, centred on the handset
     (`clamp(130px, 25svh, 240px)` tall), JOIN THE CLUB and its line on one line each, "Create account" alone at the
     top right (the cord ran through "New here?"); everything through Google fits a 360 x 700 screen. Field icons on
     every size are outlined envelope and lock masks (the ✉ glyph and a chess pawn ♙ before).
  2. Chat (`chat-layout.css`, `app.js`): on desktop a 40 px × beside •••, same size and style, closes the thread to
     "Your messages"; Escape does the same unless a menu, picker or dialog is open (that closes first); focus returns to
     the conversation's row. Phones keep ← and get no ×. The phone inbox is one page: one heading ("Messages"), a
     full-width search, All / Unread as two equal halves, the threads in one card with hairline rows; the "Inbox /
     private · 03 conversations" line, the eyebrow and the "Your threads" box are gone, as is a decorative CSS "•••"
     in the thread header. The unread marker is the brand wine (it was green).
  3. Profile on phones (`profile-layout.css`): the desktop composition scaled down: name, area and line on the left of
     the cover, the framed photo on the right with ⚙ and Edit profile inside its lower edge. The buttons are placed from
     the frame's centre, so a long name never moves them off it.
  4. Header (`app-polish.css`): bell and avatar are 40 px circles with a 44 px tap area, on one line, everywhere.
  5. Explore: gaps 24-32 px; 1 column between equal 20 px margins on phones, 2 from 640 px, 3 from 960 px, 4 from
     1360 px (3 at 1280 now); the heading and posts / sort rows span exactly the grid's width. Cards stay 1.24-1.33 tall
     per 1 wide.
  6. Landing on phones: WHERE IDEAS BEGIN on one centred line inside 20 px margins, no telephone.
  7. Fewer dots: "N of 30 signals left" (no "· 24-hour window"), full stops in the quota notices, the deck hint as two
     lines ("PASS WITH INTENTION. PITCH WITH PURPOSE." over the count), "Resume (PDF)", commas in file and resume
     meta lines, "Removed on …", "PEOPLE LIKE YOU, OPEN TO POSSIBILITIES", "THOUGHTFUL CONNECTIONS", the privacy version
     line. Browser tab titles keep their separator.
- **Email (founder, dashboard only; no code sends email):** Supabase Auth sends the confirmation and reset emails. In
  Supabase → Authentication → Emails → SMTP settings: host `smtp.resend.com`, port 465, user `resend`, password a
  Resend API key, sender `hello@thebriviaclub.live`, name Brivia Club. The key pasted in chat must be revoked in Resend
  and a new one used; never commit a key.
- Proof: new e2e `mobile-polish.spec.mjs` (17); unit 335; e2e suites listed in the commit.

## D-097: "Your kind is already here." is set in heavy sans again (founder, 2026-10-25)

- The founder sent a screenshot of the earlier build: the auth page profiles heading in a heavy, tightly tracked
  grotesque. It replaces the serif setting from D-078 (Bodoni Moda 500).
- Now Instrument Sans 700 (`--font-body`, already loaded), letter-spacing -.07em, line-height .9, same sizes; the wine
  second line, the eyebrow and the cards are unchanged. One rule in `auth-polish.css`; the unit test follows it.

## D-098: An immersive phone login after the founder's reference, and a calmer phone profile hero (founder, 2026-10-25)

- **Login (≤ 700 px).** The hanging handset is the hero: its height is whatever the form leaves on screen
  (`100svh - 452px`, 150 to 330 px), so tall phones get a big handset and every phone still shows Continue with Google
  without scrolling. JOIN THE CLUB is centred, tighter (-.035em) with a .6 px stroke for the reference's heavier cut;
  the line under it is tracked .26em; field labels .16em. Browsers without `svh` (the founder's phone showed the D-096
  layout falling apart there) use `100vh - 508px` instead (vh counts the hidden toolbar). "New here?" stays hidden on
  phones: the cord runs where it would sit.
- **Profile hero (≤ 780 px).** The name is one line (24 to 34 px, ellipsis if it is ever too long; it no longer
  breaks "georgian-86" over two lines). EDIT PROFILE is one slim 32 px pill across the photo's foot (12 px text) and ⚙
  a 32 px round button in the photo's top right corner; both keep a 44 px tap area (6 px around). Desktop is unchanged.
- Proof: `mobile-polish.spec.mjs` (25: login at 360 x 600 / 708 and 390 x 844, profile at 360 and 412), app-shell,
  launch-polish (phones: 32 px controls with the -6 px tap area), profile-media, signup, password suites, unit 335.

## D-099: The phone sign-up start screen in the login's composition (founder, 2026-10-25)

- At ≤ 700 px, on the first sign-up screen only: one "Log in" pill at the top right, exactly where the login's "Create
  account" sits (20 px in, 14 px down; "Already a member?" and the × hidden, as on the login; "I already have an
  account" stays in the flow); FIND YOUR PEOPLE centred in two balanced lines in the login's type (13vw up to 56 px,
  -.035em, .6 px stroke, wine); the tagline on one line, tracked .26em, 24 px above the helper; helper and fine print
  centred and balanced.
- Scoped to the welcome screen (`:has(.guided-screen--welcome)`): applied to every step, the taller head shifted the
  interests step so a tap on a tray pick missed after the open list closed (signup.spec caught it). Later steps keep
  their header, × and left-aligned head.
- Proof: `mobile-polish.spec.mjs` 27 (sign up at 320 x 622 and 390 x 844), signup 288, onboarding 269.

## D-100: The chat inbox scrolls, sorts by last contact, and its badge counts unread messages (founder, 2026-10-28)

- **Asked:** "chat list is not scrolling, only from the sidebar we go down"; "chat list sorting as per last contact";
  "chat notification is showing the number of people in the inbox. I want it to show the unread messages."
- **Found:** on phones `chat-attachments.css` sets `overflow: hidden` on html, body, `.app-wrap` and `.app-main` for the
  whole chat view (so an open thread's wallpaper never moves), which clipped the one-page inbox of D-096: 15 rows in a
  1448 px page inside an 844 px screen and nothing could scroll. On desktop the rows scroll inside `.chat-inbox-scroll`,
  but a wheel over the search box or the heading above them did nothing. The order was the order cards loaded, the
  Chat badge was `conversations.length`, and "unread" was an in-memory set that forgot everything on reload.
- **Done:**
  1. Phones, no thread open (`chat-layout.css`): the document scrolls (html `overflow-y: auto`, the wrappers visible).
     An open thread keeps the locked page. Desktop (`app.js` `bindInboxWheel`): a wheel anywhere in the sidebar scrolls
     the rows.
  2. `chat-unread.js` (pure, unit-tested): per conversation, the time of the newest message the member has seen, kept in
     this browser (`brivia-chat-read:<member id>`). Unread = their messages after that time and after the member's own
     latest reply (answering means read, on any device). The first run of this build sets a baseline of "now", so old
     messages do not all light up once. Opening a conversation, and every message that arrives while it is open, marks
     it read. There are no server read receipts (that would be a migration and is not needed for the badge).
  3. The Chat badge (header and tab bar) shows the total of unread messages; each row shows its own count (99+).
  4. Rows sort by their newest message, either direction; conversations with no message keep their order at the end.
- **Proof:** unit `chat-unread.test.mjs` (6); e2e `chat-inbox.spec.mjs` (15, 1440 and 390: order, badge = messages,
  per-row count, replied-to not unread, page / sidebar scroll, the last row reachable, read state survives reload);
  app-shell 211 (badge checks now seed one unread message; a conversation with nothing unread shows no badge).

## D-101: Likes, threaded comments and shares on Explore that members see (founder, 2026-10-28)

- **Asked:** "Make the likes, comments and share functional and the connections can see it. Make the comments in the
  thread style: whoever replies to a comment, it should be in a thread form."
- **Privacy design (no arena run this session; recorded here for the next arena):** likes stay private rows (0012
  unchanged). Others learn only what `post_activity()` returns: counts of likes, comments and shares on a post they can
  see (counting only members they can see, so blocked members and the other world are never counted), and up to three
  of their own CONNECTIONS (mutual matches) who liked it, by name. Non-connections are only ever a number. Comments are
  public to whoever can see the post and the comment's author (as posts are). Shares send only the neutral link.
- **Done:**
  1. `0015_post_activity.sql`: `community_post_comments` (`parent_id` makes a thread; a trigger refuses a reply on
     another post and trims the body; 1-1000 characters; insert own, completed, visible post; delete by the comment's
     author or the post's author, replies cascade; no update), `community_post_shares` (one row per member and post),
     `post_activity(uuid[])` (definer, authenticated only, max 100 posts). README "0015"; hygiene list adds it.
  2. Cards: counts on Like, Comment and Share; under the bar "Liked by You, Asha and 3 others" and "View all N
     comments". A like moves the count at once (undone on error).
  3. The post sheet: likes and shares line, then "Comments" as threads: a reply sits under its comment behind a thin wine
     line; indentation stops at the second level and deeper replies start with "@Name". Reply (with a "Replying to
     Name ×" chip; Escape cancels), Delete for your own comments and for any comment on your own post (its replies
     go too). A composer at the foot (Enter posts, Shift+Enter is a new line). "Reply in chat" / "View profile" stays,
     as a quiet pill.
  4. Share opens a sheet: your connections, each with Send (the link arrives in your chat with them), Copy link, and
     More options (the system share sheet). A completed share is counted once per member.
  5. Until 0015 is applied the counts, lines and comments are simply absent; Like and Save behave as in D-074.
  6. `privacy.html`: comments are collected; who sees counts, comments and liker names.
- **Proof:** SQL `e-post-activity.test.sql` (Q1-Q5); unit `post-activity.test.mjs` (7), `post-card.test.mjs` (9); e2e
  `post-activity.spec.mjs` (43, 1440 and 390, axe on the sheet and the share sheet); `explore-cards.spec.mjs` 74 (Share
  now goes through the sheet).

## D-102: A profile photo is required at signup; area and interests move to a mandatory setup right after (founder, 2026-10-28)

- **Asked:** "Make the profile pic upload mandatory upon signup." "While signup, I want the interests and the location
  to be mandatory, but not in the signup flow: it must be the first thing they get to see when they finish the sign up
  flow."
- **Done:**
  1. Signup is Welcome → Account → 18+ → Name → Details → **Photo** (required; "Choose a photo" → Frame your photo;
     the button is "Create account"). That button creates the account, uploads the framed photo, writes the profile and
     declares 18+. "STEP n OF 5" (Google: of 4).
  2. Setup follows at once: "BEFORE YOU START", Area → Interests → Reveal, "SET UP n OF 2". It is not part of signup:
     no Back into signup, no "Log in" pill. With email confirmation on, Verify comes after the photo (the photo waits in
     the pending profile as a compressed data:image and is uploaded after login, the existing D-049 path); after the
     link and login, setup is the first screen.
  3. Mandatory: the server's completion rule (D-030) already needs an area and interests, and the app sends any
     incomplete member to `auth.html?complete-profile=1`, which resumes at the first missing item (18+, name,
     details, photo, area, interests). A completed member is never sent back for a photo (existing members keep their
     current state); the requirement is client-side, so no migration.
  4. `signup-flow.js` (pure): `SETUP`, `SIGNUP_LAST`, phase-aware `stepLabel` / `stepStates`, `resumeScreen` with
     `has_photo`, no Back from Area. `script.js`: `submitGuidedSignup` (account, profile, photo, 18+) and
     `submitGuidedSetup` (area, interests).
- **Proof:** unit `signup-flow.test.mjs` (8); e2e signup 319 (photo required, framed preview, upload before the profile
  row, Verify straight after the photo with the photo pending, setup labels, no Back from Area, resume without a photo
  starts at Photo, one submit per button for both submits), onboarding 269, location 64, mobile-polish, launch-polish,
  password suites.

## D-103: A post shared in chat shows as a post card (founder, 2026-10-28)

- **Asked (with a screenshot of the live chat):** "the shared post should be shown with preview". A share (D-101)
  arrived as the raw line "Shared a post with you on Brivia Club: https://…/explore.html?post=<id>".
- **Done:** a message that is exactly a shared post (that line, or a bare post link, on any host; `parseSharedPost` in
  `post-activity.js`) renders as a card: the post's image (5:4), the author's avatar and name, the caption (3 lines) and
  VIEW POST, which opens the post on Explore. The card is read from `community_posts` under its own select policy, never
  from the link, so a post the member may not see, or one deleted, shows "This post is no longer available." Cached per
  post id. The inbox row reads "Shared a post" and the notification "Shared a post with you." No SQL.
- **Proof:** unit `post-activity.test.mjs` (8); e2e `post-activity.spec.mjs` (card, gone post, inbox row, axe on the
  card, View post opens the post; 1440 and 390); chat-extras 145, chat-inbox, explore-cards 74, app-shell 211.

## D-104: Edit profile: editable interests, an Experience dropdown, the saved area shown, and a bio (founder, 2026-10-28)

- **Asked (with a screenshot of Edit profile):** "interests edit ni horhe, experience mein drop down ni aarha. Location
  daali thi, to yahan aani chahiye location jo daali thi. Bio bhi ni aata." (Interests can't be edited; Experience has
  no dropdown; the location entered should show here; there is no bio.)
- **Done:**
  1. Interests: the read-only line is now chips (× removes) and a search that adds offered interests (private ones
     never offered; already-saved private ones stay as chips marked Private). 1 to 12. Saved with
     `set_member_interests` first, before anything else: unchanged picks send nothing (the member's own points and the
     3-a-day rewrite limit are untouched), a change shares the 20 points evenly and keeps each pick's mode
     (`planInterestSave`, `profile-edit.js`). The limit refusal says "You can change your interests up to 3 times a day.
     Try again tomorrow." and the dialog stays. After a change the deck reloads (it matches on interests).
  2. Experience is a dropdown with the signup's choices (Student / just starting … 12+ years); an older free-text
     value stays selectable. The new signup (D-102) no longer asks it, so this is where members set it.
  3. Area: the city box shows the saved city ("Ludhiana"), under the current area heading. Only the coarse place is
     ever stored (privacy rule), so a street or locality typed at signup is not kept anywhere to show.
  4. Bio: `0016_profile_bio.sql` adds `profiles.bio` (300 characters) and `member_bio()` (a visible member's bio only).
     Edit profile has a BIO box with a counter; the profile has an About card; another member's profile dialog shows
     their bio. Until 0016 is applied the field and card stay hidden. `privacy.html` lists the bio.
  5. The dialog's labels, kicker and note were 3.5:1 on the cream; now above 4.5:1 in the same wine-brown family.
- **Proof:** unit `profile-edit.test.mjs` (4); SQL `f-profile-bio.test.sql`; e2e `profile-edit.spec.mjs` (1440 and 390:
  chips, dropdown, area prefilled, bio field, axe on the new fields, private interests not offered, the save payload,
  bio and experience on the row, About card, no interest save when unchanged, the daily-limit line, another member's
  bio).

## D-105: One set of form components across the app; Edit profile rebuilt on it (founder, 2026-10-28)

- **Asked (with a screenshot of the interest search in Edit profile showing bulleted, browser-default buttons):** "what
  is this ui? Use ui-ux-pro-max to match the brand aesthetics and make everything professionally designed. I want the
  designing guidelines to be constant across the platform."
- **Found:** the D-104 interest list reused the area list's markup but that list's styles were scoped to the area block,
  so it rendered raw. The dialog mixed four dropdown looks (a styled list, that raw list, a native select, a native
  datalist for Looking for), a 12 px input text size and the browser's grey file button.
- **ui-ux-pro-max:** the skill's database matched only generic rules here (autocomplete suggestions as you type, touch
  target size and spacing); the brand system (`tokens.css`, this file) and the founder-approved signup dropdown (D-095,
  D-086) are the source for the look. Recorded in `docs/UX_SPEC.md` "Shared form components".
- **Done:** `site/styles/components.css` (`.b-field`, `.b-select`, `.b-combo`, `.b-listbox`, `.b-option`, `.b-chips`,
  `.b-chip`, `.b-file`), loaded last. Edit profile uses it for every field: name, email, phone, Experience, Bio, the
  area search and its city list, Interests and Looking for (both now one reusable chip picker, `wireChipPicker`: chips
  with ×, an attached suggestion list, keyboard and screen-reader roles; Looking for also takes a typed value, up to
  8), and the photo picker. The old scoped list rules and the generic dialog input rule no longer apply to these fields.
- **Proof:** e2e `profile-edit.spec.mjs` (adds: no datalist, the list is the brand listbox with 44 px rows and no
  bullets, Looking for keeps its value and adds a suggestion and a typed one), plus launch-polish (area), deck,
  profile-media, app-shell, consent.

## D-106: Profile hero: no rule under the area, no "(city-wide)", and a solid ⚙ on the photo (founder, 2026-10-28)

- **Asked:** "remove the line and city wide from cover pic below the city name, and remove the pink blur from profile pic".
- **Done:** the short cream rule under the area is hidden (`.profile-hero-rule`); the hero shows the place name only
  ("Ludhiana", via `areaInputValue`; Edit profile's area heading still says "(city-wide)" so the member knows what is
  stored). The ⚙ over the photo was a see-through wine fill with a backdrop blur (a pinkish smudge on phones); it is now
  solid wine-deep like EDIT PROFILE, no blur.

## D-107: Post cards: inline counts and one footer on every card (founder, 2026-10-29)

- **Asked:** the "Liked by" line and the count badges made the Explore cards look messy (screenshot).
- **Done:** the circular badges pinned to the icons are gone; each count sits inline beside its icon in tabular
  figures. Every card now has one fixed-height footer ("Liked by …" left, "View N comments" right, or a muted "Be the
  first to like this"), so cards in a row have the same height and their action bars line up. The card's "close to
  square" bound in `explore-cards.spec.mjs` moves from 1.35 to 1.5 to fit the footer.
- **Proof:** unit `post-card.test.mjs`; e2e `post-activity.spec.mjs` (one 40 px footer per card, action bars aligned per
  row, the empty footer flips to "Liked by You" after a like) and `explore-cards.spec.mjs`.

## D-108: Requests are reviewed in a "See who wants to collaborate with you" sheet, not Accept / Decline (founder, 2026-10-29)

- **Asked:** no Accept / Decline in notifications; swipeable, under "see who wants to collaborate with you"; professional
  networking wording, never a dating-app look.
- **Done:** the panel shows one section (faces, "N people want to connect", Review). Review opens a sheet with one
  request per card; Connect / right drag / ArrowRight calls `respond_connection_request(true)`, Not now / left drag /
  ArrowLeft calls it with false (a quiet decline, as Decline did; founder chose this in brainstorming). A real
  connection shows "You're connected." with Message and Next request; an accepted blocked pair moves on silently
  (Ruling P12). No timer advances the connected state (the member taps Next or Message), so nobody is rushed.
- **Proof:** unit `collab-requests.test.mjs`; e2e `collab-requests.spec.mjs` (1440 and 390, axe, drag, keys, failure,
  reduced motion, wording) and `consent.spec.mjs` (escaped note, one RPC while in flight, blocked-pair accept,
  injection-safe photo).

## D-109: The founder's A–Z interest catalogue, and "Other" adds a member's own interest (founder, 2026-10-29)

- **Asked:** use the supplied A–Z list for the interest dropdown, with "Other" for manual input. Brainstorming: "Other"
  interests are shown and matched like any interest.
- **Done (migration 0017):** the list (1,131 labels; three repeated ones collapsed) became the offered catalogue
  (`interest_node.catalog_order`). 139 labels reuse an existing 0004 interest, keeping its id and label (12 of them
  are the same interest under fuller wording, e.g. AR/VR = "AR and VR", Garba = "Garba and dandiya", so members who
  already picked them keep matching). 990 are new level-3 nodes placed under the closest existing category
  (`supabase/catalog/interest-catalog.tsv`), so ORBIT's tree stays meaningful. Left out: "Gospel Music" (a religion
  proxy; D-038 keeps those private, and the open list cannot hold a private interest) and "NLP" (the same interest as
  Natural Language Processing). The pickers (signup interests, Edit profile) list the catalogue A–Z under letter
  headings; search covers all of it; interests outside it stay valid for members who hold them.
- **"Other":** typing something that is not there offers "Add “…” as your own interest". `add_member_interest`
  reuses an interest with that name or creates `member.custom.<slug>`; 2–40 characters, any script, no symbols, links
  or blocked words, not the name of a private interest; at most 5 new ones a day. ORBIT matches `member.*` nodes by
  exact id only (`topology.js` `placed: false`, spec §3.1), so two different own interests are never "siblings".
- **Proof:** SQL `g-interest-catalog.test.sql` (C1–C7) and the updated taxonomy bounds in `orbit-interests.test.sql`;
  orbit `topology.test.js`; unit `interest-catalog.test.mjs`; e2e `profile-edit.spec.mjs` and `signup.spec.mjs`
  (A–Z headings, search, Add, save, refusal, before-0017 fallback, axe at 1440 and 390).

## D-110: "Active now" for connections in chat, with an opt-out both ways (founder, 2026-10-29)

- **Asked:** an active indicator for profiles in the chat section. Brainstorming: connections only, with an opt-out.
- **Done (migration 0018):** the app touches its own presence on load, every minute while visible and on focus (the
  server writes at most every 30 s). `connection_presence` tells the member which of their connections were here in
  the last 3 minutes: only matches in the same world, not blocked, both switches on, and never a time. Chat shows one
  green dot with a cream ring on the connection's avatar in the chat list, and nothing else (founder, 2026-10-29: a
  first build also marked the open chat's avatar and added an "Active now" line; three marks for one person was too
  many, so the open chat's head stays as it was). Screen readers hear ", active now" on the row. Settings (Profile ⚙, Notifications) has "Show when I'm active"; off hides the member
  and hides everyone from them. Nothing on the deck, search or profiles. The privacy notice says so.
- **Proof:** SQL `h-member-presence.test.sql` (P1–P5) and the definer allowlist; unit `presence.test.mjs`; e2e
  `presence.spec.mjs` (1440 and 390, one dot in all, the switch, before-0018 fallback, axe on the rows). The chat list's own
  axe findings (a button inside the row button, the inbox tab roles, a 4.42:1 tab label) predate this and are left
  for a separate fix.

## D-111: Review fixes for D-108 and D-109 (2026-10-29)

- **Message after Connect** works for a sender who was not in the deck (they are kept as a person once connected, so
  the chat list and Message find them); the chat keeps the focus. A sender whose profile did not load gets "You're
  connected." with Done, no broken Message button.
- **A request that is no longer open** (expired, withdrawn, answered on another device: P0002) leaves the list with
  "That request is no longer open." and the sheet moves on, instead of "try again" on a card that can never be answered.
- **Members' own interests:** a retired label cannot be recreated (`add_member_interest` refuses it), and
  `docs/MODERATION.md` has the daily check and the retire step. Curly apostrophes (iPhone) count as straight ones.
- **Proof:** e2e `collab-requests.spec.mjs` (two new cases), SQL `g-interest-catalog.test.sql` (retired, apostrophes),
  unit `interest-catalog.test.mjs`.

## D-112: "About you" after the profile photo: Looking for and a bio, both required (founder, 2026-10-31)

- **Asked:** "in the signup flow after the profile picture add input for - looking for and bio input that will be
  mandatory".
- **Done (refines D-102):** a new signup screen `about` after `photo`, "Tell members about you.", with two required
  fields. **Looking for** is one dropdown in the interests' style (D-095): the Edit profile suggestions
  (`LOOKING_FOR_CATALOG`), filtered as you type, plus "Add …" for the member's own words; picks land in a tray above
  the field; up to 8 (Edit profile's cap). **Bio** is a textarea with a live count, 20 to 300 characters (`BIO_MAX`,
  `cleanBio`). The button stays disabled until both are answered.
- **Account creation moves:** About you is now the last signup screen (`SIGNUP_LAST`) and its "Create account" button
  creates the account and saves the profile, photo, looking for and bio together; the photo screen just continues.
  Steps read "Step n of 6" (Google "of 5"). With email confirmation on, looking for and the bio wait in the pending
  profile with the rest and are saved after login.
- **Resuming:** `resumeScreen` sends a signed-in, not yet completed member with no looking for (and, when the row has a
  bio column, no bio) to About you, after the photo and before setup. Completed members are never sent back.
- **Database:** no new SQL. `looking_for` exists since 0001; the bio needs `0016_profile_bio.sql` (owed). Until 0016 is
  applied `saveProfile` retries without the bio, so signup never fails on it.
- **Proof:** unit `signup-flow.test.mjs` (lists, labels, resume, Back); e2e `signup.spec.mjs` 355 (the About you screen
  at 1440 and 375: listbox, 44 px rows, own words, bio floor, axe; rows store `looking_for` and `bio`; pending profile;
  resume; one submit per tap or Enter), onboarding 269, profile-edit, consent, mobile-polish, launch-polish,
  password-reveal; build and style ratchet OK.

## D-113: Bio emoji, the bio on the profile, a plain cover, "Looking for" on the cards (founder, 2026-10-31)

- **Asked:** an emoji "dashboard" in the bio; on the profile page the bio instead of "Same curiosity. Bigger
  conversations."; no maroon filter on the cover; on the cards "looking for" instead of "Creative soul"; no line under
  the name.
- **Done:** `emoji-field.js` adds an "Emoji" button under both bio boxes (signup About you, Edit profile) that opens
  the chat's emoji in six tabs; a press inserts at the cursor, never past 300 characters, and keeps the focus in the
  box; Escape or a press outside closes it (not the dialog). The profile hero shows the member's own bio under the
  area (3 lines at most; nothing when there is none). The cover's oxblood wash is replaced by a light neutral shade
  on the left only, so the cream name stays readable. The deck card's bar reads "LOOKING FOR · FRIENDS, MENTOR" (the
  first two; "BRIVIA MEMBER" with none) instead of a guessed label, and the short rule under the name is gone.
- **Proof:** unit `emoji-field.test.mjs`; e2e profile-edit (emoji panel, axe, Escape, hero bio), deck (bar, no rule),
  signup (emoji in About you), launch-polish.

## D-114: Setup after the photo is interests, then the location, then About you (founder, 2026-10-31)

- **Asked:** "after the profile picture ask for interest input then the location and looking for, bio".
- **Done (revises D-112's placement):** the photo is again the last signup screen and creates the account ("Step n of
  5", Google "of 4"). Setup is `interests` → `area` → `about` ("Set up n of 3"); Interests has no Back into signup,
  "Before you start" moved to it, and About you's Finish saves looking for and the bio (bio only once 0016 is live),
  then the area, then the interests, in one go. Resume order: photo, interests, area, About you. On a phone a tap on
  a tray chip no longer closes the open list (closing it moved the page under the finger), and Escape closes the list
  from anywhere on the screen.
- **Proof:** unit `signup-flow.test.mjs`; e2e signup 365, onboarding 269, location 64, profile-edit, launch-polish,
  mobile-polish, password-reveal; build, styles, assets OK.

## D-115: The bio on the deck card; the bio needs 0016 on the live database (founder, 2026-10-31)

- **Asked:** "bio is not being shown in the cover page and the cards ... there is no field for bio in the db".
- **Found:** the client already saves the bio (signup About you, Edit profile) and shows it in the profile hero, but
  the live database has no `profiles.bio` until `0016_profile_bio.sql` runs, so every save skips it. The client cannot
  create a column; only the SQL editor can (CLAUDE.md: no direct connection to the live DB).
- **Done:** the deck card shows the member's bio under the distance (two lines at most), read through `member_bio`
  (0016, only for a member the viewer can see) and cached per member; before 0016 the line stays hidden and the deck
  stops asking. Once 0016 is applied, nothing else is needed: signup and Edit profile save it, the hero and the cards
  show it, and Edit profile keeps it editable.
- **Proof:** e2e deck 198 (card bio); unit 379; styles OK.

## D-116: Retire "THE THOUGHTFUL ROOM" cover and add 9 new covers (founder, 2026-11-01)

- **Asked:** "remove the thoughtful room cover pic and add these ones in the list" (11 uploads, 2 exact duplicates: 9
  unique images).
- **Done:** `163BDB0C-...PNG` ("THE THOUGHTFUL ROOM") is gone from the client (`preset-cover.js`, `cover-assets.js`, the
  signup picker in `auth.html`, `media/manifest.json`), from `site/media/` and from `source-media/`. The 9 new covers are
  appended in key order: THE SLOW BAKE, TAKE YOUR SHOT, ON REPEAT, GAME, SET, GO, AFTER PRACTICE, GOLDEN HOUR, LATE NIGHT
  TAKES, SLOW EVENINGS, MATCH DAY (titles are ours; the founder can rename them). 26 covers in all. Each is encoded
  like every other cover (`optimize-media.mjs` settings: WebP q78, max 1600 px, ICC kept): 49-111 KB from ~2 MB PNGs.
- **Default cover:** was the retired one. It is now the first offered cover, "MAKE SOMETHING" (`2257522A-...PNG`):
  `defaultCoverUrl`, the signup preselect and `GUIDED_DEFAULT_COVER`.
- **Server (0019):** redefines `brivia_offered_cover_keys()` with the 26 names (0014 stays frozen) and clears every
  profile whose `cover_url` names the retired file to null (default cover), test members included, since the image is
  no longer shipped. Community posts are untouched; one that used the retired image shows without it, like any unknown
  preset. Deploy the client first, then apply 0019 (after 0014).
- **Proof:** unit 380; SQL harness ALL PASSED (new `cover-refresh.test.sql`); e2e profile-media 193, deck 198, app-shell
  211, explore-cards 74, post-activity 55, onboarding 269; build and asset budget OK.

## D-117: Explore becomes events near you; the old Explore feed becomes Posts (founder, 2026-11-01)

- **Asked:** "restyle the update page, the current function will come under some other section that you can decide the
  name, such as posts, but in the explore I want to add nearby events and all", with a mockup: an "Explore events"
  hero ("Good people at better places."), Nearby Events, a "Find a companion" switch, category chips, event cards
  (date, distance, tags, going, "Find a companion") and an event panel ("Looking for a companion?", "See companions").
- **Navigation:** five tabs: Connect, **Explore** (events, new view `events`), **Posts** (the community feed, view
  `posts`, unchanged apart from its label and eyebrow), Chat, Profile. "Posts" was the founder's own suggestion and says
  exactly what the feed holds. Shared post links (`explore.html?post=`) still open the post under Posts; a plain
  `explore.html` now opens Explore (events).
- **Data (0020):** curated `club_event` rows (no member-created events yet), `event_rsvp`, `member_event_pref`, five RPCs
  and 8 seeded Bengaluru events. Rules recorded in ORBIT spec §11.
- **Departures from the mockup, on purpose:** distances read "~1 km", never "800 m" (CLAUDE.md: rounded distances; a
  home cell is about 2 km across, so metres would be false precision). Faces in "going" are the member's own
  connections only; everyone else is a count (mutual consent: going is not public). "See companions" lists only
  people who also turned on "Looking for a companion?", and only after the member does; "Say hi" is a normal signal.
  Added an "I'm going" button (the mockup had no way to say you are going without asking for company) and a Culture
  chip (the mockup's Dandiya Night had no category). The mockup's filter icon is left out until there is something to
  filter beyond category and Nearby.
- **No agent-arena run:** the choice was the founder's (Explore = events, old feed under another name); the privacy
  rules follow existing ones (post_activity's connections-only names, D-101). Run one before adding member-created
  events.
- **Proof:** SQL harness ALL PASSED (new `i-club-events.test.sql`); unit 390 (new `events-view.test.mjs`); e2e
  `events.spec.mjs` at 1440 and 390 (axe, text audit, RSVP and companion calls, before-0020 state).

## D-118: A calmer Explore, in the house style (founder, 2026-11-01)

- **Asked:** "the page looks quite cluttered ... use the ui-ux pro max skill to align the classy and aesthetic theme of
  the app such that it looks like other parts".
- **Done (ui-ux-pro-max: visual hierarchy, one primary action per view, consistent type scale; matched to Posts and
  Connect):** the page sits on the aura like Posts, with the Posts heading pattern ("EXPLORE / EVENTS", Bodoni display,
  the second line in wine italic like Connect's "CURATED.") and one ruled toolbar of uppercase micro-labels (the event
  count, Nearby, the Find a companion switch) in place of the two large hero cards. Categories are quiet text tabs
  underlined like the header nav, not filled pills. Cards are frosted paper like Posts: image with the date, a
  "MUSIC · ~1 km" micro-label, the title in Bodoni, one time line and one place line, and a ruled foot ("12 going" and
  a text link "FIND A COMPANION ↗"). Tags, the chevron, the distance badge and the companion count left the card (tags
  stay in the event view). The event panel is no longer pinned beside the grid: it opens as a side drawer from 760 px
  (a full-screen sheet below), so the grid has the full width. In the drawer the three-icon "matched with" box became
  one sentence, and the buttons use the app's uppercase tracked labels.
- **Unchanged:** data, RPCs and privacy rules (D-117), and every control (Nearby, the switch, categories, going,
  companions, share).
- **Proof:** unit 390; e2e events (drawer at 1440 and sheet at 390, axe, text audit), app-shell, explore-cards, fit;
  build, style ratchet and asset budget OK.

## D-119: A member with no cover shows the default Brivia cover, never their photo (founder, 2026-11-01)

- **Asked:** "check how are people able to upload a cover pic by themself even though only from our selected is
  allowed?" (screenshot: a deck card whose cover was the member's own photo).
- **Cause:** nobody can upload a cover. Since D-080 (0014) there is no upload code, the `profile-covers` insert and
  update policies are dropped, and a trigger on `profiles.cover_url` accepts only an offered preset path. But the deck
  card (`deckCoverSrc`, from the 2026-10-14 live test) fell back to the member's **profile photo** when `cover_url` was
  empty, or named a preset the build no longer ships (0014 nulled uploaded covers, 0019 nulled the retired cover, and
  members who never picked one have none). So the photo filled the cover area and read as an uploaded cover.
- **Done:** `deckCoverSrc(person, safe, fallback)` uses the chosen cover, else `defaultCoverUrl` (the first preset, the
  same default the profile page and the public profile already show), else the branded placeholder. The photo is no
  longer a candidate. No SQL change: the database already holds only presets or null.
- **No agent-arena run:** a bug fix that brings the deck in line with D-080 and the other surfaces.
- **Proof:** unit (`deck-view.test.mjs`), e2e `deck.spec.mjs` (no-cover members show the default preset cover on the
  card and the next card; never the photo).
