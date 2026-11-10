import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appAssetUrls, shouldPrefetch } from '../../site/scripts/prefetch-app.js';

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/app-x-LuNJx8.js"></script>
<link rel="modulepreload" crossorigin href="/assets/supabase-CT_oUELC.js">
<link rel="stylesheet" crossorigin href="/assets/app-DXqWstmL.css">
<link rel="stylesheet" href="/assets/app-DXqWstmL.css">
<link rel="icon" href="/favicon.png">
<script src="https://evil.example/assets/x.js"></script>
<link rel="stylesheet" href="/assets/../secret.css">
</head></html>`;

test('appAssetUrls lists the built scripts and styles of a page once, same-site /assets only', () => {
  assert.deepEqual(appAssetUrls(HTML), ['/assets/app-x-LuNJx8.js', '/assets/supabase-CT_oUELC.js', '/assets/app-DXqWstmL.css']);
  assert.deepEqual(appAssetUrls(''), []);
  assert.deepEqual(appAssetUrls(null), []);
});

test('shouldPrefetch respects Data Saver and slow connections', () => {
  assert.equal(shouldPrefetch({}), true);
  assert.equal(shouldPrefetch({ connection: { saveData: true } }), false);
  assert.equal(shouldPrefetch({ connection: { effectiveType: '2g' } }), false);
  assert.equal(shouldPrefetch({ connection: { effectiveType: 'slow-2g' } }), false);
  assert.equal(shouldPrefetch({ connection: { effectiveType: '4g' } }), true);
  assert.equal(shouldPrefetch(undefined), true);
});
