/**
 * Pure rules behind lane-isolated capture: naming, locking, budgets, step grammar and
 * the process-identification predicate the reaper kills by.
 *
 * Everything here is deliberately free of `node:` imports so it stays unit-testable
 * without Chrome and inside `npx tsc --noEmit`, which only reaches typed sources.
 * The impure edges — spawning Chrome, reading files, killing trees — live in
 * `scripts/agent-shot.ts` and call into these functions for every decision.
 */

/** Lane N owns debug port 9400 + N. Ports above this range collide with other tooling. */
export const LANE_PORT_BASE = 9400;
export const LANE_MIN = 0;
export const LANE_MAX = 63;

/** Profile directory basename. The reaper's kill decision hinges on this exact string. */
export const PROFILE_PREFIX = "kindling-shot-lane";
export const LOCK_DIR_NAME = "kindling-lane-locks";

/** First line of a lock file. A file without it is not ours and is never parsed further. */
export const LOCK_MARKER = "kindling-lane-lock v1";

/** Grace beyond a holder's own declared budget before its lock is treated as abandoned. */
export const LOCK_GRACE_MS = 30_000;

/** Ceiling on any single CDP round-trip, so one wedged call cannot consume a whole run. */
export const DEFAULT_OP_TIMEOUT_MS = 20_000;

/** Fixed slice of the budget for launch, debug-port poll, navigate and teardown. */
export const LAUNCH_OVERHEAD_MS = 45_000;

/** Allowance per plan step on top of its own explicit waits. */
export const PER_STEP_ALLOWANCE_MS = 3_000;

export const MIN_BUDGET_MS = 15_000;
export const MAX_BUDGET_MS = 15 * 60_000;

const PROFILE_FLAG = "--user-data-dir=";
const PORT_FLAG = "--remote-debugging-port=";

export function lanePort(lane: number): number {
  return LANE_PORT_BASE + lane;
}

/**
 * Validates a lane, and says what to do about it. The message is the main teaching
 * surface for an agent that reached for a shared browser instead of a lane.
 */
export function parseLane(raw: string | undefined): number {
  const lane = Number(raw ?? "0");
  if (!Number.isInteger(lane) || lane < LANE_MIN || lane > LANE_MAX) {
    throw new Error(
      `--lane must be an integer ${LANE_MIN}-${LANE_MAX}, got ${String(raw)}. ` +
        `Each lane is its own Chrome on port ${LANE_PORT_BASE}+lane; pick one nobody else is using.`,
    );
  }
  return lane;
}

export function laneProfileDirName(lane: number): string {
  return `${PROFILE_PREFIX}${lane}`;
}

/**
 * Inverse of {@link laneProfileDirName}, and the reaper's safety gate: anything whose
 * profile basename is not exactly this shape is somebody else's browser.
 */
export function laneFromProfileDirName(name: string): number | null {
  const m = /^kindling-shot-lane(\d{1,2})$/.exec(name);
  if (!m) return null;
  const lane = Number(m[1]);
  return lane >= LANE_MIN && lane <= LANE_MAX ? lane : null;
}

export function laneLockFileName(lane: number): string {
  return `lane${lane}.lock`;
}

export function laneFromLockFileName(name: string): number | null {
  const m = /^lane(\d{1,2})\.lock$/.exec(name);
  if (!m) return null;
  const lane = Number(m[1]);
  return lane >= LANE_MIN && lane <= LANE_MAX ? lane : null;
}

// ---------------------------------------------------------------------------
// Lock records
// ---------------------------------------------------------------------------

export interface LockRecord {
  lane: number;
  pid: number;
  port: number;
  /** Epoch ms when the holder acquired the lane. */
  startedAt: number;
  /** The holder's own wall-clock budget, so a reader can tell when it must have died. */
  budgetMs: number;
  /** Free text for the diagnostic, e.g. the shot name being captured. */
  label: string;
}

export function formatLockRecord(rec: LockRecord): string {
  return [
    LOCK_MARKER,
    `lane=${rec.lane}`,
    `pid=${rec.pid}`,
    `port=${rec.port}`,
    `startedAt=${rec.startedAt}`,
    `budgetMs=${rec.budgetMs}`,
    `label=${rec.label.replace(/[\r\n]+/g, " ")}`,
    "",
  ].join("\n");
}

/**
 * Reads a lock file body.
 *
 * `core.autocrlf` is true in this repo and a lock written by one tool may be read by
 * another, so line endings are normalised first. A missing marker or field **throws**
 * rather than yielding a half-built record: a lock we cannot read is reported as
 * malformed and reclaimed loudly, never treated as absent.
 */
export function parseLockRecord(text: string): LockRecord {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== LOCK_MARKER) {
    throw new Error(`lock file is missing its "${LOCK_MARKER}" marker line`);
  }
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const at = line.indexOf("=");
    if (at > 0) fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const num = (key: string): number => {
    const raw = fields.get(key);
    if (raw === undefined) throw new Error(`lock file is missing "${key}"`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`lock file has non-numeric "${key}": ${raw}`);
    return value;
  };
  return {
    lane: num("lane"),
    pid: num("pid"),
    port: num("port"),
    startedAt: num("startedAt"),
    budgetMs: num("budgetMs"),
    label: fields.get("label") ?? "",
  };
}

export type LockDecision =
  | { kind: "acquire"; reason: string }
  | { kind: "reclaim"; reason: string; holder: LockRecord | null }
  | { kind: "blocked"; reason: string; holder: LockRecord; suggestion: string };

export interface LockInput {
  lane: number;
  /** Parsed holder, or null when no lock file exists. */
  existing: LockRecord | null;
  /** True when a lock file exists but {@link parseLockRecord} rejected it. */
  malformed?: boolean;
  now: number;
  selfPid: number;
  isHolderAlive: (pid: number) => boolean;
  /** Lanes known to be occupied, used only to suggest an alternative. */
  busyLanes?: readonly number[];
  force?: boolean;
}

/**
 * Decides whether this process may take a lane.
 *
 * A live holder blocks. A dead holder is reclaimed. A holder that is somehow still
 * "alive" long past its own declared budget is also reclaimed, because PIDs get
 * recycled on Windows and a recycled PID would otherwise wedge a lane permanently.
 * Every reclaim carries a reason so the caller can log it — per the idempotency rule,
 * a reclaim must be visible, never silent.
 */
export function classifyLaneLock(input: LockInput): LockDecision {
  const { lane, existing, now, selfPid, isHolderAlive } = input;
  if (input.malformed === true) {
    return { kind: "reclaim", reason: `lock file for lane ${lane} was unreadable`, holder: null };
  }
  if (existing === null) {
    return { kind: "acquire", reason: `lane ${lane} was free` };
  }
  if (existing.pid === selfPid) {
    return { kind: "acquire", reason: `lane ${lane} was already held by this process` };
  }
  if (input.force === true) {
    return { kind: "reclaim", reason: `--force overrode the lock held by pid ${existing.pid}`, holder: existing };
  }
  if (!isHolderAlive(existing.pid)) {
    return { kind: "reclaim", reason: `holder pid ${existing.pid} is gone (stale lock)`, holder: existing };
  }
  const age = now - existing.startedAt;
  const allowed = existing.budgetMs + LOCK_GRACE_MS;
  if (age > allowed) {
    return {
      kind: "reclaim",
      reason:
        `holder pid ${existing.pid} is ${age}ms old, past its own ${existing.budgetMs}ms budget ` +
        `plus ${LOCK_GRACE_MS}ms grace, so the pid has almost certainly been recycled`,
      holder: existing,
    };
  }
  return {
    kind: "blocked",
    reason: `lane ${lane} is held by live pid ${existing.pid}, started ${age}ms ago (${existing.label})`,
    holder: existing,
    suggestion: `use --lane ${suggestFreeLane(lane, input.busyLanes ?? [])}`,
  };
}

/** Lowest lane that is neither requested nor known-busy. Lane 0 is skipped: it is the default and collides most. */
export function suggestFreeLane(requested: number, busy: readonly number[]): number {
  const taken = new Set<number>([requested, ...busy, 0]);
  for (let lane = 1; lane <= LANE_MAX; lane += 1) {
    if (!taken.has(lane)) return lane;
  }
  return LANE_MAX;
}

// ---------------------------------------------------------------------------
// Process identification
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  pid: number;
  parentPid: number;
  commandLine: string;
}

export interface LaneProcess extends ProcessInfo {
  lane: number;
  /** True for the browser process, which is the one that owns the debug port. */
  ownsDebugPort: boolean;
}

/**
 * Extracts a `--user-data-dir` value.
 *
 * Returns null when the value cannot be delimited with confidence — an unquoted path
 * containing spaces, for instance. Failing closed matters here: an unattributed
 * process is left alone and reported, never killed on a guess.
 */
export function profileDirFromCommandLine(commandLine: string): string | null {
  const at = commandLine.indexOf(PROFILE_FLAG);
  if (at < 0) return null;
  const rest = commandLine.slice(at + PROFILE_FLAG.length);
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    return end < 1 ? null : rest.slice(1, end);
  }
  const end = rest.search(/\s/);
  const value = end < 0 ? rest : rest.slice(0, end);
  return value === "" ? null : value;
}

/** Trailing path segment of a profile directory, for either separator style. */
export function profileDirBasename(dir: string): string {
  const trimmed = dir.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/**
 * The reaper's core predicate: which lane, if any, does this command line belong to?
 *
 * Identification is by **profile directory**, never by process name. Every process in
 * a Chrome tree carries `--user-data-dir` (verified: browser, renderers, gpu-process,
 * utility and crashpad-handler all do), whereas only the browser and its renderers
 * carry `--remote-debugging-port`. Matching on the port would therefore strand the
 * GPU and utility children. A profile basename of exactly `kindling-shot-laneN` is
 * something only this script creates, so the user's own Chrome can never match.
 */
export function laneOfCommandLine(commandLine: string): number | null {
  const dir = profileDirFromCommandLine(commandLine);
  if (dir === null) return null;
  return laneFromProfileDirName(profileDirBasename(dir));
}

export function commandLineOwnsLanePort(commandLine: string, lane: number): boolean {
  const flag = `${PORT_FLAG}${lanePort(lane)}`;
  const at = commandLine.indexOf(flag);
  if (at < 0) return false;
  const after = commandLine.charAt(at + flag.length);
  return after === "" || /\s/.test(after);
}

export interface ClassifiedProcesses {
  /** Processes confidently attributed to a lane in scope. */
  matched: LaneProcess[];
  /**
   * Command lines that mention the profile prefix but could not be attributed — an
   * unquoted path with spaces, say. Reported rather than reaped, so a miss is loud.
   */
  unattributed: ProcessInfo[];
}

/**
 * Partitions a process list into lane-owned and unattributable.
 *
 * `lanes` of "all" scopes to every lane; a list scopes to those lanes only. Anything
 * whose profile does not resolve to a lane in scope is simply absent from both
 * buckets, which is what keeps the user's personal Chrome out of reach.
 */
export function classifyProcesses(procs: readonly ProcessInfo[], lanes: readonly number[] | "all"): ClassifiedProcesses {
  const scope = lanes === "all" ? null : new Set(lanes);
  const matched: LaneProcess[] = [];
  const unattributed: ProcessInfo[] = [];
  for (const proc of procs) {
    const lane = laneOfCommandLine(proc.commandLine);
    if (lane === null) {
      if (mentionsLaneProfileWithoutOwningOne(proc.commandLine)) unattributed.push(proc);
      continue;
    }
    if (scope !== null && !scope.has(lane)) continue;
    matched.push({ ...proc, lane, ownsDebugPort: commandLineOwnsLanePort(proc.commandLine, lane) });
  }
  return { matched, unattributed };
}

/**
 * Whether a command line looks like a browser we failed to attribute, as opposed to a
 * process that merely mentions the profile prefix in passing.
 *
 * Both halves are required. The process query itself matches `%kindling-shot-lane%` —
 * that string is in its own command line — and so does any shell or editor that names
 * a profile path. None of those carry a `--user-data-dir` flag, so demanding the flag
 * keeps the warning meaningful instead of firing on every run.
 */
function mentionsLaneProfileWithoutOwningOne(commandLine: string): boolean {
  return commandLine.includes(PROFILE_FLAG) && commandLine.includes(PROFILE_PREFIX);
}

/**
 * Roots to hand `taskkill /T`, so a whole tree dies from one call.
 *
 * A process whose parent is also in the set is reached through that parent. A process
 * whose parent has already exited is its own root, which is exactly the orphan case.
 */
export function killRoots(matched: readonly LaneProcess[]): LaneProcess[] {
  const pids = new Set(matched.map((p) => p.pid));
  return matched.filter((p) => !pids.has(p.parentPid));
}

// ---------------------------------------------------------------------------
// Budgets and timeouts
// ---------------------------------------------------------------------------

export interface BudgetInput {
  /** Raw `--budget` value, when the caller pinned one. */
  explicit?: string | undefined;
  /** The `--wait` settle time, charged once for navigate and again for the start click. */
  waitMs: number;
  noClick: boolean;
  steps: readonly Step[];
}

/**
 * Wall-clock budget for a whole run.
 *
 * Derived from the work actually requested rather than a flat constant, so a long
 * plan is not killed for being long while a short one still fails fast. An explicit
 * `--budget` wins outright.
 */
export function computeBudgetMs(input: BudgetInput): number {
  if (input.explicit !== undefined) {
    const explicit = Number(input.explicit);
    if (!Number.isFinite(explicit) || explicit <= 0) {
      throw new Error(`--budget must be a positive number of milliseconds, got ${input.explicit}`);
    }
    return Math.min(Math.round(explicit), MAX_BUDGET_MS);
  }
  const waits = input.steps.reduce((sum, step) => (step.kind === "wait" ? sum + step.ms : sum), 0);
  const settle = input.waitMs + (input.noClick ? 0 : input.waitMs);
  // The render gate runs on every path and can spend its full timeout on a slow
  // machine, so it is charged to the budget rather than silently eating into it.
  const total = LAUNCH_OVERHEAD_MS + READY_TIMEOUT_MS + settle + waits + input.steps.length * PER_STEP_ALLOWANCE_MS;
  return Math.min(Math.max(total, MIN_BUDGET_MS), MAX_BUDGET_MS);
}

export function remainingMs(deadlineAt: number, now: number): number {
  return deadlineAt - now;
}

/**
 * Timeout for one operation: the per-call cap, shortened when less budget is left.
 * Zero or less means the budget is spent and the caller must abort instead of waiting.
 */
export function operationTimeoutMs(input: { remaining: number; cap?: number }): number {
  const cap = input.cap ?? DEFAULT_OP_TIMEOUT_MS;
  if (input.remaining <= 0) return 0;
  return Math.max(1, Math.min(cap, input.remaining));
}

// ---------------------------------------------------------------------------
// Render readiness
// ---------------------------------------------------------------------------

/**
 * Frames the game must have drawn before a capture is trusted.
 *
 * A fixed sleep cannot express this. Headless Chrome renders through SwiftShader, and
 * the first paint of this game at 1920x1080 on a cold profile can land well after the
 * default 2500ms settle — which produces a screenshot of the page background that
 * looks like a broken game rather than a slow one. Counting frames adapts to whatever
 * the machine is actually doing.
 */
export const DEFAULT_MIN_READY_FRAMES = 90;
export const READY_POLL_INTERVAL_MS = 250;
export const READY_TIMEOUT_MS = 12_000;

/** Polls before concluding the page is not the game at all. */
export const READY_ABSENT_POLLS = 3;

/** Sentinel for "the game global is not present on this page". */
export const NO_GAME_FRAME = -1;

export type ReadyState =
  | { kind: "ready"; frame: number }
  | { kind: "waiting"; frame: number }
  | { kind: "not-a-game" }
  | { kind: "gave-up"; frame: number };

export interface ReadinessInput {
  /** Current render frame, or {@link NO_GAME_FRAME} when the global is absent. */
  frame: number;
  elapsedMs: number;
  pollCount: number;
  minFrames?: number;
  timeoutMs?: number;
}

/**
 * Decides whether the page has rendered enough to photograph.
 *
 * Giving up is a normal outcome, not an error: a slow machine still gets its capture,
 * with a note saying the gate expired. Only a genuinely absent game global short
 * circuits, so `--url` pointed at something else still works.
 */
export function classifyReadiness(input: ReadinessInput): ReadyState {
  const minFrames = input.minFrames ?? DEFAULT_MIN_READY_FRAMES;
  const timeoutMs = input.timeoutMs ?? READY_TIMEOUT_MS;
  if (input.frame >= minFrames) return { kind: "ready", frame: input.frame };
  if (input.frame < 0 && input.pollCount >= READY_ABSENT_POLLS) return { kind: "not-a-game" };
  if (input.elapsedMs >= timeoutMs) return { kind: "gave-up", frame: input.frame };
  return { kind: "waiting", frame: input.frame };
}

// ---------------------------------------------------------------------------
// Step grammar
// ---------------------------------------------------------------------------

export interface ShotClip {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export type Step =
  | { kind: "click"; x: number; y: number }
  | { kind: "clickeval"; expression: string }
  | { kind: "drag"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "wait"; ms: number }
  | { kind: "shot"; name: string; clip: ShotClip | null }
  | { kind: "eval"; expression: string };

const DEFAULT_CROP_SCALE = 3;

/** `name.png`, or `name.png@x,y,w,h[,scale]` for a magnified crop. */
export function parseShotSpec(spec: string): { name: string; clip: ShotClip | null } {
  const [name, region] = spec.split("@");
  if (name === undefined || name === "") throw new Error(`shot needs a file name, got "${spec}"`);
  if (region === undefined) return { name, clip: null };
  const [x, y, w, h, scale] = region.split(",").map(Number);
  if ([x, y, w, h].some((n) => n === undefined || !Number.isFinite(n))) {
    throw new Error(`shot crop needs "name.png@x,y,w,h[,scale]", got "${spec}"`);
  }
  return {
    name,
    clip: { x: x!, y: y!, width: w!, height: h!, scale: scale !== undefined && Number.isFinite(scale) ? scale : DEFAULT_CROP_SCALE },
  };
}

const UNKNOWN_STEP_HELP = "expected click:x,y | clickeval:expr | drag:x1,y1,x2,y2 | wait:ms | shot:name | eval:expr";

/**
 * Parses one step of the plan grammar.
 *
 * The body is everything after the first colon, rejoined, so an `eval:` expression may
 * contain colons of its own. Malformed numbers throw here, before Chrome is launched,
 * rather than reaching CDP as NaN and producing a run that looks like it worked.
 */
export function parseStep(raw: string): Step {
  const [kind, ...rest] = raw.split(":");
  const body = rest.join(":");
  if (kind === "click") return { kind: "click", ...pair(body, `click needs two numbers "click:x,y", got "${body}"`) };
  if (kind === "clickeval") {
    if (body === "") throw new Error(`clickeval needs an expression, got "${raw}"`);
    return { kind: "clickeval", expression: body };
  }
  if (kind === "drag") {
    const [x1, y1, x2, y2] = body.split(",").map(Number);
    if ([x1, y1, x2, y2].some((n) => n === undefined || Number.isNaN(n))) {
      throw new Error(`drag needs four numbers "drag:x1,y1,x2,y2", got "${body}"`);
    }
    return { kind: "drag", x1: x1!, y1: y1!, x2: x2!, y2: y2! };
  }
  if (kind === "wait") {
    const ms = Number(body);
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`wait needs milliseconds "wait:ms", got "${body}"`);
    return { kind: "wait", ms };
  }
  if (kind === "shot") return { kind: "shot", ...parseShotSpec(body) };
  if (kind === "eval") {
    if (body === "") throw new Error(`eval needs an expression, got "${raw}"`);
    return { kind: "eval", expression: body };
  }
  throw new Error(`unknown step "${raw}" (${UNKNOWN_STEP_HELP})`);
}

/**
 * Splits a `--plan` file into step lines.
 *
 * Normalises CRLF before splitting, because `core.autocrlf` is true here and a plan
 * authored on Windows otherwise leaves a trailing `\r` inside the last field of every
 * step — which turns an `eval` expression into a syntax error at the far end of CDP.
 */
export function parsePlanText(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function parseSize(raw: string): [number, number] {
  const [w, h] = raw.split("x").map(Number);
  if (w === undefined || h === undefined || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`--size needs "WxH" in CSS pixels, got "${raw}"`);
  }
  return [w, h];
}

function pair(body: string, message: string): { x: number; y: number } {
  const [x, y] = body.split(",").map(Number);
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error(message);
  return { x, y };
}
