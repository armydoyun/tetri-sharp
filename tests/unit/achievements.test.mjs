import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_KEY,
  createAchievements,
  sanitizeAchievements,
} from "../../js/storage/achievements.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import { createBackup, parseBackup } from "../../js/storage/backup.js";
import { findMode } from "../../js/modes/index.js";
import { findVersus } from "../../js/modes/versus.js";
import { PUZZLES } from "../../js/modes/puzzles.js";

/** 끝난 판의 상태(필요한 값만) */
const finished = (over, patch = {}) => ({
  over,
  frame: 0,
  score: 0,
  level: 1,
  stats: { lines: 0, pieces: 10 },
  tally: { clears: {}, perfect: 0, maxCombo: 0, maxB2b: 0 },
  ...patch,
});
const context = (mode, state, extra = {}) => ({
  mode,
  state,
  real: true,
  won: false,
  puzzlesCleared: new Set(),
  puzzles: PUZZLES,
  ...extra,
});

test("업적: 처음 이룬 것만 돌려주고 남긴다, 같은 업적은 두 번 나오지 않는다", () => {
  const store = createStore(memoryBackend());
  const achievements = createAchievements(store);
  const sprint = findMode("sprint40");
  const run = finished("clear", {
    frame: 50 * 60,
    stats: { lines: 40, pieces: 100 },
    tally: { clears: { "none-4": 3, "full-2": 1 }, perfect: 0, maxCombo: 2, maxB2b: 4 },
  });
  const ids = achievements.evaluate(context(sprint, run), "2026-11-23T00:00:00Z").map(a => a.id);
  for (const id of ["first-line", "quad", "tsd", "b2b4", "sprint-clear", "sprint-2m", "sprint-1m", "rank-s"])
    assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("tst"));
  assert.deepEqual(achievements.evaluate(context(sprint, run)), [], "두 번째에는 없다");
  assert.equal(achievements.unlocked().quad, "2026-11-23T00:00:00Z");
});

test("업적: 연습·퍼즐에서 나온 T-spin은 플레이 업적으로 세지 않는다", () => {
  const achievements = createAchievements(createStore(memoryBackend()));
  const spin = finished("clear", {
    stats: { lines: 2, pieces: 1 },
    tally: { clears: { "full-2": 1 }, perfect: 0, maxCombo: 0, maxB2b: 1 },
  });
  const fresh = achievements.evaluate(context({ id: "puzzle-4", puzzle: {} }, spin, { real: false }));
  assert.ok(!fresh.some(a => a.id === "tsd" || a.id === "first-line"));
});

test("업적: CPU 승리는 난이도별, 퍼즐은 장 단위", () => {
  const achievements = createAchievements(createStore(memoryBackend()));
  const hard = findVersus("versus-hard");
  const ids = achievements.evaluate(context(hard, finished("win"), { won: true })).map(a => a.id);
  assert.ok(ids.includes("cpu-win") && ids.includes("cpu-hard") && !ids.includes("cpu-master"));
  const pc = new Set(PUZZLES.filter(p => p.kind === "pc").map(p => p.id));
  const puzzleIds = achievements
    .evaluate(context({ id: "puzzle-1", puzzle: {} }, finished("clear"), { real: false, puzzlesCleared: pc }))
    .map(a => a.id);
  assert.deepEqual(puzzleIds, ["puzzle-pc"], "판 비우기 장만, 30단계 전부는 아직");
});

test("업적 저장값: 모르는 id·날짜가 아닌 값은 버리고, 백업에 담겨 돌아온다", () => {
  assert.deepEqual(sanitizeAchievements({ quad: "2026-11-23T00:00:00Z", nope: "2026-11-23", tsd: 5, tst: "x" }), {
    quad: "2026-11-23T00:00:00Z",
  });
  assert.deepEqual(sanitizeAchievements([1, 2]), {});
  const store = createStore(memoryBackend());
  store.set(ACHIEVEMENTS_KEY, { quad: "2026-11-23T00:00:00Z" });
  const parsed = parseBackup(JSON.parse(JSON.stringify(createBackup(store))), findMode);
  assert.deepEqual(parsed.data[ACHIEVEMENTS_KEY], { quad: "2026-11-23T00:00:00Z" });
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length, "id가 겹치지 않는다");
});

test("Custom 규칙 판(real=false)은 모드 업적도 주지 않는다", async () => {
  const { ACHIEVEMENTS } = await import("../../js/storage/achievements.js");
  const { findMode } = await import("../../js/modes/index.js");
  const sprint = findMode("sprint40");
  const state = { over: "clear", frame: 50 * 60, score: 0, level: 1, stats: { lines: 40 }, tally: {} };
  const ctx = real => ({ mode: sprint, state, real, won: false, puzzlesCleared: new Set(), puzzles: [] });
  const got = real => ACHIEVEMENTS.filter(a => a.test(ctx(real))).map(a => a.id);
  assert.ok(got(true).includes("sprint-1m"));
  assert.equal(got(false).includes("sprint-1m"), false);
  assert.equal(got(false).includes("sprint-clear"), false);
});
