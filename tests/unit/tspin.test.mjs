import { test } from "node:test";
import assert from "node:assert/strict";
import { createBoard, set, HEIGHT, WIDTH, isEmpty } from "../../js/core/board.js";
import { detectTSpin } from "../../js/core/tspin.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { createPlayer, createRecorder, sanitizeReplay } from "../../js/replay/replay.js";
import { makeCustomRules } from "../../js/rules/sanitize.js";
import { MODERN } from "../../js/rules/presets.js";

const T = (rot, x, y, extra = {}) => ({ type: "T", rot, x, y, lastAction: "rotate", kick: 0, ...extra });

test("모서리 3개 + 앞쪽 2개 막힘 → T-spin", () => {
  const b = createBoard();
  set(b, 0, 30, 8); // 왼위
  set(b, 2, 30, 8); // 오른위
  set(b, 0, 32, 8); // 왼아래
  assert.equal(detectTSpin(b, T(0, 0, 30)), "full");
});

test("모서리 3개지만 앞쪽 하나만 → Mini, 마지막 킥이면 T-spin", () => {
  const b = createBoard();
  set(b, 0, 30, 8); // 왼위(앞)
  set(b, 0, 32, 8); // 왼아래
  set(b, 2, 32, 8); // 오른아래
  assert.equal(detectTSpin(b, T(0, 0, 30)), "mini");
  assert.equal(detectTSpin(b, T(0, 0, 30, { kick: 4 })), "full");
});

test("벽·바닥도 막힌 모서리로 친다", () => {
  const b = createBoard();
  // 상자가 바닥(y=HEIGHT-1이 아래 줄)과 왼쪽 벽에 붙어 있다: 왼위·왼아래(벽) + 아래 두 개(바닥 밖)
  assert.equal(detectTSpin(b, T(3, -1, HEIGHT - 2)), "full");
});

test("회전이 아니거나 T가 아니거나 모서리가 2개 이하면 아님", () => {
  const b = createBoard();
  set(b, 0, 30, 8);
  set(b, 2, 30, 8);
  set(b, 0, 32, 8);
  assert.equal(detectTSpin(b, T(0, 0, 30, { lastAction: "move" })), "none");
  assert.equal(detectTSpin(b, { ...T(0, 0, 30), type: "S" }), "none");
  set(b, 0, 32, 0);
  assert.equal(detectTSpin(b, T(0, 0, 30)), "none");
});

/** T-spin Double 자리: 아래 두 줄에 T 모양 구멍, 왼쪽 위에 지붕 한 칸. */
const tsdBoard = g => {
  const b = g.state.board;
  for (let x = 0; x < WIDTH; x++) {
    if (x < 3 || x > 5) set(b, x, HEIGHT - 2, 8);
    if (x !== 4) set(b, x, HEIGHT - 1, 8);
  }
  set(b, 3, HEIGHT - 3, 8); // 지붕
};

test("엔진: 회전으로 넣은 T-spin Double → 1200점, 이벤트에 표시", () => {
  const g = createGame({ rules: { ...MODERN, gravity: 0 }, seed: 1 });
  g.step();
  tsdBoard(g);
  // 오른쪽을 보는 T(회전 1)를 구멍 위에 두고 시계 방향으로 돌려 아래를 보게 한다.
  g.state.active = { type: "T", rot: 1, x: 3, y: HEIGHT - 3, lastAction: null, kick: 0 };
  g.step({ pressed: BTN.CW });
  assert.equal(g.state.active.rot, 2);
  const ev = g.step({ pressed: BTN.HARD }).find(e => e.type === "lock");
  assert.equal(ev.tspin, "full");
  assert.equal(ev.lines, 2);
  assert.equal(ev.points, 1200);
  assert.equal(g.state.score, 1200);
  assert.equal(g.state.b2b, 1);
});

test("엔진: 지붕 없는 구멍에 회전 없이 떨어뜨리면 T-spin이 아니다", () => {
  const g = createGame({ rules: { ...MODERN, gravity: 0 }, seed: 1 });
  g.step();
  tsdBoard(g);
  set(g.state.board, 3, HEIGHT - 3, 0); // 지붕을 치운다 → 위에서 그대로 들어간다
  set(g.state.board, 0, HEIGHT - 3, 8); // 모서리와 상관없는 블록(퍼펙트 클리어가 되지 않게)
  g.state.active = { type: "T", rot: 2, x: 3, y: HEIGHT - 6, lastAction: null, kick: 0 };
  const ev = g.step({ pressed: BTN.HARD }).find(e => e.type === "lock");
  assert.equal(ev.tspin, "none");
  assert.equal(ev.lines, 2);
  assert.equal(ev.points, 300);
  assert.equal(g.state.score, 300 + 3 * 2, "더블 300 + 하드 드롭 3칸 × 2");
});

test("엔진: 판이 완전히 비면 퍼펙트 클리어", () => {
  const g = createGame({ rules: { ...MODERN, gravity: 0 }, seed: 1 });
  g.step();
  for (let x = 0; x < WIDTH - 4; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 0, x: WIDTH - 4, y: HEIGHT - 2, lastAction: null, kick: 0 };
  const ev = g.step({ pressed: BTN.HARD }).find(e => e.type === "lock");
  assert.equal(ev.perfect, true);
  assert.ok(isEmpty(g.state.board));
  assert.equal(ev.points, 100 + 800, "싱글 + 퍼펙트");
});

test("엔진: 소프트 드롭 1점/칸, 하드 드롭 2점/칸", () => {
  const g = createGame({ rules: { ...MODERN, gravity: 1 / 60 }, handling: { das: 8, arr: 2, sdf: Infinity }, seed: 1 });
  g.step();
  const y0 = g.state.active.y;
  g.step({ held: BTN.SOFT });
  const soft = g.state.active.y - y0;
  assert.ok(soft > 10);
  assert.equal(g.state.score, soft);
});

test("ARS 앞쪽 판정은 T 방향을 따라가고 기존 리플레이에는 종전 판정을 쓴다", () => {
  const board = createBoard();
  for (const [x, y] of [
    [3, 35],
    [3, 37],
    [5, 37],
  ])
    set(board, x, y, 8);
  assert.equal(detectTSpin(board, T(0, 3, 35), "ars"), "full");
  assert.equal(detectTSpin(board, T(0, 3, 35)), "mini");

  const mode = { id: "ars-test", sequence: ["T"] };
  const rules = makeCustomRules({ ...MODERN, rotation: "ars" });
  const game = createGame({ rules, mode, seed: 1 });
  const recorder = createRecorder({ rules, mode, seed: 1, handling: game.handling });
  const replay = recorder.finish(game.state);
  const load = raw =>
    createPlayer(
      sanitizeReplay(raw, () => mode),
      () => mode
    ).game;
  const live = load(replay);
  const legacy = load({ ...replay, arsSpinFacing: undefined });
  for (const [g, spin] of [
    [live, "full"],
    [legacy, "mini"],
  ]) {
    g.step();
    g.state.board.cells.set(board.cells);
    Object.assign(g.state.active, T(0, 3, 35));
    assert.equal(g.step({ pressed: BTN.HARD }).find(event => event.type === "lock").tspin, spin);
  }
});
