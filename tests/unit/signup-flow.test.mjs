// Phase E guided signup: flow model. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, stepLabel, resumeScreen, backTarget, parseOtp, signupMethods } from '../../signup-flow.js';

test('screen order per path', () => {
  assert.deepEqual(SCREENS.email, ['welcome', 'email', 'code', 'adult', 'name', 'area', 'interests', 'reveal']);
  assert.deepEqual(SCREENS.google, ['welcome', 'adult', 'name', 'area', 'interests', 'reveal']);
});

test('stepLabel counts question screens only', () => {
  assert.equal(stepLabel('email', 'email'), 'Step 1 of 6');
  assert.equal(stepLabel('email', 'code'), 'Step 2 of 6');
  assert.equal(stepLabel('email', 'interests'), 'Step 6 of 6');
  assert.equal(stepLabel('google', 'adult'), 'Step 1 of 4');
  assert.equal(stepLabel('google', 'interests'), 'Step 4 of 4');
  assert.equal(stepLabel('email', 'welcome'), null);
  assert.equal(stepLabel('google', 'reveal'), null);
  assert.equal(stepLabel('email', 'reveal'), null);
  assert.equal(stepLabel('google', 'code'), null);
});

const full = { adult_declared: true, has_name: true, has_cell: true, interests: 3, points: 20, completed: false };
test('resumeScreen: no session is welcome', () => {
  assert.equal(resumeScreen({ session: null, status: full, path: 'email' }), 'welcome');
});
test('resumeScreen: completed is done', () => {
  assert.equal(resumeScreen({ session: {}, status: { ...full, completed: true }, path: 'google' }), 'done');
});
test('resumeScreen: first undone question', () => {
  const s = {};
  assert.equal(resumeScreen({ session: s, status: { ...full, adult_declared: false, has_name: false, has_cell: false, interests: 0, points: 0 }, path: 'email' }), 'adult');
  assert.equal(resumeScreen({ session: s, status: { ...full, has_name: false, has_cell: false, interests: 0, points: 0 }, path: 'email' }), 'name');
  assert.equal(resumeScreen({ session: s, status: { ...full, has_cell: false, interests: 0, points: 0 }, path: 'email' }), 'area');
  assert.equal(resumeScreen({ session: s, status: { ...full, interests: 0, points: 0 }, path: 'email' }), 'interests');
  assert.equal(resumeScreen({ session: s, status: { ...full, points: 12 }, path: 'google' }), 'interests');
  assert.equal(resumeScreen({ session: s, status: { ...full, interests: 13 }, path: 'google' }), 'interests');
  assert.equal(resumeScreen({ session: s, status: full, path: 'google' }), 'done');
});
test('resumeScreen: missing status counts as nothing done', () => {
  assert.equal(resumeScreen({ session: {}, status: null, path: 'email' }), 'adult');
});

test('backTarget', () => {
  assert.equal(backTarget('email', 'welcome', false), null);
  assert.equal(backTarget('email', 'reveal', false), null);
  assert.equal(backTarget('google', 'reveal', true), null);
  assert.equal(backTarget('email', 'email', false), 'welcome');
  assert.equal(backTarget('email', 'code', false), 'email');
  assert.equal(backTarget('email', 'adult', false), 'code');
  assert.equal(backTarget('email', 'adult', true), 'welcome');
  assert.equal(backTarget('email', 'name', true), 'adult');
  assert.equal(backTarget('google', 'adult', true), 'welcome');
  assert.equal(backTarget('google', 'interests', true), 'area');
  for (const p of ['email', 'google']) for (const s of SCREENS[p]) {
    const t = backTarget(p, s, true);
    assert.ok(t !== 'email' && t !== 'code');
  }
});

test('parseOtp', () => {
  assert.equal(parseOtp('123456'), '123456');
  assert.equal(parseOtp('123 456'), '123456');
  assert.equal(parseOtp('123-456'), '123456');
  assert.equal(parseOtp('Your code is 654321.'), '654321');
  assert.equal(parseOtp('12345'), null);
  assert.equal(parseOtp('1234567'), null);
  assert.equal(parseOtp(''), null);
  assert.equal(parseOtp(null), null);
});

// Phase E Task 3: a code written with one internal space or dash inside a sentence (an SMS or email preview).
test('parseOtp finds a spaced or dashed code inside a sentence, never a 7-digit run', () => {
  assert.equal(parseOtp('Your code is 123 456.'), '123456');
  assert.equal(parseOtp('Your Brivia code: 123-456 (valid 1 hour)'), '123456');
  assert.equal(parseOtp('Your code is 1234567.'), null);
  assert.equal(parseOtp('Your code is 123 4567.'), null);
  assert.equal(parseOtp('Your code is 1234 567.'), null);
  assert.equal(parseOtp('Call 12 34 56 now'), null);
  assert.equal(parseOtp('On 2026-10-13 your code is 654 321.'), '654321');
});

// Phase E Task 3: VITE_SIGNUP_METHODS, a comma list of google and email; anything else is dropped.
test('signupMethods reads the feature switch', () => {
  assert.deepEqual(signupMethods('google,email'), ['google', 'email']);
  assert.deepEqual(signupMethods(' Email , google ,email'), ['email', 'google']);
  assert.deepEqual(signupMethods('google'), ['google']);
  assert.deepEqual(signupMethods(''), []);
  assert.deepEqual(signupMethods(undefined), []);
  assert.deepEqual(signupMethods('phone,apple'), []);
});

// Phase E Task 3 review (M2): Code needs an address to show; once signed in, Email and Code turn into Welcome.
test('screenToShow redirects Code without an email, and Email/Code once signed in', async () => {
  const { screenToShow } = await import('../../signup-flow.js');
  assert.equal(screenToShow('code', { hasSession: false, email: '' }), 'email');
  assert.equal(screenToShow('code', { hasSession: false, email: 'a@b.co' }), 'code');
  assert.equal(screenToShow('code', { hasSession: true, email: 'a@b.co' }), 'welcome');
  assert.equal(screenToShow('email', { hasSession: true }), 'welcome');
  assert.equal(screenToShow('email', { hasSession: false }), 'email');
  assert.equal(screenToShow('adult', { hasSession: true }), 'adult');
});

// Phase E Task 3 review (I1): sending the same address again inside the resend wait reuses the code already sent.
test('reuseSentCode skips a send to the same address inside the resend wait', async () => {
  const { reuseSentCode } = await import('../../signup-flow.js');
  const sent = { sentTo: 'new@test.brivia.club', resendAt: 60_000 };
  assert.equal(reuseSentCode('new@test.brivia.club', sent, 30_000), true);
  assert.equal(reuseSentCode(' New@Test.Brivia.Club ', sent, 30_000), true);
  assert.equal(reuseSentCode('new@test.brivia.club', sent, 60_000), false);
  assert.equal(reuseSentCode('other@test.brivia.club', sent, 30_000), false);
  assert.equal(reuseSentCode('new@test.brivia.club', { sentTo: '', resendAt: 60_000 }, 30_000), false);
});

// Phase E Task 3 review (M1): an expired code sends a new one by itself at most once, and never inside the resend wait.
test('autoResendAllowed: once per Code screen, and only after the resend wait', async () => {
  const { autoResendAllowed } = await import('../../signup-flow.js');
  assert.equal(autoResendAllowed({ resendAt: 60_000, autoResent: false }, 61_000), true);
  assert.equal(autoResendAllowed({ resendAt: 60_000, autoResent: false }, 30_000), false);
  assert.equal(autoResendAllowed({ resendAt: 60_000, autoResent: true }, 61_000), false);
});

test('revealCopy: a deck row sharing an interest names the first pick it shares', async () => {
  const { revealCopy } = await import('../../signup-flow.js');
  const picks = [{ label: 'Tennis' }, { label: 'Chess' }, { label: 'Jazz' }];
  assert.deepEqual(revealCopy({ name: 'Ada Lovelace', picks, rows: [{ shared_interests: [] }, { shared_interests: ['jazz', 'Chess'] }], area: 'Pune' }), {
    title: "You're in, Ada.",
    line: 'People near you are into Chess. Your deck is ready.',
    shared: true,
  });
  assert.equal(revealCopy({ name: 'Ada', picks, rows: [{ shared_interests: ['Tennis'] }] }).line, 'People near you are into Tennis. Your deck is ready.');
  // A shared label that is not among the picks (renamed node): the label itself, never a made-up one.
  assert.equal(revealCopy({ name: 'Ada', picks, rows: [{ shared_interests: ['Padel'] }] }).line, 'People near you are into Padel. Your deck is ready.');
});

test('revealCopy: no shared row says the member is one of the first, with no count', async () => {
  const { revealCopy } = await import('../../signup-flow.js');
  const none = revealCopy({ name: '  grace  hopper ', picks: [{ label: 'Tennis' }], rows: [{ shared_interests: [] }, {}], area: 'Pune (city-wide)' });
  assert.deepEqual(none, { title: "You're in, grace.", line: "You're one of the first in Pune. We'll bring people to you as the club grows.", shared: false });
  assert.equal(revealCopy({ name: 'Ada', picks: [], rows: null, area: '' }).line, "You're one of the first in your area. We'll bring people to you as the club grows.");
  assert.equal(revealCopy({ name: '', picks: [], rows: [] }).title, "You're in.");
  assert.equal(revealCopy({ name: 'New Member', picks: [], rows: [] }).title, "You're in.");
});

// Phase E Task 5: once the Reveal was reached (interests saved), a history step back onto a profile screen shows the
// Reveal again instead of a stale question; Welcome, Email and Code keep their own rules.
test('historyScreen: after the Reveal, profile screens turn back into the Reveal', async () => {
  const { historyScreen } = await import('../../signup-flow.js');
  for (const s of ['adult', 'name', 'area', 'interests']) {
    assert.equal(historyScreen(s, { revealed: true }), 'reveal');
    assert.equal(historyScreen(s, { revealed: false }), s);
  }
  assert.equal(historyScreen('welcome', { revealed: true }), 'welcome');
  assert.equal(historyScreen('reveal', { revealed: true }), 'reveal');
  assert.equal(historyScreen(undefined, {}), 'welcome');
});
