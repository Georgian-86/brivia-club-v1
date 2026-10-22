// Polish wave D5: the typing indicator's pure parts (topic, throttled sender, idle receiver). No DOM, no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { typingTopic, createTypingSender, createTypingReceiver, TYPING_THROTTLE_MS, TYPING_IDLE_MS } from '../../site/scripts/chat-typing.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = 'AAAAAAAA-aaaa-4aaa-8aaa-000000000001';

test('typingTopic is the same string from both sides, lower case, lower id first (matches 0012 D2)', () => {
  assert.equal(typingTopic(A, B), `typing:${A}:${B.toLowerCase()}`);
  assert.equal(typingTopic(B, A), typingTopic(A, B));
  assert.match(typingTopic(B, A), /^typing:[0-9a-f-]{36}:[0-9a-f-]{36}$/);
});

test('the defaults are 2000 ms throttle and 4000 ms idle', () => {
  assert.equal(TYPING_THROTTLE_MS, 2000);
  assert.equal(TYPING_IDLE_MS, 4000);
});

const clock = () => { let t = 0; return { now: () => t, at: (ms) => { t = ms; } }; };

test('three inputs within 2 s send once; an input at 2.1 s sends again', () => {
  const sent = [];
  const c = clock();
  const sender = createTypingSender({ send: (p) => sent.push(p), now: c.now });
  c.at(0); sender.onInput();
  c.at(700); sender.onInput();
  c.at(1900); sender.onInput();
  assert.deepEqual(sent, [{ typing: true }]);
  c.at(2100); sender.onInput();
  assert.deepEqual(sent, [{ typing: true }, { typing: true }]);
});

test('stop sends one { typing: false } after typing, and nothing more on a second stop', () => {
  const sent = [];
  const c = clock();
  const sender = createTypingSender({ send: (p) => sent.push(p), now: c.now });
  sender.onInput();
  sender.stop();
  sender.stop();
  assert.deepEqual(sent, [{ typing: true }, { typing: false }]);
});

test('stop without typing sends nothing; typing again right after stop sends at once', () => {
  const sent = [];
  const c = clock();
  const sender = createTypingSender({ send: (p) => sent.push(p), now: c.now });
  sender.stop();
  assert.deepEqual(sent, []);
  c.at(100); sender.onInput();
  sender.stop();
  c.at(200); sender.onInput();
  assert.deepEqual(sent, [{ typing: true }, { typing: false }, { typing: true }]);
});

test('whatever onInput is handed (an input event, the draft), send only ever gets { typing: true } / { typing: false }', () => {
  const sent = [];
  const sender = createTypingSender({ send: (...args) => sent.push(args), now: () => 0 });
  sender.onInput({ target: { value: 'secret draft' }, data: 't' }, 'secret draft');
  sender.stop({ value: 'secret draft' });
  assert.deepEqual(sent, [[{ typing: true }], [{ typing: false }]]);
});

const timers = () => {
  let t = 0; let next = 1; const live = new Map();
  return {
    setTimeout: (fn, ms) => { const id = next++; live.set(id, { fn, at: t + ms }); return id; },
    clearTimeout: (id) => { live.delete(id); },
    advance: (ms) => {
      t += ms;
      for (const [id, timer] of [...live]) if (timer.at <= t) { live.delete(id); timer.fn(); }
    },
    count: () => live.size,
  };
};

test('the receiver shows on true and hides after 4000 ms without a signal', () => {
  const changes = [];
  const tm = timers();
  const receiver = createTypingReceiver({ onChange: (v) => changes.push(v), setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout });
  receiver.onSignal({ typing: true });
  assert.deepEqual(changes, [true]);
  tm.advance(3999);
  assert.deepEqual(changes, [true]);
  tm.advance(1);
  assert.deepEqual(changes, [true, false]);
});

test('a repeated true keeps it shown (one change) and restarts the idle timer', () => {
  const changes = [];
  const tm = timers();
  const receiver = createTypingReceiver({ onChange: (v) => changes.push(v), setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout });
  receiver.onSignal({ typing: true });
  tm.advance(3000);
  receiver.onSignal({ typing: true });
  tm.advance(3000);
  assert.deepEqual(changes, [true]);
  assert.equal(tm.count(), 1);
  tm.advance(1000);
  assert.deepEqual(changes, [true, false]);
});

test('the receiver hides at once on false, and a false while hidden changes nothing', () => {
  const changes = [];
  const tm = timers();
  const receiver = createTypingReceiver({ onChange: (v) => changes.push(v), setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout });
  receiver.onSignal({ typing: false });
  assert.deepEqual(changes, []);
  receiver.onSignal({ typing: true });
  receiver.onSignal({ typing: false });
  assert.deepEqual(changes, [true, false]);
  assert.equal(tm.count(), 0);
});

test('only a real boolean true shows; reset hides and clears the timer', () => {
  const changes = [];
  const tm = timers();
  const receiver = createTypingReceiver({ onChange: (v) => changes.push(v), setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout });
  receiver.onSignal({ typing: 'yes' });
  receiver.onSignal(null);
  receiver.onSignal(undefined);
  assert.deepEqual(changes, []);
  receiver.onSignal({ typing: true });
  receiver.reset();
  assert.deepEqual(changes, [true, false]);
  assert.equal(tm.count(), 0);
  receiver.reset();
  assert.deepEqual(changes, [true, false]);
});
