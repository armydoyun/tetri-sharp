import { WIDTH } from "../core/board.js";
import { createBoardGrid } from "./board-grid.js";

/** 게임 보드의 아래 일곱 줄. 셀 값은 게임의 팔레트 번호를 쓴다. */
export const createDailyPuzzleBoard = (/** @type {HTMLCanvasElement} */ canvas) => {
  const rows = 7;
  const cell = Math.round(32 * (globalThis.devicePixelRatio || 1));
  canvas.width = WIDTH * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  const grid = createBoardGrid(0, 0, WIDTH, rows, cell);
  return (cells, theme, palette = theme.palette, showGrid = true) => {
    if (!ctx) return;
    grid(ctx, theme, showGrid);
    const start = cells.length - WIDTH * rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const value = cells[start + y * WIDTH + x];
        if (value) theme.block(ctx, x * cell, y * cell, cell, palette[value]);
      }
    }
  };
};
