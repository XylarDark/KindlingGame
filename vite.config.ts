import { defineConfig } from "vite";

export default defineConfig({
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
