// Explore: events near you (D-117). The view [data-view="events"] in app.html. app.js creates it once with its
// helpers and calls show() whenever the view opens. Rendering is in events-view.js (pure, unit-tested).
//
// Desktop (>= 1100 px): the event panel sits beside the grid and shows the selected event (the first one by default).
// Narrower: the panel opens as a full-screen sheet when a card is tapped (focus moves into it; Escape or ← closes it
// and focus returns to the card).
import {
  EVENT_CATEGORIES, EVENTS_EMPTY, isEventCategory, normalizeEvent, withRsvp, filterEvents, nearbyEvents,
  eventCardMarkup, eventDetailMarkup, companionRowMarkup, companionNote,
} from './events-view.js';
import { eventImageSrc } from './event-assets.js';

const WIDE = '(min-width: 1100px)';

export const createEventsPage = ({ root, api, safeImage, toast, isMissing, sendHello, openChatWith, signedIn }) => {
  if (!root) return { show() {} };
  const grid = root.querySelector('#events-grid');
  const chips = root.querySelector('#event-chips');
  const panel = root.querySelector('#event-detail');
  const nearbyButton = root.querySelector('#events-nearby');
  const companionSwitch = root.querySelector('#events-companion-default');
  const status = root.querySelector('#events-status');
  const dialog = document.querySelector('#event-companions-dialog');

  const state = { events: [], category: 'all', nearby: false, selectedId: null, loaded: false, loading: false, unavailable: false, error: false, companionDefault: false, sent: new Set(), returnFocus: null };
  const wide = () => window.matchMedia(WIDE).matches;
  const friendsFor = (event) => event.friends.map((f) => ({ name: f.name, src: safeImage(f.photoUrl) }));
  const visible = () => {
    const list = filterEvents(state.events, state.category);
    return state.nearby ? nearbyEvents(list) : list;
  };
  const byId = (id) => state.events.find((e) => e.id === String(id));

  chips.innerHTML = EVENT_CATEGORIES.map((c) => `<button type="button" class="event-chip" data-event-category="${c.key}" aria-pressed="${c.key === 'all'}">${c.label}</button>`).join('');

  const renderPanel = () => {
    const event = byId(state.selectedId);
    if (!event) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    panel.innerHTML = eventDetailMarkup(event, { imageSrc: eventImageSrc(event), friends: friendsFor(event) });
  };

  const renderGrid = () => {
    grid.removeAttribute('aria-busy');
    let empty = null;
    if (state.unavailable) empty = EVENTS_EMPTY.unavailable;
    else if (state.error) empty = EVENTS_EMPTY.error;
    else if (!state.events.length) empty = EVENTS_EMPTY.none;
    const list = empty ? [] : visible();
    if (!empty && !list.length) empty = state.nearby ? EVENTS_EMPTY.nearby : EVENTS_EMPTY.category;
    if (empty) {
      const retry = state.error ? '<button type="button" class="event-empty-action" data-events-retry>Try again</button>'
        : (state.nearby || state.category !== 'all') && !state.unavailable ? '<button type="button" class="event-empty-action" data-events-all>See all events</button>'
          : state.unavailable ? '<button type="button" class="event-empty-action" data-nav="posts">Go to Posts</button>' : '';
      grid.innerHTML = `<div class="events-empty" role="status"><h2>${empty.title}</h2><p>${empty.copy}</p>${retry}</div>`;
      status.textContent = '';
    } else {
      grid.innerHTML = list.map((e) => eventCardMarkup(e, { imageSrc: eventImageSrc(e), friends: friendsFor(e), selected: wide() && e.id === state.selectedId })).join('');
      status.textContent = `${list.length} event${list.length === 1 ? '' : 's'}${state.nearby ? ' within 15 km' : ''}`;
    }
    // Desktop always shows one event in the panel: keep the selection if it is still listed, else the first card.
    if (wide()) {
      if (!list.some((e) => e.id === state.selectedId)) state.selectedId = list[0]?.id || null;
      root.classList.toggle('has-detail', Boolean(state.selectedId));
      renderPanel();
      grid.querySelectorAll('.event-card').forEach((card) => card.classList.toggle('is-selected', card.dataset.eventId === state.selectedId));
    } else if (!panel.classList.contains('is-sheet')) {
      panel.hidden = true;
      root.classList.remove('has-detail');
    }
  };

  const renderControls = () => {
    chips.querySelectorAll('[data-event-category]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.eventCategory === state.category)));
    nearbyButton.setAttribute('aria-pressed', String(state.nearby));
    nearbyButton.querySelector('.events-nearby-sub').textContent = state.nearby ? 'Showing events within 15 km' : "See what's happening around you";
    companionSwitch.setAttribute('aria-checked', String(state.companionDefault));
  };

  const load = async () => {
    if (state.loading || !signedIn()) return;
    state.loading = true;
    if (!state.loaded) grid.setAttribute('aria-busy', 'true');
    const [{ data, error }, prefs] = await Promise.all([api.listEvents(null), api.myEventPrefs()]);
    state.loading = false;
    state.unavailable = Boolean(error && isMissing(error));
    state.error = Boolean(error && !state.unavailable);
    if (!error) { state.events = (data || []).map(normalizeEvent); state.loaded = true; }
    if (!prefs?.error && prefs?.data) state.companionDefault = Boolean(prefs.data.companion_default);
    renderControls();
    renderGrid();
  };

  const openSheet = (id, focusCompanion = false) => {
    state.selectedId = String(id);
    if (wide()) {
      renderGrid();
    } else {
      state.returnFocus = document.activeElement;
      renderPanel();
      panel.classList.add('is-sheet');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'event-detail-title');
      document.body.classList.add('event-sheet-open');
    }
    const target = focusCompanion ? panel.querySelector('[data-event-wants]') : panel.querySelector('#event-detail-title');
    if (focusCompanion) target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    target?.focus({ preventScroll: !focusCompanion });
  };
  const closeSheet = () => {
    if (!panel.classList.contains('is-sheet')) return;
    panel.classList.remove('is-sheet');
    ['aria-modal', 'aria-labelledby'].forEach((a) => panel.removeAttribute(a));
    panel.setAttribute('role', 'region');
    panel.hidden = true;
    document.body.classList.remove('event-sheet-open');
    const back = state.returnFocus?.isConnected ? state.returnFocus : grid.querySelector(`[data-event-open="${CSS.escape(state.selectedId || '')}"]`);
    back?.focus();
  };

  const replaceEvent = (next) => {
    state.events = state.events.map((e) => (e.id === next.id ? next : e));
    const focusedAttr = ['data-event-wants', 'data-event-going'].find((a) => document.activeElement?.hasAttribute?.(a));
    renderPanel();
    if (focusedAttr) panel.querySelector(`[${focusedAttr}]`)?.focus();
    const card = grid.querySelector(`.event-card[data-event-id="${CSS.escape(next.id)}"]`);
    if (card) card.outerHTML = eventCardMarkup(next, { imageSrc: eventImageSrc(next), friends: friendsFor(next), selected: wide() && next.id === state.selectedId });
  };

  // going: the new going state; wants: true/false, or null to keep it (a new RSVP takes the page switch's default).
  const changeRsvp = async (event, going, wants) => {
    const before = event;
    const nextWants = wants === null ? (event.going ? event.wantsCompanion : state.companionDefault) : wants;
    const optimistic = withRsvp(event, going, nextWants);
    replaceEvent(optimistic);
    const { data, error } = await api.setEventRsvp(event.id, optimistic.going, optimistic.going ? wants : null);
    if (error) {
      replaceEvent(before);
      toast(isMissing(error) ? 'Events open soon.' : 'That did not save. Try again.');
      return;
    }
    if (data && (Boolean(data.going) !== optimistic.going || Boolean(data.wants_companion) !== optimistic.wantsCompanion)) {
      replaceEvent(withRsvp(before, data.going, data.wants_companion));
    }
    toast(!optimistic.going ? "You're no longer going." : optimistic.wantsCompanion && !before.wantsCompanion ? "You're going, and open to a companion." : !before.going ? "You're going." : 'Saved.');
  };

  const showCompanions = async (event) => {
    if (!dialog) return;
    const list = dialog.querySelector('#event-companions-list');
    dialog.querySelector('#event-companions-title').textContent = `Companions for ${event.title}`;
    if (!event.wantsCompanion) {
      list.innerHTML = '<li class="event-companions-note">Turn on "Looking for a companion?" first. Only people who did the same can see each other.</li>';
    } else {
      list.innerHTML = '<li class="event-companions-note">Loading…</li>';
    }
    dialog.showModal();
    if (!event.wantsCompanion) return;
    const { data, error } = await api.eventCompanions(event.id);
    if (error) { list.innerHTML = '<li class="event-companions-note">Companions could not load. Try again.</li>'; return; }
    const people = (data || []).map((r) => ({ id: String(r.member_id), name: r.name || 'Member', src: safeImage(r.photo_url), sharedInterests: r.shared_interests, isConnection: Boolean(r.is_connection) }));
    list.innerHTML = people.length
      ? people.map((p) => companionRowMarkup(p, { sent: state.sent.has(p.id) })).join('')
      : '<li class="event-companions-note">No one else is looking yet. We will show them here as they join.</li>';
    dialog.dataset.eventId = event.id;
    dialog._people = people;
  };

  root.addEventListener('click', (e) => {
    const t = e.target;
    const cat = t.closest('[data-event-category]');
    if (cat && isEventCategory(cat.dataset.eventCategory)) { state.category = cat.dataset.eventCategory; renderControls(); renderGrid(); return; }
    if (t.closest('#events-nearby')) { state.nearby = !state.nearby; renderControls(); renderGrid(); return; }
    if (t.closest('[data-events-all]')) { state.nearby = false; state.category = 'all'; renderControls(); renderGrid(); return; }
    if (t.closest('[data-events-retry]')) { load(); return; }
    const chip = t.closest('[data-event-companion]');
    if (chip) { openSheet(chip.dataset.eventCompanion, true); return; }
    const card = t.closest('.event-card');
    if (card && !t.closest('button:not(.event-open)')) { openSheet(card.dataset.eventId); return; }
    if (t.closest('[data-event-close]')) { if (wide()) return; closeSheet(); return; }
    const event = byId(state.selectedId);
    if (!event) return;
    if (t.closest('[data-event-going]')) { changeRsvp(event, !event.going, event.going ? false : null); return; }
    if (t.closest('[data-event-wants]')) { changeRsvp(event, event.going || !event.wantsCompanion, !event.wantsCompanion); return; }
    if (t.closest('[data-event-companions]')) { showCompanions(event); return; }
    if (t.closest('[data-event-share]')) {
      const url = new URL(`/app.html?view=events&event=${encodeURIComponent(event.id)}`, window.location.origin).href;
      const done = () => toast('Event link copied.');
      if (navigator.share) navigator.share({ title: event.title, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(done, () => toast(url));
    }
  });

  companionSwitch.addEventListener('click', async () => {
    const next = !state.companionDefault;
    state.companionDefault = next; renderControls();
    const { error } = await api.setCompanionDefault(next);
    if (error) { state.companionDefault = !next; renderControls(); toast(isMissing(error) ? 'Events open soon.' : 'That did not save. Try again.'); return; }
    // The server applied it to every upcoming event the member is going to; mirror that here.
    state.events = state.events.map((e) => (e.going && e.wantsCompanion !== next ? withRsvp(e, true, next) : e));
    renderGrid();
    toast(next ? "You'll be shown to people going to the same events who also want company." : 'Companion matching is off.');
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-sheet')) { e.preventDefault(); e.stopPropagation(); closeSheet(); }
    if (e.key === 'Tab' && panel.classList.contains('is-sheet')) {
      const items = [...panel.querySelectorAll('button:not([disabled]), [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  dialog?.addEventListener('click', async (e) => {
    if (e.target === dialog || e.target.closest('[data-companions-close]')) { dialog.close(); return; }
    const hi = e.target.closest('[data-companion-hi]');
    const chat = e.target.closest('[data-companion-chat]');
    const person = (dialog._people || []).find((p) => p.id === (hi?.dataset.companionHi || chat?.dataset.companionChat));
    if (chat && person) { dialog.close(); closeSheet(); openChatWith(person); return; }
    if (!hi || !person || hi.disabled) return;
    hi.disabled = true;
    const event = byId(dialog.dataset.eventId);
    const result = await sendHello(person, companionNote(event?.title));
    if (result?.error) { hi.disabled = false; return; }
    state.sent.add(person.id);
    hi.textContent = 'Request sent';
  });

  window.matchMedia(WIDE).addEventListener?.('change', () => { closeSheet(); renderGrid(); });

  return {
    show({ eventId } = {}) {
      if (eventId) state.pendingId = String(eventId);
      renderControls();
      // A shared event link opens its event once the list has it (after sign-in if needed).
      const pick = () => { if (state.pendingId && byId(state.pendingId)) { const id = state.pendingId; state.pendingId = null; openSheet(id); } };
      if (!state.loaded || state.error || state.unavailable) load().then(pick);
      else { renderGrid(); pick(); load(); }
    },
    hide() { closeSheet(); if (dialog?.open) dialog.close(); },
  };
};
