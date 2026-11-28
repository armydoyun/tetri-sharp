// 보드: 폭 10 × 높이 40(위 20줄은 스폰·버퍼). 화면에는 아래 VISIBLE_ROWS줄만 보인다.
// 좌표: x는 왼→오, y는 위→아래(0이 맨 위 버퍼). 미노 모양 좌표와 같은 방향이라 변환이 없다.

export const WIDTH = 10;
export const HEIGHT = 40;
export const VISIBLE_ROWS = 20;

/** @typedef {{ width: number, height: number, cells: Uint8Array }} Board */

/** @returns {Board} */
export const createBoard = (width = WIDTH, height = HEIGHT) => ({
  width,
  height,
  cells: new Uint8Array(width * height),
});

/** @param {Board} b */
export const inBounds = (b, x, y) => x >= 0 && x < b.width && y >= 0 && y < b.height;

/** @param {Board} b */
export const get = (b, x, y) => b.cells[y * b.width + x];

/** @param {Board} b */
export const set = (b, x, y, v) => {
  b.cells[y * b.width + x] = v;
};

/**
 * 모양(cells)을 (ox, oy)에 놓았을 때 벽·바닥·다른 블록과 겹치는가.
 * @param {Board} b
 * @param {ReadonlyArray<readonly [number, number]>} cells
 */
export const collides = (b, cells, ox, oy) =>
  cells.some(([cx, cy]) => {
    const x = ox + cx;
    const y = oy + cy;
    return !inBounds(b, x, y) || get(b, x, y) !== 0;
  });

/**
 * 모양을 보드에 새긴다.
 * @param {Board} b
 * @param {ReadonlyArray<readonly [number, number]>} cells
 */
export const place = (b, cells, ox, oy, value) => {
  for (const [cx, cy] of cells) set(b, ox + cx, oy + cy, value);
};

/** @param {Board} b */
const isRowFull = (b, y) => {
  for (let x = 0; x < b.width; x++) if (get(b, x, y) === 0) return false;
  return true;
};

/**
 * 꽉 찬 줄을 지우고 위의 줄을 내린다.
 * @param {Board} b
 * @param {(y: number, cells: Uint8Array) => void} [onClear] 삭제 직전의 줄 색을 받는다.
 * @returns {number[]} 지운 줄의 y(지우기 전 기준, 위→아래 순)
 */
export const clearLines = (b, onClear) => {
  const full = [];
  for (let y = 0; y < b.height; y++) if (isRowFull(b, y)) full.push(y);
  for (const y of full) {
    onClear?.(y, b.cells.slice(y * b.width, (y + 1) * b.width));
    // y 위의 모든 줄을 한 칸씩 내린다.
    b.cells.copyWithin(b.width, 0, y * b.width);
    b.cells.fill(0, 0, b.width);
  }
  return full;
};

/** @param {Board} b */
export const isEmpty = b => b.cells.every(v => v === 0);
