/**
 * Capture promo map + door stills via headless Chrome.
 * Requires preview on :4173 (`npm run build && npx vite preview --host --port 4173`).
 * Run: npx tsx scripts/promo-capture.ts
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 9341;
const BASE = process.env.KINDLING_PREVIEW ?? "http://127.0.0.1:4173";
const OUT = join(process.cwd(), "docs", "promo");
const CHROME =
  process.env.CHROME_PATH ??
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
const PROFILE = join(process.env.TEMP ?? "/tmp", "kindling-promo-chrome");

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

async function capture(shot: "drive" | "door", file: string): Promise<void> {
  const list = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())) as {
    webSocketDebuggerUrl: string;
    type: string;
  }[];
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no Chrome page target");
  const cdp = new Cdp();
  await cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: `${BASE}/?howto=0&shot=${shot}` });
  await sleep(1500);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 960, y: 540, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 960, y: 540, button: "left", clickCount: 1 });
  await sleep(shot === "door" ? 3200 : 2500);
  const shotResult = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
  writeFileSync(join(OUT, file), Buffer.from(shotResult.data, "base64"));
  console.log(`wrote docs/promo/${file}`);
  cdp.close();
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
      "--window-size=1920,1080",
      `--user-data-dir=${PROFILE}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  await sleep(1000);
  try {
    await capture("drive", "city-map.png");
    await capture("door", "door-id.png");
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
