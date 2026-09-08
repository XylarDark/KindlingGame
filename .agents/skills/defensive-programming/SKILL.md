---
name: defensive-programming
description: Use when writing code that touches external input, file I/O, network calls, or async concurrency - covers null checks, error context wrapping, boundary validation, edge cases, and recording failures in docs/KNOWN_ERRORS.md.
---

# Defensive programming

Assume the worst about anything crossing a boundary:

- External input can be invalid, null, undefined, or malicious.
- Network calls can fail, time out, or return unexpected data.
- File operations can fail on permissions, a full disk, or a missing path.
- All user input needs validation and sanitization.

## Check for null and undefined

```typescript
// Good: explicit check with a clear message
if (!data || !data.user) {
  throw new Error('User data is required');
}
const name = data.user.name;

// Bad: assumes the shape exists
const name = data.user.name;
```

## Wrap errors with context

Attach the failing input to the message and preserve the original error via `cause`
(available under this project's ES2022 target):

```typescript
// Good: message says what failed, cause keeps the original stack
try {
  await processFile(path);
} catch (error) {
  throw new Error(`Failed to process ${path}`, { cause: error });
}

// Bad: rethrows with no added context
try {
  await processFile(path);
} catch (error) {
  throw error;
}
```

## Validate at boundaries

Validate at function entry points, at API boundaries, and at data transformation
boundaries. Never trust data from an external source, including data that came from your
own service on a previous hop.

## Degrade gracefully

- Provide fallbacks for non-critical features.
- Log errors instead of crashing when the failure is recoverable.
- Return error messages that help the user act, without leaking internals.
- Use default values only where a default is genuinely safe.

## Edge cases to consider every time

- Empty arrays, strings, and objects
- Very large numbers (overflow) and negative numbers where unexpected
- Special characters, Unicode, and emoji in strings
- Concurrent access and modification
- Network timeouts
- Partial failures in batch operations

## Async and concurrency

- Prefer `async`/`await` over callbacks, and handle errors with `try`/`catch`.
- Never drop an `await`; keep the lint rule that catches floating promises enabled.
- Use `Promise.all()` for parallel work that must all succeed.
- Use `Promise.allSettled()` when some failures are acceptable.
- Limit concurrency with a worker pool rather than firing unbounded parallel work.
- Use locks or semaphores where shared state is unavoidable, and test concurrent paths.
- Configure timeouts and clean up resources on every error path.
- Never swallow an error silently; propagate it or record it.

## Record failures so they do not recur

When a build, lint, test, or runtime error occurs, note what failed (command, file, step),
the likely cause, and the fix applied. Do not move on as if it did not happen.

- **Primary log:** append an entry to `docs/KNOWN_ERRORS.md` with symptom, cause, fix, and
  date.
- **Automation limits:** if the failure comes from a tool that cannot be scripted, record it
  in `docs/operational/automation-gaps.md` as well.
- **Before similar work:** read `docs/KNOWN_ERRORS.md` first so a documented failure is not
  repeated.

## Checklist

- [ ] External input validated at the boundary
- [ ] Errors carry context and preserve `cause`
- [ ] Async errors handled; no floating promises
- [ ] Concurrency bounded and race conditions considered
- [ ] Timeouts configured and resources cleaned up on failure
- [ ] New failure modes recorded in `docs/KNOWN_ERRORS.md`
