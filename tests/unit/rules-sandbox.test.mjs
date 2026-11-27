import { test } from "node:test";
import assert from "node:assert/strict";
import ars from "../../js/rules/rotation/ars.js";
import classic from "../../js/rules/rotation/classic.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { RANDOMIZERS } from "../../js/rules/randomizer/index.js";
import { createRng } from "../../js/core/rng.js";
import { PIECE_TYPES } from "../../js/core/pieces.js";
import { ARCADE, MODERN, PRESET_LIST, RETRO } from "../../js/rules/presets.js";
import { makeCustomRules, rulesId, sanitizeRuleBody } from "../../js/rules/sanitize.js";
import { MARATHON, SPRINT_40 } from "../../js/modes/index.js";
import { decodeRules, encodeRules } from "../../js/rules/share.js";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";

const draw = (name, n, seed = 5) => {
  const r = RANDOMIZERS[name](createRng(seed));
  return Array.from({ length: n }, () => r.next());
};

// ---- 회전 시스템 ----

test("모든 회전 시스템: 피스마다 상태 4개, 상태마다 서로 다른 4칸", () => {
  for (const [id, rot] of Object.entries(ROTATIONS)) {
    for (const type of PIECE_TYPES) {
      for (let r = 0; r < 4; r++) {
        const cells = rot.cells(type, r);
        assert.equal(cells.length, 4, `${id} ${type} ${r}`);
        assert.equal(new Set(cells.map(c => c.join())).size, 4, `${id} ${type} ${r}`);
      }
    }
  }
});

test("ARS: T는 평평한 면이 위(아래를 가리킴)로 생성되고 상자 아래쪽에 붙는다", () => {
  assert.deepEqual(
    [...ars.cells("T", 0)].sort((a, b) => a[1] - b[1] || a[0] - b[0]),
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ]
  );
});

test("ARS 킥: 제자리 → 오른쪽 → 왼쪽, I·O는 킥 없음", () => {
  const free = () => false;
  assert.deepEqual(ars.kicks("T", 0, 1, free), [
    [0, 0],
    [1, 0],
    [-1, 0],
  ]);
  assert.deepEqual(ars.kicks("I", 0, 1, free), [[0, 0]]);
  assert.deepEqual(ars.kicks("O", 0, 1, free), [[0, 0]]);
});

test("ARS 중앙열 규칙: 처음 부딪히는 칸이 가운데 열이면 J·L·T는 킥하지 않는다", () => {
  // T 회전 1(왼쪽을 가리킴)의 맨 위 칸은 (1,0) — 가운데 열이 막혀 있다.
  const centerBlocked = (cx, cy) => cx === 1 && cy === 0;
  assert.deepEqual(ars.kicks("T", 0, 1, centerBlocked), [[0, 0]]);
  // 왼쪽 열이 먼저 막히면 킥한다.
  const leftBlocked = (cx, cy) => cx === 0 && cy === 1;
  assert.equal(ars.kicks("T", 0, 1, leftBlocked).length, 3);
  // S·Z에는 규칙이 없다.
  assert.equal(ars.kicks("S", 0, 1, centerBlocked).length, 3);
});

test("킥 없음 회전은 제자리만", () => {
  assert.deepEqual(classic.kicks("T", 0, 1), [[0, 0]]);
  assert.deepEqual(classic.cells("T", 1), ROTATIONS.srs.cells("T", 1));
});

test("엔진 + 킥 없음: 벽에 붙은 세로 I는 SRS와 달리 돌지 않는다", () => {
  const play = rotation => {
    const g = createGame({ rules: { ...MODERN, rotation, gravity: 0 }, seed: 1 });
    g.step();
    // 회전 1(세로, 상자 세 번째 열)을 왼쪽 벽에 붙인다 → 가로로 돌리려면 왼쪽이 벽 밖이라 킥이 필요하다.
    g.state.active = { type: "I", rot: 1, x: -2, y: VISIBLE_TOP + 5, lastAction: null, kick: 0 };
    g.step({ pressed: BTN.CW });
    return g.state.active.rot;
  };
  assert.equal(play("srs"), 2);
  assert.equal(play("classic"), 1);
});

// ---- 생성기 ----

test("14-Bag: 14개마다 7종이 두 개씩", () => {
  const seq = draw("bag14", 140);
  for (let i = 0; i < seq.length; i += 14) {
    const counts = {};
    for (const p of seq.slice(i, i + 14)) counts[p] = (counts[p] ?? 0) + 1;
    assert.deepEqual(Object.values(counts), Array(7).fill(2));
  }
});

test("모든 생성기: 결정론적이고 7종이 다 나온다", () => {
  for (const name of Object.keys(RANDOMIZERS)) {
    assert.deepEqual(draw(name, 200, 3), draw(name, 200, 3), name);
    assert.equal(new Set(draw(name, 200, 3)).size, 7, name);
  }
});

test("직전 재추첨은 완전 무작위보다 연속 중복이 적다", () => {
  const repeats = seq => seq.filter((p, i) => i > 0 && p === seq[i - 1]).length / (seq.length - 1);
  const nes = repeats(draw("nesReroll", 20000));
  const rnd = repeats(draw("random", 20000));
  assert.ok(Math.abs(rnd - 1 / 7) < 0.02, `무작위 ${rnd}`);
  assert.ok(nes < rnd * 0.4, `재추첨 ${nes} < 무작위 ${rnd}`);
});

test("이력 4개: 첫 피스는 S·Z·O가 아니고, 4개 안의 중복이 드물다", () => {
  for (let seed = 1; seed < 50; seed++) assert.ok(!["S", "Z", "O"].includes(draw("history4", 1, seed)[0]));
  const seq = draw("history4", 5000);
  const near = seq.filter((p, i) => seq.slice(Math.max(0, i - 4), i).includes(p)).length / seq.length;
  assert.ok(near < 0.2, `최근 4개 안 중복 비율 ${near}`);
});

// ---- 규칙 검증·식별자 ----

test("sanitize: 모르는 값은 Modern 기본값으로, 숫자는 범위로", () => {
  const r = sanitizeRuleBody({
    rotation: "spin",
    randomizer: "bag7",
    previewCount: 99,
    lock: { type: "forever", delay: -5, maxResets: 1000 },
    gravity: 0.9,
    hold: { enabled: "yes" },
    fixedHandling: { das: 100, arr: -1, sdf: "x" },
  });
  assert.equal(r.rotation, "srs");
  assert.equal(r.previewCount, 6);
  assert.deepEqual(r.lock, { type: "moveReset", delay: 0, maxResets: 30 });
  assert.equal(r.gravity, 1, "가장 가까운 선택지(1G)");
  assert.equal(r.hold.enabled, true);
  assert.deepEqual(r.fixedHandling, { das: 30, arr: 0, sdf: 30 });
  assert.deepEqual(sanitizeRuleBody(null), sanitizeRuleBody(MODERN));
});

test("Custom id: 같은 내용이면 같고, 하나라도 다르면 다르다, 키 순서와 무관", () => {
  const a = rulesId(MODERN);
  assert.equal(a, rulesId({ ...MODERN }));
  assert.match(a, /^custom-[0-9a-z]{7}$/);
  assert.notEqual(a, rulesId({ ...MODERN, previewCount: 4 }));
  const reversed = Object.fromEntries(Object.entries(sanitizeRuleBody(MODERN)).reverse());
  assert.equal(rulesId(reversed), a);
  const custom = makeCustomRules(MODERN);
  assert.equal(custom.name, "Custom");
  assert.notEqual(custom.id, MODERN.id, "Modern과 같은 조합이어도 Custom 기록은 따로");
});

test("프리셋은 sanitize를 거쳐도 그대로다(리셋 한도 제외)", () => {
  for (const p of PRESET_LIST) {
    const body = sanitizeRuleBody(p);
    for (const key of ["rotation", "randomizer", "previewCount", "ghost", "hardDrop", "tspin", "scoring", "gravity"]) {
      assert.deepEqual(body[key], p[key], `${p.id}.${key}`);
    }
    assert.deepEqual(body.are, p.are, `${p.id}.are`);
    assert.deepEqual(body.fixedHandling, p.fixedHandling, `${p.id}.fixedHandling`);
  }
});

// ---- 프리셋이 엔진에서 실제로 다르게 동작하는지 ----

test("Retro: 하드 드롭·홀드가 안 되고, 조작감이 고정되며, 클래식 점수표", () => {
  const g = createGame({ rules: RETRO, handling: { das: 2, arr: 0, sdf: Infinity }, seed: 1 });
  g.step();
  assert.deepEqual(g.handling, RETRO.fixedHandling, "개인 설정 대신 규칙의 조작감");
  const type = g.state.active.type;
  g.step({ pressed: BTN.HARD | BTN.HOLD });
  assert.equal(g.state.stats.pieces, 0);
  assert.equal(g.state.hold, null);
  assert.equal(g.state.active.type, type);
  g.setHandling({ das: 1, arr: 0, sdf: 99 });
  assert.deepEqual(g.handling, RETRO.fixedHandling, "설정을 바꿔도 고정");

  // 싱글 = 40 × 레벨 1
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: HEIGHT - 4, lastAction: null, kick: 0 };
  let ev = [];
  for (let i = 0; i < 300 && !ev.some(e => e.type === "lock"); i++) ev = g.step();
  assert.equal(ev.find(e => e.type === "lock").points, 40);
});

test("Retro: 닿으면 다음 낙하 때 바로 고정되고, 생성 지연(ARE)이 있다", () => {
  const g = createGame({ rules: { ...RETRO, gravity: 1 }, seed: 1 });
  g.step();
  let frames = 0;
  while (g.state.stats.pieces === 0 && frames < 100) {
    g.step();
    frames++;
  }
  assert.ok(frames < 25, `고정 지연 없이 바로 고정 (${frames}F)`);
  assert.equal(g.state.active, null, "고정 직후에는 ARE 동안 피스가 없다");
  for (let i = 0; i < RETRO.are.spawn; i++) g.step();
  assert.ok(g.state.active, "ARE가 끝나면 다음 피스");
});

test("Arcade: 내려갈 때만 리셋 — 좌우로 흔들어도 지연 시간이 지나면 고정", () => {
  const g = createGame({ rules: { ...ARCADE, gravity: 20, are: { spawn: 0, lineClear: 0 } }, seed: 1 });
  g.step();
  let frames = 0;
  while (g.state.stats.pieces === 0 && frames < 200) {
    g.step({ pressed: frames % 2 ? BTN.LEFT : BTN.RIGHT });
    frames++;
  }
  assert.ok(frames <= ARCADE.lock.delay + 1, `흔들어도 ${frames}F 만에 고정`);
});

test("모드 기본과 고정 중력: Marathon의 레벨 곡선을 덮어쓸 수 있고 훈련의 중력은 우선한다", () => {
  const rules = makeCustomRules({ ...MODERN, gravity: 20 });
  const spawn = (rules, mode) => {
    const game = createGame({ rules, mode, seed: 1 });
    game.step();
    return game;
  };
  const sprint = spawn(rules, SPRINT_40);
  assert.equal(sprint.state.active.y, sprint.ghostY());
  const leveling = spawn(rules, MARATHON);
  assert.ok(leveling.state.active.y < leveling.ghostY());
  const fixed = makeCustomRules({ ...rules, gravityMode: "fixed" });
  const marathon = spawn(fixed, MARATHON);
  assert.equal(marathon.state.active.y, marathon.ghostY());
  const lesson = spawn(fixed, { gravityFor: () => 0 });
  assert.ok(lesson.state.active.y < lesson.ghostY());
  const zero = spawn(makeCustomRules({ ...fixed, gravity: 0 }), MARATHON);
  const y = zero.state.active.y;
  for (let i = 0; i < 120; i++) zero.step();
  assert.equal(zero.state.active.y, y);
});

test("Custom 공유 코드: 180도 제한, 고정 중력, DCD와 즉시 소프트 드롭이 함께 저장된다", () => {
  const incoming = {
    ...MODERN,
    allow180: false,
    gravity: 0,
    gravityMode: "fixed",
    fixedHandling: { das: 6, arr: 1, sdf: 12, dcd: 3, instantSoftDrop: true },
  };
  const body = decodeRules(encodeRules(incoming));
  assert.deepEqual(body, sanitizeRuleBody(incoming));
  assert.equal(body.gravity, 0);
  const game = createGame({ rules: makeCustomRules(body), handling: { das: 10, arr: 3, sdf: 41, dcd: 7 }, seed: 1 });
  const result = game.step({ held: BTN.R180, pressed: BTN.R180 });
  assert.ok(!result.some(e => e.type === "irs" || e.type === "rotate"));
  assert.equal(game.state.active.rot, 0);
  assert.equal(game.step({ pressed: BTN.CW }).find(e => e.type === "rotate").turn, 1);
  assert.equal(
    game.step({ pressed: BTN.R180 }).some(e => e.type === "rotate"),
    false
  );
  assert.equal(game.handling.dcd, 3);
  assert.equal(game.handling.sdf, Infinity);
  game.step({ held: BTN.SOFT });
  assert.equal(game.state.active.y, game.ghostY());
  assert.equal(game.state.stats.pieces, 0);
  game.setHandling({ das: 20, arr: 4, sdf: 20, dcd: 5 });
  assert.equal(game.handling.dcd, 3);

  assert.equal(rulesId(MODERN), rulesId({ ...MODERN, allow180: true, gravityMode: "mode" }));
  assert.equal(
    createGame({ rules: RETRO, handling: { das: 10, arr: 3, sdf: 41, dcd: 7 } }).handling.dcd,
    7,
    "기존 고정 규칙은 개인 DCD를 유지한다"
  );
});
