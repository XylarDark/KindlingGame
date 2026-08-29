export const UI_FONT = 'Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

export function textResolution(): number {
  if (typeof window === "undefined") return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.max(2, Math.min(4, Math.round(dpr)));
}
