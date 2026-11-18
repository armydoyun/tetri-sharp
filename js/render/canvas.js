// 렌더러. 엔진 상태를 읽어서 그리기만 한다(상태를 바꾸지 않는다).
// 한 캔버스에 [홀드 | 보드 | 넥스트]를 나란히 그린다. 보드 위로 2줄 여유를 둬서 막 생성된 피스가 보이게 한다.
import { VISIBLE_ROWS, createBoard, get } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";
import { VISIBLE_TOP } from "../core/engine.js";
import { createEffects } from "./effects.js";
import { PALETTES, drawBlock } from "./skins.js";

const COLOR_VARS = [
  "",
  "--piece-i",
  "--piece-j",
  "--piece-l",
  "--piece-o",
  "--piece-s",
  "--piece-t",
  "--piece-z",
  "--piece-garbage",
];

const SIDE = 5; // 홀드·넥스트 칸 너비(셀)
const MARGIN_TOP = 2; // 보드 위 여유 줄
const COLS = 10;
export const LAYOUT = Object.freeze({ cols: SIDE + COLS + SIDE, rows: VISIBLE_ROWS + MARGIN_TOP, cssCell: 28 });

/**
 * @typedef {{ effects: "full" | "reduced" | "off", skin: "flat" | "bevel" | "outline", palette: "default" | "contrast" }} Visual
 * @param {HTMLCanvasElement} canvas
 * @param {{ getVisual: () => Visual }} options
 */
export const createRenderer = (canvas, { getVisual }) => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  const basePalette = COLOR_VARS.map(name => (name ? v(name) : ""));
  // 게임 화면은 테마와 무관하게 항상 다크 → --game-* 토큰만 읽는다.
  const colors = {
    grid: v("--game-grid"),
    board: v("--game-board"),
    text: v("--game-text-dim"),
    bg: v("--game-bg"),
    accent: v("--game-accent"),
  };
  const effects = createEffects();
  let palette = basePalette;
  let skin = /** @type {Visual["skin"]} */ ("flat");

  let cell = 0;
  /** devicePixelRatio를 반영해 캔버스 해상도를 정하고 셀 크기를 정수로 맞춘다(번짐 방지). */
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const next = Math.max(8, Math.round(LAYOUT.cssCell * dpr));
    if (next === cell) return;
    cell = next;
    canvas.width = LAYOUT.cols * cell;
    canvas.height = LAYOUT.rows * cell;
    canvas.style.aspectRatio = `${LAYOUT.cols} / ${LAYOUT.rows}`;
  };

  const block = (px, py, color, size = cell) => drawBlock(ctx, skin, px, py, size, color);

  /** 미리보기 상자(4×2칸) 가운데에 피스를 그린다. */
  const preview = (game, type, left, top, size, dim = false) => {
    const shape = game.shapeOf(type, 0);
    const xs = shape.map(c => c[0]);
    const ys = shape.map(c => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = left + ((4 - w) * size) / 2 - Math.min(...xs) * size;
    const oy = top + ((2 - h) * size) / 2 - Math.min(...ys) * size;
    ctx.globalAlpha = dim ? 0.35 : 1;
    for (const [x, y] of shape) block(ox + x * size, oy + y * size, palette[CELL_ID[type]], size);
    ctx.globalAlpha = 1;
  };

  const label = (text, x, y) => {
    ctx.fillStyle = colors.text;
    ctx.font = `600 ${Math.round(cell * 0.45)}px "Space Grotesk", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  };

  const emptyBoard = createBoard();

  /** @param {ReturnType<typeof import("../core/engine.js").createGame> | null} game  null이면 빈 보드만 */
  const draw = (game, now = performance.now()) => {
    fit();
    const visual = getVisual();
    palette = PALETTES[visual.palette] ?? basePalette;
    skin = visual.skin;
    const { board, active, hold, holdUsed, queue } = game
      ? game.state
      : { board: emptyBoard, active: null, hold: null, holdUsed: false, queue: [] };
    const bx = SIDE * cell;
    const by = MARGIN_TOP * cell;
    const toY = y => by + (y - VISIBLE_TOP) * cell;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { dx, dy } = effects.shake(now, cell / 10);
    ctx.translate(dx, dy);

    // 보드 바탕과 격자
    ctx.fillStyle = colors.board;
    ctx.fillRect(bx, by, COLS * cell, VISIBLE_ROWS * cell);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(bx + x * cell + 0.5, by);
      ctx.lineTo(bx + x * cell + 0.5, by + VISIBLE_ROWS * cell);
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.moveTo(bx, by + y * cell + 0.5);
      ctx.lineTo(bx + COLS * cell, by + y * cell + 0.5);
    }
    ctx.stroke();

    // 쌓인 블록(보이는 영역 + 바로 위 여유 줄)
    for (let y = VISIBLE_TOP - MARGIN_TOP; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const c = get(board, x, y);
        if (c) block(bx + x * cell, toY(y), palette[c]);
      }
    }

    if (active) {
      const color = palette[CELL_ID[active.type]];
      const cells = game.activeCells();
      // 고스트
      const gy = game.ghostY();
      if (game.rules.ghost && gy !== null && gy !== active.y) {
        ctx.globalAlpha = 0.25;
        for (const [x, y] of cells) block(bx + x * cell, toY(y + gy - active.y), color);
        ctx.globalAlpha = 1;
      }
      // 고정까지 남은 시간만큼 살짝 어두워진다.
      const lock = game.state.lock;
      const delay = game.rules.lock.delay;
      ctx.globalAlpha = lock.timer > 0 && delay > 0 ? 1 - 0.4 * Math.min(1, lock.timer / delay) : 1;
      for (const [x, y] of cells) if (y >= VISIBLE_TOP - MARGIN_TOP) block(bx + x * cell, toY(y), color);
      ctx.globalAlpha = 1;
    }

    effects.draw(ctx, { bx, cell, toY, cols: COLS }, now, colors.accent);

    if (!game) return;

    // 홀드
    const small = Math.round(cell * 0.8);
    const sidePad = Math.round((SIDE * cell - 4 * small) / 2);
    if (game.rules.hold.enabled) {
      label("HOLD", sidePad, by);
      if (hold) preview(game, hold, sidePad, by + cell, small, holdUsed);
    }

    // 넥스트
    const nx = bx + COLS * cell + sidePad;
    if (game.rules.previewCount > 0) {
      label("NEXT", nx, by);
      queue.slice(0, game.rules.previewCount).forEach((type, i) => {
        preview(game, type, nx, by + cell + i * small * 3, small);
      });
    }
  };

  return {
    draw,
    /** 엔진 이벤트로 효과를 만든다 */
    addEvents: (events, now = performance.now()) => effects.add(events, getVisual().effects, now),
    clearEffects: () => effects.clear(),
  };
};
