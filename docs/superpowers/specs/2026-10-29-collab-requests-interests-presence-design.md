# Collaboration requests, interest catalogue, active status and post-card polish (design, 2026-10-29)

Founder request, 2026-10-29 (with a screenshot of Explore): use the supplied A–Z list for the interest dropdown with an
"Other" option for manual input; an active indicator for profiles in chat; tidy the post cards, whose like/comment
counts and "Liked by" row make them messy; requests in notifications without Accept / Decline, swipeable, under "See who
wants to collaborate with you", worded as a professional networking feature (never a dating app). Professional, on
brand (deep wine, cream, Bodoni Moda + Instrument Sans), consistent with the shared components (D-105).

Decisions taken with the founder (brainstorming, 2026-10-29):

- "Other" interests are **shown and matched**: they appear on the profile like any interest and match members who typed
  the same thing; server-side filters and the existing Report flow handle abuse.
- Active status is shown **to connections only, with an opt-out** that works both ways.
- Swiping a request left ("Not now") **declines quietly**, as Decline does today.

Built in this order, each shipped on its own: 1, 2, 3, 4.

## 1. Post-card polish (client only)

Problem: the counts are circular badges pinned to the icons, and the activity row exists only on some cards, so cards
in one grid row have different heights and the action bars do not line up.

- Action bar: each of Like, Comment, Share shows its count inline beside the icon (no badge), tabular figures, the label
  under the icon as now. Save shows no count (saves stay private).
- Footer: every card has one footer row of fixed height. With activity: "Liked by Asha and 2 others" on the left and
  "View 3 comments" on the right; with none: "Be the first to like this" in muted text. One line, ellipsis, never wraps.
- `post-card.js` (markup) and `paintPostActivity` (in-place repaint) produce the same structure; unit and e2e tests follow.

## 2. Collaboration requests (client only)

- The notification panel replaces the per-request Accept / Decline rows with one section, **"See who wants to
  collaborate with you"**: up to three overlapping avatars, "N people want to connect", and a **Review** button.
  Message notifications stay as they are.
- **Review** opens a sheet (bottom sheet on phones, centred card on desktop) with one request at a time: photo, name,
  role, distance band, shared interests, their note under "Their note", and a counter ("1 of 3").
- Right swipe or **Connect** calls `respond_connection_request(true)`; the card leaves and a brief "You're connected"
  state offers **Message**. Left swipe or **Not now** calls `respond_connection_request(false)` (a quiet decline; the
  sender is never told). After the last card: "You're all caught up."
- Gesture: `createDeckSwipe` (deck-swipe.js), so the motion matches the deck; stamps read CONNECT / NOT NOW. Arrow keys
  and both buttons work; reduced motion fades instead of flying; focus is trapped in the sheet and returns to Review.
- Wording rule: collaborate, connect, not now, request. Never match, like, pass, swipe right, crush or hearts.

## 3. Interest catalogue and "Other" (migration 0017)

- The founder's list (~900 labels, A–Z) is the offered set. A label that already exists in `interest_node`
  (case-insensitive) is reused. Every other label becomes a level-3 node under the closest existing level-2 category
  (classified once, stored in the migration), so ORBIT's topology (parent/child, sibling, same domain) stays
  meaningful. Duplicates in the list are collapsed. Labels only, nothing sensitive is added.
- `interest_node.catalog_order` (int, nullable) marks the offered catalogue; the dropdown lists catalogue nodes A–Z
  under letter headings ("A", "B", …), search narrows across all of them. Nodes outside the catalogue stay valid for
  members who already have them but are not offered.
- **Other**: the last row of the dropdown, "Add “…” as your own interest". RPC `add_member_interest(p_label)` (definer,
  authenticated, completed or onboarding member): trims and collapses spaces; 2–40 characters; letters (any script),
  digits, spaces and `& + - . ' /`; not on a blocked-words list; at most 5 new labels per member per 24 h. It returns
  the id of an existing active node with the same label (case-insensitive, any branch) or creates
  `member.custom.<slug>` (level 3 under level-1 `member` "Member interests", level-2 `member.custom`). The client then
  adds that id to the picks; saving still goes through `set_member_interests`.
- Tests: SQL (reuse of existing labels, slug collisions, validation, the 5-a-day cap, anon refused), unit (grouping),
  e2e (A–Z headings, Other adds a chip and saves).

## 4. Active status (migration 0018)

- `member_presence(member_id pk, last_seen_at, visible boolean default true)`, RLS on, no direct grants.
- `touch_presence()` (definer): the caller's own row, at most once per 30 s. The app calls it on load, every 60 s while
  the tab is visible, and on focus.
- `connection_presence(p_ids uuid[])` (definer): for each id that is the caller's match, `true` when that member's
  `visible` is on, the caller's own `visible` is on, and `last_seen_at` is within 3 minutes; never returns a time.
- `set_presence_visible(p_visible)`: the opt-out, shown in Settings as "Show when I'm active".
- UI: a dot (green with a cream ring) on avatars in the chat list and the chat header, "Active now" under the open
  chat's name; refreshed every 60 s with the message sync. Nothing on the deck, search or profiles.
- Deletion: rows cascade with the profile. Privacy notice: a line on activity status.

## Error handling

Every new call degrades silently when its migration is not applied (missing function or table: the feature hides).
Network errors leave the previous state and show the shared toast only for actions the member took (Connect, Not now,
Add interest).

## Testing and proof

TDD per piece: unit tests for pure helpers, SQL harness tests for 0017 and 0018, e2e specs at 1440 and 390 px with axe,
and screenshots reviewed before each ship. Existing suites (explore-cards, post-activity, app-shell, signup,
profile-edit, chat-inbox) stay green.
