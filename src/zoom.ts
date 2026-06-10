/**
 * zoom.ts — 缩放与平移控制
 *
 * 功能：
 * - 双指捏合缩放（移动端）
 * - 鼠标滚轮缩放（桌面端）
 * - 单指/鼠标拖拽平移
 * - 缩放滑块 UI
 * - 屏幕坐标 → 网格坐标转换
 */

import { Container, Text } from 'pixi.js';
import { state } from './state';
import { ZOOM_MIN, ZOOM_MAX } from './constants';
import { graphicsPool, clearContainerToPool } from './object-pool';

// ── 缩放控制 ──────────────────────────────────────────────────

export function setZoom(newScale: number, centerX?: number, centerY?: number): void {
  const oldScale = state.zoom.scale;
  newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));

  if (newScale === oldScale) return;

  // 以 center 为中心缩放（保持该点在屏幕上的位置不变）
  if (centerX !== undefined && centerY !== undefined) {
    const ratio = newScale / oldScale;
    state.zoom.panX = centerX - (centerX - state.zoom.panX) * ratio;
    state.zoom.panY = centerY - (centerY - state.zoom.panY) * ratio;
  }

  state.zoom.scale = newScale;
  clampPan();
}

export function zoomIn(): void {
  setZoom(state.zoom.scale * 1.2);
}

export function zoomOut(): void {
  setZoom(state.zoom.scale / 1.2);
}

export function resetZoom(): void {
  state.zoom.scale = 1;
  state.zoom.panX = 0;
  state.zoom.panY = 0;
}

/** 自动适配：让网格以舒适尺寸显示（可能需要平移查看） */
export function fitToScreen(screenW: number, screenH: number): void {
  const { cols, rows } = state.levelData;
  const cellSize = state.cellSize;
  if (cellSize <= 0) return;

  const gridW = cols * cellSize;
  const gridH = rows * cellSize;

  // 理想缩放：让格子至少 28px（舒适可点击）
  const minComfortCell = 28;
  const idealScale = minComfortCell / cellSize;
  const padding = 40;

  // 但如果理想缩放后网格超出屏幕太多，就取 fit-to-screen
  const fitScaleX = (screenW - padding * 2) / gridW;
  const fitScaleY = (screenH - padding * 2) / gridH;
  const fitScale = Math.min(fitScaleX, fitScaleY);

  // 取两者中更合适的（不超过 max，不低于 min）
  const s = Math.max(fitScale, Math.min(idealScale, 1.5));
  state.zoom.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));

  // 居中
  state.zoom.panX = (screenW - gridW * state.zoom.scale) / 2 - state.gridOriginX * state.zoom.scale;
  state.zoom.panY = (screenH - gridH * state.zoom.scale) / 2 - state.gridOriginY * state.zoom.scale;
  clampPan();
}

/** 确保 pan 不会让网格完全离开屏幕 */
function clampPan(): void {
  const s = state.zoom.scale;
  const { cols, rows } = state.levelData;
  const cellSize = state.cellSize;
  if (cellSize <= 0) return;

  const gridW = cols * cellSize * s;
  const gridH = rows * cellSize * s;
  const originXScreen = state.gridOriginX * s + state.zoom.panX;
  const originYScreen = state.gridOriginY * s + state.zoom.panY;

  // 至少保留 1/4 网格在屏幕内
  const minVisible = 0.25;
  const maxPanX = window.innerWidth - originXScreen + gridW * minVisible;
  const minPanX = -(originXScreen + gridW * minVisible);
  const maxPanY = window.innerHeight - originYScreen + gridH * minVisible;
  const minPanY = -(originYScreen + gridH * minVisible);

  state.zoom.panX = Math.max(minPanX, Math.min(maxPanX, state.zoom.panX));
  state.zoom.panY = Math.max(minPanY, Math.min(maxPanY, state.zoom.panY));
}

// ── 应用缩放到 PixiJS Container ──────────────────────────────

export function applyZoomToContainer(container: Container): void {
  container.scale.set(state.zoom.scale);
  container.x = state.zoom.panX;
  container.y = state.zoom.panY;
}

// ── 坐标转换 ──────────────────────────────────────────────────

/** 屏幕坐标 → 网格坐标（考虑缩放和平移） */
export function screenToGrid(screenX: number, screenY: number): { col: number; row: number } {
  const s = state.zoom.scale;
  // 先反算到"未缩放"的坐标空间
  const worldX = (screenX - state.zoom.panX) / s;
  const worldY = (screenY - state.zoom.panY) / s;
  // 再减去网格原点
  const col = Math.floor((worldX - state.gridOriginX) / state.cellSize);
  const row = Math.floor((worldY - state.gridOriginY) / state.cellSize);
  return { col, row };
}

// ── 触摸/鼠标事件处理 ─────────────────────────────────────────

export function initZoomInput(canvas: HTMLCanvasElement): void {
  // ── 鼠标滚轮缩放 ──
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const factor = Math.pow(2, delta * 3);
    setZoom(state.zoom.scale * factor, e.clientX, e.clientY);
  }, { passive: false });

  // ── 触摸手势 ──
  let lastTouchDist = 0;
  let lastTouchCenterX = 0;
  let lastTouchCenterY = 0;
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      lastTouchCenterX = (t1.clientX + t2.clientX) / 2;
      lastTouchCenterY = (t1.clientY + t2.clientY) / 2;
      state.zoom.pinching = true;
    } else if (e.touches.length === 1) {
      // 如果缩放 > 1.05，启用拖拽模式
      if (state.zoom.scale > 1.05) {
        state.zoom.panning = true;
        state.zoom.panStartX = e.touches[0].clientX;
        state.zoom.panStartY = e.touches[0].clientY;
        state.zoom.panStartOffsetX = state.zoom.panX;
        state.zoom.panStartOffsetY = state.zoom.panY;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 2 && state.zoom.pinching) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;

      if (lastTouchDist > 0) {
        const factor = dist / lastTouchDist;
        setZoom(state.zoom.scale * factor, centerX, centerY);
      }

      // 双指拖拽
      const dx = centerX - lastTouchCenterX;
      const dy = centerY - lastTouchCenterY;
      state.zoom.panX += dx;
      state.zoom.panY += dy;
      clampPan();

      lastTouchDist = dist;
      lastTouchCenterX = centerX;
      lastTouchCenterY = centerY;
    } else if (e.touches.length === 1 && state.zoom.panning) {
      e.preventDefault();
      const dx = e.touches[0].clientX - state.zoom.panStartX;
      const dy = e.touches[0].clientY - state.zoom.panStartY;
      state.zoom.panX = state.zoom.panStartOffsetX + dx;
      state.zoom.panY = state.zoom.panStartOffsetY + dy;
      clampPan();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e: TouchEvent) => {
    if (e.touches.length < 2) {
      state.zoom.pinching = false;
    }
    if (e.touches.length === 0) {
      state.zoom.panning = false;
    }
  });

  // ── 鼠标中键拖拽 ──
  let mouseDown = false;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let mouseStartPanX = 0;
  let mouseStartPanY = 0;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    // 只用中键拖拽（左键留给游戏交互）
    if (e.button === 1) {
      mouseDown = true;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
      mouseStartPanX = state.zoom.panX;
      mouseStartPanY = state.zoom.panY;
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (mouseDown) {
      state.zoom.panX = mouseStartPanX + (e.clientX - mouseStartX);
      state.zoom.panY = mouseStartPanY + (e.clientY - mouseStartY);
      clampPan();
    }
  });

  canvas.addEventListener('mouseup', () => {
    mouseDown = false;
  });
}

// ── 缩放滑块 UI 渲染 ─────────────────────────────────────────

const SLIDER_TRACK_W = 160;
const SLIDER_BTN_R = 14;
const SLIDER_BAR_H = 4;
const SLIDER_GAP = 8;

/**
 * 在屏幕底部居中绘制水平缩放控制条（- 滑块 + 百分比）
 */
export function drawZoomSlider(container: Container, appWidth: number, appHeight: number): void {
  clearContainerToPool(container);

  const totalW = SLIDER_BTN_R * 2 + SLIDER_GAP + SLIDER_TRACK_W + SLIDER_GAP + SLIDER_BTN_R * 2 + 40;
  const baseX = (appWidth - totalW) / 2;
  const cy = appHeight - 28;

  // ── 背景面板 ──
  const panel = graphicsPool.take();
  panel.roundRect(baseX - 10, cy - 18, totalW + 20, 32, 10);
  panel.fill({ color: 0x111827, alpha: 0.7 });
  container.addChild(panel);

  let cx = baseX + SLIDER_BTN_R;

  // ── - 按钮 ──
  const minusBtn = graphicsPool.take();
  minusBtn.circle(cx, cy, SLIDER_BTN_R);
  minusBtn.fill({ color: 0x1e293b });
  minusBtn.stroke({ width: 1, color: 0x334155 });
  minusBtn.setStrokeStyle({ width: 2, color: 0x94a3b8 });
  minusBtn.moveTo(cx - 6, cy).lineTo(cx + 6, cy).stroke();
  container.addChild(minusBtn);
  cx += SLIDER_BTN_R + SLIDER_GAP;

  // ── 滑块轨道 ──
  const trackLeft = cx;
  const trackRight = cx + SLIDER_TRACK_W;
  const track = graphicsPool.take();
  track.roundRect(trackLeft, cy - SLIDER_BAR_H / 2, SLIDER_TRACK_W, SLIDER_BAR_H, 2);
  track.fill({ color: 0x1e293b });
  track.stroke({ width: 1, color: 0x334155 });
  container.addChild(track);

  // ── 滑块把手 ──
  const zoomRange = ZOOM_MAX - ZOOM_MIN;
  const zoomNorm = (state.zoom.scale - ZOOM_MIN) / zoomRange;
  const thumbX = trackLeft + zoomNorm * SLIDER_TRACK_W;
  const thumbR = 9;

  const thumb = graphicsPool.take();
  thumb.circle(thumbX, cy, thumbR);
  thumb.fill({ color: 0x3b82f6 });
  thumb.stroke({ width: 2, color: 0x60a5fa });
  container.addChild(thumb);
  cx = trackRight + SLIDER_GAP;

  // ── + 按钮 ──
  cx += SLIDER_BTN_R;
  const plusBtn = graphicsPool.take();
  plusBtn.circle(cx, cy, SLIDER_BTN_R);
  plusBtn.fill({ color: 0x1e293b });
  plusBtn.stroke({ width: 1, color: 0x334155 });
  plusBtn.setStrokeStyle({ width: 2, color: 0x94a3b8 });
  plusBtn.moveTo(cx - 6, cy).lineTo(cx + 6, cy);
  plusBtn.moveTo(cx, cy - 6).lineTo(cx, cy + 6);
  plusBtn.stroke();
  container.addChild(plusBtn);

  // ── 百分比 ──
  const pctText = new Text({
    text: `${Math.round(state.zoom.scale * 100)}%`,
    style: { fontSize: 11, fill: 0x64748b, fontFamily: 'sans-serif' },
  });
  pctText.anchor.set(0, 0.5);
  pctText.x = cx + SLIDER_BTN_R + 6;
  pctText.y = cy;
  container.addChild(pctText);
}

/** 判断点击是否在缩放按钮/滑块区域内 */
export function hitTestZoomSlider(
  x: number, y: number, appWidth: number, appHeight: number,
): 'plus' | 'minus' | 'track' | null {
  const totalW = SLIDER_BTN_R * 2 + SLIDER_GAP + SLIDER_TRACK_W + SLIDER_GAP + SLIDER_BTN_R * 2 + 40;
  const baseX = (appWidth - totalW) / 2;
  const cy = appHeight - 28;

  let cx = baseX + SLIDER_BTN_R;

  // - 按钮
  if (Math.hypot(x - cx, y - cy) <= SLIDER_BTN_R + 4) return 'minus';
  cx += SLIDER_BTN_R + SLIDER_GAP;

  // 滑块轨道
  const trackLeft = cx;
  const trackRight = cx + SLIDER_TRACK_W;
  if (x >= trackLeft - 10 && x <= trackRight + 10 && Math.abs(y - cy) <= 20) return 'track';
  cx = trackRight + SLIDER_GAP + SLIDER_BTN_R;

  // + 按钮
  if (Math.hypot(x - cx, y - cy) <= SLIDER_BTN_R + 4) return 'plus';

  return null;
}

/** 处理滑块区域的拖拽（更新缩放值） */
export function handleSliderDrag(x: number, appWidth: number): void {
  const totalW = SLIDER_BTN_R * 2 + SLIDER_GAP + SLIDER_TRACK_W + SLIDER_GAP + SLIDER_BTN_R * 2 + 40;
  const baseX = (appWidth - totalW) / 2;
  const trackLeft = baseX + SLIDER_BTN_R + SLIDER_GAP;

  const norm = Math.max(0, Math.min(1, (x - trackLeft) / SLIDER_TRACK_W));
  state.zoom.scale = ZOOM_MIN + norm * (ZOOM_MAX - ZOOM_MIN);
}
