// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildTopology, topo } from '../src/topology.js';

const cfg = loadConfig();
const nodes = [
  { id: 'sports', parentId: null, level: 'domain' },
  { id: 'racket', parentId: 'sports', level: 'category' },
  { id: 'badminton', parentId: 'racket', level: 'interest' },
  { id: 'doubles-badminton', parentId: 'badminton', level: 'niche' },
  { id: 'tennis', parentId: 'racket', level: 'interest' },
  { id: 'team', parentId: 'sports', level: 'category' },
  { id: 'football', parentId: 'team', level: 'interest' },
  { id: 'music', parentId: null, level: 'domain' },
  { id: 'strings', parentId: 'music', level: 'category' },
  { id: 'guitar', parentId: 'strings', level: 'interest' },
];
const t = buildTopology(nodes);

test('same node is 1', () => assert.equal(topo(t, 'badminton', 'badminton', cfg), 1));
test('parent/child is 0.85 both orders', () => {
  assert.equal(topo(t, 'badminton', 'doubles-badminton', cfg), 0.85);
  assert.equal(topo(t, 'doubles-badminton', 'badminton', cfg), 0.85);
});
test('siblings under same category is 0.55', () => assert.equal(topo(t, 'badminton', 'tennis', cfg), 0.55));
test('same domain only is 0.2', () => assert.equal(topo(t, 'badminton', 'football', cfg), 0.2));
test('different domain is 0', () => assert.equal(topo(t, 'badminton', 'guitar', cfg), 0));
test('unknown ids match only exactly', () => {
  assert.equal(topo(t, 'unknown-x', 'unknown-x', cfg), 1);
  assert.equal(topo(t, 'unknown-x', 'badminton', cfg), 0);
  assert.equal(topo(t, 'badminton', 'unknown-x', cfg), 0);
});

// D-109: a member's own interest ("Other", member.custom.*) is not yet placed in the tree: exact id only, never a
// sibling of another member's own interest.
test('an unplaced node matches only by exact id', () => {
  const u = buildTopology([
    { id: 'member', parentId: null, level: 'domain', placed: false },
    { id: 'member.custom', parentId: 'member', level: 'category', placed: false },
    { id: 'member.custom.kite_club', parentId: 'member.custom', level: 'interest', placed: false },
    { id: 'member.custom.bonsai', parentId: 'member.custom', level: 'interest', placed: false },
    ...nodes,
  ]);
  assert.equal(topo(u, 'member.custom.kite_club', 'member.custom.kite_club', cfg), 1);
  assert.equal(topo(u, 'member.custom.kite_club', 'member.custom.bonsai', cfg), 0);
  assert.equal(topo(u, 'member.custom.kite_club', 'member.custom', cfg), 0);
  assert.equal(topo(u, 'member.custom.kite_club', 'badminton', cfg), 0);
  assert.equal(topo(u, 'badminton', 'tennis', cfg), 0.55);
});
