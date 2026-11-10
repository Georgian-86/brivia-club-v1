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
  // Coordinate-shaped text never becomes a place card (review M1).
  assert.equal(parseAreaBody('My area: 12.9716, 77.5946 (about a 2 km area)'), null);
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

// D-230 (founder 2026-11-10: "i am not able to open the location"): the area card opens a map search for the place name
// only, the same words already in the message; never coordinates.
import { areaMapUrl } from '../../site/scripts/quick-share.js';
test('areaMapUrl searches Google Maps for the place name only', () => {
  assert.equal(areaMapUrl('Bangalore East'), 'https://www.google.com/maps/search/?api=1&query=Bangalore%20East');
  assert.equal(areaMapUrl('  Koramangala, Bengaluru '), 'https://www.google.com/maps/search/?api=1&query=Koramangala%2C%20Bengaluru');
  assert.equal(areaMapUrl('Pune & Co'), 'https://www.google.com/maps/search/?api=1&query=Pune%20%26%20Co');
});
test('areaMapUrl never links coordinates or nothing', () => {
  assert.equal(areaMapUrl('12.9716, 77.5946'), '');
  assert.equal(areaMapUrl(''), '');
  assert.equal(areaMapUrl(null), '');
});

// D-231 (founder 2026-11-10: "add option of sending some random location as well"): share any place by name or link.
import { placeShareBody, parsePlaceBody, placeShareProblem, PLACE_PREFIX } from '../../site/scripts/quick-share.js';
test('placeShareBody: a place name, or a Google Maps link, as one tidy message', () => {
  assert.equal(PLACE_PREFIX, 'Place: ');
  assert.equal(placeShareBody('  Rameshwaram Cafe,   Indiranagar '), 'Place: Rameshwaram Cafe, Indiranagar');
  assert.equal(placeShareBody('https://maps.app.goo.gl/S1kkeNLURQM4qEeN9?g_st=ic'), 'Place: https://maps.app.goo.gl/S1kkeNLURQM4qEeN9?g_st=ic');
  assert.equal(placeShareBody('https://www.google.com/maps/place/Toit/@12.97,77.64,17z'), 'Place: https://www.google.com/maps/place/Toit/@12.97,77.64,17z');
  assert.equal(placeShareBody('https://maps.google.co.in/?q=MTR'), 'Place: https://maps.google.co.in/?q=MTR');
  assert.equal(placeShareBody('x'.repeat(300)).length, PLACE_PREFIX.length + 160);
});
test('placeShareBody refuses nothing, raw coordinates and other links', () => {
  assert.equal(placeShareBody('   '), '');
  assert.equal(placeShareBody('12.9716, 77.5946'), '');
  assert.equal(placeShareBody('https://evil.example/maps'), '');
  assert.equal(placeShareBody('http://maps.app.goo.gl/abc'), '');
  assert.equal(placeShareBody('javascript:alert(1)'), '');
  assert.equal(placeShareBody('https://maps.app.goo.gl.evil.com/x'), '');
});
test('placeShareProblem says why in plain words', () => {
  assert.equal(placeShareProblem('MTR, Lalbagh'), '');
  assert.equal(placeShareProblem(''), 'Type a place name or paste a Google Maps link.');
  assert.equal(placeShareProblem('12.9716, 77.5946'), 'Type the place name, or paste a Google Maps link, instead of coordinates.');
  assert.equal(placeShareProblem('https://evil.example/x'), 'Only Google Maps links can be shared here.');
});
test('parsePlaceBody: the card for a name (opens a Maps search) or a link (opens the link)', () => {
  assert.deepEqual(parsePlaceBody('Place: MTR, Lalbagh'), { name: 'MTR, Lalbagh', url: 'https://www.google.com/maps/search/?api=1&query=MTR%2C%20Lalbagh', pinned: false });
  assert.deepEqual(parsePlaceBody('Place: https://maps.app.goo.gl/S1kke'), { name: 'Pinned on Google Maps', url: 'https://maps.app.goo.gl/S1kke', pinned: true });
  assert.equal(parsePlaceBody('Place: https://evil.example/x'), null);
  assert.equal(parsePlaceBody('Place: 12.97, 77.59'), null);
  assert.equal(parsePlaceBody('My area: Kochi (about a 2 km area)'), null);
  assert.equal(parsePlaceBody('hello'), null);
});
