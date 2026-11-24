// 퍼즐 "첫 수 보기": 지금 판과 남은 피스로 목표를 이루는 길을 찾아, 지금 피스를 놓을 자리와 누를 순서를 알려 준다.
// 엔진과 같은 회전 시스템·벽 차기·T-spin 판정으로 찾는다(단위 테스트가 모든 단계에서 길을 찾는지 확인한다).
// DOM 없이 돈다.
import { HEIGHT, WIDTH, clearLines, collides, get, inBounds, isEmpty, place } from "../core/board.js";
import { PIECES } from "../core/pieces.js";
import { detectTSpin } from "../core/tspin.js";
import { t } from "../i18n/index.js";

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
const spawnOf = (board, rotation, type) => {
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
 * 첫 수 찾기.
 * @param {{ goal: (ev: any) => boolean, broken?: (ev: any) => boolean }} puzzle
 * @param {{ board: any, active: { type: string, x: number, y: number, rot: number }, combo: number }} state  지금 판(움직이는 피스 포함)
 * @param {string[]} rest  지금 피스 다음에 쓸 피스들
 * @param {any} rotation
 * @returns {null | { cells: Array<[number, number]>, steps: string[] }}
 */
export const findFirstMove = (puzzle, state, rest, rotation) => {
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
      const cells = rotation.cells(type, p.rot);
      if (more.length && cells.some(([, cy]) => p.y + cy < ceiling)) return false;
      const next = { ...board, cells: board.cells.slice() };
      place(next, cells, p.x, p.y, 8);
      const lines = clearLines(next).length;
      const ev = { lines, tspin: p.tspin, perfect: lines > 0 && isEmpty(next), combo: lines ? combo + 1 : -1 };
      if (puzzle.goal(ev)) return true;
      if (puzzle.broken?.(ev) || !more.length) return false;
      return solves(next, more, ev.combo);
    };
    const { type } = state.active;
    const first = reachable(state.board, rotation, type, state.active, { half, withPath: true, budget });
    for (const p of first.placements) {
      if (tryPlace(state.board, type, p, rest, state.combo)) {
        return {
          cells: rotation.cells(type, p.rot).map(([cx, cy]) => /** @type {[number, number]} */ ([p.x + cx, p.y + cy])),
          steps: first.pathTo(p),
        };
      }
    }
  }
  return null;
};

/**
 * 누를 순서를 짧은 글로: "오른쪽 4칸, 아래로 18칸, 반시계 회전, 그대로 두기"
 * @param {string[]} steps  L R D CW CCW 180
 * @param {boolean} spinLast  마지막이 회전이어야 하는 수(T-spin 등) → 하드 드롭 대신 그대로 두기
 */
export const describeSteps = (steps, spinLast) => {
  // 끝에 곧장 내려가는 칸은 하드 드롭 하나로 갈음한다
  let end = steps.length;
  while (end > 0 && steps[end - 1] === "D") end--;
  const dropsAtEnd = end < steps.length;
  steps = steps.slice(0, end);
  const parts = [];
  for (let i = 0; i < steps.length; ) {
    let j = i;
    while (j < steps.length && steps[j] === steps[i]) j++;
    const n = j - i;
    const s = steps[i];
    if (s === "L") parts.push(t("왼쪽 {n}칸", { n }));
    else if (s === "R") parts.push(t("오른쪽 {n}칸", { n }));
    else if (s === "D") parts.push(t("아래로 {n}칸", { n }));
    else if (s === "CW") parts.push(n > 1 ? t("시계 회전 {n}번", { n }) : t("시계 회전"));
    else if (s === "CCW") parts.push(n > 1 ? t("반시계 회전 {n}번", { n }) : t("반시계 회전"));
    else parts.push(t("180° 회전"));
    i = j;
  }
  const last = steps.at(-1);
  const rotatedLast = !dropsAtEnd && (last === "CW" || last === "CCW" || last === "180");
  // T-spin처럼 회전이 마지막이어야 하는 수는 하드 드롭 대신 그대로 두어 고정한다
  const finish = rotatedLast && spinLast ? t("그대로 두기") : t("하드 드롭");
  return [...parts, finish].join(", ");
};
