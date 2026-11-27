// 앱 안의 확인 대화상자(브라우저 기본 확인창 window.confirm 대신). 다른 대화상자와 같은 틀(fillDialog)을 쓴다.
// 대화상자 안의 한 버튼은 confirmButton(두 번 눌러 확정)을 쓰고, 이것은 대화상자 밖 흐름(새 판 시작, 백업 불러오기)에 쓴다.
// "취소"·Esc·바깥으로 닫으면 취소(false), 확인 버튼을 누르면 true.
import { el, fillDialog } from "./dom.js";
import { button } from "./components.js";
import { t } from "../i18n/index.js";

/**
 * @param {HTMLDialogElement} dialog
 * @returns {(o: { title: string, message: string | string[], details?: string[], okLabel: string, okIcon?: import("./icons.js").IconName }) => Promise<boolean>}
 */
export const createAsk =
  dialog =>
  ({ title, message, details = [], okLabel, okIcon }) =>
    new Promise(resolve => {
      let answer = false;
      const ok = button({
        label: okLabel,
        icon: okIcon,
        variant: "primary",
        id: "ask-ok",
        onClick: () => {
          answer = true;
          dialog.close();
        },
      });
      const lines = Array.isArray(message) ? message : [message];
      fillDialog(dialog, {
        title,
        body: el(
          "div",
          { class: "ask-body" },
          ...lines.map(text => el("p", { text })),
          ...(details.length
            ? [el("ul", { class: "rule-change-list" }, ...details.map(text => el("li", { text })))]
            : [])
        ),
        notice: el("p", { class: "notice-slot", role: "status" }),
        actions: [ok],
        closeId: "ask-cancel",
        // 묻는 창의 닫기는 "취소"(다른 대화상자는 "닫기")
        closeLabel: t("취소"),
      });
      dialog.addEventListener("close", () => resolve(answer), { once: true });
      dialog.showModal();
      ok.focus();
    });
