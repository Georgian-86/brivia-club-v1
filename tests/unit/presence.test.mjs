// Active status in chat (D-110): the presence loop and the dot. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, presenceDot } from '../../site/scripts/presence.js';

const harness = ({ active = [], touchError = null, fetchError = null } = {}) => {
  const calls = { touch: 0, fetch: [] };
  const listeners = { doc: {}, win: {} };
  let tick = null;
  const env = {
    doc: { visibilityState: 'visible', addEventListener: (type, fn) => { listeners.doc[type] = fn; }, removeEventListener: (type) => { delete listeners.doc[type]; } },
    win: { addEventListener: (type, fn) => { listeners.win[type] = fn; }, removeEventListener: (type) => { delete listeners.win[type]; } },
    setIntervalFn: (fn) => { tick = fn; return 1; },
    clearIntervalFn: () => { tick = null; },
  };
  const changes = [];
  const state = { active: new Set(active), fetchError };
  const presence = createPresence({
    touch: async () => { calls.touch += 1; return { error: touchError }; },
    fetch: async (ids) => { calls.fetch.push(ids); return { data: state.fetchError ? null : ids.map((id) => ({ member_id: id, active: state.active.has(id) })), error: state.fetchError }; },
    ids: () => ['a', 'b'],
    onChange: (set) => changes.push([...set].sort()),
    ...env,
  });
  return { presence, calls, listeners, changes, state, env, tick: () => tick?.(), hasTick: () => Boolean(tick) };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

test('start touches, asks about the connections, and reports who is active', async () => {
  const h = harness({ active: ['a'] });
  await h.presence.start();
  assert.equal(h.calls.touch, 1);
  assert.deepEqual(h.calls.fetch, [['a', 'b']]);
  assert.equal(h.presence.isActive('a'), true);
  assert.equal(h.presence.isActive('b'), false);
  assert.deepEqual(h.changes, [['a']]);
});

test('each minute while visible: touch and refresh; hidden: nothing', async () => {
  const h = harness({ active: ['a'] });
  await h.presence.start();
  h.env.doc.visibilityState = 'hidden';
  h.tick(); await settle();
  assert.equal(h.calls.touch, 1);
  h.env.doc.visibilityState = 'visible';
  h.state.active = new Set(['b']);
  h.tick(); await settle();
  assert.equal(h.calls.touch, 2);
  assert.equal(h.presence.isActive('b'), true);
  assert.deepEqual(h.changes, [['a'], ['b']]);
});

test('onChange only fires when the active set changes', async () => {
  const h = harness({ active: ['a'] });
  await h.presence.start();
  h.tick(); await settle();
  h.tick(); await settle();
  assert.equal(h.changes.length, 1);
});

test('focus touches again', async () => {
  const h = harness();
  await h.presence.start();
  await h.listeners.win.focus();
  assert.equal(h.calls.touch, 2);
});

test('a missing function (before 0018) stops the loop quietly and shows nobody active', async () => {
  for (const code of ['PGRST202', '42883']) {
    const h = harness({ active: ['a'], touchError: { code } });
    await h.presence.start();
    assert.equal(h.hasTick(), false, code);
    assert.equal(h.presence.isActive('a'), false, code);
    assert.deepEqual(h.calls.fetch, [], code);
  }
});

test('a network error keeps the last known state', async () => {
  const h = harness({ active: ['a'] });
  await h.presence.start();
  h.state.fetchError = { code: 'XX000', message: 'network' };
  h.state.active = new Set();
  h.tick(); await settle();
  assert.equal(h.presence.isActive('a'), true);
  assert.equal(h.changes.length, 1);
  assert.equal(h.hasTick(), true);
});

test('stop clears the timer and the listeners', async () => {
  const h = harness();
  await h.presence.start();
  h.presence.stop();
  assert.equal(h.hasTick(), false);
  assert.equal(h.listeners.win.focus, undefined);
});

test('presenceDot', () => {
  assert.equal(presenceDot(true), '<span class="presence-dot" aria-hidden="true"></span>');
  assert.equal(presenceDot(false), '');
});
