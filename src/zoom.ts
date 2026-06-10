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
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SLIDER_HEIGHT, ZOOM_SLIDER_WIDTH, ZOOM_BUTTON_SIZE } from './constants';
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

/**
 * 在屏幕右侧绘制缩放控制条（+ 滑块 -）
 * 返回滑块区域的 hit-test 信息
 */
export function drawZoomSlider(container: Container, appWidth: number, appHeight: number): void {
  clearContainerToPool(container);

  const margin = 16;
  const sliderH = ZOOM_SLIDER_HEIGHT;
  const btnSize = ZOOM_BUTTON_SIZE;
  const totalH = btnSize + sliderH + btnSize + 12; // 12 = gaps
  const centerX = appWidth - margin - btnSize / 2;
  const startY = (appHeight - totalH) / 2;

  // ── 背景面板 ──
  const panelW = btnSize + 16;
  const panelH = totalH + 16;
  const panelX = appWidth - margin - panelW / 2 - btnSize / 2 + 4;
  const panelY = startY - 8;
  const panel = graphicsPool.take();
  panel.roundRect(panelX, panelY, panelW, panelH, 12);
  panel.fill({ color: 0x111827, alpha: 0.75 });
  container.addChild(panel);

  // ── + 按钮 ──
  const plusBtnY = startY;
  const plusBtn = graphicsPool.take();
  plusBtn.circle(centerX, plusBtnY + btnSize / 2, btnSize / 2);
  plusBtn.fill({ color: 0x1e293b });
  plusBtn.stroke({ width: 1.5, color: 0x334155 });
  // 画 + 号
  plusBtn.setStrokeStyle({ width: 2.5, color: 0x94a3b8 });
  plusBtn.moveTo(centerX - 8, plusBtnY + btnSize / 2).lineTo(centerX + 8, plusBtnY + btnSize / 2);
  plusBtn.moveTo(centerX, plusBtnY + btnSize / 2 - 8).lineTo(centerX, plusBtnY + btnSize / 2 + 8);
  plusBtn.stroke();
  container.addChild(plusBtn);

  // ── 滑块轨道 ──
  const trackTop = plusBtnY + btnSize + 4;
  const trackBottom = trackTop + sliderH;
  const trackX = centerX;

  const track = graphicsPool.take();
  track.roundRect(trackX - ZOOM_SLIDER_WIDTH / 2, trackTop, ZOOM_SLIDER_WIDTH, sliderH, 3);
  track.fill({ color: 0x1e293b });
  track.stroke({ width: 1, color: 0x334155 });
  container.addChild(track);

  // ── 滑块把手 ──
  const zoomRange = ZOOM_MAX - ZOOM_MIN;
  const zoomNorm = (state.zoom.scale - ZOOM_MIN) / zoomRange;
  const thumbY = trackBottom - zoomNorm * sliderH; // 底部 = 最大缩放
  const thumbR = 10;

  const thumb = graphicsPool.take();
  thumb.circle(trackX, thumbY, thumbR);
  thumb.fill({ color: 0x3b82f6 });
  thumb.stroke({ width: 2, color: 0x60a5fa });
  container.addChild(thumb);

  // ── - 按钮 ──
  const minusBtnY = trackBottom + 4;
  const minusBtn = graphicsPool.take();
  minusBtn.circle(centerX, minusBtnY + btnSize / 2, btnSize / 2);
  minusBtn.fill({ color: 0x1e293b });
  minusBtn.stroke({ width: 1.5, color: 0x334155 });
  // 画 - 号
  minusBtn.setStrokeStyle({ width: 2.5, color: 0x94a3b8 });
  minusBtn.moveTo(centerX - 8, minusBtnY + btnSize / 2).lineTo(centerX + 8, minusBtnY + btnSize / 2);
  minusBtn.stroke();
  container.addChild(minusBtn);

  // ── 缩放百分比文字 ──
  const pctText = new Text({
    text: `${Math.round(state.zoom.scale * 100)}%`,
    style: { fontSize: 11, fill: 0x64748b, fontFamily: 'sans-serif' },
  });
  pctText.anchor.set(0.5, 0);
  pctText.x = centerX;
  pctText.y = minusBtnY + btnSize + 4;
  container.addChild(pctText);
}

/** 判断点击是否在缩放按钮/滑块区域内，返回操作类型 */
export function hitTestZoomSlider(
  x: number, y: number, appWidth: number, appHeight: number,
): 'plus' | 'minus' | 'track' | null {
  const margin = 16;
  const btnSize = ZOOM_BUTTON_SIZE;
  const sliderH = ZOOM_SLIDER_HEIGHT;
  const totalH = btnSize + sliderH + btnSize + 12;
  const centerX = appWidth - margin - btnSize / 2;
  const startY = (appHeight - totalH) / 2;

  // + 按钮
  const plusBtnY = startY;
  if (Math.hypot(x - centerX, y - plusBtnY - btnSize / 2) <= btnSize / 2 + 4) return 'plus';

  // - 按钮
  const trackBottom = plusBtnY + btnSize + 4 + sliderH;
  const minusBtnY = trackBottom + 4;
  if (Math.hypot(x - centerX, y - minusBtnY - btnSize / 2) <= btnSize / 2 + 4) return 'minus';

  // 滑块轨道
  const trackTop = plusBtnY + btnSize + 4;
  if (Math.abs(x - centerX) <= 20 && y >= trackTop && y <= trackBottom) return 'track';

  return null;
}

/** 处理滑块区域的拖拽（更新缩放值） */
export function handleSliderDrag(y: number, appHeight: number): void {
  const btnSize = ZOOM_BUTTON_SIZE;
  const sliderH = ZOOM_SLIDER_HEIGHT;
  const totalH = btnSize + sliderH + btnSize + 12;
  const startY = (appHeight - totalH) / 2;
  const trackTop = startY + btnSize + 4;
  const trackBottom = trackTop + sliderH;

  const norm = Math.max(0, Math.min(1, (trackBottom - y) / sliderH));
  state.zoom.scale = ZOOM_MIN + norm * (ZOOM_MAX - ZOOM_MIN);
}
