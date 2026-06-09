import { Container, Text } from 'pixi.js';
import { state } from './state';
import { PALETTE, DEFAULT_COLS, DEFAULT_ROWS } from './constants';
import { expandCells, checkOverlaps } from './geometry';
import { initGameLines } from './game-logic';
import { checkSolvableFromGameLines } from './solver';
import type { EditorState } from './types';
import { graphicsPool, clearContainerToPool } from './object-pool';

// ── Editor state ─────────────────────────────────────────────────────
export const editor: EditorState = {
  mode: 'play',
  currentLine: null,
  selectedId: null,
  hoverCol: -1,
  hoverRow: -1,
  editorCols: DEFAULT_COLS,
  editorRows: DEFAULT_ROWS,
};

let nextEditorLineId = 100;

// ── Helpers ──────────────────────────────────────────────────────────
function deriveDir(p0: [number, number], p1: [number, number]): { dc: number; dr: number } {
  return { dc: Math.sign(p0[0] - p1[0]), dr: Math.sign(p0[1] - p1[1]) };
}

export function findLineAt(col: number, row: number): number | null {
  for (let i = state.levelData.lines.length - 1; i >= 0; i--) {
    const cells = expandCells(state.levelData.lines[i].points);
    if (cells.some(([c, r]) => c === col && r === row)) return state.levelData.lines[i].id;
  }
  return null;
}

function canExtend(col: number, row: number): boolean {
  if (!editor.currentLine || editor.currentLine.points.length === 0) return false;
  const pts = editor.currentLine.points;
  const last = pts[pts.length - 1];
  const { cols, rows } = state.levelData;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return false;

  // Must be a cardinal direction
  if (last[0] !== col && last[1] !== row) return false;

  // Must not be the same point or backtrack
  if (col === last[0] && row === last[1]) return false;
  if (pts.length >= 2) {
    const prev = pts[pts.length - 2];
    if (col === prev[0] && row === prev[1]) return false;
  }
  return true;
}

// ── Core logic ───────────────────────────────────────────────────────
export function addPoint(col: number, row: number): void {
  if (!editor.currentLine) return;
  editor.currentLine.points.push([col, row]);
}

export function canAddPoint(col: number, row: number): boolean {
  if (editor.currentLine) return canExtend(col, row);
  const { cols, rows } = state.levelData;
  return col >= 0 && col < cols && row >= 0 && row < rows;
}

export function finishLine(): boolean {
  if (!editor.currentLine) return false;
  const pts = editor.currentLine.points;

  // Need at least 2 points
  if (pts.length < 2) {
    editor.currentLine = null;
    return false;
  }

  // Check first two points define a cardinal direction
  const [c0, r0] = pts[0];
  const [c1, r1] = pts[1];
  if (c0 !== c1 && r0 !== r1) {
    editor.currentLine = null;
    return false;
  }

  // Deduplicate consecutive points
  const deduped: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = deduped[deduped.length - 1];
    if (pts[i][0] !== last[0] || pts[i][1] !== last[1]) {
      deduped.push(pts[i]);
    }
  }

  // Remove collinear middle points
  const simplified: [number, number][] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const [pc, pr] = simplified[simplified.length - 1];
    const [cc, cr] = deduped[i];
    const [nc, nr] = deduped[i + 1];
    if (
      Math.sign(cc - pc) !== Math.sign(nc - cc) ||
      Math.sign(cr - pr) !== Math.sign(nr - cr)
    ) {
      simplified.push(deduped[i]);
    }
  }
  simplified.push(deduped[deduped.length - 1]);

  if (simplified.length < 2) {
    editor.currentLine = null;
    return false;
  }

  const newLine = {
    id: editor.currentLine.id,
    points: simplified,
  };

  // Replace if same id exists, else add
  const idx = state.levelData.lines.findIndex((l) => l.id === newLine.id);
  if (idx >= 0) {
    state.levelData.lines[idx] = newLine;
  } else {
    state.levelData.lines.push(newLine);
  }

  editor.currentLine = null;
  return true;
}

export function cancelLine(): void {
  editor.currentLine = null;
}

export function deleteLine(id: number): boolean {
  const idx = state.levelData.lines.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  state.levelData.lines.splice(idx, 1);
  if (editor.selectedId === id) editor.selectedId = null;
  if (editor.currentLine && editor.currentLine.id === id) editor.currentLine = null;
  return true;
}

export function startNewLine(col: number, row: number): void {
  editor.currentLine = { id: nextEditorLineId++, points: [[col, row]] };
  editor.selectedId = null;
}

export function startExtendLine(lineId: number, col: number, row: number): void {
  const ld = state.levelData.lines.find((l) => l.id === lineId);
  if (!ld) return;
  editor.currentLine = { id: lineId, points: [...ld.points, [col, row]] };
  editor.selectedId = null;
}

// ── Pointer update ───────────────────────────────────────────────────
export function updatePointer(x: number, y: number): void {
  const col = Math.floor((x - state.gridOriginX) / state.cellSize);
  const row = Math.floor((y - state.gridOriginY) / state.cellSize);
  const { cols, rows } = state.levelData;
  editor.hoverCol = col >= 0 && col < cols ? col : -1;
  editor.hoverRow = row >= 0 && row < rows ? row : -1;
}

// ── Click handler (called from input.ts) ─────────────────────────────
export function handleEditorClick(
  e: { global: { x: number; y: number }; button: number },
): boolean {
  const col = Math.floor((e.global.x - state.gridOriginX) / state.cellSize);
  const row = Math.floor((e.global.y - state.gridOriginY) / state.cellSize);
  const { cols, rows } = state.levelData;
  const onGrid = col >= 0 && col < cols && row >= 0 && row < rows;

  // Right-click: delete
  if (e.button === 2) {
    if (onGrid) {
      const id = findLineAt(col, row);
      if (id !== null) {
        deleteLine(id);
        return true;
      }
    }
    return false;
  }

  // Left-click
  if (editor.currentLine) {
    if (onGrid && canExtend(col, row)) {
      addPoint(col, row);
      return true;
    }
    finishLine();
    return true;
  }

  // Not drawing: check grid
  if (!onGrid) return false;

  // Check if cell is part of a line → extend from tail or select
  const lineId = findLineAt(col, row);
  if (lineId !== null) {
    const ld = state.levelData.lines.find((l) => l.id === lineId);
    if (ld) {
      const tail = ld.points[ld.points.length - 1];
      if (col === tail[0] && row === tail[1] && ld.points.length >= 2) {
        // Near tail → extend in tail direction
        const prev = ld.points[ld.points.length - 2];
        const dc = Math.sign(tail[0] - prev[0]);
        const dr = Math.sign(tail[1] - prev[1]);
        const nc = tail[0] + dc;
        const nr = tail[1] + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
          editor.currentLine = { id: lineId, points: [...ld.points, [nc, nr]] };
          editor.selectedId = null;
          return true;
        }
      }
      // Otherwise select
      editor.selectedId = editor.selectedId === lineId ? null : lineId;
      editor.currentLine = null;
      return true;
    }
  }

  // Empty cell: start new line
  startNewLine(col, row);
  return true;
}

// ── Keyboard handler ─────────────────────────────────────────────────
export function handleEditorKey(e: KeyboardEvent): boolean {
  const key = e.key;

  // Toggle editor mode
  if (key === 'e' || key === 'E') {
    toggleEditorMode();
    return true;
  }

  // Only handle other keys in edit mode
  if (editor.mode !== 'edit') return false;

  if (key === 'Enter') {
    if (editor.currentLine) {
      finishLine();
      return true;
    }
  }

  if (key === 'Escape') {
    if (editor.currentLine) {
      cancelLine();
      return true;
    }
    editor.mode = 'play';
    return true;
  }

  if (key === 'Delete' || key === 'Backspace') {
    if (editor.currentLine) {
      cancelLine();
      return true;
    }
    if (editor.selectedId !== null) {
      deleteLine(editor.selectedId);
      editor.selectedId = null;
      return true;
    }
  }

  // Grid size adjustments with arrow keys (Shift + arrow to resize)
  if (e.shiftKey) {
    if (key === 'ArrowRight') {
      state.levelData.cols = Math.min(20, state.levelData.cols + 1);
      editor.editorCols = state.levelData.cols;
      return true;
    }
    if (key === 'ArrowLeft') {
      state.levelData.cols = Math.max(3, state.levelData.cols - 1);
      editor.editorCols = state.levelData.cols;
      return true;
    }
    if (key === 'ArrowUp') {
      state.levelData.rows = Math.max(3, state.levelData.rows - 1);
      editor.editorRows = state.levelData.rows;
      return true;
    }
    if (key === 'ArrowDown') {
      state.levelData.rows = Math.min(20, state.levelData.rows + 1);
      editor.editorRows = state.levelData.rows;
      return true;
    }
  }

  return false;
}

// ── Mode toggle ──────────────────────────────────────────────────────
export function toggleEditorMode(): void {
  if (editor.mode === 'edit') {
    if (editor.currentLine) {
      cancelLine();
    }
    editor.mode = 'play';
  } else {
    state.animState = null;
    editor.editorCols = state.levelData.cols;
    editor.editorRows = state.levelData.rows;
    editor.mode = 'edit';
  }
}

export function refreshAfterEdit(): void {
  initGameLines();
  state.overlaps = [];
  state.solvable = checkSolvableFromGameLines(
    state.gameLines,
    state.levelData.cols,
    state.levelData.rows,
  );
}

// ── Rendering ────────────────────────────────────────────────────────
export function drawEditorLayer(container: Container): void {
  clearContainerToPool(container);
  if (editor.mode !== 'edit') return;

  const half = state.cellSize / 2;
  const { cols, rows } = state.levelData;

  // ── Hover cursor (vertex indicator) ──
  if (editor.hoverCol >= 0 && editor.hoverRow >= 0) {
    const cx = state.gridOriginX + editor.hoverCol * state.cellSize + half;
    const cy = state.gridOriginY + editor.hoverRow * state.cellSize + half;

    let valid = false;
    if (editor.currentLine) {
      valid = canExtend(editor.hoverCol, editor.hoverRow);
    } else {
      valid = findLineAt(editor.hoverCol, editor.hoverRow) === null;
    }

    const cursorColor = valid ? PALETTE.editorCursor : PALETTE.editorCursorInvalid;
    const cursorG = graphicsPool.take();
    // Diamond shape at vertex
    cursorG.moveTo(cx, cy - half * 0.5);
    cursorG.lineTo(cx + half * 0.5, cy);
    cursorG.lineTo(cx, cy + half * 0.5);
    cursorG.lineTo(cx - half * 0.5, cy);
    cursorG.closePath();
    cursorG.fill({ color: cursorColor, alpha: 0.35 });
    cursorG.stroke({ width: 2, color: cursorColor });
    container.addChild(cursorG);
  }

  // ── Current line preview ──
  if (editor.currentLine && editor.currentLine.points.length >= 1) {
    const pts = editor.currentLine.points;
    const previewG = graphicsPool.take();

    // Draw line between points
    previewG.setStrokeStyle({ width: state.cellSize * 0.25, color: PALETTE.editorPreview, alpha: 0.6, cap: 'round', join: 'round' });
    const sx = state.gridOriginX + pts[0][0] * state.cellSize + half;
    const sy = state.gridOriginY + pts[0][1] * state.cellSize + half;
    previewG.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const px = state.gridOriginX + pts[i][0] * state.cellSize + half;
      const py = state.gridOriginY + pts[i][1] * state.cellSize + half;
      previewG.lineTo(px, py);
    }
    previewG.stroke();

    // Endpoint dots
    for (const [c, r] of pts) {
      const dx = state.gridOriginX + c * state.cellSize + half;
      const dy = state.gridOriginY + r * state.cellSize + half;
      previewG.circle(dx, dy, state.cellSize * 0.18);
      previewG.fill({ color: PALETTE.editorPreview, alpha: 0.8 });
    }

    // Direction arrow at first point
    if (pts.length >= 2) {
      const dir = deriveDir(pts[0], pts[1]);
      const ax = state.gridOriginX + pts[0][0] * state.cellSize + half + dir.dc * half * 0.65;
      const ay = state.gridOriginY + pts[0][1] * state.cellSize + half + dir.dr * half * 0.65;
      const angle = Math.atan2(dir.dr, dir.dc);
      const arrowSize = state.cellSize * 0.3;
      const h = arrowSize * 0.8;
      const w = arrowSize * 0.5;

      const arrowG = graphicsPool.take();
      arrowG.moveTo(h, 0);
      arrowG.lineTo(-h * 0.3, -w);
      arrowG.lineTo(-h * 0.3, w);
      arrowG.closePath();
      arrowG.fill({ color: PALETTE.editorPreview, alpha: 0.7 });
      arrowG.x = ax;
      arrowG.y = ay;
      arrowG.rotation = angle;
      container.addChild(arrowG);
    }

    container.addChild(previewG);

    // Preview to hover position (extension indicator)
    if (editor.hoverCol >= 0 && editor.hoverRow >= 0 && canExtend(editor.hoverCol, editor.hoverRow)) {
      const last = pts[pts.length - 1];
      const lx = state.gridOriginX + last[0] * state.cellSize + half;
      const ly = state.gridOriginY + last[1] * state.cellSize + half;
      const hx = state.gridOriginX + editor.hoverCol * state.cellSize + half;
      const hy = state.gridOriginY + editor.hoverRow * state.cellSize + half;

      const extG = graphicsPool.take();
      extG.setStrokeStyle({ width: state.cellSize * 0.2, color: PALETTE.editorPreview, alpha: 0.35, cap: 'round' });
      extG.moveTo(lx, ly).lineTo(hx, hy).stroke();
      // Hover dot
      extG.circle(hx, hy, state.cellSize * 0.15);
      extG.fill({ color: PALETTE.editorPreview, alpha: 0.4 });
      container.addChild(extG);
    }
  }

  // ── Selected line highlight ──
  if (editor.selectedId !== null) {
    const ld = state.levelData.lines.find((l) => l.id === editor.selectedId);
    if (ld) {
      const cells = expandCells(ld.points);
      const selG = graphicsPool.take();
      for (const [c, r] of cells) {
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const x = state.gridOriginX + c * state.cellSize;
        const y = state.gridOriginY + r * state.cellSize;
        selG.roundRect(x + 3, y + 3, state.cellSize - 6, state.cellSize - 6, 3);
      }
      selG.fill({ color: PALETTE.editorSelected, alpha: 0.15 });
      selG.stroke({ width: 2, color: PALETTE.editorSelected, alpha: 0.4 });
      container.addChild(selG);
    }
  }
}

export function drawEditorHUD(container: Container, appWidth: number, appHeight: number): void {
  clearContainerToPool(container);
  if (editor.mode !== 'edit') return;

  // ── Top bar ─────────────────────────────────────────────────────────
  const barH = 38;
  const barG = graphicsPool.take();
  barG.rect(0, 0, appWidth, barH);
  barG.fill({ color: PALETTE.editorHudBg, alpha: 0.95 });
  barG.setStrokeStyle({ width: 1, color: PALETTE.editorHudAccent, alpha: 0.4 });
  barG.moveTo(0, barH).lineTo(appWidth, barH).stroke();
  container.addChild(barG);

  const modeText = new Text({
    text: '✏️ 编辑模式',
    style: { fontSize: 15, fill: PALETTE.editorHudAccent, fontFamily: 'sans-serif', fontWeight: 'bold' },
  });
  modeText.x = 16;
  modeText.y = 10;
  container.addChild(modeText);

  const helpText = new Text({
    text: '左键: 添加点  |  右键: 删除  |  Enter: 完成  |  Esc: 取消  |  Del: 删除选中  |  Shift+方向键: 调整网格  |  E: 退出编辑',
    style: { fontSize: 12, fill: PALETTE.editorHudText, fontFamily: 'sans-serif' },
  });
  helpText.x = 130;
  helpText.y = 12;
  container.addChild(helpText);

  // ── Bottom info bar ─────────────────────────────────────────────────
  const bottomY = appHeight - 34;
  const bottomG = graphicsPool.take();
  bottomG.rect(0, bottomY, appWidth, 34);
  bottomG.fill({ color: PALETTE.editorHudBg, alpha: 0.95 });
  bottomG.setStrokeStyle({ width: 1, color: PALETTE.editorHudAccent, alpha: 0.4 });
  bottomG.moveTo(0, bottomY).lineTo(appWidth, bottomY).stroke();
  container.addChild(bottomG);

  const lineCount = state.levelData.lines.length;
  const { ok, overlaps } = checkOverlaps(state.levelData.lines, state.levelData.cols, state.levelData.rows);

  const statusText = ok ? '✅ 无重叠' : `⚠️ ${overlaps.length} 处重叠`;
  const info = new Text({
    text: `网格: ${state.levelData.cols}×${state.levelData.rows}  |  线段: ${lineCount}  |  ${statusText}`,
    style: { fontSize: 13, fill: PALETTE.editorHudText, fontFamily: 'sans-serif' },
  });
  info.x = 16;
  info.y = bottomY + 9;
  container.addChild(info);

  // Drawing state indicator
  if (editor.currentLine) {
    const pts = editor.currentLine.points;
    const drawText = new Text({
      text: `画线中 (${pts.length} 点) — Enter 完成 / Esc 取消`,
      style: { fontSize: 13, fill: PALETTE.editorHudAccent, fontFamily: 'sans-serif' },
    });
    drawText.anchor.set(1, 0);
    drawText.x = appWidth - 16;
    drawText.y = bottomY + 9;
    container.addChild(drawText);
  }

  // ── Grid coordinate display ──
  if (editor.hoverCol >= 0 && editor.hoverRow >= 0) {
    const coordText = new Text({
      text: `(${editor.hoverCol}, ${editor.hoverRow})`,
      style: { fontSize: 12, fill: PALETTE.editorHudText, fontFamily: 'sans-serif' },
    });
    coordText.anchor.set(1, 1);
    coordText.x = appWidth - 16;
    coordText.y = bottomY - 4;
    container.addChild(coordText);
  }
}
