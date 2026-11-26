// 테마 미리보기
//  - 무대(createThemeStage): 작은 게임 화면 하나(보드 아래 9줄 + 홀드 + 다음 피스 3개)를 실제 테마 그리기 함수와
//    지금 화면 설정(색 구성·블록 무늬·고스트 진하기·격자·효과)으로 그린다. 피스 하나가 내려앉아 반동하고,
//    다음 T가 하드 드롭으로 두 줄을 지우는 장면이 천천히 되풀이된다 → 일곱 피스 색, 쓰레기 줄, 고스트, 효과를 한눈에.
//  - 견본(drawThemeSwatch): 선택 칩 안의 작은 띠. 테마 보드색 위에 일곱 피스를 한 칸씩.
import { clearEffectDuration, createEffects } from "./effects.js";
import { clearSections, drawClearCells } from "./clear-sweep.js";
import { boxOrigin, drawMark } from "./themes.js";
import { createBoardGrid } from "./board-grid.js";
import { COLS, ROWS, HOLD, getPreviewFrame, getPreviewDrop, getClearSample } from "./preview-scene.js";
import { CELL_ID } from "../core/pieces.js";
import srs from "../rules/rotation/srs.js";
import { t } from "../i18n/index.js";

/** 옆 칸(홀드·다음) 폭, 칸 단위 */
const SIDE = 4.4;
/** 미리보기 상자 안 피스 크기(보드 칸 대비) */
const SMALL = 0.62;

/**
 * @typedef {{
 *   piece: {type: import("../core/pieces.js").PieceType, cells: number[][], ghost: number[][], down: number,
 *     turn?: {x: number, y: number, angle: number}} | null,
 *   queue: readonly string[],
 *   board: number[][],
 *   clear: {rows: number[], landed: number[][]} | null,
 *   clearAge: number,
 *   pivot: number | null
 * }} PreviewBoardFrame
 * @typedef {{
 *   hold: import("../core/pieces.js").PieceType,
 *   holdOffset: number,
 *   overlay(ctx: CanvasRenderingContext2D, boardLeft: number, boardRight: number, slotWidth: number): void
 * }} SampleDetails
 * @typedef {{ at: number, events: Parameters<ReturnType<typeof createEffects>["add"]>[0] }} SampleCue
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ play(): void, stop(): void, playClear(lines: number, spin?: boolean): void,
 * playSample(duration: number, getScene: (elapsed: number) => PreviewBoardFrame,
 *   cues: readonly SampleCue[], details?: (elapsed: number, scene: PreviewBoardFrame) => SampleDetails): void,
 * show(theme: any, palette: readonly string[], visual: import("./canvas.js").Visual): void }}
 */
export const createThemeStage = canvas => {
  const dpr = globalThis.devicePixelRatio || 1;
  const cell = Math.round(16 * dpr);
  const width = Math.round((COLS + SIDE * 2) * cell);
  canvas.width = width;
  canvas.height = ROWS * cell;
  canvas.style.aspectRatio = `${width} / ${canvas.height}`;
  const ctx = canvas.getContext("2d");
  const effects = createEffects();
  const bx = Math.round(SIDE * cell);
  const drawGrid = createBoardGrid(bx, 0, COLS, ROWS, cell);
  const geometry = { bx, by: 0, cell, cols: COLS, toY: y => y * cell };
  /** @type {any} */
  let theme = null;
  /** @type {readonly string[]} */
  let palette = [];
  /** @type {import("./canvas.js").Visual} */
  let visual = /** @type {any} */ ({ effects: "full", grid: "on", ghost: "normal", pattern: "off" });
  let frame = 0;
  let start = 0;
  let lastLoop = -1;
  let emitted = 0;

  const block = (x, y, size, value) => {
    theme.block(ctx, x, y, size, palette[value]);
    if (visual.pattern === "on") drawMark(ctx, x, y, size, value, palette[value]);
  };

  /** 미리보기 상자(4×2칸) 가운데에 피스 */
  const boxPiece = (type, left, top) => {
    const size = Math.round(cell * SMALL);
    const shape = srs.cells(type, 0);
    const { ox, oy } = boxOrigin(shape, left, top, size);
    for (const [x, y] of shape) block(ox + x * size, oy + y * size, size, CELL_ID[type]);
  };

  /** @param {PreviewBoardFrame} scene @param {number} [elapsed] @param {SampleDetails} [details] */
  const draw = (scene, elapsed = 0, details) => {
    if (!ctx || !theme) return;
    effects.prune(elapsed, visual.effects, visual.clearEffectLength);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { ink } = theme.board;
    drawGrid(ctx, theme, visual.grid !== "off");
    effects.drawDrops(ctx, geometry, elapsed, ink);

    const sweep = visual.effects === "full" ? theme.motion.clearSweep : null;
    const { clear, clearAge, pivot, piece, queue } = scene;
    const duration = clearEffectDuration(theme.motion, visual.clearEffectLength);
    const clearTime = duration > 0 ? clearAge / duration : 1;
    const isErasing = sweep && clear?.rows.length && clearTime < sweep.travel;
    const sections = isErasing ? clearSections(sweep, clearTime, pivot, COLS) : [];
    const board = isErasing ? clear.landed : scene.board;
    const drawRow = (row, y) => {
      for (let x = 0; x < COLS; x++) {
        const value = row[x];
        if (!value) continue;
        const impact = effects.landing(x, y, value, elapsed);
        if (impact) {
          const floor = impact.floor * cell;
          ctx.save();
          ctx.translate(0, floor);
          ctx.scale(1, impact.scale);
          ctx.translate(0, -floor);
        }
        block(bx + x * cell, y * cell, cell, value);
        if (impact) ctx.restore();
      }
    };
    board.forEach((row, y) => {
      if (isErasing && clear.rows.includes(y)) drawClearCells(ctx, geometry, y, sections, row, block);
      else drawRow(row, y);
    });
    // 줄 삭제 효과는 블록 위, 떨어질 피스·고스트는 그 위
    effects.draw(ctx, geometry, elapsed, ink, visual.effects, visual.clearEffectLength);
    if (piece) {
      const value = CELL_ID[piece.type];
      for (const [x, y] of piece.ghost) theme.ghost(ctx, bx + x * cell, y * cell, cell, palette[value], visual.ghost);
      const { turn } = piece;
      if (turn) {
        const pivotX = bx + turn.x * cell;
        const pivotY = turn.y * cell;
        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(turn.angle);
        ctx.translate(-pivotX, -pivotY);
      }
      for (const [x, y] of piece.cells) block(bx + x * cell, (y + piece.down) * cell, cell, value);
      if (turn) ctx.restore();
    }

    // 홀드·다음: 글자는 바깥 글자색(게임 화면과 같다)
    const label = getComputedStyle(canvas).color || ink;
    ctx.fillStyle = label;
    ctx.font = `600 ${Math.round(cell * 0.62)}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const pad = Math.round((SIDE * cell - 4 * cell * SMALL) / 2);
    const nx = bx + COLS * cell + pad;
    ctx.fillText(t("홀드"), pad, Math.round(cell * 0.2));
    ctx.fillText(t("다음"), nx, Math.round(cell * 0.2));
    if (details) {
      // 밝은 테마의 잉크도 어두운 둘레에서 읽을 수 있게 슬롯 바탕을 해당 테마 색으로 깐다.
      ctx.fillStyle = theme.board.bg;
      ctx.fillRect(cell * 0.4, cell * 0.93, bx - cell * 0.8, cell * 1.9);
      ctx.fillRect(bx + cell * (COLS + 0.4), cell * 0.93, width - bx - cell * (COLS + 0.8), cell * 1.9);
    }
    boxPiece(details?.hold ?? HOLD, pad, cell * (1.3 + (details?.holdOffset ?? 0)));
    queue.forEach((type, i) => boxPiece(type, nx, cell * 1.3 + i * cell * SMALL * 3));
    if (details) {
      ctx.save();
      ctx.scale(cell, cell);
      details.overlay(ctx, bx / cell, bx / cell + COLS, (width - bx) / cell - COLS);
      ctx.restore();
    }
  };

  const animate = now => {
    if (theme) {
      const elapsed = now - start;
      const scene = getPreviewFrame(elapsed);
      if (scene.loop !== lastLoop) {
        lastLoop = scene.loop;
        emitted = 0;
      }
      for (; emitted < scene.stepIndex; emitted++) {
        const { time, events } = getPreviewDrop(scene.loop, emitted);
        effects.add(events, visual.effects, time, theme.motion);
      }
      draw(scene, elapsed);
    }
    frame = requestAnimationFrame(animate);
  };

  const stop = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    effects.clear();
    draw(getPreviewFrame(0));
  };

  /** @type {ReturnType<typeof createThemeStage>["playSample"]} */
  const playSample = (duration, getScene, cues, details) => {
    if (!ctx || !theme) return;
    stop();
    start = performance.now();
    let nextCue = 0;
    const paint = elapsed => {
      while (nextCue < cues.length && cues[nextCue].at <= elapsed) {
        const { events, at } = cues[nextCue++];
        effects.add(events, visual.effects, at, theme.motion);
      }
      const scene = getScene(elapsed);
      draw(scene, elapsed, details?.(elapsed, scene));
    };
    const animateSample = now => {
      const elapsed = now - start;
      if (elapsed >= duration) stop();
      else {
        paint(elapsed);
        frame = requestAnimationFrame(animateSample);
      }
    };
    paint(0);
    frame = requestAnimationFrame(animateSample);
  };

  return {
    /** 그릴 테마와 설정을 바꾼다(움직이는 중이면 다음 프레임부터, 멈춰 있으면 바로 다시 그린다) */
    show(nextTheme, nextPalette, nextVisual) {
      theme = nextTheme;
      palette = nextPalette;
      visual = nextVisual;
      if (!frame) draw(getPreviewFrame(0));
    },
    play() {
      if (frame || !ctx) return;
      start = performance.now();
      lastLoop = -1;
      effects.clear();
      frame = requestAnimationFrame(animate);
    },
    playClear(lines, spin = false) {
      const sample = getClearSample(lines, spin);
      if (!sample || !theme) return;
      const until = Math.max(200, clearEffectDuration(theme.motion, visual.clearEffectLength)) + 170;
      playSample(until, elapsed => getPreviewFrame(elapsed, sample), [{ at: 0, events: [sample.event] }]);
    },
    playSample,
    stop,
  };
};

/**
 * 선택 칩의 견본: 테마 보드색 위에 일곱 피스 색을 한 칸씩(테마의 블록 마감 그대로).
 * @param {HTMLCanvasElement} canvas
 * @param {any} theme
 * @param {readonly string[]} palette
 */
export const drawThemeSwatch = (canvas, theme, palette) => {
  const dpr = globalThis.devicePixelRatio || 1;
  const cell = Math.round(11 * dpr);
  const pad = Math.round(cell * 0.35);
  canvas.width = 7 * cell + pad * 2;
  canvas.height = cell + pad * 2;
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = theme.board.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = theme.board.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  for (let i = 1; i <= 7; i++) theme.block(ctx, pad + (i - 1) * cell, pad, cell, palette[i]);
};
