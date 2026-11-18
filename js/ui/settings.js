// 설정 대화상자: 탭 네 개(조작 · 화면 · 키보드 · 게임패드). 바꾸는 즉시 저장하고 onChange로 알린다.
// 대화상자 높이는 고정이라 탭을 바꿔도 창 크기가 그대로다(원칙 2).
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
import { DEFAULT_SETTINGS, HANDLING_LIMITS, SDF_INFINITE, VOLUME_LIMITS, defaultVisual } from "../storage/settings.js";
import { button, choice, choiceCards, el, fieldRow, fillDialog, tabBar } from "./dom.js";
import { CONTRAST_PALETTE, THEMES, THEME_IDS } from "../render/themes.js";
import { keycap } from "./keycap.js";
import { drawThemePreview } from "../render/preview.js";

const HANDLING_ROWS = [
  { key: "das", label: "DAS (자동 이동 시작)", hint: "방향키를 누른 채로 있을 때 자동 이동이 시작되기까지의 시간" },
  { key: "arr", label: "ARR (자동 이동 간격)", hint: "자동 이동 중 한 칸씩 움직이는 간격. 0이면 바로 벽까지" },
  { key: "sdf", label: "SDF (소프트 드롭 속도)", hint: "아래 키를 누를 때 떨어지는 속도 배율. 맨 끝은 즉시 바닥까지" },
];

const TABS = [
  ["control", "조작"],
  ["visual", "화면·소리"],
  ["keys", "키보드"],
  ["pad", "게임패드"],
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? "즉시" : `${v}배`) : `${v} ms`);

const EFFECT_OPTIONS = [
  ["full", "전체"],
  ["reduced", "줄임"],
  ["off", "끄기"],
];
const EFFECT_HINTS = {
  full: "테마마다 이동, 착지 반동, 하드 드롭 잔상, 줄 삭제 효과가 달라요",
  reduced: "줄이 삭제된 위치에 가는 선을 잠깐 표시해요",
  off: "연출을 모두 꺼요",
};
const TOUCH_OPTIONS = [
  ["auto", "자동"],
  ["on", "켜기"],
  ["off", "끄기"],
];
const TOUCH_HINTS = {
  auto: "터치 화면이면 보드 아래에 조작 버튼을 보여요",
  on: "늘 보드 아래에 조작 버튼을 보여요",
  off: "조작 버튼을 숨겨요",
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getSettings: () => any,
 *   onChange: (settings: any) => void,
 *   onClose?: () => void,
 *   onPreviewSound?: () => void,
 * }} options
 */
export const createSettingsUI = ({ dialog, getSettings, onChange, onClose, onPreviewSound }) => {
  /** 키 입력을 기다리는 칸 */
  let capture = null;
  const notice = el("p", { class: "notice-slot", role: "status", id: "settings-notice" });

  const update = patch => onChange({ ...getSettings(), ...patch });

  const handlingSection = () =>
    el(
      "section",
      { class: "field-section" },
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
      fieldRow({
        id: "set-touch",
        label: "터치 버튼",
        hint: TOUCH_HINTS[getSettings().touch],
        control: choice({
          id: "set-touch",
          label: "터치 버튼",
          options: TOUCH_OPTIONS,
          value: getSettings().touch,
          onChange: v => {
            update({ touch: v });
            render();
          },
        }),
      })
    );

  const setVisual = (key, v) => {
    update({ visual: { ...getSettings().visual, [key]: v } });
    render();
  };

  const visualSection = () => {
    const visual = getSettings().visual;
    return el(
      "section",
      { class: "field-section" },
      fieldRow({
        id: "set-theme",
        label: "게임 테마",
        hint: "격자 색과 블록의 색·모서리를 바꿔요",
        className: "is-wide",
        control: choiceCards({
          id: "set-theme",
          label: "게임 테마",
          options: THEME_IDS.map(id => {
            const theme = THEMES[id];
            const palette = visual.palette === "contrast" ? CONTRAST_PALETTE : theme.palette;
            const preview = el("canvas", { class: "theme-preview", "aria-hidden": "true" });
            drawThemePreview(preview, theme, palette);
            return { value: id, title: theme.name, desc: theme.description, preview };
          }),
          value: visual.theme,
          onChange: v => setVisual("theme", v),
        }),
      }),
      fieldRow({
        id: "set-effects",
        label: "화면 효과",
        hint: EFFECT_HINTS[visual.effects],
        control: choice({
          id: "set-effects",
          label: "화면 효과",
          options: EFFECT_OPTIONS,
          value: visual.effects,
          onChange: v => setVisual("effects", v),
        }),
      }),
      fieldRow({
        id: "set-palette",
        label: "블록 색",
        hint: visual.palette === "contrast" ? "색을 구분하기 쉬운 색 조합을 써요" : "고른 테마의 색을 써요",
        control: choice({
          id: "set-palette",
          label: "블록 색",
          options: [
            ["theme", "테마 색"],
            ["contrast", "색각 친화"],
          ],
          value: visual.palette,
          onChange: v => setVisual("palette", v),
        }),
      }),
      volumeRow()
    );
  };

  const formatVolume = v => (v <= 0 ? "끄기" : `${v}%`);
  const volumeRow = () => {
    const value = getSettings().volume;
    const output = el("output", { text: formatVolume(value), htmlFor: "set-volume" });
    const input = el("input", {
      type: "range",
      id: "set-volume",
      min: String(VOLUME_LIMITS.min),
      max: String(VOLUME_LIMITS.max),
      step: String(VOLUME_LIMITS.step),
      value: String(value),
    });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      output.textContent = formatVolume(v);
      update({ volume: v });
    });
    // 손을 뗄 때 한 번 들려준다(끄기면 조용).
    input.addEventListener("change", () => onPreviewSound?.());
    return fieldRow({
      id: "set-volume",
      label: "효과음",
      hint: "블록 이동·회전·줄 삭제 소리의 크기. 맨 왼쪽은 끄기",
      control: el("span", { class: "range" }, input, output),
    });
  };

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

  let tab = "control";
  const sectionFor = t =>
    t === "control"
      ? handlingSection()
      : t === "visual"
        ? visualSection()
        : bindingSection(t === "keys" ? "key" : "pad");

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
        volume: DEFAULT_SETTINGS.volume,
      });
      notice.textContent = "모든 설정을 기본값으로 되돌렸어요.";
      render();
    });
    const tabs = tabBar({
      tabs: TABS,
      active: tab,
      onSelect: t => {
        tab = t;
        capture = null;
        render();
        const b = dialog.querySelector(".dialog-body");
        if (b) b.scrollTop = 0;
        /** @type {HTMLElement | null} */ (dialog.querySelector(`.dialog-tabs [data-value="${t}"]`))?.focus();
      },
    });
    const body = el("div", {}, sectionFor(tab));
    fillDialog(dialog, { title: "설정", body, notice, actions: [reset], closeId: "settings-close", tabs });
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
    /** @param {string} [startTab] 처음 보여 줄 탭(control · visual · keys · pad) */
    open(startTab) {
      capture = null;
      if (startTab) tab = startTab;
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#settings-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
