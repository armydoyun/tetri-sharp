import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, get, set } from "../../js/core/board.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { DIG, garbageRows, findMode } from "../../js/modes/index.js";
import { MODERN } from "../../js/rules/presets.js";
import { readPad } from "../../js/input/gamepad.js";

const holes = g => {
  const out = [];
  for (let y = HEIGHT - 1; y >= HEIGHT - DIG.goal; y--) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) if (get(g.state.board, x, y) === 0) row.push(x);
    out.push(row);
  }
  return out;
};

test("Dig: 바닥 10줄이 쓰레기, 줄마다 구멍 하나, 위아래 구멍이 같은 열이 아니다", () => {
  const g = createGame({ rules: MODERN, seed: 11, mode: DIG });
  assert.equal(garbageRows(g.state.board), 10);
  const h = holes(g);
  for (const row of h) assert.equal(row.length, 1);
  for (let i = 1; i < h.length; i++) assert.notEqual(h[i][0], h[i - 1][0]);
  assert.equal(findMode("dig"), DIG);
});

test("Dig: 같은 시드면 같은 쓰레기, 피스 순서는 쓰레기와 무관하게 Modern과 같다", () => {
  const a = createGame({ rules: MODERN, seed: 11, mode: DIG });
  const b = createGame({ rules: MODERN, seed: 11, mode: DIG });
  assert.deepEqual([...a.state.board.cells], [...b.state.board.cells]);
  const plain = createGame({ rules: MODERN, seed: 11 });
  assert.deepEqual(a.state.queue, plain.state.queue);
});

test("Dig: 쓰레기를 다 지우면 끝, HUD는 남은 쓰레기 줄", () => {
  const g = createGame({ rules: { ...MODERN, gravity: 0 }, seed: 11, mode: DIG });
  g.step();
  assert.equal(DIG.hudLines(g.state).value, "10");
  // 맨 아래 한 줄만 남기고 지운 상태를 만든다.
  g.state.board.cells.fill(0);
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, GARBAGE);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  const ev = g.step({ pressed: BTN.HARD });
  assert.ok(ev.some(e => e.type === "finish" && e.result === "clear"));
  assert.ok(DIG.isRecordable(g.state));
});

const pad = (pressed = [], axes = [0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  axes,
});

test("게임패드 표준 배치 → 버튼 비트", () => {
  assert.equal(readPad(pad([14])).held, BTN.LEFT);
  assert.equal(readPad(pad([12, 1])).held, BTN.HARD | BTN.CW);
  assert.equal(readPad(pad([4])).held, BTN.HOLD);
  assert.equal(readPad(pad([], [0.9, 0.9])).held, BTN.RIGHT | BTN.SOFT, "왼쪽 스틱");
  assert.equal(readPad(pad([], [0.3, -0.3])).held, 0, "데드존");
  assert.deepEqual([...readPad(pad([9])).system], ["pause"]);
  assert.deepEqual([...readPad(pad([8])).system], ["restart"]);
  assert.deepEqual([...readPad(pad([0, 13])).menu].sort(), ["down", "select"]);
  assert.equal(readPad(null).held, 0);
});
