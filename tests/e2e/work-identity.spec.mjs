// D-140: Company / Organisation. The deck card shows "[logo] Software Engineer at Google" in place of the experience
// line without growing; Edit profile searches the directory, picks a company, adds the member's own organisation,
// saves title and company (set_my_work); the own profile shows it; axe clean.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/work-identity.spec.mjs   (Vite on :5177)
import { startAppStub, defaultDeckRows, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const [ASHA, BILAL] = defaultDeckRows.map((r) => r.id);
const st = {
  companies: [
    { id: 'c-google', name: 'Google', domain: 'google.com', logo_path: 'directory/Q95.png', verified: true, source: 'directory' },
    { id: 'c-swiggy', name: 'Swiggy', domain: 'swiggy.com', logo_path: 'directory/Q1.png', verified: false, source: 'directory' },
  ],
  work: { [ASHA]: { job_title: 'Software Engineer', company_id: 'c-google', company_name: 'Google', logo_path: 'directory/Q95.png', verified: true } },
};
const stub = await startAppStub({ port: 5177, state: st });
const browser = await chromium.launch();
const errors = [];
try {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    st.passed = new Set(); st.signalled = new Set(); st.work = { [ASHA]: st.work[ASHA] }; st.workSaved = []; st.companiesAdded = []; st.companies = st.companies.slice(0, 2);
    const ctx = await stub.newContext(browser, { width: w, height: h }, mobile ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('#swipe-name:not(:empty)');
    await page.waitForSelector('#swipe-role .work-line', { state: 'attached' });
    const card = await page.evaluate(() => ({ text: document.querySelector('#swipe-role').innerText.trim(), logo: Boolean(document.querySelector('#swipe-role img.work-logo')), size: document.querySelector('#swipe-role img.work-logo')?.getBoundingClientRect().width, h: Math.round(document.querySelector('#swipe-card').getBoundingClientRect().height), lines: Math.round(document.querySelector('#swipe-role').getBoundingClientRect().height) }));
    check(`${w}: the card reads "Software Engineer at Google" with a 14 px logo (${JSON.stringify(card)})`, card.text === 'Software Engineer at Google' && card.logo && card.size === 14);
    await page.locator('[data-action="pass"]').dispatchEvent('click');
    await page.waitForFunction((a) => document.querySelector('#swipe-card')?.dataset.personId !== a, ASHA);
    await page.waitForTimeout(400);
    const plain = await page.evaluate(() => ({ text: document.querySelector('#swipe-role').innerText.trim(), work: Boolean(document.querySelector('#swipe-role .work-line')), h: Math.round(document.querySelector('#swipe-card').getBoundingClientRect().height), lines: Math.round(document.querySelector('#swipe-role').getBoundingClientRect().height) }));
    check(`${w}: a member without a company shows no company line, and the card is the same size (${JSON.stringify({ card, plain })})`, !plain.work && plain.h === card.h);

    // Edit profile: search, pick, title, save.
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.evaluate(() => document.querySelector('#profile-photo-editor')?.click());
    await page.waitForSelector('#profile-edit-modal [data-work-editor]');
    await page.locator('[name="jobTitle"]').fill('Software Engineering Intern');
    await page.locator('[data-work-search]').fill('Swi');
    await page.waitForSelector('#profile-work-list [data-work-id="c-swiggy"]');
    const axe = await axeViolations(page, { include: '#profile-edit-modal [data-work-editor]' });
    check(`${w}: axe on the company picker`, axe.length === 0, JSON.stringify(axe));
    const addOffered = await page.locator('#profile-work-list [data-work-add]').innerText();
    check(`${w}: the member can always add their own ("${addOffered}")`, /Add “Swi” as your organisation/.test(addOffered));
    await page.locator('#profile-work-list [data-work-id="c-swiggy"]').click();
    check(`${w}: Swiggy is picked`, /Swiggy/.test(await page.locator('[data-work-picked]').innerText()));
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    check(`${w}: set_my_work("Software Engineering Intern", Swiggy) (${JSON.stringify(st.workSaved)})`, st.workSaved.at(-1)?.p_title === 'Software Engineering Intern' && st.workSaved.at(-1)?.p_company === 'c-swiggy');
    await page.waitForSelector('#profile-work .work-line');
    check(`${w}: the own profile shows it`, (await page.locator('#profile-work').innerText()).trim() === 'Software Engineering Intern at Swiggy');

    // A startup that is not listed: add it with a website, then remove the company again.
    await page.evaluate(() => document.querySelector('#profile-photo-editor')?.click());
    await page.waitForSelector('#profile-edit-modal [data-work-editor]');
    await page.waitForFunction(() => document.querySelector('[name="jobTitle"]')?.value === 'Software Engineering Intern');
    await page.locator('[name="jobTitle"]').fill('Founder');
    await page.locator('[data-work-search]').fill('MyStartup');
    await page.waitForSelector('#profile-work-list [data-work-add]');
    await page.locator('#profile-work-list [data-work-add]').click();
    check(`${w}: the add form opens with the name filled in`, (await page.locator('[data-work-new-name]').inputValue()) === 'MyStartup');
    await page.locator('[data-work-new-site]').fill('https://mystartup.in');
    await page.locator('[data-work-new-industry]').selectOption('Startups and venture capital');
    await page.locator('[data-work-new-add]').click();
    await page.waitForFunction(() => /MyStartup/.test(document.querySelector('[data-work-picked]')?.innerText || ''));
    check(`${w}: add_company(MyStartup, website, industry) (${JSON.stringify(st.companiesAdded)})`, st.companiesAdded.at(-1)?.p_name === 'MyStartup' && st.companiesAdded.at(-1)?.p_website === 'https://mystartup.in' && st.companiesAdded.at(-1)?.p_industry === 'Startups and venture capital');
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    await page.waitForFunction(() => /Founder at MyStartup/.test(document.querySelector('#profile-work')?.innerText || ''));
    check(`${w}: "Founder at MyStartup", the default mark when there is no logo`, await page.locator('#profile-work svg.work-logo').count() === 1);
    await page.evaluate(() => document.querySelector('#profile-photo-editor')?.click());
    await page.waitForSelector('[data-work-picked]:not([hidden])');
    await page.locator('[data-work-clear]').click();
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    check(`${w}: the company can be removed (set_my_work with no company)`, st.workSaved.at(-1)?.p_company === null && st.workSaved.at(-1)?.p_title === 'Founder');
    check(`${w}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
