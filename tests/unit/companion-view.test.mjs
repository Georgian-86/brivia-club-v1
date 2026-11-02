// Find a Companion (D-123): the pure card and match markup in companion-view.js. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCompanion, normalizeCompanionEvent, normalizeCompanionMatch, companionCardMarkup, matchMomentMarkup, headlineFor,
  bandLine, lookingCount, eventPickLabel, shortEventDate, chatContextLine,
} from '../../site/scripts/companion-view.js';
import { navViewFor } from '../../site/scripts/app-nav.js';

const row = { member_id: 'p1', name: 'Aanya', photo_url: 'x', cover_url: null, headline: 'SDE Intern @ Swiggy', looking_for: ['Friends'],
  interests: ['Tech', 'Chess', 'Music'], shared_interests: ['Chess'], distance_band: '~3 km', shared_count: 1 };
const ev = { title: 'Blitz Chess Meetup', startsAt: '2026-11-04T04:30:00Z', venueName: 'Battle Chess Skool' }; // 10:00 IST

test('labels: count, picker, date in IST, band only, headline', () => {
  assert.equal(lookingCount(3), '03 PEOPLE LOOKING FOR COMPANY');
  assert.equal(lookingCount(1), '01 PERSON LOOKING FOR COMPANY');
  assert.equal(eventPickLabel(normalizeCompanionEvent({ event_id: 'e', title: 'Blitz Chess Meetup', starts_at: ev.startsAt })), 'Blitz Chess Meetup · 4 Nov');
  assert.equal(shortEventDate(ev.startsAt), 'Wed 4 Nov');
  assert.equal(bandLine('~3 km'), '~3 km away');
  assert.equal(bandLine('Mumbai'), 'Mumbai');
  assert.equal(bandLine(''), '');
  const p = normalizeCompanion(row);
  assert.equal(headlineFor(p), 'SDE Intern @ Swiggy · Looking for Friends');
  assert.equal(headlineFor({ ...p, headline: '', lookingFor: [] }), '1 shared interest');
});

test('card: badge, photo button, name, band, chips with the shared one marked, the event row with date and venue', () => {
  const html = companionCardMarkup(normalizeCompanion(row), { coverSrc: '/c.webp', photoSrc: '/p.jpg', event: ev, current: true });
  assert.match(html, /Looking for a companion/);
  assert.match(html, /data-companion-profile="p1" aria-label="Open Aanya's profile"/);
  assert.match(html, /~3 km away/);
  assert.match(html, /<li class="is-shared">Chess<span class="sr-only"> \(you share this\)/);
  assert.match(html, /<span>Going to<\/span> Blitz Chess Meetup/);
  assert.match(html, /Wed 4 Nov · Battle Chess Skool/);
  assert.match(html, /companion-card is-current/);
  assert.ok(!/city|@example|\+91/.test(html));
  assert.ok(!companionCardMarkup(normalizeCompanion({ ...row, name: '<img src=x>' }), { event: ev }).includes('<img src=x>'), 'escaped');
});

test('match moment and chat context', () => {
  const html = matchMomentMarkup({ me: { name: 'Alex' }, them: { name: 'Aanya' }, event: ev });
  assert.match(html, /Looks like you're going <em>together!<\/em>/);
  assert.match(html, /You and Aanya both want to experience Blitz Chess Meetup together\./);
  assert.match(html, /data-match-chat>Start conversation/);
  const m = normalizeCompanionMatch({ match_id: 'm', event_title: 'Blitz Chess Meetup', starts_at: ev.startsAt, other_id: 'p1', other_name: 'Aanya' });
  assert.equal(chatContextLine(m), 'GOING TOGETHER · BLITZ CHESS MEETUP · WED 4 NOV');
  assert.equal(chatContextLine(null), '');
});

test('the companions view belongs to Connect (no new tab)', () => {
  assert.equal(navViewFor('companions'), 'explore');
  assert.equal(navViewFor('events'), 'events');
});
