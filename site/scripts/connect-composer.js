// "Make the first move." (D-124): the message that travels with a connect request. Shared by the Connect deck's pitch
// sheet (app.js, #pitch-modal) and the companions page (a <dialog>, createConnectComposer below). The note is stored
// with the request and, once the other member accepts, becomes the first message of their chat (0024); declined, it
// never reaches chat. Pure helpers are unit-tested in tests/unit/connect-composer.test.mjs.

export const NOTE_MAX = 500;
const clean = (v) => String(v || '').trim();
const firstName = (name) => clean(name).split(/\s+/)[0] || 'there';

// Up to three openers, specific first: a shared interest, the event they are both going to, then a general one.
export const openerSuggestions = ({ name, shared = [], eventTitle = '' } = {}) => {
  const who = firstName(name);
  const interest = clean(shared[0]).toLowerCase();
  const out = [];
  if (eventTitle) out.push(`Hi ${who}! I'm going to ${clean(eventTitle)} too. Want to go together?`);
  if (interest) out.push(`Hi ${who}, I noticed we both love ${interest}. Would be great to swap notes.`);
  out.push(`Hi ${who}! I'd love to connect and hear what you're working on.`);
  if (!eventTitle) out.push(`Hi ${who}, your profile caught my eye. Coffee sometime this week?`);
  return [...new Set(out)].slice(0, 3);
};

// '120 / 500'; nearLimit from 90%.
export const composerCount = (length) => ({ text: `${Math.max(0, Number(length) || 0)} / ${NOTE_MAX}`, nearLimit: (Number(length) || 0) >= NOTE_MAX * 0.9 });

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const suggestionsMarkup = (list) => list.map((s, i) => `<button type="button" class="composer-suggestion" data-composer-suggestion="${i}">${esc(s)}</button>`).join('');

// The companions page's composer. dialog: an empty <dialog>. open({ person: { name }, suggestions, prefill, onSend(note)
// -> Promise<boolean> (true closes), onCancel() }).
export const createConnectComposer = (dialog) => {
  if (!dialog) return { open() {} };
  dialog.innerHTML = `<form class="composer-panel" method="dialog" novalidate>
    <button type="button" class="overlay-close" data-composer-cancel aria-label="Close, send nothing">×</button>
    <p class="app-eyebrow">CONNECT WITH <span data-composer-name>THEM</span></p>
    <h2 id="composer-title">Make the <em>first move.</em></h2>
    <p class="pitch-copy" id="composer-copy">Introduce yourself and tell them why you'd like to connect.</p>
    <div class="composer-suggestions" data-composer-suggestions role="group" aria-label="Suggested openers"></div>
    <label class="sr-only" for="composer-message">Your message</label>
    <textarea id="composer-message" rows="5" maxlength="${NOTE_MAX}" aria-describedby="composer-copy composer-count composer-error" required></textarea>
    <div class="composer-meta"><p class="event-field-error" id="composer-error" role="alert"></p><p class="composer-count" id="composer-count" aria-live="polite">0 / ${NOTE_MAX}</p></div>
    <div class="composer-actions"><button type="button" class="composer-cancel" data-composer-cancel>Cancel</button><button type="submit" class="composer-send">Send request <span aria-hidden="true">→</span></button></div>
  </form>`;
  dialog.setAttribute('aria-labelledby', 'composer-title');
  const form = dialog.querySelector('form');
  const text = dialog.querySelector('textarea');
  const count = dialog.querySelector('#composer-count');
  const error = dialog.querySelector('#composer-error');
  const submit = dialog.querySelector(".composer-send");
  let current = null;
  let suggestions = [];
  const renderCount = () => { const c = composerCount(text.value.length); count.textContent = c.text; count.classList.toggle('is-near', c.nearLimit); };
  const cancel = () => { if (!current) return; const { onCancel } = current; current = null; dialog.close(); onCancel?.(); };
  text.addEventListener('input', () => { error.textContent = ''; renderCount(); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); cancel(); });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-composer-cancel]')) { cancel(); return; }
    const s = e.target.closest('[data-composer-suggestion]');
    if (s) { text.value = suggestions[Number(s.dataset.composerSuggestion)] || ''; renderCount(); text.focus(); text.setSelectionRange(text.value.length, text.value.length); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current || submit.disabled) return;
    const note = text.value.trim();
    if (note.length < 2) { error.textContent = 'Write a line or pick a suggestion first.'; text.focus(); return; }
    submit.disabled = true;
    const ok = await current.onSend(note);
    submit.disabled = false;
    if (ok && current) { current = null; dialog.close(); }
  });
  return {
    open({ person = {}, suggestions: list = [], prefill = '', onSend, onCancel } = {}) {
      current = { onSend, onCancel };
      suggestions = list;
      dialog.querySelector('[data-composer-name]').textContent = person.name || 'them';
      dialog.querySelector('[data-composer-suggestions]').innerHTML = suggestionsMarkup(list);
      text.value = prefill;
      error.textContent = '';
      renderCount();
      dialog.showModal();
      text.focus();
    },
  };
};
