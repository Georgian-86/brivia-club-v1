// Guided signup again (polish wave B, D-073; history D-067/D-068): one question per screen, the step label and
// bubbles, where a returning member resumes, Back after the session exists, the classic switch and the even split.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, STEP_ICONS, stepLabel, stepStates, resumeScreen, backTarget, signupFlowMode } from '../../site/scripts/signup-flow.js';
import { evenSplit } from '../../site/scripts/passion-budget.js';

const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `L${i}` }));

test('screen lists: email has 6 question screens, Google 5; 18+ and name are separate', () => {
  assert.deepEqual(SCREENS.email, ['welcome', 'account', 'adult', 'name', 'details', 'area', 'interests', 'reveal']);
  assert.deepEqual(SCREENS.google, ['welcome', 'adult', 'name', 'details', 'area', 'interests', 'reveal']);
  assert.deepEqual(STEP_ICONS, { account: 'mail', adult: 'shield', name: 'person', details: 'phone', area: 'pin', interests: 'spark' });
  for (const s of [...SCREENS.email, ...SCREENS.google].filter((n) => n !== 'welcome' && n !== 'reveal')) assert.ok(STEP_ICONS[s], `${s} has an icon`);
  assert.equal(SCREENS.email.includes('points'), false);
  assert.equal(SCREENS.email.includes('verify'), false, 'verify is terminal, not a step');
});

test('stepLabel counts question screens only', () => {
  assert.equal(stepLabel('email', 'account'), 'Step 1 of 6');
  assert.equal(stepLabel('email', 'adult'), 'Step 2 of 6');
  assert.equal(stepLabel('email', 'interests'), 'Step 6 of 6');
  assert.equal(stepLabel('google', 'adult'), 'Step 1 of 5');
  assert.equal(stepLabel('google', 'details'), 'Step 3 of 5');
  assert.equal(stepLabel('email', 'reveal'), null);
  assert.equal(stepLabel('email', 'verify'), null);
  assert.equal(stepLabel('google', 'welcome'), null);
  assert.equal(stepLabel('google', 'account'), null);
});

test('stepStates: done before the current step, current, pending after', () => {
  assert.deepEqual(stepStates('google', 'name'), [
    { screen: 'adult', state: 'done' }, { screen: 'name', state: 'current' }, { screen: 'details', state: 'pending' },
    { screen: 'area', state: 'pending' }, { screen: 'interests', state: 'pending' },
  ]);
  assert.deepEqual(stepStates('google', 'reveal').map((s) => s.state), ['done', 'done', 'done', 'done', 'done']);
  assert.deepEqual(stepStates('email', 'verify').map((s) => s.state), ['done', 'done', 'done', 'done', 'done', 'done']);
  assert.equal(stepStates('email', 'welcome').every((s) => s.state === 'pending'), true);
});

test('resumeScreen: adult before name before details before area before interests', () => {
  assert.equal(resumeScreen({ session: null, status: {} }), 'welcome');
  const session = { user: { id: 'u' } };
  const all = { adult_declared: true, has_name: true, has_phone: true, has_gender: true, has_cell: true, interests: 2, points: 20 };
  assert.equal(resumeScreen({ session: {}, status: { adult_declared: true, has_name: false } }), 'name');
  assert.equal(resumeScreen({ session, status: {} }), 'adult');
  assert.equal(resumeScreen({ session, status: { ...all, adult_declared: false } }), 'adult');
  assert.equal(resumeScreen({ session, status: { ...all, has_name: false } }), 'name');
  assert.equal(resumeScreen({ session, status: { ...all, has_phone: false } }), 'details');
  assert.equal(resumeScreen({ session, status: { ...all, has_gender: false } }), 'details');
  assert.equal(resumeScreen({ session, status: { ...all, has_cell: false } }), 'area');
  assert.equal(resumeScreen({ session, status: { ...all, points: 15 } }), 'interests');
  assert.equal(resumeScreen({ session, status: { ...all, interests: 0, points: 0 } }), 'interests');
  assert.equal(resumeScreen({ session, status: all }), 'done');
  assert.equal(resumeScreen({ session, status: { completed: true } }), 'done');
});

test('backTarget: never back to account once signed in', () => {
  assert.equal(backTarget('email', 'adult', true), 'welcome');
  assert.equal(backTarget('email', 'adult', false), 'account');
  assert.equal(backTarget('email', 'account', false), 'welcome');
  assert.equal(backTarget('email', 'name', true), 'adult');
  assert.equal(backTarget('email', 'interests', false), 'area');
  assert.equal(backTarget('google', 'adult', true), 'welcome');
  assert.equal(backTarget('google', 'welcome', false), null);
  assert.equal(backTarget('email', 'nope', false), null);
});

test('signupFlowMode: classic only when asked', () => {
  assert.equal(signupFlowMode('classic'), 'classic');
  assert.equal(signupFlowMode(' Classic '), 'classic');
  assert.equal(signupFlowMode(undefined), 'guided');
  assert.equal(signupFlowMode(''), 'guided');
  assert.equal(signupFlowMode('guided'), 'guided');
  assert.equal(signupFlowMode('anything'), 'guided');
});

test('evenSplit: 20 points, largest remainder, each at least 1, ties to earlier picks', () => {
  assert.deepEqual(evenSplit(ids(3)).map((r) => r.points), [7, 7, 6]);
  assert.deepEqual(evenSplit(ids(1)).map((r) => r.points), [20]);
  assert.deepEqual(evenSplit(ids(12)).map((r) => r.points), [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1]);
  assert.deepEqual(evenSplit(ids(7)).map((r) => r.points), [3, 3, 3, 3, 3, 3, 2]);
  for (let n = 1; n <= 12; n++) assert.equal(evenSplit(ids(n)).reduce((s, r) => s + r.points, 0), 20);
  assert.deepEqual(evenSplit([{ id: 'a', label: 'A', mode: 'teach' }]), [{ interest_id: 'a', points: 20, mode: 'teach' }]);
  assert.equal(evenSplit(ids(3))[0].mode, 'play');
  assert.throws(() => evenSplit([]));
  assert.throws(() => evenSplit(ids(13)));
});

// D-082b: the Interests picker shows one category at a time. groupInterests(all nodes, popular labels) gives
// "Popular" first (the popular labels found, topped up across the categories to `size`), then one group per top-level
// category in taxonomy order, labelled by its level-1 node (or the id, capitalised, when that node is missing).
// Only offered nodes (non-sensitive, level 3-4, labelled) appear; each appears once per category.
test('groupInterests: Popular first, then one tab per top-level category, private interests never offered', async () => {
  const { groupInterests } = await import('../../site/scripts/signup-flow.js');
  const nodes = [
    { id: 'games', parent_id: null, level: 1, label: 'Games and play', sensitive: false },
    { id: 'games.board', parent_id: 'games', level: 2, label: 'Board games', sensitive: false },
    { id: 'games.board.chess', parent_id: 'games.board', level: 3, label: 'Chess', sensitive: false },
    { id: 'games.board.go', parent_id: 'games.board', level: 3, label: 'Go', sensitive: false },
    { id: 'music.instruments.guitar', parent_id: 'music.instruments', level: 3, label: 'Guitar', sensitive: false },
    { id: 'music.instruments.guitar.flamenco', parent_id: 'music.instruments.guitar', level: 4, label: 'Flamenco guitar', sensitive: false },
    { id: 'beliefs.faith.private', parent_id: 'beliefs.faith', level: 3, label: 'A private belief', sensitive: true },
    { id: 'tech.events.hackathons', parent_id: 'tech.events', level: 3, label: 'Hackathons', sensitive: false },
    { id: 'tech.events.blank', parent_id: 'tech.events', level: 3, label: '  ', sensitive: false },
  ];
  const groups = groupInterests(nodes, ['Guitar', 'Chess', 'Nope'], { size: 4 });
  assert.deepEqual(groups.map((g) => [g.id, g.label]), [['popular', 'Popular'], ['games', 'Games and play'], ['music', 'Music'], ['tech', 'Tech']]);
  // Popular: the popular labels in their order, then topped up round-robin across the categories, no repeats.
  assert.deepEqual(groups[0].items.map((n) => n.label), ['Guitar', 'Chess', 'Hackathons', 'Go']);
  assert.deepEqual(groups[1].items.map((n) => n.label), ['Chess', 'Go']);
  assert.deepEqual(groups[2].items.map((n) => n.label), ['Guitar', 'Flamenco guitar']);
  assert.deepEqual(groups[3].items.map((n) => n.label), ['Hackathons']);
  assert.ok(groups.every((g) => g.items.every((n) => !n.sensitive && n.level >= 3)));
  assert.deepEqual(groupInterests([], ['Chess']), []);
});
