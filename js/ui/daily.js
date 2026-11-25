// 오늘의 도전 대화상자: 도전하기 · 내 결과 공유(코드·링크) · 받은 코드로 겨루기
import { el, fieldRow, fillDialog } from "./dom.js";
import { button, textInput } from "./components.js";
import { t } from "../i18n/index.js";
import { dropdown } from "./select.js";
import { copyText } from "./clipboard.js";

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   dates: () => string[],
 *   getEntry: (date: string) => { mode: ReturnType<typeof import("../modes/daily.js").dailyMode>, best: any, replay: any },
 *   makeCode: (replay: any) => Promise<string>,
 *   makeLink: (code: string) => string,
 *   onStart: (mode: ReturnType<typeof import("../modes/daily.js").dailyMode>) => void,
 *   onWatch: (replay: any) => void,
 *   onRace: (text: string) => Promise<string | null>,
 * }} options  onRace는 실패하면 알림 문구를 돌려준다
 */
export const createDailyUI = ({ dialog, dates, getEntry, makeCode, makeLink, onStart, onWatch, onRace }) => {
  const notice = el("p", { class: "notice-slot", role: "status", id: "daily-notice" });

  const shareRows = async replay => {
    const code = await makeCode(replay);
    const codeInput = textInput({
      id: "daily-code",
      num: true,
      value: code,
      readOnly: true,
    });
    const copyCode = button({ label: t("복사"), icon: "copy", size: "s", id: "daily-copy" });
    copyCode.disabled = !code;
    copyCode.addEventListener("click", async () => {
      const ok = await copyText(code);
      notice.textContent = ok
        ? t("결과 코드를 복사했어요. 친구에게 보내 보세요")
        : t("복사하지 못했어요. 코드를 선택해 직접 복사해 주세요");
      if (!ok) /** @type {HTMLInputElement} */ (codeInput).select();
    });
    const copyLink = button({ label: t("링크 복사"), icon: "link", size: "s", id: "daily-link" });
    copyLink.disabled = !code;
    copyLink.addEventListener("click", async () => {
      notice.textContent = (await copyText(makeLink(code)))
        ? t("링크를 복사했어요. 받은 사람이 열면 내 기록과 겨룰 수 있어요")
        : t("복사하지 못했어요");
    });

    return [
      el("h3", { class: "daily-section", text: t("내 결과 공유") }),
      el(
        "section",
        { class: "field-section" },
        fieldRow({
          id: "daily-code",
          label: t("결과 코드"),
          hint: t("선택한 날짜의 최고 기록 리플레이"),
          control: el("span", { class: "inline-control" }, codeInput, copyCode),
        }),
        fieldRow({
          id: "daily-link",
          label: t("공유 링크"),
          hint: t("배포 주소에서 열었을 때 쓸모 있어요"),
          control: el("span", { class: "inline-control" }, copyLink),
        })
      ),
    ];
  };

  const render = (pasted = "") => {
    const keys = dates();
    // 날짜 고르기: 브라우저 기본 <select> 대신 다른 대화상자와 같은 드롭다운(docs/DESIGN_SYSTEM.md)
    let pickedDate = keys[0];
    const picker = dropdown({
      id: "daily-date",
      label: t("도전 날짜"),
      options: keys.map((key, index) => ({ value: key, label: index === 0 ? t("오늘 · {date}", { date: key }) : key })),
      value: pickedDate,
      onChange: value => {
        pickedDate = value;
        notice.textContent = "";
        void updateEntry();
      },
    });
    picker.classList.add("num", "daily-date");
    const best = el("span", { class: "daily-best num", id: "daily-best", "aria-live": "polite" });
    // 고른 날짜의 모드(날마다 바뀐다)
    const modeLine = el("small", { id: "daily-mode" });
    const play = button({ label: t("도전하기"), icon: "play", variant: "primary", id: "daily-start" });
    const watch = button({
      label: t("최고 기록 다시 보기"),
      icon: "play",
      size: "s",
      id: "daily-watch",
    });
    const share = el("div");
    /** @type {ReturnType<typeof getEntry>} */
    let entry;
    let version = 0;

    const updateEntry = async () => {
      const current = ++version;
      entry = getEntry(pickedDate);
      modeLine.textContent = t("{mode} · Modern · 모두 같은 블록 순서", { mode: entry.mode.baseName });
      best.textContent = entry.best
        ? t("최고 기록 {record}", { record: entry.mode.formatRecord(entry.best) })
        : t("이 날짜의 기록이 없어요");
      watch.hidden = !entry.replay;
      share.replaceChildren();
      if (entry.replay) {
        try {
          const rows = await shareRows(entry.replay);
          if (current === version) share.replaceChildren(...rows);
        } catch {
          if (current === version && dialog.open && share.isConnected)
            notice.textContent = t("결과 코드를 만들지 못했어요");
        }
      }
    };
    play.addEventListener("click", () => {
      dialog.close();
      onStart(entry.mode);
    });
    watch.addEventListener("click", () => {
      if (!entry.replay) return;
      dialog.close();
      onWatch(entry.replay);
    });

    const pasteInput = /** @type {HTMLInputElement} */ (
      textInput({
        id: "daily-paste",
        num: true,
        value: pasted,
        placeholder: t("TD1- 코드나 링크"),
        autocomplete: "off",
        spellcheck: false,
      })
    );
    const race = button({ label: t("겨루기"), icon: "play", size: "s", id: "daily-race" });
    let checking = false;
    race.disabled = !pasteInput.value.trim();
    pasteInput.addEventListener("input", () => {
      race.disabled = checking || !pasteInput.value.trim();
      pasteInput.removeAttribute("aria-invalid");
      notice.textContent = "";
    });
    const doRace = async () => {
      const value = pasteInput.value.trim();
      if (!value || checking) return;
      checking = true;
      race.disabled = true;
      const problem = await onRace(value);
      checking = false;
      race.disabled = !pasteInput.value.trim();
      if (problem) {
        notice.textContent = problem;
        pasteInput.setAttribute("aria-invalid", "true");
        pasteInput.focus();
      } else dialog.close();
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
        el("div", { class: "daily-today" }, picker, modeLine, best),
        el("div", { class: "daily-actions" }, play, watch)
      ),
      share,
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
    void updateEntry();
  };

  return {
    /** @param {{ pasted?: string, message?: string }} [o] */
    open(o = {}) {
      notice.textContent = o.message ?? "";
      render(o.pasted ?? "");
      if (!dialog.open) dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector(o.pasted ? "#daily-race" : "#daily-start"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
