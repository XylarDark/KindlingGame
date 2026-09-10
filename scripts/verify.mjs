#!/usr/bin/env node

/**
 * Runs Kindling's verification pipeline in dependency order and records what each stage proved.
 *
 * The distinction this tool exists to make: an exit code says "something failed", while evidence
 * says "the suite ran 443 tests in 44 files and all passed". Only the second lets anyone else
 * check the claim — and this codebase has produced three separate bugs that passed their own
 * checks by doing nothing, so a bare green tick is not worth much here.
 *
 * Ordering matters. A type error makes every later result meaningless, so the pipeline stops at
 * the first failure and reports the remaining stages as NOT RUN rather than letting silence read
 * as success.
 *
 * What it cannot do: prove the game still renders. `tsc` demonstrably misses boot-time crashes in
 * this codebase, so a change to runtime code is not closed until a capture confirms it. See the
 * `game-capture` skill.
 *
 * Usage:
 *   npm run verify              stop at the first failing stage
 *   npm run verify -- --all     run every stage regardless of failures
 *   npm run verify -- --json    machine-readable evidence
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, runStage, summarize } from './pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(REPO_ROOT, '.devenv', 'verify-report.json');

/**
 * Each stage names what passing it actually demonstrates, and extracts a specific number or fact
 * from the output. `evidence` returns a human-readable string, or null when the output did not
 * contain what was expected — which is itself worth reporting.
 */
const STAGES = [
  {
    id: 'typecheck',
    title: 'Type check',
    proves: 'Every TypeScript file compiles.',
    command: 'npm',
    args: ['run', 'typecheck'],
    evidence: ({ code }) => (code === 0 ? 'tsc reported no type errors' : null),
  },
  {
    id: 'test',
    title: 'Tests',
    proves: 'The Vitest suite runs to completion and every test passes.',
    command: 'npm',
    args: ['test'],
    evidence: ({ stdout, stderr }) => {
      const combined = `${stdout}\n${stderr}`;

      // Vitest prints "Tests  443 passed (443)", or "Tests  1 failed | 442 passed (443)".
      const line = combined.match(/^\s*Tests\s+(.+?)\s*$/m);
      const fileTotal = combined.match(/^\s*Test Files\s+.*\((\d+)\)\s*$/m);

      // No counts means the suite did not run to completion. Reporting that as "passed" on the
      // strength of an exit code is the exact trap this tool exists to avoid.
      if (!line) return null;

      return fileTotal ? `${line[1]} in ${fileTotal[1]} files` : line[1];
    },
  },
  {
    id: 'build',
    title: 'Production build',
    proves: 'Vite bundles the game into deployable static files.',
    command: 'npm',
    args: ['run', 'build'],
    evidence: () => {
      // Bundling failures that `tsc` cannot see live here: a bad asset path, an import Vite
      // cannot resolve, a plugin error. GitHub Pages serves exactly this output.
      const entry = path.join(REPO_ROOT, 'dist', 'index.html');
      if (!fs.existsSync(entry)) return null;

      const assetsDir = path.join(REPO_ROOT, 'dist', 'assets');
      const assetCount = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).length : 0;

      // An index.html with no assets beside it means the bundle did not really produce the game.
      if (assetCount === 0) return null;

      return `dist/index.html plus ${assetCount} bundled asset(s)`;
    },
  },
];

/**
 * Controls this pipeline cannot observe. Listed in every report so a clean run is never mistaken
 * for a statement about them.
 */
const NOT_VERIFIABLE = [
  'That the game still renders; tsc misses boot-time crashes, so this needs a capture',
  'Branch protection rules and required status checks (GitHub settings, not repository files)',
  'Whether CI actually ran these same commands on the last push',
  'What GitHub Pages is currently serving, as opposed to what this build produced',
  'Visual regressions, layout overflow, and contrast; those need a capture or an audit script',
  'Runtime behavior under real input; the tests here do not drive Phaser',
];

function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const asJson = args.includes('--json');

  const results = [];
  let stopped = false;

  for (const stage of STAGES) {
    if (stopped && !runAll) {
      results.push({
        ...describe(stage),
        status: 'not run',
        durationMs: 0,
        evidence: null,
        detail: 'Skipped because an earlier stage failed. This is not a pass.',
      });
      continue;
    }

    if (!asJson) process.stdout.write(`  ${stage.title}... `);

    const result = runStage(stage, REPO_ROOT);
    results.push(result);

    if (!asJson) {
      const seconds = (result.durationMs / 1000).toFixed(1);
      console.log(
        result.status === 'passed'
          ? `passed  (${result.evidence}, ${seconds}s)`
          : `${result.status.toUpperCase()}  (${seconds}s)`
      );
    }

    if (result.status !== 'passed') stopped = true;
  }

  const { failed, notRun, passed, verified, counts } = summarize(results);

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    verified,
    summary: counts,
    stages: results,
    notVerifiedFromRepositoryContents: NOT_VERIFIABLE,
  };

  try {
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`Warning: could not write evidence to ${EVIDENCE_PATH}: ${error.message}`);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.verified ? 0 : 1;
    return;
  }

  console.log('');

  for (const result of failed) {
    console.log(`${result.title} ${result.status}:`);
    console.log(`  command: ${result.command}`);
    if (result.detail) {
      console.log(
        result.detail
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n')
      );
    }
    console.log('');
  }

  if (notRun.length > 0) {
    console.log(
      `Not run (an earlier stage failed): ${notRun.map(r => r.title).join(', ')}.\n` +
        'These stages proved nothing. Do not read their silence as success.\n'
    );
  }

  console.log('Not verified from repository contents:');
  for (const item of NOT_VERIFIABLE) console.log(`  - ${item}`);
  console.log('');

  if (report.verified) {
    console.log(`Verified: ${passed.length} of ${results.length} stages passed with evidence.`);
    console.log('This does not include a capture proving the game renders. That step is yours.');
  } else {
    console.log(
      `Not verified: ${passed.length} of ${results.length} stages passed. ` +
        `Evidence in ${path.relative(REPO_ROOT, EVIDENCE_PATH)}.`
    );
  }

  process.exitCode = report.verified ? 0 : 1;
}

main();
