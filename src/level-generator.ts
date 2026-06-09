import type { LineData } from './types';
import { checkOverlaps, verifyLevelSolvable } from './game-engine';
import type { LevelData } from './game-engine';

/**
 * 生成一个保证有解的关卡
 *
 * 流程：随机生成线段 → 贪心验证可解性 → 无解则无限重试
 * 使用 game-engine.ts 的 verifyLevelSolvable 算法（微秒级）。
 * 保证永远返回非空数组。
 */
export function generateLevel(cols: number, rows: number): LineData[] {
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  // 线段密度随网格大小自适应：小网格用 0.22，大网格适当降低避免死锁
  const density = cols * rows <= 64 ? 0.22 : Math.max(0.12, 0.22 - (cols * rows - 64) * 0.0008);
  const numLines = Math.max(3, Math.floor(cols * rows * density));

  function walk(
    c: number,
    r: number,
    dc: number,
    dr: number,
    steps: number,
  ): [number, number][] | null {
    const pts: [number, number][] = [[c, r]];
    let cc = c;
    let rr = r;
    for (let s = 0; s < steps; s++) {
      cc += dc;
      rr += dr;
      if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return null;
      pts.push([cc, rr]);
    }
    return pts;
  }

  function simplifyPoints(points: [number, number][]): [number, number][] {
    if (points.length <= 2) return points;
    const result: [number, number][] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const [pc, pr] = result[result.length - 1];
      const [cc, cr] = points[i];
      const [nc, nr] = points[i + 1];
      if (Math.sign(cc - pc) !== Math.sign(nc - cc) || Math.sign(cr - pr) !== Math.sign(nr - cr)) {
        result.push(points[i]);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  // 无限重试，直到生成可解关卡
  let genAttempt = 0;
  while (true) {
    genAttempt++;
    const generated: LineData[] = [];
    let lineId = 1;

    for (let attempt = 0; attempt < 800 && generated.length < numLines; attempt++) {
      const numSegs = Math.random() < 0.4 ? 2 : 3;
      const startC = Math.floor(Math.random() * cols);
      const startR = Math.floor(Math.random() * rows);
      const d1 = dirs[Math.floor(Math.random() * 4)];
      const len1 = Math.floor(Math.random() * 3) + 1;
      const seg1 = walk(startC, startR, d1[0], d1[1], len1);
      if (!seg1) continue;

      let allPoints: [number, number][] = [...seg1];
      if (numSegs >= 3) {
        const turnDirs = dirs.filter(
          (d) => !(d[0] === d1[0] && d[1] === d1[1]) && !(d[0] === -d1[0] && d[1] === -d1[1]),
        );
        const d2 = turnDirs[Math.floor(Math.random() * turnDirs.length)];
        const lastP = seg1[seg1.length - 1];
        const len2 = Math.floor(Math.random() * 3) + 1;
        const seg2 = walk(lastP[0], lastP[1], d2[0], d2[1], len2);
        if (!seg2) continue;
        allPoints = [...allPoints, ...seg2.slice(1)];
      }

      const simplified = simplifyPoints(allPoints);
      const testLine: LineData = { id: lineId, points: simplified };
      if (checkOverlaps([...generated, testLine], cols, rows).ok) {
        generated.push(testLine);
        lineId++;
      }
    }

    if (generated.length === 0) continue;

    // 用纯数据贪心验证可解性（微秒级）
    const levelData: LevelData = { cols, rows, lines: generated };
    const { solvable } = verifyLevelSolvable(levelData);

    if (solvable) {
      console.log(`✅ 第 ${genAttempt} 次尝试，生成 ${generated.length} 条可解线段`);
      return generated;
    }
    // 每 50 次打印一次进度
    if (genAttempt % 50 === 0) {
      console.log(`⏳ 已尝试 ${genAttempt} 次，继续寻找可解关卡...`);
    }
  }
}
