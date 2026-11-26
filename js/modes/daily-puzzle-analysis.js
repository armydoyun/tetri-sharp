// 견본용 탐색. 같은 고정 칸으로 이어지는 입력은 하나의 선택으로 센다.
import { HEIGHT, WIDTH, createBoard } from "../core/board.js";
import { searchOptions, solverBoard, usedHeight } from "./custom-puzzle.js";
import { goalOf } from "./puzzle-goals.js";
import { placeOn, reachable, spawnOf } from "./puzzle-solver.js";
import { ROTATIONS } from "../rules/rotation/index.js";

const rotation = ROTATIONS.srs;

const placements = (board, type, budget) => {
  const start = spawnOf(board, rotation, type);
  const { placements } = reachable(board, rotation, type, [start], { budget });
  return placements;
};

/**
 * 탐색 범위 안에서 첫 배치별로 완주 가능 여부를 센다. 90° 회전만 쓴다.
 * @param {import("./custom-puzzle.js").CustomPuzzle} puzzle
 */
export const analyzeDailyPuzzle = puzzle => {
  const { pieces, goal } = puzzle;
  const opts = searchOptions(puzzle);
  const target = goalOf(goal.kind, pieces.length, goal.lines);
  const board = createBoard();
  board.cells = solverBoard(puzzle.cells);
  const height = opts.ceilingRows ?? usedHeight(puzzle.cells) + 1;
  const budget = { left: 220_000 };
  const memo = new Map();

  const choices = (board, queue, hold, combo, total) => {
    const [current, ...rest] = queue;
    const orders = [{ type: current, queue: rest, hold, swap: false }];
    if (opts.hold && hold) orders.push({ type: hold, queue: rest, hold: current, swap: true });
    if (opts.hold && !hold && rest.length)
      orders.push({ type: rest[0], queue: rest.slice(1), hold: current, swap: true });
    const out = new Map();
    for (const order of orders) {
      for (const placement of placements(board, order.type, budget)) {
        const { next, ev, cells } = placeOn(board, rotation, order.type, placement, combo, total, opts);
        if (cells.some(([, y]) => y + placement.y < HEIGHT - height)) continue;
        const done = target.goal(ev);
        const broken = Boolean(target.broken?.(ev));
        const coords = cells.map(([x, y]) => /** @type {[number, number]} */ ([x + placement.x, y + placement.y]));
        const id = [order.swap, ...coords.map(([x, y]) => y * WIDTH + x).sort((a, b) => a - b), done].join(",");
        if (!out.has(id)) out.set(id, { ...order, next, ev, coords, done, broken });
      }
    }
    return [...out.values()];
  };

  const after = choice => {
    const { queue, hold } = choice;
    return queue.length ? { queue, hold } : hold ? { queue: [hold], hold: "" } : null;
  };

  const follow = choice => {
    if (choice.done) return { path: [choice], depth: 1 };
    const order = choice.broken ? null : after(choice);
    if (!order) return { path: null, depth: 1 };
    const tail = search(choice.next, order.queue, order.hold, choice.ev.combo, choice.ev.total);
    return { path: tail.path && [choice, ...tail.path], depth: 1 + tail.depth };
  };

  const search = (board, queue, hold, combo, total) => {
    if (budget.left <= 0) return { path: null, depth: 0 };
    const key = [board.cells.slice((HEIGHT - height) * WIDTH).join(""), queue.join(""), hold, combo, total].join("/");
    if (memo.has(key)) return memo.get(key);
    let depth = 0;
    for (const choice of choices(board, queue, hold, combo, total)) {
      const result = follow(choice);
      if (result.path) {
        memo.set(key, result);
        return result;
      }
      depth = Math.max(depth, result.depth);
      if (budget.left <= 0) break;
    }
    const failed = { path: null, depth };
    memo.set(key, failed);
    return failed;
  };

  const root = choices(board, [...pieces], "", -1, 0);
  let path = null;
  let wins = 0;
  let holdWins = 0;
  let deepestDeadEnd = 0;
  for (const choice of root) {
    const result = follow(choice);
    if (result.path) {
      wins += 1;
      if (choice.swap) holdWins += 1;
      if (!path || result.path.length < path.length) path = result.path;
    } else {
      deepestDeadEnd = Math.max(deepestDeadEnd, result.depth);
    }
    if (budget.left <= 0) break;
  }
  return {
    complete: budget.left > 0,
    firstChoices: root.length,
    wins,
    holdWins,
    deepestDeadEnd,
    height,
    /** @type {Array<{type: string, hold: boolean, cells: [number, number][], lines: number, tspin: string}> | null} */
    path:
      path?.map(({ type, swap, coords, ev }) => ({
        type,
        hold: swap,
        cells: coords,
        lines: ev.lines,
        tspin: ev.tspin,
      })) ?? null,
  };
};

export const hasStraightClear = puzzle => {
  const board = createBoard();
  board.cells = solverBoard(puzzle.cells);
  const type = puzzle.pieces[0];
  const start = spawnOf(board, rotation, type);
  const floor = placements(board, type, { left: 4000 });
  return floor.some(p => {
    const { ev, cells } = placeOn(board, rotation, type, p, -1, 0, {});
    return (
      ev.lines >= 2 &&
      cells.every(
        ([x, y]) =>
          !board.cells.some((v, i) => v && i % WIDTH === p.x + x && i >= start.y * WIDTH && i < (p.y + y) * WIDTH)
      )
    );
  });
};
