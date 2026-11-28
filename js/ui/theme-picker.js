import { t } from "../i18n/index.js";
import { createThemeStage, drawThemeSwatch } from "../render/preview.js";
import { findTheme, paletteFor, THEMES } from "../render/themes.js";
import { button, choiceCards, dropdown, iconButton, setSegmented } from "./components.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";

/**
 * 가리킨 테마는 미리 보고, 누른 테마만 설정에 적용한다.
 * @param {{
 *   visual: import("../render/canvas.js").Visual,
 *   ids: readonly string[],
 *   getVolume: () => number,
 *   onTogglePlayback: () => void,
 *   onSelect: (id: string) => void,
 *   onPreviewTheme?: (id: string) => void
 * }} options
 */
export const createThemePicker = ({ visual, ids, getVolume, onSelect, onPreviewTheme, onTogglePlayback }) => {
  const canvas = el("canvas", { class: "theme-stage-canvas", "aria-hidden": "true" });
  const name = el("strong", { class: "theme-stage-name" });
  const state = el("span", { class: "theme-stage-state" });
  const desc = el("small", { class: "theme-stage-desc" });
  const soundNotice = el("small", { id: "theme-sound-notice", class: "theme-stage-notice", role: "status" });
  const stage = createThemeStage(canvas);
  let selected = visual.theme;
  let shown = null;
  const showTheme = id => {
    if (id !== shown) {
      shown = id;
      const theme = findTheme(id);
      stage.show(theme, paletteFor(visual, theme), visual);
      name.textContent = theme.name;
      desc.textContent = theme.description;
    }
    const current = id === selected;
    state.textContent = current ? t("사용 중") : t("미리보기");
    state.classList.toggle("is-preview", !current);
  };
  const restoreSelection = () => showTheme(selected);
  restoreSelection();
  const playback = iconButton({
    label: t("보드 동작 보기"),
    icon: "play",
    variant: "default",
    size: "s",
    id: "theme-play",
    "aria-pressed": "false",
    onClick: onTogglePlayback,
  });
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
      onPreviewTheme?.(selected);
    },
  });
  listen.addEventListener("focus", restoreSelection);
  const selectTheme = id => {
    if (id === selected) return;
    selected = id;
    setSegmented(cards, id);
    choice.setValue(id);
    choice.setAttribute("aria-label", choiceName());
    restoreSelection();
    onSelect(id);
    if (choice.getClientRects().length) picker.scrollIntoView({ block: "nearest" });
  };
  const choice = dropdown({
    id: "theme-choice",
    label: t("게임 테마"),
    options: ids.map(id => ({ value: id, label: THEMES[id].name })),
    value: selected,
    onChange: selectTheme,
  });
  const choiceName = () => `${t("게임 테마")} · ${THEMES[selected].name}`;
  choice.setAttribute("aria-label", choiceName());
  const cards = choiceCards({
    id: "set-theme",
    label: t("게임 테마"),
    compact: true,
    options: ids.map(id => {
      const swatch = el("canvas", { class: "theme-swatch", "aria-hidden": "true" });
      drawThemeSwatch(swatch, THEMES[id], paletteFor(visual, THEMES[id]));
      return { value: id, title: THEMES[id].name, preview: swatch };
    }),
    value: selected,
    onChange: selectTheme,
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
        el("div", { class: "theme-stage-actions" }, playback, listen, soundNotice)
      )
    ),
    cards,
    el("div", { class: "theme-touch-choice" }, choice)
  );
  return {
    element: picker,
    setPlaying(playing) {
      const pressed = String(playing);
      if (playback.getAttribute("aria-pressed") !== pressed) {
        playback.setAttribute("aria-pressed", pressed);
        playback.replaceChildren(icon(playing ? "pause" : "play"));
      }
      playback.classList.toggle("btn-primary", playing);
      if (playing) stage.play();
      else stage.stop();
    },
  };
};
