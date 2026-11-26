// 퍼즐 풀이 탐색: 지금 판과 남은 피스로 목표를 이루는 길을 찾는다("첫 수 보기", 퍼즐 만들기의 자동 확인).
// 엔진과 같은 회전 시스템·벽 차기·T-spin 판정으로 찾는다(단위 테스트가 모든 단계에서 길을 찾는지 확인한다).
// 만든 퍼즐의 규칙도 따른다: 홀드(바꿔 넣기·목록이 끝나면 홀드한 피스가 나온다), 20G(늘 바닥, 나올 때 미리 회전),
// T-spin 판정 없음, 지운 줄 합계(N줄 지우기).
// DOM·i18n 없이 돈다 — Worker(js/workers/solver.js)에도 그대로 들어간다.
import { HEIGHT, WIDTH, clearLines, collides, get, inBounds, isEmpty, place } from "../core/board.js";
import { PIECES } from "../core/pieces.js";
import { detectTSpin } from "../core/tspin.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { goalOf } from "./puzzle-goals.js";

/** 한 번 찾을 때 살펴볼 최대 상태 수(오래 멈추지 않게) */
const BUDGET = 1500000;

/**
 * 탐색 설정(퍼즐의 규칙에서 온다). 모두 비우면 기본 퍼즐과 같다(Modern, 홀드 없음, 중력 없음).
 * - sonic: 20G — 움직일 때마다 바닥까지
 * - irs: 20G에서 나올 때 미리 돌린 채로 나올 수 있다(첫 수는 이미 나온 피스라 쓰지 않는다)
 * - lockNone: 고정 지연 없음 — 20G면 나오자마자 그 자리에 고정
 * - tspin: "none"이면 T-spin을 세지 않는다
 * - hold: 홀드를 쓸 수 있다
 * - ceilingRows: 아래에서 이 줄 수까지만 놓아 본다(없으면 처음 판의 높이 — 기본 퍼즐)
 * - looseRows: 처음 판의 높이 안에서 먼저 찾고, 못 찾으면 이 줄 수까지 넓혀 다시 찾는다(빠르게 찾되 "못 풀어요"는 넓게 찾아 본 뒤에만)
 * @typedef {{ sonic?: boolean, irs?: boolean, lockNone?: boolean, tspin?: "threeCorner" | "none", hold?: boolean, ceilingRows?: number, looseRows?: number }} SearchOptions
 */

/**
 * 피스 하나로 닿을 수 있는 고정 자리(이동·한 칸 내리기·회전, 엔진과 같은 벽 차기).
 * @param {{ cells: Uint8Array, width: number, height: number }} board
 * @param {any} rotation  js/rules/rotation 의 회전 시스템
 * @param {string} type
 * @param {Array<{ x: number, y: number, rot: number, first?: string }>} starts  시작 자리(first: 그 자리로 오는 첫 동작, 예: 미리 회전)
 * @param {{ half?: boolean, withPath?: boolean, budget?: { left: number }, sonic?: boolean, lockNone?: boolean }} [options]
 */
export const reachable = (
  board,
  rotation,
  type,
  starts,
  { half = false, withPath = false, budget = { left: BUDGET }, sonic = false, lockNone = false } = {}
) => {
  const fits = (x, y, rot) => !collides(board, rotation.cells(type, rot), x, y);
  const key = s => `${s.x},${s.y},${s.rot},${s.last === "rotate" ? s.kick : "m"}`;
  /** 20G: 바닥까지 떨어뜨린다(떨어졌으면 마지막 동작은 내려가기) */
  const fall = s => {
    if (!sonic) return s;
    let y = s.y;
    while (fits(s.x, y + 1, s.rot)) y++;
    return y === s.y ? s : { ...s, y, last: "drop" };
  };
  /** @type {Map<string, any>} */
  const prev = new Map();
  const queue = [];
  for (const start of starts) {
    const s = fall({ ...start, last: /** @type {string | null} */ (null), kick: 0 });
    const k = key(s);
    if (prev.has(k)) continue;
    prev.set(k, start.first ? ["", start.first] : null);
    queue.push(s);
  }
  /** 시작에서 그 상태까지 누를 순서 */
  const pathTo = target => {
    const steps = [];
    for (let k = target.key; prev.get(k) && prev.get(k) !== true; k = prev.get(k)[0]) steps.unshift(prev.get(k)[1]);
    return steps;
  };
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
      const found = { ...s, tspin, key: key(s) };
      // 같은 자리에 가는 길이 여럿이면(이동 뒤 내리기 · 내린 뒤 회전 등) 누를 것이 적은 길을 남긴다(첫 수 보기 안내가 짧게)
      if (!out.has(k) || (withPath && pressCost(pathTo(found)) < pressCost(pathTo(out.get(k))))) out.set(k, found);
      // 20G에 고정 지연이 없으면 바닥에 닿는 순간 고정된다: 더 움직일 수 없다
      if (sonic && lockNone) continue;
    }
    const push = (n, action) => {
      n = fall(n);
      const k = key(n);
      if (prev.has(k)) return;
      prev.set(k, withPath ? [key(s), action] : true);
      queue.push(n);
    };
    for (const dx of [-1, 1])
      if (fits(s.x + dx, s.y, s.rot)) push({ ...s, x: s.x + dx, last: "move" }, dx < 0 ? "L" : "R");
    if (!sonic && fits(s.x, s.y + 1, s.rot)) push({ ...s, y: s.y + 1, last: "drop" }, "D");
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
  return { placements: [...out.values()], pathTo };
};

/**
 * 누를 순서의 수고: 끝에 곧장 내려가는 칸은 하드 드롭 한 번이므로 그 앞까지 누르는 수가 먼저, 같으면 전체 길이
 * @param {string[]} steps
 */
const pressCost = steps => {
  let end = steps.length;
  while (end > 0 && steps[end - 1] === "D") end--;
  return end * 1000 + steps.length;
};

/**
 * 위에서 돌리고(엔진과 같은 킥), 옆으로 옮기고, 곧장 내려 target에 닿는 길. 막히면 null
 * @param {{ cells: Uint8Array, width: number, height: number }} board
 * @param {{ x: number, y: number, rot: number }} start @param {{ x: number, y: number, rot: number }} target
 */
const straightPath = (board, rotation, type, start, target, half) => {
  const fits = (x, y, rot) => !collides(board, rotation.cells(type, rot), x, y);
  let { x, y, rot } = start;
  const steps = [];
  const turn = (target.rot - rot + 4) % 4;
  const turns = turn === 0 ? [] : turn === 1 ? [1] : turn === 3 ? [3] : half ? [2] : [1, 1];
  for (const d of turns) {
    // 엔진과 같은 킥 순서로 돈다(처음 들어가는 킥)
    const to = (rot + d) % 4;
    const blocked = (cx, cy) => !inBounds(board, x + cx, y + cy) || get(board, x + cx, y + cy) !== 0;
    const kick = rotation.kicks(type, rot, to, blocked).find(([dx, dy]) => fits(x + dx, y + dy, to));
    if (!kick) return null;
    x += kick[0];
    y += kick[1];
    rot = to;
    steps.push(d === 1 ? "CW" : d === 3 ? "CCW" : "180");
  }
  while (x !== target.x) {
    const dx = Math.sign(target.x - x);
    if (!fits(x + dx, y, rot)) return null;
    x += dx;
    steps.push(dx < 0 ? "L" : "R");
  }
  while (y < target.y && fits(x, y + 1, rot)) {
    y++;
    steps.push("D");
  }
  return y === target.y && !fits(x, y + 1, rot) ? steps : null;
};

/** 처음 나올 때의 자리(엔진과 같다) */
export const spawnOf = (board, rotation, type) => {
  const size = PIECES[type].size;
  const s = { x: Math.floor((WIDTH - size) / 2), y: HEIGHT - 22, rot: rotation.spawnRotation(type) };
  if (!collides(board, rotation.cells(type, s.rot), s.x, s.y + 1)) s.y += 1;
  return s;
};

/**
 * 새로 나오는 피스의 시작 자리들: 보통은 나오는 자리 하나, 20G에 미리 회전이 되면 돌린 채로 나오는 자리도(엔진의 IRS와 같다)
 * @param {SearchOptions} opts
 */
const spawnStarts = (board, rotation, type, opts, half) => {
  const size = PIECES[type].size;
  const base = spawnOf(board, rotation, type);
  const starts = [base];
  if (!opts.sonic || !opts.irs) return starts;
  const x = Math.floor((WIDTH - size) / 2);
  const y = HEIGHT - 22;
  for (const d of half ? [1, 3, 2] : [1, 3]) {
    const rot = (rotation.spawnRotation(type) + d) % 4;
    if (collides(board, rotation.cells(type, rot), x, y)) continue;
    const s = { x, y, rot, first: d === 1 ? "IRS-CW" : d === 3 ? "IRS-CCW" : "IRS-180" };
    if (!collides(board, rotation.cells(type, rot), x, y + 1)) s.y += 1;
    starts.push(s);
  }
  return starts;
};

/** 판에서 가장 높이 차 있는 줄(없으면 바닥 아래) */
const topRow = board => {
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) if (get(board, x, y)) return y;
  return board.height;
};

/**
 * 피스 하나를 놓은 결과: 다음 판과 그 수의 사건(엔진의 onLock과 같은 모양 + 지운 줄 합계 total)
 * @param {{ cells: Uint8Array, width: number, height: number }} board
 * @param {SearchOptions} opts
 */
export const placeOn = (board, rotation, type, p, combo, total, opts) => {
  const cells = rotation.cells(type, p.rot);
  const next = { ...board, cells: board.cells.slice() };
  place(next, cells, p.x, p.y, 8);
  const lines = clearLines(next).length;
  const tspin = opts.tspin === "none" ? "none" : p.tspin;
  const ev = {
    lines,
    tspin,
    perfect: lines > 0 && isEmpty(next),
    combo: lines ? combo + 1 : -1,
    total: total + lines,
  };
  return { next, ev, cells };
};

/**
 * 첫 수 찾기.
 * @param {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }} puzzle
 * @param {{ board: any, active: { type: string, x: number, y: number, rot: number }, combo: number, total?: number, hold?: string | null, holdUsed?: boolean }} state
 *   지금 판(움직이는 피스 포함), 지운 줄 합계, 홀드한 피스와 이번 피스에서 이미 홀드했는지
 * @param {string[]} rest  지금 피스 다음에 나올 피스들(홀드 칸 제외)
 * @param {any} rotation
 * @param {SearchOptions} [opts]
 * @returns {null | { exhausted: true } | {
 *   cells: Array<[number, number]>, steps: string[], hold: boolean, type: string,
 *   done: boolean, next: any, combo: number, total: number, rest: string[], holdPiece: string | null,
 * }}
 *   null: 남은 피스로는 풀 수 없다. exhausted: 살펴볼 수 있는 만큼 살폈지만 길을 찾지 못했다(피스가 많은 판) — 풀 수 없다는 뜻은 아니다.
 *   hold: 먼저 홀드하고 나온 피스(type)를 놓는다. done: 이 수로 목표를 이룬다.
 *   next·combo·total·rest·holdPiece: 이 수를 놓은 뒤(풀이를 이어 찾을 때)
 */
export const findFirstMove = (puzzle, state, rest, rotation, opts = {}) => {
  if (opts.looseRows !== undefined) {
    const { looseRows, ...tightOpts } = opts;
    const tight = findFirstMove(puzzle, state, rest, rotation, tightOpts);
    if (tight && !("exhausted" in tight)) return tight;
    return findFirstMove(puzzle, state, rest, rotation, { ...tightOpts, ceilingRows: looseRows });
  }
  let exhausted = false;
  const total0 = state.total ?? 0;
  const hold0 = state.hold ?? null;
  for (const half of [false, true]) {
    const budget = { left: BUDGET };
    // 여러 피스로 푸는 판은 놓을 높이를 정해 둔다. 기본 퍼즐은 처음 판의 높이 안에서만(판 비우기·4줄·콤보 — 그 위로 쌓는 풀이는 없다,
    // 판 비우기는 아래 두 줄이 다 비어 있을 수도 있어 적어도 두 줄). 만든 퍼즐은 ceilingRows로 받는다.
    const ceiling =
      opts.ceilingRows !== undefined ? HEIGHT - opts.ceilingRows : Math.min(topRow(state.board), HEIGHT - 2);
    const search = { half, budget, sonic: opts.sonic, lockNone: opts.lockNone };
    /** 다음 피스로 넘어간다: 목록이 끝나면 홀드한 피스가 나온다(만든 퍼즐의 규칙) */
    const advance = (queue, hold) =>
      queue.length ? { cur: queue[0], queue: queue.slice(1), hold } : hold ? { cur: hold, queue, hold: null } : null;
    /** 이 피스(cur)부터 남은 피스로 목표에 닿는가 */
    const solves = (board, cur, queue, hold, combo, total, canSwap) => {
      if (budget.left <= 0) return false;
      const { placements } = reachable(board, rotation, cur, spawnStarts(board, rotation, cur, opts, half), search);
      if (placements.some(p => tryPlace(board, cur, p, queue, hold, combo, total))) return true;
      if (!opts.hold || !canSwap) return false;
      if (hold) return solves(board, hold, queue, cur, combo, total, false);
      return queue.length > 0 && solves(board, queue[0], queue.slice(1), cur, combo, total, false);
    };
    const tryPlace = (board, cur, p, queue, hold, combo, total) => {
      const more = queue.length > 0 || Boolean(hold);
      if (more && rotation.cells(cur, p.rot).some(([, cy]) => p.y + cy < ceiling)) return false;
      const { next, ev } = placeOn(board, rotation, cur, p, combo, total, opts);
      if (puzzle.goal(ev)) return true;
      if (puzzle.broken?.(ev) || !more) return false;
      const after = advance(queue, hold);
      return Boolean(after) && solves(next, after.cur, after.queue, after.hold, ev.combo, ev.total, true);
    };
    /** 지금 피스(또는 홀드로 바꾼 피스)의 자리 중 풀리는 첫 자리. 누를 것이 적은 자리부터 본다(첫 수 보기 안내가 짧게) */
    const firstOf = (type, starts, queue, hold, swapped) => {
      const first = reachable(state.board, rotation, type, starts, { ...search, withPath: true });
      /** 사람이 보통 하는 길: 위에서 돌리고, 옆으로 옮기고, 곧장 떨어뜨린다. 막히면(처마 밑·스핀) 탐색이 찾은 길 */
      const pathOf = p =>
        (!opts.sonic && p.tspin === "none" && straightPath(state.board, rotation, type, starts[0], p, half)) ||
        first.pathTo(p);
      const paths = new Map(first.placements.map(p => [p, pathOf(p)]));
      const cost = new Map(first.placements.map(p => [p, pressCost(paths.get(p))]));
      for (const p of [...first.placements].sort((a, b) => cost.get(a) - cost.get(b))) {
        if (!tryPlace(state.board, type, p, queue, hold, state.combo, total0)) continue;
        const { next, ev, cells } = placeOn(state.board, rotation, type, p, state.combo, total0, opts);
        const after = advance(queue, hold);
        return {
          cells: cells.map(([cx, cy]) => /** @type {[number, number]} */ ([p.x + cx, p.y + cy])),
          steps: paths.get(p),
          hold: swapped,
          type,
          done: puzzle.goal(ev),
          next,
          combo: ev.combo,
          total: ev.total,
          rest: after ? [after.cur, ...after.queue] : [],
          holdPiece: after ? after.hold : null,
        };
      }
      return null;
    };
    const { type } = state.active;
    const found =
      firstOf(type, [state.active], rest, hold0, false) ??
      (opts.hold && !state.holdUsed && (hold0 || rest.length)
        ? hold0
          ? firstOf(hold0, spawnStarts(state.board, rotation, hold0, opts, half), rest, type, true)
          : firstOf(rest[0], spawnStarts(state.board, rotation, rest[0], opts, half), rest.slice(1), type, true)
        : null);
    if (found) return found;
    if (budget.left <= 0) exhausted = true;
  }
  return exhausted ? { exhausted: true } : null;
};

/**
 * 처음부터 끝까지 풀이: 수마다 [놓기 전 판, 놓는 피스, 놓을 칸, 홀드를 먼저 했는지].
 * @param {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }} puzzle
 * @param {{ cells: Uint8Array, width: number, height: number }} board  처음 판(움직이는 피스 없음)
 * @param {string[]} pieces
 * @param {any} rotation
 * @param {SearchOptions & { holdStart?: string | null }} [opts]
 * @returns {null | { exhausted: true } | { moves: Array<{ type: string, hold: boolean, board: Uint8Array, cells: Array<[number, number]> }> }}
 */
const findSolution = (puzzle, board, pieces, rotation, opts = {}) => {
  const moves = [];
  let combo = -1;
  let total = 0;
  let hold = opts.holdStart ?? null;
  let [cur, ...queue] = pieces;
  while (cur) {
    const active = { type: cur, ...spawnOf(board, rotation, cur) };
    const move = findFirstMove(puzzle, { board, active, combo, total, hold, holdUsed: false }, queue, rotation, opts);
    if (!move) return null;
    if ("exhausted" in move) return { exhausted: true };
    moves.push({ type: move.type, hold: move.hold, board: board.cells, cells: move.cells });
    if (move.done) return { moves };
    board = move.next;
    combo = move.combo;
    total = move.total;
    // 다음 피스(목록이 끝났으면 홀드한 피스)와 홀드 칸
    [cur, ...queue] = move.rest;
    hold = move.holdPiece;
  }
  return null;
};

/**
 * 탐색 한 건(Worker로 보낼 수 있는 값만): 목표는 종류·피스 수로, 회전은 이름으로 받는다.
 * - first: 지금 판·움직이는 피스·남은 피스로 첫 수(게임 중 "첫 수 보기")
 * - solution: 처음 판과 피스 순서로 끝까지 풀이(퍼즐 만들기의 자동 확인)
 * @typedef {{ kind: string, count: number, lines?: number, rotation: string, board: Uint8Array, opts?: SearchOptions }} SolverBase
 * @typedef {SolverBase & { type: "first", active: { type: string, x: number, y: number, rot: number }, combo: number, rest: string[], total?: number, hold?: string | null, holdUsed?: boolean }
 *   | SolverBase & { type: "solution", pieces: string[], holdStart?: string | null }} SolverTask
 */

/**
 * @param {SolverTask} task
 * @returns {null | { exhausted: true } | { cells: Array<[number, number]>, steps: string[], hold: boolean } | { moves: Array<{ type: string, hold: boolean, board: Uint8Array, cells: Array<[number, number]> }> }}
 */
export const runSolverTask = task => {
  const puzzle = goalOf(task.kind, task.count, task.lines);
  const rotation = ROTATIONS[task.rotation] ?? ROTATIONS.srs;
  const board = { width: WIDTH, height: HEIGHT, cells: task.board };
  const opts = task.opts ?? {};
  if (task.type === "solution")
    return findSolution(puzzle, board, task.pieces, rotation, { ...opts, holdStart: task.holdStart ?? null });
  const move = findFirstMove(
    puzzle,
    {
      board,
      active: task.active,
      combo: task.combo,
      total: task.total ?? 0,
      hold: task.hold ?? null,
      holdUsed: task.holdUsed ?? false,
    },
    task.rest,
    rotation,
    opts
  );
  return move && "cells" in move ? { cells: move.cells, steps: move.steps, hold: move.hold } : move;
};
