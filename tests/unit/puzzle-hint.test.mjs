// 퍼즐 첫 수 보기(js/modes/puzzle-hint.js): 모든 단계에서 처음부터 길을 찾고, 그 첫 수를 실제로 놓으면 계속 풀 수 있다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { WIDTH } from "../../js/core/board.js";
import { PUZZLE_CELLS, customPuzzleMode } from "../../js/modes/custom-puzzle.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { PUZZLES, puzzleMode } from "../../js/modes/puzzles.js";
import { describeSteps, findFirstMove } from "../../js/modes/puzzle-hint.js";

const startOf = p => {
  const game = createGame({ rules: MODERN, mode: puzzleMode(p), seed: 1 });
  for (let i = 0; i < 3 && !game.state.active; i++) game.step();
  return game.state;
};

test("첫 수 보기: 70단계 모두 처음 판에서 첫 수를 찾는다(놓을 칸 4개와 누를 순서)", () => {
  for (const p of PUZZLES) {
    const state = startOf(p);
    const move = findFirstMove(
      p,
      { board: state.board, active: state.active, combo: state.combo ?? -1 },
      p.pieces.slice(1),
      ROTATIONS.srs
    );
    assert.ok(move, `단계 ${p.number}`);
    assert.equal(move.cells.length, 4);
  }
});

test("첫 수 글: 끝에 곧장 내려가는 칸은 하드 드롭, T-spin은 회전 뒤 그대로 두기", () => {
  assert.equal(describeSteps(["R", "R", "D", "D"], false), "오른쪽 2칸, 하드 드롭");
  assert.equal(
    describeSteps(["R", "R", "R", "R", "D", "D", "CCW"], true),
    "오른쪽 4칸, 아래로 2칸, 반시계 회전, 그대로 두기"
  );
  assert.equal(describeSteps(["CW", "CW", "L"], false), "시계 회전 2번, 왼쪽 1칸, 하드 드롭");
  assert.equal(describeSteps([], false), "하드 드롭");
});

/**
 * 첫 수 안내대로 엔진에 누른다: 옆·회전은 한 번씩, 중간의 '아래로'는 소프트 드롭으로 한 칸씩,
 * 끝의 '아래로'는 하드 드롭(안내의 "하드 드롭"), 회전으로 끝나면 그대로 두어 고정(안내의 "그대로 두기").
 * @returns {Array<[number, number]> | null} 실제로 놓인 칸
 */
const followHint = (game, steps) => {
  const BTN_OF = { L: BTN.LEFT, R: BTN.RIGHT, CW: BTN.CW, CCW: BTN.CCW, 180: BTN.R180 };
  let end = steps.length;
  while (end > 0 && steps[end - 1] === "D") end--;
  /** @type {any} */
  let lock = null;
  const run = input => {
    for (const ev of game.step(input)) if (ev.type === "lock") lock = ev;
  };
  for (const step of steps.slice(0, end)) {
    if (step === "D") {
      const y = game.state.active.y;
      for (let i = 0; i < 20 && game.state.active.y === y; i++) run({ held: BTN.SOFT });
    } else {
      run({ pressed: BTN_OF[step], held: BTN_OF[step] });
      run({});
    }
  }
  if (end < steps.length || !steps.length) run({ pressed: BTN.HARD, held: BTN.HARD });
  for (let i = 0; i < 120 && !lock; i++) run({});
  return lock ? lock.cells : null;
};

const sortCells = cells => [...cells].map(([x, y]) => `${x},${y}`).sort();

test("첫 수 안내대로 누르면 안내한 칸에 놓인다(기본 퍼즐 70단계, 위에서 돌리고 옮겨 떨어뜨리는 짧은 길)", () => {
  for (const p of PUZZLES) {
    const game = createGame({ rules: MODERN, mode: puzzleMode(p), seed: 1 });
    for (let i = 0; i < 3 && !game.state.active; i++) game.step();
    const state = game.state;
    const move = findFirstMove(
      p,
      { board: state.board, active: state.active, combo: state.combo ?? -1 },
      p.pieces.slice(1),
      ROTATIONS.srs
    );
    assert.ok(move && "cells" in move, `단계 ${p.number}`);
    assert.deepEqual(
      sortCells(followHint(game, move.steps) ?? []),
      sortCells(move.cells),
      `단계 ${p.number}: ${move.steps.join(" ")}`
    );
  }
});

test("첫 수 안내는 누를 것이 적은 길: 오른쪽 끝 구멍에 I는 '시계 회전, 오른쪽 4칸, 하드 드롭'", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, PUZZLE_CELLS - WIDTH, PUZZLE_CELLS - 1);
  const mode = customPuzzleMode({ cells, pieces: "I", goal: { kind: "lines", lines: 1 } });
  const game = createGame({ rules: mode.rules, mode, seed: 1 });
  for (let i = 0; i < 3 && !game.state.active; i++) game.step();
  const move = findFirstMove(
    mode.puzzle,
    { board: game.state.board, active: game.state.active, combo: -1 },
    [],
    ROTATIONS.srs
  );
  assert.ok(move && "cells" in move);
  assert.equal(describeSteps(move.steps, false), "시계 회전, 오른쪽 4칸, 하드 드롭");
  assert.deepEqual(sortCells(followHint(game, move.steps) ?? []), sortCells(move.cells));
});
