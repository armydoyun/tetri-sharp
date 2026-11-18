// 설정 대화상자: 조작감(DAS·ARR·SDF), 화면, 키 배치. 바꾸는 즉시 저장하고 onChange로 알린다.
import { ACTIONS, DEFAULT_KEYMAP, SLOTS, assignKey, clearKey, keyLabel } from "../input/keymap.js";
import { DEFAULT_SETTINGS, HANDLING_LIMITS, SDF_INFINITE, defaultVisual } from "../storage/settings.js";
import { button, el, fieldRow, fillDialog } from "./dom.js";
import { keycap } from "./keycap.js";

const HANDLING_ROWS = [
  { key: "das", label: "DAS", hint: "누른 채로 자동 이동이 시작되기까지" },
  { key: "arr", label: "ARR", hint: "자동 이동 한 칸 간격 (0 = 즉시 벽까지)" },
  { key: "sdf", label: "SDF", hint: "소프트 드롭 속도 배율 (맨 끝 = 즉시)" },
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? "즉시" : `${v}배`) : `${v} ms`);

const VISUAL_ROWS = [
  {
    key: "effects",
    label: "화면 효과",
    hint: "줄 삭제 섬광·파편·흔들림",
    options: [
      ["full", "전체"],
      ["reduced", "줄임 (움직임 없이)"],
      ["off", "끄기"],
    ],
  },
  {
    key: "skin",
    label: "블록 모양",
    options: [
      ["flat", "평면"],
      ["bevel", "입체"],
      ["outline", "윤곽선"],
    ],
  },
  {
    key: "palette",
    label: "블록 색",
    options: [
      ["default", "기본"],
      ["contrast", "색각 친화"],
    ],
  },
];

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getSettings: () => any,
 *   onChange: (settings: any) => void,
 *   onClose?: () => void,
 * }} options
 */
export const createSettingsUI = ({ dialog, getSettings, onChange, onClose }) => {
  /** 키 입력을 기다리는 칸 */
  let capture = null;
  const notice = el("p", { class: "notice-slot", role: "status", id: "settings-notice" });

  const update = patch => onChange({ ...getSettings(), ...patch });

  const handlingSection = () =>
    el(
      "section",
      { class: "field-section" },
      el("h3", { text: "조작감" }),
      ...HANDLING_ROWS.map(({ key, label, hint }) => {
        const limits = HANDLING_LIMITS[key];
        const value = getSettings().handling[key];
        const id = `set-${key}`;
        const output = el("output", { text: formatValue(key, value), htmlFor: id });
        const input = el("input", {
          type: "range",
          id,
          min: String(limits.min),
          max: String(limits.max),
          step: String(limits.step),
          value: String(value),
        });
        input.addEventListener("input", () => {
          const v = Number(input.value);
          output.textContent = formatValue(key, v);
          update({ handling: { ...getSettings().handling, [key]: v } });
        });
        return fieldRow({ id, label, hint, control: el("span", { class: "range" }, input, output) });
      })
    );

  const visualSection = () =>
    el(
      "section",
      { class: "field-section" },
      el("h3", { text: "화면" }),
      ...VISUAL_ROWS.map(({ key, label, hint, options }) => {
        const id = `set-${key}`;
        const select = el("select", { id, class: "select" });
        for (const [value, text] of options) {
          select.append(el("option", { value, text, selected: getSettings().visual[key] === value }));
        }
        select.addEventListener("change", () => update({ visual: { ...getSettings().visual, [key]: select.value } }));
        return fieldRow({ id, label, hint, control: select });
      })
    );

  const keysSection = () => {
    const { keymap } = getSettings();
    return el(
      "section",
      { class: "field-section" },
      el("h3", { text: "키 배치" }),
      el("p", { class: "field-help", text: "칸을 누르고 원하는 키를 누르세요. Backspace는 지우기, Esc는 취소." }),
      ...ACTIONS.map(action => {
        const slots = Array.from({ length: SLOTS }, (_, slot) => {
          const code = keymap[action.id]?.[slot];
          const waiting = capture && capture.action === action.id && capture.slot === slot;
          const btn = el("button", {
            type: "button",
            class: `key-slot${waiting ? " is-waiting" : ""}${code ? "" : " is-empty"}`,
            "data-action": action.id,
            "data-slot": String(slot),
            "aria-label": `${action.label} ${slot + 1}번 키: ${code ? keyLabel(code) : "없음"}`,
          });
          if (waiting) btn.textContent = "키를 누르세요";
          else if (code) btn.append(keycap(code));
          else btn.textContent = "없음";
          btn.addEventListener("click", () => startCapture(action.id, slot));
          return btn;
        });
        const row = el(
          "div",
          { class: "field-row key-row" },
          el("span", { class: "field-label", text: action.label }),
          ...slots
        );
        return row;
      })
    );
  };

  const render = () => {
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    const reset = button({ text: "기본값으로", iconName: "reset", id: "settings-reset" });
    reset.addEventListener("click", () => {
      capture = null;
      onChange({
        ...getSettings(),
        handling: { ...DEFAULT_SETTINGS.handling },
        keymap: { ...DEFAULT_KEYMAP },
        visual: defaultVisual(),
      });
      notice.textContent = "기본값으로 되돌렸어요.";
      render();
    });
    const body = el("div", {}, handlingSection(), visualSection(), keysSection());
    fillDialog(dialog, { title: "설정", body, notice, actions: [reset], closeId: "settings-close" });
    body.scrollTop = scroll;
  };

  const startCapture = (action, slot) => {
    capture = { action, slot };
    notice.textContent = "";
    render();
    /** @type {HTMLElement | null} */ (dialog.querySelector(".key-slot.is-waiting"))?.focus();
  };

  const endCapture = () => {
    const last = capture;
    capture = null;
    render();
    if (last)
      /** @type {HTMLElement | null} */ (
        dialog.querySelector(`.key-slot[data-action="${last.action}"][data-slot="${last.slot}"]`)
      )?.focus();
  };

  // 캡처 단계에서 먼저 받아 게임 키 처리(keyboard.js)로 넘어가지 않게 한다.
  window.addEventListener(
    "keydown",
    e => {
      if (!dialog.open || !capture) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const { action, slot } = capture;
      const { keymap } = getSettings();
      if (e.code === "Escape") return endCapture();
      if (e.code === "Backspace" || e.code === "Delete") {
        update({ keymap: clearKey(keymap, action, slot) });
        notice.textContent = "";
        return endCapture();
      }
      const result = assignKey(keymap, action, slot, e.code);
      update({ keymap: result.keymap });
      const moved = result.movedFrom && ACTIONS.find(a => a.id === result.movedFrom);
      notice.textContent = moved ? `‘${keyLabel(e.code)}’ 키를 ‘${moved.label}’에서 옮겼어요.` : "";
      endCapture();
    },
    { capture: true }
  );

  // 키 입력을 기다리는 중의 Esc는 대화상자를 닫지 않고 입력만 취소한다.
  dialog.addEventListener("cancel", e => {
    if (capture) e.preventDefault();
  });
  dialog.addEventListener("close", () => {
    capture = null;
    notice.textContent = "";
    onClose?.();
  });

  return {
    open() {
      capture = null;
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#settings-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
