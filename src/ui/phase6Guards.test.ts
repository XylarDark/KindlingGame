import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** core.autocrlf is true here — normalise before any source scan. */
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walkTsFiles(dirRel: string): string[] {
  const dir = join(root, dirRel);
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const ent of readdirSync(abs)) {
      const p = join(abs, ent);
      if (statSync(p).isDirectory()) walk(p);
      else if (ent.endsWith(".ts") && !ent.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(dir);
  return out.map((p) => relative(root, p).replace(/\\/g, "/"));
}

/** Balanced-brace slice for `.on("pointerdown", …)` handler bodies. */
function collectPointerdownBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /\.on\("pointerdown"[^)]*\)\s*(?:=>|\()\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const brace = src.indexOf("{", m.index);
    if (brace === -1) throw new Error("pointerdown handler opening brace not found");
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(src.slice(brace, i + 1));
          break;
        }
      }
    }
    if (depth !== 0) throw new Error("unbalanced braces in pointerdown handler");
  }
  return blocks;
}

function sliceFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) throw new Error(`${name} not found`);
  const brace = src.indexOf("{", start);
  if (brace === -1) throw new Error(`${name} opening brace not found`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

describe("Phase 6 — size/speed/readability contract scans", () => {
  it("never calls snapshot() inside pointerdown handlers (scenes + ui)", () => {
    const files = [...walkTsFiles("src/scenes"), ...walkTsFiles("src/ui")];
    expect(files.length).toBeGreaterThan(10);
    let blockCount = 0;
    for (const rel of files) {
      const src = read(rel);
      const blocks = collectPointerdownBlocks(src);
      blockCount += blocks.length;
      for (const block of blocks) {
        expect(block, `${rel} pointerdown`).not.toContain("snapshot(");
      }
    }
    expect(blockCount).toBeGreaterThan(5);
  });

  it("sim clock never feeds game.loop.rawDelta — frameMs uses scene delta only", () => {
    const simFiles = walkTsFiles("src/sim");
    expect(simFiles.length).toBeGreaterThan(3);
    for (const rel of simFiles) {
      const code = stripComments(read(rel));
      expect(code, rel).not.toMatch(/\brawDelta\b/);
    }
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("const frameMs = delta");
    expect(hud).toMatch(/advanceSimClock\([\s\S]*frameMs/);
  });

  it("coarse phones lock render tier — no mid-session scale.resize path", () => {
    const budget = read("src/ui/renderBudget.ts");
    const tick = sliceFunction(budget, "tickRenderBudget");
    expect(tick).toMatch(/if \(!autoEnabled \|\| sessionTierLocked\) return false/);
    expect(budget).toContain("sessionTierLocked = coarsePointer");
    const applyScale = sliceFunction(budget, "applyRenderScale");
    expect(applyScale.match(/scale\.resize/g)?.length ?? 0).toBe(1);

    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("tickRenderBudget");
    expect(hud).not.toContain("applyRenderBudgetToGame");

    expect(budget).toContain("renderScale: 0.85");
    expect(budget).not.toMatch(/renderScale:\s*0\.45/);
    expect(budget).not.toMatch(/renderScale:\s*0\.32/);
  });

  it("layoutPlaque skips on ink failure — never throws", () => {
    const sign = read("src/ui/signText.ts");
    const body = sliceFunction(sign, "layoutPlaque");
    expect(body).not.toMatch(/\bthrow\b/);
    expect(body).toMatch(/return;/);
  });

  it("GitHub Pages workflow deploys main bundle and dist/embed/", () => {
    const workflow = read(".github/workflows/pages.yml");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run build:embed");
    expect(workflow).toMatch(/path:\s*dist/);

    const vite = read("vite.config.ts");
    expect(vite).toContain('outDir = portfolio ? "dist/embed" : "dist"');
    expect(vite).toContain("emptyOutDir: !portfolio");
  });
});
