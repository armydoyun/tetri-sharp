import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { DOWNSTACK_LESSONS } from "../../js/modes/downstack.js";

test("파내기 여섯 문제의 힌트로 모든 쓰레기 줄을 지울 수 있다", () => {
  assert.equal(DOWNSTACK_LESSONS.length, 6);
  for (const mode of DOWNSTACK_LESSONS) {
    const game = createGame({ mode, rules: mode.rules, seed: 1 });
    const press = pressed => game.step({ pressed });
    game.step();
    for (const piece of mode.sequence) {
      assert.equal(game.state.active.type, piece);
      assert.equal(game.state.downstack.hintLevel, 0);
      mode.hint(game.state);
      const holes = game.state.downstack.hintCells;
      assert.ok(holes.length > 0);
      mode.hint(game.state);
      const target = game.state.downstack.hintCells;
      const vertical = new Set(target.map(([x]) => x)).size === 1;
      if (vertical) press(BTN.CW);
      const left = Math.min(...target.map(([x]) => x));
      const current = Math.min(...game.activeCells().map(([x]) => x));
      for (let step = 0; step < Math.abs(left - current); step++) {
        press(left < current ? BTN.LEFT : BTN.RIGHT);
      }
      const event = press(BTN.HARD).find(event => event.type === "lock");
      assert.deepEqual(event.cells, target, mode.name);
      assert.deepEqual(game.state.downstack.hintCells, []);
    }
    assert.equal(game.state.over, "clear", mode.name);
    assert.equal(game.state.board.cells.includes(GARBAGE), false);
  }
});

test("원래 풀이를 벗어나도 현재 피스로 닿는 구멍을 찾는다", () => {
  const mode = DOWNSTACK_LESSONS[2];
  const game = createGame({ mode, rules: mode.rules, seed: 1 });
  game.step();
  for (let i = 0; i < 3; i++) game.step({ pressed: BTN.RIGHT });
  game.step({ pressed: BTN.HARD });
  assert.equal(game.state.downstack.remaining, 2);
  mode.hint(game.state);
  mode.hint(game.state);
  assert.deepEqual(game.state.downstack.hintCells, [
    [0, 38],
    [1, 38],
    [2, 38],
    [3, 38],
  ]);
});
