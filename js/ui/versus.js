// CPU 대전 난이도 고르기 대화상자. 줄마다 [번호 | 난이도·속도 | 전적 | >]
import { LEVELS } from "../modes/versus.js";
import { el, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/**
 * @param {{ dialog: HTMLDialogElement, getStats: () => Record<string, { win: number, loss: number }>, onPick: (level: any) => void }} options
 */
export const createVersusUI = ({ dialog, getStats, onPick }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  return {
    open() {
      const stats = getStats();
      const list = el(
        "div",
        { class: "menu-list" },
        ...LEVELS.map((level, i) => {
          const s = stats[level.id];
          const row = el(
            "button",
            { type: "button", class: "menu-row", "data-level": level.id },
            el("span", { class: "menu-index num", text: String(i + 1).padStart(2, "0") }),
            el(
              "span",
              { class: "menu-text" },
              el("strong", { text: level.name }),
              el("small", {
                text: t("초당 {pps}피스 · {hold}", {
                  pps: level.pps,
                  hold: level.hold ? t("홀드 사용") : t("홀드 안 씀"),
                }),
              })
            ),
            el("span", {
              class: "mode-best num",
              text: s && s.win + s.loss ? t("{win}승 {loss}패", { win: s.win, loss: s.loss }) : "",
            }),
            icon("chevron-right")
          );
          row.addEventListener("click", () => {
            dialog.close();
            onPick(level);
          });
          return row;
        })
      );
      notice.textContent = t("같은 블록 순서로 동시에 시작해요. 줄을 지우면 상대에게 쓰레기 줄을 보내요.");
      fillDialog(dialog, {
        title: t("CPU 대전"),
        body: el("div", {}, el("section", { class: "field-section" }, list)),
        notice,
        actions: [],
        closeId: "versus-close",
      });
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(".menu-row"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
