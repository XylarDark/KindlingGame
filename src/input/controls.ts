export function clampInput(dx: number, dy: number): { dx: number; dy: number } {
  const x = Math.max(-1, Math.min(1, dx));
  const y = Math.max(-1, Math.min(1, dy));
  const len = Math.hypot(x, y);
  if (len <= 1) return { dx: x, dy: y };
  return { dx: x / len, dy: y / len };
}
