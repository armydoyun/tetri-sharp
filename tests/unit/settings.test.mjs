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
  const s = sanitizeSettings({ handling: { das: -50, arr: 9999, sdf: "fast", dcd: 999 } });
  assert.deepEqual(s.handling, { das: 0, arr: 83, sdf: 20, dcd: 167 });
});

test("저장 → 다시 읽기", () => {
  const store = createStore(memoryBackend());
  saveSettings(store, { handling: { das: 100, arr: 0, sdf: SDF_INFINITE, dcd: 50 } });
  const s = loadSettings(store);
  assert.deepEqual(s.handling, { das: 100, arr: 0, sdf: SDF_INFINITE, dcd: 50 });
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

test("화면 색 설정: 기본은 시스템, 라이트·다크만 받는다", async () => {
  const { sanitizeSettings: clean } = await import("../../js/storage/settings.js");
  assert.equal(clean({}).scheme, "system");
  assert.equal(clean({ scheme: "dark" }).scheme, "dark");
  assert.equal(clean({ scheme: "light" }).scheme, "light");
  assert.equal(clean({ scheme: "blue" }).scheme, "system");
});

test("게임 중 화면 설정: 기본은 늘 어둡게, 정해진 값만 받는다", async () => {
  const { sanitizeSettings: clean } = await import("../../js/storage/settings.js");
  assert.equal(clean({}).gameSurface, "dark");
  assert.equal(clean({ gameSurface: "scheme" }).gameSurface, "scheme");
  assert.equal(clean({ gameSurface: "pink" }).gameSurface, "dark");
});
