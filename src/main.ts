import { Application, Container } from 'pixi.js';
import { state } from './state';
import { PALETTE } from './constants';
import { calculateLayout } from './geometry';
import { generateLevel } from './level-generator';
import { checkSolvableFromGameLines } from './solver';
import { initGameLines, updateAnim, updateVictory } from './game-logic';
import { drawGrid, drawGameLines, drawArrowHeads, drawOverlapCells, drawHUD, drawVictoryOverlay } from './renderer';
import { editor, drawEditorLayer, drawEditorHUD } from './editor';
import { handleClick, handleKeyDown, handlePointerMove } from './input';
import './style.css';

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    background: PALETTE.bg,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  const gridLayer = new Container();
  const overlapLayer = new Container();
  const linesLayer = new Container();
  const editorLayer = new Container();
  const arrowLayer = new Container();
  const hudLayer = new Container();
  const victoryLayer = new Container();
  app.stage.addChild(gridLayer, overlapLayer, linesLayer, editorLayer, arrowLayer, hudLayer, victoryLayer);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  function recalcLayout(): void {
    const layout = calculateLayout(state.levelData.cols, state.levelData.rows, app.screen.width, app.screen.height);
    state.cellSize = layout.cellSize;
    state.gridOriginX = layout.gridOriginX;
    state.gridOriginY = layout.gridOriginY;
  }

  // Init
  if (state.levelData.lines.length === 0) {
    state.levelData.lines = generateLevel(state.levelData.cols, state.levelData.rows);
  }
  recalcLayout();
  initGameLines();
  state.solvable = checkSolvableFromGameLines(state.gameLines, state.levelData.cols, state.levelData.rows);

  // Game loop
  app.ticker.add((ticker) => {
    if (editor.mode === 'play') {
      updateAnim(ticker.deltaMS);
      updateVictory(ticker.deltaMS);
    }
    drawGrid(gridLayer);
    drawOverlapCells(overlapLayer);
    drawGameLines(linesLayer);
    drawEditorLayer(editorLayer);
    drawArrowHeads(arrowLayer);
    if (editor.mode === 'edit') {
      drawEditorHUD(hudLayer, app.screen.width, app.screen.height);
    } else {
      drawHUD(hudLayer, app.screen.width, app.screen.height);
    }
    drawVictoryOverlay(victoryLayer, app.screen.width, app.screen.height);
  });

  // Input
  app.stage.on('pointerdown', (e) => handleClick(e, app));
  app.stage.on('pointermove', (e) => handlePointerMove(e));
  window.addEventListener('keydown', (e) => handleKeyDown(e, app));

  // Resize
  window.addEventListener('resize', () => {
    recalcLayout();
    app.stage.hitArea = app.screen;
  });
}

main();
