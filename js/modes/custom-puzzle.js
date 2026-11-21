import { VISIBLE_ROWS, WIDTH } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { makePuzzleMode } from "./puzzles.js";

export const PUZZLE_CELLS = WIDTH * VISIBLE_ROWS;
export const MAX_PUZZLE_PIECES = 6;

/** @typedef {{ cells: Uint8Array, pieces: string }} CustomPuzzle */

/** @param {CustomPuzzle} puzzle */
export const encodePuzzle = ({ cells, pieces }) => {
  if (
    cells.length !== PUZZLE_CELLS ||
    !cells.some(Boolean) ||
    cells.some(value => value > 1) ||
    !pieces.length ||
    /[^IJLOSTZ]/.test(pieces) ||
    pieces.length > MAX_PUZZLE_PIECES
  )
    return null;

  let board = "";
  for (let i = 0; i < cells.length; i += 4) {
    board += (cells[i] * 8 + cells[i + 1] * 4 + cells[i + 2] * 2 + cells[i + 3]).toString(16);
  }
  return `1.${board}.${pieces}`;
};

export const decodePuzzle = code => {
  if (typeof code !== "string" || code.length > PUZZLE_CELLS / 4 + MAX_PUZZLE_PIECES + 3) return null;
  const [version, board, pieces, extra] = code.split(".");
  if (version !== "1" || extra !== undefined || board?.length !== PUZZLE_CELLS / 4 || /[^0-9a-f]/.test(board))
    return null;
  const cells = Uint8Array.from(
    board.split("").flatMap(digit => {
      const value = Number.parseInt(digit, 16);
      return [3, 2, 1, 0].map(bit => (value >> bit) & 1);
    })
  );
  const puzzle = { cells, pieces: pieces ?? "" };
  return encodePuzzle(puzzle) ? puzzle : null;
};

const RULES = Object.freeze({ ...MODERN, hold: Object.freeze({ enabled: false }) });

/** @param {CustomPuzzle} puzzle */
export const customPuzzleMode = ({ cells, pieces }) => {
  const puzzle = {
    kind: "pc",
    pieces: [...pieces],
    build: board =>
      board.cells.set(
        cells.map(value => value * GARBAGE),
        board.cells.length - PUZZLE_CELLS
      ),
    goal: event => event.perfect,
  };
  return makePuzzleMode(puzzle, RULES);
};
