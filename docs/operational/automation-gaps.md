# Automation gaps

**Purpose:** track things that **cannot** be driven reliably through an API, CLI, or stable automation hook — so the workaround stays visible instead of being rediscovered the hard way.

Procedure: [automation-standards.mdc](../../.cursor/rules/automation-standards.mdc) (identify → verify access → document → re-check on upgrade).

| Field | Description |
|-------|-------------|
| **Date** | YYYY-MM-DD |
| **Feature / area** | What we tried to automate |
| **What is needed** | The required outcome, in one sentence |
| **Why automation fails** | API gap, shared resource, vendor limit |
| **Interim** | The workaround we actually use |
| **Suggested follow-up** | What would close the gap |

---

## Screenshots cannot go through the shared IDE browser

- **Date:** 2026-09-07
- **Feature / area:** capturing the running game for visual verification, with several agents working at once.
- **What is needed:** any number of agents able to screenshot the game concurrently, without coordinating with each other.
- **Why automation fails:** the `cursor-ide-browser` MCP tools drive a **single shared tab**. There is no per-agent isolation and no lock that concurrent agents can honour, so they contend for one resource. Worse, the contention is **silent** — three agents once hung for 46 minutes with no error and no output, so an agent cannot even detect that it is blocked.
- **Interim:** `scripts/agent-shot.ts` drives its own Chrome over the DevTools protocol. `--lane N` selects debug port `9400 + N` and a dedicated Chrome profile, which makes lanes fully independent; three simultaneous lanes are verified working. Agents pick an unused lane and keep it for the whole session. Lane `0` is the default and therefore the most likely to collide. Full protocol in [AGENTS.md](../../AGENTS.md).
- **Suggested follow-up:** none available upstream today. Re-check whether the Cursor browser tools gain per-agent tabs or a real cross-agent lock; until then the lane script is the supported path and screenshot capture stays UI-level automation, which [automation-standards.mdc](../../.cursor/rules/automation-standards.mdc) classes as fragile by nature.

## The dev server port cannot be passed through the npm script

- **Date:** 2026-09-07
- **Feature / area:** starting the shared Vite dev server on a fixed port (5174).
- **What is needed:** one command that reliably serves the game on port 5174 so capture scripts have a stable URL.
- **Why automation fails:** the `dev` script is `vite --host`. npm appends forwarded arguments to the end of the script, so `npm run dev -- --port 5174` folds the port into the `--host` value; Chrome then tries to resolve a hostname of `5174`. The failure looks like a DNS problem, not an argument-passing problem.
- **Interim:** call Vite directly — `npx vite --host --port 5174 --strictPort`. Check `http://127.0.0.1:5174/` before assuming the server is down, and prefer `127.0.0.1` over `localhost` to match the capture scripts. Only one server should ever be running.
- **Suggested follow-up:** pin the port inside `vite.config.ts` (`server.port` / `server.strictPort`), or split a `dev:5174` script, so the working invocation is the default one. Not done yet because it changes shared developer workflow and other work is in flight — worth a deliberate decision.
