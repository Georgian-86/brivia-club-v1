// "See who wants to collaborate with you" (D-108). Incoming connection requests are reviewed one card at a time in a
// sheet (a native modal <dialog>: focus stays inside, Escape closes). Right drag or Accept accepts, left drag or Decline (D-124; was Connect / Not
// now declines quietly (the sender is never told). The motion is the deck's (deck-swipe.js); stamps read CONNECT and
// NOT NOW. Wording rule: collaborate, connect, not now, request; never dating-app words.
import { createDeckSwipe } from './deck-swipe.js';

const SHARED_MAX = 3;
const initialsOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'B';
const clean = (list) => (Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean) : []);

// The panel's one-line summary: up to three faces and "N people want to connect"; null when there is nothing to review.
// D-131: a request sent from Nearby says so ("Someone nearby wants to connect with you").
export const collabSummary = (requests = []) => {
  if (!requests.length) return null;
  const n = requests.length;
  const nearby = requests.filter((r) => r?.via === 'nearby').length;
  let text = n === 1 ? '1 person wants to connect' : `${n} people want to connect`;
  if (n === 1 && nearby) text = 'Someone nearby wants to connect with you';
  else if (nearby) text += ` · ${nearby} nearby`;
  return { avatars: requests.slice(0, 3).map((r) => r.person || { name: 'A Brivia member' }), text };
};

// What one card shows. A sender whose profile did not load still gets a full card. Shared interests: the server's
// list when the card came from a candidate RPC, else the overlap of their tags with mine (case-insensitive).
export const reviewCardModel = (request, myInterests = []) => {
  const person = request?.person || null;
  const name = String(person?.name || '').trim() || 'A Brivia member';
  const mine = new Set(clean(myInterests).map((x) => x.toLowerCase()));
  const server = clean(person?.shared);
  const shared = (server.length ? server : clean(person?.tags).filter((t) => mine.has(t.toLowerCase()))).slice(0, SHARED_MAX);
  return {
    fromId: String(request?.fromId || ''),
    person,
    name,
    role: person ? String(person.role || '').trim() : '',
    band: person ? String(person.distanceBand || '').trim() : '',
    shared,
    note: String(request?.note || '').trim(),
    nearby: request?.via === 'nearby',
    askingAbout: String(request?.role || '').trim(),  // D-137: the role a seeker asked about
    initials: initialsOf(name),
  };
};

export const keyDecision = (key) => (key === 'ArrowRight' ? true : key === 'ArrowLeft' ? false : null);

const ICON = {
  connect: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  later: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  bag: '<svg class="hiring-bag" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/></svg>',
};

export const reviewCardMarkup = (m, { index, total }, { escapeHtml, renderAvatar }) => {
  const meta = [m.role, m.band].filter(Boolean).map(escapeHtml).join('<span aria-hidden="true"> · </span>');
  // D-132: no Accept / Decline buttons. The card is the control: drag right accepts, left declines; focused, the arrow
  // keys do the same (→ accept, ← decline), so keyboard and screen-reader members can still answer.
  return `<article class="collab-card" data-collab-card data-from="${escapeHtml(m.fromId)}" tabindex="0" aria-roledescription="request card" aria-keyshortcuts="ArrowRight ArrowLeft" aria-describedby="collab-gesture" aria-label="Request from ${escapeHtml(m.name)}">`
    + '<span class="collab-stamp collab-stamp--connect" aria-hidden="true">ACCEPT</span><span class="collab-stamp collab-stamp--later" aria-hidden="true">DECLINE</span>'
    + `<p class="collab-count">${index + 1} of ${total}</p>`
    + `${renderAvatar(m.person || { name: m.name }, 'collab-avatar')}`
    + `<h3 class="collab-name">${escapeHtml(m.name)}</h3>`
    + (meta ? `<p class="collab-meta">${meta}</p>` : '')
    + (m.nearby ? '<p class="collab-nearby">Crossed paths nearby</p>' : '')
    + (m.askingAbout ? `<p class="collab-role"><span class="hiring-icon">${ICON.bag}</span>Asking about: ${escapeHtml(m.askingAbout)}</p>` : '')
    // D-124: their message first, in full: it is why they want to connect (and the first message of your chat if you accept).
    + (m.note ? `<blockquote class="collab-note"><p class="collab-label">Their message</p><p class="collab-note-text">${escapeHtml(m.note)}</p></blockquote>` : '<p class="collab-note-empty">No message, just a hello.</p>')
    + (m.shared.length ? `<p class="collab-label">You both care about</p><ul class="collab-shared">${m.shared.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '')
    + '</article>';
};

// The sheet. respond(fromId, accept) resolves { ok, connected }; onMessage(fromId) opens the chat; onClose(reason) runs
// once ('message' when Message closed it).
export const openCollabReview = ({ requests, respond, onMessage, onClose = () => {}, myInterests = [], escapeHtml, renderAvatar }) => {
  const queue = requests.slice();
  const total = queue.length;
  let index = 0;
  let busy = false;
  let swipe = null;
  let closeReason = '';
  const dialog = document.createElement('dialog');
  dialog.className = 'collab-review';
  dialog.setAttribute('aria-labelledby', 'collab-review-title');
  dialog.innerHTML = '<div class="collab-panel">'
    + '<div class="collab-head"><p class="collab-eyebrow">Collaboration requests</p><h2 id="collab-review-title">See who wants to collaborate with you</h2>'
    + '<button type="button" class="collab-close" data-collab-close aria-label="Close">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>'
    + '<div class="collab-body" data-collab-body aria-live="polite"></div>'
    // The gesture cue (labels, not buttons): which way declines, which way accepts.
    + `<div class="collab-gesture" data-collab-hint><span class="collab-gesture-side collab-gesture-side--later">${ICON.later}<span>Decline</span></span>`
    + '<p class="collab-hint" id="collab-gesture"><span class="collab-hint-touch">Drag the card: right to accept, left to decline.</span><span class="collab-hint-keys">Drag the card, or press → to accept and ← to decline.</span></p>'
    + `<span class="collab-gesture-side collab-gesture-side--connect"><span>Accept</span>${ICON.connect}</span></div>`
    + '</div>';
  document.body.append(dialog);
  const body = dialog.querySelector('[data-collab-body]');
  const hint = dialog.querySelector('[data-collab-hint]');

  const allDone = () => {
    swipe = null;
    hint.hidden = true;
    body.innerHTML = '<div class="collab-state"><span class="collab-state-mark" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span>'
      + "<h3>You're all caught up.</h3><p>New requests will show up here.</p>"
      + '<button type="button" class="collab-button collab-button--connect" data-collab-close>Done</button></div>';
    body.querySelector('[data-collab-close]').focus();
  };
  const show = () => {
    if (index >= queue.length) { allDone(); return; }
    hint.hidden = false;
    const m = reviewCardModel(queue[index], myInterests);
    body.innerHTML = `<div class="collab-stack" data-collab-stack>${reviewCardMarkup(m, { index, total }, { escapeHtml, renderAvatar })}</div>`;
    const card = body.querySelector('[data-collab-card]');
    swipe = createDeckSwipe({ card, stack: body.querySelector('[data-collab-stack]'), canDrag: () => !busy, onCommit: (direction) => { decide(direction === 'pitch', { dragged: true }); } });
  };
  const connected = (m) => {
    swipe = null;
    hint.hidden = true;
    const more = index + 1 < queue.length;
    // A sender whose profile did not load has no first name to use and no chat to open from here.
    const first = m.person ? m.name.split(' ')[0] : '';
    body.innerHTML = `<div class="collab-state">${renderAvatar(m.person || { name: m.name }, 'collab-avatar')}`
      + `<h3>You're connected.</h3><p>${m.note ? `Their message is the first one in your chat${first ? ` with ${escapeHtml(first)}` : ''}. Reply whenever you're ready.` : first ? `You and ${escapeHtml(first)} can now message each other.` : 'You can now message each other from Chat.'}</p>`
      + `<div class="collab-actions${first ? '' : ' collab-actions--single'}">`
      + `<button type="button" class="collab-button collab-button--${first ? 'later' : 'connect'}" data-collab-next>${more ? 'Next request' : 'Done'}</button>`
      + (first ? `<button type="button" class="collab-button collab-button--connect" data-collab-message>${m.note ? 'Reply' : 'Message'} ${escapeHtml(first)}</button>` : '')
      + '</div></div>';
    body.querySelector('[data-collab-message]')?.addEventListener('click', () => { closeReason = 'message'; close(); onMessage(m.fromId); });
    body.querySelector('[data-collab-next]').addEventListener('click', () => { index += 1; show(); body.querySelector('[data-collab-card], [data-collab-close]')?.focus(); });
    (body.querySelector('[data-collab-message]') || body.querySelector('[data-collab-next]')).focus();
  };
  async function decide(accept, { dragged = false } = {}) {
    if (busy || !swipe || index >= queue.length) return;
    busy = true;
    const m = reviewCardModel(queue[index], myInterests);
    const current = swipe;
    let result = null;
    try {
      [result] = await Promise.all([respond(m.fromId, accept), current.flyOut(accept ? 'pitch' : 'pass', dragged ? {} : { duration: 280 })]);
    } catch (error) {
      console.warn('A request could not be answered:', error?.message);  // treated as a failure: the card comes back
    } finally {
      busy = false;
    }
    if (!dialog.open) return;
    if (!result?.ok) {
      // The request is still pending: the card comes back, ready for another try (the caller showed the toast).
      current.reset();
      body.querySelector('[data-collab-card]')?.focus();
      return;
    }
    if (accept && result.connected) { connected(m); return; }
    index += 1;
    show();
    body.querySelector('[data-collab-card], [data-collab-close]')?.focus();
  }
  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) { close(); return; }  // the backdrop
    if (event.target.closest('[data-collab-close]')) close();
  });
  dialog.addEventListener('keydown', (event) => {
    const accept = keyDecision(event.key);
    if (accept === null || !swipe || event.target.closest?.('input, textarea')) return;
    event.preventDefault();
    decide(accept);
  });
  dialog.addEventListener('close', () => { dialog.remove(); onClose(closeReason); }, { once: true });
  dialog.showModal();
  show();
  body.querySelector('[data-collab-card]')?.focus();
  return { close };
};
