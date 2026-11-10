# Session handoff (read after CLAUDE.md)

Last updated: 2026-11-05 (D-179 to D-183 merged from a parallel branch: the daily-limit shuffle, blush card, landing button, Razorpay and tickets; D-168 four motion moments fixed on live; D-167 "It's mutual" for every new match; D-164 the deck deal-in with a sound; D-165 motion moments; D-162 one-tap Hiring toggle on Connect, seeded hirers for testing, visible only to testers (0047); D-157 edit, unsend and delete for me from a long press on a message; D-156 city suggestions from the first letter, all 1,131 interests reach the pickers, 10 swipes a day on the deck and on companions; D-154 one opener in the pitch box, typing bubble and inbox typing; D-153 sharper hero video, subject-following phone crop; D-152 Chat search finds people, mobile chat polish; D-151 Read receipts switch, like and comment notifications, Posts tab renamed Notes; D-150 Delivered, Read and last active in chat; D-141 Hiring, built, 0037 not applied; D-140 worldwide city directory and company on profiles; D-138 one aura on every sheet, crossings say where and when, hidden-tab pulses, sound switches; D-137 bio 1 to 20 words, the sound kit; D-136 Gospel Music and NLP offered; D-135 interest list in the founder's wording, A–Z; D-134 Nearby notifications and web push; D-133 phone location; D-131 Nearby discovery; D-129 pitch shown once; D-128 cover order, names, OPEN MINDS retired; D-126 interest on all events; D-125 Show interest, brochure, poster area). Before that: 2026-11-02 (D-121 Create Event). Before that: 2026-11-01 (D-119 Crossing paths). Before that: 2026-11-01 (D-118 calmer Explore; D-117 Explore events, Posts tab). Before that: 2026-11-01 (D-116 cover set). Before that: 2026-10-28 (D-100 chat inbox, D-101 post activity and 0015, D-102 photo and setup). Before that: 2026-10-20 (live-database correction D-070; "Send without a note" D-071). Before that: 2026-10-16 (design references, D-062). Before that: 2026-10-13, after Phase D of the experience iteration (the test world), on branch
`claude/jolly-edison-49xvza` (repo `Georgian-86/brivia-club-v1`). Phases C and D are not on `main` yet, and Phase D's SQL
is not applied: the founder applies it in the SQL editor (section 3, item 0).
Update this file at the end of every session. CLAUDE.md holds the aim; this file holds **where we are**.

## 1. What is done

**2026-11-10, D-232:** posting a photo opens "Frame your post" (Portrait 4:5 / Square / Landscape 5:4, drag and
zoom); "Adjust photo" reframes it. The post's full view shows the whole framed photo.

**2026-11-10, D-231:** chat **+** → "Share a place": send any place by name or Google Maps link; it shows as a
"Shared place" card that opens in Maps. Coordinates and non-Maps links are refused.

**2026-11-10, D-229 and D-230:** the app no longer freezes every 5 seconds (the notification sync rewrote and
churned its list; phones froze 120-250 ms each time), lighter tab switches (no forced layout, no listener leak, the
filter drawer draws only when open), no backdrop blur on the phone top bar and tab bar. A shared area in chat opens a
Google Maps search for the place name (never coordinates). Measure with `tests/e2e/perf-runtime.mjs`.

**2026-11-10, D-228 (faster start-up and onboarding):** start-up reads run in parallel, the login page prefetches
the app's files, Create Event's code loads on demand, the envelope opens in 0.7 s. First card on a throttled phone
1.15-1.38 s (was 1.45-1.63 s). Measure with `tests/e2e/perf-boot.mjs` (see its header). Live database checked
2026-11-10: every object from 0001-0070 present. Edge Functions live: push-notify, directory; the four payment/ticket
functions (D-183) wait for the founder's Razorpay and Resend keys (README "## 0053").

**2026-11-10, D-227 (LIVE: main 326e57c, PR #67, deployed to thebriviaclub.live/.com; 0069 and 0070 applied, 120 covers switched):** AT WORK (the first cover) is the default
cover for new signups and members without one; brochures have no size limit of ours. **Done: 0069 and 0070 applied** (README
"## 0069", "## 0070": 0070 switches SMASH THEORY members to AT WORK once, reversibly); check Supabase's project-wide upload limit (Project Settings > Storage) is as high as wanted. Also already
failing before D-227: `profile-media.spec.mjs` 7 "no cover file input anywhere" checks.

**2026-11-10, D-226 (LIVE: main 326e57c; client only):** confirming the email
no longer sends a new member back to enter their details. signUp keeps the 18+ confirmation and the work answers with
the account, and the link's return path applies this browser's pending signup first even when a profile row exists.
Another browser asks only for the photo. **Owed (founder): Supabase Auth > URL Configuration, add both
`https://thebriviaclub.com/auth.html` and `https://thebriviaclub.live/auth.html` to Redirect URLs** (and www variants
if used). Also already failing before D-226: `login-smooth.spec.mjs` 3 error-copy checks.

**2026-11-10, D-225 (LIVE: main 326e57c; client only):** at the swipe limit
every request dialog says "You're out of free swipes ... Fresh swipes tomorrow at 3 PM." itself (the toast sat under
the modal and was never seen), and the pitch sheet now opens above Chat (it was invisible from Chat search's profile
Connect). Check `tests/e2e/swipe-limit.spec.mjs`. Already failing before D-225 and unchanged: `consent.spec.mjs`
(`cancelKeepsCard`, line 234) and one `nearby.spec.mjs` Settings sound check.

**2026-11-10, D-224 (LIVE: main 326e57c; 0068 applied and verified):** message
yourself. Chat search finds your own profile ("Your name (You) · Message yourself") and opens a private thread with
yourself; it joins the inbox once it has a note. 0068 lets `brivia_can_send` accept a message to yourself (nothing
else changes). Files `site/scripts/chat-self.js`, `site/scripts/app.js`; checks `tests/unit/chat-self.test.mjs`,
`supabase/tests/zh-message-yourself.test.sql`, `tests/e2e/chat-self.spec.mjs`. **Done: 0068 applied, client deployed.**

**2026-11-07, D-223 (on main, deployed to thebriviaclub.live; client only, no SQL):** Safari (Mac) and
every iPhone browser play the landing soundtrack and intro cue through `<audio>` elements instead of Web Audio (WebKit
could show "Stop music" in silence); Safari on Mac plays the app's swipe/notification cues the same way. The phone login
is one screen again (a production-only CSS order bug pushed Log in and Google below the fold), password managers can
fill it, and log-in errors are plain sentences. Step 1's "Designer at Zomato" example removed. Checks:
`tests/e2e/landing-sound.spec.mjs` (48), `tests/e2e/login-smooth.spec.mjs` (17). Owed: a check on a real Mac in Safari
and a real iPhone after deploy. Already failing on main before D-223 (same result on the untouched base): `signup.spec.mjs`
"area denied" and the interests listbox "on screen" (1920x886, 375x812; flaky); `landing.spec.mjs` 7 (hero-unmute
checks from before D-220, and a same-origin 404 after a full scroll).

**2026-11-06, D-220 and D-221 (live: main 95e4126, deployed to thebriviaclub.live):** the landing music control is
rebuilt so it tells the truth: "Stop music" / "Play music" (visible label), stops the soundtrack and the intro cue,
resumes from the same point, music on by default (a mute lasts for the tab only; a reload starts with music on), the
iPhone silent switch no longer hides it, a missing file is retried 3 times, no console warnings. Files
`site/scripts/script.js` (landing music block), `site/scripts/landing-sound.js`; checks
`tests/unit/landing-sound.test.mjs` and `tests/e2e/landing-sound.spec.mjs` (34). Owed: a check on a real iPhone (silent
switch on), Safari, Firefox and Edge once deployed. D-221: before the first touch the button shows ON ("Music on", lit)
rather than "Play music".

**2026-11-06, D-213 to D-217 (live):** migrations 0063-0066 applied, `directory` Edge Function v6, client deployed
(main 76bd215). The intro is 4 s (D-213); connections who want company show first in Companions with "Text them · Make
a plan" (D-214, 0063); opening a chat or the Chats tab clears message notifications on every device, and the Hiring
switch stays visible when on (D-215, 0064); signup's Step 2 asks for title and organisation, with logos (D-216, 0065;
continuing confirms 18+); unlimited hiring roles with 1000-word descriptions (D-217, 0066). Company logos: about 41
directory companies (mostly Indian banks and PSUs) have no logo any source gives; they show their initials on a tile.

**2026-11-05, D-211:** 25 seeded members' photos are now pets or instruments (matched to interests); no SQL.

**2026-11-05, D-210:** all 68 seeded members have new faceless profile photos (mirror selfies with the phone over the
face, sky and city views from behind, sunset silhouettes, desks with laptops); same file names, so live with the deploy
(no SQL). Delivers D-194.

**2026-11-05, D-193:** seeded hiring roles and intents deleted live (hiring shows real members only); `hiring-test-members.sql` retired. D-194 (sky / desk / laptop / mirror-selfie photos for the seeded members) is scheduled for 21:00 UTC when the image-search credits refresh.

**2026-11-05, D-191:** reply to any chat message (long-press > Reply; quote on the reply, tap to jump), migration 0055.
Live 2026-11-05 (deploy dbba0ce): D-185-D-191 client, migrations 0052 (main's) and 0055 applied, all 68 seeded members
have their `/test-avatars` photo.

**2026-11-05, D-188-D-190:** every seeded member has a faceless photo (`site/public/test-avatars`, applied with 0052 and
`test-members.sql` at deploy; t59-t68 are temporary second crops); the finished "That's your deck for today." deck is
blush like the shuffle, and the shuffle no longer plays under it; the Brivia intro runs 4.2 s (landing cap 5 s).

**2026-11-05, D-187:** the deck's shuffle wears the founder's mock-up: blush paper cards, a fanned hand behind a framed
front card reading "Shuffling Your Matches" with pulsing dots, a short hold, then the D-174 riffle and deal.

**2026-11-05, D-212:** the sign-in loading screen (auth.html, app.html) is the classic D-088 "Opening your club"
splash again; the ignition stays on the landing intro only.

**2026-11-05, D-186:** the landing intro and the "Opening your club" loading screen are the Brivia ignition, drawn
live (`brivia-ignition.js`, `ignition.css`) with its own music cue; the blurry 58 kbps intro video is gone.

**2026-11-04, D-184:** Global Hiring Discovery: the Connect Hiring switch shows everyone, anywhere, who is hiring or
open to roles, ranked by fit + shared interests + skills (not distance), paged, refreshed live, with a "Global hiring
discovery" label (migration 0054). Fixes the once-per-session hiring load and unstored passes on hiring cards.
Live 2026-11-05: client deployed, 0054 applied and checked (the founder's account gets 5 hirers by score, no distances).

**2026-11-04, D-183:** paid events take payment with Razorpay (order, verify, webhook; refunds a lost seat) and every
confirmed seat gets an emailed invitation ticket via Resend (with a calendar invite) and a ticket sound. **Owed: the
founder's Resend domain + key and Razorpay keys + webhook (migrations README "0053"), then deploy the four
functions (razorpay-webhook with JWT verification off), and a test-mode payment.** Until then Reserve holds the seat
and says payment opens soon.

**2026-11-04, D-179:** the deck ritual's daily-limit shuffle (Connect opens with the D-174 shuffle): at the daily swipe cap the deck fans, riffles, reforms and reads "That's your deck for
today." with the refresh time; two new deck cues. Files `site/scripts/deck-ritual.js`, `site/styles/deck-ritual.css`;
tests `tests/unit/deck-ritual.test.mjs`, `tests/e2e/deck-ritual.spec.mjs`. Client only (no migration).
**2026-11-04, D-176:** Vercel Web Analytics + Speed Insights on every real page (`site/scripts/analytics.js`, URLs
scrubbed by `analytics-url.js`). Both must be enabled in the Vercel project's Analytics and Speed Insights tabs.

**2026-11-04, D-175:** Google Search Console verified by file (`site/public/google4d360d183cb779a9.html`, keep it:
removing it unverifies the property) and a first SEO pass: `robots.txt`, `sitemap.xml` (public pages only),
canonical + Open Graph + Twitter tags on `/`, `/auth.html`, `/careers.html`, `/privacy.html`, Organization/WebSite
JSON-LD on `/`, and `noindex` (meta + `X-Robots-Tag` in `vercel.json`) on app, chat, explore and profile. Add any new
public page to `sitemap.xml`.

**2026-11-05, D-178:** the shuffle card backs are plain `--color-oxblood` (the member card's frame wine) with no lattice; logo, frame and motion unchanged.

**2026-11-04, D-174:** the deck now arrives with a ~3 s solitaire-style shuffle (pack, split, riffle, square, deal and
flip) and a matching shuffle sound. Files `site/scripts/deck-intro.js`, `INTRO_CUE` in `site/scripts/notify-sound.js`,
`.deck-shuffle` in `site/styles/deck.css`.

**2026-11-04, D-172:** the own profile hero's text never runs under the photo card: the work line and bio wrap or
clamp inside their column, the name wraps to two lines instead of an early ellipsis, one type scale per breakpoint
(`site/styles/profile-hero.css`). Test `tests/e2e/profile-hero.spec.mjs` (long, real and short profiles at 390 and 1440).

**2026-11-04, D-168:** shimmer, desktop letter, caught-up flip and sliding pill fixed (they never played on live).
`tests/e2e/motion.spec.mjs` checks all ten moments fire, frame by frame.

**2026-11-04, D-167:** "It's mutual" now plays for every new match, once per device (my signal, accepting a request,
the other member accepting, or a match made while away), as a modal dialog above the request sheet. Seen ids:
localStorage `brivia:mutual-seen:<member id>`. Test `tests/e2e/mutual-moment.spec.mjs`.

**2026-11-04, D-165:** motion moments: "It's mutual" dialog, pitch letter to the Chat tab, caught-up flip, desktop card
tilt, chip shimmer, sliding Curated/Nearby pill, Nearby radar, chat bubble rise, events reveal. Files
`site/scripts/motion-moments.js`, `site/styles/motion.css`; test `tests/unit/motion-moments.test.mjs`.

**2026-11-04, D-164:** the Connect deck is dealt in on load (three cards from below, a soft landing, a gloss) with a
quiet synthesized "deal" sound that follows the swipe-sounds switch. Files `site/scripts/deck-intro.js`, `INTRO_CUE` in
`site/scripts/notify-sound.js`, `.deck-intro-gloss` in `site/styles/deck.css`; test `tests/unit/deck-intro.test.mjs`.
New dependency: `gsap` 3.15.1 (core only). More motion ideas: the launch-ux checklist M1-M11 plus the D-164 PR notes.

**2026-11-04, D-157:** long-press (or right-click / Enter) a chat bubble: Copy, Edit (15 min, plain text), Unsend (for
both, any time), Delete for me. Files `site/scripts/message-actions.js`, `site/styles/message-actions.css`; tests
`tests/unit/message-actions.test.mjs`, `tests/e2e/message-actions.spec.mjs`, `supabase/tests/za-message-edit-unsend.test.sql`.
`0046_message_edit_unsend.sql` **applied live 2026-11-04** right after the client deployed, and verified (README "0046").

**2026-11-04, D-156:** no city is suggested before the first letter (signup, setup, Edit profile, Create Event). The
interest pickers now get every interest: `fetchInterestNodes` reads in pages (the API's 1,000-row cap had hidden 365).
"DJing" reads "DJ". 10 swipes a day (Pass and Pitch) on the deck and 10 on Find my companion, server-enforced.
`0045_daily_swipes_dj.sql` **applied live 2026-11-04** right after the client deployed to production, and verified (README "0045"). Photos for the seeded accounts were
not added (see D-156); the open test world is still on live.

**2026-11-04, D-154:** "Make the first move" opens with one opener in the box and an "Another idea" button. Typing
shows as "typing…" in the chat header, a dots bubble in the thread, and "typing…" on the inbox rows of recent
conversations (receive-only pair channels while Chat is open).

**2026-11-04, D-153:** the landing hero is re-encoded from the original export: sharpened, 10-bit AV1/HEVC (no
banding), each file under the 20 MB cap. Phones get a 9:16 crop that follows the subject through every scene and a
portrait poster. Re-run with `npm run media:hero4k` (the path is `PORTRAIT_PATH` in scripts/encode-hero-4k.mjs).

**2026-11-04, D-152:** Chat search finds **people**, not only threads: a connection is found by a partial first name,
surname, company or title even with no conversation (or one removed from this device), with Message, which opens the
existing chat at once (never a request, never a second thread). Others show "Wants to connect", "Request sent" or "Not
connected", and their profile offers the right action. Results: Conversations, then People; skeleton, empty and error
states. Mobile: composer stays above the keyboard (iOS via visualViewport, Android via interactive-widget), the thread
stays on its latest message, one-line header, 16 px fields (no iOS zoom), 44 px targets. Migration 0044
(`chat_people_search`). Inbox rows now say Yesterday / Tue / 28 Oct for older messages.

**2026-11-04, D-151:** Settings has READ RECEIPTS (default on; off hides Read both ways, like WhatsApp). The author of
a note gets a notification when someone likes it ("Ravi and Asha liked your note", one row per note) or comments on it
("Ravi commented on your note" with the words), in the bell with the note's thumbnail; a row opens the note. Web push
says the same (push-notify v4). The Posts tab is now **Notes** (the view id stays `posts`). Migration 0043.

**2026-11-03, D-150:** chat receipts and last active. My messages show one tick (Sent), two (Delivered: their app
loaded it) and two warm amber ticks (Read: they had the conversation open on screen); the newest of mine also says
"Delivered" or "Read". The chat header says "Active now" (with the green dot) or "Active 12 min ago", "Active 3 h ago",
"Active yesterday", "Active 28 Oct", for connections only, hidden both ways by "Show when I'm active". Migration 0042
(`delivered_at`, `read_at`, `mark_messages_delivered`, `mark_conversation_read`, `connection_last_seen`; a blocked
pair's withheld messages never show Delivered or Read). Client `site/scripts/receipts.js`; e2e `read-receipts.spec.mjs`.

**2026-11-03, D-141:** Hiring. A member whose Looking for is Hiring or Can Give Referrals posts up to 3 roles (Profile →
You're hiring → Add a role); their deck card's bar reads "HIRING · ROLE" and their profile opens with the banner. A
member whose Looking for is Job Referral, Internship Referral or Job Opportunities says which roles they're open to
(private to hirers by default) and gets the role strip, a deck lift (1 in 5), a once-a-day notification and the
Hiring lens; "Ask about this role" is a signal with a note and the role tag, answered in the request sheet. **Owed:
apply `0037_hiring.sql`** (README "0037"), **then `0047_hiring_test_world.sql`, then `0048_hiring_people.sql`, then `0049_hiring_anywhere.sql`, then `0050_hiring_open_world.sql` (D-171: seeded roles for everyone while the open test world is on), then `0051_hiring_no_wait.sql` (D-173: no 14-day wait), then `0052_test_avatars.sql` (D-177: faceless photos for the test hirers), then
`supabase/seed/hiring-test-members.sql`** and the `brivia_tester` insert for the founder (seed README, D-162); until 0037 the
client hides all of it, including the Hiring toggle beside Curated / Nearby. Spec
`docs/superpowers/specs/2026-11-02-hiring-design.md`, engine lane ORBIT_ENGINE.md §12, moderation MODERATION.md.

**2026-11-03, D-140:** any city in the world (0035, `geo_city`, 156k rows imported with pg_net from the site's
`data/cities` parts; search by city, country, "City, State", alias, native script; postal codes via the `directory`
Edge Function) and a company on every profile (0036, `company`, Wikidata-backed directory with cached logos, members'
own organisations, "[logo] Title at Company" on cards). Import steps: migrations README "## 0035".

**2026-11-03, D-138:** every modal, popup and scrim uses the Explore aura (`--aura-sheet`, `--aura-scrim`). Crossing
notifications read "Someone interesting crossed your path. You and Aarav were within 1 km of each other, near
Bengaluru." (0034: place_name, my_notifications_v2, nearby_retention). The pulse keeps running from a hidden tab once
granted. Three sound switches. Next big step: a native app for true background location (see D-138).

**2026-11-03, D-137:** a bio is 1 to 20 words (live "n/20 words", signup and Edit profile; migration 0033 guards the
server). The sound kit (`notify-sound.js`): one synthesized sax-like voice, three original cues (notify, pass, pitch),
pre-rendered on the first gesture; Settings has SOUNDS and SOUND VOLUME. Still to do by hand: listen on a real iPhone
(Safari and Home Screen app) and an Android phone (Chrome).

**2026-11-03, D-136:** migration 0032 offers Gospel Music and NLP too (founder's choice; overrides D-038 for Gospel
Music only). The catalogue is 1,131 interests, the founder's whole list.

**2026-11-03, D-135:** the interest list is the founder's A–Z list (1,129 interests). Migration 0031 relabels 65
interests to the founder's wording and orders the catalogue A–Z; ids unchanged. Gospel Music (private, D-038) and NLP
(duplicate) are left out on purpose.

**2026-11-03, D-134:** Nearby notifications ("Someone crossed your path."), one notification store synced across
devices (Realtime), optional web push (`push-notify` Edge Function, `/sw.js`), a chime, compact cards, 10 km. See README
"0030" for the apply and the function secrets.

**2026-11-03, D-131:** Nearby: discover members around you (Connect → Nearby), 1 / 3 / 5 km bands from a ~1 km live
cell, mutual-consent connect with the prefilled opener, "Well, look who crossed paths!". Client ready (before 0029 it
said "Nearby opens soon"). `0029_nearby_discovery.sql` **applied live 2026-11-03** and verified (README "0029").
**2026-11-03, D-132:** the request sheet has no Accept / Decline buttons; requests are answered by dragging (or → / ←).

**2026-11-03, D-129:** an accepted request's pitch appeared twice in chat: live `brivia_create_match` (hand-edited,
drift) copied the note and 0024's trigger delivered it too. `0028_pitch_once.sql` fixes the function and removes the
existing twins. **Applied live 2026-11-03** and verified (README "0028").

**2026-11-02, D-128:** the covers are in the founder's order with new names (25: OPEN MINDS retired, FIND YOUR PACE
kept last); Edit Profile shows them five across. The default cover picture is unchanged (now named SMASH THEORY).
`0019` and `0027` **applied live 2026-11-03** after the client deployed, and verified (README "0019", "0027").

**2026-11-02, D-127:** a Brivia cover can be the event poster (client only, no migration).

**2026-11-02, D-126:** Show interest on every event (free too; Register upgrades it). **Owed: apply
`0026_interest_all_events.sql`** after 0025, and the one-off `keep_only_candlelit_gambit.sql` (project files) to leave
only Yashika's "The Candlelit Gambit".

**2026-11-02, D-125:** "Show interest" on paid events (no seat, not going, counted; puts the member in the companion
pool, so Find a companion works before paying; Reserve upgrades it), the companion pool is now seat, hold or interest;
a PDF brochure (5 MB) in Create Event and the drawer; a poster-area step (3:2 crop, drag/keys/zoom, "Adjust area");
"Open in Google Maps" as a pill with a map icon. **Owed: apply `0025_event_interest_brochure.sql`** after 0023 (README
"0025"). Tests `n-event-interest.test.sql`, `create-event.spec.mjs`, `events-view.test.mjs`.

**2026-11-02, D-124:** "Make the first move." composer on Connect and on companion cards (counter, suggested openers,
Send request, Cancel); requests show "Their message" with Accept / Decline; on Accept the message is the first chat
message, once (0024 trigger); already connected -> appended; declined -> never in chat. Closing the pitch sheet now
sends nothing (supersedes D-018). **Owed: apply `0024_pitch_messages.sql`** after 0023.

**2026-11-02, D-123:** Find a Companion. `?view=companions&event=<id>` ("Find your event companion."): swipe cards of
people going to the same event who opted in; two right swipes match, both are told, Chat opens with "GOING TOGETHER ·
EVENT · DATE". **Owed: apply `0023_event_companions.sql`** after 0022 (README "0023"). Files `companions-page.js`,
`companion-view.js`, `companions.css`; tests `companion-view.test.mjs`, `companions.spec.mjs`, `l-event-companions.test.sql`.

**2026-11-02, D-122:** "Find my companion" on event cards and in the drawer: one press lists matches, or opts in, or
(free event, not registered) one confirm registers and opts in; "Connect" sends a request; "Stop looking". Client only.

**2026-11-02, D-121:** "Create event" on Explore. A member opens "Bring people together.", fills the form (twelve
categories, IST date and times, venue, city from the place list, optional map link or pin, capacity, Free/Paid INR,
optional contact, poster and gallery) with a live card preview, and saves a draft, previews or publishes. Published
events list beside the club's, with fee, spots, host, Register / Reserve, "Looking for company?" (needs a registration)
and "Ask a question"; the organiser edits, cancels or deletes from the drawer. **Owed: apply `0022_member_events.sql`**
(README "0022"; needs 0020). **Owed: a payment gateway** (paid seats stay "Payment pending"). Same day, from the founder's
reviews: the button is a small pill in the hero under the note (reference image); the form has fourteen categories in
two rows with Other naming its own (`custom_category`); the description has the emoji panel; posters and gallery come
from the device gallery (HEIC, up to 25 MB, re-encoded) or the camera on phones. Files:
`site/scripts/event-create.js`, `event-form.js`, `site/styles/event-create.css`; tests `tests/unit/event-form.test.mjs`,
`tests/e2e/create-event.spec.mjs`, `supabase/tests/k-member-events.test.sql`.

**2026-11-01, D-119:** "Crossing paths": two connections who both turned it on get one quiet alert ("Riya is nearby.
You both love chess.") when their live ~2 km areas are within 3 km; never a place, distance or time. Settings →
Notifications switch with an explainer, a panel row (Say hi, Mute), a toast outside 22:00-07:00, a coarse position
every 5 minutes while the tab is open. **Owed: apply `0021_crossing_paths.sql`** (README "0021"); until then the switch
is hidden. Phase 2 (founder call): Web Push so alerts arrive with the app closed. Spec
`docs/superpowers/specs/2026-11-01-crossing-paths-design.md`; files `site/scripts/crossing-paths.js`,
`site/styles/crossing-paths.css`; tests `tests/unit/crossing-paths.test.mjs`, `tests/e2e/crossing-paths.spec.mjs`,
`supabase/tests/j-crossing-paths.test.sql`.

**2026-11-01, D-118:** Explore restyled to match Posts and Connect (ruled toolbar, text tabs, quiet cards, the event in
a drawer). Client only.

**2026-11-01, D-117:** Explore is now events near you (hero, Nearby Events, "Find a companion", category chips, event
cards and an event panel with "Looking for a companion?" and "See companions"); the old Explore feed is the new
**Posts** tab (five tabs now). **Owed: apply `0020_club_events.sql`** (README "0020"; it seeds 8 Bengaluru events).
Until then Explore says "Events open soon" and points to Posts. New events are added by SQL for now (README "0020").
Files: `site/scripts/events-page.js`, `events-view.js`, `event-assets.js`, `site/styles/events.css`; e2e
`tests/e2e/events.spec.mjs`; SQL test `supabase/tests/i-club-events.test.sql`.

**2026-11-01, D-116:** "THE THOUGHTFUL ROOM" cover is retired and 9 new covers are added (26 in all); the default
cover is now "MAKE SOMETHING". **Owed: apply `0019_cover_set_refresh.sql`** after the client deploys (README "0019";
needs 0014).

**2026-10-31, D-115:** the deck card shows the bio (`member_bio`). **Owed: apply `0016_profile_bio.sql`** in the SQL
editor; until then no bio is stored anywhere (hero, cards and the saves all wait on it).

**2026-10-31, D-113 / D-114:** emoji panel under the bio (signup and Edit profile), the bio in the profile hero, no
maroon wash on the cover, "LOOKING FOR · …" in the deck card's bar and no rule under the name; signup setup is now
interests → location → About you (the photo creates the account again). Bio saving still needs `0016`.

**2026-10-31, signup About you (D-112):** after the photo, a required "About you" step: Looking for (a dropdown of the
Edit profile suggestions, or the member's own words, up to 8) and a bio (20 to 300 characters). It is now the last
signup step and creates the account ("Step n of 6", Google "of 5"). A signed-in member without looking for (or, once
0016 is live, a bio) resumes there; completed members are never sent back. The bio is stored only once
`0016_profile_bio.sql` is applied: before that the signup saves everything else. Proof: e2e signup 355, unit 376.

**2026-10-29, same branch (D-107 to D-110; plan `docs/superpowers/plans/2026-10-29-collab-requests-interests-presence.md`):**
- **Post cards (D-107, live):** counts inline beside the icons, one fixed 40 px footer on every card ("Liked by …" /
  "View N comments", or "Be the first to like this"), so action bars line up.
- **Requests (D-108, live):** no Accept / Decline; the notification panel shows "See who wants to collaborate with you"
  and Review opens a one-card-at-a-time sheet (Connect / Not now, drag or arrow keys; Not now declines quietly).
  `collab-requests.js`, e2e `collab-requests.spec.mjs`.
- **Interest catalogue (D-109, client live, needs `0017_interest_catalog.sql`, NOT applied):** the founder's A–Z list
  in both pickers under letter headings, and "Add … as your own interest" (`add_member_interest`). Source
  `supabase/catalog/interest-catalog.tsv` → `node scripts/build-interest-catalog.mjs`. ORBIT treats `member.*`
  interests as exact-match only (`placed: false`).
- **Active status (D-110, needs `0018_member_presence.sql`, NOT applied):** one green dot on a connection's avatar in
  the chat list (founder: one dot only, nothing in the open chat). Settings → Notifications → "Show when I'm active".
- Proof: unit 375; orbit 87; SQL harness ALL PASSED (new g-interest-catalog, h-member-presence); e2e signup 329,
  onboarding 269, profile-edit, collab-requests, presence, consent 184, app-shell 211, deck 196, fit 324, chat suites.
- Known, not fixed here: the chat list's older axe findings (a button inside the row button, inbox tab roles, a
  4.42:1 "Unread" tab label).

**2026-10-28, branch `claude/wizardly-volta-6hv7or` (D-100 to D-102):**
- **Chat (D-100):** the phone inbox scrolls as a page again (a chat-view `overflow: hidden` lock had clipped it), a wheel
  anywhere in the desktop sidebar scrolls the rows, conversations sort by last contact, and the Chat badge counts
  unread messages (`chat-unread.js`, read state per member in the browser). e2e `chat-inbox.spec.mjs`.
- **Explore (D-101):** counts on Like / Comment / Share, "Liked by <connection>", threaded comments with Reply and
  Delete in the post sheet, and a share sheet that sends the link to a connection in chat. Needs
  **`0015_post_activity.sql` (written, NOT applied)**; until then the client hides counts and comments. e2e
  `post-activity.spec.mjs`, SQL `e-post-activity.test.sql`.
- **Shared post card in chat (D-103)** and **Edit profile (D-104):** editable interests, Experience dropdown, saved
  city shown, bio (needs **`0016_profile_bio.sql`, NOT applied**).
- **Signup (D-102):** the photo is a required last signup step ("Create account"); area and interests are a mandatory
  "Set up" right after (or after the email link). No SQL.
- Proof: unit 349; SQL harness ALL PASSED; e2e signup 319, onboarding 269, location 64, app-shell 211, explore-cards 74,
  post-activity 43, chat-inbox 15, chat-extras 145, consent 182, deck 196, fit 324, profile-media 193, deck-tutorial,
  mobile-polish, launch-polish, password suites; build, assets, style ratchet OK. (deck-tutorial's axe check flaked once
  on a mid-animation stamp, then passed twice.) No agent-arena was run for D-101's privacy design: run one before 0015
  goes live if the founder wants it.

**Explore post cards (2026-10-21, release C of the polish wave), D-074.** Explore posts are wine cards (header bar,
5:4 image (squarer since 2026-10-22), two-line caption, action bar: Like, Comment, Share, Save); one, two or three columns. Like and Save are
private to the member (no counts) and live in `0012_polish_wave.sql` section C, which the founder applies once after
parts A, C and D are on `main`; until then Like and Save are hidden and the rest works. Share sends a link only; Comment
opens the detail sheet (no comment storage yet). Also: the badminton illustration lost its baked-in grey checkerboard
(solid cream, same file name). Proof: `tests/e2e/explore-cards.spec.mjs`.

**"Send without a note" on the pitch sheet (2026-10-20), D-071.** A secondary button under SEND PITCH sends the like
with no note, exactly as closing the sheet does (D-018 unchanged), never twice. The × has a 44 px target and an
aria-label. Client only; proof in `tests/e2e/consent.spec.mjs` section 9b (1440 and 375 px, axe).

**Live database recorded and the notice fixed (2026-10-20), D-070.** D-069 was wrong that the database needed nothing:
`0009` (notice `2026-10-20`, `2026-10-05` accepted only until 2026-11-03) and `0010` (open-test-world switch) were
applied live on 2026-10-14 from `claude/jolly-edison-49xvza`. Both are now in `supabase/migrations/` verbatim with their
tests. New `0011_notice_version_2026_10_05.sql` makes `2026-10-05` current again with no expiry (and keeps `2026-10-20`
accepted); it must be applied before 2026-11-03 or no new member can finish signup. Proof:
`supabase/tests/p0f-notice-restore.test.sql`.

**Signup back to the classic form (2026-10-19), D-069.** The guided one-question-per-screen signup (D-067, D-068) was
live for one day and is removed at the founder's request; the 4-step form (UX_SPEC §A) is the only signup. No SQL
involved. The design and code stay in git history (commits 7a74194, 4e708c8) if it is ever wanted again.

**Phones (2026-10-18), D-066.** Hero prefers a hardware-decoded codec, lighter matching cards (`npm run media:cards`),
one shared scroll frame, no stacked sound buttons. Probe: `node tests/e2e/landing-phone-smoothness.mjs` (after a stub
build). The matching scene still drops frames here only because this container composites in software; check it on a
real phone. The login/signup bottom quote and its rule line are removed.

**Repository reorganized (2026-10-18), D-065.** The site lives in `site/` (pages at its top, so URLs are unchanged;
`site/styles/`, `site/scripts/`, `site/media/`), raw originals in `source-media/` (never shipped), the 59 stray root
screenshots and the old .docx are gone. Vite's root is `site/`, output still `dist/`. Builds are pixel-identical
(visual parity, 38 shots); every unit and e2e suite passes. File paths below are relative to `site/` unless they start
with another top-level folder.

**Live-site fixes (2026-10-18), D-064.** PR #2 (D-062, D-063) is merged and live. Follow-up: the hero now plays on
connections Chrome labels "3g" (only 2g is poster-only), a refused autoplay starts on the first touch, and the chat
room photo is softly blurred again (baked into `media/assets/chat-room-soft.webp`) with the reference sidebar order.

**Landing smoothness and sound (2026-10-16), same branch.** See D-063. Lenis smooth scroll (desktop pointer only),
cheaper matching-scene layers, sound that starts on the first real gesture and stops after 5 minutes, and a sound
button (rebuilt in D-220). Checks: `node tests/e2e/landing-sound.spec.mjs` (34 checks since D-220, after a stub build) and the frame-time probe
`node tests/e2e/landing-smoothness.mjs` (`SMOOTH_ASSERT=1` fails on a p95 frame over 34 ms; this container has no GPU,
so judge desktop smoothness on a real laptop). Open: the original `source-media/Images/Videos/HEROSECTIONVI.MOV` carries a real
soundtrack (the 4K master has none); the landing still plays its synthesized chord. Ask the founder before swapping.

**Design references (2026-10-16): branch `claude/focused-johnson-pev1j6` off `main` 07d1f45 (the live build).** See D-062.
- Deck card restyled to the founder's Canva card, chat to the "Brivia Society" screenshot (sharp room photo, #5a061e
  wine, serif type), the discovery filter drawer suggests a full catalog (chess, music, guitar, hackathons...) plus
  popular picks, and the landing hero is 4K only (AV1 / HEVC / H.264, a portrait crop for phones). Look-only CSS lives
  in `reference-design.css` (loads last); colours are tokens in `tokens.css`. No backend, RPC or data-flow change.
- Review screenshots: `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/design-shots.mjs`
  (deck card, filter drawer and an open chat at 390, 1024 and 1440 px into `.superpowers/shots/`, git-ignored).
- Re-encode the hero: `npm run media:hero4k` (about 15 minutes on 4 cores). The poster
  `media/posters/hero-section-video.webp` is unchanged and stays the LCP.
- To go live: the founder reviews the preview deployment of this branch, then fast-forwards `main` (D-051).
- Open for the founder: the chat masthead says "BRIVIA SOCIETY" as in the reference (product name is Brivia Club);
  one `content` string in `reference-design.css` changes it.

**Founder live-test hotfix (2026-10-14): branch `claude/deck-swipe-hotfix` off `main` 741b77b, not pushed.** See D-061 (D-059 is the open-test-world switch and D-060 Phase E, both on the working branch).
- The deck: card and Pass / Pitch aligned on desktop (controls centred under the card, card never under the top bar),
  the heavy left/right swipe (`deck-swipe.js`, unit-tested maths in `tests/unit/deck-swipe.test.mjs`), the stacked next
  card, the pitched card staying until the sheet resolves, and a branded placeholder for a missing or broken cover.
- Seed follow-up for the founder: 34 seeded test members have no cover and no photo (rows 1-24, and 30-32, 38, 46-48,
  58-60); the client now shows the placeholder, but giving them preset covers in `supabase/seed/test-members.sql` would
  make the test deck look finished. Open question: should cancelling a pitch send nothing and keep the card (changes
  D-018)? Today it sends the plain like, as D-018 says.

**Experience iteration, Phase D (2026-10-13): done on `claude/jolly-edison-49xvza`, NOT applied live, not pushed.**
See D-057 and D-058.
- `supabase/migrations/0008_tester_world.sql`: the tester switch (`brivia_tester`, `brivia_in_test_world`, 14
  world-checked functions, cross-world pair hiding when a tester is on one side), the post-image trigger (preset
  illustrations for `is_test` authors only), and `deck_why` (section 5).
- Seed v2 (`supabase/seed/test-members.sql`): 60 test members in Mumbai, Thane, Pune, Bengaluru and Delhi, with posts,
  requests, matches and chats, flags, blocks and consent rows; the role table is in `supabase/seed/README.md`. The purge
  removes all of it, empties `brivia_tester` and never deletes a tester's own account.
- "Why this person?" on the deck card, testers only (`why-panel.js`, `app.js`, `deck.css`): the band label, "You both:
  …" and the deck's order keys. A real member's client asks `rpc/deck_why` once per page and never again.
- Far matches: the deck still has no escape-velocity lane (60 km pool); the far-strong member is found by search, and
  a unit test runs it through ORBIT's gate. Wiring ORBIT's far lane into the deck is founder backlog (the harness
  assertion "far partner absent from deck" must flip then).
- Commit trailer rule (founder, Phase D on): commits end with the `Claude-Session:` line only, **no `Co-Authored-By`**.

**Experience iteration, Phase C (2026-10-13): done on `claude/jolly-edison-49xvza`** (not yet on `main`). See D-055.
- One member nav (`app-nav.js`: header at desktop, tab bar at <= 780 px; Connect · Explore · Chat · Profile), one set of
  tokens (`tokens.css`), one type system (Bodoni Moda headings, Instrument Sans body, 12 px floor), a calm profile
  column, and skeletons, busy buttons and an action in every empty state (`app-skeletons.js`).
- Final review fixes (D-055 addendum): the tab bar hides over overlays, dialogs, the review notice and an open chat
  thread; the ⚙ menu survives a focus loss to nowhere; a refill that throws ends in Try again; 16 px app fields on phones;
  no my_interests re-read on a Profile re-tap. `APP_SHELL_FINAL_ONLY=1` runs only those app-shell checks.
  Known, not fixed: between 701 and 780 px the header bell sits behind the avatar and the chat panel's right edge is
  clipped (seen in review screenshots; also on 03d1062).
- Landing CSS split (`landing-entry.js`, `auth-entry.js`): Lighthouse mobile 0.89 -> 0.93 (median of 3), LCP 2.6 s, CLS 0.
- Style ratchet: `npm run check:styles` (per-file hex and font-family counts may only fall; after a cleanup,
  `node scripts/check-style-ratchet.mjs --write` lowers the baseline and refuses if anything rose).
- Visual parity guard (byte-exact; the landing stayed identical through every Phase C task). It serves the existing
  `dist/`, so build with the stub Supabase first:
  `VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build`, then
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node scripts/visual-parity.mjs compare .superpowers/sdd/2026-10-12-phase-c-consistency/landing-before --pages index`
  (`capture <dir>` takes a new baseline; `--pages index,auth`; `--expect-diff a,b` names intended changes).
- App shell e2e (Vite on **:5195**, stubbed Supabase with per-route `routes` delay/status overrides):
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs`;
  `APP_SHOTS=<dir>` saves the views, dialogs, profile, loading and empty-state screenshots instead (final set:
  `.superpowers/sdd/2026-10-12-phase-c-consistency/app-after/`).
- Founder backlog surfaced (not Phase C) is listed at the end of D-055.

**Experience iteration, Phases A and B (2026-10-12): done and on `main`.** See D-053 and D-054.
- Media pipeline: `npm run media:build` (sharp + ffmpeg write `media/`), `npm run media:repoint` (rewrites references from `media/manifest.json`), `npm run check:assets` (budget on `dist/assets`: image <= 400 KB, video <= 5 MB). Originals stay in `Images/` and `assets/`.
- Landing e2e: `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/landing.spec.mjs` (builds, serves `vite preview` on :5196; checks poster-first, intro cap, reduced motion, transfer, CLS, LCP, fonts, skeleton).
- Lighthouse: `CHROME_PATH=/opt/pw-browsers/chromium npx lighthouse@12 http://127.0.0.1:4173/ --preset=perf --form-factor=mobile --chrome-flags="--headless --no-sandbox"`. Last result 0.86 to 0.89, LCP 2.8 s (target 90 / 2.5 s); next step is splitting the auth CSS off the landing critical path.
- axe `color-contrast` is blind on the cream auth panel (those nodes come back "incomplete"), so contrast fixes need computed-ratio assertions, not axe alone.
- The Phase A screenshot checks are geometry and ratio assertions, not pixel baselines.
- Live checks still owed after deploy: hero video playback and gesture-unmute (the test Chromium has no H.264) (Bodoni Moda parity was checked: pixel-identical to the Google version).

| Area | State | Where |
|---|---|---|
| Vision and rules | Written | `docs/VISION.md`, `CLAUDE.md` |
| Old engine audit (arena, rated) | Done | `docs/ENGINE_AUDIT.md` |
| ORBIT engine spec (copyright asset) | Written, §10 has status | `docs/ORBIT_ENGINE.md` |
| ORBIT library | Pure JS, 86 tests, **not wired to members yet** | `orbit/src`, `orbit/test` |
| IP plan | Written | `docs/IP_NOTES.md` |
| Iteration 3 (cells, taxonomy, Passion Budget, k-anonymity, signals, interim deck) and P0-A (0004) | Done, 0004 live | D-037–D-042 |
| **Iteration 4, P0-B** (18+ gate, sensitive consent, report, self-serve deletion, retention, privacy notice, honesty/contrast, media fail-closed, 0006 perf policies) | **Done on the branch, reviewed; NOT applied or deployed** | plan `docs/superpowers/plans/2026-10-05-iteration-4-p0b.md`; D-044, D-045 |
| Iteration 4 arenas (P0-B design; end-of-iteration critique → P0-C backlog) | Done | `docs/arena/2026-10-05-p0b-design.md`, `docs/arena/2026-10-07-iteration-4.md`; D-044, D-046 |
| Landing page | Yashika's original UI, unchanged (founder rule: optimise, never redesign) | `index.html`, CSS |
| **Live signup walkthrough** (real browser on the live URL; 7 UI bugs fixed incl. lost signup photo, typed-city refusal, invalid phone pattern) | Done, pushed (auto-deploys) | D-049 |
| Experience iteration A-C (signup guide, landing speed, consistency) | Done on the branch; A and B on `main`, C awaiting the founder's OK | D-053, D-054, D-055 |
| Experience iteration D (test world: 0008, seed v2, "Why this person?") | Done on the branch; SQL not applied, not pushed | D-057, D-058 |
| Decisions | D-001 … D-058, append-only | `docs/DECISIONS.md` |

Test status after D-058 (2026-10-13): SQL harness ALL PASSED; build OK; `test:unit` 173/173; orbit 86/86;
`check:assets` and `check:styles` OK; landing parity identical (22 shots); e2e onboarding 269, consent 154, deck 123,
landing all passed, app-shell 208.
**Live UI testing:** this sandbox cannot reach `*.vercel.app` / `*.supabase.co`. Use a Vercel Sandbox in project
`brivia-club` (Vercel MCP `create_sandboxes_v4`, no failover regions on this plan, ~45 min max) with Playwright, and a
Gmail plus-address of the founder's inbox for confirmation emails (disposable inboxes did not receive them).
Tooling: Playwright **and axe-core** at `/tmp/pw` (`npm install --prefix /tmp/pw playwright axe-core`).

- **2026-10-25, deck and landing polish (D-094):** favicon (burgundy gradient "B", all pages), the landing's camera
  ("playground") video section removed, a shorter deck card with no round Pass / Pitch on screen (keyboard users still
  reach them), and a first-run deck tutorial with "Don't show this again". New e2e `tests/e2e/deck-tutorial.spec.mjs`.
  Still open from the same founder message: chat close button + Escape, mobile profile/login after the attachments,
  Explore spacing, fewer dots in deck copy, the phone on "Where ideas begin", the Resend sender.
- **2026-10-25, interests dropdown (D-095):** signup step "What are you into?" is now one dropdown (a combobox with a
  multi-select list grouped by category, Popular first; type to search) instead of tabs and chips. Picks show in the
  "Your picks" tray above the field. The login "or" above Continue with Google sits 14 px from each neighbour (was ~28).
- **2026-10-25, mobile polish (D-096):** phone login with the telephone and outlined icons, chat × and Escape, the
  phone inbox as one page, the phone profile hero, equal header icons, roomier Explore, one-line "Where ideas begin",
  fewer dots. Email: point Supabase SMTP at Resend (D-096 has the settings) with a new key. e2e `mobile-polish.spec.mjs`.
- **2026-10-25, auth heading (D-097):** "Your kind is already here." is Instrument Sans 700, tight tracking, as in the
  founder's screenshot (was Bodoni Moda since D-078).
- **2026-10-25, phone login and profile (D-098):** the handset sized to the space the form leaves (Google always
  on screen, `vh` fallback without `svh`); the profile name on one line, a slim EDIT PROFILE pill and a round ⚙ in the photo.
- **2026-10-25, phone sign-up start (D-099):** the login's composition on the first sign-up screen: one Log in pill top
  right, a centred head, the tagline on one line. Later steps unchanged.
- **2026-10-25, launch polish (D-092):** OR divider, the profile dialog, smaller Explore cards, filter dropdowns, the
  profile sidebar and framed hero, the hero video's own soundtrack, area changes from Edit profile, and the decorative
  dead ends removed. New e2e `tests/e2e/launch-polish.spec.mjs`; every control clicked at 1440 and 390 px (D-092).
- **2026-10-24, show / hide password (D-091):** every password field has a working eye button (`password-reveal.js`);
  "Forgot password?" is unchanged from D-090. e2e password-reveal 56, signup 285, onboarding 269, password-reset 18.
- **2026-10-23, signup in the classic look (D-086):** the guided signup (same screens, Google, no points) now looks like
  the old "FIND YOUR PEOPLE" form (`signup-classic.css`, CSS and one static head only). e2e signup 285, onboarding 269.
- **2026-10-23, login look restored (D-085):** the login screen is back to the pre-B4 "JOIN THE CLUB" UI (markup only;
  the B4 card CSS is inert). Login and the guided signup work exactly as before. e2e signup 285, onboarding 269 passed.
- **2026-10-22, release A of the polish wave live (D-072):** location fix, chat fit, notifications over chat, compact
  account menu (bottom sheet on phones), Yugansh/Keshav cards removed. Founder: check "Use my location" and the
  account menu on the real Mac (Safari) and phone. Next: A5 with `0013`, then part B (guided signup, interests only).

## 2. Live Supabase state (project `wfbddovczpfdrspmxgfo`, ap-south-1)

- **2026-11-02:** `0022_member_events.sql`, `0023_event_companions.sql` and `0024_pitch_messages.sql` are **applied**
  (Supabase MCP, as postgres) and verified: `save_member_event`/`companion_swipe`/`send_connect_request` callable by
  authenticated only, `confirm_event_payment` not callable by authenticated, `event-posters` bucket public, the 8 club
  events intact, `event_companion_swipe` and `brivia_pitch_delivery` not selectable, pitch trigger on `matches` present.
  Advisors: only the expected RLS-no-policy INFO and definer-RPC WARN lints, plus leaked-password protection off.
  `0015` and `0021` are still NOT applied (untouched). The new client (Create Event, Find a Companion, the new connect flow)
  is on `main` (fast-forwarded to `a070586`) and live on thebriviaclub.live since 2026-11-02 (Vercel `dpl_7oJNapZDoFByfYZijFoToMbWm1uH`).
  **Drift found:** live has `accept_pitch_chat(p_from)`, `end_pitch_chat(p_other)`, `my_pitch_threads()`, a
  `connection_requests.chat_accepted_at` column and a 3-arg `brivia_request_is_live`, none of which are in this repo.
  Pull them into a migration and reconcile with 0024 (a note shown in a pre-match pitch chat is also delivered as the
  first message on match).
- **2026-10-22:** `0012_polish_wave.sql` (sections C and D) is **applied** and verified read-only (D-075): Explore
  likes and saves, the private `resumes` bucket, resume messages, typing authorization, deletion covers resumes.
  Blocked-send withholding (A5) will be `0013`. Live `brivia_notice_version()` is still `2026-10-20`: `0011` is **applied** (2026-10-22, verified: version `2026-10-05`, accepted after 2026-11-03).
- **Corrected 2026-10-20 (D-070), verified read-only on the live project:** `0001`–`0006`, `0008`, `0009` and `0010`
  are applied and frozen (`0009` and `0010` on 2026-10-14 from `claude/jolly-edison-49xvza`; `0010` needs `0008`'s
  `brivia_tester`, so `0008` is live too). Live `brivia_notice_version()` = `2026-10-20`, and
  `brivia_notice_accepted('2026-10-05')` = `true` only until 2026-11-03. **`0011` is written, NOT applied: apply it
  before 2026-11-03** (`supabase/migrations/README.md`, "0011"). The **open-test-world switch is ON**
  (`brivia_world_switch.open_test_world = true`): real members see seeded test members. Close it (README, "0010"):
  it was meant to stay open at most 6 nights, and run the purge before real launch. The bullets below are older and
  are superseded where they disagree.
- `0001`–`0004` are **applied and frozen**. Never edit or re-run them.
- **Test-member seed: live** (D-043): 24 `is_test` profiles, all completed. To refresh, purge and re-seed (see
  `supabase/seed/README.md`; the purge leaves storage files, remove them via the Storage API first).
- **`0005` and `0006` are applied (2026-10-08) and frozen** (D-047, D-048), verified read-only: the policies match
  `supabase/tests/policies-0006.expected.tsv` exactly, and the advisors are as the README expects. New SQL goes in
  **`0007+`**, starting with the D-046 P0-C items. **`0008_tester_world.sql` is written but NOT applied** (Phase D;
  section 3, item 0, has the order). Until it is, the deck stays empty for the founder's real accounts.
- **Client deployed:** Vercel project `brivia-club` (team "Golu's projects") at `https://brivia-club.vercel.app`.
  **Production deploys from `main`** (D-051): `main` was fast-forwarded to the working branch on 2026-10-12. A push
  to the working branch builds a preview only; to go live, fast-forward `main` to it (founder OK) and Vercel deploys.
  The Supabase Auth Site URL and redirect are set to it.
  Vercel Deployment Protection is on by default; turn it off if testers without a Vercel login need access.
- **Live checks:** the `amr` re-auth on deletion **works** (D-049: `reauth_required` → password → deleted, zero rows
  left). Still open: the Google re-auth round trip.
- **Founder dashboard items from D-049/D-050:** **custom SMTP now blocks any public test**: the default sender hit
  `over_email_send_rate_limit` after 2 sign-ups in an hour. Also: a Brivia-branded confirmation email, and delete the
  unconfirmed QA user `brivia.qa.muzfgszm@maxxspace.com`.
- Real members are **not allowed yet**: see the gate table in `docs/arena/2026-10-07-iteration-4.md`.

## 3. What to do next (in order)

**Database owed (2026-11-02):** `0022_member_events.sql` after `0020` (README "0022"), then `0023_event_companions.sql`, then `0024_pitch_messages.sql`. Then pick a payment gateway for
paid events (its webhook calls `confirm_event_payment`).

**Database owed (2026-11-01):** `0019_cover_set_refresh.sql` (after the client deploys) and `0020_club_events.sql`
(either order; seeds the first 8 events). README "0019" / "0020". Next for events: a way for the founder (or members) to
add events without SQL, and an agent-arena run before member-created events.

**Database owed (2026-10-29):** in order, whichever are not yet applied: `0015`, `0016`, `0017_interest_catalog.sql`
(long: the catalogue rows; paste all of it), `0018_member_presence.sql`. README sections "0015"–"0018" have the verify
queries. The client is live and hides each feature until its file is applied.

**Database owed (2026-10-28):** apply `0015_post_activity.sql` (comments, shares, counts) and then `0016_profile_bio.sql` (bio); README "0015" / "0016". The client is live and hides those features until each file is applied. Earlier note: review the preview of `claude/wizardly-volta-6hv7or`, then apply `0015_post_activity.sql`
(README "0015": pre-flight, apply, verify; either order with the client works) and merge. Existing members without a
photo are not forced to add one; only new signups and incomplete members are.

**Done 2026-10-22:** `0011` is applied (D-070). Then close the open test world
(`update public.brivia_world_switch set open_test_world = false, changed_at = now();`) and purge the test members
before real launch. Item 0 below is partly done: `0008`, `0009` and `0010` are live (the seed and tester rows were not
re-checked).

0. **Go live with Phase D, the test world** (D-058; all three tasks are done on the branch). First the founder reviews
   the Phase C before/after screenshots and OKs pushing and fast-forwarding `main`. Then, in the SQL editor as
   `postgres`, in the same window as the client deploy (details in `supabase/migrations/README.md`, "0008"):
   1. apply `0008_tester_world.sql` (with `set lock_timeout = '5s';` on the first line) and run its read-only checks;
   2. run seed v2, `supabase/seed/test-members.sql`;
   3. for each of the founder's accounts:
      `insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;`
   4. `select public.refresh_cell_density();` (it does nothing if that night's run already happened). Cards show
      `~3 km`/`~10 km` only once the target's g7 cell is `ok10` (7 consecutive nightly runs with at least 10 counted
      members, who must be over 14 days old); with the seed's under-2 km spread, expect place names (Thane, Mumbai)
      for a long time. That is safe, not a fault.
   The deck then shows test members near Thane and Bengaluru, and each card has "Why this person?".
   **To stop being a tester:**
   `delete from public.brivia_tester where member_id = (select id from auth.users where email = '<your email>');`
   The account is back in the real world at once; until the purge it can still read its old test-world matches,
   messages and pending requests, but cannot message test members (Ruling 5). The purge
   (`supabase/seed/purge-test-members.sql`) deletes the test members and everything tied to them and empties
   `brivia_tester`; it never deletes a tester's own account.
   **After 0008, the next live policy comparison must expect a change:** `supabase/tests/policies-0006.expected.tsv`
   no longer matches the live `matches` and `messages` select policies (0008 rewrites them to add the cross-world pair
   check). The repo has no generator for a 0008 snapshot, so the comparison must expect exactly those two policy
   differences (or the next session adds a `policies-0008.expected.tsv`).
   Founder backlog from Phase D: wire ORBIT's far lane into the deck (then flip the harness's "far partner absent from
   deck" assertion).
1. **P0-C** (D-046; table "P0-C" in `docs/arena/2026-10-07-iteration-4.md`, each item has acceptance criteria).
   0005 is now live and frozen (D-047), so the SQL items go in **new migrations `0007+`**:
   1. R1 corroborated underage suspension (2 qualifying reporters, or 1 matched); a reporter's own `request`
      rows never qualify; single report → alert + review queue (`reviewed_at`).
   2. R3 ladder: `banned`, Restrict never un-hides, `moderation_remove_member`, rejoin with underage/banned
      tombstone → suspended, tombstones only for qualifying.
   3. R4 deletion hold (`deletion_held`) for flagged / open-report members.
   4. R5 `0007_moderation_alert.sql` (pg_cron + pg_net webhook, counts only, digest row). Pre-flight `pg_net`.
   5. R7 under-review notice links Privacy & account.
   6. R8: 0005 is frozen, so instead of collapsing it, the new migration redefines each function once (final form).
   7. R10 honesty copy, starting with the untrue `app.js:1577` profile helper sentence.
   8. R6 live rehearsal of deletion: password path done (D-049); Google re-auth still to do.
2. **Apply each new migration** in the SQL editor, verify its last object, and let the linked Vercel project redeploy.
3. **Founder-only gate items** (remind the founder):
   - auth hardening, recorded with dates (R11): email confirm, CAPTCHA, rate limits, leaked-password protection,
     anonymous sign-ins off, exact OAuth redirect list;
   - PITR and backups; error tracking; private repos; sign-off;
   - name the grievance officer; confirm the operational promises in `privacy.html` (7/90-day replies, 72 h
     under-18 review, "we do not sell your data", access by email, "ask again before matching on private
     interests", the 180-day resume sweep);
   - consent of each named person on the `auth.html` preview cards (now labelled "Example profiles");
   - counsel: IT Rules 180-day retention, DPDP log retention, CERT-In logs, deletion-before-report evidence;
   - **rotate the DB password that was once pasted in chat**.
4. **P1** (record "P1" list): A-I UX items, parked ledger items, private photo URLs + card budget, P0-E grid1
   adapter and sensitive firewall, IP dossier; then iteration-3 P1 items 15–25.
5. **Later, its own iteration:** the student world (D-040), after counsel on DPDP "verifiable consent".
6. **Open founder question:** should a ring-0 neighbour outrank a distant member with better shared interests?
   It is currently "interest qualifies, location orders".

## 4. How to work (the founder's required process)

Every iteration runs these steps:

1. **superpowers:** brainstorming → writing-plans (`docs/superpowers/plans/`) → subagent-driven execution. One
   implementer per task, then a reviewer, a fix round, and a controller check.
2. **TDD:** write the harness, unit or e2e test first, and see it fail.
3. **agent-arena for every significant decision.** Critics A (UX), B (privacy and security) and C (engine and
   IP), then a judge. Record the arena in `docs/arena/`, and the outcome in `docs/DECISIONS.md` (append-only, next
   free D-number).
4. **Criticise the current implementation with arena at the end of each iteration** (founder request), and turn it into the next backlog.
5. **ui-ux-pro-max** for UX rules, keeping the deep-wine brand (`docs/UX_SPEC.md`). **webapp-testing**/Playwright for UI.
6. Supabase for both live data and test data. Test members are `is_test`-isolated, with seed and purge in `supabase/seed/`.
7. Controller check before each push:
   - all suites green;
   - `git diff` shows 0001–0003 unchanged;
   - DECISIONS has only added lines;
   - the spec is updated in the same commit as behaviour changes.

Commands are in `CLAUDE.md`. Playwright lives outside the repo, at `/tmp/pw` (`tests/e2e/README.md` shows how to
install it).

## 5. Which file to read for what

| Need | File |
|---|---|
| Aim, rules, commands | `CLAUDE.md` |
| Product vision and who it is for | `docs/VISION.md` |
| Matching math, rings, Escape-Velocity, Passion Budget, privacy model | `docs/ORBIT_ENGINE.md` |
| Why things are the way they are | `docs/DECISIONS.md` (D-026+ is the ORBIT era) |
| The current backlog and go-live gate | `docs/arena/2026-10-07-iteration-4.md` (P0-C, P1, P2, gate table); older: `docs/arena/2026-10-03-iteration-3.md` |
| Privacy notice, account & safety UI | `privacy.html`, `privacy-account.js`, `account-deletion.js`, `report-dialog.js`, `image-compress.js` |
| Brand, tokens, flows, copy | `docs/UX_SPEC.md` |
| Applying SQL to live | `supabase/migrations/README.md` |
| Test members | `supabase/seed/README.md` |
| Data breach response (containment, notices, orphan-folder report) | `docs/BREACH_RUNBOOK.md` |
| Daily moderation (new reports, flags, the 72 h suspension queue, rejoin reviews; SQL editor as owner) | `docs/MODERATION.md` |
| SQL behaviour tests | `supabase/tests/*.test.sql` (run with `run.sh`) |
| Signup (4 steps) | `auth.html`, `script.js`, `passion-budget.js`, `pending-profile.js` |
| App, deck, quota | `app.html`, `app.js`, `deck-view.js`, `signal-quota.js` |
| Test world (tester switch, why panel) | `supabase/migrations/0008_tester_world.sql`, `why-panel.js`, `supabase/tests/d-tester-world.test.sql`, `supabase/seed/README.md` |
| App nav, tokens, skeletons, profile checklist | `app-nav.js`, `app-shell.css`, `tokens.css`, `app-skeletons.js`, `profile-checklist.js`, `profile-view.css` |
| e2e (stubbed Supabase) | `tests/e2e/*.spec.mjs` |
| Old engine to reuse plumbing from | repo `brivia-club`, `server/src/engine/` |
| Skills manifest | `docs/SKILLS.md` (vendored in `.claude/skills/`) |

## 6. Hard constraints (never break)

- Never store, echo or commit DB passwords or connection strings.
- Never connect to the live DB directly (psql). Use the founder's SQL-editor runs, or read-only connector checks.
- Never edit an applied migration.
- No exact coordinates are stored or shown. Members see bands and place names only. Never send another member's email or phone to the client.
- Matches are mutual only.
- The landing page keeps Yashika's UI.
- No third-party ranking code in ORBIT.
- Adults only until the student world ships.
- Never push to any branch except `claude/jolly-edison-49xvza`. Never open a PR unless the founder asks.
