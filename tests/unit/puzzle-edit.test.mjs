// 퍼즐 만들기 편집 동작(js/modes/puzzle-edit.js): 칠하기 도구, 밀기·뒤집기, 피스 순서, 되돌리기, 시작 틀
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTH } from "../../js/core/board.js";
import { createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import {
  COPYABLE_STAGES,
  applyTool,
  createHistory,
  fitHeight,
  insertPiece,
  mirrorCells,
  movePiece,
  removePiece,
  shiftCells,
  strokeValue,
  template,
  usedHeight,
} from "../../js/modes/puzzle-edit.js";
import {
  MAX_PUZZLE_PIECES,
  PUZZLE_CELLS,
  customPuzzleMode,
  decodePuzzle,
  encodePuzzle,
} from "../../js/modes/custom-puzzle.js";
import { findFirstMove } from "../../js/modes/puzzle-hint.js";

const BOTTOM = PUZZLE_CELLS - WIDTH;
const row = (cells, r) => [...cells.subarray(r * WIDTH, (r + 1) * WIDTH)].join("");

test("칠하기: 칸 하나, 줄 전체, 누른 열만 빈 쓰레기 줄", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  assert.equal(applyTool(cells, "cell", BOTTOM + 3, 1), true);
  assert.equal(applyTool(cells, "cell", BOTTOM + 3, 1), false, "같은 값이면 바뀌지 않는다");
  assert.equal(row(cells, 19), "0001000000");
  applyTool(cells, "row", BOTTOM + 7, 1);
  assert.equal(row(cells, 19), "1111111111");
  applyTool(cells, "garbage", BOTTOM - WIDTH + 4, 1);
  assert.equal(row(cells, 18), "1111011111");
  applyTool(cells, "garbage", BOTTOM - WIDTH + 4, 0);
  assert.equal(row(cells, 18), "0000000000", "지우는 획은 줄을 비운다");
});

test("칠할 값: 시작 칸(줄 도구는 그 줄)이 이미 그 모양이면 지우고, 아니면 채운다", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  assert.equal(strokeValue(cells, "cell", BOTTOM), 1);
  cells[BOTTOM] = 1;
  assert.equal(strokeValue(cells, "cell", BOTTOM), 0);
  assert.equal(strokeValue(cells, "row", BOTTOM), 1, "줄이 다 차지 않았으면 채운다");
  applyTool(cells, "garbage", BOTTOM + 2, 1);
  assert.equal(strokeValue(cells, "garbage", BOTTOM + 2), 0, "같은 열에 구멍이 있는 줄은 지운다");
  assert.equal(strokeValue(cells, "garbage", BOTTOM + 5), 1, "다른 열을 누르면 구멍을 옮긴다");
});

test("밀기: 밖으로 나간 칸은 사라지고 들어온 자리는 빈다. 좌우 뒤집기는 두 번이면 그대로", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells[BOTTOM] = 1;
  cells[BOTTOM + 9] = 1;
  const right = shiftCells(cells, 1, 0);
  assert.equal(row(right, 19), "0100000000");
  const up = shiftCells(cells, 0, -1);
  assert.equal(row(up, 18), "1000000001");
  assert.equal(row(up, 19), "0000000000");
  assert.equal(shiftCells(cells, 0, 1).some(Boolean), false, "바닥 밖으로 밀면 사라진다");
  cells[BOTTOM + 1] = 1;
  const mirrored = mirrorCells(cells);
  assert.equal(row(mirrored, 19), "1000000011");
  assert.deepEqual(mirrorCells(mirrored), cells);
});

test("높이: 블록이 있는 가장 높은 줄까지, 그것이 다 보이는 가장 낮은 편집 높이", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  assert.equal(usedHeight(cells), 0);
  assert.equal(fitHeight(cells), 8);
  cells[BOTTOM - 8 * WIDTH] = 1;
  assert.equal(usedHeight(cells), 9);
  assert.equal(fitHeight(cells), 12);
  cells[0] = 1;
  assert.equal(fitHeight(cells), 20);
});

test("피스 순서: 고른 자리 뒤에 넣기, 빼기, 옮기기, 안전선", () => {
  assert.deepEqual(insertPiece("TI", null, "O"), { pieces: "TIO", at: 2 });
  assert.deepEqual(insertPiece("TI", 0, "O"), { pieces: "TOI", at: 1 });
  assert.deepEqual(removePiece("TOI", null), { pieces: "TO", at: null }, "고른 것이 없으면 마지막");
  assert.deepEqual(removePiece("TOI", 2), { pieces: "TO", at: 1 }, "끝을 빼면 하나 앞을 고른다");
  assert.deepEqual(removePiece("T", 0), { pieces: "", at: null });
  assert.deepEqual(movePiece("TOI", 0, 1), { pieces: "OTI", at: 1 });
  assert.deepEqual(movePiece("TOI", 0, -1), { pieces: "TOI", at: 0 }, "맨 앞은 더 앞으로 못 간다");
  const full = "I".repeat(MAX_PUZZLE_PIECES);
  assert.equal(insertPiece(full, null, "T").pieces, full);
});

test("피스 50개 퍼즐도 링크로 오가고, 51개는 거절한다", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells[BOTTOM] = 1;
  const pieces = "IJLOSTZ".repeat(8).slice(0, MAX_PUZZLE_PIECES);
  const code = encodePuzzle({ cells, pieces });
  assert.ok(code);
  assert.equal(decodePuzzle(code)?.pieces, pieces);
  assert.equal(encodePuzzle({ cells, pieces: `${pieces}I` }), null);
  assert.equal(decodePuzzle(`${code}I`), null);
});

test("되돌리기: 기록한 모습으로 돌아가고, 새로 바꾸면 다시 하기는 사라진다", () => {
  const history = createHistory(3);
  assert.equal(history.undo("a"), null);
  history.record("a");
  history.record("b");
  assert.equal(history.undo("c"), "b");
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo("b"), "c");
  assert.equal(history.undo("c"), "b");
  history.record("b2");
  assert.equal(history.canRedo(), false);
  for (const s of ["x", "y", "z", "w"]) history.record(s);
  let n = 0;
  while (history.undo("now")) n++;
  assert.equal(n, 3, "한도만큼만 남긴다");
});

test("시작 틀: 모두 링크로 만들 수 있고, 피스가 있는 틀은 풀 수 있다", () => {
  assert.equal(template("nope"), null);
  assert.equal(template("empty")?.cells.some(Boolean), false);
  assert.ok(COPYABLE_STAGES.length > 10);
  const ids = ["t-slot", "well", ...COPYABLE_STAGES.map(p => `stage-${p.number}`)];
  for (const id of ids) {
    const start = template(id);
    assert.ok(start, id);
    const code = encodePuzzle(start);
    assert.ok(code, id);
    const mode = customPuzzleMode(start);
    const game = createGame({ rules: mode.rules, mode, seed: 1 });
    for (let i = 0; i < 3 && !game.state.active; i++) game.step();
    const move = findFirstMove(
      mode.puzzle,
      { board: game.state.board, active: game.state.active, combo: -1 },
      [...start.pieces].slice(1),
      ROTATIONS[MODERN.rotation]
    );
    assert.ok(move && "cells" in move, `${id}는 풀 수 있다`);
  }
});

test("첫 수 보기: 다 찾아보지 못하면 풀 수 없다고 하지 않는다", () => {
  // 왼쪽 네 열이 빈 높이 10의 판을 피스 10개로: 탐색 예산 안에 끝나지 않는다(몇 초 걸린다)
  const cells = new Uint8Array(PUZZLE_CELLS);
  for (let r = 10; r < 20; r++) for (let c = 4; c < WIDTH; c++) cells[r * WIDTH + c] = 1;
  const start = { cells, pieces: "TSZOJLITSZ" };
  const mode = customPuzzleMode(start);
  const game = createGame({ rules: mode.rules, mode, seed: 1 });
  for (let i = 0; i < 3 && !game.state.active; i++) game.step();
  const move = findFirstMove(
    mode.puzzle,
    { board: game.state.board, active: game.state.active, combo: -1 },
    [...start.pieces].slice(1),
    ROTATIONS[MODERN.rotation]
  );
  assert.deepEqual(move, { exhausted: true });
});
