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
//    aria-busy with every action disabled.
// R7 every action is >= 44 x 44 px at 375 and 1440; axe clean on the card in each state; no sideways scroll at 320.
// CHAT_EXTRAS_SHOTS=<dir> only saves screenshots (empty, uploading, uploaded and each error at 375, 768 and 1440;
// uploaded at 320, 390, 1280 and 1920), then exits.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, ownRow, ME, ORIGIN } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5186);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.CHAT_EXTRAS_SHOTS || '';
const SECTIONS = (process.env.SECTIONS || 'resume').split(',');
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

  if (SHOTS) {
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
  } else if (SECTIONS.includes('resume')) {
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
        await choose(page, FILES.valid);
        const busy = await waitFor(page, (sel) => {
          const el = document.querySelector(sel);
          return el.getAttribute('aria-busy') === 'true' ? { buttons: [...el.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.disabled), status: el.querySelector('[role="status"]')?.textContent.trim() } : null;
        }, card).then((h) => h && h.jsonValue());
        check(`R6 ${width}: while uploading the card is aria-busy, every action disabled, status "Uploading…" (${JSON.stringify(busy)})`, () => {
          assert.ok(busy); assert.ok(busy.buttons.every(Boolean)); assert.match(busy.status, /Uploading/);
        });
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

    check(`no uncaught page errors (${JSON.stringify(pageErrors.slice(0, 5))})`, () => assert.deepEqual(pageErrors, []));
  }
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
