import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeReplay } from "../../js/replay/analyze.js";
import { createPlayer, createRecorder, sanitizeReplay } from "../../js/replay/replay.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { ZEN, findMode } from "../../js/modes/index.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));

test("분석: 표시는 시간 순서이고 판 안에 있으며, 피네스 실수 수와 표시 수가 같다", () => {
  const replay = sanitizeReplay(fixture.replay, findMode);
  const a = analyzeReplay(replay, findMode);
  assert.equal(a.length, replay.result.frames);
  for (let i = 1; i < a.markers.length; i++) assert.ok(a.markers[i - 1].frame <= a.markers[i].frame);
  for (const m of a.markers) assert.ok(m.frame >= 0 && m.frame <= a.length);
  assert.equal(a.markers.filter(m => m.kind === "finesse").length, a.finesse.faults);
});

test("분석: 다른 피스보다 훨씬 오래 멈춘 피스를 찾는다", () => {
  // 한 피스 앞에서 3초를 멈춘 판
  const game = createGame({ rules: MODERN, seed: 4, mode: ZEN });
  const rec = createRecorder({ seed: 4, mode: ZEN, rules: MODERN, handling: game.handling });
  const press = (held, pressed) => {
    rec.input(held, pressed);
    game.step({ held, pressed });
  };
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < (i === 3 ? 180 : 10); k++) press(0, 0);
    press(0, BTN.HARD);
  }
  for (let k = 0; k < 5; k++) press(0, 0);
  const replay = sanitizeReplay(JSON.parse(JSON.stringify(rec.finish(game.state))), findMode);
  const a = analyzeReplay(replay, findMode);
  const slow = a.markers.filter(m => m.kind === "slow");
  assert.equal(slow.length, 1);
  assert.ok(slow[0].value >= 180);
});

test("되감기: 처음부터 다시 돌려 같은 프레임에 오면 판이 똑같다", () => {
  const replay = sanitizeReplay(fixture.replay, findMode);
  const a = createPlayer(replay, findMode);
  for (let i = 0; i < 200; i++) a.step();
  const b = createPlayer(replay, findMode);
  for (let i = 0; i < 200; i++) b.step();
  assert.deepEqual(Array.from(a.game.state.board.cells), Array.from(b.game.state.board.cells));
  assert.deepEqual(b.input, a.input);
});
