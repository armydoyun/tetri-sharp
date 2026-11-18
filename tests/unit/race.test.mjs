import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { DIG, RACE_MODES, SPRINT_40, ULTRA } from "../../js/modes/index.js";

test("달리기는 Sprint · Ultra · Dig에서 할 수 있다", () => {
  assert.deepEqual(
    RACE_MODES.map(m => m.id),
    ["sprint40", "ultra", "dig"]
  );
});

test("달리기 진행 막대: Sprint는 줄, Dig는 파낸 줄, Ultra는 시간", () => {
  for (const mode of [SPRINT_40, ULTRA, DIG]) {
    const game = createGame({ rules: MODERN, seed: 3, mode });
    for (let i = 0; i < 90; i++) game.step();
    const p = mode.race.progress(game.state);
    assert.ok(p.max > 0 && p.value >= 0 && p.value <= p.max, mode.id);
    assert.equal(typeof p.text, "string");
  }
  const ultra = createGame({ rules: MODERN, seed: 3, mode: ULTRA });
  for (let i = 0; i < 60; i++) ultra.step();
  assert.equal(ULTRA.race.progress(ultra.state).value, 60);
  assert.equal(DIG.race.progress(createGame({ rules: MODERN, seed: 3, mode: DIG }).state).value, 0);
});
