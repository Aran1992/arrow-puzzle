import { state } from './state';
import { startMove, initGameLines } from './game-logic';
import { checkSolvableFromGameLines } from './solver';
import { calculateLayout } from './geometry';
import { generateLevel } from './level-generator';
import { editor, handleEditorClick, handleEditorKey, updatePointer, refreshAfterEdit } from './editor';
import type { Application, FederatedPointerEvent } from 'pixi.js';

export function handleClick(e: FederatedPointerEvent, _app: Application): void {
  if (editor.mode === 'edit') {
    const handled = handleEditorClick(e);
    if (handled) refreshAfterEdit();
    return;
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
      state.animState = null;
      state.levelData.lines = generateLevel(state.levelData.cols, state.levelData.rows);
      const layout = calculateLayout(state.levelData.cols, state.levelData.rows, app.screen.width, app.screen.height);
      state.cellSize = layout.cellSize;
      state.gridOriginX = layout.gridOriginX;
      state.gridOriginY = layout.gridOriginY;
      initGameLines();
      state.overlaps = [];
      state.solvable = checkSolvableFromGameLines(
        state.gameLines,
        state.levelData.cols,
        state.levelData.rows,
      );
    }
  }
}
