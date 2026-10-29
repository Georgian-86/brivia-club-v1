// Explore post card (polish wave C2): pure markup and share data. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { postCardMarkup, postFooterMarkup, shareData } from '../../site/scripts/post-card.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const renderAvatar = (person, cls = 'mini-avatar') => `<div class="${cls}">${escapeHtml((person?.name || '?')[0])}</div>`;
const deps = { escapeHtml, renderAvatar };
const post = { id: 'p1', author_id: 'm1', caption: 'Sunday <img src=x onerror=alert(1)> ride' };
const author = { id: 'm1', name: 'Asha <b>K</b>', image: '' };
const view = { liked: false, saved: false, imageSrc: 'https://x.test/a.jpg', dateLabel: '3 Oct' };

test('markup escapes caption and name', () => {
  const html = postCardMarkup(post, author, view, deps);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>K<\/b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<article class="post-card" data-post-id="p1">/);
});

test('four buttons in order like, comment, share, save, with labels', () => {
  const html = postCardMarkup(post, author, view, deps);
  const actions = [...html.matchAll(/<button type="button"[^>]*data-post-action="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(actions, ['like', 'comment', 'share', 'save']);
  for (const label of ['Like', 'Comment', 'Share', 'Save']) assert.match(html, new RegExp(`>${label}</span>`));
  assert.equal((html.match(/<svg /g) || []).length >= 4, true);
});

test('aria-pressed reflects liked and saved, and labels switch', () => {
  const off = postCardMarkup(post, author, view, deps);
  assert.match(off, /data-post-action="like" aria-pressed="false"/);
  assert.match(off, /data-post-action="save" aria-pressed="false"/);
  const on = postCardMarkup(post, author, { ...view, liked: true, saved: true }, deps);
  assert.match(on, /data-post-action="like" aria-pressed="true"/);
  assert.match(on, /data-post-action="save" aria-pressed="true"/);
  assert.match(on, />Liked</);
  assert.match(on, />Saved</);
  assert.doesNotMatch(on, />Like</);
  assert.doesNotMatch(on.replace('Saved', ''), />Save</);
});

test('comment and share have no aria-pressed', () => {
  const html = postCardMarkup(post, author, view, deps);
  assert.doesNotMatch(html, /data-post-action="comment"[^>]*aria-pressed/);
  assert.doesNotMatch(html, /data-post-action="share"[^>]*aria-pressed/);
});

test('author name is a profile trigger; missing image shows the placeholder', () => {
  const html = postCardMarkup(post, author, { ...view, imageSrc: '' }, deps);
  assert.match(html, /data-public-profile-id="m1"/);
  assert.match(html, /community-post-image-missing/);
  assert.doesNotMatch(html, /<img src=/);
  assert.match(postCardMarkup(post, author, view, deps), /<img src="https:\/\/x\.test\/a\.jpg"/);
});

test('shareData carries no caption and no name', () => {
  const data = shareData(post, 'https://brivia.club');
  assert.deepEqual(data, { title: 'A post on Brivia Club', url: 'https://brivia.club/explore.html?post=p1' });
});

// C3 (carried from the C2 review): only an https: or same-origin path image renders; anything else is the placeholder.
test('imageSrc must start with https: or /; other schemes render the placeholder', () => {
  for (const bad of ['javascript:alert(1)', 'http://x.test/a.jpg', 'data:image/png;base64,AAAA', '//evil.test/a.jpg', ' https://x.test/a.jpg', 'blob:https://x.test/1']) {
    const html = postCardMarkup(post, author, { ...view, imageSrc: bad }, deps);
    assert.doesNotMatch(html, /<img /, bad);
    assert.match(html, /community-post-image-missing/, bad);
  }
  assert.match(postCardMarkup(post, author, { ...view, imageSrc: '/media/Images/a.webp' }, deps), /<img src="\/media\/Images\/a\.webp"/);
  assert.match(postCardMarkup(post, author, { ...view, imageSrc: 'https://x.test/a.jpg' }, deps), /<img src="https:\/\/x\.test\/a\.jpg"/);
});

test('shareData encodes the post id', () => {
  assert.equal(shareData({ id: 'a b&c=d/e?f' }, 'https://brivia.club').url, 'https://brivia.club/explore.html?post=a%20b%26c%3Dd%2Fe%3Ff');
});

test('activity: inline counts on like, comment and share, a likes line and a comments link (D-101, D-107)', () => {
  const html = postCardMarkup(post, author, { ...view, activity: { likeCount: 3, commentCount: 2, shareCount: 0 }, summary: 'Liked by <Asha> and 2 others' }, deps);
  assert.match(html, /<span class="post-card-count" data-post-count="like">3<\/span>/);
  assert.match(html, /<span class="post-card-count" data-post-count="comment">2<\/span>/);
  assert.doesNotMatch(html, /data-post-count="share"/);
  assert.doesNotMatch(html, /<b class="post-card-count"|aria-label="3"/);
  assert.match(html, /Liked by &lt;Asha&gt; and 2 others/);
  assert.match(html, /View 2 comments/);
});

test('every card has one footer; with no activity it invites the first like (D-107)', () => {
  for (const extra of [{}, { activity: { likeCount: 0, commentCount: 0, shareCount: 0 } }]) {
    const html = postCardMarkup(post, author, { ...view, ...extra }, deps);
    assert.equal((html.match(/class="post-card-footer"/g) || []).length, 1);
    assert.match(html, /<p class="post-card-likes is-empty"[^>]*>Be the first to like this<\/p>/);
    assert.doesNotMatch(html, /post-card-count|post-card-comments-link/);
  }
});

test('footer: likes left, comments right; one comment reads singular (D-107)', () => {
  const html = postFooterMarkup({ likeCount: 3, commentCount: 3 }, 'Liked by Asha and 2 others', escapeHtml);
  assert.match(html, /^<div class="post-card-footer">/);
  assert.ok(html.indexOf('Liked by Asha and 2 others') < html.indexOf('View 3 comments'));
  assert.match(html, /<button type="button" class="post-card-comments-link" data-post-action="comment">View 3 comments<\/button>/);
  assert.match(postFooterMarkup({ likeCount: 0, commentCount: 1 }, '', escapeHtml), /View 1 comment<.*|Be the first to like this/s);
  const one = postFooterMarkup({ likeCount: 0, commentCount: 1 }, '', escapeHtml);
  assert.match(one, /Be the first to like this/);
  assert.match(one, />View 1 comment</);
});

test('counts cap at 999+ and save never shows a count (D-107)', () => {
  const html = postCardMarkup(post, author, { ...view, activity: { likeCount: 1200, commentCount: 0, shareCount: 4 } }, deps);
  assert.match(html, /data-post-count="like">999\+</);
  assert.match(html, /data-post-count="share">4</);
  assert.doesNotMatch(html, /data-post-count="save"/);
});
