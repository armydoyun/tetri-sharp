import { CELL_ID } from "../core/pieces.js";
import { COLS, ROWS, getPreviewFrame } from "../render/preview-scene.js";
import srs from "../rules/rotation/srs.js";
import { drawMotionAccents } from "../render/motion-accents.js";

/** @typedef {import("../core/pieces.js").PieceType} PieceType */
/** @typedef {readonly [number, string, number?]} SoundCue */

const HOLD_AT = 460;
const TURN_AT = 740;
const ROTATE_AT = 1490;
const SPIN_AT = 1560;
const NEXT_AT = 2090;
const DROP_AT = 2660;
const FINISH_AT = 3840;
const SPIN_X = 4;
const SPIN_Y = 6;
const spinPivot = { x: SPIN_X + 1.5, y: SPIN_Y + 1.5, direction: /** @type {const} */ (-1) };

const pieceCells = (/** @type {PieceType} */ type, rot, x, y) =>
  srs.cells(type, rot).map(([dx, dy]) => [x + dx, y + dy]);

// 세로 T가 홈에 내려온 뒤 반시계 90°로 두 줄을 지운다.
// 내려온 마지막 줄의 네 칸을 가로 I로 채우면 콤보와 퍼펙트 클리어가 동시에 난다.
const startBoard = Array.from({ length: ROWS }, (_, y) =>
  [...(["11....2277", "1112...277", "11888.8877"][y - 6] ?? "..........")].map(value => Number(value) || 0)
);
const finishPiece = (board, /** @type {PieceType} */ type, cells, tspin) => {
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
const spinCells = pieceCells("T", 2, SPIN_X, SPIN_Y);
const spin = finishPiece(startBoard, "T", spinCells, "full");
const dropCells = pieceCells("I", 0, 2, 7);
const drop = finishPiece(spin.after, "I", dropCells, "none");

const idle = getPreviewFrame(0);
const initialQueue = ["I", "O", "S"];
const shiftedQueue = ["O", "S", "J"];

/** @param {PieceType} type */
const active = (type, cells, ghost = []) => ({ type, cells, ghost, down: 0 });

const sceneAt = time => {
  const scene = { ...idle, piece: null, clear: null, queue: initialQueue, board: startBoard };
  if (time < HOLD_AT) return { ...scene, piece: active("Z", pieceCells("Z", 0, 4, 0)) };
  if (time < SPIN_AT) {
    const turned = time >= TURN_AT;
    const y = Math.min(SPIN_Y, Math.floor(Math.max(0, time - TURN_AT) / 112));
    const rot = time >= ROTATE_AT ? 2 : turned ? 3 : 0;
    return { ...scene, piece: active("T", pieceCells("T", rot, SPIN_X, y)) };
  }
  if (time < NEXT_AT) {
    return { ...scene, clear: spin, clearAge: time - SPIN_AT, board: spin.after, pivot: spinPivot.x / COLS };
  }
  if (time < DROP_AT) {
    const x = time < NEXT_AT + 300 ? 3 : 2;
    return {
      ...scene,
      piece: active("I", pieceCells("I", 0, x, 0), pieceCells("I", 0, x, x === 2 ? 7 : 6)),
      queue: shiftedQueue,
      board: spin.after,
    };
  }
  return { ...scene, queue: shiftedQueue, clear: drop, clearAge: time - DROP_AT, board: drop.after };
};

const dropCue = { type: "hardDrop", distance: 7, cells: dropCells };
const visuals = [
  { at: SPIN_AT, events: [spin.event] },
  { at: DROP_AT, events: [dropCue, drop.event] },
];
/** @type {readonly SoundCue[]} */
const sounds = [
  [HOLD_AT, "hold"],
  [TURN_AT, "rotate"],
  [ROTATE_AT, "rotate"],
  [SPIN_AT, "tspin"],
  [NEXT_AT + 300, "move"],
  [DROP_AT, "hardDrop", 0.38],
  [DROP_AT, "perfect"],
  [DROP_AT, "combo1"],
];

export const MOTION_SAMPLES = {
  flow: { start: 0, end: FINISH_AT },
  next: { start: NEXT_AT - 230, end: NEXT_AT + 525 },
  hold: { start: 0, end: 1050 },
  spin: { start: ROTATE_AT - 340, end: NEXT_AT },
  spinClear: { start: SPIN_AT, end: NEXT_AT },
  perfect: { start: DROP_AT - 340, end: FINISH_AT },
  combo: { start: DROP_AT - 340, end: FINISH_AT },
};

/** @param {ReturnType<typeof import("../render/preview.js").createThemeStage>} stage */
export const playMotionSample = (stage, id, themeId, theme, reduced) => {
  const { start, end } = MOTION_SAMPLES[id];
  const cues = reduced
    ? []
    : visuals.filter(({ at }) => at >= start && at < end).map(cue => ({ ...cue, at: cue.at - start }));
  stage.playSample(
    end - start,
    elapsed => sceneAt(start + elapsed),
    cues,
    (elapsed, scene) => {
      const time = start + elapsed;
      const show = effect => id === "flow" || id === effect;
      const holdAge = time - HOLD_AT;
      return {
        hold: time < HOLD_AT ? "T" : "Z",
        holdOffset: !reduced && show("hold") && holdAge >= 0 ? -0.35 * Math.max(0, 1 - holdAge / 235) : 0,
        overlay: (ctx, left, right, slot) =>
          drawMotionAccents(ctx, {
            left,
            right,
            slot,
            themeId,
            theme,
            reduced,
            holdAge: show("hold") ? holdAge : -1,
            holdUsed: HOLD_AT <= time && time < SPIN_AT,
            nextAge: show("next") ? time - NEXT_AT : null,
            spin: show("spin") || id === "spinClear" ? { ...spinPivot, age: time - SPIN_AT } : null,
            // 테두리 여운은 줄 삭제가 충분히 진행된 뒤 빈 보드에 그린다.
            perfectAge: show("perfect") ? time - DROP_AT - Math.round(theme.motion.clearMs * 0.82) : -1,
            combo: show("combo") ? Number(time >= SPIN_AT) + Number(time >= DROP_AT) : null,
            comboAge: time - (time >= DROP_AT ? DROP_AT : SPIN_AT),
            piece: scene.piece,
          }),
      };
    }
  );
};

/** @returns {SoundCue[]} */
export const motionSounds = id => {
  const { start, end } = MOTION_SAMPLES[id];
  return sounds
    .filter(([at, sound]) => at >= start && at < end && (id !== "combo" || sound !== "perfect"))
    .map(([at, sound, mix]) => [(at - start) / 1000, sound, mix]);
};
