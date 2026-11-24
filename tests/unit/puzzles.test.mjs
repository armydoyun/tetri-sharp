import { test } from "node:test";
import assert from "node:assert/strict";
import { placements } from "../helpers/solver.mjs";
import { HEIGHT, clearLines, collides, createBoard, place } from "../../js/core/board.js";
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

/** 앞 피스를 아래 네 줄 안에 놓고(줄을 지우지 않고), 마지막 I로 4줄을 지울 수 있는가 */
const solvesQuad = (board, pieces) => {
  const [type, ...rest] = pieces;
  return placements(board, type).some(p => {
    if (!rest.length) return p.lines === 4;
    if (p.lines) return false;
    if (ROTATIONS.srs.cells(type, p.rot).some(([, cy]) => p.y + cy < HEIGHT - 4)) return false;
    const next = { ...board, cells: board.cells.slice() };
    place(next, ROTATIONS.srs.cells(type, p.rot), p.x, p.y, 1);
    return solvesQuad(next, rest);
  });
};

/** 피스마다 한 줄 이상 지우며 끝까지 갈 수 있는가(콤보가 끊기지 않게) */
const solvesCombo = (board, pieces) => {
  const [type, ...rest] = pieces;
  if (!type) return true;
  return placements(board, type).some(p => {
    if (!p.lines) return false;
    const next = { ...board, cells: board.cells.slice() };
    place(next, ROTATIONS.srs.cells(type, p.rot), p.x, p.y, 1);
    clearLines(next);
    return solvesCombo(next, rest);
  });
};

/** 곧장 떨어뜨리기만으로(회전·좌우만 하고 하드 드롭) 2줄을 지울 수 있는가 */
const hardDropClears = (board, type, lines) => {
  for (let rot = 0; rot < 4; rot++) {
    const cells = ROTATIONS.srs.cells(type, rot);
    for (let x = -3; x < 12; x++) {
      let y = HEIGHT - 22;
      if (collides(board, cells, x, y)) continue;
      while (!collides(board, cells, x, y + 1)) y += 1;
      const next = { ...board, cells: board.cells.slice() };
      place(next, cells, x, y, 1);
      if (clearLines(next).length === lines) return true;
    }
  }
  return false;
};

test("퍼즐 62단계는 모두 주어진 피스로 풀 수 있다", () => {
  assert.equal(PUZZLES.length, 62);
  for (const p of PUZZLES) {
    const board = createBoard();
    p.build(board);
    if (p.kind === "pc") assert.ok(solvesPc(board, p.pieces), `단계 ${p.number}: ${p.pieces.join("")}`);
    else if (p.kind === "tuck") {
      // 밀어 넣으면(내리고 옆으로) 2줄을 지울 수 있고, 곧장 떨어뜨려서는 못 지운다
      assert.ok(
        placements(board, p.pieces[0]).some(q => q.lines === 2),
        `단계 ${p.number}: 밀어 넣어 2줄`
      );
      assert.equal(hardDropClears(board, p.pieces[0], 2), false, `단계 ${p.number}: 곧장 떨어뜨려서는 안 풀린다`);
    } else if (p.kind === "spin") {
      // 돌려 넣으면 2줄을 지울 수 있고, 위에서만 돌리고 내리기·밀기로는 2줄을 못 지운다
      assert.ok(
        placements(board, p.pieces[0], "srs", { half: false }).some(q => q.lines === 2),
        `단계 ${p.number}: 돌려 넣어 2줄(180° 회전 없이)`
      );
      assert.equal(
        placements(board, p.pieces[0], "srs", { topSpinOnly: true }).some(q => q.lines >= 2),
        false,
        `단계 ${p.number}: 돌리지 않고는 안 풀린다`
      );
      assert.equal(hardDropClears(board, p.pieces[0], 2), false);
    } else if (p.kind === "combo") {
      assert.ok(solvesCombo(board, p.pieces), `단계 ${p.number}: ${p.pieces.join("")}`);
    } else if (p.kind === "quad") {
      assert.equal(p.pieces.at(-1), "I", "마지막은 I");
      assert.ok(solvesQuad(board, p.pieces), `단계 ${p.number}: ${p.pieces.join("")}`);
    } else {
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

test("퍼즐 순서: 판 비우기 → 4줄 만들기 → 콤보 → 밀어 넣기 → 돌려 넣기 → T-spin Double → T-spin Triple 장, 장 안에서는 피스가 적은 것부터", async () => {
  const { CHAPTERS } = await import("../../js/modes/puzzles.js");
  assert.deepEqual(
    PUZZLES.map(p => p.number),
    PUZZLES.map((_, i) => i + 1),
    "보이는 번호는 1부터 차례로"
  );
  const chapterIndex = PUZZLES.map(p => CHAPTERS.indexOf(p.kind));
  assert.deepEqual(
    chapterIndex,
    [...chapterIndex].sort((a, b) => a - b),
    "장 순서"
  );
  for (let i = 1; i < PUZZLES.length; i++) {
    if (PUZZLES[i].kind === PUZZLES[i - 1].kind)
      assert.ok(PUZZLES[i].pieces.length >= PUZZLES[i - 1].pieces.length, `단계 ${i + 1}: 피스 수가 줄지 않는다`);
  }
  assert.deepEqual(
    PUZZLES.map(p => p.id).sort((a, b) => a - b),
    PUZZLES.map((_, i) => i + 1),
    "id는 만들 때의 번호 1~62(4줄 만들기 31~, 밀어 넣기 39~, 콤보 47~, 돌려 넣기 55~)"
  );
});

test("퍼즐 id는 바뀌지 않는다: 예전 번호로 저장된 진행도·리플레이가 같은 판을 가리킨다", () => {
  // 예전 17단계는 2피스 판 비우기였다(순서를 바꾸기 전 번호)
  const old17 = findPuzzle("puzzle-17").puzzle;
  assert.equal(old17.id, 17);
  assert.equal(old17.kind, "pc");
  assert.equal(old17.pieces.length, 2);
  assert.notEqual(old17.number, 17, "보이는 번호는 바뀌었다");
  const store = createStore(memoryBackend());
  store.set("puzzle:cleared", [1, 17]);
  const progress = createPuzzleProgress(store);
  assert.ok(progress.cleared().has(old17.id));
  assert.equal(progress.next().number, 2, "보이는 순서로 처음 안 깬 단계");
});
