// 지워진 줄 높이를 1로 둔 작은 선 그림. 색과 투명도는 보드 렌더러가 정한다.
/** @typedef {(ctx: CanvasRenderingContext2D) => void} ClearMark */

/** @param {number[][][]} paths @returns {ClearMark} */
const lines =
  (...paths) =>
  ctx => {
    for (const [[x, y], ...rest] of paths) {
      ctx.moveTo(x, y);
      for (const [dx, dy] of rest) ctx.lineTo(dx, dy);
    }
  };

/** @type {Record<string, ClearMark>} */
export const CLEAR_MARKS = Object.freeze({
  porcelain: lines([
    [-0.32, 0],
    [0, -0.29],
    [0.32, 0],
    [0, 0.29],
    [-0.32, 0],
  ]),
  relay: lines(
    [
      [-0.4, 0.12],
      [-0.19, 0.12],
      [0.09, -0.23],
    ],
    [
      [0.16, 0.12],
      [0.4, 0.12],
    ]
  ),
  tide: ctx => {
    ctx.moveTo(-0.42, 0.06);
    ctx.quadraticCurveTo(-0.19, -0.29, 0, 0);
    ctx.quadraticCurveTo(0.19, 0.29, 0.42, -0.06);
  },
  velvet: lines(
    [
      [-0.35, -0.14],
      [0.35, -0.14],
    ],
    [
      [-0.22, 0.12],
      [0.22, 0.12],
    ]
  ),
  press: lines(
    [
      [-0.34, -0.27],
      [-0.34, 0.17],
      [0.34, 0.17],
      [0.34, -0.27],
    ],
    [
      [-0.16, -0.01],
      [0.16, -0.01],
    ]
  ),
  film: lines(
    [
      [-0.43, -0.18],
      [-0.1, -0.18],
      [-0.1, 0.18],
      [-0.43, 0.18],
      [-0.43, -0.18],
    ],
    [
      [0.1, -0.18],
      [0.43, -0.18],
      [0.43, 0.18],
      [0.1, 0.18],
      [0.1, -0.18],
    ]
  ),
  post: lines([
    [-0.38, -0.24],
    [0.38, -0.24],
    [0.38, 0.24],
    [-0.38, 0.24],
    [-0.38, -0.24],
    [0, 0.04],
    [0.38, -0.24],
  ]),
  carbon: lines(
    [
      [-0.36, 0.21],
      [-0.07, -0.21],
    ],
    [
      [-0.02, 0.21],
      [0.27, -0.21],
    ]
  ),
  chestnut: ctx => {
    ctx.moveTo(-0.32, 0.08);
    ctx.quadraticCurveTo(-0.04, -0.46, 0.34, -0.07);
    ctx.quadraticCurveTo(0.08, 0.41, -0.32, 0.08);
  },
  whiteNight: ctx => {
    ctx.moveTo(0.25, -0.28);
    ctx.quadraticCurveTo(-0.43, -0.21, -0.25, 0.16);
    ctx.quadraticCurveTo(-0.07, 0.4, 0.3, 0.19);
  },
  ink: lines(
    [
      [-0.4, 0.14],
      [-0.11, 0.03],
      [0.16, -0.03],
      [0.38, -0.2],
    ],
    [
      [-0.35, 0.25],
      [-0.15, 0.17],
    ]
  ),
});
