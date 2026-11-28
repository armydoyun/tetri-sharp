// 블록에 남는 영역과 그 위에 사라지는 선을 같은 좌표로 계산한다.
/**
 * @typedef {{
 *   shape: "fold" | "split" | "lift" | "sink" | "retract" | "fade" | "shutter" | "sweep" | "chip" | "slide" | "stamp",
 *   from?: "left" | "right" | "center" | "ends",
 *   trace?: "wave" | "crack" | "perforation" | "brush" | "contact",
 *   slide?: -1 | 1,
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

// 지워진 구간은 효과 선과 블록을 같은 경계에서 끊는 데 쓴다.
const sweepCut = (from, p, pivot) => {
  const center = pivot ?? 0.5;
  const a = center * (1 - p);
  const b = center + (1 - center) * p;
  if (p >= 1) return { regions: [], trail: [[0, 1]], edges: [0.5] };
  if (pivot !== null || from === "center")
    return {
      regions: [
        [0, a, 0, 1],
        [b, 1, 0, 1],
      ],
      trail: [[a, b]],
      edges: [0.5],
    };
  if (from === "ends")
    return {
      regions: [[p / 2, 1 - p / 2, 0, 1]],
      trail: [
        [0, p / 2],
        [1 - p / 2, 1],
      ],
      edges: [0.5],
    };
  if (from === "right") return { regions: [[0, 1 - p, 0, 1]], trail: [[1 - p, 1]], edges: [0.5] };
  return { regions: [[p, 1, 0, 1]], trail: [[0, p]], edges: [0.5] };
};

/** @param {Exclude<ClearSweep["shape"], "shutter" | "sweep">} shape @param {number} p */
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
    case "chip":
      return { regions: [[p / 2, 1 - p / 2, p / 2, 1 - p / 2]], edges: [0.5] };
    case "slide":
    case "stamp":
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
    const { regions, edges, trail } =
      shape === "sweep" ? sweepCut(sweep.from, p, pivot) : { ...cut(shape, p), trail: null };
    const sx = shape === "chip" || shape === "retract" ? 1 - p : 1;
    const sy = shape === "chip" || shape === "fold" ? 1 - p : 1;
    const dy = shape === "slide" ? (sweep.slide ?? -1) * p : 0;
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
      trail,
      sx,
      sy,
      dy,
      alpha: sweep.wash
        ? (1 - p) ** 1.7
        : shape === "stamp"
          ? 1 - Math.min(1, Math.max(0, (p - 0.42) / 0.16))
          : shape === "fade" || shape === "slide"
            ? 1 - p
            : 1,
      progress: p,
    };
  });
};

/** 삭제 중인 한 줄의 블록을 견본과 게임에서 같은 영역·이동·투명도로 그린다. */
export const drawClearCells = (ctx, { bx, cols, cell, toY }, y, sections, row, drawBlock) => {
  const rowWidth = cols * cell;
  const top = toY(y);
  for (const { visible, alpha, left, right, sx, sy, dy } of sections) {
    if (!visible.length || alpha <= 0) continue;
    const region = new Path2D();
    for (const rect of visible)
      region.rect(
        bx + rect.left * rowWidth,
        top + rect.top * cell,
        (rect.right - rect.left) * rowWidth,
        (rect.bottom - rect.top) * cell
      );
    ctx.save();
    ctx.clip(region);
    ctx.globalAlpha = alpha;
    if (sx !== 1 || sy !== 1 || dy !== 0) {
      const centerX = bx + ((left + right) / 2) * rowWidth;
      const centerY = top + cell / 2;
      ctx.translate(centerX, centerY + dy * cell);
      ctx.scale(sx, sy);
      ctx.translate(-centerX, -centerY);
    }
    for (let x = Math.round(left * cols); x < Math.round(right * cols); x++) {
      if (row[x]) drawBlock(bx + x * cell, top, cell, row[x]);
    }
    ctx.restore();
  }
};

// 재질을 암시하는 작은 선만 남긴다. 모든 경로는 행 높이 안에 있다.
const texture = (ctx, style, x, w, y, cell, p, fade) => {
  if (!style || w <= 0) return;
  ctx.globalAlpha = 0.53 * fade * Math.min(1, p * 5);
  if (style === "contact") {
    const dot = Math.min(w * 0.32, cell * 0.16);
    ctx.fillRect(x + (w - dot) / 2, y - dot / 2, dot, dot);
    return;
  }
  if (style === "perforation") {
    const length = Math.min(w * 0.15, cell * 0.15);
    for (const at of [0.24, 0.76]) {
      ctx.fillRect(x + w * at, y - cell * 0.29, length, cell * 0.07);
      ctx.fillRect(x + w * at, y + cell * 0.22, length, cell * 0.07);
    }
    return;
  }
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1, cell * 0.045);
  ctx.beginPath();
  if (style === "wave") {
    const a = cell * (0.09 + 0.12 * fade);
    ctx.moveTo(x, y + a * 0.4);
    ctx.quadraticCurveTo(x + w * 0.23, y - a, x + w * 0.52, y);
    ctx.quadraticCurveTo(x + w * 0.79, y + a, x + w, y - a * 0.35);
  } else if (style === "crack") {
    ctx.moveTo(x, y + cell * 0.08);
    ctx.lineTo(x + w * 0.38, y - cell * 0.13);
    ctx.lineTo(x + w * 0.48, y + cell * 0.13);
    ctx.lineTo(x + w, y - cell * 0.08);
  } else {
    ctx.moveTo(x, y + cell * 0.14);
    ctx.quadraticCurveTo(x + w * 0.5, y + cell * 0.08, x + w * 0.96, y - cell * 0.19);
  }
  ctx.stroke();
};

/** @param {CanvasRenderingContext2D} ctx @param {ClearSweep} sweep */
export const drawClearSweep = (ctx, sweep, { bx, cell, cols }, middle, t, spinColumn) => {
  const width = cols * cell;
  const rowTop = middle - cell / 2;
  const fade = 1 - t;
  const squeeze = 0.3 + 0.7 * fade;
  const pivot = spinColumn === null ? null : spinColumn / cols;
  const sections = clearSections(sweep, t, pivot, cols);

  for (const { left, right, edges, progress, trail } of sections) {
    if (progress <= 0) continue;
    const gap = sweep.shape === "retract" ? Math.min((right - left) * 0.42, (right - left) * 0.48 * progress) : 0;
    for (const [a, b] of trail ?? [[left + gap, right - gap]]) {
      const x = bx + width * a;
      const w = width * (b - a);
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
      ctx.fillStyle = sweep.edge;
      texture(ctx, sweep.trace, x, w, middle, cell, progress, fade);
    }
    if (sweep.crossbars) {
      const h = cell * 0.46 * squeeze;
      const thickness = Math.max(1, cell * 0.055 * squeeze);
      ctx.fillStyle = sweep.ink;
      ctx.globalAlpha = 0.63 * fade * Math.min(1, progress * 4);
      for (let column = 1; column < cols; column += 2) {
        const x = column / cols;
        if ((trail ?? [[left, right]]).some(([a, b]) => x > a && x < b))
          ctx.fillRect(bx + column * cell - thickness / 2, middle - h / 2, thickness, h);
      }
    }
  }
};
