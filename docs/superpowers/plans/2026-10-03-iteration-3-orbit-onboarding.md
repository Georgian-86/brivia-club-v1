# Iteration 3 (ORBIT onboarding, honest signals, location-first deck) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the core promise in data and UI: a member signs up with interests, a 20-point Passion Budget with modes, and a coarse home cell; sends signals against an honest, probe-proof server quota; and sees a location-first deck of people who share their interests. This covers iteration-2 arena P0 items 2–4 and three small P1 items.

**Architecture:**
- One new idempotent migration, `supabase/migrations/0004_orbit_onboarding.sql`, holds the schema, the functions and the reference data (taxonomy, places).
- Location is snapped **in Postgres** to a scheme-tagged equal-area grid cell (`g7:<row>:<col>`), because the h3 extension is not available (see "Decision" below). Coordinates exist only as function arguments.
- Every member-facing visibility check goes through one helper, `brivia_visible_to(p_viewer, p_target)` (spec §9.1.1). Completion is redefined as: a name, plus interests with all 20 points spent, plus a cell.
- Signals go through one SECURITY DEFINER RPC, `send_signal`. It charges a sender-only ledger before it looks at the recipient. Raw client inserts into `connection_requests` are revoked.
- The interim deck is `deck_candidates`, a SQL RPC. It orders by ring, then by shared-interest count. It returns distance bands and shared-interest labels, never a cell, km, City or State. ORBIT formulas (R, the gate, the Roche Limit) are **not** ported to SQL (arena ruling).
- Client changes: a 4-step signup (`auth.html`, `script.js`, new `passion-budget.js`), and quota plus deck changes (`app.js`, `app.html`, new `signal-quota.js`).

**Tech Stack:** Supabase Postgres (RLS, plpgsql, PostgREST RPC), vanilla JS with Vite, the local harness `bash supabase/tests/run.sh` (PostgreSQL 16, psql `\bind`), Playwright with route stubs (`tests/e2e/`), and `node --test` for pure client helpers (`tests/unit/`, no dependency).

**Spec:** `docs/arena/2026-10-03-iteration-2.md` (P0 items 2–4, Ruling A1, the go-live gate) and `docs/DECISIONS.md` D-026. Also binding: `CLAUDE.md`; `docs/ORBIT_ENGINE.md` §2, §4.1, §6.4, §7, §9.1 (especially §9.1.4 and §9.1.5); `docs/UX_SPEC.md` flows A and B and the brand table; `supabase/migrations/0001`–`0003`.

**Precondition (met):** the iteration-2 security fixes (I1, I2, M3–M5, cached password) landed in 2eee448 and 8835e17 (D-027). Tasks 4 and 6 edit `trust.test.sql` and `p0-consent.test.sql` on top of them.

## Global Constraints

- **Privacy (CLAUDE.md):**
  - Never store or expose exact coordinates. Store only a coarse cell. Show rounded distance bands ("~3 km").
  - Never send another member's email or phone to a client.
  - A connection exists only after mutual consent.
- **Coordinates** enter only as arguments of `set_home_location(lat, lng)`, which is `volatile` and so POST-only.
  - They are never stored, never echoed, never put in an error message and never written to `localStorage` or `sessionStorage`.
  - The client holds them only in memory, until a session exists.
- **Cards** (deck card, info sheet, public-profile modal) never render another member's `city` or `state`, a cell id or km. They show the server's `distance_band` and "You both: X" chips (UX_SPEC §B).
- **Migrations:**
  - `0004_orbit_onboarding.sql` is idempotent: the harness applies every migration twice.
  - Every new `public` table gets `enable row level security` and `revoke all ... from public, anon, authenticated` (spec §9.1.1, Supabase default privileges).
  - Every function is `set search_path = public`.
  - Every SECURITY DEFINER function has `revoke all ... from public, anon` and an explicit grant.
- **Test-world isolation (P14, D-024):** applies to every new RPC. Seeded `is_test` members and real members never see each other.
- **No new client dependencies.** New client code reuses the brand tokens (`--brivia-*`, `--app-*`, Bodoni Moda / Instrument Sans). It adds no raw hex, uses SVG instead of emoji, has visible labels, uses touch targets of at least 44×44 px, and respects `prefers-reduced-motion` (UX_SPEC).
- **Spec and code must not drift** (CLAUDE.md). Each task that changes behaviour updates `ORBIT_ENGINE.md` / `UX_SPEC.md` and adds its `DECISIONS.md` entry in the same commit.
- **Exact values (copy verbatim):**
  - Passion Budget: 20 points, 1–12 interests, each with at least 1 point. Modes: `learn | play | teach | build`, default `play`.
  - Grid: 48 rows per degree at level 7, 16 at level 6, 16/3 at level 5.
  - Ring limits: 3 / 15 / 60 / 350 / 2500 km.
  - Location changes: 3 per rolling 24 h.
  - k-anonymity: k = 10 for rings 0–1 and 5 for rings 2+; accounts older than 14 days; 7-night hysteresis.
  - Signal quota: 30 per rolling 24 h, and 100 live unanswered within 30 days. Both are private config.
  - Deck: `p_limit` defaults to 12, clamped to [1, 20]. Rings 0–2 only. Passes hidden for 7 days, signalled members hidden for 30 days.

## Review Focus

1. **The sender's own surfaces must not reveal a block or the other world.** After sending to a blocked target, a cross-world target and a normal target, the sender's readable surfaces from this iteration must be byte-identical apart from `matched`: the `send_signal` response, `my_signal_quota()`, and the sender's own `interaction` rows. That means `send_signal` writes no `interaction` row on any path. Test in Task 6.
2. **Grid edges.** Coordinates at lat ±90, at lng ±180, and across the antimeridian (179.99 vs −179.99, about 2 km apart) give valid cells and ring 0, never an error or a ring-5 jump. Lat 91, lng NaN and lng Infinity are rejected with `invalid location`, and the message carries no value. Test in Task 1.
3. **A fourth location change within 24 h** fails with "try again later" (HTTP 429), and leaves both `member_orbit` and the place label unchanged. The very first set counts toward the 3. The failure path logs no coordinate. Test in Task 3.
4. **Geolocation is denied, times out or is missing** (no `navigator.geolocation`, insecure context). Signup falls back to "Pick my city" and never dead-ends. A signup that needs email confirmation persists only `{ kind: 'city', placeId }` or `{ kind: 'geo' }`, never coordinates, and asks for the location again after login. Test in Task 8.
5. **Budget edges.**
   - Client: a 13th interest is refused; removing an interest refunds its points; a stepper never takes the total over 20 or a single interest below 1; when 0 points are left, adding an interest takes 1 point from the largest one.
   - Server: rejects a sum other than 20, duplicate ids, domain or category nodes, unknown ids and bad modes. A rejected call leaves the earlier interests untouched (atomic replace).
   - Tests in Tasks 2 and 8.

---

## Decision: snapping to a coarse cell without h3-pg (arena-style; recorded as D-028 in Task 1)

**What was checked (2026-10-03):**
- `list_extensions` on the live project `brivia-club` (`wfbddovczpfdrspmxgfo`, Postgres 17) offers **no `h3` or `h3_postgis`**. It offers `postgis` 3.3.7, `earthdistance` and `cube`, none of them installed.
- The local harness (PostgreSQL 16) has `cube` and `earthdistance` but neither PostGIS nor h3.
- **Assumption:** h3-pg stays unavailable on Supabase for this iteration. If it appears, the migration path below applies.

**Options:**

| Option | Privacy | Testable in harness | Effort / risk | IP hygiene | H3 fit for iteration 4 | Ops surface | Total /30 |
|---|---|---|---|---|---|---|---|
| A. Port H3 `latLngToCell` to PL/pgSQL (about 600 lines plus 540-entry base-cell tables, pentagons, Class III rotation) | 5 | 5 | 1 | 2 (third-party port inside the copyright repo) | 5 | 5 | 23 |
| **B. Equal-area lat/lng grid in SQL (about 40 lines), scheme-tagged ids, a centroid-defined hierarchy, a one-time remap to H3** | 5 | 5 | 5 | 5 | 3 | 5 | **28** |
| C. Supabase Edge Function using `npm:h3-js`, which calls a definer `store_home_cell` | 3 (one more hop; edge logs and body capture) | 1 | 3 | 5 | 5 | 2 | 19 |
| D. h3-js in the client | 4 | 3 | 4 | 5 | 5 | 4 | rejected: a new client dependency, and the client picks its own cell |
| E. Wait for ORBIT `POST /v1/location` (iteration 4) | 5 | 3 | 5 | 5 | 5 | 3 | rejected: blocks P0 onboarding |
| F. PostGIS `ST_HexagonGrid` in Web Mercator | 5 | 1 (no PostGIS locally) | 3 | 5 | 2 (still not H3, and area distorts with latitude) | 3 | 19 |

**Ruling: B.**
- **Privacy is equal to H3.** A level-7 cell is about 2.32 km × 2.32 km (about 5.4 km², versus H3 r7's average of 5.16 km²).
- **It is fully testable locally**, and it adds no extension, no new service and no third-party code to the repo.
- **ORBIT does not consume cells until iteration 4**, so H3 compatibility is not needed yet.

**Grid definition (normative; goes into spec §4.1 and §9.1.4):**
- Level L has `n_L` rows per degree: 48 for g7, 16 for g6, 16/3 for g5.
- The row is `row = least(floor((lat + 90) · n_L), 180·n_L − 1)`. Its centre latitude is `φc = −90 + (row + 0.5)/n_L`.
- Columns: `ncols = greatest(1, floor(360 · n_L · cos(radians(φc))))` and `col = floor((lng + 180) / 360 · ncols) mod ncols`.
- The id is `'g' || L || ':' || row || ':' || col`. The centroid is `(φc, −180 + (col + 0.5) · 360 / ncols)`.
- A parent cell is the snap of the child's **centroid** at the coarser level. H3 is only approximately nested, too.
- Distance is the haversine distance between centroids, with R = 6371.0088 km.

**Migration path to H3 (recorded in the spec):**
- `member_orbit.cell_scheme` is `'grid1'` now. In iteration 4, the ORBIT service runs a one-time backfill: `h3 = latLngToCell(gridCentroid(home_cell), 7)` for each row, written through `orbit_store_home_cell`, with `cell_scheme = 'h3r7'`.
- The displacement is at most the half-diagonal of a g7 cell (about 1.64 km), which is below the ring-0 radius (3 km).
- If h3-pg becomes available, `set_home_location` switches to `h3_lat_lng_to_cell` with the same signature, and the same backfill runs in SQL.
- `orbit/src/rings.js` gains a scheme adapter in iteration 4. It is not changed in this iteration.

**Dissent preserved:** A gives exact H3 from day one. It was rejected because a hand port of H3's face/IJK code is the largest correctness risk in the iteration, and because it puts third-party algorithm code inside the repository we intend to register for copyright (`IP_NOTES.md`).

---

### Task 1: Grid cells, places, and the location decision in the spec

**Files:**
- Create: `supabase/migrations/0004_orbit_onboarding.sql` (section "1. Grid and places")
- Create: `supabase/tests/orbit-location.test.sql`
- Modify: `docs/ORBIT_ENGINE.md` §2 (`home_cell` type), §4.1, §9.1.4, §9.1.5 (the contract regex also bans `^g[5-7]:\d+:\d+$`), §10 phase 1
- Modify: `docs/DECISIONS.md` (append D-028 with the ruling above, including the scores and the dissent)

**Interfaces:**
- Produces:
  - `public.brivia_grid_cell(p_lat double precision, p_lng double precision, p_level int default 7) returns text` (immutable; raises `22023 'invalid location'` for non-finite or out-of-range input or a level other than 5, 6 or 7);
  - `public.brivia_grid_centroid(p_cell text) returns table(lat double precision, lng double precision)` (immutable; raises `22023 'invalid cell'`);
  - `public.brivia_grid_parent(p_cell text, p_level int) returns text`;
  - `public.brivia_cell_km(p_a text, p_b text) returns double precision` (0 when equal);
  - `public.brivia_ring(p_km double precision) returns int` (0–5, using the limits 3/15/60/350/2500).
  - All five are revoked from `public, anon, authenticated` (internal use only).
  - `public.place(id text primary key, name text not null, region text not null, country text not null, lat double precision not null, lng double precision not null, is_launch boolean not null default false)`.
    - RLS is on, with a select policy `using (true)`.
    - Column grant `select (id, name, region, country, is_launch)` to `anon, authenticated`. The centroids are never granted.
    - Seed data: about 60 Indian cities (every state capital plus the top metros; launch cities Bengaluru, Mumbai, Delhi, Pune have `is_launch = true`) and about 15 world metros. Use `on conflict (id) do update`.
  - `public.brivia_nearest_place(p_cell text) returns text` (the place id with the smallest centroid distance).

- [ ] **Step 1: Write the failing tests** in `orbit-location.test.sql`:
  - Pune (18.5204, 73.8567) → `g7:5208:11554` (ncols 16386).
  - Two points 1 km apart in one city → the same cell or adjacent cells, with `brivia_ring(brivia_cell_km(a, b)) = 0`.
  - Pune vs Mumbai → ring 3. Pune vs Delhi → ring 4. Pune vs London → ring 5.
  - Antimeridian (0, 179.99) vs (0, −179.99) → ring 0.
  - (90, 0), (−90, 0), (0, 180) and (0, −180) each return a cell.
  - (91, 0), ('NaN', 0) and (0, 'Infinity') raise `22023`, and the `SQLERRM` text contains no digit of the input.
  - `brivia_grid_parent('g7:5208:11554', 6)` starts with `g6:`.
  - `brivia_grid_centroid(brivia_grid_cell(lat, lng))` is within 1.7 km of (lat, lng) for 100 pseudo-random points.
  - As `anon`, `select lat from place` fails with `insufficient_privilege`, and `select id, name from place` succeeds.
  - No `public` table other than `place` has a column matching `lat|lng|lon|latitude|longitude` (an `information_schema.columns` check).
- [ ] **Step 2: Run** `bash supabase/tests/run.sh`. Expected: FAIL on `brivia_grid_cell` does not exist.
- [ ] **Step 3: Implement section 1 of 0004** using the grid definition above. Use pure SQL and no extension. Use haversine in `brivia_cell_km`. Update the spec sections and add D-028.
- [ ] **Step 4: Run the harness.** Expected: `ALL PASSED`.
- [ ] **Step 5: Commit** `feat(orbit): server-side grid cells and places (D-028, spec §4.1/§9.1.4)`.

### Task 2: Interest taxonomy and the Passion Budget

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "2. Taxonomy and member interests", with the taxonomy data at the end of the file)
- Create: `supabase/tests/orbit-interests.test.sql`
- Modify: `docs/ORBIT_ENGINE.md` §2, §3.1 (ids and levels as stored)

**Interfaces:**
- Produces:
  - `public.interest_node(id text primary key, parent_id text references interest_node(id), level smallint not null check (level between 1 and 4), label text not null, status text not null default 'active' check (status in ('active','retired')))`.
    - Ids are dotted slugs (`sports`, `sports.racket`, `sports.racket.badminton`, `sports.racket.badminton.doubles`). `level` equals the dot count plus 1, and `parent_id` equals the id minus its last segment (a check constraint).
    - Anon and authenticated may select every column.
    - Seed data: 350–450 nodes. 10–14 domains, 50–70 categories, and the rest are interests plus at least 20 niches. The set is India-relevant (spec §10 phase 1) and uses `on conflict (id) do update`.
  - `public.member_interest(member_id uuid references profiles(id) on delete cascade, interest_id text references interest_node(id), points smallint not null check (points between 1 and 20), mode text not null default 'play' check (mode in ('learn','play','teach','build')), primary key (member_id, interest_id))`. RLS is on and there are no client grants.
  - `public.set_member_interests(p_items jsonb) returns void`: SECURITY DEFINER and volatile, executable by `authenticated`.
    - `p_items` is `[{ "interest_id": text, "points": int, "mode": text }]`.
    - It validates: 1–12 items, no duplicate ids, every id `active` with `level >= 3`, integer points of at least 1 that sum to exactly 20, and modes in the allowed set (a missing mode means `play`). Any failure raises `22023 'invalid interests'`.
    - It needs a profile row for `auth.uid()`.
    - It replaces the member's rows atomically, then sets `profiles.skills` to the chosen labels ordered by points desc, label asc (a server-written display copy).
  - `public.my_interests() returns table(interest_id text, label text, points int, mode text)` (own rows only).

- [ ] **Step 1: Write the failing tests:**
  - the node-count bounds and the level/parent consistency (no orphan nodes, `level = 1` exactly when `parent_id is null`);
  - a valid 3-item payload stores 3 rows and sets `skills`;
  - each Review Focus 5 server case raises `22023` and leaves the earlier rows unchanged;
  - `anon` cannot call `set_member_interests`;
  - member A cannot read B's `member_interest` (both direct select and `my_interests` as A return only A's rows);
  - `select count(*) from member_interest` as `authenticated` fails with `insufficient_privilege`.
- [ ] **Step 2: Run the harness.** Expected: FAIL.
- [ ] **Step 3: Implement section 2 and the taxonomy data.** Update the spec.
- [ ] **Step 4: Run the harness.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(orbit): interest taxonomy and passion budget (spec §3.1/§3.2)`.

### Task 3: Home location: `set_home_location`, `set_home_city`, rate limit, no-coordinate checks

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "3. Member orbit")
- Modify: `supabase/tests/orbit-location.test.sql`
- Modify: `supabase/tests/run.sh`:
  - start the cluster with `-c log_min_error_statement=error -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0`;
  - after the full chain, fail if `grep -q '12.971598\|77.594566' "$DATA/log"`.
- Modify: `docs/ORBIT_ENGINE.md` §9.1.4 (grid snap in SQL, `set_home_city`, the error code)

**Interfaces:**
- Consumes: Task 1 (`brivia_grid_cell`, `brivia_grid_parent`, `brivia_nearest_place`, `place`).
- Produces:
  - `public.member_orbit(member_id uuid primary key references profiles(id) on delete cascade, cell_scheme text not null default 'grid1', home_cell text not null, home_cell_g6 text not null, home_cell_g5 text not null, place_id text not null references place(id), home_set_at timestamptz not null default now())`. RLS is on and there are no client grants.
  - `public.location_change(id bigserial primary key, member_id uuid not null references profiles(id) on delete cascade, at timestamptz not null default now())`, with an index on `(member_id, at)`. It stores no cell. RLS is on and there are no grants.
  - `public.set_home_location(lat double precision, lng double precision) returns text`:
    - SECURITY DEFINER and **volatile**, executable by `authenticated` only;
    - requires a profile row for `auth.uid()`;
    - takes an advisory lock per member;
    - if 3 or more `location_change` rows fall in the last 24 h, raises errcode `PT429` with the message `try again later` (PostgREST answers HTTP 429);
    - otherwise it inserts a `location_change` row, upserts `member_orbit` (the cell, both parents and `place_id`), and returns `place.name`;
    - an invalid input raises `22023 'invalid location'` without consuming a change.
  - `public.set_home_city(p_place_id text) returns text`: the same, using the place centroid. An unknown id raises `22023 'invalid place'`.

- [ ] **Step 1: Write the failing tests:**
  - a member sets a location and gets back a place name; `member_orbit` holds `g7:` / `g6:` / `g5:` cells;
  - the 4th change within 24 h raises `PT429` with no state change (Review Focus 3). Backdate `location_change.at` as the owner to show that changes older than 24 h free a slot;
  - `pg_proc.provolatile = 'v'` for both functions;
  - `anon` is denied;
  - a member without a profile row gets an error;
  - the probe coordinate is sent only through psql `\bind`: `select public.set_home_location($1, $2) \bind 12.971598 77.594566 \g`, once on the success path and once on the over-cap error path (wrapped in `\set ON_ERROR_STOP 0` … `\set ON_ERROR_STOP 1`, then asserting the expected `PT429` with `:LAST_ERROR_SQLSTATE`). The `run.sh` log grep is the assertion that nothing was logged.
- [ ] **Step 2: Run the harness.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update §9.1.4: the snap is in SQL until iteration 4, `set_home_city` exists, and over the cap the error is `PT429`.
- [ ] **Step 4: Run the harness.** Expected: PASS, including the log grep.
- [ ] **Step 5: Commit** `feat(orbit): set_home_location with server snap and 3/24h limit`.

### Task 4: Completion redefined; one visibility helper; seed and harness fixtures

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "4. Completion and visibility")
- Create: `supabase/tests/orbit-completion.test.sql`
- Create: `supabase/tests/harness-autocomplete.sql`. This is a harness-only fixture, never a migration. Load it in `run.sh` step 2 after the migrations and before the `*.test.sql` loop. It is not matched by the loop.
- Modify: `supabase/seed/test-members.sql` (give each of the 24 members 3–5 interests summing to 20, and set `member_orbit` through `brivia_grid_cell` on their city centroid with a small per-member offset; still owner-only and idempotent), `supabase/seed/purge-test-members.sql` (comment only: the new tables cascade from profiles), `supabase/seed/README.md`
- Modify: `supabase/tests/seed.test.sql` (S2 uses `brivia_member_completed(id)`; the real member e1 gets interests and a cell; the purged phase also checks `member_interest`, `member_orbit` and `location_change` for 0 rows; Task 6 adds `signal_ledger` to that list)
- Modify: `docs/ORBIT_ENGINE.md` §7 (the completed definition; the candidate RPCs use `brivia_visible_to`)

**Interfaces:**
- Consumes: Tasks 2 and 3 tables.
- Produces:
  - `public.brivia_member_completed(p_id uuid) returns boolean` (stable, SECURITY DEFINER, not granted to clients). It is true when all of these hold:
    - `brivia_is_completed(name, 'x')`, i.e. a trimmed name that is not empty and not 'New Member';
    - a `member_orbit` row exists;
    - the member has between 1 and 12 `member_interest` rows whose points sum to 20.
  - `public.brivia_visible_to(p_viewer uuid, p_target uuid) returns boolean` (stable, SECURITY DEFINER, not granted to clients). It is true when the viewer and the target are both completed, are different members, are in the same world (`is_test` equal), and neither has blocked the other.
  - `get_candidates`, `search_members`, `list_members` and `brivia_can_see_author` are redefined in 0004 on top of `brivia_visible_to` and `brivia_member_completed`. Their signatures and return types are unchanged, and so are their caps, ordering and escaping.
  - `public.my_onboarding_status() returns table(interests int, points int, has_cell boolean, place_label text, completed boolean)`, for the caller only.

- [ ] **Step 1: Write the failing tests:**
  - a profile with a name but no interests or cell is invisible to a completed viewer, and as a viewer it gets 0 rows from all three candidate RPCs;
  - adding interests that sum to 19 is impossible (Task 2), so give it 20 and no cell: still invisible;
  - with a cell it becomes visible;
  - `my_onboarding_status` reports each stage;
  - the blocked pair and the cross-world pair stay invisible through `brivia_visible_to`.

  This file starts with `set brivia.harness_autocomplete = 'off';`.
- [ ] **Step 2: Write `harness-autocomplete.sql`.** It installs an AFTER INSERT OR UPDATE trigger on `profiles`, SECURITY DEFINER, that is active unless `current_setting('brivia.harness_autocomplete', true) = 'off'`:
  - when a row satisfies the legacy rule `brivia_is_completed(name, city)`, it upserts one interest worth 20 points (a fixture node `zz.harness.any` under `zz` and `zz.harness`, inserted by the fixture itself) and a `member_orbit` for the Pune centroid;
  - when the row stops satisfying the rule, it deletes both.

  Purpose: the iteration 0–2 suites keep their meaning ("completed" = name plus city) without being rewritten while the security agent edits them.
- [ ] **Step 3: Run the harness.** Expected: FAIL in `orbit-completion.test.sql`; the older suites still PASS.
- [ ] **Step 4: Implement section 4, and update the seed and `seed.test.sql`.** Update §7.
- [ ] **Step 5: Run the harness.** Expected: `ALL PASSED`, including the seed database.
- [ ] **Step 6: Commit** `feat(orbit): completion needs interests, 20 points and a cell; brivia_visible_to`.

### Task 5: k-anonymity counting and coarsening levels

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "5. k-anonymity")
- Create: `supabase/tests/orbit-kanon.test.sql`
- Modify: `docs/ORBIT_ENGINE.md` §9.1.4 (grid levels in place of res-6/res-5; `member_flag` is the "flagged" source)

**Interfaces:**
- Consumes: Task 3 `member_orbit`; Task 4 `brivia_member_completed`.
- Produces:
  - `public.member_flag(member_id uuid primary key references profiles(id) on delete cascade, reason text not null, flagged_at timestamptz not null default now())`. It is owner-only (RLS on, no grants) and is the "flagged (reported or restricted)" source until moderation tooling exists.
  - `public.cell_density(cell text, is_test boolean, n int not null, streak10 int not null default 0, streak5 int not null default 0, ok10 boolean not null default false, ok5 boolean not null default false, as_of date not null, primary key (cell, is_test))`. RLS is on and there are no grants.
  - `public.refresh_cell_density(p_as_of date default current_date) returns int`:
    - owner-only (revoked from `public, anon, authenticated`); schedule it nightly with pg_cron;
    - for every g7, g6 and g5 cell and each world, `n` counts members who are completed, whose `profiles.created_at < p_as_of - 14 days`, and who have no `member_flag` row;
    - a streak increments once per new `as_of` date while `n ≥ k`, and resets to 0 when `n < k`;
    - `okK` becomes false at once when `n < k`, and becomes true only when `streakK ≥ 7`;
    - re-running with the same `as_of` changes nothing.
  - `public.brivia_cell_ok(p_cell text, p_is_test boolean, p_k int) returns boolean` (internal; missing row → false).

- [ ] **Step 1: Write the failing tests:**
  - 10 members in one cell (aged 15 days through an owner update of `created_at`): `ok10` is false after 6 refreshes on consecutive days and true after the 7th;
  - one member drops out (`member_flag`) → false at the next refresh;
  - members aged 13 days, incomplete members and other-world members are not counted;
  - a g6 parent reaches k while its g7 child does not;
  - the same-day re-run is idempotent;
  - an `authenticated` call to `refresh_cell_density` is denied.
- [ ] **Step 2: Run the harness.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the spec.
- [ ] **Step 4: Run the harness.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(orbit): k-anonymity cell density with 7-night hysteresis (§9.1.4)`.

### Task 6: `send_signal`, the sender ledger and `my_signal_quota()` (Ruling A1)

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "6. Signals")
- Create: `supabase/tests/orbit-signals.test.sql`
- Modify: `supabase/tests/p0-consent.test.sql` and `supabase/tests/trust.test.sql`:
  - convert every `insert into public.connection_requests` run **as `authenticated`** into `perform public.send_signal(to, note)`. Owner-session fixture inserts stay.
  - Replace trust Task 3.2/3.3 ("silently not inserted") with the honest behaviour: the 31st call raises `signal_quota_exhausted`, and the completing request at the cap still matches.
  - Replace the `23505` re-request assertion (≈ line 734) with "both return `sent`, each costs 1".
- Modify: `docs/ORBIT_ENGINE.md` §6.4 ("Request caps and consent rules": the silent drop is replaced by the ledger and the honest own quota; recipient outcomes are uniform) and §7 (the Long-Range counter will use `kind = 'long_range'`)
- Modify: `docs/UX_SPEC.md` §B/§D (counter copy)
- Modify: `supabase/tests/seed.test.sql` (the purged phase also checks `signal_ledger` for 0 rows)
- Modify: `docs/DECISIONS.md` (append D-029; see the open choices at the end of this plan)

**Interfaces:**
- Consumes: Task 4 `brivia_visible_to`, `brivia_member_completed`; 0003 `brivia_request_is_live`, `brivia_lock_pair`, the completion trigger.
- Produces:
  - `public.brivia_config(key text primary key, value jsonb not null)`: owner-only, RLS on, no grants. Keys `signal_daily_limit` (default 30) and `signal_live_limit` (default 100). No row is inserted by the migration, so the defaults apply until the founder sets private values.
  - `public.signal_ledger(id bigserial primary key, sender_id uuid not null references profiles(id) on delete cascade, to_id uuid not null, kind text not null default 'signal' check (kind in ('signal','long_range','wtd')), at timestamptz not null default now())`, indexed on `(sender_id, kind, at)`.
    - RLS is on and there are no grants.
    - `to_id` deliberately has no FK, so an attempt at a non-existent id is charged like any other.
  - `public.send_signal(p_to uuid, p_note text default null) returns table(status text, remaining int, resets_at timestamptz)`: SECURITY DEFINER and volatile, executable by `authenticated` only. Its order is normative:
    1. **Caller checks (not charged):**
       - not completed → `22023 'complete your profile'`;
       - `p_to` null or equal to the caller → `22023 'invalid signal'`;
       - `char_length(p_note) > 500` → `22001`.
    2. Take the sender advisory lock (`brivia_request_caps:` key, as in 0003).
    3. **Quota.** `used` = ledger rows of kind `signal` in the last 24 h. `live` = distinct `to_id` in the ledger within 30 days with no current match to the caller. When either cap is reached:
       - if a live reverse request from `p_to` exists and the pair is visible (the completion case, which is never refused), continue;
       - otherwise raise `PT429` with the message `signal_quota_exhausted` or `signal_live_cap`. Nothing is charged.
    4. **Charge:** insert the ledger row (`sender_id`, `to_id`).
    5. **Recipient side, all silent:**
       - when `brivia_visible_to(caller, p_to)` is false, return `sent`;
       - otherwise insert into `connection_requests (from_id, to_id, note)`. A `unique_violation` or `foreign_key_violation` is caught and returns `sent`.
       - `status = 'matched'` only when a `matches` row for the pair exists afterwards.
    6. Write no `interaction` row on any path (Review Focus 1).
    7. Return the post-charge `remaining` (floored at 0) and `resets_at`.
  - `public.my_signal_quota() returns table(daily_limit int, remaining int, resets_at timestamptz, live_unanswered int, live_limit int)`.
    - `resets_at` is the time the oldest ledger row in the 24 h window leaves it, **rounded up to the hour**. It is null when nothing has been used.
  - `revoke insert on public.connection_requests from authenticated`, and drop the member insert policy. `brivia_before_connection_request()` is redefined without the caps; it keeps the expired-row replacement and the pair lock.

- [ ] **Step 1: Write the failing tests:**
  - **The P0-3 acceptance criterion.** Sender S has a normal target N, a target B that blocked S, a target S blocked, a cross-world target W, a duplicate (N again), a target D that declined S, and a random uuid. Each call returns `status = 'sent'` and lowers `my_signal_quota().remaining` by exactly 1. The whole `(status)` row set is identical across these targets.
  - The `interaction` rows readable by S are identical (none) before and after (Review Focus 1).
  - The 31st call in 24 h raises `PT429 signal_quota_exhausted`, the ledger still has 30 rows, and no request row is written.
  - At the cap, a request that completes a match returns `matched`, and `remaining` stays 0.
  - The live cap: with 100 distinct targets in 30 days (backdated past 24 h as the owner), the next call raises `signal_live_cap`; a match with one of them frees a unit.
  - `resets_at` is on an hour boundary and later than the oldest attempt plus 24 h.
  - A direct `insert into connection_requests` as `authenticated` fails with `insufficient_privilege`.
  - A caller who is not completed gets `complete your profile` and no ledger row.
  - `anon` is denied on both RPCs.
- [ ] **Step 2: Run the harness.** Expected: FAIL.
- [ ] **Step 3: Implement section 6. Convert the older suites' member-session inserts. Update the spec, UX_SPEC and D-029.**
- [ ] **Step 4: Run the harness.** Expected: `ALL PASSED`.
- [ ] **Step 5: Commit** `feat(signals): send_signal ledger and honest own quota (Ruling A1, D-029)`.

### Task 7: `deck_candidates`: the location-first interim deck, contract test, seen memory

**Files:**
- Modify: `0004_orbit_onboarding.sql` (section "7. Deck")
- Create: `supabase/tests/orbit-deck.test.sql`
- Modify: `docs/ORBIT_ENGINE.md` §7 (the interim deck), §9.1.5 (the interim deck contract)
- Modify: `docs/DECISIONS.md` (append D-030)

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5 and 6 (`brivia_cell_km`, `brivia_ring`, `member_orbit`, `place`, `brivia_visible_to`, `brivia_cell_ok`, `signal_ledger`).
- Produces:
  - `public.deck_candidates(p_limit int default 12) returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[], looking_for text[], distance_band text, shared_interests text[])`: stable, SECURITY DEFINER, executable by `authenticated`.
    - **Pool:** every target with `brivia_visible_to(auth.uid(), target)` and a true ring ≤ 2 (g7 centroid km). It excludes:
      - targets the viewer is matched with;
      - targets in the viewer's `signal_ledger` within 30 days;
      - targets with a viewer `interaction` row `event = 'pass'` within 7 days.
    - **Order:** true ring asc, then shared count desc (exact same `interest_id` held by both), then `md5(viewer::text || target::text)`.
    - `shared_interests`: at most 2 labels, ordered by the summed points desc, then label asc.
    - **`distance_band`:**
      - k = 10 when the true ring ≤ 1, else 5;
      - level = g7 if `brivia_cell_ok(target g7, world, k)`, else g6, else g5, else `place`;
      - the display ring is the true ring at g7; at g6 or g5 it is `greatest(2, ring of the distance between the viewer's and the target's cells at that level)`; at `place` it is `greatest(2, true ring)`;
      - labels: 0 → `~3 km`, 1 → `~10 km`, 2 → the target's `place.name`, 3 → `place.region`, 4 → `place.country`, 5 → `Abroad`. When the target's country differs from the viewer's, the label is also `Abroad`.
    - `p_limit` is clamped to [1, 20].
  - `public.deck_status() returns text`, one of:
    - `'complete_profile'` when the caller is not completed;
    - `'no_members_yet'` when the caller has no visible completed member in the world at all;
    - `'caught_up'` otherwise.

    It never returns a count (k-anonymity).

- [ ] **Step 1: Write the failing tests:**
  - **Ordering:** a ring-0 member with 0 shared interests comes before a ring-2 member with 3 shared, and among ring-0 members 2 shared comes before 1 shared. This is the P0-4 acceptance criterion.
  - A ring-3 member is absent.
  - Blocked (both directions), cross-world, incomplete and matched members are absent; a passed member is absent for 7 days and back after (backdate as the owner); a signalled member is absent.
  - **Contract (spec §9.1.5 style):**
    - `select jsonb_object_keys(to_jsonb(d)) from deck_candidates(20) d` equals exactly the 9 keys above;
    - `to_jsonb(d)::text` matches none of `8[0-9a-f]{14}`, `g[5-7]:\d+:\d+`, `-?\d{1,3}\.\d{3,}`, `@`, `\d{10}`, or a key named `city|state|cell|km|lat|lng|ring|email|phone|is_test`.
  - **k-anonymity:** with `cell_density` not ok, a ring-0 target's band is the place name and never `~3 km`; after 7 refreshes with ≥ 10 aged members it is `~3 km`.
  - `deck_status` gives each of its three outcomes.
  - `anon` is denied.
- [ ] **Step 2: Run the harness.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the spec and add D-030.
- [ ] **Step 4: Run the harness.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(deck): deck_candidates ring-then-shared interim deck with bands (P0-4)`.

### Task 8: The 4-step signup (UX_SPEC flow A) and completion re-entry

**Files:**
- Create: `passion-budget.js` (pure state helpers, no DOM)
- Create: `tests/unit/passion-budget.test.mjs`
- Modify: `auth.html`:
  - step 1 drops City and State and gains gender and experience;
  - new step 2 "Your area";
  - step 3 "Your signals" has the interest picker, the budget and looking-for;
  - step 4 is "Security and presence";
  - the progress reads `STEP n OF 4` with `aria-valuemax="4"`.
- Modify: `script.js`: step wiring, the skills picker replaced by the interest picker, the submit order, the pending-profile shape, and completion re-entry.
- Modify: `supabase.js`:
  - `profileToRow` stops sending `city` and `state` on insert;
  - export `setHomeLocation(lat, lng)`, `setHomeCity(placeId)`, `setMemberInterests(items)`, `fetchInterestNodes()`, `searchPlaces(query)` and `onboardingStatus()`.
- Modify: `auth-polish.css` (budget, stepper and segmented-control styles using existing tokens)
- Create: `tests/e2e/onboarding.spec.mjs`
- Modify: `docs/UX_SPEC.md` §A (final copy)

**Interfaces:**
- Consumes: the RPCs from Tasks 1–4 (`place`, `interest_node`, `set_home_location`, `set_home_city`, `set_member_interests`, `my_onboarding_status`).
- Produces (`passion-budget.js`; the state is `{ items: [{ id, label, points, mode }] }`):
  - `BUDGET = 20` and `MAX_INTERESTS = 12`;
  - `addInterest(state, { id, label }) → state` (refuses a 13th or a duplicate; the new item gets 1 point, taken from the largest item when 0 are left);
  - `removeInterest(state, id) → state`;
  - `stepPoints(state, id, delta) → state` (clamps each item to ≥ 1 and the total to ≤ 20);
  - `setMode(state, id, mode) → state`;
  - `pointsLeft(state) → int`;
  - `isComplete(state) → boolean` (≥ 1 item and exactly 20 points);
  - `toPayload(state) → [{ interest_id, points, mode }]`;
  - `counterText(state) → "N of 20 points left"`.
- Flow:
  - **Step 2 "Your area":**
    - The explainer "We only keep a ~5 km area. Nobody ever sees where you are." is visible **before** the "Use my location" button triggers `navigator.geolocation.getCurrentPosition` (`{ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }`).
    - Denial, timeout or no API opens "Pick my city" with "No problem. Pick your city instead."
    - The city picker is a labelled search input over `place` (name, region), a listbox, and keyboard selection.
    - Coordinates are kept in a module variable only.
  - **Step 3 "Your signals":**
    - a search field plus chips grouped by category (level 2);
    - selectable nodes are levels 3–4;
    - each chosen interest has a −/+ stepper (`aria-label="Remove a point from <label>"` / `"Add a point to <label>"`) and a radio-group segmented control `Learn · Play · Teach · Build`;
    - the counter is `aria-live="polite"`;
    - Next is blocked unless `isComplete`, with the error "Place all 20 points to continue." beside the counter.
  - **Submit:**
    - with a session: `saveProfile`, then `setHomeLocation` or `setHomeCity`, then `setMemberInterests`, then the app;
    - without a session (email confirmation): `brivia-pending-profile` stores `interests` and `orbit: { kind: 'city', placeId } | { kind: 'geo' }`, never coordinates;
    - after login, `kind: 'city'` is applied silently, and `kind: 'geo'` re-opens step 2.
  - **Gate:** auth and app routing redirect a member whose `my_onboarding_status().completed` is false to the completion flow at the first incomplete step (2 or 3), instead of `redirectToApp()`.
  - A `PT429` from location shows "Try again later." beside the location step.

- [ ] **Step 1: Write the failing unit tests** in `tests/unit/passion-budget.test.mjs`: every Review Focus 5 client case, plus `counterText` for 20 / 14 / 0 left and `toPayload` defaulting mode to `play`.
- [ ] **Step 2: Run** `node --test tests/unit`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `passion-budget.js`.** Run `node --test tests/unit`. Expected: PASS.
- [ ] **Step 4: Write the failing e2e test** in `tests/e2e/onboarding.spec.mjs`. Use the same stub harness as `consent.spec.mjs`: stub `rest/v1/place`, `rest/v1/interest_node`, `auth/v1/signup` (returning a session), `rest/v1/profiles` and the RPCs. Assertions:
  - at 375 px and 1440 px, 4 steps with "STEP n OF 4" and no `input[name=city]` or `input[name=state]`;
  - **geolocation granted** (`context.grantPermissions(['geolocation'])`, `setGeolocation({ latitude: 12.971598, longitude: 77.594566 })`): the coordinate appears only in the body of `POST /rest/v1/rpc/set_home_location`, in no URL and in no other body, and never in `localStorage` or `sessionStorage`;
  - **geolocation denied:** the city picker opens with the fallback copy, and the request goes to `rpc/set_home_city`;
  - a **keyboard-only** pass (Tab, Space, Enter) adds 2 interests, places 20 points with the steppers, and sets a mode; Next is disabled and the error shows at 19 points;
  - submit calls `set_member_interests` with points summing to 20;
  - **email-confirmation path:** the stored pending profile contains no `lat`, `lng`, `latitude` or `longitude` key and no `12.97`.
- [ ] **Step 5: Run the e2e test.** Expected: FAIL.
- [ ] **Step 6: Implement the HTML, script, supabase.js and CSS changes.** Update UX_SPEC §A.
- [ ] **Step 7: Run** `npm run build`, `node --test tests/unit`, both e2e specs and the harness. Expected: all PASS.
- [ ] **Step 8: Commit** `feat(onboarding): 4-step signup with Your area and Passion Budget (UX flow A)`.

### Task 9: Honest signal quota in the client; the localStorage limit removed

**Files:**
- Create: `signal-quota.js` (pure formatting)
- Create: `tests/unit/signal-quota.test.mjs`
- Modify: `app.js`:
  - delete `DAILY_SWIPE_LIMIT`, `SWIPE_RESET_WINDOW_MS`, `readDailySwipeState`, `recordDailySwipe`, `dailySwipeLimitReached`, `updateDailySwipeUi` and `scheduleDailySwipeReset`, and their call sites in `renderHome`, `swipe` and boot;
  - rewrite `sendConnectionSignal` and the like path in `swipe` / `openPitch`.
- Modify: `app.html` (`#swipe-left-count`, `#swipe-daily-count` and `#swipe-limit-state` copy)
- Modify: `supabase.js` (export `sendSignal(to, note)` and `fetchSignalQuota()`)
- Modify: `tests/e2e/consent.spec.mjs`:
  - stub `rpc/send_signal` and `rpc/my_signal_quota`;
  - the "exactly ONE request" assertions now count `POST /rest/v1/rpc/send_signal`;
  - assert that no `/rest/v1/connection_requests` POST is ever made;
  - replace the "empty 201 reads Signal sent" check with the quota checks below.

**Interfaces:**
- Consumes: Task 6 (`send_signal`, `my_signal_quota`, errcode `PT429`, the messages `signal_quota_exhausted` / `signal_live_cap`).
- Produces (`signal-quota.js`):
  - `quotaLabel({ remaining, resets_at }, now = new Date()) → string`: "N signals left today" (N ≥ 1, with "1 signal left today" singular), or "More at HH:MM" at 0, local time formatted with `toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`.
  - `quotaErrorText(error, quota) → string | null`:
    - `signal_quota_exhausted` → "You've used today's signals. More at HH:MM.";
    - `signal_live_cap` → "You have 100 signals waiting for an answer.";
    - otherwise null.
- Behaviour:
  - Load `my_signal_quota` at boot and after every `send_signal`. The counter shows `quotaLabel`.
  - Passes never touch the quota.
  - When the cached `remaining` is 0, Like does not open the pitch sheet and does not consume the card. It shows `quotaErrorText` as a toast, and `#swipe-limit-state` shows "More at HH:MM · Passing is always free."
  - On a `PT429` from `send_signal` (a race), the card returns to the front of the queue (`requeuePerson(person)`), the honest toast shows, and the counter refreshes.
  - The "Signal sent" toast is shown only for `status = 'sent'`, and "It's mutual…" only for `matched`.

- [ ] **Step 1: Write the failing unit tests:** `quotaLabel` for 30, 1, and 0 with `resets_at` `2026-10-03T15:00:00Z` (assert that it contains "More at"); `quotaErrorText` for both messages and for an unrelated error.
- [ ] **Step 2: Run** `node --test tests/unit`. Expected: FAIL. Implement `signal-quota.js`. Expected: PASS.
- [ ] **Step 3: Write the failing e2e checks** in `consent.spec.mjs`:
  - the counter reads "30 signals left today", and after one like resolves it reads 29 (the stub decrements);
  - with the stub at `remaining: 0`, Like keeps the same card visible, no `send_signal` call is made, and the "More at" text shows;
  - a stubbed `PT429 signal_quota_exhausted` on the call returns the card to the front;
  - `localStorage` has no `brivia-daily-swipes:*` key after 20 passes, and 20 passes make no `send_signal` call.
- [ ] **Step 4: Run e2e.** Expected: FAIL.
- [ ] **Step 5: Implement.**
- [ ] **Step 6: Run** `npm run build`, the unit tests and e2e. Expected: PASS.
- [ ] **Step 7: Commit** `feat(signals): honest quota counter; remove localStorage swipe limit (A1, A2)`.

### Task 10: Deck on `deck_candidates`: bands, chips, no City/State, pitch fix, empty states, caught-up

**Files:**
- Modify: `app.js`:
  - replace `loadMemberPage`, `memberDeck` and `fillDeckForFilters` with `loadDeck()`;
  - in `toDeckPerson`, map `distance_band` and `shared_interests`;
  - change `renderHome`, `swipe` (no wrap-around), `fillInfo`, `openPitch` and `openPublicProfile`;
  - remove the location filter (`exploreFilters.location`, `#filter-location-input` and its handlers) and the use of `profileLocationLabel` for other members;
  - the own-profile location line uses `my_onboarding_status().place_label`.
- Modify: `app.html` (remove the PLACE filter field; add `#deck-empty-action`)
- Create: `tests/e2e/deck.spec.mjs`
- Modify: `tests/e2e/consent.spec.mjs` (the deck stubs move from `rpc/list_members` to `rpc/deck_candidates`, with rows in the Task 7 shape), `tests/e2e/README.md`
- Modify: `docs/UX_SPEC.md` §B (the interim deck: band plus "You both" chips, no match %; final empty-state copy)

**Interfaces:**
- Consumes: Task 7 (`deck_candidates`, `deck_status`); Task 9 (`sendSignal`).
- Produces (in `app.js`):
  - `loadDeck() → Promise<{ added: number, error }>`, which calls `deck_candidates({ p_limit: 12 })` and merges unseen ids;
  - `recordPass(personId) → Promise<void>`, which inserts `interaction { viewer_id, target_id, event: 'pass' }` and is awaited before the next `loadDeck`;
  - `pitchLine(person) → string`:
    - with a shared interest: "Hey {name}, I noticed we both care about {shared[0] lowercased}. Would love to connect and exchange ideas.";
    - otherwise: "Hey {name}, I'd love to connect and exchange ideas.";
    - never throws for missing `tags`, `shared` or `name` (A5).
- Rendering:
  - the band goes in `#swipe-location`;
  - `#swipe-tags` starts with up to 2 `<span class="chip-shared">You both: {label}</span>`, followed by up to 3 profile tags;
  - the info sheet's "BASED IN" shows the band;
  - "INTERESTED IN" shows the first shared interest, else the first tag, else "Open to connect";
  - the public-profile modal shows the band when known and otherwise no location line.
- End of deck: when the queue runs out, `loadDeck()` runs once. If it returns 0, `deck_status()` decides the empty state:

  | Cause | Title | Action |
  |---|---|---|
  | filters active | "No one in this deck matches these filters." | "Clear filters" |
  | `caught_up` | "You're caught up." with "New people near you show up as they join." | "Search members" (focuses search) |
  | `no_members_yet` | "Your area is just opening." | "Invite a friend" (copies `location.origin` with `navigator.clipboard`, then toasts "Link copied") |
  | `complete_profile` | "Finish your orbit to see people near you." | "Finish profile" (`/auth.html#complete`) |

- [ ] **Step 1: Write the failing e2e tests** in `deck.spec.mjs`:
  - with rows carrying `distance_band: '~3 km'`, `'Pune'` and `'Abroad'` and `shared_interests: ['Badminton']`, the card shows the band and "You both: Badminton";
  - the page text never contains the stub's `city` or `state` values, even when the stub wrongly adds them to rows;
  - Like on a card with `tags: []` and `shared_interests: []` opens the pitch with the neutral line and no console error (A5);
  - after the last card, a stubbed empty `deck_candidates` plus `deck_status: 'caught_up'` shows "You're caught up." and its action. The deck does **not** wrap back to card 1;
  - each `deck_status` value and the filters case show their copy and action;
  - Pass sends one `POST /rest/v1/interaction` with `event: 'pass'`;
  - at 375 px, chips wrap and do not clip, and the action buttons are at least 44 px tall.
- [ ] **Step 2: Run** `node tests/e2e/deck.spec.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement. Update `consent.spec.mjs` stubs and the README, and UX_SPEC §B.**
- [ ] **Step 4: Run** `npm run build` and all three e2e specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deck): location-first deck with bands and shared chips; empty states; caught-up`.

### Task 11: Scope verification for the go-live gate items this iteration owns

**Files:**
- Modify: `docs/ORBIT_ENGINE.md` §10 (phase 1 status)
- Modify: `docs/DECISIONS.md` (append D-031: iteration 3 delivered, with the commit and migration set)
- Modify: `CLAUDE.md` (the commands section: `node --test tests/unit` and the e2e specs)

- [ ] **Step 1:** Run `bash supabase/tests/run.sh`. Expected: `ALL PASSED`, including the log grep.
- [ ] **Step 2:** Run `cd orbit && npm test`. Expected: PASS, unchanged.
- [ ] **Step 3:** Run `node --test tests/unit` and the three e2e specs. Expected: PASS.
- [ ] **Step 4:** Run `npm run build`, then `grep -rE "service_role|DAILY_SWIPE_LIMIT|brivia-daily-swipes|latitude|longitude" dist/`. Expected: matches only for the geolocation API's `coords.latitude` / `coords.longitude` reads, inside the location module.
- [ ] **Step 5:** Run `grep -nE "connection_requests'\)\.insert|rpc\('list_members'" app.js`. Expected: no output.
- [ ] **Step 6:** Write the §10 status and D-031. Commit `docs: iteration 3 delivered (D-031)`.

---

## Open design choices made in this plan (for the founder and the next arena)

1. **H3:** a grid fallback (D-028, above), with a documented remap to H3 r7 in iteration 4.
2. **Completion redefined** (D-030, Task 4): a name, plus 1–12 interests summing to 20, plus a cell. City is no longer part of it.
   - New sign-ups no longer write `city`/`state`, but the legacy columns and grants stay. `search_members` still matches legacy city text.
   - Clients never render another member's city or state.
   - Older harness suites keep their meaning through a harness-only autocomplete fixture, so they are not rewritten while the security agent edits them.
3. **The live-unanswered cap is ledger-based** (D-029): distinct targets signalled in 30 days that are not matched. It is not counted from `connection_requests` rows, which would differ for blocked or cross-world targets and turn the counter into a probe.
   - `send_signal` writes no `interaction` row for the same reason.
4. **Residual block-probe surfaces stay out of scope:** `get_candidates` (an id returns no card when blocked) and `my_outgoing_requests()` (the row is absent when blocked). Both already exist in 0003. Ruling A1 covers the send path and the quota; record these for iteration-3 arena review.
5. **At 0 remaining, the client does not call `send_signal`.** The never-refused completion path stays reachable through Accept in the Requests list, and through the server when the cached quota is stale.
6. **Seen memory is "acted on", not "shown":** passes are hidden for 7 days, signals for 30 days, and matches always. A card shown and then abandoned can reappear. A true impression-based seen record waits for `log_impressions` in iteration 4.
7. **Distance bands:** `~3 km` and `~10 km` for rings 0–1, only at g7 with k met; the place name for ring 2 and for any coarsened band; region, country or `Abroad` beyond.
   - Because of the 14-day age rule and the 7-night hysteresis, a new launch city shows place names (not km) for about 3 weeks. That is intended.
8. **"Flagged"** for k-anonymity is a new owner-only `member_flag` table. No moderation UI yet.
9. **Taxonomy and places data live in `0004`**, as one migration file, as instructed. They are applied with upserts.
10. **Out of scope** (noted, not built): travel mode (`set_travel_location`), changing your area from the profile page (it reuses step 2 in iteration 4), launch-city waitlist (P1 #7, second half), the Sent tab (P1 #9), and the engine fixes and C1 study (P1 #5–6).
