// 리플레이 공유 창: 링크 복사 · 파일 저장. 받은 사람은 링크를 열면 바로 재생하고 그 기록과 달릴 수 있다.
import { button, el, fieldRow, fillDialog } from "./dom.js";
import { t } from "../i18n/index.js";

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
  const copy = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  return {
    /** @param {any} replay @param {string} title */
    async open(replay, title) {
      const code = await makeCode(replay);
      const link = makeLink(code);
      const copyLink = button({
        text: t("링크 복사"),
        iconName: "link",
        className: "btn btn-primary btn-small",
        id: "share-link",
      });
      copyLink.addEventListener("click", async () => {
        notice.textContent = (await copy(link))
          ? t("링크를 복사했어요. 받은 사람이 열면 바로 재생하고 이 기록과 달릴 수 있어요")
          : t("복사하지 못했어요");
      });
      const save = button({
        text: t("파일로 저장"),
        iconName: "download",
        className: "btn btn-small",
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
            hint: t("배포 주소에서 열었을 때 쓸모 있어요"),
            control: el("span", { class: "inline-control" }, copyLink),
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
