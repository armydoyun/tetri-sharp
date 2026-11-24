// 테마 미리보기
//  - 무대(createThemeStage): 작은 게임 화면 하나(보드 아래 9줄 + 홀드 + 다음 피스 3개)를 실제 테마 그리기 함수와
//    지금 화면 설정(색 구성·블록 무늬·고스트 진하기·격자·효과)으로 그린다. 피스 하나가 내려앉아 반동하고,
//    다음 T가 하드 드롭으로 두 줄을 지우는 장면이 천천히 되풀이된다 → 일곱 피스 색, 쓰레기 줄, 고스트, 효과를 한눈에.
//  - 견본(drawThemeSwatch): 선택 칩 안의 작은 띠. 테마 보드색 위에 일곱 피스를 한 칸씩.
import { createEffects } from "./effects.js";
import { drawMark } from "./themes.js";
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
    const after = before.map(row => [...row]);
    for (const [cx, cy] of cells) after[cy][cx] = ID[type];
    const rows = after.flatMap((row, i) => (row.every(Boolean) ? [i] : []));
    const kept = after.filter((_, i) => !rows.includes(i));
    board = [...rows.map(() => Array(COLS).fill(0)), ...kept];
    return { type, before, cells, fromCells: cells.map(([cx, cy]) => [cx, cy - (y - fromY)]), rows, after: board };
  });
};
const SCENE = buildScene();

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ play(): void, stop(): void, show(theme: any, palette: readonly string[], visual: import("./canvas.js").Visual): void }}
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

  const block = (x, y, size, value) => {
    theme.block(ctx, x, y, size, palette[value]);
    if (visual.pattern === "on") drawMark(ctx, x, y, size, value, palette[value]);
  };

  /** 미리보기 상자(4×2칸) 가운데에 피스 */
  const boxPiece = (type, left, top) => {
    const size = Math.round(cell * SMALL);
    const shape = cellsOf(type, 0);
    const xs = shape.map(c => c[0]);
    const ys = shape.map(c => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = left + ((4 - w) * size) / 2 - Math.min(...xs) * size;
    const oy = top + ((2 - h) * size) / 2 - Math.min(...ys) * size;
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
    const k = SCENE.filter((_, i) => phase >= dropAt(i)).length;
    if (loop !== lastLoop) {
      lastLoop = loop;
      emitted = 0;
    }
    for (; emitted < k; emitted++) {
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
    if (visual.grid !== "off") {
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

    // 쌓인 블록: 기다리는 피스가 있으면 그 전의 판, 다 떨어졌으면 마지막 판
    const board = step ? step.before : SCENE[SCENE.length - 1].after;
    board.forEach((row, y) =>
      row.forEach((value, x) => {
        if (!value) return;
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
      })
    );
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
    stop() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      effects.clear();
      draw();
    },
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
