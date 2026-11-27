import { HEIGHT, VISIBLE_ROWS, WIDTH, clearLines, place } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { placementKey } from "../modes/puzzle-solver.js";
import { createDailyPuzzleBoard } from "../render/daily-puzzle-board.js";
import { findTheme, paletteFor } from "../render/themes.js";
import { iconButton } from "./components.js";
import { el, fillDialog } from "./dom.js";

/** @typedef {import("../modes/puzzle-solver.js").SolutionMove} Move */

const rowsFor = paths => {
  let top = HEIGHT - 7;
  for (const route of paths)
    for (const move of route) {
      const first = move.board.findIndex(Boolean);
      if (first >= 0) top = Math.min(top, Math.floor(first / WIDTH));
      for (const [, y] of move.cells) top = Math.min(top, y);
    }
  return Math.min(VISIBLE_ROWS, HEIGHT - top);
};

/** @param {Move[]} route */
const completedBoard = route => {
  const last = route.at(-1);
  const board = { width: WIDTH, height: HEIGHT, cells: last.board.slice() };
  place(board, last.cells, 0, 0, CELL_ID[last.type]);
  clearLines(board);
  return board.cells;
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   solver: ReturnType<typeof import("../app/solver.js").createSolver>,
 *   task: import("../modes/puzzle-solver.js").SolutionTask,
 *   baseline: Move[],
 *   visual: import("../render/canvas.js").Visual
 * }} options
 */
export const openPuzzleComparison = ({ dialog, solver, task, baseline, visual }) => {
  const source = { ...task, type: /** @type {const} */ ("comparison"), excludeFirst: placementKey(baseline[0]) };
  const job = solver.run(source);
  const theme = findTheme(visual.theme);
  const palette = paletteFor(visual, theme);
  /** @type {[Move[], Move[]]} */
  const paths = [baseline, []];
  const ends = [completedBoard(baseline), null];
  let step = 0;
  let rows = rowsFor(paths);
  const notice = el("p", { class: "notice-slot", role: "status", text: t("다른 첫 배치를 찾는 중이에요…") });
  const nav = el("output", { class: "num", "aria-live": "polite" });
  const previous = iconButton({
    icon: "arrow-left",
    label: t("이전 수"),
    onClick: () => {
      step--;
      render();
      if (previous.disabled) next.focus();
    },
  });
  const next = iconButton({
    icon: "arrow-right",
    label: t("다음 수"),
    onClick: () => {
      step++;
      render();
      if (next.disabled) previous.focus();
    },
  });
  const cards = [t("풀이 A"), t("풀이 B")].map(title => {
    const caption = el("h3", { text: title });
    const canvas = el("canvas", { class: "daily-puzzle-board", role: "img", "aria-label": title });
    const detail = el("p", { class: "field-help" });
    let draw = createDailyPuzzleBoard(canvas, rows);
    return {
      root: el("section", { class: "puzzle-comparison-card" }, caption, canvas, detail),
      resize: () => (draw = createDailyPuzzleBoard(canvas, rows)),
      update(move, index) {
        const route = paths[index];
        const cells = move?.board ?? ends[index] ?? new Uint8Array(WIDTH * HEIGHT);
        draw(
          cells,
          theme,
          palette,
          visual.grid !== "off",
          move && { cells: move.cells, color: palette[CELL_ID[move.type]] }
        );
        canvas.classList.toggle("is-invisible", !route.length);
        detail.textContent = !route.length
          ? "—"
          : !move
            ? t("목표 달성 · {n}수", { n: route.length })
            : [
                t("{piece} 피스", { piece: move.type }),
                move.hold ? t("홀드 먼저") : "",
                t("{n}줄 삭제", { n: move.lines }),
                move.spinPiece
                  ? `${move.spinPiece}-SPIN`
                  : move.tspin === "full"
                    ? t("T스핀")
                    : move.tspin === "mini"
                      ? "T-spin Mini"
                      : "",
              ]
                .filter(Boolean)
                .join(" · ");
      },
    };
  });
  const render = () => {
    const total = Math.max(...paths.map(route => route.length));
    previous.disabled = step === 0;
    next.disabled = step >= total - 1;
    nav.textContent = `${step + 1} / ${total}`;
    cards.forEach((card, index) => card.update(paths[index][step], index));
  };
  const body = el(
    "div",
    { class: "puzzle-comparison" },
    el("div", { class: "daily-puzzle-layout" }, ...cards.map(card => card.root)),
    el("div", { class: "puzzle-comparison-nav" }, previous, nav, next)
  );
  fillDialog(dialog, { title: t("풀이 비교"), body, notice, actions: [], closeId: "puzzle-comparison-close" });
  render();
  const cancelOnClose = () => {
    if (dialog.open && body.isConnected) return;
    job.cancel();
    dialog.removeEventListener("close", cancelOnClose);
  };
  dialog.addEventListener("close", cancelOnClose);
  dialog.showModal();
  job.promise.then(result => {
    if (!dialog.open || !body.isConnected || !result || !("comparison" in result)) return;
    if (result.comparison === "found") {
      paths[1] = result.alternative;
      ends[1] = completedBoard(paths[1]);
      const height = rowsFor(paths);
      if (height !== rows) {
        rows = height;
        cards.forEach(card => card.resize());
      }
      notice.textContent = t("서로 다른 첫 배치 2가지를 확인했어요.");
    } else {
      notice.textContent =
        result.comparison === "limit"
          ? t("탐색 제한에 도달했어요. 다른 첫 배치는 확인하지 못했어요.")
          : t("탐색 범위에서 다른 첫 배치를 찾지 못했어요.");
    }
    render();
  });
};
