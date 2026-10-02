// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildTopology } from '../src/topology.js';
import { toCell } from '../src/rings.js';
import { deckSize } from '../src/roche.js';
import { orbitScore, rankCandidates, composeDeck, toCard } from '../src/compose.js';
import * as api from '../src/index.js';
import { explain } from '../src/explain.js';

const cfg = loadConfig();
const topology = buildTopology(['X', 'Y', 'Z', 'W'].map((id) => ({ id, parentId: null, level: 'domain' })));
const ctx = { topology, rarityOf: () => 0.5, cfg, L: 40 };
const pune = toCell(18.5204, 73.8567, cfg);
const mumbai = toCell(19.076, 72.8777, cfg); // ring 3
const mk = (id, extra = {}) => ({
  id, name: `Name ${id}`, photoUrl: `p/${id}.jpg`,
  interests: [{ id: 'X', points: 10, mode: 'play' }, { id: 'Y', points: 10, mode: 'play' }], ...extra,
});
const viewer = { member: mk('V'), cell: pune, availability: ['sat-am', 'sun-am'] };
const cand = (id, o = {}) => ({ member: mk(id), cell: pune, headroom: 1, availability: ['sat-am'], ...o });

test('Golden 7: saturated candidates are absent from deck, present with includeSaturated', () => {
  const cs = [cand('a'), cand('sat', { headroom: 0 })];
  const ranked = rankCandidates(viewer, cs, ctx);
  assert.deepEqual(ranked.map((s) => s.candidate.member.id), ['a']);
  const all = rankCandidates(viewer, cs, { ...ctx, includeSaturated: true });
  assert.equal(all.length, 2);
  const deck = composeDeck(viewer, all, { L: 40, hViewer: 1, seed: 's' }, cfg);
  assert.ok(!deck.some((s) => s.candidate.member.id === 'sat'));
});

test('Golden 9: higher headroom ranks first at equal R/ring/factors', () => {
  const ranked = rankCandidates(viewer, [cand('low', { headroom: 0.3 }), cand('high', { headroom: 0.9 })], ctx);
  assert.deepEqual(ranked.map((s) => s.candidate.member.id), ['high', 'low']);
});

test('ties keep input order', () => {
  const ranked = rankCandidates(viewer, [cand('a'), cand('b'), cand('c')], ctx);
  assert.deepEqual(ranked.map((s) => s.candidate.member.id), ['a', 'b', 'c']);
});

test('ineligible (gate) candidates are dropped', () => {
  const weak = { ...cand('far', { cell: mumbai }), member: mk('far', { interests: [{ id: 'X', points: 2, mode: 'play' }, { id: 'W', points: 18, mode: 'play' }] }) };
  assert.equal(rankCandidates(viewer, [weak], ctx).length, 0);
});

test('orbitScore = R^gamma * phi * C * B * T * E', () => {
  const g = orbitScore({ R: 0.5, ring: 0, coPresence: 1, behaviour: {}, taste: 1, exposure: 0.5 }, cfg);
  assert.ok(Math.abs(g - Math.pow(0.5, 1.3) * 0.5) < 1e-12);
  const g2 = orbitScore({ R: 0.5, ring: 3, coPresence: 0, behaviour: { activity: 1, reciprocity: 0 }, taste: 5, exposure: 1 }, cfg);
  assert.ok(Math.abs(g2 - Math.pow(0.5, 1.3) * 0.62 * 1 * 0.9 * 1.3 * 1) < 1e-12);
});

test('matchPercent is round(100R); coPresence 0 when availability empty', () => {
  const [s] = rankCandidates(viewer, [cand('a', { availability: [] })], ctx);
  assert.equal(s.coPresence, 0);
  assert.equal(toCard(s).matchPercent, Math.round(100 * s.R));
});

// ---- synthetic scored cards for deck rules ----
const interestsFor = (i) => [{ id: `I${i % 7}`, points: 10, mode: 'play' }, { id: `J${i % 3}`, points: 10, mode: 'play' }];
const fake = (i, { ring = 0, wtd = false, G } = {}) => ({
  candidate: { member: mk(`m${i}`, { interests: interestsFor(i) }), headroom: 1, cell: pune },
  R: 0.6, ring, km: 1, G: G ?? 1 - i * 0.001, hits: [], coPresence: 0, worthTheDistance: wtd,
});
const ids = (d) => d.map((s) => s.candidate.member.id);

test('deck length equals deckSize with enough supply', () => {
  const sc = Array.from({ length: 40 }, (_, i) => fake(i));
  for (const h of [1, 0.5, 0]) {
    const d = composeDeck(viewer, sc, { L: 40, hViewer: h, seed: 'x' }, cfg);
    assert.equal(d.length, deckSize(h, cfg));
    assert.ok(d.every(Boolean));
    assert.equal(new Set(ids(d)).size, d.length);
  }
});

test('WtD lane: at most 2, at indices 3 and 8', () => {
  const sc = [
    ...Array.from({ length: 30 }, (_, i) => fake(i)),
    fake(100, { ring: 4, wtd: true, G: 0.5 }), fake(101, { ring: 4, wtd: true, G: 0.4 }), fake(102, { ring: 5, wtd: true, G: 0.3 }),
  ];
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const d = composeDeck(viewer, sc, { L: 40, hViewer: 1, seed }, cfg);
    const w = d.map((s, i) => (s.worthTheDistance ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(w, [3, 8]);
    assert.equal(d[3].candidate.member.id, 'm100');
    assert.equal(d[8].candidate.member.id, 'm101');
  }
});

test('short deck with one WtD: its fixed slot 3 is used (R11, was R9)', () => {
  const sc = Array.from({ length: 20 }, (_, i) => fake(i));
  sc.push(fake(100, { ring: 4, wtd: true }));
  const d = composeDeck(viewer, sc, { L: 40, hViewer: 0, seed: 'x' }, cfg); // size 8
  assert.equal(d.length, 8);
  assert.deepEqual(d.map((s, i) => (s.worthTheDistance ? i : -1)).filter((i) => i >= 0), [3]);
});

test('local share: >= 70% of non-WtD cards from rings 0-2 when supply allows', () => {
  // far cards have higher G, so a pure G sort would fail the share
  const far = Array.from({ length: 20 }, (_, i) => fake(i, { ring: 3, G: 2 - i * 0.001 }));
  const near = Array.from({ length: 20 }, (_, i) => fake(50 + i, { ring: 1, G: 1 - i * 0.001 }));
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const d = composeDeck(viewer, [...far, ...near], { L: 40, hViewer: 1, seed }, cfg);
    const local = d.filter((s) => s.ring <= 2).length;
    assert.ok(local >= Math.ceil(0.7 * d.length), `seed ${seed}: ${local}/${d.length}`);
  }
});

test('3 candidates give a deck of 3 with no undefined (Review Focus 3)', () => {
  const sc = [fake(1), fake(2, { ring: 4, wtd: true }), fake(3)];
  const d = composeDeck(viewer, sc, { L: 40, hViewer: 1, seed: 'x' }, cfg);
  assert.equal(d.length, 3);
  assert.ok(d.every((s) => s && s.candidate));
  assert.deepEqual(composeDeck(viewer, [], { L: 40, hViewer: 1, seed: 'x' }, cfg), []);
});

test('headroom 0 excluded even if passed in', () => {
  const sc = [fake(1), { ...fake(2), candidate: { ...fake(2).candidate, headroom: 0 } }];
  assert.deepEqual(ids(composeDeck(viewer, sc, { L: 40, hViewer: 1, seed: 'x' }, cfg)), ['m1']);
});

test('same seed gives the same deck; some seed explores', () => {
  const sc = Array.from({ length: 60 }, (_, i) => fake(i));
  const run = (seed) => ids(composeDeck(viewer, sc, { L: 40, hViewer: 1, seed }, cfg));
  assert.deepEqual(run('s1'), run('s1'));
  const decks = new Set(Array.from({ length: 40 }, (_, i) => run(`seed${i}`).join()));
  assert.ok(decks.size > 1, 'epsilon exploration changes some decks');
});

test('MMR spreads identical-interest cards', () => {
  const same = (i, G) => ({ ...fake(i, { G }), candidate: { ...fake(i).candidate, member: mk(`s${i}`, { interests: [{ id: 'I0', points: 20, mode: 'play' }] }) } });
  const sc = [...Array.from({ length: 12 }, (_, i) => same(i, 1 - i * 0.001)), ...Array.from({ length: 12 }, (_, i) => fake(i, { G: 0.9 - i * 0.001 }))];
  const d = composeDeck(viewer, sc, { L: 40, hViewer: 1, seed: 'zz' }, { ...cfg });
  assert.ok(d.filter((s) => s.candidate.member.id.startsWith('s')).length < 12);
});

test('Golden 6: toCard is a whitelist and leaks nothing', () => {
  const leaky = mk('L', { email: 'x@y.com', phone: '+919999999999', lat: 18.5204, lng: 73.8567, cell: pune });
  const [s] = rankCandidates(viewer, [{ member: leaky, cell: pune, headroom: 1, availability: ['sat-am'] }], ctx);
  const card = toCard(s);
  assert.deepEqual(Object.keys(card), ['id', 'name', 'photoUrl', 'distanceBand', 'matchPercent', 'chips', 'worthTheDistance']);
  const json = JSON.stringify(card);
  for (const bad of ['x@y.com', '+919999999999', 'lat', 'lng', 'cell', pune, 'email', 'phone']) assert.ok(!json.includes(bad), bad);
  assert.equal(card.distanceBand, '< 3 km');
});

test('index re-exports the public API', () => {
  for (const k of ['loadConfig', 'resonance', 'buildTopology', 'distanceKm', 'isEligible', 'deckSize', 'orbitScore', 'rankCandidates', 'composeDeck', 'explain', 'toCard']) {
    assert.equal(typeof api[k], 'function', k);
  }
});

test('Fix: more than wtdMax WtD cards and little local supply never yields undefined', () => {
  const cases = [[1, 3], [3, 4], [0, 5], [2, 6]];
  for (const [nl, nw] of cases) {
    const sc = [
      ...Array.from({ length: nl }, (_, i) => fake(i)),
      ...Array.from({ length: nw }, (_, i) => fake(100 + i, { ring: 4, wtd: true, G: 0.5 - i * 0.01 })),
    ];
    for (let k = 0; k < 40; k++) {
      const d = composeDeck(viewer, sc, { L: 40, hViewer: 1, seed: `u${k}` }, cfg);
      assert.ok(d.every(Boolean), `${nl}/${nw} seed ${k}`);
      assert.equal(d.length, nl + Math.min(nw, 2));
      assert.equal(new Set(ids(d)).size, d.length);
    }
  }
});

test('Fix: exploration fires without crashing on thin supply', () => {
  const sc = [...Array.from({ length: 12 }, (_, i) => fake(i)), ...Array.from({ length: 4 }, (_, i) => fake(100 + i, { ring: 4, wtd: true }))];
  const eager = { ...cfg, deck: { ...cfg.deck, epsilon: 1 } };
  for (let k = 0; k < 30; k++) {
    const d = composeDeck(viewer, sc, { L: 40, hViewer: 1, seed: `e${k}` }, eager);
    assert.ok(d.every(Boolean));
  }
});

test('Fix: chip labels come from ctx.labelOf via real rankCandidates', () => {
  const t = (id, mode) => ({ ...mk(id), interests: [{ id: 'X', points: 10, mode }, { id: 'Y', points: 10, mode: 'play' }] });
  const v = { ...viewer, member: t('V', 'teach') };
  const [s] = rankCandidates(v, [{ member: t('a', 'learn'), cell: pune, headroom: 1, availability: [] }], { ...ctx, labelOf: (id) => ({ X: 'Guitar' })[id] });
  assert.ok(explain(s).includes('You teach Guitar, they want to learn it'), explain(s).join('|'));
  const [s2] = rankCandidates(v, [{ member: t('a', 'learn'), cell: pune, headroom: 1, availability: [] }], ctx);
  assert.ok(explain(s2).includes('You teach X, they want to learn it'));
});

test('C1/R13: real ranking — related (not identical) interests produce no rare or teach/learn chip', () => {
  const topo2 = buildTopology([
    { id: 'music', parentId: null, level: 'domain' },
    { id: 'strings', parentId: 'music', level: 'category' },
    { id: 'guitar', parentId: 'strings', level: 'interest' },
    { id: 'bass', parentId: 'strings', level: 'interest' },
    { id: 'sports', parentId: null, level: 'domain' },
    { id: 'football', parentId: 'sports', level: 'interest' },
  ]);
  const v = { member: { id: 'V', interests: [{ id: 'guitar', points: 20, mode: 'teach' }] }, cell: pune, availability: [] };
  const c = { member: { id: 'c', name: 'C', interests: [{ id: 'bass', points: 10, mode: 'learn' }, { id: 'football', points: 10, mode: 'play' }] }, cell: pune, headroom: 1, availability: [] };
  const [s] = rankCandidates(v, [c], { topology: topo2, rarityOf: () => 1, cfg, L: 40, labelOf: (id) => id[0].toUpperCase() + id.slice(1) });
  assert.ok(s, 'sibling resonance is still eligible');
  assert.equal(s.hits[0].theirs.id, 'bass');
  assert.deepEqual(explain(s), []);
});

// ---- I2 / R12: non-finite inputs fall back to safe defaults; a bad row never empties a deck ----
test('I2/R12: missing or NaN headroom is treated as 1 (finite G, same as headroom 1)', () => {
  const base = rankCandidates(viewer, [cand('a')], ctx)[0].G;
  for (const h of [undefined, null, NaN, 'x']) {
    const r = rankCandidates(viewer, [cand('a', { headroom: h })], ctx);
    assert.equal(r.length, 1, String(h));
    assert.equal(r[0].G, base, String(h));
  }
});

test('I2/R12: NaN taste -> 1; NaN activity/reciprocity -> absent', () => {
  const g = (o) => orbitScore({ R: 0.5, ring: 0, coPresence: 1, behaviour: {}, taste: 1, exposure: 1, ...o }, cfg);
  assert.equal(g({ taste: NaN }), g({}));
  assert.equal(g({ taste: undefined }), g({}));
  assert.equal(g({ behaviour: { activity: NaN, reciprocity: Infinity } }), g({}));
  assert.equal(g({ behaviour: { activity: NaN, reciprocity: 1 } }), g({ behaviour: { reciprocity: 1 } }));
  const r = rankCandidates(viewer, [cand('a', { taste: NaN, activity: NaN, reciprocity: 'z' })], ctx);
  assert.ok(Number.isFinite(r[0].G));
});

test('I2/R12: ctx.L missing or NaN is treated as 0, not "nobody is eligible"', () => {
  const { L, ...noL } = ctx; void L;
  const r0 = rankCandidates(viewer, [cand('a')], { ...ctx, L: 0 });
  assert.equal(rankCandidates(viewer, [cand('a')], noL).length, r0.length);
  assert.equal(rankCandidates(viewer, [cand('a')], { ...ctx, L: NaN }).length, r0.length);
  assert.equal(r0.length, 1);
});

test('I2/R12: one NaN-G row never empties or corrupts a deck', () => {
  const sc = Array.from({ length: 20 }, (_, i) => fake(i));
  sc.splice(5, 0, { ...fake(99), G: NaN }, { ...fake(98), candidate: { ...fake(98).candidate, headroom: undefined } });
  for (const seed of ['a', 'b', 'c', 'd']) {
    const d = composeDeck(viewer, sc, { hViewer: 1, seed }, cfg);
    assert.equal(d.length, 12, seed);
    assert.ok(d.every((s) => s && s.candidate), seed);
    assert.equal(new Set(ids(d)).size, d.length);
  }
});

test('I2/R12: hViewer missing/NaN -> 1 (full deck), never []', () => {
  const sc = Array.from({ length: 20 }, (_, i) => fake(i));
  for (const hViewer of [undefined, NaN, null]) {
    const d = composeDeck(viewer, sc, { hViewer, seed: 'x' }, cfg);
    assert.equal(d.length, deckSize(1, cfg), String(hViewer));
    assert.ok(d.every(Boolean));
  }
});

// ---- I3 / R11: WtD at its fixed slot, or the last position when the slot is beyond the deck ----
test('I3/R11: 2 WtD cards with hViewer=0 (deck of 8) land at indices 3 and 7', () => {
  const sc = [
    ...Array.from({ length: 20 }, (_, i) => fake(i)),
    fake(100, { ring: 4, wtd: true, G: 0.5 }), fake(101, { ring: 4, wtd: true, G: 0.4 }),
  ];
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const d = composeDeck(viewer, sc, { hViewer: 0, seed }, cfg);
    assert.equal(d.length, 8);
    assert.deepEqual(d.map((s, i) => (s.worthTheDistance ? i : -1)).filter((i) => i >= 0), [3, 7], seed);
    assert.equal(d[3].candidate.member.id, 'm100');
    assert.equal(d[7].candidate.member.id, 'm101');
  }
});

test('I3/R11: a WtD card is never placed before local cards, even when it out-scores them', () => {
  const sc = [
    ...Array.from({ length: 2 }, (_, i) => fake(i, { G: 0.1 - i * 0.001 })),
    fake(100, { ring: 4, wtd: true, G: 5 }), fake(101, { ring: 5, wtd: true, G: 4 }),
  ];
  for (let k = 0; k < 30; k++) {
    const d = composeDeck(viewer, sc, { hViewer: 1, seed: `r${k}` }, cfg);
    assert.equal(d.length, 4);
    const firstWtd = d.findIndex((s) => s.worthTheDistance);
    const lastLocal = d.map((s) => s.ring <= 2).lastIndexOf(true);
    assert.ok(firstWtd > lastLocal, `seed r${k}: ${ids(d)}`);
    assert.equal(d[3].candidate.member.id, 'm100'); // slot 3 is inside a deck of 4
  }
});

test('I4: orbitScore factors read config (C, B, T clip, co-presence ring cut-off)', () => {
  const c2 = loadConfig({ score: { coPresenceBase: 0.5, coPresenceSpan: 0.5, behaviourBase: 0.5, behaviourSpan: 0.5, tasteMax: 2, coPresenceMaxRing: 3 } });
  const base = { R: 1, ring: 3, coPresence: 0, behaviour: { activity: 0 }, taste: 5, exposure: 1 };
  assert.ok(Math.abs(orbitScore(base, c2) - 0.62 * 0.5 * 0.5 * 2) < 1e-12);
  assert.ok(Math.abs(orbitScore(base, cfg) - 0.62 * 1 * 0.8 * 1.3) < 1e-12); // defaults unchanged
});

test('I4: deck local cut-off reads cfg.deck.localMaxRing', () => {
  const far = Array.from({ length: 20 }, (_, i) => fake(i, { ring: 2, G: 2 - i * 0.001 }));
  const near = Array.from({ length: 20 }, (_, i) => fake(50 + i, { ring: 1, G: 1 - i * 0.001 }));
  const c2 = loadConfig({ deck: { localMaxRing: 1, epsilon: 0 } });
  const d = composeDeck(viewer, [...far, ...near], { hViewer: 1, seed: 'a' }, c2);
  assert.ok(d.filter((s) => s.ring <= 1).length >= Math.ceil(0.7 * d.length));
  const d0 = composeDeck(viewer, [...far, ...near], { hViewer: 1, seed: 'a' }, loadConfig({ deck: { epsilon: 0 } }));
  assert.equal(d0.filter((s) => s.ring === 2).length, 12); // default: ring 2 counts as local
});

test('I4: toCard/explain take cfg (rare threshold, distance label from rings[0])', () => {
  const c2 = loadConfig({ rings: [5, 15, 60, 350, 2500, Infinity], explain: { rareMinRarity: 0.95 } });
  const [s] = rankCandidates(viewer, [cand('a')], ctx);
  assert.equal(toCard(s).distanceBand, '< 3 km');
  assert.equal(toCard(s, c2).distanceBand, '< 5 km');
  const h = { mine: { id: 'x', points: 6, mode: 'play' }, theirs: { id: 'x', points: 6, mode: 'play' }, topo: 1, rarity: 0.8, score: 1 };
  const sc2 = { ...s, hits: [h], coPresence: 0 };
  assert.deepEqual(explain(sc2), ['Both deep into x, rare nearby']);
  assert.deepEqual(explain(sc2, c2), []);
});
