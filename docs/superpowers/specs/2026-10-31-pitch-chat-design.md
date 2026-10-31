> Superseded by 2026-11-01-pitch-in-review

# Pitch in chat: accept to chat, swipe right to connect (design, 2026-10-31)

Status: approved in brainstorming (founder, 2026-10-31); spec awaiting founder review. Decision number: D-112.

## 1. Intent

**Asked (founder):** a pitch should reach the receiver in the chat box, not only as a notification. Neither person
can chat until the receiver accepts the pitch. Accepting opens chat but does **not** connect them; they are connected
only when the receiver right-swipes the sender.

**Brainstorming answers:**
- Q1 = A: the right swipe that connects is the existing "See who wants to collaborate with you" review sheet (D-108).
  Its Connect / right drag / ArrowRight stays `respond_connection_request(true)` and creates the match.
- Q2 = A: the chat request and the review card are independent except that a decline anywhere closes it everywhere.
  Accept in Chat opens chat and leaves the card in the sheet. Connect in the sheet connects and opens chat. Not now in
  the sheet, or Decline / End chat in Chat, removes the pitch from both, ends any open chat, and the sender is never told.
- Q3 = A: accepting in Chat stops the 30-day expiry clock. The chat stays open until Connect, Not now, End chat by
  either person, or a block. Sending caps are unchanged (they count pitches sent, `signal_ledger`).

**Assumptions stated and not objected to:** the sender sees their own pitch in Chat with a waiting state and cannot
type until it is accepted; a decline is invisible to the sender (same as today); blocks, the test-world split and the
quotas all still apply. A like sent **without** a note has nothing to show in Chat and stays in the review sheet only.

**Success:** a pitch with a note appears in the receiver's Chat as a message request; nobody can send a message on it
until the receiver taps Accept; after Accept both can chat while the pair is still not a connection; Connect in the
review sheet makes them a connection; a decline anywhere ends it silently for the sender.

## 2. Model change and consent

Today "allowed to chat" = "connected" (a `matches` row; `brivia_can_send` / `brivia_can_message`). This design
splits them:

| State | Connected (`matches`) | Can chat |
|---|---|---|
| Pitch sent, not answered | no | no (sender sees "Waiting for them to accept") |
| Receiver tapped Accept in Chat | no | yes |
| Receiver tapped Connect in the sheet (any time) | yes | yes |
| Not now / Decline / End chat / expired / blocked | no | no |

Consent: chat opens only on the receiver's explicit Accept; a connection still requires mutual agreement (the
sender's pitch is their like; the receiver's Connect is theirs). `CLAUDE.md`'s rule is amended to say so. Every
existing ruling holds: P10 (deleting a match clears the pair's requests), P11, P12 (a block on accept is silent),
P13 / D-018 (exactly one request per like, note travels with it).

## 3. Data and server: `supabase/migrations/0019_pitch_chat.sql`

0001-0018 are frozen; every redefinition is copied from the latest live definition and only gains the clause named
beside it (the 0013 convention). Idempotent (the harness applies migrations twice).

1. **Column:** `connection_requests.chat_accepted_at timestamptz null`. Clients cannot write it (the table grants
   stay select + insert; the insert policy forces it null, or a before-insert trigger nulls it).
2. **Liveness:** a three-argument `brivia_request_is_live(status, created_at, chat_accepted_at)`: live when
   `status = 'accepted'`, or `status = 'pending' and chat_accepted_at is not null`, or `created_at > now() - 30 days`.
   Every caller of the two-argument version that reads `connection_requests` (select policy, `send_signal`'s dead-row
   clearing, completion, `respond_connection_request`, `my_outgoing_requests`, `purge_expired_requests`) moves to the
   three-argument form, so a chat-open request is never expired, purged or overwritten.
3. **`accept_pitch_chat(p_from uuid) returns void`** (security definer, authenticated, completed caller):
   pair lock; requires a live pending request `p_from -> me` with a non-blank note, both completed, same world, else
   P0002 (`no_data_found`), like `respond_connection_request`. On a blocked pair it writes nothing and returns
   normally (P12: never reveal a block). Otherwise sets `chat_accepted_at = now()` (idempotent).
4. **`end_pitch_chat(p_other uuid) returns void`:** ends a live pending request with a note between the pair (pair
   not matched). The receiver may call it before or after Accept (this is Decline); the sender only once chat is open
   (End chat). Sets that request `status = 'declined'` (the sender's view already shows declined as pending, so the
   sender learns nothing beyond the chat closing). P0002 when there is nothing to end.
5. **`brivia_can_send` / `brivia_can_message`:** gain `or exists (live pending request between auth.uid() and
   p_recipient, either direction, with chat_accepted_at not null)`. The world clause stays; `brivia_can_message`
   keeps its block clause and `brivia_can_send` keeps none (0013: a blocked sender's messages are stored and
   withheld). The message insert / select policies, attachments and the typing channel (0012) all go through these
   two functions, so they follow automatically.
6. **`my_pitch_threads()`** returns `(other_id, direction 'in'|'out', note, created_at, chat_open boolean)`:
   - incoming: live pending requests to me with a non-blank note, not blocked, same world, completed sender;
   - outgoing: my requests with a note that read as pending to me (`declined` shown as pending with
     `chat_open = false`, exactly as `my_outgoing_requests` hides it), excluding matched pairs.
7. **Unchanged:** `respond_connection_request` (Connect -> match; Not now -> declined, which closes chat by rule 5),
   `send_signal`, the quotas, `deck_candidates`, ORBIT. Match deletion still clears requests (P10), which also ends a
   chat-only state.
8. Messages sent in the chat-only phase stay in `brivia_messages`. Once the chat closes, neither side can send; reading
   history follows the select policy (participants, same world, not withheld), the same as for a deleted match today.

## 4. Client

- **New `site/scripts/pitch-chat.js`** (pure, unit-tested): `pitchThreadModel(row, person)` and the copy:
  "Message request", "Not connected yet", "Waiting for them to accept", "Accept", "Decline", "End chat".
- **`app.js`:** loads `my_pitch_threads` with the chat list; merges them into the inbox:
  - **Receiver:** a "Message requests" group at the top of the list (unread dot until opened). The thread shows the
    pitch as their first bubble, a quiet "Not connected yet" line and Accept / Decline instead of the composer.
    Accept -> `accept_pitch_chat`, composer appears. Decline -> `end_pitch_chat`, the thread and its review card leave.
  - **Sender:** the pitch as their own bubble, "Waiting for them to accept", composer disabled; becomes live once
    `chat_open` turns true (on the next refresh / focus, the same cadence as `refreshConnections`).
  - **Chat open, not connected:** a "Not connected" tag in the thread head and "End chat" in its ⋯ menu.
    After Connect (sheet or a later like-back match) the tag goes and the thread becomes a normal connection.
  - The review sheet and notification panel are unchanged; Not now there also drops the chat thread locally.
- **Fallback before 0019:** a missing `my_pitch_threads` (PGRST202 / 404) leaves Chat as today; the pitch stays in
  the sheet only.
- **Errors:** P0002 -> "That request is no longer open." and the thread leaves (D-111). Other failures toast
  "That request could not be updated. Please try again." and keep the state.
- UX: deep-wine brand (`docs/UX_SPEC.md`), 44 px targets, 12 px floor, professional wording (collaborate, connect,
  request; never dating words), screen readers hear ", message request" on the row.

## 5. Testing

- **SQL** `supabase/tests/i-pitch-chat.test.sql`: no send before Accept; send both ways after; Accept on a no-note
  request is P0002; Decline / End chat / Not now close chat; Connect keeps chat and creates the match; blocked pair:
  Accept is silent and chat stays closed; cross-world refused; a 31-day-old chat-open request is still live and not
  purged; the sender's `my_outgoing_requests` / `my_pitch_threads` cannot tell declined from pending; clients cannot
  set `chat_accepted_at`. Definer allowlist updated. `bash supabase/tests/run.sh` ALL PASSED.
- **Unit** `tests/unit/pitch-chat.test.mjs`.
- **e2e** `tests/e2e/pitch-chat.spec.mjs` (stubbed Supabase, 1440 and 390 px, axe): receiver request, Accept,
  Decline, sender waiting, "Not connected" tag, End chat, fallback before 0019. Re-run consent, collab-requests,
  chat-inbox, chat-extras, app-shell.

## 6. Docs and rollout

- `docs/DECISIONS.md` D-112; `CLAUDE.md` consent rule amended; `docs/HANDOFF.md`; `supabase/migrations/README.md`
  (0019 after 0017 and 0018; client can ship first thanks to the fallback); privacy notice line if it describes who
  can message you. `docs/ORBIT_ENGINE.md` unaffected (no ranking change).
- agent-arena review of the consent/privacy change before 0019 is applied live (CLAUDE.md rule).

## 7. Out of scope

Likes without a note in Chat; sender-side withdrawal of a pitch; any change to the deck, ORBIT, or the review sheet's
look.
