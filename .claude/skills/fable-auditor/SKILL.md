---
name: fable-auditor
description: Run a task with Claude Fable 5.2 as the auditor and Opus 5.5 / Sonnet 5.5 subagents as the workers, to spend Fable's tokens only on planning and judgment. Fable plans, writes a tight brief per task, delegates every artifact (code, SQL, tests, docs) to an Opus or Sonnet worker, then audits each result against a failable check and returns PASS, FIX or ESCALATE. Use when the user says "fable audit", "fable as auditor", "delegate to opus and sonnet", "save tokens", or invokes /fable-auditor, and for multi-task plans in docs/superpowers/plans/. Not for one-pass tasks with one obvious answer: do those directly.
---

# Fable auditor

Fable 5.2 is the most capable and most expensive tier. This skill keeps it on the work only it does best (planning,
judging, catching what workers missed) and moves the token-heavy reading and writing down to Opus 5.5 and Sonnet 5.5.

Invoking this skill by name or slash command is the user's request to spawn subagents.

## Who does what

| Role | Model | Agent call | Gets |
|---|---|---|---|
| Auditor and planner | **Fable 5.2** | the main session, or `model: "fable"` (see Setup) | plan, briefs, every verdict, escalations |
| Hard worker | **Opus 5.5** | `subagent_type: "general-purpose"`, `model: "opus"` | ORBIT engine and ranking, SQL migrations and RLS, privacy and location code, security-sensitive work, cross-file refactors, anything a Sonnet worker failed once |
| Routine worker | **Sonnet 5.5** | `subagent_type: "general-purpose"`, `model: "sonnet"` | contained UI and CSS changes, tests from a clear spec, docs, copy, mechanical edits, read-only searches and log or test-output triage, cold verification |

Pick the cheapest tier that can verifiably do the task. Do not give Sonnet `max` effort: if a task needs it, use Opus.

## Setup

1. Check which model runs the main session (`get_session`, or the session's model line).
   - **On Fable:** the main session is the auditor. Go to the loop.
   - **On Opus or Sonnet:** say once that the cheapest setup is `/model fable` for the main session. If the user
     stays put, the main session coordinates and you spawn a Fable auditor (`subagent_type: "general-purpose"`,
     `model: "fable"`) only at the two judgment points, plan review and the final audit, each with a compact packet
     (below), never the whole conversation.
   - If the Agent tool rejects `model: "fable"`, say so and let Opus do the audit. Do not pretend Fable ran.
2. Read `CLAUDE.md` and the relevant `docs/` file once, in the auditor. Workers get only the rules that apply to
   their task, pasted into the brief.

## The loop

**1. Plan (auditor).** Split the work into numbered tasks. Each task has one artifact and one check that can fail:
a test that runs, a grep that must return nothing, a build, a diff limited to named files. If a task has no failable
check, merge it into one that does. Mark each task Opus or Sonnet using the table. If a plan already exists in
`docs/superpowers/plans/`, use it instead of writing a new one.

**2. Brief (auditor).** One brief per task, under about 300 words:
- the goal in one sentence, and the files to touch (repo-relative paths);
- acceptance checks, as exact commands;
- the rules that apply, pasted verbatim (for example: update `docs/ORBIT_ENGINE.md` in the same commit as engine
  behaviour; never expose exact coordinates, email or phone to other members; never edit migrations 0001–0004;
  keep the deep-wine brand);
- the TDD instruction: write or extend the test first and see it fail;
- "Do not spawn subagents. Do not commit or push."
- the report format below.

Brief the task, not the method. Do not paste whole files; name them and let the worker read them.

**3. Delegate.** Launch independent tasks in parallel in one message, at most four workers at once. Run dependent
tasks in order. Run workers in the foreground when the next step needs their result.

**4. Worker report (required format, under about 250 words).**
```
STATUS: done | blocked
CHANGED: <file>: <one line on what changed>
CHECKS: <command> -> pass | fail (paste only failing lines)
JUDGMENT CALLS: <anything decided without being told>
OPEN: <anything left undone or out of scope>
```
No full file contents and no full test logs in the report. The auditor reads the diff, not the narrative.

**5. Audit (auditor).** For each task:
- run the acceptance checks yourself (`git diff --stat`, then `git diff -- <files>` only for the files that matter,
  the named tests). A worker's "pass" is a claim, not evidence;
- check the judgment calls against the rules and the product aim in `CLAUDE.md`;
- give one verdict:
  - **PASS**: the check ran green and the diff stays inside the brief.
  - **FIX**: send the same worker (SendMessage, so it keeps its context) an exact, numbered list of what to change.
    One FIX round per task at the same tier.
  - **ESCALATE**: the FIX round failed, or the task is harder than planned. Sonnet goes to Opus, Opus comes back to
    the auditor, and the auditor goes to the user. Never retry the same tier with a louder prompt.

**6. Final audit (auditor).** When every task has passed, run the full suites the change touches
(`npm run test:unit`, `cd orbit && npm test`, `bash supabase/tests/run.sh`, `npm run build`, the e2e spec that covers
the UI change), then review the whole diff once for seams between tasks. For a significant product or architecture
decision, the project rule still applies: run agent-arena and record the outcome in `docs/DECISIONS.md`.

**7. Deliver.** Tell the user what changed, which checks ran and their results, every judgment call, and anything
left unverified or out of scope. Report failures as failures.

## Compact packet (when Fable runs as a spawned auditor)

Send only: the goal, the plan with task statuses, `git diff --stat`, the diffs of the files that carry risk, the
check output (failing lines only), each worker's JUDGMENT CALLS, and the rules from `CLAUDE.md` that apply. Ask for a
PASS, FIX or ESCALATE verdict per task in under about 300 words.

## Where the tokens go

- The auditor never reads large files or full logs. It reads diffs, stats and failing lines.
- Workers read the codebase; the auditor reads their reports.
- Briefs name files instead of pasting them.
- Parallel workers for independent tasks; one fix round, then escalation instead of loops.
- Skip the loop for a single-pass task with one obvious answer: the plan and audit would cost more than the task.
