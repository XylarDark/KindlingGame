import { describe, expect, it } from "vitest";
import { parseVitestEvidence } from "./vitestEvidence.mjs";

describe("parseVitestEvidence", () => {
  it("reads the Vitest 4 default summary block", () => {
    const out = `
 RUN  v4.1.11 /workspace

 Test Files  78 passed (78)
      Tests  865 passed (865)
   Duration  4.95s
`;
    expect(parseVitestEvidence(out, "")).toBe("865 passed (865) in 78 files");
  });

  it("strips ANSI and matches indented Tests lines from CI capture", () => {
    const out = `\u001b[32m Test Files  78 passed (78)\u001b[0m\n\u001b[32m      Tests  865 passed (865)\u001b[0m\n`;
    expect(parseVitestEvidence(out, "")).toBe("865 passed (865) in 78 files");
  });

  it("falls back when only a loose Tests ... passed fragment is present", () => {
    const out = "...lots of output...\nTests  12 passed (12)\n";
    expect(parseVitestEvidence(out, "")).toBe("12 passed (12)");
  });

  it("returns null when no pass summary is recognizable", () => {
    expect(parseVitestEvidence("vitest running\n", "")).toBeNull();
  });
});
