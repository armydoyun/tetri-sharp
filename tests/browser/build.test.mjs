// 한 파일짜리 배포본을 임시 폴더에 만들고, 그 파일 하나만 제공하는 서버에서 실제 Chromium으로 연다.
// 다른 요청은 모두 막는다 → 번들이 외부 파일 없이 혼자 도는지 확인한다.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "../../tools/build.mjs";
import { launchOptions } from "../helpers/browser.mjs";

let dir, html, result, server, url, browser;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tetrisharp-build-"));
  result = await build({ outFile: path.join(dir, "index.html") });
  html = fs.readFileSync(result.outFile, "utf8");
  server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch(launchOptions(chromium));
});

after(async () => {
  await browser?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("결과는 파일 하나이고 바깥 파일을 참조하지 않는다", () => {
  assert.deepEqual(fs.readdirSync(dir), ["index.html"]);
  assert.ok(!html.includes('type="module"'));
  assert.ok(!/<link rel="stylesheet"/.test(html));
  assert.ok(result.bytes < 1024 * 1024, `배포본 크기 ${result.bytes} bytes`);
});

test("브라우저에서 오류 없이 뜨고 보드를 그린다", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const blocked = [];
  await context.route("**/*", route => {
    if (route.request().url() === url) return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));

  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 5000 });

  assert.equal(await page.title(), "Tetri#");
  const painted = await page.evaluate(() => {
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) opaque++;
    return { w: c.width, h: c.height, opaque };
  });
  assert.equal(painted.w * 2, painted.h, "보드 비율은 10:20");
  assert.ok(painted.opaque > 0, "캔버스에 무언가 그려졌다");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], "추가 요청이 없어야 한다");
  await context.close();
});
