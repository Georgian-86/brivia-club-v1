// The interest taxonomy as the signup shows it (spec §3.1): pure, no DOM. Shared by the guided signup's Interests
// screen (signup-profile-screens.js) and the old 4-step form (script.js, until Phase E Task 5 retires it).
// Levels 1-2 group (domain, category), levels 3-4 are selectable.

// D-038 R3: sensitive interests are never shown to others and do not affect who the member sees yet.
export const PRIVATE_HINT_TEXT = 'Private: never shown on your profile, and does not change who you see';
// R2: the separate consent for private interests (the copy of the consent panel).
export const PRIVATE_TITLE = 'Private interests';
export const PRIVATE_PURPOSE = "Private interests (like faith, health or orientation) help us understand you. They are never shown to anyone and don't change who you see. If we ever want to use them for matching, we'll ask you again first. You can withdraw any time in Profile → Privacy and account.";
export const PRIVATE_CONSENT_LABEL = 'I consent to Brivia storing my private interests for this purpose.';
// The server refuses a private interest until that consent is given; the client then opens the panel with this.
export const SENSITIVE_CONSENT_ERROR = 'Private interests need your consent first.';
export const INTEREST_CAP_TEXT = 'You can choose up to 12 interests. Remove one to add another.';

export const normalizeSearch = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

// { domains: [{ id, label }], groups: [{ id, label, domain, domainId, items: [{ id, label, sensitive, search }] }],
//   hidden: [items] }. With unlocked false, sensitive items go to `hidden` (they still have labels for stored picks).
export const buildInterestCatalog = (nodes, { unlocked = true } = {}) => {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((node) => [node.id, node]));
  const groups = new Map();
  const hidden = [];
  list.filter((node) => node.level === 2).forEach((node) => {
    groups.set(node.id, { id: node.id, label: node.label, domain: byId.get(node.parent_id)?.label || '', domainId: node.parent_id || '', items: [] });
  });
  list.filter((node) => node.level >= 3).forEach((node) => {
    const group = groups.get(node.id.split('.').slice(0, 2).join('.'));
    if (!group) return;
    const parent = node.level === 4 ? byId.get(node.parent_id)?.label || '' : '';
    const item = { id: node.id, label: node.label, sensitive: Boolean(node.sensitive), search: normalizeSearch(`${node.label} ${parent} ${group.label}`) };
    if (item.sensitive && !unlocked) hidden.push(item);
    else group.items.push(item);
  });
  const filled = [...groups.values()].filter((group) => group.items.length);
  const domainIds = [...new Set(filled.map((group) => group.domainId))];
  const domains = domainIds.map((id) => ({ id, label: byId.get(id)?.label || id }));
  return { domains, groups: filled, hidden };
};

// Search across every group: matching items per group, at most `cap` in all.
export const searchCatalog = (catalog, query, cap = 40) => {
  const text = normalizeSearch(query);
  if (!text) return [];
  let shown = 0;
  const out = [];
  for (const group of catalog?.groups || []) {
    const items = group.items.filter((item) => item.search.includes(text)).slice(0, Math.max(0, cap - shown));
    shown += items.length;
    if (items.length) out.push({ ...group, items });
  }
  return out;
};
