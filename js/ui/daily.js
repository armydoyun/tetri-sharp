// 오늘의 도전 대화상자: 도전하기 · 내 결과 공유(코드·링크) · 받은 코드로 겨루기
import { button, el, fieldRow, fillDialog } from "./dom.js";
import { t } from "../i18n/index.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getToday: () => { key: string, best: any, replay: any },
 *   makeCode: (replay: any) => Promise<string>,
 *   makeLink: (code: string) => string,
 *   formatRecord: (entry: any) => string,
 *   onStart: () => void,
 *   onRace: (text: string) => Promise<string | null>,  실패하면 알림 문구
 * }} options
 */
export const createDailyUI = ({ dialog, getToday, makeCode, makeLink, formatRecord, onStart, onRace }) => {
  const notice = el("p", { class: "notice-slot", role: "status", id: "daily-notice" });

  const copy = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const render = async (pasted = "") => {
    const { key, best, replay } = getToday();
    const code = replay ? await makeCode(replay) : "";
    const play = button({ text: t("도전하기"), iconName: "play", className: "btn btn-primary", id: "daily-start" });
    play.addEventListener("click", () => {
      dialog.close();
      onStart();
    });

    const codeInput = el("input", {
      id: "daily-code",
      class: "text-input num",
      type: "text",
      value: code,
      readOnly: true,
      placeholder: t("오늘 기록을 세우면 생겨요"),
    });
    const copyCode = button({ text: t("복사"), iconName: "copy", className: "btn btn-small", id: "daily-copy" });
    copyCode.disabled = !code;
    copyCode.addEventListener("click", async () => {
      const ok = await copy(code);
      notice.textContent = ok
        ? t("결과 코드를 복사했어요. 친구에게 보내 보세요")
        : t("복사하지 못했어요. 코드를 선택해 직접 복사해 주세요");
      if (!ok) /** @type {HTMLInputElement} */ (codeInput).select();
    });
    const copyLink = button({ text: t("링크 복사"), iconName: "link", className: "btn btn-small", id: "daily-link" });
    copyLink.disabled = !code;
    copyLink.addEventListener("click", async () => {
      notice.textContent = (await copy(makeLink(code)))
        ? t("링크를 복사했어요. 받은 사람이 열면 내 기록과 겨룰 수 있어요")
        : t("복사하지 못했어요");
    });

    const pasteInput = /** @type {HTMLInputElement} */ (
      el("input", {
        id: "daily-paste",
        class: "text-input num",
        type: "text",
        value: pasted,
        placeholder: t("TD1-로 시작하는 코드나 링크"),
        autocomplete: "off",
        spellcheck: false,
      })
    );
    const race = button({ text: t("겨루기"), iconName: "play", className: "btn btn-small", id: "daily-race" });
    const doRace = async () => {
      const problem = await onRace(pasteInput.value);
      if (problem) notice.textContent = problem;
      else dialog.close();
    };
    race.addEventListener("click", doRace);
    pasteInput.addEventListener("keydown", e => {
      if (e.key === "Enter") doRace();
    });

    const body = el(
      "div",
      {},
      el(
        "section",
        { class: "field-section daily-head" },
        el(
          "div",
          { class: "daily-today" },
          el("strong", { class: "num", text: key }),
          el("small", { text: t("Sprint 40L · Modern · 모두 같은 블록 순서") }),
          el("span", {
            class: "daily-best num",
            id: "daily-best",
            text: best ? t("오늘 최고 기록 {record}", { record: formatRecord(best) }) : t("아직 오늘 기록이 없어요"),
          })
        ),
        play
      ),
      el("h3", { class: "daily-section", text: t("내 결과 공유") }),
      el(
        "section",
        { class: "field-section" },
        fieldRow({
          id: "daily-code",
          label: t("결과 코드"),
          hint: t("오늘 최고 기록의 리플레이"),
          control: el("span", { class: "inline-control" }, codeInput, copyCode),
        }),
        fieldRow({
          id: "daily-link",
          label: t("공유 링크"),
          hint: t("배포 주소에서 열었을 때 쓸모 있어요"),
          control: el("span", { class: "inline-control" }, copyLink),
        })
      ),
      el("h3", { class: "daily-section", text: t("받은 결과와 겨루기") }),
      el(
        "section",
        { class: "field-section" },
        fieldRow({
          id: "daily-paste",
          label: t("받은 코드"),
          hint: t("같은 날 같은 블록 순서로 상대 리플레이와 함께 달려요"),
          control: el("span", { class: "inline-control" }, pasteInput, race),
        })
      )
    );
    fillDialog(dialog, { title: t("오늘의 도전"), body, notice, actions: [], closeId: "daily-close" });
  };

  return {
    /** @param {{ pasted?: string, message?: string }} [o] */
    async open(o = {}) {
      notice.textContent = o.message ?? "";
      await render(o.pasted ?? "");
      if (!dialog.open) dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(o.pasted ? "#daily-race" : "#daily-start"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
