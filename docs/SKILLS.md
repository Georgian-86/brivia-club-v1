# Required Claude Code skills

**Status: NOT INSTALLED YET.** On 2026-10-02 the automated install was blocked by the session's permission policy,
because copying third-party skill code into the repo and running the GSD installer counts as integrating untrusted
code. A human must approve it. Every session should check for the skills and **ask the user** before installing them.

## Why install into the repo

Project skills live in `.claude/skills/<name>/SKILL.md` inside this repo. Once they are committed, every Claude Code
session that opens the repo (cloud or local, new or resumed) loads them automatically, with no re-download. That is
how we meet the "don't reinstall per session" goal. Pin each source to a reviewed commit.

## Manifest

| Skill(s) | Source | Path in source | Pinned commit (reviewed 2026-10-02) |
|---|---|---|---|
| superpowers: brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, verification-before-completion, requesting/receiving-code-review, subagent-driven-development, dispatching-parallel-agents, using-git-worktrees, finishing-a-development-branch, writing-skills, using-superpowers | `github.com/obra/superpowers` | `skills/*` | `8ca22db` |
| webapp-testing, brand-guidelines, frontend-design, skill-creator | `github.com/anthropics/skills` | `skills/<name>` | `8a1541c` |
| ui-ux-pro-max (+ design-system) | `github.com/nextlevelbuilder/ui-ux-pro-max-skill` | `.claude/skills/ui-ux-pro-max`, `.claude/skills/design-system` | `09170ee` |
| agent-arena (+ deliberative-analysis): the "arena" skill | `github.com/zhjai/agent-arena` | `skills/*` | `cdbaa7e` |
| software-architecture | `github.com/davila7/claude-code-templates` (originally NeoLabHQ/context-engineering-kit) | `cli-tool/components/skills/development/software-architecture/SKILL.md` | `main` |
| GSD (get-shit-done) | npm `get-shit-done-cc` / `github.com/gsd-build/get-shit-done` | installer | `bdcaab2` |

Notes:

- `ui-ux-pro-max` refers to `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...`. When vendored as a project skill, replace
  that with `${CLAUDE_PROJECT_DIR:-.}/.claude/skills/...`. It needs `python3` (no extra packages).
- "Arena" is ambiguous. The skill chosen is `zhjai/agent-arena` (evidence-first multi-agent debate, which fits
  "analyze and rate the engine"). Change it here if a different arena skill was meant.
- GSD is installed by its own installer: `npx get-shit-done-cc --claude --local --profile=standard`. That writes into
  `.claude/` (commands, agents, hooks, settings). Review the diff before committing it.

## Install (run only after the user approves)

```bash
T=$(mktemp -d); D=.claude/skills; mkdir -p $D
git clone -q https://github.com/obra/superpowers $T/sp && git -C $T/sp checkout -q 8ca22db && cp -r $T/sp/skills/* $D/
git clone -q https://github.com/anthropics/skills $T/an && git -C $T/an checkout -q 8a1541c && \
  for s in webapp-testing brand-guidelines frontend-design skill-creator; do cp -r $T/an/skills/$s $D/; done
git clone -q https://github.com/nextlevelbuilder/ui-ux-pro-max-skill $T/ux && git -C $T/ux checkout -q 09170ee && \
  cp -r $T/ux/.claude/skills/{ui-ux-pro-max,design-system} $D/ && \
  sed -i 's#\${CLAUDE_PLUGIN_ROOT}/\.claude/skills/#${CLAUDE_PROJECT_DIR:-.}/.claude/skills/#g' $D/ui-ux-pro-max/SKILL.md $D/design-system/SKILL.md
git clone -q https://github.com/zhjai/agent-arena $T/ar && git -C $T/ar checkout -q cdbaa7e && cp -r $T/ar/skills/* $D/
mkdir -p $D/software-architecture && curl -fsSL https://raw.githubusercontent.com/davila7/claude-code-templates/main/cli-tool/components/skills/development/software-architecture/SKILL.md -o $D/software-architecture/SKILL.md
npx -y get-shit-done-cc@latest --claude --local --profile=standard
git add .claude && git status --short .claude | head
```

After installing, update the **Status** line at the top of this file, commit, and push. Future sessions then get the
skills from git.
