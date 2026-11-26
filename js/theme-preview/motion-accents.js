import { CELL_ID } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { ROWS } from "../render/preview-scene.js";
import { drawTSpin } from "./tspin-effects.js";

/** @typedef {readonly [finish: string, weight: number, ms: number]} Material */
// 보드와 삭제 연출에서 가져온 잉크색 위에 테마별로 굵기·획·감쇠를 더한다.
/** @type {Record<string, Material>} */
const MATERIALS = {
  modern: ["rule", 0.065, 290],
  retro: ["paper", 0.075, 230],
  minimal: ["measure", 0.048, 355],
  graphite: ["rule", 0.04, 215],
  frame: ["double", 0.06, 260],
  stone: ["grain", 0.09, 290],
  midnight: ["double", 0.046, 390],
  forest: ["brush", 0.092, 350],
  white: ["rule", 0.05, 245],
  sharp: ["cross", 0.055, 250],
  porcelain: ["double", 0.045, 320],
  relay: ["measure", 0.086, 245],
  tide: ["wave", 0.065, 415],
  velvet: ["brush", 0.11, 375],
  press: ["stamp", 0.095, 240],
  film: ["grain", 0.064, 285],
  post: ["post", 0.066, 310],
  carbon: ["cross", 0.04, 270],
  chestnut: ["grain", 0.11, 345],
  whiteNight: ["wave", 0.046, 360],
  ink: ["brush", 0.125, 440],
};

const DASHES = {
  measure: [0.46, 0.1, 0.075, 0.1],
  grain: [0.075, 0.11],
  cross: [0.24, 0.09, 0.06, 0.09],
  post: [0.145, 0.12],
};

const easeOut = value => 1 - (1 - value) ** 2;
const progress = (age, duration) => Math.min(1, Math.max(0, age / duration));
const opacity = (age, duration, reduced, pace = 1) => {
  if (age < 0 || age >= duration) return 0;
  return reduced ? 0.76 : (1 - progress(age, duration)) ** pace;
};

/** @param {CanvasRenderingContext2D} ctx @param {Material} material */
const stroke = (ctx, [finish, weight], color, alpha, path) => {
  if (alpha <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = finish === "grain" || finish === "brush" || finish === "wave" ? "round" : "butt";
  ctx.setLineDash(DASHES[finish] ?? []);
  if (finish === "paper" || finish === "brush" || finish === "double" || finish === "wave") {
    ctx.save();
    if (finish === "brush") ctx.lineWidth = weight * 2.3;
    else ctx.translate(0, finish === "paper" ? 0.065 : -0.115);
    ctx.globalAlpha = alpha * (finish === "brush" ? 0.27 : 0.45);
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
  ctx.restore();
};

const slotPath =
  (left, top, width, height, finish, spread = 1) =>
  ctx => {
    const right = left + width;
    const bottom = top + height;
    if (finish !== "measure" && finish !== "cross" && finish !== "stamp") {
      ctx.rect(left, top, width, height);
      return;
    }
    const arm = Math.min(0.46 * spread, width / 2, height / 2);
    for (const [x, y, dx, dy] of [
      [left, top, 1, 1],
      [right, top, -1, 1],
      [left, bottom, 1, -1],
      [right, bottom, -1, -1],
    ]) {
      ctx.moveTo(x, y + dy * arm);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * arm, y);
    }
  };

const drawCombo = (ctx, material, theme, color, right, slot, combo, accent) => {
  const left = right + 0.4;
  const top = 6.94;
  const panelWidth = slot - 0.8;
  const inset = 0.3;
  const count = 4;
  const gap = 0.14;
  const width = (panelWidth - 2 * inset - (count - 1) * gap) / count;
  const trackTop = top + 1.16;
  const trackHeight = 0.3;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, panelWidth, 1.78, Math.min(0.16, theme.radius));
  ctx.fillStyle = theme.board.bg;
  ctx.fill();
  ctx.strokeStyle = theme.board.edge;
  ctx.lineWidth = 0.055;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = "600 0.62px system-ui, sans-serif";
  ctx.globalAlpha = 0.9;
  ctx.fillText(t("콤보"), left + inset, top + 0.24);
  for (let index = 0; index < count; index++) {
    const x = left + inset + index * (width + gap);
    ctx.globalAlpha = index < combo ? 0.74 : 0.2;
    ctx.fillRect(x, trackTop, width, trackHeight);
    if (index === combo - 1) stroke(ctx, material, color, accent, path => path.rect(x, trackTop, width, trackHeight));
  }
  ctx.restore();
};

/** @param {CanvasRenderingContext2D} ctx */
export const drawMotionAccents = (
  ctx,
  { left, right, slot, themeId, theme, reduced, holdAge, holdUsed, nextAge, spin, perfectAge, combo, comboAge, piece }
) => {
  const material = MATERIALS[themeId] ?? MATERIALS.modern;
  const [finish, , duration] = material;
  const ink = theme.motion.clearSweep?.edge ?? theme.board.ink;
  const holdBox = slotPath(0.4, 0.93, left - 0.8, 1.9, finish);
  stroke(ctx, material, ink, holdUsed ? 0.2 : 0.52, holdBox);
  stroke(ctx, material, theme.palette[CELL_ID.Z], opacity(holdAge, duration + 130, reduced, 1.6), holdBox);

  if (nextAge !== null) {
    const queued = nextAge < 0 ? progress(nextAge + 115, 115) : opacity(nextAge, duration + 95, reduced, 1.5);
    const nextBox = slotPath(right + 0.4, 0.93, slot - 0.8, 1.9, finish);
    stroke(ctx, material, theme.palette[CELL_ID.I], reduced && nextAge < 0 ? 0 : queued, nextBox);
    if (nextAge >= 0 && queued && piece) {
      for (const [x, y] of piece.cells)
        stroke(ctx, material, ink, queued * 0.88, slotPath(left + x + 0.08, y + 0.08, 0.84, 0.84, finish));
    }
  }

  if (spin) drawTSpin(ctx, { ...spin, themeId, color: ink, left, right, rows: ROWS, reduced });

  const perfectLength = duration + 290;
  const perfect = opacity(perfectAge, perfectLength, reduced, 1.1);
  if (perfect) {
    const inset = 0.16 + (reduced ? 0 : 0.24 * (1 - easeOut(progress(perfectAge, perfectLength * 0.63))));
    stroke(
      ctx,
      material,
      ink,
      perfect * 0.94,
      slotPath(left + inset, inset, right - left - 2 * inset, ROWS - 2 * inset, finish, 3)
    );
  }

  if (combo !== null)
    drawCombo(ctx, material, theme, ink, right, slot, combo, opacity(comboAge, duration + 110, reduced));
};
