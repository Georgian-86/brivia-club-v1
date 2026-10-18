// Loading skeletons and busy buttons for the member app (Phase C, Task 6). Pure helpers: skeletonMarkup returns a string
// (no DOM, no storage), setBusy touches only the element it is given. The shimmer itself is skeleton.css (.skeleton), and
// the per-kind shapes live in app-shell.css.
//
//   container.innerHTML = skeletonMarkup('list', 4); container.setAttribute('aria-busy', 'true');
//   setBusy(submitButton, true); try { await save(); } finally { setBusy(submitButton, false); }

const KINDS = ['deck', 'list', 'posts', 'chips'];
const MAX_BLOCKS = 12;

// A decorative placeholder: the group is aria-hidden, so the caller announces loading (aria-busy on the container, and a
// status line where one helps). `deck` is always one card; other kinds draw `count` blocks (1..12).
export const skeletonMarkup = (kind, count = 3) => {
  const shape = KINDS.includes(kind) ? kind : 'list';
  const n = shape === 'deck' ? 1 : Math.min(MAX_BLOCKS, Math.max(1, Math.floor(Number(count)) || 1));
  const block = `<div class="skeleton skeleton-${shape}"></div>`;
  return `<div class="skeleton-group skeleton-group-${shape}" aria-hidden="true">${block.repeat(n)}</div>`;
};

// What a button looked like before setBusy(el, true): restored by setBusy(el, false).
const before = new WeakMap();

// Busy: aria-busy="true", disabled, and min-width pinned to the current width so a shorter label cannot shrink it.
// Not busy: both attributes and the min-width go back to what they were.
export const setBusy = (el, busy) => {
  if (!el) return;
  if (busy) {
    if (!before.has(el)) before.set(el, { disabled: Boolean(el.disabled), minWidth: el.style?.minWidth || '' });
    const width = el.getBoundingClientRect?.().width;
    if (el.style && width) el.style.minWidth = `${width}px`;
    el.setAttribute('aria-busy', 'true');
    el.disabled = true;
    return;
  }
  const saved = before.get(el) || { disabled: false, minWidth: '' };
  before.delete(el);
  el.removeAttribute('aria-busy');
  el.disabled = saved.disabled;
  if (el.style) el.style.minWidth = saved.minWidth;
};
