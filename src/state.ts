import type { GameLine, Overlap, AnimState, LevelData } from './types';
import { DEFAULT_COLS, DEFAULT_ROWS } from './constants';

export interface VictoryParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

export interface VictoryState {
  timer: number;          // ms since victory started
  particles: VictoryParticle[];
  textScale: number;      // for pop-in animation
  buttonAlpha: number;    // fade-in for button
}

export interface GameState {
  levelData: LevelData;
  cellSize: number;
  gridOriginX: number;
  gridOriginY: number;
  gameLines: GameLine[];
  overlaps: Overlap[];
  solvable: boolean | null;
  animState: AnimState | null;
  victory: VictoryState | null;
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
  victory: null,
};
