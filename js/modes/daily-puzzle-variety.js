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

/** 제한된 첫 수 탐색에서 본 판단 부담과 대표 입력의 조작 부담을 따로 평가한다. */
export const rateDailyPuzzle = ({ stats, controls = null }) => {
  const { firstChoices, wins, holdWins, deepestDeadEnd, path } = stats;
  const moves = path.length;
  const wrong = firstChoices - wins;
  const needsHold = holdWins === wins;
  const narrow = wrong >= 2 && wins * 2 <= firstChoices;
  const lateTrap = narrow && deepestDeadEnd >= 3;
  const planning = (moves >= 4 || needsHold) && lateTrap ? 3 : moves >= 3 || needsHold || wrong >= 2 ? 2 : 1;
  const maneuvers = controls?.maxManeuvers ?? 0;
  const spin = path.some(move => move.tspin !== "none");
  const execution = maneuvers >= 3 ? 3 : maneuvers > 0 || spin ? 2 : 1;
  return { level: Math.max(planning, execution), planning, execution };
};
