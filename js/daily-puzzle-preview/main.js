import { HEIGHT, WIDTH, clearLines, createBoard } from "../core/board.js";
import { CELL_ID, GARBAGE } from "../core/pieces.js";
import { lang, t, translateDom } from "../i18n/index.js";
import { createBoardGrid } from "../render/board-grid.js";
import { ORIGINAL_THEMES } from "../render/themes.js";
import { button } from "../ui/components.js";
import { el } from "../ui/dom.js";
import { dropdown } from "../ui/select.js";

/** @typedef {{ type: string, hold: boolean, cells: [number, number][], lines: number, tspin: string }} Move */
/**
 * @typedef {{ key: string, seed: number, family: string, planned: string, pieces: string,
 *   rows: string[], code: string, goal: string, level: number, similarDate: string | null,
 *   stats: { firstChoices: number, wins: number, holdWins: number, deepestDeadEnd: number, height: number, path: Move[] } }} Day
 */

const { days, duplicates, similar } =
  /** @type {typeof globalThis & { __TETRI_DAILY_SAMPLE__: { days: Day[], duplicates: number, similar: number } }} */ (
    globalThis
  ).__TETRI_DAILY_SAMPLE__;
const gameBase64 = /** @type {typeof globalThis & { __TETRI_DAILY_GAME__: string }} */ (globalThis)
  .__TETRI_DAILY_GAME__;
const element = id => document.getElementById(id);
const familyNames = {
  fill: t("짧은 판 비우기"),
  combo: t("콤보 설계"),
  hold: t("홀드 순서"),
  tuck: t("처마 아래 끼워 넣기"),
  quad: t("4줄 우물 만들기"),
  spin: t("T스핀 자리 만들기"),
  trap: t("첫 배치 함정"),
};
const levels = [t("입문"), t("보통"), t("어려움")];
const describe = day => {
  switch (day.family) {
    case "combo":
      return t("피스마다 한 줄 이상을 지워 콤보를 끝까지 이어 보세요.");
    case "hold":
      return t("홀드를 사용해 주어진 피스로 판을 비워 보세요.");
    case "tuck":
      return t("처마 아래 빈칸까지 피스를 보내 두 줄을 지우세요.");
    case "quad":
      return t("앞 피스로 빈칸을 채운 뒤, 한 번에 네 줄을 지우세요.");
    case "spin":
      return day.goal === "tst"
        ? t("첫 피스로 자리를 만든 뒤 T-spin Triple을 하세요.")
        : t("첫 피스로 자리를 만든 뒤 T-spin Double을 하세요.");
    case "trap":
      return t("네 피스로 판을 비우세요. 마지막에 남을 모양까지 생각해 보세요.");
    default:
      return t("주어진 피스로 판을 비워 보세요.");
  }
};

document.documentElement.lang = lang;
translateDom();
element("sample-range").textContent = t("{from}부터 {to}까지 · 날짜 시드로 만든 {n}일", {
  from: days[0].key,
  to: days.at(-1).key,
  n: days.length,
});

const canvas = /** @type {HTMLCanvasElement} */ (element("sample-board"));
const cell = 32;
const rows = 7;
canvas.width = WIDTH * cell;
canvas.height = rows * cell;
const ctx = canvas.getContext("2d");
const theme = ORIGINAL_THEMES.modern;
const grid = createBoardGrid(0, 0, WIDTH, rows, cell);

let selected = days[0];
let filter = "all";
let moveIndex = -1;
let gameUrl = "";
const buttons = new Map();

const openGame = () => {
  if (!gameUrl) {
    const bytes = Uint8Array.from(atob(gameBase64), char => char.charCodeAt(0));
    gameUrl = URL.createObjectURL(new Blob([bytes], { type: "text/html;charset=utf-8" }));
  }
  window.open(`${gameUrl}#puzzle=${selected.code}`, "_blank", "noopener");
};

const play = button({
  id: "play-puzzle",
  label: t("게임에서 풀기"),
  icon: "play",
  variant: "primary",
  onClick: openGame,
});
const solution = button({
  id: "show-solution",
  label: t("풀이 보기"),
  "aria-pressed": "false",
  onClick: () => {
    moveIndex = moveIndex < 0 ? 0 : -1;
    renderBoard();
  },
});
const previous = button({
  label: t("이전 수"),
  size: "s",
  onClick: () => {
    moveIndex -= 1;
    renderBoard();
  },
});
const next = button({
  label: t("다음 수"),
  size: "s",
  onClick: () => {
    moveIndex += 1;
    renderBoard();
  },
});
const step = el("output", { class: "num" });
element("sample-actions").append(play, solution);
element("solution-controls").append(previous, step, next);

const renderBoard = () => {
  const board = createBoard();
  const initial = selected.rows.flatMap(row => [...row].map(value => (value === "1" ? GARBAGE : 0)));
  board.cells.set(initial, board.cells.length - initial.length);
  const path = selected.stats.path;
  const move = path[moveIndex];
  for (let i = 0; i < moveIndex; i++) {
    for (const [x, y] of path[i].cells) board.cells[y * WIDTH + x] = CELL_ID[path[i].type];
    clearLines(board);
  }
  if (move) for (const [x, y] of move.cells) board.cells[y * WIDTH + x] = CELL_ID[move.type];
  grid(ctx, theme, true);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const value = board.cells[(HEIGHT - rows + y) * WIDTH + x];
      if (value) theme.block(ctx, x * cell, y * cell, cell, theme.palette[value]);
    }
  }
  canvas.setAttribute("aria-label", t("{name} 퍼즐 보드", { name: familyNames[selected.family] }));
  solution.setAttribute("aria-pressed", String(Boolean(move)));
  element("solution-controls").classList.toggle("is-invisible", !move);
  previous.disabled = moveIndex <= 0;
  next.disabled = !move || moveIndex >= path.length - 1;
  step.textContent = `${moveIndex + 1} / ${path.length}`;
  element("solution-status").textContent = move
    ? move.hold
      ? t("홀드 후 {piece} 배치 · {n}줄", { piece: move.type, n: move.lines })
      : t("{piece} 배치 · {n}줄", { piece: move.type, n: move.lines })
    : "";
};

const fields = (target, rows) =>
  target.replaceChildren(
    ...rows.flatMap(([name, value]) => [el("dt", { text: name }), el("dd", { class: "num", text: String(value) })])
  );

const select = day => {
  buttons.get(selected.key)?.setAttribute("aria-pressed", "false");
  selected = day;
  moveIndex = -1;
  buttons.get(day.key)?.setAttribute("aria-pressed", "true");
  element("selected-date").textContent = day.key;
  element("selected-family").textContent = familyNames[day.family];
  element("selected-level").textContent = levels[day.level - 1];
  element("selected-description").textContent = describe(day);
  element("sample-pieces").replaceChildren(
    ...[...day.pieces].map(piece => {
      const item = el("li", { text: piece });
      item.style.setProperty("--piece-color", theme.palette[CELL_ID[piece]]);
      return item;
    })
  );
  fields(element("selected-metrics"), [
    [t("첫 배치 후보"), day.stats.firstChoices],
    [t("완주 가능한 첫 배치"), day.stats.wins],
    [t("오답 경로 최대 수"), day.stats.deepestDeadEnd || "—"],
    [t("탐색 높이"), t("{n}줄", { n: day.stats.height })],
    [t("비슷한 판의 날짜"), day.similarDate ?? "—"],
  ]);
  renderBoard();
};

const renderDays = () => {
  buttons.clear();
  const visible = days.filter(day => filter === "all" || day.family === filter);
  element("sample-days").replaceChildren(
    ...visible.map(day => {
      const item = button({
        label: `${day.key.slice(5)} · ${familyNames[day.family]}`,
        meta: levels[day.level - 1],
        size: "s",
        "aria-label": `${day.key} · ${familyNames[day.family]} · ${levels[day.level - 1]}`,
        "aria-pressed": String(day === selected),
        onClick: () => select(day),
      });
      buttons.set(day.key, item);
      return el("li", {}, item);
    })
  );
  element("sample-days").scrollTop = 0;
  if (!visible.includes(selected)) select(visible[0]);
};

element("sample-filter").append(
  dropdown({
    id: "daily-sample-filter",
    label: t("퍼즐 유형"),
    options: [
      { value: "all", label: t("모든 유형") },
      ...Object.entries(familyNames)
        .filter(([value]) => days.some(day => day.family === value))
        .map(([value, label]) => ({ value, label })),
    ],
    value: "all",
    onChange: value => {
      filter = value;
      renderDays();
    },
  })
);

fields(element("sample-audit"), [
  ...Object.entries(familyNames).map(([family, label]) => [label, days.filter(day => day.family === family).length]),
  [t("입문 / 보통 / 어려움"), levels.map((_, index) => days.filter(day => day.level === index + 1).length).join(" / ")],
  [t("반복된 판"), duplicates],
  [t("비슷한 판"), similar],
  [t("계획과 달라진 유형"), days.filter(day => day.family !== day.planned).length],
]);

renderDays();
select(selected);
