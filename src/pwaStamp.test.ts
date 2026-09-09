import { describe, expect, it } from "vitest";
import { SW_BUILD_MARKER, serviceWorkerBuildId, stampServiceWorkerSource } from "./pwaStamp";

describe("stampServiceWorkerSource", () => {
  it("prefixes an unstamped worker with a build comment", () => {
    const out = stampServiceWorkerSource("self.skipWaiting();\n", "abc123");
    expect(out.startsWith(`/* ${SW_BUILD_MARKER}: abc123 */\n`)).toBe(true);
    expect(out).toContain("self.skipWaiting();");
  });

  it("replaces an existing stamp instead of stacking comments", () => {
    const once = stampServiceWorkerSource("body\n", "v1");
    const twice = stampServiceWorkerSource(once, "v2");
    expect(twice).toBe(`/* ${SW_BUILD_MARKER}: v2 */\nbody\n`);
    expect(twice.match(new RegExp(SW_BUILD_MARKER, "g"))).toHaveLength(1);
  });

  it("throws on an empty id rather than writing a no-op stamp", () => {
    expect(() => stampServiceWorkerSource("x", "  ")).toThrow(/empty service worker build id/);
  });
});

describe("serviceWorkerBuildId", () => {
  it("prefers the GitHub SHA so Pages builds of the same commit stay identical", () => {
    expect(serviceWorkerBuildId({ GITHUB_SHA: "abcdef1234567890" }, () => 1)).toBe("abcdef123456");
  });

  it("falls back to a time-based local id when SHA is missing", () => {
    expect(serviceWorkerBuildId({}, () => Number.parseInt("abc", 36))).toBe("local-abc");
  });
});
