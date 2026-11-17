## What and why

<!-- One or two sentences. Link the decision (D-NNN) if this is a significant product or architecture change. -->

## How it was checked

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `npm run test:orbit` passes (if `orbit/` changed)
- [ ] `bash supabase/tests/run.sh` passes (if SQL changed)
- [ ] Relevant e2e spec run (if UI changed), with screenshots at 390 px and 1440 px

## Ships with

- [ ] No SQL / SQL migration `NNNN_*.sql` (and its entry in `supabase/migrations/README.md`)
- [ ] Edge Function redeploy needed: <!-- name or none -->
- [ ] `docs/ORBIT_ENGINE.md` updated in this PR (if matching, ranking, search or location behaviour changed)
- [ ] `docs/DECISIONS.md` and `docs/HANDOFF.md` updated
