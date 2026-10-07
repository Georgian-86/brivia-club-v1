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
