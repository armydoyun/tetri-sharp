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
import { button, choice, choiceCards, el, fieldRow, fillDialog, rangeRow, slider, tabBar } from "./dom.js";
import { CONTRAST_PALETTE, THEMES, THEME_IDS } from "../render/themes.js";
import { keycap } from "./keycap.js";
import { drawThemePreview } from "../render/preview.js";
import { t } from "../i18n/index.js";

const HANDLING_ROWS = [
  {
    key: "das",
    label: t("DAS (자동 이동 시작)"),
    hint: t("방향키를 누른 채로 있을 때 자동 이동이 시작되기까지의 시간"),
  },
  { key: "arr", label: t("ARR (자동 이동 간격)"), hint: t("자동 이동 중 한 칸씩 움직이는 간격. 0이면 바로 벽까지") },
  {
    key: "sdf",
    label: t("SDF (소프트 드롭 속도)"),
    hint: t("아래 키를 누를 때 떨어지는 속도 배율. 맨 끝은 즉시 바닥까지"),
  },
];

const TABS = [
  ["control", t("조작")],
  ["visual", t("화면·소리")],
  ["keys", t("키보드")],
  ["pad", t("게임패드")],
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? t("즉시") : t("{n}배", { n: v })) : `${v} ms`);

const EFFECT_OPTIONS = [
  ["full", t("전체")],
  ["reduced", t("줄임")],
  ["off", t("끄기")],
];
const EFFECT_HINTS = {
  full: t("테마마다 이동, 착지 반동, 하드 드롭 잔상, 줄 삭제 효과가 달라요"),
  reduced: t("줄이 삭제된 위치에 가는 선을 잠깐 표시해요"),
  off: t("연출을 모두 꺼요"),
};
const SCHEME_HINTS = {
  system: "기기의 라이트·다크 설정을 따라요",
  light: "첫 화면과 메뉴를 밝게 써요",
  dark: "첫 화면과 메뉴를 어둡게 써요",
};
const GAME_SURFACE_HINTS = {
  dark: "게임 중에는 화면 색과 상관없이 어둡게 써요. 보드에 집중하기 좋아요",
  scheme: "게임 중에도 위의 화면 색을 그대로 써요",
};
const TOUCH_OPTIONS = [
  ["auto", t("자동")],
  ["on", t("켜기")],
  ["off", t("끄기")],
];
const TOUCH_HINTS = {
  auto: t("터치 화면이면 보드 아래에 조작 버튼을 보여요"),
  on: t("늘 보드 아래에 조작 버튼을 보여요"),
  off: t("조작 버튼을 숨겨요"),
};

/**
 * @param {{
 *   dialog: HTMLDialogElement,
 *   getSettings: () => any,
 *   onChange: (settings: any) => void,
 *   onClose?: () => void,
 *   onPreviewSound?: () => void,
 *   onLanguage?: (lang: string) => void,
 * }} options
 */
export const createSettingsUI = ({ dialog, getSettings, onChange, onClose, onPreviewSound, onLanguage }) => {
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
        const input = slider({
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
        return fieldRow({ id, label, hint, control: rangeRow(input, output, v => formatValue(key, v)) });
      }),
      fieldRow({
        id: "set-touch",
        label: t("터치 버튼"),
        hint: TOUCH_HINTS[getSettings().touch],
        control: choice({
          id: "set-touch",
          label: t("터치 버튼"),
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
    const scheme = getSettings().scheme;
    return el(
      "section",
      { class: "field-section" },
      fieldRow({
        id: "set-scheme",
        label: t("화면 색"),
        hint: t(SCHEME_HINTS[scheme]),
        control: choice({
          id: "set-scheme",
          label: t("화면 색"),
          options: [
            ["system", t("시스템")],
            ["light", t("라이트")],
            ["dark", t("다크")],
          ],
          value: scheme,
          onChange: v => {
            update({ scheme: v });
            render();
          },
        }),
      }),
      fieldRow({
        id: "set-game-surface",
        label: t("게임 중 화면"),
        hint: t(GAME_SURFACE_HINTS[getSettings().gameSurface]),
        control: choice({
          id: "set-game-surface",
          label: t("게임 중 화면"),
          options: [
            ["dark", t("늘 어둡게")],
            ["scheme", t("화면 색 따르기")],
          ],
          value: getSettings().gameSurface,
          onChange: v => {
            update({ gameSurface: v });
            render();
          },
        }),
      }),
      fieldRow({
        id: "set-theme",
        label: t("게임 테마"),
        hint: t("격자 색과 블록의 색·모서리를 바꿔요"),
        className: "is-wide",
        control: choiceCards({
          id: "set-theme",
          label: t("게임 테마"),
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
        label: t("화면 효과"),
        hint: EFFECT_HINTS[visual.effects],
        control: choice({
          id: "set-effects",
          label: t("화면 효과"),
          options: EFFECT_OPTIONS,
          value: visual.effects,
          onChange: v => setVisual("effects", v),
        }),
      }),
      fieldRow({
        id: "set-palette",
        label: t("블록 색"),
        hint: visual.palette === "contrast" ? t("색을 구분하기 쉬운 색 조합을 써요") : t("고른 테마의 색을 써요"),
        control: choice({
          id: "set-palette",
          label: t("블록 색"),
          options: [
            ["theme", t("테마 색")],
            ["contrast", t("색각 친화")],
          ],
          value: visual.palette,
          onChange: v => setVisual("palette", v),
        }),
      }),
      volumeRow(),
      fieldRow({
        id: "set-lang",
        label: t("언어"),
        hint:
          getSettings().lang === "auto"
            ? t("브라우저 언어를 따라요 · 바꾸면 페이지를 다시 불러와요")
            : t("바꾸면 페이지를 다시 불러와요"),
        control: choice({
          id: "set-lang",
          label: t("언어"),
          options: [
            ["auto", t("자동")],
            ["ko", "한국어"],
            ["en", "English"],
          ],
          value: getSettings().lang,
          onChange: v => {
            if (v === getSettings().lang) return;
            update({ lang: v });
            onLanguage?.(v);
          },
        }),
      })
    );
  };

  const formatVolume = v => (v <= 0 ? t("끄기") : `${v}%`);
  const volumeRow = () => {
    const value = getSettings().volume;
    const output = el("output", { text: formatVolume(value), htmlFor: "set-volume" });
    const input = slider({
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
      label: t("효과음"),
      hint: t("블록 이동·회전·줄 삭제 소리의 크기. 맨 왼쪽은 끄기"),
      control: rangeRow(input, output, formatVolume),
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
          else if (has) btn.append(kind === "key" ? keycap(value) : padCap(value));
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

  let tab = "control";
  const sectionFor = t =>
    t === "control"
      ? handlingSection()
      : t === "visual"
        ? visualSection()
        : bindingSection(t === "keys" ? "key" : "pad");

  const render = () => {
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    const reset = button({ text: t("기본값으로"), iconName: "reset", id: "settings-reset" });
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
        scheme: DEFAULT_SETTINGS.scheme,
        gameSurface: DEFAULT_SETTINGS.gameSurface,
      });
      notice.textContent = t("모든 설정을 기본값으로 되돌렸어요.");
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
    fillDialog(dialog, { title: t("설정"), body, notice, actions: [reset], closeId: "settings-close", tabs });
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
      notice.textContent = moved
        ? t("‘{key}’ 버튼을 ‘{action}’에서 옮겼어요.", { key: padButtonName(fresh), action: moved.label })
        : "";
      endCapture();
      return;
    }
    requestAnimationFrame(pollPad);
  };

  const startCapture = (kind, action, slot) => {
    capture = { kind, action, slot };
    notice.textContent =
      kind === "pad" && !connectedPads().length ? t("게임패드가 연결돼 있지 않아요. 연결하고 버튼을 눌러 주세요.") : "";
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
