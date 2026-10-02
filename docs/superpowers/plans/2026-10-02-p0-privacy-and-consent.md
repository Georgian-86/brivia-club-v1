# P0 Privacy and Mutual-Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No member can read another member's email or phone, and a chat opens only after both people agree.

**Architecture:** A new idempotent SQL migration adds a `public_profiles` view (safe columns only), restricts the base
`profiles` table to its owner, and adds `connection_requests`. A trigger creates the `matches` row only on mutual
consent, and message inserts require a match. The client switches its reads to the view and its "like"/"pitch" writes
to `connection_requests`.

**Tech Stack:** Supabase Postgres (RLS, plpgsql triggers), vanilla JS (`app.js`, `script.js`), Playwright (webapp-testing skill) for verification.

**Spec:** `docs/ORBIT_ENGINE.md` §4.1 and §7, `docs/UX_SPEC.md` §D, `docs/ENGINE_AUDIT.md` E9/E10, `docs/DECISIONS.md` D-005.

## Global Constraints

- Other members never receive `email`, `phone`, `phone_country_code` or `phone_number` (CLAUDE.md privacy rule).
- A connection exists only after a mutual like or an accepted request (CLAUDE.md).
- Migrations are plain SQL files in `supabase/`, idempotent (`if not exists`, `drop policy if exists`), run manually in the Supabase SQL editor.
- Keep the existing block rule: no message between blocked members (`public.brivia_is_blocked_between`).
- No new client dependencies.

## Review Focus

1. **A profile's owner editing their own profile** must still work: the owner reads their own row from `profiles` (all columns), and everyone else reads from `public_profiles`.
2. **Two people liking each other at the same instant** must create exactly one `matches` row (`unique(user1_id,user2_id)` plus `on conflict do nothing` with an ordered pair).
3. **Existing one-sided `matches` rows from before the migration** stay as they are. Members already chatting keep their chat, and the migration does not delete data.
4. **A blocked member sending a request** is rejected.
5. **Pitch with a note to a non-connected member** becomes a pending request carrying the note. It must not insert into `brivia_messages`.

---

### Task 1: Migration: safe profile view and owner-only base table

**Files:**
- Create: `supabase/p0-privacy-consent.sql`

**Interfaces:**
- Produces: view `public.public_profiles(id, name, full_name, gender, city, state, experience, skills, looking_for, photo_url, cover_url, created_at)`, selectable by `authenticated` members who have completed a profile.

- [ ] **Step 1:** In the migration, create the view `public.public_profiles` with exactly the columns above. Filter it with `where public.brivia_has_completed_profile()`. Run the view as owner (the default, not `security_invoker`) so it can read rows that the base policy now hides. `revoke all ... from anon, public`; `grant select ... to authenticated`.
- [ ] **Step 2:** Replace the policies "Completed members can view profiles" and "Members can view profiles" on `public.profiles` with one policy, "Members can view their own profile": `using (id::text = auth.uid()::text)`.
- [ ] **Step 3: Verify in SQL.** In the Supabase SQL editor, as two test users A and B (`set local role authenticated; set local request.jwt.claims = '{"sub":"<A>"}'`):
  - `select email from profiles where id = '<B>'` returns 0 rows;
  - `select * from public_profiles where id = '<B>'` returns 1 row with no `email` column.
- [ ] **Step 4: Commit** `supabase/p0-privacy-consent.sql` with the message "P0: public_profiles view, owner-only profiles".

### Task 2: Migration: connection requests and the mutual-consent trigger

**Files:**
- Modify: `supabase/p0-privacy-consent.sql` (append)

**Interfaces:**
- Produces:
  - table `public.connection_requests(from_id uuid, to_id uuid, note text null, status text check (status in ('pending','accepted','declined')) default 'pending', created_at timestamptz default now(), primary key (from_id, to_id), check (from_id <> to_id))`.
  - RPC `public.respond_connection_request(p_from uuid, p_accept boolean) returns void`.
  - A match row is created **only** by trigger or RPC.

- [ ] **Step 1:** Create the table, enable RLS, and add these policies:
  - insert: `from_id = auth.uid() and not brivia_is_blocked_between(from_id::text, to_id::text)`;
  - select: `auth.uid() in (from_id, to_id)`;
  - no client update.
- [ ] **Step 2:** Add the trigger function `public.brivia_on_connection_request()`, `security definer`, `after insert`. If a row with `from_id = new.to_id and to_id = new.from_id and status in ('pending','accepted')` exists, then:
  - set both rows to `'accepted'`;
  - insert into `matches(user1_id, user2_id)` using `least(new.from_id,new.to_id), greatest(...)`, with `on conflict do nothing`.
- [ ] **Step 3:** Add `respond_connection_request`, `security definer`. It runs only when `auth.uid() = to_id` of a pending row from `p_from`. Accepting sets `'accepted'` and inserts the ordered `matches` row (`on conflict do nothing`); declining sets `'declined'`.
- [ ] **Step 4:** Drop the client insert policy "Completed members can create their matches" on `matches`, so clients can no longer create matches directly. Keep the select and delete policies.
- [ ] **Step 5:** Replace the `brivia_messages` insert policy with one that keeps the existing sender and block checks, and adds `exists (select 1 from matches m where (m.user1_id::text, m.user2_id::text) in ((sender_id, recipient_id), (recipient_id, sender_id)))`.
- [ ] **Step 6: Verify in SQL** as users A and B:
  - A requests B, so there is no match. Inserting a message A→B fails with an RLS error.
  - B requests A, so exactly one match row exists, and the message A→B succeeds.
  - A blocked pair's request insert fails.
  - Run the B→A insert twice concurrently: there is still one match row.
- [ ] **Step 7: Commit** with the message "P0: mutual-consent connection requests".

### Task 3: Client: read others from `public_profiles`

**Files:**
- Modify: `app.js` (≈1418 post authors, ≈1970 community load); `script.js` only where it reads *other* members (its own-profile reads at ≈1114 and ≈1305 stay on `profiles`).

**Interfaces:**
- Consumes: the `public_profiles` view (Task 1).

- [ ] **Step 1:** Change `supabase.from('profiles').select('*').neq('id', session.user.id)` to `supabase.from('public_profiles').select('*').neq('id', session.user.id)`. Do the same for the post-author lookup `.in('id', authorIds)`.
- [ ] **Step 2:** `grep -n "from('profiles')" app.js script.js`. Every remaining hit must filter by the signed-in user's own id. List them in the commit message.
- [ ] **Step 3:** In `app.js` `explorePersonMatches` and the chat search haystack (≈704), drop `person.email` and `person.phone`, because they are now undefined.
- [ ] **Step 4:** `npm run build`. Expected: the build succeeds.
- [ ] **Step 5: Commit** with the message "P0: client reads other members via public_profiles".

### Task 4: Client: likes and pitches become requests; chat opens on match

**Files:**
- Modify: `app.js` `saveMatches` (≈429), swipe like handler (≈545), `#pitch-form` submit (≈1876)

**Interfaces:**
- Consumes: `connection_requests`, `respond_connection_request` (Task 2).
- Produces: `sendConnectionSignal(person, note = null) → Promise<{ matched: boolean }>` replacing `saveMatches`.

- [ ] **Step 1:** Implement `sendConnectionSignal`:
  - upsert `connection_requests { from_id: me, to_id: person.id, note }` with `onConflict: 'from_id,to_id'`;
  - then select `matches` for the ordered pair;
  - return `{ matched: Boolean(row) }`;
  - add `person.id` to `remoteConnectionIds` and restore chat **only** when matched.
- [ ] **Step 2:** In the swipe like handler, call `sendConnectionSignal(currentPerson)`. On `matched`, show the match moment: the toast "It's mutual. Say hi to {name}." On not matched, show the toast "Signal sent". Keep `openPitch(currentPerson)` so the member can add a note.
- [ ] **Step 3:** In `#pitch-form`, call `sendConnectionSignal(target, body)` and **remove** the direct `brivia_messages` insert. Toast "Request sent to {name}" (or "It's mutual…" when matched). Disable the submit button while the request is in flight (UX_SPEC rule 2).
- [ ] **Step 4:** Add a "Requests" list to the existing notifications panel (`renderNotifications`). It lists pending `connection_requests` where `to_id = me`, showing the sender's `public_profiles` row and the note, with equal-weight **Accept** and **Decline** buttons that call `respond_connection_request`. Each button has an `aria-label` and a 44 px minimum height.
- [ ] **Step 5: Verify with the webapp-testing skill** (Playwright, two browser contexts, users A and B, against `npm run dev` with a Supabase test project):
  - A likes B, and A has no chat with B;
  - B accepts the request, and both see the chat;
  - no network response body in A's session contains B's email or phone (`page.on('response')` scan).
- [ ] **Step 6: Commit** with the message "P0: likes and pitches are consent requests; chat opens on match".
