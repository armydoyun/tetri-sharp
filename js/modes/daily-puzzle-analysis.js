// 오늘의 퍼즐 후보 탐색. 같은 고정 칸으로 이어지는 입력은 하나의 선택으로 센다.
import { HEIGHT, WIDTH, clearLines, createBoard } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { searchOptions, solverBoard, usedHeight } from "./custom-puzzle.js";
import { goalOf } from "./puzzle-goals.js";
import { canClearColumns, inputsForPlacement, placeOn, reachable, spawnOf } from "./puzzle-solver.js";
import { ROTATIONS } from "../rules/rotation/index.js";

const rotation = ROTATIONS.srs;

const placements = (board, type, budget) => {
  const start = spawnOf(board, rotation, type);
  return reachable(board, rotation, type, [start], { budget }).placements;
};

// 이 줄에서는 모든 회전의 칸이 지형 위에 있다. 벽 안의 자리와 방향을 모두 시작점으로 잡으면
// 출현 높이부터 빈 공간에서 한 칸씩 내려오는 탐색을 반복하지 않아도 된다.
const compactPlacements = (board, type, height, half, budget) => {
  const y = HEIGHT - height - 4;
  const starts = [];
  for (let rot = 0; rot < 4; rot++) {
    const cells = rotation.cells(type, rot);
    const left = -Math.min(...cells.map(([x]) => x));
    const right = WIDTH - 1 - Math.max(...cells.map(([x]) => x));
    for (let x = left; x <= right; x++) starts.push({ x, y, rot });
  }
  return reachable(board, rotation, type, starts, { minY: y, half, budget }).placements;
};

// 한 수만 보고 고를 때는 줄이 지워지고 빈칸을 덮지 않는 배치가 자연스럽다.
const placementScore = ({ next, ev, swap, done }, height) => {
  if (done) return Infinity;
  let holes = 0;
  let roughness = 0;
  let previousHeight = 0;
  for (let x = 0; x < WIDTH; x++) {
    let columnHeight = 0;
    for (let y = HEIGHT - height; y < HEIGHT; y++) {
      if (next.cells[y * WIDTH + x]) columnHeight ||= HEIGHT - y;
      else if (columnHeight) holes++;
    }
    if (x > 0) roughness += Math.abs(previousHeight - columnHeight);
    previousHeight = columnHeight;
  }
  return 10 * ev.lines - 8 * holes - roughness - 2 * Number(swap);
};

const naturalChoices = (choices, height) => {
  const scores = choices.map(choice => placementScore(choice, height));
  const best = Math.max(...scores);
  return choices.filter((_, index) => scores[index] >= best - 2);
};

/**
 * 탐색 범위 안에서 첫 배치별로 완주 가능 여부를 센다. 어려움 후보는 180° 우회도 확인한다.
 * @param {import("./custom-puzzle.js").CustomPuzzle} puzzle
 * @param {boolean} [assessPlanning] 판 비우기 후보의 쉬운 우회 풀이도 확인할지
 */
export const analyzeDailyPuzzle = (puzzle, assessPlanning = false) => {
  const { pieces, goal } = puzzle;
  const opts = searchOptions(puzzle);
  const target = goalOf(goal.kind, pieces.length, goal.lines);
  const board = createBoard();
  board.cells = solverBoard(puzzle.cells);
  const height = opts.ceilingRows ?? usedHeight(puzzle.cells) + 1;
  const budget = { left: assessPlanning ? 400_000 : 220_000 };
  const memo = new Map();
  const quickMemo = new Map();

  const choices = (board, queue, hold, combo, total) => {
    const [current, ...rest] = queue;
    const orders = [{ type: current, queue: rest, hold, swap: false }];
    if (opts.hold && hold) orders.push({ type: hold, queue: rest, hold: current, swap: true });
    if (opts.hold && !hold && rest.length)
      orders.push({ type: rest[0], queue: rest.slice(1), hold: current, swap: true });
    const out = new Map();
    for (const order of orders) {
      const landings = assessPlanning
        ? compactPlacements(board, order.type, height, opts.allow180, budget)
        : placements(board, order.type, budget);
      for (const placement of landings) {
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

  const follow = (choice, quick = false) => {
    if (choice.done) return { path: [choice], depth: 1 };
    const order = choice.broken ? null : after(choice);
    if (!order) return { path: null, depth: 1 };
    const tail = search(choice.next, order.queue, order.hold, choice.ev.combo, choice.ev.total, quick);
    return { path: tail.path && [choice, ...tail.path], depth: 1 + tail.depth };
  };

  const search = (board, queue, hold, combo, total, quick) => {
    if (budget.left <= 0) return { path: null, depth: 0 };
    const key = [board.cells.slice((HEIGHT - height) * WIDTH).join(""), queue.join(""), hold, combo, total].join("/");
    const cache = quick ? quickMemo : memo;
    if (cache.has(key)) return cache.get(key);
    const remaining = queue.length + Number(Boolean(hold));
    // 어려움 후보는 틀린 첫 수 뒤에도 최소 두 수를 둘 수 있는지 확인한다.
    if (assessPlanning && (!quick || pieces.length - remaining >= 3) && !canClearColumns(board, remaining)) {
      const impossible = { path: null, depth: 0 };
      cache.set(key, impossible);
      return impossible;
    }
    let depth = 0;
    const options = choices(board, queue, hold, combo, total);
    for (const choice of quick ? naturalChoices(options, height) : options) {
      const result = follow(choice, quick);
      if (result.path) {
        cache.set(key, result);
        return result;
      }
      depth = Math.max(depth, result.depth);
      if (budget.left <= 0) break;
    }
    const failed = { path: null, depth };
    cache.set(key, failed);
    return failed;
  };

  const root = choices(board, [...pieces], "", -1, 0);
  let path = null;
  let wins = 0;
  let holdWins = 0;
  let deepestDeadEnd = 0;
  const natural = new Set(assessPlanning ? naturalChoices(root, height) : []);
  const naturalMisses = [];
  // 자연스럽게 좋아 보이는 수만으로도 끝나면 어려움 후보의 나머지 분기는 확인할 필요가 없다.
  const quickWin = budget.left > 0 && [...natural].some(choice => follow(choice, true).path);
  for (const choice of quickWin ? [] : root) {
    const result = follow(choice);
    if (result.path) {
      wins += 1;
      if (choice.swap) holdWins += 1;
      if (!path || result.path.length < path.length) path = result.path;
    } else {
      deepestDeadEnd = Math.max(deepestDeadEnd, result.depth);
      if (natural.has(choice)) naturalMisses.push(choice);
    }
    if (budget.left <= 0) break;
  }
  let naturalDeadEnd = quickWin ? 0 : Math.max(0, ...naturalMisses.map(choice => follow(choice, true).depth));
  // 첫 수가 쉬워 보여도 그다음 갈림길에서 당장 좋아 보이는 선택이 막힐 수 있다.
  if (assessPlanning && !quickWin && naturalDeadEnd < 3 && path?.length >= 5) {
    for (const move of path.slice(0, 2)) {
      const order = after(move);
      if (!order || budget.left <= 0) break;
      const options = choices(move.next, order.queue, order.hold, move.ev.combo, move.ev.total);
      for (const choice of naturalChoices(options, height)) {
        if (!follow(choice).path) naturalDeadEnd = Math.max(naturalDeadEnd, follow(choice, true).depth);
      }
      if (naturalDeadEnd >= 3) break;
    }
  }
  return {
    complete: !quickWin && budget.left > 0,
    naturalDeadEnd,
    quickWin,
    firstChoices: root.length,
    wins,
    holdWins,
    deepestDeadEnd: Math.max(deepestDeadEnd, naturalDeadEnd),
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

export const hasStraightClear = (puzzle, path) => {
  const board = createBoard();
  board.cells = solverBoard(puzzle.cells);
  for (const move of path.slice(0, -1)) {
    for (const [x, y] of move.cells) board.cells[y * WIDTH + x] = GARBAGE;
    clearLines(board);
  }
  const type = path.at(-1).type;
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

/** 대표 풀이에서 내리기 이후의 이동과 회전을 기록한다. 단순 하드 드롭의 낙하 거리는 제외한다. */
export const analyzeDailyControls = (puzzle, path) => {
  const board = createBoard();
  board.cells = solverBoard(puzzle.cells);
  const inputs = [];
  let lateMoves = 0;
  let lateTurns = 0;
  let maxManeuvers = 0;
  for (const move of path) {
    const steps = inputsForPlacement(board, rotation, move);
    if (!steps) return null;
    inputs.push(steps);
    const firstDrop = steps.indexOf("D");
    if (firstDrop >= 0) {
      let maneuvers = 0;
      // 같은 높이에서 같은 방향으로 여러 칸 가는 것은 이동 한 번으로 센다.
      for (let i = firstDrop + 1; i < steps.length; i++) {
        const step = steps[i];
        if ((step === "L" || step === "R") && step !== steps[i - 1]) {
          lateMoves++;
          maneuvers++;
        } else if (step === "CW" || step === "CCW") {
          lateTurns++;
          maneuvers++;
        }
      }
      maxManeuvers = Math.max(maxManeuvers, maneuvers);
    }
    for (const [x, y] of move.cells) board.cells[y * WIDTH + x] = GARBAGE;
    clearLines(board);
  }
  return { inputs, lateMoves, lateTurns, maxManeuvers };
};
