import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { DRILLS, practiceMode } from "../../js/modes/practice.js";
import { createUndo } from "../../js/modes/undo.js";
import { HANDLING_PRESETS, handlingPresetOf, sanitizeAccess, sanitizeSettings } from "../../js/storage/settings.js";

test("되돌리기: 놓은 피스를 취소하면 그 피스가 나온 순간의 판·피스·통계로 돌아간다", () => {
  const mode = practiceMode(DRILLS.find(d => d.id === "free"));
  const game = createGame({ rules: MODERN, seed: 4, mode });
  const undo = createUndo();
  const step = input => {
    undo.track(game.state);
    game.step(input);
  };
  step();
  const first = { type: game.state.active.type, queue: [...game.state.queue] };
  step({ pressed: BTN.LEFT });
  step({ pressed: BTN.HARD });
  step();
  assert.equal(game.state.stats.pieces, 1);
  assert.ok(
    game.state.board.cells.some(v => v),
    "보드에 블록이 있다"
  );
  assert.equal(undo.undo(game.state), true);
  assert.equal(game.state.stats.pieces, 0);
  assert.ok(!game.state.board.cells.some(v => v), "보드가 비었다");
  assert.equal(game.state.active.type, first.type);
  assert.deepEqual(game.state.queue, first.queue);
  // 되돌린 뒤에도 계속 둘 수 있다
  step({ pressed: BTN.HARD });
  step();
  assert.equal(game.state.stats.pieces, 1);
  // 처음 피스보다 더 앞으로는 못 간다
  assert.equal(undo.undo(game.state), true);
  assert.equal(undo.undo(game.state), false);
});

test("되돌리기는 연습의 난수 같은 함수 객체를 그대로 두고 값만 되돌린다", () => {
  const mode = practiceMode(DRILLS.find(d => d.id === "tsd"));
  const game = createGame({ rules: MODERN, seed: 4, mode });
  const undo = createUndo();
  const rng = game.state.practice.rng;
  undo.track(game.state);
  game.step();
  undo.track(game.state);
  game.step({ pressed: BTN.HARD });
  game.step();
  assert.equal(game.state.practice.tries, 1);
  undo.undo(game.state);
  assert.equal(game.state.practice.tries, 0);
  assert.equal(game.state.practice.rng, rng, "난수 생성기는 같은 객체");
});

test("조작감 프리셋: 기본 설정은 '보통'이고, 값이 하나라도 다르면 직접 조절", () => {
  assert.equal(handlingPresetOf(sanitizeSettings({}).handling), "standard");
  for (const [id, p] of Object.entries(HANDLING_PRESETS)) {
    assert.equal(handlingPresetOf(p), id);
    assert.deepEqual(sanitizeSettings({ handling: p }).handling, p, `${id}는 허용 범위 안`);
  }
  assert.equal(handlingPresetOf({ das: 134, arr: 10, sdf: 20 }), null);
});

test("접근성 설정: 기본은 알림·진동 켜기, 카운트다운 보통. 터치는 버튼 방식", () => {
  assert.deepEqual(sanitizeAccess(undefined), { announce: "on", vibrate: "on", countdown: "normal" });
  assert.deepEqual(sanitizeAccess({ announce: "off", vibrate: "x", countdown: "off" }), {
    announce: "off",
    vibrate: "on",
    countdown: "off",
  });
  assert.equal(sanitizeSettings({}).touchMode, "buttons");
  assert.equal(sanitizeSettings({ touchMode: "gestures" }).touchMode, "gestures");
  assert.equal(sanitizeSettings({ touchMode: "telepathy" }).touchMode, "buttons");
});
