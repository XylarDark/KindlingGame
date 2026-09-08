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
- **Update 2026-09-07:** the shared tab is now known to fail with a **single** caller too — `browser_navigate` returned `Timed out waiting for glass browser view: a36aa3` twice within one hour. Contention was never the whole story, so "just don't run agents concurrently" is not a workaround. The lane script is the only reliable path.

## A hard kill of a capture run cannot clean up after itself

- **Date:** 2026-09-07
- **Feature / area:** guaranteeing no Chrome process or profile directory outlives its run.
- **What is needed:** teardown on every way a run can end.
- **Why automation fails:** `taskkill /F` and `TerminateProcess` deliver nothing to the target — no signal, no handler, no exit hook. A run killed that way runs zero cleanup code by definition, and Windows has no equivalent of a process group that would cascade the kill. Node's `process.kill(pid, "SIGINT")` on Windows is also a terminate, not a deliverable signal, so it cannot be used to test the graceful path either.
- **Interim:** teardown covers every path Node *can* observe (`exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGBREAK`, `uncaughtException`, `unhandledRejection`) and is synchronous so it works from the exit hook. For the hard-kill case, `--cleanup` reaps orphaned processes, stale locks and abandoned profiles at any time. Measured behaviour on this machine: after `taskkill /F` of the run, Chrome's children exited on their own and **no processes** were orphaned, but the lock file and the profile directory both survived and needed reaping.
- **Suggested follow-up:** launch Chrome inside a Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, which would make the OS destroy the tree when the run dies however it dies. Node has no built-in support, so this needs a native addon or a small helper binary — not worth it while `--cleanup` covers the case.

## `--cleanup --all` cannot tell a legacy run from an orphan

- **Date:** 2026-09-07
- **Feature / area:** reaping orphaned lane browsers without disturbing live work.
- **What is needed:** a repo-wide cleanup that is safe while other agents are working.
- **Why automation fails:** the reaper protects a lane whose lock is held by a live process, but lane locking is new. A run started from an older checkout — or any process driving a lane profile without taking the lock — is indistinguishable from an orphan, because "no lock" is exactly what an orphan looks like.
- **Interim:** `--cleanup --lane N` for a lane you own, and `--cleanup --all --dry-run` to survey without acting. Use `--cleanup --all` destructively only when you know no capture is in flight. This is documented in [AGENTS.md](../../AGENTS.md).
- **Suggested follow-up:** nothing needed once every caller is on a locking build; the gap closes itself as older runs finish.

## A browser's open tabs cannot be enumerated without owning the browser

- **Date:** 2026-09-07
- **Feature / area:** `npm run open` reusing an existing window instead of stacking another tab.
- **What is needed:** "is the game already open somewhere?" for the user's own browser.
- **Why automation fails:** listing tabs requires a DevTools port, and a browser must be *started* with `--remote-debugging-port` to have one. The user's everyday browser was not, and restarting it to gain one is unacceptable. Only the OS window title is visible, and a window reports the title of its **active tab** — so the game sitting in a background tab is invisible, and the script will open a duplicate.
- **Interim:** match on window title (`Kindling` plus a known browser suffix, which deliberately excludes editor windows titled `...KindlingGame - Cursor`), and fall back to a short-lived marker file to suppress a rapid second invocation. Verified against the real default browser here (Brave): the first call opened it, the second and third focused it. `SetForegroundWindow` is best-effort — Windows only grants foreground to a process the user recently interacted with — so the script reports when it could not raise the window.
- **Suggested follow-up:** none worth taking. The failure mode is one extra tab, which is what the script already reduced from one-per-invocation.

## Two other capture scripts are still unguarded

- **Date:** 2026-09-07
- **Feature / area:** `scripts/promo-capture.ts` and `scripts/phone-capture.ts`, which drive their own Chrome the same way `agent-shot.ts` used to.
- **What is needed:** the same hang and leak guarantees across all browser automation in the repo.
- **Why automation fails:** nothing technical — it is unfinished work, called out here so it is not mistaken for done. Both still use bare `await cdp.send(...)` (5 and 7 occurrences) and `fetch` with no abort signal, so both can hang indefinitely; both spawn Chrome on fixed profiles (`kindling-promo-chrome`, `kindling-phone-chrome`) that the lane reaper deliberately does not match, and neither kills the process tree.
- **Interim:** they are run by hand, rarely, and produce authored content — `docs/promo/` stills are protected work under [18-content-and-data-pipelines.mdc](../../.cursor/rules/18-content-and-data-pipelines.mdc), so they were left alone rather than refactored blind.
- **Suggested follow-up:** route both through `scripts/laneChrome.ts` (`Watchdog`, `installExitGuards`, `killTree`) and give them lane-style profile names so `--cleanup` covers them. The structural guards in `scripts/laneSafety.test.ts` can then be extended to both files.

## The dev server port cannot be passed through the npm script

- **Date:** 2026-09-07
- **Feature / area:** starting the shared Vite dev server on a fixed port (5174).
- **What is needed:** one command that reliably serves the game on port 5174 so capture scripts have a stable URL.
- **Why automation fails:** the `dev` script is `vite --host`. npm appends forwarded arguments to the end of the script, so `npm run dev -- --port 5174` folds the port into the `--host` value; Chrome then tries to resolve a hostname of `5174`. The failure looks like a DNS problem, not an argument-passing problem.
- **Interim:** call Vite directly — `npx vite --host --port 5174 --strictPort`. Check `http://127.0.0.1:5174/` before assuming the server is down, and prefer `127.0.0.1` over `localhost` to match the capture scripts. Only one server should ever be running.
- **Suggested follow-up:** pin the port inside `vite.config.ts` (`server.port` / `server.strictPort`), or split a `dev:5174` script, so the working invocation is the default one. Not done yet because it changes shared developer workflow and other work is in flight — worth a deliberate decision.
