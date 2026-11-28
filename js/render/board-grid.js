/**
 * 점 격자 경로: 안쪽 칸 모서리가 만나는 곳마다 작은 네모(선 격자보다 조용하고 종이·도면 느낌)
 * @returns {Path2D}
 */
const gridDots = (bx, by, cols, rows, cell) => {
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
const gridHashes = (bx, by, cols, rows, cell) => {
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

/**
 * 셀 크기가 바뀔 때만 보드 격자의 경로를 만든다.
 * @param {number} bx @param {number} by @param {number} cols @param {number} rows @param {number} cell
 * @returns {(ctx: CanvasRenderingContext2D, theme: {board: {bg: string, grid: string, edge: string}, gridStyle: string}, showGrid: boolean) => void}
 */
export const createBoardGrid = (bx, by, cols, rows, cell) => {
  const width = cols * cell;
  const height = rows * cell;
  const lines = new Path2D();
  for (let x = 1; x < cols; x++) {
    lines.moveTo(bx + x * cell + 0.5, by);
    lines.lineTo(bx + x * cell + 0.5, by + height);
  }
  for (let y = 1; y < rows; y++) {
    lines.moveTo(bx, by + y * cell + 0.5);
    lines.lineTo(bx + width, by + y * cell + 0.5);
  }
  const dots = gridDots(bx, by, cols, rows, cell);
  const hashes = gridHashes(bx, by, cols, rows, cell);

  return (ctx, { board: { bg, grid, edge }, gridStyle }, showGrid) => {
    ctx.fillStyle = bg;
    ctx.fillRect(bx, by, width, height);
    ctx.lineWidth = 1;
    if (showGrid && gridStyle === "dots") {
      ctx.fillStyle = grid;
      ctx.fill(dots);
    } else if (showGrid && gridStyle !== "none") {
      ctx.strokeStyle = grid;
      ctx.stroke(gridStyle === "hash" ? hashes : lines);
    }
    ctx.strokeStyle = edge;
    ctx.strokeRect(bx + 0.5, by + 0.5, width - 1, height - 1);
  };
};
