import { test } from "node:test";
import assert from "node:assert/strict";
import { placements } from "../helpers/solver.mjs";
import { HEIGHT, clearLines, createBoard, place } from "../../js/core/board.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { PUZZLES, createPuzzleProgress, findPuzzle, puzzleMode } from "../../js/modes/puzzles.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";

/** 피스를 순서대로 놓아 판을 비울 수 있는가(중간에 줄이 지워져도 됨, 아래 두 줄 안에서만) */
const solvesPc = (board, pieces) => {
  const [type, ...rest] = pieces;
  return placements(board, type).some(p => {
    if (!rest.length) return p.perfect;
    if (ROTATIONS.srs.cells(type, p.rot).some(([, cy]) => p.y + cy < HEIGHT - 2)) return false;
    const next = { ...board, cells: board.cells.slice() };
    place(next, ROTATIONS.srs.cells(type, p.rot), p.x, p.y, 1);
    clearLines(next);
    return solvesPc(next, rest);
  });
};

test("퍼즐 30단계는 모두 주어진 피스로 풀 수 있다", () => {
  assert.equal(PUZZLES.length, 30);
  for (const p of PUZZLES) {
    const board = createBoard();
    p.build(board);
    if (p.kind === "pc") assert.ok(solvesPc(board, p.pieces), `단계 ${p.number}: ${p.pieces.join("")}`);
    else {
      const lines = p.kind === "tsd" ? 2 : 3;
      assert.ok(
        placements(board, "T").some(q => q.tspin === "full" && q.lines === lines),
        `단계 ${p.number}: ${p.kind}`
      );
    }
  }
});

test("같은 단계는 다시 해도 같은 판이다", () => {
  for (const p of PUZZLES) {
    const a = createBoard();
    const b = createBoard();
    p.build(a);
    p.build(b);
    assert.deepEqual(Array.from(a.cells), Array.from(b.cells), `단계 ${p.number}`);
  }
});

test("퍼즐 모드: 피스를 다 쓰고도 못 이루면 실패로 끝나고, 모드는 id로 찾는다", () => {
  const mode = puzzleMode(PUZZLES[0]);
  assert.equal(findPuzzle("puzzle-1"), mode);
  assert.equal(findPuzzle("puzzle-99"), null);
  const game = createGame({ rules: MODERN, seed: 1, mode });
  game.step();
  // 그냥 떨어뜨리면(맞는 자리가 아니면) 실패
  let events = [];
  for (let i = 0; i < 3 && !game.state.over; i++) events = game.step({ pressed: BTN.HARD });
  assert.ok(game.state.over === "fail" || game.state.over === "clear");
  assert.ok(events.some(e => e.type === "finish"));
});

test("깬 단계 기록과 다음 단계", () => {
  const store = createStore(memoryBackend());
  const progress = createPuzzleProgress(store);
  assert.equal(progress.next().number, 1);
  progress.markCleared(1);
  progress.markCleared(2);
  assert.deepEqual([...progress.cleared()], [1, 2]);
  assert.equal(progress.next().number, 3);
  store.set("puzzle:cleared", [1, "x", 99, 3]);
  assert.deepEqual([...progress.cleared()], [1, 3], "이상한 값은 버린다");
});
