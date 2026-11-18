import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, VISIBLE_TOP, createGame } from "../../js/core/engine.js";
import { HEIGHT, WIDTH, set } from "../../js/core/board.js";
import { SPRINT_40, ZEN, findMode } from "../../js/modes/index.js";
import { MODERN, RETRO } from "../../js/rules/presets.js";
import { createRecords, recordKey } from "../../js/storage/records.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";

/** 바닥 줄을 오른쪽 끝 열만 남기고 채운 뒤 세로 I를 떨어뜨려 한 줄을 지운다. */
const clearOneLine = g => {
  for (let x = 0; x < WIDTH - 1; x++) set(g.state.board, x, HEIGHT - 1, 8);
  g.state.active = { type: "I", rot: 1, x: WIDTH - 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  return g.step({ pressed: BTN.HARD });
};

test("Sprint 40L: 40줄째에 끝나고 결과는 clear", () => {
  const g = createGame({ rules: SPRINT_40.rules, seed: 1, mode: SPRINT_40 });
  g.step();
  g.state.stats.lines = 39;
  const ev = clearOneLine(g);
  assert.ok(ev.some(e => e.type === "finish" && e.result === "clear"));
  assert.equal(g.state.over, "clear");
  assert.equal(g.state.active, null);
  assert.ok(SPRINT_40.isRecordable(g.state));
  assert.deepEqual(g.step({ pressed: BTN.HARD }), [], "끝난 뒤에는 진행하지 않는다");
});

test("Sprint 40L: 39줄까지는 계속, HUD는 남은 줄", () => {
  const g = createGame({ rules: SPRINT_40.rules, seed: 1, mode: SPRINT_40 });
  g.step();
  g.state.stats.lines = 38;
  clearOneLine(g);
  assert.equal(g.state.over, null);
  assert.equal(SPRINT_40.hudLines(g.state).value, "1");
});

test("Sprint 40L: 막혀서 끝나면 기록하지 않는다", () => {
  const g = createGame({ rules: SPRINT_40.rules, seed: 1, mode: SPRINT_40 });
  for (let y = 0; y < HEIGHT; y++) for (let x = 1; x < WIDTH; x++) set(g.state.board, x, y, 8);
  g.step();
  assert.equal(g.state.over, "blockOut");
  assert.equal(SPRINT_40.isRecordable(g.state), false);
});

test("findMode: 모르는 id면 Sprint", () => {
  assert.equal(findMode("zen"), ZEN);
  assert.equal(findMode("nope"), SPRINT_40);
  assert.equal(findMode(null), SPRINT_40);
});

const entry = (frames, lines = 40) => ({ frames, lines, pieces: 100, date: "2026-01-01T00:00:00.000Z" });

test("기록: Sprint는 시간이 짧을수록 위, 새 기록 여부와 순위", () => {
  const records = createRecords(createStore(memoryBackend()));
  assert.equal(records.best(SPRINT_40, MODERN), null);
  assert.deepEqual(records.add(SPRINT_40, MODERN, entry(3600)), { rank: 0, isBest: true, previousBest: null });
  const r2 = records.add(SPRINT_40, MODERN, entry(4000));
  assert.equal(r2.rank, 1);
  assert.equal(r2.isBest, false);
  const r3 = records.add(SPRINT_40, MODERN, entry(3000));
  assert.ok(r3.isBest);
  assert.equal(r3.previousBest.frames, 3600);
  assert.deepEqual(
    records.list(SPRINT_40, MODERN).map(e => e.frames),
    [3000, 3600, 4000]
  );
});

test("기록: Endless는 줄이 많을수록 위, 모드·규칙별로 따로, 10개까지", () => {
  const records = createRecords(createStore(memoryBackend()));
  for (let i = 1; i <= 12; i++) records.add(ZEN, MODERN, entry(100, i));
  assert.equal(records.list(ZEN, MODERN).length, 10);
  assert.equal(records.best(ZEN, MODERN).lines, 12);
  assert.equal(records.best(SPRINT_40, MODERN), null);
  assert.notEqual(recordKey(ZEN, MODERN), recordKey(SPRINT_40, MODERN));
  assert.notEqual(recordKey(ZEN, MODERN), recordKey(ZEN, RETRO));
  assert.equal(recordKey(SPRINT_40, MODERN), "sprint40|modern", "기존 기록 키와 호환");
});

test("기록: 깨진 저장값은 무시한다", () => {
  const backend = memoryBackend();
  backend.setItem(
    "tetrisharp:records",
    JSON.stringify({ [recordKey(SPRINT_40, MODERN)]: [{ frames: "x" }, entry(500)] })
  );
  const records = createRecords(createStore(backend));
  assert.deepEqual(
    records.list(SPRINT_40, MODERN).map(e => e.frames),
    [500]
  );
});
