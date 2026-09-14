import { stripAnsi } from '../pipeline.mjs';

/**
 * Extract a human-readable Vitest pass summary from captured stdout/stderr.
 * Returns null when the suite did not report a recognizable pass count.
 */
export function parseVitestEvidence(stdout, stderr) {
  const text = stripAnsi(`${stdout}\n${stderr}`);

  // Vitest 4 default reporter: "Tests  865 passed (865)" (often indented).
  const testsLine = text.match(/Tests\s+(\d+\s+passed(?:\s*\(\d+\))?(?:\s*\|\s*[^|\n]+)*)/i);
  const filesParen = text.match(/Test Files\s+\d+\s+passed\s*\((\d+)\)/i);
  const filesAny = text.match(/Test Files\s+[^\n]*\((\d+)\)/i);
  const fileTotal = filesParen?.[1] ?? filesAny?.[1];

  if (testsLine) {
    const detail = testsLine[1].trim();
    return fileTotal ? `${detail} in ${fileTotal} files` : detail;
  }

  // Looser fallback for CI reporters or truncated capture buffers.
  const loose = text.match(/Tests\s+(.{0,120}?passed(?:\s*\(\d+\))?)/i);
  if (loose) {
    const detail = loose[1].trim();
    return fileTotal ? `${detail} in ${fileTotal} files` : detail;
  }

  if (/Tests\s+.+passed/i.test(text)) {
    return fileTotal ? `tests passed in ${fileTotal} files` : 'vitest reported tests passed';
  }

  return null;
}
