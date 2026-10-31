// Guided signup (polish wave B, D-073; first built as D-067/D-068, removed by D-069): one question per screen. Pure
// navigation: which screens a path has, the step label and the bubble states above the card, where a returning member
// resumes, where Back goes, and the classic switch. There is no points screen: interests save with evenSplit.
// `verify` ("Check your email.") is a terminal screen of the email path when signup needs email confirmation; it is
// not a step.
//
// D-102 (founder, 2026-10-28): two phases. SIGNUP ends with a profile photo, which is required, and creates the account.
// SETUP (area, then interests) is not part of signup: it is the first thing a new member sees once the account exists
// (straight after signup, or after confirming the email and logging in), and nobody reaches the app without it (the
// server's completion rule needs a home area and interests; the app sends an incomplete member back here).
// D-112 (founder, 2026-10-31): after the photo, "About you" asks what the member is looking for and a short bio, both
// required. It is now the last signup screen: its button creates the account and saves the profile.
export const SETUP = ['area', 'interests'];
export const SCREENS = {
  email: ['welcome', 'account', 'adult', 'name', 'details', 'photo', 'about', ...SETUP, 'reveal'],
  google: ['welcome', 'adult', 'name', 'details', 'photo', 'about', ...SETUP, 'reveal'],
};
// The last signup screen: its primary button creates the account and saves the profile.
export const SIGNUP_LAST = 'about';
export const isSetupScreen = (screen) => SETUP.includes(screen);

// The icon each question shows in its bubble (signup-screens.js draws them as inline SVG).
export const STEP_ICONS = { account: 'mail', adult: 'shield', name: 'person', details: 'phone', photo: 'camera', about: 'note', area: 'pin', interests: 'spark' };
const TERMINAL = ['reveal', 'verify'];
// The questions of the phase `screen` belongs to (signup questions for welcome / verify, setup for reveal).
const questions = (path, screen) => {
  if (isSetupScreen(screen) || screen === 'reveal') return [...SETUP];
  return (SCREENS[path] || SCREENS.email).filter((s) => s !== 'welcome' && s !== 'reveal' && !isSetupScreen(s));
};

export const stepLabel = (path, screen) => {
  const list = questions(path, screen);
  const at = list.indexOf(screen);
  if (at < 0) return null;
  return isSetupScreen(screen) ? `Set up ${at + 1} of ${list.length}` : `Step ${at + 1} of ${list.length}`;
};

// One bubble per question of the current phase: done before the current one, current, pending after. On Reveal or
// Verify every bubble is done.
export const stepStates = (path, screen) => {
  const list = questions(path, screen);
  const at = TERMINAL.includes(screen) ? list.length : list.indexOf(screen);
  return list.map((s, i) => ({ screen: s, state: i < at ? 'done' : i === at ? 'current' : 'pending' }));
};

// status: { adult_declared, has_name, has_phone, has_gender, has_photo, has_about, has_cell, interests, points,
// completed } (my_onboarding_status plus the member's own profile row). 'done' means go to the app. A completed member
// is never sent back for a photo or About you (the requirements are for signups from D-102 / D-112 on).
export const resumeScreen = ({ session, status = {} }) => {
  if (!session) return 'welcome';
  if (status.completed) return 'done';
  if (!status.adult_declared) return 'adult';
  if (!status.has_name) return 'name';
  if (!status.has_phone || !status.has_gender) return 'details';
  if (status.has_photo === false) return 'photo';
  if (status.has_about === false) return 'about';
  if (!status.has_cell) return 'area';
  if (!(status.interests > 0 && status.points === 20)) return 'interests';
  return 'done';
};

// Once the session exists, Back never returns to Account: the earliest target is Welcome. Setup never goes back into
// signup (the account exists by then): Area has no Back.
export const backTarget = (path, screen, hasSession) => {
  const list = SCREENS[path] || SCREENS.email;
  const at = list.indexOf(screen);
  if (at <= 0 || screen === SETUP[0]) return null;
  const prev = list[at - 1];
  return hasSession && prev === 'account' ? 'welcome' : prev;
};

// VITE_SIGNUP_FLOW: `classic` keeps the 4-step form for one release (rollback); anything else is the guided flow.
export const signupFlowMode = (value) => (String(value ?? '').trim().toLowerCase() === 'classic' ? 'classic' : 'guided');

// D-082b: the Interests picker shows one category at a time. `nodes` is the whole active taxonomy (levels 1-4);
// only offered nodes (not sensitive, level 3-4, labelled) are listed. "Popular" comes first: the popular labels that
// exist, in their order, topped up round-robin across the categories to `size`. Then one group per top-level
// category in taxonomy order, labelled by its level-1 node (or the id, capitalised, when that node is missing).
export const isOffered = (n) => Boolean(n && !n.sensitive && n.level >= 3 && String(n.label || '').trim());
// D-109: the founder's A-Z catalogue (interest_node.catalog_order, 0017). One group per first letter (accents folded),
// in catalogue order; anything not A-Z goes under "#", last. Only offered catalogue nodes are listed.
export const hasCatalog = (nodes) => Array.isArray(nodes) && nodes.some((n) => Number.isInteger(n?.catalog_order));
export const catalogGroups = (nodes = []) => {
  const groups = new Map();
  nodes.filter((n) => isOffered(n) && Number.isInteger(n.catalog_order))
    .sort((a, b) => a.catalog_order - b.catalog_order)
    .forEach((n) => {
      const first = String(n.label).trim().normalize('NFD').charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(first) ? first : '#';
      if (!groups.has(key)) groups.set(key, { id: `letter-${key}`, label: key, items: [] });
      groups.get(key).items.push(n);
    });
  return [...groups.values()].sort((a, b) => (a.label === '#') - (b.label === '#') || a.label.localeCompare(b.label));
};

// "Other" (D-109): the client's copy of add_member_interest's check. Trims and collapses spaces; 2-40 characters;
// letters (any script, with their marks), digits, spaces and & + - . ' / (curly apostrophes become straight ones); not digits and punctuation only; no links.
// Returns the clean label, or '' when the server would refuse it (the blocked-words list stays on the server).
export const normalizeInterestLabel = (text) => {
  const v = String(text ?? '').replace(/[\u2018\u2019]/g, "'").trim().replace(/\s+/g, ' ');
  if (v.length < 2 || v.length > 40) return '';
  if (!/^[\p{L}\p{M}\p{N} &+\-.'/]+$/u.test(v)) return '';
  if (/^[0-9 &+\-.'/]+$/.test(v)) return '';
  if (/(https?|www\.|\.(com|in|net|org|io)\b)/i.test(v)) return '';
  return v;
};

export const groupInterests = (nodes = [], popular = [], { size = 16 } = {}) => {
  const offered = nodes.filter(isOffered);
  if (!offered.length) return [];
  const tops = new Map();
  for (const n of offered) {
    const top = String(n.id).split('.')[0];
    if (!tops.has(top)) {
      const head = nodes.find((x) => x && x.id === top);
      tops.set(top, { id: top, label: String(head?.label || '').trim() || top.charAt(0).toUpperCase() + top.slice(1).replace(/_/g, ' '), items: [] });
    }
    tops.get(top).items.push(n);
  }
  const categories = [...tops.values()];
  const chosen = [];
  const seen = new Set();
  const add = (n) => { if (n && !seen.has(n.id) && chosen.length < size) { seen.add(n.id); chosen.push(n); } };
  for (const label of popular) add(offered.find((n) => n.label.toLowerCase() === String(label).toLowerCase()));
  for (let round = 0; chosen.length < size && categories.some((c) => c.items.length > round); round += 1) {
    for (const c of categories) add(c.items[round]);
  }
  return [{ id: 'popular', label: 'Popular', items: chosen }, ...categories];
};
