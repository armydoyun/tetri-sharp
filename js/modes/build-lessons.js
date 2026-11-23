import { HEIGHT, set } from "../core/board.js";
import { cellsOf } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";
import { buildTsd } from "./practice.js";
import { reachableLandings, sameCells } from "./placement-hints.js";

const rules = Object.freeze({ ...MODERN, hold: Object.freeze({ enabled: false }) });

// 놓을 위치는 [피스, 방향, 회전 상자의 x, y]. 성공 여부는 실제 줄 삭제 이벤트로 판정한다.
const well = /** @type {const} */ ([
  ["O", 0, 0, 38],
  ["O", 0, 2, 38],
  ["O", 0, 0, 36],
  ["O", 0, 2, 36],
  ["I", 0, 4, 38],
  ["I", 0, 4, 37],
  ["I", 0, 4, 36],
  ["I", 0, 4, 35],
  ["I", 1, 6, 36],
  ["I", 1, 7, 36],
]);
const spin = /** @type {const} */ ([
  ["I", 1, -2, 36],
  ["O", 0, 3, 36],
  ["T", 2, 4, 37],
]);

const exercises = [
  {
    name: t("4줄 우물 만들기"),
    description: t("오른쪽 한 열을 남기고 쌓은 뒤 I 피스로 4줄을 지우세요."),
    moves: well,
    setup: () => {},
    gap: t("마지막 I 피스를 위해 점선 열을 비워 두세요."),
    goal: event => event.lines === 4,
  },
  {
    name: t("T-spin Double 자리 만들기"),
    description: t("왼쪽 빈 열을 채우고 지붕을 만든 뒤 T를 돌려 2줄을 지우세요."),
    moves: spin,
    setup: board => {
      buildTsd(board, 4, true);
      set(board, 4, HEIGHT - 3, 0);
      set(board, 0, HEIGHT - 2, 0);
      set(board, 0, HEIGHT - 1, 0);
    },
    gap: t("마지막 T가 들어갈 점선 칸을 비워 두세요."),
    goal: event => event.tspin === "full" && event.lines === 2,
  },
];

export const BUILD_LESSONS = Object.freeze(
  exercises.map((exercise, index) => {
    const targets = exercise.moves.map(([type, rot, x, y]) => cellsOf(type, rot).map(([cx, cy]) => [x + cx, y + cy]));
    const need = targets.length;
    return Object.freeze({
      id: `build-lesson-${index + 1}`,
      name: exercise.name,
      description: exercise.description,
      rules,
      practice: true,
      buildLesson: index + 1,
      noReplay: true,
      sequence: exercise.moves.map(move => move[0]),
      hud: ["lines", "pieces"],
      setup: state => {
        exercise.setup(state.board);
        state.puzzle = { placed: 0, need };
        state.buildLesson = { achieved: false, hintLevel: 0, hintCells: [], usedHint: false };
      },
      gravityFor: () => 0,
      onLock: (state, event) => {
        state.puzzle.placed += 1;
        state.buildLesson.achieved = exercise.goal(event);
        state.buildLesson.hintLevel = 0;
        state.buildLesson.hintCells = [];
        return false;
      },
      check: state => {
        if (state.buildLesson.achieved) return { result: "clear" };
        if (state.puzzle.placed >= need) return { result: "fail" };
        return null;
      },
      hint: state => {
        const hint = state.buildLesson;
        hint.hintLevel = (hint.hintLevel + 1) % 3;
        if (hint.hintLevel) hint.usedHint = true;
        hint.hintCells = [];
        if (hint.hintLevel === 1) {
          hint.hintCells = targets.at(-1);
          return exercise.gap;
        }
        if (hint.hintLevel !== 2) return "";
        const target = targets[state.puzzle.placed];
        for (const cells of reachableLandings(state.board, state.active)) {
          if (sameCells(cells, target)) {
            hint.hintCells = target;
            return state.active.type === "T"
              ? t("T를 세로로 내린 뒤 지붕 아래로 돌려 넣으세요.")
              : t("현재 피스를 놓을 수 있는 자리예요.");
          }
        }
        return t("이 배치에서는 준비된 자리 힌트를 쓸 수 없어요. 계속 쌓거나 같은 판을 다시 시작할 수 있어요.");
      },
      hudLines: state => ({ label: t("남은 피스"), value: String(Math.max(0, need - state.puzzle.placed)) }),
      hudTime: state => ({ label: t("시간"), frames: state.frame }),
      isRecordable: () => false,
      formatRecord: () => "",
      summary: state => ({ main: exercise.name, title: state.over === "clear" ? t("성공!") : t("실패") }),
    });
  })
);
