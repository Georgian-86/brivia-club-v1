# Third-party licenses for vendored Claude Code tooling

The files under `.claude/skills/`, `.claude/linkedin-skills/`, `.claude/commands/`, `.claude/agents/` and `.claude/get-shit-done/` are third-party
tooling vendored per `docs/SKILLS.md`. They are not part of the ORBIT engine and are not covered by its copyright.

| Component | Source | License |
|---|---|---|
| superpowers skills (brainstorming, writing-plans, …) | github.com/obra/superpowers @8ca22db | MIT, `superpowers-MIT.txt` |
| ui-ux-pro-max, design-system | github.com/nextlevelbuilder/ui-ux-pro-max-skill @09170ee | MIT, `ui-ux-pro-max-MIT.txt` |
| agent-arena, deliberative-analysis | github.com/zhjai/agent-arena @cdbaa7e | MIT, `agent-arena-MIT.txt` (also in each skill folder) |
| GSD commands, agents, workflows | github.com/gsd-build/get-shit-done @bdcaab2 | MIT, `get-shit-done-MIT.txt` |
| software-architecture | github.com/davila7/claude-code-templates | `claude-code-templates.txt` |
| webapp-testing, brand-guidelines, frontend-design, skill-creator | github.com/anthropics/skills @8a1541c | Apache-2.0, `LICENSE.txt` in each skill folder |
| linkedin-marketing + 12 `linkedin-*` skills, `.claude/linkedin-skills/` runtime | github.com/sergebulaev/linkedin-skills @8f8bc4b | MIT, `linkedin-skills-MIT.txt` (also `.claude/linkedin-skills/LICENSE`) |

`fable-auditor` is original to this repo, not third-party.
