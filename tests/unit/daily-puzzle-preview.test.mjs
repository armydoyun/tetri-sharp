import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePuzzle, solutionTask } from "../../js/modes/custom-puzzle.js";
import { runSolverTask } from "../../js/modes/puzzle-solver.js";
import { FAMILIES, generateDay, generateSample } from "../../js/daily-puzzle-preview/generate.js";

test("시드 퍼즐 견본: 90일의 퍼즐을 날짜로 다시 만들고 본편 풀이기로 검증한다", { timeout: 90_000 }, () => {
  const days = generateSample();
  assert.equal(days.length, 90);
  assert.equal(new Set(days.map(day => day.seed)).size, days.length);
  assert.deepEqual(new Set(days.map(day => day.family)), new Set(Object.keys(FAMILIES)));
  const last = days.at(-1);
  assert.equal(generateDay(last.key).code, last.code);

  for (const day of days) {
    const puzzle = decodePuzzle(day.code);
    assert.ok(puzzle, day.key);
    assert.deepEqual(puzzle.cells, day.cells, day.key);
    assert.equal(puzzle.pieces, day.pieces, day.key);
    assert.ok(day.stats.complete && day.stats.path?.length, day.key);
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
