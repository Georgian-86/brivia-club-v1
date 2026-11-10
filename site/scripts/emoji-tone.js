// Skin tone for emoji (D-236, founder 2026-11-11: "make it white handed by default and then this option that we can
// choose"). Hands and people (Unicode Emoji_Modifier_Base, e.g. 🙌 👏 👍 🧑‍💻) take the member's tone; everything
// else (❤️ 🔥 😂) is unchanged. Default: light. The choice is kept in this browser (a convenience, not account data).
export const TONES = [
  { key: 'default', label: 'Default', mod: '' },
  { key: 'light', label: 'Light', mod: '\u{1F3FB}' },
  { key: 'medium-light', label: 'Medium-light', mod: '\u{1F3FC}' },
  { key: 'medium', label: 'Medium', mod: '\u{1F3FD}' },
  { key: 'medium-dark', label: 'Medium-dark', mod: '\u{1F3FE}' },
  { key: 'dark', label: 'Dark', mod: '\u{1F3FF}' },
];
export const DEFAULT_TONE = 'light';
const KEY = 'brivia-emoji-tone';
const BASE = /^\p{Emoji_Modifier_Base}/u;
const MODS = /[\u{1F3FB}-\u{1F3FF}]/gu;

// The emoji lists (chat-emoji-data.js) are written as HTML numeric entities ('&#x1F44B;'): decode them first.
const decode = (value) => String(value ?? '').replace(/&#(x[0-9a-f]+|\d+);/gi, (m, n) => {
  const cp = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
  return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
});
// Pure: `emoji` in `tone` (a TONES key). Only a modifier base changes: any tone it had is replaced (Default removes it),
// and a VS16 right after the base goes when a tone is added.
export const withTone = (emoji, tone = DEFAULT_TONE) => {
  const raw = decode(emoji);
  const choice = TONES.find((t) => t.key === tone);
  if (!choice || !BASE.test(raw)) return raw;
  const text = raw.replace(MODS, '');
  const [first] = text;
  const rest = text.slice(first.length);
  return choice.mod ? first + choice.mod + rest.replace(/^️/, '') : first + rest;
};

export const isTone = (key) => TONES.some((t) => t.key === key);
export const getTone = () => {
  try { const v = localStorage.getItem(KEY); return isTone(v) ? v : DEFAULT_TONE; } catch { return DEFAULT_TONE; }
};
const listeners = new Set();
export const setTone = (key) => {
  if (!isTone(key)) return;
  try { localStorage.setItem(KEY, key); } catch { /* private mode: this page only */ }
  listeners.forEach((fn) => { try { fn(key); } catch { /* one listener never stops the rest */ } });
};
// Returns an unsubscribe.
export const onToneChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
