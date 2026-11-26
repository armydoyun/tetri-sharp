import { HEIGHT, WIDTH, createBoard } from "../core/board.js";
import { GARBAGE, PIECE_TYPES } from "../core/pieces.js";
import { createRng } from "../core/rng.js";
import { DEFAULT_RULES, encodePuzzle, PUZZLE_CELLS } from "./custom-puzzle.js";
import { dailyPuzzleSeed } from "./daily-puzzle.js";
import { buildPcExact, buildQuadExact, buildTsd, buildTst } from "./practice.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { analyzeDailyPuzzle, hasStraightClear } from "./daily-puzzle-analysis.js";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 10, 26);
const MAX_ATTEMPTS = 24;
const pick = (rng, values) => values[rng.int(values.length)];

const complete = (board, pieces, kind, hold = false) => ({
  cells: board.cells.slice(-PUZZLE_CELLS).map(Boolean),
  pieces,
  goal: { kind, lines: kind === "lines" ? 2 : 0 },
  rules: hold ? { ...DEFAULT_RULES, hold: { enabled: true } } : DEFAULT_RULES,
});

const pc = (rng, count, hold = false, rows = 2) => {
  const board = createBoard();
  const order = Array.from({ length: count }, () => pick(rng, PIECE_TYPES));
  if (!buildPcExact(board, order, rng, rows)) return null;
  for (let y = HEIGHT - rows; y < HEIGHT; y++) {
    if (board.cells.subarray(y * WIDTH, (y + 1) * WIDTH).every(Boolean)) return null;
  }
  // 홀드 퍼즐은 정답 순서 앞에 함께 놓으면 판을 비울 수 없는 유인 피스를 붙인다.
  const decoys = PIECE_TYPES.filter(type => !order.includes(type));
  const pieces = hold ? [pick(rng, decoys), ...order] : order;
  return complete(board, pieces.join(""), "pc", hold);
};

const quad = rng => {
  const board = createBoard();
  const front = Array.from({ length: 2 + rng.int(2) }, () => pick(rng, ["J", "L", "O", "S", "T", "Z"]));
  if (!buildQuadExact(board, front, rng, rng.int(WIDTH))) return null;
  return complete(board, [...front, "I"].join(""), "quad");
};

const combo = rng => {
  const board = createBoard();
  const count = 3 + rng.int(2);
  const well = rng.int(WIDTH - 3);
  const gap = rng.int(4);
  const notch = rng.int(4);
  for (let y = HEIGHT - count - 1; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const inside = x >= well && x < well + 4;
      if (!inside || (y === HEIGHT - 1 && x !== well + gap)) board.cells[y * WIDTH + x] = GARBAGE;
    }
  }
  if (rng.int(3) !== 0) board.cells[(HEIGHT - 2) * WIDTH + well + notch] = GARBAGE;
  const order = Array.from({ length: count }, () => pick(rng, PIECE_TYPES));
  return complete(board, order.join(""), "combo");
};

// 완성된 T스핀 지형에서 다른 피스가 먼저 채울 자리를 뺀다.
const spinSetup = rng => {
  const board = createBoard();
  const triple = rng.int(3) === 0;
  const side = rng.int(2) === 0;
  if (triple) buildTst(board, (side ? 1 : 2) + rng.int(7), side);
  else buildTsd(board, rng.int(WIDTH - 2), side);
  const type = pick(rng, ["I", "J", "L", "O", "T"]);
  const candidates = [];
  for (let rot = 0; rot < 4; rot++) {
    for (let y = HEIGHT - 6; y < HEIGHT; y++) {
      for (let x = -2; x < WIDTH; x++) {
        const cells = ROTATIONS.srs.cells(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
        if (cells.every(([x, y]) => x >= 0 && x < WIDTH && y < HEIGHT && board.cells[y * WIDTH + x]))
          candidates.push(cells);
      }
    }
  }
  if (!candidates.length) return null;
  for (const [x, y] of pick(rng, candidates)) board.cells[y * WIDTH + x] = 0;
  return complete(board, type + "T", triple ? "tst" : "tsd");
};

const tuck = rng => {
  const board = createBoard();
  const type = pick(rng, ["I", "J", "L", "O", "S", "T", "Z"]);
  const shape = ROTATIONS.srs.cells(type, rng.int(4));
  const minX = Math.min(...shape.map(([x]) => x));
  const minY = Math.min(...shape.map(([, y]) => y));
  const w = Math.max(...shape.map(([x]) => x)) - minX + 1;
  const h = Math.max(...shape.map(([, y]) => y)) - minY + 1;
  if (h > 2) return null;
  const column = rng.int(WIDTH - w + 1);
  board.cells.fill(GARBAGE, (HEIGHT - 2) * WIDTH);
  for (const [x, y] of shape) board.cells[(HEIGHT - h + y - minY) * WIDTH + column + x - minX] = 0;
  const roofY = HEIGHT - 3 - rng.int(2);
  const edge = rng.int(2) === 0 ? column : column + w - 1;
  board.cells[roofY * WIDTH + edge] = GARBAGE;
  board.cells[roofY * WIDTH + (edge > 0 ? edge - 1 : edge + 1)] = GARBAGE;
  return complete(board, type, "lines");
};

// 후보 탐색을 다 써도 날짜의 판은 항상 생성되도록 하는 절차형 입문 문제.
const fallback = rng => {
  const board = createBoard();
  buildPcExact(board, ["O"], rng);
  return complete(board, "O", "pc");
};

const FAMILIES = {
  fill: {
    make: rng => pc(rng, 1 + rng.int(2), false, 2 + rng.int(2)),
    accepts: stats => stats.path.length <= 2,
  },
  trap: {
    make: rng => pc(rng, 4, false, 2 + rng.int(2)),
    accepts: stats => stats.wins <= 3 && stats.deepestDeadEnd >= 3,
  },
  hold: {
    make: rng => pc(rng, 2 + rng.int(2), true),
    accepts: stats => stats.holdWins === stats.wins,
  },
  quad: { make: quad, accepts: stats => stats.path.length >= 3 },
  combo: { make: combo, accepts: stats => stats.wins <= 4 },
  spin: { level: 3, make: spinSetup, accepts: stats => stats.path.length === 2 },
  tuck: { make: tuck, accepts: (_, puzzle) => !hasStraightClear(puzzle) },
};
const WEEK = ["fill", "combo", "hold", "tuck", "quad", "spin", "trap"];

export const dayKey = day => new Date(day).toISOString().slice(0, 10);

/** 새 날짜도 손으로 판을 추가할 필요 없이 동일한 생성 경로를 쓴다. */
export const generateDay = key => {
  const index = Math.round((Date.parse(key) - EPOCH) / DAY);
  const planned = WEEK[((index % WEEK.length) + WEEK.length) % WEEK.length];
  const seed = dailyPuzzleSeed(key);
  const rng = createRng(seed);
  for (const [pass, family] of [planned, "fill"].entries()) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const puzzle = pass === 1 && attempt === MAX_ATTEMPTS ? fallback(rng) : FAMILIES[family].make(rng);
      if (!puzzle) continue;
      const stats = analyzeDailyPuzzle(puzzle);
      if (!stats.complete || !stats.path || !FAMILIES[family].accepts(stats, puzzle)) continue;
      const code = encodePuzzle({ ...puzzle, title: key });
      if (code) return { key, seed, family, planned, attempt, ...puzzle, stats, code };
    }
  }
  throw new Error(`오늘의 퍼즐 생성 실패 (${key})`);
};

export const SAMPLE_START = "2026-11-26";
export const generateSample = (start = SAMPLE_START, count = 90) =>
  Array.from({ length: count }, (_, i) => generateDay(dayKey(Date.parse(start) + i * DAY)));
