// Find a Companion (D-123, migration 0023): the view [data-view="companions"] ("Connect / Companions"). For one event
// at a time (the picker lists every event the member is looking for company at), it shows the people also going who
// want company as cards: swipe right or press Connect to like, left or Pass to pass, tap the photo for the full
// profile. Two likes for the same event make a match (server: companion_swipe), shown as "Looks like you're going
// together!" with Start conversation. Pure markup lives in companion-view.js.
import {
  normalizeCompanionEvent, normalizeCompanion, companionCardMarkup, matchMomentMarkup, eventPickLabel, lookingPillMarkup,
} from './companion-view.js';
import { createDeckSwipe } from './deck-swipe.js';
import { openerSuggestions } from './connect-composer.js';
import { resetTimeLabel } from './signal-quota.js';

// D-156 (0045): 10 companion swipes a day (Connect or Pass, all events together, rolling 24 h). quota = { daily_limit,
// remaining, resets_at } from my_companion_quota(); null (not loaded, or before 0045) never blocks: the server judges.
export const companionQuotaLabel = (quota) => {
  if (!quota || !Number.isFinite(Number(quota.remaining))) return '';
  const remaining = Math.max(Number(quota.remaining), 0);
  if (remaining > 0) return `${remaining} of ${Number(quota.daily_limit) || 10} swipes left today`;
  const time = resetTimeLabel(quota.resets_at);
  return time ? `No swipes left today. More at ${time}.` : 'No swipes left today.';
};
export const companionQuotaBlocked = (quota) => Boolean(quota && Number.isFinite(Number(quota.remaining)) && Number(quota.remaining) <= 0);

export const createCompanionsPage = ({ root, api, safeImage, coverFor, me, toast, isMissing, openProfile, openConversation, goExplore, composer = null, sendRequest = null }) => {
  if (!root) return { show() {}, hide() {}, showMatch() {} };
  const deckEl = root.querySelector('#companion-deck');
  const picker = root.querySelector('#companion-event');
  const count = root.querySelector('#companion-count');
  const status = root.querySelector('#companion-status');
  const actions = root.querySelector('.companion-actions');
  const passBtn = root.querySelector('#companion-pass');
  const likeBtn = root.querySelector('#companion-like');
  const matchDialog = document.querySelector('#companion-match-dialog');

  const state = { events: [], eventId: null, people: [], loading: false, busy: false, unavailable: false, error: false, swipe: null, match: null, quota: null };
  let quotaLine = root.querySelector('[data-companion-quota]');
  if (!quotaLine && actions) {
    quotaLine = document.createElement('p');
    quotaLine.className = 'companion-quota';
    quotaLine.dataset.companionQuota = '';
    quotaLine.setAttribute('aria-live', 'polite');
    actions.after(quotaLine);
  }
  const renderQuota = () => {
    if (!quotaLine) return;
    const text = actions?.hidden ? '' : companionQuotaLabel(state.quota);
    quotaLine.textContent = text;
    quotaLine.hidden = !text;
    const capped = companionQuotaBlocked(state.quota);
    [passBtn, likeBtn].forEach((b) => { if (!b) return; b.classList.toggle('is-capped', capped); b.toggleAttribute('aria-disabled', capped); });
  };
  const refreshQuota = async () => {
    if (!api.companionQuota) return;
    const { data, error } = await api.companionQuota();
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row) state.quota = row;
    renderQuota();
  };
  const capReached = () => {
    if (!companionQuotaBlocked(state.quota)) return false;
    toast(companionQuotaLabel(state.quota) || 'No swipes left today.');
    state.swipe?.settle();
    return true;
  };
  const event = () => state.events.find((e) => e.id === state.eventId) || null;
  const VISIBLE = 3;

  const renderPicker = () => {
    picker.innerHTML = state.events.map((e) => `<option value="${e.id}"${e.id === state.eventId ? ' selected' : ''}>${eventPickLabel(e).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</option>`).join('');
    picker.closest('.companion-picker').hidden = !state.events.length;
  };
  const renderCount = () => {
    count.innerHTML = state.eventId && state.people.length ? lookingPillMarkup(state.people, { photoSrc: (p) => safeImage(p.photoUrl) }) : '';
    count.hidden = !count.innerHTML;
  };

  const empty = (title, copy, action = '') => {
    deckEl.innerHTML = `<div class="companion-empty" role="status"><h2>${title}</h2><p>${copy}</p>${action}</div>`;
    actions.hidden = true;
    renderQuota();
  };

  const renderDeck = () => {
    state.swipe = null;
    renderCount();
    if (state.unavailable) { empty('Companions open soon', 'Event companions are almost here. Meanwhile, find events on Explore.', '<button type="button" class="event-btn event-btn-ghost" data-companion-explore>Go to Explore</button>'); return; }
    if (state.error) { empty('Companions could not load', 'Check your connection and try again.', '<button type="button" class="event-btn event-btn-ghost" data-companion-retry>Try again</button>'); return; }
    if (!state.events.length) {
      empty('Not looking for company yet', 'Register for an event on Explore and turn on "Looking for a companion?". People going solo to the same event will show here.', '<button type="button" class="event-btn event-btn-primary" data-companion-explore>Find an event</button>');
      return;
    }
    if (!state.people.length) {
      const others = state.events.filter((e) => e.id !== state.eventId && e.toSee > 0);
      empty('No one new for now', `You've seen everyone looking for company at ${event()?.title || 'this event'}. New people show here as they opt in.`,
        others.length ? `<button type="button" class="event-btn event-btn-ghost" data-companion-switch="${others[0].id}">See ${others[0].title}</button>` : '');
      return;
    }
    const ev = event();
    deckEl.innerHTML = `<div class="companion-row">${state.people.slice(0, VISIBLE).map((p, i) => companionCardMarkup(p, {
      coverSrc: coverFor(p.coverUrl), photoSrc: safeImage(p.photoUrl), event: ev, current: i === 0, index: i,
    })).join('')}</div>`;
    actions.hidden = false;
    const current = deckEl.querySelector('.companion-card.is-current');
    state.swipe = createDeckSwipe({
      card: current,
      stack: deckEl.querySelector('.companion-row'),
      canDrag: () => !state.busy,
      // Right opens the composer (the card waits, parked); left passes.
      onCommit: (direction) => {
        if (companionQuotaBlocked(state.quota)) { capReached(); return false; }
        if (direction === 'pitch') { connect(); return true; }
        decide(false); return true;
      },
    });
    renderQuota();
    status.textContent = `${state.people[0].name}. ${state.people.length} ${state.people.length === 1 ? 'person' : 'people'} to see.`;
  };

  const loadDeck = async () => {
    if (!state.eventId) { renderDeck(); return; }
    deckEl.setAttribute('aria-busy', 'true');
    const { data, error } = await api.companionDeck(state.eventId);
    deckEl.removeAttribute('aria-busy');
    state.unavailable = Boolean(error && isMissing(error));
    state.error = Boolean(error && !state.unavailable);
    state.people = error ? [] : (data || []).map(normalizeCompanion);
    renderDeck();
    void refreshQuota();
  };

  const load = async (wanted) => {
    if (state.loading) return;
    state.loading = true;
    deckEl.innerHTML = '<div class="companion-row"><div class="companion-card is-skeleton" aria-hidden="true"></div><div class="companion-card is-skeleton" aria-hidden="true"></div><div class="companion-card is-skeleton" aria-hidden="true"></div></div>';
    const { data, error } = await api.companionEvents();
    state.loading = false;
    state.unavailable = Boolean(error && isMissing(error));
    state.error = Boolean(error && !state.unavailable);
    state.events = error ? [] : (data || []).map(normalizeCompanionEvent);
    const pick = state.events.find((e) => e.id === String(wanted || '')) || state.events.find((e) => e.id === state.eventId) || state.events[0] || null;
    state.eventId = pick?.id || null;
    renderPicker();
    if (state.error || state.unavailable) { renderDeck(); return; }
    await loadDeck();
  };

  // D-124 "Make the first move.": Connect opens the composer. Send = the request with the message (it opens their chat
  // if they accept, 0024) and this event's like (two likes match at once, D-123). Cancel sends nothing; the card stays.
  const connect = () => {
    const person = state.people[0];
    if (!person || state.busy) return;
    if (capReached()) return; // never send a request for a swipe the server would refuse
    if (!composer || !sendRequest) { decide(true); return; }
    state.swipe?.park();
    const ev = event();
    composer.open({
      person,
      suggestions: openerSuggestions({ name: person.name, shared: person.shared, eventTitle: ev?.title }),
      onCancel: () => { state.swipe?.settle(); likeBtn.focus({ preventScroll: true }); },
      onSend: async (note) => {
        const sent = await sendRequest(person, note);
        if (sent.error) return false;
        decide(true, { requested: true });
        return true;
      },
    });
  };

  // like: true connects, false passes. requested: a connect request with a message went out first.
  const decide = async (like, { requested = false } = {}) => {
    const person = state.people[0];
    if (!person || state.busy) return;
    if (!requested && capReached()) return;
    state.busy = true;
    [passBtn, likeBtn].forEach((b) => { b.disabled = true; });
    const flying = state.swipe ? state.swipe.flyOut(like ? 'pitch' : 'pass') : Promise.resolve();
    const [{ data, error }] = await Promise.all([api.companionSwipe(state.eventId, person.id, like), flying]);
    state.busy = false;
    [passBtn, likeBtn].forEach((b) => { b.disabled = false; });
    if (error) {
      if (error.code === 'PT429' || /companion_swipe_quota/.test(String(error.message || ''))) {
        state.quota = { ...(state.quota || {}), remaining: 0 };
        await refreshQuota();
        toast(companionQuotaLabel(state.quota) || 'No swipes left today.');
      } else if (/not available/.test(String(error.message || ''))) {
        toast(`${person.name} is no longer looking for company at this event.`);
        state.people.shift();
      } else if (/not looking/.test(String(error.message || ''))) {
        toast('You are no longer looking for company at this event.');
        load();
        return;
      } else {
        toast(isMissing(error) ? 'Companions open soon.' : 'That did not save. Try again.');
      }
      renderDeck();
      return;
    }
    state.people.shift();
    if (state.quota && Number.isFinite(Number(state.quota.remaining))) {
      state.quota = { ...state.quota, remaining: Math.max(Number(state.quota.remaining) - 1, 0) };
      if (state.quota.remaining <= 0) void refreshQuota(); // learn the reset time
    }
    const ev = event();
    if (ev) ev.toSee = Math.max(0, ev.toSee - 1);
    renderDeck();
    (state.people.length ? likeBtn : deckEl.querySelector('button'))?.focus({ preventScroll: true });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.matched) showMatch({ matchId: row.match_id, person, event: ev });
    else if (requested) toast(`Request sent. If ${person.name} accepts, your message opens your chat.`);
    else if (like) toast(`Noted. If ${person.name} wants to go together too, you'll both be told.`);
  };

  // The "going together" moment, from a swipe here or from a notification (app.js). match: { matchId, person { id,
  // name, photoUrl }, event { title, startsAt, venueName } }.
  const showMatch = (match) => {
    if (!matchDialog) return;
    state.match = match;
    const mine = me() || {};
    matchDialog.querySelector('.companion-match-body').innerHTML = matchMomentMarkup({
      me: { name: mine.name, src: safeImage(mine.photoUrl) },
      them: { name: match.person.name, src: safeImage(match.person.photoUrl) },
      event: match.event || {},
    });
    if (!matchDialog.open) matchDialog.showModal();
    matchDialog.querySelector('[data-match-chat]')?.focus();
    if (match.matchId) api.markCompanionMatchSeen?.(match.matchId);
  };
  matchDialog?.addEventListener('click', async (e) => {
    if (e.target === matchDialog || e.target.closest('[data-match-later]')) { matchDialog.close(); return; }
    if (e.target.closest('[data-match-chat]') && state.match) {
      const { person } = state.match;
      matchDialog.close();
      await openConversation(person);
    }
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('#companion-pass')) { decide(false); return; }
    if (e.target.closest('#companion-like')) { connect(); return; }
    if (e.target.closest('[data-companion-explore]')) { goExplore(); return; }
    if (e.target.closest('[data-companion-retry]')) { load(state.eventId); return; }
    const sw = e.target.closest('[data-companion-switch]');
    if (sw) { state.eventId = sw.dataset.companionSwitch; renderPicker(); loadDeck(); return; }
    const prof = e.target.closest('[data-companion-profile]');
    if (prof) {
      const person = state.people.find((p) => p.id === prof.dataset.companionProfile);
      if (person) openProfile(person);
    }
  });
  picker.addEventListener('change', () => { state.eventId = picker.value; loadDeck(); });
  root.addEventListener('keydown', (e) => {
    if (!state.people.length || e.target.closest('select, input, textarea') || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); decide(false); }
    if (e.key === 'ArrowRight') { e.preventDefault(); connect(); }
  });

  return {
    show({ eventId } = {}) { load(eventId); },
    hide() { if (matchDialog?.open) matchDialog.close(); },
    showMatch,
  };
};
