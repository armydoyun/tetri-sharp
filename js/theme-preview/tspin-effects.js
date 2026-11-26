// T의 회전축을 원점으로 그린다. 획과 입자는 칸 단위로 작게 유지한다.
const TAU = 2 * Math.PI;
const easeOut = p => 1 - (1 - p) ** 3;

const line = (ctx, weight, points) => {
  ctx.lineWidth = weight;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
};

const arc = (ctx, weight, radius, from, travel) => {
  ctx.lineWidth = weight;
  ctx.beginPath();
  ctx.arc(0, 0, radius, from, from + travel, travel < 0);
  ctx.stroke();
};

const curve = (ctx, weight, x, y, cx, cy, endX, endY) => {
  ctx.lineWidth = weight;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cx, cy, endX, endY);
  ctx.stroke();
};

const dot = (ctx, x, y, radius) => {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
};

const tick = (ctx, angle, start, end, weight = 0.055) =>
  line(ctx, weight, [
    [start * Math.cos(angle), start * Math.sin(angle)],
    [end * Math.cos(angle), end * Math.sin(angle)],
  ]);

/** @type {Record<string, {ms: number, paint: (ctx: CanvasRenderingContext2D, progress: number) => void}>} */
const SPINS = {
  // 무광 가이드가 T의 가로 팔을 양쪽에서 받는다.
  modern: {
    ms: 240,
    paint(ctx, p) {
      const x = 1.5 - 0.36 * easeOut(p);
      for (const side of [-1, 1])
        line(ctx, 0.105, [
          [side * (x - 0.26), -0.4],
          [side * x, -0.4],
          [side * x, 0.34],
        ]);
    },
  },
  // 종이 모서리가 접히듯 하나의 사선 면이 눌린다.
  retro: {
    ms: 245,
    paint(ctx, p) {
      const fold = 0.42 * (1 - easeOut(p));
      const corner = -0.88 + 0.32 * p;
      ctx.beginPath();
      ctx.moveTo(-1.43, -0.2);
      ctx.lineTo(-0.38, -1.26);
      ctx.lineTo(0.58, corner);
      ctx.lineTo(-0.32, corner + fold);
      ctx.closePath();
      ctx.fill();
      line(ctx, 0.065, [
        [-1.42, 0.02],
        [-0.33, -0.62 + fold],
        [0.59, corner + 0.2],
      ]);
    },
  },
  // 도면 눈금과 컴퍼스 바늘이 90° 눈금에 닿는다.
  minimal: {
    ms: 345,
    paint(ctx, p) {
      const from = -0.22;
      const angle = from - (Math.PI / 2) * easeOut(p);
      for (let i = 0; i < 5; i++) tick(ctx, from - (i * Math.PI) / 8, 1.25, i % 2 === 0 ? 1.49 : 1.38);
      tick(ctx, angle, 0.36, 1.19, 0.072);
      dot(ctx, 0, 0, 0.087);
    },
  },
  graphite: {
    ms: 180,
    paint(ctx, p) {
      const gap = 0.67 + p * 0.26;
      for (const side of [-1, 1])
        line(ctx, 0.065, [
          [side * gap, -0.44],
          [side * gap, 0.39 - 0.3 * p],
        ]);
    },
  },
  frame: {
    ms: 260,
    paint(ctx, p) {
      const square = 1.55 - 0.32 * easeOut(p);
      ctx.rotate(-0.3 * (1 - easeOut(p)));
      for (const [x, y] of [
        [1, -1],
        [-1, 1],
      ])
        line(ctx, 0.09, [
          [x * (square - 0.46), y * square],
          [x * square, y * square],
          [x * square, y * (square - 0.46)],
        ]);
    },
  },
  stone: {
    ms: 310,
    paint(ctx, p) {
      for (let i = 0; i < 7; i++) {
        const angle = -0.24 - 0.34 * i - 0.42 * easeOut(p);
        const r = 0.75 + i * 0.085 + p * (0.25 + (i % 2) * 0.18);
        dot(ctx, Math.cos(angle) * r, Math.sin(angle) * r + p * p * 0.36, i % 3 === 0 ? 0.094 : 0.055);
      }
    },
  },
  midnight: {
    ms: 340,
    paint(ctx, p) {
      const angle = 0.12 - 1.42 * easeOut(p);
      for (const [offset, radius, size] of [
        [0, 1.17, 0.13],
        [0.31, 1.29, 0.076],
        [0.56, 1.05, 0.047],
      ])
        dot(ctx, Math.cos(angle + offset) * radius, Math.sin(angle + offset) * radius, size);
      arc(ctx, 0.043, 1.17, angle + 0.13, 0.52 * (1 - p));
    },
  },
  forest: {
    ms: 330,
    paint(ctx, p) {
      const tip = 0.4 + 0.54 * easeOut(p);
      curve(ctx, 0.087, 1.22, 0.46, 0.81, -0.83, -tip, -1.16);
      curve(ctx, 0.064, 0.29, -0.65, 0.02, -1.26, 0.44 - tip * 0.3, -1.47);
      curve(ctx, 0.051, 0.66, -0.33, -0.02, -0.27, -tip, -0.55);
    },
  },
  white: {
    ms: 200,
    paint(ctx, p) {
      const x = 0.92 + 0.42 * easeOut(p);
      ctx.fillRect(-x, -0.68, 1.22 - p * 0.35, 0.09);
      ctx.fillRect(x - 1.22 + p * 0.35, 0.54, 1.22 - p * 0.35, 0.09);
    },
  },
  sharp: {
    ms: 285,
    paint(ctx, p) {
      const slip = 0.42 * (1 - easeOut(p));
      for (const side of [-1, 1]) {
        const offset = side * 0.27;
        line(ctx, 0.1, [
          [offset + slip + 0.15, -0.91],
          [offset + slip - 0.15, 0.89],
        ]);
        line(ctx, 0.1, [
          [-0.84, offset - slip],
          [0.84, offset - slip],
        ]);
      }
    },
  },
  porcelain: {
    ms: 285,
    paint(ctx, p) {
      const end = 0.58 + 0.76 * easeOut(p);
      line(ctx, 0.064, [
        [-end, -0.27],
        [-0.77, -0.27],
        [-0.38, -0.83],
        [0.26, -0.83],
        [end * 0.78, -1.2],
      ]);
      line(ctx, 0.044, [
        [-0.64, -0.48],
        [-0.24, -0.03],
        [0.34, -0.03],
        [end, 0.36],
      ]);
    },
  },
  relay: {
    ms: 255,
    paint(ctx, p) {
      const x = 0.44 + 0.5 * easeOut(p);
      for (const direction of [-1, 1]) {
        const y = direction * (0.48 - 0.28 * p);
        ctx.fillRect(direction * x - 0.23, y - 0.07, 0.46, 0.14);
        line(ctx, 0.07, [
          [direction * 0.18, y],
          [direction * (x + 0.37), y],
          [direction * (x + 0.37), y - direction * 0.26],
        ]);
      }
    },
  },
  tide: {
    ms: 350,
    paint(ctx, p) {
      const x = 1.08 + 0.27 * p;
      curve(ctx, 0.105, x, 0.57, 0.13, -1.98 + p * 0.64, -x, -0.49 - p * 0.18);
      curve(ctx, 0.05, x * 0.82, 0.77, 0.16, -1.5 + p * 0.64, -x * 0.82, -0.16 - p * 0.25);
    },
  },
  velvet: {
    ms: 315,
    paint(ctx, p) {
      const x = 0.22 + 0.46 * easeOut(p);
      ctx.beginPath();
      ctx.moveTo(1.36, 0.44);
      ctx.bezierCurveTo(1.07, -0.87, -0.01, -1.4, -x, -1.13);
      ctx.bezierCurveTo(0.45, -0.88, 0.9, -0.19, 1.36, 0.44);
      ctx.fill();
    },
  },
  press: {
    ms: 235,
    paint(ctx, p) {
      const scale = 1.18 - 0.23 * easeOut(p);
      ctx.scale(scale, scale);
      ctx.lineWidth = 0.13;
      ctx.strokeRect(-0.94, -0.72, 1.88, 1.44);
      ctx.fillRect(-0.69, -0.47, 0.71 - 0.34 * p, 0.16);
    },
  },
  film: {
    ms: 270,
    paint(ctx, p) {
      const roll = 0.58 * easeOut(p);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) ctx.fillRect(-1.22 + i * 0.57 + side * roll, side * 0.7, 0.26, 0.135);
    },
  },
  post: {
    ms: 300,
    paint(ctx, p) {
      arc(ctx, 0.062, 0.82, 0.1, -1.4 * Math.PI * easeOut(Math.min(1, p + 0.18)));
      for (let i = 0; i < 3; i++)
        curve(ctx, 0.048, 0.59, -0.16 + i * 0.22, 1.04, -0.37 + i * 0.22, 1.48 - p * 0.22, -0.22 + i * 0.22);
    },
  },
  carbon: {
    ms: 220,
    paint(ctx, p) {
      const shift = 0.32 * (1 - easeOut(p));
      line(ctx, 0.06, [
        [-1.44 + shift, -0.21],
        [-0.64 + shift, -0.21],
        [-0.22, -0.66],
        [0.4, -0.66],
      ]);
      line(ctx, 0.06, [
        [1.44 - shift, 0.22],
        [0.64 - shift, 0.22],
        [0.22, 0.66],
        [-0.4, 0.66],
      ]);
      ctx.fillRect(-0.08, -0.08, 0.16, 0.16);
    },
  },
  chestnut: {
    ms: 305,
    paint(ctx, p) {
      for (let i = 0; i < 3; i++) {
        const angle = -0.56 - 0.73 * i - 0.88 * easeOut(p);
        const r = 0.79 + p * 0.32 + 0.17 * i;
        ctx.beginPath();
        ctx.ellipse(r * Math.cos(angle), r * Math.sin(angle), 0.17 - 0.024 * i, 0.087, angle - 0.7, 0, TAU);
        ctx.fill();
      }
    },
  },
  whiteNight: {
    ms: 325,
    paint(ctx, p) {
      ctx.beginPath();
      ctx.moveTo(0.98, 0.16);
      ctx.quadraticCurveTo(0.06, -2.11, -1.1, -0.57);
      ctx.quadraticCurveTo(0.02 - p * 0.25, -1.56 + 0.46 * p, 0.98, 0.16);
      ctx.fill();
      dot(ctx, -0.88 - 0.21 * p, -0.96 - 0.09 * p, 0.081);
    },
  },
  ink: {
    ms: 365,
    paint(ctx, p) {
      const tail = 0.22 + 0.8 * easeOut(p);
      ctx.beginPath();
      ctx.moveTo(1.38, 0.56);
      ctx.bezierCurveTo(1.02, -0.95, 0.22, -1.38, -tail, -0.74);
      ctx.bezierCurveTo(0.04, -1.29, 0.68, -0.53, 1.38, 0.56);
      ctx.fill();
      curve(ctx, 0.065, 0.97, -0.57, 0.6, -1.24, -tail + 0.16, -1.13);
    },
  },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{themeId: string, color: string, left: number, right: number, rows: number,
 *   x: number, y: number, direction: -1 | 1, age: number, reduced: boolean}} options
 */
export const drawTSpin = (ctx, { themeId, color, left, right, rows, x, y, direction, age, reduced }) => {
  const { ms, paint } = SPINS[themeId] ?? SPINS.modern;
  if (age < 0 || age >= ms) return;
  const p = age / ms;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 0, right - left, rows);
  ctx.clip();
  ctx.translate(left + x, y);
  ctx.scale(-direction, 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = reduced ? 0.68 : 0.84 * (1 - p) ** 1.28;
  ctx.lineJoin = "round";
  paint(ctx, reduced ? 0.42 : p);
  ctx.restore();
};
