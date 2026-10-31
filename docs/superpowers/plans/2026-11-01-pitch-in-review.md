# Pitch in Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the pitch on the review card, connect by replying or swiping right, start the chat with the pitch, and
restyle the review sheet to the founder's burgundy mockup.

**Architecture:** Revert the superseded chat-request build. A new 0019 makes `brivia_create_match` seed the pair's
pitch notes as the first messages, so every match path starts the chat with the pitch. The review sheet gains the reply
field; the client connects first, then sends the reply as an ordinary message.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), vanilla JS (Vite), node:test, Playwright e2e (stubbed Supabase).

**Spec:** `docs/superpowers/specs/2026-11-01-pitch-in-review-design.md`

## Global Constraints

- 0001-0018 frozen. New server work only in `supabase/migrations/0019_pitch_seed.sql` (`set lock_timeout = '5s';`,
  idempotent, `-- copied from <file>:<line>; only <change>` on every redefinition, copied from the latest definition).
- Copy (exact): "Add a message to connect…", "Add a personal note to introduce yourself and why you'd like to
  collaborate.", "Send and connect" (aria-label), "Not now", "Connect without a note", "Their note",
  "You're connected.", "You're connected, but your message didn't send.". Professional wording; never dating words.
- Brand: deep-wine tokens (`site/styles/tokens.css`), burgundy gradient, Bodoni Moda headings, Instrument Sans body,
  12 px floor, 44 px targets, axe clean at 1440 and 390, `npm run check:styles` passes (no new hex outside tokens.css).
- Blocks never revealed (P12). Exactly one connect RPC and at most one reply insert per decision.
- Commits end with the single line `Claude-Session: https://claude.ai/code/session_015byVS4tA1r5HBvnPnEX2rZ`.

## Review Focus

1. **Typing then swiping or pressing an arrow key:** arrow keys inside the reply field move the caret, never decide;
   a drag that starts on the field does not swipe. Test in Task 3.
2. **Send twice fast / Enter then click:** one `respond_connection_request`, one message. Test in Task 3.
3. **Blocked pair replies:** no message insert, no error toast, sheet moves on. Test in Task 3.
4. **Both members pitched each other with notes, then a like-back match:** both notes seeded in time order. Test in Task 2.
5. **A hostile note or name** (`<img src=x onerror=1>`) on the card and in the chat bubble: escaped. Tests in Task 3.

---

### Task 1: Revert the superseded chat-request build

**Files:** revert commits `8f0bacb 8029cf2 f25489f 5feb90d 61fb755 8d717fe` (0019_pitch_chat.sql, i-pitch-chat.test.sql,
orbit-hygiene allowlist lines, pitch-chat.js, its unit test, app.js / CSS / app-stub / pitch-chat.spec.mjs changes).
Keep the docs. Mark `docs/superpowers/specs/2026-10-31-pitch-chat-design.md` and
`docs/superpowers/plans/2026-10-31-pitch-chat.md` with a first-line note "Superseded by 2026-11-01-pitch-in-review".

- [ ] **Step 1:** `git revert --no-edit 8d717fe 61fb755 5feb90d f25489f 8029cf2 8f0bacb` (newest first), or one
  combined revert commit; resolve nothing by hand beyond what git reports.
- [ ] **Step 2:** verify the tree matches `826fe6f` outside `docs/`: `git diff --stat 826fe6f -- . ':!docs'` is empty.
- [ ] **Step 3:** run `bash supabase/tests/run.sh` (ALL PASSED) and `npm run test:unit` (375 or the base count).
- [ ] **Step 4:** add the two superseded notes, commit `revert: drop pitch-as-chat-request build (superseded, D-112)`.

### Task 2: 0019 seeds the pitch as the first message

**Files:** Create `supabase/migrations/0019_pitch_seed.sql`, `supabase/tests/i-pitch-seed.test.sql`; Modify
`supabase/migrations/README.md`, the definer allowlist test if `brivia_create_match` changes its definer status.

**Interfaces:** Produces `public.brivia_create_match(first_user uuid, second_user uuid) returns void` (same signature,
plpgsql, seeds per spec §3.2); `public.report_member` evidence with `kind = 'pitch'` rows (spec §3.3).

- [ ] **Step 1: failing tests** (ids `0d190000-…-0000000000NN`), as in `h-member-presence.test.sql`:
  - **S1** B Connects to A's pitch "Hi there" (created 2 h ago): one message A→B, body "Hi there", `created_at` equal
    to the request's; readable by A and B, not by C.
  - **S2** no-note and `'   '`-note requests: Connect seeds nothing.
  - **S3** A pitches B ("first", earlier), B pitches A ("second") → match by like-back: two messages, in time order.
  - **S4** calling `brivia_create_match` again for an existing pair inserts nothing.
  - **S5** blocked pair: Connect creates no match and no message.
  - **S6** `report_member` by B on A after A's pitch (not connected): evidence contains a `kind = 'pitch'` entry with
    the note.
  - **S7** the guard: the 0019 text contains the 0013 check (assert the function exists after migrations; document
    the raise path in a comment; no destructive test).
- [ ] **Step 2:** `bash supabase/tests/run.sh` → FAIL in i-pitch-seed.
- [ ] **Step 3:** implement 0019 per spec §3 (guard, `brivia_create_match` copied from 0002:119, `report_member`
  copied from its latest definition — confirm with grep — README section).
- [ ] **Step 4:** `bash supabase/tests/run.sh` → ALL PASSED. Also `trust.test.sql`, `p0b-report.test.sql` unchanged-pass.
- [ ] **Step 5:** commit `feat(sql): 0019 seeds the pitch as the first chat message on connect (D-112)`.

### Task 3: The review sheet: pitch, reply to connect, burgundy redesign

**Files:** Modify `site/scripts/collab-requests.js`, `site/styles/collab-requests.css`, `site/styles/tokens.css`
(gradient token if missing), `site/scripts/app.js` (`openCollabReview` call ~1465, `respondToRequest` ~1281);
Tests `tests/unit/collab-requests.test.mjs`, `tests/e2e/collab-requests.spec.mjs` (and `app-stub.mjs` if a route is
missing).

**Interfaces:** `openCollabReview({ requests, respond, sendReply, onMessage, onClose, myInterests, escapeHtml,
renderAvatar })` where `sendReply(fromId, text) -> Promise<{ ok: boolean }>` inserts one message to that member;
`respond` unchanged (`{ ok, connected }`). `reviewCardMarkup` renders the pitch quote; a new
`reviewComposerMarkup(m, { index, total }, { escapeHtml })` renders the field, send button, helper, text actions, dots.

- [ ] **Step 1: failing unit tests:** pitch quote present only with a note and escaped; composer has the exact
  placeholder, helper, aria-label "Send and connect", "Not now", "Connect without a note"; dots count equals total with
  the current one marked `aria-current`-free decorative (`aria-hidden="true"`); hostile name escaped.
- [ ] **Step 2: failing e2e** (1440 and 390, axe): Review Focus 1-3 and 5; reply + send → one respond, one message
  insert with the typed text, connected state, Message opens chat; Enter in the field sends; right swipe connects with
  no insert; left swipe and "Not now" decline; reply insert 500 → toast "You're connected, but your message didn't
  send." and the chat composer holds the text when opened; screenshots via `COLLAB_SHOTS=<dir>`.
- [ ] **Step 3:** implement the markup, CSS (mockup layout, gradient backdrop and panel, blush card, wine send button,
  reduced motion), and the app.js wiring (`sendReply` uses the existing `insertChatMessage` path for that person).
- [ ] **Step 4:** run unit, the updated spec, and re-run consent, chat-inbox, chat-extras, app-shell; `npm run build`;
  `npm run check:styles`.
- [ ] **Step 5:** commit `feat(requests): pitch on the review card, reply to connect, burgundy sheet (D-112)`.

### Task 4: Docs

**Files:** `docs/DECISIONS.md` (append D-112: final design, the superseded design and why, the arena outcome with
`docs/arena/2026-11-01-pitch.md` written from `.superpowers/sdd/2026-10-31-pitch-chat/arena/judge.md`), `docs/HANDOFF.md`
(0019 owed, after 0017 and 0018), `docs/MODERATION.md` (pitch evidence line).

- [ ] **Step 1:** write the docs; no code.
- [ ] **Step 2:** final verification: SQL harness, unit, `cd orbit && npm test`, build, the Task 3 e2e list.
- [ ] **Step 3:** commit `docs: D-112 pitch in review, handoff, moderation`.
