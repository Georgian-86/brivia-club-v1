// The "What remains" list on privacy.html and the delete dialog must say the same (R5). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DELETE_DISCLOSURE } from '../../account-deletion.js';

const html = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../privacy.html'), 'utf8');
const list = (heading) => {
  const section = html.slice(html.indexOf(`<h3>${heading}</h3>`));
  const ul = section.slice(section.indexOf('<ul>'), section.indexOf('</ul>'));
  return [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
};

test('privacy.html "What remains" equals DELETE_DISCLOSURE.remains', () => assert.deepEqual(list('What remains'), DELETE_DISCLOSURE.remains));
test('privacy.html "What is deleted" equals DELETE_DISCLOSURE.deleted', () => assert.deepEqual(list('What is deleted'), DELETE_DISCLOSURE.deleted));
