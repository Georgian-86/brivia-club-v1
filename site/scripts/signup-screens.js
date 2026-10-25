// Guided signup (polish wave B, D-073; first D-067/D-068): one question per screen, at every width. Renders into
// #guided-signup (auth.html): the bubble stepper (done / current / pending), "Step n of N", one screen, and Back + one
// primary button. Answers stay in memory until the last question; then `submit(answers)` (script.js) creates the
// account (email path) and saves everything through the existing pipeline. No email code, no points screen: the
// interests are saved with an even split. Coordinates live only in `answers.area` (memory) and are dropped once saved.
import { searchPlaces, fetchInterestNodes } from './supabase.js';
import { SCREENS, STEP_ICONS, stepLabel, stepStates, backTarget, groupInterests, isOffered } from './signup-flow.js';
import { MAX_INTERESTS } from './passion-budget.js';
import { POPULAR_INTERESTS } from './discovery-catalog.js';
import { matchTypedCity } from './area-pick.js';
import { locateOnce, fallbackCopy, STILL_WAITING_TEXT } from './geo-locate.js';

const PLACEHOLDER_NAME = 'New Member';
const realName = (value) => { const name = String(value || '').trim(); return name && name !== PLACEHOLDER_NAME ? name : ''; };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
// The stored values (supabase.js normalizeGender), shown as they are.
export const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const phoneDigits = (value) => String(value || '').replace(/\D/g, '');
// A1: after this long without an answer the city list opens ("Still waiting for your browser…"); the attempt keeps
// listening (locateOnce's grace), so a late "Allow" still counts unless the member picked a city meanwhile.
const GEO_GUARD_MS = 15000;
const GOT_IT = "Got it. We keep only the ~2 km square you're in.";
const FINDING = 'Finding your area…';
const STILL_LOOKING = 'Still looking for your location…';
// The country codes the classic form offers (one list in auth.html), else the common ones.
const countryCodes = () => {
  const options = [...document.querySelectorAll('#signup-form select[name="phoneCountryCode"] option')].map((o) => o.value).filter(Boolean);
  return options.length ? options : ['+91', '+1', '+44', '+61', '+65', '+971'];
};

const ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  tick: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};
const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export const COPY = {
  emailInvalid: 'Enter a valid email address.',
  passwordShort: `Use at least ${MIN_PASSWORD} characters for your password.`,
  passwordMismatch: "The two passwords don't match.",
  saveFailed: "That didn't save. Check your connection and try again.",
  under18: "Brivia Club is for adults. Come back when you're 18.",
  nameMissing: 'Enter the name members should see.',
  phoneInvalid: 'Enter a mobile number of 7 to 15 digits.',
  areaMissing: 'Use your location or pick your city.',
  interestsLoad: "We couldn't load the interests. Please try again.",
  interestsMissing: 'Pick at least one interest.',
  cap: `You can pick up to ${MAX_INTERESTS}. Remove one to add another.`,
};

// root: #guided-signup. path: 'email' | 'google'. submit(answers) -> Promise<{ ok: true, session } | { ok: false,
// screen, message }>. resumeAt: the first screen to show for a signed-in member (resumeScreen). prefill: answers
// already known (a Google name, an existing row). hasSession: a member is signed in (Back never returns to account).
export const initGuidedSignup = ({
  root, path = 'email', startGoogle, submit, redirectToApp, resumeAt = null, prefill = {}, hasSession = false,
  onLogin = () => {}, onSignOut = () => {},
}) => {
  if (!root) return null;
  const steps = root.querySelector('[data-guided-steps]');
  const label = root.querySelector('[data-guided-step-label]');
  const host = root.querySelector('[data-guided-host]');
  const errorBox = root.querySelector('[data-guided-error]');
  const actions = root.querySelector('[data-guided-actions]');
  const back = root.querySelector('[data-guided-back]');
  const next = root.querySelector('[data-guided-next]');
  const emptyAnswers = () => ({ email: '', password: '', passwordConfirm: '', adult: false, name: '', phoneCountryCode: '+91', phoneNumber: '', gender: '', area: null, interests: [] });
  const state = { path, hasSession, resumeAt, screen: 'welcome', busy: false, nodes: null, current: null, email: '', answers: { ...emptyAnswers(), ...prefill } };
  const geo = { seq: 0, pending: false, guard: 0 };

  const setError = (text) => { errorBox.textContent = text || ''; errorBox.hidden = !text; };
  const refreshNext = () => { next.disabled = state.busy || !state.current?.ready?.(); };
  // While a step is saving (and until its next screen is on), neither Continue/Finish nor Back can be used.
  const setBusy = (busy) => { state.busy = busy; next.setAttribute('aria-busy', String(busy)); back.disabled = busy; refreshNext(); };
  const cancelGeo = () => { geo.seq += 1; geo.pending = false; window.clearTimeout(geo.guard); };
  const questions = () => (SCREENS[state.path] || SCREENS.email).filter((s) => STEP_ICONS[s]);
  const nextAfter = (screen) => { const list = SCREENS[state.path] || SCREENS.email; return list[list.indexOf(screen) + 1] || 'reveal'; };

  const renderSteps = () => {
    const showSteps = state.screen !== 'welcome' && state.screen !== 'stop';
    steps.hidden = !showSteps;
    // D-082b: one thin bar per question (done = filled wine, current = part-filled, pending = empty); the progressbar
    // role and the visually hidden "Step n of N" carry the meaning, the bars are decoration.
    const states = showSteps ? stepStates(state.path, state.screen) : [];
    steps.innerHTML = states.map(({ screen, state: s }, i) => `<span class="guided-bar is-${s}" data-step="${screen}" style="--i:${i}"><span class="guided-bar-fill"></span></span>`).join('');
    const text = stepLabel(state.path, state.screen);
    const at = states.findIndex((x) => x.state === 'current');
    const now = at >= 0 ? at + 1 : states.length;
    if (showSteps) {
      steps.setAttribute('aria-valuemax', String(states.length));
      steps.setAttribute('aria-valuenow', String(now));
      steps.setAttribute('aria-valuetext', text || `Step ${now} of ${states.length}`);
    }
    label.textContent = text || '';
    label.hidden = !text;
  };

  // The swap: the outgoing screen fades and lifts 8 px, the incoming one rises in (a plain fade under reduced motion).
  const show = async (screen, { focus = true } = {}) => {
    if (screen === 'done') { redirectToApp(); return; }
    const build = SCREEN_BUILDERS[screen];
    if (!build) return;
    if (screen !== 'area') cancelGeo();
    setError('');
    const old = host.firstElementChild;
    if (old && old.animate && state.screen !== screen) {
      const frames = reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }];
      await old.animate(frames, { duration: 140, easing: 'ease-in' }).finished.catch(() => {});
    }
    state.screen = screen;
    state.current = build();
    host.innerHTML = '';
    const el = document.createElement('div');
    el.className = `guided-screen guided-screen--${screen}`;
    if (STEP_ICONS[screen]) el.dataset.question = screen;
    el.innerHTML = state.current.html;
    host.append(el);
    if (el.animate) el.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    renderSteps();
    const target = backTarget(state.path, screen, state.hasSession);
    back.hidden = !target || !STEP_ICONS[screen];
    actions.hidden = Boolean(state.current.noActions);
    next.innerHTML = `<span>${escapeHtml(state.current.primary || 'Continue')}</span>${svg('arrow', 'guided-next-icon')}`;
    root.dataset.screen = screen;
    root.dataset.path = state.path;
    // Every screen starts at its top (a long Interests list must not leave the next screen scrolled away).
    const panel = root.closest('.auth-panel');
    if (panel) panel.scrollTop = 0;
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    state.current.mount?.(el);
    refreshNext();
    const field = state.current.autofocus ? el.querySelector(state.current.autofocus) : null;
    // The first field is described by the question (and its helper), so a screen reader hears the question even when
    // focus goes straight to the field.
    if (field) field.setAttribute('aria-describedby', ['signup-screen-title', el.querySelector('#signup-screen-helper') ? 'signup-screen-helper' : ''].filter(Boolean).join(' '));
    if (focus) {
      // A phone keyboard popping up on every screen is jarring: on touch screens the heading takes focus instead.
      if (field && !window.matchMedia?.('(pointer: coarse)').matches) field.focus({ preventScroll: true });
      else root.querySelector('#signup-screen-title')?.focus({ preventScroll: true });
    }
  };

  const fail = (copy) => { const error = new Error(copy); error.copy = copy; throw error; };
  const goNext = async () => {
    if (state.busy || !state.current?.submit) return;
    if (!state.current.ready?.()) { if (state.current.notReady) setError(state.current.notReady()); return; }
    setError('');
    setBusy(true);
    let to = null;
    let message = '';
    try {
      to = await state.current.submit();
    } catch (error) {
      message = error?.copy || COPY.saveFailed;
    }
    if (to && typeof to === 'object') { message = to.message || ''; to = to.screen; }
    // Busy until the next screen is on: the outgoing screen fades for 140 ms and must not take a second tap or Enter.
    try { if (to) await show(to); } finally { setBusy(false); }
    if (message) setError(message);
  };

  // ---- Screens ------------------------------------------------------------------------------------------------
  // The question is the page's h1 (one per screen). Headings end with "?" for a question and "." otherwise.
  const heading = (title, helper = '') => `<h1 id="signup-screen-title" tabindex="-1">${title}</h1>${helper ? `<p class="guided-helper" id="signup-screen-helper">${helper}</p>` : ''}`;
  const kicker = (text) => `<p class="guided-kicker">${text}</p>`;
  const a = state.answers;

  const SCREEN_BUILDERS = {
    welcome: () => (state.hasSession ? {
      noActions: true,
      html: `${kicker('The Brivia Club')}${heading('Welcome back.', `You're signed in${state.email ? ` as <b>${escapeHtml(state.email)}</b>` : ''}. Pick up where you left off.`)}
        <div class="guided-choices">
          <button class="guided-choice guided-choice--primary" type="button" data-guided-continue><span>Continue</span>${svg('arrow', 'guided-choice-icon')}</button>
          <button class="guided-link guided-link--center" type="button" data-guided-signout>Sign out</button>
        </div>`,
      mount: (el) => {
        el.querySelector('[data-guided-continue]').addEventListener('click', () => { void show(state.resumeAt || questions()[0]); });
        el.querySelector('[data-guided-signout]').addEventListener('click', () => { onSignOut(); });
      },
    } : {
      noActions: true,
      html: `${kicker('The Brivia Club')}${heading('Find your <em>people.</em>', 'A few quick questions, one at a time. It takes about two minutes.')}
        <div class="guided-choices">
          <button class="guided-choice guided-choice--google" type="button" data-guided-google><span class="auth-google-mark guided-google-mark" aria-hidden="true">G</span><span>Continue with Google</span></button>
          <div class="guided-or" aria-hidden="true"><span>or</span></div>
          <button class="guided-choice guided-choice--primary" type="button" data-guided-email>${svg('mail', 'guided-choice-icon')}<span>Continue with email</span></button>
          <button class="guided-link guided-link--center" type="button" data-guided-login>I already have an account</button>
        </div>
        <p class="guided-fine">By continuing you agree to how we handle your data: <a href="/privacy.html" target="_blank" rel="noopener">privacy notice</a>.</p>`,
      mount: (el) => {
        const google = el.querySelector('[data-guided-google]');
        google.addEventListener('click', async () => {
          if (google.disabled) return;
          state.path = 'google';
          setError('');
          google.disabled = true;
          google.setAttribute('aria-busy', 'true');
          let result;
          try { result = await startGoogle(); } catch { result = { ok: false }; }
          if (result?.ok !== false) return;  // on its way to Google
          google.disabled = false;
          google.removeAttribute('aria-busy');
          setError(result.message || 'Google sign-in could not start. Please try again, or continue with email.');
        });
        el.querySelector('[data-guided-email]').addEventListener('click', () => { state.path = 'email'; void show('account'); });
        el.querySelector('[data-guided-login]').addEventListener('click', () => onLogin());
      },
    }),

    account: () => ({
      autofocus: 'input[name="guided-email"]',
      html: `${heading('Create your account.', 'Your email is how you log in. We confirm it once you finish.')}
        <label class="guided-field"><span class="guided-field-label">Email address</span>
          <input type="email" name="guided-email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${escapeHtml(a.email)}" required /></label>
        <label class="guided-field"><span class="guided-field-label">Password</span>
          <input type="password" name="guided-password" autocomplete="new-password" minlength="${MIN_PASSWORD}" placeholder="At least ${MIN_PASSWORD} characters" value="${escapeHtml(a.password)}" required /></label>
        <label class="guided-field"><span class="guided-field-label">Confirm password</span>
          <input type="password" name="guided-password-confirm" autocomplete="new-password" minlength="${MIN_PASSWORD}" placeholder="Type it again" value="${escapeHtml(a.passwordConfirm)}" required /></label>`,
      mount: (el) => {
        const [email, pass, again] = el.querySelectorAll('input');
        email.addEventListener('input', () => { a.email = email.value.trim(); refreshNext(); });
        pass.addEventListener('input', () => { a.password = pass.value; refreshNext(); });
        again.addEventListener('input', () => { a.passwordConfirm = again.value; refreshNext(); });
      },
      ready: () => EMAIL_RE.test(a.email) && a.password.length >= MIN_PASSWORD && a.passwordConfirm.length >= MIN_PASSWORD,
      notReady: () => (!EMAIL_RE.test(a.email) ? COPY.emailInvalid : COPY.passwordShort),
      submit: async () => {
        if (a.password !== a.passwordConfirm) fail(COPY.passwordMismatch);
        return nextAfter('account');
      },
    }),

    adult: () => ({
      autofocus: 'input[name="guided-adult"]',
      html: `${heading('Are you 18 or older?', 'Brivia Club is for adults. We never ask for your date of birth.')}
        <label class="guided-check"><input type="checkbox" name="guided-adult" ${a.adult ? 'checked' : ''} /><span>I'm 18 or older</span></label>
        <p class="guided-fine"><a href="/privacy.html" target="_blank" rel="noopener">How we use your data</a> (privacy notice)</p>
        <button class="guided-link" type="button" data-guided-under18>I'm under 18</button>`,
      mount: (el) => {
        const box = el.querySelector('input[name="guided-adult"]');
        box.addEventListener('change', () => { a.adult = box.checked; refreshNext(); });
        el.querySelector('[data-guided-under18]').addEventListener('click', () => {
          cancelGeo();
          Object.assign(a, emptyAnswers());
          if (state.hasSession) onSignOut({ quiet: true });
          state.screen = 'stop';
          host.innerHTML = `<div class="guided-screen guided-screen--stop">${heading('Thanks for being honest.', COPY.under18)}</div>`;
          root.dataset.screen = 'stop';
          steps.hidden = true; label.hidden = true; actions.hidden = true;
          root.querySelector('#signup-screen-title')?.focus();
        });
      },
      ready: () => a.adult === true,
      submit: async () => nextAfter('adult'),
    }),

    name: () => ({
      autofocus: 'input[name="guided-name"]',
      html: `${heading('What should members call you?', 'Your first name is enough. Members see it on your card.')}
        <label class="guided-field"><span class="guided-field-label">Your name</span>
          <input type="text" name="guided-name" autocomplete="name" maxlength="60" placeholder="Your name" value="${escapeHtml(realName(a.name))}" /></label>`,
      mount: (el) => {
        const input = el.querySelector('input');
        input.addEventListener('input', () => { a.name = input.value; refreshNext(); });
      },
      ready: () => Boolean(realName(a.name)),
      notReady: () => COPY.nameMissing,
      submit: async () => { a.name = realName(a.name).replace(/\s+/g, ' '); return nextAfter('name'); },
    }),

    details: () => {
      const codes = countryCodes();
      if (!codes.includes(a.phoneCountryCode)) codes.unshift(a.phoneCountryCode);
      return {
        autofocus: 'input[name="guided-phone"]',
        html: `${heading('A little more about you.', 'Your phone number stays private: no member ever sees it.')}
          <div class="guided-field"><span class="guided-field-label" id="guided-phone-label">Phone number</span>
            <div class="guided-phone" role="group" aria-labelledby="guided-phone-label">
              <select name="guided-phone-code" aria-label="Country code" autocomplete="tel-country-code">${codes.map((c) => `<option ${c === a.phoneCountryCode ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
              <input type="tel" name="guided-phone" inputmode="tel" autocomplete="tel-national" placeholder="98765 43210" aria-label="Mobile number" value="${escapeHtml(a.phoneNumber)}" />
            </div></div>
          <div class="guided-field"><span class="guided-field-label" id="guided-gender-label">Gender</span>
            <div class="guided-segments" role="radiogroup" aria-labelledby="guided-gender-label">
              ${GENDERS.map((g) => `<button type="button" role="radio" class="guided-segment" data-gender="${escapeHtml(g)}" aria-checked="${g === a.gender}">${escapeHtml(g)}</button>`).join('')}
            </div></div>`,
        mount: (el) => {
          const select = el.querySelector('select');
          const input = el.querySelector('input[name="guided-phone"]');
          const radios = [...el.querySelectorAll('.guided-segment')];
          select.addEventListener('change', () => { a.phoneCountryCode = select.value; });
          input.addEventListener('input', () => { a.phoneNumber = phoneDigits(input.value); refreshNext(); });
          const pick = (button) => {
            a.gender = button.dataset.gender;
            radios.forEach((r) => { r.setAttribute('aria-checked', String(r === button)); r.tabIndex = r === button ? 0 : -1; });
            refreshNext();
          };
          radios.forEach((r, i) => {
            r.tabIndex = (a.gender ? r.dataset.gender === a.gender : i === 0) ? 0 : -1;
            r.addEventListener('click', () => pick(r));
            r.addEventListener('keydown', (event) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
              if (!step) return;
              event.preventDefault();
              const to = radios[(i + step + radios.length) % radios.length];
              pick(to); to.focus();
            });
          });
        },
        ready: () => a.phoneNumber.length >= 7 && a.phoneNumber.length <= 15 && GENDERS.includes(a.gender),
        notReady: () => (a.phoneNumber.length < 7 || a.phoneNumber.length > 15 ? COPY.phoneInvalid : 'Choose how you describe your gender.'),
        submit: async () => nextAfter('details'),
      };
    },

    area: () => {
      let options = [];
      let searchSeq = 0;
      let searchTimer = 0;
      return {
        html: `${heading('Where are you based?', 'We show people near you first. Members only ever see a rounded distance, never your address.')}
          <button class="guided-choice guided-choice--geo" type="button" data-guided-geo aria-pressed="false">${svg('pin', 'guided-choice-icon')}<span>Use my location</span></button>
          <div class="guided-or"><span>or pick your city</span></div>
          <p class="guided-fallback" data-guided-area-fallback></p>
          <label class="guided-field guided-field--search"><span class="sr-only">Your city</span>${svg('search', 'guided-search-icon')}
            <input type="search" name="guided-city" autocomplete="off" spellcheck="false" placeholder="Start typing your city" aria-controls="guided-city-results" /></label>
          <ul class="guided-cities" id="guided-city-results" aria-label="Cities" hidden></ul>
          <p class="guided-status" data-guided-area-status role="status" aria-live="polite"></p>`,
        mount: (el) => {
          const geoButton = el.querySelector('[data-guided-geo]');
          const input = el.querySelector('input');
          const list = el.querySelector('.guided-cities');
          const status = el.querySelector('[data-guided-area-status]');
          const fallback = el.querySelector('[data-guided-area-fallback]');
          const setFallback = (text, { retry = false } = {}) => {
            fallback.textContent = text;
            if (retry) {
              const again = document.createElement('button');
              again.type = 'button';
              again.className = 'guided-link';
              again.textContent = 'Try again';
              again.addEventListener('click', () => { void useLocation(); });
              fallback.append(' ', again);
            }
          };
          const paintPressed = () => {
            geoButton.setAttribute('aria-pressed', String(a.area?.kind === 'geo'));
            list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(a.area?.kind === 'city' && b.dataset.place === a.area.placeId)));
          };
          const choose = (area, text) => {
            a.area = area;
            status.textContent = text;
            paintPressed();
            refreshNext();
          };
          const render = async () => {
            const seq = ++searchSeq;
            const { data, error } = await searchPlaces(input.value, 8);
            if (seq !== searchSeq || !el.isConnected) return;
            options = error ? [] : data;
            list.hidden = false;
            list.innerHTML = options.length
              ? options.map((place) => `<li><button type="button" data-place="${escapeHtml(place.id)}" aria-pressed="false"><span>${escapeHtml(place.name)}</span><small>${escapeHtml([place.region, place.country].filter(Boolean).join(', '))}</small></button></li>`).join('')
              : `<li class="guided-cities-empty">${error ? 'Cities could not load. Check your connection and try again.' : 'No city found. Try the nearest larger city.'}</li>`;
            paintPressed();
          };
          const chooseCity = (place) => {
            if (!place) return false;
            cancelGeo();
            geoButton.removeAttribute('aria-busy');
            setFallback('');
            choose({ kind: 'city', placeId: place.id, label: `${place.name}, ${place.region}` }, `Your area: ${place.name}, ${place.region}. We use the city's centre, never your address.`);
            return true;
          };
          const openList = (text = '', opts = {}) => { setFallback(text, opts); input.focus({ preventScroll: true }); void render(); };
          const useLocation = async () => {
            if (geo.pending) { status.textContent = STILL_LOOKING; return; }
            setError('');
            const seq = ++geo.seq;
            const choiceAtStart = a.area;
            geo.pending = true;
            geoButton.setAttribute('aria-busy', 'true');
            status.textContent = FINDING;
            window.clearTimeout(geo.guard);
            geo.guard = window.setTimeout(() => {
              if (seq !== geo.seq || a.area !== choiceAtStart) return;
              status.textContent = '';
              openList(STILL_WAITING_TEXT);
            }, GEO_GUARD_MS);
            const result = await locateOnce(navigator.geolocation, { secure: Boolean(window.isSecureContext) });
            if (seq !== geo.seq || !el.isConnected) return;
            window.clearTimeout(geo.guard);
            geo.pending = false;
            geoButton.removeAttribute('aria-busy');
            if (a.area !== choiceAtStart) { if (fallback.textContent === STILL_WAITING_TEXT) setFallback(''); return; }
            if (result.ok) {
              setFallback('');
              list.hidden = true;
              choose({ kind: 'geo', lat: result.lat, lng: result.lng }, GOT_IT);
              // The answer is in: Enter now means Continue (focus moves from "Use my location" to the primary button).
              if (document.activeElement === geoButton || document.activeElement === document.body) next.focus({ preventScroll: true });
              return;
            }
            status.textContent = '';
            openList(fallbackCopy(result.reason), { retry: result.reason === 'timeout' });
          };
          if (a.area?.kind === 'city') { input.value = a.area.label.split(',')[0]; choose(a.area, `Your area: ${a.area.label}. We use the city's centre, never your address.`); }
          else if (a.area?.kind === 'geo') choose(a.area, GOT_IT);
          else if (a.area?.kind === 'keep') choose(a.area, a.area.label ? `Your area: ${a.area.label}. Choose again to change it.` : 'Your area is set. Choose again to change it.');
          geoButton.addEventListener('click', () => { void useLocation(); });
          input.addEventListener('focus', () => { if (list.hidden) void render(); });
          input.addEventListener('input', () => {
            searchSeq += 1; options = []; list.innerHTML = '';
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => void render(), 160);
          });
          // Enter picks the city typed when it is unambiguous; otherwise (an area already chosen) it is Continue.
          input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            const typed = matchTypedCity(input.value, options);
            if (typed && !(a.area?.kind === 'city' && a.area.placeId === typed.id)) { event.preventDefault(); chooseCity(typed); }
          });
          list.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-place]');
            if (button) chooseCity(options.find((p) => p.id === button.dataset.place));
          });
        },
        ready: () => Boolean(a.area),
        notReady: () => COPY.areaMissing,
        submit: async () => nextAfter('area'),
      };
    },

    interests: () => {
      let query = '';
      let submitted = false;
      const picked = () => new Set(a.interests.map((p) => p.id));
      return {
        primary: 'Finish',
        // D-095 (refines D-082b): one dropdown, like "Find your people" (D-092). The field opens a list grouped by
        // category ("Popular" first); typing narrows it to the best matches. Picks stay open for another and land in
        // the compact "Your picks" tray above the field (never under the open list), where a tap removes them.
        html: `${heading('What are you into?', 'Pick what you genuinely care about, up to twelve. Three to six works best.')}
          <div class="guided-tray" data-guided-tray>
            <div class="guided-tray-head"><span>Your picks</span><b data-guided-count aria-hidden="true">0 picked</b></div>
            <ul class="guided-tray-list" aria-label="Your picks"></ul>
            <p class="guided-tray-empty" data-guided-tray-empty>Open the list below and pick a few.</p>
            <p class="sr-only" data-guided-announce aria-live="polite"></p>
          </div>
          <div class="guided-combo" data-guided-combo>
            <label class="guided-field guided-field--search guided-field--combo"><span class="sr-only">Interests</span>${svg('search', 'guided-search-icon')}
              <input type="text" role="combobox" name="guided-interest" autocomplete="off" spellcheck="false" placeholder="Choose interests or type to search" aria-autocomplete="list" aria-expanded="false" aria-controls="guided-interest-options" />
              ${svg('chevron', 'guided-combo-chevron')}</label>
            <div class="guided-menu" id="guided-interest-options" role="listbox" aria-multiselectable="true" aria-label="Interests" hidden></div>
          </div>`,
        mount: async (el) => {
          const combo = el.querySelector('[data-guided-combo]');
          const input = el.querySelector('input');
          const menu = el.querySelector('.guided-menu');
          let groups = [];
          let shown = []; // the options in the open list, in order (ids), for the arrow keys
          let active = -1;
          const tray = el.querySelector('.guided-tray-list');
          const trayEmpty = el.querySelector('[data-guided-tray-empty]');
          const count = el.querySelector('[data-guided-count]');
          const announce = el.querySelector('[data-guided-announce]');
          const renderTray = () => {
            tray.innerHTML = a.interests.map((p) => `<li><button type="button" class="guided-pick" data-id="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.label)}">${escapeHtml(p.label)}<span aria-hidden="true">×</span></button></li>`).join('');
            count.textContent = `${a.interests.length} picked`;
            trayEmpty.hidden = a.interests.length > 0;
          };
          const bump = () => { if (!reducedMotion() && count.animate) count.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }); };
          const isOpen = () => !menu.hidden;
          const optionId = (i) => `guided-interest-${i}`;
          // A line in the list that is not a choice (loading, no match): an inert option, so the listbox holds only options.
          const note = (text) => `<div class="guided-menu-note" role="option" aria-disabled="true" aria-selected="false">${text}</div>`;
          const setActive = (i, { scroll = true } = {}) => {
            active = shown.length && i >= 0 ? Math.min(i, shown.length - 1) : -1;
            menu.querySelectorAll('.guided-menu-option').forEach((o, j) => o.classList.toggle('is-active', j === active));
            if (active < 0) { input.removeAttribute('aria-activedescendant'); return; }
            input.setAttribute('aria-activedescendant', optionId(active));
            if (scroll) menu.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: 'nearest' });
          };
          const renderMenu = () => {
            if (!isOpen()) return;
            const chosen = picked();
            const q = query.trim().toLowerCase();
            const option = (n) => {
              const i = shown.push(n.id) - 1;
              return `<div class="guided-menu-option" id="${optionId(i)}" role="option" data-id="${escapeHtml(n.id)}" aria-selected="${chosen.has(n.id)}">${escapeHtml(n.label)}${svg('tick', 'guided-menu-tick')}</div>`;
            };
            shown = [];
            if (!state.nodes) { menu.innerHTML = note('Loading interests…'); return; }
            if (q) {
              const list = state.nodes.filter((n) => n.label.toLowerCase().includes(q)).sort((x, y) => Number(!x.label.toLowerCase().startsWith(q)) - Number(!y.label.toLowerCase().startsWith(q))).slice(0, 40);
              menu.innerHTML = list.length ? list.map(option).join('') : note(`No interest matches "${escapeHtml(query)}". Try a shorter word.`);
            } else {
              // Popular, then each category; an interest listed under Popular is not listed again below it.
              const inPopular = new Set((groups[0]?.items || []).map((n) => n.id));
              menu.innerHTML = groups.map((g, gi) => {
                const items = gi === 0 ? g.items : g.items.filter((n) => !inPopular.has(n.id));
                if (!items.length) return '';
                return `<div class="guided-menu-group" role="group" aria-label="${escapeHtml(g.label)}"><p class="guided-menu-label" aria-hidden="true">${escapeHtml(g.label)}</p>${items.map(option).join('')}</div>`;
              }).join('');
            }
            setActive(Math.min(active, shown.length - 1), { scroll: false });
          };
          const openMenu = () => {
            if (isOpen()) return;
            menu.hidden = false;
            combo.classList.add('is-open');
            input.setAttribute('aria-expanded', 'true');
            active = -1;
            menu.scrollTop = 0;
            renderMenu();
            // On a short screen the open list scrolls the form so all of it shows.
            requestAnimationFrame(() => { if (isOpen()) menu.scrollIntoView({ block: 'nearest' }); });
          };
          const closeMenu = () => {
            if (!isOpen()) return;
            menu.hidden = true;
            combo.classList.remove('is-open');
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            active = -1;
          };
          const toggle = (id) => {
            const node = state.nodes?.find((n) => n.id === id);
            if (!node) return;
            const has = picked().has(id);
            if (!has && a.interests.length >= MAX_INTERESTS) { setError(COPY.cap); return; }
            setError('');
            a.interests = has ? a.interests.filter((p) => p.id !== id) : [...a.interests, { id, label: node.label, mode: 'play' }];
            renderTray();
            const opt = menu.querySelector(`.guided-menu-option[data-id="${CSS.escape(id)}"]`);
            if (opt) opt.setAttribute('aria-selected', String(!has));
            bump();
            announce.textContent = `${node.label} ${has ? 'removed' : 'added'}. ${a.interests.length} picked.`;
            navigator.vibrate?.(8);
            const landed = !has && tray.querySelector(`[data-id="${CSS.escape(id)}"]`);
            if (landed && !reducedMotion()) landed.animate?.([{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
            refreshNext();
          };
          input.addEventListener('focus', openMenu);
          input.addEventListener('click', openMenu);
          input.addEventListener('input', () => { query = input.value; openMenu(); active = query.trim() ? 0 : -1; renderMenu(); });
          input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!isOpen()) { openMenu(); setActive(0); return; }
              setActive(active < 0 ? 0 : active + (event.key === 'ArrowDown' ? 1 : -1));
            } else if (event.key === 'Home' && isOpen() && !query) { event.preventDefault(); setActive(0); }
            else if (event.key === 'End' && isOpen() && !query) { event.preventDefault(); setActive(shown.length - 1); }
            else if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); closeMenu(); }
            else if (event.key === 'Tab') closeMenu();
            else if (event.key === 'Enter') {
              // Enter picks the highlighted interest (with something typed, the best match); with nothing typed and
              // nothing highlighted it is Finish.
              const id = shown[active] ?? (query.trim() ? shown.find((x) => !picked().has(x)) : undefined);
              if (!isOpen() || !id) { closeMenu(); return; }
              event.preventDefault();
              toggle(id);
              if (query.trim()) { input.value = ''; query = ''; active = -1; renderMenu(); }
            }
          });
          // A press on an option keeps the focus in the field (so the list stays open for another pick).
          menu.addEventListener('mousedown', (event) => event.preventDefault());
          menu.addEventListener('click', (event) => {
            const o = event.target.closest('.guided-menu-option');
            if (!o) return;
            setActive(shown.indexOf(o.dataset.id), { scroll: false });
            toggle(o.dataset.id);
          });
          // A press anywhere else closes the list.
          const outside = (event) => { if (!el.isConnected) { document.removeEventListener('pointerdown', outside, true); return; } if (!combo.contains(event.target)) closeMenu(); };
          document.addEventListener('pointerdown', outside, true);
          tray.addEventListener('click', (event) => { const b = event.target.closest('.guided-pick'); if (b) { toggle(b.dataset.id); renderMenu(); } });
          renderTray();
          if (!state.nodes) {
            const { data, error } = await fetchInterestNodes();
            // Private (sensitive) interests are not offered here: they need their own consent screen.
            if (!error) { state.allNodes = data || []; state.nodes = state.allNodes.filter(isOffered); }
            if (!el.isConnected) return;
            if (error || !state.nodes?.length) { state.nodes = null; menu.innerHTML = ''; setError(COPY.interestsLoad); return; }
          }
          // Picks restored from an earlier visit keep only what is still offered.
          a.interests = a.interests.filter((p) => state.nodes.some((n) => n.id === p.id));
          groups = groupInterests(state.allNodes || state.nodes, POPULAR_INTERESTS);
          renderTray();
          renderMenu();
          refreshNext();
        },
        ready: () => a.interests.length >= 1 && a.interests.length <= MAX_INTERESTS && Boolean(state.nodes),
        notReady: () => COPY.interestsMissing,
        submit: async () => {
          // One submit per Finish: a second tap or Enter that slips through is ignored (the latch opens again only
          // when the save failed and the member is asked to try again).
          if (submitted) return null;
          submitted = true;
          let result;
          try { result = await submit({ ...a, adult: true, interests: a.interests.map(({ id, label, mode }) => ({ id, label, mode })) }); } catch (error) { submitted = false; throw error; }
          if (!result?.ok) { submitted = false; return { screen: result?.screen || 'interests', message: result?.message || COPY.saveFailed }; }
          // Saved (or kept for after the email is confirmed): the coordinates and the password leave memory.
          cancelGeo();
          if (a.area?.kind === 'geo') a.area = { kind: 'keep', label: '' };
          a.password = ''; a.passwordConfirm = '';
          if (result.session) state.hasSession = true;
          return result.session ? 'reveal' : 'verify';
        },
      };
    },

    reveal: () => {
      const first = realName(a.name).split(' ')[0] || 'friend';
      const pick = a.interests[0]?.label;
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

    verify: () => ({
      noActions: true,
      html: `<div class="guided-reveal-mark" aria-hidden="true">${svg('mail')}</div>
        ${heading('Check your email.', `We sent a link to <b>${escapeHtml(a.email)}</b>. Open it to activate your Brivia profile; it signs you in. It can take a few minutes, so check spam or promotions too.`)}
        <div class="guided-choices"><button class="guided-link guided-link--center" type="button" data-guided-login>Back to log in</button></div>`,
      mount: (el) => { el.querySelector('[data-guided-login]').addEventListener('click', () => onLogin()); },
    }),
  };

  next.addEventListener('click', () => { void goNext(); });
  back.addEventListener('click', () => {
    if (state.busy) return;
    const target = backTarget(state.path, state.screen, state.hasSession);
    if (target) void show(target);
  });
  // Enter = Continue from any field of a question (buttons and links keep their own Enter).
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof Element) || !host.contains(target) || target.closest('button, a, textarea')) return;
    event.preventDefault();
    void goNext();
  });

  // Back from Google (the page restored from the back-forward cache): the Google button is usable again.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    root.querySelectorAll('[data-guided-google]').forEach((b) => { b.disabled = false; b.removeAttribute('aria-busy'); });
  });

  // Phones: keep the primary button above the on-screen keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const place = () => root.style.setProperty('--guided-keyboard', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
  }

  return {
    show,
    // Re-points the flow (a Google return, a returning member, a fresh visitor) and shows `screen`.
    // message: a line to show on that screen (a save that failed after the email was confirmed).
    open: async ({ path: p = 'email', hasSession: signed = false, prefill: values = {}, resumeAt: at = null, email = '' } = {}, screen = 'welcome', { message = '' } = {}) => {
      cancelGeo();
      Object.assign(state, { path: p, hasSession: signed, resumeAt: at, email });
      Object.assign(a, emptyAnswers(), values);
      await show(screen);
      if (message) setError(message);
    },
    get screen() { return state.screen; },
    get answers() { return a; },
  };
};
