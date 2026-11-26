import { CELL_ID } from "../core/pieces.js";

/** @typedef {readonly [reveal: keyof typeof REVEAL, finish: keyof typeof DASHES, weight: number,
 *   span: number, curve: number, ms: number, tint: "sweep" | "ink" | "piece"]} SpinStroke */

// 같은 짧은 호 안에서 획이 닿는 순서만 바꾼다. 반환값은 호 위의 시작·끝 비율.
const REVEAL = {
  trace: (reach, fade) => [0.28 * fade, reach],
  open: (reach, fade) => [0.5 - 0.5 * reach + 0.19 * fade, 0.5 + 0.5 * reach - 0.19 * fade],
  contact: (_reach, fade) => [0.1 + 0.24 * fade, 0.9 - 0.24 * fade],
  slip: (reach, fade) => [0.34 * reach, 0.38 + 0.62 * reach - 0.14 * fade],
};

const DASHES = {
  solid: [],
  grain: [0.035, 0.055],
  paper: [0.24, 0.045, 0.064, 0.038],
  ruler: [0.22, 0.086, 0.055, 0.086],
  stitch: [0.11, 0.068],
  film: [0.15, 0.1],
};

/** @type {Record<string, SpinStroke>} */
const STROKES = {
  modern: ["open", "solid", 0.066, 1.16, 0.91, 225, "sweep"],
  retro: ["slip", "paper", 0.058, 1.26, 0.68, 205, "ink"],
  minimal: ["trace", "ruler", 0.053, 1.4, 1, 245, "sweep"],
  graphite: ["contact", "solid", 0.043, 0.94, 0.76, 180, "ink"],
  frame: ["open", "ruler", 0.061, 1.28, 0.81, 220, "piece"],
  stone: ["slip", "grain", 0.08, 1.32, 0.84, 240, "sweep"],
  midnight: ["trace", "solid", 0.05, 1.42, 1.06, 270, "piece"],
  forest: ["open", "paper", 0.082, 1.33, 0.82, 255, "sweep"],
  white: ["contact", "solid", 0.049, 1.08, 0.72, 195, "ink"],
  sharp: ["contact", "ruler", 0.07, 1.22, 0.85, 215, "sweep"],
  porcelain: ["trace", "solid", 0.048, 1.35, 1, 245, "sweep"],
  relay: ["contact", "stitch", 0.082, 1.32, 0.74, 210, "ink"],
  tide: ["slip", "solid", 0.07, 1.46, 0.77, 265, "sweep"],
  velvet: ["open", "solid", 0.092, 1.31, 0.92, 255, "piece"],
  press: ["contact", "paper", 0.09, 1.15, 0.71, 190, "ink"],
  film: ["slip", "film", 0.064, 1.37, 0.88, 225, "sweep"],
  post: ["trace", "stitch", 0.065, 1.23, 1, 240, "sweep"],
  carbon: ["trace", "ruler", 0.041, 1.22, 0.83, 205, "ink"],
  chestnut: ["open", "grain", 0.089, 1.19, 0.82, 240, "sweep"],
  whiteNight: ["slip", "solid", 0.051, 1.39, 1.02, 255, "ink"],
  ink: ["trace", "paper", 0.1, 1.45, 0.8, 275, "sweep"],
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{themeId: string, theme: any, left: number, right: number, rows: number,
 *   x: number, y: number, direction: -1 | 1, age: number, reduced: boolean}} options
 */
export const drawTSpin = (ctx, { themeId, theme, left, right, rows, x, y, direction, age, reduced }) => {
  const [reveal, finish, weight, span, curve, ms, tint] = STROKES[themeId] ?? STROKES.modern;
  if (age < 0 || age >= ms) return;
  const p = age / ms;
  const reach = reduced ? 1 : 0.38 + 0.62 * (1 - (1 - Math.min(1, p * 2.8)) ** 2);
  const fade = reduced ? 0 : Math.max(0, (p - 0.38) / 0.62);
  const [from, to] = REVEAL[reveal](reach, fade);
  const at = ratio => -Math.PI / 2 + (0.5 - ratio) * span;
  const { ink } = theme.board;
  const color =
    tint === "piece" ? theme.palette[CELL_ID.T] : tint === "sweep" ? (theme.motion.clearSweep?.edge ?? ink) : ink;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, right - left, rows);
  ctx.clip();
  ctx.translate(left + x, y);
  ctx.scale(-direction, 1);
  ctx.strokeStyle = color;
  ctx.globalAlpha = reduced ? 0.61 : 0.72 * (1 - fade) ** 1.5;
  ctx.lineWidth = weight;
  ctx.lineCap = finish === "grain" ? "round" : "butt";
  ctx.setLineDash(DASHES[finish]);
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.06, curve, 0, at(from), at(to), true);
  ctx.stroke();
  ctx.restore();
};
