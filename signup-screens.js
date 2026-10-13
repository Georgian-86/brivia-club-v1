// Phase E guided signup: one question per screen inside #guided-signup (auth.html). This module owns the shell (step
// label, progress bar, Back, the pinned primary button) and the account screens: Welcome, Email, Code. Task 4 adds
// the profile screens with registerScreen(name, { render, next }).
//
// Screen contract: render(ctx) builds the screen into ctx.body under the heading ctx.title, sets the primary action
// with ctx.primary(label, { onClick, disabled }) and may return a cleanup function. When a screen has next(ctx) and no
// onClick, the primary button runs next (busy while pending); next resolves to the screen to show, or null to stay.
import { stepLabel, backTarget, resumeScreen } from './signup-flow.js';
import { otpBoxesAfterInput } from './otp-input.js';
import { signupErrorCopy, otpErrorKind, OTP_WRONG, OTP_EXPIRED } from './signup-errors.js';
import { supabase, sendEmailCode, verifyEmailCode, onboardingStatus } from './supabase.js';
import { setBusy } from './app-skeletons.js';

const RESEND_WAIT_MS = 60 * 1000;
const LEAVE_MS = 260;  // a little longer than the 200 ms swap, so the outgoing screen has finished fading
const PATH_KEY = 'brivia-signup-path';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Headings for screens Task 4 has not registered yet (the shell still shows them, with the step label).
const TITLES = {
  adult: 'Are you 18 or older?',
  name: 'What should members call you?',
  area: 'Where are you based?',
  interests: 'What are you into?',
  reveal: "You're in.",
};

const registry = new Map();
const state = { path: 'email', screen: null, email: '', sentAt: 0, resendAt: 0, session: null, methods: [] };
let deps = { activate: () => {}, login: () => {}, startGoogle: async () => null };
let root = null;
let shell = {};
let primaryAction = null;
let cleanup = null;

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
};
const linkButton = (text, onClick, attrs = {}) => {
  const button = el('button', { type: 'button', class: 'gs-link', text, ...attrs });
  button.addEventListener('click', onClick);
  return button;
};
const storePath = (path) => { try { window.sessionStorage.setItem(PATH_KEY, path); } catch { /* storage unavailable */ } };
const storedPath = () => { try { return window.sessionStorage.getItem(PATH_KEY); } catch { return null; } };
const realName = (value) => { const name = String(value || '').trim(); return name && name !== 'New Member' ? name : ''; };

export const registerScreen = (name, def) => { registry.set(name, def); };
export const guidedScreen = () => state.screen;

const refreshSession = async () => {
  if (!supabase) { state.session = null; return; }
  try {
    const { data } = await supabase.auth.getSession();
    state.session = data?.session || null;
  } catch { state.session = null; }
  if (state.session) {
    const provider = state.session.user?.app_metadata?.provider;
    state.path = storedPath() === 'google' || provider === 'google' ? 'google' : 'email';
  }
};

// Where a signed-in member continues: the first incomplete question, or 'done'. Reads my_onboarding_status and the
// member's own profile row (adult_declared_at, name). A failed read lands on 18+, the first question.
const resumeTarget = async () => {
  if (!state.session || !supabase) return 'welcome';
  try {
    const [{ data: status }, { data: row }] = await Promise.all([
      onboardingStatus(),
      supabase.from('profiles').select('name, adult_declared_at').eq('id', state.session.user.id).maybeSingle(),
    ]);
    return resumeScreen({ session: state.session, status: { ...(status || {}), adult_declared: Boolean(row?.adult_declared_at), has_name: Boolean(realName(row?.name)) } });
  } catch {
    return 'adult';
  }
};

// ---- the shell ------------------------------------------------------------------------------------------------------

const updateShell = (name) => {
  root.dataset.screen = name;
  const label = stepLabel(state.path, name);
  shell.step.textContent = label || '';
  const total = state.path === 'google' ? 4 : 6;
  const at = label ? Number(label.match(/^Step (\d+)/)[1]) : name === 'reveal' ? total : 0;
  shell.progress.setAttribute('aria-valuemax', String(total));
  shell.progress.setAttribute('aria-valuenow', String(at));
  shell.progress.setAttribute('aria-valuetext', label || (name === 'reveal' ? 'Done' : 'Not started'));
  shell.fill.style.width = `${(at / total) * 100}%`;
  shell.back.hidden = !backTarget(state.path, name, Boolean(state.session));
};

const setPrimary = (label, { onClick = null, disabled = false, hidden = false } = {}) => {
  setBusy(shell.primary, false);
  shell.primary.textContent = label || '';
  shell.primary.disabled = Boolean(disabled);
  shell.primary.hidden = Boolean(hidden) || !label;
  primaryAction = onClick;
};

const swapIn = (inner) => {
  const host = shell.host;
  for (const leaving of host.querySelectorAll('.gs-screen-inner.is-leaving')) leaving.remove();
  const old = host.querySelector('.gs-screen-inner');
  if (old) {
    old.querySelector('#signup-screen-title')?.removeAttribute('id');
    old.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    old.classList.add('is-leaving');
    old.setAttribute('aria-hidden', 'true');
    old.inert = true;
    window.setTimeout(() => old.remove(), LEAVE_MS);
  }
  inner.classList.add('is-entering');
  host.append(inner);
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => inner.classList.remove('is-entering')));
};

// Shows a screen. history: 'push' (a new browser history entry), 'replace' or 'none' (from popstate).
export const showScreen = (requested, { history = 'push' } = {}) => {
  if (!root) return;
  if (requested === 'done') { window.location.replace('/app.html'); return; }
  // Once a session exists, Email and Code are never shown again: Welcome says who is signed in.
  const name = state.session && (requested === 'email' || requested === 'code') ? 'welcome' : requested;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* a screen's cleanup never blocks the next one */ } }
  cleanup = null;
  state.screen = name;
  const title = el('h2', { id: 'signup-screen-title', class: 'gs-title', tabindex: '-1' });
  const body = el('div', { class: 'gs-body' });
  const inner = el('div', { class: 'gs-screen-inner', 'data-screen': name }, [title, body]);
  shell.secondary.replaceChildren();
  setPrimary('');
  const def = registry.get(name) || placeholder(name);
  const ctx = {
    state, title, body,
    primary: (label, opts = {}) => setPrimary(label, { ...opts, onClick: opts.onClick || (def.next ? () => runNext(def, ctx) : null) }),
    secondary: (...nodes) => shell.secondary.replaceChildren(...nodes.filter(Boolean)),
    go: (target, opts) => showScreen(target, opts),
    busy: (flag) => setBusy(shell.primary, flag),
    primaryButton: () => shell.primary,
  };
  cleanup = def.render(ctx) || null;
  swapIn(inner);
  updateShell(name);
  if (history !== 'none' && document.body.classList.contains('auth-page')) {
    const entry = { briviaAuthView: 'guided', signupScreen: name };
    const url = new URL(window.location.href);
    url.hash = '#signup';
    if (history === 'replace') window.history.replaceState(entry, '', url);
    else window.history.pushState(entry, '', url);
  }
  root.closest('.auth-panel')?.scrollTo?.({ top: 0 });
  title.focus({ preventScroll: true });
};

const runNext = async (def, ctx) => {
  ctx.busy(true);
  let target = null;
  // A screen's next() shows its own retry message; a throw only keeps the member on the screen, never a stuck button.
  try { target = await def.next(ctx); } catch { target = null; } finally { ctx.busy(false); }
  if (target) showScreen(target);
};

const placeholder = (name) => ({
  render(ctx) {
    ctx.title.textContent = TITLES[name] || '';
    ctx.primary('Continue', { disabled: true });
  },
});

// ---- Welcome ----------------------------------------------------------------------------------------------------------

const googleMark = () => el('span', { class: 'gs-google-mark', 'aria-hidden': 'true', text: 'G' });

registerScreen('welcome', {
  render(ctx) {
    ctx.title.textContent = 'Find your people.';
    const message = el('p', { class: 'gs-message', id: 'signup-error', role: 'alert' });
    if (state.session) {
      const email = state.session.user?.email || '';
      const signOut = linkButton('Sign out', async () => {
        setBusy(signOut, true);
        try { await supabase?.auth.signOut(); } catch { /* signed out locally either way */ }
        state.session = null;
        try { window.sessionStorage.removeItem(PATH_KEY); } catch { /* storage unavailable */ }
        showScreen('welcome', { history: 'replace' });
      });
      ctx.body.append(
        el('p', { class: 'gs-lead', text: 'Join in a minute. One question at a time.' }),
        el('p', { class: 'gs-signed-in' }, [`Signed in as ${email}`, el('span', { class: 'gs-dot', 'aria-hidden': 'true', text: '·' }), signOut]),
        message,
      );
      ctx.primary('Continue', {
        onClick: async () => {
          ctx.busy(true);
          const target = await resumeTarget();
          ctx.busy(false);
          showScreen(target === 'welcome' ? 'adult' : target);
        },
      });
      return null;
    }
    if (!state.methods.length) {
      ctx.body.append(el('p', { class: 'gs-lead', text: 'Signups open soon. Members can log in below.' }));
      ctx.primary('Log in', { onClick: () => deps.login() });
      return null;
    }
    ctx.body.append(el('p', { class: 'gs-lead', text: 'Join in a minute. One question at a time.' }), message);
    const startGoogle = async (button) => {
      message.textContent = '';
      storePath('google');
      state.path = 'google';
      setBusy(button, true);
      const error = await deps.startGoogle();
      if (error) {
        setBusy(button, false);
        message.textContent = typeof error === 'string' ? error : (error.message || 'Google sign-in could not start. Please try again.');
      }
    };
    const startEmail = () => { state.path = 'email'; storePath('email'); showScreen('email'); };
    const [first, second] = state.methods;
    const label = (m) => (m === 'google' ? 'Continue with Google' : 'Continue with email');
    ctx.primary(label(first), { onClick: () => (first === 'google' ? startGoogle(shell.primary) : startEmail()) });
    if (first === 'google') shell.primary.prepend(googleMark());
    const extra = [];
    if (second) {
      const other = el('button', { type: 'button', class: 'gs-secondary-btn', text: label(second) });
      if (second === 'google') other.prepend(googleMark());
      other.addEventListener('click', () => (second === 'google' ? startGoogle(other) : startEmail()));
      extra.push(other);
    }
    extra.push(el('p', { class: 'gs-member' }, ['Already a member? ', linkButton('Log in', () => deps.login())]));
    ctx.secondary(...extra);
    return null;
  },
});

// ---- Email ----------------------------------------------------------------------------------------------------------

registerScreen('email', {
  render(ctx) {
    ctx.title.textContent = "What's your email?";
    const help = el('p', { class: 'gs-help', id: 'signup-email-help', text: "We'll send you a 6-digit code. No password needed." });
    const input = el('input', {
      class: 'gs-input', id: 'signup-email', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email',
      autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'send', placeholder: 'you@example.com',
      'aria-labelledby': 'signup-screen-title', 'aria-describedby': 'signup-email-help signup-error',
    });
    input.value = state.email;
    const message = el('p', { class: 'gs-message', id: 'signup-error', role: 'alert' });
    ctx.body.append(help, input, message);
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); message.textContent = ''; });
    ctx.primary('Send code', {
      onClick: async () => {
        const email = input.value.trim();
        if (!EMAIL_RE.test(email)) {
          message.textContent = 'Enter your email address, like name@example.com.';
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        message.textContent = '';
        ctx.busy(true);
        const { error } = await sendEmailCode(email);
        ctx.busy(false);
        if (error) { message.textContent = signupErrorCopy(error); return; }
        state.email = email;
        state.sentAt = Date.now();
        state.resendAt = state.sentAt + RESEND_WAIT_MS;
        state.path = 'email';
        storePath('email');
        showScreen('code');
      },
    });
    return null;
  },
});

// ---- Code -----------------------------------------------------------------------------------------------------------

const resendLabel = (msLeft) => {
  const s = Math.ceil(msLeft / 1000);
  return `Resend in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

registerScreen('code', {
  render(ctx) {
    ctx.title.textContent = 'Enter the code';
    const lead = el('p', { class: 'gs-help', id: 'signup-code-help' }, ['We sent a 6-digit code to ', el('strong', { text: state.email }), '.']);
    const group = el('div', { class: 'gs-otp', role: 'group', 'aria-labelledby': 'signup-screen-title', 'aria-describedby': 'signup-code-help signup-error' });
    // The first box takes the whole code from the OS one-time-code autofill (iOS truncates autofill to maxlength, so
    // it allows 6); the input handler keeps one digit per box. The others hold one digit each.
    const inputs = Array.from({ length: 6 }, (_, i) => el('input', {
      class: 'gs-otp-box', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: i === 0 ? '6' : '1',
      autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': `Digit ${i + 1} of 6`, enterkeyhint: 'done',
    }));
    group.append(...inputs);
    const message = el('p', { class: 'gs-message', id: 'signup-error', role: 'alert' });
    const note = el('p', { class: 'gs-note', role: 'status' });
    const resend = el('button', { type: 'button', class: 'gs-link', 'data-signup-resend': true, text: 'Resend code' });
    const links = el('div', { class: 'gs-links' }, [linkButton('Wrong email?', () => showScreen('email')), resend]);
    ctx.body.append(lead, group, message, note, links);

    let boxes = ['', '', '', '', '', ''];
    let verifying = false;
    let lastTried = '';
    let timer = 0;
    const paint = (focus) => {
      inputs.forEach((input, i) => { input.value = boxes[i]; });
      ctx.primaryButton().disabled = verifying || boxes.join('').length !== 6;
      if (focus != null) { inputs[focus].focus(); inputs[focus].select(); }
    };
    const setBoxesBusy = (busy) => {
      group.setAttribute('aria-busy', busy ? 'true' : 'false');
      inputs.forEach((input) => { input.disabled = busy; });
    };
    const tick = () => {
      const left = state.resendAt - Date.now();
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? resendLabel(left) : 'Resend code';
      if (left <= 0) { window.clearInterval(timer); timer = 0; }
    };
    const startCountdown = () => { window.clearInterval(timer); tick(); if (resend.disabled) timer = window.setInterval(tick, 1000); };
    const sendAgain = async () => {
      const { error } = await sendEmailCode(state.email);
      state.resendAt = Date.now() + RESEND_WAIT_MS;
      startCountdown();
      if (error) { message.textContent = signupErrorCopy(error); return false; }
      state.sentAt = Date.now();
      return true;
    };
    resend.addEventListener('click', async () => {
      message.textContent = '';
      note.textContent = '';
      setBusy(resend, true);
      const ok = await sendAgain();
      setBusy(resend, false);
      tick();
      if (ok) note.textContent = `We sent a new code to ${state.email}.`;
    });

    const verify = async () => {
      const token = boxes.join('');
      if (verifying || !/^\d{6}$/.test(token) || token === lastTried) return;
      verifying = true;
      lastTried = token;
      message.textContent = '';
      note.textContent = '';
      setBoxesBusy(true);
      ctx.busy(true);
      const { data, error } = await verifyEmailCode(state.email, token);
      if (!error && data?.session) {
        state.session = data.session;
        const target = await resumeTarget();
        verifying = false;
        showScreen(target === 'welcome' ? 'adult' : target);
        return;
      }
      verifying = false;
      setBoxesBusy(false);
      ctx.busy(false);
      const kind = otpErrorKind(error, Date.now() - state.sentAt);
      if (kind === 'expired') {
        boxes = ['', '', '', '', '', ''];
        paint(0);
        if (await sendAgain()) message.textContent = OTP_EXPIRED;
        inputs[0].focus();
        return;
      }
      if (kind === 'rate_limited') message.textContent = signupErrorCopy(error);
      else if (kind === 'wrong') message.textContent = OTP_WRONG;
      else message.textContent = "We couldn't check the code. Check your connection and try again.";
      if (kind !== 'wrong') lastTried = '';
      // The digits stay (the member sees what was tried); typing from the first box replaces them one by one.
      paint(0);
    };
    // Verifies by itself once the code is complete: typed into the last box, or pasted / autofilled in one go. A fix
    // in the middle of a full code waits for Verify (or Enter), and the exact code that just failed is not re-sent.
    const apply = (index, value) => {
      const result = otpBoxesAfterInput(boxes, index, value);
      boxes = result.boxes;
      paint(result.focus);
      const code = boxes.join('');
      if (code.length === 6 && (index === 5 || String(value).length > 1)) void verify();
    };

    inputs.forEach((input, index) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('paste', (event) => {
        event.preventDefault();
        apply(index, event.clipboardData?.getData('text') || '');
      });
      input.addEventListener('input', (event) => {
        // Typing hands over only the new character; autofill (and anything without event.data) the whole value.
        const typed = event.inputType === 'insertText' && event.data ? event.data : input.value;
        apply(index, typed);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); void verify(); }
        else if (event.key === 'Backspace' && !input.value) { event.preventDefault(); apply(index, ''); }
        else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); inputs[index - 1].focus(); }
        else if (event.key === 'ArrowRight' && index < 5) { event.preventDefault(); inputs[index + 1].focus(); }
      });
    });
    ctx.primary('Verify', { onClick: () => verify(), disabled: true });
    startCountdown();
    return () => window.clearInterval(timer);
  },
});

// ---- wiring ---------------------------------------------------------------------------------------------------------

// The pinned primary button sits above the on-screen keyboard: the keyboard covers innerHeight - visualViewport.height
// - offsetTop pixels at the bottom of the layout viewport.
const updateKeyboard = () => {
  const vv = window.visualViewport;
  const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  root?.style.setProperty('--gs-keyboard', `${Math.round(covered)}px`);
};

export const initGuidedSignup = ({ activate, login, startGoogle, methods = [] } = {}) => {
  root = document.querySelector('#guided-signup');
  if (!root) return;
  deps = { activate: activate || deps.activate, login: login || deps.login, startGoogle: startGoogle || deps.startGoogle };
  state.methods = methods;
  shell = {
    step: root.querySelector('[data-signup-step]'),
    progress: root.querySelector('.gs-progress'),
    fill: root.querySelector('[data-signup-progress-fill]'),
    back: root.querySelector('[data-signup-back]'),
    host: root.querySelector('[data-signup-host]'),
    primary: root.querySelector('[data-signup-primary]'),
    secondary: root.querySelector('[data-signup-secondary]'),
  };
  shell.primary.addEventListener('click', () => { if (!shell.primary.disabled) primaryAction?.(); });
  shell.back.addEventListener('click', () => {
    const target = backTarget(state.path, state.screen, Boolean(state.session));
    if (target) showScreen(target);
  });
  // Enter = Next from any text field (the code boxes verify by themselves).
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || !(event.target instanceof HTMLInputElement)) return;
    if (event.target.closest('.gs-otp')) return;
    event.preventDefault();
    if (!shell.primary.disabled && !shell.primary.hidden) shell.primary.click();
  });
  window.visualViewport?.addEventListener('resize', updateKeyboard);
  window.visualViewport?.addEventListener('scroll', updateKeyboard);
  updateKeyboard();
  supabase?.auth.onAuthStateChange((_event, session) => { state.session = session || null; });
};

// Opens the guided flow (the 'guided' auth view, at #signup). Defaults to Welcome; `path` presets email or google.
export const openGuidedSignup = async ({ path, screen, history = 'push' } = {}) => {
  if (!root) return;
  deps.activate(history);
  await refreshSession();
  if (path === 'email' || path === 'google') state.path = path;
  showScreen(screen || 'welcome', { history: history === 'none' ? 'none' : 'replace' });
};

// Browser Back/Forward onto a guided history entry (Email and Code turn into Welcome once signed in).
export const showGuidedFromHistory = (name) => showScreen(name || 'welcome', { history: 'none' });
