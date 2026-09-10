# Agent skills

Procedural knowledge for AI agents. Each skill's `description` is read on every turn to decide
relevance; the body loads only when that description matches the task. The always-on cost of those
descriptions is tracked in `AGENTS.md`.

## Active skills (`.agents/skills/`)

Kindling keeps **all** of these active — fourteen skills, including template extras that other
projects leave opt-in, plus the host-only `game-capture` skill. That is a deliberate choice.
Demoting any of them means moving the folder into `.agents/skills-extras/` and correcting the
always-on count in `AGENTS.md`.

### Core (from DevEnvTemplate)

| Skill | Trigger |
| ----- | ------- |
| [agent-workflow](skills/agent-workflow/SKILL.md) | Any end-to-end coding task in the repo |
| [multi-agent-collaboration](skills/multi-agent-collaboration/SKILL.md) | More than one agent or person in the same tree |
| [plan-first](skills/plan-first/SKILL.md) | Multi-file or architectural work |
| [secure-coding](skills/secure-coding/SKILL.md) | Input, secrets, auth, or dependencies |
| [token-efficient-context](skills/token-efficient-context/SKILL.md) | Planning multi-file work, agent runs, tokens, MCP, or editing rules/skills/AGENTS.md |
| [verification-evidence](skills/verification-evidence/SKILL.md) | Audits, health checks, guard tests, CI gates |

### Template extras (active here)

In DevEnvTemplate these live under `.agents/skills-extras/` and are not copied by default. Here they
are under `.agents/skills/` so they stay offered every turn.

| Skill | Trigger |
| ----- | ------- |
| [automation-standards](skills/automation-standards/SKILL.md) | Automation driving external tools, APIs, or CI |
| [code-structure](skills/code-structure/SKILL.md) | Modules, naming, file layout, performance budgets |
| [data-pipeline-safety](skills/data-pipeline-safety/SKILL.md) | Author-owned databases, CMS, infra state, binaries |
| [debug-instrumentation](skills/debug-instrumentation/SKILL.md) | New features, scripts, or APIs needing trace logs |
| [defensive-programming](skills/defensive-programming/SKILL.md) | External input, I/O, network, async concurrency |
| [documentation](skills/documentation/SKILL.md) | Comments, README, or anything under `docs/` |
| [testing-standards](skills/testing-standards/SKILL.md) | Adding or updating tests or test frameworks |

### Host-only

| Skill | Trigger |
| ----- | ------- |
| [game-capture](skills/game-capture/SKILL.md) | Screenshot lanes, step plans, Cursor browser race |

`exclusive-resource-access` from the template is not adopted; `game-capture` covers the exclusive
browser/lane problem for this project.

## Extras shelf (`.agents/skills-extras/`)

Empty on purpose. Move a skill here when you want it dormant: agents only load skills under
`.agents/skills/`. After a move, update the skill count and token budget in `AGENTS.md`.

## Sync from the template

```powershell
npm run sync                 # dry run
npm run sync '--' --apply    # copy missing allowlisted files; never overwrites localized ones
```

`AGENTS.md` is never overwritten by sync. Review template changes manually when working agreements
need updating.

## Portability

Skills copied from DevEnvTemplate travel verbatim. Sections marked **Localize on copy** describe
the template's commands and layout — rewrite those for this project.
