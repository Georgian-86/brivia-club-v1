// The first-run deck tutorial (D-094): what a left swipe and a right swipe do, shown over the Connect deck the first
// time a member has a card in front of them. "Don't show this again" keeps it away for good (localStorage); closing it
// without the tick keeps it away for the rest of the visit only (sessionStorage), so it comes back next time.
// A real <dialog> opened with showModal(): focus stays inside, Escape closes, and the deck's arrow keys stay off while
// it is open (app.js ignores them while any dialog[open] exists). Nothing here sends a signal or touches the deck.

export const TUTORIAL_KEY = 'brivia-deck-tutorial';
export const TUTORIAL_SESSION_KEY = 'brivia-deck-tutorial-seen';
export const TUTORIAL_HIDDEN = 'hidden';

// Pure: should the tutorial open, given the stored values (null when absent or unreadable)?
export const shouldShowTutorial = (stored, seenThisVisit) => stored !== TUTORIAL_HIDDEN && seenThisVisit !== '1';

const read = (store, key) => { try { return store?.getItem(key) ?? null; } catch { return null; } };
const write = (store, key, value) => { try { store?.setItem(key, value); } catch { /* private mode: it shows again */ } };

const card = (side) => `<span class="deck-tutorial-demo deck-tutorial-demo--${side}" aria-hidden="true">
    <span class="deck-tutorial-ghost"></span>
    <span class="deck-tutorial-card"><i class="deck-tutorial-card-bar"></i><i class="deck-tutorial-card-photo"></i><i class="deck-tutorial-card-line"></i><i class="deck-tutorial-card-line deck-tutorial-card-line--short"></i>
      <b class="deck-tutorial-stamp">${side === 'pass' ? 'PASS' : 'PITCH'}</b></span>
    <svg class="deck-tutorial-arrow" viewBox="0 0 24 24"><path d="${side === 'pass' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>
  </span>`;

const markup = () => `<form method="dialog" class="deck-tutorial-form">
    <p class="deck-tutorial-eyebrow">YOUR DECK</p>
    <h2 id="deck-tutorial-title">Two ways to answer a card</h2>
    <ol class="deck-tutorial-steps">
      <li class="deck-tutorial-step">${card('pass')}<div><h3>Swipe left to pass</h3><p>The card moves on. They are never told.</p></div></li>
      <li class="deck-tutorial-step">${card('pitch')}<div><h3>Swipe right to pitch</h3><p>Add a short note if you like. If they pitch you back, you match and can start a chat.</p></div></li>
    </ol>
    <p class="deck-tutorial-keys">On a keyboard, use the left <kbd aria-hidden="true">←</kbd> and right <kbd aria-hidden="true">→</kbd> arrow keys.</p>
    <label class="deck-tutorial-skip"><input type="checkbox" name="hide" /><span>Don't show this again</span></label>
    <button type="submit" class="deck-tutorial-done">GOT IT</button>
  </form>`;

// Opens the tutorial when it is due. Resolves once it closes (or at once when it is not due). The stores default to
// the window's; tests pass their own.
export const maybeShowDeckTutorial = ({ local = window.localStorage, session = window.sessionStorage, returnFocus } = {}) => new Promise((resolve) => {
  if (!shouldShowTutorial(read(local, TUTORIAL_KEY), read(session, TUTORIAL_SESSION_KEY))) { resolve(false); return; }
  if (document.querySelector('dialog.deck-tutorial') || document.querySelector('dialog[open]')) { resolve(false); return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'deck-tutorial';
  dialog.setAttribute('aria-labelledby', 'deck-tutorial-title');
  dialog.innerHTML = markup();
  document.body.append(dialog);
  const hide = dialog.querySelector('input[name="hide"]');
  write(session, TUTORIAL_SESSION_KEY, '1');
  dialog.addEventListener('close', () => {
    if (hide.checked) write(local, TUTORIAL_KEY, TUTORIAL_HIDDEN);
    dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    resolve(true);
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
  dialog.querySelector('.deck-tutorial-done').focus();
});
