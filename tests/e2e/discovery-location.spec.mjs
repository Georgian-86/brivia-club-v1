// Location in the filter drawer and the "everywhere" fallback (D-239, 0072), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/discovery-location.spec.mjs   (Vite on :5216)
// LP1 the drawer has Location: Search anywhere (off), Near me (on), the member's area, a 25-500 km radius at 50 km.
// LP2 a 200 km radius asks discover_people for 200 km around the member's own city and Connect shows its people,
//     with "Within 200 km of Kochi" under the tools.
// LP3 Search anywhere asks with no radius, dims the rest, and says "Showing people from anywhere".
// LP4 Custom city: the city search picks Delhi and asks around in-delhi; the drawer shows Delhi; it is kept on reload.
// LP5 Reset filters goes back to the location-first deck, with no notice.
// FB1 with the default location, an interest no one in the deck has (Hackathons) asks discover_people everywhere
//     (no radius) and shows the match, saying "No one nearby with Hackathons".
// FB2 an interest someone in the deck has (Chess) stays in the deck: no search lane.
// Targets >= 44 px and axe clean (the drawer) at 390.
import { startAppStub } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const FAR = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000002401', name: 'Farah Delhi', photo_url: null, cover_url: null, experience: 'Builder', skills: ['Hackathons', 'Chess'], looking_for: ['Cofounder'], distance_band: null, shared_interests: [] };
const st = {
  placeLabel: 'Kochi',
  places: [{ id: 'in-delhi', name: 'Delhi', region: 'Delhi', country: 'India' }],
  routes: {
    'rpc/discover_people': { body: [{ id: FAR.id, distance_band: 'Delhi', hits: 1, shared_interests: [] }] },
    'rpc/get_candidates': { body: [FAR] },
  },
};
const stub = await startAppStub({ port: 5216, state: st });
const browser = await chromium.launch();
const shots = process.env.LP_SHOTS;
const name = (page) => page.textContent('#swipe-name');
const notice = (page) => page.evaluate(() => { const l = document.querySelector('#wide-search-label'); return l && !l.hidden ? l.textContent.trim() : ''; });
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('/rpc/discover_people')) calls.push(r.postDataJSON()); });
    await page.waitForSelector('#swipe-name', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim());
    const deckName = await name(page);
    await page.locator('#open-discovery-filters').click();
    await page.waitForSelector('#filter-location-group');
    // LP1
    const lp1 = await page.evaluate(() => ({
      anywhere: document.querySelector('#filter-anywhere').checked,
      near: document.querySelector('[data-location-mode="near"]').getAttribute('aria-pressed'),
      area: document.querySelector('#filter-location-name').textContent.trim(),
      radius: [document.querySelector('#filter-radius').min, document.querySelector('#filter-radius').max, document.querySelector('#filter-radius').value],
      out: document.querySelector('#filter-radius-value').textContent,
    }));
    check(`${w} LP1 the Location section, default`, !lp1.anywhere && lp1.near === 'true' && /Kochi/.test(lp1.area) && JSON.stringify(lp1.radius) === '["25","500","50"]' && lp1.out === '50 km', JSON.stringify(lp1));
    check(`${w} LP1 the deck is the location-first deck (no search yet)`, calls.length === 0 && (await notice(page)) === '');
    if (w === 390) {
      await page.locator('#filter-location-group').scrollIntoViewIfNeeded();
      const small = await page.$$eval('#filter-location-group button, #filter-location-group input[type="range"], #filter-location-group .hiring-switch', (els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).map((e) => e.outerHTML.slice(0, 60)));
      check('390 LP targets >= 44 px', small.length === 0, JSON.stringify(small));
      const v = await axeViolations(page, { include: '#discovery-filter-drawer' });
      check('390 LP the drawer is axe clean', v.length === 0, JSON.stringify(v));
    }
    // LP2
    await page.locator('#filter-radius').fill('200');
    await page.locator('#filter-radius').dispatchEvent('change');
    await page.waitForTimeout(600);
    const c2 = calls.at(-1) || {};
    check(`${w} LP2 asks for 200 km around home`, c2.p_radius_km === 200 && c2.p_place_id === null, JSON.stringify(c2));
    if (shots) await page.screenshot({ path: `${shots}/location-drawer-${w}.png` });
    await page.locator('.discovery-filter-close').click();
    await page.waitForTimeout(300);
    check(`${w} LP2 Connect shows the search lane's people`, (await name(page))?.trim() === 'Farah Delhi', await name(page));
    check(`${w} LP2 the notice says where`, /Within 200 km of Kochi/.test(await notice(page)), await notice(page));
    if (shots) await page.screenshot({ path: `${shots}/location-connect-${w}.png` });
    // LP3
    await page.locator('#open-discovery-filters').click();
    await page.locator('.location-anywhere').click();
    await page.waitForTimeout(600);
    const c3 = calls.at(-1) || {};
    const dimmed = await page.evaluate(() => document.querySelector('#filter-radius').disabled && document.querySelector('[data-location-mode="custom"]').disabled && document.querySelector('#filter-radius-value').textContent === 'Anywhere');
    check(`${w} LP3 anywhere asks with no radius, the rest is off`, c3.p_radius_km === null && dimmed, JSON.stringify(c3));
    check(`${w} LP3 the notice says anywhere`, /from anywhere/.test(await notice(page)), await notice(page));
    // LP4
    await page.locator('.location-anywhere').click();
    await page.locator('[data-location-mode="custom"]').click();
    await page.locator('#filter-place-input').fill('Del');
    await page.waitForSelector('#filter-place-results [data-place-id="in-delhi"]');
    await page.locator('#filter-place-results [data-place-id="in-delhi"]').click();
    await page.waitForTimeout(600);
    const c4 = calls.at(-1) || {};
    check(`${w} LP4 a custom city is the centre`, c4.p_place_id === 'in-delhi' && c4.p_radius_km === 200, JSON.stringify(c4));
    check(`${w} LP4 the drawer shows Delhi`, (await page.textContent('#filter-location-name')).trim() === 'Delhi' && (await page.getAttribute('[data-location-mode="custom"]', 'aria-pressed')) === 'true');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim());
    await page.waitForTimeout(600);
    check(`${w} LP4 kept on reload`, /Within 200 km of Delhi/.test(await notice(page)), await notice(page));
    // LP5 (after the reload the deck intro covers the button for a moment: dispatch the click, as deck.spec does)
    await page.locator('#open-discovery-filters').dispatchEvent('click');
    await page.locator('#clear-discovery-filters').click();
    await page.waitForTimeout(400);
    await page.locator('.discovery-filter-close').click();
    check(`${w} LP5 Reset goes back to the deck`, (await name(page))?.trim() === deckName?.trim() && (await notice(page)) === '', `${await name(page)} / ${await notice(page)}`);
    // FB2 then FB1
    const before = calls.length;
    await page.locator('#open-discovery-filters').click();
    await page.locator('#filter-skills-input').fill('Chess');
    await page.locator('#filter-skills-input').press('Enter');
    await page.waitForTimeout(500);
    check(`${w} FB2 an interest someone nearby has stays in the deck`, calls.length === before && (await notice(page)) === '', JSON.stringify(calls.slice(before)));
    await page.locator('#filter-skills-input').press('Escape');
    await page.locator('#clear-discovery-filters').click();
    await page.locator('#filter-skills-input').fill('Hackathons');
    await page.locator('#filter-skills-input').press('Enter');
    await page.waitForTimeout(700);
    const cf = calls.at(-1) || {};
    check(`${w} FB1 no one nearby: asks everywhere with the interest`, calls.length > before && cf.p_radius_km === null && JSON.stringify(cf.p_skills) === '["hackathons"]', JSON.stringify(calls.slice(before)) + await page.evaluate(() => document.querySelector("#filter-skills-selected")?.textContent));
    await page.locator('.discovery-filter-close').click();
    await page.waitForTimeout(300);
    check(`${w} FB1 shows the match and says why`, (await name(page))?.trim() === 'Farah Delhi' && /No one nearby with Hackathons/.test(await notice(page)), `${await name(page)} / ${await notice(page)}`);
    if (shots) await page.screenshot({ path: `${shots}/fallback-${w}.png` });
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await page.evaluate(() => localStorage.removeItem('brivia-discovery-location'));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
