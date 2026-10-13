// The test world's far-but-strong matches go through ORBIT's Escape-Velocity Gate (Phase D Task 2; spec §5).
// The interim server deck (deck_candidates) has no Worth-the-Distance lane, so supabase/tests/seed.test.sql checks only
// that a far partner is never in the deck and is found by search. This test runs the seed's own members through the
// ORBIT library: every far-strong pair is a Worth-the-Distance card from both sides; a weak far pair is not even
// eligible at the most relaxed thresholds. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../../orbit/src/config.js';
import { buildTopology } from '../../orbit/src/topology.js';
import { resonance, rarity } from '../../orbit/src/resonance.js';
import { isWorthTheDistance, isEligible } from '../../orbit/src/gate.js';

const ROOT = new URL('../../', import.meta.url);
const seed = readFileSync(new URL('supabase/seed/test-members.sql', ROOT), 'utf8');
const places = readFileSync(new URL('supabase/migrations/0004_orbit_onboarding.sql', ROOT), 'utf8');
const cfg = loadConfig();

// One SQL tuple's fields ('' escapes a quote inside a string).
const fields = (tuple) => {
  const out = []; let i = 0;
  while (i < tuple.length) {
    while (tuple[i] === ' ' || tuple[i] === ',') i += 1;
    if (tuple[i] === "'") {
      let v = ''; i += 1;
      for (;;) { if (tuple[i] === "'" && tuple[i + 1] === "'") { v += "'"; i += 2; } else if (tuple[i] === "'") { i += 1; break; } else { v += tuple[i]; i += 1; } }
      out.push(v);
    } else { const m = /^[^,]*/.exec(tuple.slice(i))[0]; out.push(m.trim()); i += m.length; }
  }
  return out;
};
const members = new Map();
for (const line of seed.split('\n')) {
  const m = /^\s+\((\d+), '(.*)\),?;?$/.exec(line);
  if (!m || !/[a-z_]+\.[a-z_.]+:\d/.test(line)) continue;
  const f = fields(line.trim().replace(/^\(/, '').replace(/\)[,;]?$/, ''));
  members.set(Number(f[0]), {
    n: Number(f[0]), name: f[1], city: f[3],
    interests: f[6].split(',').map((item) => { const [id, points, mode] = item.split(':'); return { id, points: Number(points), mode: mode || 'play' }; }),
  });
}
const centroid = (city) => {
  const m = new RegExp(`\\('in-[a-z-]+', '${city}', '[^']+', 'India', ([\\d.]+), ([\\d.]+)`).exec(places);
  return { lat: Number(m[1]), lng: Number(m[2]) };
};
const haversineKm = (a, b) => {
  const r = Math.PI / 180; const R = 6371.0088;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const km = (a, b) => haversineKm(centroid(a.city), centroid(b.city));
const ringOfKm = (d) => { const i = cfg.rings.findIndex((upper) => d <= upper); return i === -1 ? cfg.rings.length - 1 : i; };  // as rings.js ringOf

// Topology from the dotted ids, as 0004 derives parent_id and level (1 domain, 2 category, 3 interest, 4 niche).
const LEVEL = ['domain', 'category', 'interest', 'niche'];
const ids = new Set();
for (const m of members.values()) for (const i of m.interests) { const parts = i.id.split('.'); for (let k = 1; k <= parts.length; k += 1) ids.add(parts.slice(0, k).join('.')); }
const topology = buildTopology([...ids].map((id) => { const parts = id.split('.'); return { id, parentId: parts.length > 1 ? parts.slice(0, -1).join('.') : null, level: LEVEL[parts.length - 1] }; }));

// Local rarity (§3.3) in the viewer's region (rings 0-2: members whose place is <= 60 km away), holders of i or a descendant.
const ctxFor = (viewer) => {
  const region = [...members.values()].filter((m) => km(viewer, m) <= cfg.rings[2]);
  const N = region.length;
  const rarityOf = (id) => rarity(region.filter((m) => m.interests.some((i) => i.id === id || i.id.startsWith(`${id}.`))).length, N, cfg);
  return { topology, rarityOf, cfg };
};
const judge = (a, b) => {
  const A = members.get(a); const B = members.get(b);
  const d = km(A, B); const ring = ringOfKm(d);
  const shared = A.interests.filter((i) => B.interests.some((j) => j.id === i.id)).length;
  return { d, ring, shared, Rab: resonance(A, B, ctxFor(A)).R, Rba: resonance(B, A, ctxFor(B)).R };
};

test('the seed parses: 60 members in five cities', () => {
  assert.equal(members.size, 60);
  assert.deepEqual([...new Set([...members.values()].map((m) => m.city))].sort(), ['Bengaluru', 'Delhi', 'Mumbai', 'Pune', 'Thane']);
});

// [far member, partner] per city (supabase/tests/seed.test.sql _roles).
const FAR_STRONG = { Bengaluru: [29, 45], Mumbai: [37, 29], Thane: [45, 29], Pune: [21, 57], Delhi: [57, 21] };
for (const [city, [a, b]] of Object.entries(FAR_STRONG)) {
  test(`${city}: t${a} and t${b} clear the gate as a Worth-the-Distance match, from both sides`, () => {
    const j = judge(a, b);
    assert.equal(members.get(a).city, city);
    assert.ok(j.shared >= 3, `shared ${j.shared}`);
    assert.ok(j.d > 350 && j.ring >= cfg.wtdMinRing, `${j.d.toFixed(0)} km, ring ${j.ring}`);
    assert.ok(isWorthTheDistance(j.Rab, j.ring, cfg), `R(t${a}->t${b}) = ${j.Rab.toFixed(3)}`);
    assert.ok(isWorthTheDistance(j.Rba, j.ring, cfg), `R(t${b}->t${a}) = ${j.Rba.toFixed(3)}`);
  });
}

test('a weak far pair (t49 Pune and t57 Delhi share one interest) does not pass the gate', () => {
  const j = judge(49, 57);
  assert.equal(j.shared, 1);
  assert.ok(j.ring >= 3);
  for (const R of [j.Rab, j.Rba]) {
    assert.equal(isWorthTheDistance(R, j.ring, cfg), false, `R ${R.toFixed(3)}`);
    assert.equal(isEligible(R, j.ring, 0, cfg), false, `R ${R.toFixed(3)} eligible even at L = 0`);
  }
});

test('the strongest local match is local: each city\'s first member and a neighbour clear the ring-0 threshold', () => {
  for (const [f, nb] of [[25, 26], [33, 34], [39, 40], [49, 50], [53, 54]]) {
    const R = resonance(members.get(f), members.get(nb), ctxFor(members.get(f))).R;
    assert.ok(isEligible(R, 0, 40, cfg), `t${f}-t${nb}: R ${R.toFixed(3)}`);
  }
});
