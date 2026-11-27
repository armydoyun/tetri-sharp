import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { buildPuzzleGoalPreview } from "../../tools/build-theme-preview.mjs";
import { launchOptions } from "../helpers/browser.mjs";

test("퍼즐 목표 견본: 단계·테마를 바꾸고 같은 카드에서 목표 달성을 비교한다", { timeout: 30_000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "tetri-goal-preview-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const html = await fs.readFile(await buildPuzzleGoalPreview(path.join(temp, "preview.html")));
  const server = http.createServer((_, res) =>
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
  );
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch(launchOptions(chromium));
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  const requests = [];
  const errors = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.context().setOffline(true);
  const values = () => page.locator(".goal-value").allTextContents();
  const sizes = () =>
    page.locator(".goal-card").evaluateAll(cards => cards.map(card => [card.clientWidth, card.clientHeight]));
  const initialSizes = await sizes();
  assert.ok(initialSizes.every(([w, h]) => Math.abs(w - initialSizes[0][0]) <= 1 && h === initialSizes[0][1]));
  assert.deepEqual(await values(), ["0 / 2", "한 번에 2줄", "남은 줄 3"]);
  await page.getByRole("button", { name: "진행 중" }).click();
  assert.deepEqual(await values(), ["1 / 2", "한 번에 2줄", "남은 줄 2"]);
  assert.equal(await page.locator('[data-goal="tsd"] .goal-mark[data-filled="true"]').count(), 0);
  await page.getByRole("button", { name: "목표 달성" }).click();
  assert.deepEqual(await values(), ["2 / 2", "한 번에 2줄", "남은 줄 0"]);
  assert.equal(await page.locator('.goal-hud[data-complete="true"]').count(), 3);
  assert.deepEqual(await sizes(), initialSizes);
  const canvas = page.locator(".goal-board").first();
  const pixels = () => canvas.evaluate(el => el.toDataURL());
  const before = await pixels();
  await page.locator("#goal-theme-select").click();
  await page.getByRole("option", { name: "페이퍼" }).click();
  assert.notEqual(await pixels(), before);
  assert.deepEqual(await values(), ["2 / 2", "한 번에 2줄", "남은 줄 0"]);

  await page.getByRole("button", { name: "연속 재생" }).click();
  assert.deepEqual(await values(), ["0 / 2", "한 번에 2줄", "남은 줄 3"]);
  await page.waitForFunction(() => document.querySelector('[data-goal="pc"] .goal-value').textContent === "남은 줄 0");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [url]);

  const mobile = await browser.newPage({
    locale: "en-US",
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  });
  await mobile.goto(url);
  await mobile.getByRole("button", { name: "Complete" }).click();
  const layout = await mobile.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    animations: [...document.querySelectorAll(".goal-hud")].flatMap(hud => hud.getAnimations()).length,
  }));
  assert.deepEqual(layout, { fits: true, animations: 0 });
});
