// 게임 테마: 게임 화면(보드·피스·고스트·연출·움직임)의 모습만 정한다. UI는 디자인 시스템을 따른다.
//   retro   8비트 느낌: 각진 픽셀 입체 블록, 칸 단위로 딱딱 움직임, 깜빡이는 섬광, 네모 파편
//   minimal 차분함: 평면 블록과 넓은 틈, 격자 대신 점, 은은한 색, 연출은 옅게 사라지는 정도
//   modern  다듬어진 느낌: 둥근 그라데이션 블록과 은은한 빛, 짧게 미끄러지는 움직임, 퍼지는 섬광, 둥근 파편
// 접근성 설정(색각 친화 색, 효과 줄임/끄기)은 테마와 상관없이 적용된다.

export const THEME_IDS = Object.freeze(["modern", "retro", "minimal"]);
export const DEFAULT_THEME = "modern";

/** 색각 친화(Okabe–Ito 계열) — 테마 색 대신 쓰는 접근성 팔레트. 인덱스는 보드 셀 값(1~8). */
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

/** "#rrggbb" 밝기 조절(amount: -1 ~ 1) → "rgb(...)" */
export const shade = (hex, amount, alpha = 1) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  );
  return alpha < 1 ? `rgba(${ch.join(",")},${alpha})` : `rgb(${ch.join(",")})`;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

// ---- 블록 그리기: (ctx, px, py, size, color) — px·py는 칸의 왼쪽 위 ----

const retroBlock = (ctx, px, py, s, color) => {
  const p = Math.max(1, Math.round(s / 9)); // 픽셀 한 칸
  const x = px + 1;
  const y = py + 1;
  const w = s - 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, w);
  ctx.fillStyle = shade(color, 0.45);
  ctx.fillRect(x, y, w, p);
  ctx.fillRect(x, y, p, w);
  ctx.fillStyle = shade(color, -0.45);
  ctx.fillRect(x, y + w - p, w, p);
  ctx.fillRect(x + w - p, y, p, w);
  // 왼쪽 위 반짝이 픽셀
  ctx.fillStyle = shade(color, 0.8);
  ctx.fillRect(x + p * 2, y + p * 2, p, p);
};

const minimalBlock = (ctx, px, py, s, color) => {
  const g = Math.max(2, Math.round(s * 0.09));
  ctx.fillStyle = color;
  roundRect(ctx, px + g, py + g, s - g * 2, s - g * 2, Math.max(1, s * 0.06));
  ctx.fill();
};

const modernBlock = (ctx, px, py, s, color) => {
  const x = px + 1;
  const y = py + 1;
  const w = s - 2;
  const r = s * 0.18;
  const grad = ctx.createLinearGradient(0, y, 0, y + w);
  grad.addColorStop(0, shade(color, 0.22));
  grad.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, w, r);
  ctx.fill();
  // 위쪽 안쪽 빛
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + r, y + ctx.lineWidth);
  ctx.lineTo(x + w - r, y + ctx.lineWidth);
  ctx.stroke();
};

// ---- 고스트(착지 위치) ----

const sameBlockGhost = draw => (ctx, px, py, s, color) => {
  ctx.globalAlpha = 0.25;
  draw(ctx, px, py, s, color);
  ctx.globalAlpha = 1;
};

const minimalGhost = (ctx, px, py, s, color) => {
  const g = Math.max(2, Math.round(s * 0.09));
  ctx.strokeStyle = shade(color, 0, 0.55);
  ctx.lineWidth = Math.max(1, s * 0.05);
  roundRect(ctx, px + g + 0.5, py + g + 0.5, s - g * 2 - 1, s - g * 2 - 1, Math.max(1, s * 0.06));
  ctx.stroke();
};

const modernGhost = (ctx, px, py, s, color) => {
  const r = s * 0.18;
  ctx.fillStyle = shade(color, 0, 0.12);
  roundRect(ctx, px + 1, py + 1, s - 2, s - 2, r);
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.1, 0.6);
  ctx.lineWidth = Math.max(1, s * 0.05);
  roundRect(ctx, px + 1.5, py + 1.5, s - 3, s - 3, r);
  ctx.stroke();
};

/**
 * @typedef {Object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {readonly string[]} palette              보드 셀 값(1~8) → 색
 * @property {{ bg: string, bgTop?: string, grid: "lines" | "dots" | "none", gridColor: string, label: string }} board
 * @property {(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string) => void} block
 * @property {(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string) => void} ghost
 * @property {number} glow                            움직이는 피스 빛 번짐(칸 크기 배수, 0 = 없음)
 * @property {number} slideMs                         칸 사이 미끄러짐 시간(0 = 칸 단위)
 * @property {{ weight: number, upper: boolean, spacing: number }} label  HOLD·NEXT 글자
 * @property {{ flash: "blink" | "fade" | "sweep", particles: "square" | "circle" | "none", trail: boolean,
 *   lockFlash: number, shake: boolean }} fx
 */

/** @type {Record<string, Theme>} */
export const THEMES = Object.freeze({
  retro: Object.freeze({
    id: "retro",
    name: "레트로",
    description: "8비트 픽셀 블록, 칸 단위 움직임",
    palette: Object.freeze([
      "",
      "#3fc7e0",
      "#4a6cf0",
      "#f0a03c",
      "#f0d23c",
      "#5cd06a",
      "#b05cf0",
      "#f05c5c",
      "#6b6f78",
    ]),
    board: Object.freeze({ bg: "#0e0f12", grid: "lines", gridColor: "#23262d", label: "#8b8f99" }),
    block: retroBlock,
    ghost: sameBlockGhost(retroBlock),
    glow: 0,
    slideMs: 0,
    label: Object.freeze({ weight: 700, upper: true, spacing: 0.12 }),
    fx: Object.freeze({ flash: "blink", particles: "square", trail: true, lockFlash: 0.4, shake: true }),
  }),
  minimal: Object.freeze({
    id: "minimal",
    name: "미니멀",
    description: "평면 블록, 점 격자, 옅은 연출",
    palette: Object.freeze([
      "",
      "#7fb8c4",
      "#7f8fc9",
      "#d4a373",
      "#d9c77e",
      "#8fbf8f",
      "#a98bc4",
      "#d08a8a",
      "#585c64",
    ]),
    board: Object.freeze({ bg: "#141518", grid: "dots", gridColor: "#2a2d34", label: "#6f747e" }),
    block: minimalBlock,
    ghost: minimalGhost,
    glow: 0,
    slideMs: 0,
    label: Object.freeze({ weight: 500, upper: false, spacing: 0.02 }),
    fx: Object.freeze({ flash: "fade", particles: "none", trail: false, lockFlash: 0, shake: false }),
  }),
  modern: Object.freeze({
    id: "modern",
    name: "모던",
    description: "둥근 그라데이션 블록, 부드러운 움직임",
    palette: Object.freeze([
      "",
      "#22d3ee",
      "#3b82f6",
      "#fb923c",
      "#facc15",
      "#4ade80",
      "#a855f7",
      "#f43f5e",
      "#64748b",
    ]),
    board: Object.freeze({ bg: "#0d0e12", bgTop: "#151824", grid: "lines", gridColor: "#1b1e27", label: "#8b93a7" }),
    block: modernBlock,
    ghost: modernGhost,
    glow: 0.45,
    slideMs: 50,
    label: Object.freeze({ weight: 600, upper: true, spacing: 0.06 }),
    fx: Object.freeze({ flash: "sweep", particles: "circle", trail: true, lockFlash: 0.25, shake: true }),
  }),
});

export const findTheme = id => THEMES[id] ?? THEMES[DEFAULT_THEME];
