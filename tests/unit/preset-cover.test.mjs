// Covers only from the provided set (0014, D-080): one list of preset covers, the same in the client, the signup page and
// the database, and one canonical stored path per cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRESET_COVERS, PRESET_COVER_KEYS, presetCoverPath, isOfferedCoverPath, isPresetCoverUrl } from '../../site/scripts/preset-cover.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const P = (key) => `/Images/Cover%20images/${key}`;

test('26 covers, each with a key and a title', () => {
  assert.equal(PRESET_COVERS.length, 26);
  assert.deepEqual(PRESET_COVER_KEYS, PRESET_COVERS.map((c) => c.key));
  assert.equal(new Set(PRESET_COVER_KEYS).size, 26);
  PRESET_COVERS.forEach((c) => { assert.ok(c.title && c.title === c.title.toUpperCase(), c.key); });
});

test('the list matches cover-assets.js, the signup picker and the latest migration that defines it (0019)', () => {
  const assets = [...read('site/scripts/cover-assets.js').matchAll(/^\s+'([^']+)': cover[A-Z]\w+,$/gm)].map((m) => m[1]);
  assert.deepEqual(assets, PRESET_COVER_KEYS);
  const auth = [...read('site/auth.html').matchAll(/data-cover-option="\/Images\/Cover%20images\/([^"]+)"[^>]*>.*?<span>([^<]+)<\/span>/g)];
  assert.deepEqual(auth.map((m) => m[1]), PRESET_COVER_KEYS);
  assert.deepEqual(auth.map((m) => m[2]), PRESET_COVERS.map((c) => c.title));
  const sql = read('supabase/migrations/0019_cover_set_refresh.sql');
  const body = sql.slice(sql.indexOf('brivia_offered_cover_keys()\nreturns'), sql.indexOf(']::text[]'));
  assert.deepEqual([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]), PRESET_COVER_KEYS);
});

test('presetCoverPath: the canonical stored path for every form the client has ever stored', () => {
  for (const key of PRESET_COVER_KEYS) {
    assert.equal(presetCoverPath(P(key)), P(key));
    assert.equal(presetCoverPath(`/Images/Cover images/${key}`), P(key));
  }
  // Old Vite-hashed builds (the two live legacy values, 2026-10-22) and optimized build / dev URLs.
  assert.equal(presetCoverPath('/assets/F28EA63E-1BEB-49E9-BA01-F62127017DB1-B4-NibCZ.webp'), P('F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'));
  assert.equal(presetCoverPath('/assets/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF-Bcr88PbJ.PNG'), P('2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'));
  assert.equal(presetCoverPath('/assets/2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg-Dq1x_aZ9.webp'), P('2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg'));
  assert.equal(presetCoverPath('/media/Images/Cover%20images/9dc8500a-2dcf-47e6-a6b9-02e441edff68.webp'), P('9dc8500a-2dcf-47e6-a6b9-02e441edff68.png'));
});

test('presetCoverPath: anything else is not a cover', () => {
  for (const value of ['', null, undefined, 'https://proj.supabase.co/storage/v1/object/public/profile-covers/u/c.jpg',
    'https://evil.example/c.png', 'data:image/png;base64,AAAA', 'blob:http://x/1', '/assets/c.png', P('evil.PNG'),
    '/Images/Cover%20images/../2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', P('2257522a-04b9-4e3e-ab1a-a73d7bb8ccbf.png'),
    // The retired cover (0019, D-116): the stored path and an old hashed build URL are no longer covers.
    P('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'), '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Bcr88PbJ.PNG']) {
    assert.equal(presetCoverPath(value), '', String(value));
  }
});

test('the default cover is the first offered cover, not the retired one', () => {
  assert.equal(PRESET_COVER_KEYS[0], '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG');
  assert.match(read('site/scripts/script.js'), /GUIDED_DEFAULT_COVER = '\/Images\/Cover%20images\/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF\.PNG'/);
  assert.match(read('site/auth.html'), /name="coverUrl" value="\/Images\/Cover%20images\/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF\.PNG"/);
  assert.match(read('site/scripts/cover-assets.js'), /defaultCoverUrl = coverTwo;/);
  for (const file of ['site/auth.html', 'site/scripts/cover-assets.js', 'site/scripts/preset-cover.js', 'site/scripts/script.js']) {
    assert.ok(!read(file).includes('163BDB0C'), file);
  }
});

test('isOfferedCoverPath is the database rule (brivia_is_offered_cover) and implies isPresetCoverUrl', () => {
  for (const key of PRESET_COVER_KEYS) { assert.ok(isOfferedCoverPath(P(key))); assert.ok(isPresetCoverUrl(P(key))); }
  assert.equal(isOfferedCoverPath(`/Images/Cover images/${PRESET_COVER_KEYS[0]}`), false);
  assert.equal(isOfferedCoverPath('/assets/F28EA63E-1BEB-49E9-BA01-F62127017DB1-B4-NibCZ.webp'), false);
  assert.equal(isOfferedCoverPath(''), false);
});
