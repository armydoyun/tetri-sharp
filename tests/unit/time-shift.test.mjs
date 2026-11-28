import assert from "node:assert/strict";
import test from "node:test";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { TIME_SHIFT_STAGES, timeShiftMode, validTimeShiftMoves } from "../../js/modes/time-shift.js";

import { timeShiftInputs, timeShiftSolutions } from "../helpers/time-shift-solutions.mjs";

const play = (past, stage) => {
  const mode = timeShiftMode(past, stage);
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
  assert.match(timeShiftMode(game.state.timeShift.past).summary(game.state).main, /1번째.*막힌 열: 1번/);
});

const inputs = { left: BTN.LEFT, right: BTN.RIGHT, rotate: BTN.R180, drop: BTN.HARD };
const placeAt = (game, move) => {
  const actions = timeShiftInputs(move);
  for (const action of actions.slice(0, -1)) press(game, inputs[action]);
  const preview = game.state.timeShift.preview;
  const events = press(game, BTN.HARD);
  return { preview, current: events.find(e => e.type === "lock"), echo: events.find(e => e.type === "echoLock") };
};

for (const [index, stage] of TIME_SHIFT_STAGES.entries()) {
  test(`공식 시간차 ${index + 1}단계의 두 플레이를 실제 입력으로 푼다`, () => {
    const solution = timeShiftSolutions[index];
    const first = play(null, stage);
    for (let turn = 0; turn < 6; turn++) {
      placeAt(first, solution.record[turn]);
      first.step();
    }
    assert.equal(first.state.over, "rewind");
    const moves = first.state.timeShift.moves;
    assert.ok(validTimeShiftMoves(moves, stage));
    const second = play(moves, stage);

    if (index === 4) {
      const cells = second.state.board.cells.filter(Boolean).length;
      assert.equal((cells + 12 * 4) % WIDTH, 0);
    }
    for (const [turn, move] of solution.play.entries()) {
      const { preview, current, echo } = placeAt(second, move);
      assert.deepEqual(preview.cells, echo.cells);
      assert.equal(echo.turn, turn + 1);
      if (index === 3) {
        assert.equal(current.lines, 1);
        assert.equal(echo.lines, 1);
        assert.equal(second.state.stats.lines, 2);
      }
      assert.equal(second.state.over, turn === solution.play.length - 1 ? "clear" : null);
      second.step();
    }

    const other = play(moves, stage);
    for (const move of solution.play.slice(0, -1)) {
      placeAt(other, move);
      other.step();
    }
    placeAt(other, index === 3 ? [2] : []);
    assert.notEqual(other.state.over, "clear");
    if (index === 4) assert.equal(other.state.over, "fail");

    if ([2, 3, 4].includes(index)) {
      const differentPast = moves.map((move, i) => (i === 0 ? { ...move, x: index === 3 ? 1 : 2 } : move));
      const retry = play(differentPast, stage);
      for (const move of solution.play) {
        placeAt(retry, move);
        retry.step();
      }
      assert.notEqual(retry.state.over, "clear");
    }
  });
}
