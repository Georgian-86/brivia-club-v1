// Nearby (D-131): the pure helpers behind the Nearby view and the "someone nearby" request copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADII, DEFAULT_RADIUS, normalizeRadius, radiusLine, bandLabel, nearbyState, normalizeNearby, nearbyCardMarkup,
  nearbyMatchMarkup, nearbyOpeners, NEARBY_OPENER, COPY, barLabel,
} from '../../site/scripts/nearby-view.js';
import { collabSummary, reviewCardModel, reviewCardMarkup } from '../../site/scripts/collab-requests.js';

const esc = (v = '') => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

test('radius: 1, 3 or 5 km (no 500 m: the founder chose 1 km precision), default 1 km', () => {
  assert.deepEqual(RADII, [1, 3, 5]);
  assert.equal(DEFAULT_RADIUS, 1);
  for (const bad of [0, 0.5, 2, 10, 'x', null, undefined]) assert.equal(normalizeRadius(bad), 1, String(bad));
  assert.equal(normalizeRadius('3'), 3);
  assert.equal(radiusLine(5), 'People within 5 km of you');
});

test('the distance is a band, never metres', () => {
  assert.equal(bandLabel('1'), 'Under 1 km away');
  assert.equal(bandLabel('3'), '1–3 km away');
  assert.equal(bandLabel('5'), '3–5 km away');
  assert.equal(bandLabel('300'), 'Nearby');
  assert.equal(bandLabel(''), 'Nearby');
  for (const band of ['1', '3', '5']) assert.doesNotMatch(bandLabel(band), /\bm\b|metre|meter/);
});

test('nearbyState: why the deck shows what it shows', () => {
  assert.equal(nearbyState({ enabled: null }), 'loading');
  assert.equal(nearbyState({ enabled: false }), 'off');
  assert.equal(nearbyState({ enabled: true, status: 'unavailable-server' }), 'unavailable');
  assert.equal(nearbyState({ enabled: true, status: 'on', error: { message: 'x', missing: true } }), 'unavailable');
  assert.equal(nearbyState({ enabled: true, status: 'on', error: { message: 'nearby off' } }), 'consent');
  assert.equal(nearbyState({ enabled: true, status: 'paused-denied' }), 'paused-denied');
  assert.equal(nearbyState({ enabled: true, status: 'on', error: { message: 'location needed' } }), 'locating');
  assert.equal(nearbyState({ enabled: true, status: 'on', error: { message: 'complete your profile' } }), 'incomplete');
  assert.equal(nearbyState({ enabled: true, status: 'on', error: { message: 'boom' } }), 'error');
  assert.equal(nearbyState({ enabled: true, status: 'on', count: 0 }), 'quiet');
  assert.equal(nearbyState({ enabled: true, status: 'on', count: 2 }), 'cards');
});

const row = {
  member_id: 'a1', name: 'Yashika <b>', photo_url: 'https://x/p.jpg', cover_url: '/Images/Cover%20images/x.PNG', headline: 'Product designer',
  bio: 'Chess on Sundays.', looking_for: ['Hackathon Buddy', 'Mentor', 'Friends', 'Extra'], skills: ['Figma', 'React'],
  interests: ['Badminton', 'Chess', 'Cafe hopping'], shared_interests: ['Badminton'], shared_count: 1, distance_band: '1',
  place_name: 'Bengaluru', here_now: true, asked_me: true,
};

test('normalizeNearby keeps only what the card shows', () => {
  const p = normalizeNearby(row);
  assert.equal(p.id, 'a1');
  assert.deepEqual(p.lookingFor, ['Hackathon Buddy', 'Mentor', 'Friends']);
  assert.equal(p.band, '1');
  assert.equal(p.place, 'Bengaluru');
  assert.equal(p.hereNow, true);
  assert.equal(p.askedMe, true);
  assert.equal(barLabel(p), 'Looking for · Hackathon Buddy, Mentor');
  assert.equal(barLabel(normalizeNearby({ member_id: 'z' })), 'Brivia member');
});

test('the card: escaped, band and city only, shared interests first, here now, asked me', () => {
  const html = nearbyCardMarkup(normalizeNearby(row), { coverSrc: '/c.webp', photoSrc: 'https://x/p.jpg', current: true });
  assert.match(html, /Yashika &lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /Bengaluru · Under 1 km away/);
  assert.match(html, /You both: Badminton/);
  assert.ok(html.indexOf('You both: Badminton') < html.indexOf('<li>Chess'));
  assert.equal((html.match(/Badminton/g) || []).length, 1);   // a shared interest is not listed twice
  assert.match(html, /Here now/);
  assert.match(html, /Wants to connect with you/);
  assert.match(html, /View profile/);
  assert.match(html, /is-current/);
  const quiet = nearbyCardMarkup(normalizeNearby({ ...row, here_now: false, asked_me: false }), {});
  assert.doesNotMatch(quiet, /Here now|Wants to connect/);
});

test('the default opener is the founder\'s, first, and editable choices follow', () => {
  assert.equal(NEARBY_OPENER, "Hi! Saw you're nearby. Let's connect and share our interests.");
  const list = nearbyOpeners({ name: 'Yashika Rao', shared: ['Badminton'] });
  assert.equal(list[0], NEARBY_OPENER);
  assert.match(list[1], /Yashika/);
  assert.match(list[1], /badminton/);
});

test('the match moment uses the founder\'s line', () => {
  const html = nearbyMatchMarkup({ me: { name: 'Me' }, them: { name: 'Yashika' } });
  assert.match(html, /Well, look who <em>crossed paths!<\/em>/);
  assert.match(html, /data-match-chat/);
  assert.equal(COPY.matchTitle, 'Well, look who crossed paths!');
  assert.equal(COPY.quietTitle + ' ' + COPY.quietCopy, "It's a little quiet around here. Check back as more people cross paths.");
});

test('requests from Nearby say so', () => {
  assert.equal(collabSummary([{ fromId: 'a', via: 'nearby' }]).text, 'Someone nearby wants to connect with you');
  assert.equal(collabSummary([{ fromId: 'a' }]).text, '1 person wants to connect');
  assert.equal(collabSummary([{ fromId: 'a', via: 'nearby' }, { fromId: 'b' }]).text, '2 people want to connect · 1 nearby');
  const m = reviewCardModel({ fromId: 'a', via: 'nearby', note: 'Hi', person: { name: 'Asha' } });
  assert.equal(m.nearby, true);
  assert.match(reviewCardMarkup(m, { index: 0, total: 1 }, { escapeHtml: esc, renderAvatar: () => '' }), /Crossed paths nearby/);
  const plain = reviewCardModel({ fromId: 'a', note: 'Hi', person: { name: 'Asha' } });
  assert.doesNotMatch(reviewCardMarkup(plain, { index: 0, total: 1 }, { escapeHtml: esc, renderAvatar: () => '' }), /Crossed paths/);
});
