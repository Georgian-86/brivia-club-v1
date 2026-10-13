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
