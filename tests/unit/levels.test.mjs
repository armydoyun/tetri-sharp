import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { MARATHON, MAX_LEVEL, ULTRA, guidelineGravity } from "../../js/modes/index.js";
import { formatScore, formatTime } from "../../js/modes/format.js";

const clearOneLine = g => {
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  return g.step({ pressed: BTN.HARD });
};

test("가이드라인 중력: 레벨 1은 1초에 약 1칸, 레벨이 오를수록 빨라진다", () => {
  assert.ok(Math.abs(guidelineGravity(1) - 1 / 60) < 1e-9);
  for (let L = 2; L <= MAX_LEVEL; L++) assert.ok(guidelineGravity(L) > guidelineGravity(L - 1), `L${L}`);
  assert.ok(guidelineGravity(15) > 1, "레벨 15는 프레임당 1칸 이상");
});

test("Marathon: 10줄마다 레벨업 이벤트, 점수에 레벨이 곱해진다", () => {
  const g = createGame({ rules: MARATHON.rules, seed: 1, mode: MARATHON });
  g.step();
  assert.equal(g.state.level, 1);
  g.state.stats.lines = 9;
  const ev = clearOneLine(g);
  assert.ok(ev.some(e => e.type === "levelUp" && e.level === 2));
  assert.equal(g.state.level, 2);
  // 레벨 1에서 지운 줄의 점수는 레벨 1 기준
  assert.equal(ev.find(e => e.type === "lock").points, 100);
  clearOneLine(g);
  assert.equal(g.state.score > 100 + 200, true, "레벨 2 싱글(200) + 콤보");
});

test("Marathon: 레벨은 15에서 멈추고 150줄이면 끝", () => {
  const g = createGame({ rules: MARATHON.rules, seed: 1, mode: MARATHON });
  g.step();
  g.state.stats.lines = 149;
  const ev = clearOneLine(g);
  assert.equal(g.state.level, MAX_LEVEL);
  assert.ok(ev.some(e => e.type === "finish" && e.result === "clear"));
  assert.ok(MARATHON.isRecordable(g.state));
  assert.equal(MARATHON.summary(g.state).title, "완료!");
});

test("Ultra: 정확히 2분(7200프레임)에 끝나고 남은 시간을 보여 준다", () => {
  const g = createGame({ rules: { ...ULTRA.rules, gravity: 0 }, seed: 1, mode: ULTRA });
  for (let i = 0; i < 7199; i++) g.step();
  assert.equal(g.state.over, null);
  assert.equal(formatTime(ULTRA.hudTime(g.state).frames), "0:00.02");
  const ev = g.step();
  assert.ok(ev.some(e => e.type === "finish" && e.result === "timeUp"));
  assert.equal(g.state.frame, 7200);
  assert.equal(ULTRA.summary(g.state).title, "시간 종료!");
});

test("형식", () => {
  assert.equal(formatTime(0), "0:00.00");
  assert.equal(formatTime(60 * 75 + 30), "1:15.50");
  assert.equal(formatTime(-5), "0:00.00");
  assert.equal(formatScore(1234567), "1,234,567");
});

test("Endless: 10줄마다 빨라지고 레벨 20에서 멈춘다. 이전 규칙(zen)은 메뉴에 없지만 찾을 수 있다", async () => {
  const { ENDLESS, ENDLESS_MAX_LEVEL, MODES, RECORD_MODES, ZEN, findMode } = await import("../../js/modes/index.js");
  const g = createGame({ rules: ENDLESS.rules, seed: 1, mode: ENDLESS });
  g.step();
  assert.equal(g.state.level, 1);
  g.state.stats.lines = 9;
  const ev = clearOneLine(g);
  assert.ok(ev.some(e => e.type === "levelUp" && e.level === 2));
  assert.equal(ENDLESS.levelFor({ stats: { lines: 500 } }), ENDLESS_MAX_LEVEL);
  assert.ok(ENDLESS.gravityFor({ level: ENDLESS_MAX_LEVEL }) >= 20, "끝에서는 20G 가까이");
  assert.ok(ENDLESS.gravityFor({ level: 2 }) > ENDLESS.gravityFor({ level: 1 }));

  assert.ok(MODES.includes(ENDLESS));
  assert.ok(!MODES.includes(ZEN), "이전 규칙은 메뉴에서 뺀다");
  assert.ok(RECORD_MODES.includes(ZEN), "기록 화면에서는 고를 수 있다");
  assert.equal(findMode("zen"), ZEN, "저장된 리플레이·기록은 이전 규칙으로 다시 계산한다");
  assert.equal(ZEN.gravityFor, undefined, "이전 규칙은 중력이 레벨 1 고정 그대로");
});

test("Master 등급: 100레벨마다 9급 → 1급, 900부터 초단, 999는 마스터", async () => {
  const { MASTER, masterGrade } = await import("../../js/modes/index.js");
  assert.equal(masterGrade(0), "9급");
  assert.equal(masterGrade(99), "9급");
  assert.equal(masterGrade(100), "8급");
  assert.equal(masterGrade(899), "1급");
  assert.equal(masterGrade(900), "초단");
  assert.equal(masterGrade(998), "초단");
  assert.equal(masterGrade(999), "마스터");
  assert.equal(MASTER.formatRecord({ level: 512 }), "레벨 512 · 4급");
  assert.equal(MASTER.summary({ level: 999, over: "clear" }).metric, "레벨 999 · 마스터");
});
