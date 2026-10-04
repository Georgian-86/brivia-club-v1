# UX spec: ORBIT flows in the v1 UI

*Built with the ui-ux-pro-max skill (UX rule database) on 2026-10-02. The generic palette it proposed (orange with
Poppins) was **rejected**: the v1 brand is already established and was chosen by the founder. Brand tokens stay as
they are. This spec applies the skill's UX rules to the new ORBIT flows.*

## Brand (unchanged; the source of truth is the existing CSS)

| Token | Value | Where |
|---|---|---|
| Deep wine | `--brivia-deep-wine: #430416`, `--brivia-wine: #5e0b28`, `--brivia-wine-soft: #76243f` | `deep-wine-theme.css` |
| App surfaces | `--app-bg`, `--app-panel`, `--app-red`, `--app-green`, `--app-violet` (light and dark pairs) | `app.css` |
| Type | Display: *Bodoni Moda*. Body/UI: *Instrument Sans*. Editorial accents: *Georgia* | `app.css`, `style.css` |
| Voice | Uppercase micro-labels ("STEP 02 · YOUR SIGNALS"), short editorial headlines ("Find your people.") | `auth.html` |

New components reuse these tokens. **No raw hex in new components**, and no new font families.

## Rules applied from ui-ux-pro-max (priority order)

1. **Accessibility (critical):** text contrast ≥ 4.5:1 on wine backgrounds. Every icon-only button gets an
   `aria-label`. Focus rings stay visible. Swipe has button equivalents (already present: `.swipe-pass`, `.swipe-like`),
   and every new drag interaction also gets a tap or keyboard alternative (WCAG 2.2 "dragging movements").
2. **Touch:** targets of at least 44×44 px with 8 px spacing. Async buttons (Connect, Send request) disable and show a
   loading state, so a double tap can't fire twice.
3. **Layout:** mobile-first. Check at 375, 768, 1024 and 1440 px. Chip collections **wrap**, never clip (the
   "chip collection reflow" rule), with an operable "+n" disclosure when collapsed.
4. **Forms:** a visible label on every input (placeholders are not labels). Errors appear next to the field.
   Progressive disclosure: one concept per onboarding step, with a step indicator ("STEP 2 OF 4"), Back on every step,
   and Skip only for optional steps.
5. **Feedback:** every empty state says why it's empty and offers one next action. Loading uses skeleton cards that
   reserve card size (CLS < 0.1).
6. **Motion:** 150–300 ms context-aware transitions. Respect `prefers-reduced-motion` (no card fling, use a fade). No
   pulsing CTAs.
7. **Icons:** SVG, not emoji, for new UI. Existing glyphs like `✉ ♙ ◉` in auth are legacy and get replaced when touched.

## Flow changes

### A. Onboarding: 4 steps with "Your area" and the Passion Budget (shipped in Iteration 3, Task 8)

The signup (`auth.html`, `script.js`, `passion-budget.js`) has **4 steps**. The progress reads `STEP n OF 4 · …` and the
progress bar has `aria-valuemax="4"`. Every step has Back (except step 1); Next validates only its own step.

1. **The basics** (`STEP 1 OF 4 · THE BASICS`): full name, email, phone, gender and experience. There are no City or
   State inputs; step 2 replaces them.
2. **Your area** (`STEP 2 OF 4 · YOUR AREA`), "Where do you spend most weeks?"
   - The explainer **"We only keep a rough ~2 km neighbourhood square. Nobody ever sees where you are."** is always
     visible above the two choices, so it is read before the browser asks for permission. (Honest copy: a g7 cell is
     about 2.3 km × 2.3 km, D-028.)
   - **Use my location** calls `navigator.geolocation.getCurrentPosition` with
     `{ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }`, and only on that tap. Success reads
     **"Got it. We keep only the ~2 km square you're in."** The coordinates stay in memory only (never storage, URL, DOM
     or logs) and go to the server in the body of `POST rpc/set_home_location`, which snaps them to a coarse cell.
   - Denial, timeout, an unanswered prompt (15 s), a missing API or an insecure context opens **Pick my city** with
     **"No problem. Pick your city instead."** and moves focus to the city search. It is never a dead end.
   - **Pick my city** is a labelled combobox ("Your city") over a listbox of `place` rows (name, region; launch cities
     first). Arrow keys move, Enter picks, Escape closes. The pick reads "Your area: Bengaluru, Karnataka. We use the
     city's centre, never your address." and is sent with `rpc/set_home_city`.
   - Next without an area shows "Choose your area to continue." A `PT429` from either call returns the member here
     with **"Try again later."** beside the choices.
3. **Your signals** (`STEP 3 OF 4 · YOUR SIGNALS`), heading **"Your signals."**
   - A search field ("Interests") over the taxonomy. A short result count ("3 matches", "1 match", "No matches") is
     written to the polite live region under the field. Escape clears the field. The native clear button uses the
     wine token. With no query, one collapsible group per category (level 2),
     each holding chips for its interests and niches (levels 3–4, the only selectable levels). With a query, the
     matching chips, grouped by category. Chips are toggle buttons (`aria-pressed`); at 12 the rest are disabled with
     "You can choose up to 12 interests. Remove one to add another."
   - **Sensitive interests** (D-029) can be picked like any other. Their chip and their budget row show a lock icon
     and **"Private: counts for matching, never shown on your profile"**. They never appear anywhere public.
   - **The Passion Budget:** 20 points over 1–12 interests, each with at least 1 point. A new interest gets 1 point
     (taken from the largest one when none are left). Each chosen interest has a −/+ stepper
     (`aria-label="Remove a point from <label>"` / `"Add a point to <label>"`, 44 × 44 px, focusable even at a
     limit), a segmented radio group **Learn · Play · Teach · Build** (default Play; arrow keys move), and a remove
     button. Steppers never take an interest below 1 or the total over 20.
   - The counter **"N of 20 points left"** is `aria-live="polite"`. Next stays `aria-disabled` until all 20 points
     are placed; activating it then shows **"Place all 20 points to continue."** beside the counter.
   - "What are you looking for?" (unchanged) is required here too.
4. **Security and presence** (`STEP 4 OF 4 · SECURITY & PRESENCE`): password, photo and cover, unchanged.

**Submit order.** With a session: save the profile, then `set_home_location` or `set_home_city`, then
`set_member_interests`, then the app. A failed area or interest call returns to that step with the error beside it.
Without a session (email confirmation), `brivia-pending-profile` keeps the profile fields, the interests as
`{ id, points, mode }` only (no labels), only `orbit: { kind: 'city', placeId }` or `{ kind: 'geo' }` (never
coordinates), and `savedAt`; it is dropped unused after 7 days. **Sensitive interests are left out**; after login step 3
says "Private interests aren't kept while you confirm your email. Please pick them again." After login a city choice
and complete interests are applied; a geo choice re-opens step 2. Nothing fails silently: a `PT429` on the city shows
"Try again later." on step 2, a rejected interest save prefills the budget from the pending list with the budget error,
and the pending profile is deleted only when every call made succeeded. A save error clears whenever step 3 is entered
again; a retry does not resend an area that was already stored. Profile writes never carry `skills` (server-owned,
D-035), `city` or `state`; auth metadata carries no interests or location.

**Completion re-entry (the gate).** Auth and app routing call `my_onboarding_status()`. When `completed` is false,
the member lands on the completion flow at the first incomplete step: step 1 when the name is empty or "New Member"
(never prefilled), step 2 without a cell, else step 3. A stored
area is kept ("Your area: Pune. Choose again to change it.") and existing interests prefill the budget.

**Escape and close.** Escape never leaves the signup when a control already handled it, from a field of the signup
form, or once the signup is past step 1. The close (×) button is 44 × 44 px and the header row reserves room for it,
so it never covers "Log in".

**Profile editor (`app.js`).** Skills / interests always come from the server row and are shown read-only (empty
state: "Pick interests in your profile setup") ("These come from your interests and passion
points. Private interests are never shown.").
There are no City or State inputs (D-036). The member's area (`my_onboarding_status().place_label`) is shown
read-only as "YOUR AREA" with "Change your area: coming soon." The profile page's details card (email, phone) is
labelled "PRIVATE · ONLY YOU SEE THESE", and the hero and the area stat show the place label.

### B. Discover deck (`app.html` swipe card)

- The card location line shows the **distance band** ("~3 km", "Mumbai", "Abroad"), never the city of a ring 0–1 person's home cell beyond "~N km".
- The card adds a **resonance line** with the match % (resonance, not the ranking score) and up to 3 evidence chips
  (see `ORBIT_ENGINE.md §6.3`). *Deferred to ORBIT (phase 3): the interim deck shows no match %.*
- **Worth-the-Distance card:** the same card with a wine-gradient top band reading "WORTH THE DISTANCE · 91%
  RESONANCE" and one extra chip explaining why. Max 2 a day.
- **The interim deck (shipped in Iteration 3, Task 10; `deck_candidates`, ORBIT_ENGINE §7).**
  - The card's location line (`#swipe-location`, with an SVG pin) is the server's `distance_band` only. Cards and the
    public-profile modal ("VIEW PROFILE") never show another member's City, State, cell, km or a match %; the public
    profile shows the band when known and otherwise no location line. (The old `#info-modal` info sheet was never
    opened and was removed in Fix round 1.) The client drops `city` / `state`
    from every other member's row, so no other surface (chat header, lists) can show them either.
  - The tag row (`#swipe-tags`) starts with up to 2 wine "You both: X" chips (`.chip-shared`, from
    `shared_interests`), then up to 3 profile tags that do not repeat them. Chips wrap, never clip or ellipsize.
    Every label is set as text, never as HTML.
  - The pitch sheet starts with "Hey {name}, I noticed we both care about {first shared interest, lowercased}. Would
    love to connect and exchange ideas.", or "Hey {name}, I'd love to connect and exchange ideas." when nothing is
    shared (A5: never fails on a card with no tags or shared interests).
  - The PLACE filter is gone (cards carry no City/State; the deck already starts nearby). Name, skills and
    looking-for filters apply to the loaded deck.
  - A passed or liked card leaves the deck for the session: there is no wrap-around. When the queue runs out, the deck
    loads once more; if nothing new comes back, `deck_status()` picks the empty state.
- **Deck empty states (final copy).** Each says why the deck is empty and offers exactly one action (`#deck-empty-action`,
  at least 44 px tall, visible focus). Pass/Pitch and the hint are hidden while it shows. When the deck empties, focus
  moves to the title (`#deck-empty-title`, `tabindex="-1"`); if the pitch sheet is open over it, focus moves when the
  sheet closes. Not for the filters case, where the member is typing. All passes are stored before the next load.

  | Cause | Title | Copy | Action |
  |---|---|---|---|
  | filters hide every loaded card | "No one in this deck matches these filters." | "Clear them to see everyone in your deck again." | "Clear filters" |
  | `caught_up` (also: members exist, but only far away) | "You're caught up." | "You've met your orbit for today. New people near you show up as they join. Try search to reach further." | "Search members" (opens the search box, focused) |
  | `no_members_yet` | "Your area is just opening." | "Brivia Club is new around you. Invite a friend who shares your interests." | "Invite a friend" (copies the site link, toast "Link copied") |
  | `complete_profile` | "Finish your orbit to see people near you." | "Add your area and place your 20 interest points so we can find your people." | "Finish profile" (`/auth.html?complete-profile=1`) |
  | the deck could not load | "Your deck could not load." | "Check your connection and try again." | "Try again" |

  `complete_profile` is never a dead end: `my_onboarding_status()` is read again first. Completed after all: the
  "could not load" state with "Try again". Not completed: straight to `/auth.html?complete-profile=1`. Only when the
  status cannot be read does the "Finish profile" row show.

  This replaces the earlier draft ("Widen nothing. We already did.") and the old "Come tomorrow." daily-limit state:
  the only limit left is the signal quota, which keeps the card (below).
- **Signal counter (Ruling A1, D-026, D-032).** The only signal limit is the server quota from `my_signal_quota()`; the
  old localStorage swipe limit is gone and passes are free.
  - Normal: "N signals left today".
  - At 0: "0 signals left · more at HH:MM", from `resets_at` (already rounded to the hour by the server), in the
    member's local time (Fix round 1, F2: zero is stated plainly).
  - At the live cap: "You have 100 signals waiting for an answer" (the number is `live_limit`).
  - Over a cap (`send_signal` fails with HTTP 429, `signal_quota_exhausted` or `signal_live_cap`), the card is **not**
    consumed and the member sees the honest state above. Nothing else ever fails visibly: every recipient-side outcome
    shows "Signal sent".
  - **Client (Iteration 3, Task 9).** The quota is read at boot and after every `send_signal`, held in memory only
    (never in `localStorage`), and shown in the hint line under the deck (`#swipe-left-count`, mirrored to a polite live
    region `#swipe-daily-count`). Copy comes from `signal-quota.js`.
    - When the cached quota is at a cap (`remaining` 0, or `live_unanswered` ≥ `live_limit`), a Like first reads
      `my_signal_quota()` again (the cap may have cleared); the quota is also read again whenever the tab becomes
      visible. Still capped: Like sends nothing, opens no pitch sheet and keeps the card. The toast gives the honest cap
      text ("You've used today's signals. More at HH:MM." or "You have 100 signals waiting for an answer."), and a
      compact notice `#swipe-limit-state` (eyebrow "SIGNALS", SVG clock, no live role: the counter's live region
      announces the change once) reads "No signals left today. More at HH:MM · Passing is always free." (at the live
      cap: "You have 100 signals waiting for an answer · Passing is always free."). At 1440 px it shares the hint's
      grid row, so the card never moves under the top bar. The Pitch button gets `aria-disabled="true"`,
      `aria-describedby="swipe-limit-copy"` and a muted token style; it stays focusable and a tap shows the toast.
      Passes never touch the quota.
    - **A failed signal never loses the person (F1).** Any `send_signal` error puts the card back at the front of the
      queue. A cap 429 (`PT429` or HTTP 429 with a cap message) shows the honest toast and refreshes the counter; a 429
      without a cap message also reads the quota again; any other error reads "Your signal could not be sent. They're
      back at the front so you can try again." A pitch sent with a note closes its sheet and keeps the note (in memory
      only) for the retry.
    - From the start of a swipe until the next card renders, further swipes are ignored (Pass then Like within 100 ms
      is one pass and no signal).
    - The toast reads "Signal sent" only for `status = 'sent'` (with or without a note) and "It's mutual. Say hi to …"
      only for `matched`, which also adds the chat: the mutual toast; the full match moment (§D) comes later.
    - At a cap, incoming requests can still be accepted from the notifications panel (`respond_connection_request` is
      not a signal). A like-back from the deck waits for the reset, even though the server would let a completing
      signal through.

### C. Search and Long-Range Request

- Results show the distance band and resonance %. For a person in ring ≥ 3, the primary action is **Send long-range
  request**. It opens a sheet with a required note (helper text: "Mention what you share. Notes that do get 3× more
  accepts.") and a counter "4 of 5 long-range signals left this week".
- The recipient's request card shows the note, resonance chips and distance band. Accept and Decline are equal-weight
  buttons. Declines are silent to the sender.

### D. Connections are mutual-consent

- A like shows "Signal sent". Chat opens only on a mutual like or an accepted request.
  This replaces today's immediate `saveMatches()`.
- "Signal sent" is shown for every accepted send, whatever the recipient's state (blocked, other world, duplicate,
  declined, unknown); the counter drops by exactly one each time. When `send_signal` answers `matched`, the match
  moment opens instead. Only the sender's own cap is shown as an error (see §B, Signal counter).
- The match moment shows the shared interests that made the match, and icebreakers derived from them.

#### Consent semantics

From a member's point of view (D-015..D-018):

1. **Unmatching resets the pair.** If either of you deletes the match, earlier requests between you are cleared. You can reconnect only if you both agree again.
2. **Changing your mind works.** If you declined someone and later like or request them, and they had asked you first, you match straight away. A pending request from them completes the match the same way.
3. **Blocks stay invisible.** Accepting a request from someone you have blocked (or who blocked you) shows no error and creates no match. It is quietly recorded as declined.
4. **A like opens the pitch sheet.** Nothing is sent until the sheet closes. Send delivers one request with your note. Closing it, pressing Escape, tapping outside or swiping to the next card delivers one request without a note.

## Verification (webapp-testing skill)

Use Playwright against `npm run dev`:
- the 4-step signup at 375 px and 1440 px;
- the keyboard-only pass through the passion-budget steppers;
- that geolocation denial falls back to the city picker;
- that a Worth-the-Distance card renders with its label;
- that **no network response contains another member's email, phone or coordinates**.
