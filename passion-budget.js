// Passion Budget (ORBIT spec §3.2): pure state helpers for the signup "Your signals" step. No DOM, no storage.
// State: { items: [{ id, label, points, mode }] }. Every helper returns a new state (or the same one when nothing
// changes) and never mutates its input. The server (set_member_interests) re-checks every rule.
export const BUDGET = 20;
export const MAX_INTERESTS = 12;
export const MODES = ['learn', 'play', 'teach', 'build'];
export const DEFAULT_MODE = 'play';

const validMode = (mode) => (MODES.includes(mode) ? mode : DEFAULT_MODE);
const spent = (state) => state.items.reduce((sum, item) => sum + item.points, 0);

export const emptyBudget = () => ({ items: [] });

export const pointsLeft = (state) => BUDGET - spent(state);

// Adds { id, label } with 1 point. Refuses a duplicate or a 13th interest. When no point is left, the new interest's
// point is taken from the largest item (the first chosen one on a tie).
export const addInterest = (state, { id, label }) => {
  if (!id || state.items.some((item) => item.id === id) || state.items.length >= MAX_INTERESTS) return state;
  let items = state.items.map((item) => ({ ...item }));
  if (pointsLeft(state) <= 0) {
    const largest = items.reduce((best, item) => (item.points > best.points ? item : best), items[0]);
    if (!largest || largest.points <= 1) return state;
    largest.points -= 1;
  }
  items = [...items, { id, label: String(label || id), points: 1, mode: DEFAULT_MODE }];
  return { items };
};

export const removeInterest = (state, id) => {
  if (!state.items.some((item) => item.id === id)) return state;
  return { items: state.items.filter((item) => item.id !== id).map((item) => ({ ...item })) };
};

// Moves one item's points by delta, clamped so the item keeps at least 1 point and the total stays at most 20.
export const stepPoints = (state, id, delta) => {
  const target = state.items.find((item) => item.id === id);
  if (!target) return state;
  const next = Math.min(Math.max(1, target.points + Math.trunc(Number(delta) || 0)), target.points + pointsLeft(state));
  if (next === target.points) return state;
  return { items: state.items.map((item) => (item.id === id ? { ...item, points: next } : { ...item })) };
};

export const setMode = (state, id, mode) => {
  if (!MODES.includes(mode) || !state.items.some((item) => item.id === id)) return state;
  return { items: state.items.map((item) => (item.id === id ? { ...item, mode } : { ...item })) };
};

export const isComplete = (state) => state.items.length >= 1 && state.items.length <= MAX_INTERESTS && spent(state) === BUDGET;

export const toPayload = (state) => state.items.map((item) => ({ interest_id: item.id, points: item.points, mode: validMode(item.mode) }));

export const counterText = (state) => `${pointsLeft(state)} of ${BUDGET} points left`;

// Rebuilds a state from my_interests() rows ({ interest_id, label, points, mode }) or a stored pending list
// ({ id, label, points, mode }). Drops rows without an id and duplicates; keeps at most 12; points become integers >= 1.
export const budgetFromRows = (rows) => {
  const items = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = row && typeof row === 'object' ? String(row.interest_id || row.id || '') : '';
    if (!id || items.some((item) => item.id === id) || items.length >= MAX_INTERESTS) return;
    items.push({ id, label: String(row.label || id), points: Math.max(1, Math.trunc(Number(row.points) || 1)), mode: validMode(row.mode) });
  });
  return { items };
};
