import { describe, expect, it } from "vitest";
import { parseAutomationLog, verdict } from "./browser-probe";

const TIMEOUT_LINE =
  "[2026-09-08T01:11:38.592Z] [ERROR] [general] Error: [cursor.browserView.newTab] Timed out waiting for glass browser view: a36aa3";
const SCREENSHOT_NOISE =
  "[2026-09-08T01:11:28.693Z] [WARN] [general] Failed to update screenshot service: Error: Browser view not found";
const INFO_LINE = "[2026-09-08T01:11:36.466Z] [INFO] [general] Navigating to http://127.0.0.1:5174/";

describe("parseAutomationLog", () => {
  it("should recognise a glass browser view timeout", () => {
    const events = parseAutomationLog(TIMEOUT_LINE);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("glass-timeout");
    expect(events[0].at.toISOString()).toBe("2026-09-08T01:11:38.592Z");
  });

  it("should parse logs delivered with CRLF line endings", () => {
    const crlf = [TIMEOUT_LINE, SCREENSHOT_NOISE].join("\r\n");

    const kinds = parseAutomationLog(crlf).map((e) => e.kind);

    expect(kinds).toEqual(["glass-timeout", "no-browser-view"]);
  });

  it("should ignore INFO lines and unparseable text", () => {
    expect(parseAutomationLog(INFO_LINE)).toEqual([]);
    expect(parseAutomationLog("")).toEqual([]);
    expect(parseAutomationLog("not a log line at all")).toEqual([]);
  });
});

describe("verdict", () => {
  const now = new Date("2026-09-08T01:20:00.000Z");

  it("should report unhealthy when a glass timeout falls inside the window", () => {
    const result = verdict(parseAutomationLog(TIMEOUT_LINE), now, 15);

    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("2026-09-08T01:11:38.592Z");
  });

  it("should report healthy once the timeout ages out of the window", () => {
    const result = verdict(parseAutomationLog(TIMEOUT_LINE), now, 5);

    expect(result.healthy).toBe(true);
  });

  it("should not be tripped by routine screenshot-service noise", () => {
    const result = verdict(parseAutomationLog(SCREENSHOT_NOISE), now, 15);

    expect(result.healthy).toBe(true);
  });

  it("should report healthy when there are no events at all", () => {
    expect(verdict([], now, 15).healthy).toBe(true);
  });
});
