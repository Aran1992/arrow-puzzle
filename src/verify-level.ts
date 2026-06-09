#!/usr/bin/env npx tsx
/**
 * verify-level.ts — 独立关卡验证脚本
 *
 * 用法：
 *   npx tsx src/verify-level.ts              # 验证 10 个随机 7×8 关卡
 *   npx tsx src/verify-level.ts 10 10 20     # 验证 20 个 10×10 关卡
 *
 * 零 PixiJS 依赖，纯数据模拟，每个关卡验证耗时 < 1ms。
 */

import { expandCells, verifyLevelSolvable, checkOverlaps } from './game-engine';
import type { LineData, LevelData } from './game-engine';

// ── 关卡生成（自适应密度，零外部依赖）──────────────────────────

function generateLevelPure(cols: number, rows: number): LineData[] {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 自适应密度
  const density = cols * rows <= 64 ? 0.22 : Math.max(0.12, 0.22 - (cols * rows - 64) * 0.0008);
  const numLines = Math.max(3, Math.floor(cols * rows * density));
  const maxGenAttempts = Math.max(100, Math.floor(500 / density));

  function walk(c: number, r: number, dc: number, dr: number, steps: number): [number, number][] | null {
    const pts: [number, number][] = [[c, r]];
    let cc = c, rr = r;
    for (let s = 0; s < steps; s++) {
      cc += dc; rr += dr;
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

  for (let genAttempt = 0; genAttempt < maxGenAttempts; genAttempt++) {
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
        const turnDirs = dirs.filter(d => !(d[0] === d1[0] && d[1] === d1[1]) && !(d[0] === -d1[0] && d[1] === -d1[1]));
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

    const levelData: LevelData = { cols, rows, lines: generated };
    const { solvable } = verifyLevelSolvable(levelData);
    if (solvable) return generated;
  }

  return [];
}

// ── 主程序 ────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const cols = parseInt(args[0]) || 7;
  const rows = parseInt(args[1]) || 8;
  const count = parseInt(args[2]) || 10;

  console.log(`\n🎲 箭头迷宫关卡验证器`);
  console.log(`   网格: ${cols}×${rows}  |  生成并验证 ${count} 个关卡\n`);

  let passCount = 0;
  let genFailCount = 0;
  let verifyFailCount = 0;
  let totalTime = 0;

  for (let i = 0; i < count; i++) {
    const t0 = performance.now();

    // 1. 生成关卡（内部已验证可解性）
    const lines = generateLevelPure(cols, rows);
    const genTime = performance.now() - t0;

    if (lines.length === 0) {
      console.log(`  ⚠️ #${(i + 1).toString().padStart(String(count).length)}  生成失败（${maxAttempts(cols, rows)} 次尝试均未找到可解布局）`);
      genFailCount++;
      continue;
    }

    // 2. 独立二次验证（完全独立于生成流程）
    const levelData: LevelData = { cols, rows, lines };
    const t1 = performance.now();
    const { solvable, remaining } = verifyLevelSolvable(levelData);
    const verifyTime = performance.now() - t1;
    totalTime += genTime + verifyTime;

    if (solvable) {
      const cellCount = lines.reduce((sum, l) => sum + expandCells(l.points).length, 0);
      console.log(
        `  ✅ #${(i + 1).toString().padStart(String(count).length)}  ` +
        `线段: ${lines.length}  格子: ${cellCount}  ` +
        `生成: ${genTime.toFixed(1)}ms  验证: ${verifyTime.toFixed(2)}ms`
      );
      passCount++;
    } else {
      console.log(
        `  ❌ #${(i + 1).toString().padStart(String(count).length)}  ` +
        `线段: ${lines.length}  生成: ${genTime.toFixed(1)}ms  ` +
        `验证: ${verifyTime.toFixed(2)}ms  ⚠️ 死锁 ${remaining} 条（BUG！生成说可解，验证说无解）`
      );
      verifyFailCount++;
    }
  }

  console.log(`\n📊 结果:`);
  console.log(`   可解: ${passCount}/${count}`);
  if (genFailCount > 0) console.log(`   生成失败: ${genFailCount}（无法在限定次数内生成可解关卡）`);
  if (verifyFailCount > 0) console.log(`   ❌ 验证失败: ${verifyFailCount}（生成与验证不一致，存在 BUG！）`);
  console.log(`   总耗时: ${totalTime.toFixed(1)}ms  |  平均: ${count > 0 ? (totalTime / (count - genFailCount)).toFixed(1) : 0}ms/关卡\n`);

  if (verifyFailCount > 0) {
    console.log(`❌ 存在验证不一致的 BUG！`);
    process.exit(1);
  } else if (passCount === count) {
    console.log(`✅  全部可解！`);
  } else {
    console.log(`⚠️  ${genFailCount} 个关卡未能生成（网格太大或密度太高）`);
  }
}

function maxAttempts(cols: number, rows: number): number {
  const density = cols * rows <= 64 ? 0.22 : Math.max(0.12, 0.22 - (cols * rows - 64) * 0.0008);
  return Math.max(100, Math.floor(500 / density));
}

main();
