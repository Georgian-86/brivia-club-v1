// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.

/**
 * Build an interest topology with a precomputed ancestor chain per node.
 * nodes: {id, parentId|null, level: 'domain'|'category'|'interest'|'niche'}[]
 */
export function buildTopology(nodes) {
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  const info = new Map();
  for (const n of nodes) {
    const seen = new Set([n.id]);
    let domain = n.level === 'domain' ? n.id : null;
    let category = n.level === 'category' ? n.id : null;
    let cur = n;
    while (cur.parentId != null) {
      const p = byId.get(cur.parentId);
      if (!p || seen.has(p.id)) break; // dangling parent or cycle: stop
      seen.add(p.id);
      if (p.level === 'domain' && domain == null) domain = p.id;
      if (p.level === 'category' && category == null) category = p.id;
      cur = p;
    }
    info.set(n.id, { parentId: n.parentId ?? null, domain, category });
  }
  return { info };
}

/** Topology similarity of two interest ids (spec §3.1). O(1) per call. */
export function topo(t, i, j, cfg) {
  if (i === j) return cfg.topo.same;
  const a = t.info.get(i);
  const b = t.info.get(j);
  if (!a || !b) return 0;
  if (a.parentId === j || b.parentId === i) return cfg.topo.parentChild;
  if (a.category != null && a.category === b.category) return cfg.topo.sibling;
  if (a.domain != null && a.domain === b.domain) return cfg.topo.domain;
  return 0;
}
