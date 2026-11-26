// 블록에 남는 영역과 그 위에 사라지는 선을 같은 좌표로 계산한다.
/**
 * @typedef {{
 *   shape: "fold" | "split" | "lift" | "sink" | "retract" | "fade" | "shutter",
 *   pace: "even" | "easeOut" | "easeIn",
 *   travel: number,
 *   ink: string,
 *   edge: string,
 *   bands: Array<[offset: number, height: number, opacity: number]>,
 *   groups?: number,
 *   beat?: "alternating" | "paired" | "scatter",
 *   settle?: number,
 *   wash?: boolean,
 *   crossbars?: boolean
 * }} ClearSweep
 * @typedef {{left: number, right: number, top: number, bottom: number}} Rect
 */

const delayFor = (beat, index, count) => {
  if (beat === "alternating") return (index % 2) * 0.29;
  if (beat === "paired") return Math.min(index, count - 1 - index) * (0.28 / Math.max(1, (count - 1) / 2));
  if (beat === "scatter") return ((index * 2) % 3) * 0.14;
  return 0;
};

/** @param {Exclude<ClearSweep["shape"], "shutter">} shape @param {number} p */
const cut = (shape, p) => {
  switch (shape) {
    case "fold":
      return { regions: [[0, 1, p / 2, 1 - p / 2]], edges: [0.5] };
    case "split":
      return {
        regions: [
          [0, 1, 0, (1 - p) / 2],
          [0, 1, (1 + p) / 2, 1],
        ],
        edges: [(1 - p) / 2, (1 + p) / 2],
      };
    case "lift":
      return { regions: [[0, 1, 0, 1 - p]], edges: [1 - p] };
    case "sink":
      return { regions: [[0, 1, p, 1]], edges: [p] };
    case "retract":
      return { regions: [[p / 2, 1 - p / 2, 0, 1]], edges: [0.5] };
    case "fade":
      return { regions: [[0, 1, 0, 1]], edges: [0.5] };
  }
};

/**
 * @param {ClearSweep} sweep
 * @param {number} t
 * @param {number | null} pivot
 * @param {number} cols
 */
export const clearSections = (sweep, t, pivot, cols) => {
  const count = Math.min(cols, sweep.groups ?? 1);
  return Array.from({ length: count }, (_, index) => {
    const left = Math.round((index * cols) / count) / cols;
    const right = Math.round(((index + 1) * cols) / count) / cols;
    const width = right - left;
    const wait =
      pivot !== null && count > 1 ? 0.36 * Math.abs(pivot - (left + right) / 2) : delayFor(sweep.beat, index, count);
    const u = Math.min(1, Math.max(0, (t / sweep.travel - wait) / (1 - wait)));
    const p = sweep.pace === "easeOut" ? 1 - (1 - u) ** 2 : sweep.pace === "easeIn" ? u ** 1.6 : u;
    const shape = sweep.shape === "shutter" ? (index % 2 ? "sink" : "lift") : sweep.shape;
    const { regions, edges } = cut(shape, p);
    /** @type {Rect[]} */
    const visible =
      p >= 1
        ? []
        : regions.map(([x, toX, top, bottom]) => ({
            left: left + x * width,
            right: left + toX * width,
            top,
            bottom,
          }));
    return {
      left,
      right,
      visible,
      edges,
      alpha: sweep.wash ? (1 - p) ** 1.7 : sweep.shape === "fade" ? 1 - p : 1,
      progress: p,
    };
  });
};

/** @param {CanvasRenderingContext2D} ctx @param {ClearSweep} sweep */
export const drawClearSweep = (ctx, sweep, { bx, cell, cols }, middle, t, spinColumn) => {
  const width = cols * cell;
  const rowTop = middle - cell / 2;
  const fade = 1 - t;
  const squeeze = 0.3 + 0.7 * fade;
  const pivot = spinColumn === null ? null : spinColumn / cols;
  const sections = clearSections(sweep, t, pivot, cols);

  for (const { left, right, edges, progress } of sections) {
    if (progress <= 0) continue;
    const gap = sweep.shape === "retract" ? Math.min((right - left) * 0.42, (right - left) * 0.48 * progress) : 0;
    const x = bx + width * (left + gap);
    const w = width * (right - left - 2 * gap);
    for (const edge of edges) {
      const line = edge + (sweep.settle ?? 0) * t;
      for (const [offset, height, opacity] of sweep.bands) {
        const h = Math.max(1, cell * height * squeeze);
        const y = Math.max(rowTop, Math.min(rowTop + cell - h, rowTop + cell * (line + offset * squeeze) - h / 2));
        ctx.fillStyle = progress < 1 && offset === 0 ? sweep.edge : sweep.ink;
        ctx.globalAlpha = (opacity * fade * Math.min(1, progress * 5)) / edges.length ** 0.5;
        ctx.fillRect(x, y, w, h);
      }
    }
    if (sweep.crossbars) {
      const h = cell * 0.46 * squeeze;
      const thickness = Math.max(1, cell * 0.055 * squeeze);
      ctx.fillStyle = sweep.ink;
      ctx.globalAlpha = 0.63 * fade * Math.min(1, progress * 4);
      for (let column = 1; column < cols; column += 2) {
        const x = column / cols;
        if (x > left && x < right) ctx.fillRect(bx + column * cell - thickness / 2, middle - h / 2, thickness, h);
      }
    }
  }
};
