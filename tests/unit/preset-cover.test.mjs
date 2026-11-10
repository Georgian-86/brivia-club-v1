// Covers only from the provided set (0014, D-080): one list of preset covers, the same in the client, the signup page and
// the database, and one canonical stored path per cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRESET_COVERS, PRESET_COVER_KEYS, DEFAULT_COVER_KEY, presetCoverPath, isOfferedCoverPath, isPresetCoverUrl } from '../../site/scripts/preset-cover.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const P = (key) => `/Images/Cover%20images/${key}`;

// The founder's order and names (D-128, 2026-11-02; cards 1 and 3 swapped on a follow-up): top to bottom, left to
// right. OPEN MINDS is retired.
const FOUNDER_ORDER = [
  ['AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG', 'AT WORK'], ['7C0B5EFA-4E04-4BEC-AB5D-F7FD8FAA3A52.PNG', 'GAME, SET, GO'],
  ['b66eff76-068e-4f2a-b789-a27051a11f5a.png', 'GOOD ENERGY'], ['3453059c-4864-46f7-ae45-6f7049939b9f.png', 'MUSIC NOTES'],
  ['66F669B5-3A06-4DDA-BDA9-C000623010CC.PNG', 'PARTYING'], ['A6651B99-E0B9-472B-92FB-BABD5C87D2A0.PNG', 'THE GETAWAYS'],
  ['BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG', 'STRINGS & SOUL'], ['0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG', 'THE SLOW BAKE'],
  ['84F018B6-29FB-4060-B2D9-E7DC157CE87E.PNG', 'BASKETBALL SOCIAL'], ['95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG', 'LUXE TRAVEL'],
  ['5ae622b1-88f5-481b-8856-eb2eba35e606.png', 'TECHNOLOGY'], ['9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG', 'MAKE ROOM'],
  ['2BA86035-CBE4-4609-8AFC-E74F149DF54E.PNG', 'POOL'], ['F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG', 'AFTER PRACTICE'],
  ['E7E0AFAA-B547-4228-97C0-88E527151123.PNG', 'SERENE STATE'], ['3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG', 'SLOW EVENINGS'],
  ['2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg', 'NOVEL ESCAPES'], ['71EFFB34-6301-4196-A085-967D12BF30CE.PNG', 'CHECK & MATE'],
  ['9dc8500a-2dcf-47e6-a6b9-02e441edff68.png', 'FRESH START'], ['2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', 'SMASH THEORY'],
  ['9761496E-AA69-4C9F-9F63-773B6FB53D94.PNG', 'ME TIME'], ['EFFF6FA8-4DBE-44CC-8980-661B610AB1A2.PNG', 'CRICKET STORIES'],
  ['3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG', 'SUNDAY STATE'], ['94978B9F-A399-43FC-AC48-0A41088B5D27.PNG', 'GOLDEN HOUR'],
  // Not in the founder's table; kept last on the founder's answer (D-128).
  ['DEB7869C-E852-450F-A371-65E2BF6167A2.PNG', 'FIND YOUR PACE'],
];
const OPEN_MINDS = '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG';
const decode = (html) => html.replace(/&amp;/g, '&');

test('25 covers in the founder\'s order and names, each key once', () => {
  assert.deepEqual(PRESET_COVERS.map((c) => [c.key, c.title]), FOUNDER_ORDER);
  assert.deepEqual(PRESET_COVER_KEYS, PRESET_COVERS.map((c) => c.key));
  assert.equal(new Set(PRESET_COVER_KEYS).size, 25);
  assert.equal(new Set(PRESET_COVERS.map((c) => c.title)).size, 25);
  PRESET_COVERS.forEach((c) => { assert.ok(c.title && c.title === c.title.toUpperCase(), c.key); });
});

test('OPEN MINDS is gone everywhere: not offered, not shipped, not a cover any more', () => {
  assert.ok(!PRESET_COVER_KEYS.includes(OPEN_MINDS));
  assert.equal(presetCoverPath(P(OPEN_MINDS)), '');
  assert.equal(presetCoverPath('/assets/7423007B-E17D-4D46-A19F-499CC9A8DB99-Bcr88PbJ.PNG'), '');
  for (const file of ['site/auth.html', 'site/scripts/cover-assets.js', 'site/scripts/preset-cover.js', 'site/media/manifest.json']) {
    assert.ok(!read(file).includes('7423007B'), file);
    assert.ok(!/<span>OPEN MINDS<\/span>|title: 'OPEN MINDS'/.test(read(file)), file);
  }
});

test('every offered cover has a shipped image', () => {
  for (const key of PRESET_COVER_KEYS) {
    const webp = `site/media/Images/Cover images/${key.replace(/\.(PNG|png|jpeg)$/, '')}.webp`;
    assert.ok(readFileSync(path.join(root, webp)).length > 1000, webp);
  }
});

test('the list matches cover-assets.js, the signup picker and the latest migration that defines it (0027)', () => {
  const assets = [...read('site/scripts/cover-assets.js').matchAll(/^\s+'([^']+)': cover[A-Z]\w+,$/gm)].map((m) => m[1]);
  assert.deepEqual(assets, PRESET_COVER_KEYS);
  const auth = [...read('site/auth.html').matchAll(/data-cover-option="\/Images\/Cover%20images\/([^"]+)"[^>]*>.*?<span>([^<]+)<\/span>/g)];
  assert.deepEqual(auth.map((m) => m[1]), PRESET_COVER_KEYS);
  assert.deepEqual(auth.map((m) => decode(m[2])), PRESET_COVERS.map((c) => c.title));
  const sql = read('supabase/migrations/0027_cover_order_open_minds.sql');
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

test('the default cover is AT WORK, the first one (D-227, founder 2026-11-10), preselected at signup', () => {
  assert.equal(DEFAULT_COVER_KEY, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG');
  assert.equal(DEFAULT_COVER_KEY, PRESET_COVER_KEYS[0]);
  assert.equal(PRESET_COVERS[0].title, 'AT WORK');
  assert.match(read('site/scripts/script.js'), /GUIDED_DEFAULT_COVER = '\/Images\/Cover%20images\/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C\.PNG'/);
  assert.match(read('site/auth.html'), /name="coverUrl" value="\/Images\/Cover%20images\/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C\.PNG"/);
  assert.match(read('site/auth.html'), /class="cover-choice is-selected" type="button" data-cover-option="\/Images\/Cover%20images\/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C\.PNG"/);
  assert.equal((read('site/auth.html').match(/cover-choice is-selected/g) || []).length, 1);
  assert.match(read('site/scripts/cover-assets.js'), /defaultCoverUrl = coverThirteen;/);
  assert.match(read('site/scripts/cover-assets.js'), /import coverThirteen from '\.\.\/media\/Images\/Cover images\/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C\.webp';/);
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
