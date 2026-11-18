// 렌더러. 엔진 상태를 읽어서 그리기만 한다(상태를 바꾸지 않는다).
// 한 캔버스에 [홀드 | 보드 | 넥스트]를 나란히 그린다. 보드 위로 2줄 여유를 둬서 막 생성된 피스가 보이게 한다.
// 모습은 게임 테마(./themes.js)가 정한다. 접근성 설정(색각 친화 색, 효과 줄임/끄기)은 테마 위에 덮인다.
import { VISIBLE_ROWS, WIDTH as COLS, createBoard, get } from "../core/board.js";
import { CELL_ID } from "../core/pieces.js";
import { VISIBLE_TOP } from "../core/engine.js";
import { createEffects } from "./effects.js";
import { createSlide } from "./motion.js";
import { drawMark, findTheme, paletteFor } from "./themes.js";

const MARGIN_TOP = 2; // 보드 위 여유 줄
const ROWS = VISIBLE_ROWS + MARGIN_TOP;
const CSS_CELL = 28;

/**
 * @typedef {{ theme: string, effects: "full" | "reduced" | "off", palette: "theme" | "contrast" | "custom", pattern?: "on" | "off", ghost?: string, grid?: "on" | "off", colors?: Record<string, string> }} Visual
 * @param {HTMLCanvasElement} canvas
 * @param {{ getVisual: () => Visual, compact?: boolean }} options
 */
export const createRenderer = (canvas, { getVisual, compact = false }) => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const effects = createEffects();
  const slide = createSlide();
  const emptyBoard = createBoard();

  // 좁은 화면(휴대폰 세로)이면 홀드·넥스트 칸을 줄인다. 휴대폰 가로는 넓은 배치(css/game.css와 같은 조건)
  const narrow = window.matchMedia("(max-width: 720px) and (not ((orientation: landscape) and (max-height: 520px)))");
  let cell = 0;
  let side = 0;
  /** devicePixelRatio를 반영해 캔버스 해상도를 정하고 셀 크기를 정수로 맞춘다(번짐 방지). */
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const next = Math.max(8, Math.round((compact ? 14 : CSS_CELL) * dpr));
    const nextSide = compact ? 0 : narrow.matches ? 3 : 5;
    if (next === cell && nextSide === side) return;
    cell = next;
    side = nextSide;
    const cols = COLS + side * 2;
    canvas.width = cols * cell;
    canvas.height = ROWS * cell;
    canvas.style.aspectRatio = `${cols} / ${ROWS}`;
  };

  /** 미리보기 상자(4×2칸) 가운데에 피스를 그린다. */
  const preview = (theme, palette, game, type, left, top, size, dim = false) => {
    const shape = game.shapeOf(type, 0);
    const xs = shape.map(c => c[0]);
    const ys = shape.map(c => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = left + ((4 - w) * size) / 2 - Math.min(...xs) * size;
    const oy = top + ((2 - h) * size) / 2 - Math.min(...ys) * size;
    ctx.globalAlpha = dim ? 0.35 : 1;
    for (const [x, y] of shape) {
      theme.block(ctx, ox + x * size, oy + y * size, size, palette[CELL_ID[type]]);
      if (pattern) drawMark(ctx, ox + x * size, oy + y * size, size, CELL_ID[type], palette[CELL_ID[type]]);
    }
    ctx.globalAlpha = 1;
  };

  /** "Hold"·"Next" 글자색: 캔버스의 CSS 글자색(게임 화면 표면에 맞춘다) */
  let labelColor = "#b1b9b0";
  const label = (text, x, y) => {
    ctx.fillStyle = labelColor;
    ctx.font = `600 ${Math.round(cell * 0.46)}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  };

  /** 이번 그리기에서 블록 무늬를 그릴지(접근성 설정) */
  let pattern = false;

  const drawGrid = ({ bg, grid, edge }, bx, by, lines = true) => {
    const width = COLS * cell;
    const height = VISIBLE_ROWS * cell;
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, width, height);
    ctx.lineWidth = 1;
    if (lines) {
      ctx.strokeStyle = grid;
      ctx.beginPath();
      for (let x = 1; x < COLS; x++) {
        ctx.moveTo(bx + x * cell + 0.5, by);
        ctx.lineTo(bx + x * cell + 0.5, by + height);
      }
      for (let y = 1; y < VISIBLE_ROWS; y++) {
        ctx.moveTo(bx, by + y * cell + 0.5);
        ctx.lineTo(bx + width, by + y * cell + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = edge;
    ctx.strokeRect(bx + 0.5, by + 0.5, width - 1, height - 1);
  };

  /**
   * @param {ReturnType<typeof import("../core/engine.js").createGame> | null} game  null이면 빈 보드만
   */
  const draw = (game, now = performance.now()) => {
    fit();
    const visual = getVisual();
    const theme = findTheme(visual.theme);
    const palette = paletteFor(visual, theme);
    const motion = visual.effects === "full";
    const { board, active, hold, holdUsed, queue } = game
      ? game.state
      : { board: emptyBoard, active: null, hold: null, holdUsed: false, queue: [] };
    const bx = side * cell;
    const by = MARGIN_TOP * cell;
    const toY = y => by + (y - VISIBLE_TOP) * cell;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    effects.prune(now, visual.effects);
    pattern = visual.pattern === "on";
    drawGrid(theme.board, bx, by, visual.grid !== "off");
    effects.drawDrops(ctx, { bx, by, cell, toY }, now, theme.board.ink);

    // 방금 놓인 피스의 아래 모서리를 기준으로 높이만 압축한다.
    for (let y = VISIBLE_TOP - MARGIN_TOP; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const value = get(board, x, y);
        if (!value) continue;
        const impact = effects.landing(x, y, value, now);
        if (impact) {
          const floor = toY(impact.floor);
          ctx.save();
          ctx.translate(0, floor);
          ctx.scale(1, impact.scale);
          ctx.translate(0, -floor);
        }
        theme.block(ctx, bx + x * cell, toY(y), cell, palette[value]);
        if (pattern) drawMark(ctx, bx + x * cell, toY(y), cell, value, palette[value]);
        if (impact) ctx.restore();
      }
    }

    if (active) {
      const color = palette[CELL_ID[active.type]];
      const cells = game.activeCells();
      // 고스트(판정 위치 그대로)
      const gy = game.ghostY();
      if (game.rules.ghost && gy !== null && gy !== active.y) {
        for (const [x, y] of cells) theme.ghost(ctx, bx + x * cell, toY(y + gy - active.y), cell, color, visual.ghost);
      }
      // 그리는 위치는 효과 설정에 따라 짧게 미끄러질 수 있다(효과 "전체"일 때만).
      const shown = slide.at(game.state.pieceId, active.x, active.y, now, motion ? theme.motion.slideMs : 0);
      const ox = (shown.x - active.x) * cell;
      const oy = (shown.y - active.y) * cell;
      // 고정까지 남은 시간만큼 살짝 어두워진다.
      const lock = game.state.lock;
      const delay = game.rules.lock.delay;
      ctx.globalAlpha = lock.timer > 0 && delay > 0 ? 1 - 0.4 * Math.min(1, lock.timer / delay) : 1;
      for (const [x, y] of cells) {
        if (y >= VISIBLE_TOP - MARGIN_TOP) {
          theme.block(ctx, bx + x * cell + ox, toY(y) + oy, cell, color);
          if (pattern) drawMark(ctx, bx + x * cell + ox, toY(y) + oy, cell, CELL_ID[active.type], color);
        }
      }
      ctx.globalAlpha = 1;
    }

    effects.draw(ctx, { bx, cell, toY, cols: COLS }, now, theme.board.ink, visual.effects);

    // Survival: 대기 중인 쓰레기 줄을 보드 왼쪽 가장자리에 빨간 막대로
    const pending = Math.min(VISIBLE_ROWS, game?.state.garbage?.pending ?? 0);
    if (pending > 0) {
      const w = Math.max(2, Math.round(cell * 0.18));
      ctx.fillStyle = "#e5484d";
      ctx.fillRect(bx - w - 1, by + (VISIBLE_ROWS - pending) * cell, w, pending * cell);
    }

    if (!game || compact) return;

    labelColor = getComputedStyle(canvas).color || labelColor;
    // 홀드
    const small = Math.round(cell * (narrow.matches ? 0.57 : 0.8));
    const sidePad = Math.round((side * cell - 4 * small) / 2);
    if (game.rules.hold.enabled) {
      label("Hold", sidePad, by);
      if (hold) preview(theme, palette, game, hold, sidePad, by + cell, small, holdUsed);
    }

    // 넥스트
    const nx = bx + COLS * cell + sidePad;
    if (game.rules.previewCount > 0) {
      label("Next", nx, by);
      // 퍼즐은 주어진 피스만(돌아오는 피스는 보이지 않게): 지금 피스를 뺀 남은 수까지
      const puzzle = game.state.puzzle;
      const shown = puzzle ? Math.max(0, puzzle.need - puzzle.placed - 1) : game.rules.previewCount;
      queue.slice(0, Math.min(game.rules.previewCount, shown)).forEach((type, i) => {
        preview(theme, palette, game, type, nx, by + cell + i * small * 3, small);
      });
    }
  };

  return {
    draw,
    /** 엔진 이벤트로 효과를 만든다 */
    addEvents: (events, now = performance.now()) => {
      if (!events.length) return;
      const visual = getVisual();
      effects.add(events, visual.effects, now, findTheme(visual.theme).motion);
    },
    clearEffects() {
      effects.clear();
      slide.reset();
    },
  };
};
