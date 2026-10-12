# Phase B: Landing Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The landing page looks exactly the same but shows its first screen in under 2.5 s on a mid-range phone over 4G, never looks stuck, and ships under 3 MB initially.

**Architecture:** A reproducible media script writes optimized copies (WebP images, 1080p/720p H.264 videos, WebP posters) under `media/`; a codemod repoints references; small pure helpers decide intro and video behaviour; a budget checker and a new landing e2e suite guard the result. Originals stay in `Images/` and `assets/` untouched as source.

**Tech Stack:** Vite, vanilla JS, `sharp` (devDependency), system `ffmpeg` (`/usr/bin/ffmpeg`), `@fontsource/instrument-sans` + `@fontsource/bodoni-moda`, Playwright e2e, Lighthouse via `npx lighthouse` with `CHROME_PATH=/opt/pw-browsers/chromium`.

**Spec:** `docs/superpowers/specs/2026-10-12-experience-iteration-design.md` §2 (app skeletons from §2.4 move to Phase C, which owns the app views)

## Global Constraints

- Visual parity: same images, crops, colours, layout. Founder approves a side-by-side before/after (1440 px and 375 px landing screenshots) before the push.
- Delivered image ≤ 400 KB; delivered video ≤ 5 MB; landing initial transfer (no scroll, until `load` + 2 s idle) < 3 MB.
- Targets: LCP < 2.5 s, CLS < 0.1, Lighthouse performance ≥ 90 (mobile, simulated 4G).
- Images: WebP at displayed size, default max width 1600 px, quality 78 (AVIF is not used: WebP alone meets the budget with one code path; deviation from spec §2.3 noted in D-054).
- Hero video: 1080p ≤ 3 MB and 720p ≤ 1.5 MB, H.264 `+faststart`, no 4K delivered.
- `prefers-reduced-motion: reduce` or `navigator.connection.saveData` → posters only, no video requests.
- Intro: first visit only (`localStorage` key `brivia-intro-seen`), hard cap 2500 ms, fades out if the video has not started playing within 800 ms, never blocks clicks on the page.
- Do not change landing copy or structure (Yashika's design).

## Review Focus

- A slow or failed video request: the poster must remain and the page must not show a blank/black hero.
- iOS Safari autoplay: muted + `playsinline` must be kept on every video the codemod touches.
- A returning visitor (intro already seen) in a new tab: no intro flash at all.
- Lazy images in the first viewport at 375 px must NOT be lazy (they are LCP candidates): only below-fold images get `loading="lazy"`.
- CSS `url(...)` references (cover images, chat backgrounds) must be repointed too, or they keep shipping the 2–3 MB PNGs.

---

### Task 1: Asset budget checker

**Files:**
- Create: `scripts/asset-budget.js` (pure), `scripts/check-asset-budget.mjs` (CLI over `dist/`)
- Modify: `package.json` (script `"check:assets": "node scripts/check-asset-budget.mjs"`)
- Test: `tests/unit/asset-budget.test.mjs`

**Interfaces:**
- Produces: `checkAssetBudget(files: {path: string, bytes: number}[], limits = { imageBytes: 409600, videoBytes: 5242880 }) => { ok: boolean, violations: {path, bytes, limit}[] }` — image = `.png .jpg .jpeg .webp .avif .gif`, video = `.mp4 .webm .mov`, case-insensitive.

- [ ] **Step 1: Write failing tests:** `flags an image over 400 KB`, `flags a video over 5 MB`, `ignores js/css/fonts`, `extension match is case-insensitive (.PNG)`, `ok is true when nothing exceeds`.
- [ ] **Step 2: Run** `node --test tests/unit/asset-budget.test.mjs` — FAIL (module missing).
- [ ] **Step 3: Implement** `checkAssetBudget`; the CLI walks `dist/assets`, prints a table of violations, exits 1 on any.
- [ ] **Step 4: Run** unit tests — PASS; `npm run build && npm run check:assets` — exits 1 listing the 45 MB/9.3 MB videos and 2–3 MB PNGs (expected red until Task 2).
- [ ] **Step 5: Commit** `feat(perf): asset budget checker (Phase B)`.

### Task 2: Optimized media and repointed references

**Files:**
- Create: `scripts/optimize-media.mjs`, `scripts/repoint-media.mjs`, `media/**` (generated, committed)
- Modify: `package.json` (devDependency `sharp`; scripts `media:build`, `media:repoint`), `index.html`, every HTML/CSS/JS file that references `/Images/...` or `./assets/*.{png,jpg,jpeg,PNG,mp4}` (found by the repoint script)
- Test: `tests/unit/repoint-media.test.mjs`

**Interfaces:**
- Consumes: `checkAssetBudget` (Task 1) via `npm run check:assets`.
- Produces: `repointReferences(text: string, map: Record<string,string>) => string` (exported from `scripts/repoint-media.mjs`); media map file `media/manifest.json` `{ "<original ref>": "<optimized ref>" }`; posters at `media/posters/<video-name>.webp`.

- [ ] **Step 1: Write failing tests** for `repointReferences`: replaces `/Images/CONNECT.PNG` in an `<img src>`, in a CSS `url("/Images/Cover%20images/X.PNG")` (URL-encoded spaces), and in a JS string; leaves unknown paths untouched; never rewrites inside `media/`.
- [ ] **Step 2: Run** the test — FAIL.
- [ ] **Step 3: Implement `optimize-media.mjs`:** for every image referenced by the site (scan HTML/CSS/JS for `/Images/` and `./assets/` image refs), write `media/<same relative path>.webp` (max width 1600, q78; keep alpha for cutouts like `vintage-phone-cutout.png`); for videos write `media/video/<name>-1080.mp4` (`-vf scale=-2:1080 -c:v libx264 -crf 28 -preset slow -movflags +faststart -an` unless the source has audio the page uses — keep audio for `hero` and playground if present, AAC 96k), `<name>-720.mp4` (crf 30) and a WebP poster from the first frame; write `media/manifest.json`. Skip unchanged outputs (mtime) so reruns are fast.
- [ ] **Step 4: Implement `repoint-media.mjs`** (`repointReferences` + a CLI that rewrites files in place from the manifest) and run `npm run media:build && npm run media:repoint`.
- [ ] **Step 5: Edit `index.html` hero:** drop the `hero-section-video-4k.mp4` `<source>`; `<source media="(min-width: 701px)" src=".../hero-section-video-1080.mp4">`, default `720`; `poster` set on every `<video>`.
- [ ] **Step 6: Run** unit tests — PASS; `npm run build && npm run check:assets` — exit 0.
- [ ] **Step 7: Visual parity:** screenshot the landing (1440 and 375, top + each section) before (`git stash`) and after; save to the scratchpad and show the founder. Stop here until the founder OKs the look.
- [ ] **Step 8: Commit** `perf(landing): optimized images and videos, references repointed (Phase B)`.

### Task 3: Intro, video start and lazy loading

**Files:**
- Create: `landing-motion.js` (pure helpers)
- Modify: `script.js` (intro block lines 25–50 and the landing video/music block), `index.html` (`loading`, `decoding`, `width`/`height`, `preload`)
- Test: `tests/unit/landing-motion.test.mjs`, `tests/e2e/landing.spec.mjs` (new, port `E2E_PORT || 5196`)

**Interfaces:**
- Produces: `motionAllowed({ reducedMotion: boolean, saveData: boolean }) => boolean`; `introPlan({ seenBefore: boolean, fromAuth: boolean }) => 'skip' | 'play'`; `INTRO_CAP_MS = 2500`, `INTRO_START_GRACE_MS = 800`.

- [ ] **Step 1: Write failing unit tests:** `motionAllowed` false for reduced motion, false for save-data, true otherwise; `introPlan` skips when seen before or arriving from auth, plays on a first visit.
- [ ] **Step 2: Write the failing landing e2e** (static `vite preview` of `dist`, no Supabase needed; stub external fonts/requests): checks `first paint shows the hero poster (no black hero)`, `intro gone within 2600 ms on first visit`, `no intro on second visit (localStorage)`, `reduced motion: zero .mp4 requests`, `initial transfer under 3 MB before scroll`, `CLS under 0.1 after load + 2 s`, `no request for the app bundle (app-*.js) on the landing`, `below-fold images load only after scrolling near them`, at 375 and 1440.
- [ ] **Step 3: Run both** — FAIL.
- [ ] **Step 4: Implement:** `landing-motion.js`; in `script.js` use `introPlan` with `localStorage` (try/catch), cap with `INTRO_CAP_MS`, fade if `introVideo.currentTime === 0` after `INTRO_START_GRACE_MS`; hero and playground videos `preload="none"`, start via `requestIdleCallback` (fallback `setTimeout 1200`) for the hero and `IntersectionObserver` (rootMargin `200px`) for below-fold videos, only when `motionAllowed`; `index.html` below-fold `<img>` get `loading="lazy" decoding="async"` plus intrinsic `width`/`height` (from the WebP dimensions); first-viewport images stay eager with `fetchpriority="high"` on the LCP image.
- [ ] **Step 5: Run** unit + landing e2e — PASS; existing three e2e suites still PASS.
- [ ] **Step 6: Commit** `perf(landing): intro cap, deferred video, lazy images, landing e2e (Phase B)`.

### Task 4: Skeleton shimmer, fonts, caching, Lighthouse

**Files:**
- Create: `skeleton.css` (landing + shared `.skeleton` utility), `fonts.css`
- Modify: `index.html`, `auth.html`, `app.html`, `privacy.html`, `careers.html` (drop Google Fonts `<link>`s, import `fonts.css`), entry JS files importing `fonts.css`/`skeleton.css`, `vercel.json` (headers), `package.json` (deps `@fontsource/instrument-sans`, `@fontsource/bodoni-moda`)
- Test: extend `tests/e2e/landing.spec.mjs`

**Interfaces:**
- Produces: CSS class `.skeleton` (brand shimmer: base `#efe4dc`, highlight `#f7efe9`, 1.4 s; static under reduced motion) and `.is-loaded` removal convention: an image wrapper with `.skeleton` drops it on the image `load` event (helper `markLoaded(img)` in `landing-motion.js`). Phase C reuses `.skeleton` for app views.

- [ ] **Step 1: Write failing e2e checks:** `image cards show the skeleton tint until loaded`, `no request to fonts.googleapis.com`, `heading font is preloaded (link rel=preload as=font)`, and a header check on the built output: `vercel.json sets Cache-Control "public, max-age=31536000, immutable" for /assets/(.*)` (unit-style JSON assertion in `tests/unit/asset-budget.test.mjs`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the above; self-hosted weights only those used (Instrument Sans 500/600/700 + italic 700; Bodoni Moda 500).
- [ ] **Step 4: Run** all tests — PASS. Run Lighthouse mobile on `vite preview`: `npx lighthouse http://127.0.0.1:4173/ --preset=perf --form-factor=mobile --chrome-flags="--headless" --output=json` with `CHROME_PATH=/opt/pw-browsers/chromium`; record performance score, LCP, CLS in D-054. Target ≥ 90 / < 2.5 s / < 0.1; if below, note the top remaining Lighthouse opportunity and fix within this task.
- [ ] **Step 5: Full gate** + `npm run check:assets`; append D-054 (Phase B results, WebP-only deviation, measured numbers) to `docs/DECISIONS.md`; update `docs/HANDOFF.md`.
- [ ] **Step 6: Commit and push** `perf(landing): skeletons, self-hosted fonts, long cache; D-054 (Phase B)`; then ask the founder to OK fast-forwarding `main`.
