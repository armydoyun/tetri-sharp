// 퍼즐 단계 고르기 대화상자: 번호 칸 격자. 깬 단계는 체크, 다음에 할 단계는 강조.
import { KIND_NAMES, PUZZLES } from "../modes/puzzles.js";
import { el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/**
 * @param {{ dialog: HTMLDialogElement, progress: ReturnType<typeof import("../modes/puzzles.js").createPuzzleProgress>, onPick: (puzzle: any) => void }} options
 */
export const createPuzzleUI = ({ dialog, progress, onPick }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const cleared = progress.cleared();
      const next = progress.next().number;
      const grid = el(
        "div",
        { class: "puzzle-grid" },
        ...PUZZLES.map(p => {
          const done = cleared.has(p.number);
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
            el("small", { text: p.kind === "pc" ? t("{n}피스", { n: p.pieces.length }) : KIND_NAMES[p.kind] }),
            ...(done ? [icon("check")] : [])
          );
          b.addEventListener("click", () => {
            dialog.close();
            onPick(p);
          });
          return b;
        })
      );
      notice.textContent = t("{done} / {total}단계 깸 · 중력 없음, 정해진 피스만 써요", {
        done: cleared.size,
        total: PUZZLES.length,
      });
      fillDialog(dialog, {
        title: t("퍼즐"),
        body: el(
          "div",
          {},
          el("p", {
            class: "field-help",
            text: t("판 비우기는 주어진 피스로 아래 두 줄을 모두 지우고, T-spin은 T 하나로 해내요."),
          }),
          grid
        ),
        notice,
        actions: [],
        closeId: "puzzle-close",
      });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(`[data-puzzle="${next}"]`))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
