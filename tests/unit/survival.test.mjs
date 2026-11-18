import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { HEIGHT, WIDTH, createBoard, get, set } from "../../js/core/board.js";
import { GARBAGE } from "../../js/core/pieces.js";
import {
  MODES,
  SURVIVAL,
  findMode,
  garbageRows,
  raiseGarbage,
  survivalBlock,
  survivalInterval,
} from "../../js/modes/index.js";
import { createRecorder, verifyReplay } from "../../js/replay/replay.js";

test("Survival은 모드 목록에 있고 id로 찾는다", () => {
  assert.ok(MODES.includes(SURVIVAL));
  assert.equal(findMode("survival"), SURVIVAL);
});

test("쓰레기 줄 올리기: 보드가 위로 밀리고 아래 줄마다 구멍이 하나", () => {
  const board = createBoard();
  set(board, 3, HEIGHT - 1, 1);
  raiseGarbage(board, 2, () => 5);
  assert.equal(get(board, 3, HEIGHT - 3), 1, "원래 블록은 두 줄 위로");
  for (const y of [HEIGHT - 2, HEIGHT - 1]) {
    for (let x = 0; x < WIDTH; x++) assert.equal(get(board, x, y), x === 5 ? 0 : GARBAGE);
  }
});

test("쌓이는 간격은 레벨이 오를수록 짧아지고, T-spin은 두 배로 막는다", () => {
  assert.equal(survivalInterval(1), 300);
  assert.ok(survivalInterval(10) < survivalInterval(2));
  assert.equal(survivalInterval(99), 60);
  assert.equal(survivalBlock({ lines: 2, tspin: "none" }), 2);
  assert.equal(survivalBlock({ lines: 2, tspin: "full" }), 4);
});

test("대기 줄이 쌓였다가, 줄을 못 지우고 고정하면 아래에서 올라온다", () => {
  const game = createGame({ rules: MODERN, seed: 9, mode: SURVIVAL });
  for (let i = 0; i < survivalInterval(1) * 2; i++) game.step();
  // 그사이 중력으로 피스가 놓였을 수 있으니 대기 + 받은 줄로 센다.
  const g = game.state.garbage;
  assert.equal(g.pending + g.received, 2);
  let events = [];
  for (let i = 0; i < 3 && g.pending; i++) events = game.step({ held: BTN.HARD, pressed: BTN.HARD });
  game.step();
  assert.equal(g.pending, 0);
  assert.equal(garbageRows(game.state.board), g.received);
  assert.ok(g.received >= 2);
  assert.ok(Array.isArray(events));
});

test("Survival 리플레이도 결과가 그대로 재현된다", () => {
  const seed = 1234;
  const game = createGame({ rules: MODERN, seed, mode: SURVIVAL });
  const rec = createRecorder({ seed, mode: SURVIVAL, rules: MODERN, handling: game.handling });
  for (let i = 0; i < 6000 && !game.state.over; i++) {
    const held = i % 37 === 0 ? BTN.HARD : i % 11 < 3 ? BTN.LEFT : i % 13 < 2 ? BTN.RIGHT : 0;
    rec.input(held, 0);
    game.step({ held });
  }
  assert.ok(game.state.garbage.received > 0);
  const replay = JSON.parse(JSON.stringify(rec.finish(game.state)));
  assert.equal(verifyReplay(replay, findMode).ok, true);
});
