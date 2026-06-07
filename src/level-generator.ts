import type { LineData, SolverState } from './types';
import { expandCells, checkOverlaps } from './geometry';
import { dfs } from './solver';

export function generateLevel(cols: number, rows: number): LineData[] {
  const numLines = Math.floor(cols * rows * 0.22);
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

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

  for (let genAttempt = 0; genAttempt < 20; genAttempt++) {
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

    const testState: SolverState[] = generated.map((ld) => {
      const cells = expandCells(ld.points);
      const [c0, r0] = ld.points[0];
      const [c1, r1] = ld.points[1];
      return {
        id: ld.id,
        cells,
        dir: { dc: Math.sign(c0 - c1), dr: Math.sign(r0 - r1) },
      };
    });

    const visited = new Set<string>();
    if (dfs(testState, visited, Date.now(), 3000, cols, rows)) {
      console.log(`✅ 第 ${genAttempt + 1} 次尝试生成可解关卡`);
      return generated;
    }
    console.log(`⚠️ 第 ${genAttempt + 1} 次生成的关卡无解，重试...`);
  }

  console.warn('未能生成可解关卡');
  return [];
}
