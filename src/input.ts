import { state } from './state';
import { startMove, initGameLines } from './game-logic';
import { checkSolvableFromGameLines } from './solver';
import { calculateLayout } from './geometry';
import { generateLevel } from './level-generator';
import { editor, handleEditorClick, handleEditorKey, updatePointer, refreshAfterEdit } from './editor';
import { screenToGrid, hitTestZoomSlider, zoomIn, zoomOut, handleSliderDrag, fitToScreen } from './zoom';
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

  // 大网格重新适配
  if (state.levelData.cols > 12 || state.levelData.rows > 12) {
    fitToScreen(app.screen.width, app.screen.height);
  }
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

// 滑块拖拽状态
let sliderDragging = false;

export function handleClick(e: FederatedPointerEvent, app: Application): void {
  const screenX = e.global.x;
  const screenY = e.global.y;

  // ── 缩放滑块 hit-test（优先） ──
  const zoomHit = hitTestZoomSlider(screenX, screenY, app.screen.width, app.screen.height);
  if (zoomHit === 'plus') {
    zoomIn();
    return;
  }
  if (zoomHit === 'minus') {
    zoomOut();
    return;
  }
  if (zoomHit === 'track') {
    sliderDragging = true;
    handleSliderDrag(screenY, app.screen.height);
    return;
  }

  if (editor.mode === 'edit') {
    // 编辑模式也需要缩放坐标转换
    const handled = handleEditorClick(e);
    if (handled) refreshAfterEdit();
    return;
  }

  // Victory screen — check "Play Again" button
  if (state.victory && state.victory.buttonAlpha >= 0.9) {
    if (isInsideButton(screenX, screenY, app.screen.width, app.screen.height)) {
      resetGame(app);
    }
    return; // Block all other clicks during victory
  }

  // Play mode
  if (state.animState) return;

  // 使用缩放感知的坐标转换
  const { col, row } = screenToGrid(screenX, screenY);

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
  // 滑块拖拽
  if (sliderDragging) {
    handleSliderDrag(e.global.y, window.innerHeight);
    return;
  }
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
    if (e.key === 'f' || e.key === 'F') {
      fitToScreen(app.screen.width, app.screen.height);
    }
  }
}

// 全局 mouseup 监听（结束滑块拖拽）
window.addEventListener('mouseup', () => {
  sliderDragging = false;
});
