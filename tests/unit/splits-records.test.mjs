import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceSplits, formatDelta, splitDelta } from "../../js/modes/splits.js";
import { SPRINT_40, ZEN } from "../../js/modes/index.js";
import { MODERN, RETRO } from "../../js/rules/presets.js";
import { createRecords, recordKey } from "../../js/storage/records.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";

test("구간 기록: 줄 수가 구간에 닿을 때마다 그 프레임을 남기고, 한 번에 여러 구간도 처리", () => {
  const marks = SPRINT_40.splits;
  let s = advanceSplits(marks, [], 9, 100);
  assert.deepEqual(s, []);
  s = advanceSplits(marks, s, 10, 600);
  assert.deepEqual(s, [600]);
  s = advanceSplits(marks, s, 10, 700);
  assert.deepEqual(s, [600], "같은 구간은 한 번만");
  s = advanceSplits(marks, s, 21, 1300);
  assert.deepEqual(s, [600, 1300]);
  s = advanceSplits(marks, s, 44, 2500);
  assert.deepEqual(s, [600, 1300, 2500, 2500], "한 번에 두 구간을 넘으면 둘 다 같은 프레임");
});

test("PB 대비: 가장 최근 구간 기준, 앞서면 음수, 비교할 게 없으면 —", () => {
  assert.equal(splitDelta([], [600]), null);
  assert.equal(splitDelta([570], undefined), null);
  assert.equal(splitDelta([570], [600]), -0.5);
  assert.equal(splitDelta([570, 1290], [600, 1200]), 1.5);
  assert.equal(formatDelta(-0.5), "-0.50");
  assert.equal(formatDelta(1.5), "+1.50");
  assert.equal(formatDelta(0), "+0.00");
  assert.equal(formatDelta(null), "—");
});

test("기록: 구간은 숫자 배열일 때만 남고, 규칙별 기록표 목록을 알려 준다", () => {
  const backend = memoryBackend();
  const records = createRecords(createStore(backend));
  const e = (frames, splits) => ({ frames, lines: 40, pieces: 100, splits, date: "2026-01-01T00:00:00.000Z" });
  records.add(SPRINT_40, MODERN, e(3000, [700, 1500, 2300, 3000]));
  records.add(SPRINT_40, RETRO, e(4000, ["x"]));
  records.add(SPRINT_40, { id: "custom-abc1234" }, e(5000, undefined));
  records.add(ZEN, MODERN, { ...e(100), lines: 3 });
  assert.deepEqual(records.best(SPRINT_40, MODERN).splits, [700, 1500, 2300, 3000]);
  assert.equal(records.best(SPRINT_40, RETRO).splits, undefined, "잘못된 구간은 버린다");
  assert.deepEqual(records.rulesIdsFor(SPRINT_40).sort(), ["custom-abc1234", "modern", "retro"]);
  assert.deepEqual(records.rulesIdsFor(ZEN), ["modern"]);
  assert.equal(recordKey(SPRINT_40, { id: "custom-abc1234" }), "sprint40|custom-abc1234");
});
