// Hiring UI (D-141). The screens of docs/superpowers/specs/2026-11-02-hiring-design.md, wired by app.js through one
// object: createHiring(deps). Every server call goes through the 0037 RPCs; before 0037 is applied the first call
// answers "function not found" and the feature stays hidden (available = false), so nothing else changes.
//
// Sheets are native modal <dialog>s (focus stays inside, Escape closes, focus returns to the opener), a centred card
// on wide screens and a bottom sheet at 640 px and below (hiring.css). Fields use the shared components (D-105).
import {
  FAMILIES, ROLE_TITLES, roleFor, LEVELS, LEVEL_HINT, MODES, HELP, levelLabel, modeLabel, helpBadge, roleMeta,
  roleTextIssue, lookingForRoles, defaultHelp, cardBarLabels, pickBarLabel, stripModel, hiringRowModel, daysLeft,
  needsRenewal, askFootLine, askErrorText, ASK_MIN, ASK_MAX, ABOUT_WORDS_MAX, ABOUT_CHARS_MAX, wordCount, familyLabel,
} from './hiring.js';

export const BAG_ICON = '<svg class="hiring-bag" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/></svg>';
const SHIELD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z"/><path d="M9.5 12l1.8 1.8 3.5-3.6"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
export const SAFETY_LINE = 'Real referrals are free. Never pay a fee or share ID or bank details to be referred. Report it if anyone asks.';
const MISSING = /PGRST202|42883|404|Could not find the function|does not exist/i;
const isMissing = (error) => Boolean(error) && MISSING.test(`${error.code || ''} ${error.message || ''} ${error.status || ''}`);
const today = () => new Date().toISOString().slice(0, 10);
const store = {
  get(key, fallback) { try { const v = JSON.parse(window.localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

export const createHiring = (deps) => {
  const { supabase, escapeHtml, showToast, renderAvatar, me, findPersonById, chipPickerMarkup, wireChipPicker } = deps;
  const onChange = deps.onChange || (() => {});
  const state = {
    available: null, intent: null, roles: [], cache: new Map(), loading: new Set(), suggestions: [], askTags: new Map(),
    sentAsks: [], lens: false, booted: null,
  };
  const esc = escapeHtml;
  const rpc = (name, args) => (supabase ? supabase.rpc(name, args) : Promise.resolve({ data: null, error: { message: 'offline' } }));
  const mark = (error) => { if (isMissing(error)) state.available = false; return error; };
  const seenKey = () => `brivia-hiring-seen:${me()?.id || 'anon'}`;
  const dayKey = () => `brivia-hiring-row-day:${me()?.id || 'anon'}`;
  const openRoles = () => state.roles.filter((r) => r.status === 'open');
  const isHirer = () => state.roles.length > 0;
  const isSeeker = () => Boolean(state.intent);

  // --- Loading ----------------------------------------------------------------------------------------------------
  const boot = () => {
    if (state.booted) return state.booted;
    state.booted = (async () => {
      if (!supabase || !me()?.id) { state.available = false; return; }
      const [intent, roles] = await Promise.all([rpc('my_role_intent'), rpc('my_hiring_roles')]);
      if (isMissing(intent.error) || isMissing(roles.error)) { state.available = false; return; }
      state.available = !intent.error && !roles.error;
      if (!state.available) return;
      state.intent = (intent.data || [])[0] || null;
      state.roles = roles.data || [];
      await Promise.all([loadAsks(), loadSentAsks(), loadSuggestions()]);
      onChange('boot');
    })();
    return state.booted;
  };
  const reloadMine = async () => {
    const [intent, roles] = await Promise.all([rpc('my_role_intent'), rpc('my_hiring_roles')]);
    if (!intent.error) state.intent = (intent.data || [])[0] || null;
    if (!roles.error) state.roles = roles.data || [];
    state.cache.delete(String(me()?.id));
    await loadSuggestions();
    onChange('mine');
  };
  const loadAsks = async () => {
    if (!isHirer()) { state.askTags = new Map(); return; }
    const { data, error } = await rpc('my_role_asks');
    if (error) { mark(error); return; }
    state.askTags = new Map((data || []).map((row) => [String(row.seeker_id), row.role_title]));
  };
  const loadSentAsks = async () => {
    if (!isSeeker()) { state.sentAsks = []; return; }
    const { data, error } = await rpc('my_sent_role_asks');
    if (!error) state.sentAsks = data || [];
  };
  const loadSuggestions = async () => {
    if (!isSeeker() && !openRoles().length) { state.suggestions = []; return; }
    const { data, error } = await rpc('hiring_suggestions', { p_limit: 10 });
    state.suggestions = error ? [] : (data || []);
  };
  // member_hiring for the ids not cached yet (50 a call); cards re-render once the answer lands.
  const ensure = async (ids) => {
    if (state.available === false || !supabase) return;
    await boot();
    if (!state.available) return;
    const want = [...new Set((ids || []).map(String))].filter((id) => id && !state.cache.has(id) && !state.loading.has(id));
    if (!want.length) return;
    want.forEach((id) => state.loading.add(id));
    let changed = false;
    for (let i = 0; i < want.length; i += 50) {
      const chunk = want.slice(i, i + 50);
      const { data, error } = await rpc('member_hiring', { p_ids: chunk });
      chunk.forEach((id) => state.loading.delete(id));
      if (error) { mark(error); return; }
      chunk.forEach((id) => state.cache.set(id, null));
      (data || []).forEach((row) => state.cache.set(String(row.member_id), { roles: row.roles || [], best_title: row.best_title, fits: Boolean(row.fits) }));
      if (data?.length) changed = true;
    }
    if (changed) onChange('cards');
  };
  const hiringOf = (id) => state.cache.get(String(id)) || null;

  // --- The deck card ----------------------------------------------------------------------------------------------
  // The bar: "HIRING · FRONTEND DEVELOPER" when it fits on one line, else "HIRING · 2 ROLES", else "HIRING" (measured,
  // never an ellipsis). The strip under the distance only for a seeker whose roles fit. The duplicate chip goes.
  const decorateCard = (person, { label, strip, tags }) => {
    const hiring = person ? hiringOf(person.id) : null;
    const labels = hiring ? cardBarLabels(hiring) : null;
    if (label) {
      label.classList.toggle('is-hiring', Boolean(labels));
      if (labels) {
        const fits = (text) => { label.innerHTML = `<span class="hiring-bar-icon">${BAG_ICON}</span>${esc(text)}`; return label.scrollWidth <= label.clientWidth + 1; };
        const text = pickBarLabel(labels, fits);
        fits(text);
        label.setAttribute('aria-label', text.replace('·', ','));
      } else label.removeAttribute('aria-label');
    }
    if (strip) {
      const model = stripModel(hiring);
      strip.hidden = !model;
      strip.innerHTML = model ? `<span class="hiring-icon">${BAG_ICON}</span><span class="hiring-strip-copy"><strong>${esc(model.title)}</strong><span><b>Fits what you're open to</b> · ${esc(model.help)}</span></span>` : '';
    }
    if (tags && labels) tags.querySelectorAll('span, li, button').forEach((chip) => { if (lookingForRoles([chip.textContent.trim()]).hirer) chip.hidden = true; });
    if (person && !state.cache.has(String(person.id))) void ensure([person.id]);
  };

  // --- The public profile -----------------------------------------------------------------------------------------
  const bannerMarkup = (person, hiring) => {
    const first = String(person.name || 'them').split(/\s+/)[0];
    const help = hiring.roles.some((r) => r.help === 'hiring') ? 'Hiring manager' : 'Can refer';
    const rows = hiring.roles.map((role, i) => {
      const fit = Number(role.fit) >= 0.5;
      const primary = i === 0;
      const action = role.asked
        ? '<span class="hiring-asked">Asked</span>'
        : role.accepting === false
          ? '<span class="hiring-asked">Not taking asks</span>'
          : `<button type="button" class="${primary ? 'hiring-ask' : 'hiring-quiet'}" data-hiring-ask="${esc(role.id)}" aria-label="Ask ${esc(first)} about ${esc(role.title)}">${primary ? 'Ask about this role' : 'Ask'}</button>`;
      return `<li class="hiring-role"><div class="hiring-role-copy"><h4>${esc(role.title)}</h4><p>${esc(roleMeta(role))}</p>`
        + (role.about ? `<p class="hiring-role-note">${esc(role.about)}</p>` : '')
        + (fit ? '<span class="hiring-fit">Fits what you\'re open to</span>' : '')
        + `</div>${action}</li>`;
    }).join('');
    const days = Math.max(...hiring.roles.map((r) => Number(r.opened_days) || 0));
    return `<section class="hiring-banner" aria-label="${esc(first)} is hiring">`
      + `<header class="hiring-banner-head"><span class="hiring-banner-title"><span class="hiring-bar-icon">${BAG_ICON}</span>Hiring</span><small>${hiring.roles.some((r) => r.company) ? 'Self-reported · ' : ''}${help}</small></header>`
      + `<ul class="hiring-roles">${rows}</ul>`
      + `<p class="hiring-foot">Open ${days === 0 ? 'since today' : `${days} day${days === 1 ? '' : 's'}`} · Asks are requests: ${esc(first)} chooses who to connect with.</p></section>`;
  };
  const openToMarkup = (row) => `<section class="public-profile-group hiring-open-to"><h3>Open to roles</h3><ul class="public-profile-chips public-profile-chips--looking">${(row.titles || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    + `<p class="hiring-open-meta">${esc([levelLabel(row.level), (row.work_modes || []).map(modeLabel).join(' or ')].filter(Boolean).join(' · '))}</p></section>`;
  const decorateProfile = async (modal, person) => {
    if (!modal || !person?.id || state.available === false) return;
    await ensure([person.id]);
    if (!modal.isConnected || !state.available) return;
    const body = modal.querySelector('.public-profile-body');
    const hiring = hiringOf(person.id);
    if (hiring && body && !body.querySelector('.hiring-banner')) {
      body.insertAdjacentHTML('afterbegin', bannerMarkup(person, hiring));
      body.querySelectorAll('.public-profile-chips--looking li').forEach((li) => { if (lookingForRoles([li.textContent]).hirer) li.remove(); });
      body.querySelectorAll('.public-profile-chips--looking').forEach((ul) => { if (!ul.children.length) ul.closest('.public-profile-group')?.remove(); });
      body.querySelector('.hiring-banner').addEventListener('click', (event) => {
        const button = event.target.closest('[data-hiring-ask]');
        if (!button) return;
        const role = hiring.roles.find((r) => String(r.id) === button.dataset.hiringAsk);
        if (role) openAskSheet(person, role, button);
      });
    }
    // A hirer looking at a seeker who lets hirers see it (or chose Everyone).
    if (body && (openRoles().length || lookingForRoles(person.lookingFor).seeker)) {
      const { data, error } = await rpc('member_open_to', { p_id: person.id });
      const row = !error && (data || [])[0];
      if (row && modal.isConnected && !body.querySelector('.hiring-open-to')) {
        const looking = body.querySelector('.public-profile-chips--looking')?.closest('.public-profile-group');
        if (looking) looking.insertAdjacentHTML('afterend', openToMarkup(row)); else body.insertAdjacentHTML('beforeend', openToMarkup(row));
      }
    }
  };

  // --- Sheets -----------------------------------------------------------------------------------------------------
  const openSheet = ({ label, html, onReady, opener = document.activeElement }) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'hiring-sheet';
    dialog.setAttribute('aria-label', label);
    dialog.innerHTML = `<div class="hiring-sheet-inner"><button type="button" class="hiring-close" data-hiring-close aria-label="Close">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>'}</button>${html}</div>`;
    document.body.append(dialog);
    const close = () => { if (!dialog.isConnected) return; dialog.close(); dialog.remove(); if (opener?.isConnected) opener.focus?.({ preventScroll: true }); };
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-hiring-close]')) close();
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    onReady?.(dialog, close);
    return { dialog, close };
  };
  const segment = (name, pairs, value, labelText) => `<fieldset class="hiring-field"><legend class="hiring-label">${labelText}</legend><div class="hiring-segment" role="radiogroup" aria-label="${esc(labelText)}" style="--n:${pairs.length}">`
    + pairs.map(([id, text]) => `<label class="hiring-segment-option"><input type="radio" name="${name}" value="${id}"${id === value ? ' checked' : ''} /><span>${esc(text)}</span></label>`).join('')
    + '</div></fieldset>';
  const fieldError = (form, name, text) => {
    const el = form.querySelector(`[data-error="${name}"]`);
    if (el) { el.textContent = text || ''; el.hidden = !text; }
    return !text;
  };
  const setBusy = (button, busy, text) => {
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    if (text) button.querySelector('span[data-label]')?.replaceChildren(text);
  };

  // Add a role / Edit a role.
  const openRoleSheet = (role = null, opener) => {
    const index = role ? state.roles.findIndex((r) => r.id === role.id) + 1 : state.roles.length + 1;
    const help = role?.help || defaultHelp(me()?.lookingFor);
    const html = `<p class="hiring-eyebrow">Hiring · Role ${index}</p><h2 id="hiring-role-title">${role ? 'Edit your <em>role.</em>' : 'Who are you <em>looking for?</em>'}</h2>`
      + '<p class="hiring-lede">Members open to this kind of role see it on your card first. It stays up for 30 days.</p>'
      + '<form class="hiring-form" novalidate>'
      + chipPickerMarkup({ id: 'hiring-role-pick', label: 'ROLE TITLE', listLabel: 'Role title', placeholder: 'Pick a role or type your own', helper: 'Pick from the list or type the title you use.' })
      + '<p class="hiring-help hiring-family" data-family hidden></p><p class="hiring-error" data-error="title" hidden></p>'
      + `<div class="hiring-two"><div class="hiring-field"><label class="hiring-label" for="hiring-level">Level</label><select class="b-select" id="hiring-level" name="level">${LEVELS.map(([id, text]) => `<option value="${id}"${id === (role?.level || 'mid') ? ' selected' : ''}>${esc(text)}${LEVEL_HINT[id] ? ` (${LEVEL_HINT[id]})` : ''}</option>`).join('')}</select></div>`
      + `<div class="hiring-field"><label class="hiring-label" for="hiring-company">Company <span class="hiring-optional">optional</span></label><input class="b-field" id="hiring-company" name="company" maxlength="60" autocomplete="organization" value="${esc(role?.company || '')}" /><p class="hiring-error" data-error="company" hidden></p></div></div>`
      + segment('work_mode', MODES, role?.work_mode || 'hybrid', 'Where')
      + '<p class="hiring-help">On-site and hybrid roles show to members near your area, nearest first. Never a street or a city name.</p>'
      + segment('help', HELP, help, 'How you can help')
      + `<div class="hiring-field"><label class="hiring-label" for="hiring-about">A line about it <span class="hiring-optional">optional</span><span class="hiring-count" data-count>0 / ${ABOUT_WORDS_MAX} words</span></label><textarea class="b-field" id="hiring-about" name="about" maxlength="${ABOUT_CHARS_MAX}" rows="5" placeholder="The team, the stack, what you'd look for.">${esc(role?.about || '')}</textarea><p class="hiring-error" data-error="about" hidden></p></div>`
      + `<button type="submit" class="hiring-primary"><span data-label>${role ? 'Save role' : 'Post role'}</span></button>`
      + '<p class="hiring-note">No links or fees. Members ask through Brivia, and you choose who to connect with.</p></form>';
    openSheet({
      label: role ? 'Edit your role' : 'Add a role', html, opener,
      onReady: (dialog, close) => {
        const form = dialog.querySelector('form');
        const picker = wireChipPicker(dialog.querySelector('[data-picker="hiring-role-pick"]'), { max: 1, allowCustom: true, emptyText: 'No role picked yet.' });
        picker.load({ picks: role ? [role.title] : [], options: ROLE_TITLES.map((t) => ({ id: t, label: t })) });
        const familyLine = dialog.querySelector('[data-family]');
        const showFamily = () => {
          const pick = roleFor(picker.picks[0]);
          familyLine.hidden = !pick;
          if (pick) familyLine.textContent = familyLabel(pick.family);
        };
        showFamily();
        dialog.querySelector('[data-picker="hiring-role-pick"]').addEventListener('click', () => window.setTimeout(showFamily, 0));
        dialog.querySelector('[data-picker="hiring-role-pick"]').addEventListener('keydown', () => window.setTimeout(showFamily, 0));
        const about = form.querySelector('#hiring-about');
        const count = form.querySelector('[data-count]');
        const recount = () => { const n = wordCount(about.value); count.textContent = `${n} / ${ABOUT_WORDS_MAX} words`; count.classList.toggle('is-over', n > ABOUT_WORDS_MAX); };
        about.addEventListener('input', recount); recount();
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const pick = roleFor(picker.picks[0]);
          const company = form.company.value.trim();
          const text = about.value.trim();
          const ok = [
            fieldError(form, 'title', !pick ? 'Pick or type the role you are hiring for.' : pick.title.length < 3 || pick.title.length > 60 ? 'Use 3 to 60 characters.' : roleTextIssue(pick.title)),
            fieldError(form, 'company', company && (company.length < 2) ? 'Use at least 2 characters.' : roleTextIssue(company)),
            fieldError(form, 'about', wordCount(text) > ABOUT_WORDS_MAX ? `Keep it to ${ABOUT_WORDS_MAX} words.` : roleTextIssue(text)),
          ].every(Boolean);
          if (!ok) { form.querySelector('.hiring-error:not([hidden])')?.closest('.hiring-field, .profile-edit-picker')?.querySelector('input, textarea')?.focus(); return; }
          const submit = form.querySelector('[type="submit"]');
          setBusy(submit, true, 'Saving…');
          const { error } = await rpc('save_hiring_role', {
            p_id: role?.id || null, p_title: pick.title, p_family: pick.family, p_level: form.level.value,
            p_work_mode: form.work_mode.value, p_help: form.help.value, p_company: company || null, p_about: text || null,
          });
          setBusy(submit, false, role ? 'Save role' : 'Post role');
          if (error) {
            const msg = String(error.message || '');
            if (msg.includes('no links')) fieldError(form, 'about', 'Links and contact details go in chat, after you connect.');
            else if (msg.includes('about too long')) fieldError(form, 'about', `Keep it to ${ABOUT_WORDS_MAX} words.`);
            else showToast('Your role could not be saved. Please try again.');
            return;
          }
          close();
          await reloadMine();
          const live = state.roles.some((r) => r.banner_live);
          showToast(role ? 'Role saved.' : live ? 'Your role is up. Members open to it will see it.' : 'Your role is saved. It shows once your profile has a photo and a confirmed email.');
          deps.onRolePosted?.();
        });
      },
    });
  };

  // Manage one role: edit, pause or reopen, renew, close.
  const openManage = (role, opener) => {
    const left = daysLeft(role.expires_at);
    const state1 = role.paused_by_report ? 'Paused while we review a report' : role.status === 'paused' ? 'Paused by you' : `Open · ${left} day${left === 1 ? '' : 's'} left`;
    const html = `<p class="hiring-eyebrow">Your role</p><h2>${esc(role.title)}</h2><p class="hiring-lede">${esc(roleMeta(role))} · ${esc(helpBadge(role.help))}</p>`
      + `<p class="hiring-state-line">${esc(state1)}${role.waiting_asks ? ` · ${role.waiting_asks} ask${role.waiting_asks === 1 ? '' : 's'} waiting` : ''}</p>`
      + '<div class="hiring-actions">'
      + '<button type="button" class="hiring-row-action" data-act="edit">Edit role</button>'
      + (role.status === 'open' ? '<button type="button" class="hiring-row-action" data-act="pause">Pause<small>Hide it for now; asks stay</small></button>'
        : role.paused_by_report ? '' : '<button type="button" class="hiring-row-action" data-act="open">Reopen</button>')
      + (needsRenewal(role) ? '<button type="button" class="hiring-row-action" data-act="renew">Keep it open 30 more days</button>' : '')
      + '<button type="button" class="hiring-row-action is-danger" data-act="close">Close role<small>Filled, or no longer hiring</small></button>'
      + '</div>';
    openSheet({
      label: `Manage ${role.title}`, html, opener,
      onReady: (dialog, close) => {
        dialog.querySelector('.hiring-actions').addEventListener('click', async (event) => {
          const button = event.target.closest('[data-act]');
          if (!button) return;
          const act = button.dataset.act;
          if (act === 'edit') { close(); openRoleSheet(role, opener); return; }
          if (act === 'close' && !button.dataset.confirm) {
            button.dataset.confirm = '1';
            button.innerHTML = 'Tap again to close it<small>Members who asked will see it closed</small>';
            return;
          }
          button.disabled = true;
          const { error } = await rpc('set_hiring_role_status', { p_id: role.id, p_action: act });
          button.disabled = false;
          if (error) {
            showToast(String(error.message).includes('answer_asks_first') ? 'Answer the asks waiting on this role first, then keep it open.' : 'That didn\'t save. Please try again.');
            return;
          }
          close();
          await reloadMine();
          showToast({ pause: 'Role paused.', open: 'Role reopened.', renew: 'Role open for 30 more days.', close: 'Role closed.' }[act]);
        });
      },
    });
  };

  // Roles you're open to (a seeker).
  const openIntentSheet = (opener) => {
    const intent = state.intent;
    const modes = intent?.work_modes || ['hybrid', 'remote'];
    const modeChoice = (id, text) => `<label class="hiring-check"><input type="checkbox" name="mode" value="${id}"${modes.includes(id) ? ' checked' : ''} /><span>${esc(text)}</span></label>`;
    const radio = (value, title, line) => `<label class="hiring-radio"><input type="radio" name="visibility" value="${value}"${(intent?.visibility || 'hirers') === value ? ' checked' : ''} /><span><strong>${title}</strong><span>${line}</span></span></label>`;
    const html = '<p class="hiring-eyebrow">Job opportunities</p><h2>What roles are <em>you open to?</em></h2><p class="hiring-lede">We\'ll show you members hiring for these, nearest first.</p>'
      + '<form class="hiring-form" novalidate>'
      + chipPickerMarkup({ id: 'hiring-intent-pick', label: 'ROLES · UP TO 3', listLabel: 'Roles you are open to', placeholder: 'Add a role: pick or type', helper: 'Up to 3. Only you and hirers see these.' })
      + '<p class="hiring-error" data-error="titles" hidden></p>'
      + `<div class="hiring-field"><label class="hiring-label" for="hiring-want-level">Level</label><select class="b-select" id="hiring-want-level" name="level"><option value="">Any level</option>${LEVELS.map(([id, text]) => `<option value="${id}"${id === (intent?.level || '') ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></div>`
      + `<fieldset class="hiring-field"><legend class="hiring-label">Where</legend><div class="hiring-checks">${MODES.map(([id, text]) => modeChoice(id, text)).join('')}</div><p class="hiring-error" data-error="modes" hidden></p></fieldset>`
      + `<fieldset class="hiring-field"><legend class="hiring-label">Who can see this</legend>${radio('hirers', 'Only members who are hiring', 'Recommended. Your card never says you are looking.')}${radio('everyone', 'Everyone', '"Open to roles" shows on your profile.')}</fieldset>`
      + `<label class="hiring-switch"><span><strong>Let hirers find me</strong><span>Hirers with a fitting role may see your card first.</span></span><input type="checkbox" role="switch" name="findable"${intent?.findable ? ' checked' : ''} /><i aria-hidden="true"></i></label>`
      + `<div class="hiring-field"><label class="hiring-label" for="hiring-private-company">Your current company <span class="hiring-optional">private, never shown</span></label><input class="b-field" id="hiring-private-company" name="company" maxlength="60" autocomplete="organization" value="${esc(intent?.private_company || '')}" /><p class="hiring-help">Members hiring at this company never see that you're open to roles.</p></div>`
      + '<button type="submit" class="hiring-primary"><span data-label>Save</span></button>'
      + (intent ? '<button type="button" class="hiring-secondary" data-withdraw>Stop showing me roles</button>' : '')
      + '</form>';
    openSheet({
      label: 'Roles you are open to', html, opener,
      onReady: (dialog, close) => {
        const form = dialog.querySelector('form');
        const picker = wireChipPicker(dialog.querySelector('[data-picker="hiring-intent-pick"]'), { max: 3, allowCustom: true, emptyText: 'No roles yet.' });
        picker.load({ picks: intent?.titles || [], options: ROLE_TITLES.map((t) => ({ id: t, label: t })) });
        dialog.querySelector('[data-withdraw]')?.addEventListener('click', async () => {
          const { error } = await rpc('withdraw_role_intent');
          if (error) { showToast('That didn\'t save. Please try again.'); return; }
          close(); await reloadMine(); showToast('Done. Your roles are removed.');
        });
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const roles = picker.picks.map(roleFor).filter(Boolean);
          const modesPicked = [...form.querySelectorAll('[name="mode"]:checked')].map((i) => i.value);
          const ok = [
            fieldError(form, 'titles', roles.length ? roles.map((r) => roleTextIssue(r.title)).find(Boolean) || '' : 'Add at least one role.'),
            fieldError(form, 'modes', modesPicked.length ? '' : 'Pick at least one.'),
          ].every(Boolean);
          if (!ok) return;
          const submit = form.querySelector('[type="submit"]');
          setBusy(submit, true, 'Saving…');
          const { error } = await rpc('save_role_intent', {
            p_titles: roles.map((r) => r.title), p_families: [...new Set(roles.map((r) => r.family))], p_level: form.level.value || null,
            p_work_modes: modesPicked, p_visibility: form.visibility.value, p_findable: form.findable.checked,
            p_private_company: form.company.value.trim() || null,
          });
          setBusy(submit, false, 'Save');
          if (error) { showToast('Your roles could not be saved. Please try again.'); return; }
          close();
          await reloadMine();
          state.cache.clear();
          showToast(state.suggestions.length ? `Saved. ${state.suggestions.length} ${state.suggestions.length === 1 ? 'person is' : 'people are'} hiring near you.` : 'Saved. We\'ll show you who\'s hiring near you.');
          onChange('cards');
        });
      },
    });
  };

  // Ask about this role.
  const openAskSheet = (person, role, opener) => {
    const first = String(person.name || 'them').split(/\s+/)[0];
    const signals = deps.signalsLeft?.();
    const asksToday = state.askCountToday ?? null;
    const html = `<p class="hiring-eyebrow">Ask about a role</p><h2>Introduce yourself <em>to ${esc(first)}.</em></h2>`
      + `<span class="hiring-tag"><span class="hiring-icon">${BAG_ICON}</span>${esc(role.title)} · ${esc(modeLabel(role.work_mode))}</span>`
      + `<form class="hiring-form" novalidate><div class="hiring-field"><label class="hiring-label" for="hiring-ask-note">Your note<span class="hiring-count" data-count>0 / ${ASK_MAX}</span></label>`
      + `<textarea class="b-field" id="hiring-ask-note" name="note" rows="4" maxlength="${ASK_MAX}" placeholder="Say what you do and why this role." aria-describedby="hiring-ask-help"></textarea>`
      + `<p class="hiring-help" id="hiring-ask-help">${esc(first)} sees your profile and this note. It becomes your first message if they connect.</p><p class="hiring-error" data-error="note" hidden></p></div>`
      + `<p class="hiring-safety">${SHIELD_ICON}<span>${esc(SAFETY_LINE)}</span></p>`
      + '<button type="submit" class="hiring-primary"><span data-label>Send ask</span> <span aria-hidden="true">→</span></button>'
      + `<p class="hiring-note" data-foot>${esc(askFootLine(signals, asksToday == null ? 3 : Math.max(0, 3 - asksToday)))}</p></form>`;
    openSheet({
      label: `Ask ${first} about ${role.title}`, html, opener,
      onReady: (dialog, close) => {
        const form = dialog.querySelector('form');
        const note = form.note;
        const count = form.querySelector('[data-count]');
        note.addEventListener('input', () => { count.textContent = `${note.value.length} / ${ASK_MAX}`; });
        window.setTimeout(() => note.focus(), 0);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const text = note.value.trim();
          if (!fieldError(form, 'note', text.length < ASK_MIN ? `Write at least ${ASK_MIN} characters, so ${first} knows why you're asking.` : '')) { note.focus(); return; }
          const submit = form.querySelector('[type="submit"]');
          setBusy(submit, true, 'Sending…');
          const { data, error } = await rpc('ask_about_role', { p_role: role.id, p_note: text });
          setBusy(submit, false, 'Send ask');
          if (error) { fieldError(form, 'note', askErrorText(error)); return; }
          const row = (data || [])[0] || {};
          state.askCountToday = 3 - (Number(row.asks_left) || 0);
          role.asked = true;
          deps.onSignalSpent?.(row);
          close();
          // The asked role's button becomes a quiet "Asked"; focus stays in the banner, not on a removed button.
          let landing = null;
          document.querySelectorAll(`[data-hiring-ask="${CSS.escape(String(role.id))}"]`).forEach((b) => {
            const done = Object.assign(document.createElement('span'), { className: 'hiring-asked', textContent: 'Asked', tabIndex: -1 });
            b.replaceWith(done);
            landing = done;
          });
          landing?.focus({ preventScroll: true });
          showToast(row.status === 'matched' ? `You and ${first} are connected. Your note is in your chat.` : `Ask sent. ${first} will see it with your profile.`);
          onChange('asked');
        });
      },
    });
  };

  // --- My profile ---------------------------------------------------------------------------------------------------
  // "You're hiring" (a hirer), or "Open to roles" (a seeker), or a prompt when Looking for says so and nothing is set.
  const renderOwnCard = (section, eyebrow) => {
    if (!section) return;
    const values = me()?.lookingFor || '';
    const wants = lookingForRoles(values);
    if (!state.available || (!isHirer() && !isSeeker() && !wants.hirer && !wants.seeker)) { section.hidden = true; section.innerHTML = ''; if (eyebrow) eyebrow.innerHTML = 'MEMBER'; return; }
    section.hidden = false;
    let html = '';
    if (isHirer() || wants.hirer) {
      const live = state.roles.some((r) => r.banner_live);
      const waiting = state.roles.reduce((n, r) => n + (Number(r.waiting_asks) || 0), 0);
      const rows = state.roles.map((r) => {
        const left = daysLeft(r.expires_at);
        const line = [modeLabel(r.work_mode), levelLabel(r.level), r.waiting_asks ? `${r.waiting_asks} ask${r.waiting_asks === 1 ? '' : 's'} waiting` : '', r.status === 'open' ? `${left} day${left === 1 ? '' : 's'} left` : r.paused_by_report ? 'under review' : 'paused by you'].filter(Boolean).join(' · ');
        const pill = r.status === 'open' ? '<span class="hiring-state">Open</span>' : '<span class="hiring-state is-paused">Paused</span>';
        return `<li><button type="button" class="hiring-card-row" data-hiring-manage="${esc(r.id)}" aria-label="Manage ${esc(r.title)}"><span class="hiring-card-row-copy"><strong>${esc(r.title)}</strong><span>${esc(line)}</span></span><span class="hiring-row-end">${pill}<span class="hiring-chev" aria-hidden="true">›</span></span></button></li>`;
      }).join('');
      const renewal = state.roles.find((r) => r.status === 'open' && needsRenewal(r));
      html += `<div class="profile-card-head"><h2 class="profile-card-title" id="profile-hiring-title">You're hiring</h2><span class="profile-checklist-count">${state.roles.length} role${state.roles.length === 1 ? '' : 's'}</span></div>`
        + (rows ? `<ul class="hiring-card-roles">${rows}</ul>` : '<p class="profile-card-empty">Add the role you\'re hiring for, so members open to it can find you.</p>')
        + (renewal ? `<p class="hiring-card-alert">Still hiring a ${esc(renewal.title)}? It closes in ${daysLeft(renewal.expires_at)} day${daysLeft(renewal.expires_at) === 1 ? '' : 's'}.</p>` : '')
        + '<div class="hiring-card-actions">'
        + (waiting ? `<button class="profile-card-action" type="button" data-hiring-review>Review ${waiting} ask${waiting === 1 ? '' : 's'}</button>` : '')
        + '<button class="profile-card-action" type="button" data-hiring-add>Add a role</button>'
        + '</div>'
        + (state.roles.length ? `<p class="hiring-card-note">${live ? 'Your card shows "HIRING" to everyone. Members open to this kind of role see it first.' : 'Your banner goes live once your profile has a photo and a confirmed email.'}</p>` : '');
    }
    if (isSeeker() || (wants.seeker && !isHirer())) {
      const intent = state.intent;
      const near = state.suggestions.length;
      if (html) html += '<hr class="hiring-card-rule" />';
      html += `<div class="profile-card-head"><h2 class="profile-card-title"${html ? '' : ' id="profile-hiring-title"'}>Open to roles</h2>${near ? `<span class="profile-checklist-count">${near} hiring near you</span>` : ''}</div>`
        + (intent
          ? `<ul class="hiring-pill-row">${intent.titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="hiring-card-note">${esc([levelLabel(intent.level) || 'Any level', intent.work_modes.map(modeLabel).join(' or ')].join(' · '))}</p>`
            + `<p class="hiring-private">${LOCK_ICON}${intent.visibility === 'everyone' ? 'Everyone can see this' : 'Only members who are hiring see this'}</p>`
          : '<p class="profile-card-empty">Say which roles you\'re open to, and we\'ll show you who\'s hiring for them nearby.</p>')
        + '<div class="hiring-card-actions">'
        + (intent && near ? '<button class="profile-card-action" type="button" data-hiring-lens>See who\'s hiring</button>' : '')
        + `<button class="profile-card-action" type="button" data-hiring-intent>${intent ? 'Edit' : 'Add your roles'}</button></div>`;
    }
    section.innerHTML = html;
    if (eyebrow) eyebrow.innerHTML = state.roles.some((r) => r.banner_live && r.status === 'open') ? `<span class="hiring-bar-icon">${BAG_ICON}</span>HIRING` : 'MEMBER';
  };
  const bindOwnCard = (section) => {
    section?.addEventListener('click', (event) => {
      const t = event.target;
      const manage = t.closest('[data-hiring-manage]');
      if (manage) { const role = state.roles.find((r) => String(r.id) === manage.dataset.hiringManage); if (role) openManage(role, manage); return; }
      if (t.closest('[data-hiring-add]')) { openRoleSheet(null, t.closest('button')); return; }
      if (t.closest('[data-hiring-intent]')) { openIntentSheet(t.closest('button')); return; }
      if (t.closest('[data-hiring-review]')) { deps.openRequests?.(); return; }
      if (t.closest('[data-hiring-lens]')) deps.showLens?.();
    });
  };

  // After Edit profile saves Looking for: open the matching sheet once; removing the value tidies up.
  const afterLookingForSaved = async (next, previous) => {
    await boot();
    if (!state.available) return;
    const now = lookingForRoles(next);
    const before = lookingForRoles(previous);
    if (now.hirer && !before.hirer && !isHirer()) { openRoleSheet(); return; }
    if (now.seeker && !before.seeker && !isSeeker()) { openIntentSheet(); return; }
    if (!now.seeker && before.seeker && isSeeker()) {
      await rpc('withdraw_role_intent'); await reloadMine(); showToast('Your roles are removed.');
    }
    if (!now.hirer && before.hirer && openRoles().length) {
      if (!window.confirm(`Close your ${openRoles().length === 1 ? 'open role' : `${openRoles().length} open roles`} too? Members who asked will see it closed.`)) return;
      await Promise.all(state.roles.map((r) => rpc('set_hiring_role_status', { p_id: r.id, p_action: 'close' })));
      await reloadMine(); showToast('Your hiring roles are closed.');
    }
  };

  // --- Requests, notifications, lens, report ----------------------------------------------------------------------
  const requestRoleTitle = (fromId) => state.askTags.get(String(fromId)) || '';
  const refreshAsks = () => loadAsks();
  const notificationRow = () => {
    if (!state.available || !isSeeker()) return null;
    return hiringRowModel({ suggestions: state.suggestions, seen: store.get(seenKey(), []), lastShownDay: store.get(dayKey(), ''), today: today() });
  };
  const closedAskRows = () => state.sentAsks.filter((a) => a.role_status === 'closed' && a.closed_at && Date.now() - new Date(a.closed_at).getTime() < 7 * 86400000
    && !store.get(seenKey(), []).includes(`closed:${a.role_id}`));
  const notificationHtml = () => {
    const row = notificationRow();
    let html = '';
    if (row) {
      html += `<section class="notification-companion notification-hiring is-unread" aria-label="${esc(row.text)}"><span class="notification-nearby-face"><span class="notification-hiring-face">${BAG_ICON}</span></span>`
        + `<span class="notification-nearby-copy"><strong>${esc(row.text)}</strong><span>${esc(row.detail)}</span></span>`
        + '<button type="button" class="notification-nearby-hi" data-hiring-row>See them</button></section>';
    }
    html += closedAskRows().map((a) => {
      const person = findPersonById(a.hirer_id);
      const first = String(person?.name || 'A hirer').split(/\s+/)[0];
      return `<section class="notification-companion notification-hiring" aria-label="${esc(`${first} closed the ${a.role_title} role`)}"><span class="notification-nearby-face"><span class="notification-hiring-face">${BAG_ICON}</span></span>`
        + `<span class="notification-nearby-copy"><strong>${esc(`${first} closed the ${a.role_title} role`)}</strong><span>Your request is still with them.</span></span>`
        + `<button type="button" class="notification-nearby-hi" data-hiring-closed="${esc(a.role_id)}">OK</button></section>`;
    }).join('');
    return html;
  };
  const notificationCount = () => (notificationRow() ? 1 : 0);
  const bindNotifications = (list, closePanel) => {
    list.querySelector('[data-hiring-row]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const row = notificationRow();
      if (row) { store.set(seenKey(), [...new Set([...store.get(seenKey(), []), ...row.ids])].slice(-200)); store.set(dayKey(), today()); }
      closePanel();
      deps.showLens?.();
    });
    list.querySelectorAll('[data-hiring-closed]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      store.set(seenKey(), [...store.get(seenKey(), []), `closed:${button.dataset.hiringClosed}`].slice(-200));
      deps.onNotificationsChange?.();
    }));
  };
  // The Hiring lens: a seeker sees only hirers whose roles fit; anyone else, everyone who is hiring.
  // D-174: the lens shows everyone who is hiring (roles that fit come first in hiring_people's order).
  const lensLabel = () => 'Only people who are hiring';
  // hiring_people: D-184 (0054) pages through everyone hiring or open to roles, anywhere, best fit first
  // ({ rows, end }; after = { score, id } of the last row seen). Before 0054 the D-169 call (200 hirers, one page).
  // null when the RPC is not there yet.
  const PAGE = 30;
  let paged = true;
  const findPeople = async (after = null) => {
    await boot();
    if (!state.available) return null;
    if (paged) {
      const { data, error } = await rpc('hiring_people', { p_limit: PAGE, p_after_score: after?.score ?? null, p_after_id: after?.id ?? null });
      if (!error) return { rows: data || [], end: (data || []).length < PAGE };
      if (!['PGRST202', '42883'].includes(error.code)) return null;
      paged = false;                                   // before 0054: the single-page call
    }
    if (after) return { rows: [], end: true };
    const { data, error } = await rpc('hiring_people', { p_limit: 200 });
    if (error) return null;
    return { rows: data || [], end: true };
  };
  const matchesLens = (person) => {
    const hiring = hiringOf(person?.id);
    return Boolean(hiring);
  };
  const suggestionIds = () => state.suggestions.map((s) => String(s.id));
  const reportFakeJob = async (personId, note) => {
    const { error } = await rpc('report_fake_job', { p_target: personId, p_note: note || null });
    if (!error) state.cache.delete(String(personId));
    return { error };
  };

  return {
    state, boot, ensure, hiringOf, decorateCard, decorateProfile, renderOwnCard, bindOwnCard, openRoleSheet, openIntentSheet,
    openAskSheet, afterLookingForSaved, requestRoleTitle, refreshAsks, notificationHtml, notificationCount, bindNotifications,
    lensLabel, matchesLens, findPeople, suggestionIds, reportFakeJob, available: () => state.available === true, isSeeker, isHirer,
    reloadMine,
  };
};
