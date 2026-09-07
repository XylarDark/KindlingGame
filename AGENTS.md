# Working in this repo

Phaser 3 + TypeScript. Windows/PowerShell: `&&` is not a valid statement separator — use `;`.

## Screenshots: take your own lane, never the shared browser

**Do not use the `cursor-ide-browser` tools when more than one agent may be running.** That browser is a single shared tab. Three agents reaching for it at once hung all three for 46 minutes with no error and no output — the failure is silent, so you will not be told it happened.

Capture through your own isolated Chrome instead:

```
npx tsx scripts/agent-shot.ts --lane 3 --name shop.png
npx tsx scripts/agent-shot.ts --lane 4 --query "?howto=0&shot=drive" --wait 4000
```

A lane number picks a dedicated debug port (`9400 + lane`) and its own Chrome profile, so any number of lanes capture in parallel. Verified with three simultaneous. Pick a lane no one else is using and keep it for your whole session; lane `0` is the default and therefore the one most likely to collide. Output goes to `%TEMP%\kindling-shots` and the script prints the absolute path it wrote.

Useful flags: `--url`, `--query`, `--size WxH`, `--wait ms`, `--no-click`, `--out`, `--name`. The game boots paused, so the script clicks the canvas centre to start play unless you pass `--no-click`.

## The dev server is shared — don't start a second one

One vite serves everything on **port 5174**: `npx vite --host --port 5174 --strictPort`. Check `http://127.0.0.1:5174/` before assuming it's down. Prefer `127.0.0.1` over `localhost`, matching the other capture scripts. Note `npm run dev -- --port 5174` does **not** work: the script is `vite --host`, so npm folds the port into `--host` and Chrome tries to resolve a hostname of "5174".

## Failures here are usually silent — verify positively

This codebase has produced three separate bugs that all passed their own checks by doing nothing:

- **A test that read its own source** searched for a newline-anchored `}`. `core.autocrlf` is `true`, so a checkout delivers CRLF, the search never matched, and the fail-open branch scanned every later function instead. If you scan source text, normalise with `.replace(/\r\n/g, "\n")` and **throw** on a miss rather than returning the remainder.
- **The layout audit** read `text.typekitBox` as a property, but it lives in Phaser's data manager. Every overflow check silently skipped and the audit reported clean. Sanity-check that an audit found a plausible non-zero number of boxed texts before trusting a pass, and run it at camera zoom 1.
- **A non-null assertion** (`settingsDim.input!.enabled`) hid the fact that `input` is null until `setInteractive()` is called. `tsc` passed; the HUD crashed on boot. Prefer the real API (`setInteractive` / `disableInteractive`) over asserting a nullable away.

So: a green check is not evidence unless you know what it measured.

## Definition of done

`npx tsc --noEmit` clean, `npm test` fully green, and — because `tsc` demonstrably misses boot-time crashes — a capture proving the game still renders. Commit in coherent chunks with a lowercase conventional prefix and a subject that communicates the value of the change.
