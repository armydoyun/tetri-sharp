import { WIDTH } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";
import { lang, t, translateDom } from "../i18n/index.js";
import { createBoardGrid } from "../render/board-grid.js";
import { ALL_THEME_IDS, THEMES } from "../render/themes.js";
import { button, dropdown, segmented, setSegmented } from "../ui/components.js";
import { el } from "../ui/dom.js";
import { BOARD_ROWS, BOARD_TOP, puzzleGoalFrames } from "./scenes.js";

document.documentElement.lang = lang;
translateDom();

const frames = puzzleGoalFrames();
/** @type {Array<[string, string]>} */
const phases = [
  ["0", t("시작 전")],
  ["1", t("진행 중")],
  ["2", t("목표 달성")],
];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const titles = {
  lines: t("{n}줄 지우기", { n: 2 }),
  tsd: t("T스핀 더블"),
  pc: t("퍼펙트 클리어"),
};
const instructions = {
  lines: t("피스를 놓을 때마다 지운 줄을 더해요."),
  tsd: t("한 수에서 T스핀과 두 줄 삭제를 함께 달성해요."),
  pc: t("보드에 남은 블록을 모두 지워요."),
};
const values = {
  lines: frame => `${frame.lines} / 2`,
  tsd: () => t("한 번에 2줄"),
  pc: frame => t("남은 줄 {n}", { n: frame.remaining }),
};

const mark = () => el("span", { class: "goal-mark" });

const createCard = id => {
  const cell = Math.round(24 * (devicePixelRatio || 1));
  const board = /** @type {HTMLCanvasElement} */ (
    el("canvas", {
      class: "goal-board",
      width: cell * WIDTH,
      height: cell * BOARD_ROWS,
      role: "img",
      "aria-label": t("{goal} 보드", { goal: titles[id] }),
    })
  );
  const ctx = board.getContext("2d");
  const grid = createBoardGrid(0, 0, WIDTH, BOARD_ROWS, cell);
  const title = el("h2", { id: `goal-${id}-title`, text: titles[id] });
  const status = el("p", { class: "goal-status" });
  const value = el("p", { class: "goal-value" });
  const bars = Array.from({ length: id === "pc" ? 3 : 2 }, mark);
  const tCells = id === "tsd" ? Array.from({ length: 4 }, mark) : [];
  const marks = el("div", { class: "goal-marks", "data-kind": id, "aria-hidden": "true" });
  if (tCells.length) marks.append(el("div", { class: "goal-t" }, ...tCells));
  marks.append(...bars);
  const hud = el("div", { class: "goal-hud" }, status, marks, value);
  const card = el(
    "article",
    { class: "goal-card", "data-goal": id, "aria-labelledby": title.id },
    title,
    el("div", { class: "goal-stage" }, board, hud),
    el("p", { text: instructions[id] })
  );

  const update = (theme, phase, celebrate) => {
    const frame = frames[id][phase];
    status.textContent = phases[phase][1];
    value.textContent = values[id](frame);
    hud.dataset.complete = String(frame.done);
    const filled = id === "pc" ? frame.remaining : frame.lines;
    bars.forEach((bar, index) => (bar.dataset.filled = String(index < filled)));
    tCells.forEach(cell => (cell.dataset.filled = String(frame.done)));
    for (const animation of hud.getAnimations()) animation.cancel();
    if (celebrate && frame.done && !reducedMotion.matches) {
      hud.animate(
        [
          { outline: "var(--border-w) solid var(--accent)", outlineOffset: "calc(-1 * var(--border-w))" },
          { outline: "var(--border-w) solid transparent", outlineOffset: "calc(-1 * var(--border-w))" },
        ],
        { duration: 360, easing: "ease-out" }
      );
    }
    if (!ctx) return;

    grid(ctx, theme, true);
    frame.cells.forEach((color, index) => {
      if (color) theme.block(ctx, (index % WIDTH) * cell, Math.floor(index / WIDTH) * cell, cell, theme.palette[color]);
    });
    const pieceColor = theme.palette[CELL_ID[frame.piece]];
    for (const [x, y] of frame.ghost)
      if (y >= BOARD_TOP) theme.ghost(ctx, x * cell, (y - BOARD_TOP) * cell, cell, pieceColor, "strong");
    for (const [x, y] of frame.active)
      if (y >= BOARD_TOP) theme.block(ctx, x * cell, (y - BOARD_TOP) * cell, cell, pieceColor);
  };
  return { card, update };
};

const cards = Object.keys(frames).map(createCard);
document.getElementById("goal-boards").append(...cards.map(({ card }) => card));

let phase = 0;
let theme = THEMES.modern;
/** @type {number[]} */
let timers = [];
const stopPlayback = () => {
  timers.forEach(timer => clearTimeout(timer));
  timers = [];
};
const setPhase = next => {
  const celebrate = next !== phase;
  phase = next;
  setSegmented(stageControl, String(phase));
  for (const card of cards) card.update(theme, phase, celebrate);
};
const stageControl = segmented({
  id: "goal-phase",
  label: t("퍼즐 진행 단계"),
  options: phases,
  value: String(phase),
  wrap: true,
  arrows: true,
  onChange: value => {
    stopPlayback();
    setPhase(Number(value));
  },
});
document.getElementById("goal-transport").append(
  stageControl,
  button({
    label: t("연속 재생"),
    icon: "play",
    size: "s",
    onClick: () => {
      stopPlayback();
      setPhase(0);
      timers = [window.setTimeout(() => setPhase(1), 900), window.setTimeout(() => setPhase(2), 1800)];
    },
  })
);
document.getElementById("goal-theme").append(
  dropdown({
    id: "goal-theme-select",
    label: t("게임 테마"),
    value: "modern",
    options: ALL_THEME_IDS.map(id => ({ value: id, label: THEMES[id].name })),
    onChange: id => {
      theme = THEMES[id];
      setPhase(phase);
    },
  })
);
setPhase(0);
