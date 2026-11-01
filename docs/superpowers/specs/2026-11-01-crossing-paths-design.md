# Crossing paths: tell two connections when they are near each other (design, 2026-11-01)

Founder request, 2026-11-01: "when 2 people are within a certain area and they are connected they shall get a
notification. This feature only works when the location is on." Design it product-first (what, why, fit with the
design, what happens when location is off), get sign-off, then build.

## 1. What it is, in one line

When two members who are already connected happen to be in the same part of town at the same time, and both have
chosen to share that, both get one quiet alert: **"Riya is nearby. You both love chess. Say hi?"**

## 2. Why it belongs in Brivia

- The north star in `VISION.md` is "members who meet IRL". A connection that never meets is a pen pal. The moment two
  connections are in the same neighbourhood is the cheapest possible meet-up, and today both of them miss it.
- It is location-first (rule 2 of `CLAUDE.md`) without being a map: it uses the same coarse ~2 km cell as the deck.
- It is mutual by construction (rule: mutual consent). Only connections, only when both switched it on, and both are
  told at the same moment, so nobody learns anything about the other that the other does not learn about them.
- It explains itself like every card does ("You both love chess"), using real shared interests, never an invented
  reason.

What it is **not**: a live map, a "who's around me" radar for strangers, a distance read-out, or a way to follow
someone. Strangers are never involved; search and the deck are unchanged.

## 3. Who sees what (the privacy contract)

| Rule | Why |
|---|---|
| **Off by default.** Each member turns it on in Profile → Notifications → "Crossing paths", after a short explainer. | Live whereabouts are more sensitive than a home area. Opt-in, recorded with a timestamp (DPDP consent). |
| **Both must have it on.** If either is off, neither is ever alerted about the other. | Symmetry: you cannot receive what you do not give (same rule as "Show when I'm active", D-110). |
| **Connections only.** A mutual like or accepted request (a `matches` row), same world, not blocked. | Strangers never learn where you are. |
| **Both are told at the same moment.** One alert row per member, written in the same transaction. | A connection cannot quietly check where you are: if they learn you are nearby, you learn it too. |
| **Never a place, a distance or a time.** The alert says "nearby", not "1.2 km", not the area name, not "since 4:10 pm". | No triangulation, no tracking. |
| **No coordinates stored.** The browser sends lat/lng in a POST body; Postgres snaps it to the g7 cell (~2.3 km) and discards it, exactly as `set_home_location` does. | Same contract as the home area (ORBIT §9.1.4). |
| **The live cell expires after 20 minutes** and is deleted outright when the member turns the feature off, loses location permission, or signs out. | Nothing lingers. |
| **Your home area is untouched.** The live cell is a separate row; it never changes `member_orbit`, the deck or distance bands, and never counts against the 3-changes-a-day cap. | The feature cannot be used to move your pin. |
| **Mute one person.** "Don't alert me about Riya" on any alert; mute is one-way and silent. | Real life: you may not want to be pinged about everyone. |

## 4. What "nearby" means (the radius)

- Each member's live position is a g7 cell (~2.3 km square). Two members are **nearby** when their live cells' centres
  are at most **3 km** apart: the same cell or a cell sharing an edge (centre to centre ~2.3 km), not a diagonal one
  (~3.3 km).
- In plain words: usually within 1 to 3 km of each other, never more than about 5 km. That is "you could meet for
  coffee in fifteen minutes", which is the point.
- There is no radius slider in v1. A small radius would leak a more precise position; a large one ("both in Mumbai")
  is noise. One honest setting is easier to explain.

## 5. When an alert fires (frequency and cooldowns)

An alert is written for a pair only when all of these hold:

1. Both members have Crossing paths on and a fresh live cell (under 20 minutes old).
2. They are connected, same world, not blocked, neither has muted the other.
3. Their live cells are nearby (section 4).
4. **They are not neighbours already**: if both home areas are geolocated (`precision = 'cell'`) and those home cells
   are themselves nearby, skip. Flatmates and people on the same street would otherwise be pinged every day.
5. **Pair cooldown: 24 hours.** At most one alert per pair per day.
6. **Personal cap: 3 alerts a day per member.** A busy afternoon in a busy area does not become a flood.

Checks run when either member's app reports a position (section 7), so the alert appears for the one who just
reported immediately and for the other the next time they open Brivia (if it is still fresh).

**Alerts expire after 3 hours.** "Riya is nearby" from yesterday is wrong, so it leaves the panel.

**Quiet hours.** Between 22:00 and 07:00 (device time) an alert lands in the notification panel silently, with no
toast.

## 6. What happens when location is off

| Situation | What the member sees | What happens underneath |
|---|---|---|
| Crossing paths is **off** (the default) | Nothing new. The setting reads "Off". | No position is ever asked for or sent. |
| On, but the browser or phone **blocks location** | The setting shows a quiet line: "Paused: location is off for Brivia. Allow it in your browser's site settings to use Crossing paths." No pop-ups, no nagging banners. | The live cell is deleted at once. They are invisible to others and get no alerts. |
| On, location allowed, but the **app is closed** | Nothing. | The live cell ages out in 20 minutes; after that they are not "around". |
| On, but **no fix** (timeout, indoors) | Nothing; we retry at the next check. | The last cell keeps counting until it expires. |
| The **other** member has location off | You are never told that they are off or paused. | Their absence is indistinguishable from "not nearby". |

Location off never affects anything else: the home area, the deck, search, Explore events and chat all keep working.
Turning Crossing paths on asks for location permission only at that moment, from the member's own tap, never on page
load.

## 7. How the app finds the position (web app limits, stated honestly)

Brivia is a web app. A browser can only read location while Brivia is open in a visible tab; it cannot run in the
background. So v1 works when **at least one of the two has Brivia open**, and the other opened it within the last 20
minutes. That covers the common case (both on their phones around town) and is the honest limit of the web.

- While the app is visible and the feature is on and permission is already granted, the client reads a coarse position
  (`enableHighAccuracy: false`, `maximumAge: 5 min`) on load, every **5 minutes**, and when the tab becomes visible
  again, and calls `nearby_pulse(lat, lng)`. It never triggers a permission prompt on its own (Permissions API check
  first).
- The server accepts at most one pulse per member per 4 minutes and at most 24 **changes** of live cell per member per day, so a script cannot sweep a city with fake positions to find someone. A spoofer would be alerted to the victim and the
  victim to the spoofer anyway (symmetry), and Block ends it immediately.

**Later (not this build):** alerts while the app is closed need Web Push (a service worker, VAPID keys and a Supabase
Edge Function that sends). That needs keys only the founder can create, so it is phase 2. Background location needs a
native app; out of scope.

## 8. How it looks (fits the existing design)

- **Settings.** Profile → Notifications, under "Show when I'm active": a switch **"Crossing paths"** with one line,
  "Get a quiet alert when a connection is nearby. Only connections who also turned this on, never your exact place."
  The first time it is turned on, a small sheet (the house sheet: cream panel, Bodoni Moda title, wine primary button):
  title "Crossing paths", three short lines (who sees it, what they see, how to turn it off), **Turn on** and **Not
  now**. Turn on then asks the browser for location.
- **The alert in the notification panel.** Its own row above messages, like the collaboration section: the
  connection's avatar, **"Riya is nearby"**, a second line "You both love chess" (the first shared interest; if none,
  "You're connected on Brivia"), and two actions: **Say hi** (opens the chat with Riya) and a small "…" with "Don't
  alert me about Riya". The bell badge counts it like a message.
- **A toast**, only when the app is open and outside quiet hours: "Riya is nearby. Say hi?" using the existing toast.
- Wording: nearby, crossing paths, say hi, connection. Never "location of", "tracking", "radar", distances or maps.
  Same voice as D-108 (professional networking, never dating).
- Every new control is at least 44 px, keyboard-reachable, labelled, and respects reduced motion (UX_SPEC rules).

## 9. Data and server functions (migration 0021)

All tables RLS on with no client grants; reached only through `security definer` functions, like presence (0018).

- `nearby_setting(member_id pk, enabled bool, enabled_at timestamptz)`: the switch and when consent was given.
- `nearby_live(member_id pk, cell text, seen_at timestamptz)`: the live g7 cell, at most 20 minutes old.
- `nearby_move(member_id, at)`: one row per change of live cell, **no cell stored** (no location history), for the
  24-a-day cap; rows older than 24 h are purged.
- `nearby_mute(member_id, other_id, pk both)`: one-way mutes.
- `nearby_alert(id, member_id, other_id, created_at, seen_at)`: one row per recipient; pair cooldown and daily cap are
  read from it; rows older than 24 h are purged.

Functions (all `authenticated` only, profile required):

- `set_nearby_enabled(p_enabled bool)`: on records `enabled_at`; off deletes the live cell.
- `my_nearby_setting() -> bool`.
- `nearby_pulse(p_lat, p_lng) -> table(other_id uuid)`: validates like `set_home_location` (never echoes or logs the
  coordinate), applies the rate limits (`PT429`), stores the cell, finds eligible nearby connections (section 5),
  writes both alert rows and returns the caller's new alerts.
- `nearby_clear()`: deletes the caller's live cell (permission lost, sign-out).
- `my_nearby_alerts() -> table(other_id, created_at, shared_interest)`: the caller's alerts from the last 3 hours with
  the pair's top shared non-sensitive interest, never a cell.
- `set_nearby_muted(p_other uuid, p_muted bool)`.
- Unmatch and block hide the pair's alerts at once and stop new ones (checked on every read and pulse); account
  deletion removes every row (cascades). A mute keeps the alert rows, so muting cannot reset the cooldown or the cap.

## 10. Edge cases

- **Travelling together** (both in Goa): fires once, then the 24 h cooldown.
- **Same office every day** with geolocated homes far apart: at most one alert a day; mute is one tap away. If the
  founder finds it noisy in testing, raise the cooldown to 72 h (one constant).
- **City pickers** (home precision `place`): Crossing paths still works; the "already neighbours" skip uses only
  geolocated homes, so pickers are never wrongly treated as neighbours.
- **Two devices**: the latest pulse wins; one live cell per member.
- **Test world**: testers and real members never alert each other (`brivia_same_world`).
- **Blocked or reported mid-way**: the block removes alerts and stops new ones at once.
- **Clock skew**: all times are server `now()`; quiet hours are the only device-time rule and only affect the toast.

## 11. How we will know it works

- Opt-in rate among members with at least one connection.
- Alerts that lead to a chat ("Say hi" tapped, or a message within 2 hours).
- Mutes and turn-offs within a day of an alert (a noise signal; if high, tighten the cooldown).
- The north star: self-reported meet-ups.

## 12. Decisions for the founder

1. Name "Crossing paths" (alternatives: "Nearby alerts", "Connections nearby").
2. Radius ~3 km (same or touching cell), no slider.
3. 24 h pair cooldown, 3 alerts a day, alerts expire after 3 h, quiet 22:00 to 07:00.
4. v1 is in-app only (the app open on at least one side); Web Push when closed is phase 2.
