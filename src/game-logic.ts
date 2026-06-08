import type { GameLine, SimResult } from './types';
import { state, type VictoryParticle } from './state';
import { STEP_INTERVAL, FLASH_DURATION, PALETTE, VICTORY_COLORS, VICTORY_PARTICLE_COUNT } from './constants';
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

    // Victory check: all lines cleared
    if (state.gameLines.every((l) => !l.alive)) {
      triggerVictory();
    }
  }
}

function triggerVictory(): void {
  const particles: VictoryParticle[] = [];
  const cx = state.gridOriginX + (state.levelData.cols * state.cellSize) / 2;
  const cy = state.gridOriginY + (state.levelData.rows * state.cellSize) / 2;

  for (let i = 0; i < VICTORY_PARTICLE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / VICTORY_PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
    const speed = 80 + Math.random() * 250;
    const life = 1500 + Math.random() * 2000;
    particles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: VICTORY_COLORS[Math.floor(Math.random() * VICTORY_COLORS.length)],
      size: 3 + Math.random() * 6,
      life,
      maxLife: life,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 8,
    });
  }

  state.victory = {
    timer: 0,
    particles,
    textScale: 0,
    buttonAlpha: 0,
  };
}

export function updateVictory(dt: number): void {
  if (!state.victory) return;
  state.victory.timer += dt;

  // Update particles
  for (const p of state.victory.particles) {
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
    p.vy += 120 * (dt / 1000); // gravity
    p.life -= dt;
    p.rotation += p.rotSpeed * (dt / 1000);
  }
  // Remove dead particles
  state.victory.particles = state.victory.particles.filter((p) => p.life > 0);

  // Text pop-in
  if (state.victory.timer > 300) {
    const t = Math.min((state.victory.timer - 300) / 200, 1);
    // Elastic ease out
    state.victory.textScale = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * ((2 * Math.PI) / 3));
  }

  // Button fade-in
  if (state.victory.timer > 800) {
    state.victory.buttonAlpha = Math.min((state.victory.timer - 800) / 400, 1);
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
      offset: 0,
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
    offset: 0,
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
  const step = state.animState.stepInterval;
  state.animState.offset = Math.min(state.animState.timer / step, 1);

  if (state.animState.timer < step) return;
  state.animState.timer -= step;
  state.animState.offset = 0;

  doOneStep(g);
}
