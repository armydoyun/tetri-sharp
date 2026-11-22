import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import { createBackup, parseBackup, restoreBackup } from "../../js/storage/backup.js";
import { DEFAULT_SETTINGS, saveSettings, loadSettings } from "../../js/storage/settings.js";
import { createRecords } from "../../js/storage/records.js";
import { createRecorder, createReplayStore } from "../../js/replay/replay.js";
import { SPRINT_40, findMode } from "../../js/modes/index.js";
import { MODERN } from "../../js/rules/presets.js";
import { createGame } from "../../js/core/engine.js";

const sampleReplay = () => {
  const game = createGame({ rules: MODERN, seed: 5, mode: SPRINT_40 });
  const rec = createRecorder({ seed: 5, mode: SPRINT_40, rules: MODERN, handling: game.handling });
  for (let i = 0; i < 120; i++) {
    const held = i % 20 === 0 ? 8 : 0;
    rec.input(held, 0);
    game.step({ held });
  }
  return rec.finish(game.state);
};

const filledStore = () => {
  const store = createStore(memoryBackend());
  saveSettings(store, { ...DEFAULT_SETTINGS, volume: 20 });
  const records = createRecords(store);
  records.setPlayerName("테스터");
  records.add(SPRINT_40, MODERN, { frames: 3000, lines: 40, pieces: 100, date: "2026-01-01T00:00:00Z" });
  const replays = createReplayStore(store, findMode);
  replays.saveLast(sampleReplay());
  store.set("lastMode", "marathon");
  return store;
};

test("백업 → JSON → 다른 브라우저(빈 저장소)로 그대로 옮긴다", () => {
  const from = filledStore();
  const file = JSON.parse(JSON.stringify(createBackup(from)));
  const parsed = parseBackup(file, findMode);
  assert.ok(parsed);
  assert.deepEqual(parsed.summary, { records: 1, replays: 1, puzzles: 0, practice: 0, attempts: 0 });

  const to = createStore(memoryBackend());
  assert.equal(restoreBackup(to, parsed), true);
  assert.equal(loadSettings(to).volume, 20);
  const records = createRecords(to);
  assert.equal(records.playerName, "테스터");
  assert.equal(records.best(SPRINT_40, MODERN).frames, 3000);
  assert.ok(createReplayStore(to, findMode).last());
  assert.equal(to.get("lastMode", null), "marathon");
});

test("백업 파일이 아니거나 망가진 항목은 받지 않는다", () => {
  assert.equal(parseBackup(null, findMode), null);
  assert.equal(parseBackup({ app: "tetri-sharp", v: 1, seed: 1 }, findMode), null, "리플레이 파일은 백업이 아니다");
  assert.equal(parseBackup({ app: "other", kind: "backup", v: 1, data: {} }, findMode), null);

  const parsed = parseBackup(
    {
      app: "tetri-sharp",
      kind: "backup",
      v: 1,
      data: {
        settings: { volume: 9999, handling: { das: -5 } },
        records: {
          "sprint40|modern": [{ frames: 10, lines: 40, pieces: 99 }, { frames: -1 }],
          "bad key!": [{ frames: 1, lines: 1, pieces: 1 }],
        },
        playerName: 42,
        "replay:last": { app: "tetri-sharp", v: 1, seed: "x" },
        "replay:best": { "sprint40|modern": [{ nope: true }] },
        unknown: "버린다",
      },
    },
    findMode
  );
  assert.ok(parsed);
  assert.equal(parsed.data.settings.volume, 100);
  assert.equal(parsed.data.settings.handling.das, 0);
  assert.deepEqual(Object.keys(parsed.data.records), ["sprint40|modern"]);
  assert.equal(parsed.data.records["sprint40|modern"].length, 1);
  assert.equal("playerName" in parsed.data, false);
  assert.equal("replay:last" in parsed.data, false);
  assert.deepEqual(parsed.data["replay:best"], {});
  assert.equal("unknown" in parsed.data, false);
  assert.deepEqual(parsed.summary, { records: 1, replays: 0, puzzles: 0, practice: 0, attempts: 0 });
});

test("불러오면 백업에 없는 기록은 사라지고 설정은 기본값이 된다", () => {
  const store = filledStore();
  const parsed = parseBackup({ app: "tetri-sharp", kind: "backup", v: 1, data: {} }, findMode);
  restoreBackup(store, parsed);
  assert.equal(createRecords(store).best(SPRINT_40, MODERN), null);
  assert.equal(loadSettings(store).volume, DEFAULT_SETTINGS.volume);
  assert.equal(createReplayStore(store, findMode).last(), null);
});

test("진행도 미리보기에는 검사에 통과한 항목만 센다", () => {
  const parsed = parseBackup(
    {
      app: "tetri-sharp",
      kind: "backup",
      v: 1,
      data: {
        "puzzle:cleared": [1, 1, 2, -1],
        "practice:progress": { "intro-1": "clear", "intro-2": "no-hints", "intro-3": "invalid" },
        "sprint:history": {
          modern: [
            { frames: 40, cleared: false },
            { frames: -1, cleared: true },
          ],
          retro: [{ frames: 80, cleared: true }],
        },
      },
    },
    findMode
  );
  assert.deepEqual(parsed.summary, { records: 0, replays: 0, puzzles: 2, practice: 2, attempts: 2 });
});

test("복원 쓰기가 실패하면 예전 키와 이미 복원한 데이터가 보존된다", () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  const observer = createStore(backend);
  store.set("playerName", "기존 이름");
  store.set("puzzle:cleared", [1]);
  const oldBackup = parseBackup(createBackup(filledStore()), findMode);
  const setItem = backend.setItem;
  let refuseRestore = true;
  backend.setItem = (key, value) => {
    if (refuseRestore && key === "tetrisharp:restore") throw new DOMException("quota", "QuotaExceededError");
    setItem(key, value);
  };

  const before = new Map(backend.map);
  assert.equal(restoreBackup(store, oldBackup), false);
  assert.deepEqual(backend.map, before);
  assert.equal(observer.get("playerName", null), "기존 이름");

  refuseRestore = false;
  assert.equal(restoreBackup(store, oldBackup), true);
  assert.equal(observer.get("playerName", null), "테스터");
  assert.deepEqual(observer.get("puzzle:cleared", null), [1], "이전 파일에 없는 진행도 보존");
  const settings = observer.get("settings", null);
  settings.volume = 0;
  assert.equal(loadSettings(observer).volume, 20);
  assert.equal(store.set("playerName", "복원 뒤 이름"), true);

  refuseRestore = true;
  const after = new Map(backend.map);
  assert.equal(restoreBackup(store, oldBackup), false);
  assert.deepEqual(backend.map, after);
  assert.equal(observer.get("playerName", null), "복원 뒤 이름");
  assert.equal(restoreBackup(createStore(null), oldBackup), false);
});
