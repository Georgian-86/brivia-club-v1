# Polish wave (2026-10-21): fixes, signup again, Explore cards, resume and chat

**Status:** draft for founder approval. Branch `claude/polish-wave-2026-10-21` (from `main` f15fb31).
**Founder brief (2026-10-21), verbatim items:** location access; no points at signup, interests only; beautify Explore
cards (reference: post card with a wine handle bar, image, like / comment / share / save); chat cards stretched on
shorter laptop screens (MacBook Air) with side margins; notifications open under the chat list; logout/account menu
stretched on smaller screens; resume upload in profile with size limit and validation (client and server); quick-share
in chat for the stored resume and location; beautify login and signup, one question per screen again, keep "Continue
with Google"; a typing indicator in chat; a blocked member can still send but nothing reaches the recipient (today the
send is refused and looks like a bug); remove Yogansh and Keshav. "Keep the brand a class apart."

**Brand:** Brivia deep-wine tokens and type stay (CLAUDE.md, `docs/UX_SPEC.md`). The Anthropic brand-guidelines kit is
not applied. UX rules from ui-ux-pro-max: ≥44 px targets, ≥4.5:1 contrast, no horizontal overflow from 320 to 2560 px,
reduced-motion respected, focus visible, one primary action per screen.

## Sub-projects (each is its own release to `main`, in this order)

### A. Fixes on the live site (no new SQL except A5)

| # | Fix | Done when |
|---|---|---|
| A1 | **Location "Use my location" does not work** (founder: answer 3). Root-cause first (systematic debugging): permission prompt, `Permissions-Policy`, HTTPS, timeout/accuracy options, error handling, the `set_home_location` RPC. | On a real browser the button asks for permission and saves the rough ~2 km cell; denied/unavailable/timeout fall back to the city list with a clear line. Coordinates never stored or shown (unchanged rule). |
| A2 | **Chat stretched on shorter screens** (13" MacBook Air ~1440×900 and 1280×800 viewports): message cards and images grow too tall/wide and side margins appear. | Chat thread, list and composer fit the viewport at 1280×720, 1280×800, 1366×768, 1440×900, 1536×864, 1920×1080 and phones; images capped (max-height relative to the viewport, `object-fit`); no side gutters. |
| A3 | **Notifications open under the chat list** when opened from Chat. | The notifications panel is above every view (stacking context fixed), anchored to the bell, on all sizes. |
| A4 | **Account menu (Signed in as / Notifications / Blocked / Removed / Privacy) stretched on smaller screens.** | A compact menu with natural item height on every size; on phones it becomes a bottom sheet. |
| A5 | **Blocked sender can still "send"; nothing reaches the recipient.** | The blocked member can type and press Enter; the message shows as sent in their own thread only; the recipient never sees it (no row visible to them, no notification, no unread count, no typing signal). New migration `0012`: messages from a blocked sender are stored with a hidden flag (or not delivered) and every read path for the recipient excludes them. The block itself is never revealed. |
| A6 | **Remove Yogansh and Keshav.** | I identify the accounts read-only and give the founder one SQL statement / dashboard step to delete them (the session never writes the live database). |

### B. Signup again: one question per screen, Google kept, interests only

- Bring back the guided flow (one question per screen on phone and desktop) on top of today's code, reusing the
  D-067/D-068 implementation from history where it still fits. Screens: Welcome (Continue with Google · Continue with
  email) → email + password (as D-068) → 18+ → Name → Area (A1's working location) → Interests → Reveal.
  Phone and gender stay as D-068 decided unless the founder says otherwise.
- **No points screen:** interests are picked only; points are an even split behind the scenes (D-056).
- **Beautify login and signup:** the same editorial deep-wine look as the landing, a calm one-column card, premium
  interest picking (animated "Your picks" tray).
- Notice version stays `2026-10-05` (0011).

### C. Explore cards redesign (founder reference)

Each Explore item becomes a post-style card: a wine header bar with `@handle` / name, a large image (cover or preset
illustration, 4:5), and a wine action bar with **like · comment · share · save** icons and labels; "New post" as a wide
wine button above the feed. Responsive grid: 1 column on phones, 2 on tablets, 3 on desktop; consistent card heights;
hover and press states; skeletons while loading. Like and save persist (existing tables if present, else `0012`);
share uses the Web Share API with a copy-link fallback; comment opens the post. Only data members already see.

### D. Resume, quick-share and typing

- **Resume upload (Profile):** PDF only, max 5 MB, one file per member. Client checks type, size and magic bytes
  (`%PDF`) before upload. Server: a private Storage bucket `resumes` with `file_size_limit` 5 MB and
  `allowed_mime_types = ['application/pdf']`, owner-only RLS on `storage.objects` (path `<uid>/resume.pdf`), and a
  `profiles.resume_path` column; replace and delete supported; deleted with the account (0005 deletion path extended).
- **Quick-share in chat:** a "+" menu in the composer with **Share my resume** and **Share my area**. Resume: sends a
  message carrying a short-lived signed link (only for an existing match; the link is generated on open, never stored
  public). Area: sends the member's rough area as text (place name and "~2 km area"), **never coordinates** (CLAUDE.md).
- **Typing indicator:** Supabase Realtime broadcast on the match channel; "typing…" dots under the thread header while
  the other member is typing (throttled, stops after 4 s idle); never sent to or from a blocked pair.
- Migration `0012` (one file) carries every SQL change in A5, C and D; harness tests for each.

## Testing (every sub-project)

TDD; the SQL harness (all migrations twice); unit; e2e (stubbed Supabase) at 320, 375, 390, 768, 1280×800, 1440×900,
1920×1080; axe; screenshots reviewed by a separate reviewer; landing parity unchanged unless intended. A visual QA
pass across all screens before each release.

## Decisions to record

D-072 (A), D-073 (B), D-074 (C), D-075 (D), appended to `docs/DECISIONS.md`.

## Founder actions

Run `0012` in the SQL editor when D ships; delete the two accounts with the statement provided.
