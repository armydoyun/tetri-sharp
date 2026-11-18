import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, get, isEmpty } from "../../js/core/board.js";
import { GARBAGE } from "../../js/core/pieces.js";
import { MODERN } from "../../js/rules/presets.js";
import { DRILLS, buildDoubleWell, buildTsd, findPractice, practiceMode } from "../../js/modes/practice.js";
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

test("2줄 우물: O로 두 번 성공하면 연속 기록이 쌓이고 실패해도 최고는 남는다", () => {
  const { g } = start("double");
  assert.equal(g.state.active.type, "O");
  const column = 4;
  for (const x of [column, column, column - 2]) {
    buildDoubleWell(g.state.board, column);
    const minX = Math.min(...g.shapeOf("O", 0).map(([cx]) => cx));
    g.state.active.x = x - minX;
    g.step({ pressed: BTN.HARD });
    g.step();
  }
  const { success, tries, streak, bestStreak } = g.state.practice;
  assert.deepEqual({ success, tries, streak, bestStreak }, { success: 2, tries: 3, streak: 0, bestStreak: 2 });
});

// ---- 새 연습: T-spin Triple · 퍼펙트 클리어 마무리 · 피네스 ----
import { placements } from "../helpers/solver.mjs";
import { buildPcFinish, buildTst } from "../../js/modes/practice.js";
import { finesseCost, createFinesseTracker } from "../../js/modes/finesse.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { clearLines as clearRows, createBoard as newBoard, place as placeCells } from "../../js/core/board.js";
import { createRng as rngOf } from "../../js/core/rng.js";

test("T-spin Triple 자리는 좌우·모든 위치에서 T로 T-spin Triple을 낼 수 있다", () => {
  for (const right of [true, false]) {
    for (let i = 0; i < 7; i++) {
      const c = right ? 1 + i : 2 + i;
      const board = newBoard();
      buildTst(board, c, right);
      assert.ok(
        placements(board, "T").some(p => p.tspin === "full" && p.lines === 3),
        `c=${c} right=${right}`
      );
    }
  }
});

/** 피스들을 순서대로 놓아(중간에 줄이 지워져도 됨) 판을 비울 수 있는가 */
const solvesPc = (board, pieces) => {
  if (!pieces.length) return false;
  const [type, ...rest] = pieces;
  return placements(board, type).some(p => {
    if (!rest.length) return p.perfect;
    // 구멍은 아래 두 줄에만 있으니 그 위로 튀어나온 자리는 볼 필요가 없다.
    if (ROTATIONS.srs.cells(type, p.rot).some(([, cy]) => p.y + cy < HEIGHT - 2)) return false;
    const next = { ...board, cells: board.cells.slice() };
    placeCells(next, ROTATIONS.srs.cells(type, p.rot), p.x, p.y, 1);
    clearRows(next);
    return solvesPc(next, rest);
  });
};

test("퍼펙트 클리어 마무리: 다음 피스들을 순서대로 놓으면 판이 빈다", () => {
  const types = ["I", "J", "L", "O", "S", "T", "Z"];
  const rng = rngOf(42);
  let pairs = 0;
  for (const a of types) {
    for (const b of types) {
      const queue = [a, b, "T", "I"];
      const board = newBoard();
      const n = buildPcFinish(board, queue, rng);
      assert.ok(n >= 1, `${a}${b}: 구멍을 만들었다`);
      if (n === 2) pairs += 1;
      assert.ok(solvesPc(board, queue.slice(0, n)), `${queue.slice(0, n).join(" → ")}`);
    }
  }
  assert.ok(pairs >= 30, `대부분은 두 개로 만든다 (${pairs}/49)`);
});

test("피네스 최소 입력: 생성 자리 0, 벽까지 1, 회전 1, 한 칸 옆 회전 2", () => {
  const srs = ROTATIONS.srs;
  const cellsAt = (type, rot, x, y = 30) => srs.cells(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
  assert.equal(finesseCost(srs, "T", cellsAt("T", 0, 3)), 0);
  assert.equal(finesseCost(srs, "T", cellsAt("T", 0, 0)), 1, "왼쪽 벽까지 DAS 한 번");
  assert.equal(finesseCost(srs, "T", cellsAt("T", 1, 3)), 1);
  assert.equal(finesseCost(srs, "T", cellsAt("T", 1, 4)), 2);
  assert.equal(finesseCost(srs, "O", cellsAt("O", 0, 5)), 1);
  // S는 0과 2가 같은 모양: 어느 쪽으로 판정해도 같은 최소값
  assert.equal(finesseCost(srs, "S", cellsAt("S", 2, 3)), 0);
});

test("피네스 판정: 하드 드롭한 피스마다 최소보다 더 누른 입력을 센다", () => {
  const game = createGame({ rules: MODERN, seed: 1 });
  const tracker = createFinesseTracker(game, ROTATIONS.srs);
  const run = (held, pressed) => {
    const had = Boolean(game.state.active);
    const events = game.step({ held, pressed });
    return tracker.frame(held, pressed, had, events);
  };
  run(0, 0);
  // 왼쪽으로 한 칸씩 다섯 번 → 벽에 닿는 데 4~5번(최소 1번)
  for (let i = 0; i < 5; i++) {
    run(BTN.LEFT, BTN.LEFT);
    run(0, 0);
  }
  const extra = run(BTN.HARD, BTN.HARD);
  assert.ok(extra >= 3, `초과 입력 ${extra}`);
  assert.equal(game.state.finesse.judged, 1);
  assert.equal(game.state.finesse.faults, 1);
  run(0, 0);
  // 다음 피스는 그대로 떨어뜨린다 → 실수 없음
  assert.equal(run(BTN.HARD, BTN.HARD), 0);
  assert.equal(game.state.finesse.judged, 2);
  assert.equal(game.state.finesse.faults, 1);
});
