import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { serviceWorkerBuildId, stampServiceWorkerSource } from "./src/pwaStamp.ts";

/** Rewrite dist/sw.js with a per-deploy id so Chrome/Safari treat it as a new worker. */
function kindlingStampSw(): Plugin {
  return {
    name: "kindling-stamp-sw",
    apply: "build",
    closeBundle() {
      const swPath = join("dist", "sw.js");
      let source: string;
      try {
        source = readFileSync(swPath, "utf8");
      } catch (err) {
        throw new Error(`kindling-sw: dist/sw.js missing after build (copy public/sw.js failed)`, { cause: err });
      }
      const id = serviceWorkerBuildId({ GITHUB_SHA: process.env.GITHUB_SHA });
      writeFileSync(swPath, stampServiceWorkerSource(source, id));
      console.info(`kindling-sw: stamped build ${id}`);
    },
  };
}

export default defineConfig({
  plugins: [kindlingStampSw()],
  base: "./",
  server: {
    // Pinned so the plain `npm run dev` serves the port every capture script expects.
    // `npm run dev -- --port 5174` cannot work: npm appends forwarded arguments, so the
    // port folds into the `--host` value and the browser tries to resolve a hostname of
    // "5174". strictPort then refuses to start a second server instead of quietly
    // sliding to 5175, where nothing would be looking for it.
    host: true,
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: "es2020",
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/phaser")) return "phaser";
        },
      },
    },
  },
});
