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
import {
  DEFAULT_SETTINGS,
  HANDLING_LIMITS,
  HANDLING_PRESETS,
  SDF_INFINITE,
  VOLUME_LIMITS,
  defaultAccess,
  defaultVisual,
  handlingPresetOf,
} from "../storage/settings.js";
import { el, fieldRow, fillDialog, focusKey, restoreFocus } from "./dom.js";
import { button, choiceCards, confirmButton, rangeRow, segmented, slider, tabBar } from "./components.js";
import { dropdown } from "./select.js";
import { COLOR_SWATCHES, PIECE_ORDER, THEMES, THEME_IDS, findTheme, paletteFor } from "../render/themes.js";
import { keycap } from "./keycap.js";
import { createThemeStage, drawThemeSwatch } from "../render/preview.js";
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

/** @type {ReadonlyArray<[string, string]>} */
const PRESET_OPTIONS = [
  ["relaxed", t("느긋하게")],
  ["standard", t("보통")],
  ["fast", t("빠르게")],
  ["instant", t("아주 빠르게")],
];
const PRESET_HINTS = {
  relaxed: "처음 해 보는 분께: 천천히 움직이고 실수가 적어요",
  standard: "대부분에게 맞는 기본값이에요",
  fast: "익숙해지면: 누르고 있으면 바로 벽까지 가요",
  instant: "숙련자용: 가장 빨리 반응하고 소프트 드롭은 즉시 바닥까지",
};
const TOUCH_MODE_HINTS = {
  buttons: "보드 아래 버튼으로 조작해요",
  gestures: "보드를 좌우로 밀어 이동, 두드려 회전(왼쪽 절반은 반대 방향), 아래로 튕겨 하드 드롭, 위로 밀어 홀드",
};

const TABS = [
  ["control", t("조작")],
  ["visual", t("화면·소리")],
  ["access", t("접근성")],
  ["keys", t("키보드")],
  ["pad", t("게임패드")],
  ["data", t("데이터")],
];

const formatValue = (key, v) => (key === "sdf" ? (v >= SDF_INFINITE ? t("즉시") : t("{n}배", { n: v })) : `${v} ms`);

/** @type {ReadonlyArray<[string, string]>} */
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
/** 효과음 설명(테마 키별) */
const SOUND_HINTS = {
  theme: "게임 테마마다 다른 소리. 뜻과 박자는 같고 음색만 달라요",
  modern: "깔끔한 클릭과 짧은 음",
  retro: "종이에 톡, 종이 스치는 소리, 칼림바",
  minimal: "샤프펜슬 딸깍, 자 눈금, 맑은 신호음",
  graphite: "조작은 아주 작게, 쓰레기 경고와 게임 오버만 또렷하게",
  frame: "쇠 클릭, 경첩, 비브라폰",
  stone: "모래 쓸림, 토기 두드림, 오카리나",
  midnight: "맑은 종소리와 짧은 잔향",
  forest: "연필 톡, 나무 블록, 마림바",
  white: "볼펜 딸깍, 책상 톡, 펠트 피아노",
  sharp: "스튜디오 소리를 반음 올려서",
};
const GAME_SURFACE_HINTS = {
  dark: "게임 중 보드 둘레는 화면 색과 상관없이 어두워요. 보드 색은 게임 테마가 정하고, 아래 미리보기에 그대로 보여요",
  scheme: "게임 중 보드 둘레도 위의 화면 색을 따라요. 보드 색은 게임 테마가 정하고, 아래 미리보기에 그대로 보여요",
};
/** @type {ReadonlyArray<[string, string]>} */
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
 *   onPreviewTheme?: (themeId: string) => void,
 *   onLanguage?: (lang: string) => void,
 * }} options
 */
/**
 * data: 데이터 탭의 동작(백업 저장·불러오기, 리플레이 파일 열기). canImport가 false면(게임 중) 불러오기는 끈다.
 */
export const createSettingsUI = ({
  dialog,
  getSettings,
  onChange,
  onClose,
  onPreviewSound,
  onLanguage,
  data,
  openedThemes = () => /** @type {string[]} */ ([]),
  onPreviewTheme,
}) => {
  /** 키 입력을 기다리는 칸 */
  let capture = null;
  const notice = el("p", { class: "notice-slot", role: "status", id: "settings-notice" });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  /** @type {ReturnType<typeof createThemeStage> | null} */
  let playingPreview = null;
  const stopThemePreview = () => {
    playingPreview?.stop();
    playingPreview = null;
  };
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) stopThemePreview();
  });

  const update = patch => onChange({ ...getSettings(), ...patch });

  const handlingSection = () =>
    el(
      "section",
      { class: "field-section" },
      fieldRow({
        id: "set-handling-preset",
        label: t("조작감"),
        hint: (() => {
          const p = handlingPresetOf(getSettings().handling);
          return p ? t(PRESET_HINTS[p]) : t("아래에서 직접 조절한 값이에요");
        })(),
        control: segmented({
          wrap: true,
          id: "set-handling-preset",
          label: t("조작감"),
          options: PRESET_OPTIONS,
          value: handlingPresetOf(getSettings().handling) ?? "",
          onChange: v => {
            update({ handling: { ...HANDLING_PRESETS[v] } });
            render();
          },
        }),
      }),
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
          refreshPreset();
        });
        return fieldRow({ id, label, hint, control: rangeRow(input, output, v => formatValue(key, v)) });
      }),
      fieldRow({
        id: "set-touch",
        label: t("터치 버튼"),
        hint: TOUCH_HINTS[getSettings().touch],
        control: segmented({
          wrap: true,
          id: "set-touch",
          label: t("터치 버튼"),
          options: TOUCH_OPTIONS,
          value: getSettings().touch,
          onChange: v => {
            update({ touch: v });
            render();
          },
        }),
      }),
      fieldRow({
        id: "set-touch-mode",
        label: t("터치 조작 방식"),
        hint: t(TOUCH_MODE_HINTS[getSettings().touchMode]),
        control: segmented({
          wrap: true,
          id: "set-touch-mode",
          label: t("터치 조작 방식"),
          options: [
            ["buttons", t("버튼")],
            ["gestures", t("제스처")],
          ],
          value: getSettings().touchMode,
          onChange: v => {
            update({ touchMode: v });
            render();
          },
        }),
      })
    );

  /** 슬라이더로 직접 바꾸면 프리셋 표시만 다시 맞춘다(다시 그리면 슬라이더 포커스를 잃는다) */
  const refreshPreset = () => {
    const p = handlingPresetOf(getSettings().handling);
    for (const b of dialog.querySelectorAll("#set-handling-preset > button"))
      b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === p));
    const hint = dialog.querySelector('label[for="set-handling-preset"] small');
    if (hint) hint.textContent = p ? t(PRESET_HINTS[p]) : t("아래에서 직접 조절한 값이에요");
  };

  const setAccess = (key, v) => {
    update({ access: { ...getSettings().access, [key]: v } });
    render();
  };
  const onOff = [
    ["on", t("켜기")],
    ["off", t("끄기")],
  ];

  /** 접근성 탭: 블록 무늬 · 화면 읽기 알림 · 진동 · 카운트다운 */
  const accessSection = () => {
    const a = getSettings().access;
    const visual = getSettings().visual;
    const row = (id, label, hint, options, value, onChange) =>
      fieldRow({ id, label, hint, control: segmented({ wrap: true, id, label, options, value, onChange }) });
    return el(
      "section",
      { class: "field-section" },
      row(
        "set-pattern",
        t("블록 무늬"),
        visual.pattern === "on"
          ? t("피스마다 다른 무늬를 그려요. 색을 구분하기 어려워도 알아볼 수 있어요")
          : t("색만으로 피스를 구분해요"),
        [
          ["off", t("끄기")],
          ["on", t("켜기")],
        ],
        visual.pattern,
        v => setVisual("pattern", v)
      ),
      row(
        "set-announce",
        t("화면 읽기 알림"),
        t("화면 읽기 프로그램이 줄 삭제·레벨업·결과를 읽어 줘요"),
        onOff,
        a.announce,
        v => setAccess("announce", v)
      ),
      row(
        "set-vibrate",
        t("진동"),
        t("휴대폰에서 고정·줄 삭제·게임 오버 때 짧게 진동해요(지원하는 기기만)"),
        onOff,
        a.vibrate,
        v => setAccess("vibrate", v)
      ),
      row(
        "set-countdown",
        t("시작 카운트다운"),
        a.countdown === "off" ? t("누르자마자 바로 시작해요") : t("시작 전에 준비 신호를 보여 줘요"),
        [
          ["normal", t("보통")],
          ["short", t("짧게")],
          ["off", t("없음")],
        ],
        a.countdown,
        v => setAccess("countdown", v)
      ),
      ...visualAccessRows(visual)
    );
  };

  /** 블록 색 직접 고르기: [피스 7칸] + [견본 16색]. 고른 피스에 견본 색을 입힌다 */
  let colorPiece = "T";
  const colorPicker = visual => {
    const palette = paletteFor(visual, findTheme(visual.theme));
    const pieces = el(
      "div",
      { class: "color-pieces", role: "group", "aria-label": t("색을 바꿀 피스") },
      ...PIECE_ORDER.map((piece, i) => {
        const b = el(
          "button",
          {
            type: "button",
            class: "color-piece",
            "data-piece": piece,
            "aria-pressed": String(piece === colorPiece),
            "aria-label": t("{piece} 피스", { piece }),
          },
          el("span", { class: "color-chip", style: `background-color: ${palette[i + 1]}` }),
          el("strong", { text: piece })
        );
        b.addEventListener("click", () => {
          colorPiece = piece;
          render();
          /** @type {HTMLElement | null} */ (dialog.querySelector(`.color-piece[data-piece="${piece}"]`))?.focus();
        });
        return b;
      })
    );
    const swatches = el(
      "div",
      { class: "color-swatches", role: "group", "aria-label": t("색 견본") },
      ...COLOR_SWATCHES.map(color => {
        const chosen = (visual.colors[colorPiece] ?? "") === color;
        const b = el("button", {
          type: "button",
          class: "color-swatch",
          "data-color": color,
          "aria-pressed": String(chosen),
          "aria-label": t("{piece} 피스를 이 색으로 · {color}", { piece: colorPiece, color }),
          style: `background-color: ${color}`,
        });
        b.addEventListener("click", () => {
          update({
            visual: { ...getSettings().visual, colors: { ...getSettings().visual.colors, [colorPiece]: color } },
          });
          render();
          /** @type {HTMLElement | null} */ (dialog.querySelector(`.color-swatch[data-color="${color}"]`))?.focus();
        });
        return b;
      })
    );
    const reset = button({ label: t("테마 색으로"), icon: "reset", size: "s", id: "color-reset" });
    reset.addEventListener("click", () => {
      update({ visual: { ...getSettings().visual, colors: {} } });
      render();
    });
    return fieldRow({
      id: "color-pieces",
      label: t("피스 색"),
      hint: t("{piece} 피스를 고른 상태예요", { piece: colorPiece }),
      className: "is-wide",
      control: el("div", { class: "color-picker" }, pieces, swatches, el("div", {}, reset)),
    });
  };

  const setVisual = (key, v) => {
    update({ visual: { ...getSettings().visual, [key]: v } });
    render();
  };

  const visualAccessRows = visual => [
    fieldRow({
      id: "set-effects",
      label: t("화면 효과"),
      hint: EFFECT_HINTS[visual.effects],
      control: segmented({
        wrap: true,
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
      hint:
        visual.palette === "contrast"
          ? t("색을 구분하기 쉬운 색 조합을 써요")
          : visual.palette === "custom"
            ? t("아래에서 피스를 고르고 색을 눌러요. 고르지 않은 피스는 테마 색이에요")
            : t("고른 테마의 색을 써요"),
      control: segmented({
        wrap: true,
        id: "set-palette",
        label: t("블록 색"),
        options: [
          ["theme", t("테마 색")],
          ["contrast", t("색각 친화")],
          ["custom", t("직접 고르기")],
        ],
        value: visual.palette,
        onChange: v => setVisual("palette", v),
      }),
    }),
    ...(visual.palette === "custom" ? [colorPicker(visual)] : []),
  ];

  /**
   * 게임 테마: 위에 큰 미리보기(작은 게임 화면) 하나, 아래에 견본 칩.
   * 칩에 마우스를 올리거나 키보드로 옮기면 미리보기만 그 테마로 바뀌고, 누르면 적용한다.
   * 미리보기는 지금 화면 설정(색 구성·무늬·고스트·격자·효과)을 그대로 따른다.
   */
  const themeCards = visual => {
    const canvas = el("canvas", { class: "theme-stage-canvas", "aria-hidden": "true" });
    const name = el("strong", { class: "theme-stage-name" });
    const state = el("span", { class: "theme-stage-state" });
    const desc = el("small", { class: "theme-stage-desc" });
    const stage = createThemeStage(canvas);
    // 지금 미리보기에 보이는 테마(칩에 올리면 바뀐다) → "소리 들어 보기"가 그 테마의 소리를 낸다
    let shown = visual.theme;
    const listen = button({
      label: t("소리 들어 보기"),
      icon: "sound",
      size: "s",
      id: "theme-listen",
      onClick: () => onPreviewTheme?.(shown),
    });
    const showTheme = id => {
      shown = id;
      const theme = findTheme(id);
      stage.show(theme, paletteFor(visual, theme), visual);
      name.textContent = theme.name;
      desc.textContent = theme.description;
      const current = id === visual.theme;
      state.textContent = current ? t("사용 중") : t("미리보기");
      state.classList.toggle("is-preview", !current);
    };
    showTheme(visual.theme);
    // 열린 숨은 테마는 목록 끝에 붙는다
    const ids = [...THEME_IDS, ...openedThemes()];
    const cards = choiceCards({
      id: "set-theme",
      label: t("게임 테마"),
      compact: true,
      options: ids.map(id => {
        const swatch = el("canvas", { class: "theme-swatch", "aria-hidden": "true" });
        drawThemeSwatch(swatch, THEMES[id], paletteFor(visual, THEMES[id]));
        return { value: id, title: THEMES[id].name, preview: swatch };
      }),
      value: visual.theme,
      onChange: v => setVisual("theme", v),
    });
    cards.querySelectorAll("button").forEach((card, index) => {
      const id = ids[index];
      card.addEventListener("pointerenter", e => {
        if (e.pointerType === "mouse") showTheme(id);
      });
      card.addEventListener("pointerleave", () => showTheme(visual.theme));
      card.addEventListener("focus", () => {
        if (card.matches(":focus-visible")) showTheme(id);
      });
      card.addEventListener("blur", () => showTheme(visual.theme));
    });
    if (!reducedMotion.matches) {
      playingPreview = stage;
      stage.play();
    }
    return el(
      "div",
      { class: "theme-picker" },
      el(
        "div",
        // 미리보기 둘레는 게임 중 화면과 같은 색(늘 어둡게 / 화면 색 따르기)
        { class: "theme-stage surface-game" },
        canvas,
        el(
          "div",
          { class: "theme-stage-caption" },
          el("div", { class: "theme-stage-title" }, name, state),
          desc,
          el("div", { class: "theme-stage-actions" }, listen)
        )
      ),
      cards
    );
  };

  const visualSection = () => {
    const visual = getSettings().visual;
    const scheme = getSettings().scheme;
    return el(
      "section",
      { class: "field-section" },
      volumeRow(),
      soundRow(),
      fieldRow({
        id: "set-scheme",
        label: t("화면 색"),
        hint: t(SCHEME_HINTS[scheme]),
        control: segmented({
          wrap: true,
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
        control: segmented({
          wrap: true,
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
        hint: t("보드·블록의 색과 모양, 효과가 바뀌어요. 미리보기는 지금 화면 설정을 따라요"),
        className: "is-wide",
        control: themeCards(visual),
      }),
      ...visualAccessRows(visual),
      fieldRow({
        id: "set-ghost",
        label: t("고스트"),
        hint: t("피스가 떨어질 자리 표시의 진하기"),
        control: segmented({
          wrap: true,
          id: "set-ghost",
          label: t("고스트"),
          options: [
            ["faint", t("흐리게")],
            ["normal", t("보통")],
            ["strong", t("진하게")],
          ],
          value: visual.ghost,
          onChange: v => setVisual("ghost", v),
        }),
      }),
      fieldRow({
        id: "set-grid",
        label: t("격자 선"),
        hint:
          visual.grid === "off"
            ? t("격자 선 없이 블록만 보여요")
            : t("테마의 격자(선이나 점)를 그려요. 그라파이트는 원래 격자가 없어요"),
        control: segmented({
          wrap: true,
          id: "set-grid",
          label: t("격자 선"),
          options: [
            ["on", t("켜기")],
            ["off", t("끄기")],
          ],
          value: visual.grid,
          onChange: v => setVisual("grid", v),
        }),
      }),
      fieldRow({
        id: "set-inputs",
        label: t("키 입력 표시"),
        hint: t("게임과 리플레이에서 누르는 키를 정보 칸 아래에 보여 줘요"),
        control: segmented({
          wrap: true,
          id: "set-inputs",
          label: t("키 입력 표시"),
          options: [
            ["off", t("끄기")],
            ["on", t("켜기")],
          ],
          value: visual.inputs,
          onChange: v => setVisual("inputs", v),
        }),
      }),
      fieldRow({
        id: "set-lang",
        label: t("언어"),
        hint:
          getSettings().lang === "auto"
            ? t("브라우저 언어를 따라요 · 바꾸면 페이지를 다시 불러와요")
            : t("바꾸면 페이지를 다시 불러와요"),
        control: segmented({
          wrap: true,
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

  /** 효과음 종류: 테마 따라가기, 또는 하나로 고정(기록을 노릴 때 소리가 바뀌지 않게) */
  const soundRow = () => {
    const value = getSettings().sound;
    return fieldRow({
      id: "set-sound",
      label: t("효과음 종류"),
      hint: t(SOUND_HINTS[value] ?? SOUND_HINTS.theme),
      // 다섯 가지라 세그먼트는 휴대폰에서 글자가 두 줄로 찌그러진다 → 목록(설명은 목록 안에)
      control: dropdown({
        id: "set-sound",
        label: t("효과음 종류"),
        // 테마 따라, 또는 한 테마의 소리로 고정(숨은 테마는 열렸을 때만)
        options: [
          { value: "theme", label: t("테마 따라"), hint: t(SOUND_HINTS.theme) },
          ...[...THEME_IDS, ...openedThemes()].map(id => ({
            value: id,
            label: THEMES[id].name,
            hint: t(SOUND_HINTS[id] ?? ""),
          })),
        ],
        value,
        onChange: v => {
          update({ sound: v });
          render();
        },
      }),
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
  /** 데이터: 백업 파일로 저장·불러오기, 받은 리플레이 파일 열기 */
  const dataSection = () => {
    const menuOnly = !data.canImport();
    const exportBackup = button({
      label: t("저장"),
      icon: "download",
      size: "s",
      id: "export-backup",
    });
    exportBackup.addEventListener("click", () => data.exportBackup());
    const importBackup = button({
      label: t("불러오기"),
      icon: "folder",
      size: "s",
      id: "import-backup",
      disabled: menuOnly,
    });
    importBackup.addEventListener("click", () => data.importBackup());
    const openReplay = button({
      label: t("파일 열기"),
      icon: "folder",
      size: "s",
      id: "open-replay",
      disabled: menuOnly,
    });
    openReplay.addEventListener("click", () => data.openReplay());
    // 기록 지우기(F25): 기록표·리플레이·Sprint 기록 흐름·CPU 전적. 설정·내 규칙·연습·퍼즐 진행도·업적은 남긴다
    const clearRecords = confirmButton({
      label: t("지우기"),
      confirmLabel: t("정말 지우기"),
      icon: "close",
      size: "s",
      id: "clear-records",
      disabled: menuOnly,
      onConfirm: () => {
        data.clearRecords();
        notice.textContent = t("기록과 리플레이를 지웠어요.");
      },
    });
    return el(
      "section",
      { class: "field-section" },
      fieldRow({
        id: "export-backup",
        label: t("백업 파일로 저장"),
        hint: t("설정·기록·리플레이·연습 진행도를 파일 하나로"),
        control: exportBackup,
      }),
      fieldRow({
        id: "import-backup",
        label: t("백업 불러오기"),
        hint: menuOnly ? t("첫 화면에서 열었을 때만 불러올 수 있어요") : t("불러오기 전에 담긴 항목 수를 확인해요"),
        control: importBackup,
      }),
      fieldRow({
        id: "open-replay",
        label: t("리플레이 파일 열기"),
        hint: menuOnly ? t("첫 화면에서 열었을 때만 열 수 있어요") : t("받은 리플레이 파일(.json)을 재생해요"),
        control: openReplay,
      }),
      fieldRow({
        id: "clear-records",
        label: t("기록 지우기"),
        hint: menuOnly
          ? t("첫 화면에서 열었을 때만 지울 수 있어요")
          : t("기록표·리플레이·CPU 전적을 지워요. 설정·내 규칙·진행도·업적은 남아요. 먼저 백업하세요"),
        control: clearRecords,
      })
    );
  };

  const sectionFor = t =>
    t === "control"
      ? handlingSection()
      : t === "visual"
        ? visualSection()
        : t === "access"
          ? accessSection()
          : t === "data"
            ? dataSection()
            : bindingSection(t === "keys" ? "key" : "pad");

  const render = () => {
    stopThemePreview();
    const scroll = dialog.querySelector(".dialog-body")?.scrollTop ?? 0;
    // 값을 바꾸면 내용을 다시 그린다 → 포커스가 있던 조작을 기억했다가 돌려준다(키보드로 쓸 때 자리를 잃지 않게)
    const focused = dialog.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    // "설정"만 되돌린다(기록·리플레이·업적은 그대로 — 지우기는 데이터 탭). 두 번 눌러 확정(U40)
    const reset = confirmButton({
      label: t("설정 초기화"),
      confirmLabel: t("정말 초기화"),
      icon: "reset",
      id: "settings-reset",
      title: t("조작감·키·화면 설정을 기본값으로 되돌려요. 기록은 지우지 않아요."),
      onConfirm: () => resetAll(),
    });
    const resetAll = () => {
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
        access: defaultAccess(),
        touchMode: DEFAULT_SETTINGS.touchMode,
      });
      notice.textContent = t("설정을 기본값으로 되돌렸어요. 기록은 그대로예요.");
      render();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#settings-reset"))?.focus();
    };
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
    if (dialog.open && !dialog.contains(document.activeElement)) restoreFocus(dialog, focused);
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
    stopThemePreview();
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
    /** 알림 칸에 글을 띄운다(데이터 탭의 결과 등) */
    notify(text) {
      notice.textContent = text;
    },
    close() {
      if (dialog.open) dialog.close();
    },
  };
};
