import { t } from "../i18n/index.js";
// 저장된 테마 키는 유지한다. 테마는 보드와 블록의 색·모양을 정의한다.
export const THEME_IDS = Object.freeze([
  "modern",
  "retro",
  "minimal",
  "graphite",
  "frame",
  "stone",
  "midnight",
  "forest",
  "white",
]);
export const DEFAULT_THEME = "modern";
/** 처음에는 목록에 없다가 열리는 테마(열렸는지는 업적이 기억한다 — js/storage/achievements.js) */
const SECRET_THEME_IDS = Object.freeze(["sharp"]);
/** 저장해도 되는 테마 키 전부 */
export const ALL_THEME_IDS = Object.freeze([...THEME_IDS, ...SECRET_THEME_IDS]);

export const CONTRAST_PALETTE = Object.freeze([
  "",
  "#56b4e9",
  "#0072b2",
  "#e69f00",
  "#f0e442",
  "#009e73",
  "#cc79a7",
  "#d55e00",
  "#8b8f99",
]);

/** 셀 상자 경로. inset은 바깥에서 들어온 거리, radius는 셀 크기에 대한 모서리 비율 */
const cellPath = (ctx, x, y, size, inset, radius) => {
  const edge = size - inset * 2;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, edge, edge, Math.max(0, Math.min(size * radius, edge / 2)));
};

/**
 * 셀 하나. 마감(finish)이 블록의 질감을 정한다(광택·입체·빛 번짐 없이, 인쇄물처럼 납작하게):
 *  flat 단색 · inset 단색 + 안쪽에 보드색 가는 선(찍어 낸 타일처럼) · frame 어두운 속 + 피스 색 테두리
 * 그림자 흐림(shadowBlur)·그라데이션은 쓰지 않는다 — 고전 게임 느낌이 나고, 공용 PC에서 무겁다.
 */
const drawCell = (ctx, x, y, size, theme, color, outline) => {
  const inset = size * theme.gap;
  cellPath(ctx, x, y, size, inset, theme.radius);
  if (outline) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    return;
  }
  const finish = theme.finish ?? "flat";
  ctx.fillStyle = color;
  if (finish === "frame") {
    // 화려한 색을 면적으로 쓰지 않아 차분하다
    const line = Math.max(1, size * 0.09);
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fill();
    ctx.restore();
    cellPath(ctx, x, y, size, inset + line / 2, theme.radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = line;
    ctx.stroke();
    return;
  }
  ctx.fill();
  if (finish === "inset") {
    // 안쪽 가는 선: 칸이 또렷이 나뉘어 보이되 입체감은 없다
    const line = Math.max(1, size * 0.055);
    cellPath(ctx, x, y, size, inset + size * 0.17, theme.radius * 0.6);
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = theme.board.bg;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.restore();
  }
};

/** 색이 밝은가(무늬를 어두운 잉크로 그릴지 정한다) */
const isLight = hex => {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
};

/**
 * 블록 무늬: 셀 값(1~7 = I J L O S T Z, 8 = 쓰레기)마다 다른 모양을 셀 가운데에 그린다.
 * 색을 구분하기 어려워도 피스를 알아볼 수 있게 하는 접근성 설정.
 */
/**
 * 미리보기 상자(4×2칸) 가운데에 피스를 놓을 왼쪽 위 좌표(넥스트·홀드 칸, 테마 미리보기가 함께 쓴다)
 * @param {ReadonlyArray<readonly [number, number]>} shape @param {number} left @param {number} top @param {number} size
 */
export const boxOrigin = (shape, left, top, size) => {
  const xs = shape.map(c => c[0]);
  const ys = shape.map(c => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return {
    ox: left + ((4 - w) * size) / 2 - Math.min(...xs) * size,
    oy: top + ((2 - h) * size) / 2 - Math.min(...ys) * size,
  };
};

export const drawMark = (ctx, x, y, size, value, color) => {
  const c = size / 2;
  const r = size * 0.2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.strokeStyle = isLight(color) ? "rgb(0 0 0 / 0.45)" : "rgb(255 255 255 / 0.6)";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.lineCap = "square";
  ctx.beginPath();
  switch (value) {
    case 1: // I: 가로 막대
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      break;
    case 2: // J: 왼쪽 아래 모서리
      ctx.moveTo(-r, -r);
      ctx.lineTo(-r, r);
      ctx.lineTo(r, r);
      break;
    case 3: // L: 오른쪽 아래 모서리
      ctx.moveTo(r, -r);
      ctx.lineTo(r, r);
      ctx.lineTo(-r, r);
      break;
    case 4: // O: 작은 네모
      ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
      break;
    case 5: // S: 오른쪽 위로 비스듬히
      ctx.moveTo(-r, r);
      ctx.lineTo(r, -r);
      break;
    case 6: // T: 가운데 점
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    case 7: // Z: 오른쪽 아래로 비스듬히
      ctx.moveTo(-r, -r);
      ctx.lineTo(r, r);
      break;
    default: // 쓰레기: 가로 두 줄
      ctx.moveTo(-r, -r * 0.5);
      ctx.lineTo(r, -r * 0.5);
      ctx.moveTo(-r, r * 0.5);
      ctx.lineTo(r, r * 0.5);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * 점 격자 경로: 안쪽 칸 모서리가 만나는 곳마다 작은 네모(선 격자보다 조용하고 종이·도면 느낌)
 * @returns {Path2D}
 */
export const gridDots = (bx, by, cols, rows, cell) => {
  const path = new Path2D();
  const d = Math.max(1, Math.round(cell * 0.09));
  for (let x = 1; x < cols; x++)
    for (let y = 1; y < rows; y++) path.rect(bx + x * cell - d / 2, by + y * cell - d / 2, d, d);
  return path;
};

/**
 * '#' 격자 경로: 두 칸마다 칸 모서리에 작은 '#'(가로 둘·세로 둘)
 * @returns {Path2D}
 */
export const gridHashes = (bx, by, cols, rows, cell) => {
  const path = new Path2D();
  const r = cell * 0.13;
  const g = cell * 0.05;
  for (let x = 2; x < cols; x += 2)
    for (let y = 2; y < rows; y += 2) {
      const cx = Math.round(bx + x * cell) + 0.5;
      const cy = Math.round(by + y * cell) + 0.5;
      for (const d of [-g, g]) {
        path.moveTo(cx - r, cy + d);
        path.lineTo(cx + r, cy + d);
        path.moveTo(cx + d, cy - r);
        path.lineTo(cx + d, cy + r);
      }
    }
  return path;
};

/** 고스트 진하기 → [윤곽 투명도, 채움 투명도] */
const GHOST_LEVEL = { faint: [0.32, 0], normal: [0.58, 0], strong: [0.95, 0.22] };

export const makeTheme = spec => {
  const theme = {
    ...spec,
    palette: Object.freeze(["", ...spec.palette]),
    board: Object.freeze(spec.board),
    motion: Object.freeze(spec.motion),
  };
  return Object.freeze({
    ...theme,
    block: (ctx, x, y, size, color) => drawCell(ctx, x, y, size, theme, color, false),
    ghost: (ctx, x, y, size, color, level = "normal") => {
      const [line, fill] = GHOST_LEVEL[level] ?? GHOST_LEVEL.normal;
      ctx.save();
      if (fill) {
        ctx.globalAlpha = fill;
        drawCell(ctx, x, y, size, theme, color, false);
      }
      ctx.globalAlpha = line;
      drawCell(ctx, x, y, size, theme, color, true);
      ctx.restore();
    },
  });
};

/**
 * 테마 디자인 원칙(docs/DESIGN_SYSTEM.md "보드 테마"):
 *  - 고전 게임 느낌을 내지 않는다: 광택·입체(베벨)·빛 번짐·그라데이션·원색 무지개 없음.
 *  - 빈티지: 인쇄 잉크·종이·도면처럼 채도를 한 단계 눌러 담은 색.
 *  - 모던·깔끔: 납작한 면, 가는 선, 짧고 단정한 효과.
 *  - 명료: 일곱 피스는 보드와 3:1 넘게 대비되고 서로도 확실히 다르다(단위 테스트가 잰다).
 * 테마마다 보드색·격자(선·점·없음)·블록 마감·모서리·효과를 묶어 성격을 나눈다.
 * 저장 키는 예전 그대로 둔다(minimal = 블루프린트, stone = 샌드).
 */
export const THEMES = Object.freeze({
  modern: makeTheme({
    name: t("스튜디오"),
    description: t("차콜 보드에 또렷한 무광 블록 · 기본"),
    palette: ["#8ed6cd", "#9baff4", "#f5ab87", "#d6ed84", "#8bc994", "#c4a6ec", "#ee9095", "#727b74"],
    board: { bg: "#202421", grid: "#2b312c", edge: "#414941", ink: "#d6ed84" },
    gridStyle: "lines",
    gap: 0.045,
    radius: 0.15,
    finish: "flat",
    motion: {
      slideMs: 42,
      landMs: 165,
      depth: 0.15,
      rebound: 0.035,
      trailMs: 115,
      trailCells: 2.5,
      clear: "spread",
      accent: "dash",
      accentSize: 0.18,
      clearMs: 205,
    },
  }),
  retro: makeTheme({
    name: t("페이퍼"),
    description: t("미색 종이에 인쇄 잉크색 블록, 점 격자"),
    palette: ["#26727a", "#344f99", "#b0532a", "#8f6c14", "#4b7a33", "#6e4686", "#a73636", "#8a857a"],
    board: { bg: "#f2eee3", grid: "#c9c1ae", edge: "#d6cfbe", ink: "#3d3a33" },
    gridStyle: "dots",
    gap: 0.06,
    radius: 0.04,
    finish: "flat",
    motion: {
      slideMs: 24,
      landMs: 115,
      depth: 0.09,
      rebound: 0,
      trailMs: 75,
      trailCells: 1,
      clear: "wipe",
      accent: "dash",
      accentSize: 0.14,
      clearMs: 155,
    },
  }),
  minimal: makeTheme({
    name: t("블루프린트"),
    description: t("코발트 도면 위에 옅은 색 타일, 가는 선 격자"),
    palette: ["#9fe0e8", "#a6bcff", "#ffc29a", "#f3dc8a", "#ade0a0", "#e3bcff", "#ffa9b3", "#5f78a6"],
    board: { bg: "#1c3461", grid: "#2a4677", edge: "#456596", ink: "#e7eefb" },
    gridStyle: "lines",
    gap: 0.07,
    radius: 0,
    finish: "inset",
    motion: {
      slideMs: 56,
      landMs: 215,
      depth: 0.12,
      rebound: 0.015,
      trailMs: 155,
      trailCells: 2,
      clear: "rails",
      accent: "dash",
      accentSize: 0.22,
      clearMs: 245,
    },
  }),
  graphite: makeTheme({
    name: t("그라파이트"),
    description: t("격자 없는 무채색 보드에 각진 블록 · 집중용"),
    palette: ["#6fb0b6", "#7187c8", "#c98d63", "#c9b46b", "#7fae7f", "#ae8cc4", "#c97a7f", "#5d6166"],
    board: { bg: "#151617", grid: "#202224", edge: "#33363a", ink: "#d4d7db" },
    gridStyle: "none",
    gap: 0.06,
    radius: 0,
    finish: "flat",
    motion: {
      slideMs: 36,
      landMs: 150,
      depth: 0.11,
      rebound: 0.02,
      trailMs: 110,
      trailCells: 2,
      clear: "flash",
      accent: "chip",
      accentSize: 0.15,
      clearMs: 180,
    },
  }),
  frame: makeTheme({
    name: t("프레임"),
    description: t("검은 보드에 테두리만 색이 있는 선 블록"),
    palette: ["#45c6d6", "#5d82e0", "#e08a45", "#e0c04a", "#55c07a", "#a77ad8", "#e05a72", "#6b7080"],
    board: { bg: "#0f1012", grid: "#1b1c20", edge: "#2c2e34", ink: "#d8dde4" },
    gridStyle: "lines",
    gap: 0.06,
    radius: 0.07,
    finish: "frame",
    motion: {
      slideMs: 30,
      landMs: 140,
      depth: 0.1,
      rebound: 0.04,
      trailMs: 130,
      trailCells: 3,
      clear: "scan",
      accent: "chip",
      accentSize: 0.21,
      clearMs: 210,
    },
  }),
  stone: makeTheme({
    name: t("샌드"),
    description: t("모래빛 보드에 테라코타·머스터드 둥근 블록"),
    palette: ["#24787a", "#2f4f86", "#b4532c", "#9a7213", "#59782b", "#7a3f6d", "#a8352f", "#9c9180"],
    board: { bg: "#ebe2d0", grid: "#dfd4bf", edge: "#cbbd9f", ink: "#4a3f33" },
    gridStyle: "lines",
    gap: 0.07,
    radius: 0.26,
    finish: "flat",
    motion: {
      slideMs: 28,
      landMs: 120,
      depth: 0.08,
      rebound: 0,
      trailMs: 85,
      trailCells: 1.5,
      clear: "pop",
      accent: "chip",
      accentSize: 0.18,
      clearMs: 210,
    },
  }),
  midnight: makeTheme({
    name: t("미드나잇"),
    description: t("짙은 남색에 보석빛 블록, 점 격자"),
    palette: ["#4fb0c4", "#6b88d6", "#d38a58", "#d2ae52", "#62a877", "#9a7bc6", "#cc6675", "#4c5670"],
    board: { bg: "#10172a", grid: "#2a3754", edge: "#2c3a52", ink: "#b4c8ea" },
    gridStyle: "dots",
    gap: 0.05,
    radius: 0.1,
    finish: "flat",
    motion: {
      slideMs: 44,
      landMs: 175,
      depth: 0.13,
      rebound: 0.03,
      trailMs: 125,
      trailCells: 2.5,
      clear: "converge",
      accent: "dot",
      accentSize: 0.2,
      clearMs: 215,
    },
  }),
  forest: makeTheme({
    name: t("포레스트"),
    description: t("짙은 숲빛에 이끼·흙빛 블록, 부드러운 모서리"),
    palette: ["#6fb8a4", "#7896ba", "#d2945c", "#d2bb6c", "#93ba6c", "#a892c0", "#cd7c6a", "#56645a"],
    board: { bg: "#16201a", grid: "#202b24", edge: "#34453a", ink: "#c6dccb" },
    gridStyle: "lines",
    gap: 0.055,
    radius: 0.3,
    finish: "flat",
    motion: {
      slideMs: 50,
      landMs: 185,
      depth: 0.095,
      rebound: 0.01,
      trailMs: 120,
      trailCells: 2,
      clear: "fade",
      accent: "dot",
      accentSize: 0.16,
      clearMs: 240,
    },
  }),
  white: makeTheme({
    name: t("화이트"),
    description: t("깨끗한 흰 보드에 선명하고 묵직한 블록"),
    palette: ["#0f7f91", "#2850b8", "#c8551d", "#9a7400", "#24813f", "#6c3fb3", "#c22e45", "#a2a7ad"],
    board: { bg: "#fbfbfa", grid: "#ededeb", edge: "#d8d8d4", ink: "#2b2b2b" },
    gridStyle: "lines",
    gap: 0.05,
    radius: 0.08,
    finish: "flat",
    motion: {
      slideMs: 26,
      landMs: 125,
      depth: 0.14,
      rebound: 0,
      trailMs: 80,
      trailCells: 1.5,
      clear: "sink",
      accent: "dash",
      accentSize: 0.12,
      clearMs: 200,
    },
  }),
  sharp: makeTheme({
    name: t("샤프"),
    description: t("먹색 판에 # 격자, 흑백에 연두 한 가지"),
    palette: ["#d4f06a", "#f2f2ee", "#c4c4bf", "#9a9a93", "#6b6c66", "#93b53c", "#62802a", "#505153"],
    board: { bg: "#111214", grid: "#3a3c40", edge: "#2a2c30", ink: "#d6ed84" },
    gridStyle: "hash",
    gap: 0.06,
    radius: 0.02,
    finish: "flat",
    motion: {
      slideMs: 32,
      landMs: 140,
      depth: 0.105,
      rebound: 0.02,
      trailMs: 100,
      trailCells: 2,
      clear: "hash",
      accent: "chip",
      accentSize: 0.16,
      clearMs: 200,
    },
  }),
});
/** 블록 색 직접 고르기에 쓰는 견본(어두운·밝은 보드 모두에서 잘 보이는 색) */
export const COLOR_SWATCHES = Object.freeze([
  "#8ed6cd",
  "#4fb3a9",
  "#9baff4",
  "#5a78d6",
  "#c4a6ec",
  "#8c63c9",
  "#f5ab87",
  "#e07a45",
  "#d6ed84",
  "#a8c43f",
  "#8bc994",
  "#4f9a5b",
  "#ee9095",
  "#cf4f5a",
  "#f2d06b",
  "#c9cfc5",
]);

/** 피스 순서(셀 값 1~7) */
export const PIECE_ORDER = Object.freeze(["I", "J", "L", "O", "S", "T", "Z"]);

/**
 * 지금 설정의 블록 색: 테마 색 · 색각 친화 · 직접 고른 색(고르지 않은 피스는 테마 색)
 * @returns {readonly string[]} 셀 값(1~8) → 색
 */
export const paletteFor = (visual, theme) => {
  if (visual.palette === "contrast") return CONTRAST_PALETTE;
  if (visual.palette !== "custom" || !visual.colors) return theme.palette;
  return theme.palette.map((color, i) => (i >= 1 && i <= 7 ? (visual.colors[PIECE_ORDER[i - 1]] ?? color) : color));
};

export const findTheme = id => (Object.hasOwn(THEMES, id) ? THEMES[id] : THEMES[DEFAULT_THEME]);
