import test from "node:test";
import assert from "node:assert/strict";
import { createBot } from "../../js/ai/bot.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { EXPEDITION_STAGES } from "../../js/modes/expedition.js";
import { findMode } from "../../js/modes/index.js";
import { LEVELS } from "../../js/modes/versus.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { createBackup, parseBackup, restoreBackup } from "../../js/storage/backup.js";
import { EXPEDITION_PROGRESS_KEY, createExpeditionProgress } from "../../js/storage/expedition-progress.js";
import { createStore } from "../../js/storage/store.js";

const play = mode => {
  const game = createGame({ mode, rules: mode.rules, seed: mode.fixedSeed });
  game.step();
  return game;
};
const press = (game, pressed) => game.step({ pressed });
const moveTo = (game, x) => {
  while (game.state.active.x !== x) {
    const before = game.state.active.x;
    press(game, before < x ? BTN.RIGHT : BTN.LEFT);
    assert.notEqual(game.state.active.x, before, "목표 열로 이동할 수 있어야 한다");
  }
};

test("규칙 원정의 홀드 비교는 같은 피스 순서를 쓰며, 첫 챕터의 모든 추가 목표를 달성할 수 있다", () => {
  const stages = EXPEDITION_STAGES.slice(0, 4);
  const withHold = play(stages[0]);
  const withoutHold = play(stages[1]);
  assert.deepEqual(withHold.state.queue, withoutHold.state.queue);
  press(withHold, BTN.HOLD);
  press(withoutHold, BTN.HOLD);
  assert.equal(withHold.state.tally.holds, 1);
  assert.equal(withoutHold.state.tally.holds, 0);

  for (const mode of stages) {
    const game = play(mode);
    const bot = createBot({
      game,
      rotation: ROTATIONS.srs,
      level: { ...LEVELS.at(-1), style: "quad", hold: false },
      seed: mode.fixedSeed,
    });
    for (let frame = 0; frame < 5000 && !game.state.over; frame++) game.step(bot.input());
    assert.equal(game.state.over, "clear", mode.id);
    assert.equal(mode.earnsBonus(game.state), true, mode.id);
  }
});

test("같은 회전 과제에서 SRS I는 벽 킥이 있고 ARS I는 없으며, 두 규칙에 맞춰 원정을 클리어한다", () => {
  for (const mode of EXPEDITION_STAGES.slice(4, 8)) {
    const game = play(mode);
    const ars = mode.rules.rotation === "ars";
    if (game.state.active.type === "I") {
      press(game, BTN.CW);
      moveTo(game, 7);
      press(game, BTN.CCW);
      assert.equal(game.state.active.rot, ars ? 1 : 0);
      if (!ars) {
        press(game, BTN.CW);
        moveTo(game, 7);
      }
    } else if (!ars) {
      press(game, BTN.CW);
      press(game, BTN.CW);
    }
    press(game, BTN.HARD);
    assert.equal(game.state.over, "clear", mode.id);
    assert.equal(mode.earnsBonus(game.state), true);
  }
});

test("쓰레기 원정은 지울 때마다 새 파도가 올라오고 빨라지며 기본 목표와 시간 보너스를 판정한다", () => {
  const openings = [
    [8, 3],
    [1, 7, 2],
    [8, 2, 7],
    [0, 7, 2, 9],
  ];
  for (const [index, mode] of EXPEDITION_STAGES.slice(8).entries()) {
    const game = play(mode);
    assert.equal(Number(mode.hudLines(game.state).value), 6 + index * 2);
    for (const [wave, hole] of openings[index].entries()) {
      const vertical = game.state.active.type === "I";
      if (vertical) press(game, BTN.CW);
      moveTo(game, hole - (vertical ? 2 : 0));
      const speed = mode.gravityFor(game.state);
      const events = press(game, BTN.HARD);
      if (wave < openings[index].length - 1) {
        assert.equal(game.state.over, null);
        assert.equal(mode.gravityFor(game.state), speed * 2);
        assert.ok(events.some(event => event.type === "garbage"));
      }
    }
    assert.equal(game.state.over, "clear", mode.id);
    assert.equal(mode.hudLines(game.state).value, "0");
    assert.equal(mode.earnsBonus(game.state), true);
    assert.equal(mode.earnsBonus({ ...game.state, frame: 3600 }), false);
  }
});

test("원정 진행도 백업은 보너스·일반 클리어를 복원하고 알 수 없는 단계를 버린다", () => {
  const values = new Map();
  const store = createStore({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  const progress = createExpeditionProgress(store);
  progress.mark("expedition-1", true);
  progress.mark("expedition-1", false);
  progress.mark("expedition-2", false);
  const backup = createBackup(store);
  const expected = { "expedition-1": "bonus", "expedition-2": "clear" };
  assert.deepEqual(backup.data[EXPEDITION_PROGRESS_KEY], expected);
  backup.data[EXPEDITION_PROGRESS_KEY]["expedition-99"] = "bonus";
  const older = { ...backup, data: {} };
  assert.equal(restoreBackup(store, parseBackup(older, findMode)), true);
  assert.deepEqual(progress.read(), expected);
  store.set(EXPEDITION_PROGRESS_KEY, {});
  assert.equal(restoreBackup(store, parseBackup(backup, findMode)), true);
  assert.deepEqual(progress.read(), expected);
});
