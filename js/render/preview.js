// 테마 미리보기: 작은 캔버스에 실제 테마 그리기 함수로 보드 한 조각(격자·쌓인 블록·고스트)을 그린다.
// 설정 화면의 테마 카드에서 같은 장면으로 각 테마의 낙하와 줄 삭제 효과를 보여 준다.
import { createEffects } from "./effects.js";

/** 8열 × 4줄: 숫자는 팔레트 번호(0 = 빈칸) */
const SCENE = ["........", "......6.", "4.....66", "4455.336"];
/** 고스트(떨어질 자리): T 피스 */
const GHOST = [
  [3, 2],
  [4, 2],
  [5, 2],
  [4, 3],
];
const ACTIVE = GHOST.map(([x, y]) => [x, y - 2]);
const COLS = SCENE[0].length;
const ROWS = SCENE.length;
const AFTER_CLEAR = ["........", "........", "......6.", "4..66666"];
const DROP_START = 180;
const CLEAR_AT = 360;
const LOOP_MS = 1500;
const DROP_EVENTS = [
  { type: "hardDrop", distance: 2, cells: GHOST },
  { type: "lock", lines: 1, rows: [ROWS - 1] },
];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} theme  themes.js의 테마
 * @param {readonly string[]} palette
 */
export const createThemePreview = (canvas, theme, palette) => {
  const dpr = globalThis.devicePixelRatio || 1;
  const cell = Math.round(12 * dpr);
  canvas.width = COLS * cell;
  canvas.height = ROWS * cell;
  canvas.style.aspectRatio = `${COLS} / ${ROWS}`;
  const ctx = canvas.getContext("2d");
  const effects = createEffects();
  const geometry = { bx: 0, by: 0, cell, cols: COLS, toY: y => y * cell };
  let frame = 0;
  let start = 0;
  let lastClear = -1;

  const draw = (elapsed = 0) => {
    if (!ctx) return;
    const phase = elapsed % LOOP_MS;
    const cleared = phase >= CLEAR_AT;
    const loop = Math.floor(elapsed / LOOP_MS);
    if (cleared && lastClear !== loop) {
      effects.add(DROP_EVENTS, "full", loop * LOOP_MS + CLEAR_AT, theme.motion);
      lastClear = loop;
    }
    effects.prune(elapsed, "full");
    const { bg, grid, ink } = theme.board;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, canvas.height);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(canvas.width, y * cell + 0.5);
    }
    ctx.stroke();
    effects.drawDrops(ctx, geometry, elapsed, ink);
    (cleared ? AFTER_CLEAR : SCENE).forEach((row, y) => {
      for (const [x, ch] of [...row].entries()) {
        if (ch !== ".") theme.block(ctx, x * cell, y * cell, cell, palette[Number(ch)]);
      }
    });
    if (!cleared) {
      const drop = Math.max(0, (phase - DROP_START) / (CLEAR_AT - DROP_START));
      for (const [x, y] of GHOST) theme.ghost(ctx, x * cell, y * cell, cell, palette[6]);
      for (const [x, y] of ACTIVE) theme.block(ctx, x * cell, (y + 2 * drop ** 2) * cell, cell, palette[6]);
    }
    effects.draw(ctx, geometry, elapsed, ink, "full");
  };

  draw();
  const animate = now => {
    draw(now - start);
    frame = requestAnimationFrame(animate);
  };
  return {
    play() {
      if (frame || !ctx) return;
      start = performance.now();
      frame = requestAnimationFrame(animate);
    },
    stop() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      lastClear = -1;
      effects.clear();
      draw();
    },
  };
};
