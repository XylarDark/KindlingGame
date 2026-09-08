/**
 * Pure rules for opening the game in a human's browser exactly once.
 *
 * `Start-Process "http://127.0.0.1:5174/"` stacks a fresh tab on every invocation,
 * which is the human-facing half of the "endless browsers" problem. These predicates
 * decide when an open is actually warranted; `scripts/open-game.ts` performs it.
 *
 * Node-free on purpose so it stays inside `npx tsc --noEmit` and unit-testable.
 */

/** The game's document title, from `index.html`. */
export const GAME_TITLE = "Kindling";

export const DEFAULT_GAME_URL = "http://127.0.0.1:5174/";

/**
 * Window-title suffixes that identify a browser.
 *
 * A title must end in one of these to count. Matching "Kindling" alone would also
 * match the IDE — this repo's directory is `KindlingGame`, so an editor window is
 * routinely titled something like "AGENTS.md - KindlingGame - Cursor", and focusing
 * that instead of a browser would be worse than opening a duplicate tab.
 */
export const BROWSER_SUFFIXES = [
  "Google Chrome",
  "Chromium",
  "Microsoft Edge",
  "Mozilla Firefox",
  "Brave",
  "Opera",
  "Vivaldi",
] as const;

/** How long after an open a second invocation is treated as a duplicate. */
export const RECENT_OPEN_TTL_MS = 20_000;

export const OPEN_MARKER = "kindling-open v1";

export interface WindowInfo {
  processName: string;
  title: string;
}

/**
 * Whether a window title looks like a browser already showing the game.
 *
 * `\bKindling\b` deliberately rejects "KindlingGame": the word boundary fails against
 * the following capital G, which is what keeps editor and terminal windows out.
 */
export function isGameBrowserWindow(title: string): boolean {
  if (!/\bKindling\b/.test(title)) return false;
  return BROWSER_SUFFIXES.some((suffix) => title.endsWith(suffix));
}

export function findGameWindows(windows: readonly WindowInfo[]): WindowInfo[] {
  return windows.filter((w) => isGameBrowserWindow(w.title));
}

export type OpenDecision =
  | { kind: "server-down"; message: string }
  | { kind: "reuse-window"; window: WindowInfo; message: string }
  | { kind: "recently-opened"; message: string }
  | { kind: "open"; message: string };

export interface OpenInput {
  serverUp: boolean;
  url: string;
  windows: readonly WindowInfo[];
  /** Epoch ms of the last open this script performed, or null if never. */
  lastOpenedAt: number | null;
  now: number;
  ttlMs?: number;
  force?: boolean;
}

/**
 * Decides whether to open the game, focus what is already there, or do nothing.
 *
 * The dev server is checked first and never started: one Vite serves everything on
 * port 5174 and starting a second is its own documented failure. `--force` skips the
 * reuse checks but still refuses when the server is down, because a browser pointed at
 * a dead port teaches the user nothing.
 */
export function decideOpen(input: OpenInput): OpenDecision {
  if (!input.serverUp) {
    return {
      kind: "server-down",
      message:
        `no dev server answering at ${input.url}\n` +
        `  start the shared one first: npm run dev\n` +
        `  one Vite serves everything on port 5174 -- do not start a second`,
    };
  }
  if (input.force === true) {
    return { kind: "open", message: `opening ${input.url} (--force given)` };
  }
  const open = findGameWindows(input.windows);
  if (open.length > 0) {
    return {
      kind: "reuse-window",
      window: open[0]!,
      message: `the game is already open in ${open[0]!.processName} ("${open[0]!.title}") -- focusing it instead of opening another`,
    };
  }
  const ttl = input.ttlMs ?? RECENT_OPEN_TTL_MS;
  if (input.lastOpenedAt !== null && input.now - input.lastOpenedAt < ttl) {
    const ago = input.now - input.lastOpenedAt;
    return {
      kind: "recently-opened",
      message:
        `already opened ${ago}ms ago and the window has not reported a title yet -- ` +
        `not opening a duplicate. Pass --force to open anyway`,
    };
  }
  return { kind: "open", message: `opening ${input.url}` };
}

/**
 * Reads the "last opened" marker.
 *
 * Same discipline as the lane lock: normalise CRLF, then **throw** on a missing marker
 * rather than returning a partial record, so a corrupt marker is reported instead of
 * quietly reading as "never opened".
 */
export function parseOpenMarker(text: string): { openedAt: number; url: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== OPEN_MARKER) {
    throw new Error(`open marker is missing its "${OPEN_MARKER}" marker line`);
  }
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const at = line.indexOf("=");
    if (at > 0) fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const openedAt = Number(fields.get("openedAt"));
  if (!Number.isFinite(openedAt)) throw new Error(`open marker has no usable "openedAt"`);
  return { openedAt, url: fields.get("url") ?? "" };
}

export function formatOpenMarker(openedAt: number, url: string): string {
  return `${OPEN_MARKER}\nopenedAt=${openedAt}\nurl=${url}\n`;
}

/**
 * Parses the `ProcessName|Title` lines the window query emits.
 *
 * A title may itself contain the separator, so only the first one is treated as a
 * delimiter.
 */
export function parseWindowList(text: string): WindowInfo[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const at = line.indexOf("|");
      if (at < 0) return null;
      return { processName: line.slice(0, at), title: line.slice(at + 1) };
    })
    .filter((w): w is WindowInfo => w !== null && w.title !== "");
}
