import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { MODERN, RETRO } from "../../js/rules/presets.js";
import { MASTER, masterGravity } from "../../js/modes/index.js";
import { createRecords } from "../../js/storage/records.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";

const game = (rules = {}, mode) =>
  createGame({ rules: { ...MODERN, gravity: 0, ...rules }, handling: { das: 8, arr: 2, sdf: 20 }, seed: 4, mode });

test("IRS: 생성 순간 회전 키를 누르고 있으면 돌린 채로 나오고, 같은 프레임에 두 번 돌지 않는다", () => {
  const g = game();
  const ev = g.step({ held: BTN.CW });
  assert.ok(ev.some(e => e.type === "irs"));
  assert.equal(g.state.active.rot, 1, "한 번만 돈다");
  // 계속 누르고 있어도 더 돌지 않는다(새로 누른 게 아니므로).
  g.step({ held: BTN.CW });
  assert.equal(g.state.active.rot, 1);
});

test("IRS: 고정 후 ARE 동안 회전 키를 누르고 있으면 다음 피스가 돌린 채로 나온다", () => {
  const g = game({ are: { spawn: 5, lineClear: 5 } });
  g.step();
  g.step({ pressed: BTN.HARD });
  assert.equal(g.state.active, null, "ARE 중");
  let ev = [];
  for (let i = 0; i < 10 && !g.state.active; i++) ev = g.step({ held: BTN.CCW });
  assert.equal(g.state.active.rot, 3);
  assert.ok(ev.some(e => e.type === "irs"));
});

test("IRS를 끄면 누르고 있어도 기본 방향으로 나온다", () => {
  const g2 = game({ irs: false, are: { spawn: 5, lineClear: 5 } });
  g2.step();
  g2.step({ pressed: BTN.HARD });
  for (let i = 0; i < 10 && !g2.state.active; i++) g2.step({ held: BTN.CW });
  assert.equal(g2.state.active.rot, 0);
});

test("IHS: 생성 순간 홀드 키를 누르고 있으면 바로 홀드", () => {
  const g = game({ are: { spawn: 3, lineClear: 3 } });
  g.step();
  g.step({ pressed: BTN.HARD });
  const coming = g.state.queue[0];
  const after = g.state.queue[1];
  let ev = [];
  for (let i = 0; i < 10 && !g.state.active; i++) ev = g.step({ held: BTN.HOLD });
  assert.ok(ev.some(e => e.type === "hold" && e.initial));
  assert.equal(g.state.hold, coming);
  assert.equal(g.state.active.type, after);
  assert.equal(g.state.holdUsed, true, "이 피스로는 다시 홀드할 수 없다");
});

test("IHS는 홀드가 꺼진 규칙에서는 동작하지 않는다", () => {
  const g = createGame({ rules: { ...RETRO, gravity: 0 }, seed: 4 });
  g.step({ held: BTN.HOLD });
  assert.equal(g.state.hold, null);
});

test("20G: 생성되자마자 바닥에 붙고, 옆으로 옮기면 그 자리에서 바로 바닥까지", () => {
  const g = game({ gravity: 20 });
  g.step();
  assert.equal(g.ghostY(), g.state.active.y, "생성 직후 이미 바닥");
  // 가운데에 기둥을 세우고 오른쪽으로 옮기면 기둥 위가 아니라 오른쪽 바닥까지 내려간다.
  for (let y = HEIGHT - 6; y < HEIGHT; y++) set(g.state.board, WIDTH - 1, y, 8);
  for (let i = 0; i < 30; i++) g.step({ held: BTN.RIGHT });
  assert.equal(g.ghostY(), g.state.active.y);
});

test("Master 중력: 0에서 느리게 시작, 200에서 한 번 늦춰지고, 500부터 20G", () => {
  assert.equal(masterGravity(0), 4 / 256);
  assert.ok(masterGravity(199) > masterGravity(200));
  assert.equal(masterGravity(251), 1);
  assert.equal(masterGravity(500), 20);
  assert.equal(masterGravity(999), 20);
});

test("Master 레벨: 고정마다 +1, 줄 수만큼 +, x99에서는 줄을 지워야 넘어간다, 999에서 끝", () => {
  const g = game({}, MASTER);
  assert.equal(g.state.level, 0);
  g.step();
  g.step({ pressed: BTN.HARD });
  assert.equal(g.state.level, 1);
  g.state.level = 99;
  g.step({ pressed: BTN.HARD });
  assert.equal(g.state.level, 99, "x99에서 멈춤");
  // 한 줄 지우기
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  const ev = g.step({ pressed: BTN.HARD });
  assert.equal(g.state.level, 100);
  assert.ok(
    ev.some(e => e.type === "levelUp" && e.level === 100),
    "구간이 바뀔 때만 알림"
  );
  assert.equal(MASTER.hudLevel(g.state), "100 / 200");
  g.state.level = 998;
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  const end = g.step({ pressed: BTN.HARD });
  assert.ok(end.some(e => e.type === "finish" && e.result === "clear"));
  assert.equal(MASTER.hudLevel({ level: 950 }), "950 / 999");
});

test("Master 기록: 레벨이 높을수록 위, 같으면 빠른 쪽이 위", () => {
  const records = createRecords(createStore(memoryBackend()));
  const e = (level, frames) => ({ frames, lines: 0, pieces: 0, level, date: "x" });
  records.add(MASTER, MODERN, e(300, 9000));
  records.add(MASTER, MODERN, e(500, 20000));
  records.add(MASTER, MODERN, e(500, 15000));
  assert.deepEqual(
    records.list(MASTER, MODERN).map(r => [r.level, r.frames]),
    [
      [500, 15000],
      [500, 20000],
      [300, 9000],
    ]
  );
});
