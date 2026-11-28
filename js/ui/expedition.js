import { EXPEDITION_CHAPTERS, EXPEDITION_STAGES } from "../modes/expedition.js";
import { t } from "../i18n/index.js";
import { menuRow } from "./components.js";
import { el, fillDialog } from "./dom.js";

/** @param {{ dialog: HTMLDialogElement, progress: ReturnType<typeof import("../storage/expedition-progress.js").createExpeditionProgress>, onStage: (mode: any) => void }} options */
export const createExpeditionUI = ({ dialog, progress, onStage }) => ({
  open(focusId = "") {
    const results = progress.read();
    const rows = EXPEDITION_STAGES.map((stage, index) => {
      const result = results[stage.id];
      const locked = !result && index > 0 && !results[EXPEDITION_STAGES[index - 1].id];
      return menuRow({
        index: index + 1,
        "data-expedition-stage": stage.id,
        disabled: locked,
        title: stage.name,
        desc: `${stage.description} ${t("추가 목표 · {goal}", { goal: stage.bonus })}`,
        meta: locked ? t("잠김") : result === "bonus" ? t("추가 목표 달성") : result ? t("완료") : "",
        onClick: () => {
          dialog.close();
          onStage(stage);
        },
      });
    });
    const chapters = EXPEDITION_CHAPTERS.map((title, index) =>
      el(
        "section",
        { class: "field-section" },
        el("h3", { class: "section-title", text: title }),
        el("div", { class: "menu-list", role: "group", "aria-label": title }, ...rows.slice(index * 4, (index + 1) * 4))
      )
    );
    fillDialog(dialog, {
      title: t("규칙 원정"),
      body: el("div", {}, ...chapters),
      notice: el("p", {
        class: "notice-slot",
        text: t("{n} / {total}단계 완료", { n: Object.keys(results).length, total: rows.length }),
      }),
      actions: [],
      closeId: "expedition-close",
    });
    dialog.showModal();
    const focus = rows.find(row => row.dataset.expeditionStage === focusId && !row.disabled);
    (focus ?? rows.find(row => !row.disabled && !results[row.dataset.expeditionStage]) ?? rows[0]).focus();
  },
});
