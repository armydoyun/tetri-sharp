// 퍼즐 풀이 탐색: 지금 판과 남은 피스로 목표를 이루는 길을 찾는다("첫 수 보기", 퍼즐 만들기의 자동 확인).
// 엔진과 같은 회전 시스템·벽 차기·T-spin 판정으로 찾는다(단위 테스트가 모든 단계에서 길을 찾는지 확인한다).
// DOM·i18n 없이 돈다 — Worker(js/workers/solver.js)에도 그대로 들어간다.
import { HEIGHT, WIDTH, clearLines, collides, get, inBounds, isEmpty, place } from "../core/board.js";
import { PIECES } from "../core/pieces.js";
import { detectTSpin } from "../core/tspin.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { goalOf } from "./puzzle-goals.js";

/** 한 번 찾을 때 살펴볼 최대 상태 수(오래 멈추지 않게) */
const BUDGET = 1500000;

/**
 * 피스 하나로 닿을 수 있는 고정 자리(이동·한 칸 내리기·회전, 엔진과 같은 벽 차기).
 * @param {{ cells: Uint8Array, width: number, height: number }} board
 * @param {any} rotation  js/rules/rotation 의 회전 시스템
 * @param {string} type
 * @param {{ x: number, y: number, rot: number }} start
 * @param {{ half?: boolean, withPath?: boolean, budget?: { left: number } }} [options]
 */
const reachable = (
  board,
  rotation,
  type,
  start,
  { half = false, withPath = false, budget = { left: BUDGET } } = {}
) => {
  const fits = (x, y, rot) => !collides(board, rotation.cells(type, rot), x, y);
  const key = s => `${s.x},${s.y},${s.rot},${s.last === "rotate" ? s.kick : "m"}`;
  const prev = new Map([[key({ ...start, last: null }), null]]);
  const queue = [{ ...start, last: /** @type {string | null} */ (null), kick: 0 }];
  /** @type {Map<string, any>} */
  const out = new Map();
  for (let i = 0; i < queue.length && budget.left > 0; i++, budget.left--) {
    const s = queue[i];
    if (!fits(s.x, s.y + 1, s.rot)) {
      const tspin = detectTSpin(
        board,
        /** @type {any} */ ({ type, x: s.x, y: s.y, rot: s.rot, lastAction: s.last, kick: s.kick })
      );
      const k = `${s.x},${s.y},${s.rot},${tspin}`;
      if (!out.has(k)) out.set(k, { ...s, tspin, key: key(s) });
    }
    const push = (n, action) => {
      const k = key(n);
      if (prev.has(k)) return;
      prev.set(k, withPath ? [key(s), action] : true);
      queue.push(n);
    };
    for (const dx of [-1, 1])
      if (fits(s.x + dx, s.y, s.rot)) push({ ...s, x: s.x + dx, last: "move" }, dx < 0 ? "L" : "R");
    if (fits(s.x, s.y + 1, s.rot)) push({ ...s, y: s.y + 1, last: "drop" }, "D");
    for (const d of half ? [1, 3, 2] : [1, 3]) {
      const to = (s.rot + d) % 4;
      const blocked = (cx, cy) => !inBounds(board, s.x + cx, s.y + cy) || get(board, s.x + cx, s.y + cy) !== 0;
      const kicks = rotation.kicks(type, s.rot, to, blocked);
      for (let k = 0; k < kicks.length; k++) {
        const [dx, dy] = kicks[k];
        if (fits(s.x + dx, s.y + dy, to)) {
          push(
            { ...s, x: s.x + dx, y: s.y + dy, rot: to, last: "rotate", kick: k },
            d === 1 ? "CW" : d === 3 ? "CCW" : "180"
          );
          break;
        }
      }
    }
  }
  /** 시작에서 그 자리까지 누를 순서 */
  const pathTo = target => {
    const steps = [];
    for (let k = target.key; prev.get(k) && prev.get(k) !== true; k = prev.get(k)[0]) steps.unshift(prev.get(k)[1]);
    return steps;
  };
  return { placements: [...out.values()], pathTo };
};

/** 처음 나올 때의 자리(엔진과 같다) */
export const spawnOf = (board, rotation, type) => {
  const size = PIECES[type].size;
  const s = { x: Math.floor((WIDTH - size) / 2), y: HEIGHT - 22, rot: rotation.spawnRotation(type) };
  if (!collides(board, rotation.cells(type, s.rot), s.x, s.y + 1)) s.y += 1;
  return s;
};

/** 판에서 가장 높이 차 있는 줄(없으면 바닥 아래) */
const topRow = board => {
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) if (get(board, x, y)) return y;
  return board.height;
};

/**
 * 피스 하나를 놓은 결과: 다음 판과 그 수의 사건(엔진의 onLock과 같은 모양)
 * @param {{ cells: Uint8Array, width: number, height: number }} board
 */
const placeOn = (board, rotation, type, p, combo) => {
  const cells = rotation.cells(type, p.rot);
  const next = { ...board, cells: board.cells.slice() };
  place(next, cells, p.x, p.y, 8);
  const lines = clearLines(next).length;
  const ev = { lines, tspin: p.tspin, perfect: lines > 0 && isEmpty(next), combo: lines ? combo + 1 : -1 };
  return { next, ev, cells };
};

/**
 * 첫 수 찾기.
 * @param {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }} puzzle
 * @param {{ board: any, active: { type: string, x: number, y: number, rot: number }, combo: number }} state  지금 판(움직이는 피스 포함)
 * @param {string[]} rest  지금 피스 다음에 쓸 피스들
 * @param {any} rotation
 * @returns {null | { exhausted: true } | { cells: Array<[number, number]>, steps: string[], done: boolean, next: any, combo: number }}
 *   null: 남은 피스로는 풀 수 없다. exhausted: 살펴볼 수 있는 만큼 살폈지만 길을 찾지 못했다(피스가 많은 판) — 풀 수 없다는 뜻은 아니다.
 *   done: 이 수로 목표를 이룬다. next·combo: 이 수를 놓은 뒤의 판과 콤보(풀이를 이어 찾을 때)
 */
export const findFirstMove = (puzzle, state, rest, rotation) => {
  let exhausted = false;
  for (const half of [false, true]) {
    const budget = { left: BUDGET };
    // 여러 피스로 푸는 판은 처음 판의 높이 안에서만 놓아 본다(판 비우기·4줄·콤보 — 그 위로 쌓는 풀이는 없다)
    // (판 비우기는 아래 두 줄이 다 비어 있을 수도 있어 적어도 두 줄은 쓴다)
    const ceiling = Math.min(topRow(state.board), HEIGHT - 2);
    /** 남은 피스로 목표에 닿는가 */
    const solves = (board, pieces, combo) => {
      if (!pieces.length || budget.left <= 0) return false;
      const [type, ...more] = pieces;
      const { placements } = reachable(board, rotation, type, spawnOf(board, rotation, type), { half, budget });
      return placements.some(p => tryPlace(board, type, p, more, combo));
    };
    const tryPlace = (board, type, p, more, combo) => {
      if (more.length && rotation.cells(type, p.rot).some(([, cy]) => p.y + cy < ceiling)) return false;
      const { next, ev } = placeOn(board, rotation, type, p, combo);
      if (puzzle.goal(ev)) return true;
      if (puzzle.broken?.(ev) || !more.length) return false;
      return solves(next, more, ev.combo);
    };
    const { type } = state.active;
    const first = reachable(state.board, rotation, type, state.active, { half, withPath: true, budget });
    for (const p of first.placements) {
      if (tryPlace(state.board, type, p, rest, state.combo)) {
        const { next, ev, cells } = placeOn(state.board, rotation, type, p, state.combo);
        return {
          cells: cells.map(([cx, cy]) => /** @type {[number, number]} */ ([p.x + cx, p.y + cy])),
          steps: first.pathTo(p),
          done: puzzle.goal(ev),
          next,
          combo: ev.combo,
        };
      }
    }
    if (budget.left <= 0) exhausted = true;
  }
  return exhausted ? { exhausted: true } : null;
};

/**
 * 처음부터 끝까지 풀이: 수마다 [놓기 전 판, 피스, 놓을 칸].
 * @param {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }} puzzle
 * @param {{ cells: Uint8Array, width: number, height: number }} board  처음 판(움직이는 피스 없음)
 * @param {string[]} pieces
 * @param {any} rotation
 * @returns {null | { exhausted: true } | { moves: Array<{ type: string, board: Uint8Array, cells: Array<[number, number]> }> }}
 */
export const findSolution = (puzzle, board, pieces, rotation) => {
  const moves = [];
  let combo = -1;
  for (let i = 0; i < pieces.length; i++) {
    const type = pieces[i];
    const active = { type, ...spawnOf(board, rotation, type) };
    const move = findFirstMove(puzzle, { board, active, combo }, pieces.slice(i + 1), rotation);
    if (!move) return null;
    if ("exhausted" in move) return { exhausted: true };
    moves.push({ type, board: board.cells, cells: move.cells });
    if (move.done) return { moves };
    board = move.next;
    combo = move.combo;
  }
  return null;
};

/**
 * 탐색 한 건(Worker로 보낼 수 있는 값만): 목표는 종류·피스 수로, 회전은 이름으로 받는다.
 * - first: 지금 판·움직이는 피스·남은 피스로 첫 수(게임 중 "첫 수 보기")
 * - solution: 처음 판과 피스 순서로 끝까지 풀이(퍼즐 만들기의 자동 확인)
 * @typedef {{ type: "first", kind: string, count: number, rotation: string, board: Uint8Array, active: { type: string, x: number, y: number, rot: number }, combo: number, rest: string[] }
 *   | { type: "solution", kind: string, count: number, rotation: string, board: Uint8Array, pieces: string[] }} SolverTask
 */

/**
 * @param {SolverTask} task
 * @returns {null | { exhausted: true } | { cells: Array<[number, number]>, steps: string[] } | { moves: Array<{ type: string, board: Uint8Array, cells: Array<[number, number]> }> }}
 */
export const runSolverTask = task => {
  const puzzle = goalOf(task.kind, task.count);
  const rotation = ROTATIONS[task.rotation] ?? ROTATIONS.srs;
  const board = { width: WIDTH, height: HEIGHT, cells: task.board };
  if (task.type === "solution") return findSolution(puzzle, board, task.pieces, rotation);
  const move = findFirstMove(puzzle, { board, active: task.active, combo: task.combo }, task.rest, rotation);
  return move && "cells" in move ? { cells: move.cells, steps: move.steps } : move;
};
