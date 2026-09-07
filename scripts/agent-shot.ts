/**
 * Lane-isolated screenshot for parallel agents.
 *
 * Each lane gets its own Chrome process, debug port and profile directory, so any
 * number of agents can capture at the same time without contending for one browser.
 *
 *   npx tsx scripts/agent-shot.ts --lane 1 --name shop.png
 *   npx tsx scripts/agent-shot.ts --lane 2 --query "?howto=0&shot=drive" --wait 4000
 *
 * Prints the absolute path of the PNG it wrote.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

    // The game boots paused; a click on the canvas starts play.
    if (!NO_CLICK) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await cdp.send("Input.dispatchMouseEvent", { type, x: W / 2, y: H / 2, button: "left", clickCount: 1 });
      }
      await sleep(WAIT);
    }

    const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
    const path = join(OUT, NAME);
    writeFileSync(path, Buffer.from(shot.data, "base64"));
    console.log(path);
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
