import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkifyHtml, sharedLinkIn, hrefFor, sharedEventMessage } from '../../site/scripts/chat-links.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('links become links; punctuation and the rest stay text, escaped', () => {
  const html = linkifyHtml('see https://example.com/a?b=1&c=2. and www.brivia.in!', esc);
  assert.match(html, /<a class="message-link" href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">https:\/\/example\.com\/a\?b=1&amp;c=2<\/a>\./);
  assert.match(html, /href="https:\/\/www\.brivia\.in\/"[^>]*>www\.brivia\.in<\/a>!/);
  assert.equal(linkifyHtml('<b>hi</b>', esc), '&lt;b&gt;hi&lt;/b&gt;');
  assert.equal(linkifyHtml('javascript:alert(1)', esc), 'javascript:alert(1)');
  assert.equal(hrefFor('https://x.y/"onmouseover=1'), 'https://x.y/%22onmouseover=1');
  assert.ok(!/<a[^>]*onmouseover/.test(linkifyHtml('https://x.y/"onmouseover=alert(1)', esc)));
});

test('a Brivia post or event link anywhere in a message is found, with the words around it', () => {
  const t = 'https://thebriviaclub.live/explore.html?post=8ebd0bdc-0086-4a37-8531-f5e8eeb85caf          Career, chess, looks 😭';
  assert.deepEqual(sharedLinkIn(t), { kind: 'post', id: '8ebd0bdc-0086-4a37-8531-f5e8eeb85caf', rest: 'Career, chess, looks 😭' });
  assert.deepEqual(sharedLinkIn('Shared a post with you on Brivia Club: https://a.b/explore.html?post=abc'), { kind: 'post', id: 'abc', rest: '' });
  assert.deepEqual(sharedLinkIn(sharedEventMessage('https://thebriviaclub.live/app.html?view=events&event=ev-1')), { kind: 'event', id: 'ev-1', rest: '' });
  assert.deepEqual(sharedLinkIn('come! https://thebriviaclub.live/app.html?view=events&event=ev-2.'), { kind: 'event', id: 'ev-2', rest: 'come! .' });
  assert.equal(sharedLinkIn('https://example.com/explore.html'), null);
  assert.equal(sharedLinkIn('no links here'), null);
});
