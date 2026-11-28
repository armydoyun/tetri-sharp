import { t } from "../i18n/index.js";
import { TIME_SHIFT_STAGES } from "../modes/time-shift.js";
import { menuRow } from "./components.js";
import { el, fillDialog } from "./dom.js";

/** @param {{
 *   dialog: HTMLDialogElement,
 *   progress: ReturnType<typeof import("../storage/time-shift-progress.js").createTimeShiftProgress>,
 *   onStage: (stage: typeof TIME_SHIFT_STAGES[number]) => void,
 * }} options */
export const createTimeShiftUI = ({ dialog, progress, onStage }) => ({
  open(focusId = "") {
    const cleared = progress.read();
    const rows = TIME_SHIFT_STAGES.map((stage, index) => {
      const complete = cleared.includes(stage.id);
      const locked = !complete && index > 0 && !cleared.includes(TIME_SHIFT_STAGES[index - 1].id);
      return menuRow({
        index: index + 1,
        "data-time-shift-stage": stage.id,
        title: stage.title(),
        desc: stage.goal(),
        meta: locked ? t("잠김") : complete ? t("완료") : "",
        disabled: locked,
        onClick: () => {
          dialog.close();
          onStage(stage);
        },
      });
    });
    fillDialog(dialog, {
      title: t("시간차 단계 목록"),
      body: el("div", { class: "menu-list" }, ...rows),
      notice: el("p", {
        class: "notice-slot",
        text: t("{n} / {total}단계 완료", { n: cleared.length, total: rows.length }),
      }),
      actions: [],
      closeId: "time-shift-close",
    });
    dialog.showModal();
    const focus = rows.find(row => row.dataset.timeShiftStage === focusId && !row.disabled);
    (focus ?? rows.find(row => !row.disabled && !cleared.includes(row.dataset.timeShiftStage)) ?? rows[0]).focus();
  },
});
