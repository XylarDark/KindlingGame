/**
 * Lane-isolated screenshot for parallel agents.
 *
 * Each lane gets its own Chrome process, debug port and profile directory, so any
 * number of agents can capture at the same time without contending for one browser.
 *
 *   npx tsx scripts/agent-shot.ts --lane 1 --name shop.png
 *   npx tsx scripts/agent-shot.ts --lane 2 --query "?howto=0&shot=drive" --wait 4000
 *
 * With no steps it writes one PNG and prints its absolute path. Steps drive an ordered
 * sequence instead, so a run can click a control and read the resulting state:
 *
 *   click:x,y    left click at CSS pixels in the emulated viewport
 *   clickeval:expr    click where `expr` says, for targets that move between runs
 *   drag:x1,y1,x2,y2  press, move in steps, release — the only way to work a slider
 *   wait:ms      sleep
 *   shot:name    capture a PNG under the output directory
 *                `shot:name.png@x,y,w,h[,scale]` crops and magnifies (scale 3 default)
 *   eval:expr    evaluate JS in the page, printed as `EVAL <json>`
 *
 * Pass them inline with repeated `--step`, or — required for anything with double
 * quotes, which the Windows `npx` cmd shim strips — one per line in a `--plan` file:
 *
 *   npx tsx scripts/agent-shot.ts --lane 7 --size 1920x1080 --plan tmp/settings.steps
 *
 * `--size 1920x1080` makes CSS pixels equal the game's design coordinates 1:1, so
 * design-space positions can be clicked directly.
 *
 * ## Why this script exists, and why it cannot hang or leak
 *
 * The `cursor-ide-browser` MCP tools drive a **single shared tab**. Three agents
 * reaching for it at once hung all three for 46 minutes with no error and no output.
 * This script replaces it, and is built so the three failure modes that cost this
 * project time are structurally impossible:
 *
 *   - **Hangs.** A watchdog bounds the whole run in wall-clock time, and every CDP
 *     round-trip, debug-port poll and process query carries its own timeout. On expiry
 *     the run names the step it died on, tears down and exits non-zero.
 *   - **Leaked browsers.** Teardown is synchronous and wired to every exit path
 *     (return, throw, unhandled rejection, SIGINT/SIGTERM/SIGBREAK/SIGHUP), kills the
 *     whole process tree rather than just the parent, and deletes the profile
 *     directory it created. A verification sweep then confirms nothing survived.
 *   - **Colliding runs.** A per-lane lock file records pid and start time. A lane held
 *     by a live process fails fast and names the holder; a stale lock is reclaimed and
 *     the reclaim is logged.
 *
 * `--cleanup` reaps orphans at any time; `--cleanup --all` covers every lane. It is
 * scoped strictly to processes whose profile directory is `kindling-shot-laneN`, so it
 * cannot touch your own Chrome.
 *
 * Stdout carries only the documented output — shot paths, `EVAL` and `CLICKEVAL`
 * lines. Progress and diagnostics go to stderr, so existing parsers keep working.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BudgetExhausted,
  LaneBusyError,
  Watchdog,
  acquireLane,
  installExitGuards,
  killLaneProcesses,
  killTree,
  laneHealth,
  laneProfileDir,
  listLaneProcesses,
  note,
  onTeardown,
  printReapReport,
  reap,
  removeProfileDir,
  runTeardown,
  setStepDescriber,
  sleep,
  withTimeout,
} from "./laneChrome";
import {
  DEFAULT_MIN_READY_FRAMES,
  NO_GAME_FRAME,
  READY_POLL_INTERVAL_MS,
  classifyProcesses,
  classifyReadiness,
  computeBudgetMs,
  lanePort,
  parseLane,
  parsePlanText,
  parseSize,
  parseStep,
  type ShotClip,
  type Step,
} from "./lib/laneProtocol";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Repeated `--step` values, in the order given, followed by any `--plan` file.
 *
 * Prefer `--plan` for anything containing double quotes: `npx` on Windows is a cmd
 * shim that silently strips them, so an inline `--step eval:...` arrives as invalid JS.
 */
function rawSteps(): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === "--step" && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]!);
  });
  const plan = arg("plan");
  if (plan !== undefined) {
    // core.autocrlf is true here, so normalise before splitting; a trailing \r turns an
    // eval expression into a syntax error at the far end of CDP.
    out.push(...parsePlanText(readFileSync(plan, "utf8")));
  }
  return out;
}

const LANE = parseLane(arg("lane", process.env.KINDLING_LANE ?? "0"));
const PORT = lanePort(LANE);
const BASE = arg("url", process.env.KINDLING_URL ?? "http://127.0.0.1:5174")!.replace(/\/$/, "");
const QUERY = arg("query", "?howto=0")!;
const OUT = arg("out", process.env.KINDLING_SHOT_OUT ?? join(process.env.TEMP ?? "/tmp", "kindling-shots"))!;
const NAME = arg("name", `lane${LANE}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)!;
const [W, H] = parseSize(arg("size", "1280x720") ?? "1280x720");
const WAIT = Number(arg("wait", "2500"));
const NO_CLICK = flag("no-click");
const PROFILE = laneProfileDir(LANE);
const CHROME =
  process.env.CHROME_PATH ??
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");

/** How long to keep polling for Chrome's debug port before declaring the launch failed. */
const PORT_POLL_BUDGET_MS = 15_000;
const PORT_POLL_INTERVAL_MS = 250;
const PORT_POLL_FETCH_TIMEOUT_MS = 2_000;

class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private closed: Error | null = null;

  async connect(wsUrl: string, timeoutMs: number): Promise<void> {
    this.ws = new WebSocket(wsUrl);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        this.ws.addEventListener("open", () => resolve());
        this.ws.addEventListener("error", () => reject(new Error("cdp websocket failed")));
      }),
      timeoutMs,
      "cdp connect",
    );
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
    // If Chrome dies mid-run the socket closes and every in-flight call would otherwise
    // wait forever. Failing them immediately turns a silent hang into a real error.
    this.ws.addEventListener("close", () => {
      this.closed = new Error("cdp websocket closed -- Chrome went away mid-run");
      for (const [id, p] of this.pending) {
        this.pending.delete(id);
        p.reject(this.closed);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed !== null) return Promise.reject(this.closed);
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed; nothing to do.
    }
  }
}

/** `--cleanup` alone reaps the given lane; with `--all` it reaps every lane. */
function runCleanup(): void {
  const lanes = flag("all") ? ("all" as const) : [LANE];
  const report = reap(lanes, { dryRun: flag("dry-run") });
  printReapReport(report);
}

/**
 * Makes sure the lane has exactly one healthy Chrome, and that we own it.
 *
 * Because the lock is already held, any Chrome answering on this lane is an orphan
 * from a run that died. The default is to kill it and relaunch clean: the game
 * persists music preferences in `localStorage`, which lives in the profile directory,
 * so adopting a dirty profile could silently change what a capture shows. `--reuse`
 * opts into adopting it as a fast path where that risk is acceptable.
 */
async function prepareChrome(watchdog: Watchdog): Promise<{ pid: number | null; adopted: boolean }> {
  const existing = await watchdog.run("probe lane health", () => laneHealth(LANE), 4_000);
  const reuse = flag("reuse");

  if (existing !== null && reuse) {
    note(`lane ${LANE}: reusing the Chrome already listening on port ${PORT} (${existing.browser}) -- --reuse was given`);
    onTeardown(`reap adopted Chrome on lane ${LANE}`, () => {
      reapLane("adopted");
      // Adopting did not create the profile, but the lock proves nobody else owns it,
      // so leaving it behind would just be the disk leak under a different name.
      if (!flag("keep-profile")) removeProfileDir(PROFILE);
    });
    return { pid: null, adopted: true };
  }

  if (existing !== null) {
    note(
      `lane ${LANE}: found an orphaned Chrome on port ${PORT} (${existing.browser}). ` +
        `Relaunching clean rather than reusing it, because the game stores settings in localStorage ` +
        `inside the profile and stale state would change what this capture shows. Pass --reuse to adopt it instead.`,
    );
    reapLane("orphan");
    // The profile must go too, otherwise the relaunch inherits exactly the stale
    // localStorage this branch exists to avoid.
    if (!removeProfileDir(PROFILE)) note(`lane ${LANE}: could not clear ${PROFILE}; this capture may inherit stale settings`);
  } else if (existsSync(PROFILE) && !flag("keep-profile")) {
    // The port is silent but a profile survives, so a previous run did not finish. Any
    // Chrome still holding that profile is wedged and will never answer; enumerate and
    // kill it. When the profile is absent no lane Chrome can exist, which is the common
    // case and skips a process query worth about a second and a half.
    //
    // `--keep-profile` opts out: it exists to keep a warm shader cache between runs,
    // which wiping the directory here would defeat.
    const { matched } = classifyProcesses(listLaneProcesses(), [LANE]);
    if (matched.length > 0) {
      note(`lane ${LANE}: ${matched.length} process(es) alive but the debug port is silent -- killing the wedged tree`);
      killLaneProcesses(matched);
    }
    note(`lane ${LANE}: clearing a profile left behind by an unfinished run`);
    removeProfileDir(PROFILE);
  }

  mkdirSync(PROFILE, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      `--window-size=${W},${H}`,
      `--user-data-dir=${PROFILE}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const pid = chrome.pid ?? null;
  if (pid === null) throw new Error(`could not spawn Chrome from ${CHROME}`);
  // A spawn failure surfaces here; the debug-port poll then fails with the full
  // diagnostic rather than this handler unwinding a half-registered teardown.
  chrome.on("error", (err) => note(`lane ${LANE}: Chrome failed to start from ${CHROME}: ${err.message}`));

  // Registered before anything can throw, so every later failure still tears down.
  onTeardown(`kill lane ${LANE} Chrome (pid ${pid}) and remove its profile`, () => {
    killTree(pid);
    reapLane("teardown");
    if (!flag("keep-profile") && !removeProfileDir(PROFILE)) {
      note(`lane ${LANE}: profile ${PROFILE} could not be removed; "--cleanup --lane ${LANE}" will get it later`);
    }
  });
  return { pid, adopted: false };
}

/**
 * Kills every process on this lane and reports what it found.
 *
 * This is the verification half of teardown: killing our own pid tree is the fast
 * path, but only an enumeration can show that nothing survived. A green teardown that
 * measured nothing is exactly the kind of check this repo has been burned by.
 */
function reapLane(context: string): number {
  const { matched, unattributed } = classifyProcesses(listLaneProcesses(), [LANE]);
  for (const proc of unattributed) {
    note(`lane ${LANE}: WARNING pid ${proc.pid} mentions a lane profile but could not be attributed; left alone`);
  }
  if (matched.length === 0) return 0;
  const killed = killLaneProcesses(matched);
  note(`lane ${LANE}: ${context} sweep killed ${killed} process tree(s) covering ${matched.length} process(es)`);
  return killed;
}

/** Polls the debug port until a page target appears, with a timeout on each attempt. */
async function awaitPageTarget(watchdog: Watchdog): Promise<{ webSocketDebuggerUrl: string; type: string }> {
  type Target = { webSocketDebuggerUrl: string; type: string };
  const until = Date.now() + Math.min(PORT_POLL_BUDGET_MS, Math.max(1, watchdog.remaining()));
  let lastErr = "";
  while (Date.now() < until) {
    await sleep(PORT_POLL_INTERVAL_MS);
    try {
      // A bare fetch can wait indefinitely on a socket that accepts and stays silent.
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, {
        signal: AbortSignal.timeout(PORT_POLL_FETCH_TIMEOUT_MS),
      });
      const list = (await res.json()) as Target[];
      const page = list.find((t) => t.type === "page");
      if (page) return page;
      lastErr = "no page target in /json/list";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(
    `no Chrome page target on lane ${LANE} (port ${PORT}) within ${PORT_POLL_BUDGET_MS}ms: ${lastErr}\n` +
      `  Chrome may have failed to start. Check CHROME_PATH, then try: npx tsx scripts/agent-shot.ts --cleanup --lane ${LANE}`,
  );
}

/**
 * Waits until the game has drawn enough frames to be worth photographing.
 *
 * Headless Chrome renders in software, so first paint of this game at 1920x1080 on a
 * cold profile can land after the `--wait` settle has already elapsed. The result was
 * a screenshot of the page background — a capture that looks like a broken game and
 * would have been reported as one. Counting real frames adapts to the machine instead
 * of guessing a sleep, and it is bounded, so a page that never renders still returns.
 *
 * `--no-ready-wait` restores the old fixed-sleep behaviour; `--min-frames` retunes it.
 */
async function awaitRendered(evaluate: (expression: string) => Promise<unknown>): Promise<void> {
  if (flag("no-ready-wait")) return;
  const minFrames = Number(arg("min-frames", String(DEFAULT_MIN_READY_FRAMES)));
  const startedAt = Date.now();
  for (let poll = 1; ; poll += 1) {
    const raw = await evaluate(
      "(function () { var g = window.kindlingGame; return g && g.loop ? g.loop.frame : -1; })()",
    );
    const frame = typeof raw === "number" ? raw : NO_GAME_FRAME;
    const state = classifyReadiness({ frame, elapsedMs: Date.now() - startedAt, pollCount: poll, minFrames });
    if (state.kind === "ready") return;
    if (state.kind === "not-a-game") {
      note(`lane ${LANE}: no game global on this page, skipping the render gate`);
      return;
    }
    if (state.kind === "gave-up") {
      note(
        `lane ${LANE}: only ${state.frame} frames rendered in ${Date.now() - startedAt}ms (wanted ${minFrames}); ` +
          `capturing anyway, but treat a blank image as "still painting" rather than broken`,
      );
      return;
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }
}

async function capture(cdp: Cdp, watchdog: Watchdog, name: string, clip: ShotClip | null): Promise<void> {
  const params: Record<string, unknown> = { format: "png" };
  if (clip !== null) {
    params.clip = clip;
    params.captureBeyondViewport = true;
  }
  const shot = (await watchdog.run(`capture ${name}`, () => cdp.send("Page.captureScreenshot", params))) as { data: string };
  const path = join(OUT, name);
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  console.log(path);
}

async function main(): Promise<void> {
  if (flag("cleanup")) {
    runCleanup();
    return;
  }

  mkdirSync(OUT, { recursive: true });

  // Grammar errors throw here, before Chrome is launched, so a bad plan costs nothing
  // and cannot reach CDP as a NaN coordinate that silently captures the wrong thing.
  const plan: Step[] = rawSteps().map(parseStep);
  const budgetMs = computeBudgetMs({ explicit: arg("budget", process.env.KINDLING_SHOT_BUDGET_MS), waitMs: WAIT, noClick: NO_CLICK, steps: plan });

  installExitGuards();
  const watchdog = new Watchdog(budgetMs);
  let step = "acquiring lane";
  setStepDescriber(() => step);
  watchdog.start();
  onTeardown("stop watchdog", () => watchdog.stop());

  acquireLane(LANE, budgetMs, plan.length === 0 ? NAME : `${plan.length} step plan`, flag("force"));
  note(`lane ${LANE}: port ${PORT}, profile ${PROFILE}, budget ${budgetMs}ms`);

  step = "starting Chrome";
  const { adopted } = await prepareChrome(watchdog);

  step = "waiting for the debug port";
  const page = await awaitPageTarget(watchdog);

  step = "connecting to CDP";
  const cdp = new Cdp();
  await cdp.connect(page.webSocketDebuggerUrl, watchdog.guard("cdp connect", 10_000));
  await watchdog.run("Page.enable", () => cdp.send("Page.enable"));
  await watchdog.run("set device metrics", () =>
    cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }),
  );

  step = `navigating to ${BASE}/${QUERY}`;
  await watchdog.run("Page.navigate", () => cdp.send("Page.navigate", { url: `${BASE}/${QUERY}` }));
  await sleep(WAIT);

  const click = async (x: number, y: number): Promise<void> => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await watchdog.run(`click ${x},${y}`, () =>
        cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }),
      );
    }
  };

  /** Sliders only respond to pointermove between press and release, so interpolate. */
  const drag = async (x1: number, y1: number, x2: number, y2: number): Promise<void> => {
    await watchdog.run("drag press", () =>
      cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", buttons: 1, clickCount: 1 }),
    );
    const legs = 8;
    for (let i = 1; i <= legs; i += 1) {
      const t = i / legs;
      await watchdog.run("drag move", () =>
        cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: x1 + (x2 - x1) * t,
          y: y1 + (y2 - y1) * t,
          button: "left",
          buttons: 1,
        }),
      );
      await sleep(20);
    }
    await watchdog.run("drag release", () =>
      cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", buttons: 0, clickCount: 1 }),
    );
  };

  const evaluate = async (expression: string): Promise<unknown> => {
    // awaitPromise lets a step await a dynamic import; it is a no-op on plain values.
    const res = (await watchdog.run("eval", () =>
      cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
    )) as {
      result: { value: unknown };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (res.exceptionDetails) {
      // `text` is a bare "Uncaught" on a syntax error; the description carries the reason.
      const why = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text;
      throw new Error(`eval failed: ${why}\n  expression: ${expression}`);
    }
    return res.result.value;
  };

  // The game boots paused; a click on the canvas starts play.
  if (!NO_CLICK) {
    step = "clicking the canvas to start play";
    await click(W / 2, H / 2);
    await sleep(WAIT);
  }

  step = "waiting for the game to render";
  await awaitRendered(evaluate);

  for (const [index, item] of plan.entries()) {
    step = `step ${index + 1}/${plan.length} (${item.kind})`;
    if (item.kind === "click") {
      await click(item.x, item.y);
    } else if (item.kind === "drag") {
      await drag(item.x1, item.y1, item.x2, item.y2);
    } else if (item.kind === "wait") {
      await sleep(item.ms);
    } else if (item.kind === "shot") {
      await capture(cdp, watchdog, item.name, item.clip);
    } else if (item.kind === "eval") {
      // Screenshots of a backgrounded tab can be stale; read state instead of trusting pixels.
      console.log(`EVAL ${JSON.stringify(await evaluate(item.expression))}`);
    } else {
      // Half this game's click targets move -- walk-ins walk in, and the ticket seed is
      // Date.now() -- so a plan has to compute the point at the moment it clicks.
      const at = await evaluate(item.expression);
      const [x, y] = String(at).split(",").map(Number);
      if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error(`clickeval must return "x,y", got ${JSON.stringify(at)}\n  expression: ${item.expression}`);
      }
      console.log(`CLICKEVAL ${x},${y}`);
      await click(x, y);
    }
  }

  if (plan.length === 0) await capture(cdp, watchdog, NAME, null);

  step = "tearing down";
  cdp.close();
  watchdog.stop();
  if (adopted) note(`lane ${LANE}: adopted Chrome is being reaped so the lane is left clean`);
  runTeardown("success");
}

main().catch((err) => {
  if (err instanceof LaneBusyError) {
    // A collision is a normal outcome, not a crash: say who has the lane and move on.
    console.error(String(err.message));
  } else if (err instanceof BudgetExhausted) {
    console.error(`${err.message}\n  Raise it with --budget <ms> if the plan legitimately needs longer.`);
  } else {
    console.error(err);
  }
  runTeardown("error");
  process.exit(1);
});
