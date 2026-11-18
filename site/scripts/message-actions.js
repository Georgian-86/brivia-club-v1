// Reply (D-191, migration 0055), edit, unsend and delete for me (D-157, migration 0046). A long press on a chat bubble
// (or right-click, or the context-menu key / Shift+F10 on a focused bubble) opens a small menu next to it:
//   Reply                any message that is still there: the next message I send quotes it
//   Copy                 any message with text
//   Download             a photo, video or file sent in the chat (chat-download.js)
//   Edit                 my own plain text message, within 15 minutes, not unsent (the server checks the same)
//   Unsend               my own message, any time: it goes for both of us ("This message was unsent")
//   Delete for me        any message: it leaves my view only
// Unsend and Delete for me ask once, inside the same menu. The rules are pure and unit-tested; the menu is the only DOM.

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

export const unsentLabel = (from) => (from === 'me' ? 'You unsent a message' : 'This message was unsent');

import { canDownloadAttachment } from './chat-download.js';

const isServerId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

// special: the bubble is a card (shared area, shared post, resume), not plain text.
export const canEditMessage = (message, { now = Date.now(), special = false } = {}) => {
  if (!message || message.from !== 'me' || message.unsentAt || message.attachment || special) return false;
  if (!String(message.text || '').trim() || !isServerId(message.id)) return false;
  const sent = Date.parse(message.createdAt || '');
  return Number.isFinite(sent) && now - sent < EDIT_WINDOW_MS;
};

export const messageActions = (message, { now = Date.now(), special = false } = {}) => {
  if (!message || !isServerId(message.id)) return [];
  const actions = [];
  if (!message.unsentAt) actions.push('reply');
  if (!message.unsentAt && !special && String(message.text || '').trim()) actions.push('copy');
  if (!message.unsentAt && canDownloadAttachment(message.attachment)) actions.push('download');
  if (canEditMessage(message, { now, special })) actions.push('edit');
  if (message.from === 'me' && !message.unsentAt) actions.push('unsend');
  actions.push('delete');
  return actions;
};

// An UPDATE from Realtime (an edit or an unsend, by either member) applied to a thread. Returns the same array when
// nothing changed, so callers can skip a render.
export const applyMessageUpdate = (messages, row) => {
  if (!Array.isArray(messages) || !row?.id) return messages;
  const index = messages.findIndex((m) => String(m.id) === String(row.id));
  if (index < 0) return messages;
  const current = messages[index];
  const unsentAt = row.unsent_at || current.unsentAt || '';
  const editedAt = unsentAt ? '' : (row.edited_at || current.editedAt || '');
  const text = unsentAt ? '' : (typeof row.body === 'string' ? row.body : current.text);
  const attachment = unsentAt ? null : current.attachment;
  if (unsentAt === (current.unsentAt || '') && editedAt === (current.editedAt || '') && text === current.text && attachment === current.attachment) return messages;
  const next = messages.slice();
  next[index] = { ...current, text, editedAt, unsentAt, attachment };
  return next;
};

// D-191: what a reply's quote shows, from the thread I already hold (never a server read: a message I cannot see, or
// deleted for me, quotes as unavailable). kindLabel(message) names a card or a file ("Photo", "Shared area").
export const QUOTE_MAX = 90;
export const replyQuote = (thread, replyToId, { themName = 'Them', kindLabel = () => '' } = {}) => {
  if (!replyToId) return null;
  const target = (Array.isArray(thread) ? thread : []).find((m) => String(m.id) === String(replyToId));
  if (!target) return { id: String(replyToId), who: '', text: 'Original message unavailable', missing: true };
  const who = target.from === 'me' ? 'You' : String(themName || 'Them').split(/\s+/)[0];
  if (target.unsentAt) return { id: String(target.id), who, text: unsentLabel(target.from), unsent: true };
  const words = String(target.text || '').replace(/\s+/g, ' ').trim();
  const label = kindLabel(target);
  const body = label && !words ? label : label && words && label !== words ? `${label} · ${words}` : words || label || 'Message';
  return { id: String(target.id), who, text: body.length > QUOTE_MAX ? `${body.slice(0, QUOTE_MAX - 1).trimEnd()}…` : body };
};

// The inbox row's last line for an unsent message.
export const previewForUnsent = (message) => (message?.unsentAt ? unsentLabel(message.from) : null);

const LABELS = { reply: 'Reply', copy: 'Copy', download: 'Download', edit: 'Edit', unsend: 'Unsend', delete: 'Delete for me' };
const CONFIRM = {
  unsend: { title: 'Unsend for everyone?', copy: 'It will be removed for both of you.', action: 'Unsend' },
  delete: { title: 'Delete for you?', copy: 'It stays in their chat.', action: 'Delete' },
};
const ICONS = {
  reply: '<path d="M9 15 4 10l5-5"/><path d="M4 10h9a7 7 0 0 1 7 7v2"/>',
  copy: '<path d="M8 8h9v11H8z"/><path d="M5 15V5h9"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  unsend: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  delete: '<path d="M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
};

// container: the #chat-messages element. getMessage(id) -> { message, special } | null. onAction(action, message)
// returns a promise; the menu closes before it runs.
// D-244: `reactions` { quick: () => [emoji], canReact(message) } puts a row of quick reactions and a "+" (every emoji)
// above the actions; a press calls onAction('react', message, emoji) or onAction('react-more', message, bubble).
export const createMessageMenu = ({ container, getMessage, onAction, reactions = null, now = () => Date.now() }) => {
  if (!container) return { close() {} };
  let menu = null;
  let anchor = null;
  let press = null;
  let suppressClick = false;

  const close = ({ refocus = false } = {}) => {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', onResize);
    container.removeEventListener('scroll', onResize);
    const bubble = anchor;
    anchor = null;
    bubble?.classList.remove('is-menu-open');
    if (refocus) bubble?.focus({ preventScroll: true });
  };
  const outside = (event) => { if (menu && !menu.contains(event.target)) close(); };
  const onResize = () => close();

  const items = () => [...(menu?.querySelectorAll('[role="menuitem"]') || [])];
  const place = () => {
    if (!menu || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const gutter = 12;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + 8;
    if (top + box.height > vh - gutter) top = Math.max(gutter, rect.top - box.height - 8);
    const mine = anchor.classList.contains('me');
    let left = mine ? rect.right - box.width : rect.left;
    left = Math.min(Math.max(gutter, left), vw - box.width - gutter);
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  };

  const reactRow = (message) => {
    if (!reactions || !reactions.canReact(message)) return '';
    const quick = reactions.quick().map((e) => `<button type="button" role="menuitem" class="message-react" data-message-react="${e}" aria-label="React ${e}">${e}</button>`).join('');
    return `<div class="message-menu-reacts" role="group" aria-label="React">${quick}<button type="button" role="menuitem" class="message-react is-more" data-message-react-more aria-label="More reactions"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button></div>`;
  };
  const renderList = (actions, message) => {
    menu.innerHTML = reactRow(message) + actions.map((a) => `<button type="button" role="menuitem" class="message-menu-item${a === 'delete' || a === 'unsend' ? ' is-danger' : ''}" data-message-action="${a}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[a]}</svg><span>${LABELS[a]}</span></button>`).join('');
  };
  const renderConfirm = (action) => {
    const c = CONFIRM[action];
    menu.innerHTML = `<p class="message-menu-title" id="message-menu-title">${c.title}</p><p class="message-menu-copy">${c.copy}</p>`
      + `<div class="message-menu-confirm"><button type="button" role="menuitem" class="message-menu-item" data-message-cancel>Cancel</button>`
      + `<button type="button" role="menuitem" class="message-menu-item is-danger is-strong" data-message-confirm="${action}">${c.action}</button></div>`;
    menu.setAttribute('aria-labelledby', 'message-menu-title');
    place();
    menu.querySelector('[data-message-confirm]')?.focus();
  };

  const open = (bubble) => {
    const id = bubble?.dataset.messageId;
    const found = id ? getMessage(id) : null;
    if (!found?.message) return;
    const actions = messageActions(found.message, { now: now(), special: found.special });
    if (!actions.length) return;
    close();
    anchor = bubble;
    bubble.classList.add('is-menu-open');
    menu = document.createElement('div');
    menu.className = 'message-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Message options');
    renderList(actions, found.message);
    document.body.append(menu);
    place();
    (menu.querySelector('.message-menu-item') || items()[0])?.focus({ preventScroll: true });   // D-244: the first action, not the first reaction
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', onResize);
    container.addEventListener('scroll', onResize, { passive: true });

    menu.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-message-cancel')) { close({ refocus: true }); return; }
      if (button.dataset.messageReact) { close({ refocus: true }); void onAction('react', found.message, button.dataset.messageReact); return; }
      if (button.hasAttribute('data-message-react-more')) { const at = anchor; close(); void onAction('react-more', found.message, at); return; }
      const action = button.dataset.messageConfirm || button.dataset.messageAction;
      if (!action) return;
      if (!button.dataset.messageConfirm && CONFIRM[action]) { renderConfirm(action); return; }
      const message = found.message;
      close({ refocus: action !== 'edit' && action !== 'reply' && action !== 'delete' && action !== 'unsend' });
      void onAction(action, message);
    });
    menu.addEventListener('keydown', (event) => {
      const list = items();
      const at = list.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close({ refocus: true }); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); list[(at + 1) % list.length]?.focus(); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
      else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); list.at(-1)?.focus(); }
      else if (event.key === 'Tab') close();
    });
  };

  const bubbleFrom = (target) => (target instanceof Element ? target.closest('.message[data-message-id]') : null);
  const cancelPress = () => { if (press) { window.clearTimeout(press.timer); press = null; } };

  container.addEventListener('pointerdown', (event) => {
    suppressClick = false;   // a long press that ended without a click (common on touch) must not eat the next tap
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const bubble = bubbleFrom(event.target);
    if (!bubble) return;
    cancelPress();
    press = { x: event.clientX, y: event.clientY, bubble, timer: window.setTimeout(() => {
      press = null;
      suppressClick = true;
      navigator.vibrate?.(12);
      open(bubble);
    }, LONG_PRESS_MS) };
  });
  container.addEventListener('pointermove', (event) => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE_PX) cancelPress();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => container.addEventListener(type, cancelPress));
  // The click that ends a long press must not also open a link or attachment inside the bubble.
  container.addEventListener('click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    if (bubbleFrom(event.target)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  // Right-click on desktop, and Android's long-press context menu, open ours instead.
  container.addEventListener('contextmenu', (event) => {
    const bubble = bubbleFrom(event.target);
    if (!bubble) return;
    event.preventDefault();
    cancelPress();
    if (!menu || anchor !== bubble) open(bubble);
  });
  container.addEventListener('keydown', (event) => {
    const bubble = bubbleFrom(event.target);
    if (!bubble || event.target !== bubble) return;
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey) || event.key === 'Enter') {
      event.preventDefault();
      open(bubble);
    }
  });

  return { close, open };
};
