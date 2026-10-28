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
      if (pathName === '/rest/v1/profiles') return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? own : [own]);
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
