// Create Event (D-121, migration 0022): the "Bring people together." dialog on Explore. One <dialog> holds the form
// (left), the live card preview (right from 1080 px; under "Preview event" below that) and a three-action footer: Save
// as draft, Preview event, Publish event. The rules live in event-form.js (pure, unit-tested); the server repeats
// them in save_member_event, and a server error that names a field lands on that field.
//
// Images upload as soon as they are chosen (own folder of the event-posters bucket); files that end up unused (replaced,
// removed or the dialog discarded) are removed again. The venue pin is sent once and only its ~2 km cell is kept.
import {
  EVENT_FORM_CATEGORIES, CATEGORY_ROW, LIMITS, PHOTO_ACCEPT, emptyDraft, draftFromEvent, validateEventDraft, firstErrorField,
  toServerFields, serverErrorField, serverErrorMessage, imageFileProblem, previewEvent, todayIst, addDays, MAX_EVENT_DAYS,
  BROCHURE_ACCEPT, brochureFileProblem, brochureDisplayName, COVER_ZOOM, coverCrop, coverOutputSize,
} from './event-form.js';
import { eventCardMarkup, eventDetailMarkup } from './events-view.js';
import { eventImageSrc } from './event-assets.js';
import { locateOnce, fallbackCopy } from './geo-locate.js';
import { attachEmojiPicker } from './emoji-field.js';
import { PRESET_COVERS, presetCoverStoredPath } from './preset-cover.js';
import { normalizeCoverUrl } from './cover-assets.js';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const IMAGE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/></svg>';
const CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.3"/></svg>';
const DOC = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></svg>';
const CROP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 3.5V17h13.5M3.5 7H17v13.5"/></svg>';
const COVERS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';
// The Brivia cover pictures (the profile covers, D-127) an organiser can use as the poster instead of their own.
const coverPickerMarkup = () => `<div class="ec-covers" data-ec-covers hidden>
  <p class="ec-crop-title" id="ec-covers-title">Pick a Brivia cover</p>
  <ul class="ec-cover-grid" aria-labelledby="ec-covers-title">${PRESET_COVERS.map(({ key, title }) => `<li><button type="button" class="ec-cover-option" data-ec-cover="${esc(key)}" aria-label="${esc(title.charAt(0) + title.slice(1).toLowerCase())}"><img src="${esc(normalizeCoverUrl(presetCoverStoredPath(key)))}" alt="" loading="lazy" decoding="async" width="160" height="107" /></button></li>`).join('')}</ul>
  <div class="ec-crop-actions"><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-covers-close>Back</button></div>
</div>`;
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
          <div class="ec-chips">${[EVENT_FORM_CATEGORIES.slice(0, CATEGORY_ROW), EVENT_FORM_CATEGORIES.slice(CATEGORY_ROW)].map((row) => `<div class="ec-chip-row">${row.map((c) => `<label class="ec-chip"><input type="radio" name="category" value="${c.key}" /><span>${esc(c.label)}</span></label>`).join('')}</div>`).join('')}</div>
          <p class="event-field-error" id="ec-category-error"></p>
        </fieldset>
        <div class="ec-other" data-ec-other hidden>
          ${field('customCategory', 'Your category', `<input id="ec-customCategory" name="customCategory" type="text" maxlength="24" autocomplete="off" placeholder="Book club, Pottery, Salsa…" ${describedBy('customCategory', true)} />`, { hint: 'Shown on your event instead of "Other".' })}
        </div>
        ${field('description', 'Description', `<textarea id="ec-description" name="description" rows="5" maxlength="${LIMITS.description}" placeholder="What is it about, what can people expect, and who would love it?" required ${describedBy('description', true)}></textarea>`, { hint: '<span data-ec-count="description">0</span> / 2,000 · what it is, what to expect, who should come' })}
      </section>

      <section class="ec-section" aria-labelledby="ec-s2">
        <h3 id="ec-s2"><span aria-hidden="true">02</span>Date, time &amp; venue</h3>
        <div class="ec-row ec-row-when">
          ${field('date', 'Start date', `<input id="ec-date" name="date" type="date" required ${describedBy('date')} />`)}
          ${field('startTime', 'Starts', `<input id="ec-startTime" name="startTime" type="time" step="900" ${describedBy('startTime')} />`, { optional: true })}
          ${field('endDate', 'End date', `<input id="ec-endDate" name="endDate" type="date" ${describedBy('endDate')} />`)}
          ${field('endTime', 'Ends', `<input id="ec-endTime" name="endTime" type="time" step="900" ${describedBy('endTime')} />`, { optional: true })}
        </div>
        <p class="ec-hint ec-when-hint">Running over several days? Set the end date (up to a year). Already under way? Pick the day it started. No times means all day.</p>
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
          ${field('capacity', 'Maximum registrations', `<input id="ec-capacity" name="capacity" type="number" inputmode="numeric" min="1" max="${LIMITS.capacityMax}" step="1" placeholder="Unlimited" ${describedBy('capacity', true)} />`, { hint: 'Leave empty for unlimited. Registrations close when it is full.', optional: true })}
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
            <input class="sr-only" id="ec-poster" type="file" accept="${PHOTO_ACCEPT}" tabindex="-1" aria-hidden="true" />
            <input class="sr-only" id="ec-poster-camera" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" />
            <div class="ec-drop-empty" data-ec-drop-empty>${IMAGE}<strong>Add your poster</strong><span class="ec-drop-copy">Drag it here, or pick one from your device. Any photo up to 25 MB.</span>
              <span class="ec-drop-actions"><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-pick="poster" aria-describedby="ec-image-hint ec-image-error">${IMAGE}Choose from gallery</button><button type="button" class="event-btn event-btn-ghost event-btn-sm ec-camera-only" data-ec-pick="camera">${CAMERA}Take a photo</button><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-covers-open>${COVERS}Use a Brivia cover</button></span>
            </div>
            <div class="ec-drop-filled" data-ec-drop-filled hidden>
              <img alt="Event poster preview" data-ec-poster-img />
              <div class="ec-drop-tools"><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-crop-open>${CROP}Adjust area</button><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-pick="poster">Replace</button><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-covers-open>Covers</button><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-poster-remove>Remove</button></div>
              <span class="ec-uploading" data-ec-poster-busy hidden>Uploading…</span>
            </div>
            ${coverPickerMarkup()}
            <div class="ec-crop" data-ec-crop hidden>
              <p class="ec-crop-title" id="ec-crop-title">Choose the area for the cover</p>
              <div class="ec-crop-frame" data-ec-crop-frame tabindex="0" role="group" aria-labelledby="ec-crop-title" aria-describedby="ec-crop-hint"><img alt="" draggable="false" data-ec-crop-img /></div>
              <p class="ec-hint" id="ec-crop-hint">Drag the poster (or use the arrow keys) so the part you want sits in the frame. This is what the card and the event page show.</p>
              <div class="ec-crop-zoom"><label for="ec-crop-zoom">Zoom</label><input id="ec-crop-zoom" type="range" min="${COVER_ZOOM.min}" max="${COVER_ZOOM.max}" step="0.01" value="1" /></div>
              <div class="ec-crop-actions"><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-crop-cancel>Cancel</button><button type="button" class="event-btn event-btn-primary event-btn-sm" data-ec-crop-apply>Use this area</button></div>
            </div>
          </div>
          <p class="ec-hint" id="ec-image-hint">Use your own poster or one of the Brivia covers; it becomes the card cover, and you choose which area shows. Without one, the card uses a Brivia image for its category.</p>
          <p class="event-field-error" id="ec-image-error"></p>
          <div class="ec-gallery">
            <span class="ec-label-like">Gallery <span class="ec-optional">Optional · up to 6</span></span>
            <ul class="ec-gallery-list" data-ec-gallery></ul>
            <input class="sr-only" id="ec-gallery-input" type="file" multiple accept="${PHOTO_ACCEPT}" tabindex="-1" aria-hidden="true" />
          </div>
        </div>
        <div class="ec-field ec-brochure" data-field="brochure">
          <span class="ec-label-like" id="ec-brochure-label">Brochure <span class="ec-optional">Optional · PDF up to 5 MB</span></span>
          <input class="sr-only" id="ec-brochure" type="file" accept="${BROCHURE_ACCEPT}" tabindex="-1" aria-hidden="true" />
          <div data-ec-brochure-empty><button type="button" class="ec-brochure-add" data-ec-pick="brochure" aria-describedby="ec-brochure-hint ec-brochure-error">${DOC}<span>Add a brochure</span></button></div>
          <div class="ec-brochure-file" data-ec-brochure-filled hidden>
            ${DOC}<span class="ec-brochure-name" data-ec-brochure-name></span>
            <span class="ec-brochure-tools"><a class="event-btn event-btn-ghost event-btn-sm" data-ec-brochure-view target="_blank" rel="noopener noreferrer">View<span class="sr-only"> brochure (opens in a new tab)</span></a><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-pick="brochure">Replace</button><button type="button" class="event-btn event-btn-ghost event-btn-sm" data-ec-brochure-remove>Remove</button></span>
            <span class="ec-uploading" data-ec-brochure-busy hidden>Uploading…</span>
          </div>
          <p class="ec-hint" id="ec-brochure-hint">A menu, schedule or flyer members can open from the event page.</p>
          <p class="event-field-error" id="ec-brochure-error"></p>
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
  // Emoji straight into the description (the bio's panel, D-113): inserted at the cursor, within the 2,000 limit.
  attachEmojiPicker(form.elements.description, { label: 'Add an emoji to the description' });
  const formError = $('#ec-form-error');
  const status = $('[data-ec-status]');
  const cityInput = $('#ec-city');
  const cityList = $('#ec-city-list');
  const galleryList = $('[data-ec-gallery]');
  const galleryInput = $('#ec-gallery-input');
  const posterInput = $('#ec-poster');
  const brochureInput = $('#ec-brochure');

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
  let brochureUploads = new Set(); // brochure URLs uploaded in this sitting
  let brochureOriginal = '';        // the brochure the event had when opened (or at the last save)
  let brochureBusy = false;
  let posterSource = null;          // the last poster chosen in this sitting (a File), to adjust its area again
  let crop = null;                  // { img, natW, natH, zoom, cx, cy, url } while choosing the area
  let coversOpen = false;           // the Brivia cover picker is showing

  const imagesOf = (d) => [d.imageUrl, ...(d.gallery || [])].filter(Boolean);
  const snapshot = () => JSON.stringify({ ...draft, pin: draft.pin ? 1 : 0 });
  const dirty = () => snapshot() !== saved;

  // Form <-> draft ---------------------------------------------------------------------------------------------------
  const TEXT = ['title', 'customCategory', 'description', 'date', 'endDate', 'startTime', 'endTime', 'venueName', 'venueAddress', 'mapUrl', 'capacity', 'fee', 'contactEmail', 'contactPhone', 'contactLink'];
  const fill = () => {
    TEXT.forEach((n) => { const el = form.elements[n]; if (el) el.value = draft[n] ?? ''; });
    cityInput.value = draft.city || '';
    form.querySelectorAll('input[name="category"]').forEach((r) => { r.checked = r.value === draft.category; });
    form.querySelectorAll('input[name="paid"]').forEach((r) => { r.checked = (r.value === 'paid') === Boolean(draft.paid); });
    form.elements.contactPublic.checked = Boolean(draft.contactPublic);
    $('[data-ec-contact]').open = Boolean(draft.contactEmail || draft.contactPhone || draft.contactLink);
    form.elements.date.min = addDays(todayIst(), -MAX_EVENT_DAYS);
    if (!draft.endDate || draft.endDate === draft.date) form.elements.endDate.dataset.follows = '1'; else delete form.elements.endDate.dataset.follows;
    syncEndDate();
    const feeLocked = draft.registeredCount > 0;
    form.querySelectorAll('input[name="paid"]').forEach((r) => { r.disabled = feeLocked; });
    form.elements.fee.disabled = feeLocked;
    $('#ec-paid-hint').hidden = !feeLocked;
    renderFee(); renderPoster(); renderGallery(); renderPin(); renderCounts(); renderBrochure();
  };
  const read = () => {
    TEXT.forEach((n) => { const el = form.elements[n]; if (el) draft[n] = el.value; });
    draft.category = form.querySelector('input[name="category"]:checked')?.value || '';
    draft.paid = form.querySelector('input[name="paid"]:checked')?.value === 'paid';
    draft.contactPublic = form.elements.contactPublic.checked;
  };

  const renderFee = () => { $('[data-ec-fee]').hidden = !draft.paid; $('[data-ec-other]').hidden = draft.category !== 'other'; };
  const renderCounts = () => { const c = $('[data-ec-count="description"]'); if (c) c.textContent = String(draft.description.length).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const posterSrc = () => posterLocal || (draft.imageUrl ? safeImage(draft.imageUrl) : '');
  const renderPoster = () => {
    $('[data-ec-covers]').hidden = !coversOpen || Boolean(crop);
    if (crop || coversOpen) { $('[data-ec-drop-empty]').hidden = true; $('[data-ec-drop-filled]').hidden = true; return; }
    const src = posterSrc();
    $('[data-ec-drop-empty]').hidden = Boolean(src);
    $('[data-ec-drop-filled]').hidden = !src;
    if (src) $('[data-ec-poster-img]').src = src; else $('[data-ec-poster-img]').removeAttribute('src');
    $('[data-ec-poster-busy]').hidden = !posterLocal;
  };
  const renderGallery = () => {
    const items = draft.gallery.map((url, i) => `<li><img src="${esc(safeImage(url))}" alt="" /><button type="button" class="ec-thumb-remove" data-ec-gallery-remove="${i}" aria-label="Remove photo ${i + 1}">×</button></li>`);
    if (draft.gallery.length < LIMITS.gallery) items.push(`<li><button type="button" class="ec-thumb-add" data-ec-pick="gallery" aria-label="Add photos from your gallery (${LIMITS.gallery - draft.gallery.length} left)">${PLUS}<span>Add photos</span></button></li>`);
    galleryList.innerHTML = items.join('');
  };
  const renderPin = () => {
    $('[data-ec-pin-text]').textContent = draft.pin ? 'Remove pin' : 'Pin from where I am';
    $('[data-ec-pin]').classList.toggle('is-on', Boolean(draft.pin));
  };
  const renderBrochure = () => {
    const url = draft.brochureUrl ? safeImage(draft.brochureUrl) : '';
    $('[data-ec-brochure-empty]').hidden = Boolean(draft.brochureUrl) || brochureBusy;
    $('[data-ec-brochure-filled]').hidden = !draft.brochureUrl && !brochureBusy;
    $('[data-ec-brochure-name]').textContent = brochureBusy ? 'Uploading your PDF…' : draft.brochureName || 'Event brochure.pdf';
    const view = $('[data-ec-brochure-view]');
    if (url) view.href = url; else view.removeAttribute('href');
    view.hidden = !url;
    $('[data-ec-brochure-busy]').hidden = !brochureBusy;
  };
  const renderPreview = () => {
    const ev = previewEvent(draft, { organizer: organizer(), imageSrc: posterSrc() });
    const src = posterSrc() || eventImageSrc({ category: ev.category });
    $('[data-ec-preview-card]').innerHTML = eventCardMarkup(ev, { imageSrc: src });
    if (!$('[data-ec-detail-preview]').hidden) {
      const o = organizer();
      $('[data-ec-detail-preview-body]').innerHTML = eventDetailMarkup(ev, { imageSrc: src, preview: true, organizerSrc: o?.photoUrl ? safeImage(o.photoUrl) : '', gallery: draft.gallery.map(safeImage).filter(Boolean), brochureSrc: draft.brochureUrl ? safeImage(draft.brochureUrl) : '' });
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

  // D-197: the end date follows the start date until it is set to a later day; it can never sit before it.
  const syncEndDate = () => {
    const end = form.elements.endDate;
    end.min = draft.date || todayIst();
    end.max = draft.date ? addDays(draft.date, MAX_EVENT_DAYS) : '';
  };
  const update = (e) => {
    if (e?.target === form.elements.date) {
      const start = form.elements.date.value;
      const end = form.elements.endDate;
      if (start && (!end.value || end.value < start || end.dataset.follows === '1')) { end.value = start; end.dataset.follows = '1'; }
    }
    if (e?.target === form.elements.endDate) delete form.elements.endDate.dataset.follows;
    read(); syncEndDate(); renderFee(); renderCounts(); renderPreview();
    if (tried) showErrors(validateEventDraft(draft, { publish: true }));
    status.textContent = '';
  };
  form.addEventListener('input', (e) => {
    if (e.target === cityInput) return;
    update(e);
  });
  form.addEventListener('change', (e) => { if (e.target.type === 'file') return; update(e); });
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
    if (!q) { places = []; closeCities(); return; } // D-156: no suggestions before the first letter
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
  // Re-encode first (any gallery format the browser reads becomes a small JPEG without metadata), then upload.
  const prepare = async (file) => {
    const problem = imageFileProblem(file);
    if (problem) { imageError(problem); return null; }
    try { return api.prepareImage ? await api.prepareImage(file) : file; } catch {
      imageError("This photo couldn't be read here. Try a JPG or PNG, or a screenshot of it.");
      return null;
    }
  };
  const upload = async (file) => {
    if (!file) return '';
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
  // A poster from the device is re-encoded, then the member chooses its area (cropCover) before it uploads.
  const setPoster = async (original) => {
    if (!original) return;
    busy += 1;
    $('[data-ec-poster-busy]').hidden = false;
    const file = await prepare(original);
    busy -= 1;
    if (!file) { renderPoster(); return; }
    posterSource = file;
    openCrop(file);
  };
  const uploadPoster = async (file) => {
    const before = draft.imageUrl;
    if (posterLocal) URL.revokeObjectURL(posterLocal);
    posterLocal = URL.createObjectURL(file);
    renderPoster(); renderPreview();
    const url = await upload(file);
    URL.revokeObjectURL(posterLocal); posterLocal = '';
    if (url) { draft.imageUrl = url; dropUnused([before]); }
    renderPoster(); renderPreview();
  };

  // The poster area (D-125) ----------------------------------------------------------------------------------------------
  const cropBox = $('[data-ec-crop]');
  const cropFrame = $('[data-ec-crop-frame]');
  const cropImg = $('[data-ec-crop-img]');
  const cropZoom = $('#ec-crop-zoom');
  const frameSize = () => { const r = cropFrame.getBoundingClientRect(); return { frameW: r.width || 300, frameH: r.height || 200 }; };
  const drawCrop = () => {
    if (!crop) return;
    const c = coverCrop({ natW: crop.natW, natH: crop.natH, ...frameSize(), zoom: crop.zoom, cx: crop.cx, cy: crop.cy });
    crop.cx = c.cx; crop.cy = c.cy; crop.zoom = c.zoom;
    cropImg.style.width = `${crop.natW * c.scale}px`;
    cropImg.style.height = `${crop.natH * c.scale}px`;
    cropImg.style.transform = `translate(${-c.sx * c.scale}px, ${-c.sy * c.scale}px)`;
    cropZoom.value = String(c.zoom);
  };
  const closeCrop = (focus = true) => {
    if (crop?.url) URL.revokeObjectURL(crop.url);
    crop = null;
    cropBox.hidden = true;
    dialog.classList.remove('is-cropping');
    renderPoster();
    if (focus) (dialog.querySelector('[data-ec-crop-open]:not([hidden])') || dialog.querySelector('[data-ec-pick="poster"]'))?.focus();
  };
  // source: a File (just chosen) or the current poster URL (Adjust area on a saved poster).
  const openCrop = (source) => new Promise((resolve) => {
    const img = new Image();
    const url = source instanceof Blob ? URL.createObjectURL(source) : '';
    if (!url) img.crossOrigin = 'anonymous';
    img.onload = () => {
      crop = { img, natW: img.naturalWidth, natH: img.naturalHeight, zoom: 1, cx: 0.5, cy: 0.5, url };
      cropImg.src = img.src;
      $('[data-ec-drop-empty]').hidden = true;
      $('[data-ec-drop-filled]').hidden = true;
      cropBox.hidden = false;
      dialog.classList.add('is-cropping');
      drawCrop();
      cropFrame.focus();
      resolve(true);
    };
    img.onerror = () => { if (url) URL.revokeObjectURL(url); imageError("This poster couldn't be opened to adjust. Choose it again."); renderPoster(); resolve(false); };
    img.src = url || source;
  });
  const applyCrop = async () => {
    if (!crop) return;
    const c = coverCrop({ natW: crop.natW, natH: crop.natH, ...frameSize(), zoom: crop.zoom, cx: crop.cx, cy: crop.cy });
    const { w, h } = coverOutputSize(c.sw);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    let blob = null;
    try {
      canvas.getContext('2d').drawImage(crop.img, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
      blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.9));
    } catch { blob = null; }
    closeCrop(false);
    if (!blob) { imageError("This poster couldn't be cropped here. Choose it again from your device."); return; }
    await uploadPoster(new File([blob], 'poster.jpg', { type: 'image/jpeg' }));
    dialog.querySelector('[data-ec-crop-open]')?.focus();
  };
  let drag = null;
  cropFrame.addEventListener('pointerdown', (e) => {
    if (!crop) return;
    drag = { x: e.clientX, y: e.clientY };
    cropFrame.setPointerCapture?.(e.pointerId);
    cropFrame.classList.add('is-dragging');
  });
  cropFrame.addEventListener('pointermove', (e) => {
    if (!drag || !crop) return;
    const c = coverCrop({ natW: crop.natW, natH: crop.natH, ...frameSize(), zoom: crop.zoom, cx: crop.cx, cy: crop.cy });
    crop.cx -= (e.clientX - drag.x) / (c.scale * crop.natW);
    crop.cy -= (e.clientY - drag.y) / (c.scale * crop.natH);
    drag = { x: e.clientX, y: e.clientY };
    drawCrop();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => cropFrame.addEventListener(t, () => { drag = null; cropFrame.classList.remove('is-dragging'); }));
  cropFrame.addEventListener('keydown', (e) => {
    if (!crop) return;
    const c = coverCrop({ natW: crop.natW, natH: crop.natH, ...frameSize(), zoom: crop.zoom, cx: crop.cx, cy: crop.cy });
    const step = (e.shiftKey ? 40 : 10) / c.scale;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); crop.cx += moves[e.key][0] / crop.natW; crop.cy += moves[e.key][1] / crop.natH; drawCrop(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); crop.zoom += 0.1; drawCrop(); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); crop.zoom -= 0.1; drawCrop(); return; }
    if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
  });
  cropFrame.addEventListener('wheel', (e) => { if (!crop) return; e.preventDefault(); crop.zoom -= e.deltaY * 0.002; drawCrop(); }, { passive: false });
  cropZoom.addEventListener('input', () => { if (!crop) return; crop.zoom = Number(cropZoom.value); drawCrop(); });
  $('[data-ec-crop-apply]').addEventListener('click', applyCrop);
  $('[data-ec-crop-cancel]').addEventListener('click', () => closeCrop());
  $('[data-ec-crop-open]').addEventListener('click', () => { const src = posterSource || posterSrc(); if (src) openCrop(src); });
  window.addEventListener('resize', () => { if (crop) drawCrop(); });

  // The brochure (D-125): one PDF up to 5 MB, uploaded at once; set on the event after it saves --------------------------
  const brochureError = (message) => { $('#ec-brochure-error').textContent = message; $('.ec-brochure').classList.toggle('has-error', Boolean(message)); };
  const dropBrochure = (url) => {
    if (url && brochureUploads.has(url) && url !== draft.brochureUrl) { brochureUploads.delete(url); api.removeEventBrochures?.(memberId(), [url]); }
  };
  brochureInput.addEventListener('change', async () => {
    const file = brochureInput.files?.[0];
    brochureInput.value = '';
    if (!file) return;
    const problem = brochureFileProblem(file);
    if (problem) { brochureError(problem); return; }
    brochureError('');
    brochureBusy = true; busy += 1; renderBrochure();
    try {
      const { url } = await api.uploadEventBrochure(memberId(), file);
      brochureUploads.add(url);
      const before = draft.brochureUrl;
      draft.brochureUrl = url; draft.brochureName = brochureDisplayName(file);
      dropBrochure(before);
    } catch (error) {
      brochureError(/bucket not found/i.test(`${error?.message || ''} ${error?.error || ''}`) ? 'Brochures open soon. You can publish without one.'
        : /size|large|413/i.test(`${error?.message || ''} ${error?.statusCode || ''}`) ? 'Keep the brochure under 5 MB.' : 'That PDF did not upload. Try again.');
    } finally { brochureBusy = false; busy -= 1; renderBrochure(); renderPreview(); }
  });
  $('[data-ec-brochure-remove]').addEventListener('click', () => {
    const before = draft.brochureUrl; draft.brochureUrl = ''; draft.brochureName = '';
    dropBrochure(before); renderBrochure(); renderPreview();
    dialog.querySelector('[data-ec-pick="brochure"]')?.focus();
  });

  // A Brivia cover as the poster (D-127): the bundled picture goes through the same area step and upload as a photo, so
  // the event keeps its own copy in event-posters and nothing changes on the server.
  const setCovers = (open) => {
    coversOpen = open;
    renderPoster();
    if (open) $('[data-ec-cover]')?.focus();
    else dialog.querySelector('[data-ec-drop-empty]:not([hidden]) [data-ec-covers-open], [data-ec-drop-filled]:not([hidden]) [data-ec-covers-open]')?.focus();
  };
  dialog.querySelectorAll('[data-ec-covers-open]').forEach((b) => b.addEventListener('click', () => { imageError(''); setCovers(true); }));
  $('[data-ec-covers-close]').addEventListener('click', () => setCovers(false));
  $('[data-ec-covers]').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCovers(false); } });
  $('[data-ec-covers]').addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-ec-cover]');
    if (!pick) return;
    coversOpen = false;
    $('[data-ec-covers]').hidden = true;
    $('[data-ec-poster-busy]').hidden = false;
    busy += 1;
    let file = null;
    try {
      const res = await fetch(normalizeCoverUrl(presetCoverStoredPath(pick.dataset.ecCover)));
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      file = new File([blob], 'brivia-cover.webp', { type: blob.type || 'image/webp' });
    } catch { file = null; } finally { busy -= 1; }
    if (!file) { renderPoster(); imageError("That cover didn't load. Try again."); return; }
    setPoster(file);
  });

  const cameraInput = $('#ec-poster-camera');
  [posterInput, cameraInput].forEach((input) => input.addEventListener('change', () => { setPoster(input.files?.[0]); input.value = ''; }));
  // The visible buttons open the hidden pickers (a real button is focusable and announced; a label for a hidden input is not).
  dialog.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-ec-pick]');
    if (pick) { ({ poster: posterInput, camera: cameraInput, gallery: galleryInput, brochure: brochureInput })[pick.dataset.ecPick]?.click(); return; }
    if (e.target.closest('[data-ec-drop-empty]') && !e.target.closest('button')) posterInput.click();
  });
  $('[data-ec-poster-remove]').addEventListener('click', () => {
    const before = draft.imageUrl; draft.imageUrl = ''; posterSource = null; dropUnused([before]); renderPoster(); renderPreview();
    dialog.querySelector('[data-ec-pick="poster"]')?.focus();
  });
  const drop = $('[data-ec-drop]');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); setPoster(e.dataTransfer?.files?.[0]); });
  galleryInput.addEventListener('change', async () => {
    const files = [...(galleryInput.files || [])].slice(0, LIMITS.gallery - draft.gallery.length);
    galleryInput.value = '';
    for (const original of files) {
      const url = await upload(await prepare(original));
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
    if (crop) { status.textContent = 'Choose the poster area first (Use this area or Cancel).'; cropFrame.focus(); return; }
    if (busy) { status.textContent = brochureBusy ? 'Wait for the brochure to finish uploading.' : 'Wait for the image to finish uploading.'; return; }
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
    // The brochure is set on its own (0025) once the event exists; a database without 0025 keeps the event as saved.
    if ((draft.brochureUrl || '') !== brochureOriginal) {
      const { error: brochureFail } = await api.setEventBrochure(id, draft.brochureUrl || null);
      if (brochureFail) {
        if (draft.brochureUrl) api.removeEventBrochures?.(memberId(), [draft.brochureUrl]);
        draft.brochureUrl = brochureOriginal; draft.brochureName = brochureOriginal ? 'Event brochure.pdf' : '';
        toast(isMissing(brochureFail) ? 'Saved. Brochures open soon, so it was saved without the PDF.' : 'Saved, but the brochure did not attach. Add it again from Edit event.');
      } else if (brochureOriginal) api.removeEventBrochures?.(memberId(), [brochureOriginal]);
      if (!brochureFail) brochureOriginal = draft.brochureUrl || '';
    }
    brochureUploads = new Set();
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
    tried = false; showErrors({}); closeCities(); brochureError('');
    if (crop) closeCrop(false);
  };
  // Uploads from this sitting that were never saved (a successful save empties the set first).
  const discardUploads = () => {
    if (uploads.size) api.removeEventImages(memberId(), [...uploads]);
    uploads = new Set();
    if (brochureUploads.size) api.removeEventBrochures?.(memberId(), [...brochureUploads]);
    brochureUploads = new Set();
  };
  const close = (force = false) => {
    if (!force && dirty() && !dialog.classList.contains('is-done')) {
      const bar = $('[data-ec-discard-bar]');
      bar.hidden = false;
      bar.querySelector('[data-ec-keep]').focus();
      return;
    }
    discardUploads();
    if (posterLocal) { URL.revokeObjectURL(posterLocal); posterLocal = ''; }
    if (crop) closeCrop(false);
    posterSource = null;
    if (dialog.open) dialog.close();
    document.body.classList.remove('event-create-open');
    if (returnFocus?.isConnected) returnFocus.focus();
  };

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (crop) { closeCrop(); return; } if (!$('[data-ec-discard-bar]').hidden) { $('[data-ec-discard-bar]').hidden = true; return; } if (!cityList.hidden) { closeCities(); return; } close(); });
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
      brochureOriginal = draft.brochureUrl || '';
      brochureUploads = new Set();
      posterSource = null;
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
