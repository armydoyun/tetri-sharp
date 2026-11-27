import { CELL_ID } from "../core/pieces.js";

/** @typedef {readonly [finish: keyof typeof FINISHES, width: number, tint: "edge" | "ink" | "piece"]} SpinStroke */

const FINISHES = {
  matte: { dash: [], cap: "round" },
  paper: { dash: [0.56, 0.04, 0.12, 0.045], cap: "butt", rim: -0.074 },
  ruler: { dash: [0.47, 0.09, 0.12, 0.09], cap: "butt" },
  double: { dash: [], cap: "butt", rim: 0.12 },
  grain: { dash: [0.13, 0.095, 0.062, 0.07], cap: "round" },
  brush: { dash: [], cap: "round", rim: -0.075 },
  thread: { dash: [0.19, 0.095], cap: "round" },
  perforated: { dash: [0.24, 0.145], cap: "butt" },
};

/** @type {Record<string, SpinStroke>} */
const STROKES = {
  modern: ["matte", 0.12, "edge"],
  retro: ["paper", 0.109, "edge"],
  minimal: ["ruler", 0.108, "edge"],
  graphite: ["matte", 0.095, "ink"],
  frame: ["double", 0.097, "edge"],
  stone: ["grain", 0.103, "edge"],
  midnight: ["double", 0.104, "piece"],
  forest: ["brush", 0.14, "edge"],
  white: ["matte", 0.109, "edge"],
  sharp: ["ruler", 0.123, "edge"],
  porcelain: ["double", 0.102, "edge"],
  relay: ["thread", 0.13, "edge"],
  tide: ["double", 0.11, "ink"],
  velvet: ["brush", 0.15, "piece"],
  press: ["paper", 0.146, "edge"],
  film: ["perforated", 0.135, "edge"],
  post: ["thread", 0.109, "edge"],
  carbon: ["ruler", 0.095, "ink"],
  chestnut: ["grain", 0.13, "edge"],
  whiteNight: ["matte", 0.105, "edge"],
  ink: ["brush", 0.16, "edge"],
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{themeId: string, theme: any, left: number, right: number, rows: number,
 *   x: number, y: number, direction: -1 | 1, age: number, reduced: boolean, duration: number, growth: number}} options
 */
export const drawTSpin = (
  ctx,
  { themeId, theme, left, right, rows, x, y, direction, age, reduced, duration, growth }
) => {
  if (age < 0 || age >= duration) return;

  // 첫 견본의 반경과 각도를 재현한다. 테마별 설정은 획에만 적용한다.
  const travel = Math.min(1, age / (duration * 0.64));
  const p = reduced ? 1 : 1 - (1 - travel) ** 2;
  const radius = 0.65 + p * growth;
  const span = Math.PI * (0.36 + p * 0.84);
  const alpha = reduced ? 0.76 : (1 - age / duration) ** 0.8;
  const [finish, width, tint] = STROKES[themeId] ?? STROKES.modern;
  const { dash, cap, rim } = FINISHES[finish];
  const sweep = theme.motion.clearSweep;
  const ink = theme.board.ink;
  const color = tint === "piece" ? theme.palette[CELL_ID.T] : (sweep?.[tint] ?? ink);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, right - left, rows);
  ctx.clip();
  ctx.translate(left + x, y);
  ctx.scale(-direction, 1);
  ctx.strokeStyle = color;
  ctx.lineCap = /** @type {CanvasLineCap} */ (cap);
  ctx.setLineDash(dash);

  const strokeArc = (distance, weight, opacity) => {
    ctx.globalAlpha = opacity;
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.arc(0, 0, distance, -0.25, -0.25 - span, true);
    ctx.stroke();
  };
  if (rim) strokeArc(radius + rim, width * 0.58, alpha * 0.38);
  strokeArc(radius, width, alpha);
  ctx.restore();
};
