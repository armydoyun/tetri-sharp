import { WIDTH } from "../core/board.js";
import { createBoardGrid } from "./board-grid.js";

/** 보드 아래쪽 미리보기. 셀 값은 게임의 팔레트 번호를 쓴다. */
export const createDailyPuzzleBoard = (/** @type {HTMLCanvasElement} */ canvas, rows = 7) => {
  const cell = Math.round(32 * (globalThis.devicePixelRatio || 1));
  canvas.width = WIDTH * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  const grid = createBoardGrid(0, 0, WIDTH, rows, cell);
  /** @param {{ cells: [number, number][], color: string }} [landing] */
  return (cells, theme, palette = theme.palette, showGrid = true, landing) => {
    if (!ctx) return;
    grid(ctx, theme, showGrid);
    const start = cells.length - WIDTH * rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const value = cells[start + y * WIDTH + x];
        if (value) theme.block(ctx, x * cell, y * cell, cell, palette[value]);
      }
    }
    if (landing) {
      const top = start / WIDTH;
      for (const [x, y] of landing.cells)
        if (y >= top && y < top + rows) theme.ghost(ctx, x * cell, (y - top) * cell, cell, landing.color, "strong");
    }
  };
};
