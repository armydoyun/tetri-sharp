import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { timeShiftMode, validTimeShiftMoves } from "../../js/modes/time-shift.js";

const play = past => {
  const mode = timeShiftMode(past);
  const game = createGame({ mode, rules: mode.rules });
  game.step();
  return game;
};
const press = (game, pressed) => game.step({ pressed });
const moveLeft = (game, n) => {
  for (let i = 0; i < n; i++) press(game, BTN.LEFT);
};
const record = () => {
  const game = play();
  moveLeft(game, 4);
  for (let i = 0; i < 6; i++) {
    press(game, BTN.HARD);
    game.step();
  }
  assert.equal(game.state.over, "rewind");
  return game.state.timeShift.moves;
};

test("시간차 첫 합주를 실제 입력으로 풀고 현재 배치를 바꾸면 과거 블록의 착지가 달라진다", () => {
  const past = record();
  assert.ok(validTimeShiftMoves(past));
  assert.equal(validTimeShiftMoves(past.map(move => ({ ...move, x: -10 }))), false);
  const success = play(past);
  moveLeft(success, 2);
  const prediction = success.state.timeShift.preview;
  assert.equal(prediction.y, HEIGHT - 2);
  const events = press(success, BTN.HARD);
  assert.deepEqual(events.find(event => event.type === "echoLock").cells, prediction.cells);
  assert.equal(success.state.over, "clear");
  assert.equal(success.state.stats.lines, 1);

  const retry = play(past);
  moveLeft(retry, 4);
  const raised = retry.state.timeShift.preview;
  assert.equal(raised.y, HEIGHT - 4);
  assert.deepEqual(press(retry, BTN.HARD).find(event => event.type === "echoLock").cells, raised.cells);
  assert.equal(retry.state.over, null);
  assert.equal(retry.state.stats.lines, 0);
  assert.equal(past[0].x, 0);
});

test("예상 착지는 현재 블록의 줄 삭제를 반영하고 실제 보드를 바꾸지 않는다", () => {
  const game = play(record());
  const board = game.state.board;
  board.cells.fill(0);
  for (let x = 2; x < WIDTH; x++) set(board, x, HEIGHT - 1, GARBAGE);
  const before = board.cells.slice();
  moveLeft(game, 4);
  assert.deepEqual(board.cells, before);
  const predicted = game.state.timeShift.preview;
  assert.equal(predicted.y, HEIGHT - 3);
  const events = press(game, BTN.HARD);
  assert.equal(events.find(event => event.type === "lock").lines, 1);
  assert.deepEqual(events.find(event => event.type === "echoLock").cells, predicted.cells);
});

test("과거 블록 진입이 막히면 다음 턴 없이 실패한다", () => {
  const game = play(record());
  set(game.state.board, 0, 18, GARBAGE);
  press(game, BTN.RIGHT);
  assert.equal(game.state.timeShift.preview, null);
  assert.ok(press(game, BTN.HARD).some(event => event.type === "finish" && event.result === "echoBlocked"));
  assert.equal(game.state.active, null);
});
