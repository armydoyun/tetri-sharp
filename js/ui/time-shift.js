import { t } from "../i18n/index.js";
import { TIME_SHIFT_STAGES } from "../modes/time-shift.js";
import { decodeTimeShiftChallenge } from "../modes/time-shift-share.js";
import { button, menuRow, textInput } from "./components.js";
import { el, fillDialog } from "./dom.js";
import { copyText } from "./clipboard.js";

/** @param {{
 *   dialog: HTMLDialogElement,
 *   progress: ReturnType<typeof import("../storage/time-shift-progress.js").createTimeShiftProgress>,
 *   onStage: (stage: typeof TIME_SHIFT_STAGES[number]) => void,
 *   onDemo: () => void,
 *   onChallenge: (challenge: NonNullable<ReturnType<typeof decodeTimeShiftChallenge>>) => void,
 * }} options */
export const createTimeShiftUI = ({ dialog, progress, onStage, onDemo, onChallenge }) => {
  const notice = el("p", { class: "notice-slot", role: "status" });
  const show = (title, body, actions = []) => {
    notice.textContent = "";
    fillDialog(dialog, { title, body, notice, actions, closeId: "time-shift-close" });
    if (!dialog.open) dialog.showModal();
  };
  const enter = action => {
    dialog.close();
    action();
  };
  const describe = text => el("p", { class: "field-help", text });

  const receive = challenge => {
    const { stage } = challenge;
    const play = button({
      id: "time-shift-accept",
      label: t("도전하기"),
      icon: "play",
      variant: "primary",
      onClick: () => enter(() => onChallenge(challenge)),
    });
    show(
      t("받은 시간차 도전"),
      el(
        "div",
        { class: "time-shift-overview" },
        el("h3", { class: "section-title", text: stage.title() }),
        describe(stage.goal()),
        describe(t("친구가 기록한 6수를 받아 두 번째 플레이부터 시작해요."))
      ),
      [play]
    );
    play.focus();
  };

  const paste = () => {
    const input = textInput({
      id: "time-shift-code",
      "aria-label": t("시간차 도전 코드 또는 링크"),
      placeholder: t("코드 또는 링크"),
      autocapitalize: "none",
      spellcheck: false,
    });
    const form = el("form", { id: "time-shift-code-form", class: "time-shift-overview" }, input);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const challenge = decodeTimeShiftChallenge(input.value);
      if (challenge) receive(challenge);
      else {
        notice.textContent = t("시간차 도전 코드를 읽을 수 없어요. 코드나 단계 버전을 확인해 주세요.");
        input.focus();
      }
    });
    const open = button({ label: t("열기"), variant: "primary", type: "submit" });
    open.setAttribute("form", form.id);
    show(t("도전 코드 열기"), form, [open]);
    input.focus();
  };

  return {
    get isOpen() {
      return dialog.open;
    },
    open(focusId = "") {
      const cleared = progress.read();
      const demo = menuRow({
        id: "time-shift-demo",
        title: t("한 수 체험"),
        desc: t("같은 과거 블록도 내가 놓는 위치에 따라 다른 곳에 떨어져요."),
        onClick: () => enter(onDemo),
      });
      const rows = TIME_SHIFT_STAGES.map((stage, index) => {
        const complete = cleared.includes(stage.id);
        const locked = !complete && index > 0 && !cleared.includes(TIME_SHIFT_STAGES[index - 1].id);
        return menuRow({
          index: index + 1,
          "data-time-shift-stage": stage.id,
          title: stage.title(),
          desc: stage.goal(),
          meta: locked ? t("잠김") : complete ? t("완료") : "",
          disabled: locked,
          onClick: () => enter(() => onStage(stage)),
        });
      });
      show(
        t("시간차"),
        el(
          "div",
          { class: "time-shift-overview" },
          describe(t("첫 판에 놓은 블록이 두 번째 판에 한 수씩 돌아와요. 두 판의 배치를 맞춰 목표를 푸세요.")),
          el("div", { class: "menu-list" }, demo),
          el("h3", { class: "section-title", text: t("공식 스테이지") }),
          el("div", { class: "menu-list" }, ...rows)
        ),
        [button({ label: t("도전 코드 열기"), id: "time-shift-paste", icon: "folder", onClick: paste })]
      );
      notice.textContent = t("{n} / {total}단계 완료", { n: cleared.length, total: rows.length });
      const focus = rows.find(row => row.dataset.timeShiftStage === focusId && !row.disabled);
      (
        focus ??
        (cleared.length ? rows.find(row => !row.disabled && !cleared.includes(row.dataset.timeShiftStage)) : demo) ??
        rows[0]
      ).focus();
    },
    receive,
    share(code, link = null) {
      const field = textInput({
        id: "time-shift-share-code",
        value: code,
        readOnly: true,
        "aria-label": t("시간차 도전 코드 또는 링크"),
      });
      const copy = (label, value, id) =>
        button({
          id,
          label,
          icon: value === link ? "link" : "copy",
          onClick: async () => {
            field.value = value;
            const copied = await copyText(value, field);
            if (!dialog.open || !field.isConnected) return;
            if (copied) notice.textContent = t("복사했어요.");
            else {
              field.focus();
              field.select();
              notice.textContent = t("선택된 내용을 직접 복사해 주세요.");
            }
          },
        });
      const copyCode = copy(t("코드 복사"), code, "time-shift-copy-code");
      const copyLink = link && copy(t("링크 복사"), link, "time-shift-copy-link");
      show(
        t("시간차 도전 공유"),
        el(
          "div",
          { class: "time-shift-overview" },
          describe(t("친구가 내 첫 판의 6수로 두 번째 플레이를 풀 수 있어요.")),
          field
        ),
        copyLink ? [copyLink, copyCode] : [copyCode]
      );
      (copyLink || copyCode).focus();
    },
  };
};
