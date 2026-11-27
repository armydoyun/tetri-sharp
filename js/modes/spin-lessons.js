import { HEIGHT, WIDTH, set } from "../core/board.js";
import { cellsOf, GARBAGE } from "../core/pieces.js";
import { openSpinSide } from "../core/spins.js";
import { t } from "../i18n/index.js";
import { MODERN } from "../rules/presets.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { spinBit, spinSettings } from "../rules/spins.js";
import { sameCells } from "./placement-hints.js";
import { describeSteps } from "./puzzle-hint.js";
import { reachable } from "./puzzle-solver.js";

/** @typedef {import("../core/pieces.js").PieceType} Piece */
/** @typedef {import("../core/pieces.js").Cell} Cell */
/** @typedef {{ piece: Piece, mirrorPiece: Piece, rows: string[], target: Cell[], lines: number }} Exercise */

// 마지막 줄은 바닥. 반전에서는 J/L, S/Z가 서로의 모양이 된다.
/** @type {Exercise[]} */
const exercises = [
  {
    piece: "T",
    mirrorPiece: "T",
    rows: ["......#...", "####...###", "#####.####"],
    target: [
      [4, 38],
      [5, 38],
      [6, 38],
      [5, 39],
    ],
    lines: 2,
  },
  {
    piece: "I",
    mirrorPiece: "I",
    rows: ["....#..#..", "....#..#..", "##....####"],
    target: [
      [2, 39],
      [3, 39],
      [4, 39],
      [5, 39],
    ],
    lines: 1,
  },
  {
    piece: "J",
    mirrorPiece: "L",
    rows: ["......#...", "#####...##"],
    target: [
      [5, 38],
      [5, 39],
      [6, 39],
      [7, 39],
    ],
    lines: 1,
  },
  {
    piece: "S",
    mirrorPiece: "Z",
    rows: ["....#.....", "...#......", "..........", "###.######"],
    target: [
      [2, 37],
      [2, 38],
      [3, 38],
      [3, 39],
    ],
    lines: 1,
  },
  {
    piece: "O",
    mirrorPiece: "O",
    rows: [".....#....", "..........", "####..####"],
    target: [
      [4, 38],
      [5, 38],
      [4, 39],
      [5, 39],
    ],
    lines: 1,
  },
];

const hasSpin = (piece, event) => (piece === "T" ? event.tspin === "full" : event.spinPiece === piece);

/** 고정 전 빈칸과 실제 마지막 동작을 기준으로 실패 이유를 찾는다. */
const explainMiss = (board, active, spin) => {
  if (active.lastAction !== "rotate") {
    if (active.turn && active.lastAction === "move") return t("회전 뒤에 옆으로 움직였어요.");
    if (active.turn && active.lastAction === "drop") return t("회전 뒤에 피스가 더 내려갔어요.");
    return t("피스를 놓기 직전에 회전하세요.");
  }
  if (active.type === "T")
    return spin.tspin === "mini"
      ? t("Mini예요. T가 향한 쪽의 모서리 두 칸도 막혀야 해요.")
      : t("T의 모서리 세 칸이 막혀야 해요.");
  if (!active.spinMoved)
    return active.type === "O"
      ? t("O가 제자리에서 돌았어요. 대각선 아래의 틈에 넣으세요.")
      : t("회전해도 피스가 차지한 칸이 같았어요.");
  const side = openSpinSide(board, cellsOf(active.type, active.rot), active.x, active.y);
  return (
    {
      left: t("왼쪽이 열려 있어요."),
      right: t("오른쪽이 열려 있어요."),
      up: t("위쪽이 열려 있어요."),
      down: t("아래쪽이 열려 있어요."),
    }[side] ?? t("힌트로 피스가 들어갈 자리를 확인하세요.")
  );
};

/** @param {Exercise} exercise */
const makeLesson = (exercise, mirrored, index) => {
  const piece = mirrored ? exercise.mirrorPiece : exercise.piece;
  const spins = spinBit(piece);
  const turn = piece === "O" ? (mirrored ? -1 : 1) : null;
  const id = `spin-lesson-${index + 1}`;
  const name = turn
    ? mirrored
      ? t("O스핀 · 왼쪽")
      : t("O스핀 · 오른쪽")
    : mirrored && exercise.piece === piece
      ? t("{piece}스핀 · 좌우 반전", { piece })
      : t("{piece}스핀", { piece });
  const description = turn
    ? mirrored
      ? t("O를 반시계로 돌려 왼쪽 아래 틈에 넣으세요.")
      : t("O를 시계로 돌려 오른쪽 아래 틈에 넣으세요.")
    : t("{piece}를 돌려 넣어 스핀으로 {n}줄을 지우세요.", { piece, n: exercise.lines });
  const flip = x => (mirrored ? WIDTH - 1 - x : x);
  const target = exercise.target.map(([x, y]) => /** @type {Cell} */ ([flip(x), y]));
  const rules = Object.freeze({
    ...MODERN,
    ...spinSettings(spins),
    hold: { enabled: false },
    irs: false,
    lock: { ...MODERN.lock, delay: 90 },
  });
  return Object.freeze({
    id,
    name,
    description,
    rules,
    spinLesson: index + 1,
    practice: true,
    noReplay: true,
    sequence: [piece],
    hud: ["lines"],
    setup: state => {
      state.spinLesson = { hintLevel: 0, hintCells: [], usedHint: false, result: null, reason: "" };
      exercise.rows.forEach((row, i) => {
        for (let x = 0; x < WIDTH; x++)
          if (row[x] === "#") set(state.board, flip(x), HEIGHT - exercise.rows.length + i, GARBAGE);
      });
    },
    gravityFor: () => 0,
    beforeLock: (state, active, spin) => {
      if (!hasSpin(piece, spin)) state.spinLesson.reason = explainMiss(state.board, active, spin);
      else if (turn && active.turn !== turn) state.spinLesson.reason = t("반대 방향으로 돌려 넣어 보세요.");
    },
    onLock: (state, event) => {
      const lesson = state.spinLesson;
      if (!lesson.reason && event.lines !== exercise.lines)
        lesson.reason = t("스핀이에요. 이번 단계에서는 {n}줄을 함께 지우세요.", { n: exercise.lines });
      lesson.result = lesson.reason ? "fail" : "clear";
      lesson.hintCells = [];
    },
    check: state => (state.spinLesson.result ? { result: state.spinLesson.result } : null),
    hint: state => {
      const lesson = state.spinLesson;
      lesson.hintLevel = lesson.hintLevel ? 0 : 2;
      lesson.hintCells = [];
      if (!lesson.hintLevel || !state.active) return "";
      lesson.usedHint = true;
      const { placements, pathTo } = reachable(state.board, ROTATIONS.srs, piece, [state.active], {
        spins,
        withPath: true,
        softToFloor: true,
      });
      const paths = placements
        .filter(
          p =>
            hasSpin(piece, p) &&
            sameCells(
              target,
              cellsOf(piece, p.rot).map(([x, y]) => [x + p.x, y + p.y])
            )
        )
        .map(pathTo)
        .sort((a, b) => a.length - b.length);
      if (!paths.length) return t("이 위치에선 안내 경로를 찾지 못했어요. 다시 시작해 보세요.");
      lesson.hintCells = target;
      return describeSteps(paths[0], true, true);
    },
    hudLines: state => ({ label: t("지운 줄"), value: `${state.stats.lines} / ${exercise.lines}` }),
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    isRecordable: () => false,
    formatRecord: () => "",
    summary: state => ({
      main: `${piece}-SPIN`,
      title: state.over === "clear" ? t("성공!") : t("실패"),
      note:
        state.over === "clear"
          ? state.spinLesson.usedHint
            ? t("힌트와 함께 완료")
            : t("힌트 없이 완료")
          : state.spinLesson.reason || t("이 위치에선 안내 경로를 찾지 못했어요. 다시 시작해 보세요."),
    }),
  });
};

export const SPIN_LESSONS = Object.freeze(
  exercises.flatMap((exercise, index) => [
    makeLesson(exercise, false, index * 2),
    makeLesson(exercise, true, index * 2 + 1),
  ])
);
