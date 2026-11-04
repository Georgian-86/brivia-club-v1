// Profile hero: a long name, work headline, area and bio stay inside the text column, never under the photo card,
// at 390 and 1440 px, and the page never scrolls sideways. HERO_SHOTS=<dir> saves screenshots.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/profile-hero.spec.mjs   (Vite on :5176)
import { startAppStub, ownRow, ME } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.HERO_SHOTS;
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const cases = {
  real: { name: 'shivani chauhan', bio: 'Talent Acquisition at Stealth Startup | Human Resources | Campus Hiring', title: 'Talent Acquisition', company: 'Stealth Startup', place: 'Chandigarh' },
  long: { name: 'Venkataraghavan Subramaniam-Krishnamurthy', bio: 'Building community-first products for people who would rather meet over coffee than over a feed. Mentor, climber, amateur astronomer, and reluctant early riser who still believes in handwritten letters.', title: 'Principal Product Designer, Platform Experience', company: 'Extraordinarily Long Company Name Private Limited', place: 'Thiruvananthapuram' },
  short: { name: 'Al', bio: '', title: null, company: null, place: 'Pune' },
};
const st = { companies: [], work: {} };
const stub = await startAppStub({ port: 5176, state: st });
const browser = await chromium.launch();
const errors = [];
try {
  for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
    for (const [key, c] of Object.entries(cases)) {
      st.own = { ...ownRow, name: c.name, full_name: c.name, bio: c.bio };
      st.placeLabel = c.place;
      st.work = c.title ? { [ME]: { job_title: c.title, company_id: 'c-x', company_name: c.company, logo_path: null, verified: false } } : {};
      const ctx = await stub.newContext(browser, { width: w, height: h }, mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { deviceScaleFactor: 2 });
      const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
      page.setDefaultTimeout(8000);
      await page.waitForFunction((n) => document.querySelector('#profile-name')?.textContent === n, c.name);
      if (c.title) await page.waitForSelector('#profile-work .work-line', { state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const r = (el) => el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null;
        const hero = r(document.querySelector('.profile-hero'));
        const photo = r(document.querySelector('.profile-photo-frame'));
        const parts = ['#profile-name', '#profile-work', '#profile-location', '#profile-hero-bio', '.profile-hero-copy .app-eyebrow'].map((s) => {
          const el = document.querySelector(s); const b = r(el); if (!b) return null;
          // the visible text extent (a range covers what is actually painted, not the box)
          const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
          return { s, left: t.left, right: Math.min(t.right, b.right + (el.scrollWidth > el.clientWidth ? 0 : 0)), top: t.top, bottom: Math.min(t.bottom, b.bottom), box: { l: b.left, r: b.right, t: b.top, b: b.bottom }, clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis', fs: parseFloat(getComputedStyle(el).fontSize) };
        }).filter(Boolean);
        const bio = document.querySelector('#profile-hero-bio'); const name = document.querySelector('#profile-name');
        const pad = parseFloat(getComputedStyle(document.querySelector('.profile-hero')).paddingBottom);
        const lines = (el) => (el && !el.hidden ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) : 0);
        const extra = { bioLines: lines(bio), nameLines: lines(name), bioBottomOk: bio.hidden || bio.getBoundingClientRect().bottom <= hero.bottom - pad + 1, nameFits: name.scrollWidth <= name.clientWidth + 1 };
        return { extra, hero: { l: hero.left, r: hero.right, t: hero.top, b: hero.bottom }, photo: photo && { l: photo.left, r: photo.right, t: photo.top, b: photo.bottom }, parts, sideways: document.documentElement.scrollWidth > window.innerWidth };
      });
      const overlaps = m.parts.filter((p) => m.photo && p.box.r > m.photo.l + 1 && p.box.l < m.photo.r && p.box.b > m.photo.t + 1 && p.box.t < m.photo.b);
      check(`${w} ${key}: no hero text runs under the photo card`, overlaps.length === 0, JSON.stringify(overlaps.map((p) => p.s)));
      const outside = m.parts.filter((p) => p.box.l < m.hero.l - 1 || p.box.r > m.hero.r + 1 || p.box.b > m.hero.b + 1);
      check(`${w} ${key}: hero text stays inside the hero`, outside.length === 0, JSON.stringify(outside.map((p) => [p.s, p.box])));
      const clipped = m.parts.filter((p) => p.clipped);
      check(`${w} ${key}: no line is cut without an ellipsis`, clipped.length === 0, JSON.stringify(clipped.map((p) => p.s)));
      check(`${w} ${key}: hero text is at least 12 px`, m.parts.every((p) => p.fs >= 12), JSON.stringify(m.parts.map((p) => [p.s, p.fs])));
      check(`${w} ${key}: the bio is 3 lines at most, inside the hero's padding (${JSON.stringify(m.extra)})`, m.extra.bioLines <= 3 && m.extra.bioBottomOk);
      check(`${w} ${key}: the name is 2 lines at most and no letter is cut sideways`, m.extra.nameLines <= 2 && m.extra.nameFits);
      if (key === 'real') check(`${w} real: "shivani chauhan" shows in full (no line hidden by the 2-line clamp)`, await page.evaluate(() => { const h = document.querySelector('#profile-name'); return h.scrollHeight - h.clientHeight < parseFloat(getComputedStyle(h).fontSize) * 0.5; }));
      check(`${w} ${key}: no sideways scroll`, !m.sideways);
      if (SHOTS) await page.locator('.profile-hero').screenshot({ path: `${SHOTS}/hero-${key}-${w}.png` });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await stub.close();
}
check('no page errors', errors.length === 0, errors.join(' | '));
process.exit(failed ? 1 : 0);
