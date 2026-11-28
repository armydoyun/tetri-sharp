import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { launchOptions } from "../helpers/browser.mjs";

test("Web Audio 효과음: 소리 조각의 끝, 음량 변경, 정지를 무음까지 이어서 렌더링한다", async t => {
  const { outputFiles } = await build({
    stdin: {
      contents: 'export { createSfx, SOUND_SETS } from "./js/audio/sfx.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "iife",
    globalName: "audioTest",
    write: false,
  });
  const browser = await chromium.launch(launchOptions(chromium));
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addScriptTag({ content: outputFiles[0].text });

  const result = await page.evaluate(async () => {
    const rate = 48000;
    const duration = 0.14;
    const sample = seconds => Math.ceil(seconds * rate);
    const createContext = () => new OfflineAudioContext(1, sample(1), rate);
    const render = async change => {
      let volume = 100;
      const ctx = createContext();
      window.AudioContext = function () {
        return ctx;
      };
      const sfx = window.audioTest.createSfx({
        getVolume: () => volume,
        sets: { modern: { probe: [{ at: 0, f: 0, wave: "noise", gain: 0.8, dur: duration }] } },
      });
      // 일정한 입력을 흘려 잡음 파형의 영향을 빼고 게인 곡선만 관찰한다.
      const random = Math.random;
      Math.random = () => 1;
      try {
        sfx.play("probe");
      } finally {
        Math.random = random;
      }
      let changedAt = null;
      let retargetedAt = null;
      if (change) {
        void ctx.suspend(0.016).then(() => {
          changedAt = ctx.currentTime;
          if (change === "stop") sfx.stop();
          else {
            volume = 0;
            sfx.setVolume();
          }
          void ctx.resume();
        });
      }
      if (change === "retarget") {
        void ctx.suspend(0.024).then(() => {
          retargetedAt = ctx.currentTime;
          volume = 60;
          sfx.setVolume();
          void ctx.resume();
        });
      }
      const rendered = await ctx.startRendering();
      return { samples: rendered.getChannelData(0), changedAt, retargetedAt };
    };
    const steady = await render(null);
    const mute = await render("mute");
    const stopped = await render("stop");
    const retargeted = await render("retarget");
    const pivot = sample(retargeted.retargetedAt);
    const settled = sample(retargeted.retargetedAt + 0.018);
    const measure = ({ samples, changedAt }) => {
      const i = sample(changedAt);
      return {
        input: steady.samples[i - 1],
        before: samples[i - 1],
        after: samples[i],
        faded: samples[sample(changedAt + 0.008)] / steady.samples[sample(changedAt + 0.008)],
        rest: Math.max(...samples.subarray(sample(changedAt + 0.018), sample(0.1)).map(Math.abs)),
      };
    };
    const peaks = {};
    for (const name of Object.keys(window.audioTest.SOUND_SETS)) {
      const ctx = createContext();
      window.AudioContext = function () {
        return ctx;
      };
      const sfx = window.audioTest.createSfx({ getVolume: () => 100, getSet: () => name });
      sfx.events([
        { type: "hardDrop" },
        { type: "lock", lines: 4, tspin: "none", b2b: true, combo: 12 },
        { type: "levelUp" },
        { type: "finish", result: "clear" },
      ]);
      const data = (await ctx.startRendering()).getChannelData(0);
      peaks[name] = data.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0);
    }
    return {
      onset: steady.samples[sample(0.005)],
      retargetJump: Math.abs(retargeted.samples[pivot] - retargeted.samples[pivot - 1]),
      retargetGain: retargeted.samples[settled] / steady.samples[settled],
      tail: Math.max(...steady.samples.subarray(sample(0.005 + duration + 0.001), sample(0.17)).map(Math.abs)),
      mute: measure(mute),
      stopped: measure(stopped),
      peaks,
    };
  });

  assert.ok(Math.abs(result.onset) < 0.000001);
  assert.ok(result.retargetJump < 0.01);
  assert.ok(Math.abs(result.retargetGain - 0.36) < 0.001);
  assert.equal(result.tail, 0, "소리 조각이 끝나면 게인은 정확히 0");
  for (const [action, signal] of Object.entries({ mute: result.mute, stop: result.stopped })) {
    assert.ok(signal.input > 0.1, `${action}: ${JSON.stringify(signal)}`);
    assert.ok(Math.abs(signal.after - signal.before) < 0.01, `${action}: ${JSON.stringify(signal)}`);
    assert.ok(signal.faded > 0.35 && signal.faded < 0.65, action);
    assert.equal(signal.rest, 0, action);
  }
  for (const [theme, peak] of Object.entries(result.peaks)) {
    assert.ok(peak > 0.01 && peak < 1, `${theme}: peak ${peak}`);
  }
});
