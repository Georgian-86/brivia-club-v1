# Test world v3: 200 more test members with faceless photos (design, 2026-10-25)

Founder request: "add 200 test users with realistic names, mostly Indian, from around the major cities, with different
interests, and profile pictures, but don't show faces (they may look AI generated)." Decisions taken with the founder
(2026-10-25): faceless **stock photos**, **shipped with the site**, **no visible label**, and **added to** the 60 v2
members (260 in all).

## What ships

1. **`supabase/seed/test-members-v3.sql`**: t061 to t260 (ids `a7e57000-0000-4000-8000-000000000061` to `…260`, emails
   `t061@test.brivia.club`), `is_test`, generated (never hand-edited) by `scripts/seed/gen-test-members-v3.mjs` from a
   fixed PRNG seed, so the file is reproducible and reviewable. One transaction, idempotent like v2 (`on conflict do
   nothing`, `not exists` guards), run as `postgres` after v2. The purge needs no change: it keys on `is_test` and the
   id prefix.
2. **Cities (200):** Bengaluru 30, Mumbai 26, Thane 22, Pune 22, Delhi 18, Hyderabad 18, Chennai 14, Navi Mumbai 10,
   Gurugram 10, Kolkata 10, Noida 8, Ahmedabad 6, Jaipur 6. Every one is a `public.place` row.
3. **People:** full names from region-appropriate pools (Marathi, Kannada, Tamil, Telugu, Malayali, Bengali, Gujarati,
   Rajasthani, Punjabi, Hindi-belt, Muslim, Christian and Parsi names, weighted by city), about 3% non-Indian residents.
   No duplicate of a v2 name. Gender about half and half, a few "Prefer not to say". Experience from the onboarding
   options; `looking_for` 1 to 3 values from `LOOKING_FOR_CATALOG`; joined over the last 45 days.
4. **Interests:** 2 to 5 active, non-sensitive level-3/4 taxonomy nodes, points summing to exactly 20 (the Passion
   Budget), modes across learn, play, teach and build. Each city has 4 "scenes" (clusters of 4 to 6 related interests);
   a member takes 2 to 3 from one scene and 0 to 2 from anywhere, so neighbours genuinely share interests and the deck
   and ORBIT have real signal. No private (sensitive) interests, so no consent rows are needed. `skills` is written the
   way `set_member_interests` writes it.
5. **Area:** a home cell from the city centroid plus a per-member offset of up to about 6 km (neighbourhood spread),
   snapped with `brivia_grid_cell`; no coordinate is stored.
6. **Cover:** one of the 18 offered presets (`brivia_offered_cover_keys`, 0014).
7. **Photo:** `/media/test-members/tNNN.webp` (480 x 600, about 25 to 40 KB), a faceless Unsplash photo (Unsplash
   License: free to use, no attribution required) chosen to fit the member's top interest: hands, backs,
   silhouettes, people far away, or the hobby itself. Each photo is checked by eye for faces before it ships. The
   generator writes `photo_url` only for members whose file exists, so the seed never points at a missing file.
   `site/media/test-members/credits.json` records each photo's Unsplash id and photographer.
8. **Migration `0015_test_member_photos.sql`:** `profiles_photo_url_storage` also accepts exactly
   `/media/test-members/t<3 digits>.webp` when `is_test` (only the table owner can set `is_test`, 0003). Real members
   are unchanged: Storage URLs of their own folder only. The client already renders same-site paths (`safeImageUrl`).
9. **Harness:** `run.sh` runs v3 twice after the v2 checks, then `seed-v3.test.sql` (200 members, all completed, each
   in its city, interests summing to 20, no sensitive interest, photo paths valid and existing), then the purge
   (0 remaining). The v2 seed's own count check counts only its 60 ids, so v2 can be re-run after v3.

## Out of scope

Posts, requests, matches and chats for v3 members (v2 already demonstrates them); a visible "test" label (declined).

## Launch

The purge removes all 260 members. Delete `site/media/test-members/` in the same release.
