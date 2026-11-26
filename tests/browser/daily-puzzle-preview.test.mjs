import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { buildDailyPuzzlePreview } from "../../tools/build-daily-puzzle-preview.mjs";
import { launchOptions } from "../helpers/browser.mjs";

test("오늘의 퍼즐 견본: 날짜·유형을 비교하고 인터넷 없이 실제 퍼즐을 연다", { timeout: 90_000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tetri-daily-preview-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { outFile } = await buildDailyPuzzlePreview(path.join(dir, "preview.html"));
  const html = await fs.readFile(outFile);
  const server = http.createServer((_, res) =>
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
  );
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const browser = await chromium.launch(launchOptions(chromium));
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.context().setOffline(true);
  await page.locator("#sample-days li").first().waitFor();
  assert.equal(await page.locator("#sample-days li").count(), 90);
  assert.equal(await page.locator("#selected-date").textContent(), "2026-11-26");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  const stamp = () => page.locator("#sample-board").evaluate(canvas => canvas.toDataURL());
  const first = await stamp();
  await page.locator("#show-solution").click();
  assert.notEqual(await stamp(), first);
  await page.locator("#show-solution").click();
  assert.equal(await stamp(), first);

  const openGame = async () => {
    const [game] = await Promise.all([page.context().waitForEvent("page"), page.locator("#play-puzzle").click()]);
    await game.waitForFunction(() => document.body.dataset.screen === "play");
    return game;
  };
  const beginner = await openGame();
  for (const key of ["ArrowUp", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Space"]) {
    await beginner.keyboard.press(key, { delay: 50 });
  }
  await beginner.locator("#results").waitFor();
  assert.equal(await beginner.locator("#results-title").textContent(), "성공!");
  await beginner.close();

  await page.locator("#daily-sample-filter").click();
  await page.getByRole("option", { name: "홀드 순서" }).click();
  assert.ok((await page.locator("#sample-days li").count()) < 90);
  assert.equal(await page.locator("#selected-family").textContent(), "홀드 순서");
  await page.locator("#show-solution").click();
  assert.match(await page.locator("#solution-status").textContent(), /홀드 후/);
  await page.getByRole("button", { name: "다음 수" }).click();
  assert.match(await page.locator("#solution-controls output").textContent(), /^2 /);

  const game = await openGame();
  assert.ok(await game.locator("#board").isVisible());
  assert.ok(await game.locator("#downstack-hint").isVisible());
  assert.deepEqual(errors, []);
});
