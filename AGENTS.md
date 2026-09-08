# Working in this repo

Phaser 3 + TypeScript. Windows/PowerShell: `&&` is not a valid statement separator — use `;`.

This file holds the operational protocol — the things that will waste your afternoon if you get them wrong. Supporting detail lives in three places: [`.cursor/rules/`](.cursor/rules/README.md) for engineering standards (`08-project-context.mdc` carries the stack, commands and layout), [`docs/KNOWN_ERRORS.md`](docs/KNOWN_ERRORS.md) for the full forensics on past failures, and [`docs/operational/automation-gaps.md`](docs/operational/automation-gaps.md) for limits that cannot be automated away.

## Screenshots: take your own lane, never the shared browser

**Do not use the `cursor-ide-browser` tools when more than one agent may be running.** That browser is a single shared tab. Three agents reaching for it at once hung all three for 46 minutes with no error and no output — the failure is silent, so you will not be told it happened.

The shared tab fails even with a single caller: `browser_navigate` has returned `Timed out waiting for glass browser view` twice in one hour. Capture through your own isolated Chrome instead:

```
npx tsx scripts/agent-shot.ts --lane 3 --name shop.png
npx tsx scripts/agent-shot.ts --lane 4 --query "?howto=0&shot=drive" --wait 4000
```

A lane number picks a dedicated debug port (`9400 + lane`) and its own Chrome profile, so any number of lanes capture in parallel. Verified with three simultaneous. Pick a lane no one else is using and keep it for your whole session; lane `0` is the default and therefore the one most likely to collide. Output goes to `%TEMP%\kindling-shots` and the script prints the absolute path it wrote.

Useful flags: `--url`, `--query`, `--size WxH`, `--wait ms`, `--no-click`, `--out`, `--name`. The game boots paused, so the script clicks the canvas centre to start play unless you pass `--no-click`.

Why the shared browser cannot simply be fixed is recorded in [docs/operational/automation-gaps.md](docs/operational/automation-gaps.md); re-check it if the Cursor browser tools change.

### If a human asks for the Cursor browser: never pass `position` to a new tab

`browser_navigate` derives its internal `preserveFocus` from the **absence** of `position`. Omit `position` and Cursor builds the view inside the workbench renderer, on a path with no deadline. Pass it, and Cursor asks a separate "glass" window to create the tab and then polls for a webview element for exactly 2000 ms before throwing `Timed out waiting for glass browser view`. The one logged failure died in 2126 ms, which is that deadline and not a slow network.

Concurrency makes it worse for a second reason: tab lists are **filtered by owning agent**, so another agent's tab is invisible to you, reuse is skipped, and you fall through into tab *creation* — the only path that can time out.

The way to show a human the game is therefore two calls: create quietly with `newTab` and no `position`, then reveal by passing the returned `viewId` **with** `position`. Reuse never enters the creation path, so revealing an existing view is safe.

```
npx tsx scripts/browser-probe.ts    # offline, reads Cursor's logs, cannot hang
```

Run that first. It reports whether the browser subsystem has failed recently and touches no MCP tool.

**Retry at most once, and only with the call changed** — drop `position`. Repeating an identical call re-enters the same race. This applies only to the failure that *returns an error*: a hanging call cannot be cancelled from inside an agent, so retrying a hang is strictly worse than not. Closing a stale tab (`browser_tabs` close) or releasing a stuck lock repairs a *stale* browser, not a wedged one; for a true wedge the only lever is `Developer: Reload Window`.

### A run cannot hang, leak a browser, or collide with yours

You do not need to manage any of this, but knowing it exists will save you from working around it:

- **Every run is bounded.** A watchdog ends the run within a wall-clock budget derived from the work you asked for, and every CDP call, debug-port poll and process query has its own timeout. On expiry the run prints the step it died on, tears down its Chrome and exits non-zero. Raise it with `--budget <ms>` if a plan legitimately needs longer.
- **Every exit path tears down.** Return, throw, unhandled rejection and `SIGINT`/`SIGTERM`/`SIGHUP`/`SIGBREAK` all kill the whole Chrome process tree and delete the lane's profile directory. A `taskkill /F` on the run itself is the one case teardown cannot survive — use `--cleanup` afterwards.
- **Lanes are locked.** A lane held by a live run fails fast and names the holder and a free lane to use instead. A lock whose holder is dead is reclaimed, and the reclaim is logged.
- **The profile is disposable.** It is deleted at the end of each run, so every capture starts from clean `localStorage`. Pass `--keep-profile` to keep a warm shader cache between runs on the same lane.

If a run is interrupted, or a lane starts refusing for no clear reason, reap it:

```
npx tsx scripts/agent-shot.ts --cleanup --lane 3         # this lane
npx tsx scripts/agent-shot.ts --cleanup --all --dry-run  # survey every lane, change nothing
npm run shot:cleanup -- --lane 3
```

Cleanup is safe to run at any time. It only ever touches processes whose `--user-data-dir` is exactly a `kindling-shot-laneN` directory, so it cannot reach your own browser. Prefer `--dry-run` for `--all` while other agents may be mid-run, because a run started before lane locking existed holds no lock to protect it.

### Working the game and reading its state back

A capture run can drive the game through an ordered step sequence: `click:x,y`, `clickeval:expr` (for targets that move between runs), `drag:x1,y1,x2,y2` (the only way to work a slider, which needs a `pointermove` between press and release), `wait:ms`, `shot:name.png`, `shot:name.png@x,y,w,h[,scale]` for a magnified crop, and `eval:expr`. Run at `--size 1920x1080` so CSS pixels equal design coordinates and you can click design-space positions directly.

**Anything containing double quotes must go in a `--plan` file, one step per line** — `npx` on Windows is a cmd shim that silently strips quotes, so an inline `--step "eval:..."` arrives as invalid JS:

```
npx tsx scripts/agent-shot.ts --lane 7 --size 1920x1080 --plan tmp/settings.steps
```

Two things worth knowing before you write a plan. CDP `Input.dispatchMouseEvent`, which these steps use, does reach Phaser, whereas synthetic `PointerEvent`s dispatched through `eval` do not. And `await import("/src/session.ts")` will **not** hand you the live sim — Vite returns a separate module instance that throws `Game session has not started`; wrap `HudScene.paintHud` to stash the snapshot it receives instead.

Prefer `eval` over pixels for anything you assert: a backgrounded tab returns stale screenshots that look live.

## The dev server is shared — don't start a second one

One vite serves everything on **port 5174**. `npm run dev` now does the right thing: the port is pinned in `vite.config.ts` (`server.port`, `server.strictPort`) and the script passes the flags explicitly, so there is no longer a wrong way to start it. `npx vite --host --port 5174 --strictPort` remains equivalent.

Check `http://127.0.0.1:5174/` before assuming it's down. Prefer `127.0.0.1` over `localhost`, matching the capture scripts. `strictPort` means a second server refuses to start rather than sliding to 5175 where nothing is looking for it.

Do **not** pass the port through npm — `npm run dev -- --port 5174` folds it into the `--host` value, and the browser then tries to resolve a hostname of "5174". You no longer need to.

To put the game in front of a human, use `npm run open` rather than `Start-Process`. It checks the server is actually serving, focuses an existing window that already has the game instead of stacking another tab, and refuses with instructions when the server is down.

## Failures here are usually silent — verify positively

This codebase has produced three separate bugs that all passed their own checks by doing nothing:

- **A test that read its own source** searched for a newline-anchored `}`. `core.autocrlf` is `true`, so a checkout delivers CRLF, the search never matched, and the fail-open branch scanned every later function instead. If you scan source text, normalise with `.replace(/\r\n/g, "\n")` and **throw** on a miss rather than returning the remainder.
- **The layout audit** read `text.typekitBox` as a property, but it lives in Phaser's data manager. Every overflow check silently skipped and the audit reported clean. Sanity-check that an audit found a plausible non-zero number of boxed texts before trusting a pass, and run it at camera zoom 1.
- **A non-null assertion** (`settingsDim.input!.enabled`) hid the fact that `input` is null until `setInteractive()` is called. `tsc` passed; the HUD crashed on boot. Prefer the real API (`setInteractive` / `disableInteractive`) over asserting a nullable away.

So: a green check is not evidence unless you know what it measured.

Each of these is written up in full — symptom, cause, fix, prevention, commit — in [docs/KNOWN_ERRORS.md](docs/KNOWN_ERRORS.md). Read it before you touch an audit, a source-scanning test, or Phaser input wiring, and append an entry whenever you debug a non-obvious failure.

## Definition of done

`npx tsc --noEmit` clean, `npm test` fully green, and — because `tsc` demonstrably misses boot-time crashes — a capture proving the game still renders. Commit in coherent chunks with a lowercase conventional prefix and a subject that communicates the value of the change.
