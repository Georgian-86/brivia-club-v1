// Resume upload (polish wave D3): client-side PDF checks and the Storage / profiles calls. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_MAX_BYTES, RESUME_BUCKET, resumePath, validateResume, readResumeHead, formatResumeSize, resumeMetaLine,
  resumeUploadErrorMessage, isMissingResumeStore, createResumeApi, REMOVE_RESUME_CONFIRM,
  UPLOAD_PDF_COPY, EMPTY_FILE_COPY, TOO_LARGE_COPY, NOT_A_PDF_COPY, UPLOAD_FAILED_COPY,
} from '../../site/scripts/resume-file.js';

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04 (a .docx)
const file = (overrides = {}) => ({ name: 'Alex CV.pdf', type: 'application/pdf', size: 1200, ...overrides });

test('the limit is exactly 5 MB (5242880 bytes), the bucket is resumes and the path is <uid>/resume.pdf', () => {
  assert.equal(RESUME_MAX_BYTES, 5242880);
  assert.equal(RESUME_BUCKET, 'resumes');
  assert.equal(resumePath('u-1'), 'u-1/resume.pdf');
});

test('the copy is exact', () => {
  assert.equal(UPLOAD_PDF_COPY, 'Upload a PDF file.');
  assert.equal(EMPTY_FILE_COPY, 'This file is empty.');
  assert.equal(TOO_LARGE_COPY, 'Your resume must be 5 MB or smaller.');
  assert.equal(NOT_A_PDF_COPY, "This file isn't a valid PDF.");
  assert.equal(REMOVE_RESUME_CONFIRM, 'Remove your resume? Matches you shared it with can no longer open it.');
});

test('a real PDF (%PDF-1.7) is accepted', () => {
  assert.deepEqual(validateResume(file(), PDF_HEAD), { ok: true });
});

test('size boundary: 5242880 bytes is accepted, 5242881 is refused', () => {
  assert.deepEqual(validateResume(file({ size: 5242880 }), PDF_HEAD), { ok: true });
  assert.deepEqual(validateResume(file({ size: 5242881 }), PDF_HEAD), { ok: false, message: 'Your resume must be 5 MB or smaller.' });
});

test('a 0-byte file is refused as empty', () => {
  assert.deepEqual(validateResume(file({ size: 0 }), new Uint8Array()), { ok: false, message: 'This file is empty.' });
});

test('not a PDF by type or extension is refused before anything else', () => {
  assert.deepEqual(validateResume(file({ name: 'cv.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), ZIP_HEAD), { ok: false, message: 'Upload a PDF file.' });
  assert.deepEqual(validateResume(file({ name: 'photo.png', type: 'image/png', size: 0 }), new Uint8Array()), { ok: false, message: 'Upload a PDF file.' });
  assert.deepEqual(validateResume(file({ name: 'cv', type: '' }), PDF_HEAD), { ok: false, message: 'Upload a PDF file.' });
  // A type that says Word is not trusted over a .pdf name.
  assert.deepEqual(validateResume(file({ name: 'cv.pdf', type: 'application/msword' }), PDF_HEAD), { ok: false, message: 'Upload a PDF file.' });
});

test('a .pdf with an empty (or generic) type but the %PDF magic is accepted', () => {
  assert.deepEqual(validateResume(file({ name: 'CV.PDF', type: '' }), PDF_HEAD), { ok: true });
  assert.deepEqual(validateResume(file({ name: 'cv.pdf', type: 'application/octet-stream' }), PDF_HEAD), { ok: true });
});

test('a renamed .docx (PK\\x03\\x04) or a head shorter than 4 bytes is not a valid PDF', () => {
  assert.deepEqual(validateResume(file({ name: 'cv.pdf' }), ZIP_HEAD), { ok: false, message: "This file isn't a valid PDF." });
  assert.deepEqual(validateResume(file(), new Uint8Array([0x25, 0x50, 0x44])), { ok: false, message: "This file isn't a valid PDF." });
  assert.deepEqual(validateResume(file(), undefined), { ok: false, message: "This file isn't a valid PDF." });
  assert.deepEqual(validateResume(file(), new Uint8Array([0x25, 0x70, 0x64, 0x66])), { ok: false, message: "This file isn't a valid PDF." }, 'case matters: %pdf is not %PDF');
});

test('no file at all is "Upload a PDF file."', () => {
  assert.deepEqual(validateResume(null, PDF_HEAD), { ok: false, message: 'Upload a PDF file.' });
});

test('readResumeHead reads only the first 4 bytes', async () => {
  let sliced = null;
  const blob = { slice: (a, b) => { sliced = [a, b]; return { arrayBuffer: async () => PDF_HEAD.slice(a, b).buffer }; } };
  const head = await readResumeHead(blob);
  assert.deepEqual(sliced, [0, 4]);
  assert.deepEqual([...head], [0x25, 0x50, 0x44, 0x46]);
  assert.deepEqual([...await readResumeHead({ slice: () => { throw new Error('gone'); } })], []);
});

test('sizes read as KB under 1 MB and as MB with one decimal above', () => {
  assert.equal(formatResumeSize(1258291), '1.2 MB');
  assert.equal(formatResumeSize(5242880), '5 MB');
  assert.equal(formatResumeSize(204800), '200 KB');
  assert.equal(formatResumeSize(10), '1 KB');
  assert.equal(formatResumeSize(null), '');
});

test('the meta line is "resume.pdf · 1.2 MB · Updated 21 Oct 2026"; missing parts drop out', () => {
  assert.equal(resumeMetaLine({ size: 1258291, updatedAt: '2026-10-21T09:00:00Z' }), '1.2 MB · Updated 21 Oct 2026');
  assert.equal(resumeMetaLine({ size: 1258291 }), '1.2 MB');
  assert.equal(resumeMetaLine({ updatedAt: 'not a date' }), '');
});

test('server refusals map to the same field copy; anything else is the calm retry line', () => {
  assert.equal(resumeUploadErrorMessage({ statusCode: '413', message: 'The object exceeded the maximum allowed size' }), TOO_LARGE_COPY);
  assert.equal(resumeUploadErrorMessage({ statusCode: '415', message: 'mime type application/zip is not supported' }), UPLOAD_PDF_COPY);
  assert.equal(resumeUploadErrorMessage({ message: 'Failed to fetch' }), UPLOAD_FAILED_COPY);
  assert.equal(UPLOAD_FAILED_COPY, "Your resume couldn't be uploaded. Please try again.");
});

test('a missing bucket or column (0012 not applied) is recognised', () => {
  assert.equal(isMissingResumeStore({ message: 'Bucket not found', statusCode: '404' }), true);
  assert.equal(isMissingResumeStore({ code: 'PGRST204', message: "Could not find the 'resume_path' column of 'profiles' in the schema cache" }), true);
  assert.equal(isMissingResumeStore({ code: '42703', message: 'column profiles.resume_path does not exist' }), true);
  assert.equal(isMissingResumeStore({ message: 'Failed to fetch' }), false);
  assert.equal(isMissingResumeStore(null), false);
});

// A fake Supabase client that records every call.
const fakeClient = ({ upload = { data: { path: 'u-1/resume.pdf' }, error: null }, update = { error: null }, remove = { data: [], error: null }, sign = { data: { signedUrl: 'https://x/sign?token=t' }, error: null }, list = { data: [], error: null } } = {}) => {
  const log = [];
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body, options) => { log.push(['upload', bucket, path, body, options]); return upload; },
        remove: async (paths) => { log.push(['remove', bucket, paths]); return remove; },
        createSignedUrl: async (path, seconds) => { log.push(['sign', bucket, path, seconds]); return sign; },
        list: async (prefix, options) => { log.push(['list', bucket, prefix, options]); return list; },
      }),
    },
    from: (table) => ({
      update: (values) => ({ eq: async (column, value) => { log.push(['update', table, values, column, value]); return update; } }),
    }),
  };
  return { client, log };
};

test('uploadResume upserts <uid>/resume.pdf as application/pdf, then stores resume_path on the own profile row', async () => {
  const { client, log } = fakeClient();
  const pdf = file();
  const result = await createResumeApi(client).uploadResume('u-1', pdf);
  assert.deepEqual(result, { path: 'u-1/resume.pdf', error: null });
  assert.deepEqual(log, [
    ['upload', 'resumes', 'u-1/resume.pdf', pdf, { upsert: true, contentType: 'application/pdf' }],
    ['update', 'profiles', { resume_path: 'u-1/resume.pdf' }, 'id', 'u-1'],
  ]);
});

test('uploadResume: a failed upload stops before the profile write; a failed profile write is returned', async () => {
  const failedUpload = fakeClient({ upload: { data: null, error: { message: 'Bucket not found' } } });
  const first = await createResumeApi(failedUpload.client).uploadResume('u-1', file());
  assert.equal(first.path, null);
  assert.equal(first.error.message, 'Bucket not found');
  assert.equal(failedUpload.log.length, 1);
  const failedUpdate = fakeClient({ update: { error: { message: 'denied' } } });
  const second = await createResumeApi(failedUpdate.client).uploadResume('u-1', file());
  assert.equal(second.error.message, 'denied');
  assert.equal(second.path, null);
});

test('uploadResume: a throwing client is an error result, never a rejection', async () => {
  const client = { storage: { from: () => ({ upload: async () => { throw new Error('offline'); } }) } };
  const result = await createResumeApi(client).uploadResume('u-1', file());
  assert.equal(result.error.message, 'offline');
  assert.deepEqual(await createResumeApi(null).uploadResume('u-1', file()), { path: null, error: new Error('Supabase is not configured.') });
});

test('removeResume removes the object, then sets resume_path to null; a failed remove leaves the row alone', async () => {
  const { client, log } = fakeClient();
  assert.deepEqual(await createResumeApi(client).removeResume('u-1'), { error: null });
  assert.deepEqual(log, [['remove', 'resumes', ['u-1/resume.pdf']], ['update', 'profiles', { resume_path: null }, 'id', 'u-1']]);
  const failing = fakeClient({ remove: { data: null, error: { message: 'network' } } });
  const result = await createResumeApi(failing.client).removeResume('u-1');
  assert.equal(result.error.message, 'network');
  assert.equal(failing.log.length, 1);
});

test('resumeSignedUrl signs for 60 seconds by default', async () => {
  const { client, log } = fakeClient();
  assert.deepEqual(await createResumeApi(client).resumeSignedUrl('u-1/resume.pdf'), { url: 'https://x/sign?token=t', error: null });
  await createResumeApi(client).resumeSignedUrl('u-1/resume.pdf', 30);
  assert.deepEqual(log, [['sign', 'resumes', 'u-1/resume.pdf', 60], ['sign', 'resumes', 'u-1/resume.pdf', 30]]);
  const failing = fakeClient({ sign: { data: null, error: { message: 'Object not found' } } });
  const result = await createResumeApi(failing.client).resumeSignedUrl('u-1/resume.pdf');
  assert.equal(result.url, null);
  assert.equal(result.error.message, 'Object not found');
});

test('resumeInfo reads size and updated time of the own file only', async () => {
  const { client, log } = fakeClient({ list: { data: [{ name: 'resume.pdf', id: 'x', updated_at: '2026-10-21T09:00:00Z', metadata: { size: 1258291 } }], error: null } });
  assert.deepEqual(await createResumeApi(client).resumeInfo('u-1'), { info: { size: 1258291, updatedAt: '2026-10-21T09:00:00Z' }, error: null });
  assert.deepEqual(log, [['list', 'resumes', 'u-1', { limit: 10, search: 'resume.pdf' }]]);
  const none = fakeClient({ list: { data: [{ name: 'resume.pdf.old', id: 'y', metadata: { size: 3 } }], error: null } });
  assert.deepEqual(await createResumeApi(none.client).resumeInfo('u-1'), { info: null, error: null });
  const missing = fakeClient({ list: { data: null, error: { message: 'Bucket not found' } } });
  const result = await createResumeApi(missing.client).resumeInfo('u-1');
  assert.equal(result.info, null);
  assert.equal(isMissingResumeStore(result.error), true);
});
