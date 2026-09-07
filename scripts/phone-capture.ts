/**
 * Phone-landscape still at 844×390 (iPhone 14 landscape CSS).
 * Requires preview: KINDLING_PREVIEW=http://127.0.0.1:4175 npx tsx scripts/phone-capture.ts
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 9342;
const BASE = process.env.KINDLING_PREVIEW ?? "http://127.0.0.1:4175";
const OUT = join(process.cwd(), "docs", "promo");
const W = 844;
const H = 390;
const CHROME =
  process.env.CHROME_PATH ??
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
const PROFILE = join(process.env.TEMP ?? "/tmp", "kindling-phone-chrome");

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
    if (!page) throw new Error("no Chrome page target");
    const cdp = new Cdp();
    await cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send("Page.navigate", { url: `${BASE}/?howto=0&shot=drive` });
    await sleep(1500);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: W / 2,
      y: H / 2,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: W / 2,
      y: H / 2,
      button: "left",
      clickCount: 1,
    });
    await sleep(2500);
    const metrics = (await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const c = document.querySelector('#game-root canvas');
        const r = document.getElementById('game-root');
        const cr = c?.getBoundingClientRect();
        const rr = r?.getBoundingClientRect();
        return JSON.stringify({
          view: { w: innerWidth, h: innerHeight },
          root: rr ? { w: rr.width, h: rr.height, l: rr.left, t: rr.top } : null,
          canvas: cr ? { w: cr.width, h: cr.height, l: cr.left, t: cr.top } : null,
          fills: !!(cr && rr && Math.abs(cr.width - rr.width) <= 1 && Math.abs(cr.height - rr.height) <= 1
            && Math.abs(rr.width - innerWidth) <= 1 && Math.abs(rr.height - innerHeight) <= 1),
        });
      })()`,
      returnByValue: true,
    })) as { result: { value: string } };
    const info = JSON.parse(metrics.result.value) as {
      view: { w: number; h: number };
      fills: boolean;
      canvas: { w: number; h: number } | null;
    };
    console.log(`phone-metrics ${JSON.stringify(info)}`);
    if (!info.fills) throw new Error("canvas does not fill 844×390 viewport (letterbox risk)");
    const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as { data: string };
    writeFileSync(join(OUT, "qa-phone-drive.png"), Buffer.from(shot.data, "base64"));
    console.log("wrote docs/promo/qa-phone-drive.png");
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
