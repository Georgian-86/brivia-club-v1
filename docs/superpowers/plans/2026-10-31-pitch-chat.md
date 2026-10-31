# Pitch in Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pitch (a like with a note) reaches the receiver's Chat as a message request; Accept opens chat without
connecting; Connect in the review sheet (D-108) connects; a decline anywhere closes it silently.

**Architecture:** One nullable column, `connection_requests.chat_accepted_at`, marks a pitch whose chat is open. The
two chat gates (`brivia_can_send`, `brivia_can_message`) also allow a pair with a live, pending, chat-open request, so
the message policies, attachments and typing follow unchanged. Liveness gains a three-argument form that never expires
a chat-open request. The client reads `my_pitch_threads()` and merges those threads into the existing inbox.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), vanilla JS (Vite), node:test, Playwright e2e with the stubbed
Supabase (`tests/e2e/app-stub.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-31-pitch-chat-design.md` (read it first; this plan argues from it).

## Global Constraints

- 0001-0018 are frozen: never edit them. Everything server-side goes in `supabase/migrations/0019_pitch_chat.sql`,
  starting with `set lock_timeout = '5s';` and a header like 0013's. Idempotent (the harness applies it twice).
- Every redefinition is copied from the **latest** definition (find it with
  `grep -ln "function public.<name>(" supabase/migrations/*.sql | tail -1`) and only gains the clause named beside it,
  with a `-- copied from <file>:<line>; only <change>` comment (0013 convention).
- New functions: `security definer`, `set search_path = public`, `revoke all ... from public, anon`,
  `grant execute ... to authenticated`; completed caller required (`brivia_member_completed(auth.uid())`, else 22023).
- "No longer open" is `raise exception 'no pending connection request' using errcode = 'no_data_found'` (P0002).
- Blocks are never revealed (Ruling P12): a blocked pair gets the same success response, and nothing opens.
- Copy (exact): "Message requests", "Message request", "Not connected yet", "Waiting for them to accept",
  "Accept", "Decline", "End chat", "Not connected", "That request is no longer open.",
  "That request could not be updated. Please try again.". Never dating words (match, date, crush, like you).
- Location privacy unchanged: no coordinates, no email or phone in any new response.
- UX: deep-wine tokens from `site/styles/tokens.css`, 44 px targets, 12 px type floor, axe clean at 1440 and 390 px.
- Commits end with the single line `Claude-Session: https://claude.ai/code/session_015byVS4tA1r5HBvnPnEX2rZ`
  (HANDOFF rule: no `Co-Authored-By`). Branch `claude/magical-ptolemy-rbjrw2`.

## Review Focus

1. **The sender pitches the same person again while the chat is open** (`send_signal` on an existing live row): the
   row, its note and `chat_accepted_at` must not change, and no second thread appears. Test in Task 1 (L6).
2. **The receiver likes the sender back from their own deck while the chat is open**: the match completes (P11
   pending path) and the chat carries on as a connection. Test in Task 2 (C8); client in Task 4.
3. **A whitespace-only note** (`'   '`): not a pitch; Accept is P0002 and `my_pitch_threads` leaves it out. Test in
   Task 2 (C2).
4. **The connection is later deleted** (P10 clears the pair's requests): chat closes both ways and no pitch thread
   comes back. Test in Task 2 (C9).
5. **The other member's profile cannot load** (deleted, not completed, or a failed `get_candidates`): the thread still
   renders as "A Brivia member" with working Accept / Decline, never a broken row. Test in Task 3 (unit) and Task 4.

---

### Task 1: The column and liveness that never expires a chat-open pitch

**Files:**
- Create: `supabase/migrations/0019_pitch_chat.sql` (section 1)
- Create: `supabase/tests/i-pitch-chat.test.sql` (L-tests)

**Interfaces:**
- Produces: column `public.connection_requests.chat_accepted_at timestamptz null`;
  `public.brivia_request_is_live(p_status text, p_created_at timestamptz, p_chat_accepted_at timestamptz) returns boolean`
  (stable, `true` when `p_status = 'accepted'`, or `p_status = 'pending' and p_chat_accepted_at is not null`, or
  `p_created_at > now() - interval '30 days'`). The two-argument form stays defined (frozen migrations call it) but
  no **latest** definition reads `connection_requests` through it.

- [ ] **Step 1: Write the failing SQL tests** in `supabase/tests/i-pitch-chat.test.sql`, same shape as
  `h-member-presence.test.sql` (ids `0d190000-0000-4000-8000-0000000000NN`: 01 A sender, 02 B receiver, 03 C third,
  04 D blocked by B, 05 T tester). Header comment lists every test id. Tests:
  - **L1** `chat_accepted_at` exists, nullable, and `authenticated` cannot insert a row with it set (the insert either
    fails or stores null; assert the stored value is null).
  - **L2** a pending request 31 days old with `chat_accepted_at` set: visible to B through the select policy, still in
    the table after `purge_expired_requests()`, and B's `respond_connection_request(A, true)` creates the match.
  - **L3** a pending request 31 days old without `chat_accepted_at`: hidden, purged (today's behaviour holds).
  - **L4** A's `my_outgoing_requests()` lists the 31-day chat-open request; `deck_candidates` for A does not offer B.
  - **L5** guard: no latest function source and no policy reads requests through the two-argument form:
    ```sql
    select count(*) from pg_proc where prosrc ~ 'brivia_request_is_live\(\s*[a-z_.]*status\s*,\s*[a-z_.]*created_at\s*\)'
    -- must be 0; same regex over pg_policies.qual and with_check must be 0
    ```
  - **L6** A calls `send_signal(B, 'again')` while the request is chat-open: answer status `'sent'`, the row's note and
    `chat_accepted_at` unchanged.
- [ ] **Step 2: Run** `bash supabase/tests/run.sh` — expected: FAIL in `i-pitch-chat.test.sql` (column missing).
- [ ] **Step 3: Implement section 1 of 0019**: `alter table ... add column if not exists chat_accepted_at`; a
  before-insert trigger `brivia_requests_chat_null` that sets `new.chat_accepted_at := null` (clients only insert);
  the three-argument function; then redefine every latest caller to pass `chat_accepted_at`. Find them with
  `grep -n "brivia_request_is_live(" supabase/migrations/*.sql` and keep only each object's latest file. Expected set:
  `brivia_on_connection_request` (0003 or later), `respond_connection_request` (0008), `send_signal` (0008),
  `my_outgoing_requests` (0008), `deck_candidates` (0008), `purge_expired_requests` (0005), the policy "Members can view
  their connection requests" (0006), and any other object L5 still reports. L5 is the source of truth.
- [ ] **Step 4: Run** `bash supabase/tests/run.sh` — expected: `ALL PASSED`.
- [ ] **Step 5: Commit** `feat(sql): 0019 part 1, chat_accepted_at and liveness that keeps an open pitch chat (D-112)`.

### Task 2: Accept, end, the chat gates, and the thread list

**Files:**
- Modify: `supabase/migrations/0019_pitch_chat.sql` (section 2)
- Modify: `supabase/tests/i-pitch-chat.test.sql` (C-tests); any definer allowlist test that enumerates
  `security definer` functions (`grep -ln "prosecdef" supabase/tests/*.sql`) gains the three new names.

**Interfaces:**
- Consumes: Task 1's column and three-argument liveness.
- Produces (all `security definer`, authenticated only):
  - `public.accept_pitch_chat(p_from uuid) returns void`
  - `public.end_pitch_chat(p_other uuid) returns void`
  - `public.my_pitch_threads() returns table (other_id uuid, direction text, note text, created_at timestamptz, chat_open boolean)`
    (`direction` is `'in'` or `'out'`)
  - `brivia_private.brivia_can_send(uuid)` and `brivia_private.brivia_can_message(uuid)` redefined (latest: 0013 and
    0008), each gaining `or exists (pending, live, chat_accepted_at not null request between auth.uid() and p_recipient, either direction)`
    inside the matched clause; world clause kept; `brivia_can_message` keeps its block clause, `brivia_can_send` none.

- [ ] **Step 1: Write the failing tests** (as B unless named):
  - **C1** before Accept: neither A nor B can insert into `brivia_messages` (42501).
  - **C2** `accept_pitch_chat(A)` on a note of `'   '` or null: P0002. On a real note: succeeds; a second call also
    succeeds (idempotent).
  - **C3** after Accept: A→B and B→A inserts succeed; both can select them; the pair is **not** in `matches`.
  - **C4** `end_pitch_chat(A)` by B before Accept and, in a fresh fixture, by A after Accept: request `declined`; both
    inserts now 42501; A's `my_outgoing_requests()` still shows `pending` (cannot tell); A's `my_pitch_threads()` shows
    the row with `chat_open = false`. A calling `end_pitch_chat(B)` before Accept: P0002.
  - **C5** `respond_connection_request(A, false)` after Accept closes chat (42501 on insert).
  - **C6** blocked pair (D pitches B, B blocked D): `accept_pitch_chat(D)` returns normally, `chat_accepted_at` stays
    null, D's insert is stored and withheld per 0013 or refused (assert B cannot read it).
  - **C7** tester T pitches a real member across worlds: `accept_pitch_chat(T)` is P0002; `my_pitch_threads()` omits it.
  - **C8** after Accept, B `send_signal(A, null)`: status `'matched'`; messages still flow; `my_pitch_threads()` omits
    the pair (matched pairs are left out).
  - **C9** after C8, delete the match: both inserts 42501; neither `my_pitch_threads()` lists the pair.
  - **C10** `my_pitch_threads()` returns no `email`, `phone`, coordinate or `city` column; result signature is exactly
    `TABLE(other_id uuid, direction text, note text, created_at timestamptz, chat_open boolean)`; anon cannot execute
    any of the three.
- [ ] **Step 2: Run** `bash supabase/tests/run.sh` — expected: FAIL (functions missing).
- [ ] **Step 3: Implement section 2** per spec §3 items 3-6. Use `brivia_lock_pair` in accept and end, as
  `respond_connection_request` does. `my_pitch_threads` incoming rows reuse the visibility rule of the request select
  policy (`brivia_incoming_request_visible`); outgoing rows reuse `my_outgoing_requests`' declined-as-pending rule and
  report `chat_open = (status = 'pending' and chat_accepted_at is not null)`; both exclude matched pairs and
  blank notes (`nullif(btrim(note), '') is not null`).
- [ ] **Step 4: Run** `bash supabase/tests/run.sh` — expected: `ALL PASSED`.
- [ ] **Step 5: Commit** `feat(sql): 0019 part 2, accept_pitch_chat, end_pitch_chat, my_pitch_threads, chat gates (D-112)`.

### Task 3: The pitch thread model (pure)

**Files:**
- Create: `site/scripts/pitch-chat.js`
- Test: `tests/unit/pitch-chat.test.mjs`

**Interfaces:**
- Produces:
  - `pitchThreadModel(row, person) -> { otherId, direction, note, createdAt, chatOpen, name, state }` where `row` is a
    `my_pitch_threads` row in client shape `{ otherId, direction, note, createdAt, chatOpen }`, `person` may be null,
    `name` falls back to `'A Brivia member'`, and `state` is one of `'request'` (in, closed), `'waiting'` (out, closed),
    `'open'` (either, open).
  - `pitchRowsFromRpc(data) -> row[]` (snake_case to the client shape; drops rows without `other_id` or a blank note).
  - `PITCH_COPY` (the exact strings in Global Constraints).
  - `pitchThreadMarkup(model, { escapeHtml }) -> string`: the request banner for `'request'` (pitch bubble on the
    left, "Not connected yet", Accept and Decline buttons with `data-pitch-action="accept|decline"`), the waiting line
    for `'waiting'` (own bubble on the right, "Waiting for them to accept"), and for `'open'` the pitch bubble only.

- [ ] **Step 1: Write failing tests:** the three states; null person → "A Brivia member" (Review Focus 5); blank and
  missing notes dropped by `pitchRowsFromRpc`; a note containing `<img src=x onerror=1>` is escaped in the markup;
  Accept / Decline buttons exist only for `'request'`; no string contains a dating word.
- [ ] **Step 2: Run** `npm run test:unit` — expected: FAIL (module missing).
- [ ] **Step 3: Implement** `site/scripts/pitch-chat.js` (no DOM access; markup strings only, like `collab-requests.js`).
- [ ] **Step 4: Run** `npm run test:unit` — expected: all pass (count rises from 375).
- [ ] **Step 5: Commit** `feat(chat): pitch thread model and copy (D-112)`.

### Task 4: Pitch threads in the inbox and the thread view

**Files:**
- Modify: `site/scripts/app.js` (state near `remoteMatchIds` :99; `renderChats` :1783; `openChat` :1965; chat submit
  :4559; `respondToRequest` :1281; sign-in load :4720-4750)
- Modify: `site/styles/` (the chat stylesheet that styles `.chat-row`; find with `grep -ln "chat-row" site/styles`)
- Modify: `tests/e2e/app-stub.mjs` (state keys `pitchThreads`, documented in the header comment; routes
  `rpc/my_pitch_threads`, `rpc/accept_pitch_chat`, `rpc/end_pitch_chat`)
- Create: `tests/e2e/pitch-chat.spec.mjs`

**Interfaces:**
- Consumes: Task 2's RPCs; Task 3's `pitchRowsFromRpc`, `pitchThreadModel`, `pitchThreadMarkup`, `PITCH_COPY`.
- Produces (module state in app.js): `pitchThreads` (Map of otherId → row), `loadPitchThreads()`,
  `pitchThreadsAvailable` (false after a PGRST202 / 404, so the client behaves as before 0019).

- [ ] **Step 1: Write the failing e2e spec** `tests/e2e/pitch-chat.spec.mjs` (pattern of `collab-requests.spec.mjs`),
  at 1440 and 390 px:
  - an incoming pitch shows under a "Message requests" heading in the inbox, row label ends ", message request";
  - opening it shows the pitch bubble, "Not connected yet", Accept and Decline, and no enabled composer;
  - Accept calls `rpc/accept_pitch_chat` once (double click still once), then the composer is enabled and the head
    shows "Not connected"; sending posts to `brivia_messages`;
  - Decline calls `rpc/end_pitch_chat`, the row leaves, and the review sheet no longer lists that request;
  - an outgoing pitch shows the own bubble and "Waiting for them to accept" with the composer disabled;
  - "End chat" in the thread's ⋯ menu on an open, unconnected thread calls `rpc/end_pitch_chat`;
  - P0002 from accept: toast "That request is no longer open." and the row leaves;
  - a 500 from accept: toast "That request could not be updated. Please try again." and the buttons stay;
  - a thread whose person did not load reads "A Brivia member";
  - `rpc/my_pitch_threads` answering 404: inbox identical to today (no heading, no errors in the console);
  - Not now in the review sheet removes the pitch row from the inbox;
  - axe clean on the inbox and on an open request.
- [ ] **Step 2: Run** `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/pitch-chat.spec.mjs`
  — expected: FAIL (no "Message requests").
- [ ] **Step 3: Implement in app.js:**
  - `loadPitchThreads()` after `loadConnectionRequests()` at sign-in and in the same refresh path as
    `refreshConnections`; unknown people fetched with `fetchCandidates` exactly as `loadConnectionRequests` does.
  - `renderChats`: rows for `pitchThreads` not already in `remoteMatchIds` (`'in'` and closed under "Message
    requests" at the top; open or `'out'` rows sorted with the conversations, carrying a "Not connected" chip).
  - `openChat`: for a pitch thread, render `pitchThreadMarkup` above the messages; disable `#chat-form` unless
    `chatOpen`; Accept → `accept_pitch_chat`, set `chatOpen`, enable composer, `loadChatMessages`; Decline / End chat
    → `end_pitch_chat`, drop the row and the matching `pendingRequests` entry, close the thread.
  - A busy-set guard (like `respondingRequestIds`) so each action sends one RPC.
  - `respondToRequest(fromId, false)` success also deletes `pitchThreads.get(fromId)`; `true` with a match makes the
    row a normal conversation (`addConnection`).
  - Chat submit: no change needed (the server decides); a 42501 refusal on a pitch thread re-reads `loadPitchThreads`.
- [ ] **Step 4: Run** the new spec — expected: PASS. Then re-run, all PASS:
  `consent.spec.mjs`, `collab-requests.spec.mjs`, `chat-inbox.spec.mjs`, `chat-extras.spec.mjs`,
  `app-shell.spec.mjs`, `presence.spec.mjs`; `npm run test:unit`; `npm run build`; `npm run check:styles`.
- [ ] **Step 5: Commit** `feat(chat): pitches arrive in Chat as message requests, Accept to chat (D-112)`.

### Task 5: Docs, consent rule, and review

**Files:**
- Modify: `docs/DECISIONS.md` (append D-112, same shape as D-110), `CLAUDE.md` (consent rule line), `docs/HANDOFF.md`
  (section 1 entry, 0019 owed), `supabase/migrations/README.md` (0019 after 0018; client may ship first), the privacy
  notice in `site/privacy.html` only if it states who can message a member (`grep -n -i "message" site/privacy.html`).
- Create: `docs/arena/2026-10-31-pitch-chat.md` (agent-arena outcome).

- [ ] **Step 1: CLAUDE.md** consent line becomes: "Matching must be mutual-consent: a connection exists only after
  both people agree (mutual like or accepted request). A pitch's chat opens only when its receiver accepts it, and
  that chat is not a connection (D-112)."
- [ ] **Step 2: Run agent-arena** (review mode) on `0019_pitch_chat.sql` and the spec, focused on consent, block
  secrecy, sender-side inference of a decline, and expiry. Record the outcome in `docs/arena/2026-10-31-pitch-chat.md`
  and D-112; fix any accepted finding with its test first.
- [ ] **Step 3: Final verification:** `bash supabase/tests/run.sh` (ALL PASSED), `npm run test:unit`,
  `cd orbit && npm test`, `npm run build`, the e2e suites from Task 4 Step 4.
- [ ] **Step 4: Commit and push** `docs: D-112 pitch in chat, consent rule, handoff, 0019 owed`, then
  `git push -u origin claude/magical-ptolemy-rbjrw2`.
