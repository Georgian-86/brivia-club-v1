// The stubbed Supabase for app.html e2e specs (moved out of deck.spec.mjs in Phase C, Task 2). Not a spec: no runner.
// Never touches a real Supabase project. Starts Vite with VITE_SUPABASE_URL pointing at the stub origin and answers
// every Supabase call from Playwright route stubs that read one mutable `state` object.
//
//   const stub = await startAppStub({ port, state });   // => { url, close, calls, ... }
//   const context = await stub.newContext(browser, { width: 375, height: 812 });
//   const page = await stub.open(context);               // app.html, waits until the auth gate lifts
//
// state (the deck.spec shape; tests mutate it between page loads, missing keys fall back to the defaults below):
//   status        deck_status() answer                      emptyDeck / deckFail   deck_candidates answers [] / 500
//   matchAll      send_signal answers 'matched'             onboarding             my_onboarding_status answers in order
//   passed, signalled (Set)  ids removed from the deck     remaining, resetsAt    the signal quota
//   matchIds      GET /rest/v1/matches (members I am matched with; a pair or= lookup answers that pair only)                search  rpc/search_members answer
//   report        'ok' | 'cap'                              rows                   deck rows (null: the default rows)
//   reportHold    a promise report_member waits on          calls, bodies          every request / every JSON answer
//   myInterests   rpc/my_interests rows (default 3)         posts                  GET community_posts rows (default [])
//   messages      GET brivia_messages rows (default [])     own, placeLabel        my profiles row / my area label
//   myInterestsFail  rpc/my_interests answers 500
//   why           rpc/deck_why (Phase D Task 3): null (default) answers [] for every target (a real member); an object
//                 { [target id]: row } answers [row] for a listed target and [] otherwise (a tester)
//   whyStatuses   deck_why statuses consumed one per call (final fix 2): 500 answers a server error, 404 answers the
//                 PGRST202 "function not found"; once spent (or unset) the normal `why` answer applies
//   routes        per-route overrides (Phase C Task 6), keyed by the path after /rest/v1/ ('rpc/deck_candidates',
//                 'community_posts'), optionally prefixed by a method ('POST community_posts'; the method key wins):
//                 { delayMs, status } waits delayMs before answering, and a status >= 400 answers that error instead;
//                 { body } answers 200 with that JSON as is (e.g. a malformed deck_candidates answer; Phase C final fixes).
//                 An error override may name its PostgREST { code, message } (polish wave C3: '42501' for an RLS refusal,
//                 '42P01' for a table that does not exist yet); the default is 'XX000' / 'stub failure'.
//                 A 2xx { status } without a body answers that status with an empty body (polish wave A5: a 201 insert).
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORIGIN = 'https://stub.supabase.local';
export const ME = '11111111-1111-4111-8111-111111111111';
export const STILL = readFileSync(path.join(repoRoot, 'source-media/assets/badminton-premium-no-shuttle.png'));
export const PHOTO = (id) => `${ORIGIN}/storage/v1/object/public/profile-photos/${id}/p.jpg`;
export const ownRow = { id: ME, name: 'Alex Me', full_name: 'Alex Me', email: 'alex@test.brivia.club', phone: '', city: null, state: null, experience: 'Founder', skills: ['Badminton'], looking_for: ['Friends'], created_at: new Date(Date.now() - 9e6).toISOString() };
export const defaultDeckRows = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', name: 'Asha Band', photo_url: PHOTO('aaaaaaaa-aaaa-4aaa-8aaa-000000000001'), cover_url: null, experience: 'Product designer', skills: ['Badminton', 'Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: ['Badminton'] },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002', name: 'Bilal Place', photo_url: PHOTO('aaaaaaaa-aaaa-4aaa-8aaa-000000000002'), cover_url: null, experience: 'Engineer', skills: ['Badminton'], looking_for: ['Mentor'], distance_band: 'Pune', shared_interests: ['Badminton'] },
];
export const defaultInterests = [
  { interest_id: 'sports.racket.badminton', label: 'Badminton', points: 40, mode: 'do' },
  { interest_id: 'games.board.chess', label: 'Chess', points: 35, mode: 'do' },
  { interest_id: 'arts.writing.poetry', label: 'Poetry', points: 25, mode: 'learn' },
];

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
export const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: ownRow.email, user_metadata: { name: 'Alex Me' }, app_metadata: {}, created_at: ownRow.created_at };
export const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

export const freshState = () => ({ status: 'caught_up', emptyDeck: false, deckFail: false, matchAll: false, onboarding: [true], onboardingCalls: 0, passed: new Set(), signalled: new Set(), remaining: 30, resetsAt: null, matchIds: [], search: [], report: 'ok', rows: null, why: null, whyStatuses: null });

export const startAppStub = async ({ port, state = {}, deckRows = defaultDeckRows } = {}) => {
  const st = state;
  for (const [key, value] of Object.entries(freshState())) if (!(key in st)) st[key] = value;
  st.calls ||= [];
  st.bodies ||= [];
  const url = `http://127.0.0.1:${port}`;
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const close = async () => { try { process.kill(-vite.pid, 'SIGTERM'); } catch { vite.kill('SIGTERM'); } };
  let up = false;
  for (let i = 0; i < 100 && !up; i += 1) {
    try { const res = await fetch(`${url}/app.html`); up = res.ok; } catch { /* not up yet */ }
    if (!up) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!up) { await close(); throw new Error('vite did not start'); }

  const attach = async (context) => {
    await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);
    // D-100: a first run counts messages before "now" as read; stubbed members start with an old read baseline, so the
    // stubbed messages are unread (a spec that sets its own read state first keeps it).
    await context.addInitScript(([key]) => { if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify({ baseline: '2020-01-01T00:00:00.000Z', read: {} })); }, [`brivia-chat-read:${ME}`]);
    // The first-run deck tutorial (D-094) stays out of the way unless a spec asks for it (state.deckTutorial).
    if (!st.deckTutorial) await context.addInitScript(() => { try { if (location.pathname === '/app.html') window.localStorage.setItem('brivia-deck-tutorial', 'hidden'); } catch { /* none */ } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const request = route.request();
      const reqUrl = new URL(request.url());
      const method = request.method();
      const pathName = reqUrl.pathname;
      const postData = request.postData();
      st.calls.push({ method, path: pathName, body: postData });
      const json = (status, payload) => { const body = JSON.stringify(payload); st.bodies.push({ path: pathName, body }); return route.fulfill({ status, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } }); };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
      // Member photos: a neutral still from the repo (no real person), so screenshots show a real card.
      if (pathName.startsWith('/storage/v1/object/public/')) return route.fulfill({ status: 200, contentType: 'image/png', body: STILL, headers: { 'access-control-allow-origin': '*' } });
      const short = pathName.replace(/^\/rest\/v1\//, '');
      const override = st.routes?.[`${method} ${short}`] || st.routes?.[short];
      if (override?.delayMs) await new Promise((resolve) => setTimeout(resolve, override.delayMs));
      if (override?.status >= 400) return json(override.status, { code: override.code || 'XX000', message: override.message || 'stub failure' });
      if (override?.status >= 200 && override.status < 300 && !('body' in override)) return route.fulfill({ status: override.status, body: '', headers: { 'access-control-allow-origin': '*' } });
      if (override && 'body' in override) return json(200, override.body);
      const own = st.own || ownRow;
      if (pathName === '/rest/v1/profiles') {
        // An update returns the updated row, as PostgREST does (D-104: experience and bio are read back from it).
        if (method === 'PATCH') { let patch = {}; try { patch = JSON.parse(postData || '{}'); } catch { /* not JSON */ } st.own = { ...own, ...patch }; return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? st.own : [st.own]); }
        return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? own : [own]);
      }
      // Storage uploads and removals (multipart bodies): accepted, nothing stored.
      if (pathName.startsWith('/storage/v1/')) return json(200, { Key: pathName.replace('/storage/v1/object/', ''), Id: 'stub-object' });
      let args = {};
      try { args = JSON.parse(postData || '{}'); } catch { /* not JSON */ }
      if (pathName === '/rest/v1/rpc/my_onboarding_status') {
        const answer = st.onboarding[Math.min(st.onboardingCalls, st.onboarding.length - 1)];
        st.onboardingCalls += 1;
        if (answer === 'error') return json(500, { code: 'XX000', message: 'stub failure' });
        return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: st.placeLabel || 'Kochi', completed: answer }]);
      }
      if (pathName === '/rest/v1/rpc/my_interests') return st.myInterestsFail ? json(500, { code: 'XX000', message: 'stub failure' }) : json(200, st.myInterests || defaultInterests);
      if (pathName === '/rest/v1/rpc/deck_candidates') {
        if (st.deckFail) return json(500, { code: 'XX000', message: 'stub failure' });
        if (st.emptyDeck) return json(200, []);
        return json(200, (st.rows || deckRows).filter((row) => !st.passed.has(row.id) && !st.signalled.has(row.id)).slice(0, Number(args.p_limit) || 12));
      }
      if (pathName === '/rest/v1/rpc/deck_status') return json(200, st.status);
      if (pathName === '/rest/v1/rpc/deck_why' && st.whyStatuses?.length) {
        const code = st.whyStatuses.shift();
        if (code === 404) return json(404, { code: 'PGRST202', message: 'Could not find the function public.deck_why' });
        if (code >= 400) return json(code, { code: 'XX000', message: 'stub failure' });
      }
      if (pathName === '/rest/v1/rpc/deck_why') return json(200, st.why && st.why[args.p_target] ? [st.why[args.p_target]] : []);
      if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: st.remaining, resets_at: st.resetsAt, live_unanswered: 0, live_limit: 100 }]);
      if (pathName === '/rest/v1/rpc/send_signal') {
        st.signalled.add(args.p_to); st.remaining = Math.max(0, st.remaining - 1); st.resetsAt = '2026-10-04T15:00:00+00:00';
        return json(200, [{ status: st.matchAll ? 'matched' : 'sent', remaining: st.remaining, resets_at: st.resetsAt }]);
      }
      if (pathName === '/rest/v1/interaction' && method === 'POST') {
        if (args.event === 'pass') st.passed.add(args.target_id);
        return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      if (pathName === '/rest/v1/rpc/report_member') {
        if (st.reportHold) await st.reportHold;
        if (st.report === 'cap') return json(429, { code: 'PT429', message: 'report_cap', details: null, hint: null });
        st.passed.add(args.p_target);
        return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      if (pathName === '/rest/v1/brivia_blocks' && method === 'POST') return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
      if (pathName === '/rest/v1/rpc/list_members') return json(200, deckRows);
      if (pathName === '/rest/v1/rpc/search_members') return json(200, st.search);
      if (pathName === '/rest/v1/matches' && method === 'GET') {
        const rows = st.matchIds.map((id) => ({ user1_id: ME, user2_id: id }));
        // A pair lookup (hasMatchWith: or=(and(user1_id.eq.X,user2_id.eq.Y),and(...))) answers only that pair's row; the
        // member-wide read (or=(user1_id.eq.ME,user2_id.eq.ME)) answers every row (polish wave C3 fix round).
        const pairs = [...(reqUrl.searchParams.get('or') || '').matchAll(/and\(user1_id\.eq\.([^,]+),user2_id\.eq\.([^)]+)\)/g)].map((m) => [m[1], m[2]]);
        return json(200, pairs.length ? rows.filter((row) => pairs.some(([u1, u2]) => row.user1_id === u1 && row.user2_id === u2)) : rows);
      }
      if (pathName === '/rest/v1/community_posts' && method === 'GET') {
        // One post by id (a shared post card in chat): ?id=eq.<id>, answered as an object when asked for one.
        const one = reqUrl.searchParams.get('id');
        if (one) {
          const found = (st.posts || []).filter((post) => `eq.${post.id}` === one);
          return (request.headers().accept || '').includes('vnd.pgrst.object') ? (found.length ? json(200, found[0]) : json(200, null)) : json(200, found);
        }
        return json(200, st.posts || []);
      }
      // D-101 post activity (0015): st.activity rows for rpc/post_activity, st.comments for community_post_comments
      // (a POST adds a row by ME and answers it; a DELETE removes ?id=eq.X and its replies), shares answer 201.
      if (pathName === '/rest/v1/rpc/post_activity') return json(200, (st.activity || []).filter((row) => (args.p_post_ids || []).includes(row.post_id)));
      if (pathName === '/rest/v1/community_post_comments') {
        st.comments ||= [];
        if (method === 'GET') return json(200, st.comments.filter((c) => `eq.${c.post_id}` === reqUrl.searchParams.get('post_id')));
        if (method === 'POST') {
          const row = { id: `cmt-${st.comments.length + 1}-${Date.now()}`, author_id: ME, parent_id: null, created_at: new Date().toISOString(), ...args };
          st.comments.push(row);
          return json(201, (request.headers().accept || '').includes('vnd.pgrst.object') ? row : [row]);
        }
        if (method === 'DELETE') {
          const gone = new Set([String(reqUrl.searchParams.get('id') || '').replace(/^eq\./, '')]);
          let grew = true;
          while (grew) { grew = false; for (const c of st.comments) if (c.parent_id && gone.has(c.parent_id) && !gone.has(c.id)) { gone.add(c.id); grew = true; } }
          st.comments = st.comments.filter((c) => !gone.has(c.id));
          return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
        }
      }
      // D-108 requests: st.requests rows ({ from_id, note, created_at }) answer GET connection_requests; answering one
      // removes it and logs st.responses; an accept makes a match unless the id is in st.blockedAccept.
      if (pathName === '/rest/v1/connection_requests' && method === 'GET') return json(200, st.requests || []);
      if (pathName === '/rest/v1/rpc/respond_connection_request') {
        if (st.respondHold) await st.respondHold;
        if (st.respondFail) return json(500, { code: 'XX000', message: 'stub failure' });
        if ((st.respondGone || []).includes(args.p_from)) return json(400, { code: 'P0002', message: 'no live request' });
        (st.responses ||= []).push(args);
        st.requests = (st.requests || []).filter((row) => row.from_id !== args.p_from);
        if (args.p_accept && !(st.blockedAccept || []).includes(args.p_from) && !st.matchIds.includes(args.p_from)) st.matchIds.push(args.p_from);
        return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      // D-110 active status: st.activeIds (members seen just now), st.presenceVisible (my switch, default on);
      // st.noPresence answers PGRST202 as before 0018. Only my matches are answered, as the server does.
      if (['/rest/v1/rpc/touch_presence', '/rest/v1/rpc/connection_presence', '/rest/v1/rpc/connection_last_seen', '/rest/v1/rpc/set_presence_visible', '/rest/v1/rpc/my_presence_visible'].includes(pathName) && st.noPresence) {
        return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      }
      if (pathName === '/rest/v1/rpc/touch_presence') { st.touches = (st.touches || 0) + 1; return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
      if (pathName === '/rest/v1/rpc/my_presence_visible') return json(200, st.presenceVisible !== false);
      if (pathName === '/rest/v1/rpc/set_presence_visible') { st.presenceVisible = args.p_visible; return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
      // D-150 (0042): connection_last_seen adds st.lastSeen[id] (an ISO time); st.noReceipts answers PGRST202 for it and
      // for mark_messages_delivered / mark_conversation_read (recorded in st.receiptCalls), as before 0042.
      if (['/rest/v1/rpc/connection_last_seen', '/rest/v1/rpc/mark_messages_delivered', '/rest/v1/rpc/mark_conversation_read'].includes(pathName) && st.noReceipts) {
        return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      }
      if (pathName === '/rest/v1/rpc/connection_last_seen') {
        return json(200, (args.p_ids || []).filter((id) => st.matchIds.includes(id)).map((id) => {
          const shown = st.presenceVisible !== false;
          return { member_id: id, active: shown && (st.activeIds || []).includes(id), last_seen_at: shown ? (st.lastSeen || {})[id] || null : null };
        }));
      }
      if (pathName === '/rest/v1/rpc/mark_messages_delivered' || pathName === '/rest/v1/rpc/mark_conversation_read') {
        (st.receiptCalls ||= []).push({ fn: pathName.slice(13), args });
        return json(200, 1);
      }
      if (pathName === '/rest/v1/rpc/connection_presence') {
        return json(200, (args.p_ids || []).filter((id) => st.matchIds.includes(id)).map((id) => ({ member_id: id, active: st.presenceVisible !== false && (st.activeIds || []).includes(id) })));
      }
      // D-119 Crossing paths (0021): st.nearby = { enabled, alerts: [my_nearby_alerts rows], pulses: [], cleared, muted: [] };
      // null (the default) answers the PGRST202 "function not found" of a database without 0021.
      if (pathName.startsWith('/rest/v1/rpc/') && ['set_nearby_enabled', 'my_nearby_setting', 'nearby_pulse', 'nearby_clear', 'my_nearby_alerts', 'set_nearby_muted'].includes(pathName.slice(13))) {
        if (!st.nearby) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
        const nb = st.nearby;
        const fn = pathName.slice(13);
        if (fn === 'my_nearby_setting') return json(200, Boolean(nb.enabled));
        if (fn === 'set_nearby_enabled') { nb.enabled = Boolean(args.p_enabled); return json(200, nb.enabled); }
        if (fn === 'nearby_pulse') { (nb.pulses ||= []).push(args); return json(200, []); }
        if (fn === 'nearby_clear') { nb.cleared = (nb.cleared || 0) + 1; return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
        if (fn === 'my_nearby_alerts') return json(200, nb.enabled ? (nb.alerts || []).filter((a) => !(nb.muted || []).includes(a.other_id)) : []);
        if (fn === 'set_nearby_muted') { (nb.muted ||= []).push(args.p_other); return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
      }
      // D-134 (0030): st.notifications (my_notifications rows, the server's one store); read and dismiss change them in
      // place, so two pages on the same stub see the same state (phone and laptop). st.radiusSaved, st.pushSubs,
      // st.pushCalls (the push-notify Edge Function).
      // D-138 (0034): my_notifications_v2 adds place_name; st.notificationsV1Only answers it as "not found" (before 0034).
      if (pathName === '/rest/v1/rpc/my_notifications_v2' && (st.notificationsV1Only || !st.notifications)) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      if (pathName === '/rest/v1/rpc/my_notifications_v2' || pathName === '/rest/v1/rpc/my_notifications') return st.notifications ? json(200, st.notifications) : json(404, { code: 'PGRST202', message: 'Could not find the function' });
      if (pathName === '/rest/v1/rpc/mark_notifications_read') {
        let n = 0;
        (st.notifications || []).forEach((row) => { if ((args.p_ids || []).includes(row.id) && !row.read_at) { row.read_at = new Date().toISOString(); n += 1; } });
        (st.markedRead ||= []).push(...(args.p_ids || []));
        return json(200, n);
      }
      if (pathName === '/rest/v1/rpc/dismiss_notification') {
        (st.notifications || []).forEach((row) => { if (row.id === args.p_id) { row.dismissed_at = new Date().toISOString(); row.read_at ||= row.dismissed_at; } });
        return json(200, true);
      }
      if (pathName === '/rest/v1/rpc/set_nearby_radius') { st.radiusSaved = args.p_km; return json(200, args.p_km); }
      if (pathName === '/rest/v1/rpc/save_push_subscription') { (st.pushSubs ||= []).push(args); return json(200, true); }
      if (pathName === '/rest/v1/rpc/delete_push_subscription') { st.pushSubs = (st.pushSubs || []).filter((x) => x.p_endpoint !== args.p_endpoint); return json(200, true); }
      if (pathName === '/functions/v1/push-notify') { st.pushCalls = (st.pushCalls || 0) + 1; return json(200, { sent: 0 }); }
      // D-131 Nearby (0029): st.nearbyPeople (nearby_discover rows, each with distance_band '1' | '3' | '5'); null answers
      // PGRST202 as before 0029. st.nearbyLikedMe: ids whose connect back makes a match. st.nearbyConsent === false: an
      // alerts-only switch from before 0029. Discovery needs the switch on and a pulse first ('location needed').
      if (['/rest/v1/rpc/nearby_discover', '/rest/v1/rpc/nearby_pass', '/rest/v1/rpc/nearby_connect', '/rest/v1/rpc/my_nearby_matches'].includes(pathName)) {
        if (!st.nearbyPeople) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
        const fn = pathName.slice(13);
        const nb = st.nearby || {};
        if (fn === 'nearby_discover') {
          (st.nearbyDiscovers ||= []).push(args);
          if (!nb.enabled || st.nearbyConsent === false) return json(400, { code: '22023', message: 'nearby off' });
          if (!(nb.pulses || []).length) return json(400, { code: '22023', message: 'location needed' });
          const gone = new Set([...(st.nearbyPassed || []), ...(st.nearbyConnects || []).map((c) => c.p_to), ...st.matchIds]);
          return json(200, st.nearbyPeople.filter((p) => Number(p.distance_band) <= Number(args.p_radius_km) && !gone.has(p.member_id)));
        }
        if (fn === 'nearby_pass') { (st.nearbyPassed ||= []).push(args.p_other); return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
        if (fn === 'nearby_connect') {
          (st.nearbyConnects ||= []).push(args);
          const matched = (st.nearbyLikedMe || []).includes(args.p_to);
          if (matched) {
            st.matchIds.push(args.p_to);
            const row = st.nearbyPeople.find((p) => p.member_id === args.p_to) || {};
            (st.nearbyMatches ||= []).unshift({ other_id: args.p_to, name: row.name, photo_url: row.photo_url, matched_at: new Date().toISOString() });
          }
          return json(200, [{ status: matched ? 'matched' : 'sent', remaining: 28, resets_at: null }]);
        }
        if (fn === 'my_nearby_matches') return json(200, st.nearbyMatches || []);
      }
      // D-117 events (0020): st.events (list_events rows; null answers the PGRST202 "function not found" of a database
      // without 0020), st.companions (event_companions rows), st.companionDefault; RSVPs change st.events in place.
      if (['/rest/v1/rpc/list_events', '/rest/v1/rpc/set_event_rsvp', '/rest/v1/rpc/set_companion_default', '/rest/v1/rpc/my_event_prefs', '/rest/v1/rpc/event_companions', '/rest/v1/rpc/save_member_event', '/rest/v1/rpc/cancel_member_event', '/rest/v1/rpc/delete_member_event'].includes(pathName) && !st.events) {
        return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      }
      if (pathName === '/rest/v1/rpc/list_events') return json(200, st.events.filter((e) => !args.p_category || e.category === args.p_category));
      if (pathName === '/rest/v1/rpc/my_event_prefs') return json(200, [{ companion_default: Boolean(st.companionDefault) }]);
      if (pathName === '/rest/v1/rpc/set_companion_default') { st.companionDefault = Boolean(args.p_on); st.events.forEach((e) => { if (e.going) e.wants_companion = st.companionDefault; }); return json(200, st.companionDefault); }
      // 0022 (D-121) semantics: p_going true registers (capacity, a paid event's seat is pending_payment), false cancels,
      // null keeps the registration and changes only the companion choice (which needs a registration).
      if (pathName === '/rest/v1/rpc/set_event_rsvp') {
        (st.rsvps ||= []).push(args);
        const e = st.events.find((x) => x.id === args.p_event);
        if (!e || (e.status && e.status !== 'published')) return json(400, { code: '22023', message: 'invalid event' });
        if (args.p_going === false) {
          if (e.going) { e.going_count -= 1; e.registered_count = Math.max(0, (e.registered_count ?? e.going_count) - 1); if (e.wants_companion) e.companion_count -= 1; }
          Object.assign(e, { going: false, wants_companion: false, my_status: null });
          return json(200, [{ going: false, wants_companion: false, status: null }]);
        }
        if (args.p_going === true && !e.going) {
          if (e.capacity && (e.registered_count || 0) >= e.capacity) return json(400, { code: 'P0001', message: 'event_full' });
          const wants = args.p_wants_companion === null ? (e.my_status === 'interested' ? Boolean(e.wants_companion) : Boolean(st.companionDefault)) : Boolean(args.p_wants_companion);
          const status = e.fee_inr > 0 && !e.is_mine ? 'pending_payment' : 'confirmed';
          e.going_count += 1; e.registered_count = (e.registered_count || 0) + 1; if (wants) e.companion_count += 1;
          if (e.my_status === 'interested') { e.interested_count = Math.max(0, (e.interested_count || 0) - 1); if (e.wants_companion) e.companion_count -= 1; }
          Object.assign(e, { going: true, wants_companion: wants, my_status: status });
          return json(200, [{ going: true, wants_companion: wants, status }]);
        }
        if (args.p_wants_companion !== null && args.p_wants_companion !== undefined) {
          if (!e.going && e.my_status !== 'interested') return json(400, { code: '22023', message: 'register first' });
          const wants = Boolean(args.p_wants_companion);
          e.companion_count += wants === e.wants_companion ? 0 : wants ? 1 : -1;
          e.wants_companion = wants;
        }
        return json(200, [{ going: e.going, wants_companion: e.wants_companion, status: e.my_status || 'confirmed' }]);
      }
      // D-125 (0025): "Show interest" (st.interests records each call) and the brochure (st.brochures). st.noInterest
      // answers PGRST202 for both, as a database without 0025.
      if (['/rest/v1/rpc/set_event_interest', '/rest/v1/rpc/set_event_brochure'].includes(pathName) && st.noInterest) {
        return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      }
      if (pathName === '/rest/v1/rpc/set_event_interest') {
        (st.interests ||= []).push(args);
        const e = st.events.find((x) => x.id === args.p_event);
        if (!e || e.is_mine) return json(400, { code: '22023', message: 'invalid event' });
        if (e.going) { if (args.p_on && args.p_wants_companion !== null) e.wants_companion = Boolean(args.p_wants_companion); return json(200, [{ interested: true, wants_companion: e.wants_companion, status: e.my_status }]); }
        const was = e.my_status === 'interested';
        if (!args.p_on) {
          if (was) { e.interested_count = Math.max(0, (e.interested_count || 0) - 1); if (e.wants_companion) e.companion_count -= 1; }
          Object.assign(e, { my_status: null, wants_companion: false });
          return json(200, [{ interested: false, wants_companion: false, status: null }]);
        }
        const wants = args.p_wants_companion === null || args.p_wants_companion === undefined ? (was ? e.wants_companion : Boolean(st.companionDefault)) : Boolean(args.p_wants_companion);
        if (!was) e.interested_count = (e.interested_count || 0) + 1;
        e.companion_count += wants === (was && e.wants_companion) ? 0 : wants ? 1 : -1;
        Object.assign(e, { my_status: 'interested', wants_companion: wants });
        return json(200, [{ interested: true, wants_companion: wants, status: 'interested' }]);
      }
      if (pathName === '/rest/v1/rpc/set_event_brochure') {
        (st.brochures ||= []).push(args);
        const e = st.events.find((x) => x.id === args.p_id);
        if (e) e.brochure_url = args.p_url || null;
        return json(200, args.p_url || null);
      }
      // save_member_event / cancel / delete (0022): st.saved records each body; st.saveError answers an error once.
      if (pathName === '/rest/v1/rpc/save_member_event') {
        (st.saved ||= []).push(args);
        if (st.saveError) { const err = st.saveError; st.saveError = null; return json(400, err); }
        const f = args.p_fields || {};
        const id = args.p_id || `m-${st.saved.length}`;
        const at = (t) => (f.date && t ? new Date(`${f.date}T${t}:00+05:30`).toISOString() : null);
        const place = (st.places || []).find((p) => p.id === f.place_id);
        const old = st.events.find((x) => x.id === id) || {};
        const row = {
          ...old, id, title: f.title, description: f.description, category: f.category || 'other', custom_category: f.custom_category || null, tags: [], venue_name: f.venue_name || null,
          venue_area: place?.name || null, venue_address: f.venue_address || '', place_id: f.place_id || '', starts_at: at(f.start_time), ends_at: at(f.end_time),
          image_key: '', image_url: f.image_url || '', gallery_urls: f.gallery_urls || [], map_url: f.map_url || '', distance_km: place ? 3 : null,
          going_count: old.going_count || 0, companion_count: old.companion_count || 0, going: Boolean(old.going), wants_companion: Boolean(old.wants_companion),
          friends: [], status: args.p_publish ? 'published' : 'draft', is_mine: true, organizer: { id: (st.own || ownRow).id, name: (st.own || ownRow).name, photo_url: null },
          capacity: Number(f.capacity) || null, registered_count: old.registered_count || 0, fee_inr: Number(f.fee_inr) || 0, my_status: old.my_status || null,
          contact: { email: f.contact_email || null, phone: f.contact_phone || null, link: f.contact_link || null, public: Boolean(f.contact_public) },
        };
        st.events = [row, ...st.events.filter((x) => x.id !== id)];
        return json(200, id);
      }
      // D-123 Find a Companion (0023): st.companionEvents (companion_events rows; null answers PGRST202), st.companionDecks
      // ({ [event id]: companion_deck rows }), st.likedMe (ids who already liked me: a like on them matches), st.companionMatches
      // (my_companion_matches rows). A swipe removes the card; a match also adds a connection (matchIds).
      if (['/rest/v1/rpc/companion_events', '/rest/v1/rpc/companion_deck', '/rest/v1/rpc/companion_swipe', '/rest/v1/rpc/my_companion_matches', '/rest/v1/rpc/mark_companion_match_seen'].includes(pathName) && !st.companionEvents) {
        return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      }
      if (pathName === '/rest/v1/rpc/companion_events') return json(200, st.companionEvents.map((e) => ({ ...e, to_see: (st.companionDecks?.[e.event_id] || []).length })));
      if (pathName === '/rest/v1/rpc/companion_deck') return json(200, st.companionDecks?.[args.p_event] || []);
      if (pathName === '/rest/v1/rpc/companion_swipe') {
        (st.swipes ||= []).push(args);
        const deckRows = st.companionDecks?.[args.p_event] || [];
        const row = deckRows.find((r) => r.member_id === args.p_target);
        if (!row) return json(400, { code: '22023', message: 'not available' });
        st.companionDecks[args.p_event] = deckRows.filter((r) => r.member_id !== args.p_target);
        const matched = Boolean(args.p_like && (st.likedMe || []).includes(args.p_target));
        if (matched) {
          if (!st.matchIds.includes(args.p_target)) st.matchIds.push(args.p_target);
          const ev = st.companionEvents.find((e) => e.event_id === args.p_event) || {};
          (st.companionMatches ||= []).unshift({ match_id: `cm-${args.p_target}`, event_id: args.p_event, event_title: ev.title, starts_at: ev.starts_at, venue_name: ev.venue_name, other_id: row.member_id, other_name: row.name, other_photo_url: row.photo_url, created_at: new Date().toISOString(), seen: true });
        }
        return json(200, [{ matched, match_id: matched ? `cm-${args.p_target}` : null }]);
      }
      // D-124 send_connect_request: 'chat' for a connection (the note joins their chat), else 'sent'; st.connectRequests records each.
      if (pathName === '/rest/v1/rpc/send_connect_request') {
        (st.connectRequests ||= []).push(args);
        if (st.connectFail) return json(500, { code: 'XX000', message: 'stub failure' });
        const chat = st.matchIds.includes(args.p_to);
        if (chat) (st.sent ||= []).push({ sender_id: ME, recipient_id: args.p_to, body: args.p_note });
        return json(200, [{ status: chat ? 'chat' : 'sent', remaining: 29, resets_at: null }]);
      }
      if (pathName === '/rest/v1/rpc/my_companion_matches') return json(200, st.companionMatches || []);
      if (pathName === '/rest/v1/rpc/mark_companion_match_seen') { (st.companionMatches || []).forEach((m) => { if (m.match_id === args.p_match) m.seen = true; }); return json(200, true); }
      if (pathName === '/rest/v1/rpc/cancel_member_event') { const e = st.events.find((x) => x.id === args.p_id); if (e) e.status = 'cancelled'; return json(200, true); }
      if (pathName === '/rest/v1/rpc/delete_member_event') { st.events = st.events.filter((x) => x.id !== args.p_id); return json(200, true); }
      // D-140 (0035/0036): the directories. search_cities answers from st.places; companies from st.companies
      // (search_companies by name), member_work from st.work ({ [id]: row }), set_my_work / add_company record.
      if (pathName === '/rest/v1/rpc/search_cities') {
        const q = String(args.p_q || '').split(',')[0].trim().toLowerCase();
        return json(200, q.length < 2 ? [] : (st.places || []).filter((p) => p.name.toLowerCase().includes(q) || String(p.region || '').toLowerCase().includes(q)).map(({ id, name, region, country }) => ({ id, name, region, country })));
      }
      if (pathName === '/rest/v1/rpc/ensure_place') return json(200, String(args.p_id || '').replace(/^geo-/, 'place-'));
      if (pathName === '/rest/v1/rpc/search_companies') {
        const q = String(args.p_q || '').trim().toLowerCase();
        return json(200, (st.companies || []).filter((c) => c.name.toLowerCase().startsWith(q) || String(c.domain || '').startsWith(q)));
      }
      if (pathName === '/rest/v1/rpc/member_work') {
        return json(200, (args.p_ids || []).map((id) => (st.work || {})[id] && { member_id: id, ...(st.work || {})[id] }).filter(Boolean));
      }
      if (pathName === '/rest/v1/rpc/set_my_work') {
        (st.workSaved ||= []).push(args);
        const c = (st.companies || []).find((x) => x.id === args.p_company);
        st.work = { ...(st.work || {}), [ME]: { job_title: args.p_title, company_id: args.p_company, company_name: c?.name || null, logo_path: c?.logo_path || null, verified: Boolean(c?.verified) } };
        return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      if (pathName === '/rest/v1/rpc/set_company_logo') {
        const c = (st.companies || []).find((x) => x.id === args.p_company);
        (st.logosSet ||= []).push(args);
        if (c?.logo_path) return json(400, { code: '22023', message: 'logo already set' });
        if (c) c.logo_path = args.p_path;
        return json(200, args.p_path);
      }
      if (pathName === '/rest/v1/rpc/add_company') {
        const c = { id: `c-${(st.companies || []).length + 1}`, name: args.p_name, domain: args.p_website || null, logo_path: args.p_logo_path, verified: false, source: 'member' };
        (st.companies ||= []).push(c); (st.companiesAdded ||= []).push(args);
        return json(200, c.id);
      }
      if (pathName === '/rest/v1/place' && st.places) {
        const q = String(reqUrl.searchParams.get('or') || '').match(/name\.ilike\.\*([^*]*)\*/)?.[1]?.toLowerCase() || '';
        return json(200, st.places.filter((p) => !q || p.name.toLowerCase().includes(q)).map(({ id, name, region, country }) => ({ id, name, region, country })));
      }
      if (pathName === '/rest/v1/rpc/event_companions') return json(200, st.companions || []);
      if (pathName === '/rest/v1/community_post_shares' && method === 'POST') return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
      if (pathName === '/rest/v1/brivia_messages' && method === 'POST') { (st.sent ||= []).push(args); return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } }); }
      if (pathName === '/rest/v1/brivia_messages' && method === 'GET') return json(200, st.messages || []);
      if (pathName.startsWith('/rest/v1/')) return json(200, []);
      return json(200, {});
    });
    await context.route((target) => !target.href.startsWith(url) && !target.href.startsWith(ORIGIN), (route) => route.abort());
    await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
    return context;
  };
  const newContext = async (browser, viewport, options = {}) => attach(await browser.newContext({ viewport, ...options }));
  const open = async (context, { path: pagePath = '/app.html', errors } = {}) => {
    const page = await context.newPage();
    if (errors) {
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`); });
    }
    await page.goto(`${url}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
    return page;
  };
  return { url, origin: ORIGIN, close, calls: st.calls, state: st, attach, newContext, open };
};
