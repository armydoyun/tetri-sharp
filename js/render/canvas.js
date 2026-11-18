// 보드 렌더러. 코어 상태를 읽어서 그리기만 한다(상태를 바꾸지 않는다).
import { VISIBLE_ROWS, get } from "../core/board.js";

const COLOR_VARS = [
  "",
  "--piece-i",
  "--piece-j",
  "--piece-l",
  "--piece-o",
  "--piece-s",
  "--piece-t",
  "--piece-z",
  "--piece-garbage",
];

/**
 * @param {HTMLCanvasElement} canvas
 */
export const createRenderer = canvas => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const css = getComputedStyle(document.documentElement);
  const palette = COLOR_VARS.map(name => (name ? css.getPropertyValue(name).trim() : ""));
  const gridColor = css.getPropertyValue("--grid").trim();
  const bgColor = css.getPropertyValue("--surface").trim();

  /** CSS 크기 × devicePixelRatio로 캔버스 해상도를 맞추고 셀 크기를 정수로 스냅한다. */
  const fit = (cols, rows) => {
    const dpr = window.devicePixelRatio || 1;
    const cell = Math.max(8, Math.floor(30 * dpr));
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    return cell;
  };

  /** @param {import("../core/board.js").Board} board */
  const draw = board => {
    const cell = fit(board.width, VISIBLE_ROWS);
    const top = board.height - VISIBLE_ROWS;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < board.width; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, canvas.height);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(canvas.width, y * cell + 0.5);
    }
    ctx.stroke();

    for (let y = 0; y < VISIBLE_ROWS; y++) {
      for (let x = 0; x < board.width; x++) {
        const v = get(board, x, top + y);
        if (!v) continue;
        ctx.fillStyle = palette[v];
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      }
    }
  };

  return { draw };
};
