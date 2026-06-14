import { Container, Graphics, Color, Text } from 'pixi.js';
import { state } from './state';
import { PALETTE } from './constants';
import type { GameLine } from './types';
import { graphicsPool, clearContainerToPool } from './object-pool';

function lerpColor(c1: number, c2: number, t: number): number {
  const a = new Color(c1);
  const b = new Color(c2);
  return new Color([a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t]).toNumber();
}

function drawCellPath(g: Graphics, cells: [number, number][], halfCell: number, offsetY = 0, headOffX = 0, headOffY = 0): void {
  if (cells.length === 0) return;
  const [c0, r0] = cells[0];
  g.moveTo(
    state.gridOriginX + c0 * state.cellSize + halfCell + headOffX,
    state.gridOriginY + r0 * state.cellSize + halfCell + offsetY + headOffY,
  );
  for (let i = 1; i < cells.length; i++) {
    const [c, r] = cells[i];
    g.lineTo(
      state.gridOriginX + c * state.cellSize + halfCell,
      state.gridOriginY + r * state.cellSize + halfCell + offsetY,
    );
  }
}

function getVisibleCells(g: GameLine): [number, number][] {
  return g.cells.filter(
    ([c, r]) => c >= -2 && c <= state.levelData.cols + 1 && r >= -2 && r <= state.levelData.rows + 1,
  );
}

export function drawGrid(container: Container): void {
  clearContainerToPool(container);
  const { cols, rows } = state.levelData;
  const g = graphicsPool.take();

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
  clearContainerToPool(container);
  const halfCell = state.cellSize / 2;
  const lineWeight = state.cellSize * 0.35;

  // Sub-cell pixel offset for smooth movement
  let offX = 0, offY = 0;
  if (state.animState && state.animState.moving) {
    const gl = state.gameLines.find((l) => l.id === state.animState!.lineId);
    if (gl) {
      offX = gl.dir.dc * state.cellSize * state.animState.offset;
      offY = gl.dir.dr * state.cellSize * state.animState.offset;
    }
  }

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

    // Per-line offset: only the head cell of the moving line gets the smooth shift
    const isMoving = state.animState && state.animState.moving && gl.id === state.animState.lineId;
    const headX = isMoving ? offX : 0;
    const headY = isMoving ? offY : 0;

    const g = graphicsPool.take();

    // Glow layer
    g.setStrokeStyle({ width: lineWeight + 12, color: mainColor, alpha: glowAlpha, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell, 0, headX, headY);
    g.stroke();

    // Main line
    g.setStrokeStyle({ width: lineWeight, color: mainColor, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell, 0, headX, headY);
    g.stroke();

    // Highlight
    g.setStrokeStyle({ width: lineWeight * 0.35, color: mainColor, alpha: brightAlpha, cap: 'round', join: 'round' });
    drawCellPath(g, visibleCells, halfCell, -lineWeight * 0.15, headX, headY);
    g.stroke();

    // Round caps
    const capRadius = lineWeight / 2;
    const [sc, sr] = visibleCells[0];
    const [ec, er] = visibleCells[visibleCells.length - 1];
    g.circle(
      state.gridOriginX + sc * state.cellSize + halfCell + headX,
      state.gridOriginY + sr * state.cellSize + halfCell + headY,
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
  clearContainerToPool(container);
  const halfCell = state.cellSize / 2;
  const arrowSize = state.cellSize * 0.38;

  for (const gl of state.gameLines) {
    if (!gl.alive) continue;
    const [sc, sr] = gl.cells[0];
    if (sc < 0 || sc >= state.levelData.cols || sr < 0 || sr >= state.levelData.rows) continue;

    // Sub-cell offset for the moving line's head
    let headOX = 0, headOY = 0;
    if (state.animState && state.animState.moving && gl.id === state.animState.lineId) {
      headOX = gl.dir.dc * state.cellSize * state.animState.offset;
      headOY = gl.dir.dr * state.cellSize * state.animState.offset;
    }

    const ax = state.gridOriginX + sc * state.cellSize + halfCell + gl.dir.dc * halfCell * 0.65 + headOX;
    const ay = state.gridOriginY + sr * state.cellSize + halfCell + gl.dir.dr * halfCell * 0.65 + headOY;
    const angle = Math.atan2(gl.dir.dr, gl.dir.dc);
    const h = arrowSize * 0.8;
    const w = arrowSize * 0.5;

    const g = graphicsPool.take();

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
  clearContainerToPool(container);
  if (state.overlaps.length === 0) return;

  for (const ov of state.overlaps) {
    const [c, r] = ov.cell;
    const x = state.gridOriginX + c * state.cellSize;
    const y = state.gridOriginY + r * state.cellSize;
    const g = graphicsPool.take();

    g.roundRect(x + 2, y + 2, state.cellSize - 4, state.cellSize - 4, 4);
    g.fill({ color: PALETTE.overlapCell, alpha: PALETTE.overlapAlpha });

    g.roundRect(x + 1, y + 1, state.cellSize - 2, state.cellSize - 2, 4);
    g.stroke({ width: 2, color: PALETTE.overlapBorder });

    container.addChild(g);
  }
}

// 编辑按钮区域（供 input.ts 点击检测用）
export const EDIT_BTN = { x: 0, y: 0, w: 70, h: 32 };

export function drawHUD(container: Container, appWidth: number, appHeight: number): void {
  clearContainerToPool(container);
  const alive = state.gameLines.filter((l) => l.alive).length;

  const solvText = state.solvable === null ? '检查中...' : state.solvable ? '✅ 有解' : '❌ 无解';
  const info = new Text({
    text: `线段: ${alive}/${state.gameLines.length}  |  ${solvText}  |  点击线段移动`,
    style: { fontSize: 14, fill: PALETTE.hudText, fontFamily: 'sans-serif' },
  });
  info.x = 16;
  info.y = 16;
  container.addChild(info);

  // ── 编辑按钮（右上角）──
  EDIT_BTN.x = appWidth - EDIT_BTN.w - 12;
  EDIT_BTN.y = 8;

  const btnG = graphicsPool.take();
  btnG.roundRect(EDIT_BTN.x, EDIT_BTN.y, EDIT_BTN.w, EDIT_BTN.h, 8);
  btnG.fill({ color: 0x4a6fa5, alpha: 0.85 });
  btnG.setStrokeStyle({ width: 1, color: 0x6b8fc2, alpha: 0.6 });
  btnG.roundRect(EDIT_BTN.x, EDIT_BTN.y, EDIT_BTN.w, EDIT_BTN.h, 8);
  btnG.stroke();
  container.addChild(btnG);

  const btnText = new Text({
    text: '✏️ 编辑',
    style: { fontSize: 13, fill: 0xffffff, fontFamily: 'sans-serif', fontWeight: 'bold' },
  });
  btnText.anchor.set(0.5);
  btnText.x = EDIT_BTN.x + EDIT_BTN.w / 2;
  btnText.y = EDIT_BTN.y + EDIT_BTN.h / 2;
  container.addChild(btnText);

  // 底部提示
  const hint = new Text({
    text: 'R 重新生成  |  F 适配屏幕',
    style: { fontSize: 12, fill: PALETTE.hudText, fontFamily: 'sans-serif' },
  });
  hint.alpha = 0.6;
  hint.x = 16;
  hint.y = appHeight - 28;
  container.addChild(hint);

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

// ── Victory overlay ──

export function drawVictoryOverlay(container: Container, appWidth: number, appHeight: number): void {
  clearContainerToPool(container);
  if (!state.victory) return;

  // Semi-transparent backdrop
  const backdrop = graphicsPool.take();
  const backdropAlpha = Math.min(state.victory.timer / 500, 0.6);
  backdrop.rect(0, 0, appWidth, appHeight);
  backdrop.fill({ color: 0x000000, alpha: backdropAlpha });
  container.addChild(backdrop);

  // Particles
  for (const p of state.victory.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    const g = graphicsPool.take();

    // Draw different shapes for variety
    const shapeType = Math.floor(p.color) % 3;
    if (shapeType === 0) {
      // Circle
      g.circle(0, 0, p.size);
      g.fill({ color: p.color, alpha });
    } else if (shapeType === 1) {
      // Star / diamond
      g.moveTo(0, -p.size);
      g.lineTo(p.size * 0.6, 0);
      g.lineTo(0, p.size);
      g.lineTo(-p.size * 0.6, 0);
      g.closePath();
      g.fill({ color: p.color, alpha });
    } else {
      // Square
      g.rect(-p.size / 2, -p.size / 2, p.size, p.size);
      g.fill({ color: p.color, alpha });
    }

    g.x = p.x;
    g.y = p.y;
    g.rotation = p.rotation;
    container.addChild(g);
  }

  // Victory text with pop-in animation
  if (state.victory.textScale > 0) {
    const text = new Text({
      text: '🎉 胜利！',
      style: {
        fontSize: 64,
        fill: 0xffd54f,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        dropShadow: {
          color: 0x000000,
          blur: 8,
          distance: 3,
          alpha: 0.6,
        },
      },
    });
    text.anchor.set(0.5);
    text.x = appWidth / 2;
    text.y = appHeight / 2 - 60;
    text.scale.set(state.victory.textScale);
    container.addChild(text);
  }

  // "Play Again" button
  if (state.victory.buttonAlpha > 0) {
    const btnContainer = new Container();
    const btnWidth = 200;
    const btnHeight = 52;
    const btnX = appWidth / 2;
    const btnY = appHeight / 2 + 40;

    // Button background with rounded corners
    const btnBg = graphicsPool.take();
    btnBg.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 26);
    btnBg.fill({ color: 0xffd54f, alpha: state.victory.buttonAlpha });
    btnBg.stroke({ width: 2, color: 0xffe082, alpha: state.victory.buttonAlpha });

    // Button text
    const btnText = new Text({
      text: '再来一局',
      style: {
        fontSize: 22,
        fill: 0x0b1120,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
      },
    });
    btnText.anchor.set(0.5);
    btnText.alpha = state.victory.buttonAlpha;

    btnContainer.addChild(btnBg, btnText);
    btnContainer.x = btnX;
    btnContainer.y = btnY;

    container.addChild(btnContainer);
  }
}
