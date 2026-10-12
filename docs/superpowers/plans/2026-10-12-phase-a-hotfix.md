# Phase A: Signup Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three signup defects the founder screenshotted on 2026-10-12, each pinned by an e2e geometry/contrast check at 375 px and 1440 px.

**Architecture:** CSS-only fixes appended to `auth-a11y.css` (loaded last on `auth.html`, so it wins without `!important` wars where specificity allows), plus one new e2e block in the existing stubbed onboarding suite.

**Tech Stack:** Vite, vanilla CSS, Playwright + axe-core e2e (`tests/e2e/onboarding.spec.mjs`, Playwright at `/tmp/pw`).

**Spec:** `docs/superpowers/specs/2026-10-12-experience-iteration-design.md` §5.1

## Global Constraints

- Keep the deep-wine brand: wine `#5e0b28` (`--a11y-wine`), soft ink `#5f5651` (`--a11y-ink-soft`), cream panel. No new colours.
- Visible text ≥ 12 px, axe colour-contrast clean (existing `a11y.mjs` helpers).
- Do not touch `index.html` or landing CSS.
- Gate before push: `bash supabase/tests/run.sh`, `npm run build`, `npm run test:unit`, `(cd orbit && npm test)`, all three e2e suites (one at a time, fixed ports).

## Review Focus

- The success panel is shown after a real email-confirmation signup at 375 px: title and message must pass axe contrast, not just be "not white".
- Back/Create at intermediate widths (1024, 1280) where the two-column action grid is active: the boxes must not intersect.
- "PREFER NOT TO SAY" wraps to 2–3 lines: all three gender tiles must still share one width and one height in the row.
- Focus ring on a checked gender tile must stay visible (keyboard users).
- Dark-on-dark regression: the fix must not make the success panel unreadable in the dark auth variant (`.auth-panel` dark backgrounds) if one is active.

---

### Task 1: Three signup fixes with geometry and contrast tests

**Files:**
- Modify: `auth-a11y.css` (append a "Hotfix 2026-10-12" section)
- Test: `tests/e2e/onboarding.spec.mjs` (new block 14 before the harness `catch`)

**Interfaces:**
- Consumes: existing e2e helpers `stubContext`, `newPage`, `openSignup`, `fillStepOne`, `pickCityByKeyboard`, `clickInterest`, `finishStepFour`, `axeViolations`.
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the failing e2e block** `// 14. Founder screenshots 2026-10-12` that, for each viewport in `[375, 1024, 1440]`:
  - on step 1 measures `.gender-option span` boxes and checks `gender: three tiles share one width (±1 px) and one height (±1 px) at ${w}` (at 375 the tiles stack, so check equal width and equal height only);
  - drives a session-less signup to `#auth-success:not([hidden])` and checks `success: title and message pass axe color-contrast at ${w}` (`axeViolations(page, { rules: ['color-contrast'], include: ['#auth-success'] })` is empty) and that the computed `color` of `[data-auth-success-title]` is not `rgb(255, 250, 241)`;
  - on step 4 measures `.signup-step-actions` children and checks `actions: Back and Create do not overlap at ${w}` (rectangles do not intersect; both fully inside the action container).
- [ ] **Step 2: Run** `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/onboarding.spec.mjs` — expect the new success-contrast checks to FAIL (and gender/actions to FAIL at the widths the screenshots show; if a check unexpectedly passes, widen its viewport list until it reproduces the screenshot before fixing).
- [ ] **Step 3: Fix in `auth-a11y.css`:**
  - success panel: `body.auth-page .auth-panel .auth-success h2, … p` → `color: var(--a11y-wine)` for the title and `var(--a11y-ink-soft)` for the message; credential row border `rgba(94,11,40,.2)`, background `rgba(94,11,40,.04)`;
  - gender: `.gender-options { grid-template-columns: repeat(3, minmax(0,1fr)); align-items: stretch }`, `.gender-option { display:flex }`, `.gender-option span { flex:1; width:100%; min-height:48px; box-sizing:border-box }`; ≤480 px keep one column;
  - actions: `.signup-step-actions { grid-template-columns: minmax(0,1fr) minmax(0,1fr) }` with both buttons `width:100%; min-width:0; max-width:100%`, label `overflow-wrap:anywhere`; ≤780 px stack to one column with Create first (`order`).
- [ ] **Step 4: Re-run the onboarding e2e** — expect all checks PASS (219 existing + new ones), no axe regressions.
- [ ] **Step 5: Full gate** (Global Constraints) — all green.
- [ ] **Step 6: Commit and push**

```bash
git add auth-a11y.css tests/e2e/onboarding.spec.mjs
git commit -m "fix(signup): gender tiles, success text contrast, Back/Create overlap (Phase A)"
git push -u origin claude/jolly-edison-49xvza
```
