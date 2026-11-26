import { ACTIONS, SLOTS, assignKey, clearKey, keyLabel } from "../input/keymap.js";
import { assignPadButton, clearPadButton, connectedPads, padButtonName, pressedButtons } from "../input/gamepad.js";
import { t } from "../i18n/index.js";
import { el } from "./dom.js";
import { keycap, padKeycap } from "./keycap.js";

/** 키 배치 표와 입력을 기다리는 칸의 수명주기를 관리한다. */
export const createBindingSettings = ({ dialog, getSettings, update, notice, render }) => {
  /** @type {{ kind: "key" | "pad", action: string, slot: number } | null} */
  let capture = null;

  /**
   * 키보드·게임패드 배치 표. kind에 따라 저장 위치와 표시만 다르다.
   * @param {"key" | "pad"} kind
   */
  const bindingSection = kind => {
    const map = kind === "key" ? getSettings().keymap : getSettings().padmap;
    return el(
      "section",
      { class: "field-section" },
      el("p", {
        class: "field-help",
        text:
          kind === "key"
            ? t("칸을 누르고 원하는 키를 누르세요. Backspace는 지우기, Esc는 취소.")
            : t("칸을 누르고 패드의 원하는 버튼을 누르세요. 왼쪽 스틱과 메뉴 이동(A·십자키)은 고정이에요."),
      }),
      el(
        "div",
        { class: "field-row key-row key-head" },
        el("span", { text: t("동작") }),
        el("span", { text: t("기본 키") }),
        el("span", { text: t("보조 키") })
      ),
      ...ACTIONS.map(action => {
        const slots = Array.from({ length: SLOTS }, (_, slot) => {
          const value = map[action.id]?.[slot];
          const has = value !== undefined;
          const waiting = capture && capture.kind === kind && capture.action === action.id && capture.slot === slot;
          const name = has ? (kind === "key" ? keyLabel(value) : padButtonName(value)) : t("없음");
          const btn = el("button", {
            type: "button",
            class: `key-slot${waiting ? " is-waiting" : ""}${has ? "" : " is-empty"}`,
            "data-kind": kind,
            "data-action": action.id,
            "data-slot": String(slot),
            "aria-label": t(kind === "key" ? "{action} {n}번 키: {name}" : "{action} {n}번 버튼: {name}", {
              action: action.label,
              n: slot + 1,
              name,
            }),
          });
          // 좁은 칸에도 들어가게 짧게. 무엇을 기다리는지는 aria-label과 아래 안내에 있다.
          if (waiting) btn.textContent = t("누르세요");
          else if (has) btn.append(kind === "key" ? keycap(value) : padKeycap(value));
          else btn.textContent = t("없음");
          btn.addEventListener("click", () => startCapture(kind, action.id, slot));
          return btn;
        });
        return el(
          "div",
          { class: "field-row key-row" },
          el("span", { class: "field-label", text: action.label }),
          ...slots
        );
      })
    );
  };

  const slotSelector = c => `.key-slot[data-kind="${c.kind}"][data-action="${c.action}"][data-slot="${c.slot}"]`;

  /** 패드 버튼 기다리기: 시작할 때 이미 눌려 있던 버튼은 떼기 전까지 무시한다. */
  let padBaseline = new Set();
  let padFrame = 0;
  const reset = () => {
    capture = null;
    cancelAnimationFrame(padFrame);
    padFrame = 0;
  };
  const pollPad = () => {
    if (!capture || capture.kind !== "pad" || !dialog.open) return;
    const now = new Set(connectedPads().flatMap(pressedButtons));
    for (const i of padBaseline) if (!now.has(i)) padBaseline.delete(i);
    const fresh = [...now].find(i => !padBaseline.has(i));
    if (fresh !== undefined) {
      const { action, slot } = capture;
      const result = assignPadButton(getSettings().padmap, action, slot, fresh);
      update({ padmap: result.padmap });
      const moved = result.movedFrom && ACTIONS.find(a => a.id === result.movedFrom);
      notice.textContent = moved
        ? t("‘{key}’ 버튼을 ‘{action}’에서 옮겼어요.", { key: padButtonName(fresh), action: moved.label })
        : "";
      endCapture();
      return;
    }
    padFrame = requestAnimationFrame(pollPad);
  };

  const startCapture = (kind, action, slot) => {
    reset();
    capture = { kind, action, slot };
    notice.textContent =
      kind === "pad" && !connectedPads().length ? t("게임패드가 연결돼 있지 않아요. 연결하고 버튼을 눌러 주세요.") : "";
    render();
    /** @type {HTMLElement | null} */ (dialog.querySelector(slotSelector(capture)))?.focus();
    if (kind === "pad") {
      padBaseline = new Set(connectedPads().flatMap(pressedButtons));
      padFrame = requestAnimationFrame(pollPad);
    }
  };

  const endCapture = () => {
    const last = capture;
    reset();
    render();
    if (last) /** @type {HTMLElement | null} */ (dialog.querySelector(slotSelector(last)))?.focus();
  };

  // 캡처 단계에서 먼저 받아 게임 키 처리(keyboard.js)로 넘어가지 않게 한다.
  window.addEventListener(
    "keydown",
    e => {
      if (!dialog.open || !capture) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const { kind, action, slot } = capture;
      const { keymap, padmap } = getSettings();
      if (e.code === "Escape") return endCapture();
      if (e.code === "Backspace" || e.code === "Delete") {
        if (kind === "pad") update({ padmap: clearPadButton(padmap, action, slot) });
        else update({ keymap: clearKey(keymap, action, slot) });
        notice.textContent = "";
        return endCapture();
      }
      if (kind === "pad") return; // 패드 버튼을 기다리는 중에는 다른 키를 무시한다
      const result = assignKey(keymap, action, slot, e.code);
      update({ keymap: result.keymap });
      const moved = result.movedFrom && ACTIONS.find(a => a.id === result.movedFrom);
      notice.textContent = moved
        ? t("‘{key}’ 키를 ‘{action}’에서 옮겼어요.", { key: keyLabel(e.code), action: moved.label })
        : "";
      endCapture();
    },
    { capture: true }
  );

  // 키 입력을 기다리는 중의 Esc는 대화상자를 닫지 않고 입력만 취소한다.
  dialog.addEventListener("cancel", e => {
    if (capture) e.preventDefault();
  });
  return { section: bindingSection, reset };
};
