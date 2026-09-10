/**
 * Preflight for Android Emulator PWA checks.
 * Does not measure FPS — see docs/guides/android-emulator.md.
 */
import { spawnSync } from "node:child_process";

const PORT = 5174;
const URL = `http://127.0.0.1:${PORT}/`;

function adb(args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("adb", args, { encoding: "utf8" });
  return {
    ok: r.status === 0,
    out: (r.stdout ?? "").trim(),
    err: (r.stderr ?? "").trim(),
  };
}

function main(): number {
  console.log("emu:pwa — Android Emulator PWA preflight (not an FPS oracle)\n");

  const which = spawnSync("adb", ["version"], { encoding: "utf8" });
  if (which.status !== 0) {
    console.error("adb not found on PATH. Install Android platform-tools and retry.");
    console.error("See docs/guides/android-emulator.md");
    return 1;
  }
  console.log(which.stdout?.split("\n")[0] ?? "adb ok");

  const devices = adb(["devices"]);
  const lines = devices.out.split(/\r?\n/).filter((l) => l && !l.startsWith("List"));
  const online = lines.filter((l) => /\tdevice$/.test(l));
  if (online.length === 0) {
    console.error("No emulator/device online. Start the Kindling AVD, then re-run.");
    console.error(devices.out || devices.err);
    return 1;
  }
  console.log(`device(s):\n  ${online.join("\n  ")}`);

  const rev = adb(["reverse", `tcp:${PORT}`, `tcp:${PORT}`]);
  if (!rev.ok) {
    console.error(`adb reverse failed: ${rev.err || rev.out}`);
    return 1;
  }
  console.log(`adb reverse tcp:${PORT} → host :${PORT}`);

  console.log(`\nOpen Chrome on the emulator:\n  ${URL}`);
  console.log(
    `Intent:\n  adb shell am start -a android.intent.action.VIEW -d "${URL}" com.android.chrome`,
  );
  console.log(`\nChecklist: install / standalone → controller → idle activate (title or shift end).`);
  console.log(`Docs: docs/guides/android-emulator.md`);
  return 0;
}

process.exit(main());
