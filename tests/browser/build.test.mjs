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

const openPage = async (initScript = null, initArg = undefined, { locale = "ko-KR" } = {}) => {
  const context = await browser.newContext({ locale, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  if (initScript) await context.addInitScript(initScript, initArg);
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

/** 직접 만든 드롭다운(js/ui/select.js)에서 값을 고른다 */
const choose = async (page, id, value) => {
  await page.click(`#${id}`);
  await page.click(`#${id}-list [data-value="${value}"]`);
};
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

  // R은 바로 지우지 않고 묻는다. 기본 포커스는 "계속하기"라 Space를 눌러도 다시 시작하지 않는다.
  await page.keyboard.press("KeyR");
  assert.equal(await visible(page, "confirm"), true, "다시 시작할지 묻는다");
  assert.equal(await text(page, "hud-pieces"), "3", "아직 그대로");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-confirm")), "cancel");
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "confirm"), false);
  assert.equal(await visible(page, "pause"), true, "취소하면 일시정지 화면");

  // 일시정지 중 R → 묻고, R을 한 번 더 누르면 다시 시작
  await page.keyboard.press("KeyR");
  assert.equal(await visible(page, "confirm"), true);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0", null, {
    timeout: 3000,
  });
  assert.equal(await visible(page, "countdown"), true, "다시 카운트다운");
  assert.deepEqual(errors, []);
  await context.close();
});

test("로고: 게임 중이면 물은 뒤 첫 화면으로, 결과 화면에서는 바로 첫 화면으로", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "zen");
  await page.keyboard.press("Space");
  await page.click("#go-home");
  assert.equal(await visible(page, "confirm"), true);
  assert.equal(await text(page, "confirm-title"), "첫 화면으로 갈까요?");
  await page.click('[data-confirm="cancel"]');
  assert.equal(await visible(page, "pause"), true, "취소하면 판이 남아 있다");
  await page.click("#go-home");
  await page.click('[data-confirm="ok"]');
  assert.equal(await visible(page, "menu"), true);

  // 끝난 판: 묻지 않는다. 결과 화면의 R도 바로 다시 시작
  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  await page.keyboard.press("KeyR");
  assert.equal(await visible(page, "confirm"), false, "결과 화면에서는 묻지 않는다");
  await page.waitForFunction(
    () => document.body.dataset.screen === "countdown" || document.body.dataset.screen === "play"
  );
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  await page.click("#go-home");
  assert.equal(await visible(page, "menu"), true, "결과 화면에서 로고를 누르면 바로 첫 화면");
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
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.click('#set-theme [data-value="retro"]');
  await page.click('.dialog-tabs [data-value="keys"]');
  // 하드 드롭 첫 칸을 W로 바꾼다.
  await page.click('.key-slot[data-kind="key"][data-action="HARD"][data-slot="0"]');
  assert.equal(await page.locator(".key-slot.is-waiting").count(), 1);
  await page.keyboard.press("KeyW");
  assert.equal(await page.locator('.key-slot[data-kind="key"][data-action="HARD"][data-slot="0"]').textContent(), "W");
  // 이미 쓰는 키(X: 시계 회전)를 홀드로 옮기면 알림이 뜬다.
  await page.click('.key-slot[data-kind="key"][data-action="HOLD"][data-slot="1"]');
  await page.keyboard.press("KeyX");
  assert.match(await page.locator("#settings-notice").textContent(), /시계 방향 회전/);
  await page.click("#settings-close");
  assert.equal(await page.locator("#settings").isVisible(), false);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="control"]');
  assert.equal(await page.locator("#set-das").inputValue(), "100");
  await page.click('.dialog-tabs [data-value="visual"]');
  assert.equal(await page.locator('#set-theme [data-value="retro"]').getAttribute("aria-pressed"), "true");
  await page.click('.dialog-tabs [data-value="keys"]');
  assert.equal(await page.locator('.key-slot[data-kind="key"][data-action="HARD"][data-slot="0"]').textContent(), "W");
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

test("Ultra: 남은 시간이 줄어들고 하드 드롭으로 점수가 오른다, 메뉴에 일곱 모드", async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await page.locator("#mode-list .menu-row").count(), 7);
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
  assert.equal(await page.locator("#edit-rules").isVisible(), true, "편집 버튼은 늘 같은 자리에 있다");
  assert.equal(await page.locator("#edit-rules").isDisabled(), true, "프리셋에서는 비활성");

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
  const idText = () => page.locator("#rules-record").textContent();
  const before = await idText();

  // 하드 드롭 끄기
  await page.locator("#rule-hardDrop").uncheck();
  const after = await idText();
  assert.notEqual(after, before, "조합이 바뀌면 기록표도 바뀐다");
  // 프리셋 버튼으로 채우면 해당 값으로 바뀐다
  await page.click('[data-preset="arcade"]');
  assert.equal(await page.locator("#rule-rotation .select-value").textContent(), "ARS");
  assert.match(
    await page.locator('label[for="rule-rotation"] small').textContent(),
    /중앙열/,
    "고른 선택지의 설명은 아래 줄에"
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
  await page.click('[data-replay="step"]');
  const stepFrame = await page.locator("#replay-progress").evaluate(progress => progress.value);
  await page.click('[data-replay="step"]');
  assert.equal(await page.locator("#replay-progress").evaluate(progress => progress.value), stepFrame + 1);
  assert.match(await text(page, "replay-time"), / \/ /);
  await page.click('[data-replay="toggle"]');
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
  assert.equal(await text(page, "replay-note"), "", "검증 통과 → 경고 없음");
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "menu"), true);

  // 파일 구조가 유효하지만 결과가 다르면 재생 화면에서 알린다.
  saved.result.score += 1;
  await page.locator("#replay-file").setInputFiles({
    name: "different-result.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.waitForFunction(() => !document.getElementById("replay-bar")?.hidden);
  assert.match(await text(page, "replay-note"), /저장된 결과와 재생 결과가 달라요/);
  await page.click('[data-replay="restart"]');
  assert.equal(await visible(page, "replay-note"), true);
  await page.keyboard.press("Escape");

  // 망가진 파일
  await page
    .locator("#replay-file")
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
  await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent !== "", null, { timeout: 3000 });
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
  assert.equal(await page.locator('#key-help [aria-label="게임패드"]').count(), 1, "연결되면 패드 안내가 보인다");
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

// ---- 디자인 시스템: 원칙 2(레이아웃 고정)와 테마 — docs/DESIGN_SYSTEM.md ----

/** 선택자마다 위치·크기(소수점 반올림) */
const rects = (page, selectors) =>
  page.evaluate(
    sels =>
      Object.fromEntries(
        sels.map(sel => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return [sel, r ? [r.x, r.y, r.width, r.height].map(Math.round) : null];
        })
      ),
    selectors
  );

test("레이아웃 고정: 규칙 탭을 바꾸거나 메뉴 알림이 생겨도 메뉴 요소가 움직이지 않는다", async () => {
  const { context, page, errors } = await openPage();
  const sels = [
    "#rule-tabs",
    "#edit-rules",
    "#mode-list",
    "#mode-list .menu-row",
    "#watch-last",
    "#menu-notice",
    "#board",
  ];
  const before = await rects(page, sels);
  for (const id of ["retro", "arcade", "custom", "modern", "custom"]) {
    await page.click(`[data-rules="${id}"]`);
    assert.deepEqual(await rects(page, sels), before, `${id} 탭`);
  }
  await page
    .locator("#replay-file")
    .setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent !== "");
  assert.deepEqual(await rects(page, sels), before, "알림이 생긴 뒤");
  assert.deepEqual(errors, []);
  await context.close();
});

test("레이아웃 고정: 규칙 편집에서 조건 항목이 비활성이 돼도 줄이 움직이지 않고, 탭을 바꿔도 창 크기가 그대로", async () => {
  const { context, page, errors } = await openPage();
  await page.click('[data-rules="custom"]');
  await page.click("#edit-rules");
  const size = () =>
    page.evaluate(() => {
      const r = document.getElementById("rules-editor").getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
  const dialogSize = await size();
  const rows = () =>
    page.evaluate(() => [...document.querySelectorAll("#rules-editor .field-row")].map(r => Math.round(r.offsetTop)));

  await page.click('.dialog-tabs [data-value="고정·낙하"]');
  const lockRows = await rows();
  await choose(page, "rule-lock-type", "none");
  assert.equal(await page.locator("#rule-lock-delay").isDisabled(), true, "고정 지연은 비활성");
  assert.deepEqual(await rows(), lockRows);
  assert.match(await page.locator('label[for="rule-lock-delay"] small').textContent(), /즉시 고정/, "이유가 보인다");

  await page.click('.dialog-tabs [data-value="조작"]');
  const controlRows = await rows();
  await page.locator("#rule-fixedHandlingOn").check();
  assert.deepEqual(await rows(), controlRows);
  for (const t of ["피스", "점수", "공유", "고정·낙하"]) {
    await page.click(`.dialog-tabs [data-value="${t}"]`);
    assert.deepEqual(await size(), dialogSize, `${t} 탭에서도 같은 크기`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("레이아웃 고정: 게임 중 점수·시간이 길어져도 보드와 정보 칸이 움직이지 않는다", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "ultra");
  const sels = ["#board", ".hud", "#hud-score"];
  const before = await rects(page, sels);
  for (let i = 0; i < 12; i++) await page.keyboard.press(i % 2 ? "Space" : "ArrowLeft");
  await page.waitForFunction(() => Number(document.getElementById("hud-score")?.textContent.replace(/,/g, "")) > 0);
  assert.deepEqual(await rects(page, sels), before);
  assert.deepEqual(errors, []);
  await context.close();
});

test("레이아웃 고정: 설정 알림이 생겨도 버튼이 움직이지 않고, 결과 화면의 배지·순위 자리는 늘 있다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="keys"]');
  const sels = ["#settings-reset", "#settings-close", "#settings-notice", "#settings"];
  const before = await rects(page, sels);
  await page.click('.key-slot[data-kind="key"][data-action="HOLD"][data-slot="1"]');
  await page.keyboard.press("KeyX");
  assert.notEqual(await page.locator("#settings-notice").textContent(), "");
  assert.deepEqual(await rects(page, sels), before);
  await page.click("#settings-close");

  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  const badge = await rects(page, ["#results-badge"]);
  assert.ok(badge["#results-badge"][3] > 0, "새 기록이 아니어도 배지 자리는 있다");
  assert.match(await page.locator("#results-stats").textContent(), /순위/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("테마: 라이트에서 UI는 밝고 게임 화면(보드)은 어둡다, 다크에서는 둘 다 어둡다", async () => {
  const lum = rgb => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({
      locale: "ko-KR",
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      game: getComputedStyle(document.querySelector(".board-wrap")).backgroundColor,
      card: getComputedStyle(document.querySelector("#mode-list .menu-row")).backgroundColor,
    }));
    assert.ok(lum(colors.game) < 40, `${scheme}: 게임 화면은 어둡다`);
    // 첫 화면의 카드는 보드 위가 아니라 페이지에 있으므로 테마를 따른다
    if (scheme === "light") assert.ok(lum(colors.card) > 200, "라이트: 첫 화면 카드는 밝다");
    else assert.ok(lum(colors.card) < 60, "다크: 첫 화면 카드는 어둡다");
    if (scheme === "light") assert.ok(lum(colors.body) > 200, "라이트: 페이지는 밝다");
    else assert.ok(lum(colors.body) < 40, "다크: 페이지도 어둡다");
    await context.close();
  }
});

test("접근성: 모든 버튼에 읽을 수 있는 이름이 있고, 화면 글자에 이모지가 없다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-settings");
  const result = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll("button")]
      .filter(b => !(b.getAttribute("aria-label") || b.textContent.trim()))
      .map(b => b.outerHTML.slice(0, 80));
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u.test(document.body.innerText);
    return { unnamed, emoji };
  });
  assert.deepEqual(result.unnamed, []);
  assert.equal(result.emoji, false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("게임 테마: 세 테마가 서로 다르게 그려지고, 설정에서 바꾸면 바로 반영된다", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "dig");
  const snapshot = () =>
    page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
      return h;
    });
  await page.keyboard.press("Escape"); // 일시정지해서 화면을 멈춘다
  const seen = new Set();
  for (const theme of ["retro", "minimal", "modern"]) {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    await page.click(`#set-theme [data-value="${theme}"]`);
    await page.click("#settings-close");
    await page.waitForTimeout(100);
    seen.add(await snapshot());
  }
  assert.equal(seen.size, 3, "테마마다 다른 그림");
  assert.deepEqual(errors, []);
  await context.close();
});

test("기록 화면: 표는 늘 10줄, 조건을 바꿔도 크기가 그대로, 저장된 기록이 1위에 보인다", async () => {
  const { context, page, errors } = await openPage(() => {
    const entry = {
      frames: 3600,
      lines: 40,
      pieces: 101,
      splits: [900, 1800, 2700, 3600],
      date: "2026-11-01T00:00:00.000Z",
    };
    localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [entry] }));
  });
  await page.click("#open-records");
  assert.equal(await page.locator("#records").isVisible(), true);
  assert.equal(await page.locator(".records-table tbody tr").count(), 10);
  const size = () =>
    page.evaluate(() => {
      const r = document.getElementById("records").getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
  await choose(page, "records-mode", "sprint40");
  await choose(page, "records-rules", "modern");
  const before = await size();
  assert.match(await page.locator(".records-table tbody tr").first().textContent(), /1:00\.00/);
  assert.equal(await page.locator("#records-watch").isDisabled(), true, "리플레이가 없으면 비활성");
  await choose(page, "records-mode", "marathon");
  assert.deepEqual(await size(), before, "조건을 바꿔도 크기 그대로");
  assert.equal(await page.locator(".records-table tbody tr.is-empty").count(), 10);
  await page.click("#records-close");

  // 그 기록이 PB라 Sprint를 시작하면 PB 대비 칸이 준비된다(구간 전에는 —)
  await startMode(page, "sprint40");
  assert.equal(await text(page, "hud-split"), "—");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Sprint 최고 기록과 달리기: 같은 규칙에서 시작하고 상대 진행을 같이 멈춘다", async () => {
  // 실제 엔진에서 입력을 기록해 완주한 판. 예전 기록처럼 splits 없이 저장한다.
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  delete fixture.record.splits;
  const { context, page, errors } = await openPage(({ replay, record }) => {
    const key = "sprint40|modern";
    localStorage.setItem("tetrisharp:records", JSON.stringify({ [key]: [record] }));
    localStorage.setItem("tetrisharp:replay:best", JSON.stringify({ [key]: replay }));
  }, fixture);
  await page.click('[data-rules="retro"]');
  assert.equal(await page.locator('[data-race="sprint40"]').isDisabled(), true);
  await page.click('[data-rules="modern"]');
  assert.equal(await page.locator('[data-race="ultra"]').isDisabled(), true, "Ultra 최고 기록은 없다");
  await page.click('[data-race="sprint40"]');
  assert.equal(await visible(page, "race-board"), true);
  await page.waitForFunction(() => document.getElementById("race-progress").value > 0);
  await page.click("#pause-game");
  const progress = () => page.locator("#race-progress").evaluate(element => element.value);
  const pausedAt = await progress();
  await page.waitForTimeout(500);
  assert.equal(await progress(), pausedAt);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await visible(page, "race-panel"), true);
  assert.equal(await visible(page, "race-board"), false);
  await page.click('#pause [data-action="retry"]');
  assert.equal(await progress(), 0);
  await page.waitForFunction(() => document.body.dataset.screen === "play");

  for (let i = 0; i < 25 && !(await visible(page, "results")); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(25);
  }
  assert.match(await text(page, "race-result"), /끝까지 가지 못했어요/);
  await page.keyboard.press("Escape");
  assert.equal(await visible(page, "race-panel"), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("기록 이름을 저장하고 플레이하면 그 기록에 당시 이름이 남는다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-records");
  await page.fill("#record-player-name", "  도윤  ");
  await page.getByRole("button", { name: "플레이어 이름 저장" }).click();
  assert.equal(await page.locator("#record-player-name").inputValue(), "도윤");
  await page.click("#records-close");

  await startMode(page, "ultra");
  for (let i = 0; i < 25 && !(await visible(page, "results")); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(25);
  }
  assert.equal(await visible(page, "results"), true);
  await page.keyboard.press("Escape");
  await page.click("#open-records");
  await choose(page, "records-mode", "ultra");
  assert.equal(await page.locator(".record-player").first().textContent(), "도윤");

  await page.fill("#record-player-name", "친구");
  await page.locator("#record-player-name").press("Enter");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.click("#open-records");
  await choose(page, "records-mode", "ultra");
  assert.equal(await page.locator("#record-player-name").inputValue(), "친구");
  assert.equal(await page.locator(".record-player").first().textContent(), "도윤");
  assert.deepEqual(errors, []);
  await context.close();
});

test("게임패드 버튼 바꾸기: 설정에서 칸을 누르고 패드 버튼을 누르면 그 버튼으로 동작한다", async () => {
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
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="pad"]');
  // 하드 드롭 첫 칸을 RB(5)로
  await page.click('.key-slot[data-kind="pad"][data-action="HARD"][data-slot="0"]');
  await tap(5);
  assert.equal(await page.locator('.key-slot[data-kind="pad"][data-action="HARD"][data-slot="0"]').textContent(), "RB");
  assert.match(await text(page, "settings-notice"), /홀드/, "홀드에서 옮겼다고 알린다");
  await page.click("#settings-close");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await startMode(page, "sprint40");
  await tap(5);
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, {
    timeout: 3000,
  });
  assert.deepEqual(errors, []);
  await context.close();
});

test("통계: 결과 화면에서 열면 이번 판 통계가 보인다", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "zen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  await page.click('[data-action="stats"]');
  assert.equal(await page.locator("#stats").isVisible(), true);
  const body = await page.locator("#stats").textContent();
  assert.match(body, /T-SPIN DOUBLE/);
  assert.match(body, /키 입력/);
  await page.click("#stats-close");
  assert.equal(await visible(page, "results"), true, "닫으면 결과 화면 그대로");
  assert.deepEqual(errors, []);
  await context.close();
});

test("규칙 공유: 편집기에서 코드를 붙여 넣으면 불러오고, #rules= 링크로 열면 Custom으로 들어온다", async () => {
  const { context, page, errors } = await openPage();
  // Retro 내용의 코드를 편집기에서 얻는다
  await page.click('[data-rules="custom"]');
  await page.click("#edit-rules");
  await page.click('[data-preset="retro"]');
  await page.click('.dialog-tabs [data-value="공유"]');
  const code = await page.locator("#rule-share-code").inputValue();
  assert.match(code, /^TS1-/);
  await page.click('[data-preset="modern"]');
  await page.locator("#rule-share-paste").fill(code);
  await page.click("#rule-share-load");
  assert.match(await text(page, "rules-record"), /불러왔어요/);
  await page.click('.dialog-tabs [data-value="피스"]');
  assert.match(await page.locator("#rule-rotation .select-value").textContent(), /킥 없음/);
  await page.click('.dialog-tabs [data-value="공유"]');
  await page.locator("#rule-share-paste").fill("엉터리");
  await page.click("#rule-share-load");
  assert.match(await text(page, "rules-record"), /읽을 수 없는/);
  await page.click("#rules-close");
  await context.close();

  // 새 브라우저(저장소 비어 있음)에서 링크로 연다
  const fresh = await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  const p2 = await fresh.newPage();
  const errs2 = [];
  p2.on("pageerror", e => errs2.push(e.message));
  await p2.goto(`${url}#rules=${code.slice(4)}`);
  await p2.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await p2.locator('[data-rules="custom"]').getAttribute("aria-pressed"), "true");
  assert.match(await p2.locator("#menu-notice").textContent(), /불러왔어요/);
  assert.equal(new URL(p2.url()).hash, "", "주소의 해시는 지운다");
  await p2.click("#edit-rules");
  assert.match(await p2.locator("#rule-rotation .select-value").textContent(), /킥 없음/);
  assert.deepEqual([...errors, ...errs2], []);
  await fresh.close();
});

test("연습: 메뉴에서 고르면 시작하고, 놓을 때마다 성공/시도를 센다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-practice");
  assert.equal(await page.locator("#practice .menu-row").count(), 7);
  assert.equal(await page.locator('[data-drill="double"]').isVisible(), true);
  await page.click('[data-drill="tsd"]');
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent === "GO!", null, {
    timeout: 3000,
  });
  assert.equal(await text(page, "hud-lines-label"), "성공");
  assert.equal(await text(page, "hud-lines"), "0 / 0");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.getElementById("hud-lines")?.textContent === "0 / 1", null, {
    timeout: 3000,
  });
  assert.deepEqual(errors, []);
  await context.close();
});

test("터치 버튼: 켜면 보드 아래에 보이고, 누르면 조작된다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 412, height: 860 }, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem("tetrisharp:settings", JSON.stringify({ touch: "on" })));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await page.locator("#key-help").isVisible(), false, "키보드 안내는 숨긴다");
  await page.tap('[data-mode="sprint40"]');
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent === "GO!", null, {
    timeout: 3000,
  });
  assert.equal(await page.locator("#touchpad").isVisible(), true);
  const pad = await rects(page, ["#touchpad", "#board"]);
  assert.ok(pad["#touchpad"][1] >= pad["#board"][1] + pad["#board"][3], "보드 아래");
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    "정보 칸·보드·터치 버튼이 한 화면에 들어간다"
  );
  await page.tap('[data-touch="HARD"]');
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, {
    timeout: 3000,
  });
  await page.tap('[data-touch="PAUSE"]');
  assert.equal(await visible(page, "pause"), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("글자 잘림 없음: 첫 화면·설정 모든 탭·규칙 편집 모든 탭·기록·연습에서 넘치는 글자가 없다(데스크톱·휴대폰)", async () => {
  /** 글자가 칸보다 넓어 잘리거나(…) 넘치는 요소들 */
  const overflowing = page =>
    page.evaluate(() =>
      [...document.querySelectorAll("button, label, small, strong, td, th, dd, dt, p, .keys-label, option")]
        .filter(el => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
        .filter(el => getComputedStyle(el).overflowX !== "visible" || getComputedStyle(el).textOverflow === "ellipsis")
        .map(el => `${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 30)}`)
    );
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ locale: "ko-KR", viewport });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const found = [];
    const check = async where => found.push(...(await overflowing(page)).map(x => `[${viewport.width}] ${where} ${x}`));
    await check("첫 화면");
    await page.click("#open-settings");
    for (const t of ["control", "visual", "keys", "pad"]) {
      await page.click(`.dialog-tabs [data-value="${t}"]`);
      await check(`설정/${t}`);
    }
    await page.click("#settings-close");
    await page.click('[data-rules="custom"]');
    await page.click("#edit-rules");
    for (const t of ["피스", "고정·낙하", "점수", "조작", "공유"]) {
      await page.click(`.dialog-tabs [data-value="${t}"]`);
      await check(`규칙/${t}`);
    }
    await page.click("#rules-close");
    await page.click("#open-records");
    await check("기록");
    await page.click("#records-close");
    await page.click("#open-practice");
    await check("연습");
    assert.deepEqual(found, []);
    await context.close();
  }
});

test("영어: 브라우저가 영어면 영어로 뜨고, 설정에서 한국어로 바꾸면 다시 불러와 한국어가 된다", async () => {
  const { context, page, errors } = await openPage(null, undefined, { locale: "en-US" });
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
  assert.equal(await text(page, "mode-title"), "Modes");
  const hangul = () => page.evaluate(() => /[가-힣]/.test(document.body.innerText));
  assert.equal(await hangul(), false, "첫 화면에 한국어가 남지 않는다");
  assert.equal(
    await page.locator('[data-mode="sprint40"] small').first().textContent(),
    "Clear 40 lines as fast as you can"
  );
  await startMode(page, "sprint40");
  assert.equal(await text(page, "hud-lines-label"), "Lines left");
  await page.keyboard.press("Escape");
  assert.equal(await hangul(), false, "일시정지 화면도 영어");
  await page.click('#pause [data-action="menu"]');

  await page.click("#open-settings");
  assert.equal(await hangul(), false, "설정 첫 탭도 영어");
  await page.click('.dialog-tabs [data-value="visual"]');
  await Promise.all([page.waitForEvent("load"), page.click('#set-lang [data-value="ko"]')]);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await page.evaluate(() => document.documentElement.lang), "ko");
  assert.equal(await text(page, "mode-title"), "플레이 모드");
  assert.deepEqual(errors, []);
  await context.close();
});

test("글자 잘림 없음(영어): 첫 화면·설정·기록·연습", async () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ locale: "en-US", viewport });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const found = [];
    const check = async where =>
      found.push(
        ...(
          await page.evaluate(() =>
            [...document.querySelectorAll("button, label, small, strong, td, th, dd, dt, p, .keys-label, option")]
              .filter(el => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
              .filter(
                el => getComputedStyle(el).overflowX !== "visible" || getComputedStyle(el).textOverflow === "ellipsis"
              )
              .map(el => `${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 30)}`)
          )
        ).map(x => `[${viewport.width}] ${where} ${x}`)
      );
    await check("home");
    await page.click("#open-settings");
    for (const tab of ["control", "visual", "keys", "pad"]) {
      await page.click(`.dialog-tabs [data-value="${tab}"]`);
      await check(`settings/${tab}`);
    }
    await page.click("#settings-close");
    await page.click("#open-records");
    await check("records");
    await page.click("#records-close");
    await page.click("#open-practice");
    await check("practice");
    assert.deepEqual(found, []);
    await context.close();
  }
});

test("전체 흐름: Survival 한 판 → 결과·새 기록 → 기록표 리플레이 → 백업 저장 → 지우고 백업 불러오기", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "survival");
  assert.equal(await text(page, "hud-lines-label"), "받을 쓰레기");
  for (let i = 0; i < 60 && !(await visible(page, "results")); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 5000 });
  assert.equal(await text(page, "results-title"), "게임 오버");
  assert.equal(await page.locator("#results-badge").evaluate(e => e.classList.contains("is-invisible")), false);
  assert.match(await page.locator("#results-stats").textContent(), /순위1위/);
  await page.keyboard.press("Escape");

  // 기록표: 1위 기록과 그 리플레이
  await page.click("#open-records");
  await choose(page, "records-mode", "survival");
  assert.equal(await page.locator(".records-table tbody tr.is-empty").count(), 9);
  assert.equal(await page.locator("#records-watch").isDisabled(), false);
  await page.click("#records-watch");
  assert.equal(await visible(page, "replay-bar"), true);
  await page.click('[data-replay="exit"]');
  assert.equal(await visible(page, "menu"), true);

  // 백업 저장
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-backup")]);
  const file = path.join(dir, "backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(backup.kind, "backup");
  assert.equal(backup.data.records["survival|modern"].length, 1);

  // 이 브라우저의 저장 데이터를 지우고 백업을 불러온다
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await page.locator('[data-mode="survival"] .mode-best').textContent(), "");
  page.once("dialog", dialog => dialog.accept());
  await page.setInputFiles("#backup-file", file);
  await page.waitForFunction(() => /백업을 불러왔어요/.test(document.getElementById("menu-notice")?.textContent ?? ""));
  assert.match(await page.locator('[data-mode="survival"] .mode-best').textContent(), /최고 기록/);
  assert.equal(await page.locator("#watch-last").isDisabled(), false, "마지막 판 리플레이도 돌아온다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("효과음: 소리를 켜면 게임 중 오디오를 만들고, 끄면 만들지 않는다", async () => {
  const count = () => page.evaluate(() => window.__audioContexts ?? 0);
  const { context, page, errors } = await openPage(() => {
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        window.__audioContexts = (window.__audioContexts ?? 0) + 1;
      }
    };
  });
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.locator("#set-volume").fill("0");
  await page.click("#settings-close");
  await startMode(page, "zen");
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert.equal(await count(), 0, "끄면 오디오를 만들지 않는다");
  await page.keyboard.press("Escape");
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.locator("#set-volume").fill("60");
  await page.click("#settings-close");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert.equal(await count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test("드롭다운: 키보드로 열고 고르며, Esc는 목록만 닫고 대화상자는 그대로", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-records");
  await page.focus("#records-mode");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator("#records-mode-list").isVisible(), true, "↓로 열린다");
  assert.equal(await page.locator("#records-mode").getAttribute("aria-expanded"), "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#records-mode-list").count(), 0, "고르면 닫힌다");
  assert.equal(await page.locator("#records-mode").getAttribute("data-value"), "marathon");
  assert.equal(await page.locator("#records-mode .select-value").textContent(), "Marathon");

  await page.click("#records-mode");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#records-mode-list").count(), 0, "Esc로 목록이 닫힌다");
  assert.equal(await page.locator("#records").isVisible(), true, "대화상자는 열려 있다");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "records-mode", "포커스는 열기 버튼으로");

  await page.click("#records-mode");
  await page.mouse.click(5, 5);
  assert.equal(await page.locator("#records-mode-list").count(), 0, "바깥을 누르면 닫힌다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("조작법을 펼쳐 페이지가 길어져도(스크롤바가 생겨도) 첫 화면이 좌우로 움직이지 않는다", async () => {
  // 헤드리스는 스크롤바를 겹쳐 그려 자리를 차지하지 않으므로, 폭을 차지하는 스크롤바를 켜서 연다.
  const real = await chromium.launch({ ...launchOptions(chromium), ignoreDefaultArgs: ["--hide-scrollbars"] });
  const page = await real.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  const xs = () =>
    page.evaluate(() =>
      [".logo", ".home-main", ".home-side", "#mode-list"].map(s =>
        Math.round(document.querySelector(s).getBoundingClientRect().x)
      )
    );
  const closed = await xs();
  await page.click("#help-title");
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), "펼치면 스크롤이 생긴다");
  assert.deepEqual(await xs(), closed, "펼친 뒤");
  await page.click("#help-title");
  assert.deepEqual(await xs(), closed, "접은 뒤");
  await real.close();
});
