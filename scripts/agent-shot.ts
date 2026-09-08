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
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
function steps(): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === "--step" && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]!);
  });
  const plan = arg("plan");
  if (plan !== undefined) {
    const text = readFileSync(plan, "utf8").replace(/\r\n/g, "\n");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed !== "" && !trimmed.startsWith("#")) out.push(trimmed);
    }
  }
  return out;
}

const LANE = Number(arg("lane", process.env.KINDLING_LANE ?? "0"));
if (!Number.isInteger(LANE) || LANE < 0 || LANE > 63) {
  throw new Error(`--lane must be an integer 0-63, got ${String(LANE)}`);
}

const PORT = 9400 + LANE;
const BASE = arg("url", process.env.KINDLING_URL ?? "http://127.0.0.1:5174")!.replace(/\/$/, "");
const QUERY = arg("query", "?howto=0")!;
const OUT = arg("out", process.env.KINDLING_SHOT_OUT ?? join(process.env.TEMP ?? "/tmp", "kindling-shots"))!;
const NAME = arg("name", `lane${LANE}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)!;
const [W, H] = (arg("size", "1280x720") ?? "1280x720").split("x").map(Number) as [number, number];
const WAIT = Number(arg("wait", "2500"));
const NO_CLICK = flag("no-click");
const PROFILE = join(process.env.TEMP ?? "/tmp", `kindling-shot-lane${LANE}`);
const CHROME =
  process.env.CHROME_PATH ??
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class Cdp {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  async connect(wsUrl: string): Promise<void> {
    this.ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("cdp websocket failed")));
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close(): void {
    this.ws.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
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
  await sleep(1000);
  try {
    const list = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())) as {
      webSocketDebuggerUrl: string;
      type: string;
    }[];
    const page = list.find((t) => t.type === "page");
    if (!page) throw new Error(`no Chrome page target on lane ${LANE} (port ${PORT})`);
    const cdp = new Cdp();
    await cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: `${BASE}/${QUERY}` });
    await sleep(WAIT);

    const click = async (x: number, y: number): Promise<void> => {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      }
    };

    /** Sliders only respond to pointermove between press and release, so interpolate. */
    const drag = async (x1: number, y1: number, x2: number, y2: number): Promise<void> => {
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", buttons: 1, clickCount: 1 });
      const legs = 8;
      for (let i = 1; i <= legs; i += 1) {
        const t = i / legs;
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: x1 + (x2 - x1) * t,
          y: y1 + (y2 - y1) * t,
          button: "left",
          buttons: 1,
        });
        await sleep(20);
      }
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", buttons: 0, clickCount: 1 });
    };

    /**
     * `name.png` for the full viewport, or `name.png@x,y,w,h[,scale]` for a magnified
     * crop — the only practical way to judge whether small HUD type is legible.
     */
    const capture = async (spec: string): Promise<void> => {
      const [name, region] = spec.split("@");
      const params: Record<string, unknown> = { format: "png" };
      if (region !== undefined) {
        const [x, y, w, h, scale] = region.split(",").map(Number);
        if ([x, y, w, h].some((n) => n === undefined || Number.isNaN(n))) {
          throw new Error(`shot crop needs "name.png@x,y,w,h[,scale]", got "${spec}"`);
        }
        params.clip = { x: x!, y: y!, width: w!, height: h!, scale: scale ?? 3 };
        params.captureBeyondViewport = true;
      }
      const shot = (await cdp.send("Page.captureScreenshot", params)) as { data: string };
      const path = join(OUT, name!);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      console.log(path);
    };

    // The game boots paused; a click on the canvas starts play.
    if (!NO_CLICK) {
      await click(W / 2, H / 2);
      await sleep(WAIT);
    }

    const evaluate = async (expression: string): Promise<unknown> => {
      // awaitPromise lets a step await a dynamic import; it is a no-op on plain values.
      const res = (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
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

    const plan = steps();
    for (const step of plan) {
      const [kind, ...rest] = step.split(":");
      const body = rest.join(":");
      if (kind === "click") {
        const [x, y] = body.split(",").map(Number);
        await click(x!, y!);
      } else if (kind === "drag") {
        const [x1, y1, x2, y2] = body.split(",").map(Number);
        if ([x1, y1, x2, y2].some((n) => n === undefined || Number.isNaN(n))) {
          throw new Error(`drag needs four numbers "drag:x1,y1,x2,y2", got "${body}"`);
        }
        await drag(x1!, y1!, x2!, y2!);
      } else if (kind === "wait") {
        await sleep(Number(body));
      } else if (kind === "shot") {
        await capture(body);
      } else if (kind === "eval") {
        // Screenshots of a backgrounded tab can be stale; read state instead of trusting pixels.
        console.log(`EVAL ${JSON.stringify(await evaluate(body))}`);
      } else if (kind === "clickeval") {
        // Half this game's click targets move — walk-ins walk in, and the ticket seed is
        // Date.now() — so a plan has to compute the point at the moment it clicks.
        const at = await evaluate(body);
        const [x, y] = String(at).split(",").map(Number);
        if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) {
          throw new Error(`clickeval must return "x,y", got ${JSON.stringify(at)}\n  expression: ${body}`);
        }
        console.log(`CLICKEVAL ${x},${y}`);
        await click(x, y);
      } else {
        throw new Error(
          `unknown step "${step}" (expected click:x,y | clickeval:expr | drag:x1,y1,x2,y2 | wait:ms | shot:name | eval:expr)`,
        );
      }
    }

    if (plan.length === 0) await capture(NAME);
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
