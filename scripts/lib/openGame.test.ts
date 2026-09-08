import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_URL,
  OPEN_MARKER,
  RECENT_OPEN_TTL_MS,
  decideOpen,
  findGameWindows,
  formatOpenMarker,
  isGameBrowserWindow,
  parseOpenMarker,
  parseWindowList,
  type WindowInfo,
} from "./openGame";

const chromeWindow: WindowInfo = { processName: "chrome", title: "Kindling - Google Chrome" };

describe("isGameBrowserWindow", () => {
  it("recognises the game in every browser we might launch", () => {
    for (const title of [
      "Kindling - Google Chrome",
      "Kindling and 3 more pages - Google Chrome",
      "Kindling - Brave",
      "Kindling - Microsoft Edge",
      "Kindling - Mozilla Firefox",
      "Kindling - Chromium",
    ]) {
      expect(isGameBrowserWindow(title)).toBe(true);
    }
  });

  it("never mistakes the IDE or a terminal for the game", () => {
    // This repo's directory is KindlingGame, so editor titles contain the word.
    // Focusing the editor instead of a browser would be worse than a duplicate tab.
    for (const title of [
      "AGENTS.md - KindlingGame - Cursor",
      "KindlingGame - Visual Studio Code",
      "Cursor Agents",
      "KindlingGame",
      "npm run dev - KindlingGame",
      "Kindling",
      "Kindling - Notepad",
      "KindlingGame - Google Chrome",
    ]) {
      expect(isGameBrowserWindow(title)).toBe(false);
    }
  });

  it("ignores an unrelated browser window", () => {
    expect(isGameBrowserWindow("Provider caseload - Trampoline - Brave")).toBe(false);
    expect(isGameBrowserWindow("New Tab - Google Chrome")).toBe(false);
  });

  it("filters a window list down to game windows", () => {
    const windows: WindowInfo[] = [
      { processName: "Cursor", title: "AGENTS.md - KindlingGame - Cursor" },
      { processName: "brave", title: "Provider caseload - Trampoline - Brave" },
      chromeWindow,
    ];
    expect(findGameWindows(windows)).toEqual([chromeWindow]);
  });
});

describe("decideOpen", () => {
  const base = { url: DEFAULT_GAME_URL, windows: [], lastOpenedAt: null, now: 1_000_000 };

  it("refuses when the dev server is down, and says how to start it", () => {
    const decision = decideOpen({ ...base, serverUp: false });
    expect(decision.kind).toBe("server-down");
    expect(decision.message).toContain("npm run dev");
    expect(decision.message).toContain("do not start a second");
  });

  it("refuses when the server is down even with --force", () => {
    expect(decideOpen({ ...base, serverUp: false, force: true }).kind).toBe("server-down");
  });

  it("opens when nothing is showing the game", () => {
    const decision = decideOpen({ ...base, serverUp: true });
    expect(decision.kind).toBe("open");
  });

  it("focuses an existing game window instead of stacking a tab", () => {
    const decision = decideOpen({ ...base, serverUp: true, windows: [chromeWindow] });
    expect(decision.kind).toBe("reuse-window");
    if (decision.kind !== "reuse-window") throw new Error("expected reuse-window");
    expect(decision.window).toEqual(chromeWindow);
    expect(decision.message).toContain("focusing it");
  });

  it("suppresses a duplicate open inside the ttl, before a title exists to match", () => {
    const decision = decideOpen({ ...base, serverUp: true, lastOpenedAt: base.now - 1_000 });
    expect(decision.kind).toBe("recently-opened");
    expect(decision.message).toContain("--force");
  });

  it("opens again once the ttl has passed", () => {
    expect(decideOpen({ ...base, serverUp: true, lastOpenedAt: base.now - RECENT_OPEN_TTL_MS }).kind).toBe("open");
    expect(decideOpen({ ...base, serverUp: true, lastOpenedAt: base.now - RECENT_OPEN_TTL_MS - 1 }).kind).toBe("open");
  });

  it("lets --force past the reuse checks", () => {
    const decision = decideOpen({ ...base, serverUp: true, windows: [chromeWindow], lastOpenedAt: base.now, force: true });
    expect(decision.kind).toBe("open");
  });

  it("prefers focusing a window over the recency guard", () => {
    const decision = decideOpen({ ...base, serverUp: true, windows: [chromeWindow], lastOpenedAt: base.now - 1 });
    expect(decision.kind).toBe("reuse-window");
  });
});

describe("open marker", () => {
  it("round-trips", () => {
    expect(parseOpenMarker(formatOpenMarker(42, DEFAULT_GAME_URL))).toEqual({ openedAt: 42, url: DEFAULT_GAME_URL });
  });

  it("survives CRLF, which a Windows checkout delivers", () => {
    expect(parseOpenMarker(formatOpenMarker(42, "u").replace(/\n/g, "\r\n")).openedAt).toBe(42);
  });

  it("throws on a missing marker rather than reading as never-opened", () => {
    expect(() => parseOpenMarker("openedAt=42\n")).toThrow(new RegExp(`missing its "${OPEN_MARKER}"`));
    expect(() => parseOpenMarker("")).toThrow(/missing its/);
  });

  it("throws when openedAt is unusable", () => {
    expect(() => parseOpenMarker(`${OPEN_MARKER}\nopenedAt=never\n`)).toThrow(/no usable "openedAt"/);
    expect(() => parseOpenMarker(`${OPEN_MARKER}\nurl=x\n`)).toThrow(/no usable "openedAt"/);
  });
});

describe("parseWindowList", () => {
  it("parses process and title pairs", () => {
    expect(parseWindowList("chrome|Kindling - Google Chrome\nCursor|Cursor Agents\n")).toEqual([
      { processName: "chrome", title: "Kindling - Google Chrome" },
      { processName: "Cursor", title: "Cursor Agents" },
    ]);
  });

  it("keeps separators that appear inside a title", () => {
    expect(parseWindowList("chrome|a|b - Google Chrome")).toEqual([{ processName: "chrome", title: "a|b - Google Chrome" }]);
  });

  it("drops blank lines, titleless windows and CRLF debris", () => {
    expect(parseWindowList("chrome|Kindling - Brave\r\n\r\nidle|\r\nnoseparator\r\n")).toEqual([
      { processName: "chrome", title: "Kindling - Brave" },
    ]);
  });
});
