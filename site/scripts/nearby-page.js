// Nearby (D-131, migration 0029): the view [data-view="nearby"] ("Connect / Nearby"). Members who turned Crossing Paths
// on discover others who did too, within 1, 3 or 5 km, as swipeable cards: right or Connect opens "Make the first
// move." (the request with a message), left or Pass hides the member here for 7 days, View profile opens the profile.
// Two members who both connect match at once (the server's crossing-request rule) and see "Well, look who crossed
// paths!". Location comes only from the Crossing Paths loop (crossing-paths.js, every 5 minutes while visible); this
// page never reads coordinates itself. Pure markup and copy: nearby-view.js.
import {
  COPY, RADII, normalizeRadius, radiusLine, nearbyState, normalizeNearby, nearbyCardMarkup, nearbyMatchMarkup, nearbyOpeners, NEARBY_OPENER, nearbyNoticeMarkup,
} from './nearby-view.js';
import { locationHelp } from './crossing-paths.js';
import { createDeckSwipe } from './deck-swipe.js';

const RADIUS_KEY = 'brivia-nearby-radius';
const readRadius = () => { try { return normalizeRadius(window.localStorage.getItem(RADIUS_KEY)); } catch { return normalizeRadius(); } };
const saveRadius = (km) => { try { window.localStorage.setItem(RADIUS_KEY, String(km)); } catch { /* memory only */ } };

export const createNearbyPage = ({
  root, api, location, safeImage, coverFor, me, toast, isMissing, openProfile, openConversation, composer = null, sendRequest,
  matchDialog = null, onMatchSeen = () => {}, notices = null,
}) => {
  if (!root) return { show() {}, hide() {}, refresh() {}, showMatch() {}, onLocation() {}, notify: () => false, isVisible: () => false };
  const deckEl = root.querySelector('#nearby-deck');
  const radiusSelect = root.querySelector('#nearby-radius');
  const radiusText = root.querySelector('#nearby-radius-line');
  const refreshBtn = root.querySelector('#nearby-refresh');
  const statusEl = root.querySelector('#nearby-status');
  const actions = root.querySelector('.nearby-actions');
  const passBtn = root.querySelector('#nearby-pass');
  const likeBtn = root.querySelector('#nearby-like');
  const profileBtn = root.querySelector('#nearby-profile');
  const noticeEl = root.querySelector('#nearby-notice');

  const state = { locating: false, askedThisVisit: false, visible: false, radius: readRadius(), people: [], error: null, loading: false, busy: false, swipe: null, match: null, seq: 0 };
  radiusSelect.innerHTML = RADII.map((km) => `<option value="${km}"${km === state.radius ? ' selected' : ''}>${km} km</option>`).join('');

  const setBusy = (busy) => { state.busy = busy; [passBtn, likeBtn, profileBtn].forEach((b) => { b.disabled = busy; }); };
  // points: short reassurances under the copy (the off and consent states explain privacy before asking).
  const panel = (title, copy, action = '', points = []) => {
    state.swipe = null;
    const list = points.length ? `<ul class="nearby-points">${points.map(([strong, rest]) => `<li><strong>${strong}</strong> ${rest}</li>`).join('')}</ul>` : '';
    deckEl.innerHTML = `<div class="companion-empty nearby-empty" role="status"><span class="nearby-empty-mark" aria-hidden="true"><span></span></span><h2>${title}</h2><p>${copy}</p>${list}${action}</div>`;
    actions.hidden = true;
  };
  const PRIVACY_POINTS = [
    ['Only members who turn it on.', 'Everyone else never sees you, and you never see them.'],
    ['Never your exact place.', 'Just your city and roughly how far, like “under 1 km”.'],
    ['Off any time.', 'You leave Nearby the moment you turn it off.'],
  ];
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
    if (view === 'off') { panel(COPY.offTitle, COPY.offCopy, button('data-nearby-turn-on', 'Turn on Crossing Paths', true), PRIVACY_POINTS); return; }
    if (view === 'consent') { panel('Nearby is new', 'Crossing Paths now also lets members around you discover you, and you them.', button('data-nearby-turn-on', 'Turn on Nearby', true), PRIVACY_POINTS); return; }
    // D-133: one state per real answer from the browser, each with the way out. Every button asks the browser afresh.
    if (state.locating && view !== 'cards') { panel('Finding where you are…', 'Your browser may ask to share your location. We keep only a rough area, never where you are.'); return; }
    if (view === 'paused-prompt') { panel('Allow location to see who is around', 'Your browser will ask to share your location. We keep only a rough ~1 km area for 20 minutes, never where you are.', button('data-nearby-allow', 'Allow location', true)); return; }
    if (view === 'paused-denied') { panel('Location permission needed', `Brivia can't see your location yet. ${locationHelp()}`, button('data-nearby-retry', 'Try again', true)); return; }
    if (view === 'paused-unavailable') { panel('Location unavailable', "Your device couldn't find where you are. Check that Location (GPS) and your internet connection are on, then try again.", button('data-nearby-retry', 'Try again', true)); return; }
    if (view === 'paused-timeout') { panel('That took too long', 'Finding your location timed out. Turning on Wi-Fi or stepping near a window helps. Then try again.', button('data-nearby-retry', 'Try again', true)); return; }
    if (view === 'paused-unsupported') { panel("This browser can't share your location", 'Open Brivia in Safari or Chrome to use Nearby.'); return; }
    if (view === 'paused-insecure') { panel('Open the secure Brivia site', 'Location only works on the https version of Brivia.'); return; }
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
        if (sent.error) return sent.limit ? { limit: sent.limit } : false;   // D-225: the limit, said in the dialog
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

  // A fresh position from the browser, then who is around. Every tap (refresh, Try again, Allow location) and opening
  // Nearby asks the browser itself (ask: true): it never just re-reads a remembered answer (D-133).
  const refresh = async () => {
    if (state.locating) return;
    state.locating = true;
    refreshBtn.classList.add('is-spinning');
    if (!state.people.length) render();
    try { await location.refresh({ ask: true }); } finally { state.locating = false; refreshBtn.classList.remove('is-spinning'); }
    await discover();
  };
  // Opening Nearby with Crossing Paths on: ask for the location once per visit, then list.
  const locateOnOpen = () => {
    if (!state.visible) return;
    if (location.enabled() === true && !state.askedThisVisit) { state.askedThisVisit = true; refresh(); return; }
    discover({ keepCurrent: true });
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('#nearby-pass')) { pass(); return; }
    if (e.target.closest('#nearby-like')) { connect(); return; }
    if (e.target.closest('#nearby-refresh')) { refresh(); return; }
    if (e.target.closest('[data-nearby-retry], [data-nearby-allow]')) { refresh(); return; }
    if (e.target.closest('[data-nearby-turn-on]')) { location.turnOn(); return; }
    const widen = e.target.closest('[data-nearby-widen]');
    if (widen) { state.radius = normalizeRadius(widen.dataset.nearbyWiden); radiusSelect.value = String(state.radius); saveRadius(state.radius); api.setRadius?.(state.radius); discover(); return; }
    // D-134: the in-section notice. View profile and dismiss both mark it read everywhere.
    const view = e.target.closest('[data-notice-view]');
    if (view) { const id = view.closest('[data-notice-id]')?.dataset.noticeId; notices?.open(id, view.dataset.noticeView); hideNotice(); return; }
    const dismiss = e.target.closest('[data-notice-dismiss]');
    if (dismiss) { notices?.dismiss(dismiss.dataset.noticeDismiss); hideNotice(); return; }
    const prof = e.target.closest('[data-nearby-profile], #nearby-profile');
    if (prof) {
      const id = prof.dataset.nearbyProfile || state.people[0]?.id;
      const person = state.people.find((p) => p.id === id);
      if (person) openProfile(person);
    }
  });
  radiusSelect.addEventListener('change', () => { state.radius = normalizeRadius(radiusSelect.value); saveRadius(state.radius); api.setRadius?.(state.radius); discover(); });
  root.addEventListener('keydown', (e) => {
    if (!state.people.length || e.target.closest('select, input, textarea') || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); pass(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); connect(); }
  });

  // D-134: "Someone crossed your path." inside the section, above the cards. One at a time; shown for 12 s while the
  // page is in front, and marked read once seen for 3 s (on every device).
  let noticeTimer = 0;
  let readTimer = 0;
  const hideNotice = () => {
    clearTimeout(noticeTimer); clearTimeout(readTimer);
    if (!noticeEl) return;
    noticeEl.classList.remove('is-in');
    noticeTimer = setTimeout(() => { noticeEl.innerHTML = ''; noticeEl.hidden = true; }, 300);
  };
  const notify = (n) => {
    if (!noticeEl || !state.visible) return false;
    clearTimeout(noticeTimer); clearTimeout(readTimer);
    noticeEl.innerHTML = nearbyNoticeMarkup(n, { photoSrc: safeImage(n.photoUrl) });
    noticeEl.hidden = false;
    requestAnimationFrame(() => noticeEl.classList.add('is-in'));
    readTimer = setTimeout(() => { if (document.visibilityState === 'visible') notices?.markRead([n.id]); }, 3000);
    noticeTimer = setTimeout(hideNotice, 12000);
    discover({ keepCurrent: true });   // they are around: bring their card in
    return true;
  };

  return {
    notify,
    isVisible: () => state.visible,
    show() { api.setRadius?.(state.radius); state.visible = true; state.askedThisVisit = false; if (location.enabled() === true) locateOnOpen(); else discover(); },
    hide() { state.visible = false; if (matchDialog?.open) matchDialog.close(); },
    // The location loop changed status or sent a fresh pulse: read again, keeping the card in front.
    // Also runs when the switch is first read as on (app start): then this visit's location request goes out.
    onLocation() { if (state.visible && !state.locating) locateOnOpen(); },
    refresh,
    showMatch,
  };
};
