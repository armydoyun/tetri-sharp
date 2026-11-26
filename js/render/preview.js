// 테마 미리보기
//  - 무대(createThemeStage): 작은 게임 화면 하나(보드 아래 9줄 + 홀드 + 다음 피스 3개)를 실제 테마 그리기 함수와
//    지금 화면 설정(색 구성·블록 무늬·고스트 진하기·격자·효과)으로 그린다. 피스 하나가 내려앉아 반동하고,
//    다음 T가 하드 드롭으로 두 줄을 지우는 장면이 천천히 되풀이된다 → 일곱 피스 색, 쓰레기 줄, 고스트, 효과를 한눈에.
//  - 견본(drawThemeSwatch): 선택 칩 안의 작은 띠. 테마 보드색 위에 일곱 피스를 한 칸씩.
import { createEffects } from "./effects.js";
import { clearSections } from "./clear-sweep.js";
import { boxOrigin, drawMark, gridDots, gridHashes } from "./themes.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { t } from "../i18n/index.js";

const COLS = 10;
const ROWS = 9;
/** 옆 칸(홀드·다음) 폭, 칸 단위 */
const SIDE = 4.4;
/** 미리보기 상자 안 피스 크기(보드 칸 대비) */
const SMALL = 0.62;
/** 피스 이름 → 팔레트 번호(엔진의 CELL_ID와 같다). 8 = 쓰레기 */
const ID = Object.freeze({ I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 });

/** 시작 판(위에서부터). 숫자는 팔레트 번호. 아래 두 줄은 T 하나로 지워진다 */
const START = [
  "..........",
  "..........",
  "..........",
  "..........",
  "1.........",
  "1.......2.",
  "13.4...772",
  "1334...566",
  "88888.8888",
];
/** 장면: 피스마다 [종류, 회전, 놓일 x, 놓일 y(셀 상자 기준), 위에서 기다리는 y] */
const STEPS = /** @type {const} */ ([
  ["Z", 0, 1, 4, 0],
  ["T", 2, 4, 6, 0],
]);
const HOLD = "O";
const QUEUE = ["T", "S", "I", "J", "L"];
/** 장면 시간(ms): 피스가 위에서 기다리는 시간, 다음 피스로 넘어가는 시간, 한 바퀴 */
const WAIT_MS = 650;
const STEP_MS = 900;
const LOOP_MS = WAIT_MS + STEP_MS * STEPS.length + 900;
/** 기다리는 동안 한 줄씩 내려오는 간격(중력처럼). 하드 드롭할 거리를 두 줄은 남긴다 */
const ROW_MS = 200;

const cellsOf = (type, rot) => ROTATIONS.srs.cells(type, rot);

/** 장면을 미리 계산해 둔다: 단계마다 그 전의 판, 떨어지는 피스, 그 뒤 지워진 줄 */
const buildScene = () => {
  let board = START.map(row => [...row].map(ch => (ch === "." ? 0 : Number(ch))));
  return STEPS.map(([type, rot, x, y, fromY]) => {
    const before = board.map(row => [...row]);
    const cells = cellsOf(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
    const landed = before.map(row => [...row]);
    for (const [cx, cy] of cells) landed[cy][cx] = ID[type];
    const rows = landed.flatMap((row, i) => (row.every(Boolean) ? [i] : []));
    const kept = landed.filter((_, i) => !rows.includes(i));
    board = [...rows.map(() => Array(COLS).fill(0)), ...kept];
    return {
      type,
      before,
      landed,
      cells,
      fromCells: cells.map(([cx, cy]) => [cx, cy - (y - fromY)]),
      rows,
      after: board,
    };
  });
};
const SCENE = buildScene();

// 세로 I가 우물을 채운 판과 지운 직후의 판. 바닥의 블록은 자리를 유지한다.
const CLEAR_SAMPLES = [1, 2, 3, 4].map(lines => {
  const rows = Array.from({ length: lines }, (_, i) => ROWS - 2 - i);
  const after = Array.from({ length: ROWS }, (_, row) =>
    row === ROWS - 1 ? [1, 1, 3, 3, 0, 0, 7, 7, 2, 2] : Array(COLS).fill(0)
  );
  const landed = after.map((row, y) => (rows.includes(y) ? [2, 2, 3, 3, 1, 4, 4, 5, 6, 7] : row));
  return { rows, after, landed };
});

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ play(): void, stop(): void, playClear(lines: number, spin?: boolean): void,
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
  /** @type {{ rows: number[], after: number[][], landed: number[][], pivot: number | null } | null} */
  let sample = null;

  const block = (x, y, size, value) => {
    theme.block(ctx, x, y, size, palette[value]);
    if (visual.pattern === "on") drawMark(ctx, x, y, size, value, palette[value]);
  };

  /** 미리보기 상자(4×2칸) 가운데에 피스 */
  const boxPiece = (type, left, top) => {
    const size = Math.round(cell * SMALL);
    const shape = cellsOf(type, 0);
    const { ox, oy } = boxOrigin(shape, left, top, size);
    for (const [x, y] of shape) block(ox + x * size, oy + y * size, size, ID[type]);
  };

  const draw = (elapsed = 0) => {
    if (!ctx || !theme) return;
    const phase = elapsed % LOOP_MS;
    const loop = Math.floor(elapsed / LOOP_MS);
    // 떨어진 피스 수(k). k번째 피스가 위에서 기다리고, 다 떨어지면(k = 단계 수) 한 바퀴가 끝날 때까지 그대로
    const dropAt = i => WAIT_MS + i * STEP_MS;
    // i번째 피스가 t(ms) 동안 기다리며 내려온 줄 수
    const fallen = (i, t) => {
      const full = SCENE[i].cells[0][1] - SCENE[i].fromCells[0][1];
      return Math.max(0, Math.min(full - 2, Math.floor(t / ROW_MS)));
    };
    const waitFrom = i => (i === 0 ? 0 : dropAt(i - 1));
    const k = sample ? SCENE.length : SCENE.filter((_, i) => phase >= dropAt(i)).length;
    if (loop !== lastLoop) {
      lastLoop = loop;
      emitted = 0;
    }
    for (; !sample && emitted < k; emitted++) {
      const done = SCENE[emitted];
      effects.add(
        [
          {
            type: "hardDrop",
            distance: done.cells[0][1] - done.fromCells[0][1] - fallen(emitted, dropAt(emitted) - waitFrom(emitted)),
            cells: done.cells,
          },
          { type: "lock", piece: done.type, cells: done.cells, lines: done.rows.length, rows: done.rows },
        ],
        visual.effects,
        loop * LOOP_MS + dropAt(emitted),
        theme.motion
      );
    }
    const step = k < SCENE.length ? SCENE[k] : null;
    effects.prune(elapsed, visual.effects);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 보드
    const { bg, grid, edge, ink } = theme.board;
    ctx.fillStyle = bg;
    ctx.fillRect(bx, 0, COLS * cell, ROWS * cell);
    ctx.lineWidth = 1;
    if (visual.grid !== "off" && theme.gridStyle === "dots") {
      ctx.fillStyle = grid;
      ctx.fill(gridDots(bx, 0, COLS, ROWS, cell));
    } else if (visual.grid !== "off" && theme.gridStyle === "hash") {
      ctx.strokeStyle = grid;
      ctx.stroke(gridHashes(bx, 0, COLS, ROWS, cell));
    } else if (visual.grid !== "off" && theme.gridStyle !== "none") {
      ctx.strokeStyle = grid;
      ctx.beginPath();
      for (let x = 1; x < COLS; x++) {
        ctx.moveTo(bx + x * cell + 0.5, 0);
        ctx.lineTo(bx + x * cell + 0.5, ROWS * cell);
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.moveTo(bx, y * cell + 0.5);
        ctx.lineTo(bx + COLS * cell, y * cell + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = edge;
    ctx.strokeRect(bx + 0.5, 0.5, COLS * cell - 1, ROWS * cell - 1);
    effects.drawDrops(ctx, geometry, elapsed, ink);

    const sweep = visual.effects === "full" ? theme.motion.clearSweep : null;
    const clear = sample ?? SCENE[k - 1];
    const clearTime = (sample ? elapsed : phase - dropAt(k - 1)) / theme.motion.clearMs;
    const isErasing = sweep && clear?.rows.length && clearTime < sweep.travel;
    const sections = isErasing ? clearSections(sweep, clearTime, sample?.pivot ?? null, COLS) : [];
    // 쌓인 블록: 기다리는 피스가 있으면 그 전의 판, 다 떨어졌으면 마지막 판
    const board = isErasing ? clear.landed : (sample?.after ?? (step ? step.before : SCENE[SCENE.length - 1].after));
    const drawRow = (row, y, left = 0, right = COLS) => {
      for (let x = left; x < right; x++) {
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
      if (!isErasing || !clear.rows.includes(y)) {
        drawRow(row, y);
        return;
      }
      const rowWidth = COLS * cell;
      for (const { visible, alpha, left, right } of sections) {
        if (!visible.length) continue;
        const region = new Path2D();
        for (const rect of visible)
          region.rect(
            bx + rect.left * rowWidth,
            (y + rect.top) * cell,
            (rect.right - rect.left) * rowWidth,
            (rect.bottom - rect.top) * cell
          );
        ctx.save();
        ctx.clip(region);
        ctx.globalAlpha = alpha;
        drawRow(row, y, Math.round(left * COLS), Math.round(right * COLS));
        ctx.restore();
      }
    });
    // 줄 삭제 효과는 블록 위, 떨어질 피스·고스트는 그 위
    effects.draw(ctx, geometry, elapsed, ink, visual.effects);
    if (step) {
      const color = palette[ID[step.type]];
      for (const [x, y] of step.cells) theme.ghost(ctx, bx + x * cell, y * cell, cell, color, visual.ghost);
      const down = fallen(k, phase - waitFrom(k));
      for (const [x, y] of step.fromCells) block(bx + x * cell, (y + down) * cell, cell, ID[step.type]);
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
    boxPiece(HOLD, pad, cell * 1.3);
    QUEUE.slice(k, k + 3).forEach((type, i) => boxPiece(type, nx, cell * 1.3 + i * cell * SMALL * 3));
  };

  const animate = now => {
    draw(now - start);
    frame = requestAnimationFrame(animate);
  };

  const stop = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    sample = null;
    effects.clear();
    draw();
  };

  return {
    /** 그릴 테마와 설정을 바꾼다(움직이는 중이면 다음 프레임부터, 멈춰 있으면 바로 다시 그린다) */
    show(nextTheme, nextPalette, nextVisual) {
      theme = nextTheme;
      palette = nextPalette;
      visual = nextVisual;
      if (!frame) draw();
    },
    play() {
      if (frame || !ctx) return;
      start = performance.now();
      lastLoop = -1;
      effects.clear();
      frame = requestAnimationFrame(animate);
    },
    playClear(lines, spin = false) {
      if (!ctx || !theme || !CLEAR_SAMPLES[lines - 1]) return;
      stop();
      const cells = spin ? SCENE[1].cells : [];
      const pivot = spin ? cells.reduce((sum, [x]) => sum + x + 0.5, 0) / cells.length / COLS : null;
      const { rows, after, landed } = spin ? SCENE[1] : CLEAR_SAMPLES[lines - 1];
      sample = { rows, after, landed, pivot };
      effects.add(
        [
          {
            type: "lock",
            lines: rows.length,
            rows,
            tspin: spin ? "full" : "none",
            cells,
          },
        ],
        visual.effects,
        0,
        theme.motion
      );
      start = performance.now();
      draw();
      const until = Math.max(200, theme.motion.clearMs) + 170;
      const animateClear = now => {
        if (now - start >= until) stop();
        else {
          draw(now - start);
          frame = requestAnimationFrame(animateClear);
        }
      };
      frame = requestAnimationFrame(animateClear);
    },
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
