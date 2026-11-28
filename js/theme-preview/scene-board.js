import { CELL_ID } from "../core/pieces.js";
import { COLS, ROWS } from "../render/preview-scene.js";
import srs from "../rules/rotation/srs.js";

/** @typedef {import("../core/pieces.js").PieceType} PieceType */

export const boardFromRows = rows =>
  Array.from({ length: ROWS - rows.length }, () => Array(COLS).fill(0)).concat(
    rows.map(row => [...row].map(value => Number(value) || 0))
  );

export const pieceCells = (/** @type {PieceType} */ type, rot, x, y) =>
  srs.cells(type, rot).map(([dx, dy]) => [x + dx, y + dy]);

/** @param {PieceType} type */
export const active = (type, cells, ghost = []) => ({ type, cells, ghost, down: 0 });

export const finishPiece = (board, /** @type {PieceType} */ type, cells, tspin = "none") => {
  const landed = board.map(row => [...row]);
  for (const [x, y] of cells) landed[y][x] = CELL_ID[type];
  const rows = landed.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
  const after = [...rows.map(() => Array(COLS).fill(0)), ...landed.filter((_, y) => !rows.includes(y))];
  return {
    landed,
    rows,
    after,
    event: { type: "lock", piece: type, rows, cells, lines: rows.length, tspin },
  };
};
