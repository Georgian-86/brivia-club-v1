// The 6-digit email code (Phase E): parse a typed, pasted or autofilled code, and update the six boxes.
export const OTP_LENGTH = 6;

// Exactly six digits after dropping spaces and dashes, or the first run of six digits in a longer message.
export const parseOtp = (text) => {
  const raw = String(text ?? '');
  const compact = raw.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(compact)) return compact;
  return raw.match(/(?<!\d)\d{6}(?!\d)/)?.[0] || null;
};

// boxes: six strings. value: what box `index` now holds ('' after a backspace; several digits after a paste or an
// autofill). Returns the new boxes and the box to focus.
export const otpBoxesAfterInput = (boxes, index, value) => {
  const next = boxes.slice(0, OTP_LENGTH);
  const digits = String(value ?? '').replace(/\D/g, '');
  if (value === '') {
    if (!boxes[index]) return { boxes: next, focus: Math.max(0, index - 1) };
    next[index] = '';
    return { boxes: next, focus: index };
  }
  if (!digits) return { boxes: next, focus: index };
  const full = parseOtp(value);
  if (full) return { boxes: full.split(''), focus: OTP_LENGTH - 1 };
  let at = index;
  for (const d of digits) { if (at >= OTP_LENGTH) break; next[at] = d; at += 1; }
  return { boxes: next, focus: Math.min(at, OTP_LENGTH - 1) };
};
