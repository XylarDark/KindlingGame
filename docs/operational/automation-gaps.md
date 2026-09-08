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
- **Resolved 2026-09-07:** the port is now pinned in `vite.config.ts` (`server.port: 5174`, `server.strictPort: true`), so plain `npm run dev` serves the port every capture script expects and a second server refuses to start rather than sliding to 5175. The underlying npm limit is unchanged and unfixable — `npm run dev -- --port 5174` still folds the port into `--host` — so **do not pass a port through the npm script**; change the config instead. Check `http://127.0.0.1:5174/` before assuming the server is down, and prefer `127.0.0.1` over `localhost` to match the capture scripts.

## A capture cannot tell "still painting" from "broken" without asking the game

- **Date:** 2026-09-07
- **Feature / area:** deciding when a headless capture is safe to take.
- **What is needed:** a general "the page has finished rendering" signal.
- **Why automation fails:** there isn't one for a WebGL canvas. CDP's load and lifecycle events fire long before Phaser's first frame; `Page.captureScreenshot` will happily return the page background. Reading pixels back is no help either — Phaser leaves `preserveDrawingBuffer` off, so a WebGL readback comes back blank whether or not the game drew. Headless Chrome renders through SwiftShader, so first paint at 1920x1080 is slow enough to lose the race, and it is slower still on a cold profile.
- **Interim:** the gate is **game-specific** — it polls `window.kindlingGame.loop.frame`, which means it only works for this game. It degrades honestly rather than hanging: three polls with no `kindlingGame` global classify the page as "not a game" and the run proceeds, so `--url` against an arbitrary page still works. `--no-ready-wait` falls back to the old fixed sleep.
- **Suggested follow-up:** none available. Any generic replacement would be a heuristic on pixels, which this canvas cannot supply. If the game ever exposes a "first paint done" event, gate on that instead of a frame count.

## A secret cannot be blocked before an agent reads it

- **Date:** 2026-09-08
- **Feature / area:** stopping a credential from reaching an agent's context in the first place.
- **What is needed:** a local check that refuses the read, before the file contents are in a transcript.
- **Why automation fails:** the only hook point is a Cursor editor hook, and the one this repo vendored could not be characterised in either direction — it was **configured fail-open, behaved fail-closed, and said so nowhere**. `hooks.json` shipped `failClosed: false` on both events, but the script hard-coded `deny` on its own malfunctions, so the config setting only applied when the script failed to speak at all. Five paths blocked on a non-finding: empty stdin, unparsable JSON, an unrecognised event name, any throw in its read or decide functions, and a shell event missing `command` — that last one returned `ask`, which blocks pending a human who may not be watching. There was **no payload size limit in the script at all**; the failure arrived indirectly. `beforeReadFile` carries the whole file, a large or slow read trips the 5000ms stdin safety timer, the reader resolves on a **truncated** payload, and truncated JSON then fails `JSON.parse` and returns `deny`. It recorded `stdinTimedOut` in its audit log and never acted on it, so at the point of the block a truncation was indistinguishable from a policy decision. The ~1.4KB figure is real but concerns Cursor discarding the hook's **output**, which `failClosed: false` genuinely did cover; the input-side blocking path was a separate, unmitigated defect, and an earlier version of this entry conflated the two. Meanwhile the script's own header called it a "Fail-closed secret scanner" and asserted that `failClosed: true` "is what actually closes that hole", contradicting the `false` sitting in the config file beside it. A control whose posture nobody can state is not a control, so the hook was removed rather than kept for reassurance. Verified by reading the deleted script out of history (`git show a345d07^:.cursor/hooks/secret-scan.cjs`), not from the removal commit's summary — which repeats the payload-limit account.
- **Interim:** design, not enforcement. `.gitignore` excludes `.env` and `.env.*` (only `.env.example` may ever be tracked), and this repo is a static browser game with **no backend**, so there is no credential a correct change needs — if one appears necessary that is a design question, not a configuration task. MCP config is the single place a credential could legitimately appear, and it is referenced as `${env:NAME}`, never inline, starting from `.cursor/mcp.json.example`. See [mcp-hygiene.md](../guides/mcp-hygiene.md).
- **Deliberately not automated:** a CI secret scan (gitleaks, `npm audit`) was written and then **removed before it shipped**, because every GitHub Actions failure emails the repo owner and notification volume is an account-level setting no repository can change. The owner declined the mail. Do not re-add a workflow for this without asking. `npm audit --audit-level=high` and `npm audit signatures` still work on demand and cost nothing to run by hand.
- **What removal actually cost — three things now unguarded:** the replacements are not a smaller version of the same cover, they cover a different thing. The hook was **machine-scoped and read-scoped**; `.gitignore` and a commit-time scan are **repo-scoped and commit-scoped**, so the following fall in the gap between the two:
  - **Reads that never become a commit.** An agent that reads a secret into context and forwards it never touches git, so nothing inspects it. This is the attack the hook existed for, and it is the one with no substitute at all.
  - **Credential files outside the repo — rate this highest.** The blocked-path list covered `id_rsa` and friends, `*.pem`/`*.pfx`/`*.p12`, `.npmrc`, `.netrc`, `.aws/`, `.ssh/` and `.git-credentials`. Those live in `$HOME`, where `.gitignore` means nothing and a repository scan never looks. The reasoning that justified removal is about `.env` and CI and does not address this case.
  - **Shell commands before they run.** It blocked `curl … $API_KEY`, `cat .env`, `env | curl`, `git config credential.helper=`, `npm token create`, and writes to `.cursor/mcp.json` (the CVE-2025-54135 vector). Nothing now inspects a command prior to execution.
- **Why that is acceptable here, and would not be elsewhere:** the mitigation is **"low value at risk", not "equivalent coverage"** — say it that way round, because the difference is the whole argument. This is a static browser game with no backend that reads no environment variables, so there is little on this machine that the paths above could carry off and nothing in the repo that a leak would compromise. That is a property of *this* project, not of the decision. **Do not copy this entry into a repo that touches live credentials** — a deploy key, an API token, a CI secret, a customer database — because you would inherit all three gaps with something real behind them, and the sentence justifying it would no longer be true.
- **Suggested follow-up:** none while the notification cost stands, and none that restores read-time coverage: the editor hook is still the only place to put it. Be clear about the residual risk rather than reassured by this entry: **nothing in this repo scans for secrets.** A secret pasted into a working file can enter an agent transcript, and a committed one reaches the remote unchallenged. The defects that killed the hook are written up in [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) as the specification for anyone reintroducing one — three of the four are properties of Cursor's hook protocol rather than of that script, so they will be waiting for the next attempt.
