// Phase E guided signup: flow model. Pure, no DOM and no storage.
export const SCREENS = {
  email: ['welcome', 'email', 'code', 'adult', 'name', 'area', 'interests', 'reveal'],
  google: ['welcome', 'adult', 'name', 'area', 'interests', 'reveal'],
};
const QUESTIONS = (path) => (SCREENS[path] || []).filter((s) => s !== 'welcome' && s !== 'reveal');

// "Step n of N" for question screens (6 on email, 4 on Google); null for Welcome, Reveal and unknown screens.
export const stepLabel = (path, screen) => {
  const list = QUESTIONS(path);
  const at = list.indexOf(screen);
  return at < 0 ? null : `Step ${at + 1} of ${list.length}`;
};

// Where to land a returning member. `status` is my_onboarding_status plus adult_declared and has_name (from the
// member's own profile row). Returns 'welcome', 'done' or the first of adult/name/area/interests not yet done.
export const resumeScreen = ({ session, status } = {}) => {
  if (!session) return 'welcome';
  const s = status || {};
  if (s.completed) return 'done';
  if (!s.adult_declared) return 'adult';
  if (!s.has_name) return 'name';
  if (!s.has_cell) return 'area';
  const count = Number(s.interests) || 0;
  if (!(count >= 1 && count <= 12 && Number(s.points) === 20)) return 'interests';
  return 'done';
};

// The screen Back goes to. Null on Welcome and Reveal (interests are already saved). Once a session exists Back never lands on Email or Code.
export const backTarget = (path, screen, hasSession) => {
  const list = SCREENS[path] || [];
  const at = list.indexOf(screen);
  if (at <= 0 || screen === 'reveal') return null;
  const target = list[at - 1];
  return hasSession && (target === 'email' || target === 'code') ? 'welcome' : target;
};

// Exactly six digits after stripping spaces and dashes; or the first 6-digit run inside a longer text.
export const parseOtp = (text) => {
  const raw = String(text ?? '');
  const stripped = raw.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(stripped)) return stripped;
  const run = raw.match(/(?<!\d)\d{6}(?!\d)/);
  return run ? run[0] : null;
};
