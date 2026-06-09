/**
 * object-pool.ts — Graphics / Text 对象池
 *
 * 核心思路：
 * - Graphics.clear() 可以清除几何数据但保留对象本身（不释放 GPU buffer）
 * - 用 take() 从池中取对象，frame 结束后用 releaseAll() 归还
 * - 池只增不减（峰值水位），后续帧零 alloc/dealloc
 *
 * 用法：
 *   const g = graphicsPool.take();
 *   // ... 绘制 ...
 *   container.addChild(g);
 *   // 帧末（clearContainer 内部调用 releaseAll）
 */

import { Graphics, type Container } from 'pixi.js';

// ── Graphics 对象池 ──────────────────────────────────────────────

class GraphicsPool {
  private _available: Graphics[] = [];
  private _inUse = new Set<Graphics>();

  /** 从池中取一个 Graphics（优先复用，清空旧几何） */
  take(): Graphics {
    let g: Graphics;
    if (this._available.length > 0) {
      g = this._available.pop()!;
      g.visible = true;
      g.alpha = 1;
      g.rotation = 0;
      g.scale.set(1);
      g.position.set(0);
    } else {
      g = new Graphics();
    }
    this._inUse.add(g);
    return g;
  }

  /** 将对象归还池中（由 clearContainerToPool 调用） */
  returnToPool(g: Graphics): void {
    g.clear();
    this._available.push(g);
    this._inUse.delete(g);
  }

  /** 归还所有正在使用的对象到池中 */
  releaseAll(): void {
    for (const g of Array.from(this._inUse)) {
      g.clear();
      this._available.push(g);
    }
    this._inUse.clear();
  }

  /** 销毁池中所有对象（仅在卸载时调用） */
  destroy(): void {
    for (const g of this._available) g.destroy();
    for (const g of Array.from(this._inUse)) g.destroy();
    this._available = [];
    this._inUse.clear();
  }
}

export const graphicsPool = new GraphicsPool();

// ── 容器清空 → 自动归还到池 ──────────────────────────────────────

/**
 * 替代原来的 clearContainer：先将所有子对象归还池，再清空容器。
 * 不 destroy 任何对象。
 */
export function clearContainerToPool(container: Container): void {
  const children = container.removeChildren();
  for (const child of children) {
    if (child instanceof Graphics) {
      graphicsPool.returnToPool(child);
    }
    // Text / Container 子对象不池化，由 GC 回收
  }
}

// ── 便捷绘制函数 ─────────────────────────────────────────────────

/**
 * 批量绘制存活的 GameLine 到目标容器。
 * 内部使用对象池，外部无需关心 take/release。
 *
 * @param container  目标 PixiJS 容器
 * @param drawFn     对单个 Graphics 的绘制回调
 * @param items      要绘制的数据数组
 * @param filter     可选过滤函数
 */
export function drawPooled<T>(
  container: Container,
  items: T[],
  drawFn: (g: Graphics, item: T) => void,
  filter?: (item: T) => boolean,
): void {
  const list = filter ? items.filter(filter) : items;
  for (const item of list) {
    const g = graphicsPool.take();
    drawFn(g, item);
    container.addChild(g);
  }
}

/**
 * 单个 Graphics 绘制并添加到容器。
 */
export function drawOne(
  container: Container,
  drawFn: (g: Graphics) => void,
): Graphics {
  const g = graphicsPool.take();
  drawFn(g);
  container.addChild(g);
  return g;
}
