// An emoji panel for a text field (D-113, the founder: "in the bio i need emoji dashboard"). The bio fields (signup
// About you, Edit profile) get a smiley button under the box; it opens a panel of the chat's emoji (chat-emoji-data.js)
// in six tabs (styles: emoji-field.css, imported by the page entries). A press inserts the emoji at the cursor, never
// past the field's maxlength, and fires `input` so counts and Continue update. Escape or a press outside closes it; focus returns to the field.
import { chatEmojiCategories } from './chat-emoji-data.js';

const TABS = [['smileys', 'Smileys'], ['people', 'People'], ['animals', 'Animals'], ['food', 'Food'], ['activities', 'Activities'], ['symbols', 'Symbols']];
const FACE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2"/><circle cx="9.2" cy="10" r=".9"/><circle cx="14.8" cy="10" r=".9"/></svg>';
let seq = 0;

// Pure: the value after putting `emoji` over the selection [start, end), or null when it would pass `max`.
export const insertAt = (value, start, end, emoji, max = Infinity) => {
  const text = String(value ?? '');
  const from = Math.max(0, Math.min(Number.isInteger(start) ? start : text.length, text.length));
  const to = Math.max(from, Math.min(Number.isInteger(end) ? end : from, text.length));
  const next = text.slice(0, from) + emoji + text.slice(to);
  return next.length > max ? null : { value: next, caret: from + emoji.length };
};

// field: a textarea or input. Adds the button and panel right after `after` (default: the field); returns { close }.
export const attachEmojiPicker = (field, { label = 'Add an emoji', after = field } = {}) => {
  if (!field || field.dataset.emojiField) return null;
  field.dataset.emojiField = '1';
  seq += 1;
  const id = `emoji-panel-${seq}`;
  const box = document.createElement('div');
  box.className = 'emoji-field';
  box.innerHTML = `<button type="button" class="emoji-field-toggle" aria-label="${label}" aria-expanded="false" aria-controls="${id}">${FACE}<span class="emoji-field-text">Emoji</span></button>
    <div class="emoji-field-panel" id="${id}" role="group" aria-label="Emoji" hidden>
      <div class="emoji-field-tabs" role="tablist" aria-label="Emoji categories">${TABS.map(([key, name], i) => `<button type="button" role="tab" data-emoji-tab="${key}" aria-selected="${i === 0}">${name}</button>`).join('')}</div>
      <div class="emoji-field-grid" role="tabpanel"></div>
    </div>`;
  after.insertAdjacentElement('afterend', box);
  const toggle = box.querySelector('.emoji-field-toggle');
  const panel = box.querySelector('.emoji-field-panel');
  const grid = box.querySelector('.emoji-field-grid');
  const max = field.maxLength > 0 ? field.maxLength : Infinity;
  const render = (key) => {
    grid.innerHTML = (chatEmojiCategories[key] || chatEmojiCategories.smileys).map((e) => `<button type="button" class="emoji-field-emoji" data-emoji="${e}">${e}</button>`).join('');
    grid.querySelectorAll('.emoji-field-emoji').forEach((b) => b.setAttribute('aria-label', b.dataset.emoji));
    box.querySelectorAll('[data-emoji-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.emojiTab === key)));
  };
  const outside = (event) => { if (!box.isConnected) { document.removeEventListener('pointerdown', outside, true); return; } if (!box.contains(event.target)) close(); };
  const open = () => {
    if (!grid.childElementCount) render('smileys');
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    requestAnimationFrame(() => { if (!panel.hidden) panel.scrollIntoView({ block: 'nearest' }); });
  };
  function close({ focusField = false } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focusField) field.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
  box.querySelector('.emoji-field-tabs').addEventListener('click', (event) => { const t = event.target.closest('[data-emoji-tab]'); if (t) render(t.dataset.emojiTab); });
  // The field keeps its selection while the panel is used: a press on an emoji does not take the focus.
  grid.addEventListener('mousedown', (event) => event.preventDefault());
  grid.addEventListener('click', (event) => {
    const b = event.target.closest('.emoji-field-emoji');
    if (!b) return;
    const result = insertAt(field.value, field.selectionStart, field.selectionEnd, b.dataset.emoji, max);
    if (!result) return;
    field.value = result.value;
    field.focus({ preventScroll: true });
    field.setSelectionRange(result.caret, result.caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Escape closes the panel first (from the field or inside it), before any dialog around it.
  const onEscape = (event) => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close({ focusField: true }); } };
  box.addEventListener('keydown', onEscape);
  field.addEventListener('keydown', onEscape);
  return { close };
};
