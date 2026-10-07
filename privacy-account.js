// PRIVACY & ACCOUNT (Iteration 4, Task 9; rulings R2 withdraw and R5 delete). UX_SPEC §G.
// Real <dialog> elements opened with showModal(): a Tab trap, Escape (ignored while a request is in flight), focus
// returned to the trigger. Everything that touches Supabase is injected by app.js, so this file only builds the UI.
import { consentStatusCopy, reauthMethod, deletionErrorCopy, DELETE_DISCLOSURE } from './account-deletion.js';

const CONTACT = 'thebrivia.club@gmail.com';
const WITHDRAW_ERROR = `We couldn't withdraw your consent. Try again, or email ${CONTACT}.`;
const escapeText = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let dialogCount = 0;

// A modal dialog with the shared behaviour. Returns { dialog, close, setBusy, isBusy }.
const createDialog = ({ kind, html, trigger, fallbackFocus, onClosed }) => {
  dialogCount += 1;
  const dialog = document.createElement('dialog');
  dialog.className = 'privacy-dialog';
  dialog.dataset.privacy = kind;
  dialog.setAttribute('aria-labelledby', `privacy-${dialogCount}-title`);
  dialog.innerHTML = html.replace('__ID__', `privacy-${dialogCount}-title`);
  document.body.append(dialog);
  let busy = false;
  dialog.addEventListener('close', () => {
    dialog.remove();
    const target = trigger?.isConnected ? trigger : fallbackFocus?.();
    if (target?.isConnected) target.focus();
    onClosed?.();
  });
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog && !busy) dialog.close(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('input, button, a[href]')].filter((el) => !el.disabled && !el.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  const setBusy = (value) => { busy = value; dialog.toggleAttribute('aria-busy', value); };
  return { dialog, close: () => dialog.close(), setBusy, isBusy: () => busy };
};

// R2: the withdraw confirmation. Resolves true when consent was withdrawn.
const openWithdrawDialog = ({ trigger, fallbackFocus, withdraw }) => new Promise((resolve) => {
  let done = false;
  const { dialog, close, setBusy } = createDialog({
    kind: 'withdraw', trigger, fallbackFocus, onClosed: () => resolve(done),
    html: `<div class="privacy-body">
    <h2 id="__ID__">Withdraw consent?</h2>
    <p>We'll delete your private interests now and spread their points across your other interests. You can add them again later.</p>
    <p class="privacy-error" data-privacy-error role="alert"></p>
    <div class="privacy-actions"><button type="button" class="privacy-secondary" data-privacy-keep>Keep</button><button type="button" class="privacy-primary" data-privacy-confirm-withdraw>Withdraw and delete</button></div>
  </div>`,
  });
  const errorBox = dialog.querySelector('[data-privacy-error]');
  const confirm = dialog.querySelector('[data-privacy-confirm-withdraw]');
  dialog.querySelector('[data-privacy-keep]').addEventListener('click', () => { if (!dialog.hasAttribute('aria-busy')) close(); });
  confirm.addEventListener('click', async () => {
    if (dialog.hasAttribute('aria-busy')) return;
    setBusy(true);
    confirm.setAttribute('aria-disabled', 'true');
    errorBox.textContent = '';
    let result;
    try { result = await withdraw(); } catch (error) { result = { error }; }
    setBusy(false);
    confirm.removeAttribute('aria-disabled');
    if (result?.error) { errorBox.textContent = WITHDRAW_ERROR; return; }
    done = true;
    close();
  });
  dialog.showModal();
  dialog.querySelector('[data-privacy-keep]').focus();
});

// R5: the delete dialog. deps: { user, runDeletion, signInWithPassword, startGoogle, onDeleted }.
const openDeleteDialog = ({ trigger, fallbackFocus, deps }) => {
  const list = (items) => `<ul>${items.map((item) => `<li>${escapeText(item)}</li>`).join('')}</ul>`;
  // F3: name the account being deleted (the current session user's own email only; never another member's).
  const ownEmail = deps.user?.email ? `<p class="privacy-account-email" data-privacy-account-email>Deleting the account for <strong>${escapeText(deps.user.email)}</strong></p>` : '';
  const { dialog, close, setBusy } = createDialog({
    kind: 'delete', trigger, fallbackFocus,
    html: `<div class="privacy-body">
    <h2 id="__ID__">Delete my account</h2>
    ${ownEmail}
    <p>This can't be undone. Your account and everything in it is deleted for good.</p>
    <h3>What we delete</h3>
    ${list(DELETE_DISCLOSURE.deleted)}
    <h3>What remains, and for how long</h3>
    ${list(DELETE_DISCLOSURE.remains)}
    <label class="privacy-field" for="privacy-delete-confirm">Type DELETE to confirm</label>
    <input id="privacy-delete-confirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
    <div class="privacy-reauth" data-privacy-reauth hidden>
      <div data-privacy-password-row hidden><label class="privacy-field" for="privacy-delete-password">Confirm your password</label><input id="privacy-delete-password" type="password" autocomplete="current-password" /></div>
      <button type="button" class="privacy-secondary" data-privacy-google hidden>Sign in with Google again</button>
    </div>
    <p class="privacy-error" data-privacy-error role="alert"></p>
    <div class="privacy-actions"><button type="button" class="privacy-secondary" data-privacy-cancel>Cancel</button><button type="button" class="privacy-danger" data-privacy-confirm-delete aria-disabled="true">Delete my account</button></div>
  </div>`,
  });
  const input = dialog.querySelector('#privacy-delete-confirm');
  const confirm = dialog.querySelector('[data-privacy-confirm-delete]');
  const errorBox = dialog.querySelector('[data-privacy-error]');
  const reauthBox = dialog.querySelector('[data-privacy-reauth]');
  const passwordRow = dialog.querySelector('[data-privacy-password-row]');
  const password = dialog.querySelector('#privacy-delete-password');
  const google = dialog.querySelector('[data-privacy-google]');
  let needsPassword = false;
  const typed = () => input.value.trim().toUpperCase() === 'DELETE';
  const sync = () => confirm.setAttribute('aria-disabled', typed() ? 'false' : 'true');
  input.addEventListener('input', sync);
  dialog.querySelector('[data-privacy-cancel]').addEventListener('click', () => { if (!dialog.hasAttribute('aria-busy')) close(); });
  google.addEventListener('click', async () => {
    if (dialog.hasAttribute('aria-busy')) return;
    setBusy(true);
    try { await deps.startGoogle(); } catch { errorBox.textContent = "Google sign-in couldn't start. Try again."; setBusy(false); }
  });
  const showReauth = () => {
    reauthBox.hidden = false;
    errorBox.textContent = deletionErrorCopy('reauth');
    if (reauthMethod(deps.user) === 'password') { needsPassword = true; passwordRow.hidden = false; password.focus(); }
    else { google.hidden = false; confirm.hidden = true; google.focus(); }
  };
  confirm.addEventListener('click', async () => {
    if (dialog.hasAttribute('aria-busy') || !typed()) return;
    if (needsPassword && !password.value) { errorBox.textContent = 'Enter your password to continue.'; password.focus(); return; }
    setBusy(true);
    confirm.setAttribute('aria-disabled', 'true');
    errorBox.textContent = '';
    if (needsPassword) {
      let signIn;
      try { signIn = await deps.signInWithPassword(deps.user?.email, password.value); } catch (error) { signIn = { error }; }
      if (signIn?.error) {
        errorBox.textContent = "That password didn't work. Try again.";
        setBusy(false); sync(); password.focus();
        return;
      }
    }
    let result;
    try { result = await deps.runDeletion(); } catch (error) { result = { ok: false, stage: 'rpc', error }; }
    if (result.ok) { deps.onDeleted(); return; } // stay busy: the page is navigating away
    setBusy(false);
    sync();
    if (result.stage === 'reauth') { needsPassword = false; showReauth(); return; }
    errorBox.textContent = deletionErrorCopy(result.stage, result);
  });
  dialog.showModal();
  input.focus();
  return dialog;
};

// The Privacy & account section. deps: { fetchConsentAt, withdrawConsent, onWithdrawn, user, runDeletion,
// signInWithPassword, startGoogle, onDeleted }. options.autoDelete reopens the delete dialog (return from Google).
export const openPrivacyAccount = async ({ trigger, deps, autoDelete = false }) => {
  if (document.querySelector('dialog.privacy-dialog[data-privacy="account"]')) return;
  let consentAt = null;
  let consentLoadFailed = false;
  try { consentAt = await deps.fetchConsentAt(); } catch { consentLoadFailed = true; }
  const { dialog, close } = createDialog({
    kind: 'account', trigger,
    html: `<div class="privacy-body">
    <h2 id="__ID__">Privacy &amp; account</h2>
    <p data-privacy-status></p>
    <div class="privacy-actions privacy-actions-start" data-privacy-retry-row hidden><button type="button" class="privacy-secondary" data-privacy-retry>Try again</button></div>
    <div class="privacy-actions privacy-actions-start"><button type="button" class="privacy-secondary" data-privacy-withdraw>Withdraw consent</button></div>
    <p class="privacy-links"><a href="/privacy.html">Privacy notice</a> · <a href="mailto:${CONTACT}">Contact us: ${CONTACT}</a></p>
    <hr />
    <p>Deleting your account removes your profile and everything in it. It can't be undone.</p>
    <div class="privacy-actions privacy-actions-start"><button type="button" class="privacy-danger" data-privacy-delete>Delete my account</button></div>
    <div class="privacy-actions"><button type="button" class="privacy-secondary" data-privacy-close>Close</button></div>
  </div>`,
  });
  const status = dialog.querySelector('[data-privacy-status]');
  const withdrawBtn = dialog.querySelector('[data-privacy-withdraw]');
  const deleteBtn = dialog.querySelector('[data-privacy-delete]');
  const retryRow = dialog.querySelector('[data-privacy-retry-row]');
  const render = () => {
    status.textContent = consentLoadFailed ? "We couldn't load your consent status. Try again." : consentStatusCopy(consentAt);
    withdrawBtn.hidden = consentLoadFailed || !consentAt;
    retryRow.hidden = !consentLoadFailed;
  };
  render();
  dialog.querySelector('[data-privacy-retry]').addEventListener('click', async () => {
    try { consentAt = await deps.fetchConsentAt(); consentLoadFailed = false; } catch { consentLoadFailed = true; }
    render();
    (consentLoadFailed ? dialog.querySelector('[data-privacy-retry]') : (consentAt ? withdrawBtn : deleteBtn)).focus();
  });
  dialog.querySelector('[data-privacy-close]').addEventListener('click', close);
  withdrawBtn.addEventListener('click', async () => {
    const withdrawn = await openWithdrawDialog({ trigger: withdrawBtn, fallbackFocus: () => deleteBtn, withdraw: deps.withdrawConsent });
    if (!withdrawn) return;
    consentAt = null; // set_sensitive_consent(false) clears profiles.sensitive_consent_at
    render();
    deps.onWithdrawn?.();
    deleteBtn.focus();
  });
  deleteBtn.addEventListener('click', () => openDeleteDialog({ trigger: deleteBtn, fallbackFocus: () => deleteBtn, deps }));
  dialog.showModal();
  (consentLoadFailed ? dialog.querySelector('[data-privacy-retry]') : consentAt ? withdrawBtn : deleteBtn).focus();
  if (autoDelete) openDeleteDialog({ trigger: deleteBtn, fallbackFocus: () => deleteBtn, deps });
};
