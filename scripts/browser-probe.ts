/**
 * Offline health probe for Cursor's built-in browser (the `cursor-ide-browser` MCP server).
 *
 * Calling that MCP tool while its browser subsystem is wedged can hang forever, and an agent
 * cannot impose a timeout on its own MCP call. This script answers "is it worth calling?"
 * without calling it, by reading Cursor's own logs and checking the target URL directly.
 *
 * Usage:
 *   npx tsx scripts/browser-probe.ts
 *   npx tsx scripts/browser-probe.ts --url http://127.0.0.1:5174/ --window 15
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** A failure of Cursor's browser subsystem, recovered from its log files. */
export interface ProbeEvent {
  readonly at: Date;
  readonly kind: "glass-timeout" | "no-browser-view" | "tool-error";
  readonly detail: string;
}

export interface Verdict {
  readonly healthy: boolean;
  readonly reason: string;
}

/** Failures older than this are history, not a reason to avoid the tool now. */
export const DEFAULT_WINDOW_MINUTES = 15;

const LINE_PATTERN = /^\[([^\]]+)\]\s+\[(?:ERROR|WARN)\]\s+\[[^\]]*\]\s+(.*)$/;

/**
 * Extracts browser-subsystem failures from a "Cursor IDE Browser Automation" output channel log.
 *
 * CRLF normalisation is deliberate: `core.autocrlf` is true in this repo and Cursor's own logs are
 * written with platform line endings, so an unnormalised `split("\n")` leaves a trailing `\r` that
 * breaks the end-anchored match and silently reports zero failures.
 */
export function parseAutomationLog(text: string): ProbeEvent[] {
  const events: ProbeEvent[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const match = LINE_PATTERN.exec(line);
    if (!match) continue;

    const at = new Date(match[1]);
    if (Number.isNaN(at.getTime())) continue;

    const detail = match[2];
    if (detail.includes("Timed out waiting for glass browser view")) {
      events.push({ at, kind: "glass-timeout", detail });
    } else if (detail.includes("No browser view available") || detail.includes("Browser view not found")) {
      events.push({ at, kind: "no-browser-view", detail });
    } else if (detail.startsWith("Error executing tool")) {
      events.push({ at, kind: "tool-error", detail });
    }
  }
  return events;
}

/**
 * A `glass-timeout` means tab creation blew its 2 s budget, which is the one failure that predicts
 * the next call failing too. `no-browser-view` is routine noise — Cursor logs it on every
 * screenshot even when the call succeeds — so it never makes the verdict unhealthy on its own.
 */
export function verdict(events: readonly ProbeEvent[], now: Date, windowMinutes: number): Verdict {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  const recentTimeouts = events.filter((e) => e.kind === "glass-timeout" && e.at.getTime() >= cutoff);

  if (recentTimeouts.length === 0) {
    return { healthy: true, reason: `no glass-view timeout in the last ${windowMinutes} min` };
  }
  const latest = recentTimeouts[recentTimeouts.length - 1];
  return {
    healthy: false,
    reason: `${recentTimeouts.length} glass-view timeout(s) since ${latest.at.toISOString()}`,
  };
}

function newestCursorLogSession(): string | undefined {
  const appData = process.env.APPDATA;
  if (!appData) return undefined;

  const root = join(appData, "Cursor", "logs");
  let sessions: string[];
  try {
    sessions = readdirSync(root);
  } catch {
    return undefined;
  }
  const dirs = sessions
    .map((name) => join(root, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
  return dirs[dirs.length - 1];
}

function findAutomationLogs(dir: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) findAutomationLogs(path, found);
    else if (entry.endsWith("Cursor IDE Browser Automation.log")) found.push(path);
  }
  return found;
}

async function targetIsServing(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return `HTTP ${response.status}`;
  } catch (error) {
    return `unreachable (${error instanceof Error ? error.message : String(error)})`;
  }
}

function readFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const url = readFlag("url", "http://127.0.0.1:5174/");
  const windowMinutes = Number(readFlag("window", String(DEFAULT_WINDOW_MINUTES)));

  const session = newestCursorLogSession();
  if (!session) {
    console.log("Cursor logs not found (no %APPDATA%\\Cursor\\logs). Cannot judge browser health.");
    console.log("Treat the built-in browser as UNKNOWN and prefer scripts/agent-shot.ts.");
    return;
  }

  const logs = findAutomationLogs(session);
  const events = logs.flatMap((path) => parseAutomationLog(readFileSync(path, "utf8")));
  const now = new Date();
  const health = verdict(events, now, windowMinutes);

  console.log(`Cursor log session : ${session}`);
  console.log(`Automation logs    : ${logs.length}`);
  console.log(`Target ${url} : ${await targetIsServing(url)}`);
  console.log(`Browser subsystem  : ${health.healthy ? "LIKELY HEALTHY" : "UNHEALTHY"} - ${health.reason}`);

  for (const event of events.filter((e) => e.at.getTime() >= now.getTime() - windowMinutes * 60_000)) {
    if (event.kind !== "no-browser-view") console.log(`  ${event.at.toISOString()} ${event.kind}: ${event.detail}`);
  }

  console.log("");
  if (health.healthy) {
    console.log("Safe to try browser_navigate ONCE - and omit `position`, which is what forces the");
    console.log("2 s glass-view deadline. If it errors, do not retry: fall back to agent-shot.");
  } else {
    console.log("Do NOT call cursor-ide-browser. Use: npx tsx scripts/agent-shot.ts --lane N");
  }
}

if (process.argv[1]?.endsWith("browser-probe.ts")) {
  void main();
}
