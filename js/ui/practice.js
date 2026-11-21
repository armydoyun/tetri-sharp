// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { DRILLS } from "../modes/practice.js";
import { el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void, onLesson: () => void }} options */
export const createPracticeUI = ({ dialog, onPick, onLesson }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const lesson = {
        id: "finesse-lesson",
        name: t("피네스 훈련"),
        description: t("목표 배치 10개 · 내 입력과 최소 입력 비교"),
      };
      const drills = DRILLS.flatMap(d => (d.id === "finesse" ? [lesson, d] : [d]));
      const list = el(
        "div",
        { class: "menu-list practice-list" },
        ...[...drills.filter(drill => drill.id === "free"), ...drills.filter(drill => drill.id !== "free")].map(
          (d, i) => {
            const card = el(
              "button",
              { type: "button", class: "menu-row", "data-drill": d.id },
              el("span", { class: "menu-index num", text: String(i + 1).padStart(2, "0") }),
              el("span", { class: "menu-text" }, el("strong", { text: d.name }), el("small", { text: d.description })),
              icon("chevron-right")
            );
            card.addEventListener("click", () => {
              dialog.close();
              if (d === lesson) onLesson();
              else onPick(d);
            });
            return card;
          }
        )
      );
      notice.textContent = t("중력이 없어요. 소프트 드롭으로 내려 자리에 맞춰 돌려 넣으세요. 기록은 남지 않아요.");
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
