import { CELL_ID } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { formatDelta } from "../modes/splits.js";
import {
  accentInk,
  accentMaterial,
  accentOpacity,
  drawAccentStroke,
  drawSlotAccent,
} from "../render/motion-accents.js";
import { HOLD } from "../render/preview-scene.js";
import { active, boardFromRows, finishPiece, pieceCells } from "./scene-board.js";

/** @typedef {import("../render/preview.js").PreviewBoardFrame} PreviewBoardFrame */
/** @typedef {import("../render/preview.js").SampleCue} SampleCue */
/** @typedef {readonly [number, string, number?]} SoundCue */
/** @typedef {ReturnType<typeof accentMaterial>} Material */
/** @typedef {{ theme: any, material: Material, left: number, ink: string, reduced: boolean }} Style */
/** @typedef {{
 *   start: 0, end: number,
 *   sounds: readonly SoundCue[],
 *   cues?: readonly SampleCue[],
 *   frame(time: number): PreviewBoardFrame,
 *   overlay(ctx: CanvasRenderingContext2D, style: Style, time: number): void
 * }} Situation */

const WAIT_QUEUE = ["O", "S", "J"];
const CLEAR_AT = 960;
const queueAfter = WAIT_QUEUE.slice(1);

/** @returns {PreviewBoardFrame} */
const frame = (board, piece = null, queue = WAIT_QUEUE) => ({
  board,
  piece,
  queue,
  clear: null,
  clearAge: 0,
  pivot: null,
});

const clearFrame = (clear, time, at) => ({
  ...frame(clear.after, null, queueAfter),
  clear,
  clearAge: time - at,
});

const progress = (elapsed, length) => Math.min(1, Math.max(0, elapsed / length));
const wellRow = "888888.888";
const lowBoard = boardFromRows(["..33......", "..33......", wellRow, wellRow, wellRow, wellRow]);
const highBoard = finishPiece(lowBoard, "O", pieceCells("O", 0, 2, 1));
const wellI = pieceCells("I", 1, 4, 5);
const recovery = finishPiece(highBoard.after, "I", wellI);
const DANGER_AT = 460;
const RECOVER_AT = 1450;

const dangerFrame = time => {
  if (time < DANGER_AT) {
    return frame(lowBoard, active("O", pieceCells("O", 0, 2, 0), pieceCells("O", 0, 2, 1)), ["I", ...queueAfter]);
  }
  if (time < RECOVER_AT) {
    const piece = time < 760 ? null : active("I", pieceCells("I", 1, 4, 0), wellI);
    return frame(highBoard.after, piece);
  }
  return clearFrame(recovery, time, RECOVER_AT);
};

/** @param {CanvasRenderingContext2D} ctx @param {Style} style */
const dangerLine = (ctx, { left, theme, material, reduced }, time) => {
  if (time < DANGER_AT || (reduced && time >= RECOVER_AT)) return;
  const entered = reduced ? 1 : progress(time - DANGER_AT, 210);
  const released = progress(time - RECOVER_AT, 340);
  const width = 1.1 + 3.64 * entered * (1 - released);
  const color = theme.palette[CELL_ID.L];
  drawAccentStroke(ctx, material, color, 0.88 * entered * (1 - released), path => {
    for (const side of [-1, 1]) {
      const edge = left + 5 + 4.84 * side;
      path.moveTo(edge, 0.87);
      path.lineTo(edge, 0.22);
      path.lineTo(edge - side * width, 0.22);
    }
  });
};

const KICK_AT = 460;
const kickBoard = boardFromRows([".....3....", "..113377..", "8811888877"]);
// 세로 T의 상자가 벽 밖에 일부 걸친 상태. SRS의 1→0 제자리 회전은 실패하고 [1, 0] 킥이 성공한다.
const beforeKick = active("T", pieceCells("T", 1, -1, 4));
const afterKick = active("T", pieceCells("T", 0, 0, 4));

/** @param {CanvasRenderingContext2D} ctx @param {Style} style */
const kickLine = (ctx, { left, material, ink, reduced }, time) => {
  const age = time - KICK_AT;
  const alpha = accentOpacity(age, Math.min(320, material[2]), reduced, 1.15);
  const from = 4.65 - (reduced ? 0 : 0.14 * progress(age, 220));
  const [finish, weight, duration] = material;
  drawAccentStroke(ctx, [finish, Math.max(0.09, weight), duration], ink, alpha, path => {
    path.moveTo(left - 0.15, from);
    path.lineTo(left - 0.15, from + 0.97);
    path.lineTo(left + 0.24, from + 0.97);
  });
};

/** @param {CanvasRenderingContext2D} ctx */
const sideCard = (ctx, theme, x, y, w, h) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(0.16, theme.radius));
  ctx.fillStyle = theme.board.bg;
  ctx.fill();
  ctx.strokeStyle = theme.board.edge;
  ctx.lineWidth = 0.06;
  ctx.stroke();
};

/** @param {CanvasRenderingContext2D} ctx @param {Style} style */
const garbageMeter = (ctx, { left, theme, ink, reduced }, time) => {
  const after = time >= CLEAR_AT;
  const color = theme.palette[CELL_ID.Z];
  const width = left - 0.78;
  sideCard(ctx, theme, 0.4, 3.45, width, 5.27);
  ctx.fillStyle = ink;
  ctx.font = "700 0.62px system-ui, sans-serif";
  ctx.fillText(t("대기 {n}줄", { n: after ? 2 : 6 }), 0.65, 3.76, width - 0.5);
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const fold = after && i >= 2 ? (reduced ? 1 : progress(time - CLEAR_AT - (5 - i) * 24, 236)) : 0;
    if (fold === 1) continue;
    ctx.globalAlpha = 0.83 * (1 - fold ** 1.4);
    const height = 0.36 * (1 - fold);
    const barWidth = (width - 0.5) * (1 - 0.7 * fold);
    const edge = left - 0.64;
    ctx.fillRect(edge - barWidth, 8.33 - i * 0.61 - height, barWidth, height);
  }
  ctx.globalAlpha = 1;
};

/** @param {CanvasRenderingContext2D} ctx @param {Style} style */
const recordCard = (ctx, { left, theme, material, ink, reduced }, time) => {
  const leading = time >= CLEAR_AT;
  const width = left - 0.78;
  sideCard(ctx, theme, 0.4, 5.42, width, 2.85);
  ctx.fillStyle = ink;
  ctx.font = "650 0.58px system-ui, sans-serif";
  ctx.fillText(t("기록 대비"), 0.69, 5.73, width - 0.58);
  ctx.font = "700 0.76px monospace";
  ctx.fillText(t("{delta}초", { delta: formatDelta(leading ? -0.42 : 0.18) }), 0.69, 6.53, width - 0.58);
  ctx.font = "600 0.54px system-ui, sans-serif";
  ctx.globalAlpha = 0.72;
  ctx.fillText(t("{n}줄 구간", { n: leading ? 20 : 10 }), 0.69, 7.52, width - 0.58);
  ctx.globalAlpha = 1;
  const alpha = accentOpacity(time - CLEAR_AT, 420, reduced);
  drawSlotAccent(ctx, material, ink, alpha, 0.4, 5.42, width, 2.85);
};

const garbageBoard = boardFromRows(["22........", "88888.8888", "88888.8888", "88888.8888", "88888.8888"]);
const garbageI = pieceCells("I", 1, 3, 5);
const garbageClear = finishPiece(garbageBoard, "I", garbageI);
const sprintBoard = boardFromRows(["........77", "11....2277"]);
const sprintI = pieceCells("I", 0, 2, 7);
const sprintClear = finishPiece(sprintBoard, "I", sprintI);
const dropCues = (clear, at, distance) => [
  { at, events: [{ type: "hardDrop", cells: clear.event.cells, distance }, clear.event] },
];

/** @type {Record<"danger" | "kick" | "cancel" | "record", Situation>} */
export const SITUATION_SAMPLES = {
  danger: {
    start: 0,
    end: 2440,
    frame: dangerFrame,
    overlay: dangerLine,
    sounds: [
      [DANGER_AT / 1000, "lock"],
      [RECOVER_AT / 1000, "quad"],
    ],
    cues: [{ at: DANGER_AT, events: [highBoard.event] }, ...dropCues(recovery, RECOVER_AT, 5)],
  },
  kick: {
    start: 0,
    end: 1130,
    frame: time => frame(kickBoard, time < KICK_AT ? beforeKick : afterKick),
    overlay: kickLine,
    sounds: [[KICK_AT / 1000, "kick"]],
  },
  cancel: {
    start: 0,
    end: 1840,
    frame: time =>
      time < CLEAR_AT
        ? frame(garbageBoard, active("I", pieceCells("I", 1, 3, 0), garbageI))
        : clearFrame(garbageClear, time, CLEAR_AT),
    overlay: garbageMeter,
    sounds: [[CLEAR_AT / 1000, "quad"]],
    cues: dropCues(garbageClear, CLEAR_AT, 5),
  },
  record: {
    start: 0,
    end: 1980,
    frame: time =>
      time < CLEAR_AT
        ? frame(
            sprintBoard,
            time < 420
              ? active("I", pieceCells("I", 0, 3, 0), pieceCells("I", 0, 3, 6))
              : active("I", pieceCells("I", 0, 2, 0), sprintI)
          )
        : clearFrame(sprintClear, time, CLEAR_AT),
    overlay: recordCard,
    sounds: [
      [0.42, "move"],
      [CLEAR_AT / 1000, "clear1"],
    ],
    cues: dropCues(sprintClear, CLEAR_AT, 7),
  },
};

/**
 * @param {ReturnType<typeof import("../render/preview.js").createThemeStage>} stage
 * @param {Situation} sample
 */
export const playSituation = (stage, sample, themeId, theme, reduced) => {
  const material = accentMaterial(themeId);
  const ink = accentInk(theme);
  stage.playSample(sample.end, sample.frame, reduced ? [] : (sample.cues ?? []), elapsed => ({
    hold: HOLD,
    holdOffset: 0,
    overlay: (ctx, left) => sample.overlay(ctx, { theme, material, left, ink, reduced }, elapsed),
  }));
};
