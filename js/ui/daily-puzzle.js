import { PUZZLE_CELLS } from "../modes/custom-puzzle.js";
import { GARBAGE } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { dateKey } from "../modes/daily.js";
import { dailyPuzzleInfo, dailyPuzzleLevel } from "../modes/daily-puzzle.js";
import { createDailyPuzzleBoard } from "../render/daily-puzzle-board.js";
import { findTheme, paletteFor } from "../render/themes.js";
import { button } from "./components.js";
import { el, fillDialog } from "./dom.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   solver: ReturnType<typeof import("../app/solver.js").createSolver>,
 *   progress: ReturnType<typeof import("../storage/daily-puzzle.js").createDailyPuzzleProgress>,
 *   getVisual: () => import("../render/canvas.js").Visual,
 *   onPlay: (day: NonNullable<import("../app/solver.js").DailyResult>) => void,
 * }} options
 */
export const createDailyPuzzleUI = ({ dialog, solver, progress, getVisual, onPlay }) => {
  /** @type {ReturnType<typeof solver.generateDaily> | null} */
  let pending = null;
  /** @type {NonNullable<import("../app/solver.js").DailyResult> | null} */
  let cached = null;

  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    pending?.cancel();
    pending = null;
  });

  return {
    get isOpen() {
      return dialog.open;
    },
    open(key = dateKey()) {
      if (dialog.open) return;
      pending?.cancel();
      pending = null;
      const title = el("h3", { id: "daily-puzzle-name", text: "—" });
      const level = el("p", { id: "daily-puzzle-level", class: "field-help", text: "—" });
      const objective = el("p", { id: "daily-puzzle-goal", class: "field-help", text: "—" });
      const pieces = el("p", { id: "daily-puzzle-pieces", class: "num", text: "—" });
      const canvas = /** @type {HTMLCanvasElement} */ (
        el("canvas", { class: "daily-puzzle-board", role: "img", "aria-labelledby": title.id })
      );
      const draw = createDailyPuzzleBoard(canvas);
      const visual = getVisual();
      const theme = findTheme(visual.theme);
      const paint = cells => draw(cells, theme, paletteFor(visual, theme), visual.grid !== "off");
      const status = el("p", { id: "daily-puzzle-status", class: "notice-slot", role: "status" });
      const play = button({
        id: "daily-puzzle-play",
        variant: "primary",
        icon: "play",
        label: t("플레이"),
        disabled: true,
        onClick: () => {
          if (cached?.key !== key) return;
          dialog.close();
          onPlay(cached);
        },
      });
      const body = el(
        "div",
        { class: "daily-puzzle-layout" },
        canvas,
        el(
          "div",
          { class: "daily-puzzle-info" },
          el("p", { class: "num", text: key }),
          title,
          level,
          objective,
          el("div", {}, el("p", { class: "field-help", text: t("피스 순서") }), pieces)
        )
      );
      fillDialog(dialog, {
        title: t("오늘의 퍼즐"),
        body,
        notice: status,
        actions: [play],
        closeId: "daily-puzzle-close",
      });
      const show = day => {
        const info = dailyPuzzleInfo(day.family, day.goal.kind);
        title.textContent = info.title;
        level.textContent = dailyPuzzleLevel(info.level);
        objective.textContent = info.description;
        pieces.textContent = [...day.pieces].join(" · ");
        paint(day.cells.map(value => value * GARBAGE));
        status.textContent = progress.solved(key) ? t("이 퍼즐을 풀었어요.") : "";
        play.disabled = false;
      };

      if (cached?.key === key) show(cached);
      else {
        paint(new Uint8Array(PUZZLE_CELLS));
        status.textContent = t("오늘의 퍼즐을 만드는 중이에요…");
        const job = solver.generateDaily(key);
        pending = job;
        job.promise.then(day => {
          if (pending !== job || !dialog.open) return;
          pending = null;
          if (!day) {
            status.textContent = t("퍼즐을 만들지 못했어요. 창을 닫고 다시 열어 주세요.");
            return;
          }
          cached = day;
          show(day);
        });
      }
      dialog.showModal();
      /** @type {HTMLElement} */ (dialog.querySelector("#daily-puzzle-close")).focus();
    },
  };
};
