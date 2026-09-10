/**
 * The stage runner shared by `verify.mjs` and `preflight.mjs`.
 *
 * Both pipelines make the same distinction, so it lives in one place: an exit code says "nothing
 * threw", while evidence says "the suite ran N tests and all passed". A stage that exits zero
 * without producing its expected output is reported as `inconclusive`, never as a pass.
 *
 * A stage may declare an `available()` predicate for a tool that might not be installed. When it
 * returns false the stage is `not run`, which is distinct from both a pass and a failure: the
 * check did not happen, and nothing about its subject was demonstrated.
 */

import { spawnSync } from 'node:child_process';

/**
 * Static description of a stage, shared by every result shape.
 *
 * @param {object} stage A STAGES entry.
 * @returns {object} Identifying fields.
 */
export function describe(stage) {
  return {
    id: stage.id,
    title: stage.title,
    proves: stage.proves,
    command: [stage.command, ...stage.args].join(' '),
  };
}

/**
 * The last lines of output, where the actual error almost always is.
 *
 * @param {string} stdout Standard output.
 * @param {string} stderr Standard error.
 * @returns {string} Trimmed tail.
 */
export function failureDetail(stdout, stderr) {
  const combined = `${stdout}\n${stderr}`
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);

  return combined.slice(-15).join('\n') || 'No output.';
}

/**
 * Run one stage and classify the outcome.
 *
 * @param {object} stage A STAGES entry.
 * @param {string} cwd Directory to run it in.
 * @returns {object} Result with status, evidence, and failure detail.
 */
export function runStage(stage, cwd) {
  if (stage.available && !stage.available()) {
    return {
      ...describe(stage),
      status: 'not run',
      durationMs: 0,
      evidence: null,
      detail: stage.unavailableDetail,
    };
  }

  const started = Date.now();

  const result = spawnSync(stage.command, stage.args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const code = result.status;
  const durationMs = Date.now() - started;

  if (result.error) {
    return {
      ...describe(stage),
      status: 'failed',
      durationMs,
      evidence: null,
      detail: `Could not run ${stage.command}: ${result.error.message}`,
    };
  }

  const evidence = stage.evidence({ stdout, stderr, code });

  // Passing requires both a zero exit code and recognizable evidence. A stage that exits zero
  // without producing its expected output has not demonstrated anything.
  if (code === 0 && evidence) {
    return { ...describe(stage), status: 'passed', durationMs, evidence, detail: null };
  }

  if (code === 0 && !evidence) {
    return {
      ...describe(stage),
      status: 'inconclusive',
      durationMs,
      evidence: null,
      detail: 'Exited zero but produced no recognizable evidence, so nothing was demonstrated.',
    };
  }

  const summary = stage.failureSummary && stage.failureSummary({ stdout, stderr, code });

  return {
    ...describe(stage),
    status: 'failed',
    durationMs,
    evidence,
    detail: summary || failureDetail(stdout, stderr),
  };
}

/**
 * Count outcomes. `not run` counts against verification rather than being ignored, because a
 * stage that did not run proved nothing and its silence must not read as success.
 *
 * @param {object[]} results Stage results.
 * @returns {object} Grouped results, a verdict, and counts.
 */
export function summarize(results) {
  const failed = results.filter(r => r.status === 'failed' || r.status === 'inconclusive');
  const notRun = results.filter(r => r.status === 'not run');
  const passed = results.filter(r => r.status === 'passed');

  return {
    failed,
    notRun,
    passed,
    verified: failed.length === 0 && notRun.length === 0,
    counts: {
      passed: passed.length,
      failed: failed.length,
      notRun: notRun.length,
      total: results.length,
    },
  };
}
