// CPU 대전 난이도 고르기 대화상자. 줄마다 [번호 | 난이도·속도 | 전적 | >]
import { LEVELS, STYLES, versusStatKey } from "../modes/versus.js";
import { choice, el, fieldRow, fillDialog } from "./dom.js";
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/**
 * @param {{ dialog: HTMLDialogElement, getStats: () => Record<string, { win: number, loss: number }>,
 *   onPick: (level: any, style: string) => void, getStyle: () => string, setStyle: (style: string) => void }} options
 */
export const createVersusUI = ({ dialog, getStats, onPick, getStyle, setStyle }) => {
  const notice = el("p", { class: "notice-slot", hidden: true });
  const api = {
    open() {
      const stats = getStats();
      const style = STYLES.some(x => x.id === getStyle()) ? getStyle() : "balanced";
      // 성향: 난이도 목록 위에서 고른다(마지막 선택을 기억). 전적은 성향마다 따로.
      const styleRow = fieldRow({
        id: "versus-style",
        label: t("성향"),
        hint: (STYLES.find(x => x.id === style) ?? STYLES[0]).hint,
        control: choice({
          id: "versus-style",
          label: t("성향"),
          options: STYLES.map(x => [x.id, x.name]),
          value: style,
          onChange: v => {
            setStyle(v);
            api.open();
            /** @type {HTMLElement | null} */ (dialog.querySelector(`#versus-style [data-value="${v}"]`))?.focus();
          },
        }),
      });
      const list = el(
        "div",
        { class: "menu-list" },
        ...LEVELS.map((level, i) => {
          const s = stats[versusStatKey(level.id, style)];
          const row = el(
            "button",
            { type: "button", class: "menu-row", "data-level": level.id },
            el("span", { class: "menu-index num", text: String(i + 1).padStart(2, "0") }),
            el(
              "span",
              { class: "menu-text" },
              el("strong", { text: level.name }),
              el("small", {
                // 난이도 차이: 속도·홀드에 더해 바닥에서 밀어 넣기, T-spin을 쓰는지
                text: [
                  t("초당 {pps}피스 · {hold}", {
                    pps: level.pps,
                    hold: !level.hold
                      ? t("홀드 안 씀")
                      : "holdMinGain" in level
                        ? t("홀드 제한적 사용")
                        : t("홀드 사용"),
                  }),
                  ...("spins" in level ? [t("T-spin")] : "tucks" in level ? [t("밀어 넣기")] : []),
                ].join(" · "),
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
            onPick(level, style);
          });
          return row;
        })
      );
      fillDialog(dialog, {
        title: t("CPU 대전"),
        body: el("div", {}, el("section", { class: "field-section" }, styleRow, list)),
        notice,
        actions: [],
        closeId: "versus-close",
      });
      if (!dialog.open) {
        dialog.showModal();
        /** @type {HTMLElement | null} */ (dialog.querySelector(".menu-row"))?.focus();
      }
    },
    get isOpen() {
      return dialog.open;
    },
  };
  return api;
};
