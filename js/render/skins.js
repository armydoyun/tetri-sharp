// 블록 모양(스킨)과 색 구성. 스킨은 칸 하나를 그리는 방법만 다르다.

/** 7종 + 가비지 색. 인덱스는 보드 셀 값(1~8). */
export const PALETTES = Object.freeze({
  // 기본: css/tokens.css의 --piece-* 변수에서 읽는다
  default: null,
  // 색각 친화(Okabe–Ito 계열): 서로 구분이 쉬운 색만 쓴다
  contrast: Object.freeze(["", "#56b4e9", "#0072b2", "#e69f00", "#f0e442", "#009e73", "#cc79a7", "#d55e00", "#8b8f99"]),
});

export const SKINS = Object.freeze(["flat", "bevel", "outline"]);

/** "#rrggbb" 밝기 조절(amount: -1 ~ 1) */
const shade = (hex, amount) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  );
  return `rgb(${ch.join(",")})`;
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {"flat" | "bevel" | "outline"} skin
 */
export const drawBlock = (ctx, skin, px, py, size, color) => {
  const x = px + 1;
  const y = py + 1;
  const s = size - 2;
  if (skin === "outline") {
    const w = Math.max(2, Math.round(size * 0.12));
    ctx.fillStyle = shade(color, -0.75);
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.strokeRect(x + w / 2, y + w / 2, s - w, s - w);
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  if (skin === "bevel") {
    const e = Math.max(2, Math.round(size * 0.14));
    ctx.fillStyle = shade(color, 0.35);
    ctx.fillRect(x, y, s, e);
    ctx.fillRect(x, y, e, s);
    ctx.fillStyle = shade(color, -0.35);
    ctx.fillRect(x, y + s - e, s, e);
    ctx.fillRect(x + s - e, y, e, s);
  }
};
