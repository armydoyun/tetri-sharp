// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { DOWNSTACK_LESSONS } from "../modes/downstack.js";
import { DRILLS } from "../modes/practice.js";
import { button, el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void, onLesson: () => void, onDownstack: (mode: (typeof DOWNSTACK_LESSONS)[number]) => void }} options */
export const createPracticeUI = ({ dialog, onPick, onLesson, onDownstack }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  const openDownstack = () => {
    const stages = DOWNSTACK_LESSONS.map(mode => {
      const stage = el(
        "button",
        { type: "button", class: "menu-row", "data-downstack": mode.id },
        el(
          "span",
          { class: "menu-text" },
          el("strong", { text: mode.downstack.title }),
          el("small", { text: mode.name })
        ),
        icon("chevron-right")
      );
      stage.addEventListener("click", () => {
        dialog.close();
        onDownstack(mode);
      });
      return stage;
    });
    const back = button({ text: t("연습 목록") });
    back.addEventListener("click", () => ui.open());
    notice.textContent = t("같은 판에서 힌트를 보고 여러 번 연습할 수 있어요.");
    fillDialog(dialog, {
      title: t("쓰레기 줄 파내기"),
      body: el("div", {}, el("section", { class: "field-section menu-list practice-list" }, ...stages)),
      notice,
      actions: [back],
      closeId: "practice-close",
    });
    stages[0].focus();
  };
  const ui = {
    open() {
      const lesson = {
        id: "finesse-lesson",
        name: t("피네스 훈련"),
        description: t("목표 배치 10개 · 내 입력과 최소 입력 비교"),
      };
      const downstack = {
        id: "downstack",
        name: t("쓰레기 줄 파내기"),
        description: t("고정된 판 6개 · 구멍과 다음 배치 힌트"),
      };
      const drills = DRILLS.flatMap(d => (d.id === "finesse" ? [downstack, lesson, d] : [d]));
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
              if (d === downstack) return openDownstack();
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
      if (!dialog.open) dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(".menu-row"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
  return ui;
};
