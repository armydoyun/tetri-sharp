import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { MODERN } from "../../js/rules/presets.js";
import { statRows } from "../../js/ui/stats.js";

const game = () => createGame({ rules: { ...MODERN, gravity: 0 }, handling: { das: 8, arr: 2, sdf: 20 }, seed: 3 });

test("통계: 키 입력은 새로 누른 버튼 수, 이동·회전·홀드를 센다", () => {
  const g = game();
  g.step();
  // 실제 키 입력처럼: 누른 프레임에는 held와 pressed가 함께 온다.
  g.step({ held: BTN.LEFT, pressed: BTN.LEFT | BTN.CW });
  g.step({ held: BTN.LEFT }); // 계속 누르고 있는 건 새 입력이 아니다
  g.step({ pressed: BTN.HOLD });
  const t = g.state.tally;
  assert.equal(t.inputs, 3);
  assert.equal(t.moves, 1);
  assert.equal(t.rotations, 1);
  assert.equal(t.holds, 1);
});

test("통계: T-spin Double·회전 보정·최대 B2B를 센다", () => {
  const g = game();
  g.step();
  const b = g.state.board;
  for (let x = 0; x < WIDTH; x++) {
    if (x < 3 || x > 5) set(b, x, HEIGHT - 2, 8);
    if (x !== 4) set(b, x, HEIGHT - 1, 8);
  }
  set(b, 3, HEIGHT - 3, 8);
  g.state.active = { type: "T", rot: 1, x: 3, y: HEIGHT - 3, lastAction: null, kick: 0 };
  g.step({ pressed: BTN.CW });
  g.step({ pressed: BTN.HARD });
  const t = g.state.tally;
  assert.equal(t.clears["full-2"], 1);
  assert.equal(t.maxB2b, 1);
  assert.equal(t.maxCombo, 0);
});

test("통계 표: 판마다 같은 항목 수(값이 0이어도 줄이 있다)", () => {
  const a = statRows(game().state);
  const g = game();
  for (let i = 0; i < 30; i++) g.step({ pressed: i % 2 ? BTN.HARD : BTN.LEFT });
  const b = statRows(g.state);
  assert.equal(a.play.length, b.play.length);
  assert.equal(a.clears.length, b.clears.length);
  assert.ok(b.play.find(([k]) => k === "키 입력")[1] !== "0");
});
