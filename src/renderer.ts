import { Container, Graphics, Color, Text } from 'pixi.js';
import { state } from './state';
import { PALETTE } from './constants';
import type { GameLine } from './types';

function lerpColor(c1: number, c2: number, t: number): number {
  const a = new Color(c1);
  const b = new Color(c2);
  return new Color([a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t]).toNumber();
}

function drawCellPath(g: Graphics, cells: [number, number][], halfCell: number, offsetY = 0): void {
  if (cells.length === 0) return;
  const pts: number[] = [];
  for (const [c, r] of cells) {
    pts.push(
      state.gridOriginX + c * state.cellSize + halfCell,
      state.gridOriginY + r * state.cellSize + halfCell + offsetY,
    );
  }
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i], pts[i + 1]);
  }
}

function getVisibleCells(g: GameLine): [number, number][] {
  return g.cells.filter(
    ([c, r]) => c >= -2 && c <= state.levelData.cols + 1 && r >= -2 && r <= state.levelData.rows + 1,
  );
}

export function drawGrid(container: Container): void {
  container.removeChildren();
  const { cols, rows } = state.levelData;
  const g = new Graphics();

  g.setStrokeStyle({ width: 1, color: PALETTE.gridLine });
  for (let c = 0; c <= cols; c++) {
    const x = state.gridOriginX + c * state.cellSize;
    g.moveTo(x, state.gridOriginY).lineTo(x, state.gridOriginY + rows * state.cellSize);
  }
  for (let r = 0; r <= rows; r++) {
    const y = state.gridOriginY + r * state.cellSize;
    g.moveTo(state.gridOriginX, y).lineTo(state.gridOriginX + cols * state.cellSize, y);
  }
  g.stroke();

  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      g.circle(state.gridOriginX + c * state.cellSize, state.gridOriginY + r * state.cellSize, 2);
    }
  }
  g.fill({ color: PALETTE.gridDot });

  container.addChild(g);
}

export function drawGameLines(container: Container): void {
  container.removeChildren();
  const halfCell = state.cellSize / 2;
  const lineWeight = state.cellSize * 0.35;

  for (const gl of state.gameLines) {
    if (!gl.alive) continue;
    const visibleCells = getVisibleCells(gl);
    if (visibleCells.length === 0) continue;

    let mainColor: number;
    let glowAlpha: number;
    let brightAlpha: number;
    if (gl.flashAlpha > 0) {
      mainColor = lerpColor(gl.color, PALETTE.flashColor, gl.flashAlpha);
      glowAlpha = 0.3 + gl.flashAlpha * 0.3;
      brightAlpha = 0.5 + gl.flashAlpha * 0.3;
    } else {
      mainColor = gl.color;
      glowAlpha = 0.15;
      brightAlpha = 0.45;
    }

    const g = new Graphics();

    // Glow layer
    g.setStrokeStyle({ width: lineWeight + 12, color: mainColor, alpha: glowAlpha, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell);
    g.stroke();

    // Main line
    g.setStrokeStyle({ width: lineWeight, color: mainColor, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell);
    g.stroke();

    // Highlight
    g.setStrokeStyle({ width: lineWeight * 0.35, color: mainColor, alpha: brightAlpha, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell, -lineWeight * 0.15);
    g.stroke();

    // Round caps
    const capRadius = lineWeight / 2;
    const [sc, sr] = visibleCells[0];
    const [ec, er] = visibleCells[visibleCells.length - 1];
    g.circle(
      state.gridOriginX + sc * state.cellSize + halfCell,
      state.gridOriginY + sr * state.cellSize + halfCell,
      capRadius,
    );
    g.circle(
      state.gridOriginX + ec * state.cellSize + halfCell,
      state.gridOriginY + er * state.cellSize + halfCell,
      capRadius,
    );
    g.fill({ color: mainColor });

    container.addChild(g);
  }
}

export function drawArrowHeads(container: Container): void {
  container.removeChildren();
  const halfCell = state.cellSize / 2;
  const arrowSize = state.cellSize * 0.38;

  for (const gl of state.gameLines) {
    if (!gl.alive) continue;
    const [sc, sr] = gl.cells[0];
    if (sc < 0 || sc >= state.levelData.cols || sr < 0 || sr >= state.levelData.rows) continue;

    const ax = state.gridOriginX + sc * state.cellSize + halfCell + gl.dir.dc * halfCell * 0.65;
    const ay = state.gridOriginY + sr * state.cellSize + halfCell + gl.dir.dr * halfCell * 0.65;
    const angle = Math.atan2(gl.dir.dr, gl.dir.dc);
    const h = arrowSize * 0.8;
    const w = arrowSize * 0.5;

    const g = new Graphics();

    // Shadow
    g.moveTo(h + 2, 0);
    g.lineTo(-h * 0.3 + 2, -w);
    g.lineTo(-h * 0.3 + 2, w);
    g.closePath();
    g.fill({ color: 0x000000, alpha: 0.3 });

    // Arrow body
    g.moveTo(h, 0);
    g.lineTo(-h * 0.3, -w);
    g.lineTo(-h * 0.3, w);
    g.closePath();
    g.fill({ color: PALETTE.arrowFill });
    g.stroke({ width: 1.5, color: PALETTE.arrow });

    g.x = ax;
    g.y = ay;
    g.rotation = angle;

    container.addChild(g);
  }
}

export function drawOverlapCells(container: Container): void {
  container.removeChildren();
  if (state.overlaps.length === 0) return;

  for (const ov of state.overlaps) {
    const [c, r] = ov.cell;
    const x = state.gridOriginX + c * state.cellSize;
    const y = state.gridOriginY + r * state.cellSize;
    const g = new Graphics();

    g.roundRect(x + 2, y + 2, state.cellSize - 4, state.cellSize - 4, 4);
    g.fill({ color: PALETTE.overlapCell, alpha: PALETTE.overlapAlpha });

    g.roundRect(x + 1, y + 1, state.cellSize - 2, state.cellSize - 2, 4);
    g.stroke({ width: 2, color: PALETTE.overlapBorder });

    container.addChild(g);
  }
}

export function drawHUD(container: Container, appWidth: number, appHeight: number): void {
  container.removeChildren();
  const alive = state.gameLines.filter((l) => l.alive).length;

  const solvText = state.solvable === null ? '检查中...' : state.solvable ? '✅ 有解' : '❌ 无解';
  const info = new Text({
    text: `线段: ${alive}/${state.gameLines.length}  |  ${solvText}  |  点击线段移动  |  R 重新生成`,
    style: { fontSize: 14, fill: PALETTE.hudText, fontFamily: 'sans-serif' },
  });
  info.x = 16;
  info.y = 16;
  container.addChild(info);

  if (state.solvable === false) {
    const warn = new Text({
      text: '当前局面无解，按 R 重新生成',
      style: { fontSize: 24, fill: PALETTE.hudWarn, fontFamily: 'sans-serif' },
    });
    warn.anchor.set(0.5);
    warn.x = appWidth / 2;
    warn.y = appHeight - 50;
    container.addChild(warn);
  }
}
