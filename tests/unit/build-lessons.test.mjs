import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { BUILD_LESSONS } from "../../js/modes/build-lessons.js";

const start = mode => {
  const game = createGame({ mode, rules: mode.rules, seed: 1, handling: { das: 8, arr: 0.6, sdf: Infinity } });
  game.step();
  return game;
};

const move = (game, button, count = 1) => {
  for (let i = 0; i < count; i++) game.step({ pressed: button });
};

test("빈 판의 4줄 빌드는 힌트 배치와 다른 순서로 쌓아도 성공한다", () => {
  const mode = BUILD_LESSONS[0];
  const game = start(mode);
  assert.ok(game.state.board.cells.every(cell => cell === 0));
  for (const offset of [2, 4, 2, 4]) {
    move(game, BTN.LEFT, offset);
    move(game, BTN.HARD);
  }
  for (let i = 0; i < 4; i++) {
    move(game, BTN.RIGHT);
    move(game, BTN.HARD);
  }
  move(game, BTN.CW);
  move(game, BTN.RIGHT, 3);
  move(game, BTN.HARD);
  mode.hint(game.state);
  mode.hint(game.state);
  assert.deepEqual(game.state.buildLesson.hintCells, [
    [9, 36],
    [9, 37],
    [9, 38],
    [9, 39],
  ]);
  move(game, BTN.CW);
  move(game, BTN.RIGHT, 4);
  const events = game.step({ pressed: BTN.HARD });
  assert.equal(events.find(event => event.type === "lock").lines, 4);
  assert.equal(game.state.over, "clear");
});

test("T스핀 빌드는 왼쪽 열과 지붕을 쌓은 뒤 회전으로 더블을 완성한다", () => {
  const mode = BUILD_LESSONS[1];
  const game = start(mode);
  move(game, BTN.CW);
  move(game, BTN.LEFT, 5);
  move(game, BTN.HARD);
  move(game, BTN.LEFT);
  move(game, BTN.HARD);
  mode.hint(game.state);
  mode.hint(game.state);
  assert.deepEqual(game.state.buildLesson.hintCells, [
    [4, 38],
    [5, 38],
    [6, 38],
    [5, 39],
  ]);

  move(game, BTN.RIGHT);
  move(game, BTN.CW);
  game.step({ held: BTN.SOFT });
  move(game, BTN.CW);
  const events = game.step({ pressed: BTN.HARD });
  const lock = events.find(event => event.type === "lock");
  assert.equal(lock.tspin, "full");
  assert.equal(lock.lines, 2);
  assert.equal(game.state.over, "clear");
});
