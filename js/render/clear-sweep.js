// 줄 안에서 움직이는 선과 지나간 범위를 같은 좌표로 계산한다.
/**
 * @typedef {{
 *   from: "left" | "right" | "middle" | "edges",
 *   pace: "even" | "easeOut" | "easeIn",
 *   travel: number,
 *   ink: string,
 *   edge: string,
 *   bands: Array<[offset: number, height: number, opacity: number]>,
 *   tip: number,
 *   settle?: number,
 *   crossbars?: boolean
 * }} ClearSweep
 */

/**
 * @param {ClearSweep} sweep @param {number} t @param {number | null} pivot
 * @returns {Array<[left: number, right: number]>} 행 너비를 1로 본 지워진 구간
 */
export const clearedSpans = ({ from, pace, travel }, t, pivot) => {
  const u = Math.min(1, Math.max(0, t / travel));
  if (u >= 1) return [[0, 1]];
  if (u === 0) return [];
  const p = pace === "easeOut" ? 1 - (1 - u) ** 2 : pace === "easeIn" ? u ** 1.6 : u;
  if (pivot !== null || from === "middle") {
    const center = pivot ?? 0.5;
    return [[center * (1 - p), center + (1 - center) * p]];
  }
  if (from === "edges")
    return [
      [0, p / 2],
      [1 - p / 2, 1],
    ];
  return from === "left" ? [[0, p]] : [[1 - p, 1]];
};

/** @param {CanvasRenderingContext2D} ctx @param {ClearSweep} sweep */
export const drawClearSweep = (ctx, sweep, { bx, cell, cols }, middle, t, spinColumn) => {
  const width = cols * cell;
  const spans = clearedSpans(sweep, t, spinColumn === null ? null : spinColumn / cols);
  const fade = 1 - t;
  const squeeze = 0.35 + 0.65 * fade;
  middle += cell * (sweep.settle ?? 0) * t;
  ctx.fillStyle = sweep.ink;
  for (const [left, right] of spans) {
    for (const [offset, height, opacity] of sweep.bands) {
      const h = Math.max(1, cell * height * squeeze);
      ctx.globalAlpha = opacity * fade;
      ctx.fillRect(bx + width * left, middle + cell * offset * squeeze - h / 2, width * (right - left), h);
    }
    if (sweep.crossbars) {
      const height = cell * 0.48 * squeeze;
      const thickness = Math.max(1, cell * 0.055 * squeeze);
      ctx.globalAlpha = 0.66 * fade;
      for (let column = 1; column < cols; column += 2) {
        const x = column / cols;
        if (x > left && x < right)
          ctx.fillRect(bx + column * cell - thickness / 2, middle - height / 2, thickness, height);
      }
    }
  }
  if (t >= sweep.travel) return;

  // 진행하는 끝만 조금 진하게 해 선 뒤로 블록이 사라지는 위치를 보여 준다.
  ctx.fillStyle = sweep.edge;
  ctx.globalAlpha = 0.88 * fade;
  const h = Math.max(1, cell * sweep.bands[0][1] * squeeze);
  for (const [left, right] of spans) {
    const length = Math.min((right - left) / 2, (sweep.tip * cell) / width);
    if (left > 0) ctx.fillRect(bx + width * left, middle - h / 2, width * length, h);
    if (right < 1) ctx.fillRect(bx + width * (right - length), middle - h / 2, width * length, h);
  }
};
