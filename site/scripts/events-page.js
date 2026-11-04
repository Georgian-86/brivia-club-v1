// Explore: events near you (D-117). The view [data-view="events"] in app.html. app.js creates it once with its
// helpers and calls show() whenever the view opens. Rendering is in events-view.js (pure, unit-tested).
//
// The event panel is a drawer at every width (D-118: a calmer page; the grid gets the full width): a side drawer from
// 760 px, a full-screen sheet below. Opening moves focus to its title; Escape, ← or the backdrop closes it and focus
// returns to the card.
//
// D-121 (0022): "Create event" opens the composer (event-create.js); members register (capacity and paid holds are
// the server's), choose "Looking for company?" separately, and ask the organiser a question (an ordinary signal with a
// note). The organiser edits, cancels or deletes their own event from its drawer.
import {
  visibleCategories, EVENTS_EMPTY, isEventCategory, normalizeEvent, withRsvp, filterEvents, nearbyEvents,
  eventCardMarkup, eventDetailMarkup, questionNote, companionStep, withInterest,
} from './events-view.js';
import { eventImageSrc } from './event-assets.js';
import { openCheckout } from './payment-checkout.js';

export const createEventsPage = ({ root, api, safeImage, toast, isMissing, sendHello, openChatWith, signedIn, composer = null, memberId = () => '', openCompanions = null }) => {
  if (!root) return { show() {} };
  const grid = root.querySelector('#events-grid');
  const chips = root.querySelector('#event-chips');
  const panel = document.querySelector('#event-detail');
  const nearbyButton = root.querySelector('#events-nearby');
  const companionSwitch = root.querySelector('#events-companion-default');
  const status = root.querySelector('#events-status');
  const count = root.querySelector('#events-count');
  const backdrop = document.querySelector('#event-detail-backdrop');
  const dialog = document.querySelector('#event-companions-dialog');
  const askDialog = document.querySelector('#event-ask-dialog');
  const createButton = root.querySelector('#events-create');

  const state = { events: [], category: 'all', nearby: false, selectedId: null, loaded: false, loading: false, unavailable: false, error: false, companionDefault: false, sent: new Set(), returnFocus: null, confirm: null, paying: null };
  const friendsFor = (event) => event.friends.map((f) => ({ name: f.name, src: safeImage(f.photoUrl) }));
  // A member's poster (a checked Storage URL), else the club's bundled image for the event or its category.
  const imageFor = (event) => (event.imageUrl && safeImage(event.imageUrl)) || eventImageSrc(event);
  const cardOpts = (event) => ({ imageSrc: imageFor(event), friends: friendsFor(event) });
  const visible = () => {
    const list = filterEvents(state.events, state.category);
    return state.nearby ? nearbyEvents(list) : list;
  };
  const byId = (id) => state.events.find((e) => e.id === String(id));

  const renderChips = () => {
    const html = visibleCategories(state.events, state.category).map((c) => `<button type="button" class="event-chip" data-event-category="${c.key}" aria-pressed="${c.key === state.category}">${c.label}</button>`).join('');
    if (chips.innerHTML !== html) chips.innerHTML = html;
  };
  renderChips();

  const renderPanel = () => {
    const event = byId(state.selectedId);
    if (!event) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    panel.innerHTML = eventDetailMarkup(event, {
      ...cardOpts(event), confirm: state.confirm,
      organizerSrc: event.organizer?.photoUrl ? safeImage(event.organizer.photoUrl) : '',
      gallery: event.gallery.map((u) => safeImage(u)).filter(Boolean),
      brochureSrc: event.brochureUrl ? safeImage(event.brochureUrl) : '',
    });
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
      grid.innerHTML = list.map((e) => eventCardMarkup(e, cardOpts(e))).join('');
      status.textContent = `${list.length} event${list.length === 1 ? '' : 's'}${state.nearby ? ' within 15 km' : ''}`;
    }
    count.textContent = empty ? 'EVENTS' : `${String(list.length).padStart(2, '0')} ${list.length === 1 ? 'EVENT' : 'EVENTS'}${state.nearby ? ' WITHIN 15 KM' : ''}`;
  };

  const renderControls = () => {
    renderChips();
    chips.querySelectorAll('[data-event-category]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.eventCategory === state.category)));
    nearbyButton.setAttribute('aria-pressed', String(state.nearby));
    companionSwitch.setAttribute('aria-checked', String(state.companionDefault));
    if (createButton) createButton.hidden = state.unavailable;
  };

  const load = () => {
    if (!signedIn()) return Promise.resolve();
    if (state.loading) return state.loading;
    state.loading = fetchEvents().finally(() => { state.loading = null; });
    return state.loading;
  };
  const fetchEvents = async () => {
    if (!state.loaded) grid.setAttribute('aria-busy', 'true');
    const [{ data, error }, prefs] = await Promise.all([api.listEvents(null), api.myEventPrefs()]);
    state.unavailable = Boolean(error && isMissing(error));
    state.error = Boolean(error && !state.unavailable);
    if (!error) { state.events = (data || []).map(normalizeEvent); state.loaded = true; }
    if (!prefs?.error && prefs?.data) state.companionDefault = Boolean(prefs.data.companion_default);
    renderControls();
    renderGrid();
    if (panel.classList.contains('is-sheet')) { if (byId(state.selectedId)) renderPanel(); else closeSheet(); }
  };

  const openSheet = (id, focusCompanion = false) => {
    if (state.selectedId !== String(id)) state.confirm = null;
    state.selectedId = String(id);
    if (!panel.classList.contains('is-sheet')) state.returnFocus = document.activeElement;
    renderPanel();
    panel.classList.add('is-sheet');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'event-detail-title');
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('event-sheet-open');
    const wants = panel.querySelector('[data-event-wants]');
    const target = focusCompanion && wants ? (wants.disabled ? panel.querySelector('[data-event-going]') || wants : wants) : panel.querySelector('#event-detail-title');
    if (focusCompanion) target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    target?.focus({ preventScroll: !focusCompanion });
  };
  const closeSheet = () => {
    if (!panel.classList.contains('is-sheet')) return;
    panel.classList.remove('is-sheet');
    ['aria-modal', 'aria-labelledby'].forEach((a) => panel.removeAttribute(a));
    panel.hidden = true;
    state.confirm = null;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('event-sheet-open');
    const back = state.returnFocus?.isConnected ? state.returnFocus : grid.querySelector(`[data-event-open="${CSS.escape(state.selectedId || '')}"]`);
    back?.focus();
  };

  const replaceEvent = (next) => {
    state.events = state.events.map((e) => (e.id === next.id ? next : e));
    const focusedAttr = ['data-event-wants', 'data-event-going', 'data-event-unregister', 'data-event-interest'].find((a) => document.activeElement?.hasAttribute?.(a));
    if (state.selectedId === next.id) {
      renderPanel();
      // After registering or cancelling the button changes; keep focus in the same row.
      const keep = focusedAttr && panel.querySelector(`[${focusedAttr}]:not([disabled])`);
      (keep || (focusedAttr ? panel.querySelector('[data-event-going], [data-event-unregister], .event-registered') : null))?.focus?.();
    }
    const card = grid.querySelector(`.event-card[data-event-id="${CSS.escape(next.id)}"]`);
    if (card) {
      // Re-rendering the card must not drop keyboard focus from its switch.
      const hadFocus = card.contains(document.activeElement) && document.activeElement.hasAttribute('data-event-companion');
      card.outerHTML = eventCardMarkup(next, cardOpts(next));
      if (hadFocus) grid.querySelector(`.event-card[data-event-id="${CSS.escape(next.id)}"] [data-event-companion]`)?.focus();
    }
  };

  // going: true registers, false cancels, null keeps the registration; wants: the companion choice or null to keep it
  // (a new registration takes the page switch's default).
  const changeRsvp = async (event, going, wants, { quiet = false } = {}) => {
    // A shown interest carries the companion choice too (0025): the switch changes it through the interest.
    if (going === null && event.myStatus === 'interested') return changeInterest(event, true, wants, { quiet });
    const before = event;
    const nextGoing = going === null ? event.going : going;
    const nextWants = !nextGoing ? false : wants === null ? (event.going || event.myStatus === 'interested' ? event.wantsCompanion : state.companionDefault) : wants;
    const optimistic = withRsvp(event, nextGoing, nextWants);
    replaceEvent(optimistic);
    const { data, error } = await api.setEventRsvp(event.id, going, going === false ? null : wants);
    if (error) {
      replaceEvent(before);
      const message = String(error.message || '');
      if (isMissing(error)) toast('Events open soon.');
      else if (/event_full/.test(message)) { toast('Registrations just closed: this event is full.'); load(); }
      else if (/register first/.test(message)) toast('Register first, then look for company.');
      else if (/invalid event/.test(message)) { toast('This event is no longer open.'); load(); }
      else toast('That did not save. Try again.');
      return false;
    }
    if (data) replaceEvent(withRsvp(before, data.going, data.wants_companion, data.status || null));
    const after = byId(event.id);
    if (!after.going) toast(before.going ? 'Registration cancelled. Your spot is free for someone else.' : 'Saved.');
    else if (!before.going && after.myStatus === 'pending_payment') { void pay(after); return true; }   // D-177: straight to payment
    else if (!before.going && after.myStatus === 'confirmed') { void celebrate(after, { paid: false }); return true; }
    else if (!quiet) toast(after.wantsCompanion && !before.wantsCompanion ? "You'll be shown to others going who want company too." : !after.wantsCompanion && before.wantsCompanion ? 'Companion matching is off for this event.' : 'Saved.');
    return true;
  };

  // D-177: a confirmed seat. The sound plays; a free seat asks the server for its ticket (a paid seat's ticket was sent
  // when the payment was confirmed). The toast only promises an email the server says it sent.
  const celebrate = async (event, { paid = false, emailed = null } = {}) => {
    api.playTicket?.();
    let sent = emailed;
    if (!paid && api.sendEventTicket) {
      const { data } = await api.sendEventTicket(event.id);
      sent = Boolean(data?.sent);
    }
    const lead = paid ? "You're in. Payment confirmed." : "You're in.";
    toast(sent ? `${lead} Your ticket is on its way to your inbox.` : `${lead} See you there.`);
  };

  // D-177: pay for a held seat with Razorpay. The server creates the order (its amount), Checkout takes the payment, the
  // server verifies it and confirms the seat (and emails the ticket). If this page closes mid-payment, Razorpay's
  // webhook confirms it instead. Nothing here can confirm a seat by itself.
  const pay = async (event) => {
    if (state.paying) return;
    state.paying = event.id;
    try {
      if (!api.createPaymentOrder) { toast('Online payment opens soon. Your seat is held for 30 minutes.'); return; }
      const { data: order, error } = await api.createPaymentOrder(event.id);
      if (error) {
        const m = String(error.message || '');
        if (/hold_expired/.test(m)) { toast('Your held seat expired. Reserve again if a spot is still free.'); load(); }
        else if (/not_payable/.test(m)) { toast('This event is no longer taking payments.'); load(); }
        else if (/payments_not_configured/.test(m) || isMissing(error) || error.status === 404) toast('Online payment opens soon. Your seat is held for 30 minutes.');
        else toast('Payment could not start. Try again in a moment.');
        return;
      }
      if (order?.status === 'confirmed') { replaceEvent(withRsvp(event, true, event.wantsCompanion, 'confirmed')); toast("You're already in. See you there."); return; }
      const result = await openCheckout(order);
      if (result.status !== 'paid') {
        toast(result.status === 'failed' ? 'Payment could not open. Check your connection and try again.' : 'Payment not completed. Your seat stays held for 30 minutes.');
        return;
      }
      toast('Confirming your payment…');
      const { data: verified, error: verifyError } = await api.verifyPayment(result.response);
      if (verifyError) { toast("Payment received. We're confirming your seat, and your ticket will arrive by email."); load(); return; }
      if (verified?.status === 'full') { toast('Sorry, the last seat went while you paid. Your payment is being refunded.'); load(); return; }
      replaceEvent(withRsvp(byId(event.id) || event, true, event.wantsCompanion, 'confirmed'));
      await celebrate(event, { paid: true, emailed: Boolean(verified?.ticket?.sent) });
    } finally {
      state.paying = null;
    }
  };

  // "Show interest" (D-125, 0025): on a paid event, no seat and no payment, but the member is in the companion pool.
  // wants: the companion choice, or null to keep it (a new interest takes the page switch's default).
  const changeInterest = async (event, on, wants, { quiet = false } = {}) => {
    const before = event;
    const nextWants = !on ? false : wants === null ? (event.myStatus === 'interested' ? event.wantsCompanion : state.companionDefault) : wants;
    replaceEvent(withInterest(event, on, nextWants));
    const { data, error } = await api.setEventInterest(event.id, on, on ? wants : null);
    if (error) {
      replaceEvent(before);
      const message = String(error.message || '');
      if (isMissing(error)) toast('Showing interest opens soon. You can register or reserve now.');
      else if (/invalid event/.test(message)) { toast('This event is no longer open.'); load(); }
      else toast('That did not save. Try again.');
      return false;
    }
    if (data) {
      if (!data.interested) replaceEvent(withInterest(before, false));
      else if (data.status === 'interested') replaceEvent(withInterest(before, true, data.wants_companion));
      else replaceEvent({ ...before, wantsCompanion: Boolean(data.wants_companion) });   // a seat or a live hold is kept
    }
    const after = byId(event.id);
    if (quiet) return true;
    if (!on) toast('You are no longer interested in this event.');
    else if (before.myStatus !== 'interested') toast(after.wantsCompanion ? "Interest saved. People going who want company can find you now." : 'Interest saved. No seat is held until you reserve.');
    else toast(after.wantsCompanion && !before.wantsCompanion ? "You'll be shown to others going who want company too." : !after.wantsCompanion && before.wantsCompanion ? 'Companion matching is off for this event.' : 'Saved.');
    return true;
  };

  const ownerAction = async (event, kind) => {
    const result = kind === 'cancel' ? await api.cancelMemberEvent(event.id) : await api.deleteMemberEvent(event.id);
    state.confirm = null;
    if (result.error) { renderPanel(); toast(isMissing(result.error) ? 'Events open soon.' : 'That did not work. Try again.'); return; }
    if (kind === 'delete') {
      api.removeEventImages?.(memberId(), [event.imageUrl, ...event.gallery].filter(Boolean));
      if (event.brochureUrl) api.removeEventBrochures?.(memberId(), [event.brochureUrl]);
      state.events = state.events.filter((e) => e.id !== event.id);
      closeSheet();
      renderGrid();
      toast('Event deleted.');
      return;
    }
    replaceEvent({ ...event, status: 'cancelled', going: event.going });
    toast('Event cancelled. People who registered will see it as cancelled.');
    panel.querySelector('#event-detail-title')?.focus();
  };

  const askQuestion = (event) => {
    if (!askDialog || !event.organizer) return;
    askDialog.dataset.eventId = event.id;
    askDialog.querySelector('#event-ask-title').textContent = `Ask ${event.organizer.name}`;
    askDialog.querySelector('#event-ask-error').textContent = '';
    const text = askDialog.querySelector('#event-ask-text');
    text.value = '';
    askDialog.showModal();
    text.focus();
  };

  // "Find my companion" (founder, 2026-11-02): one press finds people going to the same event who want company too.
  // It registers (free event, after one confirm) and opts in as needed, then lists the matches; Connect sends an
  // ordinary request (mutual consent: a connection exists only if they agree). The steps are companionStep's.
  const companionsList = () => dialog.querySelector('#event-companions-list');
  const companionsActions = () => dialog.querySelector('#event-companions-actions');
  const companionsNote = (text, action = '') => {
    companionsList().innerHTML = `<li class="event-companions-note">${text}</li>`;
    companionsActions().innerHTML = action;
  };
  // D-123: with Find a Companion (0023) the matches are swipeable cards in their own view.
  const goSwipe = (event) => {
    if (!openCompanions) { dialog.close(); return false; }
    if (dialog.open) dialog.close();
    closeSheet();
    openCompanions(event.id);
    return true;
  };
  const findCompanion = async (event) => {
    if (!dialog) return;
    dialog.dataset.eventId = event.id;
    dialog.querySelector('#event-companions-title').textContent = 'Find my companion';
    dialog.querySelector('#event-companions-lede').textContent = `${event.title}: meet people going who also want company. Going together needs both of you to connect.`;
    drawerFocus = '[data-event-companions]';
    if (!dialog.open) dialog.showModal();
    const step = companionStep(event);
    if (step === 'host') { companionsNote("You're hosting, so you'll meet everyone there. Members going can find each other here."); return; }
    if (step === 'closed') { companionsNote('This event is full or no longer open, so there is no one new to match with.'); return; }
    if (step === 'interest') {
      companionsNote("No need to pay first. You'll be marked as interested (no seat is held) and shown to others going who want company too. You can withdraw either any time.", '<button type="button" class="event-companion-action is-primary" data-companion-interest>Show interest &amp; find company</button>');
      companionsActions().querySelector('button')?.focus();
      return;
    }
    if (step === 'join') {
      companionsNote("To find company, you'll be registered for this event and shown to others going who want company too. You can cancel either any time.", '<button type="button" class="event-companion-action is-primary" data-companion-join>Register &amp; find company</button>');
      companionsActions().querySelector('button')?.focus();
      return;
    }
    if (step === 'optin') {
      companionsNote('Adding you to the people looking for company…');
      if (!await changeRsvp(event, null, true, { quiet: true })) { companionsNote('That did not save. Try again in a moment.'); return; }
      toast("You're now looking for company at this event.");
    }
    goSwipe(event);
  };

  const onClick = (e) => {
    const t = e.target;
    const cat = t.closest('[data-event-category]');
    if (cat && isEventCategory(cat.dataset.eventCategory)) { state.category = cat.dataset.eventCategory; renderControls(); renderGrid(); return; }
    if (t.closest('#events-nearby')) { state.nearby = !state.nearby; renderControls(); renderGrid(); return; }
    if (t.closest('[data-events-all]')) { state.nearby = false; state.category = 'all'; renderControls(); renderGrid(); return; }
    if (t.closest('[data-events-retry]')) { load(); return; }
    const chip = t.closest('[data-event-companion]');
    // The card's "Find a companion" switch (founder's mockup): on runs Find my companion; off stops looking (the
    // registration stays).
    if (chip) {
      const ev = byId(chip.dataset.eventCompanion);
      if (!ev) return;
      if (ev.wantsCompanion && (ev.going || ev.myStatus === 'interested')) {
        changeRsvp(ev, null, false, { quiet: true }).then((ok) => {
          if (ok) toast(`You stopped looking for company at ${ev.title}.`);
          grid.querySelector(`[data-event-companion="${CSS.escape(ev.id)}"]`)?.focus();
        });
      } else { openSheet(ev.id); findCompanion(ev); }
      return;
    }
    const detail = t.closest('[data-event-open-detail]');
    if (detail) { openSheet(detail.dataset.eventOpenDetail); return; }
    const card = t.closest('.event-card');
    if (card && grid.contains(card) && !t.closest('button:not(.event-open)')) { openSheet(card.dataset.eventId); return; }
    if (t.closest('[data-event-close]')) { closeSheet(); return; }
    const event = byId(state.selectedId);
    if (!event) return;
    if (t.closest('[data-event-going]')) { changeRsvp(event, true, null); return; }
    if (t.closest('[data-event-unregister]')) { changeRsvp(event, false, false); return; }
    if (t.closest('[data-event-pay]')) { void pay(event); return; }
    if (t.closest('[data-event-interest]')) { changeInterest(event, event.myStatus !== 'interested', null); return; }
    const wants = t.closest('[data-event-wants]');
    if (wants && !wants.disabled) { changeRsvp(event, null, !event.wantsCompanion); return; }
    if (t.closest('[data-event-companions]')) { findCompanion(event); return; }
    if (t.closest('[data-event-ask]')) { askQuestion(event); return; }
    if (t.closest('[data-event-edit]')) { closeSheet(); composer?.open(event); return; }
    const confirmKind = t.closest('[data-event-cancel]') ? 'cancel' : t.closest('[data-event-delete]') ? 'delete' : null;
    if (confirmKind) { state.confirm = confirmKind; renderPanel(); panel.querySelector('[data-event-confirm-no]')?.focus(); return; }
    if (t.closest('[data-event-confirm-no]')) { state.confirm = null; renderPanel(); panel.querySelector('[data-event-edit], [data-event-delete]')?.focus(); return; }
    const yes = t.closest('[data-event-confirm-yes]');
    if (yes) { yes.disabled = true; ownerAction(event, yes.dataset.eventConfirmYes); return; }
    if (t.closest('[data-event-share]')) {
      const url = new URL(`/app.html?view=events&event=${encodeURIComponent(event.id)}`, window.location.origin).href;
      const done = () => toast('Event link copied.');
      if (navigator.share) navigator.share({ title: event.title, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(done, () => toast(url));
    }
  };
  [root, panel, backdrop].forEach((el) => el?.addEventListener('click', onClick));

  createButton?.addEventListener('click', () => {
    if (!composer) return;
    composer.open();
  });

  askDialog?.addEventListener('click', (e) => { if (e.target === askDialog || e.target.closest('[data-ask-close]')) askDialog.close(); });
  askDialog?.querySelector('#event-ask-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const event = byId(askDialog.dataset.eventId);
    const text = askDialog.querySelector('#event-ask-text');
    const out = askDialog.querySelector('#event-ask-error');
    const question = text.value.trim();
    if (question.length < 3) { out.textContent = 'Write your question first.'; text.setAttribute('aria-invalid', 'true'); text.focus(); return; }
    text.removeAttribute('aria-invalid');
    if (!event?.organizer) { askDialog.close(); return; }
    const submit = askDialog.querySelector('button[type="submit"]');
    submit.disabled = true;
    const result = await sendHello({ id: event.organizer.id, name: event.organizer.name }, questionNote(event.title, question));
    submit.disabled = false;
    if (result?.error) { out.textContent = 'That did not send. Try again in a moment.'; return; }
    askDialog.close();
    panel.querySelector('[data-event-ask]')?.focus();
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
      const items = [...panel.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Closing the companions dialog over an open drawer puts focus back in the drawer (not on the card behind it). Every
  // close we make goes through closeCompanions (focus moves at once); the close event covers the browser's own Escape.
  let drawerFocus = '[data-event-companions]';
  const focusDrawer = () => {
    if (!panel.classList.contains('is-sheet')) return;
    (panel.querySelector(drawerFocus) || panel.querySelector('[data-event-companions]') || panel.querySelector('#event-detail-title'))?.focus();
  };
  const closeCompanions = (target = '[data-event-companions]') => { drawerFocus = target; if (dialog.open) dialog.close(); focusDrawer(); };
  dialog?.addEventListener('close', focusDrawer);
  dialog?.addEventListener('click', async (e) => {
    if (e.target === dialog || e.target.closest('[data-companions-close]')) { closeCompanions(); return; }
    const event = byId(dialog.dataset.eventId);
    if (!event) return;
    const join = e.target.closest('[data-companion-join]');
    if (join) {
      join.disabled = true;
      companionsNote('Registering you and finding company…');
      if (await changeRsvp(event, true, true, { quiet: true })) { toast("You're registered and looking for company."); goSwipe(event); }
      else findCompanion(byId(event.id) || event);
      return;
    }
    const interest = e.target.closest('[data-companion-interest]');
    if (interest) {
      interest.disabled = true;
      companionsNote('Saving your interest and finding company…');
      if (await changeInterest(event, true, true, { quiet: true })) { toast("You're interested and looking for company."); goSwipe(event); }
      else findCompanion(byId(event.id) || event);
    }
  });

  return {
    // After the composer saves: reload, and (for "View event") open that event.
    refresh: () => load(),
    openEvent: (id) => load().then(() => { if (byId(id)) openSheet(id); }),
    show({ eventId } = {}) {
      if (eventId) state.pendingId = String(eventId);
      renderControls();
      // A shared event link opens its event once the list has it (after sign-in if needed).
      const pick = () => { if (state.pendingId && byId(state.pendingId)) { const id = state.pendingId; state.pendingId = null; openSheet(id); } };
      if (!state.loaded || state.error || state.unavailable) load().then(pick);
      else { renderGrid(); pick(); load(); }
    },
    hide() { closeSheet(); if (dialog?.open) dialog.close(); if (askDialog?.open) askDialog.close(); },
  };
};
