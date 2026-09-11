export type TileCell = { c: number; r: number };

const pathCache = new Map<number, readonly TileCell[]>();

/** Test hook — city graph is static in production. */
export function clearPathCache(): void {
  pathCache.clear();
}

function tileIndex(c: number, r: number, cols: number): number {
  return r * cols + c;
}

function cacheKey(start: TileCell, goal: TileCell, cols: number, cells: number): number {
  return tileIndex(start.c, start.r, cols) * cells + tileIndex(goal.c, goal.r, cols);
}

function idxToCell(idx: number, cols: number): TileCell {
  return { c: idx % cols, r: Math.floor(idx / cols) };
}

class MinHeap {
  private heap: number[] = [];
  private readonly scores: Float32Array;

  constructor(scores: Float32Array) {
    this.scores = scores;
  }

  get length(): number {
    return this.heap.length;
  }

  push(idx: number): void {
    this.heap.push(idx);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): number {
    const top = this.heap[0]!;
    const tail = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = tail;
      this.bubbleDown(0);
    }
    return top;
  }

  private scoreAt(i: number): number {
    return this.scores[this.heap[i]!] ?? Infinity;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scoreAt(i) >= this.scoreAt(parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.scoreAt(left) < this.scoreAt(smallest)) smallest = left;
      if (right < n && this.scoreAt(right) < this.scoreAt(smallest)) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.heap[a]!;
    this.heap[a] = this.heap[b]!;
    this.heap[b] = tmp;
  }
}

function copyPath(path: readonly TileCell[]): TileCell[] {
  return path.map((c) => ({ c: c.c, r: c.r }));
}

export function findPath(
  walkable: boolean[][],
  start: TileCell,
  goal: TileCell,
): TileCell[] {
  const rows = walkable.length;
  const cols = walkable[0]?.length ?? 0;
  if (!inBounds(start, cols, rows) || !inBounds(goal, cols, rows)) return [];
  if (!walkable[start.r]?.[start.c] || !walkable[goal.r]?.[goal.c]) return [];
  if (start.c === goal.c && start.r === goal.r) return [start];

  const cells = rows * cols;
  const key = cacheKey(start, goal, cols, cells);
  const cached = pathCache.get(key);
  if (cached) return copyPath(cached);

  const startIdx = tileIndex(start.c, start.r, cols);
  const goalIdx = tileIndex(goal.c, goal.r, cols);
  const gScore = new Float32Array(cells).fill(Infinity);
  const fScore = new Float32Array(cells).fill(Infinity);
  const cameFrom = new Int32Array(cells).fill(-1);
  const closed = new Uint8Array(cells);
  const open = new MinHeap(fScore);

  gScore[startIdx] = 0;
  fScore[startIdx] = manhattan(start, goal);
  open.push(startIdx);

  while (open.length > 0) {
    const currentIdx = open.pop()!;
    if (closed[currentIdx]) continue;
    if (currentIdx === goalIdx) {
      const path = reconstruct(cameFrom, currentIdx, cols);
      pathCache.set(key, path);
      return copyPath(path);
    }
    closed[currentIdx] = 1;

    const c = currentIdx % cols;
    const r = (currentIdx / cols) | 0;
    const baseG = gScore[currentIdx]!;

    const tryNeighbor = (nc: number, nr: number): void => {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return;
      if (!walkable[nr]![nc]) return;
      const nIdx = tileIndex(nc, nr, cols);
      if (closed[nIdx]) return;
      const tentative = baseG + 1;
      if (tentative >= gScore[nIdx]!) return;
      cameFrom[nIdx] = currentIdx;
      gScore[nIdx] = tentative;
      fScore[nIdx] = tentative + Math.abs(nc - goal.c) + Math.abs(nr - goal.r);
      open.push(nIdx);
    };

    tryNeighbor(c + 1, r);
    tryNeighbor(c - 1, r);
    tryNeighbor(c, r + 1);
    tryNeighbor(c, r - 1);
  }

  pathCache.set(key, []);
  return [];
}

function reconstruct(cameFrom: Int32Array, currentIdx: number, cols: number): TileCell[] {
  const path: TileCell[] = [];
  let idx = currentIdx;
  while (idx >= 0) {
    path.unshift(idxToCell(idx, cols));
    idx = cameFrom[idx]!;
  }
  return path;
}

function inBounds(cell: TileCell, cols: number, rows: number): boolean {
  return cell.c >= 0 && cell.r >= 0 && cell.c < cols && cell.r < rows;
}

function manhattan(a: TileCell, b: TileCell): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}
