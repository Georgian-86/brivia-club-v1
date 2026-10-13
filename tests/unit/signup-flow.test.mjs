// Phase E guided signup: flow model. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, stepLabel, resumeScreen, backTarget, parseOtp } from '../../signup-flow.js';

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
  assert.equal(resumeScreen({ session: s, status: full, path: 'google' }), 'reveal');
});
test('resumeScreen: missing status counts as nothing done', () => {
  assert.equal(resumeScreen({ session: {}, status: null, path: 'email' }), 'adult');
});

test('backTarget', () => {
  assert.equal(backTarget('email', 'welcome', false), null);
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
