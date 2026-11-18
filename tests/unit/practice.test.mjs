import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, get, isEmpty } from "../../js/core/board.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { MODERN } from "../../js/rules/presets.js";
import { DRILLS, buildTsd, findPractice, practiceMode } from "../../js/modes/practice.js";
import { findMode } from "../../js/modes/index.js";

const drill = id => DRILLS.find(d => d.id === id);
const start = (id, seed = 5) => {
  const mode = practiceMode(drill(id));
  const g = createGame({ rules: MODERN, seed, mode });
  g.step();
  return { g, mode };
};

test("연습: 정해진 피스만 나오고, 중력이 없다", () => {
  const { g } = start("tsd");
  assert.equal(g.state.active.type, "T");
  assert.ok(g.state.queue.every(t => t === "T"));
  const y = g.state.active.y;
  for (let i = 0; i < 120; i++) g.step();
  assert.equal(g.state.active.y, y, "2초가 지나도 그대로");
});

/** T-spin Double 자리를 직접 깔고, 지붕 쪽에 맞는 방향으로 돌려 넣는다 */
const solveTsd = (g, s, roofLeft) => {
  buildTsd(g.state.board, s, roofLeft);
  // 지붕 왼쪽: 오른쪽을 보는 T(회전 1)를 시계로 / 지붕 오른쪽: 왼쪽을 보는 T(회전 3)를 반시계로
  g.state.active = { type: "T", rot: roofLeft ? 1 : 3, x: s, y: HEIGHT - 3, lastAction: null, kick: 0 };
  g.step({ pressed: roofLeft ? BTN.CW : BTN.CCW });
  return g.step({ pressed: BTN.HARD });
};

test("T-spin Double 연습: 좌우 두 자리 모두 진짜 T-spin Double로 풀리고, 성공을 센 뒤 판을 다시 깐다", () => {
  for (const roofLeft of [true, false]) {
    for (const s of [0, 3, WIDTH - 3]) {
      const { g } = start("tsd");
      const ev = solveTsd(g, s, roofLeft);
      const lock = ev.find(e => e.type === "lock");
      assert.equal(lock.tspin, "full", `s=${s} roofLeft=${roofLeft}`);
      assert.equal(lock.lines, 2);
      assert.ok(ev.some(e => e.type === "practice" && e.success));
      assert.deepEqual(g.state.practice, { ...g.state.practice, tries: 1, success: 1 });
      assert.equal(isEmpty(g.state.board), false, "새 자리가 깔렸다");
      assert.equal(g.state.over, null);
    }
  }
});

test("연습 실패도 시도로 센다", () => {
  const { g } = start("tsd");
  const ev = g.step({ pressed: BTN.HARD });
  assert.ok(ev.some(e => e.type === "practice" && e.success === false));
  assert.equal(g.state.practice.tries, 1);
  assert.equal(g.state.practice.success, 0);
});

test("4줄 우물: 바닥 4줄에서 한쪽 끝 열만 비어 있다", () => {
  const { g } = start("quad");
  const empty = [];
  for (let x = 0; x < WIDTH; x++) if (get(g.state.board, x, HEIGHT - 1) === 0) empty.push(x);
  assert.equal(empty.length, 1);
  assert.ok([0, WIDTH - 1].includes(empty[0]));
  for (let y = HEIGHT - 4; y < HEIGHT; y++) assert.equal(get(g.state.board, empty[0], y), 0);
  assert.equal(get(g.state.board, empty[0] === 0 ? 1 : 0, HEIGHT - 4), GARBAGE);
});

test("자유 쌓기: 판이 높아지면 비우고 끝나지 않는다", () => {
  const { g } = start("free");
  for (let i = 0; i < 200 && !g.state.over; i++) g.step({ pressed: BTN.HARD });
  assert.equal(g.state.over, null);
  assert.ok(g.state.stats.pieces >= 100);
});

test("연습은 기록하지 않고, 리플레이에서 찾을 수 있다", () => {
  const mode = practiceMode(drill("tsd"));
  assert.equal(mode.isRecordable({}), false);
  assert.equal(findPractice("practice-quad").id, "practice-quad");
  assert.equal(findMode("practice-tsd"), mode);
});
