/**
 * Boot warm completion flags. When the loading-gate wall-clock aborts before
 * drive/door sleep, Title finishes the remainder under the gate (no orphan showLoading).
 */
export type BootWarmPending = {
  drive: boolean;
  door: boolean;
};

let pending: BootWarmPending | null = null;

export function clearBootWarmPending(): void {
  pending = null;
}

export function setBootWarmPending(next: BootWarmPending): void {
  pending = next.drive || next.door ? { ...next } : null;
}

export function takeBootWarmPending(): BootWarmPending | null {
  const out = pending;
  pending = null;
  return out;
}

export function peekBootWarmPending(): BootWarmPending | null {
  return pending;
}
