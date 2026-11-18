// 설정 대화상자: 조작감(DAS·ARR·SDF)과 키 배치. 바꾸는 즉시 저장하고 onChange로 알린다.
import { ACTIONS, DEFAULT_KEYMAP, SLOTS, assignKey, clearKey, keyLabel } from "../input/keymap.js";
import { DEFAULT_SETTINGS, HANDLING_LIMITS, SDF_INFINITE, defaultVisual } from "../storage/settings.js";

const HANDLING_ROWS = [
  { key: "das", label: "DAS", hint: "누른 채로 자동 이동이 시작되기까지", unit: "ms" },
  { key: "arr", label: "ARR", hint: "자동 이동 한 칸 간격 (0 = 즉시 벽까지)", unit: "ms" },
  { key: "sdf", label: "SDF", hint: "소프트 드롭 속도 배율 (맨 끝 = 즉시)", unit: "×" },
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? "∞" : `×${v}`) : `${v} ms`);

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children);
  return node;
};

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
  const notice = el("p", { class: "settings-notice", role: "status" });

  const update = patch => {
    onChange({ ...getSettings(), ...patch });
  };

  const handlingSection = () => {
    const rows = HANDLING_ROWS.map(({ key, label, hint }) => {
      const limits = HANDLING_LIMITS[key];
      const value = getSettings().handling[key];
      const output = el("output", { class: "settings-value", text: formatValue(key, value) });
      const input = el("input", {
        type: "range",
        min: String(limits.min),
        max: String(limits.max),
        step: String(limits.step),
        value: String(value),
        id: `set-${key}`,
      });
      input.setAttribute("aria-label", label);
      input.addEventListener("input", () => {
        const v = Number(input.value);
        output.textContent = formatValue(key, v);
        update({ handling: { ...getSettings().handling, [key]: v } });
      });
      return el(
        "div",
        { class: "settings-row" },
        el(
          "label",
          { htmlFor: `set-${key}`, class: "settings-label" },
          el("strong", { text: label }),
          el("small", { text: hint })
        ),
        input,
        output
      );
    });
    return el("section", { class: "settings-section" }, el("h3", { text: "조작감" }), ...rows);
  };

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

  const visualSection = () => {
    const rows = VISUAL_ROWS.map(({ key, label, hint, options }) => {
      const select = el("select", { id: `set-${key}`, class: "rule-select" });
      for (const [value, text] of options) {
        select.append(el("option", { value, text, selected: getSettings().visual[key] === value }));
      }
      select.addEventListener("change", () => update({ visual: { ...getSettings().visual, [key]: select.value } }));
      return el(
        "div",
        { class: "settings-row rule-row" },
        el(
          "label",
          { htmlFor: `set-${key}`, class: "settings-label" },
          el("strong", { text: label }),
          ...(hint ? [el("small", { text: hint })] : [])
        ),
        select
      );
    });
    return el("section", { class: "settings-section" }, el("h3", { text: "화면" }), ...rows);
  };

  const keysSection = () => {
    const { keymap } = getSettings();
    const rows = ACTIONS.map(action => {
      const slots = Array.from({ length: SLOTS }, (_, slot) => {
        const code = keymap[action.id]?.[slot];
        const waiting = capture && capture.action === action.id && capture.slot === slot;
        const btn = el("button", {
          type: "button",
          class: `key-slot${waiting ? " is-waiting" : ""}${code ? "" : " is-empty"}`,
          text: waiting ? "키를 누르세요…" : code ? keyLabel(code) : "—",
          "data-action": action.id,
          "data-slot": String(slot),
        });
        btn.addEventListener("click", () => startCapture(action.id, slot));
        return btn;
      });
      return el(
        "div",
        { class: "settings-row keys-row" },
        el("span", { class: "settings-label", text: action.label }),
        ...slots
      );
    });
    return el(
      "section",
      { class: "settings-section" },
      el("h3", { text: "키 배치" }),
      el("p", { class: "settings-help", text: "칸을 누르고 원하는 키를 누르세요. Backspace는 지우기, Esc는 취소." }),
      ...rows
    );
  };

  const render = () => {
    const scroll = dialog.querySelector(".settings-body")?.scrollTop ?? 0;
    const reset = el("button", { type: "button", class: "btn", text: "기본값으로" });
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
    const close = el("button", { type: "button", class: "btn btn-primary", text: "닫기", id: "settings-close" });
    close.addEventListener("click", () => dialog.close());
    const body = el("div", { class: "settings-body" }, handlingSection(), visualSection(), keysSection());
    dialog.replaceChildren(
      el("h2", { class: "settings-title", text: "설정" }),
      body,
      el("footer", { class: "settings-footer" }, notice, reset, close)
    );
    body.scrollTop = scroll;
  };

  const startCapture = (action, slot) => {
    capture = { action, slot };
    notice.textContent = "";
    render();
    dialog.querySelector(".key-slot.is-waiting")?.focus();
  };

  const endCapture = () => {
    capture = null;
    render();
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
