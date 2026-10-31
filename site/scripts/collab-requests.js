// "See who wants to collaborate with you" (D-108). Incoming connection requests are reviewed one card at a time in a
// sheet (a native modal <dialog>: focus stays inside, Escape closes). The card is the only control the eye sees
// (founder, 2026-10-31: no Connect / Not now pills): a right drag or ArrowRight accepts, a left drag or ArrowLeft
// declines quietly (the sender is never told). Keyboard and screen-reader users also get two buttons that stay
// visually hidden until one of them has focus. The motion is the deck's (deck-swipe.js); stamps read CONNECT and
// NOT NOW. Wording rule: collaborate, connect, not now, request; never dating-app words.
import { createDeckSwipe } from './deck-swipe.js';

const SHARED_MAX = 3;
const initialsOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'B';
const clean = (list) => (Array.isArray(list) ? list.map((x) => String(x || '').trim()).filter(Boolean) : []);

// The panel's one-line summary: up to three faces and "N people want to connect"; null when there is nothing to review.
export const collabSummary = (requests = []) => {
  if (!requests.length) return null;
  const n = requests.length;
  return { avatars: requests.slice(0, 3).map((r) => r.person || { name: 'A Brivia member' }), text: n === 1 ? '1 person wants to connect' : `${n} people want to connect` };
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
    initials: initialsOf(name),
  };
};

export const keyDecision = (key) => (key === 'ArrowRight' ? true : key === 'ArrowLeft' ? false : null);

const ICON = {
  connect: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  later: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>',
};
const DOTS_MAX = 8;

// The card, then the drag cue, the progress dots and the keyboard-only actions under it. The card itself takes focus
// (ArrowLeft / ArrowRight decide); the cue row and the dots are decorative, the "1 of N" counter is the position.
export const reviewCardMarkup = (m, { index, total }, { escapeHtml, renderAvatar }) => {
  const meta = [m.role, m.band].filter(Boolean).map(escapeHtml).join('<span aria-hidden="true"> · </span>');
  const dots = total > 1 && total <= DOTS_MAX
    ? `<ol class="collab-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<li${i === index ? ' class="is-current"' : i < index ? ' class="is-done"' : ''}></li>`).join('')}</ol>`
    : '';
  return `<article class="collab-card" data-collab-card data-from="${escapeHtml(m.fromId)}" tabindex="0" aria-roledescription="request card" aria-label="Request from ${escapeHtml(m.name)}" aria-describedby="collab-review-keys">`
    + '<span class="collab-stamp collab-stamp--connect" aria-hidden="true">CONNECT</span><span class="collab-stamp collab-stamp--later" aria-hidden="true">NOT NOW</span>'
    + `<p class="collab-count">${index + 1} of ${total}</p>`
    + `<div class="collab-portrait">${renderAvatar(m.person || { name: m.name }, 'collab-avatar')}</div>`
    + `<h3 class="collab-name">${escapeHtml(m.name)}</h3>`
    + (meta ? `<p class="collab-meta">${meta}</p>` : '')
    + (m.shared.length ? `<p class="collab-label">You both care about</p><ul class="collab-shared">${m.shared.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '')
    + (m.note ? `<figure class="collab-note"><figcaption class="collab-label">Their note</figcaption><blockquote class="collab-note-text">${escapeHtml(m.note)}</blockquote></figure>` : '')
    + '</article>'
    + '<div class="collab-under">'
    + `<div class="collab-cue" aria-hidden="true"><span class="collab-cue-side collab-cue-side--later">${ICON.left}Not now</span>`
    + '<span class="collab-cue-mid">Drag the card</span>'
    + `<span class="collab-cue-side collab-cue-side--connect">Connect${ICON.right}</span></div>`
    + dots
    + '<div class="collab-keys" data-collab-keys>'
    + `<button type="button" class="collab-key" data-collab-decide="later">${ICON.later}<span>Not now</span></button>`
    + `<button type="button" class="collab-key" data-collab-decide="connect">${ICON.connect}<span>Connect</span></button>`
    + '</div></div>';
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
    + '<p class="collab-sr" id="collab-review-keys" data-collab-hint>Drag the card, or use the arrow keys: right to connect, left for not now.</p>'
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
    // The cue, dots and keys sit outside the dragged card, so move them below the stack. The stack shows the cards
    // still waiting underneath (up to two) so the pile reads as something to work through.
    body.append(body.querySelector('.collab-under'));
    body.querySelector('[data-collab-stack]').dataset.behind = String(Math.min(2, queue.length - index - 1));
    swipe = createDeckSwipe({ card, stack: body.querySelector('[data-collab-stack]'), canDrag: () => !busy, onCommit: (direction) => { decide(direction === 'pitch', { dragged: true }); } });
  };
  const connected = (m) => {
    swipe = null;
    hint.hidden = true;
    const more = index + 1 < queue.length;
    // A sender whose profile did not load has no first name to use and no chat to open from here.
    const first = m.person ? m.name.split(' ')[0] : '';
    body.innerHTML = `<div class="collab-state">${renderAvatar(m.person || { name: m.name }, 'collab-avatar')}`
      + `<h3>You're connected.</h3><p>${first ? `You and ${escapeHtml(first)} can now message each other.` : 'You can now message each other from Chat.'}</p>`
      + `<div class="collab-actions${first ? '' : ' collab-actions--single'}">`
      + `<button type="button" class="collab-button collab-button--${first ? 'later' : 'connect'}" data-collab-next>${more ? 'Next request' : 'Done'}</button>`
      + (first ? `<button type="button" class="collab-button collab-button--connect" data-collab-message>Message ${escapeHtml(first)}</button>` : '')
      + '</div></div>';
    body.querySelector('[data-collab-message]')?.addEventListener('click', () => { closeReason = 'message'; close(); onMessage(m.fromId); });
    body.querySelector('[data-collab-next]').addEventListener('click', () => { index += 1; show(); focusCurrent(); });
    (body.querySelector('[data-collab-message]') || body.querySelector('[data-collab-next]')).focus();
  };
  async function decide(accept, { dragged = false } = {}) {
    if (busy || !swipe || index >= queue.length) return;
    busy = true;
    const m = reviewCardModel(queue[index], myInterests);
    const buttons = [...body.querySelectorAll('[data-collab-decide]')];
    const from = document.activeElement;
    buttons.forEach((b) => { b.disabled = true; });
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
      buttons.forEach((b) => { b.disabled = false; });
      // Focus goes back where it was: the key that was pressed, else the card.
      (buttons.includes(from) ? from : body.querySelector('[data-collab-card]'))?.focus();
      return;
    }
    if (accept && result.connected) { connected(m); return; }
    index += 1;
    show();
    focusCurrent();
  }
  const focusCurrent = () => body.querySelector('[data-collab-card], [data-collab-close]')?.focus();
  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) { close(); return; }  // the backdrop
    if (event.target.closest('[data-collab-close]')) { close(); return; }
    const decision = event.target.closest('[data-collab-decide]')?.dataset.collabDecide;
    if (decision) decide(decision === 'connect');
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
  focusCurrent();
  return { close };
};
