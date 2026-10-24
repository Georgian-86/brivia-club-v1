// Show / hide password (founder, 2026-10-24, D-091): every password field (login, reset, classic and guided signup,
// the landing's login modal) gets an eye button that flips it between dots and plain text while typing. revealState
// is pure; attachPasswordReveal and watchPasswordFields are the DOM part. The field goes back to dots when its form
// is submitted, so a password manager saves it and nothing is left on screen.
export const REVEAL_LABEL = { show: 'Show password', hide: 'Hide password' };

export const revealState = (visible) => ({
  type: visible ? 'text' : 'password',
  pressed: String(Boolean(visible)),
  label: visible ? REVEAL_LABEL.hide : REVEAL_LABEL.show,
});

const ICON_ATTRS = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const EYE = `<svg class="password-reveal-eye" ${ICON_ATTRS}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg class="password-reveal-eye-off" ${ICON_ATTRS}><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

let fieldSeq = 0;

const apply = (input, button, visible) => {
  const s = revealState(visible);
  input.type = s.type;
  button.setAttribute('aria-pressed', s.pressed);
  button.setAttribute('aria-label', s.label);
  button.title = s.label;
};

// Keeps the caret where it was across a type change. Chrome moves it to the start once more after a click has been
// handled, so it is put back again on the next frame (unless the member has moved it since).
const keepCaret = (input, change) => {
  const doc = input.ownerDocument;
  const focused = doc.activeElement === input;
  const { selectionStart, selectionEnd } = input;
  change();
  if (!focused) return;
  const restore = () => { try { input.setSelectionRange(selectionStart, selectionEnd); } catch { /* not a text field */ } };
  input.focus();
  restore();
  doc.defaultView?.requestAnimationFrame?.(() => {
    if (doc.activeElement === input && input.selectionStart === 0 && input.selectionEnd === 0) restore();
  });
};

export function attachPasswordReveal(input) {
  if (!input || input.dataset.reveal) return null;
  const doc = input.ownerDocument;
  input.dataset.reveal = 'on';
  if (!input.id) input.id = `password-field-${++fieldSeq}`;
  // The login card already has a positioned shell; other fields get one, so the button can sit inside the field.
  let shell = input.closest('.auth-input-shell');
  if (!shell) {
    shell = doc.createElement('span');
    shell.className = 'password-reveal-shell';
    keepCaret(input, () => { input.replaceWith(shell); shell.append(input); });
  }
  shell.classList.add('has-password-reveal');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'password-reveal';
  button.setAttribute('aria-controls', input.id);
  button.innerHTML = EYE + EYE_OFF;
  apply(input, button, false);
  input.after(button);
  // A pointer press must not take focus from the field: the member keeps typing where they were.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => keepCaret(input, () => apply(input, button, input.type === 'password')));
  const form = input.form;
  if (form && !form.dataset.revealReset) {
    form.dataset.revealReset = 'on';
    form.addEventListener('submit', () => {
      form.querySelectorAll('.password-reveal').forEach((other) => {
        const field = doc.getElementById(other.getAttribute('aria-controls'));
        if (field) apply(field, other, false);
      });
    }, true);
  }
  return button;
}

const SELECTOR = 'input[type="password"]:not([data-reveal])';

// Enhances every password field now and every one added later (the guided signup renders its screens on the fly).
export function watchPasswordFields(root = globalThis.document) {
  if (!root?.querySelectorAll) return null;
  root.querySelectorAll(SELECTOR).forEach(attachPasswordReveal);
  if (typeof MutationObserver === 'undefined') return null;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(SELECTOR)) attachPasswordReveal(node);
        node.querySelectorAll(SELECTOR).forEach(attachPasswordReveal);
      }
    }
  });
  observer.observe(root.body || root, { childList: true, subtree: true });
  return observer;
}
