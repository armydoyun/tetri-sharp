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

const makeTheme = spec => {
  const theme = { ...spec, palette: Object.freeze(["", ...spec.palette]), board: Object.freeze(spec.board) };
  return Object.freeze({
    ...theme,
    block: (ctx, x, y, size, color) => drawCell(ctx, x, y, size, theme, color, false),
    ghost: (ctx, x, y, size, color) => {
      ctx.save();
      ctx.globalAlpha = 0.58;
      drawCell(ctx, x, y, size, theme, color, true);
      ctx.restore();
    },
  });
};

export const THEMES = Object.freeze({
  modern: makeTheme({
    name: "스튜디오",
    description: "차콜 보드와 선명한 무광 블록",
    palette: ["#8ed6cd", "#9baff4", "#f5ab87", "#d6ed84", "#8bc994", "#c4a6ec", "#ee9095", "#727b74"],
    board: { bg: "#202421", grid: "#2b312c", edge: "#414941", ink: "#d6ed84" },
    gap: 0.045,
    radius: 0.15,
  }),
  retro: makeTheme({
    name: "페이퍼",
    description: "종이색 보드와 차분한 잉크색 블록",
    palette: ["#3e817b", "#526ab1", "#b76540", "#9b741d", "#58844b", "#82639e", "#b85060", "#797c74"],
    board: { bg: "#eeede3", grid: "#dfded2", edge: "#cfcec0", ink: "#52624a" },
    gap: 0.055,
    radius: 0.06,
  }),
  minimal: makeTheme({
    name: "슬레이트",
    description: "푸른 회색 보드와 낮은 채도의 블록",
    palette: ["#8caeb7", "#8d9ac4", "#c6a28b", "#c8c29c", "#9eb4a3", "#ada4bf", "#c59fa8", "#73808b"],
    board: { bg: "#262d35", grid: "#323c46", edge: "#46525d", ink: "#adc9d1" },
    gap: 0.085,
    radius: 0.1,
  }),
});

export const findTheme = id => (Object.hasOwn(THEMES, id) ? THEMES[id] : THEMES[DEFAULT_THEME]);
