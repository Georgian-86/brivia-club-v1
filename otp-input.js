// Six-box code input: pure helper for typing, paste and backspace. No DOM. Never mutates its input.
import { parseOtp } from './signup-flow.js';

const LENGTH = 6;

// Returns { boxes, focus } after `value` is entered in box `index`.
export const otpBoxesAfterInput = (boxes, index, value) => {
  const next = Array.from({ length: LENGTH }, (_, i) => String((boxes && boxes[i]) || ''));
  const at = Math.min(Math.max(0, Math.trunc(Number(index) || 0)), LENGTH - 1);
  const text = String(value ?? '');
  if (text === '') {
    if (next[at] === '') {
      const prev = Math.max(0, at - 1);
      next[prev] = '';
      return { boxes: next, focus: prev };
    }
    next[at] = '';
    return { boxes: next, focus: at };
  }
  // Typing over a filled box: an IME can ignore maxlength and hand over the old digit with the new one ("17" over
  // "1"). The new digit replaces the old one.
  if (text.length === 2 && next[at] !== '' && /^\d\d$/.test(text) && text.includes(next[at])) {
    const fresh = text[0] === next[at] ? text[1] : text[0];
    next[at] = fresh;
    return { boxes: next, focus: Math.min(at + 1, LENGTH - 1) };
  }
  if (text.length === 1) {
    if (!/^\d$/.test(text)) return { boxes: next, focus: at };
    next[at] = text;
    return { boxes: next, focus: Math.min(at + 1, LENGTH - 1) };
  }
  const whole = parseOtp(text);
  if (whole) return { boxes: whole.split(''), focus: LENGTH - 1 };
  const digits = text.replace(/\D/g, '').slice(0, LENGTH - at);
  if (!digits) return { boxes: next, focus: at };
  digits.split('').forEach((d, i) => { next[at + i] = d; });
  return { boxes: next, focus: Math.min(at + digits.length, LENGTH - 1) };
};
