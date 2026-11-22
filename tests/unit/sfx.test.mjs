import { test } from "node:test";
import assert from "node:assert/strict";
import { SOUND_NAMES, createSfx, soundsFor } from "../../js/audio/sfx.js";
import { createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../../js/storage/settings.js";

test("이벤트 → 소리: 같은 프레임의 같은 소리는 한 번만", () => {
  assert.deepEqual(soundsFor([{ type: "move" }, { type: "move" }, { type: "rotate", kick: 0 }]), ["move", "rotate"]);
  assert.deepEqual(soundsFor([{ type: "rotate", kick: 2 }]), ["kick"]);
});

test("하드 드롭으로 고정하면 고정 소리 대신 하드 드롭 소리", () => {
  const lock = { type: "lock", lines: 0, tspin: "none", perfect: false, b2b: false, combo: -1 };
  assert.deepEqual(soundsFor([{ type: "hardDrop" }, lock]), ["hardDrop"]);
  assert.deepEqual(soundsFor([lock]), ["lock"]);
});

test("줄 삭제 종류마다 다른 소리, B2B·콤보는 덧붙인다", () => {
  const lock = o => ({ type: "lock", lines: 0, tspin: "none", perfect: false, b2b: false, combo: -1, ...o });
  assert.deepEqual(soundsFor([lock({ lines: 2 })]), ["clear2"]);
  assert.deepEqual(soundsFor([lock({ lines: 4, b2b: true, combo: 3 })]), ["quad", "b2b", "combo3"]);
  assert.deepEqual(soundsFor([lock({ lines: 2, tspin: "full" })]), ["tspin"]);
  assert.deepEqual(soundsFor([lock({ lines: 1, perfect: true })]), ["perfect"]);
  assert.deepEqual(soundsFor([lock({ combo: 40, lines: 1 })]), ["clear1", "combo12"]);
});

test("고르는 소리는 모두 정의돼 있다", () => {
  const lock = o => ({ type: "lock", lines: 0, tspin: "none", perfect: false, b2b: false, combo: -1, ...o });
  const all = [
    ...[0, 1, 2, 3, 4].map(lines => lock({ lines })),
    lock({ tspin: "mini" }),
    { type: "hold" },
    { type: "levelUp" },
    { type: "garbage" },
    { type: "practice", success: true },
    { type: "practice", success: false },
    { type: "gameOver" },
    { type: "finish", result: "clear" },
    { type: "finish", result: "timeUp" },
  ];
  for (const e of all) for (const name of soundsFor([e])) assert.ok(SOUND_NAMES.includes(name), name);
});

test("엔진은 좌우 이동마다 move 이벤트를 낸다", () => {
  const game = createGame({ rules: MODERN, seed: 3 });
  game.step();
  const events = game.step({ held: 1, pressed: 1 });
  assert.ok(events.some(e => e.type === "move"));
});

test("효과음 크기 설정: 기본은 음소거(0), 0~100으로 맞춘다", () => {
  assert.equal(DEFAULT_SETTINGS.volume, 0);
  assert.equal(sanitizeSettings({}).volume, 0);
  assert.equal(sanitizeSettings({ volume: 0 }).volume, 0);
  assert.equal(sanitizeSettings({ volume: 400 }).volume, 100);
  assert.equal(sanitizeSettings({ volume: "x" }).volume, 0);
});

test("같은 프레임의 클리어는 조작과 하드 드롭보다 앞에 들리도록 섞는다", () => {
  const previous = globalThis.AudioContext;
  const peaks = [];
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const source = { connect() {}, start() {}, stop() {}, frequency: parameter };
  globalThis.AudioContext = class {
    currentTime = 0;
    sampleRate = 10;
    createBuffer() {
      return { getChannelData: () => new Float32Array(2) };
    }
    createGain() {
      return {
        connect() {},
        gain: {
          ...parameter,
          exponentialRampToValueAtTime(value) {
            if (value > 0.0001) peaks.push(value);
          },
        },
      };
    }
    createOscillator() {
      return { ...source };
    }
    createBufferSource() {
      return { ...source };
    }
  };
  try {
    const sfx = createSfx({ getVolume: () => 100 });
    sfx.events([{ type: "move" }, { type: "rotate" }, { type: "hardDrop" }]);
    const actionPeaks = peaks.splice(0);
    sfx.events([{ type: "move" }, { type: "rotate" }, { type: "hardDrop" }, { type: "lock", lines: 1, tspin: "none" }]);
    assert.ok(actionPeaks.every((peak, i) => peaks[i] < peak));
    assert.ok(peaks.at(-1) > Math.max(...peaks.slice(0, -1)));
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});
