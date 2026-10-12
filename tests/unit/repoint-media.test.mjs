// Media codemod (Phase B landing speed). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { repointReferences } from '../../scripts/repoint-media.mjs';

const map = {
  '/Images/CONNECT.PNG': '/media/Images/CONNECT.webp',
  '/Images/Cover images/X.PNG': '/media/Images/Cover images/X.webp',
  '/assets/guitar-premium.png': '/media/assets/guitar-premium.webp',
  '/assets/hero-section-video.mp4': '/media/video/hero-section-video-720.mp4',
};

test('replaces /Images/CONNECT.PNG in an <img src>', () => {
  assert.equal(
    repointReferences('<img src="/Images/CONNECT.PNG" alt="" />', map),
    '<img src="/media/Images/CONNECT.webp" alt="" />',
  );
});

test('replaces a CSS url() with URL-encoded spaces, keeping the encoding', () => {
  assert.equal(
    repointReferences('background: url("/Images/Cover%20images/X.PNG") center;', map),
    'background: url("/media/Images/Cover%20images/X.webp") center;',
  );
});

test('replaces a relative ./assets ref in an unquoted CSS url(), keeping it relative', () => {
  assert.equal(repointReferences('url(./assets/guitar-premium.png)', map), 'url(./media/assets/guitar-premium.webp)');
});

test('replaces a JS string, including an import with literal spaces', () => {
  assert.equal(
    repointReferences("const a = './assets/guitar-premium.png';\nimport x from './Images/Cover images/X.PNG';", map),
    "const a = './media/assets/guitar-premium.webp';\nimport x from './media/Images/Cover images/X.webp';",
  );
});

test('replaces a video <source src>', () => {
  assert.equal(
    repointReferences('<source src="./assets/hero-section-video.mp4" type="video/mp4" />', map),
    '<source src="./media/video/hero-section-video-720.mp4" type="video/mp4" />',
  );
});

test('leaves unknown paths untouched', () => {
  const text = '<img src="/Images/UNKNOWN.PNG" /> url(./assets/other.png) "/Images/CONNECT.PNG.bak" "/Images/CONNECT.PNGX"';
  assert.equal(repointReferences(text, map), text);
});

test('never rewrites inside media/ (idempotent)', () => {
  const once = repointReferences('<img src="/Images/CONNECT.PNG" /> url(./assets/guitar-premium.png)', map);
  assert.equal(repointReferences(once, map), once);
  const already = '<img src="/media/Images/CONNECT.PNG" /> url(./media/assets/guitar-premium.png)';
  assert.equal(repointReferences(already, map), already);
});

test('never rewrites stored identifiers (data-* and value attributes), only where files load', () => {
  const html = '<input type="hidden" value="/Images/Cover%20images/X.PNG" />'
    + '<button data-cover-option="/Images/Cover%20images/X.PNG"><img src="/Images/Cover%20images/X.PNG" /></button>';
  assert.equal(
    repointReferences(html, map),
    '<input type="hidden" value="/Images/Cover%20images/X.PNG" />'
    + '<button data-cover-option="/Images/Cover%20images/X.PNG"><img src="/media/Images/Cover%20images/X.webp" /></button>',
  );
});
