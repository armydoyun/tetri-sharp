import { HEIGHT, WIDTH, createBoard } from "../core/board.js";
import { GARBAGE, PIECE_TYPES } from "../core/pieces.js";
import { createRng } from "../core/rng.js";
import { DEFAULT_RULES, encodePuzzle, PUZZLE_CELLS } from "./custom-puzzle.js";
import { dailyPuzzleSeed } from "./daily-puzzle.js";
import { buildPcExact, buildQuadExact, buildTsd, buildTst } from "./practice.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { analyzeDailyControls, analyzeDailyPuzzle, hasStraightClear } from "./daily-puzzle-analysis.js";
import { comparePuzzleFingerprints, puzzleFingerprint, rateDailyPuzzle } from "./daily-puzzle-variety.js";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 10, 26);
const MAX_ATTEMPTS = 24;
const CHALLENGE_START = Date.UTC(2026, 10, 29);
const CHALLENGE_ATTEMPTS = 16;
const VARIETY_START = Date.UTC(2026, 10, 27);
// 같은 유형이 다섯 번 돌아오는 구간만 살펴보므로, 먼 미래의 날짜도 그 기간만 계산하면 된다.
const VARIETY_WEEKS = 5;
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

const challenge = (rng, recipe) => {
  const puzzle = pc(rng, 5 + rng.int(2), recipe === 1, 4);
  if (!puzzle || recipe !== 2) return puzzle;
  const [first, second, ...rest] = puzzle.pieces;
  return { ...puzzle, pieces: [second, first, ...rest].join(""), rules: { ...DEFAULT_RULES, hold: { enabled: true } } };
};

const quad = rng => {
  const board = createBoard();
  const front = Array.from({ length: 2 + rng.int(2) }, () => pick(rng, ["J", "L", "O", "S", "T", "Z"]));
  if (!buildQuadExact(board, front, rng, rng.int(WIDTH))) return null;
  return complete(board, [...front, "I"].join(""), "quad");
};

const combo = (rng, varied = false) => {
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
  if (varied) {
    const variant = rng.int(3);
    if (variant === 1) {
      // 아래쪽 개구부가 한 칸 꺾인 콤보. 지우는 순서에 따라 다음 피스가 들어가는 쪽이 달라진다.
      const side = well === 0 ? 1 : well === WIDTH - 4 ? -1 : rng.int(2) ? 1 : -1;
      const row = HEIGHT - 3;
      for (let x = 0; x < WIDTH; x++)
        board.cells[row * WIDTH + x] = x >= well + side && x < well + side + 4 ? 0 : GARBAGE;
    } else if (variant === 2) {
      // 위에 남겨 둔 받침을 어느 줄과 함께 내릴지 결정하는 콤보.
      const side = rng.int(2) ? well : well + 3;
      board.cells[(HEIGHT - 3) * WIDTH + side] = GARBAGE;
      board.cells[(HEIGHT - 4) * WIDTH + side] = GARBAGE;
    }
  }
  const order = Array.from({ length: count }, () => pick(rng, PIECE_TYPES));
  return complete(board, order.join(""), "combo");
};

const removePiece = (board, type, rng) => {
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
  if (!candidates.length) return false;
  for (const [x, y] of pick(rng, candidates)) board.cells[y * WIDTH + x] = 0;
  return true;
};

// 완성된 T스핀 지형에서 다른 피스가 먼저 채울 자리를 뺀다.
const spinSetup = rng => {
  const board = createBoard();
  const triple = rng.int(3) === 0;
  const side = rng.int(2) === 0;
  if (triple) buildTst(board, (side ? 1 : 2) + rng.int(7), side);
  else buildTsd(board, rng.int(WIDTH - 2), side);
  const type = pick(rng, ["I", "J", "L", "O", "T"]);
  if (!removePiece(board, type, rng)) return null;
  return complete(board, type + "T", triple ? "tst" : "tsd");
};

const tuck = (rng, varied = false) => {
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
  if (varied && rng.int(3) !== 0) {
    const prep = pick(rng, PIECE_TYPES);
    if (removePiece(board, prep, rng)) return complete(board, prep + type, "lines");
  }
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
  spin: { make: spinSetup, accepts: stats => stats.path.length === 2 },
  tuck: {
    make: tuck,
    accepts: (stats, puzzle) => stats.path.at(-1).lines === 2 && !hasStraightClear(puzzle, stats.path),
  },
};
const WEEK = ["fill", "combo", "hold", "tuck", "quad", "spin", "trap"];

export const dayKey = day => new Date(day).toISOString().slice(0, 10);

const assessed = (puzzle, stats) => {
  const controls = analyzeDailyControls(puzzle, stats.path);
  return { controls, ...rateDailyPuzzle({ stats, controls }) };
};

const generateFor = (date, recent, varied) => {
  const key = dayKey(date);
  const offset = Math.round((date - EPOCH) / DAY);
  const planned = WEEK[((offset % WEEK.length) + WEEK.length) % WEEK.length];
  const seed = dailyPuzzleSeed(key);
  const rng = createRng(seed);
  const advanced = date >= CHALLENGE_START && planned === "trap";
  const recipeOffset = Math.floor((date - CHALLENGE_START) / (WEEK.length * DAY));
  const passes = advanced ? ["challenge", planned, "fill"] : [planned, "fill"];
  for (const [passIndex, pass] of passes.entries()) {
    const hard = pass === "challenge";
    const family = hard ? "trap" : pass;
    const attempts = hard ? CHALLENGE_ATTEMPTS : MAX_ATTEMPTS;
    const candidateRng = hard ? createRng(dailyPuzzleSeed(`challenge:${key}`)) : rng;
    let nearest = null;
    let bestPenalty = Infinity;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      // 같은 조합에 막히면 다른 홀드 조건으로 넘어가고, 기준을 만족하는 판만 어려움으로 내보낸다.
      const recipe = (recipeOffset + Math.floor((attempt - 1) / 6)) % 3;
      const puzzle = hard
        ? challenge(candidateRng, recipe)
        : passIndex === passes.length - 1 && attempt === attempts
          ? fallback(candidateRng)
          : FAMILIES[family].make(candidateRng, varied);
      if (!puzzle) continue;
      const stats = analyzeDailyPuzzle(puzzle, hard);
      if (!stats.complete || !stats.path || (!hard && !FAMILIES[family].accepts(stats, puzzle))) continue;
      const rating = assessed(puzzle, stats);
      if (
        hard &&
        (!rating.controls ||
          rating.level !== 3 ||
          (recipe === 1 && stats.holdWins !== stats.wins) ||
          (recipe === 2 && !stats.path.some(move => move.hold)))
      )
        continue;
      const code = encodePuzzle({ ...puzzle, title: key });
      if (!code) continue;
      const result = { key, seed, family, planned, attempt, ...puzzle, stats, code, ...rating };
      if (!recent.length) return result;
      const fingerprint = puzzleFingerprint(result);
      const penalty = recent.reduce((score, other) => {
        const { sameBoard, nearBoard, sameRoute } = comparePuzzleFingerprints(fingerprint, other);
        return score + (sameBoard ? 12 : nearBoard ? 4 : 0) + (sameRoute ? 6 : 0);
      }, 0);
      if (penalty === 0) return result;
      if (penalty < bestPenalty) {
        nearest = result;
        bestPenalty = penalty;
      }
    }
    if (nearest) return nearest;
  }
  throw new Error(`오늘의 퍼즐 생성 실패 (${key})`);
};

/** 캐시는 같은 구간을 뽑을 때 계산을 줄인다. 선택은 날과 직전 같은 유형으로만 정해진다. */
const generateWith = (date, cache) => {
  if (cache.has(date)) return cache.get(date);
  const varied = date >= VARIETY_START;
  const recent = [];
  if (varied) {
    const week = Math.floor((date - VARIETY_START) / (WEEK.length * DAY));
    const weeksBack = week % VARIETY_WEEKS;
    for (let n = weeksBack; n >= 1; n--) {
      recent.push(puzzleFingerprint(generateWith(date - n * WEEK.length * DAY, cache)));
    }
  }
  const selected = generateFor(date, recent, varied);
  const result = selected.controls ? selected : { ...selected, ...assessed(selected, selected.stats) };
  cache.set(date, result);
  return result;
};

const recentDays = new Map();
export const generateDay = key => {
  const day = generateWith(Date.parse(key), recentDays);
  // 지난 퍼즐을 둘러볼 때 앞 주의 후보를 다시 만들지 않는다. 오래 떨어진 날짜는 제한한다.
  while (recentDays.size > 64) recentDays.delete(recentDays.keys().next().value);
  return day;
};

export const SAMPLE_START = "2026-11-26";
export const generateSample = (start = SAMPLE_START, count = 90) => {
  const cache = new Map();
  return Array.from({ length: count }, (_, i) => generateWith(Date.parse(start) + i * DAY, cache));
};
