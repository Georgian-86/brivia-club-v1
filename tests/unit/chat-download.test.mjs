// Download a chat attachment. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { canDownloadAttachment, downloadFileName, downloadAttachment, DOWNLOAD_URL_TTL_SECONDS } from '../../site/scripts/chat-download.js';

test('only files in our bucket can be downloaded: not external GIFs, not the resume card', () => {
  assert.equal(canDownloadAttachment({ kind: 'image', path: 'u1/a.jpg' }), true);
  assert.equal(canDownloadAttachment({ kind: 'video', path: 'u1/a.mp4' }), true);
  assert.equal(canDownloadAttachment({ kind: 'document', path: 'u1/a.pdf' }), true);
  assert.equal(canDownloadAttachment({ kind: 'gif', path: '', url: 'https://media.giphy.com/x.gif' }), false);
  assert.equal(canDownloadAttachment({ kind: 'resume', path: 'u1/resume.pdf' }), false);
  assert.equal(canDownloadAttachment(null), false);
});

test('the file keeps its own name, made safe, and gains an extension from its type when it has none', () => {
  assert.equal(downloadFileName({ name: 'Trip.jpg', mime: 'image/jpeg', kind: 'image' }), 'Trip.jpg');
  assert.equal(downloadFileName({ name: 'Trip', mime: 'image/jpeg', kind: 'image' }), 'Trip.jpg');
  assert.equal(downloadFileName({ name: '../../etc/pass:wd', mime: 'text/plain' }), 'etc pass wd.txt');
  assert.equal(downloadFileName({ name: 'Attachment', mime: 'video/mp4', kind: 'video' }), 'video.mp4');
  assert.equal(downloadFileName({ name: '', mime: '', kind: 'document' }), 'file');
  const long = downloadFileName({ name: `${'a'.repeat(200)}.pdf`, mime: 'application/pdf' });
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.pdf'));
});

test('asks Storage for a short-lived signed URL that downloads under the file name', async () => {
  const calls = [];
  const storage = { from: (bucket) => ({ createSignedUrl: async (...args) => { calls.push([bucket, ...args]); return { data: { signedUrl: 'https://x.supabase.co/s?download=Trip.jpg' }, error: null }; } }) };
  const result = await downloadAttachment(storage, { kind: 'image', path: 'u1/a.jpg', name: 'Trip', mime: 'image/jpeg' });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [['message-attachments', 'u1/a.jpg', DOWNLOAD_URL_TTL_SECONDS, { download: 'Trip.jpg' }]]);
});

test('a Storage error or a non-downloadable attachment reports not ok', async () => {
  const failing = { from: () => ({ createSignedUrl: async () => ({ data: null, error: new Error('Object not found') }) }) };
  assert.equal((await downloadAttachment(failing, { kind: 'image', path: 'u1/a.jpg' })).ok, false);
  assert.equal((await downloadAttachment(failing, { kind: 'gif', path: '' })).ok, false);
  assert.equal((await downloadAttachment(null, { kind: 'image', path: 'u1/a.jpg' })).ok, false);
});
