// 테마 미리보기: 작은 캔버스에 실제 테마 그리기 함수로 보드 한 조각(격자·쌓인 블록·고스트)을 그린다.
// 설정 화면의 테마 카드가 쓴다. 게임 상태 없이 정해진 그림만 그린다.

/** 8열 × 4줄: 숫자는 팔레트 번호(0 = 빈칸) */
const SCENE = ["........", "......6.", "4.....66", "4455.336"];
/** 고스트(떨어질 자리): T 피스 */
const GHOST = [
  [3, 2],
  [4, 2],
  [5, 2],
  [4, 3],
];
const ACTIVE = GHOST.map(([x, y]) => [x, y - 2]);
const COLS = SCENE[0].length;
const ROWS = SCENE.length;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} theme  themes.js의 테마
 * @param {readonly string[]} palette
 */
export const drawThemePreview = (canvas, theme, palette, cssCell = 12) => {
  const dpr = globalThis.devicePixelRatio || 1;
  const cell = Math.round(cssCell * dpr);
  canvas.width = COLS * cell;
  canvas.height = ROWS * cell;
  canvas.style.aspectRatio = `${COLS} / ${ROWS}`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { bg, grid } = theme.board;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, canvas.height);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(canvas.width, y * cell + 0.5);
  }
  ctx.stroke();
  SCENE.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") theme.block(ctx, x * cell, y * cell, cell, palette[Number(ch)]);
    })
  );
  for (const [x, y] of GHOST) theme.ghost(ctx, x * cell, y * cell, cell, palette[6]);
  for (const [x, y] of ACTIVE) theme.block(ctx, x * cell, y * cell, cell, palette[6]);
};
