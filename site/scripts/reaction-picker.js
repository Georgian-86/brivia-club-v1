// D-244: the "+" in a message's reaction row opens every emoji (search, Unicode's nine groups, the skin tone row) in a
// small card next to the bubble. A press picks one and closes; Escape or a press outside closes; focus returns to the
// bubble. Looks: emoji-field.css (the same panel as the bio and Notes pickers) plus .reaction-picker in message-actions.css.
import { chatEmojiCategories, EMOJI_TABS } from './chat-emoji-data.js';
import { searchEmoji } from './emoji-search.js';
import { TONES, getTone, setTone, withTone } from './emoji-tone.js';

let current = null;
export const closeReactionPicker = ({ refocus = false } = {}) => {
  if (!current) return;
  const { panel, anchor, cleanup } = current;
  current = null;
  cleanup();
  panel.remove();
  if (refocus) anchor?.focus?.({ preventScroll: true });
};

// D-274: the picker's contents (search, tabs, skin tones, the grid), mounted into any element: the message menu shows
// them in place when "+" is pressed (a second floating card did not appear in Safari), and openReactionPicker below
// wraps them in their own card for other callers. Returns the search box.
export const mountEmojiPicker = (host, { onPick }) => {
  host.innerHTML = `<div class="reaction-picker" role="group" aria-label="React with any emoji"><label class="emoji-field-search"><span class="sr-only">Search emoji</span><input type="search" placeholder="Search emoji (chess, cry…)" autocomplete="off" spellcheck="false" data-emoji-search /></label>
    <div class="emoji-field-tabs" role="tablist" aria-label="Emoji categories">${EMOJI_TABS.map(([key, name], i) => `<button type="button" role="tab" data-emoji-tab="${key}" aria-selected="${i === 0}">${name}</button>`).join('')}</div>
    <div class="emoji-field-tones" role="radiogroup" aria-label="Skin tone"><span class="emoji-field-tones-label" aria-hidden="true">Skin tone</span>${TONES.map((t) => `<button type="button" role="radio" class="emoji-field-tone" data-emoji-tone="${t.key}" aria-label="${t.label} skin tone" aria-checked="false">${withTone('✋', t.key)}</button>`).join('')}</div>
    <div class="emoji-field-grid" role="tabpanel"></div></div>`;
  const root = host.querySelector('.reaction-picker');
  const grid = root.querySelector('.emoji-field-grid');
  const search = root.querySelector('[data-emoji-search]');
  let tab = 'smileys';
  const render = (key) => {
    tab = key;
    const tone = getTone();
    root.querySelectorAll('[data-emoji-tone]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.emojiTone === tone)));
    const list = key === '__search' ? searchEmoji(search.value) : (chatEmojiCategories[key] || chatEmojiCategories.smileys);
    grid.innerHTML = list.length ? [...new Set(list.map((raw) => withTone(raw, tone)))].map((e) => `<button type="button" class="emoji-field-emoji" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('') : '<p class="emoji-field-none">No emoji found.</p>';
    root.querySelectorAll('[data-emoji-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.emojiTab === key)));
  };
  render('smileys');
  root.querySelector('.emoji-field-tabs').addEventListener('click', (event) => { const t = event.target.closest('[data-emoji-tab]'); if (t) { search.value = ''; render(t.dataset.emojiTab); } });
  search.addEventListener('input', () => render(search.value.trim() ? '__search' : 'smileys'));
  root.querySelector('.emoji-field-tones').addEventListener('click', (event) => { const t = event.target.closest('[data-emoji-tone]'); if (t) { setTone(t.dataset.emojiTone); render(tab); } });
  grid.addEventListener('click', (event) => {
    const b = event.target.closest('.emoji-field-emoji');
    if (b) onPick(b.dataset.emoji);
  });
  return search;
};

export const openReactionPicker = ({ anchor, onPick }) => {
  closeReactionPicker();
  const panel = document.createElement('div');
  panel.className = 'emoji-field-panel reaction-picker-card';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'React with any emoji');
  document.body.append(panel);
  const search = mountEmojiPicker(panel, { onPick: (emoji) => { closeReactionPicker({ refocus: true }); onPick(emoji); } });
  const place = () => {
    const gutter = 12;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(360, vw - gutter * 2);
    panel.style.width = `${width}px`;
    const rect = anchor?.getBoundingClientRect?.() || { top: vh / 2, bottom: vh / 2, left: gutter, right: gutter };
    const box = panel.getBoundingClientRect();
    let top = rect.bottom + 8;
    if (top + box.height > vh - gutter) top = Math.max(gutter, rect.top - box.height - 8);
    const left = Math.min(Math.max(gutter, anchor?.classList?.contains('me') ? rect.right - width : rect.left), vw - width - gutter);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  };
  place();
  const outside = (event) => { if (!panel.contains(event.target)) closeReactionPicker(); };
  const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReactionPicker({ refocus: true }); } };
  const onResize = () => place();
  document.addEventListener('pointerdown', outside, true);
  panel.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  current = { panel, anchor, cleanup: () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', onResize); } };
  search.focus({ preventScroll: true });
  return panel;
};
