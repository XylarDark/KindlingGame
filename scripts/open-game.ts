/**
 * Opens the running game for a human, at most once.
 *
 *   npm run open
 *   npm run open -- --force          open a new tab even if one is already up
 *   npm run open -- --url http://127.0.0.1:5174/?howto=0
 *
 * `Start-Process "http://127.0.0.1:5174/"` stacks a new tab every time it is called,
 * which is how a desktop ends up with a dozen copies of the game. This script checks
 * the dev server is actually serving, focuses a browser window that already has the
 * game if there is one, and otherwise opens exactly one tab.
 *
 * It never starts the dev server: one Vite serves everything on port 5174 and starting
 * a second is its own documented failure. When the server is down it says how to start
 * it and exits non-zero.
 *
 * Agents should not use this. Capture through a lane instead:
 *   npx tsx scripts/agent-shot.ts --lane N
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_GAME_URL,
  decideOpen,
  formatOpenMarker,
  parseOpenMarker,
  parseWindowList,
  type WindowInfo,
} from "./lib/openGame";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
}

const URL_ARG = arg("url", process.env.KINDLING_URL ?? DEFAULT_GAME_URL);
const FORCE = process.argv.includes("--force");
const MARKER = join(process.env.TEMP ?? "/tmp", "kindling-open.marker");

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-Command"];

/** A bounded HEAD-ish probe; a hung request here would defeat the point of the script. */
async function serverUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Visible top-level windows, as `ProcessName|Title` lines. */
function listWindows(): WindowInfo[] {
  if (process.platform !== "win32") return [];
  try {
    const raw = execFileSync(
      "powershell",
      [
        ...PS_ARGS,
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object { \"$($_.ProcessName)|$($_.MainWindowTitle)\" }",
      ],
      { encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    return parseWindowList(raw);
  } catch {
    // Without a window list the worst case is opening a tab that already exists.
    return [];
  }
}

function readLastOpenedAt(): number | null {
  if (!existsSync(MARKER)) return null;
  try {
    return parseOpenMarker(readFileSync(MARKER, "utf8")).openedAt;
  } catch (err) {
    console.error(`ignoring an unreadable open marker at ${MARKER}: ${String(err)}`);
    return null;
  }
}

/**
 * Brings a window to the front by title.
 *
 * Windows only grants foreground to a process the user recently interacted with, so
 * this is best-effort by design — the reason for focusing is reported either way, and
 * a failure to raise the window is still better than another duplicate tab.
 */
function focusWindow(title: string): boolean {
  if (process.platform !== "win32") return false;
  const script = `
Add-Type -Namespace Win -Name Native -MemberDefinition '
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);'
$p = Get-Process | Where-Object { $_.MainWindowTitle -eq $env:KINDLING_FOCUS_TITLE } | Select-Object -First 1
if ($null -eq $p) { exit 2 }
[Win.Native]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null
if ([Win.Native]::SetForegroundWindow($p.MainWindowHandle)) { exit 0 } else { exit 3 }`;
  try {
    execFileSync("powershell", [...PS_ARGS, script], {
      timeout: 15_000,
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, KINDLING_FOCUS_TITLE: title },
    });
    return true;
  } catch {
    return false;
  }
}

/** Hands the URL to the user's default browser. */
function openInDefaultBrowser(url: string): void {
  if (process.platform === "win32") {
    execFileSync("powershell", [...PS_ARGS, "Start-Process $env:KINDLING_OPEN_URL"], {
      timeout: 20_000,
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, KINDLING_OPEN_URL: url },
    });
    return;
  }
  execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [url], { timeout: 20_000, stdio: "ignore" });
}

async function main(): Promise<void> {
  const decision = decideOpen({
    serverUp: await serverUp(URL_ARG),
    url: URL_ARG,
    windows: listWindows(),
    lastOpenedAt: readLastOpenedAt(),
    now: Date.now(),
    force: FORCE,
  });

  // Every branch logs, so a no-op is never mistaken for a silent failure.
  console.log(decision.message);

  if (decision.kind === "server-down") {
    process.exit(1);
  }
  if (decision.kind === "recently-opened") {
    return;
  }
  if (decision.kind === "reuse-window") {
    if (!focusWindow(decision.window.title)) {
      console.log("  could not raise that window (Windows restricts foreground changes); switch to it manually");
    }
    return;
  }

  openInDefaultBrowser(URL_ARG);
  mkdirSync(join(process.env.TEMP ?? "/tmp"), { recursive: true });
  writeFileSync(MARKER, formatOpenMarker(Date.now(), URL_ARG), "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
