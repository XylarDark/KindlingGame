/**
 * The impure half of lane-isolated capture: spawning and reaping Chrome, holding a
 * lane lock, and the watchdog that guarantees a run ends.
 *
 * Every decision this module makes is delegated to the pure predicates in
 * `lib/laneProtocol.ts`, which are unit-tested without Chrome. What lives here is
 * only the part that touches the operating system.
 *
 * Two design rules earn their keep:
 *
 *   1. **Teardown is synchronous.** `process.on("exit")` will not await a promise, so
 *      an async cleanup silently does nothing on the paths that matter most. Every
 *      teardown step here is `execFileSync` or `rmSync`, which means the same code
 *      works from a normal return, a throw, an unhandled rejection and a signal.
 *   2. **Nothing waits forever.** Each CDP round-trip, the debug-port poll and the
 *      process queries all carry their own timeout, under an overall wall-clock
 *      budget. A run that dies loudly beats a run that hangs silently.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_OP_TIMEOUT_MS,
  LOCK_DIR_NAME,
  classifyLaneLock,
  classifyProcesses,
  formatLockRecord,
  killRoots,
  laneFromLockFileName,
  laneFromProfileDirName,
  laneLockFileName,
  lanePort,
  laneProfileDirName,
  operationTimeoutMs,
  parseLockRecord,
  remainingMs,
  type LaneProcess,
  type LockRecord,
  type ProcessInfo,
} from "./lib/laneProtocol";

export function tempRoot(): string {
  return process.env.TEMP ?? process.env.TMPDIR ?? "/tmp";
}

export function laneProfileDir(lane: number): string {
  return join(tempRoot(), laneProfileDirName(lane));
}

export function lockDir(): string {
  return join(tempRoot(), LOCK_DIR_NAME);
}

export function laneLockPath(lane: number): string {
  return join(lockDir(), laneLockFileName(lane));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Operational chatter, on stderr.
 *
 * `agent-shot.ts` has a stdout contract other agents parse — shot paths, `EVAL` and
 * `CLICKEVAL` lines and nothing else — so progress and reclaim notices must not go
 * there.
 */
export function note(message: string): void {
  process.stderr.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// Teardown that cannot be skipped
// ---------------------------------------------------------------------------

type Cleanup = { label: string; run: () => void };

const cleanups: Cleanup[] = [];
let tornDown = false;
let describeStep: () => string = () => "startup";

/** Registers a synchronous cleanup. Later registrations run first, unwinding the stack. */
export function onTeardown(label: string, run: () => void): void {
  cleanups.push({ label, run });
}

export function setStepDescriber(fn: () => string): void {
  describeStep = fn;
}

export function currentStep(): string {
  return describeStep();
}

/**
 * Runs every registered cleanup exactly once.
 *
 * Idempotent by design: the signal path, the throw path and the normal path all call
 * it, and on a real teardown several of them fire in sequence. A failing cleanup is
 * reported and the rest still run — a half-completed teardown still beats none.
 */
export function runTeardown(reason: string): void {
  if (tornDown) return;
  tornDown = true;
  const startedAt = Date.now();
  for (const cleanup of [...cleanups].reverse()) {
    const at = Date.now();
    try {
      cleanup.run();
    } catch (err) {
      note(`teardown step "${cleanup.label}" failed after ${reason}: ${String(err)}`);
    }
    // Teardown is the part of a run that used to be invisible. Reporting anything slow
    // keeps the wall-clock guarantee auditable instead of assumed.
    const took = Date.now() - at;
    if (took > 250) note(`teardown: ${cleanup.label} took ${took}ms`);
  }
  note(`teardown after ${reason} completed in ${Date.now() - startedAt}ms`);
}

/**
 * Wires teardown to every exit path Node can tell us about.
 *
 * `exit` covers normal return and explicit `process.exit`. The signal handlers cover
 * Ctrl+C and a kill from another process; on Windows `SIGBREAK` is Ctrl+Break and
 * `SIGHUP` is delivered when the console window closes. The two error hooks catch the
 * cases a bare `try/finally` misses entirely, because an unhandled rejection unwinds
 * nothing.
 */
export function installExitGuards(): void {
  process.on("exit", () => runTeardown("exit"));
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK", "SIGQUIT"] as const) {
    process.on(signal, () => {
      console.error(`\n${signal} during "${currentStep()}" -- tearing down lane resources`);
      runTeardown(signal);
      process.exit(1);
    });
  }
  process.on("uncaughtException", (err) => {
    console.error(`uncaught exception during "${currentStep()}":`);
    console.error(err);
    runTeardown("uncaughtException");
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    console.error(`unhandled rejection during "${currentStep()}":`);
    console.error(err);
    runTeardown("unhandledRejection");
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------

export class BudgetExhausted extends Error {}

/**
 * Bounds a run in wall-clock time and every operation inside it.
 *
 * The timer is the backstop that makes a hang impossible: whatever the run is
 * awaiting, at the deadline it prints the step it died on, tears down and exits
 * non-zero. `guard` additionally shortens each individual timeout as the budget runs
 * out, so a run does not spend its last second starting a twenty-second wait.
 */
export class Watchdog {
  readonly startedAt = Date.now();
  readonly deadlineAt: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly budgetMs: number) {
    this.deadlineAt = this.startedAt + budgetMs;
  }

  start(): void {
    this.timer = setTimeout(() => {
      console.error(
        `\nWATCHDOG: lane run exceeded its ${this.budgetMs}ms budget while in "${currentStep()}".\n` +
          `  Nothing was hanging silently -- this run is being killed on purpose.\n` +
          `  Raise it with --budget <ms> if the plan legitimately needs longer.`,
      );
      runTeardown("watchdog");
      process.exit(1);
    }, this.budgetMs);
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  remaining(): number {
    return remainingMs(this.deadlineAt, Date.now());
  }

  /** Timeout for the next operation, or a throw if the budget is already spent. */
  guard(label: string, cap = DEFAULT_OP_TIMEOUT_MS): number {
    const ms = operationTimeoutMs({ remaining: this.remaining(), cap });
    if (ms === 0) throw new BudgetExhausted(`budget of ${this.budgetMs}ms exhausted before "${label}"`);
    return ms;
  }

  /** Runs `work` under both the per-operation cap and whatever budget is left. */
  async run<T>(label: string, work: () => Promise<T>, cap?: number): Promise<T> {
    return withTimeout(work(), this.guard(label, cap), label);
  }
}

/**
 * Rejects if `promise` has not settled in time.
 *
 * The timer is always cleared, so a resolved operation never holds the event loop
 * open — which would itself look like a hang at the end of an otherwise fine run.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms during "${label}"`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

/**
 * Every process whose command line mentions a lane profile directory.
 *
 * Deliberately **not** filtered by image name. Identification is by profile path (see
 * `laneOfCommandLine`), so a Chrome under a different name or path is still found, and
 * the user's own Chrome — which never carries a `kindling-shot-laneN` profile — is
 * never even returned. The WQL pre-filter is exactly the superset the classifier
 * needs, which keeps the query small without narrowing what can be detected.
 */
export function listLaneProcesses(timeoutMs = 20_000): ProcessInfo[] {
  if (process.platform !== "win32") return listLaneProcessesPosix();
  const script =
    "Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%kindling-shot-lane%'\" " +
    "| Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress -Depth 3";
  let raw: string;
  try {
    raw = execFileSync("powershell", [...PS_ARGS, script], {
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    console.error(`could not enumerate processes (${String(err)}); treating the lane as unknown`);
    return [];
  }
  return parseProcessJson(raw);
}

/** `ConvertTo-Json` emits a bare object for a single row and omits output entirely for none. */
export function parseProcessJson(raw: string): ProcessInfo[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("process query returned unparseable JSON; treating the lane as unknown");
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out: ProcessInfo[] = [];
  for (const row of rows) {
    const r = row as { ProcessId?: number; ParentProcessId?: number; CommandLine?: string | null };
    if (typeof r.ProcessId !== "number" || typeof r.CommandLine !== "string") continue;
    out.push({ pid: r.ProcessId, parentPid: r.ParentProcessId ?? 0, commandLine: r.CommandLine });
  }
  return out;
}

function listLaneProcessesPosix(): ProcessInfo[] {
  try {
    const raw = execFileSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8", timeout: 20_000 });
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ pid: Number(m[1]), parentPid: Number(m[2]), commandLine: m[3]! }));
  } catch {
    return [];
  }
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as { code?: string }).code === "EPERM";
  }
}

/**
 * Kills a process and everything it spawned.
 *
 * Chrome's renderer, GPU, utility and crashpad children are separate processes;
 * killing only the parent can orphan them, which is where "endless browsers" comes
 * from. `taskkill /T` walks the tree — verified on a real launch to take a 8-process
 * tree to zero — and `/F` is required because a headless Chrome will not shut down on
 * a polite request once its debug socket is gone.
 */
export function killTree(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        timeout: 15_000,
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Deliberately ignored. `taskkill /T` exits non-zero when any child vanishes while
    // it walks the tree, which happens constantly with Chrome's renderers -- observed
    // reporting failure on a tree it had in fact destroyed. The exit code is not
    // evidence, so the outcome is measured below instead of inferred here.
  }
  return !isPidAlive(pid);
}

/** Kills whole trees for a set of lane processes, including orphans whose parent is gone. */
export function killLaneProcesses(matched: readonly LaneProcess[]): number {
  let killed = 0;
  for (const root of killRoots(matched)) {
    if (killTree(root.pid)) killed += 1;
  }
  return killed;
}

// ---------------------------------------------------------------------------
// Profile directories
// ---------------------------------------------------------------------------

export interface ProfileDirInfo {
  lane: number;
  path: string;
  modifiedAt: number;
  /** Measured at scan time: after a reap the directory is gone and would report zero. */
  sizeMb: number;
}

/** Lane profile directories present under the temp root, whatever their state. */
export function listProfileDirs(): ProfileDirInfo[] {
  const root = tempRoot();
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const out: ProfileDirInfo[] = [];
  for (const name of names) {
    const lane = laneFromProfileDirName(name);
    if (lane === null) continue;
    const path = join(root, name);
    try {
      const st = statSync(path);
      if (st.isDirectory()) out.push({ lane, path, modifiedAt: st.mtimeMs, sizeMb: dirSizeMb(path) });
    } catch {
      // Vanished between listing and stat; nothing to clean.
    }
  }
  return out.sort((a, b) => a.lane - b.lane);
}

/**
 * How long teardown may spend deleting a profile before deferring to `--cleanup`.
 *
 * Teardown runs after the watchdog has done its job, so nothing else bounds it. An
 * unbounded delete is a hang by another name: one was measured at 37 seconds against a
 * directory Chrome still held handles on.
 */
export const PROFILE_REMOVAL_BUDGET_MS = 5_000;

/**
 * Removes a profile directory, retrying within a fixed budget.
 *
 * Windows keeps a handle open for a moment after a kill, so the first attempt often
 * fails with EBUSY on a directory that is about to be removable. Retries are a
 * synchronous busy-wait because this runs from the exit handler, where nothing async
 * will execute. On expiry it gives up and says so; the reaper collects the remains.
 */
export function removeProfileDir(path: string, budgetMs = PROFILE_REMOVAL_BUDGET_MS): boolean {
  if (!existsSync(path)) return true;
  const deadline = Date.now() + budgetMs;
  do {
    try {
      // maxRetries stays 0: rmSync's own retries block per directory entry, and on a
      // profile of several thousand files that turned a teardown into 37 seconds.
      rmSync(path, { recursive: true, force: true, maxRetries: 0 });
      if (!existsSync(path)) return true;
    } catch {
      // Fall through and retry until the budget runs out.
    }
    const until = Math.min(Date.now() + 200, deadline);
    while (Date.now() < until) {
      /* sync backoff: the exit handler cannot await */
    }
  } while (Date.now() < deadline);
  return !existsSync(path);
}

export function dirSizeMb(path: string): number {
  let total = 0;
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          total += statSync(full).size;
        } catch {
          // Unreadable file; skip.
        }
      }
    }
  };
  walk(path);
  return Math.round((total / (1024 * 1024)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Lane lock
// ---------------------------------------------------------------------------

export interface LockScan {
  lane: number;
  path: string;
  record: LockRecord | null;
  malformed: boolean;
}

export function readLock(lane: number): LockScan {
  const path = laneLockPath(lane);
  if (!existsSync(path)) return { lane, path, record: null, malformed: false };
  try {
    // The lock may have been written by another tool on a CRLF checkout; parseLockRecord
    // normalises and throws rather than handing back a half-built record.
    return { lane, path, record: parseLockRecord(readFileSync(path, "utf8")), malformed: false };
  } catch {
    return { lane, path, record: null, malformed: true };
  }
}

export function listLocks(): LockScan[] {
  let names: string[];
  try {
    names = readdirSync(lockDir());
  } catch {
    return [];
  }
  return names
    .map((name) => laneFromLockFileName(name))
    .filter((lane): lane is number => lane !== null)
    .sort((a, b) => a - b)
    .map((lane) => readLock(lane));
}

export function busyLanes(): number[] {
  return listLocks()
    .filter((scan) => scan.record !== null && isPidAlive(scan.record.pid))
    .map((scan) => scan.lane);
}

export class LaneBusyError extends Error {}

/**
 * Takes exclusive ownership of a lane, or fails fast saying who holds it.
 *
 * The lock is what makes the rest of the design sound: because a run cannot start
 * while another holds the lane, any live Chrome found on our lane while we hold the
 * lock is by definition an orphan, and reclaiming it is safe.
 */
export function acquireLane(lane: number, budgetMs: number, label: string, force: boolean): void {
  mkdirSync(lockDir(), { recursive: true });
  const scan = readLock(lane);
  const decision = classifyLaneLock({
    lane,
    existing: scan.record,
    malformed: scan.malformed,
    now: Date.now(),
    selfPid: process.pid,
    isHolderAlive: isPidAlive,
    busyLanes: busyLanes(),
    force,
  });

  if (decision.kind === "blocked") {
    throw new LaneBusyError(
      `lane ${lane} is busy: ${decision.reason}.\n` +
        `  ${decision.suggestion}, or wait for pid ${decision.holder.pid} to finish.\n` +
        `  If you are certain that process is gone: npx tsx scripts/agent-shot.ts --cleanup --lane ${lane}`,
    );
  }
  if (decision.kind === "reclaim") {
    // Idempotency rule: a reclaim is logged, never silent.
    note(`lane ${lane}: reclaiming lock -- ${decision.reason}`);
  }

  const record: LockRecord = {
    lane,
    pid: process.pid,
    port: lanePort(lane),
    startedAt: Date.now(),
    budgetMs,
    label,
  };
  writeFileSync(scan.path, formatLockRecord(record), "utf8");
  onTeardown(`release lane ${lane} lock`, () => releaseLane(lane));
}

/** Releases the lock only if we still hold it, so a reclaimer's lock is never deleted. */
export function releaseLane(lane: number): void {
  const scan = readLock(lane);
  if (scan.record !== null && scan.record.pid !== process.pid) return;
  rmSync(laneLockPath(lane), { force: true });
}

// ---------------------------------------------------------------------------
// Chrome health
// ---------------------------------------------------------------------------

export interface LaneHealth {
  port: number;
  browser: string;
}

/**
 * Asks the lane's debug port who it is, under a hard timeout.
 *
 * A bare `fetch` with no signal will wait indefinitely on a socket that accepts and
 * then says nothing, which is one of the ways a run used to hang with no output.
 */
export async function laneHealth(lane: number, timeoutMs = 1_500): Promise<LaneHealth | null> {
  const port = lanePort(lane);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { Browser?: string };
    return { port, browser: body.Browser ?? "unknown" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reaper
// ---------------------------------------------------------------------------

export interface ReapReport {
  scope: string;
  processes: LaneProcess[];
  unattributed: ProcessInfo[];
  staleLocks: LockScan[];
  liveLocks: LockScan[];
  profileDirs: ProfileDirInfo[];
  killed: number;
  removedProfiles: string[];
  removedLocks: number[];
  skipped: string[];
}

/**
 * Finds and reaps everything this script could have left behind.
 *
 * Safe at any time. It can only ever act on processes whose `--user-data-dir` resolves
 * to a `kindling-shot-laneN` directory, on lock files named `laneN.lock`, and on
 * profile directories with that exact name — three things nothing else on the machine
 * creates. It never matches on process name, so the user's own Chrome is out of scope
 * by construction rather than by care.
 */
export function reap(lanes: readonly number[] | "all", options: { dryRun: boolean }): ReapReport {
  const scope = lanes === "all" ? "all lanes" : `lane${lanes.length === 1 ? "" : "s"} ${lanes.join(", ")}`;
  const inScope = (lane: number): boolean => lanes === "all" || lanes.includes(lane);
  const { matched, unattributed } = classifyProcesses(listLaneProcesses(), lanes);

  const locks = listLocks().filter((scan) => inScope(scan.lane));
  const staleLocks = locks.filter((scan) => scan.malformed || scan.record === null || !isPidAlive(scan.record.pid));
  const liveLocks = locks.filter((scan) => !staleLocks.includes(scan));
  const heldLanes = new Set(liveLocks.map((scan) => scan.lane));

  const profileDirs = listProfileDirs().filter((dir) => inScope(dir.lane));

  const report: ReapReport = {
    scope,
    processes: matched,
    unattributed,
    staleLocks,
    liveLocks,
    profileDirs,
    killed: 0,
    removedProfiles: [],
    removedLocks: [],
    skipped: [],
  };

  // A lane whose lock is held by a live process belongs to that run, not to us.
  for (const lane of heldLanes) {
    report.skipped.push(`lane ${lane}: left alone, its lock is held by a live process`);
  }
  if (options.dryRun) {
    report.skipped.push("--dry-run: nothing was killed or deleted");
    return report;
  }

  report.killed = killLaneProcesses(matched.filter((proc) => !heldLanes.has(proc.lane)));
  for (const scan of staleLocks) {
    rmSync(scan.path, { force: true });
    report.removedLocks.push(scan.lane);
  }
  for (const dir of profileDirs) {
    if (heldLanes.has(dir.lane)) continue;
    if (removeProfileDir(dir.path)) report.removedProfiles.push(dir.path);
    else report.skipped.push(`${dir.path}: could not be removed, something still holds a handle`);
  }
  return report;
}

export function printReapReport(report: ReapReport): void {
  console.log(`cleanup scope: ${report.scope}`);
  if (report.processes.length === 0) console.log("  processes: none found");
  for (const proc of report.processes) {
    console.log(`  process pid ${proc.pid} (parent ${proc.parentPid}) lane ${proc.lane}${proc.ownsDebugPort ? " [debug port]" : ""}`);
  }
  for (const proc of report.unattributed) {
    console.error(
      `  WARNING: pid ${proc.pid} mentions a lane profile but its --user-data-dir could not be delimited, ` +
        `so it was left alone. Command line: ${proc.commandLine}`,
    );
  }
  for (const scan of report.liveLocks) {
    console.log(`  lock lane ${scan.lane}: live, held by pid ${scan.record?.pid ?? "?"}`);
  }
  for (const scan of report.staleLocks) {
    console.log(`  lock lane ${scan.lane}: stale${scan.malformed ? " (unreadable)" : ""}`);
  }
  for (const dir of report.profileDirs) {
    console.log(`  profile ${dir.path} (${dir.sizeMb} MB)`);
  }
  console.log(
    `reaped: ${report.killed} process tree(s), ${report.removedLocks.length} lock(s), ${report.removedProfiles.length} profile dir(s)`,
  );
  for (const note of report.skipped) console.log(`  skipped -- ${note}`);
}
