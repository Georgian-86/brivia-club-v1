// The report dialog and the card overflow menu (Iteration 4, Task 8, ruling R4). UX_SPEC §"Report a member".
// A real <dialog> opened with showModal(): reason radios in a fieldset, a note (maxlength 500), a Tab trap, Escape to
// close, and focus returned to the trigger. The server's report_member always blocks reporter -> target as well; this
// module never touches the block store: the caller hides the member locally once the promise resolves true.
import { isRateLimited } from './supabase.js';

export const REPORT_REASONS = [
  ['harassment', 'Harassment or hate'],
  ['explicit', 'Sexual or explicit content'],
  ['spam', 'Spam or scam'],
  ['fake', 'Fake profile or impersonation'],
  ['underage', 'May be under 18'],
  ['safety', 'I feel unsafe or threatened'],
  ['other', 'Something else'],
];
const EMERGENCY_REASONS = new Set(['safety', 'underage']);
const NOTE_MAX = 500;
export const REPORT_CAP_COPY = "You've sent several reports today. For anything urgent, email thebrivia.club@gmail.com.";
export const reportSuccessCopy = (name) => `Thanks. We've received your report, and you won't see ${name} again.`;
const reportErrorCopy = (error, status) => {
  if (isRateLimited(error, status)) return REPORT_CAP_COPY;
  if (error?.code === '22023') return 'That report could not be sent. Check the reason and note, then try again.';
  return 'Your report could not be sent. Please try again, or email thebrivia.club@gmail.com.';
};
const escapeText = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let dialogCount = 0;

// Resolves true once the report was accepted, false when the member cancelled or it failed. The outcome follows the
// request, not the close (F7): if the dialog is closed while the request is in flight (Chrome closes a modal on a
// second Escape even though the first was cancelled), the promise waits for the server's answer.
// send(reason, note) -> { error, status } (supabase.js reportMember).
export const openReportDialog = ({ name, trigger, send }) => new Promise((resolve) => {
  if (document.querySelector('dialog.report-dialog')) { resolve(false); return; }
  dialogCount += 1;
  const id = `report-${dialogCount}`;
  const who = escapeText(name || 'this member');
  const dialog = document.createElement('dialog');
  dialog.className = 'report-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `<form class="report-form" novalidate>
    <h2 id="${id}-title">Report ${who}</h2>
    <p class="report-intro">Reporting also blocks ${who}, so you won't see them again.</p>
    <fieldset class="report-reasons"><legend>Why are you reporting ${who}?</legend>${REPORT_REASONS.map(([value, label]) => `<label class="report-reason"><input type="radio" name="reason" value="${value}" /><span>${label}</span></label>`).join('')}</fieldset>
    <p class="report-emergency" data-report-emergency hidden>If anyone is in immediate danger, call <strong>112</strong>.</p>
    <label class="report-note" for="${id}-note">Anything else we should know? (optional) <small>Kept for up to a year so we can review it.</small></label>
    <textarea id="${id}-note" name="note" rows="3" maxlength="${NOTE_MAX}" autocomplete="off"></textarea>
    <p class="report-error" data-report-error role="alert"></p>
    <p class="report-contact">Urgent? Email thebrivia.club@gmail.com</p>
    <div class="report-actions"><button type="button" class="report-cancel" data-report-cancel>Cancel</button><button type="submit" class="report-submit" data-report-submit>Report and block</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const emergency = dialog.querySelector('[data-report-emergency]');
  const errorBox = dialog.querySelector('[data-report-error]');
  const submit = dialog.querySelector('[data-report-submit]');
  let sent = false;
  let busy = false;
  let inFlight = null; // resolves to true / false when the request in flight answers
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
    if (inFlight) inFlight.then(resolve); else resolve(sent);
  });
  // A busy dialog ignores Escape: the request is in flight and its result must still reach the member.
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !busy) dialog.close(); });
  dialog.querySelector('[data-report-cancel]').addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('change', (event) => {
    if (event.target.name !== 'reason') return;
    emergency.hidden = !EMERGENCY_REASONS.has(event.target.value);
    errorBox.textContent = '';
  });
  // The browser keeps focus inside a modal dialog, but headless browsers and browser chrome can take it: wrap Tab ourselves.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('input, textarea, button')].filter((el) => !el.disabled);
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const reason = form.querySelector('input[name="reason"]:checked')?.value;
    if (!reason) { errorBox.textContent = 'Choose a reason to continue.'; form.querySelector('input[name="reason"]').focus(); return; }
    const note = form.elements.note.value.trim().slice(0, NOTE_MAX) || null;
    busy = true;
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    errorBox.textContent = '';
    const request = (async () => { try { return await send(reason, note); } catch (error) { return { error }; } })();
    inFlight = request.then((answer) => !answer?.error);
    const result = await request;
    busy = false;
    inFlight = null;
    if (!dialog.open) return; // closed while in flight: the close handler already waits for this outcome
    if (result?.error) {
      errorBox.textContent = reportErrorCopy(result.error, result.status);
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      return;
    }
    sent = true;
    dialog.close();
  });
  dialog.showModal();
  dialog.querySelector('input[name="reason"]').focus();
});

// The card overflow: a menu button with Report and Block. onAction('report' | 'block', trigger).
export const bindCardOverflow = (onAction) => {
  const button = document.querySelector('#card-more');
  const menu = document.querySelector('#card-more-menu');
  if (!button || !menu || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
  const close = (returnFocus = false) => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  };
  const open = () => { menu.hidden = false; button.setAttribute('aria-expanded', 'true'); items()[0]?.focus(); };
  button.addEventListener('click', (event) => { event.stopPropagation(); if (menu.hidden) open(); else close(true); });
  menu.addEventListener('keydown', (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length].focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length].focus(); }
    else if (event.key === 'Tab') close();
  });
  button.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) { event.stopPropagation(); close(true); } });
  menu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-card-action]');
    if (!item) return;
    close();
    onAction(item.dataset.cardAction, button);
  });
  document.addEventListener('click', (event) => { if (!menu.hidden && !menu.contains(event.target) && event.target !== button) close(); });
};
export const cardOverflowOpen = () => !document.querySelector('#card-more-menu')?.hidden;
