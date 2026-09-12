import { CHIP_GAP } from "./slots";

/** Plaque panel bounds relative to a sign host — mirrors {@link signPlaqueExtents}. */
export interface ChipPlaqueExtents {
  panelW: number;
  panelH: number;
  leftLocal: number;
  rightLocal: number;
  topLocal: number;
  bottomLocal: number;
}

export interface ChipAabb {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ChipSafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Plaque panel AABB in screen/design space from a sign host position. */
export function chipPlaqueAabb(hostX: number, hostY: number, plaque: ChipPlaqueExtents): ChipAabb {
  return {
    left: hostX + plaque.leftLocal,
    right: hostX + plaque.rightLocal,
    top: hostY + plaque.topLocal,
    bottom: hostY + plaque.bottomLocal,
  };
}

export function expandAabb(aabb: ChipAabb, gap: number): ChipAabb {
  return {
    left: aabb.left - gap,
    top: aabb.top - gap,
    right: aabb.right + gap,
    bottom: aabb.bottom + gap,
  };
}

export function aabbOverlap(a: ChipAabb, b: ChipAabb): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function aabbInside(aabb: ChipAabb, safe: ChipSafeRect): boolean {
  return aabb.left >= safe.left && aabb.right <= safe.right && aabb.top >= safe.top && aabb.bottom <= safe.bottom;
}

/** Shift host x/y so the plaque sits inside the safe rect. */
export function clampChipHost(
  hostX: number,
  hostY: number,
  plaque: ChipPlaqueExtents,
  safe: ChipSafeRect,
): { x: number; y: number; aabb: ChipAabb } {
  let x = hostX;
  let y = hostY;
  let aabb = chipPlaqueAabb(x, y, plaque);
  if (aabb.left < safe.left) x += safe.left - aabb.left;
  else if (aabb.right > safe.right) x -= aabb.right - safe.right;
  if (aabb.top < safe.top) y += safe.top - aabb.top;
  else if (aabb.bottom > safe.bottom) y -= aabb.bottom - safe.bottom;
  aabb = chipPlaqueAabb(x, y, plaque);
  return { x, y, aabb };
}

/** Frame-scoped obstacle list for zero-overlap chip placement. */
export class ChipPlacer {
  private readonly placed: { id: string; priority: number; aabb: ChipAabb }[] = [];

  constructor(
    readonly safe: ChipSafeRect,
    readonly viewW: number,
    readonly viewH: number,
  ) {}

  register(id: string, aabb: ChipAabb, priority: number): void {
    this.placed.push({ id, priority, aabb });
  }

  collides(candidate: ChipAabb, priority: number, gap = CHIP_GAP): boolean {
    for (const other of this.placed) {
      if (other.priority < priority) continue;
      if (aabbOverlap(candidate, expandAabb(other.aabb, gap))) return true;
    }
    return false;
  }

  /** Candidate offsets to try when the preferred position overlaps a blocker. */
  candidateOffsets(plaque: ChipPlaqueExtents): readonly { dx: number; dy: number }[] {
    return [
      { dx: 0, dy: 0 },
      { dx: 0, dy: -(CHIP_GAP + plaque.panelH) },
      { dx: CHIP_GAP + plaque.panelW, dy: 0 },
      { dx: -(CHIP_GAP + plaque.panelW), dy: 0 },
      { dx: 0, dy: CHIP_GAP + plaque.panelH },
    ];
  }

  findOpenSlot(
    preferredX: number,
    preferredY: number,
    plaque: ChipPlaqueExtents,
    priority: number,
    id: string,
  ): { x: number; y: number; aabb: ChipAabb } | null {
    for (const { dx, dy } of this.candidateOffsets(plaque)) {
      const { x, y, aabb } = clampChipHost(preferredX + dx, preferredY + dy, plaque, this.safe);
      if (!aabbInside(aabb, this.safe)) continue;
      if (this.collides(aabb, priority)) continue;
      this.placed.push({ id, priority, aabb });
      return { x, y, aabb };
    }
    return null;
  }
}

export function unionAabb(rects: readonly ChipAabb[]): ChipAabb {
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}
