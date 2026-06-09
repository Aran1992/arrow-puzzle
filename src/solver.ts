import type { GameLine } from './types';
import type { GridLine } from './game-engine';
import { verifySolvable } from './game-engine';

/**
 * 从当前 GameLine[] 检查可解性（供渲染层调用）
 *
 * 将 PixiJS 的 GameLine 转换为纯数据 GridLine，然后委托给 game-engine 的贪心验证。
 */
export function checkSolvableFromGameLines(
  gameLines: GameLine[],
  cols: number,
  rows: number,
): boolean {
  const alive = gameLines.filter((g) => g.alive);
  if (alive.length === 0) return true;

  const gridLines: GridLine[] = alive.map((g) => ({
    id: g.id,
    cells: g.cells.map((c) => [c[0], c[1]] as [number, number]),
    dir: { dc: g.dir.dc, dr: g.dir.dr },
    alive: true,
  }));

  return verifySolvable(gridLines, cols, rows).solvable;
}
