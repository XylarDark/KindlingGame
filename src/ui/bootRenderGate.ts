/**
 * Hold mid-tier backbuffer resize and camera zoom at 1 until BootScene finishes warm.
 * Applying renderScale during boot (Phaser READY + coarse mid 0.85) froze the game loop
 * on phones before shop launch — canvas stayed shell blue (#1b2238).
 */
let bootRenderGateActive = true;

export function isBootRenderGateActive(): boolean {
  return bootRenderGateActive;
}

export function releaseBootRenderGate(): void {
  bootRenderGateActive = false;
}

export function resetBootRenderGateForTests(): void {
  bootRenderGateActive = true;
}
