---
name: game-capture
description: Use when taking a screenshot of the game, driving it through a scripted interaction, reading its runtime state back, showing it to a human in the Cursor browser, or cleaning up a capture lane - covers the isolated-lane capture tooling, step plans, run bounding and teardown, and the Cursor browser's tab-creation timeout.
---

# Capturing and driving the game

The short version, which is also in `AGENTS.md`: **never use the `cursor-ide-browser` tools when
more than one agent may be running.** That browser is a single shared tab. Three agents reaching for
it at once hung all three for 46 minutes with no error and no output. The failure is silent, so you
will not be told it happened.

Capture through your own isolated Chrome instead:

```
npx tsx scripts/agent-shot.ts --lane 3 --name shop.png
npx tsx scripts/agent-shot.ts --lane 4 --query "?howto=0&shot=drive" --wait 4000
```

## Lanes

A lane number picks a dedicated debug port (`9400 + lane`) and its own Chrome profile, so any number
of lanes capture in parallel. Verified with three simultaneous.

Pick a lane no one else is using and keep it for your whole session. Lane `0` is the default and
therefore the one most likely to collide. Output goes to `%TEMP%\kindling-shots`, and the script
prints the absolute path it wrote.

Useful flags: `--url`, `--query`, `--size WxH`, `--wait ms`, `--no-click`, `--out`, `--name`. The
game boots paused, so the script clicks the canvas centre to start play unless you pass `--no-click`.

## A run cannot hang, leak a browser, or collide with yours

You do not need to manage any of this, but knowing it exists will save you from working around it:

- **Every run is bounded.** A watchdog ends the run within a wall-clock budget derived from the work
  you asked for, and every CDP call, debug-port poll and process query has its own timeout. On
  expiry the run prints the step it died on, tears down its Chrome and exits non-zero. Raise it with
  `--budget <ms>` if a plan legitimately needs longer.
- **Every exit path tears down.** Return, throw, unhandled rejection and
  `SIGINT`/`SIGTERM`/`SIGHUP`/`SIGBREAK` all kill the whole Chrome process tree and delete the
  lane's profile directory. A `taskkill /F` on the run itself is the one case teardown cannot
  survive — use `--cleanup` afterwards.
- **Lanes are locked.** A lane held by a live run fails fast and names the holder and a free lane to
  use instead. A lock whose holder is dead is reclaimed, and the reclaim is logged.
- **The profile is disposable.** It is deleted at the end of each run, so every capture starts from
  clean `localStorage`. Pass `--keep-profile` to keep a warm shader cache between runs on the same
  lane.

If a run is interrupted, or a lane starts refusing for no clear reason, reap it:

```
npx tsx scripts/agent-shot.ts --cleanup --lane 3         # this lane
npx tsx scripts/agent-shot.ts --cleanup --all --dry-run  # survey every lane, change nothing
npm run shot:cleanup -- --lane 3
```

Cleanup is safe to run at any time. It only ever touches processes whose `--user-data-dir` is
exactly a `kindling-shot-laneN` directory, so it cannot reach your own browser. Prefer `--dry-run`
for `--all` while other agents may be mid-run, because a run started before lane locking existed
holds no lock to protect it.

## Working the game and reading its state back

A capture run can drive the game through an ordered step sequence:

| Step | Purpose |
| --- | --- |
| `click:x,y` | Click a fixed design-space position |
| `clickeval:expr` | Click a target that moves between runs |
| `drag:x1,y1,x2,y2` | Work a slider — needs a `pointermove` between press and release |
| `wait:ms` | Let an animation or load settle |
| `shot:name.png` | Capture |
| `shot:name.png@x,y,w,h[,scale]` | Capture a magnified crop |
| `eval:expr` | Read state back |

Run at `--size 1920x1080` so CSS pixels equal design coordinates and you can click design-space
positions directly.

**Anything containing double quotes must go in a `--plan` file, one step per line.** `npx` on
Windows is a cmd shim that silently strips quotes, so an inline `--step "eval:..."` arrives as
invalid JS:

```
npx tsx scripts/agent-shot.ts --lane 7 --size 1920x1080 --plan tmp/settings.steps
```

Two things worth knowing before you write a plan:

- CDP `Input.dispatchMouseEvent`, which these steps use, does reach Phaser. Synthetic
  `PointerEvent`s dispatched through `eval` do **not**.
- `await import("/src/session.ts")` will **not** hand you the live sim. Vite returns a separate
  module instance that throws `Game session has not started`. Wrap `HudScene.paintHud` to stash the
  snapshot it receives instead.

**Prefer `eval` over pixels for anything you assert.** A backgrounded tab returns stale screenshots
that look live.

## If a human asks for the Cursor browser: never pass `position` to a new tab

`browser_navigate` derives its internal `preserveFocus` from the **absence** of `position`. Omit
`position` and Cursor builds the view inside the workbench renderer, on a path with no deadline.
Pass it, and Cursor asks a separate "glass" window to create the tab and then polls for a webview
element for exactly 2000 ms before throwing `Timed out waiting for glass browser view`. The one
logged failure died in 2126 ms, which is that deadline and not a slow network.

Concurrency makes it worse for a second reason: tab lists are **filtered by owning agent**, so
another agent's tab is invisible to you, reuse is skipped, and you fall through into tab *creation* —
the only path that can time out.

So showing a human the game is two calls: create quietly with `newTab` and no `position`, then
reveal by passing the returned `viewId` **with** `position`. Reuse never enters the creation path,
so revealing an existing view is safe.

Before touching the Cursor browser at all, run the offline probe. It reads Cursor's logs, cannot
hang, and touches no MCP tool:

```
npx tsx scripts/browser-probe.ts
```

**Retry at most once, and only with the call changed** — drop `position`. Repeating an identical
call re-enters the same race. This applies only to the failure that *returns an error*: a hanging
call cannot be cancelled from inside an agent, so retrying a hang is strictly worse than not.
Closing a stale tab (`browser_tabs` close) or releasing a stuck lock repairs a *stale* browser, not
a wedged one; for a true wedge the only lever is `Developer: Reload Window`.

Why the shared browser cannot simply be fixed is recorded in
[`docs/operational/automation-gaps.md`](../../../docs/operational/automation-gaps.md). Re-check it if
the Cursor browser tools change.

## Showing the game to a human without the MCP browser

Use `npm run open` rather than `Start-Process`. It checks the server is actually serving, focuses an
existing window that already has the game instead of stacking another tab, and refuses with
instructions when the server is down.
