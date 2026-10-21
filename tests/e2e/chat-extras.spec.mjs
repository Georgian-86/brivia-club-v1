// Polish wave D: chat extras and the resume card, against stubbed Supabase. Never touches a real Supabase project.
// Playwright and axe-core are NOT repo dependencies; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/chat-extras.spec.mjs
//   SECTIONS=resume node tests/e2e/chat-extras.spec.mjs      # one section only (default: every section)
//
// Section "resume" (D3): the Profile card "Resume (PDF, up to 5 MB)".
// R1 0012 not applied (no resume_path column on the own row): the card is hidden. Column present but the bucket
//    missing: an upload shows the calm "Resume upload is coming soon." line, never an error alert.
// R2 a valid PDF: exactly one Storage POST to resumes/<me>/resume.pdf (x-upsert: true, a PDF body) and one profiles
//    PATCH { resume_path: '<me>/resume.pdf' }; the card then shows "resume.pdf" and its size.
// R3 refused before any request, with the field error: 6 MB ("Your resume must be 5 MB or smaller."), a renamed .docx
//    ("This file isn't a valid PDF."), a PNG ("Upload a PDF file."), 0 bytes ("This file is empty.").
// R4 Replace is the same upsert POST; Remove asks "Remove your resume? Matches you shared it with can no longer open
//    it."; Cancel sends nothing, OK sends one Storage DELETE (prefixes [<me>/resume.pdf]) and one PATCH resume_path null.
// R5 View signs <me>/resume.pdf for 60 s and opens the signed URL in a new tab.
// R6 a stored resume loads its size and date from Storage ("1.2 MB · Updated …"); while uploading the card is
//    aria-busy, every action is aria-disabled (still focusable) and focus stays on the pressed button.
// R8 a stored path that names no file shows Upload and clears resume_path. R9 a failed profile PATCH after a first
//    upload removes the new object again; after a Replace it keeps the file and says so honestly.
// R7 every action is >= 44 x 44 px at 375 and 1440; axe clean on the card in each state; no sideways scroll at 320.
// CHAT_EXTRAS_SHOTS=<dir> only saves screenshots (empty, uploading, uploaded and each error at 375, 768 and 1440;
// uploaded at 320, 390, 1280 and 1920), then exits.
//
// Section "share" (D4): the chat "+" quick-share (aria-label "Share") in an open thread with a match.
// Q1 "+" opens a menu of exactly "Share my resume" and "Share my area", every target >= 44 px; Escape closes it and
//    focus returns to "+"; axe clean with the menu open; no sideways scroll at 320.
// Q2 Share my resume asks first ("They'll always see your latest resume."); Cancel sends nothing; confirming posts
//    exactly one brivia_messages row { message_type 'resume', body 'Shared their resume', attachment_path
//    '<me>/resume.pdf', attachment_name 'resume.pdf', attachment_mime 'application/pdf', attachment_size } with no URL
//    in it, and nothing is signed while sharing.
// Q3 Share my area asks "Send your area to {name}?" and shows what they'll see; confirming posts exactly
//    "My area: Kochi (about a 2 km area)" (a city pick: "My area: Pune (city-wide)") as a text message: no
//    coordinate-like digits (COORD_RE), no other keys.
// Q4 a received resume renders as a "Resume · PDF" card with Open (nothing is signed until Open); Open signs
//    resumes/<sender>/resume.pdf with { expiresIn: 60 } and opens it in a new tab without an opener; a 400 shows
//    "This resume is no longer shared." An area message renders as a place card.
// Q5 without a resume, "Share my resume" is disabled with "Add a resume in your profile first." and an action that
//    leads to Profile; without a match the item is absent; without 0012 (no resume_path column) it is absent.
//
// Section "typing" (D5): the typing indicator over a private Realtime broadcast channel. The Realtime socket is
// answered in the test (routeWebSocket): every phx_join is answered ok unless a scenario refuses the typing topic.
// T1 an open thread joins realtime:typing:<lower id>:<higher id> as a private channel; a pushed broadcast
//    { typing: true } shows "typing…" under the header without moving the thread, the live region says "Asha is
//    typing" once, and it is gone after 4 s idle; dots animate, static under reduced motion; no sideways scroll at 320.
// T2 typing in the composer sends one frame (event 'typing', payload exactly { typing: true }) per 2 s; sending the
//    message sends one { typing: false }; nothing carries the draft.
// T3 with the other member in the local blocked list no phx_join for a typing topic is sent; blocking while the thread
//    is open hides the indicator at once and leaves the channel; later signals show nothing.
// T4 a typing join refused by the server shows nothing, logs nothing and is not retried.
// T5 closing the thread leaves the typing channel; hiding the tab sends { typing: false }; pagehide leaves (Realtime
//    closes its socket on pagehide) and nothing more is sent.
// T6 switching threads leaves the old pair's channel and joins the new one; a late signal from the old pair shows nothing.
// T7 closing and reopening a thread while the old leave reply is still in flight ends with one working channel.
// TYPING_SHOTS=<dir> (with SECTIONS=typing) only saves the typing line at 320, 375, 390, 768, 1280, 1440 and 1920.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, ownRow, ME, ORIGIN } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5186);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.CHAT_EXTRAS_SHOTS || '';
const SECTIONS = (process.env.SECTIONS || 'resume,share,typing').split(',');
const VIEWPORTS = {
  320: { width: 320, height: 720 }, 375: { width: 375, height: 812 }, 390: { width: 390, height: 844 }, 768: { width: 768, height: 1024 },
  1280: { width: 1280, height: 800 }, 1440: { width: 1440, height: 900 }, 1920: { width: 1920, height: 1080 },
};
const PHONE = { isMobile: true, hasTouch: true };

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };
const scenario = async (name, fn) => { try { await fn(); } catch (error) { results.push(['FAIL', `${name}: ${String(error.message).split('\n')[0]}`]); } };

const RESUME = `${ME}/resume.pdf`;
const UPLOAD_PATH = `/storage/v1/object/resumes/${RESUME}`;
const SIGN_PATH = `/storage/v1/object/sign/resumes/${RESUME}`;
const LIST_PATH = '/storage/v1/object/list/resumes';
const pdf = (size = 1258291) => { const b = Buffer.alloc(size, 0x20); b.write('%PDF-1.7\n', 0, 'latin1'); return b; };
const FILES = {
  valid: { name: 'Alex Me CV.pdf', mimeType: 'application/pdf', buffer: pdf() },
  big: { name: 'Portfolio.pdf', mimeType: 'application/pdf', buffer: pdf(6 * 1024 * 1024) },
  docx: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) },
  png: { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  empty: { name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
};
const COPY = {
  big: 'Your resume must be 5 MB or smaller.', docx: "This file isn't a valid PDF.", png: 'Upload a PDF file.', empty: 'This file is empty.',
  confirm: 'Remove your resume? Matches you shared it with can no longer open it.', soon: 'Resume upload is coming soon.',
};
const listed = (size = 1258291) => ({ body: [{ name: 'resume.pdf', id: 'obj-1', updated_at: '2026-10-21T09:00:00.000Z', created_at: '2026-10-20T09:00:00.000Z', metadata: { size, mimetype: 'application/pdf' } }] });
const baseRoutes = () => ({
  [`POST ${SIGN_PATH}`]: { body: { signedURL: `/object/sign/resumes/${RESUME}?token=stub-token` } },
  [`POST ${LIST_PATH}`]: { body: [] },
});

const st = { own: { ...ownRow }, routes: baseRoutes() };
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;
const since = (mark) => st.calls.slice(mark);
const storageCalls = (mark) => since(mark).filter((c) => c.path.startsWith('/storage/v1/object/') && !c.path.startsWith('/storage/v1/object/public/') && c.method !== 'OPTIONS');
const profilePatches = (mark) => since(mark).filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles').map((c) => JSON.parse(c.body || '{}'));

try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const open = async (width, { own = { ...ownRow, resume_path: null }, routes = {} } = {}) => {
    st.own = own;
    st.routes = { ...baseRoutes(), ...routes };
    const context = await stub.newContext(browser, VIEWPORTS[width], { reducedMotion: 'reduce', ...(width <= 780 ? PHONE : {}) });
    const page = await stub.open(context, { path: '/app.html?view=profile', errors: pageErrors });
    page.setDefaultTimeout(6000);
    const headers = [];
    page.on('request', (request) => { if (request.url().includes('/storage/v1/object/') && request.method() !== 'OPTIONS') headers.push({ method: request.method(), path: new URL(request.url()).pathname, headers: request.headers(), body: request.postDataBuffer() }); });
    await page.waitForTimeout(600);
    return { context, page, headers };
  };
  const card = '#profile-resume';
  const state = (page) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const visible = (node) => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    return {
      visible: visible(el),
      busy: el.getAttribute('aria-busy'),
      title: el.querySelector('h2')?.textContent.replace(/\s+/g, ' ').trim(),
      name: el.querySelector('.profile-resume-name')?.textContent.trim() || '',
      meta: el.querySelector('.profile-resume-meta')?.textContent.trim() || '',
      error: [...el.querySelectorAll('[role="alert"]')].filter(visible).map((n) => n.textContent.trim()).join(' | '),
      note: el.querySelector('.profile-resume-note')?.textContent.trim() || '',
      actions: [...el.querySelectorAll('button')].filter(visible).map((b) => ({ action: b.dataset.resumeAction, text: b.textContent.trim(), disabled: b.disabled, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
    };
  }, card);
  const choose = async (page, file) => {
    await page.locator(`${card} input[type="file"]`).setInputFiles(file);
  };
  const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 6000 }).catch(() => null);
  const waitUploaded = (page) => waitFor(page, (sel) => document.querySelector(`${sel} .profile-resume-name`) && document.querySelector(sel).getAttribute('aria-busy') !== 'true', card);
  const waitError = (page) => waitFor(page, (sel) => document.querySelector(`${sel} [role="alert"]`)?.textContent.trim(), card);

  if (SHOTS && SECTIONS.includes('resume')) {
    const dir = SHOTS;
    mkdirSync(dir, { recursive: true });
    const shot = async (page, name) => {
      await page.locator(card).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
      await page.locator(card).screenshot({ path: path.join(dir, `${name}-card.png`) });
    };
    for (const width of [375, 768, 1440]) {
      { const { context, page } = await open(width); await shot(page, `resume-empty-${width}`); await context.close(); }
      {
        const { context, page } = await open(width, { routes: { [`POST ${UPLOAD_PATH}`]: { delayMs: 8000 } } });
        await choose(page, FILES.valid);
        await page.waitForTimeout(500);
        await shot(page, `resume-uploading-${width}`);
        await context.close();
      }
      { const { context, page } = await open(width, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } }); await waitUploaded(page); await shot(page, `resume-uploaded-${width}`); await context.close(); }
      for (const kind of ['big', 'docx', 'png', 'empty']) {
        const { context, page } = await open(width);
        await choose(page, FILES[kind]);
        await waitError(page);
        await shot(page, `resume-error-${kind}-${width}`);
        await context.close();
      }
      {
        const { context, page } = await open(width, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } });
        await waitUploaded(page);
        await choose(page, FILES.big);
        await waitError(page);
        await shot(page, `resume-uploaded-error-${width}`);
        await context.close();
      }
      {
        const { context, page } = await open(width, { routes: { [`POST ${UPLOAD_PATH}`]: { status: 400, message: 'Bucket not found' } } });
        await choose(page, FILES.valid);
        await waitFor(page, (sel) => document.querySelector(`${sel} .profile-resume-note`), card);
        await shot(page, `resume-coming-soon-${width}`);
        await context.close();
      }
    }
    for (const width of [320, 390, 1280, 1920]) {
      const { context, page } = await open(width, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } });
      await waitUploaded(page);
      await shot(page, `resume-uploaded-${width}`);
      await context.close();
    }
    {
      const { context, page } = await open(1440, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } });
      await waitUploaded(page);
      await page.locator(`${card} [data-resume-action="view"]`).focus();
      await page.keyboard.press('Tab');
      await shot(page, 'resume-focus-1440');
      await context.close();
    }
  } else if (!SHOTS && SECTIONS.includes('resume')) {
    // R1: 0012 not applied: the own row has no resume_path column, so the card is hidden.
    await scenario('R1 hidden', async () => {
      const { context, page } = await open(375, { own: { ...ownRow } });
      const s = await state(page);
      check(`R1 without the resume_path column the card is hidden (${JSON.stringify(s && s.visible)})`, () => assert.ok(s && s.visible === false));
      await context.close();
    });
    await scenario('R1 coming soon', async () => {
      const { context, page } = await open(375, { routes: { [`POST ${UPLOAD_PATH}`]: { status: 400, message: 'Bucket not found' } } });
      await choose(page, FILES.valid);
      await waitFor(page, (sel) => document.querySelector(`${sel} .profile-resume-note`), card);
      const s = await state(page);
      check(`R1 a missing bucket shows the calm coming-soon line, no alert, no actions (${JSON.stringify(s)})`, () => {
        assert.equal(s.note, COPY.soon); assert.equal(s.error, ''); assert.deepEqual(s.actions, []);
      });
      await context.close();
    });

    // R2 + R6 + R7: empty state, a valid upload, then the uploaded state.
    await scenario('R2 upload', async () => {
      for (const width of [375, 1440]) {
        const { context, page, headers } = await open(width, { routes: { [`POST ${UPLOAD_PATH}`]: { delayMs: 700 } } });
        const empty = await state(page);
        check(`R2 ${width}: the empty card reads "Resume (PDF, up to 5 MB)" with one Upload action >= 44 px (${JSON.stringify(empty)})`, () => {
          assert.equal(empty.visible, true);
          assert.equal(empty.title, 'Resume (PDF, up to 5 MB)');
          assert.deepEqual(empty.actions.map((a) => a.action), ['upload']);
          assert.ok(empty.actions.every((a) => a.h >= 44 && a.w >= 44));
        });
        const axeEmpty = await axeViolations(page, { include: card });
        check(`R7 ${width}: axe clean on the empty card (${axeEmpty.join(' | ')})`, () => assert.deepEqual(axeEmpty, []));
        const mark = st.calls.length;
        await page.locator(`${card} [data-resume-action="upload"]`).focus();
        await choose(page, FILES.valid);
        const busy = await waitFor(page, (sel) => {
          const el = document.querySelector(sel);
          return el.getAttribute('aria-busy') === 'true' ? { buttons: [...el.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => ({ aria: b.getAttribute('aria-disabled'), disabled: b.disabled })), focused: document.activeElement?.dataset?.resumeAction || document.activeElement?.tagName, status: el.querySelector('[role="status"]')?.textContent.trim() } : null;
        }, card).then((h) => h && h.jsonValue());
        check(`R6 ${width}: while uploading the card is aria-busy, every action aria-disabled (still focusable), focus stays on Upload, status "Uploading…" (${JSON.stringify(busy)})`, () => {
          assert.ok(busy);
          assert.ok(busy.buttons.length && busy.buttons.every((b) => b.aria === 'true' && b.disabled === false));
          assert.equal(busy.focused, 'upload');
          assert.match(busy.status, /Uploading/);
        });
        const chooser = page.waitForEvent('filechooser', { timeout: 400 }).then(() => true).catch(() => false);
        await page.locator(`${card} [data-resume-action="upload"]`).click({ force: true });
        const pickerOpened = await chooser;
        // (No extra request either: R2 below counts exactly one Storage POST over the whole upload, this click included.)
        check(`R6 ${width}: a click on a busy action opens no file picker (${pickerOpened})`, () => assert.equal(pickerOpened, false));
        const axeBusy = await axeViolations(page, { include: card });
        check(`R7 ${width}: axe clean while uploading (${axeBusy.join(' | ')})`, () => assert.deepEqual(axeBusy, []));
        await waitUploaded(page);
        await page.waitForTimeout(300);
        const storage = storageCalls(mark);
        const uploads = headers.filter((h) => h.method === 'POST' && h.path === UPLOAD_PATH);
        check(`R2 ${width}: exactly one Storage POST to resumes/<me>/resume.pdf with x-upsert true and a %PDF body (${JSON.stringify(storage.map((c) => `${c.method} ${c.path}`))})`, () => {
          assert.deepEqual(storage.map((c) => `${c.method} ${c.path}`), [`POST ${UPLOAD_PATH}`]);
          assert.equal(uploads.length, 1);
          assert.equal(uploads[0].headers['x-upsert'], 'true');
          assert.ok(uploads[0].body.includes(Buffer.from('%PDF-1.7')));
        });
        check(`R2 ${width}: exactly one profiles PATCH { resume_path } (${JSON.stringify(profilePatches(mark))})`, () => assert.deepEqual(profilePatches(mark), [{ resume_path: RESUME }]));
        const done = await state(page);
        check(`R2 ${width}: the card shows resume.pdf · 1.2 MB and View / Replace / Remove, each >= 44 px (${JSON.stringify(done)})`, () => {
          assert.equal(done.name, 'resume.pdf');
          assert.match(done.meta, /^1\.2 MB · Updated \d{1,2} [A-Z][a-z]{2,3} \d{4}$/);
          assert.deepEqual(done.actions.map((a) => a.action), ['view', 'replace', 'remove']);
          assert.ok(done.actions.every((a) => a.h >= 44 && a.w >= 44 && !a.disabled), JSON.stringify(done.actions));
          assert.equal(done.busy, null);
        });
        const axeDone = await axeViolations(page, { include: card });
        check(`R7 ${width}: axe clean on the uploaded card (${axeDone.join(' | ')})`, () => assert.deepEqual(axeDone, []));
        await context.close();
      }
    });

    // R3: refused before any request.
    await scenario('R3 refusals', async () => {
      const { context, page } = await open(375);
      for (const kind of ['big', 'docx', 'png', 'empty']) {
        const mark = st.calls.length;
        await choose(page, FILES[kind]);
        await waitError(page);
        await page.waitForTimeout(200);
        const s = await state(page);
        check(`R3 ${kind}: the field error reads "${COPY[kind]}" and no request is sent (${JSON.stringify({ error: s.error, calls: storageCalls(mark).length, patches: profilePatches(mark).length })})`, () => {
          assert.equal(s.error, COPY[kind]);
          assert.equal(storageCalls(mark).length, 0);
          assert.equal(profilePatches(mark).length, 0);
        });
        await page.locator(`${card} input[type="file"]`).evaluate((input) => { input.value = ''; });
      }
      const described = await page.evaluate((sel) => {
        const button = document.querySelector(`${sel} [data-resume-action="upload"]`);
        const ids = (button?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        return ids.map((id) => document.getElementById(id)?.textContent.trim()).join(' | ');
      }, card);
      check(`R3 the Upload button is described by the field error (${described})`, () => assert.match(described, /This file is empty\./));
      const axe = await axeViolations(page, { include: card });
      check(`R7 375: axe clean with a field error (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      // A good file after an error clears it.
      await choose(page, FILES.valid);
      await waitUploaded(page);
      const s = await state(page);
      check(`R3 a valid file after an error clears the error (${JSON.stringify(s.error)})`, () => assert.equal(s.error, ''));
      await context.close();
    });

    // R4 + R5 + R6: a stored resume: its info, View, Replace, Remove.
    await scenario('R4 stored', async () => {
      const { context, page, headers } = await open(1440, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } });
      await waitUploaded(page);
      const s = await state(page);
      check(`R6 a stored resume shows its size and date from Storage (${s.meta})`, () => assert.equal(s.meta, '1.2 MB · Updated 21 Oct 2026'));

      let mark = st.calls.length;
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 6000 }),
        page.locator(`${card} [data-resume-action="view"]`).click(),
      ]);
      await popup.waitForURL(/token=stub-token/, { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(200);
      const sign = since(mark).filter((c) => c.method === 'POST' && c.path === SIGN_PATH);
      check(`R5 View signs resumes/<me>/resume.pdf for 60 s and opens the signed URL (${JSON.stringify({ sign: sign.map((c) => c.body), url: popup.url() })})`, () => {
        assert.equal(sign.length, 1);
        assert.deepEqual(JSON.parse(sign[0].body), { expiresIn: 60 });
        assert.equal(popup.url(), `${ORIGIN}/storage/v1/object/sign/resumes/${RESUME}?token=stub-token`);
      });
      const opener = await popup.evaluate(() => window.opener === null).catch(() => null);
      check(`R5 the new tab has no opener (${opener})`, () => assert.equal(opener, true));
      await popup.close();

      mark = st.calls.length;
      const before = headers.length;
      await choose(page, FILES.valid);
      await waitUploaded(page);
      await page.waitForTimeout(300);
      const replace = headers.slice(before).filter((h) => h.method === 'POST' && h.path === UPLOAD_PATH);
      check(`R4 Replace is one upsert POST to the same path and one PATCH (${JSON.stringify({ replace: replace.length, patches: profilePatches(mark) })})`, () => {
        assert.equal(replace.length, 1);
        assert.equal(replace[0].headers['x-upsert'], 'true');
        assert.deepEqual(profilePatches(mark), [{ resume_path: RESUME }]);
      });
      const replaceTriggers = await page.evaluate((sel) => {
        const replaceButton = document.querySelector(`${sel} [data-resume-action="replace"]`);
        let opened = false;
        const input = document.querySelector(`${sel} input[type="file"]`);
        const original = input.click;
        input.click = () => { opened = true; };
        replaceButton.click();
        input.click = original;
        return opened;
      }, card);
      check('R4 Replace opens the file picker', () => assert.equal(replaceTriggers, true));

      // Remove: Cancel sends nothing.
      const dialogs = [];
      page.once('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss(); });
      mark = st.calls.length;
      await page.locator(`${card} [data-resume-action="remove"]`).click();
      await page.waitForTimeout(300);
      check(`R4 Remove asks first; Cancel sends nothing (${JSON.stringify({ dialogs, calls: storageCalls(mark).length })})`, () => {
        assert.deepEqual(dialogs, [COPY.confirm]);
        assert.equal(storageCalls(mark).length, 0);
        assert.equal(profilePatches(mark).length, 0);
      });
      page.once('dialog', (dialog) => dialog.accept());
      mark = st.calls.length;
      await page.locator(`${card} [data-resume-action="remove"]`).click();
      await waitFor(page, (sel) => document.querySelector(`${sel} [data-resume-action="upload"]`), card);
      await page.waitForTimeout(200);
      const removes = storageCalls(mark);
      check(`R4 OK sends one Storage DELETE of <me>/resume.pdf and one PATCH resume_path null (${JSON.stringify({ removes: removes.map((c) => `${c.method} ${c.path} ${c.body}`), patches: profilePatches(mark) })})`, () => {
        assert.equal(removes.length, 1);
        assert.equal(removes[0].method, 'DELETE');
        assert.equal(removes[0].path, '/storage/v1/object/resumes');
        assert.deepEqual(JSON.parse(removes[0].body), { prefixes: [RESUME] });
        assert.deepEqual(profilePatches(mark), [{ resume_path: null }]);
      });
      const after = await state(page);
      const focused = await page.evaluate(() => document.activeElement?.dataset?.resumeAction || document.activeElement?.tagName);
      check(`R4 after Remove the empty state returns and focus lands on Upload (${JSON.stringify({ actions: after.actions.map((a) => a.action), focused })})`, () => {
        assert.deepEqual(after.actions.map((a) => a.action), ['upload']);
        assert.equal(focused, 'upload');
      });
      await context.close();
    });

    // R8 (fix round): a stored path that names no file shows Upload and clears the column (best effort).
    await scenario('R8 stale path', async () => {
      const mark = st.calls.length;
      const { context, page } = await open(375, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: { body: [] } } });
      await waitFor(page, (sel) => document.querySelector(`${sel} [data-resume-action="upload"]`), card);
      await page.waitForTimeout(300);
      const s = await state(page);
      check(`R8 a stored path with no file shows Upload and PATCHes resume_path null (${JSON.stringify({ actions: s.actions.map((a) => a.action), patches: profilePatches(mark) })})`, () => {
        assert.deepEqual(s.actions.map((a) => a.action), ['upload']);
        assert.deepEqual(profilePatches(mark), [{ resume_path: null }]);
      });
      await context.close();
    });

    // R9 (fix round): a failed profile write after a first upload removes the new file again; after a Replace it
    // keeps the file and says so honestly.
    await scenario('R9 failed PATCH', async () => {
      {
        const { context, page } = await open(375, { routes: { 'PATCH profiles': { status: 500 } } });
        const mark = st.calls.length;
        await choose(page, FILES.valid);
        await waitError(page);
        await page.waitForTimeout(300);
        const s = await state(page);
        const storage = storageCalls(mark).map((c) => `${c.method} ${c.path}`);
        check(`R9 first upload + failed PATCH: the object is removed again and the retry copy shows (${JSON.stringify({ storage, error: s.error, actions: s.actions.map((a) => a.action) })})`, () => {
          assert.deepEqual(storage, [`POST ${UPLOAD_PATH}`, 'DELETE /storage/v1/object/resumes']);
          assert.equal(s.error, "Your resume couldn't be uploaded. Please try again.");
          assert.deepEqual(s.actions.map((a) => a.action), ['upload']);
        });
        await context.close();
      }
      {
        const { context, page } = await open(375, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed(), 'PATCH profiles': { status: 500 } } });
        await waitUploaded(page);
        const mark = st.calls.length;
        await choose(page, FILES.valid);
        await waitError(page);
        await page.waitForTimeout(300);
        const s = await state(page);
        const storage = storageCalls(mark).map((c) => `${c.method} ${c.path}`);
        check(`R9 Replace + failed PATCH: no rollback, the file is re-read and the copy is honest (${JSON.stringify({ storage, error: s.error, meta: s.meta })})`, () => {
          assert.deepEqual(storage, [`POST ${UPLOAD_PATH}`, `POST ${LIST_PATH}`]);
          assert.equal(s.error, "Your new resume is saved, but we couldn't update your profile. Please try again.");
          assert.equal(s.name, 'resume.pdf');
          assert.equal(s.meta, '1.2 MB · Updated 21 Oct 2026');
          assert.deepEqual(s.actions.map((a) => a.action), ['view', 'replace', 'remove']);
        });
        await context.close();
      }
    });

    // R7: no sideways scroll at 320 in the uploaded state with an error showing.
    await scenario('R7 320', async () => {
      const { context, page } = await open(320, { own: { ...ownRow, resume_path: RESUME }, routes: { [`POST ${LIST_PATH}`]: listed() } });
      await waitUploaded(page);
      await choose(page, FILES.big);
      await waitError(page);
      const overflow = await page.evaluate((sel) => {
        const el = document.querySelector(sel).getBoundingClientRect();
        return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: Math.round(el.right), vw: window.innerWidth };
      }, card);
      check(`R7 320: no sideways scroll and the card fits (${JSON.stringify(overflow)})`, () => { assert.ok(overflow.doc <= 0); assert.ok(overflow.right <= overflow.vw); });
      const s = await state(page);
      check(`R7 320: every action is >= 44 px (${JSON.stringify(s.actions)})`, () => assert.ok(s.actions.length === 3 && s.actions.every((a) => a.h >= 44 && a.w >= 44)));
      await context.close();
    });

  }
  // ------------------------------------------------------------------------------------------------------------
  // Section "share" (D4): the chat "+" quick-share.
  // ------------------------------------------------------------------------------------------------------------
  if (!SHOTS && SECTIONS.includes('share')) {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
    const THEIR_RESUME = `${A}/resume.pdf`;
    const THEIR_SIGN = `/storage/v1/object/sign/resumes/${THEIR_RESUME}`;
    const COORD_RE = /-?\d{1,3}\.\d{2,}/;
    const SHARE = '#chat-form [aria-label="Share"]';
    const MENU = '#chat-share-menu';
    const DIALOG = 'dialog.share-confirm';
    const hello = { id: 'msg-hello', sender_id: A, recipient_id: ME, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() };
    const theirResume = { id: 'msg-resume', sender_id: A, recipient_id: ME, body: 'Shared their resume', message_type: 'resume', attachment_url: null, attachment_path: THEIR_RESUME, attachment_name: 'resume.pdf', attachment_mime: 'application/pdf', attachment_size: 1258291, created_at: new Date(Date.now() - 4e5).toISOString() };
    const theirArea = { id: 'msg-area', sender_id: A, recipient_id: ME, body: 'My area: Kochi (about a 2 km area)', message_type: 'text', created_at: new Date(Date.now() - 3e5).toISOString() };
    const messagePosts = (mark) => since(mark).filter((c) => c.method === 'POST' && c.path === '/rest/v1/brivia_messages').map((c) => JSON.parse(c.body || '{}'));
    const signCalls = (mark) => since(mark).filter((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/sign/'));
    const openThread = async (width, { own = { ...ownRow, resume_path: RESUME }, routes = {}, messages = [hello], matchIds = [A], placeLabel = 'Kochi' } = {}) => {
      Object.assign(st, { own, routes: { ...baseRoutes(), [`POST ${LIST_PATH}`]: listed(), [`POST ${THEIR_SIGN}`]: { body: { signedURL: `/object/sign/resumes/${THEIR_RESUME}?token=their-token` } }, ...routes }, messages, matchIds, placeLabel });
      const context = await stub.newContext(browser, VIEWPORTS[width], { reducedMotion: 'reduce', ...(width <= 780 ? PHONE : {}) });
      const page = await stub.open(context, { path: '/app.html?view=chat', errors: pageErrors });
      page.setDefaultTimeout(6000);
      await page.waitForSelector('#chat-list [data-chat-id]', { timeout: 8000 });
      await page.locator('#chat-list [data-chat-id]').first().click();
      await page.waitForSelector('#chat-window:not([hidden]) #chat-form', { timeout: 6000 });
      await page.waitForTimeout(500);
      return { context, page };
    };
    const menuState = (page) => page.evaluate(([toggleSel, menuSel]) => {
      const toggle = document.querySelector(toggleSel);
      const menu = document.querySelector(menuSel);
      const visible = (node) => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      const box = (node) => { const r = node.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      return {
        toggle: toggle ? { visible: visible(toggle), expanded: toggle.getAttribute('aria-expanded'), ...box(toggle) } : null,
        open: visible(menu),
        items: menu ? [...menu.querySelectorAll('[data-share]')].filter(visible).map((b) => ({ share: b.dataset.share, title: b.querySelector('.chat-share-title')?.textContent.trim(), hint: b.querySelector('.chat-share-hint')?.textContent.trim() || '', disabled: b.getAttribute('aria-disabled') === 'true' || b.disabled, ...box(b) })) : [],
        actions: menu ? [...menu.querySelectorAll('[data-share-action]')].filter(visible).map((b) => ({ action: b.dataset.shareAction, text: b.textContent.trim(), ...box(b) })) : [],
        focused: document.activeElement?.getAttribute('aria-label') || document.activeElement?.dataset?.share || document.activeElement?.tagName,
      };
    }, [SHARE, MENU]);
    const openMenu = async (page) => { await page.locator(SHARE).click(); await page.waitForTimeout(250); return menuState(page); };

    await scenario('Q1 menu', async () => {
      for (const width of [375, 390, 1280, 1440, 1920]) {
        const { context, page } = await openThread(width);
        const closed = await menuState(page);
        check(`Q1 ${width}: the composer has a "+" Share button >= 44 px, closed (${JSON.stringify(closed.toggle)})`, () => {
          assert.ok(closed.toggle && closed.toggle.visible);
          assert.equal(closed.toggle.expanded, 'false');
          assert.ok(closed.toggle.w >= 44 && closed.toggle.h >= 44);
          assert.equal(closed.open, false);
        });
        const s = await openMenu(page);
        check(`Q1 ${width}: the menu shows exactly "Share my resume" and "Share my area", each >= 44 px (${JSON.stringify(s)})`, () => {
          assert.equal(s.open, true);
          assert.equal(s.toggle.expanded, 'true');
          assert.deepEqual(s.items.map((i) => i.title), ['Share my resume', 'Share my area']);
          assert.ok(s.items.every((i) => i.h >= 44 && i.w >= 44 && !i.disabled));
        });
        // Scoped to the new controls: the legacy #chat-input (title-only label) and the thread's time stamps (3.5:1)
        // predate D4 and are reported, not fixed here.
        const axe = await axeViolations(page, { include: `#chat-share-toggle, ${MENU}` });
        check(`Q1 ${width}: axe clean with the menu open (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        const after = await menuState(page);
        check(`Q1 ${width}: Escape closes the menu and focus returns to "+" (${JSON.stringify({ open: after.open, focused: after.focused })})`, () => {
          assert.equal(after.open, false);
          assert.equal(after.toggle.expanded, 'false');
          assert.equal(after.focused, 'Share');
        });
        await openMenu(page);
        const fit = await page.evaluate((sel) => {
          const menu = document.querySelector(sel).getBoundingClientRect();
          const card = document.querySelector('#chat-window').getBoundingClientRect();
          return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: Math.round(menu.left), right: Math.round(menu.right), cardLeft: Math.round(card.left), cardRight: Math.round(card.right) };
        }, MENU);
        check(`Q1 ${width}: the open menu fits inside the chat card, no sideways scroll (${JSON.stringify(fit)})`, () => { assert.ok(fit.doc <= 0); assert.ok(fit.right <= fit.cardRight && fit.left >= fit.cardLeft); });
        await context.close();
      }
      const { context, page } = await openThread(320);
      await openMenu(page);
      const overflow = await page.evaluate((sel) => {
        const menu = document.querySelector(sel).getBoundingClientRect();
        const card = document.querySelector('#chat-window').getBoundingClientRect();
        return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: Math.round(menu.left), right: Math.round(menu.right), cardLeft: Math.round(card.left), cardRight: Math.round(card.right) };
      }, MENU);
      check(`Q1 320: the open menu fits inside the chat card (which clips), no sideways scroll (${JSON.stringify(overflow)})`, () => { assert.ok(overflow.doc <= 0); assert.ok(overflow.right <= overflow.cardRight && overflow.left >= overflow.cardLeft); });
      await context.close();
    });

    // I1 (review): "+" and the chat "..." menu close each other ("..." stops propagation, so the composer listens in
    // the capture phase).
    await scenario('Q1 layers', async () => {
      for (const width of [375, 1440]) {
        const { context, page } = await openThread(width);
        await openMenu(page);
        // A programmatic click keeps focus in the menu, so only the outside-click closer (not focusout) can close it.
        await page.evaluate(() => document.querySelector('#chat-more').click());
        await page.waitForTimeout(200);
        const a = await page.evaluate((sel) => ({ share: !document.querySelector(sel).hidden, more: !document.querySelector('#chat-more-menu').hidden, expanded: document.querySelector('#chat-share-toggle').getAttribute('aria-expanded') }), MENU);
        check(`Q1 ${width}: opening "..." closes the share menu (${JSON.stringify(a)})`, () => { assert.equal(a.share, false); assert.equal(a.more, true); assert.equal(a.expanded, 'false'); });
        await page.locator(SHARE).click();
        await page.waitForTimeout(250);
        const b = await page.evaluate((sel) => ({ share: !document.querySelector(sel).hidden, more: !document.querySelector('#chat-more-menu').hidden }), MENU);
        check(`Q1 ${width}: opening "+" closes the "..." menu (${JSON.stringify(b)})`, () => { assert.equal(b.share, true); assert.equal(b.more, false); });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);
        const c = await page.evaluate((sel) => ({ share: !document.querySelector(sel).hidden, inMenu: document.querySelector(sel).contains(document.activeElement) }), MENU);
        check(`Q1 ${width}: tabbing out of the menu closes it (${JSON.stringify(c)})`, () => { assert.equal(c.inMenu, false); assert.equal(c.share, false); });
        await context.close();
      }
    });

    await scenario('Q2 share resume', async () => {
      const { context, page } = await openThread(375);
      await openMenu(page);
      let mark = st.calls.length;
      await page.locator(`${MENU} [data-share="resume"]`).click();
      await page.waitForSelector(`${DIALOG}[open]`, { timeout: 4000 });
      const sheet = await page.locator(DIALOG).innerText();
      check(`Q2 Share my resume asks first and says they'll see the latest resume (${JSON.stringify(sheet)})`, () => {
        assert.match(sheet, /Share your resume with Asha Band\?/);
        assert.match(sheet, /They'll always see your latest resume\./);
      });
      const axe = await axeViolations(page, { include: DIALOG });
      check(`Q2 axe clean on the confirm sheet (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      await page.locator(`${DIALOG} [data-share-cancel]`).click();
      await page.waitForTimeout(250);
      check(`Q2 Cancel sends nothing (${JSON.stringify(messagePosts(mark))})`, () => assert.deepEqual(messagePosts(mark), []));
      await openMenu(page);
      mark = st.calls.length;
      await page.locator(`${MENU} [data-share="resume"]`).click();
      await page.waitForSelector(`${DIALOG}[open]`, { timeout: 4000 });
      await page.locator(`${DIALOG} [data-share-confirm]`).click();
      await page.waitForTimeout(600);
      const posts = messagePosts(mark);
      const raw = since(mark).filter((c) => c.method === 'POST' && c.path === '/rest/v1/brivia_messages').map((c) => c.body).join('');
      check(`Q2 confirming posts exactly one resume message with the D4 payload (${JSON.stringify(posts)})`, () => {
        assert.deepEqual(posts, [{ sender_id: ME, recipient_id: A, body: 'Shared their resume', message_type: 'resume', attachment_path: RESUME, attachment_name: 'resume.pdf', attachment_mime: 'application/pdf', attachment_size: 1258291 }]);
      });
      check(`Q2 the message carries no URL and nothing was signed while sharing (${JSON.stringify({ raw, sign: signCalls(mark).length })})`, () => {
        assert.ok(!/https?:|token=|\/storage\//i.test(raw));
        assert.equal(signCalls(mark).length, 0);
      });
      const closed = await page.evaluate((sel) => !document.querySelector(`${sel}[open]`), DIALOG);
      check('Q2 the sheet closes after sharing', () => assert.equal(closed, true));
      await context.close();
    });

    await scenario('Q3 share area', async () => {
      for (const [label, expected] of [['Kochi', 'My area: Kochi (about a 2 km area)'], ['Pune (city-wide)', 'My area: Pune (city-wide)']]) {
        const { context, page } = await openThread(1440, { placeLabel: label });
        await openMenu(page);
        const mark = st.calls.length;
        await page.locator(`${MENU} [data-share="area"]`).click();
        await page.waitForSelector(`${DIALOG}[open]`, { timeout: 4000 });
        const sheet = await page.locator(DIALOG).innerText();
        check(`Q3 ${label}: the sheet asks "Send your area to Asha Band?" and shows what they'll see (${JSON.stringify(sheet)})`, () => {
          assert.match(sheet, /Send your area to Asha Band\?/);
          assert.match(sheet, /They'll see:/);
          assert.ok(sheet.includes(expected));
        });
        const axe = await axeViolations(page, { include: DIALOG });
        check(`Q3 ${label}: axe clean on the sheet (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        await page.locator(`${DIALOG} [data-share-confirm]`).click();
        await page.waitForTimeout(600);
        const posts = messagePosts(mark);
        check(`Q3 ${label}: exactly one text message with the exact area text and nothing else (${JSON.stringify(posts)})`, () => {
          assert.deepEqual(posts, [{ sender_id: ME, recipient_id: A, body: expected, message_type: 'text' }]);
          assert.ok(!COORD_RE.test(JSON.stringify(posts)));
        });
        await context.close();
      }
    });

    await scenario('Q4 bubbles', async () => {
      for (const width of [375, 1440]) {
        const mark0 = st.calls.length;
        const { context, page } = await openThread(width, { messages: [hello, theirResume, theirArea] });
        await page.waitForSelector('#chat-messages .message-resume', { timeout: 6000 });
        const bubbles = await page.evaluate(() => {
          const card = document.querySelector('#chat-messages .message-resume');
          const place = document.querySelector('#chat-messages .message-place');
          const open = card?.querySelector('[data-resume-open]');
          const r = open?.getBoundingClientRect();
          return { card: card?.innerText.replace(/\s+/g, ' ').trim(), open: open ? { text: open.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) } : null, place: place?.innerText.replace(/\s+/g, ' ').trim() || '' };
        });
        check(`Q4 ${width}: the resume renders as a "Resume · PDF" card with Open >= 44 px, the area as a place card (${JSON.stringify(bubbles)})`, () => {
          assert.match(bubbles.card, /Resume · PDF/);
          assert.equal(bubbles.open.text, 'Open');
          assert.ok(bubbles.open.w >= 44 && bubbles.open.h >= 44);
          assert.match(bubbles.place, /Kochi/);
          assert.match(bubbles.place, /about a 2 km area/i);
        });
        check(`Q4 ${width}: nothing is signed before Open (${JSON.stringify(signCalls(mark0).map((c) => c.path))})`, () => assert.deepEqual(signCalls(mark0).filter((c) => c.path.includes('resume')), []));
        const axe = await axeViolations(page, { include: '#chat-messages .message-resume, #chat-messages .message-place' });
        check(`Q4 ${width}: axe clean on the bubbles (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        if (width === 1440) {
          let mark = st.calls.length;
          const [popup] = await Promise.all([
            context.waitForEvent('page', { timeout: 6000 }),
            page.locator('#chat-messages [data-resume-open]').click(),
          ]);
          await popup.waitForURL(/token=their-token/, { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(200);
          const sign = signCalls(mark);
          check(`Q4 Open signs resumes/<sender>/resume.pdf for 60 s and opens it (${JSON.stringify({ sign: sign.map((c) => `${c.path} ${c.body}`), url: popup.url() })})`, () => {
            assert.equal(sign.length, 1);
            assert.equal(sign[0].path, THEIR_SIGN);
            assert.deepEqual(JSON.parse(sign[0].body), { expiresIn: 60 });
            assert.equal(popup.url(), `${ORIGIN}/storage/v1/object/sign/resumes/${THEIR_RESUME}?token=their-token`);
          });
          const opener = await popup.evaluate(() => window.opener === null).catch(() => null);
          check(`Q4 the new tab has no opener (${opener})`, () => assert.equal(opener, true));
          await popup.close();
          const stored = await page.evaluate(() => /token=/.test(document.documentElement.outerHTML + JSON.stringify(window.localStorage)));
          check(`Q4 nothing signed is stored in the page or storage (${stored})`, () => assert.equal(stored, false));
          st.routes[`POST ${THEIR_SIGN}`] = { status: 400, message: 'Object not found' };
          mark = st.calls.length;
          const popups = [];
          context.on('page', (p) => popups.push(p));
          await page.locator('#chat-messages [data-resume-open]').click();
          await page.waitForFunction(() => /This resume is no longer shared\./.test(document.querySelector('#chat-messages .message-resume')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(300);
          const gone = await page.evaluate(() => document.querySelector('#chat-messages .message-resume')?.innerText.replace(/\s+/g, ' ').trim());
          const openTabs = popups.filter((p) => !p.isClosed()).length;
          check(`Q4 a 400 shows "This resume is no longer shared." and leaves no tab open (${JSON.stringify({ gone, openTabs, sign: signCalls(mark).length })})`, () => {
            assert.match(gone, /This resume is no longer shared\./);
            assert.equal(openTabs, 0);
            assert.equal(signCalls(mark).length, 1);
          });
        }
        await context.close();
      }
    });

    await scenario('Q5 no resume', async () => {
      {
        const { context, page } = await openThread(375, { own: { ...ownRow, resume_path: null } });
        const s = await openMenu(page);
        check(`Q5 without a resume the item is disabled with "Add a resume in your profile first." and a way to Profile (${JSON.stringify(s)})`, () => {
          assert.deepEqual(s.items.map((i) => i.title), ['Share my resume', 'Share my area']);
          assert.equal(s.items[0].disabled, true);
          assert.equal(s.items[0].hint, 'Add a resume in your profile first.');
          assert.equal(s.items[1].disabled, false);
          assert.deepEqual(s.actions.map((a) => a.action), ['add-resume']);
          assert.ok(s.actions.every((a) => a.h >= 44 && a.w >= 44));
        });
        const axe = await axeViolations(page, { include: `#chat-share-toggle, ${MENU}` });
        check(`Q5 axe clean with the disabled item (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        const mark = st.calls.length;
        await page.locator(`${MENU} [data-share="resume"]`).click({ force: true });
        await page.waitForTimeout(300);
        const dialogOpen = await page.evaluate((sel) => Boolean(document.querySelector(`${sel}[open]`)), DIALOG);
        check(`Q5 the disabled item sends nothing and asks nothing (${JSON.stringify({ posts: messagePosts(mark), dialogOpen })})`, () => { assert.deepEqual(messagePosts(mark), []); assert.equal(dialogOpen, false); });
        if (!(await menuState(page)).open) await openMenu(page);
        await page.locator(`${MENU} [data-share-action="add-resume"]`).click();
        await page.waitForTimeout(500);
        const where = await page.evaluate(() => ({ view: new URLSearchParams(window.location.search).get('view'), card: Boolean(document.querySelector('#profile-resume')?.getClientRects().length), focused: document.activeElement?.dataset?.resumeAction || '' }));
        check(`Q5 the Profile action opens Profile at the resume card with Upload focused (${JSON.stringify(where)})`, () => { assert.equal(where.view, 'profile'); assert.equal(where.card, true); assert.equal(where.focused, 'upload'); });
        await context.close();
      }
      {
        const { context, page } = await openThread(375, { matchIds: [] });
        const s = await openMenu(page);
        check(`Q5 without a match "Share my resume" is absent (${JSON.stringify(s.items.map((i) => i.title))})`, () => assert.deepEqual(s.items.map((i) => i.title), ['Share my area']));
        await context.close();
      }
      {
        const { context, page } = await openThread(375, { own: { ...ownRow } });
        const s = await openMenu(page);
        check(`Q5 without 0012 (no resume_path column) "Share my resume" is absent (${JSON.stringify(s.items.map((i) => i.title))})`, () => assert.deepEqual(s.items.map((i) => i.title), ['Share my area']));
        await context.close();
      }
    });
  }
  // ------------------------------------------------------------------------------------------------------------
  // Section "typing" (D5): the typing indicator over a private Realtime broadcast channel.
  // ------------------------------------------------------------------------------------------------------------
  if (SECTIONS.includes('typing') && (!SHOTS || process.env.TYPING_SHOTS)) {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
    const TOPIC = `realtime:typing:${[ME, A].sort().join(':')}`;
    const hello = { id: 'msg-hello', sender_id: A, recipient_id: ME, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() };
    const SECRET = 'my secret draft';
    // A Realtime server in the test: answers phx_join ok (or refuses the typing topic), decodes the client's binary
    // broadcast pushes (realtime-js vsn 2.0.0, kind 3) and pushes broadcasts to the client.
    const fakeRealtime = async (context, { refuseTyping = false, leaveDelayMs = 0 } = {}) => {
      const rt = { ws: null, joins: [], leaves: [], frames: [], raw: [], closed: 0 };
      await context.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
        rt.ws = ws;
        ws.onClose(() => { rt.closed += 1; });
        const reply = (joinRef, ref, topic, status, response = {}) => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status, response }]));
        ws.onMessage((message) => {
          if (typeof message !== 'string') {
            const buf = Buffer.from(message);
            rt.raw.push(buf.toString('latin1'));
            if (buf[0] !== 3) return;
            const [jl, rl, tl, el, ml, enc] = [buf[1], buf[2], buf[3], buf[4], buf[5], buf[6]];
            let o = 7 + jl + rl;
            const topic = buf.subarray(o, o + tl).toString(); o += tl;
            const event = buf.subarray(o, o + el).toString(); o += el + ml;
            const body = buf.subarray(o).toString();
            rt.frames.push({ topic, event, payload: enc === 1 ? JSON.parse(body) : body, at: Date.now() });
            return;
          }
          rt.raw.push(message);
          const [joinRef, ref, topic, event, payload] = JSON.parse(message);
          if (event === 'phx_join') {
            rt.joins.push({ topic, config: payload?.config || {} });
            if (refuseTyping && topic.startsWith('realtime:typing:')) return reply(joinRef, ref, topic, 'error', { reason: 'Unauthorized: You do not have permissions to read from this Channel topic' });
            return reply(joinRef, ref, topic, 'ok', { postgres_changes: (payload?.config?.postgres_changes || []).map((c, i) => ({ ...c, id: i + 1 })) });
          }
          if (event === 'phx_leave') {
            rt.leaves.push(topic);
            if (leaveDelayMs) { setTimeout(() => reply(joinRef, ref, topic, 'ok'), leaveDelayMs); return undefined; }
          }
          if (event === 'broadcast') rt.frames.push({ topic, event: payload?.event, payload: payload?.payload, at: Date.now() });
          return reply(joinRef, ref, topic, 'ok');
        });
      });
      rt.push = (typing) => rt.ws?.send(JSON.stringify([null, null, TOPIC, 'broadcast', { type: 'broadcast', event: 'typing', payload: { typing } }]));
      rt.typingJoins = () => rt.joins.filter((j) => j.topic.startsWith('realtime:typing:'));
      rt.typingFrames = () => rt.frames.filter((f) => f.topic === TOPIC);
      return rt;
    };
    const openTyping = async (width, { blocked = [], refuseTyping = false, reducedMotion = 'reduce', matchIds = [A], leaveDelayMs = 0 } = {}) => {
      Object.assign(st, { own: { ...ownRow }, routes: baseRoutes(), messages: [hello], matchIds, placeLabel: 'Kochi' });
      const context = await stub.newContext(browser, VIEWPORTS[width], { reducedMotion, ...(width <= 780 ? PHONE : {}) });
      if (blocked.length) await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`brivia-blocked-users:${ME}`, JSON.stringify(blocked)]);
      const rt = await fakeRealtime(context, { refuseTyping, leaveDelayMs });
      const consoleLines = [];
      const page = await stub.open(context, { path: '/app.html?view=chat', errors: pageErrors });
      page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
      page.setDefaultTimeout(6000);
      await page.waitForSelector('#chat-list [data-chat-id]', { timeout: 8000 });
      await page.locator('#chat-list [data-chat-id]').first().click();
      await page.waitForSelector('#chat-window:not([hidden]) #chat-form', { timeout: 6000 });
      await page.waitForTimeout(700);
      return { context, page, rt, consoleLines };
    };
    const typingState = (page) => page.evaluate(() => {
      const el = document.querySelector('#chat-typing');
      const live = document.querySelector('#chat-typing-live');
      const head = document.querySelector('.chat-window-head')?.getBoundingClientRect();
      const msgs = document.querySelector('#chat-messages')?.getBoundingClientRect();
      const visible = Boolean(el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0);
      const r = el?.getBoundingClientRect();
      const dot = el?.querySelector('.chat-typing-dots i');
      return {
        visible,
        text: visible ? el.innerText.replace(/\s+/g, ' ').trim() : '',
        live: live?.textContent.trim() || '',
        liveRole: live ? `${live.getAttribute('role')}/${live.getAttribute('aria-live')}` : null,
        box: r ? { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) } : null,
        headBottom: head ? Math.round(head.bottom) : null,
        msgs: msgs ? { top: Math.round(msgs.top), h: Math.round(msgs.height) } : null,
        win: (() => { const w = document.querySelector('#chat-window').getBoundingClientRect(); return { left: Math.round(w.left), right: Math.round(w.right) }; })(),
        anim: dot ? getComputedStyle(dot).animationName : null,
        fontSize: el ? parseFloat(getComputedStyle(el.querySelector('.chat-typing-text') || el).fontSize) : null,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const waitTyping = (page, shown) => page.waitForFunction((want) => {
      const el = document.querySelector('#chat-typing');
      return Boolean(el && !el.hidden) === want;
    }, shown, { timeout: 6000 }).catch(() => null);

    if (process.env.TYPING_SHOTS) {
      const dir = process.env.TYPING_SHOTS;
      mkdirSync(dir, { recursive: true });
      for (const width of [320, 375, 390, 768, 1280, 1440, 1920]) {
        const { context, page, rt } = await openTyping(width, { reducedMotion: 'no-preference' });
        rt.push(true);
        await waitTyping(page, true);
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(dir, `typing-${width}.png`) });
        await page.locator('#chat-window').screenshot({ path: path.join(dir, `typing-${width}-thread.png`) });
        await context.close();
      }
    }

    if (!SHOTS && !process.env.TYPING_SHOTS) {
      await scenario('T1 shows and hides', async () => {
        for (const width of [320, 375, 1440]) {
          const { context, page, rt } = await openTyping(width);
          const joins = rt.typingJoins();
          check(`T1 ${width}: the thread joins ${TOPIC} once as a private channel (${JSON.stringify(joins)})`, () => {
            assert.equal(joins.length, 1);
            assert.equal(joins[0].topic, TOPIC);
            assert.equal(joins[0].config.private, true);
          });
          const before = await typingState(page);
          rt.push(true);
          await waitTyping(page, true);
          const shown = await typingState(page);
          const shownAt = Date.now();
          check(`T1 ${width}: "typing…" shows under the header, the thread does not move, the live region says it once (${JSON.stringify({ before: before.msgs, shown })})`, () => {
            assert.equal(before.visible, false);
            assert.equal(shown.visible, true);
            assert.match(shown.text, /^typing…$/);
            assert.ok(shown.box.top >= shown.headBottom - 1, 'under the header');
            assert.deepEqual(shown.msgs, before.msgs);
            assert.equal(shown.live, 'Asha is typing');
            assert.equal(shown.liveRole, 'status/polite');
            assert.ok(shown.fontSize >= 12);
            assert.ok(shown.box.left >= shown.win.left && shown.box.right <= shown.win.right);
            assert.ok(shown.doc <= 0);
          });
          check(`T1 ${width}: reduced motion keeps the dots still (${shown.anim})`, () => assert.equal(shown.anim, 'none'));
          rt.push(true);
          await page.waitForTimeout(150);
          const again = await typingState(page);
          check(`T1 ${width}: a second signal in the burst keeps it shown without a new announcement (${again.live})`, () => { assert.equal(again.visible, true); assert.equal(again.live, 'Asha is typing'); });
          await page.waitForTimeout(Math.max(0, 3500 - (Date.now() - shownAt)));
          const mid = await typingState(page);
          await waitTyping(page, false);
          const hiddenAfter = Date.now() - shownAt;
          const gone = await typingState(page);
          check(`T1 ${width}: still shown at 3.5 s, gone after 4 s idle (${JSON.stringify({ mid: mid.visible, hiddenAfter, gone: gone.visible, live: gone.live, msgs: gone.msgs })})`, () => {
            assert.equal(mid.visible, true);
            assert.equal(gone.visible, false);
            assert.ok(hiddenAfter >= 3900 && hiddenAfter < 5200);
            assert.equal(gone.live, '');
            assert.deepEqual(gone.msgs, before.msgs);
          });
          rt.push(true);
          await waitTyping(page, true);
          rt.push(false);
          await waitTyping(page, false);
          const off = await typingState(page);
          check(`T1 ${width}: { typing: false } hides it at once (${off.visible})`, () => assert.equal(off.visible, false));
          await context.close();
        }
        const { context, page, rt } = await openTyping(1440, { reducedMotion: 'no-preference' });
        rt.push(true);
        await waitTyping(page, true);
        const moving = await typingState(page);
        check(`T1 the dots animate when motion is allowed (${moving.anim})`, () => assert.ok(moving.anim && moving.anim !== 'none'));
        const axe = await axeViolations(page, { include: '#chat-typing, #chat-typing-live' });
        check(`T1 axe clean on the indicator (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        await context.close();
      });

      await scenario('T2 sends throttled', async () => {
        const { context, page, rt } = await openTyping(375);
        const input = page.locator('#chat-input');
        await input.click();
        const t0 = Date.now();
        await input.pressSequentially('my sec', { delay: 120 });
        const early = rt.typingFrames().map((f) => ({ event: f.event, payload: f.payload }));
        check(`T2 typing for under 2 s sends one frame { typing: true } (${JSON.stringify({ early, ms: Date.now() - t0 })})`, () => {
          assert.ok(Date.now() - t0 < 2000);
          assert.deepEqual(early, [{ event: 'typing', payload: { typing: true } }]);
        });
        await page.waitForTimeout(Math.max(0, 2150 - (Date.now() - t0)));
        await input.pressSequentially('ret draft', { delay: 40 });
        const two = rt.typingFrames().map((f) => f.payload);
        check(`T2 typing again after 2 s sends a second frame (${JSON.stringify(two)})`, () => assert.deepEqual(two, [{ typing: true }, { typing: true }]));
        await input.press('Enter');
        await page.waitForTimeout(500);
        const all = rt.typingFrames().map((f) => f.payload);
        check(`T2 sending the message sends one { typing: false } (${JSON.stringify(all)})`, () => assert.deepEqual(all, [{ typing: true }, { typing: true }, { typing: false }]));
        const leaked = rt.raw.filter((m) => m.includes(SECRET) || m.includes('secret')).length;
        check(`T2 no frame carries the draft (${leaked})`, () => assert.equal(leaked, 0));
        await context.close();
      });

      await scenario('T3 blocked', async () => {
        {
          const { context, page, rt } = await openTyping(375, { blocked: [A] });
          rt.push(true);
          await page.waitForTimeout(400);
          await page.locator('#chat-input').pressSequentially('hi', { delay: 50 }).catch(() => {});
          await page.waitForTimeout(300);
          const s = await typingState(page);
          check(`T3 a blocked member's thread joins no typing topic, sends nothing and shows nothing (${JSON.stringify({ joins: rt.typingJoins(), frames: rt.typingFrames(), visible: s.visible })})`, () => {
            assert.deepEqual(rt.typingJoins(), []);
            assert.deepEqual(rt.typingFrames(), []);
            assert.equal(s.visible, false);
          });
          await context.close();
        }
        {
          const { context, page, rt } = await openTyping(1440);
          page.on('dialog', (d) => d.accept());
          rt.push(true);
          await waitTyping(page, true);
          await page.locator('#chat-more').click();
          await page.locator('#chat-more-menu [data-chat-action="block"]').click();
          await page.waitForTimeout(500);
          const s = await typingState(page);
          check(`T3 blocking while the thread is open hides typing at once and leaves the channel (${JSON.stringify({ visible: s.visible, live: s.live, leaves: rt.leaves })})`, () => {
            assert.equal(s.visible, false);
            assert.equal(s.live, '');
            assert.ok(rt.leaves.includes(TOPIC));
          });
          rt.push(true);
          await page.waitForTimeout(400);
          const later = await typingState(page);
          check(`T3 a later signal shows nothing (${later.visible})`, () => assert.equal(later.visible, false));
          await context.close();
        }
      });

      await scenario('T4 refused join', async () => {
        const { context, page, rt, consoleLines } = await openTyping(375, { refuseTyping: true });
        rt.push(true);
        await page.locator('#chat-input').pressSequentially('hello', { delay: 50 });
        await page.waitForTimeout(2600);
        const s = await typingState(page);
        const toast = await page.evaluate(() => [...document.querySelectorAll('.app-toast.show')].map((t) => t.textContent.trim()));
        const typingLogs = consoleLines.filter((l) => /typing|realtime|channel/i.test(l));
        check(`T4 a refused typing join shows nothing, logs nothing, sends nothing and is not retried (${JSON.stringify({ visible: s.visible, live: s.live, toast, typingLogs, joins: rt.typingJoins().length, frames: rt.typingFrames().length })})`, () => {
          assert.equal(s.visible, false);
          assert.equal(s.live, '');
          assert.deepEqual(toast, []);
          assert.deepEqual(typingLogs, []);
          assert.equal(rt.typingJoins().length, 1);
          assert.equal(rt.typingFrames().length, 0);
        });
        const rest = st.calls.filter((c) => c.path.includes('/realtime/'));
        check(`T4 no REST broadcast fallback (${rest.length})`, () => assert.equal(rest.length, 0));
        await context.close();
      });

      await scenario('T5 leaves', async () => {
        const { context, page, rt } = await openTyping(375);
        rt.push(true);
        await waitTyping(page, true);
        await page.locator('#chat-back').click();
        await page.waitForTimeout(400);
        const s = await typingState(page);
        check(`T5 closing the thread leaves the typing channel and clears the indicator (${JSON.stringify({ leaves: rt.leaves, visible: s.visible })})`, () => {
          assert.ok(rt.leaves.includes(TOPIC));
          assert.equal(s.visible, false);
        });
        await page.locator('#chat-list [data-chat-id]').first().click();
        await page.waitForTimeout(600);
        const rejoined = rt.typingJoins().length;
        await page.locator('#chat-input').pressSequentially('hi', { delay: 40 });
        await page.waitForTimeout(150);
        // Hiding the tab ends the burst while the socket is open.
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(200);
        const frames = rt.typingFrames().map((f) => f.payload);
        check(`T5 reopening joins again; hiding the tab sends one { typing: false } (${JSON.stringify({ rejoined, frames })})`, () => {
          assert.equal(rejoined, 2);
          assert.deepEqual(frames, [{ typing: true }, { typing: false }]);
        });
        const closedBefore = rt.closed;
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
        await page.waitForTimeout(300);
        await page.evaluate(() => { delete document.visibilityState; });
        await page.locator('#chat-input').pressSequentially(' there', { delay: 40 });
        await page.waitForTimeout(200);
        const after = { closed: rt.closed - closedBefore, leaves: rt.leaves.filter((t) => t === TOPIC).length, frames: rt.typingFrames().length };
        check(`T5 pagehide leaves the channel (a phx_leave, or Realtime closing its socket) and nothing is sent after (${JSON.stringify(after)})`, () => {
          assert.ok(after.closed >= 1 || after.leaves === 2);
          assert.equal(after.frames, 2);
        });
        await context.close();
      });

      await scenario('T7 quick reopen', async () => {
        const { context, page, rt } = await openTyping(375, { leaveDelayMs: 500 });
        await page.locator('#chat-back').click();
        await page.locator('#chat-list [data-chat-id]').first().click();
        await page.waitForTimeout(1200);
        rt.push(true);
        await waitTyping(page, true);
        const s = await typingState(page);
        await page.locator('#chat-input').pressSequentially('hey', { delay: 40 });
        await page.waitForTimeout(200);
        check(`T7 reopening the thread while the old leave reply is still in flight joins again and works both ways (${JSON.stringify({ joins: rt.typingJoins().length, visible: s.visible, frames: rt.typingFrames().map((f) => f.payload) })})`, () => {
          assert.equal(rt.typingJoins().length, 2);
          assert.equal(s.visible, true);
          assert.deepEqual(rt.typingFrames().map((f) => f.payload), [{ typing: true }]);
        });
        await context.close();
      });

      await scenario('T6 switching threads', async () => {
        const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
        const TOPIC_B = `realtime:typing:${[ME, B].sort().join(':')}`;
        const { context, page, rt } = await openTyping(1440, { matchIds: [A, B] });
        rt.push(true);
        await waitTyping(page, true);
        await page.locator(`#chat-list [data-chat-id="${B}"]`).click();
        await page.waitForTimeout(500);
        const s = await typingState(page);
        check(`T6 switching threads leaves the old typing channel, joins the new one and clears the indicator (${JSON.stringify({ leaves: rt.leaves, joins: rt.typingJoins().map((j) => j.topic), visible: s.visible, live: s.live })})`, () => {
          assert.deepEqual(rt.leaves.filter((t) => t.startsWith('realtime:typing:')), [TOPIC]);
          assert.deepEqual(rt.typingJoins().map((j) => j.topic), [TOPIC, TOPIC_B]);
          assert.equal(s.visible, false);
          assert.equal(s.live, '');
        });
        rt.push(true);
        await page.waitForTimeout(300);
        const stale = await typingState(page);
        check(`T6 a late signal on the old pair shows nothing in the new thread (${stale.visible})`, () => assert.equal(stale.visible, false));
        await context.close();
      });
    }
  }
  if (!SHOTS) check(`no uncaught page errors (${JSON.stringify(pageErrors.slice(0, 5))})`, () => assert.deepEqual(pageErrors, []));
} finally {
  await browser?.close();
  await stub.close();
}
if (!SHOTS) {
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  const failed = results.filter(([status]) => status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
