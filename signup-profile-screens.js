// Phase E guided signup, Task 4: the profile screens. 18+, Name, Area, Interests (premium picking, D-056) and the
// Reveal, registered into the shell (signup-screens.js). Each answer saves on Next through the existing RPCs; a failed
// save keeps the member on the screen with a retry message (runNext never leaves the button busy).
// Imported by script.js after signup-screens.js, so the shell exists before these register.
import { registerScreen, signOutGuided, el, freshAnswers, resumeTarget } from './signup-screens.js';
import {
  supabase, declareAdult, setHomeLocation, setHomeCity, setMemberInterests, setSensitiveConsent, fetchSensitiveConsentAt,
  fetchInterestNodes, searchPlaces, onboardingStatus, isRateLimited, ensureOwnProfile, saveOwnName, deckPreview,
} from './supabase.js';
import { evenSplit } from './passion-budget.js';
import { revealCopy } from './signup-flow.js';
import { areaPickerHtml, createAreaPicker, AREA_SAVE_ERROR, AREA_RATE_LIMITED } from './area-pick.js';
import {
  buildInterestCatalog, searchCatalog, PRIVATE_HINT_TEXT, PRIVATE_TITLE, PRIVATE_PURPOSE, PRIVATE_CONSENT_LABEL,
  SENSITIVE_CONSENT_ERROR, INTEREST_CAP_TEXT,
} from './interest-catalog.js';
import {
  togglePick, canContinue, pickedText, trayAnnouncement, flyChip, flipList, settleFlights, fitNewest, bump, buzz, prefersReducedMotion, MAX_PICKS,
} from './interest-tray.js';
import { shouldWithdrawConsent, realName } from './onboarding-guard.js';
import { setBusy } from './app-skeletons.js';

export const ADULT_SAVE_ERROR = "We couldn't record your answer. Please try again.";
const UNDER_18_COPY = "Brivia Club is for adults. Come back when you're 18.";
const NAME_REQUIRED = 'Enter the name members should see.';
const NAME_SAVE_ERROR = "We couldn't save your name. Please try again.";
export const INTERESTS_SAVE_ERROR = "We couldn't save your interests. Please try again.";
const INTERESTS_LOAD_ERROR = "Interests couldn't load. Check your connection and try again.";
const NAME_MAX = 60;

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14" />',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" />',
  close: '<path d="M7 7l10 10M17 7L7 17" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  search: '<circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />',
  seal: '<circle cx="12" cy="12" r="9" /><path d="M7.8 12.4l2.8 2.8 5.6-6" />',
};
const icon = (name, cls = 'gs-icon') => {
  const span = el('span', { class: cls, 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name]}</svg>`;
  return span;
};
const messageEl = () => el('p', { class: 'gs-message', id: 'signup-error', role: 'alert' });
// This visit's answers (ctx.state.profile; the shell clears it on sign-out).
const answers = (ctx) => {
  ctx.state.profile ||= freshAnswers();
  return ctx.state.profile;
};
const userOf = (ctx) => ctx.state.session?.user || null;
// A notice left for this screen (an old pending profile's answer that failed to save, Task 5): shown once.
const takeNotice = (ctx, screen) => {
  const mine = answers(ctx);
  if (mine.notice?.screen !== screen) return '';
  const { text } = mine.notice;
  mine.notice = null;
  return text;
};

// After a save, the member goes on to the first question still open (a resumed member may have answered later ones
// already: Task 5 "resume anywhere"), or to the Reveal when everything is done. A failed read falls back to `next`.
const goOn = async (ctx, next) => {
  const target = await resumeTarget(next);
  if (target === 'done') return prepareReveal(ctx);
  return target === 'welcome' ? next : target;
};

// ---- 18+ ------------------------------------------------------------------------------------------------------------

registerScreen('adult', {
  render(ctx) {
    ctx.title.textContent = 'Are you 18 or older?';
    const message = messageEl();
    ctx.body.append(
      el('p', { class: 'gs-help', text: "Brivia Club is for adults. We don't ask for your date of birth." }),
      el('p', { class: 'gs-fine' }, [el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'How we use your data' })]),
      message,
    );
    message.textContent = takeNotice(ctx, 'adult');
    ctx.primary("Yes, I'm 18 or older");
    const no = el('button', { type: 'button', class: 'gs-secondary-btn', text: 'No' });
    no.addEventListener('click', async () => {
      setBusy(no, true);
      await signOutGuided();
      // The member stays on this page with the reason; nothing was recorded.
      ctx.body.replaceChildren(el('p', { class: 'gs-lead gs-underage', role: 'status', text: UNDER_18_COPY }));
      ctx.secondary();
      ctx.hideBack();
      ctx.primary('Back to Brivia', { onClick: () => window.location.assign('/') });
      ctx.primaryButton().focus();
    });
    ctx.secondary(no);
    return null;
  },
  async next(ctx) {
    const message = ctx.body.querySelector('#signup-error');
    message.textContent = '';
    // R1: the declaration needs the member's own profile row (made here for a brand-new account).
    const made = await ensureOwnProfile(userOf(ctx));
    const { error } = made.error ? made : await declareAdult();
    if (error) { message.textContent = ADULT_SAVE_ERROR; return null; }
    return goOn(ctx, 'name');
  },
});

// ---- Name -----------------------------------------------------------------------------------------------------------

registerScreen('name', {
  render(ctx) {
    ctx.title.textContent = 'What should members call you?';
    const meta = userOf(ctx)?.user_metadata || {};
    const input = el('input', {
      class: 'gs-input', id: 'signup-name', type: 'text', name: 'name', autocomplete: 'name', autocapitalize: 'words',
      spellcheck: 'false', enterkeyhint: 'next', maxlength: String(NAME_MAX),
      'aria-labelledby': 'signup-screen-title', 'aria-describedby': 'signup-name-help signup-error',
    });
    // Prefilled from this visit's answer, else Google's full name.
    input.value = answers(ctx).name || realName(meta.full_name) || realName(meta.name);
    const message = messageEl();
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); message.textContent = ''; });
    ctx.body.append(el('p', { class: 'gs-help', id: 'signup-name-help', text: 'Members see this name.' }), input, message);
    ctx.primary('Continue');
    return null;
  },
  async next(ctx) {
    const input = ctx.body.querySelector('#signup-name');
    const message = ctx.body.querySelector('#signup-error');
    const name = input.value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (!realName(name)) {
      message.textContent = NAME_REQUIRED;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return null;
    }
    message.textContent = '';
    const { error } = await saveOwnName(userOf(ctx)?.id, name);
    if (error) { message.textContent = NAME_SAVE_ERROR; return null; }
    answers(ctx).name = name;
    return goOn(ctx, 'area');
  },
});

// ---- Area -----------------------------------------------------------------------------------------------------------

let areaPicker = null;
registerScreen('area', {
  render(ctx) {
    ctx.title.textContent = 'Where are you based?';
    const box = el('div', { class: 'gs-area area-step' });
    box.innerHTML = areaPickerHtml({ prefix: 'signup-area' });
    // The picker's error line is the screen's message (selection and save errors alike).
    const error = box.querySelector('[data-area-error]');
    error.id = 'signup-error';
    error.setAttribute('role', 'alert');
    error.removeAttribute('aria-live');
    ctx.body.append(el('p', { class: 'gs-help', id: 'signup-area-help', text: 'We show people near you first. Members only ever see a rounded distance.' }), box);
    areaPicker = createAreaPicker(box, { searchPlaces });
    if (answers(ctx).areaLabel) areaPicker.keep(answers(ctx).areaLabel);
    const notice = takeNotice(ctx, 'area');
    if (notice) areaPicker.setError(notice);
    ctx.primary('Continue');
    const picker = areaPicker;
    return () => { picker.destroy(); if (areaPicker === picker) areaPicker = null; };
  },
  async next(ctx) {
    const picker = areaPicker;
    if (!picker) return null;
    if (picker.needsSettle()) await picker.settle();
    const choice = picker.commit();
    if (!choice) return null;
    if (choice.kind === 'keep') return goOn(ctx, 'interests');
    const { data, error, status } = choice.kind === 'geo' ? await setHomeLocation(choice.lat, choice.lng) : await setHomeCity(choice.placeId);
    if (error) { picker.setError(isRateLimited(error, status) ? AREA_RATE_LIMITED : AREA_SAVE_ERROR); return null; }
    // The server has the cell: forget the coordinates, keep the label for the Reveal.
    const label = typeof data === 'string' && data ? data : String(choice.label || '').split(',')[0];
    answers(ctx).areaLabel = label;
    picker.keep(label);
    return goOn(ctx, 'interests');
  },
});

// ---- Interests ------------------------------------------------------------------------------------------------------

let catalogPromise = null;
const loadCatalog = () => {
  catalogPromise ||= fetchInterestNodes().then(({ data, error }) => {
    if (error) throw error;
    return buildInterestCatalog(data || []);
  }).catch((error) => { catalogPromise = null; throw error; });
  return catalogPromise;
};

// The private-interest consent (R2): a real <dialog> (focus trap, Escape and focus return are the platform's). Nothing
// is pre-ticked; "Not now" and "Continue" weigh the same. Resolves true on Continue with the box ticked.
const askPrivateConsent = (host, message = '') => new Promise((resolve) => {
  const check = el('input', { type: 'checkbox', id: 'signup-private-check', 'data-private-checkbox': true });
  const cont = el('button', { type: 'button', class: 'gs-dialog-btn', 'data-private-continue': true, disabled: true, text: 'Continue' });
  const cancel = el('button', { type: 'button', class: 'gs-dialog-btn', 'data-private-cancel': true, text: 'Not now' });
  const dialog = el('dialog', { class: 'gs-dialog', 'aria-labelledby': 'signup-private-title', 'aria-describedby': 'signup-private-purpose' }, [
    el('h3', { id: 'signup-private-title', text: PRIVATE_TITLE }),
    message ? el('p', { class: 'gs-message', role: 'alert', text: message }) : null,
    el('p', { class: 'gs-dialog-purpose', id: 'signup-private-purpose', text: PRIVATE_PURPOSE }),
    el('div', { class: 'gs-dialog-check' }, [check, el('label', { for: 'signup-private-check', text: PRIVATE_CONSENT_LABEL })]),
    el('p', { class: 'gs-fine' }, [el('a', { href: '/privacy.html', target: '_blank', rel: 'noopener', text: 'How we use your data' })]),
    el('div', { class: 'gs-dialog-actions' }, [cancel, cont]),
  ]);
  let agreed = false;
  check.addEventListener('change', () => { cont.disabled = !check.checked; });
  cancel.addEventListener('click', () => dialog.close());
  cont.addEventListener('click', () => { if (!check.checked) return; agreed = true; dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); resolve(agreed); }, { once: true });
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  check.focus();
});

registerScreen('interests', {
  render(ctx) {
    ctx.title.textContent = 'What are you into?';
    const mine = answers(ctx);
    const reduced = prefersReducedMotion();
    const message = messageEl();
    const search = el('input', {
      class: 'gs-search-input', id: 'signup-interest-search', type: 'search', autocomplete: 'off', spellcheck: 'false',
      enterkeyhint: 'search', placeholder: 'Chess, hiking, jazz…', 'aria-controls': 'signup-interest-results',
    });
    const domains = el('div', { class: 'gs-domains', role: 'group', 'aria-label': 'Categories' });
    const results = el('div', { class: 'gs-results', id: 'signup-interest-results', role: 'region', 'aria-label': 'Interests' });
    const catalogBox = el('div', { class: 'gs-catalog' }, [
      el('label', { class: 'gs-search', for: 'signup-interest-search' }, [icon('search'), el('span', { class: 'gs-search-label', text: 'Find an interest' })]),
      search, domains, results,
    ]);
    ctx.body.append(el('p', { class: 'gs-help', id: 'signup-interests-help', text: 'Pick what you genuinely care about. 3–6 works best.' }), catalogBox);

    // The tray: label, count pill, picks, and a polite live region that says what changed. The screen's message (the
    // cap, a save error) sits in the tray too, so it is in view beside the picks and the button at every width.
    const count = el('span', { class: 'gs-tray-count', 'data-tray-count': true });
    const list = el('ul', { class: 'gs-tray-list', id: 'signup-tray-list', 'data-tray-list': true, 'aria-labelledby': 'signup-tray-label' });
    // Phone: one row of whole picks (the newest), and "+n more" for the rest; it expands the tray to wrapped rows.
    const more = el('button', { type: 'button', class: 'gs-tray-more', 'data-tray-more': true, 'aria-expanded': 'false', 'aria-controls': 'signup-tray-list', hidden: true });
    const row = el('div', { class: 'gs-tray-row' }, [list, more]);
    const empty = el('p', { class: 'gs-tray-empty', text: 'Tap an interest to add it here.' });
    const live = el('p', { class: 'gs-sr', 'aria-live': 'polite', 'data-tray-live': true });
    const tray = el('section', { class: 'gs-tray', 'aria-labelledby': 'signup-tray-label' }, [
      el('div', { class: 'gs-tray-head' }, [el('h3', { class: 'gs-tray-label', id: 'signup-tray-label', text: 'Your picks' }), count]),
      message, row, empty, live,
    ]);
    ctx.dock(tray);
    ctx.primary('Continue', { disabled: !canContinue(mine.picks) });

    let catalog = null;
    let domain = '';
    const chipFor = (id) => results.querySelector(`[data-interest-id="${CSS.escape(id)}"]`);
    const pillFor = (id) => list.querySelector(`[data-pick-id="${CSS.escape(id)}"]`);
    const isPicked = (id) => mine.picks.some((pick) => pick.id === id);
    const paintChip = (chip) => {
      const picked = isPicked(chip.dataset.interestId);
      chip.setAttribute('aria-pressed', String(picked));
      chip.classList.toggle('is-selected', picked);
      if (!picked && mine.picks.length >= MAX_PICKS) chip.setAttribute('aria-disabled', 'true'); else chip.removeAttribute('aria-disabled');
      chip.querySelector('.gs-chip-mark')?.replaceWith(icon(picked ? 'check' : 'plus', 'gs-chip-mark gs-icon'));
    };
    const syncTray = () => {
      count.textContent = pickedText(mine.picks.length);
      empty.hidden = mine.picks.length > 0;
      tray.classList.toggle('is-empty', !mine.picks.length);
      results.querySelectorAll('[data-interest-id]').forEach(paintChip);
      ctx.primaryButton().disabled = !canContinue(mine.picks);
    };
    const pill = (pick) => {
      const button = el('button', { type: 'button', class: 'gs-pick', 'data-pick-id': pick.id, 'aria-label': `Remove ${pick.label}` }, [
        pick.sensitive ? icon('lock', 'gs-pick-lock gs-icon') : null, el('span', { class: 'gs-pick-label', text: pick.label }), icon('close', 'gs-pick-x gs-icon'),
      ]);
      return el('li', { class: 'gs-tray-item' }, [button]);
    };
    const chip = (item) => el('button', {
      type: 'button', class: `gs-chip${item.sensitive ? ' is-private' : ''}`, 'data-interest-id': item.id, 'aria-pressed': 'false',
    }, [item.sensitive ? icon('lock', 'gs-chip-lock gs-icon') : null, el('span', { class: 'gs-chip-label', text: item.label }), icon('plus', 'gs-chip-mark gs-icon')]);
    const groupBlock = (group) => {
      const hasPrivate = group.items.some((item) => item.sensitive);
      const noteId = `signup-private-note-${group.id.replace(/[^a-z0-9_-]/gi, '-')}`;
      const chips = group.items.map((item) => {
        const node = chip(item);
        if (item.sensitive) node.setAttribute('aria-describedby', noteId);
        return node;
      });
      return el('section', { class: 'gs-group', 'aria-label': group.label }, [
        el('p', { class: 'gs-group-label', text: group.label }),
        el('div', { class: 'gs-chips' }, chips),
        hasPrivate ? el('p', { class: 'gs-private-note', id: noteId }, [icon('lock'), PRIVATE_HINT_TEXT]) : null,
      ]);
    };
    const renderDomains = () => {
      domains.replaceChildren(...catalog.domains.map((d) => {
        const button = el('button', { type: 'button', class: 'gs-domain', 'data-domain': d.id, 'aria-pressed': String(!search.value.trim() && d.id === domain), text: d.label });
        button.addEventListener('click', () => {
          domain = d.id;
          search.value = '';
          renderDomains();
          renderResults();
          button.focus();
          button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
        return button;
      }));
    };
    const renderResults = () => {
      if (!catalog) return;
      const query = search.value.trim();
      const groups = query ? searchCatalog(catalog, query) : catalog.groups.filter((group) => group.domainId === domain);
      results.replaceChildren(...(groups.length ? groups.map(groupBlock) : [el('p', { class: 'gs-note', text: 'No interest matches that yet. Try a broader word.' })]));
      syncTray();
    };
    const load = () => {
      results.setAttribute('aria-busy', 'true');
      results.replaceChildren(el('p', { class: 'gs-note', text: 'Loading interests…' }));
      loadCatalog().then((built) => {
        if (!results.isConnected) return;
        catalog = built;
        domain ||= catalog.domains[0]?.id || '';
        results.removeAttribute('aria-busy');
        // Picks kept from an old pending profile (Task 5): preselected once, in their stored order.
        if (mine.seedIds?.length && !mine.picks.length) {
          const byId = new Map(catalog.groups.flatMap((group) => group.items).map((item) => [item.id, item]));
          mine.picks = mine.seedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, MAX_PICKS);
          list.replaceChildren(...mine.picks.map(pill));
          window.requestAnimationFrame(layoutTray);
        }
        mine.seedIds = [];
        renderDomains();
        renderResults();
      }).catch(() => {
        if (!results.isConnected) return;
        results.removeAttribute('aria-busy');
        const retry = el('button', { type: 'button', class: 'gs-link', text: 'Try again' });
        retry.addEventListener('click', load);
        results.replaceChildren(el('p', { class: 'gs-note' }, [INTERESTS_LOAD_ERROR, ' ']), retry);
      });
    };

    // The phone tray's collapsed row (see fitNewest): whole picks only, the newest ones; the older ones sit behind
    // "+n more". Expanded, every pick shows in wrapped rows (capped height, scrolling inside) and the button says
    // "Show less". Wider screens show every pick and no button.
    const phone = window.matchMedia?.('(max-width: 780px)');
    let expanded = false;
    const layoutTray = () => {
      const items = [...list.children];
      items.forEach((li) => { li.hidden = false; });
      if (!phone?.matches || !items.length) {
        expanded = false;
        tray.classList.remove('is-expanded');
        more.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        return;
      }
      tray.classList.remove('is-expanded');
      more.hidden = false;
      more.textContent = `+${items.length} more`;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 8;
      const { hidden } = fitNewest(items.map((li) => li.getBoundingClientRect().width), row.clientWidth, gap, more.getBoundingClientRect().width);
      if (!hidden) expanded = false;
      more.hidden = !hidden;
      more.setAttribute('aria-expanded', String(expanded));
      if (expanded) { tray.classList.add('is-expanded'); more.textContent = 'Show less'; return; }
      items.forEach((li, i) => { li.hidden = i < hidden; });
      more.textContent = `+${hidden} more`;
    };
    more.addEventListener('click', () => { expanded = !expanded; layoutTray(); more.focus({ preventScroll: true }); });
    phone?.addEventListener?.('change', layoutTray);
    let rowWidth = 0;
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (row.clientWidth === rowWidth) return;
      rowWidth = row.clientWidth;
      layoutTray();
    }) : null;
    resize?.observe(row);

    const announce = (text) => { live.textContent = ''; window.setTimeout(() => { live.textContent = text; }, 30); };
    const remove = (id) => {
      const pick = mine.picks.find((p) => p.id === id);
      if (!pick) return;
      mine.picks = togglePick(mine.picks, pick).picks;
      message.textContent = '';
      const item = pillFor(id)?.closest('li');
      const target = chipFor(id);
      syncTray();
      if (item) {
        // The pick flies back to its chip (or fades where it is); the other picks close the gap. A pick behind
        // "+n more" has no slot on screen to fly from: it just leaves.
        if (!item.hidden) void flyChip({ from: item.firstChild, to: target, host: ctx.root, reduced, fade: true });
        flipList([...list.children].filter((li) => li !== item && !li.hidden), () => { item.remove(); layoutTray(); }, { reduced });
      }
      bump(count, reduced);
      announce(trayAnnouncement(pick.label, 'removed'));
    };
    const add = async (item, source) => {
      // Full: the cap message, and no consent asked for a pick that cannot be added.
      if (mine.picks.length >= MAX_PICKS) { message.textContent = INTEREST_CAP_TEXT; return; }
      if (item.sensitive && !mine.privateOk) {
        if (!(await askPrivateConsent(ctx.root))) return;
        mine.privateOk = true;
        if (isPicked(item.id)) return;
      }
      const result = togglePick(mine.picks, item);
      if (result.result === 'full') { message.textContent = INTEREST_CAP_TEXT; return; }
      mine.picks = result.picks;
      message.textContent = '';
      const entry = pill(mine.picks[mine.picks.length - 1]);
      list.append(entry);
      syncTray();
      layoutTray();
      // The expanded phone tray scrolls inside: bring the new pick into view first, so the flight lands on a visible slot.
      if (tray.classList.contains('is-expanded')) list.scrollTop = list.scrollHeight;
      buzz();
      bump(count, reduced);
      announce(trayAnnouncement(item.label, 'added'));
      // The newest pick shows in the row; if even it does not fit, the clone lands on "+n more".
      await flyChip({ from: source, to: entry.hidden ? more : entry.firstChild, host: ctx.root, reduced });
    };
    results.addEventListener('click', (event) => {
      const node = event.target.closest('[data-interest-id]');
      if (!node || !catalog) return;
      settleFlights();  // a tap mid-flight first lands the flight in progress (no stale rects, nothing left hidden)
      const id = node.dataset.interestId;
      if (isPicked(id)) { remove(id); return; }
      const item = catalog.groups.flatMap((group) => group.items).find((entry) => entry.id === id);
      if (item) void add(item, node);
    });
    list.addEventListener('click', (event) => {
      const node = event.target.closest('[data-pick-id]');
      if (!node) return;
      settleFlights();
      const id = node.dataset.pickId;
      // Keep keyboard focus in the tray: the next shown pick, else "+n more", else the search field.
      const shown = () => [...list.querySelectorAll('[data-pick-id]')].filter((b) => b.dataset.pickId !== id && !b.closest('li').hidden);
      const at = Math.max(0, [...list.querySelectorAll('[data-pick-id]')].filter((b) => !b.closest('li').hidden).indexOf(node));
      remove(id);
      const rest = shown();
      (rest[Math.min(at, rest.length - 1)] || (more.hidden ? search : more)).focus({ preventScroll: true });
    });
    search.addEventListener('input', () => { renderDomains(); renderResults(); });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
      if (event.key === 'Escape' && search.value) { event.preventDefault(); search.value = ''; renderDomains(); renderResults(); }
    });

    list.replaceChildren(...mine.picks.map(pill));
    message.textContent = takeNotice(ctx, 'interests');
    syncTray();
    window.requestAnimationFrame(layoutTray);
    load();
    return () => { resize?.disconnect(); phone?.removeEventListener?.('change', layoutTray); settleFlights(); };
  },
  async next(ctx) {
    const mine = answers(ctx);
    const message = ctx.root.querySelector('.gs-tray #signup-error');
    if (!canContinue(mine.picks)) return null;
    message.textContent = '';
    const userId = userOf(ctx)?.id;
    // R2: consent goes to the server only with a private pick (or when the server asked and the member agreed), and is
    // withdrawn again if the save then fails and this submit created it.
    const wantsConsent = mine.picks.some((pick) => pick.sensitive) || (mine.serverWantedConsent && mine.privateOk);
    let gaveConsent = false;
    let consentBefore;
    if (wantsConsent) {
      try { consentBefore = await fetchSensitiveConsentAt(userId); } catch { consentBefore = undefined; }
      const { error } = await setSensitiveConsent(true);
      if (error) { message.textContent = INTERESTS_SAVE_ERROR; return null; }
      gaveConsent = true;
    }
    const { error } = await setMemberInterests(evenSplit(mine.picks));
    if (error) {
      if (shouldWithdrawConsent({ gaveConsent, consentBefore })) await setSensitiveConsent(false).catch(() => {});
      if (/sensitive consent required/i.test(String(error.message || ''))) {
        mine.serverWantedConsent = true;
        if (await askPrivateConsent(ctx.root, SENSITIVE_CONSENT_ERROR)) mine.privateOk = true;
        message.textContent = mine.privateOk ? '' : SENSITIVE_CONSENT_ERROR;
        return null;
      }
      message.textContent = INTERESTS_SAVE_ERROR;
      return null;
    }
    // Saved: an old pending profile has nothing left to apply (Task 5 keeps that path for one release).
    try { window.localStorage.removeItem('brivia-pending-profile'); } catch { /* storage unavailable */ }
    return prepareReveal(ctx);
  },
});

// The Reveal: one deck card says whether someone near shares an interest (the deck orders those first). A resumed
// visit fills in the name and area it did not ask for. Any failure here only changes the Reveal's wording.
const prepareReveal = async (ctx) => {
  const mine = answers(ctx);
  const userId = userOf(ctx)?.id;
  const [deck, row, status] = await Promise.all([
    deckPreview(1).catch(() => ({ data: [] })),
    mine.name || !supabase ? null : supabase.from('profiles').select('name').eq('id', userId).maybeSingle().then((r) => r.data).catch(() => null),
    mine.areaLabel ? null : onboardingStatus().then((r) => r.data).catch(() => null),
  ]);
  mine.reveal = revealCopy({
    name: mine.name || row?.name || userOf(ctx)?.user_metadata?.full_name || '',
    picks: mine.picks,
    rows: deck?.error ? [] : deck?.data,
    area: mine.areaLabel || status?.place_label || '',
  });
  return 'reveal';
};

// ---- Reveal ---------------------------------------------------------------------------------------------------------

registerScreen('reveal', {
  render(ctx) {
    const copy = answers(ctx).reveal || revealCopy({ name: answers(ctx).name });
    ctx.title.textContent = copy.title;
    ctx.body.append(
      icon('seal', 'gs-reveal-mark'),
      el('p', { class: 'gs-lead gs-reveal-line', text: copy.line }),
    );
    ctx.title.before(ctx.body.firstChild);
    ctx.primary('See my deck', { onClick: () => window.location.assign('/app.html') });
    return null;
  },
});
