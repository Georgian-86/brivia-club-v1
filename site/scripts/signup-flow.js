// Guided signup (polish wave B, D-073; first built as D-067/D-068, removed by D-069): one question per screen. Pure
// navigation: which screens a path has, the step label and the bubble states above the card, where a returning member
// resumes, where Back goes, and the classic switch. There is no points screen: interests save with evenSplit.
// `verify` ("Check your email.") is a terminal screen of the email path when signup needs email confirmation; it is
// not a step.
export const SCREENS = {
  email: ['welcome', 'account', 'adult', 'name', 'details', 'area', 'interests', 'reveal'],
  google: ['welcome', 'adult', 'name', 'details', 'area', 'interests', 'reveal'],
};

// The icon each question shows in its bubble (signup-screens.js draws them as inline SVG).
export const STEP_ICONS = { account: 'mail', adult: 'shield', name: 'person', details: 'phone', area: 'pin', interests: 'spark' };
const TERMINAL = ['reveal', 'verify'];
const questions = (path) => (SCREENS[path] || SCREENS.email).filter((s) => s !== 'welcome' && s !== 'reveal');

export const stepLabel = (path, screen) => {
  const list = questions(path);
  const at = list.indexOf(screen);
  return at < 0 ? null : `Step ${at + 1} of ${list.length}`;
};

// One bubble per question: done before the current one, current, pending after. On Reveal or Verify every bubble is done.
export const stepStates = (path, screen) => {
  const list = questions(path);
  const at = TERMINAL.includes(screen) ? list.length : list.indexOf(screen);
  return list.map((s, i) => ({ screen: s, state: i < at ? 'done' : i === at ? 'current' : 'pending' }));
};

// status: { adult_declared, has_name, has_phone, has_gender, has_cell, interests, points, completed }
// (my_onboarding_status plus the member's own profile row). 'done' means go to the app.
export const resumeScreen = ({ session, status = {} }) => {
  if (!session) return 'welcome';
  if (status.completed) return 'done';
  if (!status.adult_declared) return 'adult';
  if (!status.has_name) return 'name';
  if (!status.has_phone || !status.has_gender) return 'details';
  if (!status.has_cell) return 'area';
  if (!(status.interests > 0 && status.points === 20)) return 'interests';
  return 'done';
};

// Once the session exists, Back never returns to Account: the earliest target is Welcome.
export const backTarget = (path, screen, hasSession) => {
  const list = SCREENS[path] || SCREENS.email;
  const at = list.indexOf(screen);
  if (at <= 0) return null;
  const prev = list[at - 1];
  return hasSession && prev === 'account' ? 'welcome' : prev;
};

// VITE_SIGNUP_FLOW: `classic` keeps the 4-step form for one release (rollback); anything else is the guided flow.
export const signupFlowMode = (value) => (String(value ?? '').trim().toLowerCase() === 'classic' ? 'classic' : 'guided');
