# Known errors and fixes

**Purpose:** record failures that were **expensive** or **non-obvious**, so nobody pays for them twice. Append new entries; do not delete history — mark an entry addressed instead.

**When to add an entry:** after you debug a non-obvious failure and have a verified fix. **Read this file before** touching audits, source-scanning tests, or Phaser input wiring.

**The theme of every entry below:** each of these bugs **passed its own check by doing nothing**. A green check is not evidence unless you know what it measured.

---

## Failures that verified nothing

### Source-scanning test defeated by CRLF, then failed open

- **Date:** 2026-09-07
- **Symptom:** `src/art/shopInterior.test.ts` passed while asserting almost nothing. It reads its own sibling source, `shopInterior.ts`, to check what a function paints.
- **Cause:** two faults compounding. The scan searched for a newline-anchored closing `}` to find the end of a function, but `core.autocrlf` is `true` in this repo, so a checkout delivers **CRLF** and the LF-anchored search never matched. On a miss the helper *failed open* — `return end < 0 ? rest : rest.slice(0, end)` handed back the entire rest of the file, so every later function's code counted toward the assertions.
- **Fix:** normalise the text on read, `readFileSync(..., "utf8").replace(/\r\n/g, "\n")`, and **throw** on a miss instead of returning the remainder: `if (end < 0) throw new Error(...)`. Commit `7a5ec79`.
- **Prevention:** if you scan source text, always normalise line endings **and** throw when a marker is missing. A fail-open fallback in a test is worse than no test, because it reports success. Remember `core.autocrlf` is `true` here — the bytes on disk are not the bytes in the commit.

### Layout audit read a Phaser data value as a plain property

- **Date:** 2026-09-07
- **Symptom:** the text-overflow layout audit reported clean while overflowing text was plainly visible on screen.
- **Cause:** the audit read `text.typekitBox` as an object property. That value does not live on the object — it is stored in **Phaser's data manager** under the key `typekitBox` (see `TYPEKIT_BOX` in `src/ui/typekit.ts`), so it must be read with `text.getData("typekitBox")`. The property was `undefined` for every text object, so every overflow check hit its skip branch and the audit examined nothing.
- **Fix:** read the box through the data manager, and run the audit at **camera zoom 1** so measured bounds are comparable.
- **Prevention:** an audit that finds **zero** items to inspect is a failed audit, not a passing one. Assert that it found a plausible non-zero number of boxed texts before trusting a pass. When reading Phaser state, check whether the value is a property or a data-manager entry.

### Non-null assertion hid an uninitialised Phaser input and crashed the HUD

- **Date:** 2026-09-07
- **Symptom:** `npx tsc --noEmit` was clean, tests were green, and the HUD crashed on boot.
- **Cause:** `settingsDim.input!.enabled` asserted away a nullable. A Phaser game object's `input` is **null until `setInteractive()` has been called**, so the assertion silenced the one warning that would have caught it. `tsc` cannot see the runtime lifecycle. The same dim also swallowed clicks meant for objects behind it.
- **Fix:** drive interactivity through the real API — `setInteractive({ useHandCursor: false })` when the overlay is on, `disableInteractive()` when it is off — instead of reading and asserting `input`. Commit `e90c0b1`, in `src/scenes/HudScene.ts`.
- **Prevention:** prefer the real API over asserting a nullable away; `!` deletes exactly the signal you need. And because `tsc` demonstrably misses boot-time crashes, the definition of done requires **a capture proving the game still renders** — see [AGENTS.md](../AGENTS.md).

---

## Environment traps

### `npm run dev -- --port 5174` silently targets the wrong host

- **Date:** 2026-09-07
- **Symptom:** Chrome fails to resolve a hostname of `5174`.
- **Cause:** the `dev` script is `vite --host`. npm appends forwarded arguments, so the port folds into the `--host` value rather than becoming its own flag.
- **Fix:** invoke Vite directly: `npx vite --host --port 5174 --strictPort`.
- **Prevention:** recorded in [operational/automation-gaps.md](operational/automation-gaps.md); see [AGENTS.md](../AGENTS.md) for the shared dev-server protocol. One server serves everything on port **5174** — do not start a second.

### Concurrent agents deadlocked on the shared browser tab

- **Date:** 2026-09-07
- **Symptom:** three agents hung for 46 minutes with no error output and no screenshots.
- **Cause:** the `cursor-ide-browser` tools drive a **single shared tab**. Concurrent agents contend for it and block; the failure is completely silent, so no agent is told it happened.
- **Fix:** capture through a per-agent Chrome instance — `npx tsx scripts/agent-shot.ts --lane N`, where the lane picks a dedicated debug port (`9400 + lane`) and its own Chrome profile.
- **Prevention:** full protocol in [AGENTS.md](../AGENTS.md); the underlying limitation is logged in [operational/automation-gaps.md](operational/automation-gaps.md).

### The Cursor browser's 2-second fuse is lit by the `position` argument

- **Date:** 2026-09-07
- **Symptom:** `browser_navigate` returned `[cursor.browserView.newTab] Timed out waiting for glass browser view: a36aa3`, twice in one hour, with only a single caller — so contention was not the explanation.
- **Cause:** the extension derives `preserveFocus` from the **absence** of `position`. Without it, Cursor creates the browser view inside the workbench renderer and cannot time out. With it, creation is delegated to the separate glass window and then polled for a webview element against a hard 2000 ms deadline (`AUk = 2e3` in `workbench.glass.main.js`). The logged failure took 2126 ms, matching the deadline rather than any network delay. A second factor explains the clustering around concurrency: `listTabs` filters by owning agent, so a tab held by another agent is invisible, reuse is skipped, and the call falls through to the one path that can expire.
- **Fix:** omit `position` to create, then reveal by passing the returned `viewId` **with** `position` — reuse never enters the creation path. Verified: the same call that timed out twice succeeded immediately without `position`, and revealing by `viewId` afterwards also succeeded.
- **Prevention:** `scripts/browser-probe.ts` reads Cursor's own automation logs offline and reports whether the subsystem has failed recently; it touches no MCP tool and cannot hang, so it is safe as a preflight. Retry at most once and only with the call changed — and never retry the *hanging* variant, which an agent cannot cancel from inside. Protocol in [AGENTS.md](../AGENTS.md); the un-diagnosable remainder is in [operational/automation-gaps.md](operational/automation-gaps.md).

### A capture run could still hang forever, because nothing had a timeout

- **Date:** 2026-09-07
- **Symptom:** the class of failure behind the 46-minute deadlock above. A run produced no output and never returned, so there was nothing to debug and no exit code to react to.
- **Cause:** every wait in `scripts/agent-shot.ts` was unbounded. `cdp.send` returned a promise that only ever settled on a reply, so if Chrome stopped answering — or died, closing the socket with calls in flight — the promise never settled at all. The debug-port poll used a bare `fetch`, which waits indefinitely on a socket that accepts and then says nothing. There was no overall wall-clock limit, and `chrome.kill()` in a `finally` block ran on none of the paths that matter: an unhandled rejection unwinds nothing, and a signal skips `finally` entirely.
- **Fix:** a wall-clock watchdog derived from the requested work, a per-operation timeout on every CDP round-trip and HTTP request, rejection of in-flight calls when the websocket closes, and synchronous teardown wired to `exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGBREAK`, `uncaughtException` and `unhandledRejection`. On expiry the run names the step it died on and exits non-zero. Decisions live in `scripts/lib/laneProtocol.ts` with unit tests; the wiring is asserted structurally by `scripts/laneSafety.test.ts`.
- **Prevention:** teardown must stay **synchronous** — `process.on("exit")` will not await a promise, so an async cleanup silently does nothing on exactly the paths you added it for. Never write a bare `await cdp.send(...)`; the guard test fails the build if one reappears. A run that dies loudly is infinitely better than one that hangs silently.

### Killing only the parent Chrome leaves the rest of the tree behind

- **Date:** 2026-09-07
- **Symptom:** "endless browsers" — orphaned Chrome processes accumulating with no owning run.
- **Cause:** two things. `chrome.kill()` targets one process, but Chrome spawns renderer, GPU, utility and crashpad children. And the obvious identifier was wrong: **only the browser process and its renderers carry `--remote-debugging-port`**, while every process in the tree carries `--user-data-dir`. Reaping by port would therefore have stranded the GPU, utility and crashpad children. Verified by inspecting a real launch.
- **Fix:** identify lane processes by **profile directory** (`--user-data-dir` ending in exactly `kindling-shot-laneN`), never by process name, and kill with `taskkill /PID <pid> /T /F` — measured taking an 8-process tree to zero.
- **Prevention:** `taskkill /T` **exits non-zero when any child vanishes while it walks the tree**, which happens constantly with Chrome's renderers. It was observed reporting failure on a tree it had in fact destroyed. Its exit code is not evidence; `killTree` now measures the outcome with a liveness check instead of trusting it.

### A blank capture that looked like a broken game was a cold shader cache

- **Date:** 2026-09-07
- **Symptom:** a capture that had worked returned a flat `#241c16` rectangle. The obvious reading was a boot crash in the scene under edit.
- **Cause:** not a crash at all. `eval` showed the game fully alive — `shop` scene active with 54 children, WebGL renderer, render loop running. Deleting the lane profile at the end of every run (the fix for a 688 MB disk leak) made every launch start with a **cold shader cache**, and headless Chrome renders through SwiftShader, so first paint at 1920x1080 landed after the default 2500ms settle had already expired. The screenshot was of the page background.
- **Fix:** gate the first capture on real rendered frames — poll `window.kindlingGame.loop.frame` until it passes a threshold, bounded by its own timeout and charged to the run budget. `--no-ready-wait` restores the old fixed sleep, `--min-frames` retunes it.
- **Prevention:** a fixed sleep cannot express "has painted"; it encodes an assumption about machine speed that software rendering breaks. When a capture looks broken, **read state with `eval` before believing the pixels** — that is what separated "still painting" from "crashed on boot" here in one step.

### The render gate passed, and it was measuring the wrong scene

- **Date:** 2026-09-07
- **Symptom:** with the render gate in place, a capture came back rendering correctly but showing `Paused - tap to start` at 09:00. The click that starts play had silently done nothing.
- **Cause:** two mistakes compounding. The gate ran *after* the start click, so the click still raced Phaser's input plugin and was dropped when it arrived first — Phaser discards pointer events received before the plugin is live, with no error. Moving the gate ahead of the click exposed the second problem: with `--no-click` the active scene is `title`, not `shop`, so the gate was satisfied by the title screen painting, and the shop's own first paint still raced the settle afterwards.
- **Fix:** gate twice. Once before the click, so input is live when it lands; once after, re-armed against the frame number captured at click time, because `loop.frame` is monotonic and an absolute threshold is already met by then. Both gates are charged to the wall-clock budget.
- **Prevention:** this is the repo's own warning in miniature — the gate was green while measuring something that did not answer the question. When a readiness check passes, ask *which* scene satisfied it: `eval` the active scene keys, do not infer them from the fact that frames advanced.

### Teardown was unbounded, and deleting a locked profile took 38 seconds

- **Date:** 2026-09-07
- **Symptom:** one run's teardown took **37.8 seconds** — longer than the capture it was cleaning up after — and reported a profile it could not remove.
- **Cause:** `rmSync` with `maxRetries` set retries *per directory entry*. Chrome had not yet released its file handles, and a profile holds several thousand files, so the backoff multiplied across every one of them. The watchdog does not cover teardown, so nothing bounded it.
- **Fix:** `removeProfileDir` now takes an explicit budget (5s default), sets `maxRetries: 0` so the retry loop is the caller's and not the filesystem's, and logs when it gives up. A leftover profile is a disk cost the reaper collects later, not a reason to hold the process open.
- **Prevention:** anything that runs after the watchdog stops needs its own bound. Measure teardown duration and print it — that number is what surfaced this at all.

### A process query matched its own command line

- **Date:** 2026-09-07
- **Symptom:** every clean capture run printed `WARNING pid NNNNN mentions a lane profile but could not be attributed`.
- **Cause:** the reaper enumerates processes with `Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%kindling-shot-lane%'"`. The PowerShell process running that query has the pattern **in its own command line**, so it matched its own filter, and the "could not attribute this browser" branch fired on it.
- **Fix:** treat a command line as an unattributable browser only when it carries a `--user-data-dir` flag *and* mentions the profile prefix. A process that merely names a profile path — the query itself, a shell, an editor — is ignored.
- **Prevention:** this only surfaced because the unattributable case is reported loudly instead of skipped. Keep it that way: the alternative is a reaper that silently fails to find things.

### Sprites baked into a hand-built capture scene render solid black

- **Date:** 2026-09-07
- **Symptom:** a contact-sheet scene added by hand for reviewing character art drew its background and shapes correctly, but every person came out a solid black silhouette. Cost three captures before the cause was clear.
- **Cause:** sprites inherit the game's day/night pipeline, which needs lighting state the ad-hoc scene never set up. Graphics shapes do not go through that pipeline, so they were unaffected — which is what makes it deceptive: the scene plainly works, only the subject is missing.
- **Fix:** `setPipeline("MultiPipeline")` on sprites drawn into a scene built for inspection rather than play.
- **Prevention:** true of any harness scene, not just contact sheets. If a capture shows a working background and a black subject, suspect the pipeline before suspecting the art — and note this is a harness limitation, not a game bug: the same textures render correctly in the real scenes.

---

## Related

- [AGENTS.md](../AGENTS.md) — operational protocol and definition of done
- [operational/automation-gaps.md](operational/automation-gaps.md) — what automation cannot do reliably
- [.cursor/rules/05-error-handling.mdc](../.cursor/rules/05-error-handling.mdc) — defensive coding and where to record errors
