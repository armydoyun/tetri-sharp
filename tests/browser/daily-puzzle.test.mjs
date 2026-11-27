import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "../../tools/build.mjs";
import { launchOptions } from "../helpers/browser.mjs";
import { dailyPuzzleTitle } from "../../js/modes/daily-puzzle.js";
import { generateDay } from "../../js/modes/daily-puzzle-generation.js";

test("본편 오늘의 퍼즐: 날짜 시드로 플레이하고 새로고침 뒤 이어서 풀면 완료가 남는다", { timeout: 45_000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tetri-daily-game-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { outFile } = await build({ outFile: path.join(dir, "index.html") });
  const html = await fs.readFile(outFile);
  const server = http.createServer((req, res) =>
    req.url === "/"
      ? res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
      : res.writeHead(404).end()
  );
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const browser = await chromium.launch(launchOptions(chromium));
  t.after(() => browser.close());
  const page = await browser.newPage({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 390, height: 844 },
  });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-11-26T01:00:00Z"));
  await page.addInitScript(() => {
    if (!localStorage.getItem("tetrisharp:settings"))
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  // 이후에도 페이지 자체만 열리도록 해 오프라인 배포본의 Worker 사용을 검증한다.
  await page.route("**/*", route => (route.request().url() === url ? route.continue() : route.abort()));
  const workerReady = page.waitForEvent("worker");
  await page.locator("#open-daily-puzzle").click();
  await workerReady;
  const play = page.locator("#daily-puzzle-play");
  await play.and(page.locator(":enabled")).waitFor();
  const today = generateDay("2026-11-26");
  const name = dailyPuzzleTitle(today.family, today.key, today.cells);
  assert.equal(await page.locator("#daily-puzzle-name").textContent(), name);
  assert.equal(await page.locator("#daily-puzzle-type").textContent(), "짧은 판 비우기");
  assert.equal(await page.locator("#daily-puzzle-level").textContent(), "입문");
  assert.equal(await page.locator("#daily-puzzle-pieces").textContent(), "J");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await play.click();
  await page.waitForFunction(() => document.body.dataset.screen === "play");

  const goal = page.locator("#puzzle-goal-hud");
  await goal.getByRole("heading", { name: "퍼펙트 클리어" }).waitFor();
  assert.equal(await goal.locator(".goal-value").textContent(), "남은 줄 3");

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:run:suspended")));
  assert.equal(saved.puzzle, today.code);
  assert.deepEqual(saved.dailyPuzzle, { key: "2026-11-26", family: "fill" });
  await page.reload();
  assert.ok((await page.locator("#continue-run-info").textContent()).includes(`${name} · 2026-11-26`));
  await page.locator("#continue-run").click();
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (const key of ["ArrowUp", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Space"]) {
    await page.keyboard.press(key, { delay: 50 });
  }
  await page.locator("#results").waitFor();
  assert.equal(await page.locator("#results-title").textContent(), "성공!");
  assert.equal(await goal.locator(".goal-status").textContent(), "목표 달성");
  assert.equal(await goal.locator(".goal-value").textContent(), "남은 줄 0");
  assert.ok((await page.locator("#results-mode").textContent()).includes(`${name} · 2026-11-26`));
  await page.locator('#results [data-action="menu"]').click();
  await page.locator("#daily-puzzle[open]").waitFor();
  await page.locator("#daily-puzzle-status").filter({ hasText: "이 퍼즐을 풀었어요." }).waitFor();
  await page.locator("#daily-puzzle-close").click();

  await page.clock.setFixedTime(new Date("2026-11-27T01:00:00Z"));
  await page.locator("#open-daily-puzzle").click();
  await play.and(page.locator(":enabled")).waitFor();
  assert.equal(await page.locator("#daily-puzzle-type").textContent(), "콤보 설계");
  assert.equal(await page.locator("#daily-puzzle-status").textContent(), "");
  await page.locator("#daily-puzzle-date").click();
  assert.equal(await page.getByRole("option").count(), 7);
  await page.getByRole("option", { name: "2026-11-26 · 완료", exact: true }).click();
  await play.and(page.locator(":enabled")).waitFor();
  assert.equal(await page.locator("#daily-puzzle-name").textContent(), name);
  assert.equal(await page.locator("#daily-puzzle-status").textContent(), "이 퍼즐을 풀었어요.");
  await page.click("#daily-puzzle-archive");
  const archive = page.locator("[data-daily-archive]");
  await archive.getByRole("button", { name: "더 오래된 날짜" }).click();
  await archive.getByText("2026-10-31 – 2026-11-13", { exact: true }).waitFor();
  await archive.getByRole("button", { name: "더 최근 날짜" }).click();
  await archive.locator('[data-archive-date="2026-11-26"]').waitFor({ timeout: 40_000 });
  await page.click("#daily-archive-status");
  await page.getByRole("option", { name: "완료", exact: true }).click();
  assert.deepEqual(
    await archive.locator("[data-archive-date]").evaluateAll(rows => rows.map(row => row.dataset.archiveDate)),
    ["2026-11-26"]
  );
  await page.click("#daily-archive-goal");
  await page.getByRole("option", { name: "콤보 이어 가기", exact: true }).click();
  await page.getByText("이 기간에 조건에 맞는 퍼즐이 없어요.").waitFor();
  await page.click("#daily-archive-goal");
  await page.getByRole("option", { name: "모든 목표", exact: true }).click();
  await page.click("#daily-archive-level");
  await page.getByRole("option", { name: "입문", exact: true }).click();
  await archive.locator('[data-archive-date="2026-11-26"]').click();
  await play.click();
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:run:suspended")));
  assert.equal(reopened.puzzle, today.code);
  assert.equal(reopened.dailyPuzzle.key, today.key);
  assert.deepEqual(errors, []);
});
