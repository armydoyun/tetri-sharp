// 퍼즐 첫 수 보기(js/modes/puzzle-hint.js): 모든 단계에서 처음부터 길을 찾고, 그 첫 수를 실제로 놓으면 계속 풀 수 있다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../../js/core/engine.js";
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
