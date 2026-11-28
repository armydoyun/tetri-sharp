import { HEIGHT, WIDTH, VISIBLE_ROWS, clearLines, collides, place } from "../core/board.js";
import { CELL_ID, GARBAGE } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { MODERN } from "../rules/presets.js";
import srs from "../rules/rotation/srs.js";

export const TIME_SHIFT_ID = "time-shift-1";
const TURNS = 6;
const ENTRY_Y = HEIGHT - VISIBLE_ROWS - 2;
const recording = ["O", "I", "T", "J", "L", "S"];
const playing = ["O", "T", "I", "L", "Z", "J"];
const rules = Object.freeze({
  ...MODERN,
  hold: Object.freeze({ enabled: false }),
  are: Object.freeze({ spawn: 1, lineClear: 1 }),
  gravity: 0,
  irs: false,
});

/** @typedef {{ type: import("../core/pieces.js").PieceType, x: number, rot: number }} Move */

/** @param {unknown} value @returns {value is Move[]} */
export const validTimeShiftMoves = value =>
  Array.isArray(value) &&
  value.length === TURNS &&
  value.every((move, index) => {
    if (move?.type !== recording[index] || !Number.isInteger(move.x) || ![0, 1, 2, 3].includes(move.rot)) return false;
    return srs.cells(move.type, move.rot).every(([x]) => move.x + x >= 0 && move.x + x < WIDTH);
  });

/** @param {import("../core/board.js").Board} board @param {Move} move */
const timeShiftLanding = (board, { type, x, rot }, fromY = ENTRY_Y) => {
  const shape = srs.cells(type, rot);
  if (collides(board, shape, x, fromY)) return null;
  let y = fromY;
  while (!collides(board, shape, x, y + 1)) y++;
  return { y, cells: shape.map(([cx, cy]) => [x + cx, y + cy]) };
};

/** @param {import("../core/board.js").Board} board @param {Move} move */
const placeAndClear = (board, move, y) => {
  place(board, srs.cells(move.type, move.rot), move.x, y, CELL_ID[move.type]);
  return clearLines(board);
};

/** @param {Move[] | null} past */
export const timeShiftMode = (past = null) => {
  const echo = past !== null;
  return {
    id: TIME_SHIFT_ID,
    timeShift: true,
    past,
    name: t("시간차 · 첫 합주"),
    description: echo
      ? t("과거 블록으로 한 줄을 완성하세요. 점선은 예상 착지예요.")
      : t("첫 O를 왼쪽 끝에 놓고 6수를 기록하세요."),
    rules,
    sequence: echo ? playing : recording,
    hud: ["lines", "time"],
    noReplay: true,
    gravityFor: () => 0,
    isRecordable: () => false,
    formatRecord: () => "",
    setup(state) {
      state.board.cells.fill(GARBAGE, WIDTH * HEIGHT - 6);
      state.timeShift = {
        past,
        turns: TURNS,
        moves: [],
        activePosition: "",
        preview: null,
        blocked: false,
        echoLines: 0,
      };
    },
    onLock(state, _event, events, active) {
      const shift = state.timeShift;
      shift.preview = null;
      if (!echo) {
        shift.moves.push({ type: active.type, x: active.x, rot: active.rot });
        return;
      }
      const move = past[state.stats.pieces - 1];
      const landing = timeShiftLanding(state.board, move);
      if (!landing) {
        shift.blocked = true;
        return;
      }
      const rows = placeAndClear(state.board, move, landing.y);
      shift.echoLines += rows.length;
      state.stats.lines += rows.length;
      events.push(
        { type: "hardDrop", distance: landing.y - ENTRY_Y, cells: landing.cells },
        { type: "echoLock", cells: landing.cells, rows, lines: rows.length }
      );
    },
    onFrame(state) {
      if (!echo || !state.active || state.stats.pieces >= TURNS || state.timeShift.echoLines || state.timeShift.blocked)
        return;
      const active = state.active;
      const key = `${state.stats.pieces}:${active.x}:${active.y}:${active.rot}`;
      const shift = state.timeShift;
      if (key === shift.activePosition) return;
      shift.activePosition = key;
      const board = { ...state.board, cells: state.board.cells.slice() };
      const landing = timeShiftLanding(board, active, active.y);
      if (landing) placeAndClear(board, active, landing.y);
      shift.preview = timeShiftLanding(board, past[state.stats.pieces]);
    },
    check(state) {
      if (state.timeShift.blocked) return { result: "echoBlocked" };
      if (echo && state.timeShift.echoLines) return { result: "clear" };
      if (state.stats.pieces >= TURNS) return { result: echo ? "fail" : "rewind" };
      return null;
    },
    hudLines(state) {
      return {
        label: echo ? t("두 번째 플레이") : t("첫 번째 플레이"),
        value: `${state.stats.pieces} / ${TURNS}`,
      };
    },
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary(state) {
      const title = state.over === "rewind" ? t("6수를 기록했어요") : state.over === "clear" ? t("성공!") : t("실패");
      const main =
        state.over === "rewind"
          ? t("되감으면 과거의 수가 하나씩 돌아와요.")
          : state.over === "clear"
            ? t("과거 블록이 한 줄을 완성했어요!")
            : state.over === "echoBlocked"
              ? t("{n}번째 과거 블록이 들어갈 자리가 막혔어요.", { n: state.stats.pieces })
              : t("과거 블록으로 줄을 완성하지 못했어요.");
      return { title, main };
    },
  };
};
