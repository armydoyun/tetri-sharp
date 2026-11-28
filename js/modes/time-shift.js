import { HEIGHT, WIDTH, VISIBLE_ROWS, clearLines, collides, isEmpty, place, set } from "../core/board.js";
import { CELL_ID, GARBAGE } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { MODERN } from "../rules/presets.js";
import srs from "../rules/rotation/srs.js";

export const TIME_SHIFT_ID = "time-shift-1";
const TURNS = 6;
const ENTRY_Y = HEIGHT - VISIBLE_ROWS - 2;
/** @typedef {import("../core/board.js").Board} Board */
/** @typedef {import("../core/pieces.js").PieceType} PieceType */
/** @typedef {{ type: PieceType, x: number, rot: number }} Move */

const rules = Object.freeze({
  ...MODERN,
  hold: Object.freeze({ enabled: false }),
  are: Object.freeze({ spawn: 1, lineClear: 1 }),
  gravity: 0,
  irs: false,
});

/** @param {Board} board @param {Move} move */
const timeShiftLanding = (board, { type, x, rot }, fromY = ENTRY_Y) => {
  const shape = srs.cells(type, rot);
  if (collides(board, shape, x, fromY)) return null;
  let y = fromY;
  while (!collides(board, shape, x, y + 1)) y++;
  return { y, cells: shape.map(([cx, cy]) => [x + cx, y + cy]) };
};

/** @param {Board} board @param {Move} move */
const placeAndClear = (board, move, y) => {
  place(board, srs.cells(move.type, move.rot), move.x, y, CELL_ID[move.type]);
  return clearLines(board);
};

/** @param {Board} board */
const copyBoard = board => ({ ...board, cells: board.cells.slice() });

/** @param {Board} board */
const beforeCurrentClear = (board, lock) => {
  const copy = copyBoard(board);
  // 삭제 순서를 거꾸로 따라가며 그 턴의 줄을 되돌린다.
  for (let i = lock.rows.length - 1; i >= 0; i--) {
    const from = lock.rows[i] * WIDTH;
    copy.cells.copyWithin(0, WIDTH, from + WIDTH);
    copy.cells.set(lock.clearedCells[i], from);
  }
  return copy;
};

/**
 * @typedef {{
 *   beforeEcho: Board, board: Board, move: Move, landingY: number,
 *   current: any, echoRows: number[], turn: number,
 * }} Turn
 */

/** @type {ReadonlyArray<{
 *   id: string, version: number, title: () => string, recordHint: () => string, goal: () => string,
 *   success: () => string, miss: () => string, board: string[], recording: PieceType[], playing: PieceType[],
 *   clears: (turn: Turn) => boolean,
 * }>} */
export const TIME_SHIFT_STAGES = [
  {
    id: TIME_SHIFT_ID,
    version: 1,
    title: () => t("첫 합주"),
    recordHint: () => t("첫 O를 왼쪽 끝에 놓고 6수를 기록하세요."),
    goal: () => t("과거 블록으로 한 줄을 완성하세요."),
    success: () => t("과거 블록이 한 줄을 완성했어요!"),
    miss: () => t("과거 블록이 줄을 완성하지 못했어요."),
    board: ["....######"],
    recording: ["O", "I", "T", "J", "L", "S"],
    playing: ["O", "T", "I", "L", "Z", "J"],
    clears: ({ echoRows }) => echoRows.length > 0,
  },
  {
    id: "time-shift-2",
    version: 1,
    title: () => t("먼저 지워야 열리는 길"),
    recordHint: () => t("첫 O를 회색 칸 위에 놓고 6수를 기록하세요."),
    goal: () => t("먼저 줄을 지워 과거 블록을 더 아래에 떨어뜨리세요."),
    success: () => t("현재 블록이 길을 열어 과거 블록이 더 아래에 닿았어요!"),
    miss: () => t("과거 블록이 줄 삭제로 더 아래에 떨어진 수가 없었어요."),
    board: ["....######"],
    recording: ["O", "T", "I", "L", "Z", "J"],
    playing: ["I", "O", "J", "S", "L", "T"],
    clears: ({ beforeEcho, current, move, landingY }) => {
      if (!current.lines) return false;
      const before = timeShiftLanding(beforeCurrentClear(beforeEcho, current), move);
      return before !== null && before.y < landingY;
    },
  },
  {
    id: "time-shift-3",
    version: 1,
    title: () => t("받침대"),
    recordHint: () => t("첫 I를 왼쪽 틈에 가로로 놓고 6수를 기록하세요."),
    goal: () => t("현재 블록을 받침으로 놓아 위쪽 줄을 과거 블록으로 채우세요."),
    success: () => t("과거 블록이 받침 위에 내려앉아 위쪽 줄을 채웠어요!"),
    miss: () => t("과거 블록을 받침 위에 놓아 위쪽 줄을 완성하지 못했어요."),
    board: ["....######", "....#.....", "....#....."],
    recording: ["I", "O", "J", "T", "S", "L"],
    playing: ["O", "T", "L", "Z", "J", "I"],
    clears: ({ beforeEcho, current, move, landingY, echoRows }) => {
      if (current.lines || !echoRows.includes(HEIGHT - 3)) return false;
      const withoutSupport = copyBoard(beforeEcho);
      for (const [x, y] of current.cells) set(withoutSupport, x, y, 0);
      const unsupported = timeShiftLanding(withoutSupport, move);
      return unsupported !== null && unsupported.y > landingY;
    },
  },
  {
    id: "time-shift-4",
    version: 1,
    title: () => t("한 턴에 두 번"),
    recordHint: () => t("첫 I를 오른쪽 통로에 가로로 놓고 6수를 기록하세요."),
    goal: () => t("한 턴에 현재 블록과 과거 블록으로 각각 줄을 지우세요."),
    success: () => t("같은 턴에 현재 블록과 과거 블록이 각각 줄을 지웠어요!"),
    miss: () => t("현재 블록과 과거 블록이 같은 턴에 각각 줄을 지우지 못했어요."),
    board: ["######....", "######...."],
    recording: ["I", "O", "J", "S", "T", "Z"],
    playing: ["I", "L", "T", "J", "O", "S"],
    clears: ({ current, echoRows }) => current.lines > 0 && echoRows.length > 0,
  },
  {
    id: "time-shift-5",
    version: 1,
    title: () => t("빈 판으로 돌아가기"),
    recordHint: () => t("두 플레이의 12개 블록으로 빈칸을 채울 계획을 세우세요."),
    goal: () => t("여섯 번째 과거 블록까지 놓아 판을 완전히 비우세요."),
    success: () => t("여섯 번째 과거 블록까지 놓아 판을 비웠어요!"),
    miss: () => t("마지막 과거 블록이 떨어진 뒤 판에 블록이 남았어요."),
    board: ["........##"],
    recording: ["I", "J", "L", "O", "J", "L"],
    playing: ["I", "J", "L", "O", "J", "L"],
    clears: ({ board, turn }) => turn === TURNS && isEmpty(board),
  },
];

export const findTimeShiftStage = id => TIME_SHIFT_STAGES.find(stage => stage.id === id);

/** @param {unknown} value @returns {value is Move[]} */
export const validTimeShiftMoves = (value, stage = TIME_SHIFT_STAGES[0]) =>
  Array.isArray(value) &&
  value.length === TURNS &&
  stage.recording.every((type, index) => {
    const move = value[index];
    if (move?.type !== type || !Number.isInteger(move.x) || ![0, 1, 2, 3].includes(move.rot)) return false;
    return srs.cells(move.type, move.rot).every(([x]) => move.x + x >= 0 && move.x + x < WIDTH);
  });

/** @param {Move[] | null} past @param {"official" | "friend" | "demo"} source */
export const timeShiftMode = (past = null, stage = TIME_SHIFT_STAGES[0], source = "official") => {
  const echo = past !== null;
  const demo = source === "demo";
  const turns = demo ? 1 : TURNS;
  const goal = stage.goal();
  return {
    id: stage.id,
    timeShift: stage,
    timeShiftSource: source,
    past,
    name: demo
      ? t("한 수 체험")
      : source === "friend"
        ? t("친구 도전 · {stage}", { stage: stage.title() })
        : t("시간차 · {stage}", { stage: stage.title() }),
    description: demo
      ? t("현재 O를 옮겨 점선이 바뀌는지 보고, 두 O로 아래 줄을 채우세요.")
      : echo
        ? `${goal} ${t("점선은 과거 블록의 착지예요.")}`
        : stage.recordHint(),
    rules,
    sequence: echo ? stage.playing : stage.recording,
    hud: ["lines", "time"],
    noReplay: true,
    gravityFor: () => 0,
    isRecordable: () => false,
    formatRecord: () => "",
    setup(state) {
      for (const [row, pattern] of stage.board.entries()) {
        for (let x = 0; x < WIDTH; x++) {
          if (pattern[x] === "#") set(state.board, x, HEIGHT - stage.board.length + row, GARBAGE);
        }
      }
      state.timeShift = {
        past,
        turns,
        moves: [],
        activePosition: "",
        preview: null,
        blocked: null,
        echoLines: 0,
        cleared: false,
      };
    },
    onLock(state, current, events, active) {
      const shift = state.timeShift;
      shift.preview = null;
      if (!echo) {
        shift.moves.push({ type: active.type, x: active.x, rot: active.rot });
        return;
      }
      const turn = state.stats.pieces;
      const move = past[turn - 1];
      const landing = timeShiftLanding(state.board, move);
      if (!landing) {
        shift.blocked = srs
          .cells(move.type, move.rot)
          .filter(([x, y]) => collides(state.board, [[x, y]], move.x, ENTRY_Y))
          .map(([x]) => move.x + x + 1);
        return;
      }
      const beforeEcho = copyBoard(state.board);
      const rows = placeAndClear(state.board, move, landing.y);
      shift.echoLines += rows.length;
      state.stats.lines += rows.length;
      shift.cleared = stage.clears({
        beforeEcho,
        board: state.board,
        move,
        landingY: landing.y,
        current,
        echoRows: rows,
        turn,
      });
      events.push({
        type: "echoLock",
        piece: move.type,
        cells: landing.cells,
        distance: landing.y - ENTRY_Y,
        turn,
        beforeEcho,
        rows,
        lines: rows.length,
      });
    },
    onFrame(state) {
      if (!echo || !state.active || state.stats.pieces >= turns) return;
      const active = state.active;
      const key = `${state.stats.pieces}:${active.x}:${active.y}:${active.rot}`;
      const shift = state.timeShift;
      if (key === shift.activePosition) return;
      shift.activePosition = key;
      const board = copyBoard(state.board);
      const landing = timeShiftLanding(board, active, active.y);
      if (landing) placeAndClear(board, active, landing.y);
      shift.preview = timeShiftLanding(board, past[state.stats.pieces]);
    },
    check(state) {
      if (state.timeShift.blocked) return { result: "echoBlocked" };
      if (state.timeShift.cleared) return { result: "clear" };
      if (state.stats.pieces >= turns) return { result: echo ? "fail" : "rewind" };
      return null;
    },
    hudLines(state) {
      return {
        label: echo ? t("두 번째 플레이") : t("첫 번째 플레이"),
        value: `${state.stats.pieces} / ${turns}`,
      };
    },
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary(state) {
      const turn = state.stats.pieces;
      if (state.over === "rewind")
        return {
          title: t("6수를 기록했어요"),
          detail: t("되감으면 시작 판으로 돌아가요. 현재 블록을 놓을 때마다 과거 블록 하나가 떨어져요."),
        };
      if (demo) {
        return state.over === "clear"
          ? { title: t("성공!"), detail: t("현재 O와 과거 O가 빈칸 네 칸을 나눠 채웠어요.") }
          : { title: t("실패"), detail: t("왼쪽에서 세 번째 칸에 현재 O의 왼쪽을 맞춰 보세요.") };
      }
      if (state.over === "clear") return { title: t("성공!"), detail: stage.success() };
      const detail =
        state.over === "echoBlocked"
          ? t("{n}번째 과거 블록의 진입이 막혔어요. 막힌 열: {columns}번.", {
              n: turn,
              columns: [...new Set(state.timeShift.blocked)].sort((a, b) => Number(a) - Number(b)).join(", "),
            })
          : state.over === "blockOut" || state.over === "lockOut"
            ? t("{n}번째 현재 블록을 놓을 공간이 부족해요.", { n: turn + Number(state.over === "blockOut") })
            : t("{n}턴 종료 · {reason}", { n: turn, reason: stage.miss() });
      return { title: t("실패"), detail };
    },
  };
};

export const timeShiftDemo = () => {
  const stage = TIME_SHIFT_STAGES[0];
  const past = stage.recording.map((type, i) => ({ type, x: i === 0 ? 0 : 3, rot: 0 }));
  return timeShiftMode(past, stage, "demo");
};
