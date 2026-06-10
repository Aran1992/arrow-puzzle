import type { GameLine, Overlap, AnimState, LevelData } from './types';
import { DEFAULT_COLS, DEFAULT_ROWS, ZOOM_DEFAULT } from './constants';

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

export interface ZoomState {
  scale: number;
  panX: number;
  panY: number;
  // Pinch gesture tracking
  pinching: boolean;
  pinchDist: number;
  pinchCenterX: number;
  pinchCenterY: number;
  // Pan gesture tracking
  panning: boolean;
  panStartX: number;
  panStartY: number;
  panStartOffsetX: number;
  panStartOffsetY: number;
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
  zoom: ZoomState;
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
  zoom: {
    scale: ZOOM_DEFAULT,
    panX: 0,
    panY: 0,
    pinching: false,
    pinchDist: 0,
    pinchCenterX: 0,
    pinchCenterY: 0,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0,
  },
};
