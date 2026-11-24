// 퍼즐 단계 고르기 대화상자: 장(판 비우기 · T-spin Double · T-spin Triple)마다 번호 칸 격자.
// 깬 단계는 체크, 다음에 할 단계는 강조.
import { CHAPTERS, KIND_NAMES, PUZZLES } from "../modes/puzzles.js";
import { el, fillDialog } from "./dom.js";
import { button } from "./components.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/**
 * @param {{ dialog: HTMLDialogElement, progress: ReturnType<typeof import("../modes/puzzles.js").createPuzzleProgress>, onPick: (puzzle: any) => void, onCreate: () => void }} options
 */
/** 장마다 한 줄 목표 */
const CHAPTER_GOALS = Object.freeze({
  pc: t("아래 두 줄을 모두 지워 판 비우기"),
  quad: t("우물을 남겨 채운 뒤 마지막 I로 4줄"),
  combo: t("피스마다 한 줄 이상 지워 콤보 잇기"),
  tuck: t("내린 뒤 처마 아래로 밀어 넣어 2줄"),
  spin: t("틈 앞에서 돌려 끼워 넣어 2줄"),
  mini: t("T를 마지막에 돌려 넣어 Mini로 한 줄"),
  tsd: t("T 하나로 T-spin Double"),
  tst: t("T 하나로 T-spin Triple"),
});

export const createPuzzleUI = ({ dialog, progress, onPick, onCreate }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    /** @param {number} [focusNumber] 포커스를 둘 단계(게임에서 "퍼즐 목록으로" 돌아왔을 때 방금 한 단계) */
    open(focusNumber) {
      const cleared = progress.cleared();
      const next = progress.next().number;
      const tile = p => {
        const done = cleared.has(p.id);
        const b = el(
          "button",
          {
            type: "button",
            class: `puzzle-tile${done ? " is-done" : ""}${p.number === next && !done ? " is-next" : ""}`,
            "data-puzzle": String(p.number),
            "aria-label": t("{n}단계 · {kind} · 피스 {count}개{done}", {
              n: p.number,
              kind: KIND_NAMES[p.kind],
              count: p.pieces.length,
              done: done ? ` · ${t("깸")}` : "",
            }),
          },
          el("strong", { class: "num", text: String(p.number) }),
          el("small", { text: t("{n}피스", { n: p.pieces.length }) }),
          ...(done ? [icon("check")] : [])
        );
        b.addEventListener("click", () => {
          dialog.close();
          onPick(p);
        });
        return b;
      };
      // 장마다: 제목(깬 수 / 단계 수) + 번호 칸 격자. 장 안에서는 피스가 적은 것부터.
      const grid = el(
        "div",
        { class: "puzzle-chapters" },
        ...CHAPTERS.map(kind => {
          const stages = PUZZLES.filter(p => p.kind === kind);
          const done = stages.filter(p => cleared.has(p.id)).length;
          return el(
            "section",
            { class: "puzzle-chapter", "data-chapter": kind },
            el(
              "h3",
              { class: "puzzle-chapter-title" },
              el("span", { text: KIND_NAMES[kind] }),
              el("small", { class: "num", text: `${done} / ${stages.length}` })
            ),
            // 장마다 한 줄 목표(예전: 맨 위 긴 문단 하나 — 장이 늘며 휴대폰에서 일곱 줄이 됐다, 4차 평가 U51)
            el("p", { class: "puzzle-chapter-goal", text: CHAPTER_GOALS[kind] }),
            el("div", { class: "puzzle-grid" }, ...stages.map(tile))
          );
        })
      );
      notice.textContent = t("{done} / {total}단계 깸 · 중력 없음, 정해진 피스만 써요", {
        done: cleared.size,
        total: PUZZLES.length,
      });
      const create = button({ id: "puzzle-create", label: t("퍼즐 만들기") });
      create.addEventListener("click", () => {
        dialog.close();
        onCreate();
      });
      fillDialog(dialog, {
        title: t("퍼즐"),
        body: el("div", {}, el("p", { class: "field-help", text: t("장마다 쉬운 것부터 차례로 풀어요.") }), grid),
        notice,
        actions: [create],
        closeId: "puzzle-close",
      });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(`[data-puzzle="${focusNumber ?? next}"]`))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
