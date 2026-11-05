// Hiring (D-141): the role catalogue, the text rule, who is a hirer or a seeker, the card bar, the lift, the row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roleFor, ROLE_TITLES, FAMILIES, familyLabel, roleTextIssue, ROLE_TEXT_ERROR, lookingForRoles, isHirerValue,
  isSeekerValue, defaultHelp, cardBarLabels, pickBarLabel, stripModel, interleaveLift, hiringRowModel, daysLeft,
  needsRenewal, roleMeta, askFootLine, askErrorText,
} from '../../site/scripts/hiring.js';

test('roleFor maps synonyms to one canonical title and family', () => {
  assert.deepEqual(roleFor('sde'), { title: 'Software Engineer', family: 'software', known: true });
  assert.deepEqual(roleFor('  front end   developer '), { title: 'Frontend Developer', family: 'software', known: true });
  assert.equal(roleFor('UI/UX Designer').title, 'Product Designer');
  assert.equal(roleFor('ML Engineer').family, 'data');
  assert.equal(roleFor('Recruiter').family, 'people');
});

test('roleFor keeps the member\'s own words and guesses the family', () => {
  assert.deepEqual(roleFor('Senior Golang Engineer'), { title: 'Senior Golang Engineer', family: 'software', known: false });
  assert.equal(roleFor('Growth Lead').family, 'marketing');
  assert.equal(roleFor('Pastry Chef').family, 'other');
  assert.equal(roleFor('   '), null);
});

test('every catalogue family is one the server accepts, titles are unique', () => {
  const server = ['software', 'data', 'design', 'product', 'marketing', 'sales', 'content', 'operations', 'finance', 'people', 'research', 'other'];
  assert.deepEqual(FAMILIES.map(([id]) => id), server);
  assert.equal(new Set(ROLE_TITLES.map((t) => t.toLowerCase())).size, ROLE_TITLES.length);
  for (const title of ROLE_TITLES) assert.ok(server.includes(roleFor(title).family), title);
  assert.equal(familyLabel('nope'), 'Other');
});

test('roleTextIssue refuses links, emails, phone numbers and messengers, like the server', () => {
  for (const bad of ['Apply at lumen.io/jobs', 'see https://x.y', 'www.lumen.in', 'mail jobs@lumen.in', 'Call 98450 12345',
    '+91 (984) 501-2345', 'DM me on Telegram', 'wa.me/9198']) assert.equal(roleTextIssue(bad), ROLE_TEXT_ERROR, bad);
  for (const ok of ['React and TypeScript, a small product team.', 'Node.js and Postgres', '2 to 5 years', '']) assert.equal(roleTextIssue(ok), '', ok);
});

test('hirer and seeker values are case-insensitive; Developer alone is not seeking', () => {
  assert.deepEqual(lookingForRoles(['hiring', 'Friends']), { hirer: true, seeker: false });
  assert.deepEqual(lookingForRoles('Job referral, Chess Partner'), { hirer: false, seeker: true });
  assert.deepEqual(lookingForRoles(['JOB OPPORTUNITIES']), { hirer: false, seeker: true });
  assert.deepEqual(lookingForRoles(['Developer', 'Designer', 'Intern']), { hirer: false, seeker: false });
  assert.ok(isHirerValue('can give referrals'));
  assert.ok(isSeekerValue('Internship Referral'));
  assert.equal(defaultHelp(['Can Give Referrals']), 'refer');
  assert.equal(defaultHelp(['Hiring', 'Can Give Referrals']), 'hiring');
});

test('the card bar prefers the full title, then the count, then HIRING', () => {
  const labels = cardBarLabels({ best_title: 'Frontend Developer', roles: [{ title: 'Frontend Developer' }, { title: 'Design Intern' }] });
  assert.deepEqual(labels, { full: 'HIRING · FRONTEND DEVELOPER', short: 'HIRING · 2 ROLES', compact: 'HIRING' });
  assert.equal(pickBarLabel(labels, () => true), 'HIRING · FRONTEND DEVELOPER');
  assert.equal(pickBarLabel(labels, (t) => t.length < 20), 'HIRING · 2 ROLES');
  assert.equal(pickBarLabel(labels, () => false), 'HIRING');
  assert.equal(cardBarLabels({ roles: [{ title: 'Accountant' }] }).short, 'HIRING');
  assert.equal(cardBarLabels({ roles: [] }), null);
});

test('the strip shows only when the role fits', () => {
  assert.equal(stripModel({ fits: false, roles: [{ title: 'X' }] }), null);
  assert.deepEqual(stripModel({ fits: true, roles: [{ title: 'Frontend Developer', work_mode: 'hybrid', help: 'refer' }] }),
    { title: 'Frontend Developer · Hybrid', help: 'Can refer' });
  assert.equal(roleMeta({ level: 'mid', work_mode: 'remote', company: ' Lumen  Labs ' }), 'Mid level · Remote · Lumen Labs');
});

test('the lift puts at most one lifted card in every five', () => {
  const queue = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  assert.deepEqual(interleaveLift(queue, ['X', 'Y']), ['X', 'a', 'b', 'c', 'd', 'Y', 'e', 'f', 'g', 'h', 'i']);
  assert.deepEqual(interleaveLift(['a', 'b', 'X'], ['X']), ['X', 'a', 'b']);   // moved, not repeated
  assert.deepEqual(interleaveLift(['a'], ['X', 'Y', 'Z']), ['X', 'a', 'Y', 'Z']);
  assert.deepEqual(interleaveLift(queue, []), queue);
  const out = interleaveLift(queue, ['X', 'Y', 'Z']);
  for (let i = 0; i + 5 <= out.length; i += 1) assert.ok(out.slice(i, i + 5).filter((id) => 'XYZ'.includes(id)).length <= 2);
});

test('the notification row shows once a day and only for something new', () => {
  const suggestions = [{ id: 1, role_title: 'Frontend Developer' }, { id: 2, role_title: 'React Developer' }];
  const row = hiringRowModel({ suggestions, seen: ['1'], lastShownDay: '2026-11-02', today: '2026-11-03' });
  assert.equal(row.text, '2 people near you are hiring');
  assert.equal(row.detail, 'For roles like yours · Frontend Developer, React Developer');
  assert.equal(hiringRowModel({ suggestions, seen: ['1', '2'], today: '2026-11-03' }), null);
  assert.equal(hiringRowModel({ suggestions, lastShownDay: '2026-11-03', today: '2026-11-03' }), null);
  assert.equal(hiringRowModel({ suggestions: [suggestions[0]], today: 'd' }).text, 'Someone near you is hiring');
});

test('renewal and copy helpers', () => {
  const now = Date.parse('2026-11-03T10:00:00Z');
  assert.equal(daysLeft('2026-11-05T09:00:00Z', now), 2);
  assert.ok(needsRenewal({ status: 'open', expires_at: '2026-11-05T09:00:00Z' }, now));
  assert.ok(!needsRenewal({ status: 'open', expires_at: '2026-11-20T09:00:00Z' }, now));
  assert.equal(askFootLine(29, 2), 'Uses 1 of your 29 signals left today · 2 role asks left today');
  assert.equal(askFootLine(undefined, 1), '1 role ask left today');
  assert.match(askErrorText({ message: 'role_ask_cap' }), /3 roles a day/);
  assert.match(askErrorText({ code: '23505', message: 'x' }), /already asked/);
});

test('D-215: wordCount counts words for the 1000-word role description', async () => {
  const { wordCount, ABOUT_WORDS_MAX } = await import('../../site/scripts/hiring.js');
  assert.equal(ABOUT_WORDS_MAX, 1000);
  assert.equal(wordCount(''), 0); assert.equal(wordCount('  '), 0);
  assert.equal(wordCount(' React and  TypeScript\nteam '), 4);
});
