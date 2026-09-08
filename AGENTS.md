# Working in this repo

Kindling is a browser game: **Phaser 3 + TypeScript**, bundled by **Vite**, tested with **Vitest**.
No backend, no database, no server-rendered framework. Everything ships as static files.

Windows/PowerShell: `&&` is not a valid statement separator — use `;`.

This file is the canonical, always-loaded context, and it holds the operational protocol — the
things that will waste your afternoon if you get them wrong. Everything else loads on demand:

- **`.cursor/rules/*.mdc`** — glob-scoped only. They load when you open a matching file
  (TypeScript, JavaScript, markdown, JSON/YAML, shell, frontend).
- **`.agents/skills/<name>/SKILL.md`** — procedural knowledge. Each stays dormant until its
  `description` matches your task. Read one when its trigger applies.
- **[`docs/KNOWN_ERRORS.md`](docs/KNOWN_ERRORS.md)** — full forensics on past failures.
- **[`docs/operational/automation-gaps.md`](docs/operational/automation-gaps.md)** — limits that
  cannot be automated away.

Do not add always-applied rules. Context loaded on every turn measurably degrades accuracy, so the
budget for this file is roughly 200 lines and the always-apply rule count is zero.

**A skill's `description` is always-loaded too.** Only the body is deferred; every description is
read each turn to decide relevance. Eleven skills currently cost about 650 tokens per turn on top
of this file's ~1,900, so the always-on budget is roughly 2,600 tokens in total. Adding a skill is
a permanent charge against it. Before adding one, prefer extending an existing skill, and keep the
`description` to a single sentence naming the trigger.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type check | `npm run typecheck` |
| Tests | `npm test` |
| Everything, with evidence | `npm run verify` |
| Production build | `npm run build` |
| Screenshot | `npx tsx scripts/agent-shot.ts --lane N` |
| Show the game to a human | `npm run open` |
| Repository health check | `npm run doctor` |

There is **no lint or format script**, and no ESLint, Prettier, Husky or commitlint setup. Do not
assume one exists or invent a command for it. `npm run doctor` reports their absence as a gap; that
is a known, accepted state, not a task waiting for you.

**Pass script flags after `--`.** `npm run shot:cleanup -- --lane 3` forwards the flag;
`npm run shot:cleanup --lane 3` gives it to npm, which silently ignores it.

## Layout

- `src/` — game source. `scenes/` (Phaser scenes), `sim/` (simulation), `ui/`, `input/`, `art/`,
  `audio/`, `maps/`.
- `src/**/*.test.ts` — tests live beside the code they cover.
- `scripts/` — capture and audit tooling run through `npx tsx` (`agent-shot.ts`, `qa-*.ts`,
  `promo-capture.ts`, `audit-loops.ts`).
- `public/` — static assets served as-is. `docs/promo/` — curated stills. `docs/qa-shots/` —
  gitignored scratch.
- `.devenv/` — embedded [DevEnvTemplate](https://github.com/XylarDark/DevEnvTemplate) doctor,
  gitignored. Run `npm run doctor` from the repo root.

## Screenshots: take your own lane, never the shared browser

**Do not use the `cursor-ide-browser` tools when more than one agent may be running.** That browser
is a single shared tab. Three agents reaching for it at once hung all three for 46 minutes with no
error and no output — the failure is silent, so you will not be told it happened. It fails with a
single caller too: `browser_navigate` has returned `Timed out waiting for glass browser view` twice
in one hour.

Capture through your own isolated Chrome instead:

```
npx tsx scripts/agent-shot.ts --lane 3 --name shop.png
```

A lane gets its own debug port and Chrome profile, so lanes capture in parallel. Pick one nobody
else is using and keep it for your session; lane `0` is the default and the most likely to collide.

**Read the `game-capture` skill before any capture work.** It covers the lane mechanics, step plans
for driving the game, reading runtime state back, run bounding and teardown, lane cleanup, and the
one safe way to show the game to a human through the Cursor browser. Every item in it is there
because of a specific expensive failure.

## The dev server is shared — don't start a second one

One vite serves everything on **port 5174**. `npm run dev` now does the right thing: the port is
pinned in `vite.config.ts` (`server.port`, `server.strictPort`) and the script passes the flags
explicitly, so there is no longer a wrong way to start it. `npx vite --host --port 5174
--strictPort` remains equivalent.

Check `http://127.0.0.1:5174/` before assuming it's down. Prefer `127.0.0.1` over `localhost`,
matching the capture scripts. `strictPort` means a second server refuses to start rather than
sliding to 5175 where nothing is looking for it.

Do **not** pass the port through npm — `npm run dev -- --port 5174` folds it into the `--host`
value, and the browser then tries to resolve a hostname of "5174". You no longer need to.

To put the game in front of a human, use `npm run open` rather than `Start-Process`. It checks the
server is actually serving, focuses an existing window that already has the game instead of stacking
another tab, and refuses with instructions when the server is down.

## Failures here are usually silent — verify positively

This codebase has produced three separate bugs that all passed their own checks by doing nothing:

- **A test that read its own source** searched for a newline-anchored `}`. `core.autocrlf` is
  `true`, so a checkout delivers CRLF, the search never matched, and the fail-open branch scanned
  every later function instead. If you scan source text, normalise with `.replace(/\r\n/g, "\n")`
  and **throw** on a miss rather than returning the remainder.
- **The layout audit** read `text.typekitBox` as a property, but it lives in Phaser's data manager.
  Every overflow check silently skipped and the audit reported clean. Sanity-check that an audit
  found a plausible non-zero number of boxed texts before trusting a pass, and run it at camera
  zoom 1.
- **A non-null assertion** (`settingsDim.input!.enabled`) hid the fact that `input` is null until
  `setInteractive()` is called. `tsc` passed; the HUD crashed on boot. Prefer the real API
  (`setInteractive` / `disableInteractive`) over asserting a nullable away.

So: a green check is not evidence unless you know what it measured.

Each of these is written up in full — symptom, cause, fix, prevention, commit — in
[docs/KNOWN_ERRORS.md](docs/KNOWN_ERRORS.md). Read it before you touch an audit, a source-scanning
test, or Phaser input wiring, and append an entry whenever you debug a non-obvious failure.

## Local conventions that override generic advice

- **Authored content is real work.** Curated stills in `docs/promo/` and assets under `public/` and
  `src/art/` are authored artifacts — capture and generation scripts must not bulk-overwrite them.
  See the `data-pipeline-safety` skill.
- **`core.autocrlf` is `true`** in this repo, so a checkout delivers CRLF. See the source-scanning
  rule above.
- **No secrets here.** This is a static browser game with no backend. If a change appears to need a
  credential, that is a design question, not a configuration task. MCP configuration is the one
  place credentials could appear: reference them as `${env:NAME}`, never inline, starting from
  `.cursor/mcp.json.example`. See `docs/guides/mcp-hygiene.md`.

## Development phase

Every area is **shaping** or **settled**. Shaping means the design is still being decided and your
judgment is the success criterion; settled means the shape is agreed and the job is keeping it
that way.

- `src/sim/**`, `src/maps/**` — settled. The game's rules live here as pure functions with tests.
- `src/scenes/**`, `src/ui/**`, `src/art/**`, `src/audio/**`, `scripts/**`, `docs/**` — shaping.

**In a shaping area**, spend the budget on what can be looked at: skip tests and doc updates, and
say in one line what you did not verify. **In a settled area**, every obligation in the skills
applies as written. **Promotion is deliberate** — moving an area to settled means that same change
adds the tests, the docs, and the `docs/KNOWN_ERRORS.md` entries that shaping deferred.

**The capture never defers.** Item 3 below is not a nicety: `tsc` and Vitest both pass straight
through a boot-time crash, and that has happened here. The phase changes what you write, not
whether you looked at the game.

**Then hardening, once.** This is already live on GitHub Pages on every push to `master`, so the
gate is a re-hardening rather than a first release: work the hardening pass in the `secure-coding`
skill before shipping a change large enough that the game's shape moved. It is short on purpose —
[docs/operational/automation-gaps.md](docs/operational/automation-gaps.md) explains why "low value
at risk" rather than "equivalent coverage" carries the security posture here.

## Definition of done

1. `npm run typecheck` clean.
2. `npm test` fully green.
3. **A capture proving the game still renders** — `tsc` demonstrably misses boot-time crashes, so
   type checking and tests alone do not close a change that touches runtime code.

`npm run verify` runs the first two in order and reports evidence for each, naming any stage that
did not run. It cannot do the third; that judgement is yours.

Commit in coherent chunks with a lowercase conventional prefix and a subject that communicates the
value of the change.
