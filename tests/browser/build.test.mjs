// 한 파일짜리 배포본을 임시 폴더에 만들고, 그 파일 하나만 제공하는 서버에서 실제 Chromium으로 연다.
// 다른 요청은 모두 막는다 → 번들이 외부 파일 없이 혼자 도는지 확인한다.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "../../tools/build.mjs";
import { launchOptions } from "../helpers/browser.mjs";
import { runScenarios } from "../helpers/ui-scenarios.mjs";
import { keysFor, solvePuzzle } from "../helpers/puzzle-solve.mjs";
import { PUZZLES } from "../../js/modes/puzzles.js";
import { botDailyReplay } from "../helpers/daily.mjs";
import { dateKey } from "../../js/modes/daily.js";
import { verifyReplay } from "../../js/replay/replay.js";
import { findMode } from "../../js/modes/index.js";
import { decodeReplayCode, encodeReplayCode } from "../../js/replay/share.js";

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

const openPage = async (initScript = null, initArg = undefined, { locale = "ko-KR", frameClock = false } = {}) => {
  const context = await browser.newContext({ locale, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  if (frameClock) {
    await context.addInitScript(() => {
      let now = 0;
      let callbacks = [];
      Object.defineProperty(performance, "now", { value: () => now });
      window.requestAnimationFrame = fn => callbacks.push(fn);
      window.advanceFrame = () => {
        now += 1000 / 60 + 0.0001;
        const current = callbacks;
        callbacks = [];
        for (const callback of current) callback(now);
      };
    });
  }
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
const playReplayFrames = (page, inputs, from, to, delay = 0, topOut = false) =>
  page.evaluate(
    ({ from, to, delay, topOut, inputs }) => {
      const codes = { 1: "ArrowLeft", 2: "ArrowRight", 8: "Space", 16: "ArrowUp" };
      const pressed = new Map(inputs.map(([frame, , button]) => [frame, codes[button]]));
      for (let i = 0; i < to - from + delay && document.body.dataset.screen === "play"; i++) {
        const code = topOut ? "Space" : i >= delay && pressed.get(from + i - delay);
        if (code) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));
          window.dispatchEvent(new KeyboardEvent("keyup", { code, cancelable: true }));
        }
        window.advanceFrame();
      }
    },
    { from, to, delay, topOut, inputs }
  );
/** 메뉴에서 모드를 골라 카운트다운이 끝날 때까지 기다린다. */
const startMode = async (page, id) => {
  await page.click(`[data-mode="${id}"]`);
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, {
    timeout: 3000,
  });
};

test("이어서 하기: 일곱 기본 모드에서 새로고침 뒤 같은 보드와 시간을 복원한다", async () => {
  const { context, page, errors } = await openPage(
    () => {
      if (!localStorage.getItem("tetrisharp:settings"))
        localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "short" } }));
    },
    undefined,
    { frameClock: true }
  );
  const advance = n =>
    page.evaluate(n => {
      for (let i = 0; i < n; i++) window.advanceFrame();
    }, n);
  const snapshot = () => page.locator("#board").evaluate(canvas => canvas.toDataURL());
  try {
    for (const id of ["sprint40", "marathon", "ultra", "master", "dig", "survival", "endless"]) {
      await page.click(`[data-mode="${id}"]`);
      await advance(24);
      await page.keyboard.press("Space");
      await advance(4);
      await page.click("#pause-game");
      await advance(30);
      const board = await snapshot();
      const time = await text(page, "hud-time");
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
      assert.equal(await visible(page, "continue-run"), true, id);
      await page.click("#continue-run");
      assert.equal(await page.locator("body").getAttribute("data-screen"), "countdown", id);
      await advance(1);
      assert.equal(await snapshot(), board, id);
      assert.equal(await text(page, "hud-time"), time, id);
      await page.click("#go-home");
      await page.click('[data-confirm="ok"]');
      assert.equal(await visible(page, "continue-run"), false, id);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("이어서 하기: CPU 대전에서 새 창으로 이어도 양쪽 보드와 결과 리플레이가 유지된다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    seed => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    },
    fixture.replay.seed,
    { frameClock: true }
  );
  const images = page => page.evaluate(() => ["board", "cpu-board"].map(id => document.getElementById(id).toDataURL()));
  try {
    await page.click('[data-mode="versus"]');
    await page.click('#versus [data-level="easy"]');
    await playReplayFrames(page, fixture.replay.inputs, 0, 241);
    await page.click("#pause-game");
    await page.evaluate(() => {
      for (let i = 0; i < 30; i++) window.advanceFrame();
    });
    const before = await images(page);
    await page.close();
    const reopened = await context.newPage();
    reopened.on("pageerror", error => errors.push(error.message));
    await reopened.goto(url);
    await reopened.click("#continue-run");
    await reopened.evaluate(() => window.advanceFrame());
    assert.deepEqual(await images(reopened), before);
    await playReplayFrames(reopened, fixture.replay.inputs, 241, 500, 0, true);
    await reopened.locator('#results [data-action="watch"]').click();
    assert.equal(await visible(reopened, "replay-cpu-board"), true);
    await reopened.locator('[data-replay="exit"]').click();
    await reopened.keyboard.press("Escape");
    assert.equal(await visible(reopened, "continue-run"), false);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("이어서 하기: 튜토리얼 힌트와 자유 연습 되돌리기를 복원한다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const advance = n =>
    page.evaluate(n => {
      for (let i = 0; i < n; i++) window.advanceFrame();
    }, n);
  try {
    await page.click("#open-practice");
    await page.click('[data-drill="downstack"]');
    await page.click('[data-downstack="downstack-1"]');
    await advance(1);
    await page.click("#downstack-hint");
    await page.click("#downstack-hint");
    const hint = await text(page, "downstack-status");
    assert.ok(hint);
    await page.reload();
    await page.click("#continue-run");
    assert.equal(await text(page, "downstack-status"), hint);
    await page.click("#go-home");
    await page.click('[data-confirm="ok"]');

    await page.click("#open-practice");
    await page.click('[data-drill="free"]');
    await advance(2);
    await page.keyboard.press("Space");
    await advance(10);
    await page.keyboard.press("Space");
    await advance(10);
    await page.keyboard.press("KeyU");
    await advance(2);
    const placed = await text(page, "hud-pieces");
    await page.reload();
    await page.click("#continue-run");
    await advance(1);
    assert.equal(await text(page, "hud-pieces"), placed);
    await page.keyboard.press("KeyU");
    await advance(1);
    assert.equal(Number(await text(page, "hud-pieces")), Number(placed) - 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("이어서 하기: 날짜 도전, 최고 기록과 달리기, 리플레이 장면 연습도 복원한다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    ({ replay, record }) => {
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
      localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
      localStorage.setItem("tetrisharp:replay:best", JSON.stringify({ "sprint40|modern": replay }));
    },
    fixture,
    { frameClock: true }
  );
  const advance = n =>
    page.evaluate(n => {
      for (let i = 0; i < n; i++) window.advanceFrame();
    }, n);
  const restore = async () => {
    await page.reload();
    await page.click("#continue-run");
    assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
  };
  const discard = async () => {
    await page.click("#go-home");
    await page.click('[data-confirm="ok"]');
  };
  try {
    await page.click('[data-mode="daily"]');
    await page.click("#daily-start");
    await advance(12);
    const daily = await text(page, "session-title");
    await restore();
    assert.equal(await text(page, "session-title"), daily);
    await discard();

    // 내 기록과 달리기는 기록 대화상자에서 시작한다
    await page.click("#open-records");
    await page.click("#records-race");
    await advance(90);
    const race = await page.locator("#race-progress").evaluate(el => el.value);
    assert.ok(race > 0);
    await restore();
    assert.equal(await page.locator("#race-progress").evaluate(el => el.value), race);
    await discard();

    await page.click("#watch-last");
    await page.locator("#replay-progress").fill("133");
    await page.click('[data-replay="practice"]');
    await advance(20);
    const scene = await text(page, "scene-practice-status");
    await restore();
    assert.equal(await text(page, "scene-practice-status"), scene);
    await page.click('[data-action="scene-exit"]');
    assert.equal(await page.locator("#replay-progress").inputValue(), "133");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("이어서 하기: 새 판을 취소한 뒤 Sprint를 완주하면 기록과 리플레이가 일치한다", async () => {
  const { replay } = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    seed => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    },
    replay.seed,
    { frameClock: true }
  );
  try {
    await startMode(page, "sprint40");
    await playReplayFrames(page, replay.inputs, 0, 241);
    await page.reload();
    const confirmation = page.waitForEvent("dialog").then(dialog => dialog.dismiss());
    await page.click('[data-mode="endless"]');
    await confirmation;
    assert.equal(await visible(page, "continue-run"), true);
    await page.click("#continue-run");
    await playReplayFrames(page, replay.inputs, 241, replay.result.frames);
    assert.equal(await page.locator("body").getAttribute("data-screen"), "results");
    const stored = await page.evaluate(() => ({
      replay: JSON.parse(localStorage.getItem("tetrisharp:replay:last")),
      records: JSON.parse(localStorage.getItem("tetrisharp:records"))["sprint40|modern"],
    }));
    assert.equal(stored.replay.result.frames, replay.result.frames);
    assert.equal(stored.records.length, 1);
    assert.equal(stored.records[0].frames, replay.result.frames);
    assert.equal(verifyReplay(stored.replay, findMode).ok, true);
    await page.reload();
    assert.equal(await visible(page, "continue-run"), false);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("보드가 멈추면 다시 그리지 않고, 남은 효과와 화면 크기 변경은 반영한다", async () => {
  const { context, page, errors } = await openPage(
    () => {
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
      window.boardPaints = 0;
      const clearRect = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.id === "board") window.boardPaints++;
        return clearRect.apply(this, args);
      };
    },
    undefined,
    { frameClock: true }
  );
  const advance = count =>
    page.evaluate(count => {
      for (let i = 0; i < count; i++) window.advanceFrame();
      return window.boardPaints;
    }, count);
  const image = () => page.locator("#board").evaluate(canvas => canvas.toDataURL());
  try {
    const menuPaints = await advance(1);
    assert.equal(menuPaints, 1);
    assert.equal(await advance(12), menuPaints);

    await startMode(page, "sprint40");
    await advance(1);
    const beforeDrop = await image();
    await page.keyboard.press("Space");
    const dropPaints = await advance(1);
    assert.notEqual(await image(), beforeDrop);
    await page.click("#pause-game");
    const settledPaints = await advance(30);
    assert.ok(settledPaints > dropPaints, "일시정지 직전의 착지 효과를 마무리한다");
    const settled = await image();
    assert.equal(await advance(12), settledPaints);
    assert.equal(await image(), settled);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await advance(1), settledPaints + 1);
    assert.notEqual(await image(), settled);
    assert.equal(await advance(12), settledPaints + 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

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
  assert.equal(await visible(page, "pause"), false, "진행 중 시작한 확인을 취소하면 바로 이어서 한다");
  await page.keyboard.press("Escape");

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
  await startMode(page, "endless");
  await page.keyboard.press("Space");
  await page.click("#go-home");
  assert.equal(await visible(page, "confirm"), true);
  assert.equal(await text(page, "confirm-title"), "첫 화면으로 갈까요?");
  await page.click('[data-confirm="cancel"]');
  assert.equal(await page.locator("body").getAttribute("data-screen"), "play", "취소하면 판이 남아 있다");
  await page.click("#go-home");
  await page.click('[data-confirm="ok"]');
  assert.equal(await visible(page, "menu"), true);

  // 끝난 판: 묻지 않는다. 결과 화면의 R도 바로 다시 시작
  await startMode(page, "endless");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  await page.keyboard.press("KeyR");
  assert.equal(await visible(page, "confirm"), false, "결과 화면에서는 묻지 않는다");
  await page.waitForFunction(
    () => document.body.dataset.screen === "countdown" || document.body.dataset.screen === "play"
  );
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]');
  await startMode(page, "endless");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  await page.click("#go-home");
  assert.equal(await visible(page, "menu"), true, "결과 화면에서 로고를 누르면 바로 첫 화면");
  assert.deepEqual(errors, []);
  await context.close();
});

test("막히면 결과 화면이 뜨고, Space 연타로 건너뛰지 않으며, Esc로 메뉴", async () => {
  const { context, page, errors } = await openPage();
  await startMode(page, "endless");
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

test("전체 설정 초기화는 취소할 수 있고, 확인 후 버튼으로 포커스가 돌아온다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-settings");
  const das = page.locator("#set-das");
  await das.fill("100");
  const reset = page.locator("#settings-reset");
  page.once("dialog", dialog => dialog.dismiss());
  await reset.click();
  assert.equal(await das.inputValue(), "100");

  page.once("dialog", dialog => dialog.accept());
  await reset.click();
  assert.notEqual(await das.inputValue(), "100");
  assert.equal(await reset.evaluate(el => el === document.activeElement), true);
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
  assert.equal(await page.locator("#mode-list .menu-row").count(), 9);
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
  const idText = () => page.locator("#rules-record").getAttribute("data-record-key");
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
  await startMode(page, "endless");
  for (let i = 0; i < 40; i++) await page.keyboard.press(i % 3 ? "Space" : "ArrowLeft");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 5000 });
  const pieces = await text(page, "hud-pieces");

  // 보기: 4배속으로 끝까지
  await page.click('[data-action="watch"]');
  assert.equal(await visible(page, "replay-bar"), true);
  await page.click('[data-replay="step"]');
  const position = () => page.locator("#replay-progress").evaluate(input => Number(input.value));
  const stepFrame = await position();
  await page.click('[data-replay="step"]');
  assert.equal(await position(), stepFrame + 1);
  await page.click('[data-replay="step-back"]');
  assert.equal(await position(), stepFrame, "한 프레임 뒤로");
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
  await page.click('[data-action="export"]');
  await page.locator("#share-link").waitFor({ state: "visible" });
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => {
        throw new Error("clipboard denied");
      },
    });
  });
  await page.click("#share-link");
  assert.match(await page.locator('#share input[type="url"]').inputValue(), /#replay=/);
  assert.equal(await page.locator('#share input[type="url"]').evaluate(el => el === document.activeElement), true);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#share-file")]);
  await page.click("#share-close");
  assert.match(download.suggestedFilename(), /^tetri-sharp-endless-.*\.json$/);
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
  await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent !== "", null, {
    timeout: 3000,
  });
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
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, {
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
  const sels = ["#rule-tabs", "#edit-rules", "#mode-list", "#mode-list .menu-row", "#watch-last", "#board"];
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

  await startMode(page, "endless");
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

test("게임 테마: 아홉 테마가 서로 다르게 그려지고, 설정에서 바꾸면 바로 반영된다", async () => {
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
  for (const theme of ["retro", "minimal", "graphite", "frame", "stone", "midnight", "forest", "white", "modern"]) {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    await page.click(`#set-theme [data-value="${theme}"]`);
    await page.click("#settings-close");
    await page.waitForTimeout(100);
    seen.add(await snapshot());
  }
  assert.equal(seen.size, 9, "테마마다 다른 그림");
  assert.deepEqual(errors, []);
  await context.close();
});

test("게임 테마: 호버한 카드만 재생하고 벗어나거나 모션을 줄이면 정지한다", async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    const card = page.locator('#set-theme [data-value="retro"]');
    const canvas = card.locator("canvas");
    const other = page.locator('#set-theme [data-value="modern"] canvas');
    const snapshot = locator => locator.evaluate(c => c.toDataURL());
    const still = await snapshot(canvas);
    const stillOther = await snapshot(other);
    const changed = () =>
      page.waitForFunction(
        initial => document.querySelector('#set-theme [data-value="retro"] canvas').toDataURL() !== initial,
        still
      );
    await card.hover();
    await changed();
    assert.equal(await card.getAttribute("aria-pressed"), "false", "호버로 테마가 선택되지 않는다");
    assert.equal(await snapshot(other), stillOther);
    assert.equal(await page.locator("dialog[open]").count(), 1);
    await page.locator("#settings-close").hover();
    assert.equal(await snapshot(canvas), still);

    await card.hover();
    await changed();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      initial => document.querySelector('#set-theme [data-value="retro"] canvas').toDataURL() === initial,
      still
    );
    await page.locator("#settings-close").hover();
    await card.hover();
    await page.waitForTimeout(450);
    assert.equal(await snapshot(canvas), still);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
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
  assert.equal(await page.locator(".records-empty").isVisible(), true);
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
  // 기록 대화상자: 최고 기록 리플레이가 있는 모드·규칙에서만 "최고 기록과 달리기"가 보인다
  await page.click("#open-records");
  await choose(page, "records-rules", "retro");
  assert.equal(await page.locator("#records-race").count(), 0, "Retro 최고 기록은 없다");
  await choose(page, "records-rules", "modern");
  await choose(page, "records-mode", "ultra");
  assert.equal(await page.locator("#records-race").count(), 0, "Ultra 최고 기록은 없다");
  await choose(page, "records-mode", "sprint40");
  await page.click("#records-race");
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
  await page.click('[data-confirm="ok"]');
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
  await startMode(page, "endless");
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

test("규칙 공유: 받은 코드·링크는 지금 규칙을 덮어쓰지 않고 내 규칙에 새 칸으로 들어온다", async () => {
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
  assert.match(await text(page, "rules-record"), /새 칸으로 불러왔어요/);
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "받은 규칙");
  await page.click('.dialog-tabs [data-value="피스"]');
  assert.match(await page.locator("#rule-rotation .select-value").textContent(), /킥 없음/);
  await page.click('.dialog-tabs [data-value="공유"]');
  await page.locator("#rule-share-paste").fill("엉터리");
  await page.click("#rule-share-load");
  assert.match(await text(page, "rules-record"), /읽을 수 없는/);
  await page.click("#rules-close");
  // 첫 화면: 내 규칙 두 개, 원래 규칙(Modern 값)은 그대로
  await choose(page, "rule-slot", "0");
  await page.click("#edit-rules");
  await page.click('.dialog-tabs [data-value="피스"]');
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "내 규칙 1");
  assert.match(await page.locator("#rule-rotation .select-value").textContent(), /SRS/, "덮어쓰지 않았다");
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
  assert.match(await p2.locator("#menu-notice").textContent(), /내 규칙에 새로 넣었어요/);
  assert.equal(new URL(p2.url()).hash, "", "주소의 해시는 지운다");
  assert.equal(await p2.locator("#rule-slot .select-value").textContent(), "받은 규칙");
  await p2.click("#edit-rules");
  assert.match(await p2.locator("#rule-rotation .select-value").textContent(), /킥 없음/);
  assert.deepEqual([...errors, ...errs2], []);
  await fresh.close();
});

test("내 규칙: 첫 화면에서 고르고 공유 탭을 열며, 편집기에서 새 규칙·이름·지우기를 한다", async () => {
  const { context, page, errors } = await openPage();
  // Custom이 아닐 때는 내 규칙 줄이 보이지 않지만 자리는 그대로
  assert.equal(await page.locator("#rule-slot-row").evaluate(el => getComputedStyle(el).visibility), "hidden");
  await page.click('[data-rules="custom"]');
  assert.equal(await page.locator("#rule-slot-row").evaluate(el => getComputedStyle(el).visibility), "visible");
  await page.click("#rule-slot-share");
  assert.equal(await page.locator("#rule-share-code").isVisible(), true, "공유 탭으로 열린다");
  await page.click("#rule-slot-add");
  await page.locator("#rule-slot-name").fill("대회용");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "대회용");
  await page.click("#rules-close");
  // 대화상자의 close 이벤트(첫 화면 다시 그리기)는 닫은 다음 차례에 온다
  await page.waitForFunction(() => document.querySelector("#rule-slot .select-value")?.textContent === "대회용");
  await page.click("#edit-rules");
  page.once("dialog", dialog => dialog.accept());
  await page.click("#rule-slot-remove");
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "내 규칙 1");
  assert.equal(await page.locator("#rule-slot-remove").isDisabled(), true, "마지막 하나는 지울 수 없다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("연습: 메뉴에서 고르면 시작하고, 놓을 때마다 성공/시도를 센다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-practice");
  assert.equal(await page.locator("#practice .menu-row").count(), 12);
  assert.equal(await page.locator('[data-drill="double"]').isVisible(), true);
  await page.click('[data-drill="tsd"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, {
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

test("파내기 훈련: 단계 선택, 두 가지 힌트, 같은 판 재시작 후 힌트 없이 클리어", async () => {
  const { context, page, errors } = await openPage(null, undefined, { frameClock: true });
  const press = code =>
    page.evaluate(key => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: key, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: key, cancelable: true }));
      window.advanceFrame();
    }, code);
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.click("#open-practice");
    await page.click('[data-drill="downstack"]');
    const stages = page.locator("[data-downstack]");
    assert.equal(await stages.count(), 6);
    for (const width of [390, 624, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await stages.evaluateAll(rows =>
          rows.every(row => {
            const title = row.querySelector(".menu-text");
            const chevron = row.querySelector(".icon");
            const bounds = title.getBoundingClientRect();
            return bounds.width > row.clientWidth * 0.65 && bounds.right <= chevron.getBoundingClientRect().left;
          })
        ),
        `제목이 행의 가용 너비를 쓴다 · ${width}px`
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('[data-downstack="downstack-1"]');
    await page.evaluate(() => window.advanceFrame());
    const hint = page.locator("#downstack-hint");
    assert.equal(await text(page, "hud-lines"), "2");
    await hint.click();
    assert.match(await text(page, "downstack-status"), /열린 칸/);
    await hint.click();
    assert.match(await text(page, "downstack-status"), /피스를 놓을 수 있는/);
    await press("ArrowLeft");
    await press("Space");
    assert.equal(await text(page, "results-title"), "쓰레기 줄이 남았어요");

    await page.click('#results [data-action="retry"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "downstack-status"), "");
    await hint.click();
    await page.click("#downstack-retry");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "downstack-status"), "");
    assert.equal(await text(page, "hud-lines"), "2");
    await press("Space");
    assert.equal(await text(page, "results-title"), "쓰레기 줄을 모두 지웠어요!");
    await page.click('#results [data-action="next-puzzle"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-lines"), "4");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("입문 코스 완료 표시와 수동 Sprint 시도 기록을 볼 수 있다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const play = codes =>
    page.evaluate(keys => {
      for (const code of keys) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code, cancelable: true }));
        window.advanceFrame();
      }
    }, codes);
  try {
    await page.click("#open-help");
    await page.getByRole("button", { name: "기본 조작 연습" }).click();
    for (const [index, code] of ["ArrowLeft", "ArrowUp", "KeyC", "Space"].entries()) {
      await play([code]);
      assert.equal(await text(page, "results-title"), "성공!");
      if (index < 3) await page.click('#results [data-action="next-puzzle"]');
    }
    await page.click('#results [data-action="menu"]');
    await page.click("#open-practice");
    await page.click('[data-drill="intro"]');
    assert.equal(
      await page
        .locator("[data-practice-stage] small")
        .allTextContents()
        .then(a => a.filter(t => t === "완료").length),
      4
    );
    await page.click("#practice-close");
    await page.evaluate(() =>
      localStorage.setItem(
        "tetrisharp:sprint:history",
        JSON.stringify({
          modern: [
            { frames: 3600, cleared: true },
            { frames: 4800, cleared: true },
          ],
        })
      )
    );
    await startMode(page, "sprint40");
    await play(Array(30).fill("Space"));
    await page.click('#results [data-action="menu"]');
    await page.click("#open-records");
    await page.click("#sprint-history summary");
    assert.equal(await page.locator("#sprint-history .sprint-dnf").count(), 1);
    assert.equal(await page.locator(".sprint-history-chart li").count(), 3);
    assert.match(await text(page, "sprint-history"), /중앙값 1:10\.00/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("CPU 대전 입문: 즉시 재시도하고 공격·상쇄·전송 수를 비교한다", async () => {
  const { context, page, errors } = await openPage(null, undefined, { frameClock: true });
  const play = codes =>
    page.evaluate(keys => {
      for (const code of keys) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code, cancelable: true }));
        window.advanceFrame();
      }
    }, codes);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click("#open-practice");
    await page.click('[data-drill="battle-training"]');
    assert.equal(await page.locator("[data-practice-stage]").count(), 3);
    await page.click('[data-practice-stage="battle-lesson-1"]');
    assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
    await play(["ArrowUp", "ArrowLeft", "Space"]);
    assert.equal(await text(page, "race-result"), "공격 4줄 · 상쇄 0줄 · 상대에게 4줄");

    await page.click('#results [data-action="next-puzzle"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-lines"), "4");
    await play(["Space"]);
    assert.equal(await text(page, "results-title"), "실패");
    assert.match(await text(page, "results-stats"), /받은 쓰레기4/);
    await page.click('#results [data-action="retry"]');
    assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
    await play(["ArrowUp", ...Array(4).fill("ArrowLeft"), "Space"]);
    assert.equal(await text(page, "race-result"), "공격 4줄 · 상쇄 4줄 · 상대에게 0줄");

    await page.click('#results [data-action="next-puzzle"]');
    await play(["ArrowUp", ...Array(3).fill("ArrowRight"), "Space"]);
    assert.equal(await text(page, "race-result"), "공격 4줄 · 상쇄 2줄 · 상대에게 2줄");
    assert.equal(await page.locator('#results [data-action="next-puzzle"]').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("빌드 연습: 빈칸·배치 힌트, 초기화와 힌트 없는 4줄 완주", async () => {
  const { context, page, errors } = await openPage(null, undefined, { frameClock: true });
  const play = codes =>
    page.evaluate(keys => {
      for (const code of keys) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code, cancelable: true }));
        window.advanceFrame();
      }
    }, codes);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click("#open-practice");
    await page.click('[data-drill="build-training"]');
    assert.equal(await page.locator("[data-practice-stage]").count(), 2);
    await page.click('[data-practice-stage="build-lesson-1"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-lines"), "10");
    await page.click("#downstack-hint");
    assert.match(await text(page, "downstack-status"), /점선 열/);
    await page.click("#downstack-hint");
    assert.match(await text(page, "downstack-status"), /놓을 수 있는 자리/);
    await play([...Array(4).fill("ArrowLeft"), "Space"]);
    assert.equal(await text(page, "hud-lines"), "9");
    await page.click("#downstack-retry");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-lines"), "10");
    assert.equal(await text(page, "downstack-status"), "");

    await play([4, 2, 4, 2].flatMap(count => [...Array(count).fill("ArrowLeft"), "Space"]));
    await play(Array.from({ length: 4 }, () => ["ArrowRight", "Space"]).flat());
    await play([3, 4].flatMap(count => ["ArrowUp", ...Array(count).fill("ArrowRight"), "Space"]));
    assert.equal(await text(page, "results-title"), "성공!");
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:practice:progress")));
    assert.equal(progress["build-lesson-1"], "no-hints");
    await page.click('#results [data-action="next-puzzle"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-lines"), "3");
    assert.match(await text(page, "session-title"), /T스핀 더블/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
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
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, {
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

test("터치 입력: 두 손가락과 버튼 밖 해제를 처리하고 낮은 가로 대전에서도 드롭한다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ touch: "on", access: { countdown: "off" } }))
  );
  const page = await context.newPage();
  try {
    await page.goto(url);
    await startMode(page, "sprint40");
    const left = page.locator('[data-touch="LEFT"]');
    await left.evaluate(button => {
      const send = (target, type, pointerId) =>
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: "touch", button: 0 }));
      send(button, "pointerdown", 101);
      send(button, "pointerdown", 102);
      send(document.body, "pointerup", 101);
    });
    assert.ok(await left.evaluate(button => button.classList.contains("is-down")));
    await page.evaluate(() =>
      document.body.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 102 }))
    );
    assert.equal(await left.evaluate(button => button.classList.contains("is-down")), false);
    await page.tap('[data-touch="PAUSE"]');
    assert.equal(await visible(page, "pause"), true);
    await page.click('#pause [data-action="menu"]');
    await page.click('[data-confirm="ok"]');

    await page.setViewportSize({ width: 667, height: 300 });
    await page.tap('[data-mode="versus"]');
    await page.tap('#versus [data-level="easy"]');
    const drop = page.locator('[data-touch="HARD"]');
    const box = await drop.boundingBox();
    assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= 300);
    await drop.tap();
    await page.waitForFunction(() => Number(document.getElementById("hud-pieces")?.textContent) > 0);
    await page.tap('[data-touch="PAUSE"]');
    assert.equal(await visible(page, "pause"), true);
    await page.click('#pause [data-action="resume"]');
    await drop.evaluate(button => {
      for (let i = 0; i < 40; i++) {
        for (const type of ["pointerdown", "pointerup"]) {
          button.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 200, pointerType: "touch" }));
        }
      }
    });
    await page.locator("#results").waitFor({ timeout: 5000 });
    for (const action of ["retry", "menu"]) {
      const button = await page.locator(`#results [data-action="${action}"]`).boundingBox();
      assert.ok(button && button.y >= 0 && button.y + button.height <= 300);
    }
  } finally {
    await context.close();
  }
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
  await page.click('[data-confirm="ok"]');

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
  // 백업은 설정의 데이터 탭에 있다
  await page.click("#open-settings");
  await page.click('#settings .dialog-tabs [data-value="data"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export-backup")]);
  assert.match(await text(page, "settings-notice"), /백업 파일로 저장했어요/, "결과는 설정의 알림 칸에");
  await page.keyboard.press("Escape");
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

test("단일 HTML 파일을 처음부터 오프라인에서 열어 Sprint를 시작한다", async t => {
  const context = await browser.newContext({ locale: "ko-KR", offline: true });
  try {
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(path.join(dir, "index.html")).href);
    } catch (error) {
      if (!error.message.includes("ERR_BLOCKED_BY_ADMINISTRATOR")) throw error;
      return t.skip("Chromium 관리 정책에서 file: 탐색을 막습니다.");
    }
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    await startMode(page, "sprint40");
  } finally {
    await context.close();
  }
});

test("네트워크 없이 단일 HTML에서 이전 백업을 확인하고 안전하게 복원한다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", offline: true });
  const { replay, record } = JSON.parse(
    fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8")
  );
  const backup = {
    app: "tetri-sharp",
    kind: "backup",
    v: 1,
    date: "2026-01-01T00:00:00Z",
    data: {
      settings: { access: { countdown: "off" } },
      records: { "sprint40|modern": [record] },
      "replay:best": { "sprint40|modern": replay },
      "replay:last": replay,
    },
  };
  const file = { name: "old-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };
  const ready = page => page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  const best = page => page.locator('[data-mode="sprint40"] .mode-best').textContent();
  const errors = [];
  const extraRequests = [];
  await context.route("**/*", route => {
    if (route.request().url() === url) return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    extraRequests.push(route.request().url());
    return route.abort();
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await ready(page);
    await startMode(page, "sprint40");
    await page.reload();
    await ready(page);

    await page.evaluate(() => localStorage.setItem("tetrisharp:practice:progress", '{"intro-1":"clear"}'));
    await page.setInputFiles("#backup-file", { ...file, buffer: Buffer.from("{") });
    await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent.includes("읽을 수 없는"));

    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "tetrisharp:restore") throw new DOMException("quota", "QuotaExceededError");
        return setItem.call(this, key, value);
      };
    });

    const messages = [];
    page.on("dialog", async dialog => {
      messages.push(dialog.message());
      await dialog.accept();
    });
    await page.setInputFiles("#backup-file", file);
    await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent.includes("저장하지 못했어요"));
    assert.match(messages[0], /기록 1개, 리플레이 2개/);
    assert.match(messages[0], /퍼즐 완료 0개 · 훈련 완료 0개 · Sprint 시도 0개/);
    assert.equal(await best(page), "");
    assert.equal(await page.locator("#watch-last").isDisabled(), true);

    await page.reload();
    await ready(page);
    await page.setInputFiles("#backup-file", file);
    await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent.includes("백업을 불러왔어요"));
    await page.reload();
    await ready(page);
    assert.match(await best(page), /최고 기록/);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("tetrisharp:practice:progress")),
      '{"intro-1":"clear"}'
    );
    await page.click("#watch-last");
    assert.equal(await visible(page, "replay-bar"), true);
    await page.click('[data-replay="exit"]');
    await page.click("#continue-run");
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    assert.deepEqual(errors, []);
    assert.deepEqual(extraRequests, []);
  } finally {
    await context.close();
  }
});

test("Survival 목표는 30초에 갱신되고, 같은 시드 재도전 결과는 이전 최고와 비교한다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const topOut = () =>
    page.evaluate(() => {
      for (let i = 0; i < 80 && document.body.dataset.screen === "play"; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", cancelable: true }));
        window.advanceFrame();
      }
    });
  const last = () => page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:replay:last")));
  try {
    await startMode(page, "survival");
    await topOut();
    assert.equal(await text(page, "race-result"), "첫 목표 0:30 미달성");
    const first = await last();
    assert.equal(first.mode, "survival");
    assert.ok(first.result.frames < 1800);

    await page.click("#survival-retry-seed");
    assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
    await page.evaluate(() => {
      for (let i = 0; i < 1799; i++) window.advanceFrame();
    });
    assert.equal(await text(page, "hud-time"), "0:29.98");
    assert.equal(await text(page, "hud-survival-goal"), "0:30");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "hud-survival-goal"), "1:00");
    await topOut();
    const second = await last();
    assert.equal(second.seed, first.seed);
    assert.deepEqual(second.rules, first.rules);
    const delta = ((second.result.frames - first.result.frames) / 60).toFixed(2);
    assert.equal(await text(page, "race-result"), `0:30 구간 달성 · 이전 최고보다 ${delta}초 더 버팀`);
    const stored = await page.evaluate(() => localStorage.getItem("tetrisharp:records"));
    await page.click("#survival-rescue");
    assert.equal(await page.locator("body").getAttribute("data-scene-practice"), "rescue");
    await page.evaluate(() => window.advanceFrame());
    const startTime = await text(page, "hud-time");
    assert.ok(startTime.startsWith("0:30."));
    assert.ok(await visible(page, "hud-lines"));
    await topOut();
    assert.equal(await text(page, "scene-result-title"), "구조 시도 결과");
    assert.match(await text(page, "scene-result-best"), /막은 쓰레기 줄 차이/);
    await page.setViewportSize({ width: 560, height: 320 });
    for (const button of await page.locator("#scene-result .actions-row button").all()) {
      const box = await button.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 560 && box.y + box.height <= 320);
    }
    await page.click('#scene-result [data-action="scene-retry"]');
    await page.evaluate(() => window.advanceFrame());
    assert.ok((await text(page, "hud-time")).startsWith("0:30."));
    assert.deepEqual(await last(), second);
    assert.equal(await page.evaluate(() => localStorage.getItem("tetrisharp:records")), stored);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
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
  await startMode(page, "endless");
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
  try {
    // 접었을 때는 화면에 들어가고(약 700px) 펼치면 넘치는(약 860px) 높이
    const page = await real.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 760 } });
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
  } finally {
    // 따로 띄운 브라우저는 실패해도 닫는다(남으면 테스트 프로세스가 끝나지 않는다)
    await real.close();
  }
});

test("화면 색: 시스템이 라이트여도 다크를 고르면 첫 화면이 어두워지고, 새로고침 후에도 유지된다", async () => {
  const context = await browser.newContext({
    locale: "ko-KR",
    colorScheme: "light",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  // 배경색은 짧게 전환되므로 끝날 때까지 기다린 뒤 잰다.
  const lum = async () => {
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
  };
  assert.ok((await lum()) > 200, "시스템(라이트)");
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.click('#set-scheme [data-value="dark"]');
  assert.ok((await lum()) < 40, "다크를 고르면 바로 어두워진다");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.ok((await lum()) < 40, "새로고침 후에도 다크");
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.click('#set-scheme [data-value="system"]');
  assert.ok((await lum()) > 200, "시스템으로 돌리면 다시 라이트");
  await context.close();
});
test("CPU 대전: 난이도를 골라 시작하면 CPU 보드가 함께 움직이고, 막히면 패배와 전적이 남는다", async () => {
  const { context, page, errors } = await openPage();
  await page.click('[data-mode="versus"]');
  assert.equal(await page.locator("#versus .menu-row").count(), 7);
  await page.click('#versus [data-level="master"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, { timeout: 3000 });
  assert.equal(await visible(page, "versus-panel"), true);
  assert.equal(await visible(page, "cpu-board"), true);
  assert.equal(await text(page, "versus-name"), "CPU · 최강");
  assert.equal(await text(page, "hud-lines-label"), "받을 쓰레기");
  // CPU가 피스를 놓는다(보드에 블록이 생긴다)
  await page.waitForFunction(
    () => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById("cpu-board"));
      const d = c.getContext("2d").getImageData(0, Math.floor(c.height * 0.9), c.width, 4).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) lit++;
      return lit > 10;
    },
    null,
    { timeout: 5000 }
  );
  for (let i = 0; i < 60 && !(await visible(page, "results")); i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 5000 });
  assert.equal(await text(page, "results-title"), "패배");
  assert.match(await page.locator("#results-stats").textContent(), /전적0승 1패/);
  assert.equal(
    await page.locator('#results [data-action="watch"]').isEnabled(),
    true,
    "결과 화면에서 대전을 다시 볼 수 있다"
  );
  await page.keyboard.press("Escape");
  await page.click('[data-mode="versus"]');
  assert.equal(await page.locator('#versus [data-level="master"] .mode-best').textContent(), "0승 1패");
  assert.deepEqual(errors, []);
  await context.close();
});

test("CPU 대전: 낮은 창에서도 중간 난이도를 열 수 있고 기존 전적과 따로 저장한다", async () => {
  const stages = ["easy", "easy-plus", "normal", "normal-plus", "hard", "hard-plus", "master"];
  for (const { width, height, hasTouch, locale } of [
    { width: 560, height: 320, hasTouch: false, locale: "ko-KR" },
    { width: 667, height: 300, hasTouch: true, locale: "en-US" },
    { width: 320, height: 480, hasTouch: true, locale: "en-US" },
  ]) {
    const context = await browser.newContext({ locale, viewport: { width, height }, hasTouch });
    try {
      await context.addInitScript(() => {
        localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
        localStorage.setItem("tetrisharp:versus:stats", JSON.stringify({ hard: { win: 3, loss: 1 } }));
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.click('[data-mode="versus"]');
      const dialog = page.locator("#versus");
      const body = dialog.locator(".dialog-body");
      const close = dialog.locator("#versus-close");
      const rows = dialog.locator("[data-level]");
      const next = rows.filter({ hasText: hasTouch ? "Hard+" : "어려움+" });
      assert.deepEqual(await rows.evaluateAll(items => items.map(item => item.dataset.level)), stages);
      assert.match(
        await dialog.locator('[data-level="hard"] .mode-best').textContent(),
        hasTouch ? /3W 1L/ : /3승 1패/
      );
      assert.equal(await next.locator(".mode-best").textContent(), "");
      const closeBox = await close.boundingBox();
      assert.ok(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= height);
      const columnsFit = el => el.scrollWidth <= el.clientWidth + 1;
      assert.ok(await body.evaluate(columnsFit));
      if (hasTouch) {
        await next.scrollIntoViewIfNeeded();
      } else {
        for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
        assert.equal(await next.evaluate(el => el === document.activeElement), true);
      }
      assert.ok(await body.evaluate(el => el.scrollTop > 0));
      assert.deepEqual(await close.boundingBox(), closeBox);
      if (hasTouch) await next.tap();
      else await page.keyboard.press("Enter");
      assert.equal(await text(page, "versus-name"), hasTouch ? "CPU · Hard+" : "CPU · 어려움+");
      assert.ok(
        await page.locator(".app-header").evaluate(el => {
          const title = el.querySelector(".session-title").getBoundingClientRect();
          const header = el.getBoundingClientRect();
          return title.top >= header.top && title.bottom <= header.bottom;
        })
      );
      if (hasTouch) continue;

      for (let i = 0; i < 60 && !(await visible(page, "results")); i++) await page.keyboard.press("Space");
      await page.waitForFunction(() => document.body.dataset.screen === "results");
      const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:versus:stats")));
      assert.deepEqual(stats, { hard: { win: 3, loss: 1 }, "hard-plus": { win: 0, loss: 1 } });
    } finally {
      await context.close();
    }
  }
});

test("오늘의 도전: 창에서 시작하고, 받은 코드(이름 포함)로 겨루며, #daily= 링크로 열면 코드가 채워진다", async () => {
  const code = await encodeReplayCode(botDailyReplay(dateKey()), "봇");
  const { context, page, errors } = await openPage();
  await page.click('[data-mode="daily"]');
  assert.equal(await page.locator("#daily").isVisible(), true);
  assert.equal(await page.locator("#daily-copy").count(), 0, "오늘 기록이 없으면 공유 섹션을 표시하지 않는다");
  assert.equal(await page.locator("#daily-race").isDisabled(), true);
  const pasteCode = value =>
    page.locator("#daily-paste").evaluate((input, text) => {
      input.value = text;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
    }, value);
  await pasteCode("invalid-code");
  await page.click("#daily-race");
  assert.match(await text(page, "daily-notice"), /읽을 수 없는 코드/);

  await pasteCode(code);
  await page.click("#daily-race");
  await page.waitForFunction(
    () => document.body.dataset.screen === "countdown" || document.body.dataset.screen === "play"
  );
  assert.equal(await visible(page, "race-panel"), true);
  assert.equal(await text(page, "race-label"), "봇의 기록");
  assert.match(await text(page, "session-title"), /오늘의 도전/);
  await page.waitForFunction(() => Number(document.getElementById("race-progress").value) > 0, null, { timeout: 8000 });
  await context.close();

  const linked = await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  const p2 = await linked.newPage();
  await p2.goto(`${url}#daily=${code}`);
  await p2.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await p2.waitForFunction(() => document.getElementById("daily")?.open, null, { timeout: 3000 });
  assert.match(await p2.locator("#daily-paste").inputValue(), /daily=TD1-/);
  assert.equal(await p2.evaluate(() => location.hash), "", "주소의 해시는 지운다");
  assert.deepEqual(errors, []);
  await linked.close();
});

test("최근 도전: 날짜별 최고 기록을 다시 보고 같은 시드로 도전한다", async () => {
  const date = "2026-11-19";
  const replay = botDailyReplay(date);
  assert.equal(replay.result.over, "clear");
  const { context, page, errors } = await openPage(value => {
    const key = `${value.mode}|modern`;
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    localStorage.setItem("tetrisharp:records", JSON.stringify({ [key]: [{ ...value.result, date: value.date }] }));
    localStorage.setItem("tetrisharp:replay:best", JSON.stringify({ [key]: [value] }));
  }, replay);
  try {
    await page.clock.setFixedTime(new Date(2026, 10, 21, 12));
    const open = () => page.click('[data-mode="daily"]');
    const picker = page.locator("#daily-date");
    const pick = value => choose(page, "daily-date", value);
    await open();
    assert.equal(await picker.getAttribute("data-value"), "2026-11-21");
    await picker.click();
    assert.equal(await page.locator("#daily-date-list [role=option]").count(), 7);
    await page.keyboard.press("Escape");
    assert.equal(await visible(page, "daily"), true, "Esc는 목록만 닫는다");
    assert.equal(await text(page, "daily-best"), "이 날짜의 기록이 없어요");
    await pick(date);
    assert.match(await text(page, "daily-best"), /최고 기록/);
    await page.locator("#daily-code").waitFor();
    const shared = await decodeReplayCode(await page.locator("#daily-code").inputValue());
    assert.equal(shared.mode, replay.mode);
    assert.equal(shared.seed, replay.seed);
    await pick("2026-11-20");
    assert.equal(await page.locator("#daily-watch").isVisible(), false);
    assert.equal(await page.locator("#daily-code").count(), 0);

    await pick(date);
    await page.click("#daily-watch");
    assert.match(await text(page, "replay-title"), new RegExp(date));
    await page.click('[data-replay="exit"]');
    await open();
    await pick(date);
    await page.click("#daily-start");
    assert.match(await text(page, "session-title"), new RegExp(date));
    for (let i = 0; i < 60 && !(await visible(page, "results")); i++) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(20);
    }
    assert.ok(await visible(page, "results"));
    const attempt = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:replay:last")));
    assert.equal(attempt.mode, replay.mode);
    assert.equal(attempt.seed, replay.seed);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("CPU 대전: 첫 싱글의 공격 0줄과 콤보 공격 이유를 플레이 중 보여 준다", async () => {
  const { replay } = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    seed => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off", announce: "on" } }));
    },
    replay.seed,
    { locale: "en-US", frameClock: true }
  );
  try {
    await page.click('[data-mode="versus"]');
    assert.equal(await page.locator("#versus .notice-slot").isVisible(), false);
    await page.click('#versus [data-level="easy"]');
    await page.setViewportSize({ width: 560, height: 360 });
    const rect = () => page.locator("#board").boundingBox();
    const board = await rect();
    const message = page.locator("#versus-feedback");
    const outcome = message.locator(".versus-feedback-outcome");
    const parts = () => message.locator(".versus-feedback-parts span").allTextContents();

    await playReplayFrames(page, replay.inputs, 0, 21);
    assert.equal(await outcome.textContent(), "No attack");
    assert.deepEqual(await parts(), ["1-line clear +0"]);
    assert.ok(await message.evaluate(el => Boolean((window.firstAttackAnimation = el.getAnimations()[0]))));
    await playReplayFrames(page, replay.inputs, 21, 31);
    assert.equal(await message.evaluate(el => el.getAnimations()[0] === window.firstAttackAnimation), true);

    await playReplayFrames(page, replay.inputs, 31, 241);
    assert.equal(await outcome.textContent(), "1 sent");
    assert.deepEqual(await parts(), ["2-line clear +1"]);
    assert.equal(await text(page, "versus-cpu-incoming"), "1");
    await playReplayFrames(page, replay.inputs, 241, 255);
    assert.deepEqual(await parts(), ["1-line clear +0", "Combo +1"]);
    assert.match(await text(page, "sr-status"), /1 sent.*Combo \+1/);
    assert.deepEqual(await rect(), board);
    const box = await message.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 560 && box.y >= 0 && box.y + box.height <= 360);
    await page.keyboard.press("KeyR");
    await page.keyboard.press("KeyR");
    assert.equal(await message.evaluate(el => el.classList.contains("is-shown")), false);
    await playReplayFrames(page, replay.inputs, 0, 21);
    assert.equal(await outcome.textContent(), "No attack");
    assert.equal(await message.evaluate(el => el.classList.contains("is-shown")), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("CPU 대전 리플레이: 양쪽 보드와 승패를 보고 공격 프레임으로 이동한다", async () => {
  const { replay } = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    seed => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    },
    replay.seed,
    { locale: "en-US", frameClock: true }
  );
  try {
    await page.click('[data-mode="versus"]');
    await page.click('#versus [data-level="easy"]');
    await playReplayFrames(page, replay.inputs, 0, 255);
    await playReplayFrames(page, replay.inputs, 255, 755, 0, true);
    const watch = page.locator('#results [data-action="watch"]');
    assert.ok(await watch.isVisible());
    const result = await text(page, "results-title");
    await watch.click();
    assert.equal(await visible(page, "board"), true);
    assert.equal(await visible(page, "replay-cpu-board"), true);
    const boardGroup = await page.locator(".board-wrap").boundingBox();
    const controls = await page.locator("#replay-bar").boundingBox();
    assert.ok(boardGroup.x + boardGroup.width + 8 <= controls.x);
    assert.equal(await page.locator('[data-replay="share"]').isVisible(), false);

    const progress = page.locator("#replay-progress");
    const attack = page.locator(".replay-mark.is-sent").first();
    await attack.click();
    assert.equal(await progress.inputValue(), "241");
    assert.equal(await text(page, "replay-cpu-pending"), "1");
    assert.match(await text(page, "replay-battle-event"), /My board.*1 sent/);
    const snapshot = () =>
      page.evaluate(() => {
        window.advanceFrame();
        return ["board", "replay-cpu-board"].map(id => document.getElementById(id).toDataURL());
      });
    const boards = await snapshot();
    await progress.fill(await progress.getAttribute("max"));
    assert.equal(await text(page, "replay-status"), result);
    await attack.click();
    assert.deepEqual(await snapshot(), boards);

    for (const [width, height] of [
      [960, 360],
      [560, 360],
      [320, 480],
    ]) {
      await page.setViewportSize({ width, height });
      const before = await page.locator("#board").boundingBox();
      await page.locator('[data-board-view="cpu"]').click();
      assert.equal(await visible(page, "board"), false);
      assert.deepEqual(await page.locator("#replay-cpu-board").boundingBox(), before);
      assert.equal(await progress.inputValue(), "241");
      assert.equal(await page.locator('[data-board-view="cpu"]').getAttribute("aria-pressed"), "true");
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight + 1
        )
      );
      await page.locator('[data-board-view="own"]').click();
    }
    await page.locator('[data-replay="step"]').click();
    assert.equal(await progress.inputValue(), "242");
    await page.locator('[data-replay="step-back"]').click();
    assert.equal(await progress.inputValue(), "241");
    await page.keyboard.press("Escape");
    assert.equal(await text(page, "results-title"), result);
    assert.equal(await watch.evaluate(el => document.activeElement === el), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("tetrisharp:replay:last")), null);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("리플레이 탐색: 막대로 원하는 시점에 가고, 표시로 건너뛰며, 뒤로 가도 같은 판이 나온다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(replay => {
    localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
  }, fixture.replay);
  await page.click("#watch-last");
  await page.keyboard.press("KeyP");
  assert.equal(await page.locator("body").getAttribute("data-screen"), "replay");
  assert.equal(await page.locator('[data-replay="toggle"] .replay-toggle-text').textContent(), "재생");
  const position = () => page.locator("#replay-progress").evaluate(input => Number(input.value));
  const board = () => page.locator("#board").evaluate(c => c.toDataURL());
  assert.ok((await page.locator(".replay-mark").count()) > 0, "분석 표시가 있다");
  assert.match(await text(page, "replay-summary"), /피네스 실수 \d+/);

  // 막대를 끝 근처로 → 그 시점, 멈춤
  await page.locator("#replay-progress").fill("300");
  assert.equal(await position(), 300);
  assert.equal(await page.locator('[data-replay="toggle"] .replay-toggle-text').textContent(), "재생");
  await page.waitForTimeout(50);
  const at300 = await board();
  // 앞으로 갔다가 다시 300으로 되감으면 같은 판
  await page.click('[data-replay="ahead"]');
  assert.ok((await position()) > 300);
  await page.locator("#replay-progress").fill("300");
  await page.waitForTimeout(50);
  assert.equal(await board(), at300, "되감아도 같은 판");

  // 다음 표시 → 위치가 바뀌고 멈춘다
  await page.locator("#replay-progress").fill("0");
  await page.click('[data-replay="next-mark"]');
  const first = await position();
  await page.click('[data-replay="next-mark"]');
  assert.ok((await position()) >= first);
  await page.click('[data-replay="prev-mark"]');
  assert.equal(await position(), first);
  const progress = page.locator("#replay-progress");
  const toggleLabel = page.locator('[data-replay="toggle"] .replay-toggle-text');
  const next = page.locator('[data-replay="next-mark"]');
  for (const mark of [page.locator(".replay-mark").first(), next]) {
    await progress.fill("0");
    await mark.click();
    assert.equal(await toggleLabel.textContent(), "재생");
    assert.ok(await progress.evaluate(el => el === document.activeElement));
    const selected = await position();
    await page.keyboard.press("Space");
    await page.waitForFunction(frame => Number(document.getElementById("replay-progress").value) > frame, selected);
    await page.keyboard.press("Space");
    assert.equal(await toggleLabel.textContent(), "재생");
  }

  await progress.fill("0");
  await next.focus();
  await next.evaluate(el => el.addEventListener("click", () => (el.dataset.activated = "true"), { once: true }));
  await page.keyboard.press("Space");
  assert.equal(await next.getAttribute("data-activated"), "true");
  assert.equal(await toggleLabel.textContent(), "재생");
  assert.ok(await next.evaluate(el => el === document.activeElement));
  assert.deepEqual(errors, []);
  await context.close();
});

test("피네스 훈련: 같은 문제를 더 적은 입력으로 다시 풀고 다음 목표로 이동한다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem(
      "tetrisharp:settings",
      JSON.stringify({
        access: { countdown: "off" },
        keymap: { LEFT: ["KeyF"], RIGHT: ["KeyJ"], HARD: ["Space"] },
      })
    );
  });
  try {
    await page.click("#open-practice");
    await page.click('[data-drill="finesse-lesson"]');
    await page.click('[data-practice-stage="finesse-lesson-1"]');
    const play = () => page.waitForFunction(() => document.body.dataset.screen === "play");
    const drop = async () => {
      await page.keyboard.press("Space");
      await page.waitForFunction(() => document.body.dataset.screen === "results");
    };
    const tap = async key => {
      await page.keyboard.press(key);
      await page.waitForTimeout(35);
    };
    await play();
    await page.waitForTimeout(50);
    assert.match(await text(page, "session-title"), /1 \/ 10/);
    await drop();
    await page.click('[data-action="next-puzzle"]');
    await play();
    await page.waitForTimeout(50);
    await drop();
    assert.equal(await text(page, "results-title"), "목표와 다른 칸에 놓았어요");
    assert.equal(await page.locator('[data-action="next-puzzle"]').isVisible(), false);
    assert.match(await text(page, "results-stats"), /F, Space/);
    await page.click('#results [data-action="retry"]');
    await play();
    await page.waitForTimeout(50);
    for (const key of ["KeyF", "KeyJ", "KeyF"]) await tap(key);
    await drop();
    assert.match(await text(page, "results-stats"), /내 입력 3회 · 최소 1회/);
    await page.click('#results [data-action="retry"]');
    await play();
    await page.waitForTimeout(50);
    assert.match(await text(page, "session-title"), /2 \/ 10/);
    await tap("KeyF");
    await drop();
    assert.match(await text(page, "results-stats"), /내 입력 1회 · 최소 1회/);
    assert.equal(await page.locator('[data-action="next-puzzle"]').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("리플레이 시간의 분 자릿수가 늘어도 타임라인 너비는 같다", async () => {
  const { replay } = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  replay.mode = "practice-free";
  replay.inputs = [];
  replay.result.frames = 36_060;

  const { context, page } = await openPage(value => {
    localStorage.setItem("tetrisharp:replay:last", JSON.stringify(value));
  }, replay);
  try {
    await page.click("#watch-last");
    const progress = page.locator("#replay-progress");
    await progress.fill("35999");
    assert.equal(await text(page, "replay-time"), "9:59.98 / 10:01.00");
    const before = await progress.boundingBox();
    await progress.fill("36000");
    assert.equal(await text(page, "replay-time"), "10:00.00 / 10:01.00");
    assert.equal((await progress.boundingBox()).width, before.width);
  } finally {
    await context.close();
  }
});

test("리플레이 탐색: 피네스가 많은 판에서도 오래 고민과 주요 장면을 눌러 이동한다", async () => {
  const replay = botDailyReplay("2026-11-20", 39);
  const { context, page, errors } = await openPage(replay => {
    localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
  }, replay);
  try {
    await page.setViewportSize({ width: 560, height: 500 });
    await page.click("#watch-last");
    const finesse = page.locator(".replay-mark.is-finesse");
    const slow = page.locator(".replay-mark.is-slow");
    const highlight = page.locator(".replay-mark.is-highlight");
    await slow.waitFor();
    await highlight.waitFor();
    const grouped = page.locator(".replay-mark.is-finesse.is-group");
    assert.ok(await grouped.count());
    assert.ok((await finesse.count()) > 0);
    const y = locator => locator.first().evaluate(el => el.getBoundingClientRect().top);
    assert.ok((await y(finesse)) < (await y(slow)) && (await y(slow)) < (await y(highlight)));
    await slow.click();
    const progress = page.locator("#replay-progress");
    assert.equal(await progress.inputValue(), "7");
    await highlight.click();
    assert.equal(await progress.inputValue(), "2531");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("내 Sprint 장면을 작은 창과 가로 터치에서 연습하고 리플레이 위치로 돌아간다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  for (const [locale, width, height, touch] of [
    ["ko-KR", 960, 360, false],
    ["en-US", 560, 500, false],
    ["en-US", 390, 844, true],
    ["en-US", 320, 720, true],
    ["ko-KR", 740, 360, true],
  ]) {
    const context = await browser.newContext({ locale, viewport: { width, height }, hasTouch: touch });
    await context.addInitScript(({ replay, record }) => {
      localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
    }, fixture);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    const storage = () =>
      page.evaluate(() => [localStorage.getItem("tetrisharp:replay:last"), localStorage.getItem("tetrisharp:records")]);
    const original = await storage();
    await page.locator("#watch-last").click();
    const progress = page.locator("#replay-progress");
    const practice = page.locator('[data-replay="practice"]');
    await progress.fill("133");
    const withinWindow = () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight + 1;
      });
    assert.ok(await withinWindow(), `리플레이가 창에 들어간다 · ${width}×${height}`);
    const entry = await practice.boundingBox();
    assert.ok(entry.x >= 0 && entry.x + entry.width <= width && entry.y >= 0 && entry.y + entry.height <= height);
    await practice.click();
    assert.ok(await withinWindow(), `장면 연습이 창에 들어간다 · ${width}×${height}`);
    const controls = page.locator("#scene-practice-controls");
    assert.equal(await controls.isVisible(), true);
    const retry = controls.locator('[data-action="scene-retry"]');
    const exit = controls.locator('[data-action="scene-exit"]');
    for (const button of [retry, exit]) {
      const box = await button.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 0 && box.y + box.height <= height);
      assert.ok(await button.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    const disjoint = await controls.evaluate(el => {
      const note = el.querySelector("p").getBoundingClientRect();
      const actions = el.querySelector(".scene-practice-actions").getBoundingClientRect();
      return actions.top - note.bottom >= 8;
    });
    assert.ok(disjoint, "상태 안내와 버튼 사이에 여백이 있다");
    await page.keyboard.press("Space");
    await retry.click();
    await page.keyboard.press("Space");
    if (width === 960) {
      for (let i = 0; i < 30 && !(await page.locator("#pause").isVisible()); i++) {
        await page.keyboard.press("Space");
        await page.waitForTimeout(20);
      }
      assert.equal(await page.locator("#pause").isVisible(), true);
      assert.equal(await page.locator("#results").isVisible(), false);
      await page.locator('#pause [data-action="retry"]').click();
      assert.equal(await page.locator("#pause").isVisible(), false);
    }
    if (touch) await exit.click();
    else await page.keyboard.press("Escape");
    assert.equal(await progress.inputValue(), "133");
    assert.equal(await practice.evaluate(el => document.activeElement === el), true);
    assert.deepEqual(await storage(), original);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("Sprint 구간 연습은 같은 시점부터 비교하고 재시도 후 리플레이로 돌아간다", async () => {
  const { replay, record } = JSON.parse(
    fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8")
  );
  // 10–20줄이 이전 기록보다 가장 느린 구간이 되도록 이전 기록을 준비한다.
  const pb = {
    ...record,
    frames: record.frames - 30,
    splits: record.splits.map((frame, i) => (i ? frame - 30 : frame)),
  };
  const { context, page, errors } = await openPage(
    ({ seed, pb }) => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [pb] }));
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    },
    { seed: replay.seed, pb },
    { frameClock: true }
  );
  try {
    const {
      splits: [start, end],
    } = record;
    const playFrames = (from, to, delay, topOut) => playReplayFrames(page, replay.inputs, from, to, delay, topOut);
    await page.locator('[data-mode="sprint40"]').click({ timeout: 3000 });
    await playFrames(0, replay.result.frames);
    assert.equal(await visible(page, "results"), true);
    const storage = () =>
      page.evaluate(() => [localStorage.getItem("tetrisharp:replay:last"), localStorage.getItem("tetrisharp:records")]);
    const original = await storage();

    const entry = page.locator("#results-practice-scene");
    assert.match(await entry.textContent(), /추천 연습.*10–20줄/);
    assert.equal(await page.locator("#results-splits").getAttribute("open"), null);
    await entry.click();
    assert.equal(await visible(page, "scene-split-meter"), true);
    const result = page.locator("#scene-result");
    const retry = result.locator('[data-action="scene-retry"]');
    const exit = result.locator('[data-action="scene-exit"]');
    const comparison = () => page.locator("#scene-result-delta").getAttribute("data-comparison");
    assert.deepEqual(JSON.parse(original[0]).inputs, replay.inputs);
    await playFrames(start, end, 18);
    assert.equal(await comparison(), "slower", await text(page, "scene-result-delta"));
    assert.equal(await text(page, "scene-result-original"), "0:02.02");
    assert.equal(await text(page, "scene-result-attempt"), "0:02.32");
    await page.setViewportSize({ width: 560, height: 320 });
    for (const button of [retry, exit]) {
      const box = await button.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 560 && box.y >= 0 && box.y + box.height <= 320);
    }
    await retry.click();
    await playFrames(start, end);
    assert.equal(await comparison(), "even");
    const best = await text(page, "scene-result-best");
    assert.match(best, /0:02\.02/);
    await retry.click();
    await playFrames(start, start + 500, 0, true);
    assert.equal(await comparison(), "incomplete");
    assert.equal(await text(page, "scene-result-best"), best);
    await exit.click();
    assert.equal(await page.locator("#replay-progress").inputValue(), String(start));
    await page.locator('[data-replay="exit"]').click();
    assert.equal(await entry.evaluate(el => document.activeElement === el), true);
    assert.deepEqual(await storage(), original);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("Sprint 첫 결과에서 피네스 장면을 추천하고 같은 배치의 입력 횟수를 비교한다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const input = inputs =>
    page.evaluate(keys => {
      for (const code of keys) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code, cancelable: true }));
        window.advanceFrame();
      }
    }, inputs);
  try {
    await startMode(page, "sprint40");
    await input(["ArrowLeft", "ArrowRight", ...Array(50).fill("Space")]);
    const entry = page.locator("#results-practice-scene");
    assert.match(await entry.textContent(), /추천 연습.*피네스/);
    await entry.click();
    assert.equal(await page.locator("body").getAttribute("data-scene-practice"), "finesse");
    const result = page.locator("#scene-result");
    await input(["ArrowLeft", "Space"]);
    assert.equal(await text(page, "scene-result-title"), "목표와 다른 칸에 놓았어요");
    await result.locator('[data-action="scene-retry"]').click();
    await input(["Space"]);
    assert.equal(await text(page, "scene-result-original"), "2회 입력");
    assert.equal(await text(page, "scene-result-attempt"), "0회 입력");
    assert.match(await text(page, "scene-result-delta"), /2회 적게/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("리플레이 버튼의 글자와 아이콘은 아래 턱을 뺀 버튼 면의 중앙에 놓인다", async () => {
  const { replay } = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  for (const locale of ["ko-KR", "en-US"]) {
    const { context, page } = await openPage(
      value => localStorage.setItem("tetrisharp:replay:last", JSON.stringify(value)),
      replay,
      { locale, frameClock: true }
    );
    try {
      await page.locator("#watch-last").click();
      const toggle = page.locator('[data-replay="toggle"]');
      const checkCenters = async () => {
        const buttons = await page.locator("#replay-bar button.btn:visible").evaluateAll(elements => {
          const centerY = element => {
            const { top, bottom } = element.getBoundingClientRect();
            return (top + bottom) / 2;
          };
          return elements.map(button => {
            const inset = getComputedStyle(button).boxShadow.match(/[-\d.]+px\s+([-\d.]+)px[^,]*inset/);
            const faceCenter = centerY(button) + Number(inset?.[1] ?? 0) / 2;
            return {
              action: button.dataset.replay,
              offsets: [...button.children].map(content => centerY(content) - faceCenter),
              fits: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1,
              multiline: button.closest(".replay-transport")
                ? [...button.children].some(
                    content =>
                      content.getBoundingClientRect().height > parseFloat(getComputedStyle(content).lineHeight) + 0.5
                  )
                : false,
            };
          });
        });
        for (const action of ["toggle", "back", "ahead", "speed", "step-back", "step", "restart", "share", "exit"]) {
          assert.ok(
            buttons.some(button => button.action === action),
            action
          );
        }
        for (const { action, offsets, fits, multiline } of buttons) {
          assert.ok(offsets.length && offsets.every(offset => Math.abs(offset) <= 0.5), `${action}: ${offsets}`);
          assert.ok(fits, action);
          assert.equal(multiline, false, action);
        }
      };
      for (const [width, height] of [
        [1280, 800],
        [960, 360],
        [480, 560],
        [440, 520],
        [320, 480],
      ]) {
        await page.setViewportSize({ width, height });
        await checkCenters();
        await toggle.scrollIntoViewIfNeeded();
        const { x, y, width: buttonWidth, height: buttonHeight } = await toggle.boundingBox();
        await page.mouse.move(x + buttonWidth / 2, y + buttonHeight / 2);
        await page.mouse.down();
        assert.equal(await toggle.evaluate(el => el.matches(":active")), true);
        await checkCenters();
        await page.mouse.up();
        await checkCenters();
      }
    } finally {
      await context.close();
    }
  }
});

test("데스크톱 창 크기를 바꿔도 리플레이 조작과 플레이 배치를 유지한다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(
    replay => localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay)),
    fixture.replay,
    { locale: "en-US" }
  );
  const watch = page.locator("#watch-last");
  await watch.focus();
  await page.keyboard.press("Enter");
  const toggle = page.locator('[data-replay="toggle"]');
  assert.equal(await toggle.evaluate(el => document.activeElement === el), true);
  await page.keyboard.press("Space");
  const progress = page.locator("#replay-progress");
  await progress.fill("133");
  const close = page.locator('[data-replay="exit"]');
  for (const [width, height] of [
    [800, 520],
    [960, 521],
    [960, 520],
    [960, 360],
    [560, 500],
    [960, 521],
  ]) {
    await page.setViewportSize({ width, height });
    const box = await close.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `닫기 버튼 가로 범위 · ${width}×${height}`);
    assert.ok(box.y >= 0 && box.y + box.height <= height, `닫기 버튼 세로 범위 · ${width}×${height}`);
    assert.equal(await progress.inputValue(), "133");
  }
  const marks = page.locator(".replay-mark");
  assert.ok(await marks.count());
  assert.ok(await marks.evaluateAll(elements => elements.every(el => el.tabIndex === -1)));
  await page.keyboard.press("Escape");
  assert.equal(await watch.evaluate(el => document.activeElement === el), true);

  await startMode(page, "sprint40");
  const board = page.locator("#board");
  const first = await board.boundingBox();
  await page.setViewportSize({ width: 960, height: 520 });
  const shorter = await board.boundingBox();
  assert.ok(Math.abs(shorter.x - first.x) < 3 && Math.abs(shorter.height - first.height) < 3);
  await page.setViewportSize({ width: 960, height: 521 });
  assert.deepEqual(await board.boundingBox(), first);
  await page.setViewportSize({ width: 560, height: 500 });
  await page.keyboard.press("Escape");
  const resume = page.locator('#pause [data-action="resume"]');
  await resume.click();
  assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
  assert.deepEqual(errors, []);
  await context.close();
});

test("결과 카드는 보드 안에 스크롤 없이 들어간다(데스크톱 낮은 화면·휴대폰)", async () => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ locale: "ko-KR", viewport });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    await startMode(page, "sprint40");
    for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
    await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
    const { scroll, client } = await page.evaluate(() => {
      const el = document.getElementById("results");
      return { scroll: el.scrollHeight, client: el.clientHeight };
    });
    assert.ok(scroll <= client, `${viewport.width}×${viewport.height}: 결과 카드 ${scroll}px > 보드 ${client}px`);
    await context.close();
  }
});

test("게임 중 화면: 기본은 늘 어둡고, '화면 색 따르기'를 고르면 라이트에서 게임 중에도 밝다", async () => {
  const context = await browser.newContext({
    locale: "ko-KR",
    colorScheme: "light",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  const lum = async sel => {
    await page.waitForTimeout(300);
    return page.evaluate(s => {
      const [r, g, b] = getComputedStyle(document.querySelector(s)).backgroundColor.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }, sel);
  };
  await startMode(page, "endless");
  assert.ok((await lum("body")) < 40, "기본: 게임 중에는 어둡다");
  assert.ok((await lum(".board-wrap")) < 40);
  await page.keyboard.press("Escape");
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="visual"]');
  await page.click('#set-game-surface [data-value="scheme"]');
  await page.click("#settings-close");
  assert.ok((await lum("body")) > 200, "화면 색 따르기: 게임 중에도 밝다");
  assert.ok((await lum(".board-wrap")) > 200, "보드 둘레도 밝다");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await page.click("#continue-run");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.ok((await lum("body")) > 200, "이어 할 때도 저장한 화면 색 유지");
  await context.close();
});

// UI 검수(tests/helpers/ui-audit.mjs): 모든 화면·대화상자·탭을 돌며 슬라이더를 끝값으로, 선택지·드롭다운을 바꿔 가며
// 가로 넘침·잘림·밖으로 나감·글자 겹침이 없는지 본다. 크기와 언어를 바꿔 세 번.
for (const [locale, width, height] of [
  ["ko-KR", 1280, 800],
  ["en-US", 390, 844],
  ["ko-KR", 768, 1024],
  ["ko-KR", 740, 360],
]) {
  test(`UI 검수: 넘침·잘림·겹침 없음 (${locale} ${width}×${height})`, { timeout: 240000 }, async () => {
    // 휴대폰 크기(세로·가로)는 터치 화면으로 연다
    const context = await browser.newContext({
      locale,
      viewport: { width, height },
      hasTouch: width < 800 || height < 520,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const problems = await runScenarios(page, { quick: true });
    assert.deepEqual(problems, []);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test("대화상자: 끝까지 내려도 마지막 줄·버튼이 아래 구분선에 붙지 않는다", async () => {
  const { context, page, errors } = await openPage();
  for (const opener of ["#open-help", "#open-practice", "#open-puzzles", "#open-records", "#open-settings"]) {
    await page.click(opener);
    const gap = await page.evaluate(() => {
      const body = [...document.querySelectorAll("dialog")].find(d => d.open).querySelector(".dialog-body");
      body.scrollTop = body.scrollHeight;
      let bottom = 0;
      for (const e of body.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.height) bottom = Math.max(bottom, r.bottom);
      }
      return body.getBoundingClientRect().bottom - bottom;
    });
    assert.ok(gap >= 12, `${opener} 아래 여백 ${gap}px`);
    await page.keyboard.press("Escape");
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test("편의: 처음 안내 줄은 닫으면 다시 뜨지 않고, 도움말은 머리글에서 언제든 연다", async () => {
  const { context, page, errors } = await openPage();
  assert.equal(await visible(page, "welcome"), true, "처음에는 안내 줄");
  await page.click("#welcome-open");
  assert.equal(await page.locator("#help").isVisible(), true);
  assert.match(await page.locator("#help").textContent(), /이렇게 시작해요/);
  await page.click("#help-close");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  assert.equal(await visible(page, "welcome"), false, "한 번 본 뒤에는 뜨지 않는다");
  await page.click("#open-help");
  assert.equal(await page.locator("#help").isVisible(), true);
  await page.click("#help-to-access");
  assert.equal(await page.locator("#settings").isVisible(), true);
  assert.equal(await page.locator('.dialog-tabs [data-value="access"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(errors, []);
  await context.close();
});

test("편의: 조작감 프리셋을 누르면 DAS·ARR·SDF가 한 번에 바뀌고, 슬라이더를 움직이면 '직접 조절'이 된다", async () => {
  const { context, page, errors } = await openPage();
  await page.click("#open-settings");
  assert.equal(await page.locator('#set-handling-preset [data-value="standard"]').getAttribute("aria-pressed"), "true");
  await page.click('#set-handling-preset [data-value="relaxed"]');
  assert.equal(await page.locator("#set-das").inputValue(), "200");
  assert.equal(await page.locator("#set-arr").inputValue(), "50");
  await page.locator("#set-das").fill("150");
  assert.equal(await page.locator('#set-handling-preset [aria-pressed="true"]').count(), 0);
  assert.match(await page.locator('label[for="set-handling-preset"] small').textContent(), /직접 조절/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("편의: 카운트다운 '없음'이면 바로 시작하고, 연습에서는 되돌리기로 방금 놓은 피스를 취소한다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await page.click("#open-practice");
  await page.click('[data-drill="free"]');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), "play", "바로 시작");
  assert.equal(await visible(page, "undo-piece"), true, "연습에서는 되돌리기 버튼");
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "2");
  await page.click("#undo-piece");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1");
  await page.keyboard.press("KeyU");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0");
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]');
  await page.click('[data-mode="endless"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await visible(page, "undo-piece"), false, "연습이 아니면 되돌리기 없음");
  assert.deepEqual(errors, []);
  await context.close();
});

test("편의: 제스처 방식이면 보드 아래 버튼 대신 보드를 튕겨 하드 드롭한다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ touch: "on", touchMode: "gestures" }))
  );
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  await startMode(page, "endless");
  assert.equal(await visible(page, "touchpad"), false, "버튼은 감춘다");
  // 아래로 빠르게 튕기기 → 하드 드롭
  await page.evaluate(() => {
    const wrap = document.querySelector(".board-wrap");
    const r = wrap.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const fire = (type, y, t) =>
      wrap.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          timeStamp: t,
        })
      );
    const y0 = r.top + 100;
    fire("pointerdown", y0);
    for (let i = 1; i <= 4; i++) fire("pointermove", y0 + i * 40);
    fire("pointerup", y0 + 200);
  });
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1", null, { timeout: 2000 });
  await context.close();
});

test("퍼즐: 단계를 풀면 성공·다음 단계로 이어지고, 첫 화면에 진행도가 남는다. 틀리면 실패", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  assert.equal(await text(page, "puzzle-progress"), `0 / ${PUZZLES.length}`);
  await page.click("#open-puzzles");
  assert.equal(await page.locator(".puzzle-tile").count(), PUZZLES.length);
  await page.click('[data-puzzle="1"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.reload();
  await page.click("#continue-run");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (const key of keysFor(solvePuzzle(PUZZLES[0]))) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-title"), "성공!");
  assert.equal(await page.locator('[data-action="next-puzzle"]').isVisible(), true);
  await page.click('[data-action="next-puzzle"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.match(await text(page, "session-title"), /퍼즐 2/);
  // 아무렇게나 떨어뜨리면 실패, 다음 단계 버튼은 없다
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-title"), "실패");
  assert.equal(await page.locator('[data-action="next-puzzle"]').isVisible(), false);
  await page.keyboard.press("Escape");
  assert.equal(await text(page, "puzzle-progress"), `1 / ${PUZZLES.length}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test("만든 퍼즐: 시험 플레이 성공 후에만 공유하고, 휴대폰에서 링크를 열어 풀 수 있다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  const mobile = await browser.newContext({
    locale: "en",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await page.click("#open-puzzles");
    await page.click("#puzzle-create");
    const trial = page.locator("#puzzle-trial");
    const share = page.locator("#puzzle-copy");
    assert.ok(await trial.isDisabled());
    for (const cell of [190, 191, 192, 197, 198, 199]) await page.click(`[data-cell="${cell}"]`);
    await page.click('#puzzles [data-piece="I"]');
    assert.ok(await share.isDisabled());
    await trial.click();
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(50);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.body.dataset.screen === "results");
    assert.equal(await text(page, "results-title"), "실패");
    await page.click('#results [data-action="export"]');
    assert.ok(await share.isDisabled());
    await trial.click();
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.reload();
    await page.click("#continue-run");
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.body.dataset.screen === "results");
    assert.equal(await text(page, "results-title"), "성공!");
    assert.equal(await page.locator('[data-action="next-puzzle"]').isVisible(), false);
    await page.click('#results [data-action="export"]');
    await share.click();
    const link = await page.locator("#custom-puzzle-link").inputValue();
    assert.match(link, /#puzzle=1\./);
    await page.click('[data-cell="190"]');
    await page.click('[data-cell="190"]');
    assert.ok(await share.isDisabled(), "편집 뒤 원상복구해도 다시 시험해야 한다");
    assert.deepEqual(errors, []);

    await mobile.addInitScript(() => {
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    });
    const recipient = await mobile.newPage();
    await recipient.goto(link);
    await recipient.waitForFunction(() => document.body.dataset.screen === "play");
    assert.equal(await text(recipient, "session-title"), "Custom puzzle");
    await recipient.tap('[data-touch="HARD"]');
    await recipient.waitForFunction(() => document.body.dataset.screen === "results");
    assert.equal(await text(recipient, "results-title"), "Solved!");
    assert.ok(await recipient.locator('#results [data-action="export"]').isDisabled());
    await recipient.tap('#results [data-action="retry"]');
    await recipient.waitForFunction(() => document.body.dataset.screen === "play");
    await recipient.tap('[data-touch="HARD"]');
    await recipient.waitForFunction(() => document.body.dataset.screen === "results");
    assert.equal(await text(recipient, "results-title"), "Solved!");
    const invalid = await mobile.newPage();
    await invalid.goto(`${url}#puzzle=invalid`);
    assert.equal(await invalid.locator("body").getAttribute("data-screen"), "menu");
    assert.equal(await text(invalid, "menu-notice"), "Could not read the puzzle link.");
  } finally {
    await mobile.close();
    await context.close();
  }
});

test("리플레이 링크: #replay= 로 열면 바로 재생하고, '이 기록과 달리기'로 같은 블록 순서로 달린다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const code = await encodeReplayCode(fixture.replay, "친구");
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${url}#replay=${code}`);
  await page.waitForFunction(() => document.body.dataset.screen === "replay", null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => location.hash), "", "주소의 해시는 지운다");
  assert.match(await text(page, "replay-note"), /친구의 리플레이/);
  await page.locator("#replay-progress").fill("133");
  assert.equal(await page.locator('[data-replay="practice"]').isVisible(), false);
  assert.equal(await page.locator('[data-replay="race"]').isVisible(), true);
  await page.click('[data-replay="race"]');
  await page.waitForFunction(
    () => document.body.dataset.screen === "countdown" || document.body.dataset.screen === "play"
  );
  assert.equal(await visible(page, "race-panel"), true);
  assert.equal(await text(page, "race-label"), "친구의 기록");
  assert.deepEqual(errors, []);
  await context.close();
});

// 실제 휴대폰 흉내(isMobile → pointer: coarse). hasTouch만 켠 창에서는 드러나지 않던 잘림을 잡는다.
test("휴대폰: 일시정지·결과 카드가 잘리지 않고, 리플레이 보드는 알아볼 수 있는 크기다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  for (const [width, height] of [
    [320, 568],
    [390, 664],
    [750, 342],
  ]) {
    const where = `${width}×${height}`;
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    await context.addInitScript(({ replay, record }) => {
      localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
      localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
    }, fixture);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);

    /** 버튼이 화면 안에 다 보이고, 가운데를 누르면 그 버튼이 눌리는가 */
    const reachable = selector =>
      page.$$eval(selector, els =>
        els
          .filter(el => el.checkVisibility())
          .map(el => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            const inside = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
            return inside && !!hit && el.contains(hit) ? "" : el.textContent.trim();
          })
          .filter(Boolean)
      );
    /** 글자가 한 줄을 넘게 꺾인 버튼 라벨 */
    const wrappedLabels = selector =>
      page.$$eval(selector, els =>
        els
          .filter(el => el.checkVisibility())
          .filter(el => el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 1.5)
          .map(el => el.textContent.trim())
      );

    await page.tap('[data-mode="sprint40"]');
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.tap('[data-touch="PAUSE"]');
    await page.waitForFunction(() => document.body.dataset.screen === "paused");
    assert.deepEqual(await reachable("#pause .btn"), [], `일시정지 버튼이 다 보인다 · ${where}`);

    await page.tap('#pause [data-action="menu"]');
    assert.deepEqual(await reachable("#confirm .btn"), [], `확인 버튼이 다 보인다 · ${where}`);
    await page.tap('[data-confirm="cancel"]');
    await page.tap('#pause [data-action="resume"]');
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    for (let i = 0; i < 40 && (await page.evaluate(() => document.body.dataset.screen)) !== "results"; i++)
      await page.tap('[data-touch="HARD"]').catch(() => {});
    await page.waitForFunction(() => document.body.dataset.screen === "results");
    assert.deepEqual(await reachable("#results .actions .btn"), [], `결과 버튼이 다 보인다 · ${where}`);
    assert.deepEqual(
      await wrappedLabels("#results .actions .btn-label"),
      [],
      `결과 버튼 글자가 꺾이지 않는다 · ${where}`
    );
    assert.equal(await page.locator("#results-stats").isVisible(), true, `결과 통계가 보인다 · ${where}`);

    await page.goto(url);
    await page.tap("#watch-last");
    await page.waitForFunction(() => document.body.dataset.screen === "replay");
    await page.waitForTimeout(100);
    const board = await page.locator("#board").boundingBox();
    assert.ok(board.width >= 110 && board.height >= 150, `리플레이 보드 ${board.width}×${board.height} · ${where}`);
    await page.locator('[data-replay="share"]').scrollIntoViewIfNeeded();
    assert.deepEqual(await reachable(".replay-bar .btn"), [], `리플레이 조작이 스크롤로 다 닿는다 · ${where}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("리플레이: 끝까지 보면 재생 단추가 '다시 재생'이 되고, 누르면 처음부터 재생한다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(({ replay }) => {
    localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
  }, fixture);
  const toggle = page.locator('[data-replay="toggle"]');
  const label = toggle.locator(".replay-toggle-text");
  const progress = page.locator("#replay-progress");
  await page.click("#watch-last");
  await page.waitForFunction(() => document.body.dataset.screen === "replay");
  await progress.fill(await progress.getAttribute("max"));
  await page.waitForFunction(() => document.querySelector(".replay-toggle-text")?.textContent === "다시 재생");
  assert.equal(await toggle.isEnabled(), true);
  await toggle.click();
  assert.ok(Number(await progress.inputValue()) < 60, "처음부터 다시 재생한다");
  assert.equal(await label.textContent(), "일시정지");
  assert.deepEqual(errors, []);
  await context.close();
});

test("처음 안내 줄에서 소리를 켜고 끌 수 있고, 설정의 효과음 크기와 같은 값이다", async () => {
  const { context, page, errors } = await openPage();
  const sound = page.locator("#welcome-sound");
  const volume = () => page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:settings") ?? "{}").volume ?? 0);
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await volume(), 0, "공용 PC를 생각해 기본은 꺼져 있다");
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "true");
  assert.equal(await sound.textContent(), "소리 끄기");
  assert.ok((await volume()) > 0);
  await sound.click();
  assert.equal(await volume(), 0);
  assert.equal(await sound.textContent(), "소리 켜기");
  assert.deepEqual(errors, []);
  await context.close();
});

test("오늘의 도전: 날마다 바뀌는 모드가 첫 화면·대화상자·게임에 그대로 나온다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(2026, 11, 2, 12));
  await page.goto(url);
  assert.match(await page.locator('[data-mode="daily"]').textContent(), /2026-12-02 · Ultra · 모두 같은 블록 순서/);
  await page.click('[data-mode="daily"]');
  assert.equal(await text(page, "daily-mode"), "Ultra · Modern · 모두 같은 블록 순서");
  await choose(page, "daily-date", "2026-11-30");
  assert.equal(await text(page, "daily-mode"), "Sprint 40L · Modern · 모두 같은 블록 순서", "시작일 전은 Sprint");
  await choose(page, "daily-date", "2026-12-02");
  await page.click("#daily-start");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  // 정보 칸은 시작할 때 모드로 정해진다: Ultra는 점수 칸이 있고 Sprint의 "최고 기록 대비" 칸은 없다
  const shown = cell => page.locator(`.hud [data-hud="${cell}"]`).evaluate(el => !el.classList.contains("is-off"));
  assert.equal(await shown("score"), true, "Ultra 정보 칸");
  assert.equal(await shown("split"), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("첫 화면 정리: 백업·리플레이 파일은 설정의 데이터 탭, 내 기록과 달리기는 기록 대화상자에서", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const { context, page, errors } = await openPage(({ replay, record }) => {
    localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
    localStorage.setItem("tetrisharp:replay:best", JSON.stringify({ "sprint40|modern": [replay] }));
  }, fixture);
  // 첫 화면 오른쪽은 두 블록: 연습과 기록 · 다시 보기
  assert.equal(await page.locator(".home-side .home-block").count(), 2);
  for (const gone of ["#export-backup", "#import-backup", "#open-replay", "#race-modes"])
    assert.equal(await page.locator(`#menu ${gone}`).count(), 0, `${gone}는 첫 화면에 없다`);

  // 데이터 탭: 첫 화면에서 열면 불러오기도 된다
  await page.click("#open-settings");
  await page.click('#settings .dialog-tabs [data-value="data"]');
  assert.equal(await page.locator("#import-backup").isEnabled(), true);
  assert.equal(await page.locator("#open-replay").isEnabled(), true);
  await page.keyboard.press("Escape");

  // 기록 대화상자에서 최고 기록과 달리기
  await page.click("#open-records");
  await page.click("#records-race");
  await page.waitForFunction(() => ["countdown", "play"].includes(document.body.dataset.screen));
  assert.equal(await visible(page, "race-panel"), true);

  // 게임 중에 연 설정에서는 불러오기를 끈다(판을 덮어쓰지 않게)
  await page.click("#open-settings");
  await page.click('#settings .dialog-tabs [data-value="data"]');
  assert.equal(await page.locator("#import-backup").isDisabled(), true);
  assert.equal(await page.locator("#export-backup").isEnabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("업적: 이룬 판의 결과 화면에 알리고, 첫 화면 개수와 업적 대화상자에 남는다", async () => {
  // 판 비우기 장에서 1단계만 남겨 두고 1단계를 푼다
  const others = PUZZLES.filter(p => p.kind === "pc" && p.number !== 1).map(p => p.id);
  const { context, page, errors } = await openPage(rest => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    localStorage.setItem("tetrisharp:puzzle:cleared", JSON.stringify(rest));
  }, others);
  assert.match(await text(page, "achievement-progress"), /^0 \/ \d+$/);
  await page.click("#open-puzzles");
  await page.click('[data-puzzle="1"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (const key of keysFor(solvePuzzle(PUZZLES[0]))) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-achievements"), "업적 달성 · 판 비우기 장");
  await page.keyboard.press("Escape");
  assert.match(await text(page, "achievement-progress"), /^1 \/ \d+$/);
  await page.click("#open-achievements");
  assert.equal(await page.locator('#achievements [data-achievement="puzzle-pc"].is-done').count(), 1);
  assert.equal(await page.locator('#achievements [data-achievement="puzzle-all"].is-done').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("CPU 성향: 대전 목록 위에서 고르고 기억하며, 전적은 성향마다 따로 보인다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    localStorage.setItem("tetrisharp:versus:stats", JSON.stringify({ easy: { win: 2, loss: 1 } }));
  });
  await page.click('[data-mode="versus"]');
  const easyRow = page.locator('#versus [data-level="easy"]');
  assert.match(await easyRow.textContent(), /2승 1패/, "균형 전적은 예전 전적 그대로");
  await page.click('#versus-style [data-value="quad"]');
  assert.equal(await page.locator('#versus-style [data-value="quad"]').getAttribute("aria-pressed"), "true");
  assert.doesNotMatch(await easyRow.textContent(), /승/, "4줄 노림 전적은 따로");
  await easyRow.click();
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(page, "session-title"), "CPU · 쉬움 · 4줄 노림");
  await page.click("#go-home");
  await page.click('[data-confirm="ok"]');
  await page.click('[data-mode="versus"]');
  assert.equal(
    await page.locator('#versus-style [data-value="quad"]').getAttribute("aria-pressed"),
    "true",
    "마지막 성향을 기억한다"
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test("피스 몇 개 만에 막힌 판: PPS는 —, 공유는 끄고 이유를 보이며, 마지막 판도 덮어쓰지 않는다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await startMode(page, "endless");
  // 세워서 한가운데에만 떨어뜨리면 금방 막힌다
  for (let i = 0; i < 20 && !(await visible(page, "results")); i++) {
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  const pieces = Number(await text(page, "hud-pieces"));
  assert.ok(pieces < 10, `세워서 떨어뜨리기만 하면 ${pieces}개 만에 막힌다`);
  assert.match(await text(page, "results-stats"), /PPS—/);
  assert.equal(await page.locator('#results [data-action="export"]').isDisabled(), true);
  assert.match(await text(page, "race-result"), /너무 일찍 끝난 판/);
  assert.equal(await page.locator('#results [data-action="retry"]').isDisabled(), false, "다시 하기는 그대로");
  assert.equal(await page.evaluate(() => localStorage.getItem("tetrisharp:replay:last")), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test("휴대폰 가로: 설정 대화상자는 탭을 왼쪽 세로로 두고 내용 칸이 높이 대부분을 쓴다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 750, height: 342 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    await page.click("#open-settings");
    const box = await page.evaluate(() => {
      const d = document.querySelector("#settings");
      const r = s => d.querySelector(s).getBoundingClientRect();
      const tabs = [...d.querySelectorAll(".dialog-tabs .segmented > button")].map(b => b.getBoundingClientRect());
      return {
        tabs: r(".dialog-tabs"),
        body: r(".dialog-body"),
        dialog: d.getBoundingClientRect(),
        lastTab: tabs.at(-1),
      };
    });
    assert.ok(box.tabs.right <= box.body.left + 1, "탭은 내용 왼쪽");
    assert.ok(box.lastTab.bottom <= box.dialog.bottom, "마지막 탭까지 보인다");
    assert.ok(box.body.height >= 200, `내용 칸 높이 ${box.body.height}px`);
    await page.locator(".dialog-tabs .segmented > button").first().focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator(".dialog-tabs .segmented > button").nth(1).getAttribute("aria-pressed"), "true");
  } finally {
    await context.close();
  }
});

test("휴대폰 CPU 대전: 공격 알림 자리를 따로 비워 두지 않아 보드가 Sprint와 비슷한 크기다", async () => {
  const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 390, height: 664 }, hasTouch: true });
  await context.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const boardHeight = () => page.evaluate(() => document.getElementById("board").getBoundingClientRect().height);
    await startMode(page, "sprint40");
    const sprint = await boardHeight();
    await page.keyboard.press("Escape");
    await page.click('#pause [data-action="menu"]');
    await page.click('[data-confirm="ok"]').catch(() => {});
    await page.click('[data-mode="versus"]');
    await page.click('[data-level="easy"]');
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    const versus = await boardHeight();
    assert.ok(versus >= sprint * 0.85, `CPU 대전 보드 ${versus}px · Sprint ${sprint}px`);
    // 알림은 CPU 상황 줄 위에 겹쳐 뜬다(보드를 가리지 않는다)
    const overlap = await page.evaluate(() => {
      const f = document.getElementById("versus-feedback").getBoundingClientRect();
      const b = document.getElementById("board").getBoundingClientRect();
      return f.bottom - b.top;
    });
    assert.ok(overlap <= 0, `알림이 보드를 ${overlap}px 가린다`);
  } finally {
    await context.close();
  }
});
