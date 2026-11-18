import { test } from "node:test";
import assert from "node:assert/strict";
import { HEIGHT, WIDTH, clearLines, collides, createBoard, get, isEmpty, place, set } from "../../js/core/board.js";
import { cellsOf } from "../../js/core/pieces.js";

const fillRow = (b, y, v = 8) => {
  for (let x = 0; x < b.width; x++) set(b, x, y, v);
};

test("새 보드는 10×40이고 비어 있다", () => {
  const b = createBoard();
  assert.equal(b.width, WIDTH);
  assert.equal(b.height, HEIGHT);
  assert.ok(isEmpty(b));
});

test("벽·바닥·블록과의 충돌", () => {
  const b = createBoard();
  const t = cellsOf("T", 0);
  assert.equal(collides(b, t, 0, 0), false);
  assert.equal(collides(b, t, -1, 0), true, "왼쪽 벽");
  assert.equal(collides(b, t, 8, 0), true, "오른쪽 벽");
  assert.equal(collides(b, t, 0, HEIGHT - 1), true, "바닥");
  set(b, 1, 10, 1);
  assert.equal(collides(b, t, 0, 10), true, "블록");
});

test("꽉 찬 줄만 지우고 위 줄을 내린다", () => {
  const b = createBoard();
  fillRow(b, HEIGHT - 1);
  fillRow(b, HEIGHT - 3);
  set(b, 4, HEIGHT - 2, 6);
  set(b, 2, HEIGHT - 4, 5);
  assert.deepEqual(clearLines(b), [HEIGHT - 3, HEIGHT - 1]);
  assert.equal(get(b, 4, HEIGHT - 1), 6, "가운데 남은 줄이 맨 아래로");
  assert.equal(get(b, 2, HEIGHT - 2), 5, "그 위 줄도 따라 내려온다");
  set(b, 4, HEIGHT - 1, 0);
  set(b, 2, HEIGHT - 2, 0);
  assert.ok(isEmpty(b));
});

test("place는 미노 값을 새긴다", () => {
  const b = createBoard();
  place(b, cellsOf("O", 0), 4, 38, 4);
  assert.equal(get(b, 4, 38), 4);
  assert.equal(get(b, 5, 39), 4);
  assert.equal(clearLines(b).length, 0);
});
