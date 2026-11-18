import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { ARCADE, MODERN } from "../../js/rules/presets.js";
import { makeCustomRules } from "../../js/rules/sanitize.js";
import { MARATHON, SPRINT_40, ULTRA, findMode } from "../../js/modes/index.js";
import {
  createPlayer,
  createRecorder,
  createReplayStore,
  sanitizeReplay,
  verifyReplay,
} from "../../js/replay/replay.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import { createRng } from "../../js/core/rng.js";

/** 무작위 입력으로 한 판을 두고 리플레이를 만든다. changeAt이면 그 프레임에 조작 설정을 바꾼다. */
const playRandom = ({ mode = MARATHON, rules = MODERN, seed = 77, frames = 3000, changeAt = -1 } = {}) => {
  const handling = { das: 8, arr: 2, sdf: 20 };
  const game = createGame({ rules, handling, seed, mode });
  const rec = createRecorder({ seed, mode, rules, handling: game.handling });
  const rng = createRng(1234);
  const buttons = Object.values(BTN);
  let held = 0;
  for (let i = 0; i < frames && !game.state.over; i++) {
    if (i === changeAt) {
      game.setHandling({ das: 3, arr: 0, sdf: Infinity });
      rec.handlingChanged(game.handling);
    }
    if (rng.next() < 0.15) held = rng.next() < 0.5 ? 0 : buttons[rng.int(3)];
    const pressed = rng.next() < 0.08 ? buttons[rng.int(buttons.length)] : 0;
    rec.input(held, pressed);
    game.step({ held, pressed });
  }
  return { game, replay: JSON.parse(JSON.stringify(rec.finish(game.state))) };
};

const snapshot = g => ({
  board: [...g.state.board.cells],
  score: g.state.score,
  lines: g.state.stats.lines,
  frame: g.state.frame,
  level: g.state.level,
});

const replayToEnd = replay => {
  const player = createPlayer(replay, findMode);
  while (!player.done) player.step();
  return player.game;
};

test("리플레이는 원래 판과 보드·점수·줄·프레임이 똑같이 끝난다", () => {
  const { game, replay } = playRandom();
  const clean = sanitizeReplay(replay, findMode);
  assert.ok(clean);
  assert.deepEqual(snapshot(replayToEnd(clean)), snapshot(game));
  assert.ok(verifyReplay(clean, findMode).ok);
});

test("게임 중 조작 설정을 바꿔도(SDF ∞ 포함) 그대로 재생된다", () => {
  const { game, replay } = playRandom({ changeAt: 500 });
  assert.equal(replay.changes.length, 1);
  assert.equal(replay.changes[0][1].sdf, -1, "JSON에는 ∞ 대신 -1");
  const clean = sanitizeReplay(replay, findMode);
  assert.equal(clean.changes[0][1].sdf, Infinity);
  assert.deepEqual(snapshot(replayToEnd(clean)), snapshot(game));
});

test("Custom·Arcade 규칙과 다른 모드도 재생된다", () => {
  const custom = makeCustomRules({ ...MODERN, rotation: "ars", randomizer: "bag14", previewCount: 2 });
  for (const [mode, rules] of [
    [SPRINT_40, custom],
    [ULTRA, ARCADE],
  ]) {
    const { game, replay } = playRandom({ mode, rules, frames: 2000 });
    const clean = sanitizeReplay(replay, findMode);
    assert.equal(clean.rules.id, rules.id, "규칙 id가 다시 계산돼도 같다");
    assert.deepEqual(snapshot(replayToEnd(clean)), snapshot(game), `${mode.id}/${rules.id}`);
  }
});

test("입력은 바뀐 프레임만 남는다", () => {
  const game = createGame({ rules: MODERN, seed: 1 });
  const rec = createRecorder({ seed: 1, mode: SPRINT_40, rules: MODERN, handling: game.handling });
  for (let i = 0; i < 100; i++) rec.input(i < 50 ? BTN.LEFT : 0, i === 10 ? BTN.HARD : 0);
  assert.deepEqual(rec.finish(game.state).inputs, [
    [0, BTN.LEFT, 0],
    [10, BTN.LEFT, BTN.HARD],
    [50, 0, 0],
  ]);
});

test("잘못된 파일은 거부한다", () => {
  const { replay } = playRandom({ frames: 200 });
  const bad = [
    null,
    "text",
    { ...replay, app: "other" },
    { ...replay, v: 99 },
    { ...replay, seed: -1 },
    { ...replay, mode: "nope" },
    {
      ...replay,
      inputs: [
        [5, 1, 0],
        [3, 1, 0],
      ],
    },
    { ...replay, inputs: [[0, 999, 0]] },
    { ...replay, inputs: "x" },
  ];
  for (const raw of bad) assert.equal(sanitizeReplay(raw, findMode), null, JSON.stringify(raw)?.slice(0, 60));
});

test("조작된 결과는 검증에서 걸린다", () => {
  const { replay } = playRandom({ frames: 1500 });
  const cheated = sanitizeReplay(
    { ...replay, result: { ...replay.result, score: replay.result.score + 1000 } },
    findMode
  );
  assert.equal(verifyReplay(cheated, findMode).ok, false);
});

test("저장소: 마지막 판과 기록별 최고 리플레이", () => {
  const store = createStore(memoryBackend());
  const replays = createReplayStore(store, findMode);
  assert.equal(replays.last(), null);
  const { replay } = playRandom({ frames: 300 });
  replays.saveLast(replay);
  assert.equal(replays.last().seed, replay.seed);
  replays.saveBest("marathon|modern", replay);
  assert.equal(replays.best("marathon|modern").seed, replay.seed);
  assert.equal(replays.best("sprint40|modern"), null);
});
