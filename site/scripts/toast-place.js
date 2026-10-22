// Where the app toast sits on a phone. It rests above the tab bar; when that spot would cover the control the member just
// used (a card's action bar, say), it moves under the header instead, so the control stays visible and tappable.
export const TOAST_GAP = 12;

// toast, anchor: DOMRect-like { left, top, right, bottom }. Returns 'top' or 'bottom'.
export const toastSide = (toast, anchor, gap = TOAST_GAP) => {
  if (!toast || !anchor) return 'bottom';
  const across = toast.left < anchor.right + gap && anchor.left - gap < toast.right;
  const down = toast.top < anchor.bottom + gap && anchor.top - gap < toast.bottom;
  return across && down ? 'top' : 'bottom';
};
