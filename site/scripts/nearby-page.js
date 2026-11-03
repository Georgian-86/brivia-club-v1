// Nearby (D-131, migration 0029): the view [data-view="nearby"] ("Connect / Nearby"). Members who turned Crossing Paths
// on discover others who did too, within 1, 3 or 5 km, as swipeable cards: right or Connect opens "Make the first
// move." (the request with a message), left or Pass hides the member here for 7 days, View profile opens the profile.
// Two members who both connect match at once (the server's crossing-request rule) and see "Well, look who crossed
// paths!". Location comes only from the Crossing Paths loop (crossing-paths.js, every 5 minutes while visible); this
// page never reads coordinates itself. Pure markup and copy: nearby-view.js.
import {
  COPY, RADII, normalizeRadius, radiusLine, nearbyState, normalizeNearby, nearbyCardMarkup, nearbyMatchMarkup, nearbyOpeners, NEARBY_OPENER,
} from './nearby-view.js';
import { pausedCopy } from './crossing-paths.js';
import { createDeckSwipe } from './deck-swipe.js';

const RADIUS_KEY = 'brivia-nearby-radius';
const readRadius = () => { try { return normalizeRadius(window.localStorage.getItem(RADIUS_KEY)); } catch { return normalizeRadius(); } };
const saveRadius = (km) => { try { window.localStorage.setItem(RADIUS_KEY, String(km)); } catch { /* memory only */ } };

export const createNearbyPage = ({
  root, api, location, safeImage, coverFor, me, toast, isMissing, openProfile, openConversation, composer = null, sendRequest,
  matchDialog = null, onMatchSeen = () => {},
}) => {
  if (!root) return { show() {}, hide() {}, refresh() {}, showMatch() {}, onLocation() {} };
  const deckEl = root.querySelector('#nearby-deck');
  const radiusSelect = root.querySelector('#nearby-radius');
  const radiusText = root.querySelector('#nearby-radius-line');
  const refreshBtn = root.querySelector('#nearby-refresh');
  const statusEl = root.querySelector('#nearby-status');
  const actions = root.querySelector('.nearby-actions');
  const passBtn = root.querySelector('#nearby-pass');
  const likeBtn = root.querySelector('#nearby-like');
  const profileBtn = root.querySelector('#nearby-profile');

  const state = { visible: false, radius: readRadius(), people: [], error: null, loading: false, busy: false, swipe: null, match: null, seq: 0 };
  radiusSelect.innerHTML = RADII.map((km) => `<option value="${km}"${km === state.radius ? ' selected' : ''}>${km} km</option>`).join('');

  const setBusy = (busy) => { state.busy = busy; [passBtn, likeBtn, profileBtn].forEach((b) => { b.disabled = busy; }); };
  const panel = (title, copy, action = '') => {
    state.swipe = null;
    deckEl.innerHTML = `<div class="companion-empty nearby-empty" role="status"><span class="nearby-empty-mark" aria-hidden="true"></span><h2>${title}</h2><p>${copy}</p>${action}</div>`;
    actions.hidden = true;
  };
  const button = (attr, label, primary = false) => `<button type="button" class="event-btn ${primary ? 'event-btn-primary' : 'event-btn-ghost'}" ${attr}>${label}</button>`;

  const render = () => {
    radiusText.textContent = radiusLine(state.radius);
    const view = nearbyState({ enabled: location.enabled(), status: location.status(), error: state.error, count: state.people.length, loading: state.loading && !state.people.length });
    root.dataset.nearbyState = view;
    refreshBtn.disabled = view === 'off' || view === 'consent' || view === 'unavailable' || state.loading;
    if (view === 'loading') {
      state.swipe = null;
      deckEl.innerHTML = '<div class="companion-row nearby-row"><div class="companion-card is-skeleton" aria-hidden="true"></div></div>';
      actions.hidden = true;
      return;
    }
    if (view === 'unavailable') { panel('Nearby opens soon', 'Discovering people around you is almost here.'); return; }
    if (view === 'off') { panel(COPY.offTitle, COPY.offCopy, button('data-nearby-turn-on', 'Turn on Crossing Paths', true)); return; }
    if (view === 'consent') { panel('Nearby is new', 'Crossing Paths now also lets members around you discover you, and you them. Confirm to start.', button('data-nearby-turn-on', 'Turn on Nearby', true)); return; }
    if (view === 'paused-prompt') { panel('Brivia needs your location', 'Allow location so we can show who is around you. We keep only a rough area, never where you are.', button('data-nearby-allow', 'Allow location', true)); return; }
    if (view === 'paused-denied') { panel('Location is off for Brivia', pausedCopy('denied').replace(/^Paused: /, ''), button('data-nearby-retry', 'Try again')); return; }
    if (view === 'paused-unavailable') { panel("We couldn't find you", pausedCopy('unavailable').replace(/^Paused: /, ''), button('data-nearby-retry', 'Try again')); return; }
    if (view === 'locating') { panel('Finding people around you…', 'This takes a moment the first time.', button('data-nearby-retry', 'Try again')); return; }
    if (view === 'incomplete') { panel('Finish your profile first', 'Nearby opens once your profile is complete.'); return; }
    if (view === 'error') { panel('Nearby could not load', 'Check your connection and try again.', button('data-nearby-retry', 'Try again')); return; }
    if (view === 'quiet') {
      const wider = RADII.find((km) => km > state.radius);
      panel(COPY.quietTitle, COPY.quietCopy, wider ? button(`data-nearby-widen="${wider}"`, `Look within ${wider} km`) : '');
      return;
    }
    const [current, next] = state.people;
    deckEl.innerHTML = `<div class="companion-row nearby-row">${[current, next].filter(Boolean).map((p, i) => nearbyCardMarkup(p, {
      coverSrc: coverFor(p.coverUrl), photoSrc: safeImage(p.photoUrl), current: i === 0, index: i,
    })).join('')}</div>`;
    actions.hidden = false;
    likeBtn.setAttribute('aria-label', `${COPY.connect} Connect with ${current.name}`);
    passBtn.setAttribute('aria-label', `Pass on ${current.name}`);
    profileBtn.setAttribute('aria-label', `View profile of ${current.name}`);
    state.swipe = createDeckSwipe({
      card: deckEl.querySelector('.nearby-card.is-current'),
      stack: deckEl.querySelector('.nearby-row'),
      canDrag: () => !state.busy,
      // Right opens the composer (the card waits, parked); left passes.
      onCommit: (direction) => { if (direction === 'pitch') connect(); else pass(); return true; },
    });
    statusEl.textContent = `${current.name}. ${state.people.length} ${state.people.length === 1 ? 'person' : 'people'} around you.`;
  };

  // Reads the list again. keepCurrent: a background refresh keeps the card the member is looking at in front.
  const discover = async ({ keepCurrent = false } = {}) => {
    if (!state.visible || location.enabled() !== true) { state.error = null; state.people = []; render(); return; }
    const seq = ++state.seq;
    state.loading = true;
    if (!keepCurrent) render();
    const { data, error } = await api.discover(state.radius);
    if (seq !== state.seq) return;
    state.loading = false;
    state.error = error ? { message: error.message, missing: isMissing(error) } : null;
    const fresh = error ? [] : (data || []).map(normalizeNearby).filter((p) => p.id);
    const current = state.people[0];
    if (keepCurrent && current && !state.busy && fresh.some((p) => p.id === current.id)) {
      state.people = [current, ...fresh.filter((p) => p.id !== current.id)];
    } else state.people = fresh;
    if (keepCurrent && error && state.people.length) state.error = null;   // keep showing cards through a blip
    render();
  };

  const advance = async (direction) => {
    const flying = state.swipe ? state.swipe.flyOut(direction) : Promise.resolve();
    await flying;
    state.people.shift();
    render();
    (state.people.length ? likeBtn : deckEl.querySelector('button'))?.focus({ preventScroll: true });
  };

  const pass = async () => {
    const person = state.people[0];
    if (!person || state.busy) return;
    setBusy(true);
    const [{ error } = {}] = await Promise.all([api.pass(person.id), state.swipe ? state.swipe.flyOut('pass') : null]);
    setBusy(false);
    if (error) { toast('That did not save. Try again.'); state.swipe?.settle(); render(); return; }
    state.people.shift();
    render();
    (state.people.length ? likeBtn : deckEl.querySelector('button'))?.focus({ preventScroll: true });
  };

  // "Make the first move.": the composer, prefilled with the founder's opener. Cancel sends nothing; the card stays.
  const connect = () => {
    const person = state.people[0];
    if (!person || state.busy) return;
    if (!composer) return;
    state.swipe?.park();
    composer.open({
      person,
      suggestions: nearbyOpeners({ name: person.name, shared: person.shared }),
      prefill: NEARBY_OPENER,
      onCancel: () => { state.swipe?.settle(); likeBtn.focus({ preventScroll: true }); },
      onSend: async (note) => {
        setBusy(true);
        const sent = await sendRequest(person, note);
        setBusy(false);
        if (sent.error) return false;
        await advance('pitch');
        if (sent.status === 'matched') showMatch(person);
        else toast(`Request sent. If ${person.name} connects too, it's mutual.`);
        return true;
      },
    });
  };

  // The crossing-paths moment: right after a mutual connect here, or from a notification (app.js).
  const showMatch = (person) => {
    if (!matchDialog || !person) return;
    state.match = person;
    const mine = me() || {};
    matchDialog.querySelector('.companion-match-body').innerHTML = nearbyMatchMarkup({
      me: { name: mine.name, src: safeImage(mine.photoUrl) },
      them: { name: person.name, src: safeImage(person.photoUrl) },
    });
    if (!matchDialog.open) matchDialog.showModal();
    matchDialog.querySelector('[data-match-chat]')?.focus();
    onMatchSeen(person.id);
  };
  matchDialog?.addEventListener('click', async (e) => {
    if (e.target === matchDialog || e.target.closest('[data-match-later]')) { matchDialog.close(); return; }
    if (e.target.closest('[data-match-chat]') && state.match) {
      const person = state.match;
      matchDialog.close();
      await openConversation(person);
    }
  });

  const refresh = async ({ ask = false } = {}) => {
    refreshBtn.classList.add('is-spinning');
    try { await location.refresh({ ask }); } finally { refreshBtn.classList.remove('is-spinning'); }
    await discover();
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('#nearby-pass')) { pass(); return; }
    if (e.target.closest('#nearby-like')) { connect(); return; }
    if (e.target.closest('#nearby-refresh')) { refresh(); return; }
    if (e.target.closest('[data-nearby-retry]')) { refresh(); return; }
    if (e.target.closest('[data-nearby-allow]')) { refresh({ ask: true }); return; }
    if (e.target.closest('[data-nearby-turn-on]')) { location.turnOn(); return; }
    const widen = e.target.closest('[data-nearby-widen]');
    if (widen) { state.radius = normalizeRadius(widen.dataset.nearbyWiden); radiusSelect.value = String(state.radius); saveRadius(state.radius); discover(); return; }
    const prof = e.target.closest('[data-nearby-profile], #nearby-profile');
    if (prof) {
      const id = prof.dataset.nearbyProfile || state.people[0]?.id;
      const person = state.people.find((p) => p.id === id);
      if (person) openProfile(person);
    }
  });
  radiusSelect.addEventListener('change', () => { state.radius = normalizeRadius(radiusSelect.value); saveRadius(state.radius); discover(); });
  root.addEventListener('keydown', (e) => {
    if (!state.people.length || e.target.closest('select, input, textarea') || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); pass(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); connect(); }
  });

  return {
    show() { state.visible = true; discover(); },
    hide() { state.visible = false; if (matchDialog?.open) matchDialog.close(); },
    // The location loop changed status or sent a fresh pulse: read again, keeping the card in front.
    onLocation() { if (state.visible) discover({ keepCurrent: true }); },
    refresh,
    showMatch,
  };
};
