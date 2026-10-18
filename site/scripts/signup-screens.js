// Guided signup (Phase E, D-067, D-068): one screen at a time (at most two questions on one), at every width. Renders into #guided-signup (auth.html):
// the bubble stepper (done / current / pending), the step label, one screen, and Back + one primary button.
// Every answer is saved when the member presses the primary button, through the existing RPCs; nothing is kept in
// storage, and coordinates only ever travel in the body of set_home_location.
import {
  supabase, sendEmailCode, verifyEmailCode, markPasswordless, setPassword, declareAdult, setHomeLocation, setHomeCity,
  setMemberInterests, fetchInterestNodes, searchPlaces, onboardingStatus, saveProfile, isRateLimited,
} from './supabase.js';
import { SCREENS, STEP_ICONS, stepLabel, stepStates, resumeScreen, backTarget, signupMethods } from './signup-flow.js';
import { OTP_LENGTH, parseOtp, otpBoxesAfterInput } from './otp-input.js';
import { evenSplit, MAX_INTERESTS } from './passion-budget.js';
import { POPULAR_INTERESTS } from './discovery-catalog.js';

// The stored form of the default cover (the classic form's first suggestion; the DB keeps preset paths as written).
const DEFAULT_COVER = '/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG';
const RESEND_SECONDS = 60;
const PLACEHOLDER_NAME = 'New Member';
const realName = (value) => { const name = String(value || '').trim(); return name && name !== PLACEHOLDER_NAME ? name : ''; };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// The stored values (supabase.js normalizeGender), shown as they are.
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const phoneDigits = (value) => String(value || '').replace(/\D/g, '');
// The country codes the classic form offers (one list in auth.html), else the common ones.
const countryCodes = () => {
  const options = [...document.querySelectorAll('#signup-form select[name="phoneCountryCode"] option')].map((o) => o.value).filter(Boolean);
  return options.length ? options : ['+91', '+1', '+44', '+61', '+65', '+971'];
};

const ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
  key: '<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H21M17.5 12v3.2M20.5 12v2.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.2"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M10.5 17.8h3"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1.4-3.8 4.3-5.8 7.5-5.8s6.1 2 7.5 5.8"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  tick: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
const STEP_NAMES = { email: 'Email', code: 'Code', password: 'Password', about: 'You', details: 'Details', area: 'Area', interests: 'Interests' };

export const COPY = {
  closed: 'Signups open soon.',
  emailInvalid: 'Enter a valid email address.',
  sendFailed: "We couldn't send the code. Please try again.",
  rateLimited: 'Too many codes asked for. Wait a minute, then try again.',
  noAccount: 'No account uses that email. Check it, or create one.',
  codeWrong: "That code didn't work. Check it, or send a new one.",
  saveFailed: "That didn't save. Check your connection and try again.",
  under18: "Brivia Club is for adults. Come back when you're 18.",
  nameMissing: 'Enter the name members should see.',
  passwordMismatch: "The two passwords don't match.",
  passwordWeak: 'Choose a longer, harder to guess password.',
  phoneInvalid: 'Enter a mobile number of 7 to 15 digits.',
  areaMissing: 'Use your location or pick your city.',
  geoFailed: "We couldn't get your location. Pick your city instead.",
  interestsLoad: "We couldn't load the interests. Please try again.",
  interestsMissing: 'Pick at least one interest.',
  cap: `You can pick up to ${MAX_INTERESTS}. Remove one to add another.`,
};

export const initGuidedSignup = ({ root, startGoogle, onLogin, onSignedOut, redirectToApp }) => {
  if (!root) return null;
  const methods = signupMethods(import.meta.env.VITE_SIGNUP_METHODS || 'google,email');
  const steps = root.querySelector('[data-guided-steps]');
  const label = root.querySelector('[data-guided-step-label]');
  const host = root.querySelector('[data-guided-host]');
  const errorBox = root.querySelector('[data-guided-error]');
  const actions = root.querySelector('[data-guided-actions]');
  const back = root.querySelector('[data-guided-back]');
  const next = root.querySelector('[data-guided-next]');
  const state = {
    path: 'email', screen: 'welcome', email: '', user: null, row: null, status: null, busy: false,
    picks: [], nodes: null, area: null, resendAt: 0, resendTimer: 0, current: null, login: false,
  };

  const setError = (text) => { errorBox.textContent = text || ''; errorBox.hidden = !text; };
  const setBusy = (busy) => {
    state.busy = busy;
    next.setAttribute('aria-busy', String(busy));
    next.disabled = busy || !state.current?.ready?.();
  };
  const refreshNext = () => { next.disabled = state.busy || !state.current?.ready?.(); };

  const renderSteps = () => {
    const list = stepStates(state.path, state.screen);
    steps.hidden = state.screen === 'welcome';
    steps.innerHTML = steps.hidden ? '' : list.map(({ screen, state: s }, i) => `
      <li class="guided-bubble is-${s}" data-step="${screen}" style="--i:${i}">
        <span class="guided-bubble-dot">${svg(STEP_ICONS[screen], 'guided-bubble-icon')}${svg('tick', 'guided-bubble-tick')}</span>
        <span class="guided-bubble-name">${STEP_NAMES[screen]}</span>
        <span class="sr-only">${s === 'done' ? 'done' : s === 'current' ? 'current step' : 'to do'}</span>
      </li>`).join('');
    const text = stepLabel(state.path, state.screen);
    label.textContent = text || '';
    label.hidden = !text;
  };

  // The swap: the outgoing screen fades and slides 8 px, the incoming one fades in (fade only under reduced motion).
  const show = async (screen, { focus = true } = {}) => {
    if (screen === 'done') { redirectToApp(); return; }
    const build = SCREEN_BUILDERS[screen];
    if (!build) return;
    window.clearInterval(state.resendTimer);
    setError('');
    const old = host.firstElementChild;
    if (old && !reducedMotion() && old.animate) {
      await old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 150, easing: 'ease-in' }).finished.catch(() => {});
    }
    state.screen = screen;
    state.current = build();
    host.innerHTML = '';
    const el = document.createElement('div');
    el.className = `guided-screen guided-screen--${screen}`;
    el.innerHTML = state.current.html;
    host.append(el);
    if (el.animate) el.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    renderSteps();
    const target = backTarget(state.path, screen, Boolean(state.user));
    back.hidden = !target || screen === 'reveal';
    actions.hidden = Boolean(state.current.noActions);
    next.innerHTML = `${escapeHtml(state.current.primary || 'Continue')} <span aria-hidden="true">&rarr;</span>`;
    root.dataset.screen = screen;
    // Every screen starts at its top (a long Interests list must not leave the Reveal scrolled away).
    const panel = root.closest('.auth-panel');
    if (panel) panel.scrollTop = 0;
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    state.current.mount?.(el);
    refreshNext();
    if (focus) root.querySelector('#signup-screen-title')?.focus({ preventScroll: true });
  };

  const goNext = async () => {
    if (state.busy || !state.current?.ready?.()) return;
    setError('');
    setBusy(true);
    try {
      const to = await state.current.submit();
      if (to) await show(to);
    } catch (error) {
      setError(error?.copy || COPY.saveFailed);
    } finally {
      setBusy(false);
    }
  };
  const fail = (copy) => { const error = new Error(copy); error.copy = copy; throw error; };

  // After a session exists (code verified, Google return, a returning member): the member's own row, created with a
  // placeholder name when missing (declare_adult needs a row), then the first unfinished screen.
  const ensureRow = async (user) => {
    const { data: row, error } = await supabase.from('profiles').select('id,name,adult_declared_at,phone_country_code,phone_number,gender').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (row) return row;
    const created = await saveProfile(user.id, { name: PLACEHOLDER_NAME, email: user.email || '', coverUrl: DEFAULT_COVER }, null);
    if (created.error) throw created.error;
    return { id: user.id, name: PLACEHOLDER_NAME, adult_declared_at: null };
  };
  const readStatus = async () => {
    const { data, error } = await onboardingStatus();
    if (error) throw error;
    return {
      ...(data || {}),
      needs_password: state.path === 'email' && state.user?.user_metadata?.passwordless === true,
      adult_declared: Boolean(state.row?.adult_declared_at),
      has_name: Boolean(realName(state.row?.name)),
      has_phone: phoneDigits(state.row?.phone_number).length >= 7,
      has_gender: GENDERS.includes(state.row?.gender),
    };
  };
  // The next unfinished screen after a save (the Reveal once nothing is left).
  const upNext = () => {
    const to = resumeScreen({ session: { user: state.user }, status: { ...state.status, completed: false } });
    return to === 'done' ? 'reveal' : to;
  };
  const resumeFor = async (user) => {
    state.user = user;
    state.email = user.email || state.email;
    state.path = user.app_metadata?.provider === 'google' ? 'google' : 'email';
    state.row = await ensureRow(user);
    state.status = await readStatus();
    return resumeScreen({ session: { user }, status: state.status });
  };

  // ---- Screens ------------------------------------------------------------------------------------------------
  const heading = (title, helper = '') => `<h2 id="signup-screen-title" tabindex="-1">${title}</h2>${helper ? `<p class="guided-helper">${helper}</p>` : ''}`;

  const SCREEN_BUILDERS = {
    welcome: () => {
      const signedIn = state.user;
      const closed = !methods.length && !signedIn;
      return {
        noActions: true,
        html: `${heading(signedIn ? 'Welcome back.' : 'Find your people.', closed ? COPY.closed : signedIn
          ? `You're signed in as <b>${escapeHtml(state.user.email || '')}</b>.`
          : 'A few quick steps, one screen at a time. About two minutes.')}
          <div class="guided-choices">
            ${signedIn ? '<button class="guided-choice guided-choice--primary" type="button" data-guided-continue>Continue <span aria-hidden="true">&rarr;</span></button><button class="guided-link" type="button" data-guided-signout>Sign out</button>' : ''}
            ${!signedIn && methods.includes('google') ? '<button class="guided-choice" type="button" data-guided-google><span class="guided-google" aria-hidden="true">G</span>Continue with Google</button>' : ''}
            ${!signedIn && methods.includes('email') ? `<button class="guided-choice guided-choice--primary" type="button" data-guided-email>${svg('mail', 'guided-choice-icon')}Continue with email</button>` : ''}
            ${!signedIn ? '<p class="guided-login">Already a member? <button class="guided-link" type="button" data-guided-login>Log in</button></p>' : ''}
          </div>
          <p class="guided-fine">By continuing you agree to how we handle your data: <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>.</p>`,
        mount: (el) => {
          el.querySelector('[data-guided-google]')?.addEventListener('click', () => { state.path = 'google'; startGoogle(); });
          el.querySelector('[data-guided-email]')?.addEventListener('click', () => { state.path = 'email'; void show('email'); });
          el.querySelector('[data-guided-login]')?.addEventListener('click', () => onLogin());
          el.querySelector('[data-guided-continue]')?.addEventListener('click', async () => {
            try { await show(await resumeFor(state.user)); } catch { setError(COPY.saveFailed); }
          });
          el.querySelector('[data-guided-signout]')?.addEventListener('click', async () => {
            await supabase?.auth.signOut().catch(() => {});
            state.user = null; state.row = null; state.picks = [];
            onSignedOut?.();
            await show('welcome');
          });
        },
      };
    },

    email: () => ({
      primary: 'Send my code',
      html: `${heading(state.login ? 'Log in with a code' : "What's your email?", state.login ? "Enter your account's email and we'll send you a 6-digit code." : "We'll send you a 6-digit code to confirm it's yours.")}
        <label class="guided-field"><span class="sr-only">Email address</span>
          <input type="email" name="guided-email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${escapeHtml(state.email)}" required /></label>`,
      mount: (el) => {
        const input = el.querySelector('input');
        input.addEventListener('input', () => { state.email = input.value.trim(); refreshNext(); });
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void goNext(); } });
        window.setTimeout(() => input.focus({ preventScroll: true }), 60);
      },
      ready: () => EMAIL_RE.test(state.email),
      submit: async () => {
        if (!EMAIL_RE.test(state.email)) fail(COPY.emailInvalid);
        const { error } = await sendEmailCode(state.email, { create: !state.login });
        if (error && state.login && /signup|not allowed|not found/i.test(`${error.code || ''} ${error.message || ''}`)) fail(COPY.noAccount);
        if (error) fail(isRateLimited(error, error.status) || error.status === 429 ? COPY.rateLimited : COPY.sendFailed);
        state.resendAt = Date.now() + RESEND_SECONDS * 1000;
        return 'code';
      },
    }),

    code: () => {
      let boxes = Array(OTP_LENGTH).fill('');
      let verifying = false;
      const verify = async () => {
        const token = boxes.join('');
        if (token.length !== OTP_LENGTH || verifying) return;
        verifying = true;
        setError('');
        setBusy(true);
        try {
          const { data, error } = await verifyEmailCode(state.email, token);
          if (error || !data?.session) fail(COPY.codeWrong);
          // A brand-new account made by the code has no password yet: it gets the Password screen next. A login by
          // code (or an existing member who used the signup path) keeps the password they have.
          let user = data.user;
          const isNew = Date.now() - Date.parse(user?.created_at || 0) < 15 * 60 * 1000;
          if (!state.login && isNew && !user?.user_metadata?.passwordless && user?.user_metadata?.has_password !== true) {
            const marked = await markPasswordless().catch(() => null);
            user = marked?.data?.user || { ...user, user_metadata: { ...user.user_metadata, passwordless: true } };
          }
          await show(await resumeFor(user));
        } catch (error) {
          setError(error?.copy || COPY.saveFailed);
          root.querySelector('.guided-otp input')?.focus();
        } finally {
          verifying = false;
          setBusy(false);
        }
      };
      return {
        primary: 'Verify',
        html: `${heading('Enter your code', `We sent a 6-digit code to <b>${escapeHtml(state.email)}</b>. You can also tap the link in that email.`)}
          <div class="guided-otp" role="group" aria-label="6-digit code">
            ${Array.from({ length: OTP_LENGTH }, (_, i) => `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${i === 0 ? OTP_LENGTH : 1}" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${i + 1} of ${OTP_LENGTH}" data-otp="${i}" />`).join('')}
          </div>
          <div class="guided-code-links"><button class="guided-link" type="button" data-guided-wrong>Wrong email?</button><button class="guided-link" type="button" data-guided-resend disabled></button></div>`,
        mount: (el) => {
          const inputs = [...el.querySelectorAll('[data-otp]')];
          const paint = (focus) => { inputs.forEach((input, i) => { input.value = boxes[i]; }); if (focus !== undefined) inputs[focus]?.focus(); refreshNext(); };
          inputs.forEach((input, i) => {
            input.addEventListener('input', () => {
              const result = otpBoxesAfterInput(boxes, i, input.value);
              boxes = result.boxes;
              paint(result.focus);
              if (boxes.every(Boolean)) void verify();
            });
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Backspace' && !input.value) {
                event.preventDefault();
                const result = otpBoxesAfterInput(boxes, i, '');
                boxes = result.boxes;
                paint(result.focus);
              } else if (event.key === 'Enter') { event.preventDefault(); void verify(); }
            });
            input.addEventListener('paste', (event) => {
              const code = parseOtp(event.clipboardData?.getData('text'));
              if (!code) return;
              event.preventDefault();
              boxes = code.split('');
              paint(OTP_LENGTH - 1);
              void verify();
            });
          });
          el.querySelector('[data-guided-wrong]').addEventListener('click', () => { void show('email'); });
          const resend = el.querySelector('[data-guided-resend]');
          const tick = () => {
            const left = Math.max(0, Math.ceil((state.resendAt - Date.now()) / 1000));
            resend.disabled = left > 0;
            resend.textContent = left > 0 ? `Send a new code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Send a new code';
            if (!left) window.clearInterval(state.resendTimer);
          };
          tick();
          state.resendTimer = window.setInterval(tick, 1000);
          resend.addEventListener('click', async () => {
            resend.disabled = true;
            const { error } = await sendEmailCode(state.email, { create: !state.login });
            if (error) { setError(isRateLimited(error, error.status) || error.status === 429 ? COPY.rateLimited : COPY.sendFailed); }
            else { state.resendAt = Date.now() + RESEND_SECONDS * 1000; setError(''); }
            window.clearInterval(state.resendTimer);
            tick();
            state.resendTimer = window.setInterval(tick, 1000);
          });
          window.setTimeout(() => inputs[0]?.focus({ preventScroll: true }), 60);
        },
        ready: () => boxes.every(Boolean),
        submit: async () => { await verify(); return null; },
      };
    },

    password: () => {
      let pass = '';
      let again = '';
      return {
        primary: 'Save password',
        html: `${heading('Create a password', 'Use it to log in next time (an emailed code works too).')}
          <label class="guided-field guided-field--labelled"><span>Password</span>
            <input type="password" name="guided-password" autocomplete="new-password" minlength="${MIN_PASSWORD}" placeholder="At least ${MIN_PASSWORD} characters" /></label>
          <label class="guided-field guided-field--labelled"><span>Confirm password</span>
            <input type="password" name="guided-password-confirm" autocomplete="new-password" minlength="${MIN_PASSWORD}" placeholder="Type it again" /></label>`,
        mount: (el) => {
          const [a, b] = el.querySelectorAll('input');
          a.addEventListener('input', () => { pass = a.value; refreshNext(); });
          b.addEventListener('input', () => { again = b.value; refreshNext(); });
          b.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void goNext(); } });
          window.setTimeout(() => a.focus({ preventScroll: true }), 60);
        },
        ready: () => pass.length >= MIN_PASSWORD && again.length >= MIN_PASSWORD,
        submit: async () => {
          if (pass !== again) fail(COPY.passwordMismatch);
          const { data, error } = await setPassword(pass);
          if (error) fail(/weak|short|characters/i.test(error.message || '') ? COPY.passwordWeak : COPY.saveFailed);
          state.user = data?.user || { ...state.user, user_metadata: { ...state.user.user_metadata, passwordless: false, has_password: true } };
          state.status = { ...state.status, needs_password: false };
          return upNext();
        },
      };
    },

    about: () => {
      const meta = state.user?.user_metadata || {};
      let value = realName(state.row?.name) || realName(meta.full_name) || realName(meta.name);
      const declared = Boolean(state.row?.adult_declared_at);
      let adult = declared;
      return {
        html: `${heading('About you', "Members see your name. Brivia Club is for adults; we never ask for your date of birth.")}
          <label class="guided-field guided-field--labelled"><span>What should members call you?</span>
            <input type="text" name="guided-name" autocomplete="name" maxlength="60" placeholder="Your name" value="${escapeHtml(value)}" /></label>
          <label class="guided-check"><input type="checkbox" name="guided-adult" ${declared ? 'checked disabled' : ''} /><span>I'm 18 or older</span></label>
          <button class="guided-link guided-no" type="button" data-guided-under18 ${declared ? 'hidden' : ''}>I'm under 18</button>
          <p class="guided-fine"><a href="/privacy.html" target="_blank" rel="noopener">How we use your data</a></p>`,
        mount: (el) => {
          const input = el.querySelector('input[name="guided-name"]');
          const box = el.querySelector('input[name="guided-adult"]');
          input.addEventListener('input', () => { value = input.value; refreshNext(); });
          input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void goNext(); } });
          box.addEventListener('change', () => { adult = box.checked; refreshNext(); });
          el.querySelector('[data-guided-under18]').addEventListener('click', async () => {
            await supabase?.auth.signOut().catch(() => {});
            state.user = null; state.row = null;
            onSignedOut?.();
            host.innerHTML = `<div class="guided-screen guided-screen--stop">${heading('Thanks for being honest.', COPY.under18)}</div>`;
            steps.hidden = true; label.hidden = true; actions.hidden = true;
            root.querySelector('#signup-screen-title')?.focus();
          });
          window.setTimeout(() => input.focus({ preventScroll: true }), 60);
        },
        ready: () => Boolean(realName(value)) && adult,
        submit: async () => {
          const name = realName(value).replace(/\s+/g, ' ');
          if (!name) fail(COPY.nameMissing);
          // The declaration first: the server refuses everything else until it exists (R1).
          if (!state.row?.adult_declared_at) {
            const { error } = await declareAdult();
            if (error) fail(COPY.saveFailed);
            state.row = { ...state.row, adult_declared_at: new Date().toISOString() };
          }
          const { error } = await supabase.from('profiles').update({ name, full_name: name }).eq('id', state.user.id);
          if (error) fail(COPY.saveFailed);
          state.row = { ...state.row, name };
          state.status = { ...state.status, adult_declared: true, has_name: true };
          return upNext();
        },
      };
    },

    details: () => {
      let code = state.row?.phone_country_code || '+91';
      let number = phoneDigits(state.row?.phone_number);
      let gender = GENDERS.includes(state.row?.gender) ? state.row.gender : '';
      const codes = countryCodes();
      if (!codes.includes(code)) codes.unshift(code);
      return {
        html: `${heading('A little more about you', 'Your phone number stays private: no member ever sees it.')}
          <div class="guided-field guided-field--labelled"><span id="guided-phone-label">Phone number</span>
            <div class="guided-phone" role="group" aria-labelledby="guided-phone-label">
              <select name="guided-phone-code" aria-label="Country code" autocomplete="tel-country-code">${codes.map((c) => `<option ${c === code ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
              <input type="tel" name="guided-phone" inputmode="tel" autocomplete="tel-national" placeholder="98765 43210" aria-label="Mobile number" value="${escapeHtml(number)}" />
            </div></div>
          <div class="guided-field guided-field--labelled"><span id="guided-gender-label">Gender</span>
            <div class="guided-segments" role="radiogroup" aria-labelledby="guided-gender-label">
              ${GENDERS.map((g) => `<button type="button" role="radio" class="guided-segment" data-gender="${escapeHtml(g)}" aria-checked="${g === gender}">${escapeHtml(g)}</button>`).join('')}
            </div></div>`,
        mount: (el) => {
          const select = el.querySelector('select');
          const input = el.querySelector('input[name="guided-phone"]');
          const radios = [...el.querySelectorAll('.guided-segment')];
          select.addEventListener('change', () => { code = select.value; });
          input.addEventListener('input', () => { number = phoneDigits(input.value); refreshNext(); });
          const pick = (button) => {
            gender = button.dataset.gender;
            radios.forEach((r) => { r.setAttribute('aria-checked', String(r === button)); r.tabIndex = r === button ? 0 : -1; });
            refreshNext();
          };
          radios.forEach((r, i) => {
            r.tabIndex = (gender ? r.dataset.gender === gender : i === 0) ? 0 : -1;
            r.addEventListener('click', () => pick(r));
            r.addEventListener('keydown', (event) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
              if (!step) return;
              event.preventDefault();
              const next = radios[(i + step + radios.length) % radios.length];
              pick(next); next.focus();
            });
          });
          window.setTimeout(() => input.focus({ preventScroll: true }), 60);
        },
        ready: () => number.length >= 7 && number.length <= 15 && Boolean(gender),
        submit: async () => {
          if (number.length < 7 || number.length > 15) fail(COPY.phoneInvalid);
          const row = { phone: `${code} ${number}`, phone_country_code: code, phone_number: number, gender };
          const { error } = await supabase.from('profiles').update(row).eq('id', state.user.id);
          if (error) fail(COPY.saveFailed);
          state.row = { ...state.row, ...row };
          state.status = { ...state.status, has_phone: true, has_gender: true };
          return upNext();
        },
      };
    },

    area: () => {
      let searchTimer = 0;
      return {
        html: `${heading('Where are you based?', 'We show people near you first. Members only ever see a rounded distance.')}
          <button class="guided-choice" type="button" data-guided-geo aria-pressed="false">${svg('pin', 'guided-choice-icon')}<span>Use my location</span></button>
          <div class="guided-or"><span>or pick your city</span></div>
          <label class="guided-field"><span class="sr-only">Your city</span>
            <input type="search" name="guided-city" autocomplete="off" spellcheck="false" placeholder="Start typing your city" aria-controls="guided-city-results" /></label>
          <ul class="guided-cities" id="guided-city-results" aria-label="Cities"></ul>
          <p class="guided-status" data-guided-area-status role="status" aria-live="polite"></p>`,
        mount: (el) => {
          const geo = el.querySelector('[data-guided-geo]');
          const input = el.querySelector('input');
          const list = el.querySelector('.guided-cities');
          const status = el.querySelector('[data-guided-area-status]');
          const choose = (area, text) => {
            state.area = area;
            status.textContent = text;
            geo.setAttribute('aria-pressed', String(area?.kind === 'geo'));
            list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(area?.kind === 'city' && b.dataset.place === area.placeId)));
            refreshNext();
          };
          if (state.area?.kind === 'city') choose(state.area, `${state.area.label} selected.`);
          geo.addEventListener('click', () => {
            if (!navigator.geolocation) { setError(COPY.geoFailed); input.focus(); return; }
            status.textContent = 'Finding your area...';
            navigator.geolocation.getCurrentPosition(
              (position) => { setError(''); choose({ kind: 'geo', lat: position.coords.latitude, lng: position.coords.longitude }, 'Your area is ready. We keep only a rough ~2 km square.'); },
              () => { status.textContent = ''; setError(COPY.geoFailed); input.focus(); },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
            );
          });
          const search = async () => {
            const { data, error } = await searchPlaces(input.value, 8);
            if (error) { list.innerHTML = ''; return; }
            list.innerHTML = data.map((place) => `<li><button type="button" data-place="${escapeHtml(place.id)}" aria-pressed="${state.area?.placeId === place.id}">${escapeHtml(place.name)}<small>${escapeHtml([place.region, place.country].filter(Boolean).join(', '))}</small></button></li>`).join('');
            list.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
              const place = data.find((p) => p.id === button.dataset.place);
              choose({ kind: 'city', placeId: place.id, label: place.name }, `${place.name} selected.`);
            }));
          };
          input.addEventListener('input', () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(search, 180); });
          input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); list.querySelector('button')?.click(); } });
          void search();
        },
        ready: () => Boolean(state.area),
        submit: async () => {
          const area = state.area;
          if (!area) fail(COPY.areaMissing);
          const { error, status } = area.kind === 'geo' ? await setHomeLocation(area.lat, area.lng) : await setHomeCity(area.placeId);
          if (error) fail(isRateLimited(error, status) ? 'Try again later.' : COPY.saveFailed);
          if (area.kind === 'geo') state.area = { kind: 'geo-saved' };
          state.status = { ...state.status, has_cell: true };
          return upNext();
        },
      };
    },

    interests: () => {
      let query = '';
      const picked = () => new Set(state.picks.map((p) => p.id));
      return {
        primary: 'Finish',
        html: `${heading('What are you into?', 'Pick what you genuinely care about. 3–6 works best.')}
          <label class="guided-field guided-field--search"><span class="sr-only">Search interests</span>
            <input type="search" name="guided-interest" autocomplete="off" spellcheck="false" placeholder="Search, e.g. chess or hiking" aria-controls="guided-interest-options" /></label>
          <div class="guided-tray" data-guided-tray>
            <div class="guided-tray-head"><span>Your picks</span><b data-guided-count aria-hidden="true">0 picked</b></div>
            <ul class="guided-tray-list" aria-label="Your picks"></ul>
            <p class="sr-only" data-guided-announce aria-live="polite"></p>
          </div>
          <div class="guided-options" id="guided-interest-options" role="group" aria-label="Interests"></div>`,
        mount: async (el) => {
          const input = el.querySelector('input');
          const options = el.querySelector('.guided-options');
          const tray = el.querySelector('.guided-tray-list');
          const count = el.querySelector('[data-guided-count]');
          const announce = el.querySelector('[data-guided-announce]');
          const renderTray = () => {
            tray.innerHTML = state.picks.map((p) => `<li><button type="button" class="guided-pick" data-id="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.label)}">${escapeHtml(p.label)}<span aria-hidden="true">×</span></button></li>`).join('');
            count.textContent = `${state.picks.length} picked`;
            tray.querySelectorAll('.guided-pick').forEach((button) => button.addEventListener('click', () => toggle(button.dataset.id, button)));
          };
          const bump = () => { if (!reducedMotion() && count.animate) count.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' }); };
          // FLIP: a clone flies from the tapped chip to its slot in the tray (and back on removal); fade only under
          // reduced motion.
          // from: { rect, node } captured before the lists re-render (the tapped button is replaced by then).
          const fly = (from, to) => {
            if (!from?.rect || !to || !to.isConnected) return;
            const a = from.rect;
            const b = to.getBoundingClientRect();
            if (reducedMotion() || !to.animate) { to.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 150 }); return; }
            const ghost = from.node.cloneNode(true);
            ghost.classList.add('guided-ghost');
            ghost.removeAttribute('id');
            Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
            document.body.append(ghost);
            to.style.opacity = '0';
            const anim = ghost.animate([
              { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / Math.max(1, a.width)}, ${b.height / Math.max(1, a.height)})`, opacity: 1 },
            ], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
            const done = () => { ghost.remove(); to.style.opacity = ''; };
            anim.finished.then(done, done);
          };
          const toggle = (id, source) => {
            const node = state.nodes.find((n) => n.id === id);
            if (!node) return;
            const has = picked().has(id);
            if (!has && state.picks.length >= MAX_INTERESTS) { setError(COPY.cap); return; }
            const from = source?.isConnected ? { rect: source.getBoundingClientRect(), node: source } : null;
            setError('');
            if (has) state.picks = state.picks.filter((p) => p.id !== id); else state.picks = [...state.picks, { id, label: node.label }];
            renderTray();
            renderOptions();
            bump();
            announce.textContent = `${node.label} ${has ? 'removed' : 'added'}`;
            navigator.vibrate?.(8);
            if (has) fly(from, options.querySelector(`[data-id="${CSS.escape(id)}"]`));
            else fly(from, tray.querySelector(`[data-id="${CSS.escape(id)}"]`));
            refreshNext();
          };
          const renderOptions = () => {
            const chosen = picked();
            const q = query.trim().toLowerCase();
            let list = state.nodes;
            if (q) list = list.filter((n) => n.label.toLowerCase().includes(q)).sort((x, y) => Number(!x.label.toLowerCase().startsWith(q)) - Number(!y.label.toLowerCase().startsWith(q)));
            else {
              const popular = POPULAR_INTERESTS.map((l) => list.find((n) => n.label.toLowerCase() === l.toLowerCase())).filter(Boolean);
              list = [...popular, ...list.filter((n) => !popular.includes(n))];
            }
            list = list.slice(0, q ? 40 : 30);
            options.innerHTML = list.length
              ? list.map((n) => `<button type="button" class="guided-option" data-id="${escapeHtml(n.id)}" aria-pressed="${chosen.has(n.id)}">${svg('tick', 'guided-option-tick')}${escapeHtml(n.label)}</button>`).join('')
              : `<p class="guided-helper">No interest matches "${escapeHtml(query)}".</p>`;
            options.querySelectorAll('.guided-option').forEach((button) => button.addEventListener('click', () => toggle(button.dataset.id, button)));
          };
          input.addEventListener('input', () => { query = input.value; renderOptions(); });
          renderTray();
          if (!state.nodes) {
            options.innerHTML = '<p class="guided-helper">Loading interests...</p>';
            const { data, error } = await fetchInterestNodes();
            // Private (sensitive) interests are not offered here: they need their own consent screen.
            if (!error) state.nodes = (data || []).filter((n) => n && !n.sensitive && n.level >= 3 && String(n.label || '').trim());
            if (error || !state.nodes?.length) { state.nodes = null; options.innerHTML = ''; setError(COPY.interestsLoad); return; }
          }
          renderOptions();
        },
        ready: () => state.picks.length >= 1 && Boolean(state.nodes),
        submit: async () => {
          if (!state.picks.length) fail(COPY.interestsMissing);
          const { error } = await setMemberInterests(evenSplit(state.picks));
          if (error) fail(COPY.saveFailed);
          state.status = { ...state.status, interests: state.picks.length, points: 20 };
          return 'reveal';
        },
      };
    },

    reveal: () => {
      const first = realName(state.row?.name).split(' ')[0] || 'friend';
      const pick = state.picks[0]?.label;
      return {
        primary: 'See my deck',
        html: `<div class="guided-reveal-mark" aria-hidden="true">${svg('tick')}</div>
          ${heading(`You're in, ${escapeHtml(first)}.`, pick
            ? `Your deck is ready. People near you who care about ${escapeHtml(pick.toLowerCase())} come first.`
            : 'Your deck is ready. People near you come first.')}`,
        ready: () => true,
        submit: async () => { redirectToApp(); return null; },
      };
    },
  };

  next.addEventListener('click', () => { void goNext(); });
  back.addEventListener('click', () => {
    if (state.login && state.screen === 'email') { onLogin(); return; }
    const target = backTarget(state.path, state.screen, Boolean(state.user));
    if (target) void show(target);
  });

  // Phones: keep the primary button above the on-screen keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const place = () => root.style.setProperty('--guided-keyboard', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
  }

  return {
    // A visitor without a session: Welcome. With one: the first unfinished screen ('done' goes to the app).
    // login: "Email me a code instead" on the login screen (never creates an account).
    open: async ({ user = null, login = false } = {}) => {
      state.login = login;
      if (login) { state.user = null; state.path = 'email'; await show('email'); return; }
      if (!user) { state.user = null; await show('welcome'); return; }
      try { await show(await resumeFor(user)); } catch { state.user = user; await show('welcome'); setError(COPY.saveFailed); }
    },
    get screen() { return state.screen; },
    get busy() { return state.busy; },
    SCREENS,
  };
};
