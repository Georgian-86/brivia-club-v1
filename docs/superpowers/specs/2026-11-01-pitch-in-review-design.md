# Pitch in the review sheet; reply to connect; the chat starts with the pitch (design, 2026-11-01)

Status: approved in brainstorming (founder, 2026-11-01). Decision D-112. **Supersedes**
`2026-10-31-pitch-chat-design.md` (pitch as a Chat message request with Accept-to-chat-without-connecting). That
design was built on this branch (commits 8f0bacb..8d717fe), never applied live, and is reverted by this one.

## 1. Intent

**Asked (founder, 2026-11-01, with a mockup):** do not send the pitch to the chat box; show it in the review sheet
("See who wants to collaborate with you"). No Accept / Decline buttons in Chat. When accepted, the chat starts with the
pitch. The review sheet must look as finished as the rest of the app, with the burgundy gradient.

**Brainstorming answers (founder, 2026-11-01):**
- Accepting connects (there is no chat-without-connection state any more).
- (a) A right swipe with no message also connects; the chat then starts with just their pitch.
- (b) A left swipe is a quiet decline (as today, D-108).

**Mockup (founder):** full-sheet burgundy gradient; a soft blush card with photo, name, "Brivia member · City",
"YOU BOTH CARE ABOUT" chips, "1 of 5" counter; under it a pill field "Add a message to connect…" with a send arrow,
helper line "Add a personal note to introduce yourself and why you'd like to collaborate.", and paging dots.

**Success:** the receiver reads the pitch on the review card; sending a reply (or swiping right) connects them; the
chat opens with the sender's pitch as the first message, followed by the receiver's reply if they wrote one; a left
swipe declines quietly; the sheet matches the mockup and the app's deep-wine brand.

## 2. Consent and rules

Unchanged: a connection exists only after both agree (the sender's pitch is their like; the receiver's reply or right
swipe is theirs). Rulings P10-P13 and D-108 / D-111 hold. Nobody can message before the connection exists, so the
CLAUDE.md consent rule needs no change.

## 3. Server: `supabase/migrations/0019_pitch_seed.sql`

The superseded `0019_pitch_chat.sql` is removed (revert). The new 0019 (0001-0018 frozen; copy-from-latest rule):

1. **Dependency guard:** raise if 0013 is not applied (`brivia_private.brivia_message_visible` missing), since the
   seeded messages rely on its select policy.
2. **`brivia_create_match(first_user, second_user)`** (latest 0002:119) becomes plpgsql: when it actually inserts the
   match row, it also inserts one `brivia_messages` row per request between the pair, either direction, whose
   `nullif(btrim(note), '') is not null` and whose status is `pending` or `accepted`: `sender_id = from_id`,
   `recipient_id = to_id`, `body = note`, `message_type = 'text'`, `created_at = request.created_at` (so the pitch
   sorts first). No row when the match already existed. Every match path goes through this function (review-sheet
   Connect via `respond_connection_request`, like-back via the completion trigger), so all of them seed.
3. **`report_member`** (latest 0008:418): the evidence also includes the pair's request notes as `kind = 'pitch'`, so
   a report about a pitch that never became a message keeps it (arena F-3).
4. `supabase/migrations/README.md` gains a `## 0019` section (apply after 0013-0018; verify query).

## 4. Client

- **Review card (`site/scripts/collab-requests.js`, `site/styles/collab-requests.css`):** the mockup's layout.
  The pitch is a quote block on the card ("Their note" label kept for screen readers) when there is one. Under the card:
  the reply field ("Add a message to connect…", 16 px input on phones, max 500 characters) with a send button
  (aria-label "Send and connect"), the helper line, and the paging dots (decorative; the "1 of N" counter stays the
  accessible position). Not now / Connect remain as a quiet text row under the helper ("Not now" · "Connect without a
  note") so keyboard and screen-reader users have both actions; drag and ArrowLeft / ArrowRight work as today (arrow
  keys are ignored while the field has focus).
- **Send:** `respond_connection_request(from, true)`; only when the result is a real connection, the reply is inserted
  as a normal message from the receiver; then the connected state shows "You're connected." with "Message <first
  name>", which opens the chat (pitch, then reply). If the reply insert fails, the connection stands and the toast says
  "You're connected, but your message didn't send." and the text is kept in the chat composer. A blocked pair
  (accept silently declined, P12) sends nothing and moves on silently.
- **Look:** burgundy gradient on the sheet backdrop and panel (tokens in `site/styles/tokens.css`; a new
  `--gradient-burgundy` token if none exists), blush card, wine primary send button, Bodoni Moda name, Instrument Sans
  body, 12 px floor, 44 px targets, focus-visible rings, reduced-motion respected.
- Chat itself is unchanged apart from showing the seeded pitch as the first message (it is an ordinary message).

## 5. Testing

- **SQL** `supabase/tests/i-pitch-seed.test.sql`: Connect seeds the pitch with the request's time as the first message;
  a no-note request seeds nothing; a whitespace note seeds nothing; like-back (both pitched) seeds both notes in time
  order; an existing match seeds nothing again; a blocked accept creates no match and no message; both members can read
  the seeded message, a third member cannot; `report_member` evidence includes `kind = 'pitch'`; the guard raises
  without 0013.
- **Unit** `tests/unit/collab-requests.test.mjs` for the new markup (pitch quote, reply field, dots, escaping).
- **e2e** `tests/e2e/collab-requests.spec.mjs` updated: reply-and-send connects and posts the message once; right swipe
  connects with no message; left swipe declines; arrow keys ignored while typing; reply failure toast; blocked pair;
  axe at 1440 and 390; screenshots for the founder. Re-run consent, chat-inbox, chat-extras, app-shell.

## 6. Docs

DECISIONS D-112 (this design, noting the superseded one and the arena outcome), HANDOFF, migrations README,
`docs/MODERATION.md` line on pitch evidence. CLAUDE.md unchanged. ORBIT unchanged.
