import type { GameLine, SolverState } from './types';

export function stateKey(solverState: SolverState[]): string {
  return solverState
    .map((g) => g.id + ':' + g.cells.map((c) => c[0] + ',' + c[1]).join('|'))
    .sort()
    .join(';');
}

export function simulateMove(
  solverState: SolverState[],
  idx: number,
  cols: number,
  rows: number,
): [number, number][] {
  const g = solverState[idx];
  const { dc, dr } = g.dir;
  const cells: [number, number][] = g.cells.map((c) => [c[0], c[1]] as [number, number]);

  while (true) {
    const head = cells[0];
    const next: [number, number] = [head[0] + dc, head[1] + dr];
    const headOnGrid = head[0] >= 0 && head[0] < cols && head[1] >= 0 && head[1] < rows;
    const nextOnGrid = next[0] >= 0 && next[0] < cols && next[1] >= 0 && next[1] < rows;

    if (nextOnGrid) {
      let blocked = false;
      for (let j = 0; j < solverState.length; j++) {
        if (j === idx || solverState[j].cells.length === 0) continue;
        for (const sc of solverState[j].cells) {
          if (sc[0] === next[0] && sc[1] === next[1]) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      // head 还在网格内时，被挡住就停下
      if (blocked && headOnGrid) return cells;
    }

    cells.unshift(next);
    cells.pop();

    if (cells.every(([c, r]) => c < 0 || c >= cols || r < 0 || r >= rows)) {
      return [];
    }
  }
}

export function dfs(
  solverState: SolverState[],
  visited: Set<string>,
  t0: number,
  timeLimit: number,
  cols: number,
  rows: number,
): boolean {
  if (Date.now() - t0 > timeLimit) return false;
  if (solverState.every((g) => g.cells.length === 0)) return true;

  const key = stateKey(solverState);
  if (visited.has(key)) return false;
  visited.add(key);

  for (let i = 0; i < solverState.length; i++) {
    if (solverState[i].cells.length === 0) continue;

    const newCells = simulateMove(solverState, i, cols, rows);
    const moved =
      newCells.length !== solverState[i].cells.length ||
      newCells.some(
        (c, k) => c[0] !== solverState[i].cells[k][0] || c[1] !== solverState[i].cells[k][1],
      );

    if (!moved) continue;

    const old = solverState[i].cells;
    solverState[i].cells = newCells;
    if (dfs(solverState, visited, t0, timeLimit, cols, rows)) {
      solverState[i].cells = old;
      return true;
    }
    solverState[i].cells = old;
  }

  return false;
}

export function checkSolvableFromGameLines(
  gameLines: GameLine[],
  cols: number,
  rows: number,
): boolean {
  const alive = gameLines.filter((g) => g.alive);
  if (alive.length === 0) return true;

  const solverState: SolverState[] = alive.map((g) => ({
    id: g.id,
    cells: g.cells.map((c) => [c[0], c[1]] as [number, number]),
    dir: { ...g.dir },
  }));

  const visited = new Set<string>();
  return dfs(solverState, visited, Date.now(), 3000, cols, rows);
}
