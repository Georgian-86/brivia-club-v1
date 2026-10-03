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

### A. Onboarding: replace the free-text City/State and add "Your orbit"

The current signup is 3 steps. It becomes **4 steps**:

1. **The basics:** name, email, phone. City/State text inputs are **replaced** by step 2.
2. **Your area (new):** "Where do you spend most weeks?" Two options:
   - **Use my location** (browser geolocation). Ask in context, after the explanation "We only keep a ~5 km area.
     Nobody ever sees where you are." The coordinates are snapped to the coarse cell **on the server** and discarded.
   - **Pick my city:** searchable city list, which uses the city centroid.
   - Denying geolocation is never a dead end, because it falls back to "Pick my city".
3. **Your signals (reworked):** pick up to 12 interests from the taxonomy (searchable chips, grouped by category),
   then spread **20 passion points**:
   - each chosen interest has a −/+ stepper (tap-friendly and keyboard-operable; no slider-only control);
   - a live counter reads "14 of 20 points left", announced via `aria-live="polite"`;
   - a mode toggle per interest: *Learn · Play · Teach · Build* (a segmented control with visible labels);
   - you can't continue until all 20 points are placed. The error appears beside the counter.
4. **Security and presence:** unchanged (password, photo, cover).

### B. Discover deck (`app.html` swipe card)

- The card location line shows the **distance band** ("~3 km", "Mumbai", "Abroad"), never the city of a ring 0–1 person's home cell beyond "~N km".
- The card adds a **resonance line** with the match % (resonance, not the ranking score) and up to 3 evidence chips
  (see `ORBIT_ENGINE.md §6.3`).
- **Worth-the-Distance card:** the same card with a wine-gradient top band reading "WORTH THE DISTANCE · 91%
  RESONANCE" and one extra chip explaining why. Max 2 a day.
- Deck empty state: "You've met your orbit for today." The next action depends on the cause. If the area is sparse,
  "Widen nothing. We already did. Try search." If the daily limit is hit, keep the existing "Come tomorrow." state.
- **Signal counter (Ruling A1, D-026, D-032).** The only signal limit is the server quota from `my_signal_quota()`; the
  old localStorage swipe limit is gone and passes are free.
  - Normal: "N signals left today".
  - At 0: "More at HH:MM", from `resets_at` (already rounded to the hour by the server), in the member's local time.
  - At the live cap: "You have 100 signals waiting for an answer" (the number is `live_limit`).
  - Over a cap (`send_signal` fails with HTTP 429, `signal_quota_exhausted` or `signal_live_cap`), the card is **not**
    consumed and the member sees the honest state above. Nothing else ever fails visibly: every recipient-side outcome
    shows "Signal sent".

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
