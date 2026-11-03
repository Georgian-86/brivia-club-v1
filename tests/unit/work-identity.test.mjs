// D-140: the company line and picker helpers. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { workLine, workMarkup, normalizeWork, mergeCompanies, domainOf, cleanTitle, ORG_ICON, INDUSTRIES, companyInitials, monogramMarkup } from '../../site/scripts/work-identity.js';

const esc = (v = '') => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

test('the line reads "Title at Company", or either alone', () => {
  assert.equal(workLine({ title: 'Software Engineer', company: 'Google' }), 'Software Engineer at Google');
  assert.equal(workLine({ title: '  Founder ', company: 'MyStartup' }), 'Founder at MyStartup');
  assert.equal(workLine({ company: 'Swiggy' }), 'Swiggy');
  assert.equal(workLine({ title: 'Designer' }), 'Designer');
  assert.equal(workLine({}), '');
  assert.equal(cleanTitle('x'.repeat(80)).length, 60);
});

test('the markup: a 14 px logo or the default mark, escaped, one line; nothing when empty', () => {
  const html = workMarkup({ title: 'Engineer <b>', company: 'Acme & Co' }, { logoUrl: 'https://x/logo.png', escapeHtml: esc });
  assert.match(html, /<img class="work-logo" src="https:\/\/x\/logo.png" alt="" width="14" height="14"/);
  assert.match(html, /Engineer &lt;b&gt; at Acme &amp; Co/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(workMarkup({ company: 'No Logo' }, { escapeHtml: esc }), /work-logo--mono[^>]*>NL</, 'no logo: the initials tile');
  assert.ok(monogramMarkup('', esc).includes(ORG_ICON), 'no name at all: the default mark');
  assert.doesNotMatch(workMarkup({ title: 'Freelancer' }, { escapeHtml: esc }), /work-logo/, 'a title alone has no logo');
  assert.equal(workMarkup({}, { escapeHtml: esc }), '');
});

test('rows, merging and domains', () => {
  assert.deepEqual(normalizeWork({ member_id: 'a', job_title: ' Intern ', company_id: 'c1', company_name: 'Swiggy', logo_path: 'directory/Q1.png', verified: true }),
    { title: 'Intern', company: 'Swiggy', companyId: 'c1', logoPath: 'directory/Q1.png', verified: true });
  assert.deepEqual(mergeCompanies([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }]).map((c) => c.id), ['1', '2', '3']);
  assert.equal(mergeCompanies(Array.from({ length: 12 }, (_, i) => ({ id: String(i) }))).length, 8);
  assert.deepEqual(mergeCompanies([{ id: 'r', name: 'Razorpay', logo_path: '' }], [{ id: 'r', name: 'Razorpay', logo_path: 'directory/Q1.png', domain: 'razorpay.com' }]),
    [{ id: 'r', name: 'Razorpay', logo_path: 'directory/Q1.png', domain: 'razorpay.com' }], 'a seeded company takes its new logo');
  assert.equal(domainOf('https://www.Swiggy.com/about?x=1'), 'swiggy.com');
  assert.equal(domainOf('mystartup.in'), 'mystartup.in');
  assert.equal(domainOf('not a site'), '');
  assert.ok(INDUSTRIES.includes('Artificial intelligence') && INDUSTRIES.includes('Government and public sector'));
});

test('D-148: initials for a company without a logo', () => {
  assert.equal(companyInitials('State Bank of India (SBI)'), 'SB');
  assert.equal(companyInitials('Zudio'), 'Z');
  assert.equal(companyInitials('Bank of Maharashtra'), 'BM');
  assert.equal(companyInitials('Khaitan & Co'), 'KC');
  assert.equal(companyInitials(''), '');
});
