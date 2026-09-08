import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Structural guards on the capture scripts.
 *
 * The three failure modes this suite protects — a run that hangs, a browser that
 * leaks, two runs that collide — are all invisible when they regress: the script still
 * exits zero and still writes a PNG. Unit tests cover the pure decisions, but the
 * wiring that makes those decisions reachable is only visible in the source, so it is
 * asserted here.
 *
 * Every scan normalises CRLF first (`core.autocrlf` is true in this repo) and every
 * helper **throws** when its marker is missing. A source scan that fails open is worse
 * than no scan, because it reports success — this repo has already paid for that once.
 */
const here = dirname(fileURLToPath(import.meta.url));

function sourceOf(name: string): string {
  const text = readFileSync(join(here, name), "utf8").replace(/\r\n/g, "\n");
  if (text.trim() === "") throw new Error(`${name} is empty; the guards below would assert nothing`);
  return text;
}

const agentShot = sourceOf("agent-shot.ts");
const laneChrome = sourceOf("laneChrome.ts");
const openGame = sourceOf("open-game.ts");

/**
 * The body of a function, found by brace matching rather than by searching for a
 * newline-anchored `}` — the exact scan that CRLF defeated in `shopInterior.test.ts`.
 * Throws when the header is absent or the braces do not balance.
 *
 * The opening brace is located as `{` at end of line, which is what a function body
 * looks like here. Taking the first `{` instead would grab an inline return type such
 * as `Promise<{ pid: number }>` and silently assert against the wrong text.
 */
function bodyOf(src: string, header: string): string {
  const at = src.indexOf(header);
  if (at < 0) throw new Error(`could not find "${header}"; the guard cannot be evaluated`);
  const open = src.indexOf("{\n", at);
  if (open < 0) throw new Error(`no opening brace after "${header}"`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after "${header}"`);
}

function countOf(src: string, pattern: RegExp): number {
  return src.match(pattern)?.length ?? 0;
}

describe("bodyOf", () => {
  it("finds a balanced body and throws instead of failing open", () => {
    expect(bodyOf("function a() {\n  return 1;\n}", "function a()").trim()).toBe("return 1;");
    expect(bodyOf("function a() {\n  if (x) { y(); }\n}", "function a()")).toContain("if (x)");
    expect(() => bodyOf("function a() {\n}", "function missing()")).toThrow(/could not find/);
    expect(() => bodyOf("function a() {\n  {\n", "function a()")).toThrow(/unbalanced braces/);
    expect(() => bodyOf("function a(): void;", "function a()")).toThrow(/no opening brace/);
  });

  it("skips an inline return type and finds the real body", () => {
    const src = "async function f(): Promise<{ pid: number | null }> {\n  return marker;\n}";
    expect(bodyOf(src, "async function f(")).toContain("marker");
  });
});

describe("teardown is wired to every exit path", () => {
  const guards = bodyOf(laneChrome, "export function installExitGuards()");

  it("handles the normal exit as well as every signal that can end a run", () => {
    // A bare try/finally misses all of these. Windows delivers SIGBREAK for Ctrl+Break
    // and SIGHUP when the console window closes.
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
      expect(guards).toContain(signal);
    }
    expect(guards).toContain('process.on("exit"');
    expect(guards).toContain("uncaughtException");
    expect(guards).toContain("unhandledRejection");
  });

  it("actually tears down on each of those paths", () => {
    // The exit hook, the signal loop, and the two error hooks. If a future edit adds a
    // handler that only logs, this count drops and the test fails.
    expect(countOf(guards, /runTeardown\(/g)).toBeGreaterThanOrEqual(4);
  });

  it('keeps teardown synchronous, because process.on("exit") will not await', () => {
    // Asserted on the declarations rather than the bodies: a non-async function cannot
    // contain `await` at all, so this is exact, whereas scanning a body for the word
    // trips over any comment that merely mentions it.
    for (const fn of ["runTeardown", "killTree", "removeProfileDir", "releaseLane", "acquireLane"]) {
      expect(laneChrome, `${fn} must stay synchronous`).toContain(`export function ${fn}(`);
      expect(laneChrome, `${fn} must stay synchronous`).not.toContain(`async function ${fn}(`);
    }
    expect(laneChrome).toContain("execFileSync");
  });

  it("runs cleanups only once, so overlapping exit paths cannot double-kill", () => {
    const teardown = bodyOf(laneChrome, "export function runTeardown(");
    expect(teardown).toContain("if (tornDown) return");
  });
});

describe("the browser is killed as a tree, not as a single process", () => {
  it("passes /T so Chrome's renderer, gpu and crashpad children go too", () => {
    const kill = bodyOf(laneChrome, "export function killTree(");
    expect(kill).toContain('"/T"');
    expect(kill).toContain('"/F"');
  });

  it("verifies the kill instead of trusting taskkill's exit code", () => {
    // Observed: taskkill /T exits non-zero when a child vanishes mid-walk, on a tree it
    // did destroy. The outcome has to be measured.
    expect(bodyOf(laneChrome, "export function killTree(")).toContain("isPidAlive(pid)");
  });

  it("identifies what to kill by profile directory, never by process name", () => {
    const list = bodyOf(laneChrome, "export function listLaneProcesses(");
    expect(list).toContain("kindling-shot-lane");
    expect(list).not.toMatch(/Name\s*=\s*'chrome\.exe'/);
    expect(list).not.toContain("Get-Process chrome");
  });
});

describe("nothing in a run can wait forever", () => {
  it("routes every CDP round-trip through the watchdog", () => {
    // A bare `await cdp.send(...)` is an unbounded wait: if Chrome stops answering, the
    // promise never settles and the run hangs with no output. That is the original sin
    // this script exists to prevent, so the shape is asserted directly.
    expect(countOf(agentShot, /cdp\.send\(/g)).toBeGreaterThanOrEqual(8);
    expect(countOf(agentShot, /await cdp\.send\(/g)).toBe(0);
  });

  it("bounds every http request with an abort signal", () => {
    for (const [name, src] of [
      ["agent-shot.ts", agentShot],
      ["laneChrome.ts", laneChrome],
      ["open-game.ts", openGame],
    ] as const) {
      const calls = countOf(src, /\bfetch\(/g);
      expect(calls, `${name} should still make requests`).toBeGreaterThan(0);
      // A fetch with no signal waits indefinitely on a socket that accepts and then
      // says nothing, which is one of the ways a run used to hang silently.
      expect(countOf(src, /AbortSignal\.timeout/g), `${name} must bound every fetch`).toBeGreaterThanOrEqual(calls);
    }
  });

  it("bounds every synchronous subprocess call", () => {
    for (const [name, src] of [
      ["laneChrome.ts", laneChrome],
      ["open-game.ts", openGame],
    ] as const) {
      const calls = countOf(src, /execFileSync\(/g);
      expect(calls, `${name} should still shell out`).toBeGreaterThan(0);
      expect(countOf(src, /timeout:/g), `${name} must bound every execFileSync`).toBeGreaterThanOrEqual(calls);
    }
  });

  it("fails loudly on expiry rather than exiting zero", () => {
    const start = bodyOf(laneChrome, "  start(): void");
    expect(start).toContain("WATCHDOG");
    expect(start).toContain("runTeardown(");
    expect(start).toContain("process.exit(1)");
    // The diagnostic has to name the step, or the failure is loud but useless.
    expect(start).toContain("currentStep()");
  });

  it("clears its timer so a finished operation cannot hold the process open", () => {
    expect(bodyOf(laneChrome, "export function withTimeout<T>(")).toContain("clearTimeout");
  });

  it("fails an in-flight call when Chrome disappears mid-run", () => {
    expect(agentShot).toContain('this.ws.addEventListener("close"');
    expect(agentShot).toContain("Chrome went away mid-run");
  });
});

describe("a capture is not taken before the game has painted", () => {
  it("gates the first capture on real rendered frames", () => {
    // Deleting the profile each run made every launch cold, and the default 2500ms
    // settle then landed before first paint: the capture came back as flat background,
    // which reads as a broken game rather than a slow one.
    const main = bodyOf(agentShot, "async function main()");
    expect(main).toContain("awaitRendered(");
    expect(main.indexOf("awaitRendered(")).toBeLessThan(main.indexOf("capture(cdp"));
  });

  it("bounds the gate and says so when it expires", () => {
    const gate = bodyOf(agentShot, "async function awaitRendered(");
    expect(gate).toContain("classifyReadiness(");
    expect(gate).toContain('state.kind === "gave-up"');
    expect(gate).toContain('state.kind === "not-a-game"');
    // Every terminal branch must return, or the loop is a hang by construction.
    expect(countOf(gate, /return;/g)).toBeGreaterThanOrEqual(3);
  });

  it("charges every gate to the wall-clock budget, including the extra start clicks", () => {
    // A gate that can spend 12s while the budget does not know about it would just
    // move the timeout failure somewhere less honest.
    const budget = bodyOf(sourceOf("lib/laneProtocol.ts"), "export function computeBudgetMs(");
    expect(budget).toContain("READY_TIMEOUT_MS");
    expect(budget).toContain("startClicks");
  });

  it("re-arms the gate after each start click, relative to the frame it clicked on", () => {
    // The earlier gate is satisfied by the screen being left; the next one has its own
    // first paint, and an absolute threshold would already be met.
    const main = bodyOf(agentShot, "async function main()");
    expect(main).toContain("awaitRendered(evaluate, Math.max(before, 0)");
  });

  it("fails the run when --ready-scene names a screen the game never reached", () => {
    // Frames advance on whatever screen the game is on, so a frame count cannot tell a
    // capture of the shop from a capture of the title. This repo has already shipped
    // that mistake twice; when a caller asserts the scene, a miss must be an error and
    // not a note, or the gate is green while measuring the wrong thing again.
    const gate = bodyOf(agentShot, "async function awaitRendered(");
    expect(gate).toContain('state.kind === "wrong-scene"');
    expect(gate).toMatch(/state\.kind === "wrong-scene"[\s\S]{0,400}throw new Error\(/);
  });

  it("reads the scene keys instead of inferring them from the URL", () => {
    // Deriving "which screen should be up" from the query would couple this script to
    // the game's flow and rot silently the next time that flow changes.
    const read = bodyOf(agentShot, "async function readReadiness(");
    expect(read).toContain("isActive()");
    expect(read).toContain("scene.key");
  });
});

describe("the URL a run navigates to is the one it asked for", () => {
  it("reconciles --url and --query instead of concatenating them", () => {
    // `${BASE}/${QUERY}` turned "--url .../?howto=1" into ".../?howto=1/?howto=0",
    // which loads happily and applies neither parameter.
    expect(agentShot).toContain("resolveNavigationUrl(");
    expect(agentShot).not.toMatch(/\$\{BASE\}\/\$\{QUERY\}/);
    expect(bodyOf(agentShot, "async function main()")).toContain("url: NAV_URL");
  });

  it("refuses a query given in both places rather than silently dropping one", () => {
    const resolve = bodyOf(sourceOf("lib/laneProtocol.ts"), "export function resolveNavigationUrl(");
    expect(resolve).toContain("throw new Error(");
  });
});

describe("two runs cannot collide on one lane", () => {
  it("takes the lane lock before starting a browser", () => {
    const main = bodyOf(agentShot, "async function main()");
    const lock = main.indexOf("acquireLane(");
    const chrome = main.indexOf("prepareChrome(");
    expect(lock).toBeGreaterThan(-1);
    expect(chrome).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(chrome);
  });

  it("refuses a busy lane instead of proceeding alongside it", () => {
    const acquire = bodyOf(laneChrome, "export function acquireLane(");
    expect(acquire).toContain("LaneBusyError");
    expect(acquire).toContain("decision.suggestion");
  });

  it("logs a reclaim rather than taking a lane silently", () => {
    expect(bodyOf(laneChrome, "export function acquireLane(")).toMatch(/reclaim[\s\S]{0,200}note\(/);
  });

  it("releases only its own lock, so a reclaimer's lock survives", () => {
    expect(bodyOf(laneChrome, "export function releaseLane(")).toContain("!== process.pid");
  });
});

describe("the profile directory is not left behind", () => {
  it("removes the profile as part of teardown", () => {
    const prepare = bodyOf(agentShot, "async function prepareChrome(");
    expect(prepare).toContain("onTeardown(");
    expect(prepare).toContain("removeProfileDir(PROFILE)");
    expect(prepare).toContain("killTree(pid)");
  });

  it("registers that teardown before anything else can throw", () => {
    const prepare = bodyOf(agentShot, "async function prepareChrome(");
    // If the spawn/teardown order ever inverts, a failure between them leaks a browser.
    expect(prepare.indexOf("spawn(")).toBeLessThan(prepare.indexOf("onTeardown(`kill lane"));
  });
});

describe("the documented CLI surface is intact", () => {
  it("still accepts every flag other agents depend on", () => {
    for (const flagName of ["lane", "url", "query", "size", "wait", "no-click", "out", "name", "step", "plan", "start-clicks", "ready-scene"]) {
      // `arg()` takes a bare name, while the repeated --step scan compares "--step".
      expect(agentShot, `--${flagName} must keep working`).toMatch(new RegExp(`"(?:--)?${flagName}"`));
    }
  });

  it("still supports every step verb, including the crop form", () => {
    const protocolSrc = sourceOf("lib/laneProtocol.ts");
    for (const verb of ["click", "clickeval", "drag", "wait", "shot", "eval"]) {
      expect(protocolSrc).toContain(`kind === "${verb}"`);
    }
    expect(protocolSrc).toContain("name.png@x,y,w,h[,scale]");
    expect(agentShot).toContain("captureBeyondViewport");
  });

  it("keeps stdout for the documented output only", () => {
    // Other agents parse stdout for shot paths and EVAL lines; progress goes to stderr.
    expect(agentShot).toContain("EVAL ${JSON.stringify");
    expect(agentShot).toContain("CLICKEVAL ${x},${y}");
    expect(laneChrome).toContain("process.stderr.write");
  });
});
