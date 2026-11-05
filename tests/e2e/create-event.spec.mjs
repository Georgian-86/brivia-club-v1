// Create Event (D-121, migration 0022) on Explore: the "Create event" button, the "Bring people together." dialog
// (inline errors, category chips, the city list, Free/Paid, the poster upload and the live card), Preview event, Save
// as draft, Publish (the success state and "View event"), the organiser's Edit and Cancel, and the member's side of a
// member event: host, Reserve for a paid event (a held seat, not confirmed), a full event closed, Ask a question.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/create-event.spec.mjs   (Vite on :5187)
// CREATE_SHOTS=<dir> saves the dialog, the preview, the success state and the drawers at 1440 and 390.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';
import { startAppStub, PHOTO, ownRow, ORIGIN } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.CREATE_SHOTS || '';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M/AwMDAxMDAwMDAAAAPAAH/k3QhAAAAAElFTkSuQmCC', 'base64');
// A real cover photo, so the poster-area step has something to frame.
const POSTER = readFileSync(new URL('../../site/media/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.webp', import.meta.url));
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const ymd = (n) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOST = 'dddddddd-dddd-4ddd-8ddd-000000000001';
const base = (id, title, extra = {}) => ({
  id, title, description: `${title}: a member's event.`, category: 'games', tags: [], venue_name: 'Battle Chess Skool', venue_area: 'Bengaluru',
  venue_address: '12 ITPL Main Road', starts_at: day(3, 18), ends_at: day(3, 21), image_key: '', distance_km: 2, going_count: 3, companion_count: 1,
  going: false, wants_companion: false, friends: [], status: 'published', is_mine: false, organizer: { id: HOST, name: 'Kiran Host', photo_url: PHOTO(HOST) },
  image_url: '', gallery_urls: [], map_url: 'https://maps.app.goo.gl/abc', place_id: 'in-bengaluru', capacity: 20, registered_count: 3, fee_inr: 0,
  my_status: null, contact: null, ...extra,
});
const events = () => [
  base('paid-1', 'Wine & Words', { category: 'art', fee_inr: 499, registered_count: 6, capacity: 12, contact: { email: 'host@example.com' }, interested_count: 2,
    brochure_url: `${ORIGIN}/storage/v1/object/public/event-brochures/${HOST}/wine.pdf` }),
  base('full-1', 'Rooftop Chess', { capacity: 3, registered_count: 3 }),
];
const places = [
  { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India' },
  { id: 'in-mumbai', name: 'Mumbai', region: 'Maharashtra', country: 'India' },
];
const st = { events: events(), places, companionDefault: false, pay: { order: 'not_configured' } };   // D-166: no Razorpay here
const stub = await startAppStub({ port: 5187, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const posted = (name) => st.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`);
const body = (name) => JSON.parse(posted(name).at(-1)?.body || '{}');

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, { events: events(), saved: [], rsvps: [] });
    st.calls.length = 0;
    const phone = w < 780;
    const ctx = await stub.newContext(browser, { width: w, height: h }, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=events', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.event-card[data-event-id="paid-1"]');

    // The founder's reference: a small pill in the hero under the note; the toolbar keeps count, Nearby and the switch.
    const button = page.locator('#events-create');
    check(`${w}: "Create event" sits in the hero under the note, not in the toolbar`, await button.isVisible() && await page.evaluate(() => {
      const b = document.querySelector('#events-create');
      const note = document.querySelector('.events-head-note').getBoundingClientRect();
      return Boolean(b.closest('.events-head')) && !b.closest('.events-toolbar') && b.getBoundingClientRect().top >= note.bottom;
    }));
    check(`${w}: the tabs are the reference nine`, (await page.locator('#event-chips [data-event-category]').count()) === 9);
    check(`${w}: the toolbar does not scroll sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await shot(page, `explore-${w}.png`);

    // Open: heading, subtitle, focus on the name.
    await button.click();
    await page.waitForSelector('#event-create-dialog[open]');
    const head = await page.locator('#event-create-dialog .ec-head').innerText();
    check(`${w}: heading and subtitle (${JSON.stringify(head)})`, /Bring people\s*together\./.test(head) && /Create an experience worth showing up for\./.test(head));
    check(`${w}: focus starts on Event name`, await page.evaluate(() => document.activeElement?.id === 'ec-title'));
    check(`${w}: the dialog fits the viewport`, await page.evaluate(() => { const r = document.querySelector('#event-create-dialog').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; }));
    check(`${w}: fourteen categories in exactly two rows`, (await page.locator('#event-create-dialog input[name="category"]').count()) === 14 && await page.evaluate(() =>
      new Set([...document.querySelectorAll('#event-create-dialog .ec-chip')].map((c) => Math.round(c.offsetTop))).size === 2));
    check(`${w}: the "Your category" field waits for Other`, await page.locator('#ec-customCategory').isHidden());
    await shot(page, `create-empty-${w}.png`);

    // Publish empty: inline errors, first field focused, nothing sent.
    await page.locator('[data-ec-publish]').click();
    const errs = await page.evaluate(() => [...document.querySelectorAll('#event-create-dialog .event-field-error')].filter((e) => e.textContent).map((e) => e.id));
    check(`${w}: publishing an empty form shows inline errors, none for the optional times or capacity (${errs.length})`, errs.includes('ec-title-error') && errs.includes('ec-category-error') && errs.includes('ec-city-error') && !errs.includes('ec-capacity-error') && !errs.includes('ec-startTime-error'));
    check(`${w}: focus moves to the first problem and it is marked invalid`, await page.evaluate(() => document.activeElement?.id === 'ec-title' && document.activeElement.getAttribute('aria-invalid') === 'true'));
    check(`${w}: nothing is sent while invalid`, posted('save_member_event').length === 0);
    const axeErr = await axeViolations(page, { include: '#event-create-dialog' });
    check(`${w}: axe on the dialog with errors`, axeErr.length === 0, JSON.stringify(axeErr));

    // Fill it in.
    await page.fill('#ec-title', 'Bangalore Chess Meetup');
    check(`${w}: the title error clears as you type`, (await page.locator('#ec-title-error').innerText()) === '');
    await page.locator('#event-create-dialog .ec-chip:has-text("Other")').click();
    check(`${w}: Other reveals "Your category"`, await page.locator('#ec-customCategory').isVisible());
    await page.fill('#ec-customCategory', 'Book club');
    check(`${w}: the live card shows your own category`, /BOOK CLUB/.test(await page.locator('[data-ec-preview-card] .event-kicker').innerText()));
    await page.locator('#event-create-dialog .ec-chip:has-text("Chess & Games")').click();
    check(`${w}: another category hides it again`, await page.locator('#ec-customCategory').isHidden());
    await page.fill('#ec-description', 'Rapid games, a friendly ladder and good conversation. All levels welcome.');
    await page.locator('#ec-description').press('End');
    await page.locator('[data-ec-form-emoji], .ec-form .emoji-field-toggle').first().click();
    await page.locator('.ec-form .emoji-field-panel:not([hidden]) .emoji-field-emoji').first().click();
    const desc = await page.locator('#ec-description').inputValue();
    check(`${w}: an emoji goes straight into the description (${JSON.stringify(desc.slice(-4))})`, /welcome\.\p{Extended_Pictographic}/u.test(desc));
    await page.keyboard.press('Escape');
    check(`${w}: Escape closes the emoji panel, not the dialog`, await page.locator('.ec-form .emoji-field-panel').isHidden() && await page.evaluate(() => document.querySelector('#event-create-dialog').open));
    await page.fill('#ec-date', ymd(5));
    await page.fill('#ec-startTime', '18:00');
    await page.fill('#ec-endTime', '17:00');
    check(`${w}: an end before the start is caught inline`, /after the start/.test(await page.locator('#ec-endTime-error').innerText()));
    await page.fill('#ec-endTime', '21:00');
    // D-197: the end date follows the start date; set to a later day, the event runs over several days.
    check(`${w}: the end date follows the start date`, await page.inputValue('#ec-endDate') === ymd(5) && await page.getAttribute('#ec-endDate', 'min') === ymd(5));
    await page.fill('#ec-endDate', ymd(4));
    check(`${w}: an end date before the start is caught inline`, /before the start/.test(await page.locator('#ec-endDate-error').innerText()));
    await page.fill('#ec-endDate', ymd(7));
    await page.fill('#ec-endTime', '17:00');
    check(`${w}: a multi-day event may end earlier in the day`, (await page.locator('#ec-endTime-error').innerText()).trim() === '' && (await page.locator('#ec-endDate-error').innerText()).trim() === '');
    check(`${w}: the preview names the day it ends`, / – \w{3} \d{1,2} \w{3}, 5:00 PM/.test(await page.locator('[data-ec-preview-card] .event-card-line').first().innerText()));
    await shot(page, `multi-day-${w}.png`);
    await page.fill('#ec-venueName', 'Battle Chess Skool');
    await page.locator('#ec-city').click();
    await page.locator('#ec-city').pressSequentially('Beng');
    await page.waitForSelector('#ec-city-list:not([hidden]) [data-place]');
    check(`${w}: the city list is a listbox with the match selected`, await page.evaluate(() => document.querySelector('#ec-city').getAttribute('aria-expanded') === 'true' && document.querySelector('#ec-city-list [aria-selected="true"]')?.textContent.includes('Bengaluru')));
    await page.keyboard.press('Enter');
    check(`${w}: Enter picks the city`, (await page.locator('#ec-city').inputValue()) === 'Bengaluru' && await page.locator('#ec-city-list').isHidden());
    await page.fill('#ec-venueAddress', '12 ITPL Main Road, Whitefield');
    await page.fill('#ec-capacity', '30');
    await page.locator('#event-create-dialog .ec-segment label:has-text("Paid")').click();
    check(`${w}: Paid shows the INR amount`, await page.locator('#ec-fee').isVisible());
    await page.fill('#ec-fee', '499');
    await page.setInputFiles('#ec-poster', { name: 'poster.webp', mimeType: 'image/webp', buffer: POSTER });
    // D-125: the member chooses the poster's area (3:2, like the card) before it uploads.
    await page.waitForSelector('[data-ec-crop]:not([hidden])');
    const cropUploadsBefore = st.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/event-posters/')).length;
    check(`${w}: a new poster opens "Choose the area for the cover", focused, nothing uploaded yet`, await page.evaluate(() => document.activeElement?.matches('[data-ec-crop-frame]'))
      && /Choose the area for the cover/.test(await page.locator('[data-ec-crop]').innerText()) && cropUploadsBefore === 0);
    const ratio = await page.evaluate(() => { const r = document.querySelector('[data-ec-crop-frame]').getBoundingClientRect(); return r.width / r.height; });
    check(`${w}: the area frame is 3:2 like the card (${ratio.toFixed(2)})`, Math.abs(ratio - 1.5) < 0.02);
    const before = await page.evaluate(() => document.querySelector('[data-ec-crop-img]').style.transform);
    await page.locator('#ec-crop-zoom').fill('2.5');
    await page.locator('[data-ec-crop-frame]').focus();
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => document.querySelector('[data-ec-crop-img]').style.transform);
    check(`${w}: zoom and the arrow keys move the area (${before} -> ${after})`, before !== after);
    check(`${w}: saving waits for the area`, await page.evaluate(() => { document.querySelector('[data-ec-draft]').click(); return /poster area/.test(document.querySelector('[data-ec-status]').textContent); }));
    await page.locator('[data-ec-crop]').scrollIntoViewIfNeeded();
    await shot(page, `create-crop-${w}.png`);
    await page.locator('[data-ec-crop-apply]').click();
    await page.waitForFunction(() => !document.querySelector('[data-ec-drop-filled]').hidden && document.querySelector('[data-ec-poster-busy]').hidden);
    check(`${w}: Adjust area is offered on the chosen poster`, await page.locator('[data-ec-crop-open]').isVisible());
    check(`${w}: the poster previews with Replace and Remove`, await page.locator('[data-ec-poster-img]').isVisible() && await page.locator('.ec-drop-tools').innerText().then((t) => /Replace/i.test(t) && /Remove/i.test(t)));
    check(`${w}: the poster went to the member's own event-posters folder`, st.calls.some((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/event-posters/${ownRow.id}/`)));
    // D-127: a Brivia cover can be the poster; it goes through the same area step and upload.
    const coverUploadsBefore = st.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/event-posters/')).length;
    await page.locator('[data-ec-drop-filled] [data-ec-covers-open]').click();
    await page.waitForSelector('[data-ec-covers]:not([hidden])');
    check(`${w}: "Covers" opens the 25 Brivia covers, the first one focused`, (await page.locator('[data-ec-cover]').count()) === 25
      && await page.evaluate(() => document.activeElement?.matches('[data-ec-cover]')));
    await page.locator('[data-ec-covers]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-ec-cover] img')].slice(0, 4).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
    await shot(page, `create-covers-${w}.png`);
    await page.keyboard.press('Escape');
    check(`${w}: Escape closes the covers and keeps the poster`, await page.locator('[data-ec-covers]').isHidden() && await page.locator('[data-ec-poster-img]').isVisible()
      && await page.locator('#event-create-dialog').isVisible());
    await page.locator('[data-ec-drop-filled] [data-ec-covers-open]').click();
    await page.locator('[data-ec-cover]').nth(3).click();
    await page.waitForSelector('[data-ec-crop]:not([hidden])');
    check(`${w}: a picked cover opens the area step`, await page.locator('[data-ec-covers]').isHidden());
    await page.locator('[data-ec-crop-apply]').click();
    await page.waitForFunction(() => !document.querySelector('[data-ec-drop-filled]').hidden && document.querySelector('[data-ec-poster-busy]').hidden);
    check(`${w}: the cover uploads as the event's own poster`, st.calls.filter((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/event-posters/${ownRow.id}/`)).length > coverUploadsBefore);
    await page.setInputFiles('#ec-poster', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: PNG });
    check(`${w}: a document is refused inline`, /Choose a photo/.test(await page.locator('#ec-image-error').innerText()));
    check(`${w}: the pickers open the whole gallery (image/*, HEIC) and the camera input asks for the camera`, await page.evaluate(() =>
      document.querySelector('#ec-poster').accept.includes('image/*') && document.querySelector('#ec-gallery-input').multiple
      && document.querySelector('#ec-poster-camera').getAttribute('capture') === 'environment'));
    check(`${w}: "Take a photo" is offered only on touch screens`, (await page.evaluate(() => getComputedStyle(document.querySelector('[data-ec-pick="camera"]')).display !== 'none')) === phone);
    const galleryChooser = page.waitForEvent('filechooser');
    await page.locator('.ec-thumb-add').click();
    const chooser = await galleryChooser;
    check(`${w}: "Add photos" opens a multi-photo picker`, chooser.isMultiple());
    await chooser.setFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
    await page.waitForFunction(() => document.querySelectorAll('[data-ec-gallery] img').length === 2);
    const galleryUploads = st.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/event-posters/')).length;
    check(`${w}: two gallery photos upload as JPEGs and show as thumbnails (${galleryUploads} uploads in all)`, galleryUploads >= 3);

    // D-125: the brochure, a PDF up to 5 MB.
    await page.setInputFiles('#ec-brochure', { name: 'menu.txt', mimeType: 'text/plain', buffer: Buffer.from('menu') });
    check(`${w}: a brochure that is not a PDF is refused inline`, /must be a PDF/.test(await page.locator('#ec-brochure-error').innerText()));
    await page.setInputFiles('#ec-brochure', { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 32) });
    check(`${w}: a brochure over 5 MB is refused inline`, /under 5 MB/.test(await page.locator('#ec-brochure-error').innerText()));
    await page.setInputFiles('#ec-brochure', { name: 'Chess night menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await page.waitForFunction(() => !document.querySelector('[data-ec-brochure-filled]').hidden && document.querySelector('[data-ec-brochure-busy]').hidden);
    check(`${w}: the brochure uploads to the member's own event-brochures folder and shows its name`,
      st.calls.some((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/event-brochures/${ownRow.id}/`))
      && /Chess night menu\.pdf/.test(await page.locator('[data-ec-brochure-name]').innerText()) && await page.locator('[data-ec-brochure-view]').isVisible()
      && (await page.locator('#ec-brochure-error').innerText()) === '');
    await page.locator('.ec-brochure').scrollIntoViewIfNeeded();
    await shot(page, `create-brochure-${w}.png`);

    // Live preview card.
    const card = await page.locator('[data-ec-preview-card] .event-card').innerText();
    check(`${w}: the live card shows title, category, time, venue, fee and spots (${JSON.stringify(card)})`,
      /Bangalore Chess Meetup/.test(card) && /GAMES/.test(card) && /6:00 PM – \w{3} \d{1,2} \w{3}, 5:00 PM/.test(card) && /Battle Chess Skool, Bengaluru/.test(card) && /₹499 · 30 spots left/.test(card));
    check(`${w}: the live card uses the poster`, await page.evaluate(() => /^blob:|event-posters/.test(document.querySelector('[data-ec-preview-card] .event-card-media img')?.src || '')));
    await page.locator('[data-ec-preview-card]').scrollIntoViewIfNeeded();
    await shot(page, `create-filled-${w}.png`);
    const audit = await textAudit(page, { root: '#event-create-dialog', families: TYPE_FAMILIES });
    check(`${w}: text >= 12 px in the club's two families`, audit.small.length === 0 && audit.family.length === 0, JSON.stringify([audit.small.slice(0, 3), audit.family.slice(0, 3)]));

    // Preview event.
    await page.locator('[data-ec-preview]').click();
    await page.waitForSelector('[data-ec-detail-preview]:not([hidden])');
    const pv = await page.locator('[data-ec-detail-preview]').innerText();
    check(`${w}: Preview event shows the drawer as members see it`, /Bangalore Chess Meetup/.test(pv) && /Hosted by/i.test(pv) && /Alex Me/.test(pv) && /₹499 entry/.test(pv) && /Looking for a companion\?/.test(pv));
    await shot(page, `create-preview-${w}.png`);
    await page.locator('[data-ec-preview-back]').click();
    check(`${w}: Back to editing returns to the form`, await page.locator('[data-ec-detail-preview]').isHidden());

    // Publish.
    await page.locator('[data-ec-publish]').click();
    await page.waitForSelector('[data-ec-success]:not([hidden])');
    const sent = body('save_member_event');
    const f = sent.p_fields || {};
    check(`${w}: Publish sends one save with every field (${JSON.stringify(f).slice(0, 160)}…)`, posted('save_member_event').length === 1 && sent.p_publish === true && sent.p_id === null
      && f.title === 'Bangalore Chess Meetup' && f.category === 'games' && f.date === ymd(5) && f.start_time === '18:00' && f.end_time === '17:00' && f.end_date === ymd(7)
      && f.place_id === 'in-bengaluru' && f.capacity === '30' && f.fee_inr === '499' && /event-posters/.test(f.image_url) && !('pin' in f));
    const br = body('set_event_brochure');
    check(`${w}: the brochure is set on the new event (${JSON.stringify(br)})`, br?.p_id === 'm-1' && /event-brochures\/.+\.pdf$/.test(br?.p_url || ''));
    check(`${w}: a refined success state`, /It's\s*live\./.test(await page.locator('[data-ec-success]').innerText()) && await page.evaluate(() => document.activeElement?.matches('[data-ec-success]')));
    await shot(page, `create-success-${w}.png`);
    await page.locator('[data-ec-view]').click();
    await page.waitForSelector('#event-detail.is-sheet:not([hidden])');
    const mine = await page.locator('#event-detail').innerText();
    check(`${w}: View event opens it with the organiser's tools`, /Bangalore Chess Meetup/.test(mine) && /0 of 30 registered/.test(mine) && /Edit event/i.test(mine) && /Cancel event/i.test(mine));
    check(`${w}: the new event is on Explore`, await page.locator('.event-card[data-event-id="m-1"]').count() === 1);
    // D-203: a gallery photo opens full screen; arrows move between photos; Escape closes and gives focus back.
    await page.locator('#event-detail [data-event-photo="0"]').click();
    await page.waitForSelector('dialog.photo-viewer[open]');
    check(`${w}: a gallery photo opens full screen`, /1 \/ 2/.test(await page.locator('.photo-viewer-count').innerText()));
    await page.keyboard.press('ArrowRight');
    check(`${w}: the arrow key shows the next photo`, /2 \/ 2/.test(await page.locator('.photo-viewer-count').innerText()));
    const axeViewer = await axeViolations(page, { include: 'dialog.photo-viewer' });
    check(`${w}: axe on the photo viewer`, axeViewer.length === 0, JSON.stringify(axeViewer));
    check(`${w}: the photo fits the screen`, await page.evaluate(() => { const r = document.querySelector('dialog.photo-viewer img').getBoundingClientRect(); const w = document.documentElement.clientWidth; const b = [...document.querySelectorAll('.photo-viewer-btn')].every((x) => x.getBoundingClientRect().right <= w); return b && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= w; }));
    await shot(page, `photo-viewer-${w}.png`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.photo-viewer'));
    check(`${w}: Escape closes it and focus goes back to the photo`, await page.evaluate(() => document.activeElement?.matches('[data-event-photo="0"]')));
    const axeMine = await axeViolations(page, { include: '#event-detail' });
    check(`${w}: axe on the organiser's drawer`, axeMine.length === 0, JSON.stringify(axeMine));
    await shot(page, `organiser-drawer-${w}.png`);

    // Edit: prefilled, Save changes.
    await page.locator('#event-detail [data-event-edit]').click();
    await page.waitForSelector('#event-create-dialog[open]');
    check(`${w}: Edit prefills the form`, (await page.locator('#ec-title').inputValue()) === 'Bangalore Chess Meetup' && (await page.locator('#ec-startTime').inputValue()) === '18:00' && (await page.locator('#ec-city').inputValue()) === 'Bengaluru');
    check(`${w}: a published event has no Save as draft; Publish reads Save changes`, await page.locator('[data-ec-draft]').isHidden() && /Save changes/i.test(await page.locator('[data-ec-publish]').innerText()));
    await page.fill('#ec-capacity', '40');
    await page.locator('[data-ec-publish]').click();
    await page.waitForFunction(() => !document.querySelector('#event-create-dialog').open);
    check(`${w}: the edit saves to the same event`, body('save_member_event').p_id === 'm-1' && body('save_member_event').p_fields.capacity === '40');

    // Cancel with an inline confirmation.
    await page.locator('.event-card[data-event-id="m-1"] .event-open').click();
    await page.waitForSelector('#event-detail [data-event-cancel]');
    await page.locator('#event-detail [data-event-cancel]').click();
    check(`${w}: Cancel asks first, with focus on "Keep it"`, /Cancel this event\?/.test(await page.locator('#event-detail').innerText()) && await page.evaluate(() => document.activeElement?.hasAttribute('data-event-confirm-no')));
    await page.locator('#event-detail [data-event-confirm-yes]').click();
    await page.waitForFunction(() => /Cancelled by the organiser/i.test(document.querySelector('#event-detail')?.innerText || ''));
    check(`${w}: cancel_member_event was called once`, posted('cancel_member_event').length === 1);
    await page.keyboard.press('Escape');

    // Save as draft, and the discard guard.
    await button.click();
    await page.waitForSelector('#event-create-dialog[open]');
    await page.fill('#ec-title', 'Half an idea');
    await page.locator('[data-ec-close]').click();
    check(`${w}: closing with changes asks before discarding`, await page.locator('[data-ec-discard-bar]').isVisible() && await page.evaluate(() => document.activeElement?.hasAttribute('data-ec-keep')));
    await page.locator('[data-ec-keep]').click();
    await page.locator('[data-ec-draft]').click();
    await page.waitForFunction(() => !document.querySelector('#event-create-dialog').open);
    check(`${w}: Save as draft sends publish false`, body('save_member_event').p_publish === false && body('save_member_event').p_fields.title === 'Half an idea');
    await page.waitForSelector('.event-card.is-draft');
    check(`${w}: the draft shows on Explore for its creator, marked Draft`, /DRAFT/i.test(await page.locator('.event-card.is-draft').first().innerText()));

    // A member's paid event: host, fee, Reserve gives a held seat (not confirmed); a full one is closed.
    await page.locator('.event-card[data-event-id="paid-1"] .event-open').click();
    await page.waitForSelector('#event-detail [data-event-going]');
    const paid = await page.locator('#event-detail').innerText();
    check(`${w}: the drawer shows the host, fee and spots`, /Kiran Host/.test(paid) && /₹499 entry/.test(paid) && /6 spots left/.test(paid) && /host@example\.com/.test(paid));
    check(`${w}: "Open in Google Maps" carries a map icon`, /Open in Google Maps/i.test(await page.locator('#event-detail .event-map-link').innerText()) && await page.locator('#event-detail .event-map-link svg').count() === 1);
    check(`${w}: the brochure opens from the drawer`, (await page.locator('#event-detail a.event-brochure').getAttribute('href'))?.endsWith('/event-brochures/' + HOST + '/wine.pdf'));
    check(`${w}: a paid event offers Show interest beside Reserve, with the interested count`, /Show interest/i.test(await page.locator('#event-detail [data-event-interest]').innerText()) && /2 interested/.test(paid));
    check(`${w}: before any step the companion switch is off limits`, await page.locator('#event-detail [data-event-wants]').isDisabled());
    await page.locator('#event-detail [data-event-interest]').click();
    await page.waitForSelector('#event-detail [data-event-interest][aria-pressed="true"]');
    const shown = await page.locator('#event-detail').innerText();
    check(`${w}: Show interest holds no seat and counts (${JSON.stringify(body('set_event_interest'))})`, body('set_event_interest').p_on === true && /3 interested/.test(shown) && /6 spots left/.test(shown) && /before you pay/.test(shown));
    check(`${w}: an interest unlocks the companion switch`, !(await page.locator('#event-detail [data-event-wants]').isDisabled()));
    await page.locator('#event-detail [data-event-wants]').click();
    await page.waitForSelector('#event-detail [data-event-wants][aria-checked="true"]');
    check(`${w}: the switch on an interest saves the companion choice`, body('set_event_interest').p_wants_companion === true);
    const axeInterest = await axeViolations(page, { include: '#event-detail' });
    check(`${w}: axe on the drawer with an interest`, axeInterest.length === 0, JSON.stringify(axeInterest));
    await shot(page, `member-interest-${w}.png`);
    await page.locator('#event-detail [data-event-going]').click();
    // D-166: Reserve holds the seat and goes to payment; with payments not set up (st.pay) the hold stays, payable.
    await page.waitForSelector('#event-detail [data-event-pay]');
    const held = await page.locator('#event-detail').innerText();
    check(`${w}: Reserve on a paid event holds the seat and offers "Complete payment", not confirmed (${JSON.stringify(held.slice(0, 400))})`, /Complete payment · ₹499/i.test(held) && !/Registered ✓/.test(held) && body('set_event_rsvp').p_going === true);
    check(`${w}: a payment hold keeps the companion choice`, await page.locator('#event-detail [data-event-wants][aria-checked="true"]').count() === 1 && !(await page.locator('#event-detail [data-event-wants]').isDisabled()));
    await page.locator('#event-detail [data-event-ask]').click();
    await page.waitForSelector('#event-ask-dialog[open]');
    await page.locator('#event-ask-dialog button[type="submit"]').click();
    check(`${w}: an empty question is caught inline`, /Write your question/.test(await page.locator('#event-ask-error').innerText()));
    await page.fill('#event-ask-text', 'Is there parking nearby?');
    await page.locator('#event-ask-dialog button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#event-ask-dialog').open);
    const q = body('send_signal');
    check(`${w}: Ask a question sends one ordinary signal to the organiser (${JSON.stringify(q)})`, q.p_to === HOST && /^Question about Wine & Words: Is there parking nearby\?$/.test(q.p_note));
    await shot(page, `member-drawer-${w}.png`);
    await page.keyboard.press('Escape');
    await page.locator('.event-card[data-event-id="full-1"] .event-open').click();
    await page.waitForSelector('#event-detail-title');
    check(`${w}: a full event shows Registrations closed`, await page.locator('#event-detail .event-going-toggle[disabled]').count() === 1 && /Registrations closed/i.test(await page.locator('#event-detail').innerText()));
    check(`${w}: the full card says so too`, /Registrations closed/.test(await page.locator('.event-card[data-event-id="full-1"]').innerText()));
    await page.keyboard.press('Escape');
    await ctx.close();
  }
  check(`no uncaught page errors (${JSON.stringify(errors.slice(0, 3))})`, errors.filter((e) => !/404|PGRST202/.test(e)).length === 0);
} catch (error) {
  console.log(`FAIL crashed: ${error.stack || error.message}`);
  failed += 1;
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
