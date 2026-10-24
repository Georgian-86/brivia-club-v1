// Show / hide password (D-091), stubbed Supabase (Vite on :5183): every password field has an eye button. It flips the
// field between dots and text while the member keeps typing (focus and caret stay in the field), is reachable by Tab and
// works with Space, has a 44 px target and a "Show password" / "Hide password" name with aria-pressed, never lets the
// text run under it, toggles only its own field, and the field goes back to dots on submit. Login, the reset
// new-password step, the guided signup's account screen and the landing's login modal. At 1440 and 390 px; axe clean.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/password-reveal.spec.mjs
import assert from 'node:assert/strict';
import { startAppStub, ORIGIN, session, user, ownRow } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const stub = process.env.BASE ? { url: process.env.BASE, close: async () => {} } : await startAppStub({ port: 5183, state: {} });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('PASS ', name); } catch (e) { failures++; console.log('FAIL ', name, e.message.replace(/\s+/g, ' ').slice(0, 300)); } };
const newCtx = async (viewport) => {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
    const json = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b), headers: h });
    if (u.pathname.startsWith('/auth/v1/')) return json(200, u.pathname.endsWith('/user') ? user : session);
    if (u.pathname === '/rest/v1/profiles') return json(200, (r.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
    return json(200, []);
  });
  await ctx.route(`${stub.url}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' }));
  return ctx;
};
// The field, its eye button and how they sit together.
const fieldInfo = (page, inputSel) => page.evaluate((sel) => {
  const input = document.querySelector(sel);
  const button = input && document.querySelector(`.password-reveal[aria-controls="${input.id}"]`);
  if (!input || !button) return { missing: true, input: Boolean(input) };
  const ir = input.getBoundingClientRect(); const br = button.getBoundingClientRect();
  return {
    type: input.type, value: input.value, focused: document.activeElement === input, caret: input.selectionStart,
    label: button.getAttribute('aria-label'), pressed: button.getAttribute('aria-pressed'), buttonType: button.type,
    w: br.width, h: br.height, padRight: parseFloat(getComputedStyle(input).paddingRight),
    insideRight: Math.abs(br.right - ir.right) <= 1, centred: Math.abs((br.top + br.bottom) / 2 - (ir.top + ir.bottom) / 2) <= 1.5,
    eyeShown: getComputedStyle(button.querySelector('.password-reveal-eye')).display !== 'none',
    count: input.parentElement.querySelectorAll('.password-reveal').length,
    oldGlyph: Boolean(input.parentElement.querySelector('.auth-field-eye')),
  };
}, inputSel);
const buttonFor = async (page, inputSel) => {
  const id = await page.getAttribute(inputSel, 'id');
  return page.locator(`.password-reveal[aria-controls="${id}"]`);
};

const driveField = async (tag, page, sel) => {
  const start = await fieldInfo(page, sel);
  await check(`${tag} has one eye button, hidden state, 44 px, inside the field's right end`, () => {
    assert.ok(!start.missing, 'no eye button');
    assert.equal(start.count, 1); assert.equal(start.oldGlyph, false);
    assert.equal(start.type, 'password'); assert.equal(start.label, 'Show password'); assert.equal(start.pressed, 'false');
    assert.equal(start.buttonType, 'button'); assert.equal(start.eyeShown, true);
    assert.ok(start.w >= 44 && start.h >= 44, `${start.w}x${start.h}`);
    assert.ok(start.insideRight, 'not at the right end'); assert.ok(start.centred, 'not centred on the field');
    assert.ok(start.padRight >= 44, `text runs under the button (padding-right ${start.padRight})`);
  });
  await page.click(sel); await page.keyboard.type('hunter22');
  const button = await buttonFor(page, sel);
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await button.click(); await frame();
  const shown = await fieldInfo(page, sel);
  await check(`${tag} a click shows the text and keeps typing in the field`, () => {
    assert.equal(shown.type, 'text'); assert.equal(shown.value, 'hunter22');
    assert.equal(shown.label, 'Hide password'); assert.equal(shown.pressed, 'true'); assert.equal(shown.eyeShown, false);
    assert.equal(shown.focused, true, 'focus left the field'); assert.equal(shown.caret, 8);
  });
  await page.keyboard.type('x');
  await check(`${tag} typing continues while shown`, async () => assert.equal((await fieldInfo(page, sel)).value, 'hunter22x'));
  await button.click(); await frame();
  const hidden = await fieldInfo(page, sel);
  await check(`${tag} a second click hides it again`, () => {
    assert.equal(hidden.type, 'password'); assert.equal(hidden.label, 'Show password'); assert.equal(hidden.value, 'hunter22x');
  });
  await page.focus(sel); await page.keyboard.press('Tab');
  await check(`${tag} Tab from the field reaches the eye; Space shows the text`, async () => {
    assert.equal(await page.evaluate((s) => document.activeElement?.getAttribute('aria-controls') === document.querySelector(s).id, sel), true);
    await page.keyboard.press('Space');
    assert.equal((await fieldInfo(page, sel)).type, 'text');
    await page.keyboard.press('Space');
    assert.equal((await fieldInfo(page, sel)).type, 'password');
  });
};

try {
  for (const [tag, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    // 1. Login.
    let ctx = await newCtx(viewport); let page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#login`); await page.waitForTimeout(1200);
    await driveField(`${tag} login:`, page, '#login-form input[name=password]');
    await check(`${tag} login: axe clean`, async () => assert.deepEqual(await axeViolations(page, { include: '#login-form' }), []));
    await ctx.close();

    // 2. Reset new-password step: two fields, each toggles only itself; submit puts both back to dots.
    ctx = await newCtx(viewport); page = await ctx.newPage();
    const recoveryHash = `#access_token=${session.access_token}&expires_at=${session.expires_at}&expires_in=3600&refresh_token=stub-refresh&token_type=bearer&type=recovery`;
    await page.goto(`${stub.url}/auth.html${recoveryHash}`); await page.waitForTimeout(1500);
    const pw = '#reset-update-form input[name=password]'; const confirm = '#reset-update-form input[name=confirm]';
    await driveField(`${tag} reset new password:`, page, pw);
    await page.fill(confirm, 'different1');
    await (await buttonFor(page, confirm)).click();
    await (await buttonFor(page, pw)).click();
    await check(`${tag} reset: each eye toggles its own field`, async () => {
      assert.equal((await fieldInfo(page, confirm)).type, 'text'); assert.equal((await fieldInfo(page, pw)).type, 'text');
      await (await buttonFor(page, confirm)).click();
      assert.equal((await fieldInfo(page, confirm)).type, 'password'); assert.equal((await fieldInfo(page, pw)).type, 'text');
    });
    await (await buttonFor(page, confirm)).click();
    await page.click('#reset-update-form .auth-submit'); await page.waitForTimeout(300);
    await check(`${tag} reset: submitting puts every field back to dots`, async () => {
      assert.equal((await fieldInfo(page, pw)).type, 'password'); assert.equal((await fieldInfo(page, confirm)).type, 'password');
      assert.match(await page.textContent('#login-note'), /match/i);
    });
    await check(`${tag} reset: axe clean`, async () => assert.deepEqual(await axeViolations(page, { include: '#reset-update-form' }), []));
    await ctx.close();

    // 3. Guided signup, account screen (rendered on the fly).
    ctx = await newCtx(viewport); page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#signup`, { waitUntil: 'load' }); await page.waitForTimeout(1000);
    await page.locator('[data-guided-email]').click();
    await page.waitForFunction(() => document.querySelector('#guided-signup')?.dataset.screen === 'account', null, { timeout: 6000 });
    await page.waitForTimeout(400);
    await page.fill('input[name=guided-email]', 'reveal@test.brivia.club');
    await driveField(`${tag} guided password:`, page, 'input[name=guided-password]');
    await driveField(`${tag} guided confirm:`, page, 'input[name=guided-password-confirm]');
    await check(`${tag} guided: the shown password still enables Continue (the answer is kept)`, async () => {
      await page.fill('input[name=guided-password]', 'hunter22x'); await page.fill('input[name=guided-password-confirm]', 'hunter22x');
      await (await buttonFor(page, 'input[name=guided-password]')).click();
      assert.equal(await page.locator('[data-guided-next]').isDisabled(), false);
    });
    await check(`${tag} guided: axe clean`, async () => assert.deepEqual(await axeViolations(page, { include: '#guided-signup' }), []));
    await check(`${tag} guided: no sideways scroll`, async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
    await ctx.close();

    // 4. The landing's login modal: its password field is enhanced too.
    ctx = await newCtx(viewport); page = await ctx.newPage();
    await page.goto(`${stub.url}/index.html`); await page.waitForTimeout(800);
    await check(`${tag} landing modal: the login password has an eye and no decorative glyph`, async () => {
      const info = await page.evaluate(() => {
        const input = document.querySelector('#auth-modal input[type=password][name=password]');
        return { has: Boolean(input && document.querySelector(`.password-reveal[aria-controls="${input.id}"]`)), glyph: document.querySelectorAll('.auth-field-eye').length };
      });
      assert.equal(info.has, true); assert.equal(info.glyph, 0);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
