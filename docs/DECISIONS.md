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

## D-119: Crossing paths, a quiet alert when two connections are nearby (founder, 2026-11-01)

- **Asked:** "when 2 people are within a certain area and they are connected they shall get a notification. This
  feature only works when the location is on." Design it product-first (what, why, fit with our design, what happens
  when location is off), then build.
- **Decided (spec `docs/superpowers/specs/2026-11-01-crossing-paths-design.md`, ORBIT spec §9.1.4a):** name "Crossing
  paths"; off by default and mutual (both must turn it on); connections only; both told in the same transaction; the
  alert says "<name> is nearby" and the top shared interest, never a place, distance or time; nearby = live g7 cells'
  centres within 3 km; live cell kept 20 minutes, separate from the home area; neighbours (both homes geolocated and
  within 3 km) are skipped; 1 alert per pair per 24 h, 3 per member per 24 h, listed for 3 hours, no toast 22:00-07:00;
  one-way mute; pulse at most every 4 minutes and at most 24 cell changes a day (no cell history kept).
- **Location off:** nothing is asked or sent while the switch is off; with location blocked the live cell is deleted at
  once and Settings shows "Paused: location is off for Brivia ..."; the other member is never told; the rest of the app
  is unaffected.
- **Limit, stated to the founder:** a web app reads location only while open, so an alert needs one of the two to have
  Brivia open (the other within 20 minutes). Web Push while closed is phase 2 (needs VAPID keys and an Edge Function).
- **Not run:** agent-arena (it needs a second model route this environment does not have); the privacy rules were
  checked against CLAUDE.md, VISION.md and ORBIT §9.1.4 instead. Run one before 0021 goes live if wanted.
- **Proof:** SQL harness ALL PASSED (new `j-crossing-paths.test.sql`, N1-N13); unit 401 (new `crossing-paths.test.mjs`);
  e2e `crossing-paths.spec.mjs` (panel, toast, Say hi, Mute, explainer, Turn on/off, paused, before 0021; axe at 1440 and
  390); presence, collab-requests, app-shell and chat-inbox e2e; build and style ratchet OK.
- **Owed:** apply `0021_crossing_paths.sql` (README "0021"). Before that the switch is hidden and nothing is sent.

## D-120: A member with no cover shows the default Brivia cover, never their photo (founder, 2026-11-01)

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

## D-121: Members create events on Explore (founder, 2026-11-02)

- **Asked:** "Build: Create Event": a "+ Create Event" button on Explore, a "Bring people together." form (name, the
  twelve categories, description, date and times, venue, address, city, optional map, capacity, Free/Paid in INR,
  optional contact, poster and gallery), a live card preview, Save as draft / Preview / Publish, companion matching per
  event, organiser edit and cancel, server-side capacity, duplicate prevention, cancellation, in the house style.
- **Built on 0020, not beside it:** member events are rows in `club_event` (with `creator_id`), so the 0020 list,
  distance bands, category tabs, Nearby, RSVPs and companions apply to them unchanged. Migration `0022_member_events.sql`.
- **Choices made (founder may revisit):**
  - **Registration and companion are separate.** Turning on "Looking for company?" no longer registers you (0020 did);
    it needs a registration. Companions are listed only among confirmed seats.
  - **Paid events are honest about payment.** No payment provider exists yet, so a paid registration is a 30-minute
    held seat (`pending_payment`) that is never shown as confirmed. `confirm_event_payment` is ready for a provider's
    webhook (service role only). **Owed: choose a gateway** (e.g. Razorpay) and add the webhook (an Edge Function).
  - **Contact stays private unless shown.** The organiser types an event contact (never the account email or phone,
    CLAUDE.md); others see it only when "Show this contact on the event page" is ticked. "Ask a question" sends an
    ordinary signal with a note, so the organiser still has to accept before a chat exists.
  - **Organiser sees counts, not people:** registered of capacity; no function lists registrants or companion choices.
  - **Location:** the city comes from `place`; an optional pin while at the venue becomes a g7 cell inside
    `save_member_event` and is never stored. A map link is allowed only to Google, Apple or OpenStreetMap maps.
  - **Lifecycle:** draft (creator only) → published → cancelled (kept for the creator and the registered, marked
    cancelled) → deleted (draft or cancelled only). Fee is locked and capacity cannot drop under seats once people
    registered. At most 10 new events per member per day. Visibility follows `brivia_visible_to` on the creator.
  - **Images** go to a new public `event-posters` bucket (own folder); account deletion empties it (`DELETE_BUCKETS`)
    and the deletion notice now names events.
- **Placement (founder's reference, same day):** "+ Create event" is a small wine pill in the Explore hero under
  "Events near you…"; the toolbar keeps the count, Nearby and Find a companion; the tabs stay the reference nine (a new
  category's tab appears only while an event in it is listed); only paid events carry a fee badge on the image.
- **Categories (founder, same day):** two rows only, every kind of event, and Other to name your own. Fourteen short
  chips in two rows of seven (Tech, Startups, Networking, Music, Sports, Chess & Games, Food & Drinks / Art & Culture,
  Wellness, Outdoors, Learning, Workshops, Community, Other); narrow screens scroll both rows together. Other asks for
  "Your category" (2-24 characters, `custom_category`), shown on the card instead of "Other".
- **Emoji and gallery photos (founder, same day):** the description has the bio's emoji panel (D-113), inserted at
  the cursor within 2,000 characters; descriptions keep their line breaks. Poster and gallery pickers open the whole
  device gallery (`image/*`, HEIC), take originals up to 25 MB (each is re-encoded to a <=1280 px JPEG without its
  metadata before upload, as every member image is) and offer "Take a photo" on touch screens; the gallery strip picks
  several at once. Fixed on the way: the dialog frame could scroll (now `overflow: clip`, rows pinned).
- **ORBIT spec:** §11.1 added in the same commit (companion order gains shared background as a tie-break).
- **Not run:** agent-arena (no second model route in this environment, as for D-119). The privacy rules were checked
  against CLAUDE.md, VISION.md and ORBIT §9.1.4/§11 instead. Run one before 0022 goes live if wanted.
- **Proof:** SQL harness ALL PASSED (new `k-member-events.test.sql` M1-M8; `i-club-events` V3 updated to the separate
  companion choice; hygiene H3 whitelist); unit (new `event-form.test.mjs`, more in `events-view.test.mjs`); e2e new
  `create-event.spec.mjs` (1440 and 390, axe) and `events.spec.mjs` updated; build, style ratchet and asset budget OK.
- **Owed:** apply `0022_member_events.sql` (README "0022"); a payment gateway for paid events.

## D-122: "Find my companion", one button to find and connect with people going (founder, 2026-11-02)

- **Asked:** "Add a 'Find My Companion' button that users can click to find and connect with people attending the same
  event."
- **Before:** three steps (register, turn on "Looking for company?", then "See companions"), and the card's "Find a
  companion" only opened the drawer.
- **Done (client only, no SQL):** "Find my companion" on every live event card and as the drawer's main companion
  button ("My companions" once looking). One press does the next right thing (`companionStep` in `events-view.js`):
  list the matches; or opt a confirmed member in first (a toast says they are now visible); or, for a free event the
  member is not registered for, one confirm "Register & find company" (a single `set_event_rsvp(true, true)`); a paid
  event asks to reserve first; a pending seat waits for payment; a full or closed event says so; the organiser gets no
  list. Matches show "Connect" (an ordinary request, mutual consent) or "Message" for a connection, and "Stop looking"
  turns off only the companion choice (the registration stays).
- **Why a confirm before registering:** registering takes a seat and shows the member to others, so it is never done
  silently; opting in an already registered member is (it is what the button says) and is announced.
- **Fixed on the way:** closing the companions dialog over an open drawer returned focus to the card behind it; focus
  now goes back into the drawer.
- **Proof:** unit (`companionStep`, card and drawer labels, Connect), e2e `events.spec.mjs` (straight to matches when
  looking, the card's one-confirm register and opt-in in one save, Stop looking, axe on the dialog) and
  `create-event.spec.mjs`; build and style ratchet OK. ORBIT §11 updated.
- **Card switch (founder's mockup, same day):** on each card the action is a soft wine pill, "FIND A COMPANION" with a
  small switch (one `role="switch"`, 44 px tap area). Off: it runs Find my companion (as above). On: it stops looking
  at that event (the registration stays) without opening anything. The drawer keeps the "Find my companion" button.
  Also fixed: focus stays on the switch when its card re-renders, and every close of the companions dialog puts focus
  back in the drawer at once (it raced the browser's own focus restore).

## D-123: Find a Companion, event-based swipe matching (founder, 2026-11-02)

- **Asked:** a dedicated Find a Companion section (reference image: "CONNECT / COMPANIONS", "Find your event
  companion.", an event picker, a count, wine-barred cards, Pass and heart buttons) where members registered for the
  same event who opted in swipe on each other; two right swipes make a match, both are told, Chat opens with the event
  in its header; per event; one decision per pair and event; passes remove the card.
- **Done:** migration `0023_event_companions.sql` (`event_companion_swipe`, `event_companion_match`, RLS on and no
  grants; `companion_events`, `companion_deck`, `companion_swipe`, `my_companion_matches`, `mark_companion_match_seen`),
  the view `?view=companions&event=<id>` (`companions-page.js`, `companion-view.js`, `companions.css`; no new nav tab:
  it highlights Connect), the match moment, a notification row "You and X are going together" with Say hello, and the
  chat header line. Explore's Find my companion and the card switch now land on the cards; the old list dialog (with
  Connect = a signal) is gone, its confirm steps stay. The drawer copy is the founder's: "Looking for a companion?" /
  "Going solo? Find someone attending the same event and make it a shared experience."
- **Choices made:** a match is the ordinary Brivia connection (same as an accepted request: unmatch and block work);
  only confirmed seats are in the pool (a paid seat waits for payment); existing connections are not offered again;
  location is the deck's band (city text is private since D-036, so "Bengaluru" shows only as the place tier of the
  band); age is not shown (no age is stored); "Tap the profile" opens the existing public profile. Desktop shows up to
  three cards and the buttons act on the first (highlighted); phones show one.
- **Not run:** agent-arena (no second model route here). Privacy checked against CLAUDE.md and ORBIT §9.1.4/§11.
- **Proof:** SQL harness ALL PASSED (new `l-event-companions.test.sql` L1-L7; hygiene H3 whitelist); unit 428 (new
  `companion-view.test.mjs`); e2e new `companions.spec.mjs` (49 checks at 1440 and 390, axe), `events.spec.mjs`
  updated, plus create-event, app-shell, chat-inbox, collab-requests, crossing-paths, deck, fit, presence; build, style
  ratchet and asset budget OK. ORBIT §11.2 added.
- **Owed:** apply `0023_event_companions.sql` after 0022 (README "0023"). Push notifications when the app is closed
  are not part of this (in-app notification only), as for D-119.
- **Look (founder's reference, same day):** the page now sits on the reference room (`media/assets/companions-room.webp`,
  36 KB, from `source-media/Images/after login bg.jpeg`, washed with cream on the left); the three cards are equal (no
  faded side cards; the buttons act on the first), each with "•••" (opens the profile), soft serif chips (a shared one
  gets a thin wine edge), a one-line serif "GOING TO <EVENT>" row (date and venue in its tooltip and for screen
  readers; the picker shows the date), and two stacked paper edges.

## D-124: "Make the first move.", and the pitch becomes the first chat message (founder, 2026-11-02)

- **Asked:** a Connect page like the reference (the companions page with a "4 looking for a companion" pill with
  faces), a message composer on Connect ("Make the first move." / "Introduce yourself and tell them why you'd like to
  connect.", a counter, suggested openers, Send Request, Cancel), the recipient sees photo, name, headline and the
  message with Accept / Decline, and in Chat: accepted -> the exact message is the first message, once; already
  connected -> appended to the existing chat, no duplicate request or conversation; declined -> never in chat.
- **Done:** migration `0024_pitch_messages.sql`: a trigger after insert on `matches` delivers each direction's note
  (pending or accepted request) as a message from its sender with the request's own time, exactly once
  (`brivia_pitch_delivery`, a separate table so `brivia_messages` keeps its columns, a5 S2), and accepts an open
  request; `brivia_server_created_at` keeps that time only inside the delivery; `send_connect_request(p_to, p_note)`
  appends to an existing chat ('chat') or is exactly `send_signal`. This covers every path to a connection: Accept,
  two requests crossing, a companion match (D-123). Client: the composer on the Connect deck (#pitch-modal restyled)
  and on companion cards (`connect-composer.js`, heart or right swipe -> composer -> request with the message, then
  this event's like), the review sheet shows "Their message" first with Accept / Decline and, after Accept, "Their
  message is the first one in your chat ... Reply". Companions page: the face pill and plain chips per the reference.
- **Supersedes D-018:** closing the pitch sheet (×, Escape, backdrop, the new Cancel) now sends nothing and the card
  comes back; "Send without a note" (D-071) is the explicit plain like. Moving to the next card with the sheet open
  still sends the plain like, as before.
- **Kept:** the Connect deck still calls `send_signal` (its cards are never connections, so Scenario B cannot arise
  there); `send_connect_request` is the companions composer's call. Quota, caps, blocks and worlds are unchanged.
- **Not run:** agent-arena (no second model route here).
- **Proof:** SQL harness ALL PASSED (new `m-pitch-messages.test.sql` P1-P6; the seed now counts its 3 delivered
  pitches: 18 messages; hygiene H3); unit 433 (new `connect-composer.test.mjs`); e2e companions (composer, Cancel,
  suggestions, counter, exact message sent), consent and deck (updated to the new close rule), collab-requests,
  app-shell, events, create-event, chat-inbox, crossing-paths, fit and the rest. consent keeps one failure that
  predates this work ("a Supabase storage photo_url renders": the deck card shows the default cover since D-120).
- **Owed:** apply `0024_pitch_messages.sql` after 0023 (README "0024").

## D-125: Show interest, the brochure, the poster area and the map icon (founder, 2026-11-02)

- **Asked:** an icon on "Open in Google Maps"; an area selector for the event cover poster; a PDF brochure upload
  (under 5 MB) in the event fields; and a "Show interest" button that counts as a half registration wherever there is
  a payment, so Find a companion works with people who showed interest even before they pay.
- **Done:** migration `0025_event_interest_brochure.sql`:
  - `event_rsvp.status` also allows `'interested'`. It holds no seat (capacity and "spots left" are unchanged), it is
    not "going", and it is counted as `interested_count`. `set_event_interest(p_event, p_on, p_wants_companion)` is for
    paid events only (free events register in one tap); Reserve turns the same row into the 30-minute payment hold.
  - The companion pool (`brivia_companion_status`) is now a confirmed seat, a payment hold (live or lapsed) or a shown
    interest, for `event_companions`, `companion_deck`, `companion_events`, `companion_swipe` and `list_events`'
    counts. Before, only confirmed seats were in it; a pending payment waited. ORBIT §11.3 records the change.
  - `club_event.brochure_url`, the public `event-brochures` bucket (PDF only, 5 MB, own folder) and
    `set_event_brochure(p_id, p_url)` (organiser only).
  - Client: a "Show interest" toggle under Reserve in the drawer and a "Show interest & find company" step in Find my
    companion; the brochure field in Create Event (PDF, 5 MB, View/Replace/Remove) and a brochure row in the drawer;
    a poster-area step (3:2 like the card: drag, arrow keys, zoom; "Adjust area" later) that crops before upload; the
    map link is a pill with a folded-map icon, reading "Open in Google Maps" for Google links.
- **Reading of "area selector":** which part of the poster the card and drawer show (a crop), not a location area.
  If a place or region picker was meant, it is a separate change.
- **Icon:** a generic folded map with a pin in the house wine, not Google's logo (their brand asset).
- **Kept:** mutual consent (an interest is never a connection), privacy (interest is a count; friends still list only
  confirmed seats), payments (still owed: the gateway).
- **Not run:** agent-arena (no second model route here).
- **Proof:** SQL harness ALL PASSED (new `n-event-interest.test.sql` N1-N5; `k-member-events` M6 and
  `l-event-companions` L2 updated for the wider pool; hygiene H3); unit 435; e2e create-event (poster area, brochure,
  Show interest, map icon, axe), events, companions, app-shell.
- **Owed:** apply `0025_event_interest_brochure.sql` after 0023 (README "0025"). Until then Show interest says it opens
  soon and an event saves without its brochure.

## D-126: Show interest on every event; only The Candlelit Gambit stays (founder, 2026-11-02)

- **Asked:** "Show interest" on all events, free or paid, and remove every event except the one Yashika posted,
  "The Candlelit Gambit".
- **Done:** migration `0026_interest_all_events.sql` redefines `set_event_interest` without the paid-only check. On a
  free event an interest is the same half registration (no seat, not going, counted, in the companion pool) and
  Register turns it into a confirmed seat. Client: Register and Show interest sit as the same equal pair as Reserve
  and Show interest (D-125), with "Not sure yet? Show interest…"; the interested count shows on every event.
  ORBIT §11.3 updated.
- **Removing events:** a one-off script for the live database (`keep_only_candlelit_gambit.sql`, in the project files,
  not a migration): preview, then a guarded delete that stops unless exactly one "Candlelit Gambit" by Yashika exists.
  Registrations, interests, swipes and event matches go with the events (cascade); Brivia connections made through
  them stay. Re-running 0020 would bring the 8 seeded events back.
- **Proof:** SQL harness ALL PASSED (N2 now covers a free interest and Register on it); unit 435; e2e events,
  create-event, companions.
- **Owed:** apply 0025 then 0026 (README); run the removal script.

## D-127 (2026-11-02): a Brivia cover can be the event poster

- **Ask (founder):** "in the events poster add the opt to use the cover pictures as well in the place of poster".
- **Decision:** the poster field offers "Use a Brivia cover" (empty state) and "Covers" (on a chosen poster). It opens a
  grid of the 26 profile covers (`PRESET_COVERS`). A picked cover is fetched from the site, goes through the same area
  step (D-125) and uploads to the organiser's own `event-posters` folder like a photo.
- **Why client-only:** `club_event.image_url` must be the creator's storage file (0022). Copying the picture keeps that
  rule, needs no migration and keeps the cropped area. Cost: one small JPEG per event in storage.
- **Proof:** e2e create-event (covers grid, Escape, pick, area step, upload) at 1440 and 390; build, style ratchet.

## D-128 (2026-11-02): the covers are reordered and renamed; "OPEN MINDS" is retired

- **Ask (founder):** rearrange the profile covers in a given order with new names, permanently remove "OPEN MINDS", and
  let every member change their cover at any time from Edit Profile, reflected everywhere.
- **Order and names:** GOOD ENERGY, GAME, SET, GO, AT WORK, MUSIC NOTES, PARTYING, THE GETAWAYS, STRINGS & SOUL, THE
  SLOW BAKE, BASKETBALL SOCIAL, LUXE TRAVEL, TECHNOLOGY, MAKE ROOM, POOL, AFTER PRACTICE, SERENE STATE, SLOW EVENINGS,
  NOVEL ESCAPES, CHECK & MATE, FRESH START, SMASH THEORY, ME TIME, CRICKET STORIES, SUNDAY STATE, GOLDEN HOUR, then
  FIND YOUR PACE. The founder's table had 24 rows and left FIND YOUR PACE out; asked, the founder chose to keep it as
  the 25th. Several new names reuse old ones on different pictures (e.g. "GOOD ENERGY" is the old BUILD TOGETHER
  picture); a stored cover is the file name, never the title, so no member's cover changes.
- **Edit Profile:** already the one cover picker (D-080), built from `PRESET_COVERS`, saving `profiles.cover_url`, read
  by every card (deck, Connect, Nearby, companions, profile) through `normalizeCoverUrl`. It now lists the 25 in the new
  order, five across whenever the dialog is wide enough (`minmax(max(116px, (100% - 40px)/5), 1fr)`), fewer on phones.
  No second cover system was added.
- **Default cover:** stays the same picture (`2257522A-...PNG`, now named SMASH THEORY, 20th). Moving the default to
  the new first card would have changed the cover of every member without one and the profile checklist's "default
  cover" test for members who picked it. It is now named (`DEFAULT_COVER_KEY`) instead of "the first"; the signup
  picker preselects it by key.
- **OPEN MINDS (`7423007B-...PNG`):** removed from `preset-cover.js`, `cover-assets.js`, the signup picker,
  `media/manifest.json`, `site/media/` and `source-media/`; the seed's members and posts moved to other covers.
  Migration `0027_cover_order_open_minds.sql` redefines `brivia_offered_cover_keys()` (25, new order) so the server
  refuses it, and adds its stem to `brivia_clear_retired_covers()`, run once: profiles naming it go to null (default).
- **Proof:** unit (founder order, OPEN MINDS gone, every key has a shipped image, lists equal across client/signup/SQL),
  SQL harness ALL PASSED with new `cover-order.test.sql` (order, switch to any cover, OPEN MINDS refused, cleanup,
  one member cannot change another's cover), e2e profile-media and create-event; screenshots at 1440 and 390.
- **Owed:** apply 0019 (if not yet) then 0027, after the client deploys (README "0027").
- **Follow-up (founder, same day):** cards 1 and 3 swap, with their names: AT WORK is first, GOOD ENERGY third (client,
  signup picker and 0027, still unapplied, updated together). Cover names are centred under their thumbnails in Edit
  Profile and the signup picker; the trailing letter-spacing is offset so the text sits on the card's centre line
  (measured within 0.01 px at 7 viewports).

## D-129 (2026-11-03): a pitch appears once in chat

- **Report (founder):** accepting a companion request sent from Explore shows the sender's pitch twice in the chat.
- **Cause (live database, read-only check):** live `brivia_create_match(uuid, uuid)` had been hand-edited in the SQL
  editor (the drift flagged in HANDOFF on 2026-11-02) to copy every request note into `brivia_messages` when it makes a
  match. 0024's `brivia_matches_deliver_pitches` trigger delivers the same notes on the same match insert, so every
  accepted request with a note landed twice, with the same timestamp. 3 duplicated pitches on live (2026-11-02). Accept,
  crossing requests and companion matches all go through that function. The client was not creating the copy.
- **Fix:** `0028_pitch_once.sql` puts `brivia_create_match` back to creating the match only; the keyed 0024 trigger
  stays the one place a pitch is delivered (once per request, retries included). A one-time cleanup removes a message
  only when it is an exact twin (sender, recipient, body, timestamp to the microsecond) of a delivered pitch and is not
  itself the delivered one. Client: the first inbox load skips a message id already in the thread (a realtime insert
  during load), the same rule the realtime and reload paths already had.
- **Proof:** new `o-pitch-once.test.sql` reproduces the live bug with the hand-edited function (two copies), shows the
  cleanup leaving one (and keeping a same-text message sent later), and Accept / crossing requests give one copy each
  after 0028. SQL harness ALL PASSED; unit 437; build.
- **Still owed:** the other live-only pitch-chat functions (`accept_pitch_chat`, `end_pitch_chat`, `my_pitch_threads`,
  `chat_accepted_at`, 3-arg `brivia_request_is_live`) are still not in this repo.

## D-130 (2026-11-03): the request sheet on the Explore aura; the pitch as one quiet quote

- **Ask (founder):** the collaboration-request sheet should have the Explore page's colour gradient, and the pitch text
  took too many lines.
- **Done:** the sheet's panel uses the app's aura (`--aura-bg`, the Explore backdrop) and the card is frosted paper
  (`--aura-card`, blur) so the glow shows through. The pitch had two nested quote boxes (`connect-composer.css` also
  styles `.collab-note`), each with its own wine bar and padding, which squeezed it into a narrow column: now one wine
  rule, one padding, Bodoni 16 px at 1.4 line height, clamped at 4 lines. A two-sentence pitch takes 3 lines at 390 px
  and 2 at 1440 (was 4-5). CSS only, scoped to the sheet.
- **Proof:** e2e collab-requests 31/31 at 390 and 1440, screenshots; style ratchet; build.
- **Follow-up (founder: "still looking weird in phone view"):** on a phone the page-sized aura left wine smudges at the
  sheet's edges and the left-ruled quote sat lopsided in a centred card. Now: the sheet's own placement of the aura glows
  (lilac top left, a breath of wine top right, mint right, rose and peach low; no wine pools), lighter glass on the card,
  the pitch as a centred Bodoni pull quote with wine quotation marks in one rounded box, and on touch screens the hint
  reads "Drag the card right to connect, left for not now." (no arrow keys). e2e collab-requests 31/31.

## D-131 (2026-11-03): Nearby, discover members around you, with mutual consent

- **Ask (founder):** a location-based "Nearby / Crossing Paths" discovery in Connect: people around you within a
  chosen radius, swipeable cards (cover, photo, name, headline, city, approximate distance, active, shared interests,
  skills, intro), Pass / Connect / View profile, a prefilled editable opener, mutual-consent matching with a match
  moment, notifications, the Crossing Paths setting as the switch, and strict location privacy.
- **Precision (asked, answered "1km"):** the founder's spec had 500 m and "300 m away"; CLAUDE.md says coarse cells and
  rounded distances. Read as: nothing finer than ~1 km. A ~1 km live cell (own `n8:` grid, the ORBIT grid untouched),
  radius 1 / 3 / 5 km (no 500 m), bands "Under 1 km away", "1–3 km away", "3–5 km away", never metres.
- **Reuse, not a second system:** the Crossing paths switch, pulse, caps and purge (0021); requests, quota and matching
  (`send_connect_request` / `send_signal`, the crossing-request trigger, Accept); the pitch delivered once (0024, 0028);
  the request review sheet; the companion card, composer and match-moment styles and `deck-swipe.js`.
- **Consent kept honest:** the 2 members who turned Crossing paths on before this agreed to connection alerts only, so
  discovery has its own recorded consent (`discoverable_at`); they keep their alerts and are asked again on Nearby
  ("Nearby is new"). The explainer and the Settings line were rewritten to say what discovery means.
- **Mutual consent:** a right swipe is a request with a message; a match only when both connect (or Accept). A pass is
  silent and hides that member on Nearby for 7 days; a decline is never told. One request per direction per pair (the
  table's key), the pair lock and the unique match keep simultaneous swipes to one match and one copy of each note.
- **Notifications:** "Someone nearby wants to connect with you" (panel line, review-card tag, one toast per request per
  device); "Well, look who crossed paths!" for the second swiper (the moment) and the first (toast and a panel row, from
  `my_nearby_matches`); messages after matching use the existing chat notifications.
- **Not done:** age (profiles hold only an adult declaration, no age); background location or Web Push while Brivia is
  closed (a web app reads location only while open, as D-119 said). Agent-arena not run (no second model route here, as
  for D-119); privacy rules checked against CLAUDE.md, VISION.md and ORBIT §9.1.4 instead.
- **Fixed on the way:** the connect composer was built twice on the same `<dialog>` once a second page used it; one
  shared instance now. Found, not fixed (separate task): `companion_deck` (0023/0025) lists sensitive interests.
- **Proof:** SQL harness ALL PASSED (new `p-nearby-discovery.test.sql` D1-D9; hygiene H3 whitelist); unit 445 (new
  `nearby-view.test.mjs`); e2e new `nearby.spec.mjs` 49/49 at 1440 and 390 (axe clean), plus crossing-paths, companions,
  collab-requests, deck and app-shell; build and style ratchet. ORBIT §9.1.4b and UX_SPEC §B2 added.
- **Owed:** apply `0029_nearby_discovery.sql` (README "0029"). Done 2026-11-03, see README "0029".

## D-132 (2026-11-03): requests are answered by swiping only

- **Ask (founder):** "there must be no connect decline buttons, connections would only be through swiping right or
  left, so remove these accept decline buttons" (the request review sheet).
- **Done:** the sheet has no Accept / Decline buttons. A right drag accepts, a left drag declines (the ACCEPT / DECLINE
  stamps show while dragging). Under the card a quiet cue reads "← DECLINE · ACCEPT →" (labels, not buttons).
- **Accessibility kept:** the card itself takes focus when the sheet opens (tabindex 0, aria-keyshortcuts, described by
  the cue), so → accepts and ← declines from a keyboard or screen reader; after a failed answer focus returns to it.
- **Scope:** the review sheet only. Nearby keeps Pass / View profile / Connect under its cards (the D-131 brief asked for
  buttons on desktop); say if those should go too.
- **Proof:** unit 445; e2e collab-requests 31/31 (a real right drag accepts, a left drag declines, two quick → presses
  send one answer, no buttons in the sheet, axe clean) and nearby 49/49.

## D-133 (2026-11-03): Nearby on phones: the browser's real answer decides, not the Permissions API

- **Report (founder, iPhone):** Nearby showed "Location is off for Brivia" although location was allowed; Try again did
  nothing.
- **Root cause (`site/scripts/crossing-paths.js`, `check`):** a `denied` from `navigator.permissions.query()` stopped the
  check before `getCurrentPosition()` was ever called, and Try again ran the same path (`ask: false`), so it only
  re-read the same answer. That answer is not reliable on phones: iOS Safari keeps a stale `denied` until the page or
  app restarts, and Chrome on iOS also needs its own iOS location switch. Also: iOS Safari's default "Ask" reports
  `prompt` every visit, so background updates never sent a location and opening Nearby never asked; timeouts and "no
  position" shared one message with no retry; an insecure page or unsupported browser read as "location is off"; and
  the panel's text started in lowercase. Live confirmed it: discovery on for 2 members, no live location rows.
- **Fix:** the Permissions API is a hint only. Every tap (opening Nearby, Try again, Allow location, refresh, Turn on)
  calls `getCurrentPosition` with a fresh fix (`maximumAge` 0), and waits for a running background check rather than
  being dropped. A background update skips the call only when the browser would prompt and the page has had no fix
  yet (no unsolicited prompts; Safari does not prompt again in the same page). A timeout or no position is retried
  once with `enableHighAccuracy: true`. Denied, unavailable, timed out, unsupported and insecure are separate states;
  denied shows steps for the device (iPhone Safari, Chrome on iPhone, Android, desktop). The loop re-checks when the
  permission changes where the browser reports it. The quiet state reads "It's a little quiet around here. Check back
  as more people cross paths."
- **Unchanged on purpose:** no `watchPosition` (a fix every 5 minutes while visible, the server's 4-minute cap, is
  enough and saves battery); distances stay bands from ~1 km cells (D-131: "1 km"), not "300 m"; nothing is sent
  while Crossing Paths is off; off and sign-out delete the live area at once. No database change.
- **Proof:** unit 450 (new: a stale `denied` still reaches the browser and pulses; Try again asks afresh; the GPS retry;
  iOS "Ask" keeps updating after a first fix; unsupported / insecure; platform help); e2e nearby 55/55 (a forced stale
  `denied` still shows people; blocked on an iPhone shows the iPhone steps, then allowing and Try again shows people;
  timeout and unavailable each show their state and recover), crossing-paths 33/33; SQL harness ALL PASSED. Not run on
  physical iPhone / Android devices here (Chromium emulation with iPhone and Android user agents).

## D-134 (2026-11-03): Nearby notifications, one store across devices, web push, compact cards, 10 km

- **Ask (founder):** no repeated location screens once allowed; people appear automatically; an elegant in-section
  notification when someone comes within your radius (photo, name, distance, View profile, soft fade, a premium chime);
  optional web notifications across devices with read state synced (read on the phone = read on the laptop, no
  duplicates); a mute; more compact cards; "[ 1 km ▼ ] [ Refresh ↻ ]"; radii up to 10 km.
- **Location:** the founder's first screenshot ("Brivia needs your location") was the build before D-133; the second
  shows D-133 working on desktop Safari. Opening Nearby asks the browser itself; the permission screen shows only when
  the browser really would prompt and nothing has been allowed in this page. Crossing Paths stays a server setting, so
  it persists across sessions and devices.
- **One store (0030):** `member_notification` (unique id, user, source member, type, band, created / read / dismissed /
  push-sent, a per-day dedupe key). Members select only their own rows (RLS), write none; reads go through
  `mark_notifications_read` / `dismiss_notification`. The table is in `supabase_realtime`, so every open device gets
  inserts and read-state updates and closes the matching system notification. localStorage is not the source.
- **Who is told:** `nearby_pulse` calls `brivia_notify_nearby`: each member who comes within the other's chosen radius
  (`nearby_setting.radius_km`, set by the picker) is announced to them, both ways, once per pair per day, at most 10 a
  day, only between members who may discover each other (the 0029 pool: both on and consented, live, visible, not
  connected, not asked, not passed).
- **Web push:** optional per device in Settings (independent of location). The service worker (`/sw.js`) shows one
  system notification per notification id (the tag), or hands it to the page when Brivia is in front. Sending is the
  `push-notify` Edge Function, called by the app after its pulse; it claims each notification once (`push_sent_at` in
  the same UPDATE) and never one already read. VAPID private key only in the function's secrets. iPhone / iPad: web push
  needs Brivia added to the Home Screen (iOS 16.4+); Settings says so in a Safari tab. Without pg_net the database
  cannot call the function itself, so a member whose app is closed is pushed when the *other* member's app pulses.
- **Sound:** an original two-note Web Audio chime (A5 then E6, soft decay, ~0.9 s), only after an interaction, once
  per notification id, mute per device in Settings. System notifications use the device's own sound.
- **Cards:** the same design about 15% smaller (360 px, 16:8 cover, 80 px photo, tighter type and chips); no overflow
  at 390 px. Header: "Refresh" labelled. Radii 1 / 3 / 5 / 10 km (band "5–10 km away").
- **Proof:** SQL harness ALL PASSED (new `q-notifications.test.sql` N1-N8; D6 moved beyond 10 km; hygiene H3); unit 457
  (new `member-notifications.test.mjs`: announce once, never pre-existing or stale ones, read elsewhere closes the
  system notification, unique mark-read, chime rules, push support); e2e nearby 66/66 (laptop and phone on one server:
  the notice, read on the laptop is read on the phone, never twice, dismiss, 10 km saved, compact card, no overflow,
  Settings), plus crossing-paths, collab-requests, companions, deck, app-shell.

## D-135 (2026-11-03): the interest list is the founder's A–Z list, in the founder's wording

- **Asked:** use the founder's full A–Z list (Abstract Art … Zymology) as the interest list.
- **Found:** the live catalogue (0017, D-109) already offers exactly these 1,129 interests; 65 reused nodes were worded
  differently (e.g. "Machine learning", "AR and VR", "Birding in the city").
- **Decided:** migration `0031_interest_labels.sql` relabels those 65 by id to the founder's wording (only where the
  label is still 0017's) and renumbers `catalog_order` A–Z. Ids never change, so members' saved interests and ORBIT
  topology are untouched. 0017 stays frozen; `supabase/catalog/interest-catalog.tsv` is the source of truth now and
  `scripts/build-interest-catalog.mjs` no longer rewrites 0017.
- **Kept out on purpose:** "Gospel Music" (a religion proxy, private by D-038, never offered) and "NLP" (the same
  interest as "Natural Language Processing"). Three repeats in the list (UI Design, UX Research, Extreme Programming)
  are one interest each.
- **Proof:** SQL harness ALL PASSED (new `r-interest-labels.test.sql`: relabels, 1,129 offered, contiguous A–Z order,
  unique labels, Abstract Art first, Zymology last, nothing sensitive offered).

## D-136 (2026-11-03): Gospel Music and NLP are offered too

- **Asked:** the founder answered "yes" to offering the two interests D-135 had left out.
- **Decided:** migration `0032_interest_additions.sql` adds `music.listening.gospel_music` ("Gospel Music", a public
  music genre beside the others) and `tech.ai_data.nlp_short` ("NLP", a sibling of Natural Language Processing so
  ORBIT scores them as the same category), then renumbers `catalog_order` A–Z. The catalogue is now 1,131 interests:
  every label on the founder's list.
- **Overrides:** D-038 counted Gospel Music as a religion proxy and kept it private. The founder chose to offer it as a
  music genre; only this label changes. Devotional singing and Sufi and qawwali stay sensitive (a test checks that).
- **Proof:** SQL harness ALL PASSED (g C1 now 1,131 and both offered; r L4 placement, Gospel Music not sensitive, Sufi
  and qawwali still sensitive).

## D-137 (2026-11-03): a bio is 1 to 20 words; the Brivia sound kit (notification, pass, pitch)

- **Asked:** a word-based bio limit (1 to 20 words, live "8/20 words", a subtle note past 20, no submit past 20, the
  same everywhere a bio is written); an original, saxophone-like notification sound; a cute, slightly sad cue on a
  left swipe and a cheerful one on a right swipe, all one sound identity; one on/off switch and a volume; no redesign.
- **Bio:** `profile-edit.js` `countWords` / `bioWords` (a word is a run of non-space text; extra spaces, line breaks and
  leading or trailing spaces never count). Signup "About you" and Edit profile show the counter, add a quiet wine note
  past 20 (`is-over`, `aria-invalid`) and refuse to continue or save (Edit profile checks before anything is sent). Edit profile refuses clearing a saved bio;
  a member who never wrote one (an account from before signup asked for it) can still save other changes. The
  old 20-character floor is gone. Server: `0033_bio_word_limit.sql`, a trigger refusing a bio of more than 20 words
  when it is written (a longer bio saved earlier stays until its member edits it; empty stays a clear).
- **Sound:** `notify-sound.js` is now the sound kit. One synthesized voice, "the Brivia horn" (sawtooth plus square
  through a breathing low-pass filter, a scoop into each note, late vibrato, breath noise, a short warm room), three
  original cues in B-flat major: notify (a rising B-flat major 7 line settling on a long A), pass (D falling to B-flat,
  drooping a semitone, darker and quieter), pitch (a quick F, B-flat, D run up to a scooped F with a sparkle). No
  audio files, no recordings, nothing borrowed. Each cue is rendered once into a buffer when audio unlocks, so a swipe
  starts its sound instantly; the swipe never waits for audio (`deck-swipe.js` calls the cue after the motion starts).
- **When:** notify for every genuinely new member notification (once per id, also when a push arrives with Brivia in
  front). Pass: every committed left swipe (drag, button, ← key) on Explore, Nearby, Event companions and requests.
  Pitch: the right swipe once (the card parks); the pitched card leaving later is silent; a report or block leaving
  the deck is silent. One cue at a time (a new one fades the last out); the same cue within 180 ms is the same swipe.
- **Rules:** nothing plays before a real gesture (the landing page's gesture list: never touchstart); every gesture
  resumes audio until it runs (iOS can suspend it again). iOS: `navigator.audioSession.type = 'ambient'` where Safari
  has it, so the cues mix with the member's music and follow the ring/silent switch. Settings: SOUNDS (one switch for
  all three) and SOUND VOLUME (0 to 100, default 70, previewed on release), per device.
- **Limits, stated plainly:** a system notification (web push with Brivia closed or in the background) uses the
  device's own notification sound; browsers do not let a website choose it. The Brivia notify cue plays when the app is
  open. On iPhone, web push needs Brivia on the Home Screen (D-134), and the silent switch silences the cues.
- **Proof:** unit (new `sound-kit.test.mjs`: cue shapes, gesture rules, once per id and per swipe, off and zero
  volume, live fallback, audio session, storage, word counts); SQL harness ALL PASSED (new `s-bio-words.test.sql`);
  e2e `sounds.spec.mjs` counts real Web Audio playback in the app at 1440 and 390 (touch) and checks Settings; signup
  369, profile-edit 64, deck 201, nearby 66, collab-requests 32, companions 64, app-shell 214, all passing. Loudness fix the same day (founder: "can't hear any music effect on swiping on the laptop"): the
  first mix peaked at 0.21 to 0.36 at the default volume, too quiet for laptop speakers. Cue levels up, volume curve
  ^1.5 instead of ^2, default 80, a soft limiter at the output: peaks now 0.64 to 0.75 at the default (about +8 dB),
  never distorted at 100%; `sounds.spec.mjs` checks the played buffer's peak.

## D-138 (2026-11-03): one aura on every sheet; Crossing Paths says where and when, keeps working from a hidden tab

- **Asked:** the Explore aura (reference 4) on every page, modal, popup and overlay; Crossing Paths that works while
  both people use other apps, with notifications showing approximate distance, when and where; cross-device read sync;
  configurable retention; separate sound choices for the app and for push notifications; no fake data.
- **Found:** most of it already existed and is real (D-131/D-133/D-134): opt-in only, a coarse fix every 5 minutes,
  live areas ignored after 20 minutes (stale positions never notify), revocation clears the live area at once, one
  server notification store with unique ids and read state synced over Realtime, web push claimed once per id, one
  notification per pair per day. What was missing: sheets on flat ivory over a grey scrim; no "where" or "when" on a
  crossing; checks stopped the moment the tab was hidden; retention fixed in code; one sound switch for everything.
- **Gradient:** `--aura-sheet` and `--aura-scrim` (tokens.css). Every modal, popup and dialog (Edit profile, Settings and
  its sheets, the pitch composer, the connect composer, public profile, report, privacy, events dialogs, the match
  moment, share, the notification panel; the deck tutorial and the request sheet already had it) sits on the sheet
  aura; every scrim is one warm wine veil with a light blur. Fields, cards and photos keep their own surfaces, so text
  contrast is unchanged. The bottom bar and top bar were already aura glass.
- **Where and when:** `0034_crossing_where.sql`: `member_notification.place_name` (the town or city of the receiver's
  own live area, never the other member's), `my_notifications_v2()` (0030's function is left as it was, for clients
  that have not reloaded), the copy "Someone interesting crossed your path." / "You and Aarav were within 1 km of each
  other, near Bengaluru." / "8 min ago · Discover who you crossed paths with." in Nearby, the panel, the toast and the
  push. Distance stays a band, never "300 metres": the grid is ~1 km and the founder chose 1 km precision (D-131);
  a metre figure would expose more than members agreed to share.
- **Retention:** `nearby_retention`, one owner-only row (live 20 min, moves 24 h, alerts 24 h, passes 7 days,
  notifications 30 days, each with a ceiling); `purge_nearby()` reads it.
- **Background:** a hidden tab keeps pulsing every 5 minutes (as far as the browser runs it) once the page has had a
  fix and permission reads granted. On a laptop and on Android Chrome this covers "I switched to another app" while the
  browser keeps Brivia alive; iOS Safari suspends hidden pages within seconds. Never a prompt from a hidden page.
- **The limit, stated plainly:** a website or PWA cannot read location while the browser is closed or the page is
  frozen, on any platform. The requested scenario (both people in other apps, phones in pockets, both notified) needs a
  native app: iOS significant-location-change or region monitoring with "Always" permission, Android fused location
  with a foreground service and background-location permission, posting to the same `nearby_pulse` (the server,
  notifications, push and read sync are ready for it). Until then the push still reaches a member whose app is closed
  whenever the *other* member's app pulses.
- **Sound:** three switches per device: NOTIFICATION SOUND (the sax chime in the app), SWIPE SOUNDS, PUSH NOTIFICATION
  SOUND (the service worker shows pushes `silent` when off; read from Cache Storage; iOS uses its own Settings).
- **Not tested on real phones from here:** two physical devices crossing paths cannot be driven from this environment.
  What is tested: SQL (both told once with the area, a 20-minute-old location never notifies, switching off is never
  found, retention follows the setting), unit (hidden-tab pulses only when granted; a revoked permission stops
  collection), e2e on one stub server for a laptop and a phone (the notice, read on one device is read on the other).

## D-139 (2026-11-03): no flat ivory left on the tutorial tiles, Nearby and the empty states

- **Asked (with screenshots of the deck tutorial and Nearby):** change the colour of the swipe-left and swipe-right
  tiles and the gradient of the Nearby screen, and wherever else it is relevant.
- **Done (aura-theme.css, tokens only):** the tutorial's two tiles are light glass over the sheet aura, "pass" with a
  breath of blush, "pitch" with a breath of mint, a thin wine edge. Nearby and Event companions sit on the page aura
  (`--aura-bg`) instead of the room photo. The Nearby panels (Turn on Crossing Paths, quiet, unavailable), the deck's
  empty state, the companions and events empty states use the sheet aura (`--aura-sheet`). Profile cards, photos and
  buttons are unchanged.
- **Proof:** e2e deck-tutorial 26, nearby 66, companions 64, events 76, deck 201, all passing (axe contrast included);
  phone screenshots of the tutorial and Nearby.

## D-140 (2026-11-03): a worldwide city directory, and a company on every profile

- **Asked:** (9) a tiny company logo and name on profile cards ("Software Engineer at Google"), picked in Edit profile
  from a searchable global company directory that grows (external source, cached, admin-verified), with members always
  able to add their own (name, logo, website, industry), deduplicated, editable and removable; (10) any city in the
  world, by city, country or postal code, with state and country to tell same-named cities apart, other spellings,
  "Use my location" and manual choice, the same directory everywhere, standard identifiers, never exact coordinates.
- **Cities (0035):** `geo_city`, 156,169 cities, towns and localities in every country from the countries-states-cities
  database (ODbL), published with the site as `site/public/data/cities/part-NN.json` and imported in SQL with pg_net
  (no service key leaves the dashboard). Names are public; centroids live in `brivia_private.geo_city_point` (the
  orbit-location test allows coordinates in the public schema only on `place`). `search_cities(q)` (security invoker,
  works before sign-in): prefix, typo (trigram), accents folded, native script, aliases (Bangalore, Bombay, Gurgaon...),
  "City, Country", "City, State", or a country alone. `ensure_place(id)`: a picked city becomes one `place` row the
  first time (`geo-<id>`), so ORBIT, `member_orbit.place_id`, card labels, Nearby, events and filters keep using `place`
  unchanged; a city that already is a place answers its id. Postal codes: the `directory` Edge Function asks Photon
  (OpenStreetMap) and maps the postcode's centre to the nearest directory city in that country.
- **Companies (0036):** `company` (directory | member | admin, verified, unique domain and Wikidata id), the
  `company-logos` bucket (raster only, 300 KB, members write only under their own uid), `profiles.job_title` and
  `company_id`, `set_my_work`, `member_work(ids)` (only members the viewer may see, as `member_bio`),
  `search_companies`, `add_company` (dedupe by domain then name, 5 a day), `brivia_cache_companies` (service role).
  The `directory` Edge Function looks a name up on Wikidata (CC0, worldwide, includes Swiggy, Zepto, Razorpay...),
  keeps results described as organisations, stores each logo once (Commons PNG or the site's icon), caches the rows.
- **On the card:** "[14 px logo] Title at Company" in place of the experience line, one line, ellipsised, in the card's
  small type; the default mark when there is no logo. Deck card, Nearby card, Event companions card, public profile,
  own profile. One painter fills any `data-work-for` element from a batched cache. Card sizes are unchanged (e2e
  measures the deck card with and without a company).
- **Not done / limits:** no paid company API (Clearbit, Brandfetch need keys and contracts); Wikidata covers famous and
  many emerging companies, members add the rest. Postal codes depend on OpenStreetMap coverage. The import needs pg_net
  enabled once (README "## 0035"). The project rule asks for an agent-arena review of significant decisions; this one
  was decided inline (data sources: open, free, no keys) and is open to an arena pass.
- **Proof:** SQL harness ALL PASSED (new u-city-directory G1-G3, v-company-directory C1-C3; hygiene lists updated);
  unit (work-identity); e2e work-identity 25, signup 369, onboarding 269, location 64, profile-edit 64, create-event 152,
  events 76, nearby 66, companions 64, deck 201, app-shell 214, collab-requests 32, sounds 31, all passing. An empty
  city search still lists the launch cities and metros (signup's "location denied" fallback).
- **D-140 follow-up (0038), found on the live import:** Indic native names lost their vowel signs in the search key, and a
  typed country ranked below fuzzy matches. Fixed and verified live: Ludhiana, Bangalore -> Bengaluru, Japan -> Tokyo,
  Yokohama, Osaka, Nagoya; "Springfield, Illinois"; "chandig"; "San Fran". The dataset's native name for a city is one
  script (Bengaluru's is Hindi, not Kannada), so a Kannada spelling is not found yet.

## D-141: Hiring, a banner on hirers' profiles matched to members who want a role (founder, 2026-11-02; built 2026-11-03)

- **Asked:** "show a hiring banner in the profiles of the people whose looking for is hiring candidates. They shall be
  suggested to people whose looking for is referral or a similar position ... Design when and how will the hiring
  people post ... and when and where can normal people see the profiles. Also design the complete chart."
- **Proposed (spec `docs/superpowers/specs/2026-11-02-hiring-design.md`):** up to 3 roles per hirer (title from a role
  catalogue, level, on-site / hybrid / remote, "I'm hiring" or "I can refer", optional self-reported company, one
  line, 30 days); explicit seekers only (Job Referral, Internship Referral, new Job opportunities) with "Roles I'm open
  to", hirers-only visibility by default and an optional private current company; the banner in the deck card's
  existing bar for everyone, a role strip and a deck lift (at most 1 in 5) only for fitting seekers; the banner in the
  public profile; "Ask about this role" = a signal with a note and the role tag (3 a day, 25 waiting per role); the
  hirer answers in the existing request sheet. A hiring bar (14 days, photo, confirmed email, no open report), no
  links in role text, a "Fake job or asked for money" report reason, a kill switch.
- **Agent-arena:** a quick panel of two independent agents (product, trust and safety), same model family (disclosed
  reduced heterogeneity); rulings in spec §13.
- **Status:** built 2026-11-03 (founder: "proceed with development of the hiring feature"). Migration `0037_hiring.sql`
  (not applied yet), client `site/scripts/hiring.js` + `hiring-ui.js` + `site/styles/hiring.css`, tests
  `supabase/tests/s-hiring.test.sql`, `tests/unit/hiring.test.mjs`, `tests/e2e/hiring.spec.mjs`. Mock screenshots in the
  project folder `hiring/`, the real build's in `hiring/build/`.
- **Built differently from the design, and why:**
  - The notification row's action is **See them**: it turns on the Hiring lens on the Connect deck instead of opening a
    second one-card sheet. One deck, one set of gestures; the lens is also a switch in the filter drawer.
  - The fake-job reason is its own RPC, `report_fake_job`, which calls `report_member` ('fake', note prefixed
    "Hiring:") and pauses the member's open roles. `report_member`'s reason list (0004, frozen) is unchanged.
  - The deck lift is client side (one hiring suggestion in every five cards, never the card on screen);
    `deck_candidates` is untouched, so ORBIT's ordering of everything else is unchanged (ORBIT_ENGINE.md §12).
  - The feature hides itself until 0037 is applied: the first hiring RPC answers "function not found" and nothing
    hiring-shaped renders. A kill switch (`brivia_feature` 'hiring') does the same after it is applied.

## D-142 (2026-11-03): the founder's company list seeds the directory; title and company side by side

- **Asked:** put the title and company boxes side by side, and use the founder's company list (16 groups: IT services,
  global tech, consulting, Indian startups across consumer, fintech, SaaS and AI, edtech and travel, banks, insurance,
  FMCG, fashion and retail, automotive, healthcare, telecom and media, manufacturing and energy, aviation and logistics,
  food and hospitality, aerospace and defence, real estate, legal and HR, education, venture capital).
- **Done:** `supabase/catalog/companies.txt` (the list, one company per line under its industry) and
  `scripts/build-company-seed.mjs`, which writes `0039_company_seed.sql`: 926 organisations as verified 'admin' rows
  (duplicates in the list kept once; a name already in the directory is skipped). Searching "TCS" finds Tata
  Consultancy Services. The list has names only, so `brivia_cache_companies` now fills a seeded row the first time the
  Wikidata lookup finds the same name (website, logo) instead of adding a second row, and the client asks the directory
  whenever the best answers have no logo yet. The directory keeps growing past the list: Wikidata for the rest, members
  for their own organisations.
- **Layout:** title and company search share one row of the Edit profile form (two columns, the same width as the
  other paired fields); on phones the form is one column, so they stack. The picked company and "Add your organisation"
  sit under them.
- **Proof:** SQL harness ALL PASSED (new v-company C4: seed size, short name, typo, enrichment without a duplicate);
  unit 479; e2e work-identity 25, profile-edit 64.

## D-143 (2026-11-03): the company list shows logo and name only

- **Asked:** no website links beside the company logo and name in the Edit profile company search.
- **Done:** the options show the logo and the name, the name left-aligned next to its logo (a company without a website
  used to push its name to the right). The website is still stored for deduplication and logos, just not shown.

## D-144 (2026-11-03): company logos like LinkedIn's: the square mark on a white tile; no places or products

- **Asked (with LinkedIn's Google result):** the right Google logo, logos set the way LinkedIn sets them, no links
  after the name.
- **Done:** the directory Edge Function (v2) stores the company's square mark (the site's own icon at 128 px; Google's
  "G") before the Commons logo, which is often a wordmark that blurs at 16 px; logos stored before are fetched again
  (path `directory/<Qid>-icon.<ext>`; the old Google wordmark was cleared). Logos sit on a white rounded tile with a
  hairline edge: 28 px in the search list, 24 px for the picked company, 14 px on cards. The organisation filter no
  longer takes places or products (Gothenburg, Google Maps, Google Play, Google Scholar came in through "capital",
  "service", "platform"; removed live, nobody had picked them); a description that says "company", "firm", "bank"...
  still wins over a product word ("American software company"). No website text in the list (D-143).

## D-145 (2026-11-03): the member's photo in the top-right avatar

- **Asked:** show the profile photo in the top-right circle instead of the initials.
- **Done:** the header avatar shows the member's own photo (cover-fitted in the circle); the initials stay when there is
  no photo or it fails to load. Verified with and without a photo; e2e app-shell 214 and mobile-polish 28 pass.
  consent.spec.mjs fails before and after this change (it still looks for the Accept button removed in D-132); left for
  a separate fix.

## D-146 (2026-11-03): a refined "You're caught up." card

- **Asked:** refine the caught-up box on Connect.
- **Done (deck.css, tokens only, copy unchanged):** a narrower card (460 px) with more air, a soft wine edge and lift;
  the orbit mark on a cream disc with a slow halo (still under reduced motion); the eyebrow as a wine label between
  hairlines; a tighter wine heading; the copy at a balanced 31-character measure; a hairline before the action; the
  action a wine pill with an arrow that nudges on hover. Phone: same card, slightly tighter. e2e deck 201 and
  app-shell 214 pass (copy, focus and the Search members action are unchanged).

## D-147 (2026-11-03): the top-right avatar always finds a photo; a smaller caught-up card

- **Asked:** show the profile picture in the top-right circle (it still read "AM"), and make the caught-up box a little
  smaller and more aesthetic.
- **Found:** the circle showed the photo only when it came through the profile; a cached profile on the device could
  hide a photo added elsewhere, and members who signed in with Google but never added a Brivia photo had only initials.
- **Done:** the row's photo always wins over a cached copy; with no Brivia photo, the member's own Google picture
  (https, googleusercontent.com only, no referrer) shows in their own circle only, never to anyone else and never saved;
  initials remain the last fallback. The caught-up card a size down: 380 px, 52 px mark with a quieter halo, a smaller
  heading and copy, a compact pill. e2e deck 201 and app-shell 214 pass.

## D-148 (2026-11-04): a logo for every company

- **Asked:** "I WANT LOGOS FOR EVERY COMPANY" (Swiggy showed the default mark).
- **Found:** only 5 of 930 companies had logos. The seeded 926 had names only, and the lazy fill (a Wikidata lookup
  when a member searches) misses whenever the search lands on another entry, as it did for Swiggy.
- **Done:** `supabase/catalog/company-domains.txt`: the official website of each of the 926 (`scripts/build-company-
  domains.mjs` writes `0040_company_icons.sql`); `company.icon_domain` (not unique: Oracle's two entries, DMart and
  Avenue Supermarts, Digit share a site); the directory Edge Function's bulk pass (`kind: 'logos'`) fetches each site's
  square icon once (Google's icon service at 128 px, then DuckDuckGo's), stores it in `company-logos/directory/`, and
  sets the logo. It only fills empty logos of directory companies. Members' own organisations keep their uploads.
- **Sources, in order:** Google's icon service (the site, then its www. host), DuckDuckGo's, the site's own
  apple-touch-icon and favicon (an .ico served as a plain file is accepted only with the icon signature), then the logo
  Wikidata lists for an organisation with that website (a Commons PNG).
- **Result (live, 2026-11-04):** 876 of 930 companies have a stored logo. The other 54 (mostly public-sector banks and
  PSUs whose sites refuse automated requests, plus a few startups) show an initials tile instead of the building mark:
  wine initials on cream, the same tile size ("State Bank of India (SBI)" -> "SB"). Re-running the pass fills any that
  start answering; an admin can also upload a logo for them (MODERATION.md).
- **Proof:** SQL harness ALL PASSED (v-company C5: every seeded company has a website; the pass lists only empty logos,
  stores only directory paths, never a URL; members cannot call it); unit 480 (initials).

## D-149 (2026-11-04): upload a company's logo from the picked-company box

- **Asked:** an option in the same box as the selected organisation where the member can upload the logo.
- **Done:** the picked company's box has "Upload logo" beside Remove when the company has no logo yet (one of the
  companies whose site gave no icon, showing its initials), and "Change logo" for an organisation the member just added.
  The image is made a 128 px WebP in the browser, stored under the member's own folder, and `set_company_logo`
  (0041) makes it the company's logo, for everyone who works there. A member never overwrites an existing directory
  logo; they may replace the logo of an organisation they added; 10 logo uploads a day; each upload is logged
  (`company_logo_upload`) for moderation (MODERATION.md "Companies and logos" removes a bad one).
- **Proof:** SQL harness ALL PASSED (v-company C6: once only, no overwrite, own folder only, own organisation may
  replace, 10 a day, not for anon); e2e work-identity (initials tile, the button in the box, upload sets and shows it)
  at 1440 and 390.

## D-150 (2026-11-03): Delivered, Read and last active in chat

- **Asked:** "put read receipts, delivered on chat section and also last active time", in the site's own UI.
- **Done:** every message I send shows one cream tick (Sent: stored), two cream ticks (Delivered: the other member's
  app loaded it) or two warm amber ticks (Read: they had our conversation open on screen in a visible tab); the newest
  of mine also says "Delivered" or "Read" in the same small serif as the time. The chat header reads "Active now" with
  the presence dot, or "Active 12 min ago", "Active 3 h ago", "Active yesterday", "Active 28 Oct".
- **Server (0042):** `delivered_at` and `read_at` on `brivia_messages`, set only by the recipient through
  `mark_messages_delivered()` and `mark_conversation_read(other)` (security definer, recipient only, same-world rule;
  a trigger clears both on insert, and there is no update policy). The sender learns of it through Realtime UPDATE under
  the existing select policy. `connection_last_seen(ids)` extends 0018: connections only, not blocked, both "Show when
  I'm active" switches on; the time is rounded down to the minute and never comes with a place.
- **Privacy:** a message withheld because of a block (0013) is never marked, so the sender sees "Sent" as before and a
  block stays invisible. Last active follows the existing switch both ways (off: you are not shown and you see no one's).
  There is no separate read-receipts switch yet; one can be added the same way if members ask.
- **Backfill:** a message the recipient had already answered is marked read (and delivered) at the time of that answer.
  Older unanswered messages show Sent until the recipient next opens the app.
- **Superseded:** D-110's "the open chat's head is unchanged" (the founder now asked for last active there).
- **Proof:** SQL harness ALL PASSED (w-read-receipts R1–R5; a5 column list and hygiene whitelist updated); unit tests
  (receipts, presence lastSeen); e2e read-receipts (1440 and 390, before 0042 too), presence, chat-inbox, chat-extras.

## D-151 (2026-11-04): Read receipts switch, like and comment notifications, Posts renamed Notes

- **Asked:** "add the read receipts toggle", "notify users about the likes and comments if someone does on their
  posts", and "change the name of posts to Notes in nav bar".
- **Read receipts:** Settings → READ RECEIPTS, default on. Like WhatsApp it is mutual: when either member has it off,
  opening a conversation marks the messages Delivered only, so neither sees Read. Stored in `member_presence`
  (no client access) beside the active-status switch; 0043 redefines 0042's `mark_conversation_read`.
- **Notifications:** triggers on likes and comments write a `member_notification` for the note's author (never for
  their own, never across a block or the tester world). One like notification per liker and note (un-like removes an
  unread one; like again does not repeat); one per comment with an 80-character snippet (deleting the comment removes
  it). The bell groups likes per note ("Ravi and Asha liked your note") and shows each comment on its own, with the
  note's thumbnail; a row opens the note. While Brivia is open the chime and a toast announce it; when closed, web push
  (push-notify v4, sent by the liker's or commenter's app right after it saves). Replies to a comment notify the note's
  author only, not the person replied to (a later addition if wanted).
- **Notes:** the nav label is Notes; the view id `posts`, its URLs and the data model are unchanged.
- **Proof:** SQL harness ALL PASSED (x-post-notifications N1–N4; hygiene whitelist); unit tests (grouping and copy);
  e2e post-notifications (panel at 1440 and 390, Settings, before 0043), plus nearby, events, presence, read-receipts.

## D-152 (2026-11-04): Chat search finds people; mobile chat polish

- **Asked:** searching a name in Chat said "No threads found" even for a connection; a connected member must be
  discoverable from Chat search with no conversation, open their profile, press Message and start chatting; a
  polished, native-feeling mobile chat.
- **Cause found:** the sidebar searched only the conversation rows this device had drawn. A connection whose thread
  was removed from this device's inbox ("Delete chat" hides it locally), or whose card had not loaded, could not be
  found. Live data confirmed the founder's case (a mutual connection with messages, not shown).
- **Done:** `chat_people_search` (0044) searches the members the caller may see (same rules as everywhere:
  same world, no block, both completed) by every word of the query: word starts of the name, or anywhere in title or
  company. It returns name, photo, title, company, a 140-character bio preview, the relationship (connected,
  request received, request sent, none; a decline is shown as "request sent" so it is never revealed) and whether a
  conversation exists. The sidebar shows Conversations (local, with message text) then People (server), each person
  once. Message opens the existing conversation or a new one with a connection immediately, restores a hidden thread,
  and never sends a request. Profiles opened from search show Message, Review their request, Connect, or "Request
  sent". Before 0044 the device's own connections are still found.
- **Mobile:** keyboard-safe composer (visualViewport on iOS, `interactive-widget=resizes-content` on Android), thread
  pinned to the latest message on resize, one-line header with ellipsis, 16 px inputs, 44 px targets on touch widths,
  safe-area padding, contained scrolling, send button state, Send keeps the keyboard up. Inbox times say Yesterday /
  weekday / date for older messages.
- **Not changed:** the desktop layout and the design language. No mock users.
- **Proof:** SQL harness ALL PASSED (y-chat-people-search S1–S5); unit tests (chat-search); e2e chat-search at 1440,
  390, and layout at 320/375/390/430/768, plus chat-inbox, read-receipts, presence, post-notifications, app-shell,
  mobile-polish, collab-requests, chat-extras. Not tested on a physical iPhone or Android phone (headless browsers only).

## D-153 (2026-11-04): a sharper landing hero, and a phone crop that follows the subject

- **Asked:** "improve the quality of the video on home page ... and also make it look better on phone view both angle
  wise and quality wise".
- **Found:** the D-062 encodes were already within SSIM 0.99 of their master, so compression was not the problem. The
  footage itself is soft (upscaled), and on phones the fixed centre 9:16 crop cut most scenes in half (the passports,
  the Paris street, the plane window, the tennis kit).
- **Quality:** re-encoded from the original export (HEROSECTIONVI.MOV) with a two-pass luma unsharp (wide radius for
  soft edges, small for fine lines; no halos at 100%), AV1 and HEVC in 10-bit (no banding on skies and walls; codec
  strings updated to Main 10), lower CRFs with a bitrate ceiling so each file stays under the 20 MB hero cap.
- **Phones (angle):** the portrait file is now a 1216x2160 native-density crop that follows the subject, scene by
  scene, from a keyframed path chosen on a 0.5 s contact sheet (`PORTRAIT_PATH` in scripts/encode-hero-4k.mjs; eased
  pans timed to the transitions). Portrait phones also get their own poster (hero-portrait.webp, the first frame of
  that crop), preloaded with a media query and swapped in before first paint, so the landscape poster is never fetched
  on a phone.
- **Sizes:** landscape AV1 18.9 MB, HEVC 19.3, H.264 19.5; portrait AV1 7.6, HEVC 8.8, H.264 11.5 (all under 20 MB).
  The `<video>` no longer carries a poster in the markup: an inline script sets the one matching the screen from its
  preload, so each device downloads exactly one poster.
- **Proof:** landing spec (poster per orientation, one poster request, LCP, transfer budget), landing-sound, asset
  budget, unit tests; a 1-per-second contact sheet of the encoded portrait file shows the subject in every scene.
  Not checked on a physical phone.
- **Unchanged:** the source order and selection logic (AV1, HEVC, H.264 per frame; MediaCapabilities keeps a smooth
  one), the 20 MB cap, desktop framing.

## D-154 (2026-11-04): one opener in "Make the first move", and typing you can see

- **Asked:** "just one text suggestion is enough to pitch, refine this box" and "add a typing feature in chats section".
- **Pitch box:** the three suggestion pills and the different pre-filled line (four openers at once) are replaced by
  one opener already written in the box (the most specific: the shared event, then a shared interest, then a general
  line, first name only) and a small "Another idea" button that swaps it for the next. Shorter box, the hint under the
  counter, 16 px on phones. Same for the companions page composer. `nextSuggestion` in connect-composer.js.
- **Typing:** the D5 indicator (a small pill under the header) was easy to miss. Now: the header line reads
  "typing…" in wine italics, and a bubble with three rising dots sits at the foot of the thread in the other member's
  bubble style. The inbox rows of the 8 most recent other conversations say "typing…" in place of the last message,
  receive-only, on each pair's own private channel (the same 0012 authorization, so no one can fake it), only while
  the Chat screen is open, never for a blocked member; joins wait 1.5 s after the list settles and leave at once when
  Chat closes. realtime-js hands back the existing channel for a topic, so a row's listener is dropped before its
  thread joins.
- **Checked live:** the 0012 typing policies are on realtime.messages and allow the founder's matched pairs.
- **Proof:** unit (nextSuggestion), e2e chat-extras typing T1–T9 (T9 new: rows), companions, chat-search, chat-inbox,
  read-receipts, presence, deck.

## D-155 (2026-11-04): the generator watermark is removed from the desktop hero

- **Asked:** "remove the gemini logo from the video as soon as possible from desktop view".
- **Done:** the source clip carries a four-point sparkle watermark, bottom right, fixed for the whole clip (x 3405-3555,
  y 1720-1875 at 3840x2160). The full-frame encodes now run `delogo` over that box (filled from the surrounding
  pixels) before sharpening; HEVC first (Safari), then AV1 and H.264, and the landscape poster. The portrait crop never
  reaches that corner (its right edge stops at x 3373), so the phone files were already clean and are unchanged.
- **Note:** a faint soft patch can show where the mark was on busy frames (the chess board); it reads as background.
  A clean master from the video tool, exported without the watermark, would remove even that.

## D-156 (2026-11-04): city suggestions from the first letter; every interest shows; 10 swipes a day

- **Asked:** "dont recommend cities by yourself let them type first letter then based on that recommend", "i want
  this complete list of interests, nothing must be left", "allow only 10 free swipes a day and for event find my
  companion also 10 swipes max per day", and real-looking photos for the seeded accounts.
- **Cities:** an empty search shows no list anywhere (signup area step, guided setup, Edit profile, Create Event).
  One letter lists place-list cities that **start** with it, launch cities first; two or more letters use the worldwide
  directory as before (`searchPlaces`).
- **Interests:** the founder's list (1,131 unique names; it repeats UI Design, UX Research and Extreme Programming)
  was already the catalogue, except "DJing", now "DJ" (0045). The real gap was the client: `fetchInterestNodes` read
  `interest_node` in one request, and the API answers at most 1,000 rows. With 1,431 active nodes, **365 interests**
  (every id after `sports.team.basketball`: most team sports, all of tech, travel, wellbeing...) never reached the
  pickers. It now reads in pages of 1,000.
- **Swipes (0045):** Pass and Pitch on the deck share **10 per rolling 24 h** (the existing signal quota, now counting
  passes; config `signal_daily_limit = 10`). Find my companion: **10 per rolling 24 h** over all events (config
  `companion_swipe_daily_limit = 10`). Both enforced by the server (PT429), shown as "N of 10 swipes left today",
  with both buttons held at 0. Rolling 24 h, not midnight, to match the existing quota and its "More at 3 PM" copy.
  Companion Connect checks the cap **before** the composer opens, so no request is sent for a refused swipe. A
  companion request still also uses one deck swipe (it goes through `send_signal`). Config rows, so the founder can
  change either number (or offer more to a paid tier later) without a migration.
- **Not done: photos on seeded accounts.** The open test world is on (0010, live `open_test_world = true`), so the 60
  seeded members appear to real members. Real people's photos on invented profiles shown to real members would mislead
  them (they would spend their 10 daily swipes and send requests to people who do not exist) and use strangers'
  likenesses without consent. The seed keeps its monogram avatars. Options for the founder: photos of real teammates
  or friends with their consent, illustrated avatars, or closing the open test world before launch.
- **Proof:** SQL harness all passed (new `z-daily-swipes.test.sql`; orbit-signals, trust and hygiene updated for the
  new cap), unit 497, e2e deck 201, onboarding 269, location 64, create-event, companions. consent.spec.mjs crashes at
  its line 328 (the collab-review Accept button, removed by D-132) on the code before this change too; not fixed here.

## D-157 (2026-11-04): edit, unsend and delete for me, from a long press on a message

- **Asked:** "add edit message and unsend message feature and delete for me message in the chats section popping after
  long pressing the text".
- **Menu:** a long press (450 ms, cancelled by a 10 px move or a scroll) on any bubble opens a small menu beside it;
  right-click on desktop and Android's own long-press menu open the same one; Enter, Shift+F10 or the context-menu key
  on a focused bubble too. Items: **Copy** (text messages), **Edit** (my plain text message, within 15 minutes),
  **Unsend** (my message, any time), **Delete for me** (any message). Unsend and Delete for me ask once inside the menu.
  On phones the system callout and text selection are off on bubbles, so Copy lives in the menu.
- **Edit:** the text goes back into the composer under an "Editing message" bar (× or Escape cancels); Send saves it.
  The bubble says "Edited" for both members. 15 minutes, like the large messengers: long enough for a typo, short
  enough that an answer is not rewritten under the other person. Plain text only (not photos, files, shared cards).
- **Unsend:** "delete for everyone", any time: both apps show "You unsent a message" / "This message was unsent" in
  place of it (also on the inbox row); the content and attachment are cleared on the server and a chat upload is removed
  from storage (never the member's resume). It cannot pull back a web push already delivered.
- **Delete for me:** the message leaves my view on every device (server mark, not localStorage); the other member keeps it.
- **Server (0046):** three SECURITY DEFINER RPCs; still no UPDATE/DELETE policy for members. Each finds the message
  under the select policy's world rule. Realtime: a second UPDATE stream (recipient = me) brings their edits and
  unsends live; "deleted for me" is enforced by brivia_message_visible, so those rows leave reads and Realtime.
- **Proof:** SQL harness all passed (new `za-message-edit-unsend.test.sql`; a5 column pin, hygiene allow-list), unit
  504 (new message-actions), e2e message-actions MA1–MA6 (phone long press, desktop right-click, keyboard, before 0046),
  read-receipts, chat-extras 150, chat-inbox. chat-search.spec.mjs times out on a profile dialog on the code before this
  change too; not fixed here.

## D-158 (2026-11-04): Connect takes a light veil of the aura gradient

- **Asked:** "change the color of this slide to the gradient we are using, but not too much" (the Connect page).
- **Done:** the room photo keeps its place; a layer under the content (`aura-theme.css`, `.app-view[data-view="home"]::before`)
  adds the aura's lilac, wine, mint, rose and peach glows at 62% opacity, so Connect reads like the other pages. The
  card, buttons and text are untouched. To make it stronger or softer, change that one opacity. Deployed 2026-11-04.

## D-159 (2026-11-04): the deck card never hides View profile; the "caught up" box is plain paper

- **Asked:** "pls fix this bug, its getting overlapped, also remove little gradient from You are caught up box".
- **Phones:** the card had a fixed height (460-560 px) sized before the location line and "Distances appear as your
  area fills up." were added; with five chips View profile was pushed past the card's edge, under the swipe hint. The
  height is now a minimum: the card grows to fit and the hint sits below it.
- **Short desktop windows:** the chip area's two-row cap cut the third row in half just above View profile.
  `fitCardChips` (app.js) hides any chip that would not show whole (re-run on resize); "You both" chips come first.
- **Caught up:** `#home-empty-state` is plain `--color-card-paper`, like the member card (no aura).
- **Proof:** measured at 1800x990, 1440x800, 1280x720, 390x844, 390x664, 360x640; unit 504; e2e deck 201.

## D-160 (2026-11-04): no bluish glows; the Filters drawer on the aura

- **Asked:** "add gradients to it as well, remove the bluish gradient everywhere" (the Discovery filters sheet; the
  lavender and blue-green patches on Nearby and the sheets).
- **Done:** every aura gradient takes its colours from tokens, so the two cool ones are warm now: `--aura-lilac` is a
  soft blush and `--aura-mint` a pale apricot (names kept so no gradient changes shape). The aura is blush, peach, rose
  and wine everywhere (pages, sheets, Connect's veil). The filters drawer gets `--aura-sheet`, a frosted footer and the
  shared `--aura-scrim`. Old landing-only styles (style.css bubbles, auth-modal constellation) were not touched.

## D-161 (2026-11-04): pinker warm blush; one blush gradient on every status box

- **Asked:** "remove bluish gradient lil more, pinkish warm blush would work and change the caught up box for all slides
  into warm pink blush gradient box".
- **Done:** `--aura-lilac` and `--aura-mint` are both warm pink blushes now (pinker than D-160). New token
  `--aura-blush-box` (deep blush top left, a breath of wine top right, peach low, on blush-tinted paper) on every status
  box: the deck's "You're caught up", Nearby's "It's a little quiet around here" / "Nearby opens soon", Companions,
  Explore's empty events and Notes' "Start the conversation". Supersedes D-159's plain paper for the caught-up box.

## D-162 (2026-11-04): a one-tap Hiring toggle on Connect; seeded hirers only for testers

- **Asked:** "i need a toggle button so that it is easy for the users to search for hiring people. Also for sometime
  add some real looking profiles who are hiring so that the feature can be tested end to end".
- **Done:** a "Hiring" pill beside Curated / Nearby (`#hiring-toggle`, 50 px like the switch it sits beside,
  `aria-pressed`, deep wine when on). It is the same Hiring lens as the drawer switch, kept in sync both ways, shown
  only once hiring is live. `supabase/seed/hiring-test-members.sql`: 12 seeded hirers, 14 roles at invented
  companies, 6 findable seekers, idempotent with fixed ids, removed by the purge.
- **Why the gate (0047):** `open_test_world` is on live, so real members see seeded members; a seeded Hiring banner
  would be a job that does not exist, the same harm D-156 refused for seeded photos. Seeded roles and intents are
  shown only to the strict test world (seeded members and `brivia_tester` accounts), and real members cannot ask about
  them. Seeded members skip the photo and 14-day parts of the hiring bar, since they never carry a photo.
- **Not done:** seeded members' Looking for is unchanged (no "Hiring" tag a real member could see).

## D-164 (2026-11-04): the deck is dealt in, with a soft "deal" sound

- **Asked:** "design an animation for the cards coming and stacking with a sound while the connection curated page is
  loaded ... super smooth and professionally designed ... not a very large time span, just it should catch the
  attention". Skills named: GSAP skill pack, Animate, Claude Motion Graphics, Impeccable. None of the four is installed in
  this repo or session (`.claude/skills/` has frontend-design and ui-ux-pro-max); built with GSAP's own best practices.
- **Motion (`site/scripts/deck-intro.js`, GSAP 3.15.1 core only):** once per page load, the first time real people are
  on the deck, and again when switching Nearby back to Curated. The back layer is dealt in from the lower left, the next
  layer from the lower right (90 ms later), the top card straight up last (180 ms) with a small overshoot; the stack
  gives 4 px under it and recovers; one soft light band crosses the top card; Pass / Pitch and the hint rise in. About
  0.9 s of motion, 1.2 s in all. Transforms and opacity only; every inline style is cleared at the end so deck-swipe.js
  owns the card again. Any tap, click or key finishes it at once. The timeline starts on the second frame after render
  and lag smoothing is 100 ms, so a slow frame slows the deal instead of skipping it. The deck tutorial waits for it.
- **Sound (`INTRO_CUE` in notify-sound.js):** three soft card taps (filtered noise over a low thump) in step with the
  three cards, then a two-note bell, B-flat to F (the kit's key), on the landing. About 1.1 s, quieter than the swipe
  cues. It follows the existing "swipe sounds" switch and the volume slider in Settings (that is the mute). Browsers
  allow sound only after the member's first tap on the page, so a cold reload is silent unless the browser already
  allows audio (`userActivation.hasBeenActive`, `getAutoplayPolicy`); the Curated tap always has sound.
- **Reduced motion:** no travel, rotation, gloss or sound; the cards and controls fade in over 150 ms.
- **Not chosen:** a bundled audio file (the kit is synthesized, no downloads); animating the headline (it is already on
  screen while the deck loads, so moving it later reads as a glitch); replaying on every tab return (gets tiring).
- **Proof:** unit 510 (tests/unit/deck-intro.test.mjs: timing, sound-to-motion sync, once-only rule, autoplay rules,
  mute); frame-exact captures at 390 and 1440 with Playwright's clock; swipe after the intro still works.

## D-165 (2026-11-04): the motion moments after the deal

- **Asked:** "this animation is good to go now work with other suggested animations" (the "Where motion fits next"
  list: N1-N10, on top of the launch-ux checklist's M1-M11).
- **Built (`site/scripts/motion-moments.js`, `site/styles/motion.css`):**
  - **N1 It's mutual:** a dialog when a signal comes back `matched`: both avatars glide in and touch, one wine ring
    pulses out, "You and X / both said yes.", the shared interests pop in, Say hi (opens the chat) / Keep exploring.
    About 1.4 s; Escape, the backdrop or either button closes it; focus stays inside. The existing toast still shows
    under it (it is the live-region sentence). Sound: the notify horn, under the notification-sound switch.
  - **N2 Pitch sent:** a small wine letter flies from the card in an arc to the Chat tab, which pops once. ~0.8 s.
    Founder, same day: "dont send the animation that goes to notification ... should go to the messages section".
  - **N3 Caught up:** when the last card is swiped away, the "You're caught up" box turns in (a Y-axis flip).
  - **N5 Tilt (desktop, fine pointer only):** the top card leans up to 4 degrees towards the cursor with a soft light,
    through the CSS `rotate` property so it composes with deck-swipe.js's inline transform; off while dragging, during
    the deal and under reduced motion.
  - **N6:** a new card's "You both" chips catch the light once.
  - **N7 (M9):** the Curated / Nearby pill slides from the option the member left.
  - **N8:** while Nearby loads, a slow radar sweep crosses the waiting card (the empty state already had rings).
  - **N9:** a chat bubble that was not on screen at the last render of that chat rises in (no replay on open).
  - **N10:** event cards (first 8 per render) fade up and their covers settle from 1.06x as they scroll into view.
  - **Not built:** N4 (Passion Budget fill) waits for the profile redesign. The accept-a-request path keeps its review
    sheet outcome (the moment shows for deck pitches and event hellos).
- **D-164 fix found by the deck e2e:** the deal skipped to its end on any pointerdown, which moved a button out from
  under a press and lost the click ("Why this person?" during the deal). A press on a button or link now skips on
  release; a press elsewhere (a drag) still skips at once. `tests/e2e/deck.spec.mjs` waits for the deal to end
  before its layout checks (it measures the resting stack).
- **Proof:** unit 513 (`tests/unit/motion-moments.test.mjs`); deck e2e 201/201 (main 201/201); screenshots of N1 and
  N2 at 390 and 1440 with the stubbed Supabase.

## D-166 (2026-11-04): the Hiring toggle moves beside the filter button, as a quick-filter switch

- **Asked:** "the toggle button is not looking good. Seach for a good spot to fit the button and redesign it
  professionally" (ui-ux-pro-max).
- **Done:** the D-162 pill sat in the Curated / Nearby row, a second wine block with the same weight as a mode that
  read as a third mode. It is a filter, so it now sits beside the discovery-filter button (`.home-tools`), where the two
  read as one filter group, and the Curated / Nearby switch keeps its full width on phones. It is a `role="switch"`
  with `aria-checked`: briefcase, "Hiring" in the body font at 14 px, and a 30 × 18 track. Off it uses the filter
  button's cream-and-wine frame, and on it fills deep wine with a cream knob, like the filter button when its drawer
  is open. It is 44 px tall and adds no height to the deck.

## D-167 (2026-11-04): "It's mutual" for every new match, not only the one my swipe completes

- **Reported:** "the mutual match animation is not working in live site". D-165 played it only when my own signal
  came back `matched`. On live, most matches are made the other way: I accept a request in the review sheet, or the
  other member accepts mine. Neither path showed it, and the review sheet is a modal `<dialog>` (top layer), so a fixed
  div could not have covered it anyway.
- **Now:** the moment is itself a modal `<dialog>`, so it shows above any sheet. It plays once per match per device:
  when my signal completes it, when I accept a request (Say hi closes the sheet and opens the chat; Keep exploring
  returns to the sheet), when the ~30 s connection sync finds a match the other member completed, and at the next load
  for a match made while I was away (one moment, not a queue). The ids already celebrated live in
  `brivia:mutual-seen:<member id>` (localStorage); the first visit on a device takes the existing matches as the
  baseline, so old matches never replay. Nearby keeps its own match dialog (those ids are marked seen).
- **Proof:** `tests/e2e/mutual-moment.spec.mjs` (new: baseline, other member accepts, made while away, no replay);
  `collab-requests.spec.mjs` now expects the moment over the sheet; deck 201/201, app-shell 214/214, sounds, hiring pass.

## D-168 (2026-11-04): four motion moments that did not play on live, fixed

- **Asked:** "check other animations work perfectly in the live site". A frame-by-frame walk-through of every moment
  (`tests/e2e/motion.spec.mjs`, new) found four that never showed in real use:
  - **N6 "You both" shimmer:** the deck redraws the card several times while data arrives; the next draw replaced the
    chips and wiped the shimmer. `renderCardChips` now keeps the same chips (keyed by person and chip labels).
  - **N2 letter on desktop:** it aimed at the Chat link's icon, which the desktop header hides (width 0), so it never
    flew. It now aims at the visible icon (phone tab bar) or else the Chat link, and looks for it over ~0.6 s while the
    pitch sheet closes.
  - **N3 caught-up flip:** the box often shows a moment later (when `deck_status` answers), by which point "the last
    render had a card" was already false. That flag is now kept until the box really shows.
  - **N7 sliding pill:** `setView` re-placed the pills on the next frame, which killed the slide. A plain re-place
    now leaves a running slide alone.
- **Proof:** motion.spec 10/10 (deal-in, shimmer, tilt, letter + Chat pop, flip, pill, radar, mutual, bubble, events);
  deck 201/201, app-shell 214/214, collab-requests, mutual-moment, sounds, deck-tutorial, events, nearby, work-identity
  pass; unit 513.

## D-169 (2026-11-04): the Hiring switch searches everyone who is hiring

- **Asked:** "still no one in hiring even though the new script is successful" (a tester, 16 open roles, with
  "Roles I'm open to" saved).
- **Cause:** the lens (D-141) only filtered the cards already loaded in the deck, and for a member with an intent it
  kept only roles that fit (0.5 or more). The seeded roles were neither loaded nor a fit, so the switch showed no one.
- **Done:** migration 0048 adds `hiring_people(limit)`: members with a shown role whom the caller can see, roles that
  fit first, then nearest (own rings, then the nearest place), no distance cut (search reaches everyone), the
  distance band only, never a matched member or one with a live request from the caller, at most 50. Turning the
  switch on loads those cards to the front of the deck. The lens now keeps everyone hiring for every member ("Only
  people who are hiring"); fit only orders. With the switch alone on and no one hiring, the deck says "No one is
  hiring near you yet." Before 0048 the switch falls back to the loaded deck.

## D-170 (2026-11-04): hiring matches are not cut by distance

- **Asked:** "make the hiring match not use the location. Ofc show the nearest first but show all the vacancies".
- **Done (0049):** `hiring_suggestions` (the deck lift and the "someone near you is hiring" row) drops the ~10 km /
  60 km admission; who is suggested still needs a fit of 0.5 or more, and the nearest come first. `hiring_people` (the
  Hiring switch) returns up to 200 hirers (was 50), nearest first with fit breaking ties (was fit first). Both answer
  the distance band only.
- **Scope:** the founder's override of CLAUDE.md rule 4 ("far-away recommendations are earned") for the hiring lane
  only. The connection deck (`deck_candidates`, the Escape-Velocity gate) is unchanged. Supersedes D-169's order.

## D-171 (2026-11-04): seeded hiring posts follow the open test world

- **Asked:** "im testing with yashika's account. I want everyone to show all the hiring posts just the nearest location
  first".
- **Found:** the account under test was not a `brivia_tester`, so 0047 hid every seeded role from it, although
  `open_test_world` already shows it the seeded members themselves.
- **Done (0050):** `brivia_hiring_seen_by` uses `brivia_in_test_world` (the deck's own world rule). While the open test
  world is on, every member sees all seeded roles and seeded "Open to roles", nearest first (D-170); switching
  `open_test_world` off hides them from everyone but testers. Real members' roles are unchanged.
- **Trade-off:** supersedes D-162's "only testers": real members can now see, and ask about, seeded roles at invented
  companies while the world is open. The founder's call for the test phase; turn the world off before a real launch.

## D-172 (2026-11-04): the profile hero's text fits beside the photo card

- **Asked:** "fix the overflow of the text in the mobile view for the bio. Make it look professionally designed", with
  a 390 px screenshot where the work line ("Talent Acquisition at Stealth Startup") ran under the photo card and the
  name ended in an ellipsis after a few letters.
- **Cause:** the work line was a nowrap line in a flex column that sized it to its own text, so its ellipsis never
  applied; the bio's 3-line clamp was undone by an `overflow: visible` rule and a later 20 px size on phones.
- **Done (`site/styles/profile-hero.css`, CSS only):** the work line wraps to 2 lines inside the column (logo on the
  first line); the name wraps, balanced, to 2 lines at most, and a name that fits stays on one line (D-098's one-line
  check for "georgian-86" still holds); the area is one line; the bio is 3 lines at most with an ellipsis (the whole bio
  is in About). Type scale: 1440 name 40-64 px, work 15 px, area 20 px, bio 18 px italic; phones name 24-32 px, work
  13 px, area 16 px, bio 14 px italic. The phone photo card is a little slimmer (32vw, 112-160 px, was 36vw, 124-172 px)
  so the column has room. Supersedes D-098's "the name on one line" for names that do not fit.
- **Readable on every cover (founder: "make sure it is readable"):** the neutral ink shade under the text column is
  denser (76-80% at the left, fading out before the photo card; still no maroon wash, D-113) and the copy has a tight
  shadow. Measured against all 25 covers at 390 and 1440, cream text over the 90th-percentile background pixel: 5.0:1
  or better everywhere (was as low as 2.2:1 on the lightest covers).
- **Check:** `tests/e2e/profile-hero.spec.mjs`.

## D-173 (2026-11-04): no account-age wait before a hirer's role shows

- **Asked:** a real hirer (a new account) was missing from Hiring. The check showed no open role yet and an account
  0 days old; the founder chose "Remove the wait" over 1 day or keeping 14 days.
- **Done (0051):** `brivia_hiring_bar` drops the 14-day account age; a completed profile, a photo (seeded members
  exempt), a confirmed email, no open flag and the hiring switch still apply. `brivia_hiring_live_from` is the
  account's first day, and the client no longer promises a go-live date: an under-bar role says it shows once the
  profile has a photo and a confirmed email.
- **Trade-off:** supersedes the 14-day part of D-141's bar. A scam account can post on its first day; reports
  (`report_fake_job`, which pause the role) are the remaining guard. Revisit before a real launch.


## D-174 (2026-11-04): the deck arrives with a solitaire-style shuffle

- **Asked:** "Make the stacking animation more lenghty and better kinda like shuffle in solitaire. Use the
  professionally designing skills". Supersedes D-164's 0.9 s deal-in.
- **Motion (`site/scripts/deck-intro.js`, about 3 s, five beats):** a squared pack of eight card backs (deep
  wine, a fine gold lattice, a hairline gold frame, the club wordmark "the Brivia CLUB" in gold) rises into the card's place; it splits into two halves
  that lean apart; the halves riffle back together one card at a time, alternating, bottom cards first; the pack is
  squared with a small tap; then the back two cards slide out behind it, the pack's top card turns edge-on and the
  member's card flips face up in its place. The stack takes the weight, the gloss crosses, Pass / Pitch rise in. On a
  phone the halves part less (22% instead of 36%) so they stay on screen. Transforms and opacity only; the pack is
  removed and every inline style cleared at the end. Any tap or key still skips to the resting stack.
- **Sound (`INTRO_CUE`):** a swish on the split, a light tick as each riffled card lands, a muffled tap on the
  square-up, three soft taps on the deal, then the same B-flat to F bell on the landing. Same switch and autoplay rules.
- **Design rules followed (ui-ux-pro-max / frontend-design):** one orchestrated load moment, deceleration on arrival,
  acceleration on the riffle drops, interruptible, never blocks input, reduced motion keeps the 150 ms fade.
- **Fix found while capturing:** later-positioned from-tweens painted the first frame before their start (an edge-on
  card showed for one frame); the dealt cards and controls are now hidden with a set and revealed with a to-tween.
- **Proof:** unit 516 (`deck-intro.test.mjs`: beat order, a real riffle, sound in sync); deck 201/201, app-shell
  214/214, deck-tutorial, motion (10/10), sounds, work-identity; frame captures at 390 and 1440.
- **Card backs (follow-up, same PR):** Arovas asked for their logo on the backs instead of the B, then for the wine
  backs to stay with the logo in gold. The PNG was cut to a transparent, trimmed wordmark and filled with a metallic
  gold gradient: `site/media/assets/brivia-wordmark-gold.webp` (560 px, ~24 KB; original kept in `source-media/`).
  New token `--color-gold` tints the lattice and frame; `app.js` preloads the image so the first shuffle frame has it.
  A black "the" and a full-width tagline were tried and reverted on Arovas's call: the final back is the all-gold
  wordmark with no "Swipe. Match. Build" line (560 px, ~42 KB), rebuilt from the original by
  `scripts/build-wordmark-gold.py`.

## D-175 (2026-11-04): Search Console verification and the first SEO pass

- **Asked:** "add the file for search console and do SEO" (Arovas).
- **Verification:** the HTML file Google issued lives at `site/public/google4d360d183cb779a9.html` and is served at the
  site root (shipped first, PR #53). It must stay, or the property loses verification.
- **Index only the public pages:** `/`, `/auth.html`, `/careers.html`, `/privacy.html` are in `sitemap.xml` with a
  canonical URL, a description, Open Graph and Twitter card tags (shared `og-image.jpg`, 1200×630).
- **Keep the member app out:** `app.html`, `chat.html`, `explore.html`, `profile.html` send `noindex, nofollow` as a
  meta tag and as an `X-Robots-Tag` header. They are deliberately **not** `Disallow`ed in `robots.txt`: a crawler that
  cannot fetch a page cannot see its noindex, and a blocked URL can still be indexed from links. `robots.txt` blocks
  only `/data/` (static lookup JSON). No member data is in any static page; profiles render client-side after sign-in.
- **Structured data:** one Organization + WebSite JSON-LD graph on the landing page (name, logo, contact email, the
  Instagram and LinkedIn profiles). No JobPosting on careers yet: Google requires a posting date, full description and
  location rules per role, which the page does not carry.
- **Performance basics:** already in place (hashed `/assets/*` cached immutable, hero poster preloaded, below-fold
  images lazy with sizes). Added a one-day cache with a week of stale-while-revalidate for the icons and OG image.

## D-176 (2026-11-04): Vercel Web Analytics and Speed Insights

- **Asked:** "now add analytics" (Arovas).
- **Choice:** Vercel Web Analytics (page views, referrers, countries, devices) and Speed Insights (Core Web Vitals),
  through `@vercel/analytics` and `@vercel/speed-insights`, loaded by `site/scripts/analytics.js` on the five real
  pages (landing, auth, app, careers, privacy). Picked over Google Analytics because the site is already on Vercel and
  both are cookieless with a daily-reset visitor hash, so no cookie banner is needed and no third-party ad tracker sees
  members. GA4 or a product-analytics tool can be added later if per-feature funnels are needed.
- **Privacy:** `analytics-url.js` drops every query parameter except `view` and the whole hash before an event leaves
  the page, because sign-in hand-offs carry one-time codes and tokens there (unit `analytics-url.test.mjs`). No custom
  events, no user ids, nothing from Supabase is sent. The privacy notice names the analytics and Vercel as host; the
  notice version is unchanged (no new personal data and no new consent).
- **Needs the dashboard:** both products must be switched on (Speed Insights already was on 2026-11-04; Web Analytics was not) for the project in Vercel (Analytics and Speed Insights
  tabs), otherwise `/_vercel/insights/*` returns 404 and nothing is counted.

## D-177 (2026-11-04): faceless real-looking photos for the test hirers

- **Asked:** "i need to add picture in the profile for test hireres", then "i need real looking picture in which faces
  are not visible".
- **Done (0052):** the 12 seeded hirers get Unsplash License photos with no face in them (hands at a laptop, a
  handshake, a suit with the face out of frame, a person seen from behind), cropped to 480 px WebP and shipped in
  `site/public/test-avatars`. `profiles_photo_url_storage` accepts `/test-avatars/tNN.(webp|jpg|svg)` on a seeded row
  only; `hiring-test-members.sql` sets them once 0052 is in. Sources are listed in `supabase/seed/README.md`.
- **Why faceless:** D-156 refused strangers' faces on invented profiles. Photos without a face carry no one's
  likeness, and many real members use a picture like this. The seeded profiles are still invented, so the open test
  world should close before a real launch.
- **Not done:** an AI image generator was tried for these and returned a generic page mock-up with faces, so
  none of its output was used.


## D-178 (2026-11-05): plain wine shuffle card backs
- **Asked:** "remove the grid pattern from the back of the cards and make the cards color wine color as used elsewhere
  in the website. rest keep the same".
- **Done:** the gold lattice is gone from `.deck-shuffle-card` (`site/styles/deck.css`) and the back is
  `--color-oxblood` (#4c1315), the wine of the member card's own photo frame, instead of `--color-wine-deep`
  (a first pass used `--color-wine`; Arovas asked for the card's wine instead). The gold wordmark, the soft gold glow
  behind it, the hairline gold frame and the dark edge are unchanged, as is the shuffle motion and sound (D-174).
## Renumbering note (2026-11-05)

Two sessions logged decisions in parallel on 2026-11-04 and 2026-11-05. The entries below were written on branch
`claude/eloquent-ramanujan-w942g9` while `main` used the same numbers for other decisions (D-172 to D-178 above). They
are kept as D-179 to D-186 (same order and wording), and the branch's migrations are 0053 (event tickets and payments)
and 0054 (global hiring discovery); `main` has 0051 and 0052. Founder, 2026-11-05: Connect opens with D-174's
solitaire shuffle; D-179's intro deal and D-185's pile-and-flip deal are not used. D-179's daily-limit shuffle is.

## D-179 (2026-11-04): the signature deck ritual (intro deal, daily-cap shuffle, deck sounds)

- **Asked:** a Solitaire-inspired, cinematic deck on Connect: the deck assembles on arrival and the top card rises into
  the live profile; Pass sinks left, Pitch lifts right; when the daily free swipes are used the deck spreads, gathers,
  shuffles and reforms with "That's your deck for today."; a musical language to match; reduced motion and sound
  preferences respected; never touching the swipe-limit logic.
- **Built:** `site/scripts/deck-ritual.js` (pure choreography, unit-tested, plus one controller) and
  `site/styles/deck-ritual.css`. Five card backs (deep wine, champagne frame, the wordmark, a faint lattice) live in an
  overlay over the stack; the profile card is never restyled, only hidden while they move (it keeps its size).
  - Intro: deepest back first, one every 120 ms from a different side, a gentle spring (CSS `linear()` easing, about 3%
    overshoot; a cubic-bezier elsewhere), squared Solitaire offsets; the top back lifts clear and the live card rises;
    the peek layers fade in. About 1.7 s. Once per visit (sessionStorage), not on every return; a new swipe window
    (the quota freeing up) deals again. Swipes are held while it runs (no double or accidental swipes).
  - Completion: driven only by `quotaBlocked(signalQuota) === 'daily'` (the server's quota, D-156), never a timer, and
    only after the last card has flown out. Fan (0.45 s, narrower on phones so nothing leaves the screen), riffle back
    (the halves interleave and drop one by one), square up, then the words on the top card with the refresh time from
    `resets_at`. About 2.3 s. Opening Connect already capped shows the finished deck at once (no replay). No profile is
    offered (card hidden and inert), and the shuffle never counts, resets or grants a swipe.
  - Supersedes D-026's "at zero, the card stays with a notice" for the daily cap (the live cap keeps its notice).
  - Pitch now lifts as it leaves (y -64 px); Pass still sinks a little. Everything else about the swipe is unchanged.
- **Sound:** two new cues in the same horn / B-flat language (notify-sound.js `RITUAL_CUES`), timed from the
  choreography constants so each soft piano tick lands with its card: `deal` (rising ticks, then F to B-flat over a
  B-flat chord) and `complete` (a falling arpeggio as the deck fans, riffle ticks, a closing F-D-B-flat over B-flat
  major 9). Quieter than a swipe; follow the existing browser unlock (silent until a gesture) and the Settings switch,
  now "SWIPE & DECK SOUNDS"; at most once per 4 s each, so a re-render can never stack them.
- **Proof:** unit 514 (new deck-ritual tests: timings, riffle, squared stack, symmetric fan, spring overshoot, copy,
  once-per-visit, cue timing); e2e `deck-ritual.spec.mjs` DR1-DR8 (intro, held swipes, once per visit, the shuffle at
  the cap with no extra swipes, finished deck on return, a fresh deal on a new window, reduced motion, phone); deck 201
  (zero-quota checks updated to the finished deck), companions 65, message-actions 30, read-receipts 23, chat-inbox 15,
  onboarding 269. The app-stub counts passes as swipes with `passesUseSwipes` and marks the intro played unless a spec
  sets `deckRitual`.

## D-180 (2026-11-04): the daily-cap shuffle is fast, like Solitaire

- **Asked:** "make the cards shuffle too fast just like they do in the solitaire game".
- **Done:** the completion is now a quick fan (0.2 s), a fast riffle (cards drop 30 ms apart, 0.26 s each, a crisp
  ease with no overshoot), a cut (top half right, bottom half left, 0.15 s), a second riffle, then a snap square-up.
  The cards are squared by 1.1 s and the message shows by 1.6 s (was about 2.3 s). The `complete` cue follows: a quicker
  falling arpeggio and light riffle ticks, one per card across both riffles, then the same closing horn line. The
  intro deal is unchanged. Supersedes D-179's 1.5-2.5 s target for the shuffle.

## D-181 (2026-11-04): the Connect profile card on the warm pink blush

- **Asked:** "change the color of these profile cards acc to our gradient".
- **Done:** new token `--aura-blush-card` (deepest blush low left under the name and chips, a softer blush right, a
  breath of wine low right, peach at the top edge, on blush-tinted paper) on the deck card and the two cards peeking
  under it; the avatar ring matches; the chips are frosted cream with a hairline. The wine title bar, cover, layout and
  View profile are unchanged. Dark ink on the blush stays well above WCAG AA.

## D-182 (2026-11-04): the landing's START SWIPING sits lower on phones

- **Asked:** "move the start swiping button little down". On phones it sat 9 px from the top edge; it is now 12 px
  lower (a transform, so the header's layout is unchanged). Desktop is unchanged.

## D-183 (2026-11-04): Razorpay payments for paid events; an emailed invitation ticket; a ticket sound

- **Asked:** "when a user registers for an event after making payment, a music effect should come and the user should
  get his ticket of the event on his mail with some aesthetic theme colored invitation". There was no payment gateway
  (D-121 left paid seats "Payment pending") and no email sender. Founder's choices: **Razorpay** and **Resend**.
- **Payments:** Reserve keeps the 0022 hold (30 minutes) and opens Razorpay Checkout at once (club wine, asks before
  closing). `razorpay-order` creates the order with the event's fee from the database (never the browser's) for a live
  hold only; `razorpay-verify` checks Razorpay's HMAC signature with the key secret and that the order is the caller's
  own, then calls `confirm_event_payment` (0022, service role only, idempotent); `razorpay-webhook` (signature over
  the raw body) confirms the same way when the tab closed mid-payment. If the hold had expired and the last seat went
  meanwhile, the payment is refunded at once. A closed Checkout keeps the hold with "Complete payment · ₹X".
- **Ticket:** every confirmed seat (paid, or a free registration) gets one email via Resend: an invitation in the
  club's colours (blush paper, the poster, a deep wine ticket with a champagne frame, serif type, date and time in IST,
  venue, guest, a perforated stub with BRV-XXXXXX and Paid/Free), View event and Directions, a plain-text twin and a
  calendar invite (.ics). Sent once: the row is claimed with `ticket_sent_at` in one UPDATE (verify and webhook can
  race); a failed send releases the claim. The app only says "Your ticket is on its way" when the server sent it.
- **Sound:** a new `ticket` cue (horn F, B-flat, D, F rising to a long B-flat over a warm B-flat major 9, a sparkle),
  played on confirmation; same Settings switch as the swipe and deck sounds.
- **Code:** `supabase/functions/{razorpay-order,razorpay-verify,razorpay-webhook,event-ticket}`, shared
  `_shared/{razorpay.js,ticket-email.js,send-ticket.ts,http.ts}` (the .js files are unit-tested in Node);
  `site/scripts/payment-checkout.js`; migration 0053. Setup steps: migrations README "0053".
- **Proof:** unit 525 (signatures against Node's HMAC, tampering, amounts, hold window, email content and escaping,
  https-only links, the .ics, Checkout options, the cue); SQL harness (zb-event-tickets); e2e `event-payment.spec.mjs`
  EP1-EP6 (17 checks), events 75, create-event 151, companions 65. The Deno functions were not run here (no Deno in
  this environment): their logic lives in the tested shared files, and they need a test-mode run once deployed.

## D-184 (2026-11-04): Global Hiring Discovery: the Hiring switch reaches everyone, ranked by fit, not distance
- **Asked (founder, 2026-11-05):** "Toggle Hiring ON → instantly discover professionals who are open to hiring
  opportunities anywhere in the world. No geographical restrictions whatsoever." Rank by skills, interests, experience
  and compatibility; page; live updates; respect privacy, blocks and deleted accounts; a subtle "GLOBAL HIRING
  DISCOVERY" label; Curated, Nearby and Hiring stay independent. Founder chose "Extend the live one": one query.
- **Decision:** migration 0054 replaces `hiring_people` under the same name. It adds members open to roles
  (`member_open_to`'s rule, so a seeker who chose "open roles only" is shown only to a hirer with an open role) to
  members with a shown role; drops distance from the order (supersedes D-170's nearest first for this query only;
  `hiring_suggestions` keeps it); scores 0.5 fit + 0.35 shared interests + 0.15 shared skills; pages by keyset; logs an
  impression per row served. The client keeps a paging pool (`hiringPool`), refreshes every 60 s and on tab return
  while the switch is on, and falls back to the old single call if 0054 is not applied yet.
- **Found on the way:** (1) the old client loaded the hiring cards once per session (`hiringPeopleLoaded` never reset),
  so turning the switch off and on again, or a new role elsewhere, showed nothing new: the likely cause of the founder's
  empty hiring deck. (2) Those cards came from `get_candidates`, which logs no impression, so a Pass on a far hiring
  card was dropped by `brivia_interaction_served` and did not count toward the 10 daily swipes. Both fixed.
- **Privacy:** the band is a place name or "Abroad", never a cell, a city/state pair or km; no email or phone is sent;
  mutual consent unchanged (a card still needs a like back or an accepted request).
- **Proof:** SQL harness `zc-global-hiring.test.sql` G1-G6 (grants, eligibility across cities, ranking, pages with no
  repeats, impressions and stored passes, close/reopen, kill switch, incomplete caller) and `seed-hiring.check.sql` HS5;
  unit 535; e2e hiring (all pass), deck 201, deck-ritual, explore-cards 74. `nearby.spec` (D-138 settings row) and
  `consent.spec` (cancelKeepsCard timeout) fail the same way without this change.

## D-185 (2026-11-05): the deck's opening deal becomes a Solitaire deal with a card flip (not shipped)
- **Outcome (founder, 2026-11-05):** at merge time, `main` already had D-174's solitaire shuffle; the founder kept it.
  This deal is not used. Its two fixes below (the Curated/Nearby pill and the profile dialog's focus) did ship.
- **Asked (founder, 2026-11-05):** "i need a very good animation, pls fix it" — the deck opening deal (chosen in the
  follow-up question). D-164's deal faded the three layers in half-transparent, so one person's name showed through
  another's while they flew in.
- **Decision:** `deck-intro.js` keeps D-164's contract (one GSAP timeline, transforms and opacity only, skips on any
  touch, click or key, clears every property it set, plays once per window) and replaces the choreography: a small
  face-down pile (wine card backs with an inner hairline frame and the club's "the B" mark, `.deck-intro-back`) fades in
  beside the stack; the three layers are dealt from it back to front on short arcs (x and y on different curves) with a
  little spin and overshoot; the top card lifts and flips face-up (rotateY with perspective, back swapped at the edge-on
  midpoint); the cards behind turn over under it; the stack settles, the gloss crosses, Pass / Pitch rise. Cards stay
  opaque throughout: only the stack fades, for 0.16 s. About 1.7 s. The cards behind keep their CSS fan origin so they
  land exactly where the stack holds them. Reduced motion is unchanged (a 150 ms fade, no backs, no sound).
- **Sound:** INTRO_CUE retimed: a tap as each card lands, the two-note bell on the flip (length 2.0 s).
- **Found on the way:** (1) `slideModePill` (motion-moments.js N7) snapped the Curated/Nearby pill to its end when a
  re-place came before the slide's first frame (`gsap.isTweening` is false until then); it now remembers its slide.
  (2) The public profile dialog moved focus in only after a timeout, so an Escape right after opening was lost; it now
  focuses at once (the timeout stays as a fallback).
- **Proof:** unit 535 (deck-intro: one pile, back-to-front, flip after landing, taps during each flight, bell on the
  flip, under 1.9 s); e2e deck 201, deck-ritual, deck-tutorial, motion, sounds, mobile-polish, work-identity, fit 324,
  hiring, explore-cards 74; no sideways scroll at 360/390 px during the deal; the card backs are removed afterwards.
  `launch-polish` (city search timeout) and `nearby` (D-138 settings row) fail the same way without this change.

## D-186 (2026-11-05): the Brivia ignition: the opening title drawn live, with music; also the loading screen
- **Asked (founder, 2026-11-05):** with a phone recording of the landing's intro video: "the loading video of brivia must
  be like this, w a very good music effect, make this video clean and non blur".
- **Found:** the intro shipped as `intro-video-1080.mp4` at about 58 kbps (soft, banded on the gradients), and phones
  scaled it a further 1.55x (mobile-final-fixes.css), so it was blurry everywhere and worst on phones.
- **Decision:** the title is no longer a video. `brivia-ignition.js` + `ignition.css` draw the same idea live: a
  crimson point breathes in on black, ignites, stretches into a 1 px hairline streak with a soft flare, and THE BRIVIA
  CLUB (Bodoni Moda 500, wide tracking) opens out of it from the centre letter; the point settles into a faint glow
  behind the name. Vector text and CSS gradients, transforms and opacity only: sharp at any size and pixel density,
  nothing to download but one preloaded font file (`font-display: block`, so it never flashes in a fallback face).
  1.8 s, inside the landing's 2.5 s intro cap (Phase B). The video and its poster are deleted.
- **Where:** the landing's first-visit intro (`#intro-burst`), and the "Opening your club" loading screen
  (`.brivia-handoff` on auth.html and app.html, now on black) with a glint that runs along the streak while it waits.
  Arriving on app.html from the sign-in hand-off shows the finished title (a still cut, not a restart).
- **Music:** "the ignition", synthesised with Web Audio in the sound kit's key (B-flat): a low swell and a rising air
  that draw in, a spark on the ignition, a soft low hit and a warm B-flat add 9 chord with a four-bell arpeggio on the
  reveal, in a generated hall reverb; about 4.6 s with its tail. The loading screen after Log in / sign up plays it (a
  gesture on that page lets it); the landing plays it when the browser allows sound, or from a tap during the intro
  (part-way, so the chord still lands on the name), then brings the soundtrack in under its tail. Silent when the
  visitor turned the landing sound off, and under reduced motion.
- **Proof:** unit `brivia-ignition.test.mjs` (CSS and JS on one clock, order, cap, markup on all three pages with no
  video, cue lands on the picture, plays part-way, never after the reveal); e2e landing (intro gone by 2.6 s), landing
  sound, sounds, app-shell 214, password-reset, onboarding 269, signup 368 (its one failure, the denied-location city
  list, fails the same without this change). Clean 1080p and phone renders with the music were sent to the founder.

## D-187 (2026-11-05): the shuffle's cards in the founder's design: blush paper, a fanned hand, "Shuffling Your Matches"
- **Asked:** two mock-ups (phone and desktop): "make the ui of the shuffling cards like this".
- **Done:** D-174's pack keeps its motion but takes the mock-up's look. The cards are pale blush paper with soft edges
  and a soft shadow (no wine backs, no wordmark; supersedes D-178's plain wine backs). The pack now rises fanned, two
  cards each side tucked behind the front card (rotated about their bottom edge), and the front card carries a wine
  hairline frame, a two-card-and-heart line icon, "Shuffling / Your *Matches*" (Bodoni, Matches in wine italic) and
  three dots that pulse in turn. It holds 0.4 s so it can be read, the fan gathers and the words fade, then the split,
  riffle, square and deal run as before, each 0.6 s later; the shuffle sound moves with them (INTRO_CUE). On a phone the
  hand is shown at 74% while it reads, so the fan stays on screen, and grows back as it gathers. About 3.6 s in all;
  any tap or key still skips it.
- **Proof:** unit 546 (deck-intro: the hold is long enough to read, the fan gathers before the split, two cards each
  side, the cue still on every beat); e2e deck 201, deck-ritual, motion, mobile-polish, deck-tutorial; screenshots at
  1554x1012 and 390x844 match the mock-ups.

## D-188 (2026-11-05): faceless profile photos for every seeded member
- **Asked:** "pls give profile pictures to all the fake accounts we have created".
- **Done:** extends D-177 (12 hirers) to all 68 seeded members. Each gets a faceless Unsplash License photo that fits
  their top interest (hands on a keyboard, a shuttlecock, a hiker seen from behind, a violin, a film camera, sourdough,
  a typewriter, a book and tea, a telescope in silhouette...), cropped to 480 px WebP in `site/public/test-avatars/`
  (`tNN.webp`, NN = seed number) and checked by eye for faces. `test-members.sql` sets them once 0052 is in (a member
  with a photo keeps it); sources in `supabase/seed/README.md`. Same reason as D-177/D-156: no stranger's face on an
  invented profile, and the seeded profiles stay `is_test` and come out with the purge script.
- **How:** the container cannot reach Unsplash, so the photos were found with Firecrawl image search and captured from
  each Unsplash photo page. The Firecrawl credits ran out after 46: t59-t68 are, for now, a second tighter (mostly
  mirrored) crop of another member's photo, listed in the seed README to replace later.
- **Live:** with the deploy, apply 0052 (main's) and run the photo step of `test-members.sql`.

## D-189 (2026-11-05): the finished deck in the blush design; the shuffle never plays under it
- **Asked:** a screenshot of the wine "That's your deck for today." card: "fix the ui for this as well".
- **Done:** D-179's daily-limit deck takes the D-187 look: blush paper backs (`--aura-blush-card`) with soft edges and
  a small wine wordmark; the top card adds the wine hairline frame, the two-card-and-heart icon, THE BRIVIA CLUB in
  wine, "That's your deck for *today.*" in Bodoni (the last word in wine italic), the copy in soft ink and a wine
  outline pill for the refresh time. Motion and copy unchanged.
- **Fixed on the way:** opening Connect with the day's swipes already used played the D-174 shuffle underneath the
  finished deck (the quota arrives after the first render). The intro now skips when the deck is capped, and the
  finished deck stops a shuffle that already started.

## D-190 (2026-11-05): the Brivia ignition runs at least 4 s
- **Asked:** "make this intro video little longer like for 4 sec at least".
- **Done:** D-186's title now runs 4.2 s: the point breathes in for 0.9 s before it ignites, the streak opens until
  1.7 s, the letters arrive more slowly (1.45 s, 0.06 s apart, 0.8 s each, done by 2.7 s) and the name holds. The cue
  moves with it (spark 0.9 s, hit and chord 1.7 s, bells to 2.2 s, about 6 s with its hall). The landing's intro cap
  goes from 2.5 s to 5 s (supersedes Phase B's 2.5 s for the intro only; it still plays on a first visit only and any
  tap skips nothing else on the page, which stays usable under it). The loading screen uses the same title.

## D-191 (2026-11-05): reply to any message in a chat
- **Asked:** a chat screenshot: "i need a feature where i can reply on any message in continuation".
- **Done (0055):** the long-press menu (right-click on desktop) now starts with **Reply** on any message that is still
  there (mine or theirs, text, photo, video, GIF, file or shared card). A "Replying to Asha" bar with the line appears
  above the composer and the bubble is marked; Escape or × lets go. The next message carries `reply_to_id` (the first
  of a send with attachments) and shows a small quote at its top: who said it ("You" or their first name) and up to two
  lines, wine on light bubbles, cream on mine. Tapping the quote scrolls to the original and makes it glow. A quote of
  a message I no longer hold (deleted for me) reads "Original message unavailable"; of an unsent one, as unsent.
- **Server:** `brivia_messages.reply_to_id` (on delete set null), set on insert only; a trigger refuses a target from
  any other conversation, so a reply can never quote a stranger's message. Quotes are drawn from the thread the member
  already holds, never read from the server, so a withheld (blocked) message never leaks through a reply.
- **Before 0055:** threads load without the column and Reply sends a plain message.
- **Proof:** SQL `zd-message-replies` R1-R3, `a5-blocked-send` column snapshot updated; unit 548 (replyQuote, menu);
  e2e `message-replies.spec.mjs` MR1-MR4 (20 checks), message-actions, chat-inbox, read-receipts, chat-extras 150,
  chat-search.

## D-192 (2026-11-05): the shuffling hand is smaller than the card
- **Asked:** a desktop screenshot of the shuffle: "these cards look so big, pls fix the size so it looks aesthetic".
- **Done:** while the hand reads "Shuffling Your Matches" and riffles, it is drawn at about 330 px wide (86% of the
  card at most, 62% at least; 74% on phones, as before) and grows into the card's place as the pack is squared, just
  before the deal (`handScaleFor`, unit-tested). Timing, motion and sound are unchanged.

## D-193 (2026-11-05): no seeded hiring cards; every seeded member keeps a photo
- **Asked:** "remove all the fake hiring profile cards from hiring section and make sure there is no fake profile we
  created without pfp".
- **Done (live data, no migration):** the 14 seeded hiring roles and the 6 seeded "Open to roles" entries were deleted
  (no asks were attached), so the Hiring switch and the role suggestions show real members only (for the founder's
  account it is empty until a real member opens a role). All 68 seeded members have a photo (0 without).
- `supabase/seed/hiring-test-members.sql` is retired: do not run it again (it would bring the roles back). The seeded
  members themselves stay (the open test world, D-171) until the purge script removes them.
- **Pending (D-194):** the founder asked for sky, office-desk, laptop and mirror-selfie photos (real, not AI). The image
  search's credits ran out; the swap is scheduled for when they refresh (21:00 UTC).

## D-195 (2026-11-05): smoother: no backdrop blur on moving surfaces, a calm tab change
- **Asked:** "make the website more smooth".
- **Measured** (Playwright, 4x CPU slowdown, phone and desktop): the app's screens already hold about 60 fps when
  scrolled and switched; the landing's one long task (472 ms) is the 4K hero video starting. Headless Chrome has no GPU,
  so the real cost was found by inventory: 28 surfaces used `backdrop-filter`, including the interest chips on the
  swipe card (re-blurred on every frame of a swipe), the profile cards, the hint, the Curated/Nearby switch, the Hiring
  switch and the inbox tabs, all of which scroll with the page. Safari re-blurs these on every scroll frame.
- **Done** (`site/styles/smooth.css`, loaded last): those surfaces drop the blur and keep their look with a slightly more
  opaque cream fill (they were already 66-82% opaque, so the blur barely showed); only the fixed top bar and tab bar
  keep their glass. A tab change now jumps to the top at once (no long smooth scroll from the old position) and the new
  screen fades up 8 px in 0.24 s (opacity and transform only; none under reduced motion; not between Curated and
  Explore, which share a screen). The numbering note: D-194 is the scheduled photo swap.

## D-196 (2026-11-05): no intro flash on Google sign-in; the intro on every open, 5.6 s; a smooth end to the shuffle
- **Asked:** a screen recording: "when i tried to log in, the intro video came for a second, pls fix that, also this
  intro video must come when the user opens the link of the website, the intro video must stay at least for 5-6 sec
  until The Brivia Club comes on screen then the landing page should come; also the cards while shuffling get stuck at
  last last second pls fix this and make the shuffling smooth".
- **The flash:** "Continue with Google" showed the D-088 loading screen ("Opening Google") for the moment before the
  browser left for Google; since D-186 that screen is the dark ignition, so it read as the intro flashing (and played
  its cue). The Google button no longer shows it; it already says "Connecting to Google...". Back from Google, the
  "Signing you in" screen is unchanged.
- **The intro:** plays each time the site is opened in a tab (sessionStorage, was localStorage: once ever); a reload in
  the same tab, or arriving back from an auth page, does not replay it. It holds until INTRO_HOLD_MS = 5.6 s (the
  ignition draws for 4.2 s, then THE BRIVIA CLUB holds), then the landing fades in; cap 6.5 s from navigation start.
  Reduced motion, Save-Data and 2G still skip it.
- **The shuffle's end:** measured with long-animation-frame timing under a 4x CPU slowdown: the last second (deal, flip,
  landing, gloss) was a run of 50-100 ms frames spent in paint, not script. Causes and fixes: the landing scaled the
  whole stack (the card and its photo re-rasterised each frame) -> a 4 px dip only; the gloss used mix-blend-mode
  soft-light (the card re-blended each frame) -> a plain translucent band; and the moving layers now get their own
  compositor layer while the deck arrives (`.is-intro`, removed after). Desktop then showed no slow frame after the
  opening half-second; the rest are borderline (about 12 ms at full speed). Waiting for idle before starting was tried
  and measured worse, so it was not kept.

## D-197 (2026-11-05): events can run over several days

Founder: "the event can take more days as well". The New Event form had one date with a start and end time, so a
festival, a hackathon or a weekend retreat could not be listed honestly.
- The form now has Start date, Starts, End date, Ends (two by two, also on a phone). The end date follows the start
  date until the organiser moves it to a later day, so a one-day event is filled exactly as before; it cannot be set
  before the start date or more than 30 days after it (`MAX_EVENT_DAYS`), and the end must come after the start, so a
  multi-day event may end earlier in the day than it started (6 PM Friday to 5 PM Sunday).
- 0056 redefines `save_member_event` with the same rules (`end_date`, 'invalid end_date'); blank means the start date,
  so the deployed client keeps working before and after the migration. `club_event.ends_at` was already a full
  timestamp, and the listing/registration rules (`brivia_event_open`) already use it, so a multi-day event stays open
  until it ends.
- Display: a card or the detail reads "6:00 PM – Sun 8 Nov, 9:00 PM" when the end falls on another day (IST); the
  ticket email reads "Sunday, 8 November – Tuesday, 10 November 2026" and "7:00 PM, 8 Nov – 10:00 PM, 10 Nov IST";
  the calendar invite already used the real start and end.
- 30 days is a guard against typos (a year in the wrong field), not a product limit; longer runs can be raised later.

## D-198 (2026-11-05): events already under way, optional times, unlimited registrations

Founder: "past dates can also be selected because it wanna show that it was started that day and is still going on
so allow that; also max registrations can be unlimited as well and time of event must be optional".
- Dates: the start date may be in the past (the picker allows up to 30 days back); what must hold on publishing is
  that the event has not ended (its end, or six hours after an open-ended start: `brivia_event_open`). An ended event
  names the end date ('This event has already ended'). The old "an already published event keeps its passed start"
  exception is no longer needed. Cards and the detail show "Happening now" while an event is under way.
- Times are optional. No column was added: a blank start is stored at 00:00 IST and a blank end at 23:59 IST on the
  end day (a timed one-day event with no end stays open-ended, as before), and the display reads those back as
  untimed: "All day", "From 6:00 PM", "Until 7:00 PM", "Until Sat 7 Nov", "6:00 PM – Mon 2 Nov". An event really set
  to start at midnight therefore reads as all day, which means the same thing to a guest. Considered: an `all_day`
  column, rejected for now because list_events (0025) would have to be dropped and recreated for one flag.
- Capacity is optional: empty means unlimited (placeholder "Unlimited"); registration already treated a null
  capacity as no limit, so only the publish check and the `club_event_member_capacity` constraint changed (0056).

## D-199 (2026-11-05): an event can run up to a year

Founder, on the end-date picker stopping at 20 November: "why cant i see next year calender". D-197's 30-day guard was
too tight for long hackathons, exhibitions and seasons. The end date may now be up to 365 days after the start date
(0057, `MAX_EVENT_DAYS`), and the start-date picker goes back up to a year for an event already under way (the rule
that it must not have ended is unchanged).

## D-200 (2026-11-05): no limit on an event's length or how long ago it started

Founder, seeing "An event can run for at most 30 days" (a tab still on the pre-D-199 client): "there must be no
restriction like this". Supersedes D-199's year: the end date has no upper limit (form and 0058), and the start date
has no lower limit in the picker. What remains: the end date is on or after the start date, the end comes after the
start, and a published event must not have ended.

## D-201 (2026-11-05): the intro lasts 5 seconds

Founder: "reduce 2-3 secs time from intro video before landing page", then "the intro video before loading landing
page must be of 5 secs only". Supersedes D-196's 5.6 s hold (gone by about 6.1 s). The ignition draws THE BRIVIA CLUB
completely by 2.67 s (`lettersDone`) and the name holds; the landing starts fading in at 4.5 s (`INTRO_HOLD_MS`, was
5600) and the intro is gone at 5.0 s (500 ms fade), with the hard cap at 5.0 s too (`INTRO_CAP_MS`, was 6500). The
animation and its sound are unchanged. It still plays on every open (once per tab, D-196).

## D-202 (2026-11-05): every city, town and district can be picked (OpenStreetMap fills the gaps)

Founder, on the Create Event city list: "there is no option of south goa, pls try to include all the cities, specially
for india". The directory (D-140, about 156,000 places from the countries-states-cities database) has every town in Goa
(Panaji, Madgaon, Vasco da Gama, Mapusa...) but its districts are patchy: North Goa is in it, South Goa is not, and the
same holds for many Indian districts.
- When nothing in the directory starts with the typed name (three letters or more), the client also asks the
  directory Edge Function (kind `places`), which searches OpenStreetMap Photon (worldwide: cities, towns, villages,
  suburbs, districts; never streets, shops, states or countries) and adds what it finds to the directory
  (`brivia_add_osm_places`, 0059). The next search for it answers from the database alone, for everyone. Only the
  typed text goes to Photon, as with postal codes. Attribution is on the privacy page.
- A state typed alone ("Goa", "Kerala") now lists its largest places after any name that starts with the text.
- Considered: importing a full list of India's ~780 districts. Rejected for now: it covers one country and one level,
  while the founder asked for all cities; OpenStreetMap covers every country and level and grows only with real use.
- Applies to every city picker (Create Event, signup, guided setup, Edit profile), since they share `searchPlaces`.

## D-203 (2026-11-05): gallery photos open full screen; organisers hear about registrations

Founder: "user must be able to open these images from event's gallery and when someone registers in user's event, the
user may get a notification".
- **Gallery:** each photo in an event's drawer is a button that opens a full-screen viewer (`photo-viewer.js`): a modal
  dialog on a solid wine-black background, the photo fitted to the screen, previous/next buttons, arrow keys and
  swipe, "2 / 3", Escape or a tap outside the photo closes it and focus returns to the photo. No fade, so it is solid
  from the first frame.
- **Registrations (0060):** a trigger on `event_rsvp` writes an `event_registered` notification for the organiser when a
  registration becomes confirmed: a free seat at once, a paid one only when the payment is confirmed (a held seat is
  not a registration yet). Never their own, never across a block or worlds; one per member and event; cancelling
  removes it while unread. The panel groups them per event with the poster ("Ravi and Asha registered for Goa
  Buildathon"); tapping opens Explore on that event and marks them read. The organiser's devices get a web push
  (`push-notify`, sent when the registrant's app confirms the seat) and an open tab shows a toast.

## D-204 (2026-11-05): no cap on how many events a member creates or Explore lists

Founder: "remove the 10 events listing limit". The founder had created 10 events in a day and the 11th was refused:
save_member_event allowed 10 new events per member per 24 hours (D-121, 'event_limit'). That cap is gone (0061), and
so are list_events' 80-row cap and its 60-day window (events starting more than 60 days ahead were hidden from
others), so Explore always lists every open event, however far ahead. Spam is left to reporting and moderation
(docs/MODERATION.md); a cap can come back later if abuse appears.


## D-205 (2026-11-05): the landing page says plainly what the app is, for Google's OAuth branding review

Google refused to verify the sign-in branding: it could not tell the app's purpose from the home page, and the home page
had no link to the privacy policy. The landing now ends with an "About" section in plain words (what Brivia Club does,
mutual consent, rounded distances, 18+, and exactly what Google sign-in shares and what we do with it), the footer links
the privacy policy, and the policy gains a "Signing in with Google" section (#google). The consent-screen logo is now the
"the Brivia Club" wordmark on the wine square, since the plain "B" was flagged as not identifying the brand.
## D-206 (2026-11-05): the first card turns over smoothly after the shuffle

Founder (screen recording on an iPhone): "the card after shuffling gets stuck, pls fix it make the turn very smooth".
Frame by frame, the member's card appeared tilted mid-turn, held there for about 0.6 s, then snapped flat. Two causes:
- The card waited at opacity 0 until the instant it turned. A fully transparent layer is not painted ahead (Safari), so
  its photos were decoded and the whole card painted in 3D on the first frames of the turn: the turn stalled. It now
  waits at 1% opacity (edge-on, under the pack, never seen), so it is painted during the shuffle, and its photos are
  decoded (img.decode, off the main thread) as soon as the shuffle starts.
- The turn used an overshoot ease (back.out): the card swung past flat and hung a degree or two off for about 0.3 s
  before the end of the timeline snapped it straight. It now eases out (power3.out) with no overshoot.
Measured on a phone-sized page with the CPU slowed 4x: before, the angle sat at 1-2 degrees for up to 20 frames and then
jumped to flat; after, it eases 88 -> 0 continuously. Timings are unchanged (the deal still ends by 3.1 s).
- **The real cause (found by rendering the turn frame by frame at 60 fps):** `transformPerspective: 1200` sat inside the
  same `from()` as the rotation, so GSAP tweened the perspective from 1200 px down to none along with the angle. Near the
  end the perspective was 42 px, then 6 px: a 3-degree angle drawn with a 6 px perspective is a steep tilt. So the card
  looked held at a steep angle for about a quarter of a second, then snapped flat when both reached zero, on every
  device. The perspective is now set once (`INTRO_PERSPECTIVE`) and only the angle moves. The pack card's turn and the
  caught-up box (motion-moments.js flipIn) had the same mistake and are fixed the same way; a unit test keeps
  transformPerspective out of every tween.

## D-207 (2026-11-05): Share on an event offers Copy link

Founder: "there must be a copy link option in the share button for every event". The drawer's Share button went
straight to the device's share sheet (or, without one, copied silently), so on a laptop there was no visible way to copy
the link. It now opens a small menu: **Copy link** (clipboard, with a fallback for in-app browsers; "Event link
copied."), **WhatsApp** (wa.me with the title and link) and **More options** (the device's own share sheet, shown only
where the browser has one). A real menu: arrow keys move through it, Escape closes it back to the button without
closing the drawer, a click elsewhere closes it. Every published event has it.
Also: a contact pasted from WhatsApp or a phone book can carry invisible direction marks or no-break spaces, which made
a valid number ("91 78377 14469") fail the form's check. Those characters are now stripped before checking and saving.

## D-208 (2026-11-05): the phone login is exact and sharp

Founder (iPhone screenshot of auth.html from WhatsApp): "FIX THIS, MAKE IT LOOK REFINED AND SHARP". A tall empty band
sat between the red telephone and JOIN THE CLUB, the background's blurred pink blobs showed through the fields, and
the page read soft.
- **Layout:** the handset was an absolutely placed picture, and the form was pushed down by a separate margin, both
  sized from the screen height. On the iPhone's in-app browser the two disagreed (the handset drew smaller than the room
  kept for it). The handset is now the login view's own first block (`.auth-login::before`), in the flow, so the title
  always starts where it ends; "Create account" is pinned in the top corner beside the cord. Same sizes as before
  (`--login-phone-h`), so the whole login still fits one screen on any phone.
- **Sharp:** solid fields (50 px, 12 px corners, a hairline wine border, a clear focus ring) and solid buttons instead
  of 12%-opaque fields; one soft wash at the top of the page instead of the large blurred blobs on this screen; a
  lighter stroke on the title.
- mobile-polish.spec measures the handset where it now lives and checks the title is within 4 px of it.

## D-209 (2026-11-05): College Fest replaces Chess & Games in the form; no strip behind the deck's hint

Founder: "add an option of College Fest instead of Chess & Games" and "remove this white highlighted tape below this
Pass and Pitch".
- **College Fest:** a new category `college` (0062), shown in the create form where Chess & Games was, in Explore's
  fixed tab row in place of Games, and with the festive cover by default. `games` stays valid: older chess and games
  events keep their category (an edit keeps it), and the Games tab still appears while such an event is listed.
- **The hint:** D-195 replaced the hint's blur with a cream fill. On the desktop the hint is a caption on the page in
  the headline column, where that fill read as a pale strip; from 850 px it has none. On a phone the hint sits over
  the room photo, where the fill keeps it readable (the deck spec's contrast check), so it stays there.


## D-210 (2026-11-05): new profile photos for every seeded member: mirror selfies, sky, city and desks
- **Asked:** "for all the test profiles add some good profile pictures for all those whose profile picture was updated
  today". This also delivers D-194 (the founder's earlier ask for sky, office-desk, laptop and mirror-selfie photos).
- **Done:** all 68 `site/public/test-avatars/tNN.webp` files replaced. The D-188 set was mostly close-ups of hands and
  objects, and t59-t68 were second crops of other members' photos; the new set looks like photos people actually use
  on a profile: mirror selfies with the phone or camera over the face, people seen from behind against the sky or a
  city, sunset silhouettes, hoodies on a street, and desk-and-laptop shots. All 68 are distinct, free under the Unsplash
  License, cropped to 480 px WebP (2.4 MB in total) and checked by eye: no face is visible in any of them (D-156 still
  holds). Men's and women's profiles get matching photos, the seeded hirers get desk photos, and "Prefer not to say"
  and t61-t68 get neutral ones. The sources are listed in `supabase/seed/README.md`; the D-177 and D-188 tables are
  superseded.
- **Live:** the file names did not change, so the deploy is all it takes. There is no SQL to run.

## D-211 (2026-11-05): pets and instruments for some seeded profiles
- **Asked:** "use some pets, music instruments and all as well for some people picture".
- **Done:** 25 of the 68 D-210 photos are now a pet or an instrument, so the deck no longer looks like 68 people seen
  from behind. Members whose interests include an instrument get it: guitar (t02, t10, t23), piano (t22, t49, t51),
  violin (t29, t37, t45, the D-188 photos brought back) and tabla (t39, t42, t44). Thirteen others get a dog or a cat
  (t09, t12, t14, t20, t24, t27, t35, t43 with her houseplants, t53, t55, t56, t57, t58). No human face in any of them;
  sources in `supabase/seed/README.md`. Same file names, so live with the deploy and no SQL.

## D-212 (2026-11-05): the sign-in loading screen is the classic "Opening your club" splash again
- **Asked (founder, 2026-11-05):** "before today i had a loader for signup and register; now the animation I added
  before the landing page took over the loaders also. Let the black Brivia Club animation be there on the landing page
  but bring back the loader screens as they were."
- **Decision:** D-186 (was D-180) put the ignition on black into `.brivia-handoff` on auth.html and app.html. That part
  is reverted to the D-088 splash exactly as it was before (aura background, "the Brivia Club" mark, sliding wine line,
  OPENING YOUR CLUB): markup, `handoff.css`, no ignition.css or Bodoni preload on those pages, no cue on sign-in, and
  no `brivia-ignition-settled` still-cut hand-over. The landing's intro (`#intro-burst`) keeps the ignition and its music.
- **Proof:** unit `brivia-ignition.test.mjs` now checks the title is on the landing and the classic loader (not the
  ignition) is on auth and app; screenshots of the landing intro and the auth loader at 390 and 1440 px.

## D-213 (2026-11-05): the intro lasts 4 seconds

Founder: "reduce the intro video before landing page a little". Supersedes D-201's 5 s. THE BRIVIA CLUB is complete at
2.67 s and now holds for about a second; the landing starts fading in at 3.5 s (`INTRO_HOLD_MS`) and the intro is gone
at 4.0 s, also the cap (`INTRO_CAP_MS`). Measured: gone at 3.96-3.98 s at 375 and 1440 px.

## D-214 (2026-11-05): connections who want company show in Companions, with "Text them · Make a plan"

Founder: "no matter if the person is added or not, if they turn on companion button i want their profile to be shown in
that section, and when i view it, it must show you are already connected, and then a button of Text Them and make a
plan". The deck (0023/0025) left out existing connections, so a friend going to the same event never appeared ("No one
new for now").
- 0063 `companion_deck_v2` includes them, flagged connected, first in the deck, even if swiped before (a new function
  because the answer gains a column; the harness re-applies 0023, which cannot replace a function whose columns changed).
- Their card reads "✓ You're already connected" and "Going too · text them to make a plan". Pass / Connect and swiping
  give way to **Text <name> · Make a plan** (opens the chat) and **Next** (moves the card to the back; records nothing,
  uses no swipe). Arrow keys do the same. Their profile, opened from the card, says "You're already connected." above
  the same button.
- Mutual consent is unchanged: only existing connections are marked, and nothing is sent or matched by viewing.


## D-215 (2026-11-05): a chat read on one device is read on all; the Hiring switch stays visible when on

- Founder: "pls do clear old notifications once the user opens the chats on either phone or laptop, also the hiring
  button once we turn on gets disappeared, how will user turn it off".
- Notifications: the bell's "N messages from X" rows and the inbox's unread counts were kept per browser, so a chat
  read on the phone stayed unread on the laptop. Read receipts (0042) cannot carry it (only set while both members have
  them on). 0064 adds a private, own-rows-only marker `brivia_private.chat_seen` with `mark_chat_seen(other, at)` and
  `my_chat_seen()`. Opening a conversation stores how far it was read; opening the Chats tab stores the time and clears
  the bell's message rows (the inbox keeps its own unread counts). Every device pulls the marker every ~10 s and when
  it comes back to the foreground. Locally, a message row is also cleared once its conversation was read up to it or
  the member replied after it, which clears the stale rows already in the bell. Before 0064 the client works as before.
- Hiring: `smooth.css` forced a cream background (`!important`) on `#hiring-toggle`, so when on, its cream label and
  knob sat on cream: a blank white pill. The on state now keeps the deep-wine background. Checked in hiring.spec.

## D-216 (2026-11-06): signup's second screen asks for title and organisation, not "Are you 18 or older?"

- Founder (with a screenshot of Step 2 of 5): "remove this 18 year or older and instead put those title and company
  organisation box make sure logo for every company is there".
- Done: Step 2 is "What do you do?": a Title field and a Company or organisation search over the company directory,
  every option led by its logo on a white tile (or the company's initials when it has none, also when a logo fails to
  load), plus "Use “<typed name>”" for an organisation not in the directory. Both optional. They are saved with setup's
  Finish (`set_my_work`; a typed name is added with `add_company` first), and kept in localStorage across a
  confirm-email detour. Edit profile still changes them.
- The 18+ rule is unchanged in substance: the checkbox and "I'm under 18" link are gone, the screen says "By continuing
  you confirm you're 18 or older" with the privacy notice link, and `declare_adult` is still recorded when the account
  is created (the server still refuses location and interests without it). A member resuming without the declaration
  resumes at this screen.
- 0065: the email path has no session at Step 2, so `search_companies` becomes callable signed out and anon reads only
  the directory's own companies (`source <> 'member'`); members' own organisations stay signed-in only.
- Logos: 878 of 932 directory companies have one; the other 54 (mostly Indian banks and PSUs whose sites block icon
  fetches) never got one from the site-icon sources. The directory Edge Function's logo pass now also tries the logo
  Wikidata lists for the company's name; it runs when the function is deployed.

## D-217 (2026-11-06): unlimited hiring roles; a role's description up to 1000 words

- Founder (screenshots of the role sheet, "Role 2 of 3", "0 / 200"): "make the limit to 1000 words for this, also
  hirings can be unlimited".
- Done: 0066 drops the 3-open-roles cap from `save_hiring_role` and lets "A line about it" hold up to 1000 words (at
  most 8000 characters, so one "word" cannot be a wall of text); still no links or contact details. The sheet says
  "Hiring · Role N", counts "N / 1000 words", and the profile card always offers "Add a role" ("N roles").

## D-218 (2026-11-06): the Companions header never overlaps

- Founder (screenshot, a narrower window): the header's text overlapped. From 1080 px the title, the note, the event
  picker and the "N looking for a companion" pill sat in one grid row that needs about 1,600 px; narrower, the note's
  column shrank under the picker.
- Done: the row wraps instead. The picker and the pill are one group (`.companions-tools`) that stays on the right of
  the first row when it fits and moves together to a second row when it does not. companions-head.spec checks 1080 to
  1920 px for overlaps (it failed at 1080-1366 before the fix).

## D-219 (2026-11-06): members you already sent a request to stay in the hiring deck, marked "Request pending"

- Founder (screenshot, Hiring on, "No one is hiring yet"): people they had already sent requests to are now hiring but
  did not show; show them anyway, and a re-swipe should say the request is already pending.
- Found: `hiring_people` (0054) leaves out anyone with a live request from the caller, and anyone they signalled in the
  last 30 days.
- Done: 0067 adds `hiring_people_v2`: the same people, order and pages, plus members with a live request from the caller,
  flagged `request_pending`. A declined or expired request's 30-day pause, connections, passes and blocks are unchanged.
  The card shows a "Request pending" chip; a Like (button or swipe) sends nothing, the card springs back, and a toast says
  "Request already pending. They'll see it in their notifications." Pass works as usual. The client falls back to
  `hiring_people` before 0067.

## D-220 (2026-11-06): one landing music control that always tells the truth (Stop music / Play music)

- Founder: music on by default whenever the browser permits it, on phones and desktops; a landing button that really
  stops and resumes every intended layer, labelled "Stop music" / "Play music"; the choice holds while navigating; a
  reload starts with music on again; test the real audio, not the look. No agent-arena round: the founder specified the
  behaviour (as D-063); the button keeps its place and family, only gaining its label.
- **Audit.** The landing has two sound layers, both Web Audio on one context: the soundtrack loop (D-092) and the
  ignition cue under the intro (D-186). The hero video has no audio track. The app's notification, swipe and deal cues
  (D-137, own per-device switches in Settings) are not landing music and are unchanged.
- **Root causes found.** (1) A mute was saved in `localStorage` forever, so a visitor who once pressed it never heard
  music again, on any visit. (2) iPhone: Web Audio follows the ring/silent switch, so with it on silent the music was
  inaudible. (3) Stop faded only the soundtrack bus; the intro cue was wired straight to the speakers and played on.
  (4) Play restarted the track from the top. (5) The button followed an intention flag, not the audio clock: after an
  iOS interruption (call, Siri) or a refused resume it still showed "playing" in silence. (6) A missing or blocked
  soundtrack was re-requested every 250 ms forever. (7) The track was fetched only after the first tap, so the first
  tap waited for the download. (8) An AudioContext was created at load even when sound was not allowed, which Chrome
  reports as a console warning. (9) Vestigial code unmuted the (silent) hero video on the first gesture.
- **Done** (`landing-sound.js` helpers, unit-tested; `script.js`; `index.html`; `landing-smooth.css`):
  - The mute lives in `sessionStorage` for the tab: landing ↔ auth/careers keeps it; a reload (navigation type
    `reload`) or a new tab starts with music on. The old `localStorage` key is removed on load.
  - Sound before a gesture is asked first (`navigator.getAutoplayPolicy` where it exists, else a silent unmuted clip);
    only then is an AudioContext created. Otherwise every activation gesture retries until the clock really runs.
  - "Stop music" fades both buses (soundtrack and cue) in 0.35 s, then suspends the context, so "Play music" resumes
    from the exact point and can never layer a second copy (seven fast presses checked). The cue is cut for good.
  - The label is derived from the real state (wanted and `context.state === 'running'`); an interruption shows "Play
    music" and re-arms the gesture listeners. A press does what the label says. Visible text plus `data-state`; no
    `aria-pressed` with a changing name.
  - iPhone: `navigator.audioSession.type = 'playback'` while playing (iOS 17+), else a looping silent clip held in
    the gesture, so the music plays with the switch on silent; released on stop and while hidden. Trade-off: like any
    playback audio it pauses other apps' audio while it plays.
  - Prefetch of the soundtrack when idle (not under save-data); a failed load is retried 3 times (1 s, 2 s, 4 s) and
    then the button offers "Play music", which tries again.
  - Hidden tab: suspended (and not counted towards the 5 minutes); on return it resumes, or waits for a tap if the
    browser refuses. `pageshow` (back/forward cache) does the same. On `pagehide` the track position is kept in
    `sessionStorage`, so returning to the landing picks the soundtrack up where it was.
  - The hero video always plays muted; nothing but the music makes sound on the landing.
  - Found while testing: a first start part-way through the intro, before the ignition cue's pre-render was ready,
    fell back to a live render scheduled in the past, which threw and also kept the soundtrack from starting.
    `brivia-ignition.js` now only starts part-way from the pre-render; the landing waits for it once (the soundtrack
    waits with it, so it still enters under the cue's tail), and a cue failure can never stop the music.
  - Kept from D-063: the 5-minute limit (then a fade; "Play music" gives a fresh 5 minutes).
- **Checks.** `tests/unit/landing-sound.test.mjs` (10), `tests/unit/brivia-ignition.test.mjs` (part-way contract). `tests/e2e/landing-sound.spec.mjs` (34): desktop, iPhone
  emulation, page-to-page navigation, reload, hidden tab, interruption, missing file, a browser that allows sound at
  load, and Chromium's real gesture-required policy with nothing mocked; no console errors or warnings in any.
  Honest limit: no browser lets a page start sound before a gesture unless it already allows it (Chrome's engagement
  score, Firefox/Safari settings); the first tap, click or key then starts it. Real-device Safari/Firefox/Edge and an
  iPhone's silent switch were not available in this container: check them on the live site.

## D-221 (2026-11-06): the music button shows ON by default ("Music on") until the first touch

- Founder (iPhone screenshot from the live site): "by default the music button is not on when I opened the website".
  The live site was still on the pre-D-220 build (round button, flat bars). D-220 would have shown "Play music" there
  too: iPhone Safari (and most phones) never allow sound before the visitor's first touch, so the page is silent at that
  moment, and "Play music" read as off.
- **Done.** A third button state, `armed`: the music is on (the default, or the visitor's choice) and only the browser's
  first-touch rule holds it. The button is lit (wine, cream text), bars raised, with a soft pulse ring inviting the tap,
  and says "Music on" (accessible name "Music on: tap anywhere to hear it"). Any tap on the page, or on the button,
  starts the music, and it becomes "Stop music"; stopping shows "Play music". An interruption (a call, Siri) also returns
  to "Music on" until the next tap. The pulse is off under reduced motion. `soundButtonView({ audible, waiting })` in
  `landing-sound.js`, unit-tested; e2e checks updated (pre-gesture, scroll, interruption, real autoplay policy) and two
  iPhone checks added.
- Honest limit, unchanged: no website can start sound on an iPhone before a touch. The button now says ON, and the first
  touch anywhere makes it audible.

## D-222
**About moves off the landing page to its own page (2026-11-07).** The founder asked to remove the "What Brivia Club is."
section from the landing body and to make ABOUT a footer link to a separate page, not the full text in the footer. The
copy is unchanged and now lives at `/about.html` (privacy page styles, same deep-wine brand), with the Google sign-in
explanation and the link to `/privacy.html#google`. The landing footer nav gains ABOUT next to PRIVACY; the page is in
the Vite inputs and the sitemap. Note for the Google OAuth branding review: the homepage now explains the app only
through that footer link, so if Google asks for the description on the homepage itself, point them to `/about.html` or
bring a short line back.
## D-223 (2026-11-07): Safari plays the landing's sound through <audio>; a one-screen phone login; password managers allowed

- Founder (Mac Safari screenshot of the live landing showing "STOP MUSIC" while silent; signup screenshot): "can't
  hear music and music effects on laptop, specially in Safari"; "make onboarding very smooth, specially the login page,
  for laptop and phone, Mac, Windows, iOS, Android"; and drop the "like 'Designer at Zomato'" example from step 1. No
  agent-arena round: these are bug fixes against behaviour the founder already specified (D-063, D-220), not a new
  product or architecture choice; the one design choice (media elements on WebKit only) is recorded here.
- **Sound, root cause.** The button follows `AudioContext.state`, and WebKit can keep a context "running" (and its
  clock moving) while nothing reaches the speakers: WebKit bugs 276687 (another tab with audio closes), 231105 and
  217606 (route changes, interruptions). So Safari showed "Stop music" in silence, and the app's swipe and notification
  cues (also Web Audio) could be silent the same way. Chrome, Edge and Firefox were not affected.
- **Done.**
  - `prefersMediaElementAudio()` (landing-sound.js, unit-tested): Safari on a Mac and every iPhone/iPad browser (all
    WebKit). There the landing's soundtrack is one looping `<audio>` of `media/audio/hero-soundtrack-loop.m4a`, the
    2 s crossfade between passes baked into the file (equal-power, so the loop is seamless;
    `scripts/bake-soundtrack-loop.py`, 337 KB), and the intro's cue is rendered offline (OfflineAudioContext, no
    speakers involved) and played from an `<audio>` as a WAV (`wavBytes`). No AudioContext is created for the landing
    on WebKit. Everything D-220 promised holds on this path: stop fades and pauses, play resumes from the same point
    (one element, so never a second copy), a hidden tab pauses, a pause the system makes (call, Siri, another app)
    shows "Music on" and the next tap resumes, the 5-minute limit, the position carried across pages. A tap during the
    intro starts the cue part-way and the soundtrack comes in under its tail (started and paused inside the gesture so
    iOS lets it start later). iPhone: element volume is fixed by the hardware buttons, so there fades are cuts; an
    `<audio>` is in the playback session by itself, so the silent switch does not mute it.
  - The app's sound kit (`notify-sound.js`) plays its pre-rendered cues from `<audio>` elements on Safari for Mac only.
    Not on iPhone: an `<audio>` there would pause the member's own music, and the kit's UI sounds are meant to mix with
    it (the 'ambient' session).
  - Chrome, Edge and Firefox keep the Web Audio path unchanged.
- **Login, root cause.** On phones, Log in and Continue with Google sat below the fold (iPhone 13: Google ended at
  779 px of 664; iPhone SE: 708 of 568). `auth-polish.css` lowers the desktop login group with `top: 140px !important`;
  its phone reset lives in `mobile-final-fixes.css`, which the landing and the app import too, so the production build
  moves it into a shared chunk that loads before the auth CSS and the 140 px won on phones (the dev server keeps import
  order, so it never showed there). Fixed in `auth-mobile.css` (loads last): the phone login is one screen again on
  every phone measured (iPhone SE, 13, Pixel 7).
- **Login, also.** The login form had `autocomplete="off"` on the form, the email and the password (since D-160, with
  no recorded reason), which blocks iCloud Keychain, Google Password Manager, Windows and Android autofill. Now
  `username` / `current-password`, the email keyboard (`inputmode`), no auto-capitals or autocorrect, and
  Next/Go on the keyboard. Raw API errors ("Invalid login credentials", "Failed to fetch", Safari's "Load failed")
  are plain sentences (`loginErrorCopy`, unit-tested): wrong password, unconfirmed email, no connection, too many tries.
- Step 1 of signup: "Your title and organisation show small on your card. Add them now or later." (no example).
- **Checks.** Unit: `landing-sound.test.mjs` (+3), `sound-kit.test.mjs` (+1), `signup-errors.test.mjs` (+1).
  E2E: `landing-sound.spec.mjs` 48 (Safari-on-Mac block: no AudioContext, stop/play/position, hidden tab, outside
  pause, 5 minutes, the intro cue then the soundtrack; the iPhone checks now expect the `<audio>` path);
  new `login-smooth.spec.mjs` (17: one screen and no sideways scroll at five sizes, password-manager attributes, 16 px
  fields on phones, the error copy). Honest limit: the container has Chromium only; the WebKit path is exercised with a
  Safari user agent, not real Safari. Check on a real Mac (Safari) and iPhone after deploy.

## D-224 (2026-11-10): message yourself, found from Chat search

- **Ask (founder, 2026-11-10):** "user should be able to search their profile in chats section and should be able to
  text themselves."
- **Decision.** A private note-to-self thread, like "Message yourself" in other messengers. Searching your own name
  (or "you", "me", "myself", "self") in Chat lists "Your name (You) · Message yourself" first under People, with
  Message. The thread joins the inbox once it has a note (or while open), sorted like any other.
- **Storage.** A self note is an ordinary `brivia_messages` row with sender = recipient = the member. Migration 0068
  lets `brivia_can_send` (0013) accept `recipient = auth.uid()`; the insert policy still needs a completed profile and
  `sender_id = auth.uid()`, and to anyone else the old match + same-world rule applies verbatim. Reading is unchanged
  (sender or recipient), so no one else can ever see a note. Not a connection: no match row, nothing in the deck.
- **In the thread.** Header "Your name (You)" / "Message yourself"; the avatar and name open your own Profile tab; no
  typing channel, presence, read ticks or unread count; the ••• menu keeps only Delete chat (hides it on this device;
  Message from search brings it back). A note is never a notification. Replies, edit, unsend and attachments work as in
  any thread. "Notes" stays the name of the posts tab; the self thread is not called notes, to avoid two meanings.
- **Consent rule.** Unaffected: the mutual-consent rule governs contact between two members; a note to self involves
  no one else.
- **Checks.** Unit `chat-self.test.mjs` (7); SQL `zh-message-yourself.test.sql` (S1-S5: send and read back, nobody
  else reads it, still no message to a non-match, an incomplete profile is refused, replies stay in-thread, no forging);
  it fails without 0068 (row-level security) and passes with it. E2E `chat-self.spec.mjs` (49 at 1440 and 390);
  chat-search, chat-inbox, chat-extras (150) and chat-seen unchanged and passing.

## D-225 (2026-11-10): the swipe limit is said inside the request dialog; the pitch sheet opens above Chat

- **Ask (founder, 2026-11-10, with a screenshot of "Make the first move." on Find a Companion):** "i am not able to
  send request since my free swipes got over, but pls display the message that free swipes over, fresh swipes tomm
  clearly on screen when the user tries to send requests".
- **Root cause.** At the cap, SEND REQUEST was refused correctly, but the reason only went to a toast. The companions
  and nearby composer is a modal `<dialog>` (the top layer), so the toast sat under it and was never seen; on the
  Connect deck the sheet closed and the note was dropped. Separately, the pitch sheet (`#pitch-modal`, z-index 50)
  opened UNDER the Chat view (a fixed layer at 100) when Connect was pressed on a profile from Chat search: invisible.
- **Decision.** Every request dialog (Connect deck pitch sheet, a profile's Connect, Find a Companion, Nearby) says the
  limit itself, in place of the writing parts: a clock mark, "You're out of free swipes", "You've used all 10 of
  today's free swipes, so this request wasn't sent. Fresh swipes tomorrow at 3 PM.", and one "Got it" that closes it
  and sends nothing. The day is named from the server's `resets_at` in the member's time: "later today at", "tomorrow
  at", "on Friday at"; without a reset time "Fresh swipes tomorrow."; a reset time already past says "Fresh swipes
  soon. Try again in a moment." (never a time in the past). The live cap reads "Too many requests waiting". At a cap the
  app already knows, the dialog opens straight on the limit (nothing to write first). On the deck the note is kept and
  comes back on the next try. A deck pass at the cap keeps its toast; the deck itself already shows "That's your deck
  for today" (D-179). `#pitch-modal` takes the public profile modal's layer (190).
- **Files.** `signal-quota.js` (`freshSwipesLine`, `swipeLimitCopy`), `connect-composer.js` (limit block, `onSend` may
  return `{ limit }`, `open({ limit })`), `companions-page.js`, `nearby-page.js`, `app.js` (`requestLimitResult`, the
  guarded composer, `showPitchLimit`), `app.html`, `connect-composer.css`.
- **Checks.** Unit `signal-quota.test.mjs` (+5); e2e `swipe-limit.spec.mjs` (22 at 1440, 390 and 375); deck (201),
  companions (65), chat-search and chat-self pass. Already failing before this change, unchanged: `consent.spec.mjs`
  (times out in `cancelKeepsCard` at line 234) and one `nearby.spec.mjs` Settings sound check (D-138).

## D-226 (2026-11-10): confirming the email never asks for the signup details again

- **Report (founder, 2026-11-10, after a live signup):** "once we enter all details we will get confirmation mail
  again it is going to same page to enter details".
- **Root causes.** With email confirmation on, no session exists at signup, so the photo, the 18+ confirmation and the
  work answers waited in this browser only (`brivia-pending-profile`, `brivia-pending-work`). (1) The confirmation
  link often opens elsewhere: a phone's mail app opens its own browser, and the site lives on two domains
  (thebriviaclub.com and thebriviaclub.live) whose storage is separate. There the member had no 18+ record, so
  `resumeScreen` started again at the work screen. (2) Even in the same browser, the link's return path
  (`restoreAuthPageSession`) skipped the pending signup whenever a profile row already existed.
- **Decision.** signUp keeps, with the account (auth metadata), `adultDeclared: true` (continuing the work screen
  confirms 18+, D-216) and the work answers (`workTitle`, `workCompanyId`, `workCompanyName`; shown on cards anyway, so
  not private). Back from the link, or logging in, in any browser: a pending signup here is applied first (as the login
  form already did); otherwise `applySignupMetadata` records the 18+ confirmation, and setup's Finish saves the work
  answers from the account. Name, phone and gender already travelled this way. So another browser asks only for the
  photo (it cannot be uploaded before a session exists, and auth metadata is no place for an image); the same browser
  goes straight to setup. Accounts from before D-226 (no flag) are unchanged: they confirm 18+ on the work screen.
  Interests, location and the photo are still never put in auth metadata.
- **Config (founder).** In Supabase, Authentication > URL Configuration, list both domains' `/auth.html` under
  Redirect URLs, so the link returns to the domain the member signed up on.
- **Checks.** `signup.spec.mjs` R1-R3 (failed before the fix: R1 and R2 landed on the work screen; pass after), and
  the confirmation-on case now checks the flag is sent. Onboarding (269), password-reset, password-reveal pass.
  Already failing before D-226, unchanged: `signup.spec.mjs` "area denied", and `login-smooth.spec.mjs` 3 error-copy
  checks (they read "Log in is unavailable right now" in the stub on the untouched code too).

## D-227 (2026-11-10): AT WORK is the default cover; brochures have no size limit of ours

- **Ask (founder, 2026-11-10, with screenshots of the cover picker and Create Event):** "by default cover should be
  at work that is the first one, ALSO THERE SHOULD BE NO FILE SIZE CRITERIA FOR BROCHURE".
- **Default cover.** `DEFAULT_COVER_KEY` / `defaultCoverUrl` / signup's `GUIDED_DEFAULT_COVER` / the classic picker's
  preselection are AT WORK (`AE983BB0-...PNG`), the first cover, instead of SMASH THEORY (D-128). It is what a new
  signup gets and what any member without a stored cover shows (deck, profile, the editor's checked tile). Members who
  had SMASH THEORY stored were switched too, at the founder's word ("do it"): the database cannot tell a chosen
  SMASH THEORY from the old default, so 0070 switches all of them once, keeping each old cover in
  `brivia_private.cover_switch_d227` for an undo; a member who picks SMASH THEORY afterwards keeps it.
- **Brochure.** The client no longer checks a size ("Optional · PDF"), and 0069 removes the bucket's 5 MB limit. It is
  still PDF only. The one remaining ceiling is Supabase's project-wide upload limit (dashboard, Project Settings >
  Storage); a PDF over it gets "This PDF is too large for the server to accept. Try a compressed copy."
- **Checks.** Unit `preset-cover.test.mjs` (default = AT WORK, the first, in all four places); SQL
  `zi-brochure-no-size-limit.test.sql` and `n-event-interest.test.sql` N1 updated; e2e `create-event.spec.mjs` (a 12 MB
  PDF uploads; the label names no limit), `deck.spec.mjs` (201, the no-cover cards show AT WORK),
  `profile-media.spec.mjs` signup default. Already failing before D-227, unchanged: `profile-media.spec.mjs` 7
  "no cover file input anywhere" checks (they see Create Event's poster inputs).

## D-228 (2026-11-10): faster start-up and onboarding

- **Ask (founder, 2026-11-10):** "deploy everything, also make the onboarding and app very smooth and fast".
- **Measured first** (`tests/e2e/perf-boot.mjs`: production build, a mid phone on 4G (CPU x4, 9 Mbps, 40 ms), 150 ms
  added to every Supabase request): the first deck card took 1.45-1.55 s. Two parts: ~0.8 s to download and run the code,
  then three rounds of requests one after another (profile and status, then blocks / matches / inbox, then the deck).
- **Changes.**
  - Start-up reads (`app.js loadSupabaseCommunity`): blocks, matches, the inbox and the first deck page are asked for
    at the same moment as the profile check, since all they need is the session; each answer is used at the same
    point as before. The chat partners' cards load beside the deck instead of after it.
  - The sign-up / login page fetches the app's files in the background when idle (`prefetch-app.js`; low priority,
    skipped on Data Saver and 2G; plain fetch so Safari benefits too), so entering the app opens from cache.
  - Create Event's code (50 KB) loads on first use or when the browser is idle, not with the app.
  - The welcome card's envelope opens in ~0.7 s instead of holding the form for 1.42 s.
- **Result (same set-up, 2 runs each):** first card 1.22-1.38 s cold (was 1.45-1.55 s); after six seconds on the login
  page 1.15-1.20 s (was 1.51-1.63 s). On the real network each round trip saved is longer than the test's 150 ms.
- **Not changed (founder's call):** the deck's 3.6 s solitaire shuffle on every app open (D-174, asked to be lengthy;
  any tap skips it). gsap (230 KB source) stays in the main bundle: the deal, card tilt and moments use it synchronously.
- **Checks.** Unit 584 (new `prefetch-app.test.mjs`); e2e deck 201, app-shell 214, onboarding 269, create-event,
  chat-search, chat-self, swipe-limit pass; signup, login-smooth and profile-media fail only their known pre-existing
  checks (same names as before).
