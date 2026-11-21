// D-277: a floating down-arrow in an open chat (like WhatsApp's). It appears once the member has scrolled up from the
// latest message, carries a count of messages that arrived while they were up there, and one tap brings the thread
// back to the latest message. It hides itself again at the bottom.

export const SHOW_AFTER_PX = 240;   // further than this from the latest message shows the button
export const AT_BOTTOM_PX = 80;     // the same "near the bottom" the thread uses to stay pinned

export const distanceFromBottom = (el) => Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);

// How the unread count moves. `seen` is the count of their messages already accounted for in this chat.
export const nextUnread = ({ chatId, theirCount, nearBottom }, state) => {
  if (state.chatId !== chatId) return { chatId, seen: theirCount, unread: 0 };
  if (nearBottom) return { chatId, seen: theirCount, unread: 0 };
  const added = Math.max(0, theirCount - state.seen);
  return { chatId, seen: theirCount, unread: state.unread + added };
};

export const badgeText = (n) => (n > 99 ? '99+' : String(n));

export const createChatJump = ({ thread, host, doc = globalThis.document, win = globalThis.window }) => {
  if (!thread || !host) return null;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'chat-jump';
  button.hidden = true;
  button.setAttribute('aria-label', 'Jump to the latest message');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5 12 15.5 18 9.5"/></svg><b class="chat-jump-count" hidden></b>';
  host.append(button);
  const count = button.querySelector('.chat-jump-count');
  let state = { chatId: null, seen: 0, unread: 0 };

  // Sits on the thread's lower right corner, above the composer, whatever the composer's height is right now.
  // D-279: scrolling runs this at most once a frame, reads layout first, and writes only what changed (writing the
  // style on every scroll event made iPhone scrolling stutter in long threads).
  const last = { bottom: '', hidden: true, unread: -1 };
  const paintNow = () => {
    const dist = distanceFromBottom(thread);
    const away = dist > SHOW_AFTER_PX;
    if (!away && dist < AT_BOTTOM_PX) state = { ...state, unread: 0 };
    const show = away || (state.unread > 0 && dist >= AT_BOTTOM_PX);
    const bottom = show ? `${Math.max(0, host.clientHeight - (thread.offsetTop + thread.clientHeight)) + 14}px` : last.bottom;
    if (bottom !== last.bottom) { button.style.bottom = bottom; last.bottom = bottom; }
    if (!show !== last.hidden) { button.hidden = !show; last.hidden = !show; }
    if (state.unread !== last.unread) {
      last.unread = state.unread;
      count.hidden = !state.unread;
      count.textContent = badgeText(state.unread);
      button.setAttribute('aria-label', state.unread ? `Jump to the latest message, ${state.unread} new` : 'Jump to the latest message');
    }
  };
  let frame = 0;
  const paint = () => {
    if (frame) return;
    frame = (win?.requestAnimationFrame || ((fn) => setTimeout(fn, 16)))(() => { frame = 0; paintNow(); });
  };
  const reduce = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  button.addEventListener('click', () => {
    state = { ...state, unread: 0 };
    thread.scrollTo({ top: thread.scrollHeight, behavior: reduce() ? 'auto' : 'smooth' });
    paintNow();
  });
  thread.addEventListener('scroll', paint, { passive: true });
  if ('ResizeObserver' in (win || {})) new win.ResizeObserver(paint).observe(thread);

  // After each render of the open chat: count what arrived while the member was scrolled up.
  const sync = (chatId, theirCount) => {
    state = nextUnread({ chatId: String(chatId ?? ''), theirCount, nearBottom: distanceFromBottom(thread) < AT_BOTTOM_PX }, state);
    paintNow();
  };
  return { button, sync, paint };
};
