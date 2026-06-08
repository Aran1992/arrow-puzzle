export interface Direction {
  dc: number;
  dr: number;
}

export interface LineData {
  id: number;
  points: [number, number][];
}

export interface LevelData {
  cols: number;
  rows: number;
  lines: LineData[];
}

export interface GameLine {
  id: number;
  cells: [number, number][];
  dir: Direction;
  color: number;
  flashAlpha: number;
  alive: boolean;
}

export interface Overlap {
  cell: [number, number];
  lineIds: number[];
}

export interface AnimState {
  lineId: number;
  timer: number;
  stepInterval: number;
  flashLines: number[];
  flashTimer: number;
  moving: boolean;
  offset: number; // 0→1 sub-cell interpolation progress
}

export type SimResult = { blocked: true; blocker: GameLine } | { exits: true };

export interface SolverState {
  id: number;
  cells: [number, number][];
  dir: Direction;
}

export interface EditorLine {
  id: number;
  points: [number, number][];
}

export interface EditorState {
  mode: 'play' | 'edit';
  currentLine: EditorLine | null;
  selectedId: number | null;
  hoverCol: number;
  hoverRow: number;
  editorCols: number;
  editorRows: number;
}
