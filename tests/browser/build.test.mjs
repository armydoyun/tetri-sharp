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

const openPage = async (initScript = null) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  if (initScript) await context.addInitScript(initScript);
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
  return { context, page, errors, blocked };
};

const opaquePixels = page =>
  page.evaluate(() => {
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) opaque++;
    return { w: c.width, h: c.height, opaque };
  });

test("브라우저에서 오류 없이 뜨고 보드를 그린다", async () => {
  const { context, page, errors, blocked } = await openPage();
  assert.equal(await page.title(), "Tetri#");
  const painted = await opaquePixels(page);
  assert.equal(painted.w * 22, painted.h * 20, "캔버스 비율은 20:22칸(홀드·보드·넥스트)");
  assert.ok(painted.opaque > 0, "캔버스에 무언가 그려졌다");
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], "추가 요청이 없어야 한다");
  await context.close();
});

const text = (page, id) => page.locator(`#${id}`).textContent();
const visible = (page, id) => page.locator(`#${id}`).isVisible();
/** 메뉴에서 모드를 골라 카운트다운이 끝날 때까지 기다린다. */
const startMode = async (page, id) => {
  await page.click(`[data-mode="${id}"]`);
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent === "GO!", null, {
    timeout: 3000,
  });
};

test("메뉴 → Sprint 40L: 하드 드롭·홀드·일시정지·재시작", async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await visible(page, "menu"), true, "처음에는 모드 선택 화면");
  await startMode(page, "sprint40");
  assert.equal(await text(page, "hud-lines-label"), "남은 줄");
  assert.equal(await text(page, "hud-lines"), "40");

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
  }
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "3", null, {
    timeout: 3000,
  });

  await page.keyboard.press("KeyC");
  await page.waitForTimeout(100);
  assert.equal(await text(page, "hud-pieces"), "3", "홀드는 피스를 고정하지 않는다");

  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "pause"), true, "일시정지 화면");
  const frozen = await text(page, "hud-time");
  await page.waitForTimeout(200);
  assert.equal(await text(page, "hud-time"), frozen, "일시정지 중에는 시간이 멈춘다");
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "pause"), false);

  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0", null, {
    timeout: 3000,
  });
  assert.equal(await visible(page, "countdown"), true, "다시 카운트다운");
  assert.deepEqual(errors, []);
  await context.close();
});

test("막히면 결과 화면이 뜨고, Space 연타로 건너뛰지 않으며, Esc로 메뉴", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-title"), "게임 오버");
  const pieces = await text(page, "hud-pieces");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert.equal(await visible(page, "results"), true, "Space로는 다시 시작하지 않는다");
  assert.equal(await text(page, "hud-pieces"), pieces);
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "menu"), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("설정: 슬라이더 값과 키 변경이 저장되고 새로고침 후에도 유지된다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-settings");
  assert.equal(await page.locator("#settings").isVisible(), true);

  await page.locator("#set-das").fill("100");
  await page.locator("#set-skin").selectOption("outline");
  // 하드 드롭 첫 칸을 W로 바꾼다.
  await page.click('.key-slot[data-action="HARD"][data-slot="0"]');
  assert.equal(await page.locator(".key-slot.is-waiting").count(), 1);
  await page.keyboard.press("KeyW");
  assert.equal(await page.locator('.key-slot[data-action="HARD"][data-slot="0"]').textContent(), "W");
  // 이미 쓰는 키(X: 시계 회전)를 홀드로 옮기면 알림이 뜬다.
  await page.click('.key-slot[data-action="HOLD"][data-slot="1"]');
  await page.keyboard.press("KeyX");
  assert.match(await page.locator(".settings-notice").textContent(), /시계 방향 회전/);
  await page.click("#settings-close");
  assert.equal(await page.locator("#settings").isVisible(), false);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.click("#open-settings");
  assert.equal(await page.locator("#set-das").inputValue(), "100");
  assert.equal(await page.locator("#set-skin").inputValue(), "outline");
  assert.equal(await page.locator('.key-slot[data-action="HARD"][data-slot="0"]').textContent(), "W");
  await page.keyboard.press("Escape");

  // 바뀐 키로 실제 플레이: W = 하드 드롭, Space는 더 이상 하드 드롭이 아니다.
  await startMode(page, "sprint40");
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert.equal(await text(page, "hud-pieces"), "0");
  await page.keyboard.press("KeyW");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, {
    timeout: 3000,
  });
  assert.deepEqual(errors, []);
  await context.close();
});

test("Ultra: 남은 시간이 줄어들고 하드 드롭으로 점수가 오른다, 메뉴에 여섯 모드", async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await page.locator(".mode-card").count(), 6);
  await startMode(page, "ultra");
  assert.equal(await text(page, "hud-time-label"), "남은 시간");
  await page.waitForTimeout(300);
  assert.ok((await text(page, "hud-time")) < "2:00.00", "카운트다운이 아니라 남은 시간이 줄어든다");
  assert.equal(await text(page, "hud-score"), "0");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => Number(document.getElementById("hud-score")?.textContent) > 0, null, {
    timeout: 3000,
  });
  assert.equal(await text(page, "hud-level"), "1");
  assert.deepEqual(errors, []);
  await context.close();
});

test("규칙 선택: Retro는 하드 드롭이 안 되고, 선택이 새로고침 후에도 남는다", async () => {
  const { context, page, errors } = await openPage();
  const pressed = id => page.locator(`[data-rules="${id}"]`).getAttribute("aria-pressed");
  assert.equal(await pressed("modern"), "true");
  await page.click('[data-rules="retro"]');
  assert.equal(await pressed("retro"), "true");
  assert.equal(await page.locator("#edit-rules").isVisible(), false, "프리셋에는 편집 버튼이 없다");

  await startMode(page, "sprint40");
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(150);
  assert.equal(await text(page, "hud-pieces"), "0", "하드 드롭 없음");
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, {
    timeout: 5000,
  });
  await page.keyboard.up("ArrowDown");

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await pressed("retro"), "true");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Custom 규칙: 편집 내용이 저장되고 기록표 id가 바뀌며, 게임에 반영된다", async () => {
  const { context, page, errors } = await openPage();
  await page.click('[data-rules="custom"]');
  await page.click("#edit-rules");
  assert.equal(await page.locator("#rules-editor").isVisible(), true);
  const idText = () => page.locator("#rules-editor .settings-notice").textContent();
  const before = await idText();

  // 하드 드롭 끄기
  await page.locator("#rule-hardDrop").uncheck();
  const after = await idText();
  assert.notEqual(after, before, "조합이 바뀌면 기록표도 바뀐다");
  // 프리셋 버튼으로 채우면 해당 값으로 바뀐다
  await page.click('[data-preset="arcade"]');
  assert.equal(
    await page.locator("#rule-rotation option:checked").textContent(),
    "ARS — 좌우 1칸만, 중앙열 규칙 (아케이드)"
  );
  await page.locator("#rule-hardDrop").uncheck();
  await page.click("#rules-close");

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.click("#edit-rules");
  assert.equal(await page.locator("#rule-hardDrop").isChecked(), false, "새로고침 후에도 유지");
  await page.click("#rules-close");

  await startMode(page, "sprint40");
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  assert.equal(await text(page, "hud-pieces"), "0", "Custom에서 끈 하드 드롭은 동작하지 않는다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("리플레이: 결과 화면에서 보기 → 같은 결과로 끝남, 파일 저장 → 메뉴에서 열기", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press(i % 3 ? "Space" : "ArrowLeft");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 5000 });
  const pieces = await text(page, "hud-pieces");

  // 보기: 4배속으로 끝까지
  await page.click('[data-action="watch"]');
  assert.equal(await visible(page, "replay-bar"), true);
  await page.keyboard.press("Digit4");
  await page.waitForFunction(() => document.getElementById("replay-status")?.textContent === "끝", null, {
    timeout: 10000,
  });
  assert.equal(await text(page, "hud-pieces"), pieces, "원래 판과 같은 피스 수로 끝난다");
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "results"), true, "닫으면 결과 화면으로");

  // 파일로 저장
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="export"]')]);
  assert.match(download.suggestedFilename(), /^tetri-sharp-zen-.*\.json$/);
  const file = await download.path();
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.app, "tetri-sharp");
  assert.equal(String(saved.result.pieces), pieces);

  // 메뉴에서: 마지막 판 버튼이 켜져 있고, 파일 열기로 재생된다
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#watch-last").isEnabled(), true);
  await page.locator("#replay-file").setInputFiles(file);
  await page.waitForFunction(() => !document.getElementById("replay-bar")?.hidden, null, { timeout: 5000 });
  assert.equal(await text(page, "menu-notice"), "", "검증 통과 → 경고 없음");
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "menu"), true);

  // 망가진 파일
  await page
    .locator("#replay-file")
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
  await page.waitForFunction(() => !document.getElementById("menu-notice")?.hidden, null, { timeout: 3000 });
  assert.match(await text(page, "menu-notice"), /읽을 수 없는/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("Dig: 쓰레기 10줄로 시작, 키 안내는 규칙에 따라 하드 드롭·홀드를 숨긴다", async () => {
  const { context, page, errors } = await openPage();
  assert.match(await text(page, "key-help"), /하드 드롭/);
  await page.click('[data-rules="retro"]');
  const help = await text(page, "key-help");
  assert.doesNotMatch(help, /하드 드롭/);
  assert.doesNotMatch(help, /홀드/);
  await page.click('[data-rules="modern"]');
  await startMode(page, "dig");
  assert.equal(await text(page, "hud-lines-label"), "남은 쓰레기");
  assert.equal(await text(page, "hud-lines"), "10");
  assert.deepEqual(errors, []);
  await context.close();
});

test("게임패드: A로 메뉴 선택, 십자키 위로 하드 드롭, Start로 일시정지", async () => {
  // 가짜 패드: window.__pad.pressed에 버튼 번호를 넣으면 눌린 것으로 보인다.
  const { context, page, errors } = await openPage(() => {
    window.__pad = { pressed: new Set() };
    const make = () => ({
      id: "test pad",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => {
        const on = window.__pad.pressed.has(i);
        return { pressed: on, touched: on, value: on ? 1 : 0 };
      }),
    });
    Object.defineProperty(navigator, "getGamepads", { value: () => [make()] });
  });
  const tap = async button => {
    await page.evaluate(b => window.__pad.pressed.add(b), button);
    await page.waitForTimeout(80);
    await page.evaluate(b => window.__pad.pressed.delete(b), button);
    await page.waitForTimeout(80);
  };
  assert.match(await text(page, "key-help"), /게임패드/, "연결되면 패드 안내가 보인다");
  await tap(13); // 아래: Sprint → Marathon
  await tap(12); // 위: 다시 Sprint
  await tap(0); // A: 선택
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent === "GO!", null, {
    timeout: 3000,
  });
  assert.equal(await text(page, "hud-lines-label"), "남은 줄", "Sprint가 시작됐다");
  await tap(12);
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, {
    timeout: 3000,
  });
  await tap(9);
  assert.equal(await visible(page, "pause"), true);
  assert.deepEqual(errors, []);
  await context.close();
});
