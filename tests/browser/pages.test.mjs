// GitHub Pages 배포본: 설치형 앱 파일이 있고, 한 번 연 뒤에는 인터넷 없이도 열린다.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { buildPages } from "../../tools/build.mjs";
import { launchOptions } from "../helpers/browser.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};
let dir, server, base, browser;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tetrisharp-pages-"));
  await buildPages({ outDir: dir });
  server = http.createServer((req, res) => {
    const name = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0].slice(1));
    const file = path.join(dir, name);
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(launchOptions(chromium));
});

after(async () => {
  await browser?.close();
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("배포본 파일: index.html·매니페스트·아이콘·서비스 워커", () => {
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    ".nojekyll",
    "icon.svg",
    "index.html",
    "manifest.webmanifest",
    "sw.js",
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Tetri#");
  assert.equal(manifest.start_url, "./");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(fs.readFileSync(path.join(dir, "sw.js"), "utf8"), /const VERSION = "[0-9a-f]{12}"/);
});

test("한 번 열면 서비스 워커가 저장해 두고, 인터넷이 끊겨도 다시 열린다", async () => {
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // 서비스 워커가 페이지를 맡을 때까지(첫 방문은 claim으로)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 5000 });

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1", null, { timeout: 5000 });
  assert.equal(await page.title(), "Tetri#");
  assert.equal(await page.locator("#menu").isVisible(), true, "인터넷 없이 메뉴까지 뜬다");
  assert.deepEqual(errors, []);
  await context.close();
});
