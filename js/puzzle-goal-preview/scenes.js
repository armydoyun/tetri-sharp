import { HEIGHT, WIDTH } from "../core/board.js";
import { BTN, createGame } from "../core/engine.js";
import { goalOf } from "../modes/puzzle-goals.js";
import { MODERN } from "../rules/presets.js";

export const BOARD_ROWS = 7;
export const BOARD_TOP = HEIGHT - BOARD_ROWS;

const start = (rows, sequence) => {
  const game = createGame({
    rules: { ...MODERN, gravity: 0 },
    handling: { das: 8, arr: 0.6, sdf: Infinity },
    mode: {
      sequence,
      setup({ board }) {
        board.cells.set(
          rows.flatMap(row => [...row].map(value => Number(value) || 0)),
          (HEIGHT - rows.length) * WIDTH
        );
      },
    },
  });
  game.step();
  return game;
};

const tap = (game, pressed) => game.step({ pressed });

const snapshot = (game, done = false) => {
  const { board, active, stats } = game.state;
  const cells = board.cells.slice(BOARD_TOP * WIDTH);
  const ghost = done || !active ? [] : game.activeCells().map(([x, y]) => [x, y + game.ghostY() - active.y]);
  return {
    cells,
    active: done ? [] : game.activeCells(),
    piece: active?.type,
    ghost,
    lines: stats.lines,
    remaining: Array.from({ length: BOARD_ROWS }, (_, row) => row).filter(row =>
      cells.subarray(row * WIDTH, (row + 1) * WIDTH).some(Boolean)
    ).length,
    done,
  };
};

const lock = game => tap(game, BTN.HARD).find(event => event.type === "lock");

const twoDrops = (game, kind) => {
  const first = snapshot(game);
  lock(game);
  const middle = snapshot(game);
  const event = lock(game);
  const complete = goalOf(kind, 2, 2).goal({ ...event, total: game.state.stats.lines });
  return [first, middle, snapshot(game, complete)];
};

const tSpin = () => {
  const game = start(["11....2277", "1112...277", "11888.8877"], ["T", "I"]);
  tap(game, BTN.RIGHT);
  const first = snapshot(game);
  tap(game, BTN.CCW);
  game.step({ held: BTN.SOFT });
  const middle = snapshot(game);
  tap(game, BTN.CCW);
  return [first, middle, snapshot(game, goalOf("tsd", 1).goal(lock(game)))];
};

export const puzzleGoalFrames = () => ({
  lines: twoDrops(start(["1.........", "222....777", "111....666"], ["I"]), "lines"),
  tsd: tSpin(),
  pc: twoDrops(start(["333....777", "2244..5566", "2244..5566"], ["I", "O"]), "pc"),
});
