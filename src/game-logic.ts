import type { GameLine, SimResult } from './types';
import { state } from './state';
import { STEP_INTERVAL, FLASH_DURATION, PALETTE } from './constants';
import { expandCells } from './geometry';
import { checkSolvableFromGameLines } from './solver';

export function initGameLines(): void {
  state.gameLines = state.levelData.lines.map((ld, idx) => {
    const cells = expandCells(ld.points);
    const [c0, r0] = ld.points[0];
    const [c1, r1] = ld.points[1];
    const dir = { dc: Math.sign(c0 - c1), dr: Math.sign(r0 - r1) };
    return {
      id: ld.id,
      cells,
      dir,
      color: PALETTE.lineColors[idx % PALETTE.lineColors.length],
      flashAlpha: 0,
      alive: true,
    };
  });
}

export function findBlocker(target: [number, number], excludeId: number): GameLine | null {
  const [c, r] = target;
  for (const g of state.gameLines) {
    if (!g.alive || g.id === excludeId) continue;
    for (const [lc, lr] of g.cells) {
      if (lc === c && lr === r) return g;
    }
  }
  return null;
}

export function simulateFullMove(g: GameLine): SimResult {
  const { dc, dr } = g.dir;
  const { cols, rows } = state.levelData;
  const cells: [number, number][] = g.cells.map((c) => [c[0], c[1]] as [number, number]);

  while (true) {
    const head = cells[0];
    const next: [number, number] = [head[0] + dc, head[1] + dr];
    const headOnGrid = head[0] >= 0 && head[0] < cols && head[1] >= 0 && head[1] < rows;
    const nextOnGrid = next[0] >= 0 && next[0] < cols && next[1] >= 0 && next[1] < rows;

    if (nextOnGrid) {
      const blocker = findBlocker(next, g.id);
      if (blocker && headOnGrid) return { blocked: true, blocker };
    }

    cells.unshift(next);
    cells.pop();

    if (cells.every(([c, r]) => c < 0 || c >= cols || r < 0 || r >= rows)) {
      return { exits: true };
    }
  }
}

export function doOneStep(g: GameLine): void {
  const { dc, dr } = g.dir;
  const head = g.cells[0];
  const nextHead: [number, number] = [head[0] + dc, head[1] + dr];

  g.cells.unshift(nextHead);
  g.cells.pop();

  const { cols, rows } = state.levelData;
  const allOffGrid = g.cells.every(([c, r]) => c < 0 || c >= cols || r < 0 || r >= rows);
  if (allOffGrid) {
    g.alive = false;
    if (state.animState) state.animState.moving = false;
    state.animState = null;
    state.solvable = checkSolvableFromGameLines(state.gameLines, cols, rows);
  }
}

export function startMove(g: GameLine): void {
  const result = simulateFullMove(g);

  if ('blocked' in result) {
    state.animState = {
      lineId: g.id,
      timer: 0,
      stepInterval: STEP_INTERVAL,
      flashLines: [g.id, result.blocker.id],
      flashTimer: FLASH_DURATION,
      moving: false,
    };
    return;
  }

  state.animState = {
    lineId: g.id,
    timer: 0,
    stepInterval: STEP_INTERVAL,
    flashLines: [],
    flashTimer: 0,
    moving: true,
  };
}

export function updateAnim(dt: number): void {
  if (!state.animState) return;

  const g = state.gameLines.find((l) => l.id === state.animState!.lineId);

  if (state.animState.flashTimer > 0) {
    state.animState.flashTimer -= dt;
    const progress = Math.max(0, state.animState.flashTimer / FLASH_DURATION);
    const flashVal = Math.sin(progress * Math.PI * 4) * 0.6 + 0.4;
    for (const fid of state.animState.flashLines) {
      const fl = state.gameLines.find((l) => l.id === fid);
      if (fl) fl.flashAlpha = flashVal;
    }
    if (state.animState.flashTimer <= 0) {
      for (const fid of state.animState.flashLines) {
        const fl = state.gameLines.find((l) => l.id === fid);
        if (fl) fl.flashAlpha = 0;
      }
      state.animState = null;
      state.solvable = checkSolvableFromGameLines(
        state.gameLines,
        state.levelData.cols,
        state.levelData.rows,
      );
    }
    return;
  }

  if (!state.animState.moving || !g || !g.alive) {
    state.animState = null;
    state.solvable = checkSolvableFromGameLines(
      state.gameLines,
      state.levelData.cols,
      state.levelData.rows,
    );
    return;
  }

  state.animState.timer += dt;
  if (state.animState.timer < state.animState.stepInterval) return;
  state.animState.timer -= state.animState.stepInterval;

  doOneStep(g);
}
