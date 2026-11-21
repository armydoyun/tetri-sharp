import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import { createPracticeProgress } from "../../js/storage/practice-progress.js";
import { createSprintHistory, recentSprintMedian } from "../../js/storage/sprint-history.js";
import { createBackup, parseBackup, restoreBackup } from "../../js/storage/backup.js";
import { findMode } from "../../js/modes/index.js";

test("힌트 없이 완료한 훈련과 퍼즐 진행도, 규칙별 Sprint 시도가 백업으로 이동한다", () => {
  const store = createStore(memoryBackend());
  const progress = createPracticeProgress(store);
  progress.mark("downstack-1", true);
  assert.equal(progress.read()["downstack-1"], "clear");
  progress.mark("downstack-1");
  progress.mark("downstack-1", true);
  progress.mark("finesse-lesson-1");
  store.set("puzzle:cleared", [1, 3, 3, 99]);
  const history = createSprintHistory(store);
  for (let frames = 1; frames <= 25; frames++) history.add("modern", frames, frames % 2 === 0);
  history.add("retro", 100, false);

  const fresh = createStore(memoryBackend());
  assert.ok(restoreBackup(fresh, parseBackup(createBackup(store), findMode)));
  assert.deepEqual(createPracticeProgress(fresh).read(), { "downstack-1": "no-hints", "finesse-lesson-1": "no-hints" });
  assert.deepEqual(fresh.get("puzzle:cleared", null), [1, 3]);
  const runs = createSprintHistory(fresh).list("modern");
  assert.equal(runs.length, 20);
  assert.equal(runs[0].frames, 6);
  assert.equal(recentSprintMedian(runs), 20);
  assert.equal(recentSprintMedian(createSprintHistory(fresh).list("retro")), null);
});

test("이전 백업을 불러와도 새 진행도와 Sprint 시도는 그대로다", () => {
  const store = createStore(memoryBackend());
  createPracticeProgress(store).mark("intro-1");
  createSprintHistory(store).add("modern", 125, false);
  const old = createBackup(createStore(memoryBackend()));
  assert.ok(restoreBackup(store, parseBackup(old, findMode)));
  assert.equal(createPracticeProgress(store).read()["intro-1"], "no-hints");
  assert.equal(createSprintHistory(store).list("modern")[0].frames, 125);
});
