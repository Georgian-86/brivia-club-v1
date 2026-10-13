// Phase E guided signup: flow model. Pure, no DOM and no storage.
import { realName } from './onboarding-guard.js';
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

// Exactly six digits after stripping spaces and dashes; or, inside a longer text, the first run of exactly six digits
// written with at most one internal space or dash ("Your code is 123 456."). A longer run (7+ digits) never counts.
export const parseOtp = (text) => {
  const raw = String(text ?? '');
  const stripped = raw.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(stripped)) return stripped;
  for (const [run] of raw.matchAll(/\d+(?:[ -]\d+)*/g)) {
    const digits = run.replace(/[ -]/g, '');
    if (digits.length === 6 && run.length - digits.length <= 1) return digits;
  }
  return null;
};

// VITE_SIGNUP_METHODS: a comma list of 'google' and 'email' (order kept, duplicates and unknown names dropped). Empty or
// unset only hides the signup buttons (Welcome shows "Signups open soon" and Log in); it does not close signup. To close
// it, also turn off Supabase Auth "Allow new users to sign up" (the login Google button and direct API calls can
// otherwise still create accounts).
export const signupMethods = (raw) => {
  const out = [];
  for (const name of String(raw ?? '').split(',').map((s) => s.trim().toLowerCase())) {
    if ((name === 'google' || name === 'email') && !out.includes(name)) out.push(name);
  }
  return out;
};

// The screen showScreen really shows. Once a session exists, Email and Code turn into Welcome (it says who is signed
// in); Code without an address to send to turns into Email.
export const screenToShow = (requested, { hasSession = false, email = '' } = {}) => {
  if (hasSession && (requested === 'email' || requested === 'code')) return 'welcome';
  if (requested === 'code' && !String(email || '').trim()) return 'email';
  return requested;
};

const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// "Send code" again for the address a code just went to, inside the resend wait: reuse that code (go to Code) instead
// of sending, so the Email screen is no way around the Resend countdown.
export const reuseSentCode = (email, { sentTo = '', resendAt = 0 } = {}, now = Date.now()) =>
  Boolean(String(sentTo || '').trim()) && sameEmail(email, sentTo) && now < resendAt;

// An expired code sends a new one by itself at most once per Code screen, and never inside the resend wait.
export const autoResendAllowed = ({ resendAt = 0, autoResent = false } = {}, now = Date.now()) => !autoResent && now >= resendAt;

// The Reveal (Phase E Task 4). rows: deck_candidates rows (shared_interests: labels this member shares with the card).
// Qualitative copy only, never a count: with a shared row it names the first of the member's picks that a row shares
// (else the shared label itself); otherwise the member is one of the first in their area.
const firstName = (name) => realName(name).split(/\s+/)[0];
export const revealCopy = ({ name = '', picks = [], rows = [], area = '' } = {}) => {
  const first = firstName(name);
  const title = first ? `You're in, ${first}.` : "You're in.";
  const shared = (Array.isArray(rows) ? rows : []).flatMap((row) => (Array.isArray(row?.shared_interests) ? row.shared_interests : []))
    .map((label) => String(label || '').trim()).filter(Boolean);
  if (shared.length) {
    const keys = new Set(shared.map((label) => label.toLowerCase()));
    const pick = (Array.isArray(picks) ? picks : []).find((item) => keys.has(String(item?.label || '').trim().toLowerCase()));
    return { title, line: `People near you are into ${pick ? pick.label : shared[0]}. Your deck is ready.`, shared: true };
  }
  const place = String(area || '').replace(/\s*\(city-wide\)$/, '').trim();
  return { title, line: `You're one of the first in ${place || 'your area'}. We'll bring people to you as the club grows.`, shared: false };
};
