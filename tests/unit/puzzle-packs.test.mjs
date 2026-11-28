import test from "node:test";
import assert from "node:assert/strict";
import { decodePack, encodePack, packStageMode } from "../../js/modes/puzzle-pack.js";
import { encodePuzzle, PUZZLE_CELLS } from "../../js/modes/custom-puzzle.js";
import { createPuzzlePacks } from "../../js/storage/puzzle-packs.js";
import { createStore } from "../../js/storage/store.js";
import { createBackup, parseBackup, restoreBackup } from "../../js/storage/backup.js";
import { findMode } from "../../js/modes/index.js";

const board = new Uint8Array(PUZZLE_CELLS);
board[board.length - 1] = 1;
const puzzles = ["I", "O"].map(pieces => encodePuzzle({ cells: board, pieces }));
const makeStore = () => {
  const data = new Map();
  return createStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
};

test("퍼즐 팩 코드는 이름과 순서를 보관하고 잘못된 스테이지를 거부한다", () => {
  const pack = { title: "친구의 퍼즐", puzzles: [...puzzles].reverse() };
  const code = encodePack(pack);
  assert.deepEqual(decodePack(code), pack);
  assert.equal(packStageMode(code, 0).puzzleCode, puzzles[1]);
  assert.equal(packStageMode(code, 2), null);
  assert.equal(decodePack(code + "="), null);
  assert.equal(encodePack({ ...pack, puzzles: [puzzles[0], puzzles[0]] }), null);
  assert.equal(encodePack({ ...pack, puzzles: ["잘못된 코드", puzzles[1]] }), null);
});

test("팩을 다시 열어도 진행도가 유지되고, 백업은 양쪽 완료 단계를 합친다", () => {
  const code = encodePack({ title: "퍼즐 팩", puzzles });
  const first = makeStore();
  const local = createPuzzlePacks(first);
  local.add(code);
  assert.equal(local.markCleared(code, 0), true);
  assert.equal(local.markCleared(code, 7), false);
  assert.deepEqual(local.add(code).cleared, [0]);
  const second = makeStore();
  const received = createPuzzlePacks(second);
  received.add(code);
  received.markCleared(code, 1);
  assert.ok(restoreBackup(second, parseBackup(createBackup(first), findMode)));
  assert.deepEqual(
    received.read().map(entry => entry.cleared.toSorted()),
    [[0, 1]]
  );
});
