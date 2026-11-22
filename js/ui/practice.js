// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { BUILD_LESSONS } from "../modes/build-lessons.js";
import { BATTLE_LESSONS } from "../modes/battle-lessons.js";
import { FINESSE_LESSONS } from "../modes/finesse-lessons.js";
import { INTRO_LESSONS } from "../modes/intro-lessons.js";
import { DOWNSTACK_LESSONS } from "../modes/downstack.js";
import { DRILLS } from "../modes/practice.js";
import { button, el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void, progress: ReturnType<typeof import("../storage/practice-progress.js").createPracticeProgress>, onStage: (mode: any) => void }} options */
export const createPracticeUI = ({ dialog, onPick, progress, onStage }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  const openStages = ({ name, lessons }) => {
    const completed = progress.read();
    const stages = lessons.map((mode, index) => {
      const result = completed[mode.id];
      const stage = el(
        "button",
        {
          type: "button",
          class: "menu-row",
          "data-practice-stage": mode.id,
          "data-downstack": mode.downstack && mode.id,
        },
        el("span", { class: "menu-index num", text: String(index + 1).padStart(2, "0") }),
        el(
          "span",
          { class: "menu-text" },
          el("strong", { text: mode.downstack?.title ?? mode.name }),
          el("small", {
            text:
              result === "no-hints" && (mode.downstack || mode.buildLesson)
                ? t("힌트 없이 완료")
                : result
                  ? t("완료")
                  : mode.description,
          })
        ),
        icon("chevron-right")
      );
      stage.addEventListener("click", () => {
        dialog.close();
        onStage(mode);
      });
      return stage;
    });
    const back = button({ text: t("연습 목록") });
    back.addEventListener("click", () => ui.open());
    notice.textContent = t("원하는 단계를 골라 다시 연습할 수 있어요.");
    fillDialog(dialog, {
      title: name,
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
        lessons: FINESSE_LESSONS,
      };
      const downstack = {
        id: "downstack",
        name: t("쓰레기 줄 파내기"),
        description: t("고정된 판 6개 · 구멍과 다음 배치 힌트"),
        lessons: DOWNSTACK_LESSONS,
      };
      const intro = {
        id: "intro",
        name: t("기본 조작 연습"),
        description: t("이동·회전·홀드·첫 줄 지우기"),
        lessons: INTRO_LESSONS,
      };
      const battle = {
        id: "battle-training",
        name: t("CPU 대전 입문"),
        description: t("공격·상쇄·반격을 한 수씩 연습"),
        lessons: BATTLE_LESSONS,
      };
      const build = {
        id: "build-training",
        name: t("빌드 연습"),
        description: t("4줄 우물과 T스핀 자리를 직접 만들기"),
        lessons: BUILD_LESSONS,
      };
      const drills = [
        intro,
        battle,
        build,
        ...DRILLS.flatMap(d => (d.id === "finesse" ? [downstack, lesson, d] : [d])),
      ];
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
              if ("lessons" in d) return openStages(d);
              dialog.close();
              onPick(d);
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
