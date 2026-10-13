// "Your area": the city picker and "Use my location", shared by the guided signup (signup-profile-screens.js) and the
// old 4-step form (script.js, until Phase E Task 5 retires it). No DOM or storage at import time, so the pure parts
// (matchTypedCity, areaPickerHtml) are unit-tested under node.
//
// Privacy (CLAUDE.md, Review Focus 4): coordinates live only in the picker's in-memory choice. They are never written
// to localStorage / sessionStorage, the URL, the DOM or a log, and are dropped (keep()) as soon as the server has the
// cell.

// "Pick my city": what a typed city means when the member presses Next or Enter without clicking a suggestion.
// Chosen only when it is unambiguous: the one listed option whose name (or "name, region") starts with the typed text,
// or the one whose name (or "name, region") equals it, ignoring case and surrounding spaces. Otherwise null: the
// member picks from the list (a fuzzy or region-only hit is never committed silently).
const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const matchTypedCity = (typed, options) => {
  const text = norm(typed);
  const list = Array.isArray(options) ? options : [];
  if (!text || !list.length) return null;
  if (list.length === 1) return norm(list[0]?.name).startsWith(text) || norm(`${list[0]?.name}, ${list[0]?.region}`).startsWith(text) ? list[0] : null;
  const exact = list.filter((place) => norm(place?.name) === text || norm(`${place?.name}, ${place?.region}`) === text);
  return exact.length === 1 ? exact[0] : null;
};

export const AREA_FALLBACK_TEXT = 'No problem. Pick your city instead.';
export const AREA_SAVE_ERROR = "We couldn't save your area. Please try again.";
export const AREA_RATE_LIMITED = 'Try again later.';
const GEO_OPTIONS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 };
const GEO_GUARD_MS = 15000;  // a permission prompt that is never answered must not strand the member

// HTML-escapes text for the markup strings here and in script.js.
export const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const PIN = '<svg class="area-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>';
const SEARCH = '<svg class="area-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>';
const SHIELD = '<svg class="area-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>';

// The picker's markup (the old step 2 markup, ids prefixed so two pickers never share an id). `explainer` adds the
// privacy explainer and the "How we use your data" link that the old form shows above the options.
export const areaPickerHtml = ({ prefix = 'area', explainer = false } = {}) => {
  const id = (name) => `${prefix}-${name}`;
  return `${explainer ? `<p class="area-explainer" data-area-explainer>${SHIELD}<span>We keep only a rough ~2 km square, never your exact location. Other members see a rounded distance once enough people are nearby; until then they see your city.</span></p>
<p class="privacy-link"><a href="/privacy.html" target="_blank" rel="noopener">How we use your data</a></p>` : ''}
<div class="area-options">
  <button class="area-option" type="button" data-area-geo>${PIN}<span>Use my location</span></button>
  <button class="area-option" type="button" data-area-city aria-controls="${id('city-panel')}" aria-expanded="false">${SEARCH}<span>Pick my city</span></button>
</div>
<div class="area-city" id="${id('city-panel')}" data-area-picker hidden>
  <p class="area-fallback" data-area-fallback></p>
  <label class="area-city-label" for="${id('city-search')}">Your city</label>
  <p class="area-city-hint" id="${id('city-hint')}">Type your city, then pick it from the list.</p>
  <input class="area-city-search" id="${id('city-search')}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id('city-results')}" aria-describedby="${id('city-hint')}" autocomplete="off" spellcheck="false" placeholder="Start typing your city" />
  <ul class="area-city-results" id="${id('city-results')}" role="listbox" aria-label="Cities"></ul>
</div>
<p class="area-status" data-area-status role="status" aria-live="polite"></p>
<p class="area-error" data-area-error aria-live="assertive"></p>`;
};

// Wires the picker inside `root` (markup from areaPickerHtml). searchPlaces(query) resolves { data, error } (supabase.js).
// The choice is { kind: 'geo', lat, lng } | { kind: 'city', placeId, label } | { kind: 'keep', label } (a cell is stored).
export const createAreaPicker = (root, { searchPlaces, onChange = () => {} } = {}) => {
  const q = (selector) => root?.querySelector(selector) || null;
  const geoButton = q('[data-area-geo]');
  const cityButton = q('[data-area-city]');
  const picker = q('[data-area-picker]');
  const fallback = q('[data-area-fallback]');
  const search = q('[role="combobox"]');
  const results = q('[role="listbox"]');
  const status = q('[data-area-status]');
  const error = q('[data-area-error]');
  const prefix = results?.id ? results.id.replace(/-city-results$/, '') : 'area';
  let choice = null;
  let options = [];
  let active = -1;
  let seq = 0;
  let timer = 0;
  let geoPending = false;
  let geoGuard = 0;
  let alive = true;

  const setStatus = (text) => { if (status) status.textContent = text; };
  const setError = (text) => { if (error) error.textContent = text || ''; };
  const setChoice = (next) => { choice = next; onChange(choice); };
  const setListOpen = (open) => {
    search?.setAttribute('aria-expanded', String(open));
    results?.toggleAttribute('hidden', !open);
    if (!open) { active = -1; search?.removeAttribute('aria-activedescendant'); }
  };
  const highlight = (index) => {
    const list = [...(results?.querySelectorAll('[role="option"]') || [])];
    if (!list.length) return;
    active = (index + list.length) % list.length;
    list.forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
    search?.setAttribute('aria-activedescendant', list[active].id);
    list[active].scrollIntoView({ block: 'nearest' });
  };
  const renderResults = async () => {
    if (!search || !results || typeof searchPlaces !== 'function') return;
    const mine = ++seq;
    const { data, error: failed } = await searchPlaces(search.value);
    if (mine !== seq || !alive) return;
    options = failed ? [] : (data || []);
    results.innerHTML = options.length
      ? options.map((place, i) => `<li class="area-city-option" role="option" id="${prefix}-city-option-${i}" aria-selected="false" data-place-index="${i}"><span>${escapeText(place.name)}</span><small>${escapeText(place.region)}</small></li>`).join('')
      : `<li class="area-city-empty" role="presentation">${failed ? 'Cities could not load. Check your connection and try again.' : 'No city found. Try the nearest larger city.'}</li>`;
    setListOpen(true);
    active = -1;
  };
  const chooseCity = (place) => {
    if (!place) return;
    setChoice({ kind: 'city', placeId: place.id, label: `${place.name}, ${place.region}` });
    if (search) search.value = place.name;
    setListOpen(false);
    setError('');
    setStatus(`Your area: ${place.name}, ${place.region}. We use the city's centre, never your address.`);
  };
  const openPicker = (fallbackText = '') => {
    if (!picker) return;
    picker.hidden = false;
    cityButton?.setAttribute('aria-expanded', 'true');
    if (fallback) fallback.textContent = fallbackText;
    search?.focus();
    void renderResults();
  };
  const useMyLocation = () => {
    if (geoPending) return;
    setError('');
    const geo = window.isSecureContext ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== 'function') { setStatus(''); openPicker(AREA_FALLBACK_TEXT); return; }
    geoPending = true;
    geoButton?.setAttribute('aria-busy', 'true');
    setStatus('Finding your area…');
    let settled = false;
    const fallBack = () => {
      if (settled || !alive) return;
      settled = true;
      geoPending = false;
      geoButton?.removeAttribute('aria-busy');
      setStatus('');
      openPicker(AREA_FALLBACK_TEXT);
    };
    geoGuard = window.setTimeout(fallBack, GEO_GUARD_MS);
    try {
      geo.getCurrentPosition((position) => {
        window.clearTimeout(geoGuard);
        if (settled || !alive) return;
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { fallBack(); return; }
        settled = true;
        geoPending = false;
        geoButton?.removeAttribute('aria-busy');
        setChoice({ kind: 'geo', lat, lng });
        if (picker) picker.hidden = true;
        cityButton?.setAttribute('aria-expanded', 'false');
        setStatus("Got it. We keep only the ~2 km square you're in.");
      }, () => { window.clearTimeout(geoGuard); fallBack(); }, GEO_OPTIONS);
    } catch {
      window.clearTimeout(geoGuard);
      fallBack();
    }
  };

  const onCity = () => openPicker('');
  const onInput = () => {
    // The visible options no longer match what was typed: drop them so Enter cannot pick a stale city.
    seq += 1;
    options = [];
    if (results) results.innerHTML = '';
    setListOpen(false);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void renderResults(), 150);
  };
  const onFocus = () => { if (!results?.children.length) void renderResults(); };
  const onKeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (search.getAttribute('aria-expanded') !== 'true') { void renderResults(); return; }
      highlight(active + (event.key === 'ArrowDown' ? 1 : -1) + (active < 0 && event.key === 'ArrowUp' ? 1 : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();  // never submit a form (or press Next) from the city search
      event.stopPropagation();
      if (active >= 0) chooseCity(options[active]);
      else chooseCity(matchTypedCity(search.value, options));
    } else if (event.key === 'Escape' && search.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      event.stopPropagation();
      setListOpen(false);
    }
  };
  const onResultsDown = (event) => event.preventDefault();  // keep focus in the input
  const onResultsClick = (event) => {
    const option = event.target.closest('[data-place-index]');
    if (option) chooseCity(options[Number(option.dataset.placeIndex)]);
  };
  geoButton?.addEventListener('click', useMyLocation);
  cityButton?.addEventListener('click', onCity);
  search?.addEventListener('input', onInput);
  search?.addEventListener('focus', onFocus);
  search?.addEventListener('keydown', onKeydown);
  results?.addEventListener('mousedown', onResultsDown);
  results?.addEventListener('click', onResultsClick);

  return {
    get choice() { return choice; },
    setError,
    // Back to nothing chosen (the old form's reset).
    reset() {
      setChoice(null);
      geoPending = false;
      window.clearTimeout(geoGuard);
      geoButton?.removeAttribute('aria-busy');
      if (picker) picker.hidden = true;
      cityButton?.setAttribute('aria-expanded', 'false');
      if (fallback) fallback.textContent = '';
      if (search) search.value = '';
      if (results) results.innerHTML = '';
      setListOpen(false);
      setStatus('');
      setError('');
    },
    // The server has a cell (just saved, or from an earlier visit): forget any coordinates, keep only the label.
    keep(label) {
      setChoice({ kind: 'keep', label: label || '' });
      setStatus(label ? `Your area: ${label}. Choose again to change it.` : 'Your area is set. Choose again to change it.');
    },
    // A city typed but no list yet (Next pressed right after typing): true when settle() has a search to finish.
    needsSettle: () => Boolean(!choice && search?.value.trim() && !options.length),
    async settle() { window.clearTimeout(timer); await renderResults(); },
    // Next: a typed city that is unambiguous counts as picked. Returns the choice, or null with the error shown.
    commit() {
      if (choice) return choice;
      chooseCity(matchTypedCity(search?.value, options));
      if (choice) return choice;
      setError(search?.value.trim() && picker && !picker.hidden ? 'Pick your city from the list below.' : 'Choose your area to continue.');
      return null;
    },
    destroy() {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(geoGuard);
      geoButton?.removeEventListener('click', useMyLocation);
      cityButton?.removeEventListener('click', onCity);
      search?.removeEventListener('input', onInput);
      search?.removeEventListener('focus', onFocus);
      search?.removeEventListener('keydown', onKeydown);
      results?.removeEventListener('mousedown', onResultsDown);
      results?.removeEventListener('click', onResultsClick);
    },
  };
};
