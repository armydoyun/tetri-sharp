// 설정 대화상자: 조작감(DAS·ARR·SDF), 화면, 키 배치. 바꾸는 즉시 저장하고 onChange로 알린다.
import { ACTIONS, DEFAULT_KEYMAP, SLOTS, assignKey, clearKey, keyLabel } from "../input/keymap.js";
import {
  DEFAULT_PADMAP,
  PAD_ICONS,
  assignPadButton,
  clearPadButton,
  connectedPads,
  padButtonName,
  pressedButtons,
} from "../input/gamepad.js";
import { icon } from "./icons.js";
import { DEFAULT_SETTINGS, HANDLING_LIMITS, SDF_INFINITE, defaultVisual } from "../storage/settings.js";
import { button, el, fieldRow, fillDialog } from "./dom.js";
import { THEMES, THEME_IDS } from "../render/themes.js";
import { keycap } from "./keycap.js";

const HANDLING_ROWS = [
  { key: "das", label: "DAS", hint: "누른 채로 자동 이동이 시작되기까지" },
  { key: "arr", label: "ARR", hint: "자동 이동 한 칸 간격 (0 = 즉시 벽까지)" },
  { key: "sdf", label: "SDF", hint: "소프트 드롭 속도 배율 (맨 끝 = 즉시)" },
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? "즉시" : `${v}배`) : `${v} ms`);

const VISUAL_ROWS = [
  {
    key: "theme",
    label: "게임 테마",
    hint: "블록 모양·격자·움직임·연출",
    options: THEME_IDS.map(id => [id, `${THEMES[id].name} · ${THEMES[id].description}`]),
  },
  {
    key: "effects",
    label: "화면 효과",
    hint: "모든 테마에 적용 · 줄임은 움직임 없이",
    options: [
      ["full", "전체"],
      ["reduced", "줄임 (움직임 없이)"],
      ["off", "끄기"],
    ],
  },
  {
    key: "palette",
    label: "블록 색",
    hint: "모든 테마에 적용",
    options: [
      ["theme", "테마 색"],
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
      }),
      (() => {
        const select = el("select", { id: "set-touch", class: "select" });
        for (const [value, text] of [
          ["auto", "자동 (터치 화면이면 보이기)"],
          ["on", "켜기"],
          ["off", "끄기"],
        ])
          select.append(el("option", { value, text, selected: getSettings().touch === value }));
        select.addEventListener("change", () => update({ touch: select.value }));
        return fieldRow({ id: "set-touch", label: "터치 버튼", hint: "보드 아래 조작 버튼", control: select });
      })()
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

  /** 게임패드 버튼 하나를 키캡 모양으로(십자키는 화살표 아이콘) */
  const padCap = i => {
    const kbd = el("kbd", { class: "keycap" });
    if (PAD_ICONS[i]) kbd.append(icon(PAD_ICONS[i], { label: padButtonName(i) }));
    else kbd.textContent = padButtonName(i);
    return kbd;
  };

  /**
   * 키보드·게임패드 배치 표. kind에 따라 저장 위치와 표시만 다르다.
   * @param {"key" | "pad"} kind
   */
  const bindingSection = kind => {
    const map = kind === "key" ? getSettings().keymap : getSettings().padmap;
    const noun = kind === "key" ? "키" : "버튼";
    return el(
      "section",
      { class: "field-section" },
      el("h3", { text: kind === "key" ? "키 배치" : "게임패드 버튼" }),
      el("p", {
        class: "field-help",
        text:
          kind === "key"
            ? "칸을 누르고 원하는 키를 누르세요. Backspace는 지우기, Esc는 취소."
            : "칸을 누르고 패드의 원하는 버튼을 누르세요. 왼쪽 스틱과 메뉴 이동(A·십자키)은 고정이에요.",
      }),
      ...ACTIONS.map(action => {
        const slots = Array.from({ length: SLOTS }, (_, slot) => {
          const value = map[action.id]?.[slot];
          const has = value !== undefined;
          const waiting = capture && capture.kind === kind && capture.action === action.id && capture.slot === slot;
          const name = has ? (kind === "key" ? keyLabel(value) : padButtonName(value)) : "없음";
          const btn = el("button", {
            type: "button",
            class: `key-slot${waiting ? " is-waiting" : ""}${has ? "" : " is-empty"}`,
            "data-kind": kind,
            "data-action": action.id,
            "data-slot": String(slot),
            "aria-label": `${action.label} ${slot + 1}번 ${noun}: ${name}`,
          });
          if (waiting) btn.textContent = `${noun}를 누르세요`;
          else if (has) btn.append(kind === "key" ? keycap(value) : padCap(value));
          else btn.textContent = "없음";
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

  const render = () => {
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    const reset = button({ text: "기본값으로", iconName: "reset", id: "settings-reset" });
    reset.addEventListener("click", () => {
      capture = null;
      onChange({
        ...getSettings(),
        handling: { ...DEFAULT_SETTINGS.handling },
        keymap: { ...DEFAULT_KEYMAP },
        padmap: { ...DEFAULT_PADMAP },
        touch: "auto",
        visual: defaultVisual(),
      });
      notice.textContent = "기본값으로 되돌렸어요.";
      render();
    });
    const body = el("div", {}, handlingSection(), visualSection(), bindingSection("key"), bindingSection("pad"));
    fillDialog(dialog, { title: "설정", body, notice, actions: [reset], closeId: "settings-close" });
    body.scrollTop = scroll;
  };

  const slotSelector = c => `.key-slot[data-kind="${c.kind}"][data-action="${c.action}"][data-slot="${c.slot}"]`;

  /** 패드 버튼 기다리기: 시작할 때 이미 눌려 있던 버튼은 떼기 전까지 무시한다. */
  let padBaseline = new Set();
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
      notice.textContent = moved ? `‘${padButtonName(fresh)}’ 버튼을 ‘${moved.label}’에서 옮겼어요.` : "";
      endCapture();
      return;
    }
    requestAnimationFrame(pollPad);
  };

  const startCapture = (kind, action, slot) => {
    capture = { kind, action, slot };
    notice.textContent =
      kind === "pad" && !connectedPads().length ? "게임패드가 연결돼 있지 않아요. 연결하고 버튼을 눌러 주세요." : "";
    render();
    /** @type {HTMLElement | null} */ (dialog.querySelector(slotSelector(capture)))?.focus();
    if (kind === "pad") {
      padBaseline = new Set(connectedPads().flatMap(pressedButtons));
      requestAnimationFrame(pollPad);
    }
  };

  const endCapture = () => {
    const last = capture;
    capture = null;
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
