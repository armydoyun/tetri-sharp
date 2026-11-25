// 리플레이 공유 창: 링크 복사 · 파일 저장. 받은 사람은 링크를 열면 바로 재생하고 그 기록과 달릴 수 있다.
import { el, fieldRow, fillDialog } from "./dom.js";
import { button, textInput } from "./components.js";
import { t } from "../i18n/index.js";
import { copyText } from "./clipboard.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   makeCode: (replay: any) => Promise<string>,
 *   makeLink: (code: string) => string,
 *   onSaveFile: (replay: any) => void,
 * }} options
 */
export const createShareUI = ({ dialog, makeCode, makeLink, onSaveFile }) => {
  const notice = el("p", { class: "notice-slot", role: "status", id: "share-notice" });

  return {
    /** @param {any} replay @param {string} title */
    async open(replay, title) {
      const code = await makeCode(replay);
      const link = makeLink(code);
      const copyLink = button({
        label: t("링크 복사"),
        icon: "link",
        variant: "primary",
        size: "s",
        id: "share-link",
      });
      const linkInput = textInput({
        type: "url",
        value: link,
        readOnly: true,
        hidden: true,
        "aria-label": t("공유 링크"),
      });
      copyLink.addEventListener("click", async () => {
        const copied = await copyText(link);
        notice.textContent = copied
          ? t("링크를 복사했어요. 받은 사람이 열면 바로 재생하고 이 기록과 달릴 수 있어요")
          : t("자동 복사가 막혔어요. 선택된 링크를 직접 복사해 주세요.");
        if (!copied) {
          linkInput.hidden = false;
          linkInput.focus();
          linkInput.select();
        }
      });
      const save = button({
        label: t("파일로 저장"),
        icon: "download",
        size: "s",
        id: "share-file",
      });
      save.addEventListener("click", () => {
        onSaveFile(replay);
        notice.textContent = t("리플레이 파일을 저장했어요");
      });
      const body = el(
        "div",
        {},
        el("p", { class: "field-help", text: title }),
        el(
          "section",
          { class: "field-section" },
          fieldRow({
            id: "share-link",
            label: t("공유 링크"),
            hint: t("받은 사람이 링크를 열면 바로 재생할 수 있어요."),
            control: el("div", { class: "share-link-control" }, copyLink, linkInput),
          }),
          fieldRow({
            id: "share-file",
            label: t("파일"),
            hint: t("메신저로 보내거나 보관할 때"),
            control: el("span", { class: "inline-control" }, save),
          })
        )
      );
      notice.textContent = "";
      fillDialog(dialog, { title: t("리플레이 공유"), body, notice, actions: [], closeId: "share-close" });
      dialog.showModal();
      copyLink.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
