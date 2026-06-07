import type { LineData, Overlap } from './types';

export function expandCells(points: [number, number][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [c1, r1] = points[i];
    const [c2, r2] = points[i + 1];
    const dc = Math.sign(c2 - c1);
    const dr = Math.sign(r2 - r1);
    let c = c1;
    let r = r1;
    while (c !== c2 || r !== r2) {
      cells.push([c, r] as [number, number]);
      c += dc;
      r += dr;
    }
  }
  cells.push([...points[points.length - 1]] as [number, number]);
  return cells;
}

export function checkOverlaps(
  lines: LineData[],
  cols: number,
  rows: number,
): { ok: boolean; overlaps: Overlap[] } {
  const cellMap = new Map<string, number[]>();
  for (const ld of lines) {
    const cells = expandCells(ld.points);
    for (const [c, r] of cells) {
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const key = `${c},${r}`;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key)!.push(ld.id);
    }
  }
  const result: Overlap[] = [];
  for (const [key, ids] of cellMap) {
    if (ids.length > 1) {
      const [c, r] = key.split(',').map(Number);
      result.push({ cell: [c, r] as [number, number], lineIds: ids });
    }
  }
  return { ok: result.length === 0, overlaps: result };
}

export function calculateLayout(
  cols: number,
  rows: number,
  canvasWidth: number,
  canvasHeight: number,
): { cellSize: number; gridOriginX: number; gridOriginY: number } {
  const padding = 60;
  let cellSize = Math.min(
    Math.floor((canvasWidth - padding * 2) / (cols + 0.5)),
    Math.floor((canvasHeight - padding * 2) / (rows + 0.5)),
  );
  cellSize = Math.max(cellSize, 30);
  const gridOriginX = (canvasWidth - cols * cellSize) / 2;
  const gridOriginY = (canvasHeight - rows * cellSize) / 2;
  return { cellSize, gridOriginX, gridOriginY };
}
