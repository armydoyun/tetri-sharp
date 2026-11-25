// 퍼즐 만들기의 편집 동작(DOM 없이 돈다 — 단위 테스트가 직접 부른다).
// 판은 위에서 아래로 VISIBLE_ROWS줄 × WIDTH칸, 칸 값은 0(빔)·1(참)이다. index = row * WIDTH + col.
import { VISIBLE_ROWS, WIDTH, createBoard } from "../core/board.js";
import { PUZZLE_CELLS, MAX_PUZZLE_PIECES } from "./custom-puzzle.js";
import { PUZZLES } from "./puzzles.js";

/** 편집 화면에 보이는 높이(아래에서부터 줄 수) */
export const EDIT_HEIGHTS = Object.freeze([8, 12, 20]);

/** @param {Uint8Array} cells @param {number} row */
const rowFull = (cells, row) => cells.subarray(row * WIDTH, (row + 1) * WIDTH).every(Boolean);

/**
 * 도구 하나를 칸 하나에 쓴다. 바뀌었으면 true.
 * - cell: 칸을 value로
 * - row: 그 줄 전체를 value로
 * - garbage: 그 줄을 누른 열만 비운 쓰레기 줄로(value가 0이면 줄을 비운다)
 * @param {Uint8Array} cells
 * @param {"cell" | "row" | "garbage"} tool
 * @param {number} index
 * @param {0 | 1} value
 */
export const applyTool = (cells, tool, index, value) => {
  const row = Math.floor(index / WIDTH);
  const col = index % WIDTH;
  const before = cells.slice(row * WIDTH, (row + 1) * WIDTH);
  if (tool === "cell") cells[index] = value;
  else for (let x = 0; x < WIDTH; x++) cells[row * WIDTH + x] = tool === "garbage" && value ? Number(x !== col) : value;
  return before.some((v, x) => v !== cells[row * WIDTH + x]);
};

/**
 * 누르기 시작한 칸에서 칠할 값: 그 칸(줄 도구는 그 줄)이 이미 그 모양이면 지우고, 아니면 채운다.
 * @param {Uint8Array} cells
 * @param {"cell" | "row" | "garbage"} tool
 * @param {number} index
 * @returns {0 | 1}
 */
export const strokeValue = (cells, tool, index) => {
  const row = Math.floor(index / WIDTH);
  const col = index % WIDTH;
  if (tool === "cell") return cells[index] ? 0 : 1;
  if (tool === "row") return rowFull(cells, row) ? 0 : 1;
  const line = cells.subarray(row * WIDTH, (row + 1) * WIDTH);
  return line.every((v, x) => v === Number(x !== col)) ? 0 : 1;
};

/**
 * 판 전체를 민다. 밖으로 나간 칸은 사라지고 들어온 자리는 빈다.
 * @param {Uint8Array} cells
 * @param {number} dx  오른쪽 +
 * @param {number} dy  아래 +
 */
export const shiftCells = (cells, dx, dy) => {
  const out = new Uint8Array(cells.length);
  for (let row = 0; row < VISIBLE_ROWS; row++)
    for (let col = 0; col < WIDTH; col++) {
      const r = row + dy;
      const c = col + dx;
      if (r >= 0 && r < VISIBLE_ROWS && c >= 0 && c < WIDTH) out[r * WIDTH + c] = cells[row * WIDTH + col];
    }
  return out;
};

/** 좌우 뒤집기 @param {Uint8Array} cells */
export const mirrorCells = cells => {
  const out = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) out[i] = cells[i - (i % WIDTH) + (WIDTH - 1 - (i % WIDTH))];
  return out;
};

/** 블록이 있는 가장 높은 줄까지의 높이(아래에서부터, 빈 판은 0) @param {Uint8Array} cells */
export const usedHeight = cells => {
  const first = cells.findIndex(Boolean);
  return first < 0 ? 0 : VISIBLE_ROWS - Math.floor(first / WIDTH);
};

/** 블록이 다 보이는 가장 낮은 편집 높이 @param {Uint8Array} cells */
export const fitHeight = cells => EDIT_HEIGHTS.find(h => h >= usedHeight(cells)) ?? VISIBLE_ROWS;

// ---- 피스 순서 ----

/** 고른 자리 뒤에 넣는다(고른 자리가 없으면 맨 뒤). 새 순서와 새로 고를 자리. */
export const insertPiece = (pieces, at, piece) => {
  if (pieces.length >= MAX_PUZZLE_PIECES) return { pieces, at };
  const i = at === null ? pieces.length : at + 1;
  return { pieces: pieces.slice(0, i) + piece + pieces.slice(i), at: i };
};

/** 고른 자리(없으면 마지막)를 뺀다. 그다음 고를 자리는 같은 자리(끝이면 하나 앞). */
export const removePiece = (pieces, at) => {
  if (!pieces.length) return { pieces, at: null };
  const i = at === null ? pieces.length - 1 : at;
  const next = pieces.slice(0, i) + pieces.slice(i + 1);
  return { pieces: next, at: at === null || !next.length ? null : Math.min(i, next.length - 1) };
};

/** 고른 피스를 앞(-1)·뒤(+1)로 한 칸 옮긴다 */
export const movePiece = (pieces, at, offset) => {
  const to = at + offset;
  if (at === null || to < 0 || to >= pieces.length) return { pieces, at };
  const list = [...pieces];
  [list[at], list[to]] = [list[to], list[at]];
  return { pieces: list.join(""), at: to };
};

// ---- 되돌리기 ----

/**
 * 편집 기록. 바꾸기 직전 모습을 record()로 남기고, undo()·redo()는 돌아갈 모습을 준다.
 * @template T
 * @param {number} [limit]
 */
export const createHistory = (limit = 100) => {
  /** @type {T[]} */
  let past = [];
  /** @type {T[]} */
  let future = [];
  return {
    /** @param {T} snapshot 바꾸기 직전 모습 */
    record(snapshot) {
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future = [];
    },
    /** @param {T} now @returns {T | null} */
    undo(now) {
      const prev = past.pop();
      if (prev === undefined) return null;
      future.push(now);
      return prev;
    },
    /** @param {T} now @returns {T | null} */
    redo(now) {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(now);
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past = [];
      future = [];
    },
  };
};

// ---- 시작 틀 ----

/** 아래에서 n번째 줄(0이 바닥)의 index 시작 */
const bottomRow = n => (VISIBLE_ROWS - 1 - n) * WIDTH;

/** @param {string[]} rows 위에서 아래로, "#"이 참 칸. 판 바닥에 붙인다 */
const fromRows = rows => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  rows.forEach((line, i) => {
    const start = bottomRow(rows.length - 1 - i);
    for (let x = 0; x < WIDTH; x++) cells[start + x] = Number(line[x] === "#");
  });
  return cells;
};

/** 기본 퍼즐 단계의 판(보이는 20줄)을 0·1 칸으로 */
const stageCells = stage => {
  const board = createBoard();
  stage.build(board);
  const offset = board.cells.length - PUZZLE_CELLS;
  return Uint8Array.from(board.cells.subarray(offset), v => Number(v > 0));
};

/** 판 비우기 목표로 바로 쓸 수 있는 기본 퍼즐(지금 만든 퍼즐의 목표는 판 비우기 하나) */
export const COPYABLE_STAGES = Object.freeze(PUZZLES.filter(p => p.kind === "pc"));

/**
 * 시작 틀: 빈 판, T 자리, 4줄 우물, 기본 퍼즐 N단계 복사("stage-<번호>").
 * @param {string} id
 * @returns {{ cells: Uint8Array, pieces: string } | null}
 */
export const template = id => {
  if (id === "empty") return { cells: new Uint8Array(PUZZLE_CELLS), pieces: "" };
  if (id === "t-slot") return { cells: fromRows(["###...####", "####.#####"]), pieces: "T" };
  if (id === "well") return { cells: fromRows(["#########.", "#########.", "#########.", "#########."]), pieces: "I" };
  const number = Number(/^stage-(\d+)$/.exec(id)?.[1]);
  const stage = COPYABLE_STAGES.find(p => p.number === number);
  return stage ? { cells: stageCells(stage), pieces: stage.pieces.join("") } : null;
};
