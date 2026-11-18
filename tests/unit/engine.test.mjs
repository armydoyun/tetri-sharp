import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { HEIGHT, WIDTH, get, set } from "../../js/core/board.js";

const HANDLING = { das: 8, arr: 2, sdf: 20 };
const make = (rules = {}, handling = HANDLING, seed = 7) =>
  createGame({ rules: { ...MODERN, ...rules }, handling, seed });
const tick = (g, held = 0, pressed = 0) => g.step({ held, pressed });
const run = (g, n, held = 0) => {
  for (let i = 0; i < n; i++) tick(g, held);
};
const minX = g => Math.min(...g.activeCells().map(c => c[0]));
const maxX = g => Math.max(...g.activeCells().map(c => c[0]));

test("첫 프레임에 피스가 생성되어 보이는 영역 맨 윗줄에 걸친다", () => {
  const g = make();
  tick(g);
  assert.ok(g.state.active);
  const ys = g.activeCells().map(c => c[1]);
  assert.equal(Math.max(...ys), VISIBLE_TOP);
  assert.equal(g.state.queue.length, MODERN.previewCount);
});

test("하드 드롭: 즉시 고정하고 다음 피스", () => {
  const g = make();
  tick(g);
  const next = g.state.queue[0];
  const ev = tick(g, 0, BTN.HARD);
  assert.ok(ev.some(e => e.type === "lock"));
  assert.equal(g.state.stats.pieces, 1);
  assert.equal(g.state.active?.type, next);
  let filled = 0;
  for (let x = 0; x < WIDTH; x++) if (get(g.state.board, x, HEIGHT - 1)) filled++;
  assert.ok(filled > 0, "바닥 줄에 블록이 놓였다");
});

test("같은 시드와 입력이면 결과가 같다(결정론)", () => {
  const play = () => {
    const g = make({}, HANDLING, 99);
    const script = [BTN.LEFT, BTN.CW, BTN.RIGHT, BTN.CCW, 0, BTN.R180];
    for (let i = 0; i < 400; i++) {
      tick(g, i % 37 < 10 ? script[i % script.length] : 0, i % 23 === 0 ? BTN.HARD : 0);
    }
    return { cells: [...g.state.board.cells], stats: { ...g.state.stats }, queue: [...g.state.queue] };
  };
  assert.deepEqual(play(), play());
});

test("탭 한 번은 한 칸, DAS 이후에는 ARR마다 한 칸, 벽에서 멈춘다", () => {
  const g = make({ gravity: 0 });
  tick(g);
  const x0 = minX(g);
  tick(g, BTN.RIGHT);
  assert.equal(minX(g), x0 + 1, "누른 프레임에 한 칸");
  run(g, 6, BTN.RIGHT); // charge 1~6 (< DAS 8)
  assert.equal(minX(g), x0 + 1, "DAS 전에는 움직이지 않는다");
  run(g, 2, BTN.RIGHT); // charge 7, 8 → 8에서 DAS 도달, 즉시 한 칸
  assert.equal(minX(g), x0 + 2);
  run(g, 2, BTN.RIGHT); // ARR 2프레임마다 한 칸
  assert.equal(minX(g), x0 + 3);
  run(g, 30, BTN.RIGHT);
  assert.equal(maxX(g), WIDTH - 1, "벽까지");
});

test("ARR 0이면 DAS가 차는 순간 벽까지", () => {
  const g = make({ gravity: 0 }, { das: 8, arr: 0, sdf: 20 });
  tick(g);
  tick(g, BTN.LEFT);
  run(g, 8, BTN.LEFT);
  assert.equal(minX(g), 0);
});

test("좌우를 바꿔 누르면 나중 방향이 이기고, 놓으면 남은 방향으로 돌아간다", () => {
  const g = make({ gravity: 0 });
  tick(g);
  const x0 = minX(g);
  tick(g, BTN.LEFT);
  tick(g, BTN.LEFT | BTN.RIGHT);
  assert.equal(minX(g), x0, "왼쪽 한 칸 후 오른쪽 한 칸");
  tick(g, BTN.LEFT);
  assert.equal(minX(g), x0 - 1, "오른쪽을 놓으면 왼쪽으로 다시 한 칸");
});

test("홀드: 비어 있으면 다음 피스, 한 피스에 한 번만", () => {
  const g = make();
  tick(g);
  const first = g.state.active.type;
  const next = g.state.queue[0];
  tick(g, 0, BTN.HOLD);
  assert.equal(g.state.hold, first);
  assert.equal(g.state.active.type, next);
  tick(g, 0, BTN.HOLD);
  assert.equal(g.state.active.type, next, "같은 피스에서 두 번째 홀드는 무시");
  tick(g, 0, BTN.HARD);
  const before = g.state.active.type;
  tick(g, 0, BTN.HOLD);
  assert.equal(g.state.active.type, first, "고정 후에는 다시 홀드 가능 → 홀드된 피스가 나온다");
  assert.equal(g.state.hold, before);
});

test("소프트 드롭은 중력 × SDF, SDF ∞는 즉시 바닥(고정은 하지 않음)", () => {
  const g = make({ gravity: 1 / 60 }, { das: 8, arr: 2, sdf: Infinity });
  tick(g);
  tick(g, BTN.SOFT);
  assert.equal(g.ghostY(), g.state.active.y);
  assert.equal(g.state.stats.pieces, 0);
});

test("고정 지연: 바닥에 닿고 delay 프레임 후 고정", () => {
  const g = make({ gravity: 20, lock: { type: "moveReset", delay: 30, maxResets: 15 } });
  tick(g); // 생성 + 20G로 바닥
  assert.equal(g.state.stats.pieces, 0);
  run(g, 28);
  assert.equal(g.state.stats.pieces, 0);
  run(g, 1);
  assert.equal(g.state.stats.pieces, 1);
});

test("Move reset: 15번까지만 타이머를 되돌린다", () => {
  const g = make({ gravity: 20, lock: { type: "moveReset", delay: 30, maxResets: 15 } });
  tick(g);
  // 좌우로 계속 흔들며 버틴다. 15회 리셋 후에는 바닥에 닿아 있는 즉시 고정.
  let frames = 0;
  while (g.state.stats.pieces === 0 && frames < 1000) {
    tick(g, 0, frames % 2 ? BTN.LEFT : BTN.RIGHT);
    frames++;
  }
  assert.ok(frames <= 16, `리셋 한도 후 고정 (frames=${frames})`);
});

test("Infinite: 계속 움직이면 고정되지 않는다", () => {
  const g = make({ gravity: 20, lock: { type: "infinite", delay: 30, maxResets: 0 } });
  tick(g);
  for (let i = 0; i < 300; i++) tick(g, 0, i % 2 ? BTN.LEFT : BTN.RIGHT);
  assert.equal(g.state.stats.pieces, 0);
});

test("한 줄을 채우면 지워진다", () => {
  const g = make({ gravity: 0 });
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  tick(g);
  // 세로 I(회전 R은 상자의 세 번째 열)를 맨 오른쪽 열 위에 놓는다.
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  const ev = tick(g, 0, BTN.HARD);
  assert.deepEqual(ev.find(e => e.type === "lock")?.rows, [HEIGHT - 1]);
  assert.equal(g.state.stats.lines, 1);
  // 세로 I의 나머지 3칸이 한 줄씩 내려와 오른쪽 열 바닥에 남는다.
  for (let y = HEIGHT - 3; y < HEIGHT; y++) assert.equal(get(g.state.board, WIDTH - 1, y), 1);
  assert.equal(get(g.state.board, 0, HEIGHT - 1), 0, "지워진 줄의 가비지는 사라졌다");
});

test("생성 자리가 막히면 게임 오버", () => {
  const g = make();
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (x !== 0) set(g.state.board, x, y, 8);
  const ev = tick(g);
  assert.ok(ev.some(e => e.type === "gameOver"));
  assert.ok(g.state.over);
  assert.deepEqual(tick(g, 0, BTN.HARD), [], "끝난 뒤에는 아무 일도 없다");
});
