import type { GameLine, Overlap, AnimState, LevelData } from './types';
import { DEFAULT_COLS, DEFAULT_ROWS } from './constants';

export interface GameState {
  levelData: LevelData;
  cellSize: number;
  gridOriginX: number;
  gridOriginY: number;
  gameLines: GameLine[];
  overlaps: Overlap[];
  solvable: boolean | null;
  animState: AnimState | null;
}

export const state: GameState = {
  levelData: { cols: DEFAULT_COLS, rows: DEFAULT_ROWS, lines: [] },
  cellSize: 0,
  gridOriginX: 0,
  gridOriginY: 0,
  gameLines: [],
  overlaps: [],
  solvable: null,
  animState: null,
};
