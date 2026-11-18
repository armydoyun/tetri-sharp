import { test } from "node:test";
import assert from "node:assert/strict";
import { PIECES, PIECE_TYPES, cellsOf } from "../../js/core/pieces.js";

test("7종 모두 회전 상태 4개, 상태마다 4칸", () => {
  assert.equal(PIECE_TYPES.length, 7);
  for (const type of PIECE_TYPES) {
    assert.equal(PIECES[type].states.length, 4, type);
    for (const cells of PIECES[type].states) {
      assert.equal(cells.length, 4, type);
      assert.equal(new Set(cells.map(c => c.join())).size, 4, `${type}: 칸이 겹치지 않는다`);
      for (const [x, y] of cells) assert.ok(x >= 0 && y >= 0 && x < PIECES[type].size && y < PIECES[type].size);
    }
  }
});

test("cellsOf는 회전 값을 4로 감싼다", () => {
  assert.deepEqual(cellsOf("T", 4), cellsOf("T", 0));
  assert.deepEqual(cellsOf("T", -1), cellsOf("T", 3));
});

test("SRS 기본 상태: T는 위로 볼록, I는 1R 상태에서 세 번째 열", () => {
  assert.deepEqual(cellsOf("T", 0), [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ]);
  assert.deepEqual(cellsOf("I", 1), [
    [2, 0],
    [2, 1],
    [2, 2],
    [2, 3],
  ]);
  assert.deepEqual(cellsOf("I", 2), [
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
  ]);
});

test("O는 회전해도 모양이 같다", () => {
  for (let r = 1; r < 4; r++) assert.deepEqual(cellsOf("O", r), cellsOf("O", 0));
});
