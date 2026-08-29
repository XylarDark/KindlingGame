import { describe, expect, it } from "vitest";
import { HOURS, HOWTO_HINT, MARK, PAUSE_HINT, WELCOME_HINT, WELCOME_TITLE } from "./copy";

describe("shop copy", () => {
  it("keeps the mark in tracked caps and hours in title case", () => {
    expect(MARK).toBe("KINDLING");
    expect(HOURS).toBe("Open\n9 AM – 11 PM");
    expect(WELCOME_TITLE).toBe("Welcome to Kindling Cannabis");
    expect(WELCOME_HINT).toBe("Interact to begin");
    expect(PAUSE_HINT.startsWith("Paused")).toBe(true);
    expect(HOWTO_HINT.startsWith("Tap")).toBe(true);
  });
});
