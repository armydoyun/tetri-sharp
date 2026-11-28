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
let shellStatus = 200;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tetrisharp-pages-"));
  await buildPages({ outDir: dir });
  server = http.createServer((req, res) => {
    const name = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0].slice(1));
    if (name === "index.html" && shellStatus !== 200) {
      res.writeHead(shellStatus, { "Content-Type": "text/html" });
      return res.end("<title>Unavailable</title>");
    }
    if (name === "other.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<title>Other page</title>");
    }
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

test("배포본 파일: index.html·매니페스트·아이콘·링크 배너·서비스 워커", () => {
  assert.deepEqual(fs.readdirSync(dir).sort(), [
    ".nojekyll",
    "icon.svg",
    "index.html",
    "manifest.webmanifest",
    "og.png",
    "sw.js",
  ]);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Tetri#");
  assert.equal(manifest.start_url, "./");
  assert.match(manifest.icons[0].src, /^icon\.svg\?v=[0-9a-f]{12}$/);
  assert.equal(manifest.icons[0].purpose, "any maskable");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.equal((html.match(/<link rel="icon"/g) ?? []).length, 1);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml;base64,[^"]+"/);
  const tabIcon = Buffer.from(html.match(/<link rel="icon" href="data:image\/svg\+xml;base64,([^"]+)"/)[1], "base64");
  const appIcon = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
  assert.ok(appIcon.includes(tabIcon.toString().match(/<path\b[^>]*\/>/)[0]), "앱과 탭에 같은 T 표식을 쓴다");
  assert.match(fs.readFileSync(path.join(dir, "sw.js"), "utf8"), /const VERSION = "[0-9a-f]{12}"/);
  // 링크 배너: 메신저가 읽는 태그(이미지는 절대 주소, 1200×630 PNG)
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/og\.png">/);
  assert.match(html, /<meta property="og:title" content="Tetri#">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  const png = fs.readFileSync(path.join(dir, "og.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

test("설치 캐시로 서버 장애와 오프라인 상태에서도 기록·리플레이·Sprint·시간차에 접근한다", async () => {
  const context = await browser.newContext({ locale: "ko-KR" });
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const errors = [];
  const ready = page => page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  try {
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base);
    await ready(page);
    const icon = await page.locator('link[rel="icon"]').getAttribute("href");
    assert.equal(await page.locator(".logo-mark").evaluate(mark => getComputedStyle(mark).maskImage), `url("${icon}")`);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 5000 });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.webmanifest"), "utf8"));
    const iconSrc = manifest.icons[0].src;
    await page.evaluate(({ record, replay }) => {
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
      localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
    }, fixture);

    shellStatus = 503;
    await page.reload();
    await ready(page);
    await page.goto(new URL("other.html", base).href);
    assert.equal(await page.title(), "Other page");
    await page.close();

    await context.setOffline(true);
    const offline = await context.newPage();
    offline.on("pageerror", e => errors.push(e.message));
    await offline.goto(new URL("index.html", base).href);
    await ready(offline);
    const offlineIcon = await offline.evaluate(async src => (await fetch(src)).text(), iconSrc);
    assert.equal(offlineIcon, fs.readFileSync(path.join(dir, "icon.svg"), "utf8"));
    assert.match(await offline.locator('[data-mode="sprint40"] .mode-best').textContent(), /최고 기록/);
    await offline.click("#watch-last");
    assert.equal(await offline.locator("#replay-bar").isVisible(), true);
    await offline.click('[data-replay="exit"]');
    await offline.click('[data-mode="sprint40"]');
    await offline.waitForFunction(() => document.body.dataset.screen === "play");
    await offline.keyboard.press("Space");
    await offline.waitForFunction(() => Number(document.getElementById("hud-pieces").textContent) === 1);
    await offline.reload();
    await ready(offline);
    await offline.click("#continue-run");
    await offline.waitForFunction(() => document.body.dataset.screen === "play");
    assert.equal(await offline.locator("#hud-pieces").textContent(), "1");

    await offline.click("#go-home");
    await offline.click('#confirm [data-confirm="ok"]');
    await offline.click('[data-mode="time-shift-1"]');
    await offline.click('[data-time-shift-stage="time-shift-1"]');
    await offline.keyboard.press("Space");
    await offline.waitForFunction(() => document.getElementById("hud-lines")?.textContent === "1 / 6");
    await offline.reload();
    await ready(offline);
    await offline.click("#continue-run");
    await offline.waitForFunction(() => document.body.dataset.screen === "play");
    assert.equal(await offline.locator("#hud-lines").textContent(), "1 / 6");
    assert.deepEqual(errors, []);
  } finally {
    shellStatus = 200;
    await context.close();
  }
});
