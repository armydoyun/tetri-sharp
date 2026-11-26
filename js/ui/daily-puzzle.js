import { PUZZLE_CELLS } from "../modes/custom-puzzle.js";
import { GARBAGE } from "../core/pieces.js";
import { t } from "../i18n/index.js";
import { recentDailyKeys } from "../modes/daily.js";
import { dailyPuzzleInfo, dailyPuzzleLevel, dailyPuzzleTitle } from "../modes/daily-puzzle.js";
import { createDailyPuzzleBoard } from "../render/daily-puzzle-board.js";
import { findTheme, paletteFor } from "../render/themes.js";
import { button } from "./components.js";
import { dropdown } from "./select.js";
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
  /** @type {Map<string, NonNullable<import("../app/solver.js").DailyResult>>} */
  const cache = new Map();

  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    pending?.cancel();
    pending = null;
  });

  return {
    get isOpen() {
      return dialog.open;
    },
    open(key) {
      if (dialog.open) return;
      pending?.cancel();
      pending = null;
      const recent = recentDailyKeys();
      let selected = key ?? recent[0];
      const dates = recent.includes(selected) ? recent : [...recent, selected];
      for (const day of cache.keys()) if (!dates.includes(day)) cache.delete(day);
      const datePicker = dropdown({
        id: "daily-puzzle-date",
        label: t("최근 7일"),
        options: dates.map(date => {
          const label = date === recent[0] ? t("오늘 · {date}", { date }) : date;
          return { value: date, label: progress.solved(date) ? t("{date} · 완료", { date: label }) : label };
        }),
        value: selected,
        onChange: date => {
          selected = date;
          load();
        },
      });
      const title = el("h3", { id: "daily-puzzle-name", text: "—" });
      const detail = el("p", { class: "field-help", id: "daily-puzzle-type", text: "—" });
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
          const day = cache.get(selected);
          if (!day) return;
          dialog.close();
          onPlay(day);
        },
      });
      const body = el(
        "div",
        { class: "daily-puzzle-body" },
        el(
          "div",
          { class: "daily-puzzle-picker" },
          el("span", { class: "field-label", text: t("최근 7일") }),
          datePicker
        ),
        el(
          "div",
          { class: "daily-puzzle-layout" },
          canvas,
          el(
            "div",
            { class: "daily-puzzle-info" },
            title,
            detail,
            level,
            objective,
            el("div", {}, el("p", { class: "field-help", text: t("피스 순서") }), pieces)
          )
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
        title.textContent = dailyPuzzleTitle(day.family, day.key, day.cells);
        detail.textContent = info.title;
        level.textContent = dailyPuzzleLevel(day.level);
        objective.textContent = info.description;
        pieces.textContent = [...day.pieces].join(" · ");
        paint(day.cells.map(value => value * GARBAGE));
        status.textContent = progress.solved(day.key) ? t("이 퍼즐을 풀었어요.") : "";
        play.disabled = false;
      };

      const load = () => {
        pending?.cancel();
        pending = null;
        const date = selected;
        const cached = cache.get(date);
        if (cached) {
          show(cached);
          return;
        }
        play.disabled = true;
        title.textContent = detail.textContent = level.textContent = objective.textContent = pieces.textContent = "—";
        paint(new Uint8Array(PUZZLE_CELLS));
        status.textContent = t("퍼즐을 만드는 중이에요…");
        const job = solver.generateDaily(date);
        pending = job;
        job.promise.then(day => {
          if (pending !== job || !dialog.open || selected !== date) return;
          pending = null;
          if (!day) {
            status.textContent = t("퍼즐을 만들지 못했어요. 창을 닫고 다시 열어 주세요.");
            return;
          }
          cache.set(date, day);
          show(day);
        });
      };
      dialog.showModal();
      load();
      /** @type {HTMLElement} */ (dialog.querySelector("#daily-puzzle-close")).focus();
    },
  };
};
