// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { DRILLS } from "../modes/practice.js";
import { el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void }} options */
export const createPracticeUI = ({ dialog, onPick }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const list = el(
        "div",
        { class: "menu-list practice-list" },
        ...DRILLS.map((d, i) => {
          const card = el(
            "button",
            { type: "button", class: "menu-row", "data-drill": d.id },
            el("span", { class: "menu-index num", text: String(i + 1).padStart(2, "0") }),
            el("span", { class: "menu-text" }, el("strong", { text: d.name }), el("small", { text: d.description })),
            icon("chevron-right")
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
      /** @type {HTMLElement | null} */ (dialog.querySelector(".menu-row"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
