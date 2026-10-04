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
