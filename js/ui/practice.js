// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { DRILLS } from "../modes/practice.js";
import { el, fillDialog } from "./dom.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void }} options */
export const createPracticeUI = ({ dialog, onPick }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const list = el(
        "div",
        { class: "mode-list practice-list" },
        ...DRILLS.map(d => {
          const card = el(
            "button",
            { type: "button", class: "mode-card", "data-drill": d.id },
            el("strong", { text: d.name }),
            el("small", { text: d.description })
          );
          card.addEventListener("click", () => {
            dialog.close();
            onPick(d);
          });
          return card;
        })
      );
      notice.textContent = t("중력이 없고 기록은 남지 않아요. 지금 고른 규칙으로 연습해요.");
      fillDialog(dialog, {
        title: t("연습"),
        body: el("div", {}, el("section", { class: "field-section" }, list)),
        notice,
        actions: [],
        closeId: "practice-close",
      });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(".mode-card"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
