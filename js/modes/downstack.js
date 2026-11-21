import { HEIGHT, VISIBLE_ROWS, WIDTH, collides, get, set } from "../core/board.js";
import { cellsOf, GARBAGE } from "../core/pieces.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";

const rules = Object.freeze({ ...MODERN, hold: Object.freeze({ enabled: false }) });

// 위에서 아래로 [피스, 회전, 회전 상자의 x, 이 수로 지울 쓰레기 줄 수].
const exercises = /** @type {const} */ ([
  ["가운데 두 줄", [["O", 0, 4, 2]]],
  ["벽 옆 세로 우물", [["I", 1, -1, 4]]],
  [
    "좌우로 바뀌는 구멍",
    [
      ["I", 0, 0, 1],
      ["I", 0, 6, 1],
    ],
  ],
  [
    "넓이가 다른 구멍",
    [
      ["O", 0, 6, 2],
      ["I", 0, 1, 1],
    ],
  ],
  [
    "위에 남은 블록 피해 가기",
    [
      ["T", 0, 2, 1],
      ["O", 0, 7, 2],
    ],
  ],
  [
    "서로 다른 네 구멍",
    [
      ["J", 0, 0, 1],
      ["I", 1, 6, 4],
      ["L", 0, 4, 1],
      ["O", 0, 2, 2],
    ],
  ],
]);

const sameCells = (left, right) => left.every(([x, y]) => right.some(([cx, cy]) => cx === x && cy === y));

const garbageRows = board => {
  const rows = [];
  for (let y = HEIGHT - VISIBLE_ROWS; y < HEIGHT; y++) {
    if (board.cells.subarray(y * WIDTH, (y + 1) * WIDTH).includes(GARBAGE)) rows.push(y);
  }
  return rows;
};

// 현재 피스에서 이동·회전·소프트 드롭으로 닿는 고정 위치만 제안한다.
const findOpening = (board, active, preferred, row) => {
  if (!active || row === undefined) return [];
  const rotation = ROTATIONS.srs;
  const { type } = active;
  const fits = (x, y, rot) => !collides(board, cellsOf(type, rot), x, y);
  const holes = Array.from({ length: WIDTH }, (_, x) => get(board, x, row)).filter(value => !value).length;
  const queue = [];
  const seen = new Set();
  const add = (x, y, rot) => {
    const key = `${x},${y},${rot}`;
    if (seen.has(key) || !fits(x, y, rot)) return;
    seen.add(key);
    queue.push({ x, y, rot });
  };
  add(active.x, active.y, active.rot);
  let opening = [];
  for (let i = 0; i < queue.length; i++) {
    const { x, y, rot } = queue[i];
    if (fits(x, y + 1, rot)) add(x, y + 1, rot);
    else {
      const cells = cellsOf(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
      const covered = cells.filter(([, cy]) => cy === row).length;
      if (covered === holes) {
        if (sameCells(preferred, cells)) return cells;
        if (!opening.length) opening = cells;
      }
    }
    add(x - 1, y, rot);
    add(x + 1, y, rot);
    for (const turns of [1, 2, 3]) {
      const to = (rot + turns) % 4;
      const kicks = rotation.kicks(type, rot, to, (cx, cy) => collides(board, [[cx, cy]], x, y));
      for (const [dx, dy] of kicks) {
        if (!fits(x + dx, y + dy, to)) continue;
        add(x + dx, y + dy, to);
        break;
      }
    }
  }
  return opening;
};

export const DOWNSTACK_LESSONS = Object.freeze(
  exercises.map(([title, moves], index) => {
    const total = moves.reduce((sum, move) => sum + move[3], 0);
    let row = HEIGHT - total;
    const placements = moves.map(([piece, rot, x, rows]) => {
      const shape = cellsOf(piece, rot);
      const bottom = row + rows - 1;
      const y = bottom - Math.max(...shape.map(([, cy]) => cy));
      const cells = shape.map(([cx, cy]) => [x + cx, y + cy]);
      const holes = cells.filter(([, cy]) => cy >= row);
      row += rows;
      return { cells, holes };
    });
    const label = t("파내기 {n} / {total}", { n: index + 1, total: exercises.length });
    return Object.freeze({
      id: `downstack-${index + 1}`,
      name: label,
      description: t("주어진 피스로 회색 쓰레기 줄을 모두 지우세요."),
      rules,
      practice: true,
      noReplay: true,
      downstack: { index, title: t(title) },
      sequence: moves.map(move => move[0]),
      hud: ["lines", "pieces"],
      setup: state => {
        state.puzzle = { placed: 0, need: moves.length };
        state.downstack = { remaining: total, usedHint: false, hintLevel: 0, hintCells: [] };
        for (let y = HEIGHT - total; y < HEIGHT; y++) {
          for (let x = 0; x < WIDTH; x++) set(state.board, x, y, GARBAGE);
        }
        for (const { holes } of placements) {
          for (const [x, y] of holes) set(state.board, x, y, 0);
        }
      },
      gravityFor: () => 0,
      onLock: state => {
        const drill = state.downstack;
        state.puzzle.placed += 1;
        drill.remaining = garbageRows(state.board).length;
        drill.hintLevel = 0;
        drill.hintCells = [];
        return false;
      },
      check: state => {
        if (state.downstack.remaining === 0) return { result: "clear" };
        if (state.puzzle.placed >= moves.length) return { result: "fail" };
        return null;
      },
      hint: state => {
        const drill = state.downstack;
        drill.hintLevel = (drill.hintLevel + 1) % 3;
        if (drill.hintLevel) drill.usedHint = true;
        const [top] = garbageRows(state.board);
        if (drill.hintLevel === 1) {
          drill.hintCells = Array.from({ length: WIDTH }, (_, x) => [x, top]).filter(
            ([x, y]) => !get(state.board, x, y)
          );
          return t("맨 위 쓰레기 줄의 열린 칸을 표시했어요.");
        }
        drill.hintCells =
          drill.hintLevel === 2
            ? findOpening(state.board, state.active, placements[state.puzzle.placed].cells, top)
            : [];
        if (drill.hintLevel !== 2) return "";
        return drill.hintCells.length
          ? t("현재 피스를 놓을 수 있는 자리예요.")
          : t("현재 피스로 맨 위 쓰레기 줄을 바로 지울 자리가 없어요.");
      },
      hudLines: state => ({ label: t("남은 쓰레기 줄"), value: String(state.downstack.remaining) }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({
        title: state.over === "clear" ? t("쓰레기 줄을 모두 지웠어요!") : t("쓰레기 줄이 남았어요"),
        main: label,
      }),
    });
  })
);
