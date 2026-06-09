/**
 * game-engine.ts — 纯数据游戏引擎，零 PixiJS 依赖
 *
 * 所有游戏逻辑（移动、碰撞、可解性验证）都在这里，
 * 渲染层只读取数据来画图，不参与任何逻辑判断。
 */

// ── 数据类型 ──────────────────────────────────────────────────

export interface Direction {
  dc: number;
  dr: number;
}

export interface LineData {
  id: number;
  points: [number, number][];
}

export interface LevelData {
  cols: number;
  rows: number;
  lines: LineData[];
}

export interface GridLine {
  id: number;
  cells: [number, number][];
  dir: Direction;
  alive: boolean;
}

// ── 几何工具 ──────────────────────────────────────────────────

/** 展开折线关键点为逐格路径 */
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
      cells.push([c, r]);
      c += dc;
      r += dr;
    }
  }
  cells.push([...points[points.length - 1]]);
  return cells;
}

/** 检查多条线段是否有格子重叠 */
export function checkOverlaps(
  lines: LineData[],
  cols: number,
  rows: number,
): { ok: boolean; overlaps: { cell: [number, number]; lineIds: number[] }[] } {
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
  const result: { cell: [number, number]; lineIds: number[] }[] = [];
  for (const [key, ids] of cellMap) {
    if (ids.length > 1) {
      const [c, r] = key.split(',').map(Number);
      result.push({ cell: [c, r], lineIds: ids });
    }
  }
  return { ok: result.length === 0, overlaps: result };
}

// ── LineData → GridLine 转换 ──────────────────────────────────

/** 从 LineData 创建 GridLine（用于初始化游戏状态） */
export function createGridLine(ld: LineData): GridLine {
  const cells = expandCells(ld.points);
  const [c0, r0] = ld.points[0];
  const [c1, r1] = ld.points[1];
  return {
    id: ld.id,
    cells,
    dir: { dc: Math.sign(c0 - c1), dr: Math.sign(r0 - r1) },
    alive: true,
  };
}

/** 批量创建 GridLine[] */
export function createGridLines(lines: LineData[]): GridLine[] {
  return lines.map(createGridLine);
}

// ── 纯数据碰撞检测 ────────────────────────────────────────────

/**
 * 检查 target 格子是否被 excludeId 以外的存活线段占据
 * 返回阻挡的线段，或 null
 */
export function findBlocker(
  lines: GridLine[],
  target: [number, number],
  excludeId: number,
): GridLine | null {
  const [c, r] = target;
  for (const g of lines) {
    if (!g.alive || g.id === excludeId) continue;
    for (const [lc, lr] of g.cells) {
      if (lc === c && lr === r) return g;
    }
  }
  return null;
}

/**
 * 模拟一条线段的完整移动：
 * - 返回 { exits: true }         → 线段可以完全移出网格
 * - 返回 { blocked: true, blockerId } → 线段被某条线段阻挡
 */
export function simulateFullMove(
  lines: GridLine[],
  targetId: number,
  cols: number,
  rows: number,
): { exits: true } | { blocked: true; blockerId: number } {
  const g = lines.find((l) => l.id === targetId);
  if (!g || !g.alive) return { exits: true };

  const { dc, dr } = g.dir;
  const cells: [number, number][] = g.cells.map((c) => [c[0], c[1]]);

  while (true) {
    const head = cells[0];
    const next: [number, number] = [head[0] + dc, head[1] + dr];
    const headOnGrid = head[0] >= 0 && head[0] < cols && head[1] >= 0 && head[1] < rows;
    const nextOnGrid = next[0] >= 0 && next[0] < cols && next[1] >= 0 && next[1] < rows;

    if (nextOnGrid) {
      const blocker = findBlocker(lines, next, targetId);
      if (blocker && headOnGrid) return { blocked: true, blockerId: blocker.id };
    }

    cells.unshift(next);
    cells.pop();

    if (cells.every(([c, r]) => c < 0 || c >= cols || r < 0 || r >= rows)) {
      return { exits: true };
    }
  }
}

// ── 贪心可解性验证（核心算法）────────────────────────────────

/**
 * 贪心可解性验证 — 模拟"逐个清除不被阻挡的线段"
 *
 * 算法：
 *   1. 遍历所有存活线段，找到可以完全移出网格的（不被阻挡）
 *   2. 把它们标记为 alive=false
 *   3. 重复，直到：
 *      a. 所有线段都被清除 → 可解
 *      b. 一次遍历中没有找到任何可以清除的线段 → 无解（死锁）
 *
 * 正确性证明：
 *   移除一条线段只会释放格子，不会新增阻挡。
 *   因此如果某次遍历中没有线段能移动，说明剩余线段互相阻挡形成环。
 *
 * 复杂度：O(n² × cells)，n 是线段数，实际运行几微秒。
 */
export function verifySolvable(
  lines: GridLine[],
  cols: number,
  rows: number,
): { solvable: boolean; remaining: number } {
  // 创建可变副本，不修改原始数据
  const sim: GridLine[] = lines.map((l) => ({
    id: l.id,
    cells: l.cells.map((c) => [c[0], c[1]] as [number, number]),
    dir: { dc: l.dir.dc, dr: l.dir.dr },
    alive: l.alive,
  }));

  let aliveCount = sim.filter((l) => l.alive).length;

  while (aliveCount > 0) {
    let removedAny = false;

    for (const g of sim) {
      if (!g.alive) continue;

      const result = simulateFullMove(sim, g.id, cols, rows);
      if ('exits' in result) {
        g.alive = false;
        aliveCount--;
        removedAny = true;
      }
    }

    if (!removedAny) {
      // 死锁：剩余线段互相阻挡
      return { solvable: false, remaining: aliveCount };
    }
  }

  return { solvable: true, remaining: 0 };
}

/**
 * 从 LineData[] 直接验证可解性（不需要 PixiJS 的 GameLine）
 */
export function verifyLevelSolvable(
  levelData: LevelData,
): { solvable: boolean; remaining: number } {
  const gridLines = createGridLines(levelData.lines);
  const result = verifySolvable(gridLines, levelData.cols, levelData.rows);
  return result;
}

// ── 纯数据单步移动 ───────────────────────────────────────────

/**
 * 执行一步移动（线段向方向移动一格，尾部缩回一格）
 * 返回 true 如果线段移出了网格（该线段不再存活）
 */
export function doOneStep(
  g: GridLine,
  cols: number,
  rows: number,
): boolean {
  const { dc, dr } = g.dir;
  const head = g.cells[0];
  const nextHead: [number, number] = [head[0] + dc, head[1] + dr];

  g.cells.unshift(nextHead);
  g.cells.pop();

  const allOffGrid = g.cells.every(([c, r]) => c < 0 || c >= cols || r < 0 || r >= rows);
  if (allOffGrid) {
    g.alive = false;
    return true;
  }
  return false;
}
