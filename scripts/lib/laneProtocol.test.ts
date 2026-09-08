import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_READY_FRAMES,
  DEFAULT_OP_TIMEOUT_MS,
  LAUNCH_OVERHEAD_MS,
  LOCK_GRACE_MS,
  LOCK_MARKER,
  MAX_BUDGET_MS,
  MIN_BUDGET_MS,
  NO_GAME_FRAME,
  PER_STEP_ALLOWANCE_MS,
  READY_ABSENT_POLLS,
  READY_TIMEOUT_MS,
  classifyLaneLock,
  classifyReadiness,
  classifyProcesses,
  commandLineOwnsLanePort,
  computeBudgetMs,
  formatLockRecord,
  killRoots,
  laneFromLockFileName,
  laneFromProfileDirName,
  laneOfCommandLine,
  laneLockFileName,
  lanePort,
  laneProfileDirName,
  operationTimeoutMs,
  parseLane,
  parseLockRecord,
  parsePlanText,
  parseShotSpec,
  parseSize,
  parseStep,
  profileDirBasename,
  profileDirFromCommandLine,
  remainingMs,
  suggestFreeLane,
  type LockRecord,
  type ProcessInfo,
} from "./laneProtocol";

const lock = (over: Partial<LockRecord> = {}): LockRecord => ({
  lane: 2,
  pid: 4242,
  port: 9402,
  startedAt: 1_000_000,
  budgetMs: 60_000,
  label: "shop.png",
  ...over,
});

const alive = (): boolean => true;
const dead = (): boolean => false;

describe("lane naming", () => {
  it("maps a lane to its dedicated debug port", () => {
    expect(lanePort(0)).toBe(9400);
    expect(lanePort(2)).toBe(9402);
    expect(lanePort(63)).toBe(9463);
  });

  it("accepts every valid lane and rejects the rest", () => {
    expect(parseLane("0")).toBe(0);
    expect(parseLane("63")).toBe(63);
    expect(parseLane(undefined)).toBe(0);
    expect(() => parseLane("64")).toThrow(/--lane must be an integer 0-63/);
    expect(() => parseLane("-1")).toThrow(/--lane must be an integer/);
    expect(() => parseLane("2.5")).toThrow(/--lane must be an integer/);
    expect(() => parseLane("banana")).toThrow(/--lane must be an integer/);
  });

  it("explains the lane model in the rejection, so the fix is at hand", () => {
    expect(() => parseLane("99")).toThrow(/own Chrome on port 9400\+lane/);
  });

  it("round-trips profile directory names", () => {
    for (const lane of [0, 2, 9, 63]) {
      expect(laneFromProfileDirName(laneProfileDirName(lane))).toBe(lane);
    }
  });

  it("round-trips lock file names", () => {
    for (const lane of [0, 7, 63]) {
      expect(laneFromLockFileName(laneLockFileName(lane))).toBe(lane);
    }
  });

  it("refuses profile names that only resemble a lane", () => {
    expect(laneFromProfileDirName("kindling-shots")).toBeNull();
    expect(laneFromProfileDirName("kindling-shot-lane")).toBeNull();
    expect(laneFromProfileDirName("kindling-shot-lane2-backup")).toBeNull();
    expect(laneFromProfileDirName("kindling-shot-lane64")).toBeNull();
    expect(laneFromProfileDirName("my-kindling-shot-lane2")).toBeNull();
    expect(laneFromProfileDirName("kindling-promo-chrome")).toBeNull();
  });
});

describe("lock records", () => {
  it("round-trips through format and parse", () => {
    const rec = lock();
    expect(parseLockRecord(formatLockRecord(rec))).toEqual(rec);
  });

  it("parses a lock written with CRLF endings", () => {
    const crlf = formatLockRecord(lock()).replace(/\n/g, "\r\n");
    expect(parseLockRecord(crlf)).toEqual(lock());
  });

  it("throws on a missing marker rather than failing open", () => {
    expect(() => parseLockRecord("lane=2\npid=1\nport=9402\nstartedAt=0\nbudgetMs=1\n")).toThrow(
      new RegExp(`missing its "${LOCK_MARKER}" marker`),
    );
    expect(() => parseLockRecord("")).toThrow(/missing its/);
    expect(() => parseLockRecord("something else entirely")).toThrow(/missing its/);
  });

  it("throws on a missing or unparseable field", () => {
    const body = `${LOCK_MARKER}\nlane=2\npid=1\nport=9402\nstartedAt=0\n`;
    expect(() => parseLockRecord(body)).toThrow(/missing "budgetMs"/);
    expect(() => parseLockRecord(`${body}budgetMs=soon\n`)).toThrow(/non-numeric "budgetMs"/);
  });

  it("keeps a label on one line so it cannot forge extra fields", () => {
    const text = formatLockRecord(lock({ label: "line one\nlane=99" }));
    expect(parseLockRecord(text).lane).toBe(2);
  });
});

describe("classifyLaneLock", () => {
  const base = { lane: 2, now: 1_000_000, selfPid: 777, isHolderAlive: alive };

  it("acquires a free lane", () => {
    const decision = classifyLaneLock({ ...base, existing: null });
    expect(decision.kind).toBe("acquire");
  });

  it("blocks on a live holder and names it", () => {
    const decision = classifyLaneLock({ ...base, existing: lock(), now: 1_030_000 });
    expect(decision.kind).toBe("blocked");
    if (decision.kind !== "blocked") throw new Error("expected blocked");
    expect(decision.holder.pid).toBe(4242);
    expect(decision.reason).toContain("held by live pid 4242");
    expect(decision.reason).toContain("shop.png");
    expect(decision.suggestion).toMatch(/--lane \d+/);
  });

  it("reclaims a lock whose holder has died", () => {
    const decision = classifyLaneLock({ ...base, existing: lock(), isHolderAlive: dead });
    expect(decision.kind).toBe("reclaim");
    if (decision.kind !== "reclaim") throw new Error("expected reclaim");
    expect(decision.reason).toContain("stale lock");
    expect(decision.reason).toContain("4242");
  });

  it("reclaims a lock past the holder's own budget, because pids get recycled", () => {
    const held = lock({ budgetMs: 60_000 });
    const justInside = classifyLaneLock({ ...base, existing: held, now: held.startedAt + 60_000 + LOCK_GRACE_MS });
    expect(justInside.kind).toBe("blocked");

    const justOutside = classifyLaneLock({ ...base, existing: held, now: held.startedAt + 60_000 + LOCK_GRACE_MS + 1 });
    expect(justOutside.kind).toBe("reclaim");
    if (justOutside.kind !== "reclaim") throw new Error("expected reclaim");
    expect(justOutside.reason).toContain("recycled");
  });

  it("reclaims an unreadable lock", () => {
    const decision = classifyLaneLock({ ...base, existing: null, malformed: true });
    expect(decision.kind).toBe("reclaim");
    if (decision.kind !== "reclaim") throw new Error("expected reclaim");
    expect(decision.reason).toContain("unreadable");
  });

  it("is re-entrant for the same process", () => {
    expect(classifyLaneLock({ ...base, existing: lock({ pid: 777 }) }).kind).toBe("acquire");
  });

  it("lets --force take a live lane, and says so", () => {
    const decision = classifyLaneLock({ ...base, existing: lock(), force: true });
    expect(decision.kind).toBe("reclaim");
    if (decision.kind !== "reclaim") throw new Error("expected reclaim");
    expect(decision.reason).toContain("--force");
  });

  it("always produces a reason, so no outcome can be silent", () => {
    const cases = [
      classifyLaneLock({ ...base, existing: null }),
      classifyLaneLock({ ...base, existing: lock() }),
      classifyLaneLock({ ...base, existing: lock(), isHolderAlive: dead }),
      classifyLaneLock({ ...base, existing: null, malformed: true }),
    ];
    for (const decision of cases) expect(decision.reason.length).toBeGreaterThan(0);
  });
});

describe("suggestFreeLane", () => {
  it("skips the requested lane and lane 0", () => {
    expect(suggestFreeLane(1, [])).toBe(2);
    expect(suggestFreeLane(2, [])).toBe(1);
    expect(suggestFreeLane(0, [])).toBe(1);
  });

  it("skips lanes known to be busy", () => {
    expect(suggestFreeLane(2, [1, 3, 4])).toBe(5);
  });
});

describe("process identification", () => {
  const laneCmd = (lane: number, extra = ""): string =>
    `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --headless=new --disable-gpu ` +
    `--remote-debugging-port=${lanePort(lane)} --user-data-dir=C:\\Users\\User\\AppData\\Local\\Temp\\kindling-shot-lane${lane} ${extra}about:blank`;

  it("extracts an unquoted profile directory", () => {
    expect(profileDirFromCommandLine(laneCmd(2))).toBe("C:\\Users\\User\\AppData\\Local\\Temp\\kindling-shot-lane2");
  });

  it("extracts a quoted profile directory containing spaces", () => {
    const cmd = 'chrome.exe --user-data-dir="C:\\Users\\First Last\\AppData\\Local\\Temp\\kindling-shot-lane3" about:blank';
    expect(profileDirFromCommandLine(cmd)).toBe("C:\\Users\\First Last\\AppData\\Local\\Temp\\kindling-shot-lane3");
    expect(laneOfCommandLine(cmd)).toBe(3);
  });

  it("returns null when there is no profile flag at all", () => {
    expect(profileDirFromCommandLine('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"')).toBeNull();
  });

  it("takes the basename off either separator style", () => {
    expect(profileDirBasename("C:\\Temp\\kindling-shot-lane2")).toBe("kindling-shot-lane2");
    expect(profileDirBasename("/tmp/kindling-shot-lane2/")).toBe("kindling-shot-lane2");
  });

  it("attributes every process in a lane tree, not just the ones holding the port", () => {
    // Verified against a real launch: browser and renderers carry the debug port,
    // while gpu-process, utility and crashpad-handler carry only the profile.
    const gpu = laneCmd(2).replace(`--remote-debugging-port=${lanePort(2)} `, "") + " --type=gpu-process";
    expect(laneOfCommandLine(gpu)).toBe(2);
    expect(commandLineOwnsLanePort(gpu, 2)).toBe(false);
    expect(commandLineOwnsLanePort(laneCmd(2), 2)).toBe(true);
  });

  it("does not confuse one lane's port with another's", () => {
    expect(commandLineOwnsLanePort(laneCmd(2), 3)).toBe(false);
    // 9402 must not satisfy a prefix match against 940
    expect(commandLineOwnsLanePort("chrome --remote-debugging-port=9402 --user-data-dir=x", 0)).toBe(false);
  });

  it("never attributes the user's own Chrome", () => {
    const personal = [
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --type=renderer --lang=en-GB',
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="C:\\Users\\User\\AppData\\Local\\Google\\Chrome\\User Data"',
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --profile-directory="Profile 1"',
      // A personal window that merely happens to have the game open.
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" http://127.0.0.1:5174/',
      // Even a debug port on the personal profile is not ours.
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9402',
    ];
    for (const cmd of personal) expect(laneOfCommandLine(cmd)).toBeNull();
    expect(classifyProcesses(personal.map((commandLine, i) => ({ pid: i + 1, parentPid: 1, commandLine })), "all").matched).toEqual([]);
  });

  it("leaves this repo's other chrome profiles alone", () => {
    for (const dir of ["kindling-promo-chrome", "kindling-phone-chrome", "kindling-qa", "kindling-shots"]) {
      expect(laneOfCommandLine(`chrome.exe --user-data-dir=C:\\Temp\\${dir}`)).toBeNull();
    }
  });

  it("scopes to the requested lanes", () => {
    const procs: ProcessInfo[] = [
      { pid: 10, parentPid: 1, commandLine: laneCmd(2) },
      { pid: 11, parentPid: 10, commandLine: laneCmd(2, "--type=renderer ") },
      { pid: 20, parentPid: 1, commandLine: laneCmd(7) },
    ];
    expect(classifyProcesses(procs, [2]).matched.map((p) => p.pid)).toEqual([10, 11]);
    expect(classifyProcesses(procs, [7]).matched.map((p) => p.pid)).toEqual([20]);
    expect(classifyProcesses(procs, "all").matched).toHaveLength(3);
    expect(classifyProcesses(procs, []).matched).toEqual([]);
  });

  it("reports a profile it cannot delimit instead of guessing", () => {
    // An unquoted path with spaces cannot be delimited; failing closed is the safe
    // direction, but the miss must be visible rather than a silent no-op.
    const cmd = "chrome.exe --user-data-dir=C:\\Users\\First Last\\Temp\\kindling-shot-lane2 about:blank";
    expect(laneOfCommandLine(cmd)).toBeNull();
    const { matched, unattributed } = classifyProcesses([{ pid: 5, parentPid: 1, commandLine: cmd }], "all");
    expect(matched).toEqual([]);
    expect(unattributed.map((p) => p.pid)).toEqual([5]);
  });

  it("does not report unrelated processes as unattributed", () => {
    const { unattributed } = classifyProcesses([{ pid: 5, parentPid: 1, commandLine: "notepad.exe" }], "all");
    expect(unattributed).toEqual([]);
  });

  it("ignores a process that merely names a lane profile without owning one", () => {
    // Observed for real: the process query's own command line contains the WQL pattern
    // '%kindling-shot-lane%', so it matched its own filter and was reported as an
    // unattributable browser on every single run.
    const bystanders = [
      "powershell -NoProfile -Command Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%kindling-shot-lane%'\"",
      "node scripts/agent-shot.ts --cleanup --lane 2",
      "code C:\\Users\\User\\AppData\\Local\\Temp\\kindling-shot-lane2\\Default\\Preferences",
      "cmd.exe /c rmdir /s /q C:\\Temp\\kindling-shot-lane2",
    ];
    for (const commandLine of bystanders) {
      const { matched, unattributed } = classifyProcesses([{ pid: 9, parentPid: 1, commandLine }], "all");
      expect(matched).toEqual([]);
      expect(unattributed).toEqual([]);
    }
  });
});

describe("killRoots", () => {
  const proc = (pid: number, parentPid: number) => ({
    pid,
    parentPid,
    commandLine: `chrome --user-data-dir=C:\\Temp\\kindling-shot-lane2`,
    lane: 2,
    ownsDebugPort: false,
  });

  it("returns only the tree root when the parent is present", () => {
    const roots = killRoots([proc(10, 1), proc(11, 10), proc(12, 10), proc(13, 11)]);
    expect(roots.map((p) => p.pid)).toEqual([10]);
  });

  it("treats an orphan whose parent is gone as its own root", () => {
    const roots = killRoots([proc(11, 10), proc(12, 10)]);
    expect(roots.map((p) => p.pid)).toEqual([11, 12]);
  });

  it("handles an empty set", () => {
    expect(killRoots([])).toEqual([]);
  });
});

describe("budget arithmetic", () => {
  it("honours an explicit budget", () => {
    expect(computeBudgetMs({ explicit: "5000", waitMs: 2500, noClick: false, steps: [] })).toBe(5000);
  });

  it("clamps an explicit budget to the ceiling", () => {
    expect(computeBudgetMs({ explicit: String(MAX_BUDGET_MS * 4), waitMs: 0, noClick: true, steps: [] })).toBe(MAX_BUDGET_MS);
  });

  it("rejects a nonsense budget", () => {
    for (const bad of ["0", "-1", "soon", ""]) {
      expect(() => computeBudgetMs({ explicit: bad, waitMs: 0, noClick: true, steps: [] })).toThrow(/--budget must be a positive/);
    }
  });

  it("charges the settle wait and a second render gate when it clicks to start play", () => {
    const clicked = computeBudgetMs({ waitMs: 2500, noClick: false, steps: [] });
    const notClicked = computeBudgetMs({ waitMs: 2500, noClick: true, steps: [] });
    // Starting play costs another settle plus the shop scene's own first paint.
    expect(clicked - notClicked).toBe(2500 + READY_TIMEOUT_MS);
    expect(notClicked).toBe(LAUNCH_OVERHEAD_MS + READY_TIMEOUT_MS + 2500);
  });

  it("charges the render gate, which runs on every path", () => {
    expect(computeBudgetMs({ waitMs: 0, noClick: true, steps: [] })).toBeGreaterThanOrEqual(READY_TIMEOUT_MS);
  });

  it("adds every explicit wait plus a per-step allowance, so a long plan is not cut off", () => {
    const steps = [parseStep("wait:30000"), parseStep("shot:a.png"), parseStep("wait:5000")];
    const budget = computeBudgetMs({ waitMs: 1000, noClick: true, steps });
    expect(budget).toBe(LAUNCH_OVERHEAD_MS + READY_TIMEOUT_MS + 1000 + 35_000 + 3 * PER_STEP_ALLOWANCE_MS);
    expect(budget).toBeLessThan(MAX_BUDGET_MS);
  });

  it("never returns less than the floor or more than the ceiling", () => {
    expect(computeBudgetMs({ waitMs: 0, noClick: true, steps: [] })).toBeGreaterThanOrEqual(MIN_BUDGET_MS);
    const huge = Array.from({ length: 200 }, () => parseStep("wait:60000"));
    expect(computeBudgetMs({ waitMs: 0, noClick: true, steps: huge })).toBe(MAX_BUDGET_MS);
  });

  it("measures the time left against a deadline", () => {
    expect(remainingMs(1_000, 400)).toBe(600);
    expect(remainingMs(1_000, 1_000)).toBe(0);
    expect(remainingMs(1_000, 1_400)).toBe(-400);
  });

  it("caps one operation, but never lets it outlive the run", () => {
    expect(operationTimeoutMs({ remaining: 60_000 })).toBe(DEFAULT_OP_TIMEOUT_MS);
    expect(operationTimeoutMs({ remaining: 5_000 })).toBe(5_000);
    expect(operationTimeoutMs({ remaining: 60_000, cap: 1_500 })).toBe(1_500);
  });

  it("reports no time at all once the budget is spent, so the caller aborts instead of waiting", () => {
    expect(operationTimeoutMs({ remaining: 0 })).toBe(0);
    expect(operationTimeoutMs({ remaining: -1 })).toBe(0);
  });
});

describe("classifyReadiness", () => {
  const base = { elapsedMs: 0, pollCount: 1 };

  it("is ready once the frame threshold is met", () => {
    expect(classifyReadiness({ ...base, frame: DEFAULT_MIN_READY_FRAMES })).toEqual({
      kind: "ready",
      frame: DEFAULT_MIN_READY_FRAMES,
    });
    expect(classifyReadiness({ ...base, frame: 5, minFrames: 5 }).kind).toBe("ready");
  });

  it("keeps waiting while frames are still accumulating", () => {
    expect(classifyReadiness({ ...base, frame: 10 })).toEqual({ kind: "waiting", frame: 10 });
  });

  it("gives up rather than waiting forever, and reports the frame it reached", () => {
    const state = classifyReadiness({ frame: 12, elapsedMs: READY_TIMEOUT_MS, pollCount: 40 });
    expect(state).toEqual({ kind: "gave-up", frame: 12 });
  });

  it("prefers ready over gave-up when both apply on the same poll", () => {
    expect(classifyReadiness({ frame: 500, elapsedMs: READY_TIMEOUT_MS * 2, pollCount: 99 }).kind).toBe("ready");
  });

  it("concludes the page is not the game only after several absent polls", () => {
    // One missing read is just an early poll; --url may also point somewhere else
    // entirely, and that has to keep working.
    expect(classifyReadiness({ ...base, frame: NO_GAME_FRAME, pollCount: 1 }).kind).toBe("waiting");
    expect(classifyReadiness({ ...base, frame: NO_GAME_FRAME, pollCount: READY_ABSENT_POLLS }).kind).toBe("not-a-game");
  });
});

describe("step grammar", () => {
  it("parses each documented step", () => {
    expect(parseStep("click:100,200")).toEqual({ kind: "click", x: 100, y: 200 });
    expect(parseStep("drag:1,2,3,4")).toEqual({ kind: "drag", x1: 1, y1: 2, x2: 3, y2: 4 });
    expect(parseStep("wait:250")).toEqual({ kind: "wait", ms: 250 });
    expect(parseStep("shot:a.png")).toEqual({ kind: "shot", name: "a.png", clip: null });
    expect(parseStep("eval:1+1")).toEqual({ kind: "eval", expression: "1+1" });
    expect(parseStep("clickeval:foo()")).toEqual({ kind: "clickeval", expression: "foo()" });
  });

  it("keeps colons inside an expression, so a url or ternary survives", () => {
    expect(parseStep("eval:location.href.startsWith('http://127.0.0.1')")).toEqual({
      kind: "eval",
      expression: "location.href.startsWith('http://127.0.0.1')",
    });
    expect(parseStep('eval:await import("/src/x.ts") ? "a:b" : "c:d"').expression).toBe('await import("/src/x.ts") ? "a:b" : "c:d"');
  });

  it("parses a crop with the documented default scale", () => {
    expect(parseStep("shot:hud.png@10,20,300,400")).toEqual({
      kind: "shot",
      name: "hud.png",
      clip: { x: 10, y: 20, width: 300, height: 400, scale: 3 },
    });
    expect(parseShotSpec("hud.png@10,20,300,400,2").clip?.scale).toBe(2);
  });

  it("rejects a malformed crop", () => {
    expect(() => parseStep("shot:hud.png@10,20")).toThrow(/shot crop needs/);
    expect(() => parseStep("shot:hud.png@a,b,c,d")).toThrow(/shot crop needs/);
  });

  it("rejects numbers that would otherwise reach Chrome as NaN", () => {
    expect(() => parseStep("click:abc")).toThrow(/click needs two numbers/);
    expect(() => parseStep("click:100")).toThrow(/click needs two numbers/);
    expect(() => parseStep("drag:1,2,3")).toThrow(/drag needs four numbers/);
    expect(() => parseStep("wait:soon")).toThrow(/wait needs milliseconds/);
    expect(() => parseStep("wait:-5")).toThrow(/wait needs milliseconds/);
  });

  it("rejects an empty expression", () => {
    expect(() => parseStep("eval:")).toThrow(/eval needs an expression/);
    expect(() => parseStep("clickeval:")).toThrow(/clickeval needs an expression/);
  });

  it("names the whole grammar when the step is unknown", () => {
    expect(() => parseStep("navigate:/")).toThrow(
      /unknown step "navigate:\/" \(expected click:x,y \| clickeval:expr \| drag:x1,y1,x2,y2 \| wait:ms \| shot:name \| eval:expr\)/,
    );
  });
});

describe("parsePlanText", () => {
  it("reads one step per line, ignoring blanks and comments", () => {
    expect(parsePlanText("# a comment\n\nclick:1,2\n  wait:100  \n\n")).toEqual(["click:1,2", "wait:100"]);
  });

  it("strips the carriage returns a Windows checkout delivers", () => {
    // core.autocrlf is true here: an unnormalised read leaves \r inside the last
    // field of every step, which reaches CDP as invalid JS.
    expect(parsePlanText("click:1,2\r\neval:1+1\r\n")).toEqual(["click:1,2", "eval:1+1"]);
    for (const step of parsePlanText("eval:1+1\r\n")) expect(step).not.toContain("\r");
  });
});

describe("parseSize", () => {
  it("parses the documented viewport form", () => {
    expect(parseSize("1920x1080")).toEqual([1920, 1080]);
    expect(parseSize("1280x720")).toEqual([1280, 720]);
  });

  it("rejects a size that is not two positive numbers", () => {
    for (const bad of ["1920", "1920x", "axb", "0x720", "-1x-1"]) {
      expect(() => parseSize(bad)).toThrow(/--size needs "WxH"/);
    }
  });
});
