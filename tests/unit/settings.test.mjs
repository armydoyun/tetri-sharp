import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import {
  DEFAULT_SETTINGS,
  SDF_INFINITE,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  toEngineHandling,
} from "../../js/storage/settings.js";

test("저장된 값이 없거나 깨져 있으면 기본값", () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  assert.deepEqual(loadSettings(store).handling, DEFAULT_SETTINGS.handling);
  backend.setItem("tetrisharp:settings", "{not json");
  assert.deepEqual(loadSettings(store).handling, DEFAULT_SETTINGS.handling);
});

test("범위 밖·숫자가 아닌 값은 보정한다", () => {
  const s = sanitizeSettings({ handling: { das: -50, arr: 9999, sdf: "fast" } });
  assert.deepEqual(s.handling, { das: 0, arr: 83, sdf: 20 });
});

test("저장 → 다시 읽기", () => {
  const store = createStore(memoryBackend());
  saveSettings(store, { handling: { das: 100, arr: 0, sdf: SDF_INFINITE } });
  const s = loadSettings(store);
  assert.deepEqual(s.handling, { das: 100, arr: 0, sdf: SDF_INFINITE });
  assert.equal(s.v, 1);
});

test("저장소가 막혀도 예외 없이 기본값", () => {
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const store = createStore(throwing);
  assert.equal(store.set("settings", {}), false);
  assert.deepEqual(loadSettings(store).handling, DEFAULT_SETTINGS.handling);
  assert.deepEqual(loadSettings(createStore(null)).handling, DEFAULT_SETTINGS.handling);
});

test("엔진용 변환: ms → 프레임, SDF 맨 끝은 ∞", () => {
  const h = toEngineHandling({ das: 100, arr: 50, sdf: SDF_INFINITE });
  assert.equal(h.das, 6);
  assert.equal(h.arr, 3);
  assert.equal(h.sdf, Infinity);
  assert.equal(toEngineHandling({ das: 0, arr: 0, sdf: 20 }).sdf, 20);
});
