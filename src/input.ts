import { state } from './state';
import { startMove, initGameLines } from './game-logic';
import { checkSolvableFromGameLines } from './solver';
import { calculateLayout } from './geometry';
import { generateLevel } from './level-generator';
import { editor, handleEditorClick, handleEditorKey, updatePointer, refreshAfterEdit } from './editor';
import type { Application, FederatedPointerEvent } from 'pixi.js';

function resetGame(app: Application): void {
  state.victory = null;
  state.animState = null;
  state.levelData.lines = generateLevel(state.levelData.cols, state.levelData.rows);
  const layout = calculateLayout(state.levelData.cols, state.levelData.rows, app.screen.width, app.screen.height);
  state.cellSize = layout.cellSize;
  state.gridOriginX = layout.gridOriginX;
  state.gridOriginY = layout.gridOriginY;
  initGameLines();
  state.overlaps = [];
  state.solvable = checkSolvableFromGameLines(state.gameLines, state.levelData.cols, state.levelData.rows);
}

function isInsideButton(x: number, y: number, appWidth: number, appHeight: number): boolean {
  const btnWidth = 200;
  const btnHeight = 52;
  const btnX = appWidth / 2;
  const btnY = appHeight / 2 + 40;
  return (
    x >= btnX - btnWidth / 2 &&
    x <= btnX + btnWidth / 2 &&
    y >= btnY - btnHeight / 2 &&
    y <= btnY + btnHeight / 2
  );
}

export function handleClick(e: FederatedPointerEvent, app: Application): void {
  if (editor.mode === 'edit') {
    const handled = handleEditorClick(e);
    if (handled) refreshAfterEdit();
    return;
  }

  // Victory screen — check "Play Again" button
  if (state.victory && state.victory.buttonAlpha >= 0.9) {
    if (isInsideButton(e.global.x, e.global.y, app.screen.width, app.screen.height)) {
      resetGame(app);
    }
    return; // Block all other clicks during victory
  }

  // Play mode
  if (state.animState) return;

  const col = Math.floor((e.global.x - state.gridOriginX) / state.cellSize);
  const row = Math.floor((e.global.y - state.gridOriginY) / state.cellSize);

  for (let i = state.gameLines.length - 1; i >= 0; i--) {
    const g = state.gameLines[i];
    if (!g.alive) continue;
    for (const [c, r] of g.cells) {
      if (c === col && r === row) {
        startMove(g);
        return;
      }
    }
  }
}

export function handlePointerMove(e: FederatedPointerEvent): void {
  updatePointer(e.global.x, e.global.y);
}

export function handleKeyDown(e: KeyboardEvent, app: Application): void {
  // Editor key handling first
  if (editor.mode === 'edit' || e.key === 'e' || e.key === 'E') {
    if (handleEditorKey(e)) {
      if (editor.mode === 'edit') refreshAfterEdit();
      return;
    }
  }

  // Play mode keys
  if (editor.mode === 'play') {
    if (e.key === 'r' || e.key === 'R') {
      resetGame(app);
    }
  }
}
