import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { buildThemePreview } from "../../tools/build-theme-preview.mjs";
import { launchOptions } from "../helpers/browser.mjs";

test("독립 테마 견본에서 보드를 비교하고 효과음을 재생·정지한다", { timeout: 30_000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tetri-theme-preview-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const html = await fs.readFile(await buildThemePreview(path.join(temp, "preview.html")));
  const server = http.createServer((_, res) =>
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
  );
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/theme-preview.html`;
  const browser = await chromium.launch(launchOptions(chromium));
  t.after(() => browser.close());

  const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  // 실제 Web Audio를 쓰면서 자동 재생과 출력 연결 해제를 관찰한다.
  await page.addInitScript(() => {
    window.auditionAudio = { contexts: 0, connections: 0, stops: 0, tones: 0 };
    const counter = window.auditionAudio;
    window.AudioContext = class extends AudioContext {
      constructor() {
        super();
        counter.contexts++;
      }
      createGain() {
        const gain = super.createGain();
        const connect = gain.connect.bind(gain);
        const disconnect = gain.disconnect.bind(gain);
        const destination = this.destination;
        let output = false;
        gain.connect = (node, ...args) => {
          if (node === destination) {
            output = true;
            counter.connections++;
          }
          return connect(node, ...args);
        };
        gain.disconnect = (...args) => {
          if (output) counter.stops++;
          return disconnect(...args);
        };
        return gain;
      }
      createOscillator() {
        counter.tones++;
        return super.createOscillator();
      }
    };
  });
  await page.goto(url);
  await page.context().setOffline(true);
  assert.equal(await page.locator("#candidate-name").textContent(), "포슬린");
  assert.equal(await page.locator("#audition-reference").getAttribute("data-value"), "white");
  assert.equal(await page.evaluate(() => window.auditionAudio.contexts), 0);

  const canvas = page.locator("#candidate-board");
  assert.equal((await canvas.boundingBox()).y, (await page.locator("#reference-board").boundingBox()).y);
  const stamp = () => canvas.evaluate(el => el.toDataURL());
  const before = await stamp();
  await page.getByRole("button", { name: "릴레이", exact: false }).first().click();
  assert.equal(await page.locator("#candidate-name").textContent(), "릴레이");
  assert.notEqual(await stamp(), before);
  assert.equal(await page.locator("#audition-reference").getAttribute("data-value"), "frame");

  const motion = page.getByRole("button", { name: "보드 동작 보기" });
  const still = await stamp();
  await motion.click();
  await page.waitForFunction(still => document.querySelector("#candidate-board").toDataURL() !== still, still);
  await motion.click();
  assert.equal(await stamp(), still);

  await page.locator("#audition-reference").click();
  await page.getByRole("option").filter({ hasText: "스튜디오" }).click();
  assert.equal(await page.locator("#audition-reference").getAttribute("data-value"), "modern");

  await page.getByRole("button", { name: "A/B 비교" }).click();
  await page.getByRole("button", { name: "게임 오버" }).click();
  const status = page.locator("#play-status");
  await status.filter({ hasText: "릴레이 · 게임 오버 재생 중" }).waitFor();
  await status.filter({ hasText: "스튜디오 · 게임 오버 재생 중" }).waitFor();
  await status.filter({ hasText: "재생 완료" }).waitFor();
  const played = await page.evaluate(() => window.auditionAudio);
  assert.deepEqual(played, { contexts: 1, connections: 1, stops: 1, tones: 7 });

  await page.getByRole("button", { name: "연속 재생" }).click();
  await page.getByRole("button", { name: "정지" }).click();
  assert.equal(await status.textContent(), "재생을 멈췄어요.");
  assert.equal(await page.evaluate(() => window.auditionAudio.stops), 2);
  await page.getByRole("slider", { name: "음량" }).focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "하드 드롭" }).click();
  assert.equal(await status.textContent(), "음량이 0이에요.");
  assert.equal(await page.evaluate(() => window.auditionAudio.connections), 2);
  const choices = page.locator("#audition-candidates button");
  assert.equal(await choices.count(), 11);
  for (const name of ["프레스", "필름", "우편", "카본", "체스넛", "백야", "먹빛"]) {
    await choices.getByText(name, { exact: true }).click();
    assert.equal(await page.locator("#candidate-name").textContent(), name);
  }
  await page.getByRole("slider", { name: "음량" }).focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "게임 오버" }).click();
  await status.filter({ hasText: "먹빛 · 게임 오버 재생 중" }).waitFor();
  await status.filter({ hasText: "재생 완료" }).waitFor();
  assert.ok((await page.evaluate(() => window.auditionAudio.connections)) > 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [url]);

  for (const [locale, width, height] of [
    ["ko-KR", 360, 800],
    ["en-US", 390, 844],
    ["en-US", 844, 390],
  ]) {
    const mobile = await browser.newPage({
      locale,
      viewport: { width, height },
      reducedMotion: "reduce",
      isMobile: true,
    });
    await mobile.goto(url);
    const layout = await mobile.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      sounds: document.querySelectorAll("[data-sound]").length,
      clipped: [...document.querySelectorAll(".select-value, .btn-label, .choice-card strong")].filter(
        label => label.scrollWidth > label.clientWidth + 1
      ).length,
    }));
    assert.equal(layout.width, layout.viewport, `${locale} ${width} 가로 넘침`);
    assert.equal(layout.sounds, 14);
    assert.equal(layout.clipped, 0, `${locale} ${width} 단추 이름 잘림`);
    await mobile.close();
  }
});
