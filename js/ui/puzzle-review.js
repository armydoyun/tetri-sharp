import { WIDTH, VISIBLE_ROWS } from "../core/board.js";
import { t } from "../i18n/index.js";
import { createDailyPuzzleBoard } from "../render/daily-puzzle-board.js";
import { findTheme, paletteFor } from "../render/themes.js";
import { button } from "./components.js";
import { el, fillDialog } from "./dom.js";

export const showPuzzleReview = ({ dialog, review, reason, visual, onReplay, onPractice }) => {
  const rows = Math.min(
    VISIBLE_ROWS,
    Math.max(
      7,
      ...[review.cells, review.after].map(cells => {
        const first = cells.findIndex(Boolean);
        return first < 0 ? 0 : Math.ceil((cells.length - first) / WIDTH);
      })
    )
  );
  const theme = findTheme(visual.theme);
  const palette = paletteFor(visual, theme);
  const board = (caption, cells) => {
    const canvas = /** @type {HTMLCanvasElement} */ (
      el("canvas", { class: "daily-puzzle-board", role: "img", "aria-label": caption })
    );
    createDailyPuzzleBoard(canvas, rows)(cells, theme, palette, visual.grid !== "off");
    return el("figure", {}, el("figcaption", { text: caption }), canvas);
  };
  const notice = el("p", { class: "notice-slot", role: "status" });
  const practice = button({
    label: t("이 수부터 연습"),
    icon: "play",
    variant: "primary",
    onClick: async () => {
      practice.disabled = true;
      try {
        await onPractice();
      } catch {
        if (dialog.open) notice.textContent = t("이 수를 불러오지 못했어요.");
      } finally {
        practice.disabled = false;
      }
    },
  });
  const actions = onReplay ? [button({ label: t("전체 리플레이"), onClick: onReplay }), practice] : [practice];
  fillDialog(dialog, {
    title: t("마지막 수 다시 보기"),
    body: el(
      "div",
      { class: "daily-puzzle-body" },
      el("p", { class: "field-help", text: reason }),
      el(
        "div",
        { class: "daily-puzzle-layout puzzle-review-boards" },
        board(t("놓기 전"), review.cells),
        board(t("놓은 뒤"), review.after)
      )
    ),
    notice,
    actions,
    closeId: "puzzle-review-close",
  });
  dialog.showModal();
  dialog.querySelector("#puzzle-review-close")?.focus();
};
