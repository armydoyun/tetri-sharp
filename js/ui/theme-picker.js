import { t } from "../i18n/index.js";
import { createThemeStage, drawThemeSwatch } from "../render/preview.js";
import { findTheme, paletteFor, THEMES } from "../render/themes.js";
import { button, choiceCards } from "./components.js";
import { el } from "./dom.js";

/**
 * 가리킨 테마는 미리 보고, 누른 테마만 설정에 적용한다.
 * @param {{
 *   visual: import("../render/canvas.js").Visual,
 *   ids: readonly string[],
 *   getVolume: () => number,
 *   onSelect: (id: string) => void,
 *   onPreviewTheme?: (id: string) => void
 * }} options
 */
export const createThemePicker = ({ visual, ids, getVolume, onSelect, onPreviewTheme }) => {
  const canvas = el("canvas", { class: "theme-stage-canvas", "aria-hidden": "true" });
  const name = el("strong", { class: "theme-stage-name" });
  const state = el("span", { class: "theme-stage-state" });
  const desc = el("small", { class: "theme-stage-desc" });
  const soundNotice = el("small", { id: "theme-sound-notice", class: "theme-stage-notice", role: "status" });
  const stage = createThemeStage(canvas);
  let shown = null;
  const showTheme = id => {
    if (id === shown) return;
    shown = id;
    const theme = findTheme(id);
    stage.show(theme, paletteFor(visual, theme), visual);
    name.textContent = theme.name;
    desc.textContent = theme.description;
    const current = id === visual.theme;
    state.textContent = current ? t("사용 중") : t("미리보기");
    state.classList.toggle("is-preview", !current);
  };
  const restoreSelection = () => showTheme(visual.theme);
  restoreSelection();
  const listen = button({
    label: t("소리 들어 보기"),
    icon: "sound",
    size: "s",
    id: "theme-listen",
    onClick: () => {
      restoreSelection();
      if (getVolume() === 0) {
        soundNotice.textContent = t("소리가 꺼져 있어요.");
        return;
      }
      soundNotice.textContent = "";
      onPreviewTheme?.(visual.theme);
    },
  });
  listen.addEventListener("focus", restoreSelection);
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
    onChange: onSelect,
  });
  cards.querySelectorAll("button").forEach((card, index) => {
    const id = ids[index];
    card.addEventListener("pointerenter", e => {
      if (e.pointerType === "mouse") showTheme(id);
    });
    card.addEventListener("focus", () => {
      if (card.matches(":focus-visible")) showTheme(id);
    });
  });
  cards.addEventListener("pointerleave", e => {
    if (e.pointerType === "mouse") restoreSelection();
  });
  cards.addEventListener("focusout", e => {
    if (!(e.relatedTarget instanceof Node && cards.contains(e.relatedTarget))) restoreSelection();
  });
  const picker = el(
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
        el(
          "div",
          { class: "theme-stage-descriptions" },
          desc,
          // 같은 칸에 포개서 현재 너비에서 가장 긴 설명의 높이를 잡는다.
          ...ids.map(id => el("small", { "aria-hidden": "true", text: THEMES[id].description }))
        ),
        el("div", { class: "theme-stage-actions" }, listen, soundNotice)
      )
    ),
    cards
  );
  return { element: picker, stage };
};
