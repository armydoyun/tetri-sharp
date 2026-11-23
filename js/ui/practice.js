// 연습 고르기 대화상자: 종류를 누르면 바로 시작한다.
import { BUILD_LESSONS } from "../modes/build-lessons.js";
import { BATTLE_LESSONS } from "../modes/battle-lessons.js";
import { FINESSE_LESSONS } from "../modes/finesse-lessons.js";
import { INTRO_LESSONS } from "../modes/intro-lessons.js";
import { DOWNSTACK_LESSONS } from "../modes/downstack.js";
import { DRILLS } from "../modes/practice.js";
import { el, fillDialog } from "./dom.js";
import { button, menuRow } from "./components.js";
import { t } from "../i18n/index.js";

/** @param {{ dialog: HTMLDialogElement, onPick: (drill: any) => void, progress: ReturnType<typeof import("../storage/practice-progress.js").createPracticeProgress>, onStage: (mode: any) => void }} options */
export const createPracticeUI = ({ dialog, onPick, progress, onStage }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  const openStages = ({ name, lessons }) => {
    const completed = progress.read();
    const stages = lessons.map((mode, index) => {
      const result = completed[mode.id];
      return menuRow({
        index: index + 1,
        "data-practice-stage": mode.id,
        "data-downstack": mode.downstack && mode.id,
        title: mode.downstack?.title ?? mode.name,
        desc:
          result === "no-hints" && (mode.downstack || mode.buildLesson)
            ? t("힌트 없이 완료")
            : result
              ? t("완료")
              : mode.description,
        onClick: () => {
          dialog.close();
          onStage(mode);
        },
      });
    });
    const back = button({ label: t("연습 목록") });
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
        description: t("4줄 우물과 T-spin 자리를 직접 만들기"),
        lessons: BUILD_LESSONS,
      };
      // 쉬운 것부터(2차 평가 F28): 조작 → 피네스 → 우물·파내기 → 빌드 → T-spin → 퍼펙트 클리어 → CPU 대전
      const ORDER = [
        "free",
        "intro",
        "finesse-lesson",
        "finesse",
        "quad",
        "double",
        "downstack",
        "build-training",
        "tsd",
        "tst",
        "pc",
        "battle-training",
      ];
      const all = [intro, battle, build, downstack, lesson, ...DRILLS];
      const drills = [
        ...ORDER.map(id => all.find(d => d.id === id)).filter(Boolean),
        ...all.filter(d => !ORDER.includes(d.id)),
      ];
      const list = el(
        "div",
        { class: "menu-list practice-list" },
        ...drills.map((d, i) => {
          return menuRow({
            index: i + 1,
            "data-drill": d.id,
            title: d.name,
            desc: d.description,
            onClick: () => {
              if ("lessons" in d) return openStages(d);
              dialog.close();
              onPick(d);
            },
          });
        })
      );
      // 중력이 없는 것은 자리 연습(자유 쌓기·우물·T-spin·퍼펙트 클리어 등)뿐이다(F30). 입문·훈련 과정은 단계마다 안내한다
      notice.textContent = t("쉬운 것부터 놓았어요. 자리 연습은 중력이 없어요 — 소프트 드롭으로 내려 넣으세요.");
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
