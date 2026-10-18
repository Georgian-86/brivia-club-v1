// Guided signup (Phase E, D-067): the screen list per path, the step label, where a member resumes, Back after the
// session exists, and the 6-digit code input. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, STEP_ICONS, stepLabel, stepStates, resumeScreen, backTarget, signupMethods } from '../../site/scripts/signup-flow.js';
import { parseOtp, otpBoxesAfterInput } from '../../site/scripts/otp-input.js';
import { evenSplit } from '../../site/scripts/passion-budget.js';

test('screen lists: email has 6 question screens, Google 4', () => {
  assert.deepEqual(SCREENS.email, ['welcome', 'email', 'code', 'adult', 'name', 'area', 'interests', 'reveal']);
  assert.deepEqual(SCREENS.google, ['welcome', 'adult', 'name', 'area', 'interests', 'reveal']);
  for (const s of [...SCREENS.email, ...SCREENS.google].filter((n) => n !== 'welcome' && n !== 'reveal')) assert.ok(STEP_ICONS[s], `${s} has an icon`);
});

test('stepLabel counts question screens only', () => {
  assert.equal(stepLabel('email', 'email'), 'Step 1 of 6');
  assert.equal(stepLabel('email', 'code'), 'Step 2 of 6');
  assert.equal(stepLabel('email', 'adult'), 'Step 3 of 6');
  assert.equal(stepLabel('google', 'interests'), 'Step 4 of 4');
  assert.equal(stepLabel('email', 'reveal'), null);
  assert.equal(stepLabel('google', 'welcome'), null);
});

test('stepStates: done before the current step, current, pending after', () => {
  assert.deepEqual(stepStates('google', 'name'), [
    { screen: 'adult', state: 'done' }, { screen: 'name', state: 'current' },
    { screen: 'area', state: 'pending' }, { screen: 'interests', state: 'pending' },
  ]);
  assert.deepEqual(stepStates('google', 'reveal').map((s) => s.state), ['done', 'done', 'done', 'done']);
  assert.deepEqual(stepStates('email', 'welcome').map((s) => s.state), ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
});

test('resumeScreen: the first unfinished question', () => {
  assert.equal(resumeScreen({ session: null, status: {}, path: 'email' }), 'welcome');
  const session = { user: { id: 'u' } };
  assert.equal(resumeScreen({ session, status: { completed: true }, path: 'email' }), 'done');
  assert.equal(resumeScreen({ session, status: {}, path: 'email' }), 'adult');
  assert.equal(resumeScreen({ session, status: { adult_declared: true }, path: 'google' }), 'name');
  assert.equal(resumeScreen({ session, status: { adult_declared: true, has_name: true }, path: 'email' }), 'area');
  assert.equal(resumeScreen({ session, status: { adult_declared: true, has_name: true, has_cell: true, interests: 2, points: 15 }, path: 'email' }), 'interests');
  assert.equal(resumeScreen({ session, status: { adult_declared: true, has_name: true, has_cell: true, interests: 2, points: 20 }, path: 'email' }), 'done');
});

test('backTarget: never back to Email or Code once signed in', () => {
  assert.equal(backTarget('email', 'adult', true), 'welcome');
  assert.equal(backTarget('email', 'name', true), 'adult');
  assert.equal(backTarget('email', 'code', false), 'email');
  assert.equal(backTarget('email', 'email', false), 'welcome');
  assert.equal(backTarget('google', 'welcome', false), null);
  assert.equal(backTarget('google', 'adult', true), 'welcome');
});

test('signupMethods reads the switch; unknown words are dropped', () => {
  assert.deepEqual(signupMethods('google,email'), ['google', 'email']);
  assert.deepEqual(signupMethods(' email , sms '), ['email']);
  assert.deepEqual(signupMethods(''), []);
  assert.deepEqual(signupMethods(undefined), []);
});

test('evenSplit: 20 points, largest remainder, each at least 1, ties to earlier picks', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `L${i}` }));
  assert.deepEqual(evenSplit(ids(3)).map((r) => r.points), [7, 7, 6]);
  assert.deepEqual(evenSplit(ids(1)).map((r) => r.points), [20]);
  assert.deepEqual(evenSplit(ids(12)).map((r) => r.points), [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
  assert.deepEqual(evenSplit(ids(7)).map((r) => r.points), [3, 3, 3, 3, 3, 3, 2]);
  assert.deepEqual(evenSplit([{ id: 'a', label: 'A', mode: 'teach' }]), [{ interest_id: 'a', points: 20, mode: 'teach' }]);
  assert.equal(evenSplit(ids(3))[0].mode, 'play');
  assert.throws(() => evenSplit([]));
  assert.throws(() => evenSplit(ids(13)));
});

test('parseOtp: six digits from a code, a spaced code or a message', () => {
  assert.equal(parseOtp('123 456'), '123456');
  assert.equal(parseOtp('123-456'), '123456');
  assert.equal(parseOtp('Your code is 654321.'), '654321');
  assert.equal(parseOtp('Your code is 123 456'), '123456');
  assert.equal(parseOtp('Code: 987-654, valid 10 minutes'), '987654');
  assert.equal(parseOtp('Call 1234 5678'), null);
  assert.equal(parseOtp('12345'), null);
  assert.equal(parseOtp(''), null);
  assert.equal(parseOtp(null), null);
});

test('otpBoxesAfterInput: typing, paste and backspace', () => {
  const empty = ['', '', '', '', '', ''];
  assert.deepEqual(otpBoxesAfterInput(empty, 0, '4'), { boxes: ['4', '', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(empty, 0, '123 456'), { boxes: ['1', '2', '3', '4', '5', '6'], focus: 5 });
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 2, ''), { boxes: ['1', '2', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '3', '', '', ''], 2, ''), { boxes: ['1', '2', '', '', '', ''], focus: 2 });
  assert.deepEqual(otpBoxesAfterInput(empty, 3, 'x'), { boxes: empty, focus: 3 });
  assert.deepEqual(otpBoxesAfterInput(empty, 4, '98'), { boxes: ['', '', '', '', '9', '8'], focus: 5 });
});
