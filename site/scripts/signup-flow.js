// Guided signup (Phase E, D-067): one question per screen. Pure navigation: which screens a path has, the step label
// and the bubble states above the card, where a returning member resumes, and where Back goes.
export const SCREENS = {
  email: ['welcome', 'email', 'code', 'adult', 'name', 'area', 'interests', 'reveal'],
  google: ['welcome', 'adult', 'name', 'area', 'interests', 'reveal'],
};

// The icon each question shows in its bubble (signup-screens.js draws them as inline SVG).
export const STEP_ICONS = { email: 'mail', code: 'key', adult: 'check', name: 'person', area: 'pin', interests: 'spark' };
const PROFILE = ['adult', 'name', 'area', 'interests'];
const questions = (path) => (SCREENS[path] || SCREENS.email).filter((s) => s !== 'welcome' && s !== 'reveal');

export const stepLabel = (path, screen) => {
  const list = questions(path);
  const at = list.indexOf(screen);
  return at < 0 ? null : `Step ${at + 1} of ${list.length}`;
};

// One bubble per question: done before the current one, current, pending after. On Reveal every bubble is done.
export const stepStates = (path, screen) => {
  const list = questions(path);
  const at = screen === 'reveal' ? list.length : list.indexOf(screen);
  return list.map((s, i) => ({ screen: s, state: i < at ? 'done' : i === at ? 'current' : 'pending' }));
};

// status: { adult_declared, has_name, has_cell, interests, points, completed } (my_onboarding_status plus the
// member's own profile row). 'done' means go to the app.
export const resumeScreen = ({ session, status = {} }) => {
  if (!session) return 'welcome';
  if (status.completed) return 'done';
  if (!status.adult_declared) return 'adult';
  if (!status.has_name) return 'name';
  if (!status.has_cell) return 'area';
  if (!(status.interests > 0 && status.points === 20)) return 'interests';
  return 'done';
};

// Once the session exists, Back never returns to Email or Code: the earliest target is Welcome.
export const backTarget = (path, screen, hasSession) => {
  const list = SCREENS[path] || SCREENS.email;
  const at = list.indexOf(screen);
  if (at <= 0) return null;
  if (hasSession && screen === PROFILE[0]) return 'welcome';
  const prev = list[at - 1];
  return hasSession && (prev === 'email' || prev === 'code') ? 'welcome' : prev;
};

// VITE_SIGNUP_METHODS: a comma list of google and email. Empty means public signup is closed.
export const signupMethods = (value) => String(value || '').split(',').map((v) => v.trim().toLowerCase())
  .filter((v, i, all) => (v === 'google' || v === 'email') && all.indexOf(v) === i);
