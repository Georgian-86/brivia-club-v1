// Create Event (D-121, migration 0022): the "Bring people together." dialog on Explore. One <dialog> holds the form
// (left), the live card preview (right from 1080 px; under "Preview event" below that) and a three-action footer: Save
// as draft, Preview event, Publish event. The rules live in event-form.js (pure, unit-tested); the server repeats
// them in save_member_event, and a server error that names a field lands on that field.
//
// Images upload as soon as they are chosen (own folder of the event-posters bucket); files that end up unused (replaced,
// removed or the dialog discarded) are removed again. The venue pin is sent once and only its ~2 km cell is kept.
import {
  EVENT_FORM_CATEGORIES, LIMITS, POSTER_TYPES, emptyDraft, draftFromEvent, validateEventDraft, firstErrorField,
  toServerFields, serverErrorField, serverErrorMessage, imageFileProblem, previewEvent, todayIst,
} from './event-form.js';
import { eventCardMarkup, eventDetailMarkup } from './events-view.js';
import { eventImageSrc } from './event-assets.js';
import { locateOnce, fallbackCopy } from './geo-locate.js';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const IMAGE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';

const field = (name, label, control, { hint = '', optional = false, wide = false } = {}) => `<div class="ec-field${wide ? ' is-wide' : ''}" data-field="${name}">
  <label for="ec-${name}">${esc(label)}${optional ? ' <span class="ec-optional">Optional</span>' : ''}</label>
  ${control}
  ${hint ? `<p class="ec-hint" id="ec-${name}-hint">${hint}</p>` : ''}
  <p class="event-field-error" id="ec-${name}-error"></p>
</div>`;
const describedBy = (name, hint = false) => `aria-describedby="${hint ? `ec-${name}-hint ` : ''}ec-${name}-error"`;

const shellMarkup = () => `<div class="ec-shell">
  <div class="ec-head">
    <div>
      <p class="app-eyebrow" id="ec-eyebrow">EXPLORE / NEW EVENT</p>
      <h2 id="event-create-title">Bring people <em>together.</em></h2>
      <p class="ec-sub">Create an experience worth showing up for.</p>
    </div>
    <button type="button" class="ec-close" data-ec-close aria-label="Close">×</button>
  </div>
  <div class="ec-discard" data-ec-discard-bar hidden role="alertdialog" aria-labelledby="ec-discard-copy">
    <p id="ec-discard-copy">Discard your changes to this event?</p>
    <button type="button" class="event-btn event-btn-ghost" data-ec-keep>Keep editing</button>
    <button type="button" class="event-btn event-btn-primary" data-ec-discard>Discard</button>
  </div>
  <div class="ec-body">
    <form class="ec-form" id="ec-form" novalidate>
      <p class="ec-form-error" id="ec-form-error" role="alert"></p>
      <section class="ec-section" aria-labelledby="ec-s1">
        <h3 id="ec-s1"><span aria-hidden="true">01</span>The basics</h3>
        ${field('title', 'Event name', `<input id="ec-title" name="title" type="text" maxlength="${LIMITS.title}" autocomplete="off" placeholder="Bangalore Chess Meetup" required ${describedBy('title')} />`)}
        <fieldset class="ec-field ec-categories" data-field="category" aria-describedby="ec-category-error">
          <legend>Category</legend>
          <div class="ec-chips">${EVENT_FORM_CATEGORIES.map((c) => `<label class="ec-chip"><input type="radio" name="category" value="${c.key}" /><span>${esc(c.label)}</span></label>`).join('')}</div>
          <p class="event-field-error" id="ec-category-error"></p>
        </fieldset>
        ${field('description', 'Description', `<textarea id="ec-description" name="description" rows="5" maxlength="${LIMITS.description}" placeholder="What is it about, what can people expect, and who would love it?" required ${describedBy('description', true)}></textarea>`, { hint: '<span data-ec-count="description">0</span> / 2,000 · what it is, what to expect, who should come' })}
      </section>

      <section class="ec-section" aria-labelledby="ec-s2">
        <h3 id="ec-s2"><span aria-hidden="true">02</span>Date, time &amp; venue</h3>
        <div class="ec-row ec-row-3">
          ${field('date', 'Date', `<input id="ec-date" name="date" type="date" required ${describedBy('date')} />`)}
          ${field('startTime', 'Starts', `<input id="ec-startTime" name="startTime" type="time" step="900" required ${describedBy('startTime')} />`)}
          ${field('endTime', 'Ends', `<input id="ec-endTime" name="endTime" type="time" step="900" required ${describedBy('endTime')} />`)}
        </div>
        <div class="ec-row">
          ${field('venueName', 'Venue name', `<input id="ec-venueName" name="venueName" type="text" maxlength="${LIMITS.venueName}" autocomplete="off" placeholder="Battle Chess Skool" required ${describedBy('venueName')} />`)}
          ${field('city', 'City', `<div class="ec-combo"><input id="ec-city" name="city" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ec-city-list" autocomplete="off" spellcheck="false" placeholder="Start typing your city" required ${describedBy('city', true)} /><ul class="ec-combo-list" id="ec-city-list" role="listbox" aria-label="Cities" hidden></ul></div>`, { hint: 'Choose from the list, so people nearby can find it.' })}
        </div>
        ${field('venueAddress', 'Full address', `<input id="ec-venueAddress" name="venueAddress" type="text" maxlength="${LIMITS.venueAddress}" autocomplete="off" placeholder="Building, street and area" required ${describedBy('venueAddress')} />`)}
        <div class="ec-row">
          ${field('mapUrl', 'Map link', `<input id="ec-mapUrl" name="mapUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://maps.app.goo.gl/…" ${describedBy('mapUrl')} />`, { optional: true })}
          <div class="ec-field ec-pin" data-field="pin">
            <span class="ec-label-like" id="ec-pin-label">Venue pin <span class="ec-optional">Optional</span></span>
            <button type="button" class="ec-pin-button" data-ec-pin aria-describedby="ec-pin-status">${PIN}<span data-ec-pin-text>Pin from where I am</span></button>
            <p class="ec-hint" id="ec-pin-status" role="status">At the venue now? Pin it for better "~km" distances. Only a ~2 km area is saved.</p>
          </div>
        </div>
      </section>

      <section class="ec-section" aria-labelledby="ec-s3">
        <h3 id="ec-s3"><span aria-hidden="true">03</span>Registration</h3>
        <div class="ec-row ec-row-3">
          ${field('capacity', 'Maximum registrations', `<input id="ec-capacity" name="capacity" type="number" inputmode="numeric" min="1" max="${LIMITS.capacityMax}" step="1" placeholder="30" required ${describedBy('capacity', true)} />`, { hint: 'Registrations close when it is full.' })}
          <fieldset class="ec-field ec-fee-toggle" data-field="paid">
            <legend>Entry fee</legend>
            <div class="ec-segment"><label><input type="radio" name="paid" value="free" checked /><span>Free</span></label><label><input type="radio" name="paid" value="paid" /><span>Paid</span></label></div>
            <p class="ec-hint" id="ec-paid-hint" hidden>Locked once people have registered.</p>
          </fieldset>
          <div class="ec-fee-amount" data-ec-fee hidden>
            ${field('fee', 'Amount (INR)', `<div class="ec-money"><span aria-hidden="true">₹</span><input id="ec-fee" name="fee" type="number" inputmode="numeric" min="1" max="${LIMITS.feeMax}" step="1" placeholder="499" ${describedBy('fee', true)} /></div>`, { hint: 'Seats are confirmed only after payment.' })}
          </div>
        </div>
        <details class="ec-contact" data-ec-contact>
          <summary><span>Questions &amp; contact</span><span class="ec-optional">Optional</span></summary>
          <p class="ec-hint">Members can always ask you a question on Brivia. Add a contact here only if you want to share it.</p>
          <div class="ec-row ec-row-3">
            ${field('contactEmail', 'Email', `<input id="ec-contactEmail" name="contactEmail" type="email" autocomplete="off" placeholder="hello@yourclub.in" ${describedBy('contactEmail')} />`)}
            ${field('contactPhone', 'Phone', `<input id="ec-contactPhone" name="contactPhone" type="tel" autocomplete="off" placeholder="+91 98765 43210" ${describedBy('contactPhone')} />`)}
            ${field('contactLink', 'Link', `<input id="ec-contactLink" name="contactLink" type="url" inputmode="url" autocomplete="off" placeholder="https://" ${describedBy('contactLink')} />`)}
          </div>
          <div class="ec-field ec-check" data-field="contactPublic">
            <label><input id="ec-contactPublic" name="contactPublic" type="checkbox" aria-describedby="ec-contactPublic-error" /><span>Show this contact on the event page</span></label>
            <p class="ec-hint">Off: only you can see it.</p>
            <p class="event-field-error" id="ec-contactPublic-error"></p>
          </div>
        </details>
      </section>

      <section class="ec-section" aria-labelledby="ec-s4">
        <h3 id="ec-s4"><span aria-hidden="true">04</span>Poster &amp; photos</h3>
        <div class="ec-field ec-media" data-field="image">
          <div class="ec-drop" data-ec-drop>
            <input class="sr-only" id="ec-poster" type="file" accept="${POSTER_TYPES.join(',')},.jpg,.jpeg,.png,.webp" aria-describedby="ec-image-hint ec-image-error" />
            <label class="ec-drop-empty" for="ec-poster" data-ec-drop-empty>${IMAGE}<strong>Drop your poster here</strong><span>or <u>browse</u> · JPG, PNG or WebP, up to 10 MB</span></label>
            <div class="ec-drop-filled" data-ec-drop-filled hidden>
              <img alt="Event poster preview" data-ec-poster-img />
              <div class="ec-drop-tools"><label for="ec-poster" class="event-btn event-btn-ghost event-btn-sm">Replace</label><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-poster-remove>Remove</button></div>
              <span class="ec-uploading" data-ec-poster-busy hidden>Uploading…</span>
            </div>
          </div>
          <p class="ec-hint" id="ec-image-hint">The poster becomes the card cover. Without one, the card uses a Brivia image for its category.</p>
          <p class="event-field-error" id="ec-image-error"></p>
          <div class="ec-gallery">
            <span class="ec-label-like">Gallery <span class="ec-optional">Optional · up to 6</span></span>
            <ul class="ec-gallery-list" data-ec-gallery></ul>
            <input class="sr-only" id="ec-gallery-input" type="file" multiple accept="${POSTER_TYPES.join(',')},.jpg,.jpeg,.png,.webp" />
          </div>
        </div>
      </section>
    </form>

    <aside class="ec-preview" aria-labelledby="ec-preview-label">
      <p class="app-eyebrow" id="ec-preview-label">LIVE PREVIEW</p>
      <div class="ec-preview-card" data-ec-preview-card inert></div>
      <p class="ec-preview-note">How your card appears on Explore.</p>
    </aside>

    <section class="ec-detail-preview" data-ec-detail-preview hidden aria-labelledby="ec-detail-preview-label">
      <div class="ec-detail-preview-head"><p class="app-eyebrow" id="ec-detail-preview-label">PREVIEW · AS MEMBERS SEE IT</p><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-preview-back>Back to editing</button></div>
      <div class="ec-detail-preview-card event-detail is-preview" data-ec-detail-preview-body inert></div>
    </section>

    <section class="ec-success" data-ec-success hidden tabindex="-1" aria-labelledby="ec-success-title">
      <span class="ec-success-mark" aria-hidden="true">✓</span>
      <p class="app-eyebrow">PUBLISHED</p>
      <h2 id="ec-success-title">It's <em>live.</em></h2>
      <p class="ec-success-copy" data-ec-success-copy></p>
      <div class="ec-success-actions"><button type="button" class="event-btn event-btn-ghost" data-ec-close-done>Done</button><button type="button" class="event-btn event-btn-primary" data-ec-view>View event</button></div>
    </section>
  </div>
  <div class="ec-foot">
    <span class="ec-status" data-ec-status role="status" aria-live="polite"></span>
    <button type="button" class="event-btn event-btn-ghost" data-ec-draft>Save as draft</button>
    <button type="button" class="event-btn event-btn-ghost" data-ec-preview>Preview event</button>
    <button type="button" class="event-btn event-btn-primary" data-ec-publish>Publish event</button>
  </div>
</div>`;

// deps: dialog, api { saveMemberEvent, uploadEventImage, removeEventImages, searchPlaces }, memberId(), organizer()
// -> { id, name, photoUrl }, safeImage(url), toast(msg), isMissing(error), onSaved({ id, published, draft }),
// onView(id), geo (navigator.geolocation), secure (window.isSecureContext).
export const createEventComposer = ({ dialog, api, memberId, organizer, safeImage, toast, isMissing, onSaved, onView, geo, secure }) => {
  if (!dialog) return { open() {} };
  dialog.innerHTML = shellMarkup();
  const $ = (sel) => dialog.querySelector(sel);
  const form = $('#ec-form');
  const formError = $('#ec-form-error');
  const status = $('[data-ec-status]');
  const cityInput = $('#ec-city');
  const cityList = $('#ec-city-list');
  const galleryList = $('[data-ec-gallery]');
  const galleryInput = $('#ec-gallery-input');
  const posterInput = $('#ec-poster');

  let draft = emptyDraft();
  let saved = '';           // JSON of the draft at open / last save (dirty check)
  let tried = false;        // after a failed publish, errors update as the member types
  let busy = 0;             // uploads in flight
  let saving = false;
  let uploads = new Set();  // URLs uploaded in this sitting
  let original = new Set(); // URLs the event had when opened
  let posterLocal = '';     // object URL while the poster uploads
  let returnFocus = null;
  let lastId = null;
  let places = [];
  let activePlace = -1;
  let placeTimer = 0;

  const imagesOf = (d) => [d.imageUrl, ...(d.gallery || [])].filter(Boolean);
  const snapshot = () => JSON.stringify({ ...draft, pin: draft.pin ? 1 : 0 });
  const dirty = () => snapshot() !== saved;

  // Form <-> draft ---------------------------------------------------------------------------------------------------
  const TEXT = ['title', 'description', 'date', 'startTime', 'endTime', 'venueName', 'venueAddress', 'mapUrl', 'capacity', 'fee', 'contactEmail', 'contactPhone', 'contactLink'];
  const fill = () => {
    TEXT.forEach((n) => { const el = form.elements[n]; if (el) el.value = draft[n] ?? ''; });
    cityInput.value = draft.city || '';
    form.querySelectorAll('input[name="category"]').forEach((r) => { r.checked = r.value === draft.category; });
    form.querySelectorAll('input[name="paid"]').forEach((r) => { r.checked = (r.value === 'paid') === Boolean(draft.paid); });
    form.elements.contactPublic.checked = Boolean(draft.contactPublic);
    $('[data-ec-contact]').open = Boolean(draft.contactEmail || draft.contactPhone || draft.contactLink);
    form.elements.date.min = todayIst();
    const feeLocked = draft.registeredCount > 0;
    form.querySelectorAll('input[name="paid"]').forEach((r) => { r.disabled = feeLocked; });
    form.elements.fee.disabled = feeLocked;
    $('#ec-paid-hint').hidden = !feeLocked;
    renderFee(); renderPoster(); renderGallery(); renderPin(); renderCounts();
  };
  const read = () => {
    TEXT.forEach((n) => { const el = form.elements[n]; if (el) draft[n] = el.value; });
    draft.category = form.querySelector('input[name="category"]:checked')?.value || '';
    draft.paid = form.querySelector('input[name="paid"]:checked')?.value === 'paid';
    draft.contactPublic = form.elements.contactPublic.checked;
  };

  const renderFee = () => { $('[data-ec-fee]').hidden = !draft.paid; };
  const renderCounts = () => { const c = $('[data-ec-count="description"]'); if (c) c.textContent = String(draft.description.length).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const posterSrc = () => posterLocal || (draft.imageUrl ? safeImage(draft.imageUrl) : '');
  const renderPoster = () => {
    const src = posterSrc();
    $('[data-ec-drop-empty]').hidden = Boolean(src);
    $('[data-ec-drop-filled]').hidden = !src;
    if (src) $('[data-ec-poster-img]').src = src; else $('[data-ec-poster-img]').removeAttribute('src');
    $('[data-ec-poster-busy]').hidden = !posterLocal;
  };
  const renderGallery = () => {
    const items = draft.gallery.map((url, i) => `<li><img src="${esc(safeImage(url))}" alt="" /><button type="button" class="ec-thumb-remove" data-ec-gallery-remove="${i}" aria-label="Remove photo ${i + 1}">×</button></li>`);
    if (draft.gallery.length < LIMITS.gallery) items.push(`<li><label class="ec-thumb-add" for="ec-gallery-input">${PLUS}<span>Add photos</span></label></li>`);
    galleryList.innerHTML = items.join('');
  };
  const renderPin = () => {
    $('[data-ec-pin-text]').textContent = draft.pin ? 'Remove pin' : 'Pin from where I am';
    $('[data-ec-pin]').classList.toggle('is-on', Boolean(draft.pin));
  };
  const renderPreview = () => {
    const ev = previewEvent(draft, { organizer: organizer(), imageSrc: posterSrc() });
    const src = posterSrc() || eventImageSrc({ category: ev.category });
    $('[data-ec-preview-card]').innerHTML = eventCardMarkup(ev, { imageSrc: src });
    if (!$('[data-ec-detail-preview]').hidden) {
      const o = organizer();
      $('[data-ec-detail-preview-body]').innerHTML = eventDetailMarkup(ev, { imageSrc: src, preview: true, organizerSrc: o?.photoUrl ? safeImage(o.photoUrl) : '', gallery: draft.gallery.map(safeImage).filter(Boolean) });
    }
  };

  // Errors -------------------------------------------------------------------------------------------------------------
  const showErrors = (errors) => {
    dialog.querySelectorAll('[data-field]').forEach((box) => {
      const name = box.dataset.field;
      const out = box.querySelector(`#ec-${name}-error`);
      const message = errors[name] || '';
      if (out) out.textContent = message;
      box.classList.toggle('has-error', Boolean(message));
      const input = name === 'category' ? null : box.querySelector(`#ec-${name}`);
      if (input) { if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    });
    const category = form.querySelector('.ec-categories');
    if (errors.category) category.setAttribute('aria-invalid', 'true'); else category.removeAttribute('aria-invalid');
  };
  const focusField = (name) => {
    if (name === 'contactEmail' || name === 'contactPhone' || name === 'contactLink' || name === 'contactPublic') $('[data-ec-contact]').open = true;
    const target = name === 'category' ? form.querySelector('input[name="category"]:checked') || form.querySelector('input[name="category"]')
      : name === 'image' ? posterInput.closest('.ec-drop')?.querySelector('label') || posterInput : form.querySelector(`#ec-${name}`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  };

  const update = () => {
    read(); renderFee(); renderCounts(); renderPreview();
    if (tried) showErrors(validateEventDraft(draft, { publish: true }));
    status.textContent = '';
  };
  form.addEventListener('input', (e) => {
    if (e.target === cityInput) return;
    update();
  });
  form.addEventListener('change', (e) => { if (e.target.type === 'file') return; update(); });
  // Enter in a field must never publish by accident: only the footer buttons save.
  form.addEventListener('submit', (e) => e.preventDefault());

  // City combobox (place table, same search as "Pick my city") ---------------------------------------------------------
  const closeCities = () => { cityList.hidden = true; cityInput.setAttribute('aria-expanded', 'false'); cityInput.removeAttribute('aria-activedescendant'); activePlace = -1; };
  const renderCities = () => {
    if (!places.length) { cityList.innerHTML = '<li class="ec-combo-empty" role="option" aria-disabled="true">No matching city yet</li>'; }
    else cityList.innerHTML = places.map((p, i) => `<li id="ec-city-${i}" role="option" aria-selected="${i === activePlace}" data-place="${i}"><strong>${esc(p.name)}</strong><span>${esc([p.region, p.country].filter(Boolean).join(', '))}</span></li>`).join('');
    cityList.hidden = false;
    cityInput.setAttribute('aria-expanded', 'true');
    if (activePlace >= 0) cityInput.setAttribute('aria-activedescendant', `ec-city-${activePlace}`); else cityInput.removeAttribute('aria-activedescendant');
  };
  const pickPlace = (p) => {
    const changed = draft.placeId !== p.id;
    draft.placeId = p.id; draft.city = p.name; cityInput.value = p.name;
    if (changed) draft.pin = null;
    closeCities(); renderPin(); update();
  };
  const searchCities = async () => {
    const q = cityInput.value.trim();
    const { data, error } = await api.searchPlaces(q, 8);
    if (cityInput.value.trim() !== q) return;
    places = error ? [] : data || [];
    activePlace = places.length ? 0 : -1;
    renderCities();
  };
  cityInput.addEventListener('input', () => {
    if (draft.placeId && cityInput.value !== draft.city) { draft.placeId = ''; draft.pin = null; renderPin(); }
    draft.city = cityInput.value;
    window.clearTimeout(placeTimer);
    placeTimer = window.setTimeout(searchCities, 180);
    renderPreview();
    if (tried) showErrors(validateEventDraft(draft, { publish: true }));
  });
  cityInput.addEventListener('focus', () => { if (!draft.placeId) searchCities(); });
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (cityList.hidden) { searchCities(); return; }
      if (!places.length) return;
      activePlace = (activePlace + (e.key === 'ArrowDown' ? 1 : -1) + places.length) % places.length;
      renderCities();
      cityList.querySelector(`#ec-city-${activePlace}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && !cityList.hidden && places[activePlace]) {
      e.preventDefault(); pickPlace(places[activePlace]);
    } else if (e.key === 'Escape' && !cityList.hidden) {
      e.preventDefault(); e.stopPropagation(); closeCities();
    }
  });
  cityInput.addEventListener('blur', () => window.setTimeout(closeCities, 150));
  cityList.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-place]');
    if (!li) return;
    e.preventDefault();
    pickPlace(places[Number(li.dataset.place)]);
  });

  // Pin --------------------------------------------------------------------------------------------------------------
  $('[data-ec-pin]').addEventListener('click', async () => {
    const line = $('#ec-pin-status');
    if (draft.pin) { draft.pin = null; renderPin(); line.textContent = 'Pin removed. The city centre is used for distances.'; update(); return; }
    if (!draft.placeId) { line.textContent = 'Choose the city first, then pin the venue.'; focusField('city'); return; }
    line.textContent = 'Finding where you are…';
    const result = await locateOnce(geo, { secure });
    if (!result.ok) { line.textContent = fallbackCopy(result.reason).replace(/,? or pick your city\.?|Pick your city instead\./i, '.').replace(/\.\.$/, '.'); return; }
    draft.pin = { lat: result.lat, lng: result.lng };
    renderPin();
    line.textContent = 'Venue pinned. Only a ~2 km area is saved, never the exact point.';
    update();
  });

  // Images -----------------------------------------------------------------------------------------------------------
  const imageError = (message) => { $('#ec-image-error').textContent = message; $('.ec-media').classList.toggle('has-error', Boolean(message)); };
  const upload = async (file) => {
    const problem = imageFileProblem(file);
    if (problem) { imageError(problem); return ''; }
    imageError('');
    busy += 1;
    try {
      const { url } = await api.uploadEventImage(memberId(), file);
      uploads.add(url);
      return url;
    } catch (error) {
      imageError(/bucket not found/i.test(`${error?.message || ''} ${error?.error || ''}`) ? 'Event images open soon. You can publish without one.' : 'That image did not upload. Try again.');
      return '';
    } finally { busy -= 1; }
  };
  const dropUnused = (urls) => {
    const gone = urls.filter((u) => u && uploads.has(u) && !imagesOf(draft).includes(u));
    gone.forEach((u) => uploads.delete(u));
    if (gone.length) api.removeEventImages(memberId(), gone);
  };
  const setPoster = async (file) => {
    if (!file) return;
    const problem = imageFileProblem(file);
    if (problem) { imageError(problem); return; }
    const before = draft.imageUrl;
    if (posterLocal) URL.revokeObjectURL(posterLocal);
    posterLocal = URL.createObjectURL(file);
    renderPoster(); renderPreview();
    const url = await upload(file);
    URL.revokeObjectURL(posterLocal); posterLocal = '';
    if (url) { draft.imageUrl = url; dropUnused([before]); }
    renderPoster(); renderPreview();
  };
  posterInput.addEventListener('change', () => { setPoster(posterInput.files?.[0]); posterInput.value = ''; });
  $('[data-ec-poster-remove]').addEventListener('click', () => {
    const before = draft.imageUrl; draft.imageUrl = ''; dropUnused([before]); renderPoster(); renderPreview();
    posterInput.focus();
  });
  const drop = $('[data-ec-drop]');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); setPoster(e.dataTransfer?.files?.[0]); });
  galleryInput.addEventListener('change', async () => {
    const files = [...(galleryInput.files || [])].slice(0, LIMITS.gallery - draft.gallery.length);
    galleryInput.value = '';
    for (const file of files) {
      const url = await upload(file);
      if (url && draft.gallery.length < LIMITS.gallery) { draft.gallery.push(url); renderGallery(); renderPreview(); }
    }
  });
  galleryList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ec-gallery-remove]');
    if (!b) return;
    const [gone] = draft.gallery.splice(Number(b.dataset.ecGalleryRemove), 1);
    dropUnused([gone]); renderGallery(); renderPreview();
    galleryList.querySelector('button, label')?.focus();
  });

  // Save ---------------------------------------------------------------------------------------------------------------
  const setBusy = (on) => { saving = on; dialog.querySelectorAll('.ec-foot button').forEach((b) => { b.disabled = on; }); };
  const save = async (publish) => {
    if (saving) return;
    read();
    formError.textContent = '';
    if (busy) { status.textContent = 'Wait for the image to finish uploading.'; return; }
    const errors = validateEventDraft(draft, { publish });
    if (publish) tried = true;
    showErrors(errors);
    const first = firstErrorField(errors);
    if (first) {
      const count = Object.keys(errors).length;
      status.textContent = `${count} ${count === 1 ? 'thing needs' : 'things need'} a look before ${publish ? 'publishing' : 'saving'}.`;
      focusField(first);
      return;
    }
    setBusy(true);
    status.textContent = publish ? 'Publishing…' : 'Saving…';
    const wasPublished = draft.status === 'published';
    const { data: id, error } = await api.saveMemberEvent(draft.id, toServerFields(draft), publish);
    setBusy(false);
    if (error) {
      status.textContent = '';
      if (isMissing(error)) { formError.textContent = 'Creating events opens soon. Your details stay here while this window is open.'; return; }
      const fieldName = serverErrorField(error);
      const message = serverErrorMessage(error);
      if (fieldName && !message) {
        const again = validateEventDraft(draft, { publish: true });
        showErrors({ [fieldName]: again[fieldName] || 'Check this field.' });
        focusField(fieldName);
        return;
      }
      formError.textContent = message || 'That did not save. Check your connection and try again.';
      return;
    }
    // Images the event had and no longer uses are removed only now that the save stuck.
    const kept = imagesOf(draft);
    const stale = [...original].filter((u) => !kept.includes(u));
    if (stale.length) api.removeEventImages(memberId(), stale);
    original = new Set(kept);
    uploads = new Set();
    draft.id = id; lastId = id;
    draft.status = publish ? 'published' : 'draft';
    draft.pin = null;
    saved = snapshot();
    onSaved?.({ id, published: publish, edited: wasPublished });
    if (!publish) { toast('Draft saved. Only you can see it, on Explore.'); close(true); return; }
    if (wasPublished) { toast('Changes saved.'); close(true); return; }
    showSuccess();
  };
  const showSuccess = () => {
    $('[data-ec-success-copy]').textContent = `${draft.title.trim()} is on Explore now. Registrations and companion matching are open.`;
    dialog.classList.add('is-done');
    $('[data-ec-success]').hidden = false;
    $('[data-ec-success]').focus();
  };

  // Preview ------------------------------------------------------------------------------------------------------------
  const togglePreview = (on) => {
    $('[data-ec-detail-preview]').hidden = !on;
    dialog.classList.toggle('is-previewing', on);
    $('[data-ec-preview]').textContent = on ? 'Back to editing' : 'Preview event';
    $('[data-ec-preview]').setAttribute('aria-pressed', String(on));
    if (on) { read(); renderPreview(); $('[data-ec-detail-preview]').querySelector('[data-ec-preview-back]').focus(); }
    else { $('[data-ec-detail-preview-body]').innerHTML = ''; $('[data-ec-preview]').focus(); }
  };

  // Open / close -------------------------------------------------------------------------------------------------------
  const reset = () => {
    dialog.classList.remove('is-done', 'is-previewing');
    $('[data-ec-success]').hidden = true;
    $('[data-ec-detail-preview]').hidden = true;
    $('[data-ec-detail-preview-body]').innerHTML = '';
    $('[data-ec-discard-bar]').hidden = true;
    $('[data-ec-preview]').textContent = 'Preview event';
    $('[data-ec-preview]').setAttribute('aria-pressed', 'false');
    formError.textContent = ''; status.textContent = ''; imageError('');
    $('#ec-pin-status').textContent = 'At the venue now? Pin it for better "~km" distances. Only a ~2 km area is saved.';
    tried = false; showErrors({}); closeCities();
  };
  // Uploads from this sitting that were never saved (a successful save empties the set first).
  const discardUploads = () => { if (uploads.size) api.removeEventImages(memberId(), [...uploads]); uploads = new Set(); };
  const close = (force = false) => {
    if (!force && dirty() && !dialog.classList.contains('is-done')) {
      const bar = $('[data-ec-discard-bar]');
      bar.hidden = false;
      bar.querySelector('[data-ec-keep]').focus();
      return;
    }
    discardUploads();
    if (posterLocal) { URL.revokeObjectURL(posterLocal); posterLocal = ''; }
    if (dialog.open) dialog.close();
    document.body.classList.remove('event-create-open');
    if (returnFocus?.isConnected) returnFocus.focus();
  };

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (!$('[data-ec-discard-bar]').hidden) { $('[data-ec-discard-bar]').hidden = true; return; } if (!cityList.hidden) { closeCities(); return; } close(); });
  dialog.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-ec-close]')) { close(); return; }
    if (t.closest('[data-ec-keep]')) { $('[data-ec-discard-bar]').hidden = true; $('[data-ec-close]').focus(); return; }
    if (t.closest('[data-ec-discard]')) { close(true); return; }
    if (t.closest('[data-ec-draft]')) { save(false); return; }
    if (t.closest('[data-ec-publish]')) { save(true); return; }
    if (t.closest('[data-ec-preview]')) { togglePreview($('[data-ec-detail-preview]').hidden); return; }
    if (t.closest('[data-ec-preview-back]')) { togglePreview(false); return; }
    if (t.closest('[data-ec-close-done]')) { close(true); return; }
    if (t.closest('[data-ec-view]')) { const id = lastId; close(true); if (id) onView?.(id); }
  });

  return {
    // event: a listed (normalized) event to edit, or nothing for a new one.
    open(event = null) {
      returnFocus = document.activeElement;
      reset();
      draft = event ? draftFromEvent(event) : emptyDraft();
      original = new Set(imagesOf(draft));
      uploads = new Set();
      lastId = draft.id;
      saved = snapshot();
      const editing = Boolean(event);
      const published = draft.status === 'published';
      $('#ec-eyebrow').textContent = editing ? (published ? 'EXPLORE / EDIT EVENT' : 'EXPLORE / DRAFT') : 'EXPLORE / NEW EVENT';
      $('[data-ec-draft]').hidden = published;
      $('[data-ec-draft]').textContent = editing ? 'Save draft' : 'Save as draft';
      $('[data-ec-publish]').textContent = published ? 'Save changes' : 'Publish event';
      fill();
      renderPreview();
      document.body.classList.add('event-create-open');
      dialog.showModal();
      dialog.querySelector('.ec-body').scrollTop = 0;
      form.elements.title.focus();
    },
    close: () => close(true),
  };
};
