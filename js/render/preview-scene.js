import { CELL_ID } from "../core/pieces.js";
import srs from "../rules/rotation/srs.js";

export const COLS = 10;
export const ROWS = 9;
/** 시작 판(위에서부터). 숫자는 팔레트 번호. 아래 두 줄은 T 하나로 지워진다 */
const START = [
  "..........",
  "..........",
  "..........",
  "..........",
  "1.........",
  "1.......2.",
  "13.4...772",
  "1334...566",
  "88888.8888",
];
/** 장면: 피스마다 [종류, 회전, 놓일 x, 놓일 y(셀 상자 기준), 위에서 기다리는 y] */
const STEPS = /** @type {const} */ ([
  ["Z", 0, 1, 4, 0],
  ["T", 2, 4, 6, 0],
]);
export const HOLD = "O";
const QUEUE = ["T", "S", "I", "J", "L"];
/** 장면 시간(ms): 피스가 위에서 기다리는 시간, 다음 피스로 넘어가는 시간, 한 바퀴 */
const WAIT_MS = 650;
const STEP_MS = 900;
const LOOP_MS = WAIT_MS + STEP_MS * STEPS.length + 900;
/** 기다리는 동안 한 줄씩 내려오는 간격(중력처럼). 하드 드롭할 거리를 두 줄은 남긴다 */
const ROW_MS = 200;

const fallenRows = (height, elapsed) => Math.max(0, Math.min(height - 2, Math.floor(elapsed / ROW_MS)));

/** 장면을 미리 계산해 둔다: 단계마다 그 전의 판, 떨어지는 피스, 그 뒤 지워진 줄 */
const buildScene = () => {
  let board = START.map(row => [...row].map(ch => (ch === "." ? 0 : Number(ch))));
  return STEPS.map(([type, rot, x, y, fromY], i) => {
    const before = board.map(row => [...row]);
    const cells = srs.cells(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
    const landed = before.map(row => [...row]);
    for (const [cx, cy] of cells) landed[cy][cx] = CELL_ID[type];
    const rows = landed.flatMap((row, i) => (row.every(Boolean) ? [i] : []));
    const kept = landed.filter((_, i) => !rows.includes(i));
    board = [...rows.map(() => Array(COLS).fill(0)), ...kept];
    const dropAt = WAIT_MS + i * STEP_MS;
    const waitFrom = i === 0 ? 0 : dropAt - STEP_MS;
    const dropHeight = y - fromY;
    return {
      dropAt,
      waitFrom,
      dropHeight,
      events: [
        { type: "hardDrop", distance: dropHeight - fallenRows(dropHeight, dropAt - waitFrom), cells },
        { type: "lock", piece: type, cells, lines: rows.length, rows },
      ],
      type,
      before,
      landed,
      cells,
      fromCells: cells.map(([cx, cy]) => [cx, cy - dropHeight]),
      rows,
      after: board,
    };
  });
};
const SCENE = buildScene();

// 세로 I가 우물을 채운 판과 지운 직후의 판. 바닥의 블록은 자리를 유지한다.
const CLEAR_SAMPLES = [1, 2, 3, 4].map(lines => {
  const rows = Array.from({ length: lines }, (_, i) => ROWS - 2 - i);
  const after = Array.from({ length: ROWS }, (_, row) =>
    row === ROWS - 1 ? [1, 1, 3, 3, 0, 0, 7, 7, 2, 2] : Array(COLS).fill(0)
  );
  const landed = after.map((row, y) => (rows.includes(y) ? [2, 2, 3, 3, 1, 4, 4, 5, 6, 7] : row));
  return { rows, after, landed };
});

const spinStep = SCENE[1];
const spinPivot = spinStep.cells.reduce((sum, [x]) => sum + x + 0.5, 0) / spinStep.cells.length / COLS;

export const getClearSample = (lines, spin) => {
  const sample = CLEAR_SAMPLES[lines - 1];
  if (!sample) return null;
  const { rows, after, landed } = spin ? spinStep : sample;
  return {
    rows,
    after,
    landed,
    pivot: spin ? spinPivot : null,
    event: {
      type: "lock",
      lines: rows.length,
      rows,
      tspin: spin ? "full" : "none",
      cells: spin ? spinStep.cells : [],
    },
  };
};

export const getPreviewDrop = (loop, stepIndex) => {
  const { dropAt, events } = SCENE[stepIndex];
  return { time: loop * LOOP_MS + dropAt, events };
};

/**
 * 반복 장면과 줄 삭제 견본을 같은 형태의 그리기 상태로 만든다.
 * @param {number} elapsed
 * @param {ReturnType<typeof getClearSample>} [sample]
 */
export const getPreviewFrame = (elapsed, sample = null) => {
  const loop = Math.floor(elapsed / LOOP_MS);
  const phase = elapsed % LOOP_MS;
  const stepIndex = sample ? SCENE.length : SCENE.filter(step => step.dropAt <= phase).length;
  const active = SCENE[stepIndex];
  const previous = SCENE[stepIndex - 1];
  const piece = active && {
    type: active.type,
    ghost: active.cells,
    cells: active.fromCells,
    down: fallenRows(active.dropHeight, phase - active.waitFrom),
  };
  const clear = sample ?? previous;
  return {
    loop,
    stepIndex,
    piece,
    board: sample?.after ?? active?.before ?? previous.after,
    queue: QUEUE.slice(stepIndex, stepIndex + 3),
    clear,
    clearAge: sample ? elapsed : phase - (previous?.dropAt ?? 0),
    pivot: sample?.pivot ?? null,
  };
};
