import { WIDTH } from "../core/board.js";

const mirroredType = { J: "L", L: "J", S: "Z", Z: "S" };

const routeKey = (path, mirror) => {
  const points = path.flatMap(move => move.cells);
  const edge = Math.min(...points.map(([x]) => (mirror ? WIDTH - 1 - x : x)));
  const bottom = Math.max(...points.map(([, y]) => y));
  return path
    .map(move =>
      [
        mirror ? (mirroredType[move.type] ?? move.type) : move.type,
        Number(move.hold),
        move.lines,
        move.tspin,
        move.cells
          .map(([x, y]) => `${(mirror ? WIDTH - 1 - x : x) - edge},${bottom - y}`)
          .sort()
          .join(";"),
      ].join(":")
    )
    .join("/");
};

export const puzzleFingerprint = ({ cells, stats, goal }) => {
  const board = cells.join("");
  const mirror = Array.from({ length: cells.length / WIDTH }, (_, row) =>
    cells
      .slice(row * WIDTH, (row + 1) * WIDTH)
      .reverse()
      .join("")
  ).join("");
  const route = routeKey(stats.path, false);
  const reflectedRoute = routeKey(stats.path, true);
  return {
    board,
    mirror,
    route: `${goal.kind}/${route < reflectedRoute ? route : reflectedRoute}`,
  };
};

const close = (a, b) => {
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++changed > 2) return false;
  }
  return true;
};

export const comparePuzzleFingerprints = (a, b) => ({
  sameBoard: a.board === b.board || a.mirror === b.board,
  nearBoard: close(a.board, b.board) || close(a.mirror, b.board),
  sameRoute: a.route === b.route,
});

/** 표시 난이도는 대표 풀이와 제한된 첫 수 탐색에 따른 추정값이다. */
export const rateDailyPuzzle = ({ family, stats }) => {
  const { firstChoices, wins, holdWins, deepestDeadEnd, path } = stats;
  const moves = path.length;
  const wrong = firstChoices - wins;
  const needsHold = holdWins === wins;
  const needsSpin = path.some(move => move.tspin !== "none");
  const technical = needsHold || needsSpin || family === "tuck";
  const narrow = wrong >= 2 && wins * 2 <= firstChoices;
  const lateTrap = narrow && deepestDeadEnd >= 3;
  if ((moves >= 4 && lateTrap) || (needsSpin && narrow && wrong >= 8) || (needsHold && lateTrap)) return 3;
  if (!technical && moves <= 2 && wrong <= 1) return 1;
  return 2;
};
