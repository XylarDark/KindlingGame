export type TileCell = { c: number; r: number };

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

  const key = (c: TileCell) => `${c.c},${c.r}`;
  const open: TileCell[] = [start];
  const came = new Map<string, TileCell>();
  const gScore = new Map<string, number>([[key(start), 0]]);
  const fScore = new Map<string, number>([[key(start), manhattan(start, goal)]]);

  while (open.length > 0) {
    open.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
    const current = open.shift()!;
    if (current.c === goal.c && current.r === goal.r) {
      return reconstruct(came, current);
    }
    for (const n of neighbors(current, cols, rows)) {
      if (!walkable[n.r]![n.c]) continue;
      const tentative = (gScore.get(key(current)) ?? Infinity) + 1;
      if (tentative < (gScore.get(key(n)) ?? Infinity)) {
        came.set(key(n), current);
        gScore.set(key(n), tentative);
        fScore.set(key(n), tentative + manhattan(n, goal));
        if (!open.some((o) => o.c === n.c && o.r === n.r)) open.push(n);
      }
    }
  }
  return [];
}

function reconstruct(came: Map<string, TileCell>, current: TileCell): TileCell[] {
  const path = [current];
  const key = (c: TileCell) => `${c.c},${c.r}`;
  while (came.has(key(current))) {
    current = came.get(key(current))!;
    path.unshift(current);
  }
  return path;
}

function neighbors(cell: TileCell, cols: number, rows: number): TileCell[] {
  return [
    { c: cell.c + 1, r: cell.r },
    { c: cell.c - 1, r: cell.r },
    { c: cell.c, r: cell.r + 1 },
    { c: cell.c, r: cell.r - 1 },
  ].filter((n) => inBounds(n, cols, rows));
}

function inBounds(cell: TileCell, cols: number, rows: number): boolean {
  return cell.c >= 0 && cell.r >= 0 && cell.c < cols && cell.r < rows;
}

function manhattan(a: TileCell, b: TileCell): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}
