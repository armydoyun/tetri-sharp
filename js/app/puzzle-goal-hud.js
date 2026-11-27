import { t } from "../i18n/index.js";
import { KIND_NAMES } from "../modes/puzzles.js";
import { createGoalDisplay } from "../ui/puzzle-goal.js";

const occupiedRows = ({ width, cells }) => {
  let rows = 0;
  for (let start = 0; start < cells.length; start += width) {
    if (cells.subarray(start, start + width).some(Boolean)) rows++;
  }
  return rows;
};

const describeGoal = (puzzle, need) => {
  const { kind } = puzzle;
  const title = KIND_NAMES[kind];
  if (kind === "pc")
    return {
      title: t("퍼펙트 클리어"),
      segments: 4,
      progress: state => {
        const rows = occupiedRows(state.board);
        return { value: t("남은 줄 {n}", { n: rows }), filled: rows };
      },
    };
  if (kind === "lines" || kind === "combo") {
    const target = kind === "lines" ? puzzle.lines : need;
    const segments = Math.min(target, 10);
    return {
      title: kind === "lines" ? t("{n}줄 지우기", { n: target }) : title,
      segments,
      progress: state => {
        const count = Math.min(target, kind === "lines" ? state.puzzle.lines : state.puzzle.combo + 1);
        return { value: `${count} / ${target}`, filled: Math.floor((count * segments) / target) };
      },
    };
  }
  const spin = kind === "mini" || kind === "tsd" || kind === "tst";
  const segments = kind === "mini" ? 1 : kind === "tst" ? 3 : kind === "quad" ? 4 : 2;
  return {
    title: kind === "tsd" ? t("T스핀 더블") : title,
    segments,
    spin,
    progress: state => ({
      value: kind === "mini" ? t("한 줄 이상") : t("한 번에 {n}줄", { n: segments }),
      filled: state.over === "clear" ? segments : 0,
    }),
  };
};

/** @param {HTMLElement} root */
export const createPuzzleGoalHud = root => {
  let previousGame;
  let placed;
  let result;
  let description;
  let display;

  return {
    update(game, puzzle, animate) {
      root.hidden = !puzzle || !game;
      if (root.hidden) {
        previousGame = null;
        return;
      }
      const state = game.state;
      const sameGame = game === previousGame;
      if (sameGame && placed === state.puzzle.placed && result === state.over) return;

      const complete = state.over === "clear";
      const celebrate = animate && sameGame && result !== "clear" && complete;
      if (!sameGame) {
        description = describeGoal(puzzle, state.puzzle.need);
        display = createGoalDisplay({ kind: puzzle.kind, ...description });
        root.replaceChildren(display.hud);
      }
      previousGame = game;
      placed = state.puzzle.placed;
      result = state.over;
      display.update({
        ...description.progress(state),
        status: complete ? t("목표 달성") : result ? t("목표 미달성") : placed > 0 ? t("진행 중") : t("시작 전"),
        complete,
        celebrate,
      });
    },
  };
};
