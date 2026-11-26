import { replayPuzzleInputs } from "../../tools/audit-daily-puzzles.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTH } from "../../js/core/board.js";
import { decodePuzzle, solutionTask } from "../../js/modes/custom-puzzle.js";
import { runSolverTask } from "../../js/modes/puzzle-solver.js";
import { generateDay, generateSample } from "../../js/modes/daily-puzzle-generation.js";
import { comparePuzzleFingerprints, puzzleFingerprint, rateDailyPuzzle } from "../../js/modes/daily-puzzle-variety.js";
import { DAILY_PUZZLE_FAMILIES } from "../../js/modes/daily-puzzle.js";

test("시드 퍼즐 견본: 90일의 퍼즐을 날짜로 다시 만들고 본편 풀이기로 검증한다", { timeout: 90_000 }, () => {
  const days = generateSample();
  assert.equal(days.length, 90);
  assert.equal(new Set(days.map(day => day.seed)).size, days.length);
  assert.deepEqual(new Set(days.map(day => day.family)), new Set(Object.keys(DAILY_PUZZLE_FAMILIES)));
  assert.ok(days.some(day => day.family === "tuck" && day.stats.path.length === 2));
  const combos = days.filter(day => day.family === "combo");
  assert.ok(new Set(combos.map(day => day.level)).size > 1, "같은 유형에서도 실제 풀이에 따라 난이도가 달라진다");
  const fingerprints = days.map(puzzleFingerprint);
  const counts = { sameBoard: 0, nearBoard: 0, sameRoute: 0 };
  for (const [index, fingerprint] of fingerprints.entries()) {
    const previous = fingerprints.slice(0, index).map((older, i) => ({
      sameFamily: days[index].family === days[i].family,
      ...comparePuzzleFingerprints(fingerprint, older),
    }));
    const repeated = previous.some(match => match.sameBoard);
    if (repeated) counts.sameBoard++;
    else if (previous.some(match => match.sameFamily && match.nearBoard)) counts.nearBoard++;
    if (previous.some(match => match.sameRoute)) counts.sameRoute++;
  }
  assert.ok(counts.sameBoard < 7);
  assert.ok(counts.nearBoard < 11);
  assert.ok(counts.sameRoute < 16);
  const last = days.at(-1);
  assert.deepEqual(generateDay(last.key), last);

  for (const day of days) {
    const puzzle = decodePuzzle(day.code);
    assert.ok(puzzle, day.key);
    assert.deepEqual(puzzle.cells, day.cells, day.key);
    assert.equal(puzzle.pieces, day.pieces, day.key);
    assert.ok(day.stats.complete && day.stats.path?.length, day.key);
    assert.ok(replayPuzzleInputs(day), day.key);
    const solved = runSolverTask(solutionTask(puzzle));
    assert.ok(solved && "moves" in solved, day.key);
    if (day.family === "hold") assert.equal(day.stats.wins, day.stats.holdWins, day.key);
    if (day.family === "trap") assert.ok(day.stats.deepestDeadEnd >= 3, day.key);
  }
});

test("견본 기간 이후 날짜도 같은 시드로 재생성한다", () => {
  const day = generateDay("2030-02-04");
  assert.ok(day.stats.path?.length);
  assert.equal(generateDay(day.key).code, day.code);
});

test("대표 풀이의 위치만 옮기거나 좌우로 반전한 경우를 같은 풀이로 본다", () => {
  const day = generateDay("2026-11-26");
  assert.deepEqual(rateDailyPuzzle({ stats: day.stats, controls: { maxManeuvers: 3 } }), {
    level: 3,
    planning: 1,
    execution: 3,
  });
  const mirrored = {
    ...day,
    cells: Uint8Array.from(day.cells, (_, i) => day.cells[i - (i % WIDTH) + WIDTH - 1 - (i % WIDTH)]),
    stats: {
      ...day.stats,
      path: day.stats.path.map(move => ({
        ...move,
        type: "L",
        cells: move.cells.map(([x, y]) => [WIDTH - 1 - x, y]),
      })),
    },
  };
  assert.deepEqual(comparePuzzleFingerprints(puzzleFingerprint(day), puzzleFingerprint(mirrored)), {
    sameBoard: true,
    nearBoard: true,
    sameRoute: true,
  });
  const shifted = {
    ...day,
    stats: {
      ...day.stats,
      path: day.stats.path.map(move => ({ ...move, cells: move.cells.map(([x, y]) => [x + 2, y]) })),
    },
  };
  assert.equal(puzzleFingerprint(shifted).route, puzzleFingerprint(day).route);
  const easy = { ...day, stats: { ...day.stats, firstChoices: 1, wins: 1, deepestDeadEnd: 0 } };
  assert.equal(rateDailyPuzzle(easy).level, 1);
  assert.equal(
    rateDailyPuzzle({
      ...easy,
      stats: { ...easy.stats, path: Array(4).fill(easy.stats.path[0]), firstChoices: 6, deepestDeadEnd: 3 },
    }).level,
    3
  );
});
