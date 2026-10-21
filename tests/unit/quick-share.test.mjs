// Polish wave D4: the chat "+" quick-share helpers (site/scripts/quick-share.js). Pure: no DOM, no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { areaShareBody, parseAreaBody, resumeShareAttachment, resumeMessageFields, RESUME_SHARE_BODY, NO_RESUME_HINT, RESUME_GONE_COPY, RESUME_SHARE_NOTE } from '../../site/scripts/quick-share.js';

const ME = '11111111-1111-4111-8111-111111111111';

test('D4: the area message is the place name and "(about a 2 km area)"', () => {
  assert.equal(areaShareBody('Kochi'), 'My area: Kochi (about a 2 km area)');
  assert.equal(areaShareBody('  Indiranagar, Bengaluru  '), 'My area: Indiranagar, Bengaluru (about a 2 km area)');
});

test('D4: a city-wide pick is sent as is, with no 2 km suffix', () => {
  assert.equal(areaShareBody('Pune (city-wide)'), 'My area: Pune (city-wide)');
});

test('D4: no label, or anything that looks like a coordinate, sends nothing', () => {
  assert.equal(areaShareBody(''), '');
  assert.equal(areaShareBody(null), '');
  assert.equal(areaShareBody('12.9716, 77.5946'), '');
  assert.equal(areaShareBody('Near -33.865'), '');
  // Digits in a real place name are fine.
  assert.equal(areaShareBody('Sector 62, Noida'), 'My area: Sector 62, Noida (about a 2 km area)');
});

test('D4: parseAreaBody reads an area message back into place and scope', () => {
  assert.deepEqual(parseAreaBody('My area: Kochi (about a 2 km area)'), { place: 'Kochi', scope: 'About a 2 km area' });
  assert.deepEqual(parseAreaBody('My area: Pune (city-wide)'), { place: 'Pune', scope: 'City-wide' });
  assert.equal(parseAreaBody('My area is lovely'), null);
  assert.equal(parseAreaBody('Hello'), null);
  assert.equal(parseAreaBody('My area: '), null);
});

test('D4: the resume attachment points at the sender\'s own resume and carries no URL', () => {
  const attachment = resumeShareAttachment(ME, 1258291);
  assert.deepEqual(attachment, { kind: 'resume', path: `${ME}/resume.pdf`, name: 'resume.pdf', mime: 'application/pdf', size: 1258291 });
  assert.deepEqual(resumeMessageFields(attachment), { message_type: 'resume', attachment_path: `${ME}/resume.pdf`, attachment_name: 'resume.pdf', attachment_mime: 'application/pdf', attachment_size: 1258291 });
  assert.ok(!('attachment_url' in resumeMessageFields(attachment)));
  assert.equal(resumeShareAttachment(ME, 0).size, null);
  assert.equal(resumeShareAttachment(ME, undefined).size, null);
});

test('D4: copy', () => {
  assert.equal(RESUME_SHARE_BODY, 'Shared their resume');
  assert.equal(NO_RESUME_HINT, 'Add a resume in your profile first.');
  assert.equal(RESUME_GONE_COPY, 'This resume is no longer shared.');
  assert.match(RESUME_SHARE_NOTE, /They'll always see your latest resume\./);
});
