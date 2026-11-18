import { t } from "../i18n/index.js";
// 저장된 테마 키는 유지한다. 테마는 보드와 블록의 색·모양을 정의한다.
export const THEME_IDS = Object.freeze(["modern", "retro", "minimal"]);
export const DEFAULT_THEME = "modern";

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

const drawCell = (ctx, x, y, size, theme, color, outline) => {
  const inset = size * theme.gap;
  const edge = size - inset * 2;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, edge, edge, size * theme.radius);
  if (outline) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
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

/** 고스트 진하기 → [윤곽 투명도, 채움 투명도] */
const GHOST_LEVEL = { faint: [0.32, 0], normal: [0.58, 0], strong: [0.95, 0.22] };

const makeTheme = spec => {
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

export const THEMES = Object.freeze({
  modern: makeTheme({
    name: t("스튜디오"),
    description: t("차콜 보드와 선명한 무광 블록"),
    palette: ["#8ed6cd", "#9baff4", "#f5ab87", "#d6ed84", "#8bc994", "#c4a6ec", "#ee9095", "#727b74"],
    board: { bg: "#202421", grid: "#2b312c", edge: "#414941", ink: "#d6ed84" },
    gap: 0.045,
    radius: 0.15,
    motion: {
      slideMs: 42,
      landMs: 165,
      depth: 0.15,
      rebound: 0.035,
      trailMs: 115,
      trailCells: 2.5,
      clear: "spread",
      clearMs: 205,
    },
  }),
  retro: makeTheme({
    name: t("페이퍼"),
    description: t("종이색 보드와 차분한 잉크색 블록"),
    palette: ["#3e817b", "#526ab1", "#b76540", "#9b741d", "#58844b", "#82639e", "#b85060", "#797c74"],
    board: { bg: "#eeede3", grid: "#dfded2", edge: "#cfcec0", ink: "#52624a" },
    gap: 0.055,
    radius: 0.06,
    motion: {
      slideMs: 24,
      landMs: 115,
      depth: 0.09,
      rebound: 0,
      trailMs: 75,
      trailCells: 1,
      clear: "wipe",
      clearMs: 155,
    },
  }),
  minimal: makeTheme({
    name: t("슬레이트"),
    description: t("푸른 회색 보드와 낮은 채도의 블록"),
    palette: ["#8caeb7", "#8d9ac4", "#c6a28b", "#c8c29c", "#9eb4a3", "#ada4bf", "#c59fa8", "#73808b"],
    board: { bg: "#262d35", grid: "#323c46", edge: "#46525d", ink: "#adc9d1" },
    gap: 0.085,
    radius: 0.1,
    motion: {
      slideMs: 56,
      landMs: 215,
      depth: 0.12,
      rebound: 0.015,
      trailMs: 155,
      trailCells: 2,
      clear: "rails",
      clearMs: 245,
    },
  }),
});

export const findTheme = id => (Object.hasOwn(THEMES, id) ? THEMES[id] : THEMES[DEFAULT_THEME]);
