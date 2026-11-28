// 렌더러. 엔진 상태를 읽어서 그리기만 한다(상태를 바꾸지 않는다).
// 한 캔버스에 [홀드 | 보드 | 넥스트]를 나란히 그린다. 보드 위로 2줄 여유를 둬서 막 생성된 피스가 보이게 한다.
// 모습은 게임 테마(./themes.js)가 정한다. 접근성 설정(색각 친화 색, 효과 줄임/끄기)은 테마 위에 덮인다.
import { VISIBLE_ROWS, WIDTH as COLS, createBoard, get } from "../core/board.js";
import { t } from "../i18n/index.js";
import { CELL_ID } from "../core/pieces.js";
import { VISIBLE_TOP } from "../core/engine.js";
import { createEffects } from "./effects.js";
import { createSlide } from "./motion.js";
import { boxOrigin, drawMark, findTheme, paletteFor } from "./themes.js";
import { createBoardGrid } from "./board-grid.js";
import { accentEnabled, createGameplayAccents } from "./gameplay-accents.js";
import { drawDangerLine, drawFoldingBar, drawKickLine } from "./situation-effects.js";
import {
  accentInk,
  drawCombo,
  drawPerfectAccent,
  drawPieceAccent,
  drawSlotAccent,
  drawSpinAccent,
} from "./motion-accents.js";

const MARGIN_TOP = 2; // 보드 위 여유 줄
const ROWS = VISIBLE_ROWS + MARGIN_TOP;
const CSS_CELL = 28;
const DANGER_ROWS = 3;

/**
 * @typedef {{ theme: string, effects: "full" | "reduced" | "off", clearEffectLength?: number, palette: "theme" | "contrast" | "custom", pattern?: "on" | "off", ghost?: string, grid?: "on" | "off", colors?: Record<string, string>, gameplayEffects?: Partial<Record<import("./gameplay-accents.js").Accent, boolean>> }} Visual
 * @param {HTMLCanvasElement} canvas
 * @param {{ getVisual: () => Visual, compact?: boolean }} options
 */
export const createRenderer = (canvas, { getVisual, compact = false }) => {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const effects = createEffects();
  const accents = createGameplayAccents();
  const slide = createSlide();
  const emptyBoard = createBoard();
  const labels = compact ? null : document.createElement("canvas");
  const labelCtx = labels?.getContext("2d");

  // 좁은 화면(휴대폰 세로)이면 홀드·넥스트 칸을 줄인다. 휴대폰 가로는 넓은 배치(css/game.css와 같은 조건)
  const narrow = window.matchMedia(
    "(max-width: 720px) and (not ((orientation: landscape) and (max-height: 520px) and (pointer: coarse)))"
  );
  // 휴대폰 가로(낮은 화면): 배치는 넓은 쪽이지만 보드가 작아 이름표도 좁은 화면처럼 키운다(2차 평가 U41)
  const lowLandscape = window.matchMedia("(orientation: landscape) and (max-height: 520px) and (pointer: coarse)");
  let cell = 0;
  let side = 0;
  /** @type {ReturnType<typeof createBoardGrid>} */
  let drawGrid;
  /**
   * devicePixelRatio를 반영해 캔버스 해상도를 정하고 셀 크기를 정수로 맞춘다(번짐 방지).
   * 넓은 화면에서 캔버스가 기본 셀(28px)보다 크게 보이면 보이는 크기에 맞춰 그린다 — 늘려 보이면 흐려진다.
   */
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const nextSide = compact ? 0 : narrow.matches ? 2 : 5;
    const shown = compact ? 0 : canvas.clientWidth / (COLS + nextSide * 2);
    const next = Math.max(8, Math.round((compact ? 14 : Math.max(CSS_CELL, shown)) * dpr));
    if (next === cell && nextSide === side) return false;
    cell = next;
    side = nextSide;
    const cols = COLS + side * 2;
    canvas.width = cols * cell;
    canvas.height = ROWS * cell;
    canvas.style.aspectRatio = `${cols} / ${ROWS}`;
    if (labels) {
      labels.width = canvas.width;
      labels.height = 2 * cell;
      labelCtx.textBaseline = "top";
    }
    drawGrid = createBoardGrid(side * cell, MARGIN_TOP * cell, COLS, VISIBLE_ROWS, cell);
    return true;
  };

  /** 미리보기 상자(4×2칸) 가운데에 피스를 그린다. */
  const preview = (theme, palette, game, type, left, top, size, dim = false) => {
    const shape = game.shapeOf(type, 0);
    const { ox, oy } = boxOrigin(shape, left, top, size);
    ctx.globalAlpha = dim ? 0.35 : 1;
    for (const [x, y] of shape) {
      theme.block(ctx, ox + x * size, oy + y * size, size, palette[CELL_ID[type]]);
      if (pattern) drawMark(ctx, ox + x * size, oy + y * size, size, CELL_ID[type], palette[CELL_ID[type]]);
    }
    ctx.globalAlpha = 1;
  };

  /** 이번 그리기에서 블록 무늬를 그릴지(접근성 설정) */
  let pattern = false;

  const previousCells = new Uint8Array(emptyBoard.cells.length);
  const emptyQueue = [];
  let previous = [];
  let invalidated = true;
  let animating = false;

  /**
   * @param {ReturnType<typeof import("../core/engine.js").createGame> | null} game  null이면 빈 보드만
   */
  const draw = (game, now = performance.now()) => {
    const resized = fit();
    const visual = getVisual();
    const state = game?.state;
    const board = state?.board ?? emptyBoard;
    const active = state?.active;
    const hold = state?.hold;
    const holdUsed = state?.holdUsed;
    const queue = state?.queue ?? emptyQueue;
    const pending = Math.min(VISIBLE_ROWS, state?.garbage?.pending ?? 0);
    const hintCells =
      state?.downstack?.hintCells ??
      state?.buildLesson?.hintCells ??
      state?.puzzle?.hintCells ??
      state?.finesseTarget ??
      state?.timeShift?.preview?.cells;
    const lockTimer = active ? state.lock.timer : 0;
    // 퍼즐은 남은 피스만(움직이는 피스·홀드 칸 제외), 규칙의 미리보기 개수까지
    const shown = state?.puzzle
      ? Math.min(
          game?.rules.previewCount ?? 5,
          Math.max(0, state.puzzle.need - state.puzzle.placed - 1 - (state.hold ? 1 : 0))
        )
      : state?.timeShift
        ? Math.min(game.rules.previewCount, Math.max(0, state.timeShift.turns - state.stats.pieces - (active ? 1 : 0)))
        : game?.rules.previewCount;

    // 같은 엔진 프레임이라도 힌트나 화면 설정이 바뀔 수 있고, 반대로 프레임이 흘러도 보드는 그대로일 수 있다.
    const view = [
      game,
      visual,
      active?.type,
      active?.x,
      active?.y,
      active?.rot,
      state?.pieceId,
      state?.combo,
      lockTimer,
      hold,
      holdUsed,
      pending,
      hintCells,
      shown,
    ];
    if (!compact) for (const type of queue) view.push(type);
    if (
      !resized &&
      !invalidated &&
      !animating &&
      !effects.active &&
      view.length === previous.length &&
      view.every((value, index) => value === previous[index]) &&
      board.cells.every((value, index) => value === previousCells[index])
    )
      return;

    const redrawLabels = resized || invalidated || game !== previous[0];
    previous = view;
    previousCells.set(board.cells);
    invalidated = false;

    const theme = findTheme(visual.theme);
    const palette = paletteFor(visual, theme);
    const effectLevel = compact ? "off" : visual.effects;
    const motion = effectLevel === "full";
    const bx = side * cell;
    const by = MARGIN_TOP * cell;
    const toY = y => by + (y - VISIBLE_TOP) * cell;
    const dangerous =
      game &&
      motion &&
      accentEnabled(visual, "danger") &&
      board.cells.subarray(0, (VISIBLE_TOP + DANGER_ROWS) * board.width).some(Boolean);
    const feedback = game && motion ? accents.frame(now, visual, theme, dangerous) : null;
    const ink = accentInk(theme);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    effects.prune(now, effectLevel, visual.clearEffectLength);
    animating = effects.active || Boolean(feedback?.animating);
    pattern = visual.pattern === "on";
    drawGrid(ctx, theme, visual.grid !== "off");
    effects.drawDrops(ctx, { bx, by, cell, toY }, now, theme.board.ink);
    const drawBlock = (x, y, size, value) => {
      theme.block(ctx, x, y, size, palette[value]);
      if (pattern) drawMark(ctx, x, y, size, value, palette[value]);
    };
    // 이전 줄의 잔상 뒤에 현재 보드를 그려 이미 내려온 블록을 가리지 않는다.
    effects.drawClearedBlocks(
      ctx,
      { bx, cell, toY, cols: COLS },
      now,
      effectLevel,
      drawBlock,
      visual.clearEffectLength
    );

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
        drawBlock(bx + x * cell, toY(y), cell, value);
        if (impact) ctx.restore();
      }
    }

    // 다음 피스와 고스트는 줄 삭제 효과보다 위에 그린다.
    effects.draw(ctx, { bx, cell, toY, cols: COLS }, now, theme.board.ink, effectLevel, visual.clearEffectLength);
    if (feedback) {
      ctx.save();
      ctx.scale(cell, cell);
      if (feedback.danger) {
        const { entered, released } = feedback.danger;
        drawDangerLine(ctx, feedback.material, theme.palette[CELL_ID.L], side, MARGIN_TOP, COLS, entered, released);
      }
      if (feedback.spin) {
        drawSpinAccent(ctx, feedback.material, {
          ...feedback.spin,
          y: toY(feedback.spin.y) / cell,
          themeId: visual.theme,
          theme,
          left: side,
          right: side + COLS,
          rows: ROWS,
          reduced: false,
        });
      }
      ctx.translate(0, MARGIN_TOP);
      drawPerfectAccent(ctx, feedback.material, ink, side, side + COLS, VISIBLE_ROWS, feedback.perfectAge, false);
      ctx.restore();
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
      const shown = slide.at(
        game.state.pieceId,
        active.x,
        active.y,
        now,
        motion ? theme.motion.slideMs : 0,
        active.rot
      );
      const ox = (shown.x - active.x) * cell;
      animating ||= ox !== 0;
      // 고정까지 남은 시간만큼 살짝 어두워진다.
      const delay = game.rules.lock.delay;
      ctx.globalAlpha = lockTimer > 0 && delay > 0 ? 1 - 0.18 * Math.min(1, lockTimer / delay) : 1;
      for (const [x, y] of cells) {
        if (y >= VISIBLE_TOP - MARGIN_TOP) {
          const px = bx + x * cell + ox;
          const py = toY(y);
          theme.block(ctx, px, py, cell, color);
          if (pattern) drawMark(ctx, px, py, cell, CELL_ID[active.type], color);
          if (!cells.some(([cx, cy]) => cx === x && cy === y - 1)) {
            ctx.save();
            ctx.fillStyle = theme.board.ink;
            ctx.globalAlpha *= 0.72;
            ctx.fillRect(px + cell * 0.2, py + cell * 0.15, cell * 0.6, Math.max(1, cell * 0.055));
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 1;
      if (feedback?.nextAlpha && feedback.nextPiece === active.type) {
        ctx.save();
        ctx.scale(cell, cell);
        drawPieceAccent(
          ctx,
          feedback.material,
          ink,
          feedback.nextAlpha * 0.88,
          cells.filter(([, y]) => y >= VISIBLE_TOP - MARGIN_TOP).map(([x, y]) => [side + x + ox / cell, toY(y) / cell])
        );
        ctx.restore();
      }
    }

    if (hintCells?.length && active) {
      ctx.save();
      ctx.strokeStyle = theme.board.ink;
      ctx.lineWidth = Math.max(2, cell / 12);
      ctx.setLineDash([cell / 5, cell / 8]);
      if (state.timeShift) ctx.globalAlpha = 0.75;
      for (const [x, y] of hintCells) {
        ctx.strokeRect(bx + x * cell + 3, toY(y) + 3, cell - 6, cell - 6);
      }
      ctx.restore();
    }

    if (feedback?.kick) {
      const { x, y, dx, dy, age } = feedback.kick;
      if (toY(y) >= 0) {
        ctx.save();
        ctx.scale(cell, cell);
        drawKickLine(ctx, feedback.material, ink, { x: side + x, y: toY(y) / cell, dx, dy }, age, false);
        ctx.restore();
      }
    }

    // 대기 중인 쓰레기는 한 줄씩 구분한다. CPU의 좁은 캔버스에서는 안쪽에 그린다.
    if (pending > 0 || feedback?.canceled) {
      const w = Math.max(2, Math.round(cell * 0.18));
      ctx.fillStyle = "#e5484d";
      const x = compact ? bx + 1 : bx - w - 1;
      for (let row = VISIBLE_ROWS - pending; row < VISIBLE_ROWS; row++) {
        ctx.fillRect(x, by + row * cell + 1, w, cell - 2);
      }
      if (feedback?.canceled) {
        const { age, blocked, pending: remaining } = feedback.canceled;
        const top = Math.min(VISIBLE_ROWS, remaining + blocked);
        ctx.save();
        ctx.fillStyle = theme.palette[CELL_ID.Z];
        for (let row = top - 1; row >= Math.max(pending, remaining); row--) {
          drawFoldingBar(ctx, x, by + (VISIBLE_ROWS - row) * cell - 1, w, cell - 2, age, top - 1 - row);
        }
        ctx.restore();
      }
    }

    if (!game || compact) return;

    // 홀드
    // 미리보기 피스(가로 4칸)가 옆 칸 폭 안에 들어가게: 좁은 화면 2칸 → 0.42(양옆 여백 조금), 넓은 화면 5칸 → 0.8
    const small = Math.round(cell * (narrow.matches ? 0.42 : 0.8));
    const sidePad = Math.round((side * cell - 4 * small) / 2);
    const nx = bx + COLS * cell + sidePad;
    if (redrawLabels) {
      // 글자 모양과 색이 바뀔 때만 새로 그려 두고, 피스가 움직일 때는 그대로 사용한다.
      labelCtx.clearRect(0, 0, labels.width, labels.height);
      labelCtx.fillStyle = getComputedStyle(canvas).color || "#b1b9b0";
      // 일부 글꼴은 top 기준선 위에도 글자가 조금 나오므로 윗줄을 남겨 둔다.
      // 좁은 화면은 캔버스가 많이 줄어 보이므로 글자를 키우고 이름을 줄인다("다음 피스" → "다음").
      // 그래도 옆 칸 폭을 넘으면 넘지 않을 만큼 줄인다.
      const big = narrow.matches || lowLandscape.matches;
      const base = Math.round(cell * (big ? 0.66 : 0.46));
      const room = side * cell - sidePad;
      const label = (text, x) => {
        labelCtx.font = `600 ${base}px system-ui, sans-serif`;
        const width = labelCtx.measureText(text).width;
        if (width > room) labelCtx.font = `600 ${Math.floor((base * room) / width)}px system-ui, sans-serif`;
        labelCtx.fillText(text, x, cell);
      };
      if (game.rules.hold.enabled) label(t("홀드"), sidePad);
      if (game.rules.previewCount > 0) label(big ? t("다음") : t("다음 피스"), nx);
    }
    ctx.drawImage(labels, 0, by - cell);
    const slotInset = 0.2;
    const slotWidth = side - slotInset * 2;
    const slotTop = MARGIN_TOP + 0.92;
    const slotHeight = (small / cell) * 2 + 0.2;
    const drawSlot = (left, type, alpha) => {
      ctx.save();
      ctx.scale(cell, cell);
      ctx.fillStyle = theme.board.bg;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillRect(left, slotTop, slotWidth, slotHeight);
      ctx.globalAlpha = 1;
      drawSlotAccent(ctx, feedback.material, palette[CELL_ID[type]], alpha, left, slotTop, slotWidth, slotHeight);
      ctx.restore();
    };
    if (game.rules.hold.enabled) {
      if (hold) {
        if (feedback?.holdAlpha) drawSlot(slotInset, hold, feedback.holdAlpha);
        preview(theme, palette, game, hold, sidePad, by + cell + (feedback?.holdOffset ?? 0) * cell, small, holdUsed);
      }
    }

    // 넥스트
    if (game.rules.previewCount > 0) {
      if (shown > 0 && feedback?.nextAlpha) drawSlot(side + COLS + slotInset, feedback.nextPiece, feedback.nextAlpha);
      // 퍼즐은 주어진 피스만(돌아오는 피스는 보이지 않게): 지금 피스를 뺀 남은 수까지
      queue.slice(0, Math.min(game.rules.previewCount, shown)).forEach((type, i) => {
        preview(theme, palette, game, type, nx, by + cell + i * small * 3, small);
      });
    }
    if (feedback?.combo && state.combo >= 0) {
      ctx.save();
      ctx.scale(cell, cell);
      drawCombo(
        ctx,
        feedback.material,
        theme,
        ink,
        slotInset,
        MARGIN_TOP + 3.6,
        slotWidth,
        state.combo + 1,
        feedback.comboAlpha
      );
      ctx.restore();
    }
  };

  return {
    draw,
    invalidate() {
      invalidated = true;
    },
    /** 엔진 이벤트로 효과를 만든다 */
    addEvents: (events, now = performance.now()) => {
      if (compact || !events.length) return;
      const visual = getVisual();
      effects.add(events, visual.effects, now, findTheme(visual.theme).motion);
      if (visual.effects === "full") accents.add(events, now);
      else accents.clear();
    },
    clearEffects() {
      effects.clear();
      accents.clear();
      slide.reset();
      invalidated = true;
    },
  };
};
