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
import { DEFAULT_RULES, encodePuzzle, PUZZLE_CELLS } from "../../js/modes/custom-puzzle.js";
import { botDailyReplay } from "../helpers/daily.mjs";
import { dateKey } from "../../js/modes/daily.js";
import { verifyReplay } from "../../js/replay/replay.js";
import { findMode } from "../../js/modes/index.js";
import { decodeRules } from "../../js/rules/share.js";
import { ALL_SPINS, spinBit, spinMask, spinSettings, T_SPIN } from "../../js/rules/spins.js";
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

const openPage = async (
  initScript = null,
  initArg = undefined,
  { locale = "ko-KR", frameClock = false, viewport = { width: 1280, height: 900 }, hasTouch = false } = {}
) => {
  const context = await browser.newContext({ locale, viewport, hasTouch, acceptDownloads: true });
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
/**
 * 첫 화면에서 퍼즐·연습 목록을 연다. 퍼즐·연습을 마치고 나오면 그 목록이 이미 열려 있으므로(목록으로 돌아가기)
 * 열려 있으면 닫고 첫 화면의 단추로 처음부터 연다.
 */
const openList = async (page, button) => {
  const dialog = button === "#open-practice" ? "#practice" : "#puzzles";
  // 목록은 키·클릭 처리가 끝난 뒤에 열린다(같은 Esc가 닫지 않게) → 한 박자 기다린 뒤 본다
  await page.waitForTimeout(30);
  if (await page.locator(`${dialog}[open]`).count()) {
    await page.locator(`${dialog}[open]`).evaluate(d => /** @type {HTMLDialogElement} */ (d).close());
  }
  await page.click(button);
};

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
    await openList(page, "#open-practice");
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

    await openList(page, "#open-practice");
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
    // 저장된 판이 있으면 앱 안의 확인 대화상자로 묻는다(브라우저 확인창 아님). 닫기 = 취소
    await page.click('[data-mode="endless"]');
    await page.locator("#ask").waitFor({ state: "visible" });
    assert.match(await page.locator("#ask").textContent(), /저장된 판을 지울까요/);
    await page.click("#ask-cancel");
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

test("설정 초기화는 두 번 눌러 확정하고(브라우저 확인창 없음), 폭이 바뀌지 않으며 포커스가 돌아온다", async () => {
  const { context, page, errors } = await openPage();
  let nativeDialog = false;
  page.on("dialog", dialog => {
    nativeDialog = true;
    dialog.dismiss();
  });
  await page.click("#open-settings");
  const das = page.locator("#set-das");
  await das.fill("100");
  const reset = page.locator("#settings-reset");
  const width = async () => (await reset.boundingBox()).width;
  const before = await width();
  await reset.click();
  assert.equal(await das.inputValue(), "100", "한 번 누르면 아직 그대로");
  assert.equal(await reset.getAttribute("data-armed"), "1");
  assert.equal(await width(), before, "확인 이름으로 바뀌어도 폭이 같다");
  // 다른 곳을 누르면(포커스를 잃으면) 처음으로
  await das.focus();
  assert.equal(await reset.getAttribute("data-armed"), null);
  await reset.click();
  await reset.click();
  assert.notEqual(await das.inputValue(), "100");
  assert.equal(await reset.evaluate(el => el === document.activeElement), true);
  assert.equal(nativeDialog, false);
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

test("Custom 옵션: 고정 중력의 적용값이 메뉴에 보이고 180도·DCD·즉시 소프트 드롭을 공유한다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" }, touch: "on" })),
    undefined,
    { viewport: { width: 390, height: 844 }, hasTouch: true }
  );
  try {
    await page.click('[data-rules="custom"]');
    const marathon = page.locator('[data-mode="marathon"]');
    assert.equal(await marathon.getAttribute("aria-description"), "모드별 중력");
    await page.click("#edit-rules");
    await page.locator("#rule-allow180").uncheck();
    await page.click('#rules-editor [data-value="고정·낙하"]');
    await choose(page, "rule-gravityMode", "fixed");
    await choose(page, "rule-gravity", "0");
    await page.click('#rules-editor [data-value="조작"]');
    await page.locator("#rule-fixedHandlingOn").check();
    await page.locator("#rule-fixedHandling-instantSoftDrop").check();
    assert.ok(await page.locator("#rule-fixedHandling-sdf").isDisabled());
    await choose(page, "rule-fixedHandling-dcd", "3");
    await page.click('#rules-editor [data-value="공유"]');
    const exported = decodeRules(await page.locator("#rule-share-code").inputValue());
    assert.equal(exported.allow180, false);
    assert.equal(exported.gravityMode, "fixed");
    assert.equal(exported.gravity, 0);
    assert.equal(exported.fixedHandling.dcd, 3);
    assert.equal(exported.fixedHandling.instantSoftDrop, true);
    await page.click("#rules-close");
    await page.waitForFunction(() => document.getElementById("active-rules")?.textContent.includes("0G"));
    assert.match(await marathon.getAttribute("aria-description"), /0G/);
    await marathon.click();
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    assert.ok(await page.locator('[data-touch="R180"]').isDisabled());
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("올스핀: Custom과 퍼즐 편집에서 미노별로 조정하고 O스핀을 플레이에서 표시한다", async () => {
  const { context, page, errors } = await openPage(
    () => {
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({
          access: { countdown: "off" },
          handling: { sdf: 41 },
          visual: { effects: "full" },
        })
      );
      window.spinArcs = 0;
      const arc = CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (this.canvas.id === "board" && args[5] === true) window.spinArcs++;
        return arc.apply(this, args);
      };
    },
    undefined,
    { frameClock: true, viewport: { width: 320, height: 568 }, hasTouch: true }
  );
  try {
    await page.click('[data-rules="custom"]');
    await page.click("#edit-rules");
    await page.click('#rules-editor [data-value="점수"]');
    assert.equal(await text(page, "rule-spin .select-value"), "T스핀만");
    await choose(page, "rule-spin", "0");
    await page.click("#rule-spin-details summary");
    assert.ok(!(await page.locator("#rule-spin-T").isChecked()));
    await choose(page, "rule-spin", String(ALL_SPINS));
    assert.ok(await page.locator("#rule-spin-O").isChecked());
    await page.locator("#rule-spin-O").uncheck();
    assert.equal(await text(page, "rule-spin .select-value"), "직접 선택 · I, J, L, S, T, Z");
    await page.click('#rules-editor [data-value="공유"]');
    assert.equal(spinMask(decodeRules(await page.locator("#rule-share-code").inputValue())), ALL_SPINS ^ spinBit("O"));
    await page.click("#rules-close");
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await page.click("#puzzle-advanced summary");
    await page.click("#puzzle-spin-details summary");
    await page.locator("#puzzle-spin-L").check();
    assert.equal(await text(page, "puzzle-spin .select-value"), "직접 선택 · L, T");
    assert.ok(await page.locator("#puzzle-spin-T").isChecked());
    assert.equal(Number(await page.getAttribute("#puzzle-spin", "data-value")), T_SPIN | spinBit("L"));

    const cells = new Uint8Array(PUZZLE_CELLS);
    cells.fill(1, cells.length - 10);
    cells[cells.length - 6] = cells[cells.length - 5] = 0;
    cells[cells.length - 25] = 1;
    const code = encodePuzzle({
      cells,
      pieces: "OO",
      goal: { kind: "lines", lines: 2 },
      rules: { ...DEFAULT_RULES, ...spinSettings(spinBit("O")) },
    });
    await page.goto(`${url}#puzzle=${code}`);
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await runKeys(page, [
      ["ArrowLeft", 1],
      ["ArrowDown", 1],
      ["ArrowUp", 1],
      ["Space", 1],
      ["F24", 5],
    ]);
    assert.match(await text(page, "action"), /O-SPIN SINGLE/);
    assert.ok(await page.evaluate(() => window.spinArcs > 0));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("리플레이: 결과 화면에서 보기 → 같은 결과로 끝남, 파일 저장 → 메뉴에서 열기", async () => {
  const { context, page, errors } = await openPage();
  // 버틴 시간이 기록인 Survival: 연타로 금방 막혀도 피스가 10개를 넘으면 공유할 수 있는 판이다(짧은 판 판정 F21)
  await startMode(page, "survival");
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
  assert.match(download.suggestedFilename(), /^tetri-sharp-survival-.*\.json$/);
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

test("줄 삭제 효과 길이: 전체에서만 배율을 바꾸고 0%와 이전 선택을 저장한다", async () => {
  const { context, page, errors } = await openPage();
  const openVisual = async () => {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
  };
  const slider = page.locator("#set-clear-effect-length");
  const effect = name => page.locator(`#set-gameplay-effect-${name}`);
  const select = mode => page.click(`#set-effects [data-value="${mode}"]`);
  try {
    await openVisual();
    await select("full");
    assert.equal(await slider.inputValue(), "100");
    assert.equal(await page.getByRole("slider", { name: "줄 삭제 효과 길이" }).count(), 1);
    for (const name of ["next", "hold", "spin", "perfect", "combo", "danger", "kick", "cancel", "record"])
      assert.equal(await effect(name).isChecked(), true);
    await effect("hold").uncheck();
    await effect("kick").uncheck();
    await slider.press("End");
    assert.equal(await slider.inputValue(), "150");
    await slider.press("ArrowLeft");
    assert.equal(await slider.inputValue(), "145");
    for (const mode of ["reduced", "off"]) {
      await select(mode);
      assert.equal(await slider.isDisabled(), true);
      assert.equal(await effect("hold").isDisabled(), true);
      assert.equal(await effect("kick").isDisabled(), true);
    }
    await select("full");
    assert.equal(await slider.isEnabled(), true);
    assert.equal(await effect("hold").isEnabled(), true);
    assert.equal(await effect("hold").isChecked(), false);
    assert.equal(await effect("kick").isChecked(), false);
    assert.equal(await slider.inputValue(), "145");
    await slider.press("Home");
    assert.equal(await slider.inputValue(), "0");
    assert.equal(await effect("hold").isChecked(), false);
    assert.equal(await effect("kick").isChecked(), false);
    assert.equal(await effect("spin").isChecked(), true);
    await page.reload();
    await openVisual();
    assert.equal(await slider.inputValue(), "0");
    assert.equal(await effect("hold").isChecked(), false);
    await page.click('.dialog-tabs [data-value="access"]');
    assert.equal(await slider.inputValue(), "0");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("게임 테마: 공개 테마 스무 개가 서로 다르게 그려지고, 설정에서 바꾸면 바로 반영된다", async () => {
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
  for (const theme of [
    "retro",
    "minimal",
    "graphite",
    "frame",
    "stone",
    "midnight",
    "forest",
    "white",
    "modern",
    "porcelain",
    "relay",
    "tide",
    "velvet",
    "press",
    "film",
    "post",
    "carbon",
    "chestnut",
    "whiteNight",
    "ink",
  ]) {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    await page.click(`#set-theme [data-value="${theme}"]`);
    await page.click("#settings-close");
    await page.waitForTimeout(100);
    seen.add(await snapshot());
  }
  assert.equal(seen.size, 20, "테마마다 다른 그림");
  assert.deepEqual(errors, []);
  await context.close();
});

test("게임 테마: 미리보기는 움직이고, 칩에 올리면 미리보기만 그 테마로 바뀐다(적용은 누를 때). 모션을 줄이면 멈춘다", async () => {
  const { context, page, errors } = await openPage();
  try {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    const stage = page.locator(".theme-stage-canvas");
    const name = page.locator(".theme-stage-name");
    const state = page.locator(".theme-stage-state");
    const snapshot = () => stage.evaluate(c => /** @type {HTMLCanvasElement} */ (c).toDataURL());
    // 1.2초 동안 150ms마다 찍어 한 번이라도 바뀌면 움직이는 것(장면에 잠깐 멈추는 때가 있다)
    const moves = async () => {
      const a = await snapshot();
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(150);
        if ((await snapshot()) !== a) return true;
      }
      return false;
    };
    assert.equal(await name.textContent(), "스튜디오");
    assert.equal(await state.textContent(), "사용 중");
    assert.ok(await moves(), "미리보기가 장면을 되풀이한다");
    assert.equal(await page.locator("#set-theme canvas.theme-swatch").count(), 20, "칩마다 견본");

    // 올리면 미리보기만 바뀌고 선택은 그대로
    const card = page.locator('#set-theme [data-value="retro"]');
    const layout = () =>
      stage.evaluate(canvas => ({
        stageHeight: canvas.closest(".theme-stage").getBoundingClientRect().height,
        dialogHeight: canvas.closest(".dialog-body").scrollHeight,
      }));
    const size = await layout();
    await card.hover();
    assert.equal(await name.textContent(), "페이퍼");
    assert.equal(await state.textContent(), "미리보기");
    assert.equal(await card.getAttribute("aria-pressed"), "false", "올리기만으로는 적용되지 않는다");
    assert.deepEqual(await layout(), size);
    const a = await card.boundingBox();
    const b = await page.locator('#set-theme [data-value="minimal"]').boundingBox();
    await page.mouse.move((a.x + a.width + b.x) / 2, a.y + a.height / 2);
    assert.equal(await name.textContent(), "페이퍼", "칩 사이 여백에서 직전 미리보기 유지");
    await page.locator("#theme-listen").hover();
    assert.equal(await name.textContent(), "스튜디오", "소리 버튼으로 이동하면 사용 중인 테마로 복귀");
    assert.equal(await state.textContent(), "사용 중");
    const heights = await stage.evaluate(canvas => {
      const panel = canvas.closest(".theme-stage");
      return Array.from(document.querySelectorAll("#set-theme button"), item => {
        item.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
        return panel.getBoundingClientRect().height;
      });
    });
    assert.ok(
      heights.every(height => height === size.stageHeight),
      "모든 설명의 줄바꿈에서 높이 유지"
    );
    // 누르면 적용되고 미리보기도 그 테마(사용 중)
    await card.click();
    assert.equal(await page.locator('#set-theme [data-value="retro"]').getAttribute("aria-pressed"), "true");
    assert.equal(await name.textContent(), "페이퍼");
    assert.equal(await state.textContent(), "사용 중");

    const studio = page.locator('#set-theme [data-value="modern"]');
    await studio.hover();
    assert.equal(await name.textContent(), "스튜디오");
    assert.equal(await state.textContent(), "미리보기");
    await page.locator(".theme-stage-title").hover();
    assert.equal(await name.textContent(), "페이퍼", "미리보기 화면으로 이동하면 적용된 테마로 복귀");

    const listen = page.locator("#theme-listen");
    await listen.focus();
    await page.keyboard.press("Tab");
    assert.equal(await studio.evaluate(el => el === document.activeElement), true);
    assert.equal(await name.textContent(), "스튜디오", "키보드로 칩에 포커스하면 미리보기");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await listen.evaluate(el => el === document.activeElement), true);
    assert.equal(await name.textContent(), "페이퍼", "키보드로 칩 영역을 벗어나면 적용된 테마로 복귀");
    assert.equal(await state.textContent(), "사용 중");

    // 모션 줄이기: 바로 멈추고, 다시 그려도 움직이지 않는다
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    assert.equal(await moves(), false, "모션을 줄이면 멈춘다");
    await page.click('.dialog-tabs [data-value="control"]');
    await page.click('.dialog-tabs [data-value="visual"]');
    assert.equal(await moves(), false, "다시 열어도 멈춰 있다");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("게임 테마: 소리 미리보기는 0%에서 안내하고 선택된 테마를 설정 음량으로 재생한다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ volume: 0, sound: "theme" }));
    window.themeAudio = { contexts: 0, oscillators: [], gain: null };
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor() {
        super();
        window.themeAudio.contexts++;
      }
      createGain() {
        const node = super.createGain();
        window.themeAudio.gain ??= node.gain;
        return node;
      }
      createOscillator() {
        const oscillator = super.createOscillator();
        window.themeAudio.oscillators.push(oscillator);
        return oscillator;
      }
    };
  });
  try {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    const listen = page.locator("#theme-listen");
    const notice = page.locator("#theme-sound-notice");
    await listen.click();
    assert.equal(await notice.textContent(), "소리가 꺼져 있어요.");
    assert.equal(await page.evaluate(() => window.themeAudio.contexts), 0);

    const volume = page.locator("#set-volume");
    await volume.fill("30");
    assert.equal(await notice.textContent(), "");
    const tones = () => page.evaluate(() => window.themeAudio.oscillators.map(oscillator => oscillator.type));
    const volumeTones = (await tones()).length;
    await listen.click();
    const studioTones = (await tones()).slice(volumeTones);
    assert.ok(studioTones.length > 0);
    assert.ok(Math.abs((await page.evaluate(() => window.themeAudio.gain.value)) - 0.3 ** 2) < 1e-6);

    const name = page.locator(".theme-stage-name");
    await page.locator('#set-theme [data-value="retro"]').hover();
    assert.equal(await name.textContent(), "페이퍼");
    // 버튼에 포커스를 둔 채 마우스만 옮긴 뒤 Enter를 누를 수도 있다.
    await page.keyboard.press("Enter");
    assert.equal(await name.textContent(), "스튜디오");
    assert.deepEqual((await tones()).slice(volumeTones + studioTones.length), studioTones);

    await volume.fill("0");
    assert.equal(await page.evaluate(() => window.themeAudio.gain.value), 0);
    const last = await tones();
    await listen.click();
    assert.equal(await notice.textContent(), "소리가 꺼져 있어요.");
    assert.deepEqual(await tones(), last);
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

test("Sprint 구간에서 뒤처지다가 앞서면 기록 칸을 한 번 강조한다", async () => {
  const { replay, record } = JSON.parse(
    fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8")
  );
  record.splits = [120, 270, 390, 455];
  const { context, page, errors } = await openPage(
    ({ seed, record }) => {
      Math.random = () => seed / 2 ** 32;
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ access: { countdown: "off" }, visual: { effects: "full" } })
      );
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
      window.leadPulses = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (this.matches('[data-hud="split"]') && options?.id === "split-lead") window.leadPulses++;
        return animate.call(this, frames, options);
      };
    },
    { seed: replay.seed, record },
    { frameClock: true }
  );
  try {
    await startMode(page, "sprint40");
    await playReplayFrames(page, replay.inputs, 0, 145);
    assert.equal(await page.locator("#hud-split").getAttribute("data-ahead"), "false");
    assert.equal(await page.evaluate(() => window.leadPulses), 0);
    await playReplayFrames(page, replay.inputs, 145, 290);
    assert.equal(await page.locator("#hud-split").getAttribute("data-ahead"), "true");
    assert.equal(await page.evaluate(() => window.leadPulses), 1);
    assert.equal(
      await page.locator('[data-hud="split"]').evaluate(el => {
        const pulse = el.getAnimations().find(animation => animation.id === "split-lead");
        pulse.currentTime = 0;
        return getComputedStyle(el).outlineStyle;
      }),
      "solid"
    );
    await playReplayFrames(page, replay.inputs, 290, 420);
    assert.equal(await page.evaluate(() => window.leadPulses), 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
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
  await page.locator("#ask-ok").waitFor();
  assert.match(await page.locator("#ask .dialog-body").textContent(), /Modern 기본값과 다른 설정.*회전 시스템 킥 없음/);
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "내 규칙 1");
  await page.click("#ask-cancel");
  assert.equal(await page.locator("#rule-share-paste").inputValue(), code, "취소하면 입력값을 유지한다");
  await page.click("#rule-share-load");
  await page.click("#ask-ok");
  await page.waitForFunction(() => document.querySelector("#rule-slot-name")?.value === "받은 규칙");
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
  assert.equal(await p2.locator('[data-rules="custom"]').getAttribute("aria-pressed"), "false");
  await p2.locator("#ask-ok").waitFor();
  await p2.keyboard.press("Escape");
  await p2.locator("#ask-ok").waitFor({ state: "hidden" });
  assert.equal(await p2.locator('[data-rules="custom"]').getAttribute("aria-pressed"), "false");
  await p2.goto(`${url}#rules=${code.slice(4)}`);
  await p2.click("#ask-ok");
  await p2.waitForFunction(
    () => document.querySelector('[data-rules="custom"]')?.getAttribute("aria-pressed") === "true"
  );
  assert.match(await p2.locator("#menu-notice").textContent(), /내 규칙에 새로 넣었어요/);
  assert.equal(new URL(p2.url()).hash, "", "주소의 해시는 지운다");
  assert.equal(await p2.locator("#rule-slot .select-value").textContent(), "받은 규칙");
  await p2.click("#edit-rules");
  assert.match(await p2.locator("#rule-rotation .select-value").textContent(), /킥 없음/);
  assert.deepEqual([...errors, ...errs2], []);
  await fresh.close();
});

test("내 규칙 미리보기·복제·시험 플레이: 긴 이름으로 복제하고 저장된 판을 유지하며 편집으로 돌아간다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
  });
  await startMode(page, "sprint40");
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await page.locator("#resume-save-status").waitFor();
  const storage = await page.evaluate(() => {
    const key = "tetrisharp:run:suspended";
    return [key, localStorage.getItem(key)];
  });
  assert.ok(storage[1], "이어 할 판이 있다");
  await page.reload();
  await page.click('[data-rules="custom"]');
  assert.match(await text(page, "rule-desc"), /Modern 기본값과 같아요/);
  await page.click("#edit-rules");
  await page.locator("#rule-slot-name").fill("123456789012345678901234");
  await page.click("#rule-slot-duplicate");
  assert.match(await page.locator("#rule-slot-name").inputValue(), /복사본$/);
  await page.locator("#rule-allow180").uncheck();
  await page.click("#rules-close");
  await page.waitForFunction(() => document.querySelector("#rule-desc")?.textContent.includes("180도 회전 허용 끄기"));
  await page.click("#edit-rules");
  await page.locator("#rule-allow180").focus();
  await page.click("#rule-trial");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.match(await text(page, "session-title"), /규칙 시험 플레이/);
  assert.equal(await page.locator('[data-touch="R180"]').isDisabled(), true);
  assert.equal(await page.locator("#ask").isVisible(), false);
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.locator("#rule-allow180").waitFor();
  assert.equal(await page.locator("#rule-allow180").evaluate(el => document.activeElement === el), true);
  assert.equal(await page.locator("#rule-allow180").isChecked(), false);
  await page.click("#rule-trial");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (let i = 0; i < 40 && (await page.evaluate(() => document.body.dataset.screen)) === "play"; i++)
    await page.keyboard.press("Space", { delay: 40 });
  await page.locator("#rule-allow180").waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storage[0]), storage[1]);
  await page.click("#rules-close");
  await page.waitForFunction(() => document.querySelector("#rule-slot .select-value")?.textContent.endsWith("복사본"));
  await choose(page, "rule-slot", "0");
  await page.waitForFunction(() =>
    document.querySelector("#rule-desc")?.textContent.includes("Modern 기본값과 같아요")
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test("내 규칙: 첫 화면에서 고르고 공유 탭을 열며, 편집기에서 새 규칙·이름·지우기를 한다", async () => {
  const { context, page, errors } = await openPage();
  // Custom이 아닐 때는 내 규칙 줄 자리에 같은 높이로 Custom 안내 한 줄(빈칸 없이, 탭을 바꿔도 아래가 움직이지 않게)
  const rowHeight = () => page.locator("#rule-slot-row").evaluate(el => el.getBoundingClientRect().height);
  assert.match(await page.locator("#rule-slot-row").textContent(), /Custom을 고르면/);
  const offHeight = await rowHeight();
  await page.click('[data-rules="custom"]');
  assert.equal(await page.locator("#rule-slot").isVisible(), true);
  assert.equal(await rowHeight(), offHeight, "줄 높이가 같다");
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
  await page.click("#rule-slot-remove");
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "대회용", "한 번 누르면 아직 그대로");
  await page.click("#rule-slot-remove");
  assert.equal(await page.locator("#rule-slot-name").inputValue(), "내 규칙 1");
  assert.equal(await page.locator("#rule-slot-remove").isDisabled(), true, "마지막 하나는 지울 수 없다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("연습: 메뉴에서 고르면 시작하고, 놓을 때마다 성공/시도를 센다", async () => {
  const { context, page, errors } = await openPage();
  await openList(page, "#open-practice");
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
    await openList(page, "#open-practice");
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
    await openList(page, "#open-practice");
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
  const { context, page, errors } = await openPage(
    () => {
      window.foldingBars = 0;
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
        if (this.canvas.id === "board" && this.globalAlpha === 0.83 && width < height / 3) window.foldingBars++;
        return fill.call(this, x, y, width, height);
      };
    },
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
    await page.setViewportSize({ width: 390, height: 844 });
    await openList(page, "#open-practice");
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
    assert.equal(await page.evaluate(() => window.foldingBars), 0, "그대로 받은 가비지는 접히지 않는다");
    assert.match(await text(page, "results-stats"), /받은 쓰레기4/);
    await page.click('#results [data-action="retry"]');
    assert.equal(await page.locator("body").getAttribute("data-screen"), "play");
    await play(["ArrowUp", ...Array(4).fill("ArrowLeft"), "Space"]);
    assert.equal(await text(page, "race-result"), "공격 4줄 · 상쇄 4줄 · 상대에게 0줄");
    assert.equal(await page.evaluate(() => window.foldingBars), 4, "상쇄한 네 줄만 접힌다");

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
    await openList(page, "#open-practice");
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
    assert.match(await text(page, "session-title"), /T-spin Double 자리/);
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
    await openList(page, "#open-practice");
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
    await openList(page, "#open-practice");
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
  await page.setInputFiles("#backup-file", file);
  await page.click("#ask-ok");
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

    await page.setInputFiles("#backup-file", file);
    await page.locator("#ask").waitFor({ state: "visible" });
    const messages = [await page.locator("#ask .ask-body").textContent()];
    await page.click("#ask-ok");
    await page.waitForFunction(() => document.getElementById("menu-notice")?.textContent.includes("저장하지 못했어요"));
    assert.match(messages[0], /기록 1개, 리플레이 2개/);
    assert.match(messages[0], /퍼즐 완료 0개 · 훈련 완료 0개 · Sprint 시도 0개/);
    assert.equal(await best(page), "");
    assert.equal(await page.locator("#watch-last").isDisabled(), true);

    await page.reload();
    await ready(page);
    await page.setInputFiles("#backup-file", file);
    await page.click("#ask-ok");
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
    // 연타로 금방 막힌 판은 "마지막 판"으로 남기지 않는다(F21) → 결과의 다시 보기로 같은 날짜(시드) 판인지 본다
    assert.equal(await page.evaluate(() => localStorage.getItem("tetrisharp:replay:last")), null);
    await page.click('#results [data-action="watch"]');
    assert.match(await text(page, "replay-title"), new RegExp(date));
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
    // 알림 칸은 다른 대화상자처럼 비어 있는 자리(숨기면 닫기 버튼이 발 폭 전체로 늘어난다 — 2차 평가 U35)
    assert.equal(await page.locator("#versus .notice-slot").textContent(), "");
    const closeBox = await page.locator("#versus-close").boundingBox();
    const footBox = await page.locator("#versus .dialog-foot").boundingBox();
    assert.ok(closeBox.width < footBox.width / 2, `닫기 버튼 폭 ${closeBox.width} / 발 ${footBox.width}`);
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
    await openList(page, "#open-practice");
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
    // 첫 피스는 왼쪽·오른쪽을 헛되이 누르고 놓는다. 20초 넘게 둔 뒤 막혀야 짧은 판(F21)이 아니라 추천 연습이 뜬다.
    await input(["ArrowLeft", "ArrowRight", "Space"]);
    await page.evaluate(() => {
      for (let i = 0; i < 21 * 60; i++) window.advanceFrame();
    });
    await input(Array(50).fill("Space"));
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

test("대화상자: 열면 맨 위부터 보이고, 끝까지 내려도 마지막 줄·버튼이 아래 구분선에 붙지 않는다", async () => {
  const { context, page, errors } = await openPage();
  const openBody = () =>
    page.evaluate(
      () => [...document.querySelectorAll("dialog")].find(d => d.open).querySelector(".dialog-body").scrollTop
    );
  // 열자마자 아래로 스크롤된 채 뜨면 위쪽 설정이 안 보인다(5차 검수 F39: 퍼즐 만들기)
  for (const opener of ["#open-achievements", "#open-puzzles #puzzle-create"]) {
    const [first, second] = opener.split(" ");
    await page.click(first);
    if (second) await page.click(second);
    await page.waitForTimeout(100);
    assert.equal(await openBody(), 0, `${opener} 열면 맨 위`);
    await page.keyboard.press("Escape");
  }
  for (const opener of ["#open-help", "#open-practice", "#open-puzzles", "#open-records", "#open-settings"]) {
    await page.click(opener);
    await page.waitForTimeout(100);
    assert.equal(await openBody(), 0, `${opener} 열면 맨 위`);
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

  // DCD(5차 검수 G6): 기본 0(끄기), 바꾼 값은 저장되고 프리셋을 눌러도 그대로 남는다
  assert.equal(await page.locator("#set-dcd").inputValue(), "0");
  await page.locator("#set-dcd").fill("50");
  await page.click('#set-handling-preset [data-value="fast"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:settings")).handling);
  assert.deepEqual(saved, { das: 100, arr: 0, sdf: 30, dcd: 50 });

  // 전체 화면(5차 검수 G5): 지원하는 브라우저면 화면 탭의 스위치로 켜고 끈다(설정에 남기지 않는 그때 상태)
  await page.click('#settings .dialog-tabs [data-value="visual"]');
  await page.click("#set-fullscreen");
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  assert.equal(await page.locator("#set-fullscreen").isChecked(), true);
  await page.click("#set-fullscreen");
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await page.locator("#set-fullscreen").isChecked(), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("편의: 카운트다운 '없음'이면 바로 시작하고, 연습에서는 되돌리기로 방금 놓은 피스를 취소한다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await openList(page, "#open-practice");
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
  assert.equal(await visible(page, "puzzle-goal-hud"), false, "자유 연습에는 퍼즐 목표가 없다");
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]');
  // 연습을 그만두면 연습 목록이 열린다 → 닫으면 첫 화면
  await page.waitForFunction(() => document.getElementById("practice")?.open);
  await page.keyboard.press("Escape");
  await page.click('[data-mode="endless"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await visible(page, "undo-piece"), false, "연습이 아니면 되돌리기 없음");
  assert.deepEqual(errors, []);
  await context.close();
});

test("다시 시작 키 '한 번에': 게임 중 R 한 번에 새 판(터치 버튼은 묻는다), 기록 판은 일시정지 중 보드를 가린다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off", restart: "instant" } }))
  );
  const boardHidden = () =>
    page.evaluate(() => getComputedStyle(document.getElementById("board")).visibility === "hidden");
  await page.click('[data-mode="sprint40"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "2");
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0");
  assert.equal(await page.evaluate(() => document.body.dataset.screen), "play", "묻지 않고 바로 새 판");
  assert.equal(await visible(page, "confirm"), false);

  // 기록 판(Sprint): 일시정지 중에는 보드·다음 피스를 가리고, 계속하면 다시 보인다(5차 검수 G4)
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.screen === "paused");
  assert.equal(await boardHidden(), true, "일시정지 중 보드 가림");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await boardHidden(), false);

  // 터치 버튼의 다시 시작은 설정과 상관없이 묻는다
  await page.evaluate(() => document.body.classList.add("touch-on"));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "1");
  await page.dispatchEvent('[data-touch="RESTART"]', "pointerdown", { pointerId: 1, isPrimary: true });
  await page.waitForFunction(() => !document.getElementById("confirm").hidden);
  await page.keyboard.press("Escape");

  // 연습은 기록 판이 아니라 일시정지 중에도 보드가 보인다
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]');
  await openList(page, "#open-practice");
  await page.click('[data-drill="free"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.body.dataset.screen === "paused");
  assert.equal(await boardHidden(), false, "연습은 보드를 가리지 않는다");
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

test("휴대폰 제스처: 두 손가락 탭으로 T를 180도 회전해 판을 비운다", async () => {
  const { page, context, errors } = await openPage(
    () =>
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ touch: "on", touchMode: "gestures", access: { countdown: "off" } })
      ),
    undefined,
    { frameClock: true, viewport: { width: 390, height: 844 }, hasTouch: true }
  );
  try {
    await page.click("#open-help");
    await page.locator("#help").getByText("두 손가락으로 함께 두드리기", { exact: true }).waitFor();
    await page.click("#help-close");

    // T가 보는 방향을 뒤집어야 두 줄의 구멍에 맞는다.
    const cells = new Uint8Array(PUZZLE_CELLS);
    cells.set(Array.from("11100011111111011111", Number), PUZZLE_CELLS - 20);
    const code = encodePuzzle({ cells, pieces: "T", goal: { kind: "pc" } });
    await page.goto(`${url}#puzzle=${code}`);
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await visible(page, "touchpad"), false);

    const { x, y, width } = await page.locator(".board-wrap").boundingBox();
    const session = await context.newCDPSession(page);
    const touch = (type, touchPoints, timestamp) =>
      session.send("Input.dispatchTouchEvent", { type, touchPoints, timestamp });
    const left = { id: 1, x: x + width * 0.25, y: y + 70 };
    const right = { id: 2, x: x + width * 0.75, y: y + 70 };
    const now = Date.now() / 1000;
    await touch("touchStart", [left, right], now);
    await touch("touchEnd", [], now + 0.06);
    await page.evaluate(() => window.advanceFrame());

    await touch("touchStart", [left], now + 0.12);
    for (let i = 1; i <= 4; i++) await touch("touchMove", [{ ...left, y: left.y + i * 36 }], now + 0.12 + i * 0.015);
    await touch("touchEnd", [], now + 0.19);
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "results-title"), "성공!");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("퍼즐: 단계를 풀면 성공·다음 단계로 이어지고, 첫 화면에 진행도가 남는다. 틀리면 실패", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem(
      "tetrisharp:settings",
      JSON.stringify({ access: { countdown: "off" }, visual: { theme: "film", effects: "full" } })
    );
    window.clearedPaints = 0;
    const clip = CanvasRenderingContext2D.prototype.clip;
    CanvasRenderingContext2D.prototype.clip = function (...args) {
      if (this.canvas.id === "board") window.clearedPaints++;
      return clip.apply(this, args);
    };
  });
  assert.equal(await text(page, "puzzle-progress"), `0 / ${PUZZLES.length}`);
  await openList(page, "#open-puzzles");
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
  await page.waitForFunction(() => window.clearedPaints > 0);
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

/**
 * 퍼즐 만들기의 시작 틀 고르기. 드롭다운은 바깥이 스크롤되면 닫히므로(고정 위치 목록) 열기 단추를 먼저 보이게 하고
 * 스크롤 이벤트가 지나간 뒤 연다.
 */
const pickTemplate = async (page, value) => {
  await page.locator("#puzzle-template").scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  await page.click("#puzzle-template");
  await page.click(`#puzzle-template-list [data-value="${value}"]`);
};

test("퍼즐 만들기: 도장과 피스 순서 단축키는 조작 버튼에 포커스가 있어도 동작한다", async () => {
  const { context, page } = await openPage();
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await page.click('#puzzle-tool [data-value="piece"]');
    await choose(page, "puzzle-stamp", "I");
    await page.hover('[data-cell="175"]');
    const preview = () => page.$$eval("[data-stamp]", cells => cells.map(cell => Number(cell.dataset.cell)));
    const horizontal = await preview();
    assert.equal(horizontal.length, 4);
    assert.equal(await page.locator(":focus").getAttribute("id"), "puzzle-stamp");

    await page.keyboard.press("r");
    assert.deepEqual(await preview(), [165, 175, 185, 195]);
    await page.locator("#puzzle-stamp").dispatchEvent("keydown", { key: "ㄱ", code: "KeyR" });
    assert.deepEqual(await preview(), horizontal);

    for (const piece of ["I", "O", "T"]) await page.click(`.puzzle-editor-pieces [data-piece="${piece}"]`);
    const order = () => page.locator(".puzzle-seq-chip").allTextContents();
    assert.deepEqual(await order(), ["01 I", "02 O", "03 T"]);
    await page.keyboard.press("Alt+ArrowLeft");
    assert.deepEqual(await order(), ["01 I", "02 T", "03 O"]);
    await page.keyboard.press("Alt+ArrowRight");
    assert.deepEqual(await order(), ["01 I", "02 O", "03 T"]);
    await page.keyboard.press("Shift+ArrowLeft");
    assert.deepEqual(await order(), ["01 I", "02 T", "03 O"]);

    await page.getByRole("button", { name: "2번째 T", exact: true }).focus();
    await page.keyboard.press("Alt+ArrowRight");
    assert.deepEqual(await order(), ["01 I", "02 O", "03 T"]);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator(":focus").textContent(), "02 O");
    assert.deepEqual(await order(), ["01 I", "02 O", "03 T"]);

    await page.focus("#puzzle-title");
    await page.keyboard.type("ar");
    await page.keyboard.press("Shift+ArrowLeft");
    assert.equal(await page.locator("#puzzle-title").inputValue(), "ar");
    assert.equal(await page.locator("#puzzle-title").evaluate(input => input.selectionStart), 1);
    assert.deepEqual(await order(), ["01 I", "02 O", "03 T"]);
  } finally {
    await context.close();
  }
});

test("퍼즐 만들기: 도장에서 피스 글자 키로 모양을 바로 바꾼다", async () => {
  const { context, page } = await openPage();
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await page.click('#puzzle-tool [data-value="piece"]');
    const picker = page.locator("#puzzle-stamp");
    const cell = page.locator('[data-cell="175"]');
    const preview = () => page.$$eval("[data-stamp]", cells => cells.map(tile => Number(tile.dataset.cell)));
    await cell.focus();
    for (const piece of "IJLOSTZ") {
      await page.keyboard.press(piece.toLowerCase());
      assert.equal(await picker.getAttribute("data-value"), piece);
      assert.equal((await preview()).length, 4);
    }

    await page.keyboard.press("i");
    await page.keyboard.press("r");
    assert.deepEqual(await preview(), [165, 175, 185, 195]);
    await page.keyboard.press("i");
    assert.deepEqual(await preview(), [165, 175, 185, 195], "같은 모양은 현재 방향을 유지한다");
    await cell.dispatchEvent("keydown", { key: "ㅐ", code: "KeyO" });
    assert.equal(await picker.textContent(), "O");
    await page.keyboard.press("i");
    assert.deepEqual(await preview(), [174, 175, 176, 177], "모양을 바꾸면 기본 방향으로 돌아간다");
    await picker.click();
    assert.equal(await page.locator('#puzzle-stamp-list [aria-selected="true"]').getAttribute("data-value"), "I");
    await page.keyboard.press("Escape");
    await cell.click();
    assert.deepEqual(
      await page.$$eval('[data-cell][aria-pressed="true"]', cells => cells.map(tile => Number(tile.dataset.cell))),
      [174, 175, 176, 177]
    );
    const erasePreview = page.locator('[data-stamp="erase"]');
    assert.equal(await erasePreview.count(), 4);
    assert.match(
      await erasePreview.first().evaluate(tile => getComputedStyle(tile).backgroundImage),
      /linear-gradient/
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(await erasePreview.count(), 0);
    assert.equal(await page.locator('[data-stamp="place"]').count(), 4, "일부만 차 있으면 채우기");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('[data-cell][aria-pressed="true"]').count(), 0);
    assert.match(await page.locator("#puzzles .dialog-foot .notice-slot").textContent(), /도장으로 4칸을 지웠어요/);

    await page.focus('.puzzle-editor-pieces [data-piece="T"]');
    await page.keyboard.press("z");
    assert.equal(await page.locator(".puzzle-seq-chip").textContent(), "01 Z");
    assert.equal(await picker.getAttribute("data-value"), "I");
    await page.focus("#puzzle-title");
    await page.keyboard.type("ost");
    assert.equal(await page.locator("#puzzle-title").inputValue(), "ost");
    assert.equal(await picker.getAttribute("data-value"), "I");
  } finally {
    await context.close();
  }
});

test("좁은 터치 화면: 퍼즐 도구를 읽을 수 있고 색 견본을 44px 이상으로 누를 수 있다", async () => {
  const { context, page } = await openPage(null, undefined, {
    locale: "en-US",
    viewport: { width: 360, height: 740 },
    hasTouch: true,
  });
  try {
    await page.tap("#open-puzzles");
    await page.tap("#puzzle-create");
    assert.equal(await page.getByRole("dialog", { name: "Create puzzle", exact: true }).isVisible(), true);
    const goalFits = await page
      .locator("#puzzle-goal .select-value")
      .evaluate(label => label.scrollWidth <= label.clientWidth);
    assert.equal(goalFits, true);
    assert.equal(await page.locator("#puzzle-check").isVisible(), false, "빈 편집기에는 다음 단계 안내가 보인다");
    await page.tap('#puzzle-tool [data-value="piece"]');
    assert.equal(await page.locator("#puzzle-stamp").isVisible(), true);
    await page.setViewportSize({ width: 740, height: 360 });
    const editor = await page.locator("#puzzles").evaluate(dialog => ({
      body: dialog.querySelector(".dialog-body").clientHeight,
      footer: dialog.querySelector(".dialog-foot").clientHeight,
    }));
    assert.ok(editor.body > editor.footer);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 360, height: 740 });
    await page.tap("#open-settings");
    await page.tap('#settings [data-value="visual"]');
    await page.tap('#set-palette [data-value="custom"]');
    const swatches = await page.locator(".color-swatch").evaluateAll(buttons =>
      buttons.map(btn => {
        const { width, height } = btn.getBoundingClientRect();
        return [width, height];
      })
    );
    assert.equal(swatches.length, 16);
    assert.ok(swatches.every(([width, height]) => width >= 44 && height >= 44));
  } finally {
    await context.close();
  }
});

test("퍼즐 만들기: 피스 50개를 넣어도 추가 버튼은 같은 자리에 있고 본문만 스크롤한다", async () => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 740, height: 360 },
  ]) {
    const { context, page } = await openPage(null, undefined, { viewport, hasTouch: viewport.width < 800 });
    try {
      await openList(page, "#open-puzzles");
      await page.click("#puzzle-create");
      const body = page.locator("#puzzles > .puzzle-editor");
      const add = body.getByRole("button", { name: "T 넣기", exact: true });
      await add.scrollIntoViewIfNeeded();
      const top = await add.evaluate(button => button.getBoundingClientRect().top);
      await add.click();
      await add.evaluate(button => {
        for (let i = 0; i < 48; i++) button.click();
      });
      assert.equal(await add.evaluate(button => button.getBoundingClientRect().top), top);
      await add.click();
      assert.ok(await add.isDisabled());
      const last = body.getByRole("button", { name: "50번째 T", exact: true });
      assert.equal(await last.textContent(), "50 T");
      await last.click();
      assert.equal(await last.getAttribute("aria-pressed"), "false");
      await last.click();
      assert.equal(await last.getAttribute("aria-pressed"), "true");

      const scroll = await body.evaluate(element => {
        const paletteBottom = element.querySelector(".puzzle-editor-palette").getBoundingClientRect().bottom;
        const selectedTop = element.querySelector(".puzzle-seq-chip[aria-pressed=true]").getBoundingClientRect().top;
        element.scrollTop = element.scrollHeight;
        return {
          body: element.scrollTop,
          dialog: element.parentElement.scrollTop,
          pageOverflow: getComputedStyle(document.documentElement).overflowY,
          paletteBottom,
          selectedTop,
        };
      });
      assert.ok(scroll.body > 0);
      assert.equal(scroll.dialog, 0);
      assert.equal(scroll.pageOverflow, "hidden");
      assert.ok(scroll.paletteBottom <= scroll.selectedTop);
      await page.click("#puzzle-editor-close");
      assert.notEqual(await page.locator("html").evaluate(element => getComputedStyle(element).overflowY), "hidden");
    } finally {
      await context.close();
    }
  }
});

test("퍼즐 만들기: 끌어서 칠하기·구멍 줄·되돌리기·높이·피스 순서 편집, 시작 틀로 만든 퍼즐을 풀면 공유할 수 있다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const pressed = () => page.$$eval('[data-cell][aria-pressed="true"]', els => els.map(e => Number(e.dataset.cell)));
  const center = async i => {
    const r = await page.locator(`[data-cell="${i}"]`).boundingBox();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  const drag = async (from, to) => {
    const [x, y] = await center(from);
    await page.mouse.move(x, y);
    await page.mouse.down();
    const [x2, y2] = await center(to);
    await page.mouse.move(x2, y2, { steps: 8 });
    await page.mouse.up();
  };
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  assert.equal(await page.locator("[data-cell]").count(), 80, "처음에는 아래 8줄만 크게");
  // 열면 맨 위(이름·시작 틀·목표)부터 보이고, 닫기는 다른 버튼과 같은 줄 오른쪽 끝(5차 검수 F39·U54)
  const opened = await page.evaluate(() => {
    const body = document.querySelector("dialog[open] .dialog-body");
    const close = document.getElementById("puzzle-editor-close").getBoundingClientRect();
    const trial = document.getElementById("puzzle-trial").getBoundingClientRect();
    return {
      scrollTop: body.scrollTop,
      sameRow: Math.abs(close.top - trial.top) < 2,
      closeRight: close.right > trial.right,
    };
  });
  assert.deepEqual(opened, { scrollTop: 0, sameRow: true, closeRight: true });

  // 끌어서 칠하기 한 번 = 되돌리기 한 번
  await drag(190, 194);
  assert.deepEqual(await pressed(), [190, 191, 192, 193, 194]);
  // 바닥 줄을 아래로 밀면 지워지고, 그렇다고 알린다(퍼즐 다시 보기 P7). 되돌리면 돌아온다
  await page.click('#puzzles [data-shift="0,1"]');
  assert.deepEqual(await pressed(), []);
  assert.match(await page.locator("#puzzles .dialog-foot .notice-slot").textContent(), /칸 5개가 판 밖으로/);
  await page.keyboard.press("Control+z");
  assert.deepEqual(await pressed(), [190, 191, 192, 193, 194]);
  // 피스 도장(퍼즐 다시 보기 P9): 고른 피스 모양을 누른 칸에 찍고, R로 돌리며, 판 밖이면 찍지 않고 알린다
  assert.ok(await page.locator("#puzzle-stamp").isDisabled(), "도장 도구가 아니면 도장 피스는 못 고른다");
  await page.click('#puzzle-tool [data-value="piece"]');
  await page.click("#puzzle-stamp");
  await page.click('#puzzle-stamp-list [data-value="O"]');
  await page.click('[data-cell="186"]');
  assert.deepEqual(await pressed(), [186, 187, 190, 191, 192, 193, 194, 196, 197], "O는 누른 칸이 왼쪽 위");
  await page.click('[data-cell="186"]');
  assert.deepEqual(await pressed(), [190, 191, 192, 193, 194], "같은 자리에 다시 찍으면 지운다");
  await page.click('[data-cell="189"]');
  assert.match(await page.locator("#puzzles .dialog-foot .notice-slot").textContent(), /판 밖으로 나가/);
  await page.click("#puzzle-stamp");
  await page.click('#puzzle-stamp-list [data-value="I"]');
  await page.focus('[data-cell="175"]');
  await page.keyboard.press("r");
  assert.deepEqual(
    await page.$$eval("[data-stamp]", els => els.map(e => Number(e.dataset.cell))),
    [165, 175, 185, 195],
    "세운 I 미리보기"
  );
  await page.keyboard.press("Enter");
  assert.equal((await pressed()).length, 9, "세운 I 네 칸");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  assert.deepEqual(await pressed(), [190, 191, 192, 193, 194]);
  await page.click('#puzzle-tool [data-value="cell"]');
  await page.keyboard.press("Control+z");
  assert.deepEqual(await pressed(), []);
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual(await pressed(), [190, 191, 192, 193, 194]);
  // 같은 칸에서 다시 끌면 지운다
  await drag(193, 194);
  assert.deepEqual(await pressed(), [190, 191, 192]);

  // 구멍 줄: 처음 누른 열(5)을 구멍으로 두고 위로 끈 줄마다
  await page.click('#puzzle-tool [data-value="garbage"]');
  await drag(185, 165);
  for (const r of [16, 17, 18]) {
    const line = (await pressed()).filter(i => Math.floor(i / 10) === r).map(i => i % 10);
    assert.deepEqual(line, [0, 1, 2, 3, 4, 6, 7, 8, 9], `${r}행`);
  }
  await page.click("#puzzle-undo");
  assert.deepEqual(await pressed(), [190, 191, 192]);

  // 높이: 20줄이면 칸이 다 보이고, 블록이 8줄 위에 있으면 8줄은 고를 수 없다
  await page.click('#puzzle-height [data-value="20"]');
  assert.equal(await page.locator("[data-cell]").count(), 200);
  await page.click('[data-cell="0"]');
  assert.ok(await page.locator('#puzzle-height [data-value="8"]').isDisabled());
  await page.click("#puzzle-undo");
  await page.click('#puzzle-height [data-value="8"]');
  assert.equal(await page.locator("[data-cell]").count(), 80);

  // 피스 순서: 고른 피스 뒤에 넣고, Delete로 빼고, Alt+화살표로 옮긴다
  const sequence = () => page.$$eval(".puzzle-seq-chip", els => els.map(e => e.textContent.split(" ").at(-1)).join(""));
  for (const piece of ["T", "I", "O"]) await page.click(`#puzzles [data-piece="${piece}"]`);
  await page.click('.puzzle-seq-chip[data-at="0"]');
  await page.click('#puzzles [data-piece="S"]');
  assert.equal(await sequence(), "TSIO");
  await page.focus('.puzzle-seq-chip[data-at="1"]');
  await page.keyboard.press("Alt+ArrowRight");
  assert.equal(await sequence(), "TISO");
  // 좌우 뒤집기는 피스도 S와 Z, J와 L을 바꾸고, 되돌리기 한 번으로 판·피스가 함께 돌아간다(퍼즐 다시 보기 P1)
  const mirrorButton = page.locator('#puzzles button[aria-label^="좌우 뒤집기"]');
  await mirrorButton.click();
  assert.equal(await sequence(), "TIZO");
  await page.click("#puzzle-undo");
  assert.equal(await sequence(), "TISO");
  await page.focus('.puzzle-seq-chip[data-at="2"]');
  await page.keyboard.press("Delete");
  assert.equal(await sequence(), "TIO");
  assert.equal(await text(page, "puzzles .puzzle-editor-count"), `3 / 50`);
  // 글자 키로 넣고, "S J" 같은 순서 글자를 붙여 넣는다 — 되돌리기는 키 한 번·붙여 넣기 한 번(퍼즐 다시 보기 P5)
  await page.click('.puzzle-seq-chip[data-at="2"]');
  await page.focus('#puzzles [data-piece="I"]');
  await page.keyboard.press("z");
  assert.equal(await sequence(), "TIOZ");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "s j");
    document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  });
  assert.equal(await sequence(), "TIOZSJ");
  await page.click("#puzzle-undo");
  await page.click("#puzzle-undo");
  assert.equal(await sequence(), "TIO");

  // 시작 틀: 퍼즐 1단계를 복사해 시험 플레이로 풀면 링크를 복사할 수 있다(되돌리면 이전 판)
  const stage = PUZZLES[0];
  await pickTemplate(page, `stage-${stage.number}`);
  assert.equal(await sequence(), stage.pieces.join(""));
  await page.click("#puzzle-undo");
  assert.equal(await sequence(), "TIO");
  await page.click("#puzzle-redo");
  await page.click("#puzzle-trial");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (const key of keysFor(solvePuzzle(stage))) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => document.body.dataset.screen === "results");
  assert.equal(await text(page, "results-title"), "성공!");
  await page.click('#results [data-action="export"]');
  assert.ok(await page.locator("#puzzle-copy").isEnabled());
  assert.equal(await sequence(), stage.pieces.join(""), "다시 연 편집기는 시험한 퍼즐 그대로");
  assert.deepEqual(errors, []);
  await context.close();
});

test("리플레이의 '퍼즐로': 그 장면의 판·지금 피스와 다음 피스로 새 퍼즐을 연다(퍼즐 다시 보기 P4)", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await page.click('[data-mode="sprint40"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (let i = 0; i < 45 && (await page.evaluate(() => document.getElementById("results").hidden)); i++)
    await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results").hidden);
  await page.click('[data-action="watch"]');
  await page.waitForFunction(() => document.body.dataset.screen === "replay");
  // 끝 장면으로 가서 만든다(판이 쌓여 있다)
  await page.$eval("#replay-progress", el => {
    el.value = el.max;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-replay="puzzle"]');
  await page.waitForFunction(() => document.querySelector("#puzzles[open] .puzzle-editor"));
  // 지금 피스 + 다음 5개(막혀 끝난 장면에는 지금 피스가 없다)
  const chips = await page.locator(".puzzle-seq-chip").count();
  assert.ok(chips === 5 || chips === 6, `피스 ${chips}개`);
  assert.ok((await page.locator('[data-cell][aria-pressed="true"]').count()) > 0, "쌓인 판");
  assert.equal(await text(page, "puzzle-saved"), "내 퍼즐에 저장했어요. 고치면 저절로 저장돼요.");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.body.dataset.screen), "replay", "닫으면 리플레이로");
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 만들기: 닫았다 다시 열어도 저장 전 새 퍼즐은 이어서, 내 퍼즐은 되돌리기 기록이 남는다(퍼즐 다시 보기 P8·P11)", async () => {
  const { context, page, errors } = await openPage();
  const pressed = () => page.locator('[data-cell][aria-pressed="true"]').count();
  // 이름만 적은 새 퍼즐(아직 저장되지 않는다)은 닫았다 다시 "퍼즐 만들기"를 누르면 이어서 보인다
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  await page.fill("#puzzle-title", "초안");
  await page.click("#puzzle-editor-close");
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  assert.equal(await page.inputValue("#puzzle-title"), "초안");

  // 판·피스를 넣어 저장된 퍼즐: 칸을 고치고 닫았다 목록에서 다시 열면 되돌릴 수 있다
  await pickTemplate(page, `stage-${PUZZLES[0].number}`);
  const before = await pressed();
  await page.click('[data-cell="120"]');
  assert.equal(await pressed(), before + 1);
  await page.click("#puzzle-editor-close");
  await openList(page, "#open-puzzles");
  await page.click('#puzzles .dialog-tabs [data-value="mine"]');
  await page.click("[data-made-edit]");
  assert.ok(await page.locator("#puzzle-undo").isEnabled(), "다시 열어도 되돌리기 기록");
  await page.click("#puzzle-undo");
  assert.equal(await pressed(), before);

  // 내 퍼즐 시험 플레이에서는 한 피스 되돌리기(U·버튼)를 쓸 수 있다(퍼즐 다시 보기 P10).
  // 퍼즐은 틀린 수에서 바로 끝나므로, 실패 결과에서 되돌리면 그 수 앞으로 판에 돌아간다
  await page.click("#puzzle-trial");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await visible(page, "undo-piece"), true);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.body.dataset.screen === "results");
  assert.equal(await text(page, "results-title"), "실패");
  assert.equal(await visible(page, "undo-piece"), true, "실패 결과에서도 되돌리기");
  assert.equal(await text(page, "puzzle-goal-hud .goal-status"), "목표 미달성");
  await page.keyboard.press("KeyU");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0");
  assert.equal(await text(page, "puzzle-goal-hud .goal-status"), "시작 전");
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]');
  // 시험을 그만두면 내 퍼즐 목록이 열린다
  await page.waitForFunction(() => document.querySelector("#puzzles[open] [data-made-edit]"));
  await page.keyboard.press("Escape");
  // 저장된 퍼즐을 닫은 뒤 새로 만들면 빈 편집기
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  assert.equal(await page.inputValue("#puzzle-title"), "");
  assert.equal(await pressed(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 만들기 자동 확인: 고치기를 멈추면 저절로 확인하고, 풀 수 있으면 시험 없이 공유, 풀이를 한 수씩 보고, 미리 알려 주고, 긴 확인은 멈출 수 있다", async () => {
  const { context, page, errors } = await openPage();
  const status = () => text(page, "puzzle-status");
  /** 저절로 확인(퍼즐 다시 보기 P3)이 끝나 결과가 나올 때까지 */
  const autoChecked = pattern =>
    page.waitForFunction(
      source => new RegExp(source).test(document.getElementById("puzzle-status")?.textContent ?? ""),
      pattern.source,
      { timeout: 20000 }
    );
  const settled = () =>
    page.waitForFunction(() => !document.getElementById("puzzle-status")?.textContent?.includes("찾는 중"), null, {
      timeout: 20000,
    });
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  assert.equal(await page.evaluate(() => typeof window.__TETRISHARP_SOLVER__), "string", "배포본에 Worker 소스");

  // 풀 수 있는 판: 시험 플레이 없이 링크를 복사할 수 있다
  const stage = PUZZLES.find(p => p.kind === "pc" && p.pieces.length === 3);
  await pickTemplate(page, `stage-${stage.number}`);
  assert.ok(await page.locator("#puzzle-copy").isDisabled());
  assert.ok(await page.locator("#puzzle-solution-view").isDisabled());
  assert.equal(await status(), "고치기를 멈추면 저절로 풀 수 있는지 찾아봐요.");
  await autoChecked(/^풀 수 있어요 · \d수/);
  assert.ok(await page.locator("#puzzle-copy").isEnabled());
  assert.equal(await text(page, "puzzles .notice-slot"), "풀 수 있는 퍼즐이에요. 링크를 공유할 수 있어요.");
  assert.ok(await page.locator("#puzzle-check").isDisabled(), "같은 퍼즐은 다시 확인하지 않는다");

  // 풀이 보기: 수마다 놓을 칸 네 개, 판을 누르면 편집으로(칸은 바뀌지 않는다)
  const before = await page.$$eval('[data-cell][aria-pressed="true"]', els => els.length);
  await page.click("label.puzzle-editor-switch");
  assert.equal(await text(page, "puzzle-solution-step"), `1 / ${(await status()).match(/(\d)수/)[1]}`);
  assert.equal(await page.locator("[data-ghost]").count(), 4);
  await page.click("#puzzle-solution-next");
  assert.match(await text(page, "puzzle-solution-step"), /^2 \//);
  await page.click('[data-cell="150"]');
  assert.equal(await page.locator("[data-ghost]").count(), 0);
  assert.equal(await page.$$eval('[data-cell][aria-pressed="true"]', els => els.length), before);

  // 바꾸면 확인은 지워진다
  await page.click('#puzzles [data-piece="O"]');
  assert.ok(await page.locator("#puzzle-copy").isDisabled());
  assert.equal(await status(), "고치기를 멈추면 저절로 풀 수 있는지 찾아봐요.");

  // 미리 알려 주기: 홀수 칸이면 판을 비울 수 없다
  await pickTemplate(page, "empty");
  for (const cell of [190, 191, 192]) await page.click(`[data-cell="${cell}"]`);
  await page.click('#puzzles [data-piece="T"]');
  assert.match(await status(), /^칸 3개와 이 피스로는/);
  await page.click("#puzzle-check");
  await settled();
  assert.equal(await status(), "이 피스로는 판을 비울 수 없어요.");

  // 피스가 많으면(12개 넘게) 저절로 확인하지 않는다. 오래 걸리는 확인은 멈출 수 있고, 그동안 화면은 움직인다
  await pickTemplate(page, "empty");
  await page.click('#puzzle-height [data-value="12"]');
  for (let r = 10; r < 20; r++) for (let c = 4; c < 10; c++) await page.click(`[data-cell="${r * 10 + c}"]`);
  for (const piece of "TSZOJLITSZOJLIT") await page.click(`#puzzles [data-piece="${piece}"]`);
  await page.waitForTimeout(900);
  assert.equal(await status(), "피스가 많아 확인을 눌러야 찾아봐요.");
  await page.click("#puzzle-check");
  assert.equal(await status(), "풀 수 있는지 찾는 중이에요…");
  await page.click('#puzzle-tool [data-value="row"]');
  assert.equal(await page.locator('#puzzle-tool [data-value="row"]').getAttribute("aria-pressed"), "true");
  await page.click("#puzzle-check-stop");
  assert.equal(await status(), "확인을 누르면 풀 수 있는지 찾아봐요.");
  assert.ok(await page.locator("#puzzle-check").isEnabled());
  await page.click("#puzzle-check");
  await settled();
  assert.equal(await status(), "너무 길어서 자동으로 확인하지 못했어요. 시험 플레이로 직접 풀어 주세요.");
  assert.ok(await page.locator("#puzzle-copy").isDisabled(), "확인하지 못한 퍼즐은 직접 풀어야 공유한다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 편집기: Worker 차단 시 상태를 알리고 편집을 계속한다", async () => {
  const { context, page, errors } = await openPage(() => {
    window.Worker = class {
      constructor() {
        throw new DOMException("Worker blocked", "SecurityError");
      }
    };
  });
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await pickTemplate(page, "well");
    await page.getByText(/백그라운드 풀이기를 열 수 없어요/).waitFor();
    assert.ok(await page.locator("#puzzle-check").isEnabled());
    assert.ok(await page.locator("#puzzle-trial").isEnabled());
    await page.click('#puzzles [data-piece="O"]');
    assert.equal(await page.locator("#puzzles .puzzle-editor-count").textContent(), "2 / 50");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("퍼즐 자동 풀이: 시간이 긴 자동 검색을 멈추고 수동 확인으로 계속한다", async () => {
  const { context, page, errors } = await openPage(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message) {
        if (!message.task.maxStates) super.postMessage(message);
      }
    };
  });
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await pickTemplate(page, "well");
    await page.getByText(/이 퍼즐은 더 살펴봐야 해요/).waitFor();
    assert.ok(await page.locator("#puzzle-check-stop").isDisabled());
    await page.click("#puzzle-check");
    await page.getByText(/풀 수 있어요 · 1수/).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("모바일 퍼즐 풀이: 긴 편집판에서 열어도 보드를 보면서 스크롤 없이 단계 이동", async () => {
  const { context, page, errors } = await openPage(null, undefined, {
    viewport: { width: 320, height: 568 },
    hasTouch: true,
  });
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    const worker = page.waitForEvent("worker");
    const stage = PUZZLES.find(p => p.kind === "pc" && p.pieces.length === 3);
    await pickTemplate(page, `stage-${stage.number}`);
    assert.ok((await worker).url().startsWith("blob:"));
    await page.click('#puzzle-height [data-value="20"]');
    await page.click("label.puzzle-editor-switch");
    const scroll = () => page.locator("#puzzles .dialog-body").evaluate(el => el.scrollTop);
    const before = await scroll();
    const board = page.locator(".puzzle-editor-board");
    const nav = page.locator(".puzzle-editor-preview-nav");
    const box = await board.boundingBox();
    const controls = await nav.boundingBox();
    const body = await page.locator("#puzzles .dialog-body").boundingBox();
    assert.ok(controls.y >= body.y - 1 && box.y + box.height <= body.y + body.height + 1);
    await page.click("#puzzle-solution-next");
    assert.equal(await text(page, "puzzle-solution-step"), "2 / 3");
    await page.click("#puzzle-solution-next");
    assert.equal(await text(page, "puzzle-solution-step"), "3 / 3");
    await page.click("#puzzle-solution-prev");
    assert.equal(await text(page, "puzzle-solution-step"), "2 / 3");
    assert.equal(await scroll(), before);
    await page.click("#puzzle-solution-exit");
    assert.equal(await board.getAttribute("data-rows"), "20");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("모바일 슬라이더: 세로 스와이프는 설정을 스크롤하고 가로 드래그는 값을 바꾼다", async () => {
  const { context, page, errors } = await openPage(null, undefined, {
    viewport: { width: 390, height: 650 },
    hasTouch: true,
  });
  const cdp = await context.newCDPSession(page);
  try {
    await page.click("#open-settings");
    const body = page.locator("#settings .dialog-body");
    const slider = page.locator("#set-arr");
    const swipe = async (dx, dy, at) => {
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox();
      const x = box.x + box.width * at;
      const y = box.y + box.height / 2;
      const touch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
      await touch("touchStart", [{ x, y }]);
      for (let t = 1; t <= 8; t++) await touch("touchMove", [{ x: x + (dx * t) / 8, y: y + (dy * t) / 8 }]);
      await touch("touchEnd", []);
    };
    await slider.scrollIntoViewIfNeeded();
    const beforeScroll = await body.evaluate(el => el.scrollTop);
    const beforeValue = await slider.inputValue();
    await swipe(4, -140, 0.8);
    await page.waitForFunction(
      before => document.querySelector("#settings .dialog-body").scrollTop > before,
      beforeScroll
    );
    assert.equal(await slider.inputValue(), beforeValue);
    await swipe(85, 3, 0.2);
    assert.notEqual(await slider.inputValue(), beforeValue);
    const dragged = Number(await slider.inputValue());
    await swipe(0, 0, 0.1);
    const tapped = Number(await slider.inputValue());
    assert.ok(tapped < dragged);
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    assert.ok(Number(await slider.inputValue()) > tapped);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("퍼즐 편집기 풀이 비교: 다른 첫 배치를 나란히 보고 T스핀 한 경로의 탐색 범위를 읽는다", async () => {
  const { context, page, errors } = await openPage(null, undefined, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    await pickTemplate(page, "empty");
    for (const row of [18, 19]) {
      for (const col of [0, 1, 4, 5, 8, 9]) await page.click(`[data-cell="${row * 10 + col}"]`);
    }
    await page.click('#puzzles [data-piece="O"]');
    await page.click('#puzzles [data-piece="O"]');
    const compare = page.locator("#puzzle-compare");
    await compare.click();
    const dialog = page.locator("#puzzle-comparison");
    await dialog.getByText("서로 다른 첫 배치 2가지를 확인했어요.").waitFor();
    const boards = dialog.getByRole("img");
    assert.equal(await boards.count(), 2);
    const [a, b] = await boards.evaluateAll(canvases => canvases.map(canvas => canvas.toDataURL()));
    assert.notEqual(a, b, "첫 O가 놓이는 위치가 다른 두 보드");
    assert.ok(await dialog.evaluate(root => root.scrollWidth <= root.clientWidth));
    await dialog.getByRole("button", { name: "다음 수" }).click();
    assert.equal(await dialog.getByText("O 피스 · 2줄 삭제", { exact: true }).count(), 2);
    await page.keyboard.press("Escape");
    assert.ok(await compare.evaluate(control => control === document.activeElement));

    await pickTemplate(page, "tsd");
    await compare.click();
    await dialog.getByText("탐색 범위에서 다른 첫 배치를 찾지 못했어요.").waitFor();
    assert.equal(await dialog.getByText("T 피스 · 2줄 삭제 · T스핀").count(), 1);
    assert.ok(await dialog.getByRole("button", { name: "다음 수" }).isDisabled());
    await dialog.locator("#puzzle-comparison-close").click();
    assert.ok(await page.locator("#puzzle-copy").isEnabled(), "비교는 편집 내용과 공유 확인을 유지한다");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("퍼즐 만들기 목표·고급 설정: 목표와 규칙이 링크로 가고, 받는 쪽은 목표·규칙·확인 표시를 보고, '규칙대로'는 확인·첫 수 보기를 끈다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }));
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  const status = () => text(page, "puzzle-status");
  const pick = async (id, value) => {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    await page.click(`#${id}`);
    await page.click(`#${id}-list [data-value="${value}"]`);
  };
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");

  // 시작 틀 T-spin Double 자리: 목표도 함께 바뀐다
  await pickTemplate(page, "tsd");
  assert.equal(await page.getAttribute("#puzzle-goal", "data-value"), "tsd");
  assert.ok(await page.locator("#puzzle-goal-lines").isDisabled(), "줄 수는 'N줄 지우기'에서만");
  // 쓸 수 없는 드롭다운·스위치는 흐리게(누를 수 있어 보이지 않게)
  const opacity = sel => page.$eval(sel, e => getComputedStyle(e).opacity);
  assert.equal(await opacity("#puzzle-goal-lines"), "0.4");
  assert.equal(await opacity("#puzzle-goal"), "1");
  assert.equal(await opacity("#puzzle-solution-view"), "0.4");

  // 고급 설정: 홀드 켜기·처음 홀드 피스, 20G. 요약 한 줄과 되돌리기
  assert.equal(await text(page, "puzzles .puzzle-editor-advanced-summary"), "Modern · 홀드 없음 · 중력 없음");
  await page.click("#puzzle-advanced summary");
  assert.ok(await page.locator("#puzzle-hold-start").isDisabled(), "홀드가 꺼져 있으면 처음 홀드 피스는 못 고른다");
  assert.equal(await opacity("#puzzle-hold-start"), "1", "줄이 통째로 흐리므로 한 번 더 흐리지 않는다");
  await page.click("#puzzle-hold");
  await pick("puzzle-hold-start", "I");
  await page.click('#puzzle-gravity [data-value="20g"]');
  assert.equal(await text(page, "puzzles .puzzle-editor-advanced-summary"), "20G · 홀드(처음 I)");
  await page.click("#puzzle-undo");
  assert.equal(await text(page, "puzzles .puzzle-editor-advanced-summary"), "홀드(처음 I)");
  await page.click("#puzzle-redo");

  // 저절로 확인 → 링크 복사(자동 복사가 막혀 링크 칸에 나온다)
  await page.waitForFunction(
    () => /^풀 수 있어요/.test(document.getElementById("puzzle-status")?.textContent ?? ""),
    null,
    {
      timeout: 20000,
    }
  );
  await page.click("#puzzle-copy");
  const link = await page.locator("#custom-puzzle-link").inputValue();
  assert.match(link, /#puzzle=2\.od_g2_h1_pI_e1\./, link);

  // 받는 쪽: 같은 목표·규칙으로 열리고, 목표 줄에 규칙 요약과 확인 표시
  // (다른 사람의 브라우저: 저장소를 나누지 않는다)
  const other = await browser.newContext({ locale: "ko-KR" });
  await other.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const recipient = await other.newPage();
  await recipient.goto(link);
  await recipient.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(recipient, "puzzle-goal-hud .goal-title"), "T스핀 더블");
  assert.equal(await text(recipient, "mode-objective"), "20G · 홀드(처음 I) · 자동 확인으로 풀 수 있는 퍼즐");
  await other.close();

  // 규칙대로 떨어지는 퍼즐: 자동 확인을 쓸 수 없고, 게임 중 첫 수 보기도 꺼진다
  await page.click('#puzzle-gravity [data-value="rules"]');
  assert.ok(await page.locator("#puzzle-check").isDisabled());
  assert.match(await status(), /^규칙대로 떨어지는 퍼즐은/);
  assert.ok(await page.locator("#puzzle-copy").isDisabled(), "직접 풀어야 공유한다");
  await page.click("#puzzle-trial");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.ok(await page.locator("#downstack-hint").isDisabled());

  // N줄 지우기: 줄 수를 고르면 목표 이름에 담긴다
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]').catch(() => {});
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  await pick("puzzle-goal", "lines");
  await pick("puzzle-goal-lines", "3");
  assert.equal(await text(page, "puzzle-goal .select-value"), "3줄 지우기");
  assert.deepEqual(errors, []);
  await context.close();
});

test("내 퍼즐·받은 퍼즐: 고치면 저절로 저장되고, 목록에서 편집·플레이·링크·지우기, 받은 퍼즐은 풀었는지 남고 복사해서 고친다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const stage = PUZZLES[0];
  const rows = (p = page) =>
    p.$$eval(".custom-puzzle-row", els => els.map(e => e.innerText.replace(/\s+/g, " ").trim()));
  const openTab = async (tab, p = page) => {
    if (!(await p.locator("#puzzles[open]").count())) await p.click("#open-puzzles");
    await p.click(`#puzzles .dialog-tabs [data-value="${tab}"]`);
  };
  const solve = async p => {
    await p.waitForFunction(() => document.body.dataset.screen === "play");
    for (const key of keysFor(solvePuzzle(stage))) {
      await p.keyboard.press(key);
      await p.waitForTimeout(20);
    }
    await p.waitForFunction(() => document.body.dataset.screen === "results");
  };

  // 만들기: 판과 피스가 생기면 저장되고, 이름·설명도 담긴다
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  assert.equal(await text(page, "puzzle-saved"), "판과 피스를 넣으면 내 퍼즐에 저절로 저장돼요.");
  await pickTemplate(page, `stage-${stage.number}`);
  await page.fill("#puzzle-title", "첫 퍼즐");
  await page.fill("#puzzle-desc", "오른쪽을 보세요");
  assert.equal(await text(page, "puzzle-saved"), "내 퍼즐에 저장했어요. 고치면 저절로 저장돼요.");
  await page.click("#puzzle-editor-close");
  await openTab("mine");
  assert.deepEqual(await rows(), [
    `첫 퍼즐 판 비우기 · 확인 안 됨 ${await page.locator(".custom-puzzle-row .mode-best").textContent()} 지우기`,
  ]);
  assert.ok(await page.locator("[data-made-link]").isDisabled(), "확인 전에는 링크를 보낼 수 없다");

  // 목록에서 플레이 → 풀면 '직접 풀어 봄'이 저장되고, 결과의 '퍼즐 목록'은 내 퍼즐 탭
  await page.click("[data-made-play]");
  await solve(page);
  assert.equal(await text(page, "session-title"), "첫 퍼즐");
  await page.click('#results [data-action="menu"]');
  await page.waitForFunction(() => document.getElementById("puzzles")?.open);
  assert.equal(await page.getAttribute('#puzzles .dialog-tabs [aria-pressed="true"]', "data-value"), "mine");
  assert.match((await rows())[0], /직접 풀어 봄/);
  assert.ok(await page.locator("[data-made-link]").isEnabled());
  await page.click("[data-made-link]");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /#puzzle=2\.e2\./);

  // 목록에서 편집 → 같은 퍼즐을 고친다(새로 생기지 않는다)
  await page.click("[data-made-edit]");
  assert.equal(await page.inputValue("#puzzle-title"), "첫 퍼즐");
  await page.fill("#puzzle-title", "고친 퍼즐");
  await page.click("#puzzle-editor-close");
  await openTab("mine");
  assert.equal((await rows()).length, 1);
  assert.match((await rows())[0], /^고친 퍼즐 /);
  assert.match((await rows())[0], /직접 풀어 봄/, "이름만 고치면 확인 표시는 그대로(퍼즐 다시 보기 P12)");

  // 복제(퍼즐 다시 보기 P6): 같은 판·피스의 새 내 퍼즐을 열고, 확인 표시는 빼며 원본은 그대로
  await page.click("[data-made-duplicate]");
  assert.equal(await page.inputValue("#puzzle-title"), "고친 퍼즐 사본");
  await page.click("#puzzle-editor-close");
  await openTab("mine");
  const afterCopy = await rows();
  assert.equal(afterCopy.length, 2);
  assert.ok(afterCopy.some(r => /^고친 퍼즐 사본 .*확인 안 됨/.test(r)));
  assert.ok(afterCopy.some(r => /^고친 퍼즐 .*직접 풀어 봄/.test(r)));
  await page.click('.custom-puzzle-row:has-text("사본") [data-made-delete]');
  await page.click('.custom-puzzle-row:has-text("사본") [data-made-delete]');
  assert.equal((await rows()).length, 1);

  // 받는 쪽: 링크로 열면 받은 퍼즐에 남고, 못 풀면 '아직', 풀면 시간
  const other = await browser.newContext({ locale: "ko-KR" });
  await other.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const friend = await other.newPage();
  await friend.goto(link);
  await friend.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(friend, "session-title"), "첫 퍼즐");
  assert.equal(await text(friend, "puzzle-goal-hud .goal-title"), "퍼펙트 클리어");
  assert.equal(await text(friend, "mode-objective"), "만든 사람이 직접 풀어 봤어요 · 오른쪽을 보세요");
  await friend.keyboard.press("Space");
  await friend.waitForFunction(() => document.body.dataset.screen === "results");
  await friend.click('#results [data-action="menu"]');
  await friend.waitForFunction(() => document.getElementById("puzzles")?.open);
  assert.match((await rows(friend))[0], /^첫 퍼즐 판 비우기 · 오른쪽을 보세요 아직/);
  await friend.click("[data-received-play]");
  await solve(friend);
  await friend.click('#results [data-action="menu"]');
  await friend.waitForFunction(() => document.getElementById("puzzles")?.open);
  assert.match((await rows(friend))[0], /풀었어요 \d/);
  // 복사해서 편집 → 내 퍼즐에 새로(확인 표시는 빼고)
  await friend.click("[data-received-copy]");
  assert.equal(await friend.inputValue("#puzzle-title"), "첫 퍼즐");
  await friend.click("#puzzle-editor-close");
  await openTab("mine", friend);
  assert.match((await rows(friend))[0], /^첫 퍼즐 판 비우기 · 확인 안 됨/);
  await other.close();

  // 지우기는 두 번 눌러 확정
  await openTab("mine");
  await page.click("[data-made-delete]");
  assert.equal((await rows()).length, 1);
  await page.click("[data-made-delete]");
  assert.equal((await rows()).length, 0);
  assert.equal(
    await text(page, "puzzles .custom-puzzle-empty"),
    "아직 만든 퍼즐이 없어요. 아래 '퍼즐 만들기'로 시작해요."
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 고친 것: 열린 앱에서 링크를 열면 그 퍼즐로, 첫 수 보기를 쓴 판도 이어서 하기, 이름 칸의 Ctrl+Z는 글자만", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  // 이미 열린 앱(첫 화면)에서 퍼즐 링크를 열면 주소의 해시만 바뀐다 → 그 퍼즐이 시작돼야 한다
  await page.evaluate(code => {
    location.hash = `puzzle=${code}`;
  }, "2.-.1fc0.I.66eB7YGsIO2NvOymkAo");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(page, "session-title"), "링크 퍼즐");

  // 첫 수 보기를 쓴 뒤 새로 고침 → 이어서 하기가 된다(전에는 '이어서 할 수 없어요')
  await page.click("#downstack-hint");
  await page.waitForFunction(() => document.getElementById("downstack-status")?.textContent?.startsWith("첫 수 ·"));
  assert.equal(await text(page, "downstack-status"), "첫 수 · 오른쪽 3칸, 하드 드롭", "누를 것이 적은 길");
  await page.waitForTimeout(300);
  await page.reload();
  await page.click("#continue-run");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(page, "session-title"), "링크 퍼즐");
  assert.equal(await text(page, "menu-notice"), "");

  // 편집기: 판을 칠한 뒤 이름 칸에서 Ctrl+Z → 판은 그대로(글자 되돌리기만)
  await page.keyboard.press("Escape");
  await page.click('#pause [data-action="menu"]');
  await page.click('[data-confirm="ok"]').catch(() => {});
  await openList(page, "#open-puzzles");
  await page.click("#puzzle-create");
  await page.click('[data-cell="190"]');
  await page.fill("#puzzle-title", "abc");
  await page.focus("#puzzle-title");
  await page.keyboard.press("Control+z");
  assert.equal(await page.locator('[data-cell="190"]').getAttribute("aria-pressed"), "true");
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
    await openList(page, "#open-puzzles");
    await page.click("#puzzle-create");
    const trial = page.locator("#puzzle-trial");
    const share = page.locator("#puzzle-copy");
    assert.ok(await trial.isDisabled());
    await page.fill("#puzzle-desc", "A long sentence explaining the goal and the expected move.");
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
    assert.match(link, /#puzzle=2\./);
    assert.match(link, /_e2|\.e2|-e2|e2\./, "직접 풀어 본 표시");
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
    assert.equal(await text(recipient, "puzzle-goal-hud .goal-value"), "1 row left");
    await recipient.waitForFunction(() => document.body.style.getPropertyValue("--lesson-hud-h"));
    const touchRowFits = () =>
      recipient.locator("#touchpad").evaluate(pad => pad.getBoundingClientRect().bottom <= innerHeight);
    assert.equal(await touchRowFits(), true, "받은 퍼즐을 열면 터치 조작 두 줄이 한 화면 안에 들어간다");
    await recipient.tap("#downstack-hint");
    await recipient.waitForFunction(() =>
      document.getElementById("downstack-status").textContent.startsWith("First move")
    );
    await recipient.waitForFunction(
      () => document.getElementById("touchpad").getBoundingClientRect().bottom <= innerHeight
    );
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
    assert.equal(
      await invalid.locator("#menu-notice").evaluate(notice => {
        const { top, bottom } = notice.getBoundingClientRect();
        return top >= 0 && bottom <= innerHeight;
      }),
      true,
      "깨진 링크 안내는 스크롤하기 전에 보인다"
    );
    const tools = invalid.locator(".home-tools-link");
    assert.equal(await tools.evaluate(link => link.getBoundingClientRect().bottom <= innerHeight), true);
    await tools.tap();
    await invalid.waitForFunction(() => location.hash === "#training-tools-title");
    assert.equal(
      await invalid.locator("#open-puzzles").evaluate(el => el.getBoundingClientRect().bottom <= innerHeight),
      true
    );
    await invalid.evaluate(() => {
      location.hash = "daily=invalid";
    });
    await invalid.waitForFunction(() => {
      const notice = document.getElementById("menu-notice");
      if (!notice.textContent.includes("result code")) return false;
      const { top, bottom } = notice.getBoundingClientRect();
      return top >= 0 && bottom <= innerHeight;
    });
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
    const hardDrop = page.locator('[data-touch="HARD"]');
    for (let i = 0; i < 40 && (await hardDrop.isVisible()); i++) {
      try {
        await hardDrop.tap({ timeout: 1000 });
      } catch (error) {
        if ((await page.evaluate(() => document.body.dataset.screen)) !== "results") throw error;
      }
    }
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
    // 알아볼 수 있는지는 판(10칸) 폭으로 본다 — 옆 홀드·다음 칸 폭은 화면마다 다르다(휴대폰 세로 2칸, 5차 검수 G2).
    // 68px = 예전 기준(캔버스 110px, 16칸 중 10칸)과 같은 판 폭
    const cols = Math.round((board.width / board.height) * 22);
    const field = (board.width * 10) / cols;
    assert.ok(field >= 68 && board.height >= 150, `리플레이 판 ${field}×${board.height}(${cols}칸) · ${where}`);
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
  await openList(page, "#open-puzzles");
  await page.click('[data-puzzle="1"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  for (const key of keysFor(solvePuzzle(PUZZLES[0]))) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-achievements"), "업적 달성 · 판 비우기 장");
  await page.keyboard.press("Escape");
  // 퍼즐을 마치고 나오면 퍼즐 목록이 열린다 → 닫으면 첫 화면
  await page.waitForFunction(() => document.getElementById("puzzles")?.open);
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
  // 블록 순서는 무작위라 막히기까지 피스 수는 판마다 조금 다르다. 짧은 판 기준(20초 안, 줄 0개)에 드는지만 본다
  assert.equal(await text(page, "hud-lines"), "0", "세워서 떨어뜨리기만 하면 줄을 못 지우고 금방 막힌다");
  assert.match(await text(page, "results-stats"), /초당 피스—/);
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

test("규칙 편집: 프리셋으로 채우면 지금 내 규칙을 덮어쓰지만, 되돌리기로 바로 전으로 돌아간다", async () => {
  const { context, page, errors } = await openPage();
  await page.click('[data-rules="custom"]');
  await page.click("#edit-rules");
  assert.equal(await page.locator("#rule-undo").isDisabled(), true, "처음에는 되돌릴 것이 없다");
  await page.locator("#rule-hardDrop").uncheck();
  await page.click('[data-preset="arcade"]');
  assert.equal(await page.locator("#rule-rotation .select-value").textContent(), "ARS");
  assert.match(await page.locator("#rules-record").textContent(), /되돌리기/);
  await page.click("#rule-undo");
  assert.equal(await page.locator("#rule-rotation .select-value").textContent(), "SRS");
  assert.equal(await page.locator("#rule-hardDrop").isChecked(), false, "프리셋 전에 고친 값까지 돌아온다");
  assert.equal(await page.locator("#rule-undo").isDisabled(), true, "한 번만");
  // 프리셋 뒤에 다른 값을 고치면 되돌리기는 꺼진다(고친 것이 사라지지 않게)
  await page.click('[data-preset="retro"]');
  await page.locator("#rule-ghost").check();
  assert.equal(await page.locator("#rule-undo").isDisabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test("하드 드롭 연타로 1~2초 만에 막힌 Sprint: 피스가 10개를 넘어도 짧은 판으로 보고 추천 연습도 띄우지 않는다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await startMode(page, "sprint40");
  for (let i = 0; i < 40 && !(await visible(page, "results")); i++) await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.ok(Number(await text(page, "hud-pieces")) >= 10, "피스는 10개 넘게 놓였다");
  assert.match(await text(page, "results-stats"), /초당 피스—/);
  assert.equal(await page.locator('#results [data-action="export"]').isDisabled(), true);
  assert.equal(await page.locator("#results-practice-scene").isVisible(), false, "추천 연습 없음");
  assert.deepEqual(errors, []);
  await context.close();
});

test("기록 지우기: 데이터 탭에서 두 번 눌러 기록·리플레이·CPU 전적을 지우고, 설정·업적은 남긴다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem(
      "tetrisharp:records",
      JSON.stringify({ "sprint40|modern": [{ frames: 3000, lines: 40, pieces: 100 }] })
    );
    localStorage.setItem("tetrisharp:versus:stats", JSON.stringify({ easy: { win: 3, loss: 1 } }));
    localStorage.setItem("tetrisharp:achievements", JSON.stringify({ "first-line": "2026-11-20" }));
  });
  assert.match(await page.locator('[data-mode="sprint40"] .mode-best').textContent(), /최고 기록/);
  await page.click("#open-settings");
  await page.click('.dialog-tabs [data-value="data"]');
  const clear = page.locator("#clear-records");
  await clear.click();
  assert.match(await page.locator('[data-mode="sprint40"] .mode-best').textContent(), /최고 기록/, "한 번은 그대로");
  await clear.click();
  assert.match(await text(page, "settings-notice"), /지웠어요/);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector('[data-mode="sprint40"] .mode-best')?.textContent === "");
  assert.equal(await page.locator('[data-mode="versus"] .mode-best').textContent(), "");
  assert.match(await text(page, "achievement-progress"), /^1 \//, "업적은 남는다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("키보드: 대화상자는 열면 안으로 포커스가 가고, Esc로 닫으면 연 버튼으로 돌아온다", async () => {
  const { context, page, errors } = await openPage();
  const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset.mode || "");
  for (const [opener, id] of [
    ["open-settings", "settings"],
    ["open-help", "help"],
    ["open-practice", "practice"],
    ["open-puzzles", "puzzles"],
    ["open-records", "records"],
    ["open-achievements", "achievements"],
  ]) {
    await page.focus(`#${opener}`);
    await page.keyboard.press("Enter");
    // 몇몇 대화상자는 그린 다음 차례에 포커스를 옮긴다(느린 CI 기계에서는 바로 재면 아직 밖에 있다)
    await page
      .waitForFunction(d => document.getElementById(d).contains(document.activeElement), id, { timeout: 3000 })
      .catch(async () => assert.fail(`${id} 열기: 포커스 ${await active()}`));
    await page.keyboard.press("Escape");
    await page
      .waitForFunction(o => document.activeElement?.id === o, opener, { timeout: 3000 })
      .catch(async () => assert.fail(`${id} 닫기: 포커스 ${await active()}`));
    assert.equal(await active(), opener);
  }
  // 설정에서 값을 바꿔 다시 그려도 포커스는 같은 조작에 남는다
  await page.focus("#open-settings");
  await page.keyboard.press("Enter");
  await page.focus('#set-handling-preset [data-value="relaxed"]');
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement?.matches('#set-handling-preset [data-value="relaxed"]')),
    true
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 4줄 만들기: 우물을 남기고 앞 피스를 채운 뒤 I로 4줄을 지우면 성공", async () => {
  // 프레임 단위로 누른다: 실제 시간으로 누르면 바쁜 기계에서 키가 길게 눌린 것으로 잡혀(자동 이동) 가끔 엇나갔다
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const first = PUZZLES.find(p => p.kind === "quad");
  await openList(page, "#open-puzzles");
  assert.match(await page.locator("#puzzles").textContent(), /4줄 만들기/);
  await page.click(`[data-puzzle="${first.number}"]`);
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.evaluate(() => window.advanceFrame());
  await runKeys(
    page,
    keysFor(solvePuzzle(first)).map(key => [key, 1])
  );
  await page.waitForFunction(() => !document.getElementById("results")?.hidden, null, { timeout: 3000 });
  assert.equal(await text(page, "results-title"), "성공!");
  assert.deepEqual(errors, []);
  await context.close();
});

/** 키를 누르고 떼며 프레임을 진행한다(실제 시간에 기대지 않게). steps: [키 코드, 누르고 있는 프레임 수] */
const runKeys = (page, steps) =>
  page.evaluate(steps => {
    const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }));
    for (const [code, frames] of steps) {
      key(code, "keydown");
      for (let i = 0; i < frames; i++) window.advanceFrame();
      key(code, "keyup");
      window.advanceFrame();
    }
  }, steps);

/** 퍼즐 목록에서 단계를 열고 한 프레임 진행한다 */
const openPuzzle = async (page, number) => {
  await openList(page, "#open-puzzles");
  await page.click(`[data-puzzle="${number}"]`);
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.evaluate(() => window.advanceFrame());
};

test("본편 퍼즐 목표: 줄 누적을 이어서 복원하고 T스핀 더블은 한 번에 판정한다", async () => {
  const { context, page, errors } = await openPage(
    () =>
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ access: { countdown: "off" }, handling: { sdf: 41 }, visual: { effects: "off" } })
      ),
    undefined,
    { frameClock: true }
  );
  try {
    const start = async (rows, pieces, goal) => {
      const cells = new Uint8Array(PUZZLE_CELLS);
      const terrain = [...rows.join("")].map(cell => Number(cell));
      cells.set(terrain, cells.length - terrain.length);
      await page.goto(`${url}#puzzle=${encodePuzzle({ cells, pieces, goal })}`);
      await page.waitForFunction(() => document.body.dataset.screen === "play");
      await page.evaluate(() => window.advanceFrame());
    };
    const goal = page.locator("#puzzle-goal-hud");
    const layout = async () => {
      const card = await goal.boundingBox();
      const board = await page.locator("#board").boundingBox();
      return { card, board };
    };
    const value = () => goal.locator(".goal-value").textContent();
    const status = () => goal.locator(".goal-status").textContent();
    const filled = () => goal.locator('.goal-mark[data-filled="true"]').count();

    await start(["1110000111", "1110000111"], "II", { kind: "lines", lines: 2 });
    assert.equal(await value(), "0 / 2");
    assert.equal(await filled(), 0);
    const initial = await layout();
    await runKeys(page, [["Space", 1]]);
    assert.equal(await value(), "1 / 2");
    assert.equal(await status(), "진행 중");
    assert.equal(await filled(), 1);
    assert.deepEqual(await layout(), initial);

    await page.click("#pause-game");
    await page.reload();
    assert.ok(await goal.isHidden());
    await page.click("#continue-run");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await value(), "1 / 2");
    await runKeys(page, [["Space", 1]]);
    assert.equal(await value(), "2 / 2");
    assert.equal(await status(), "목표 달성");
    assert.equal(await filled(), 2);
    assert.equal(await goal.evaluate(root => root.getAnimations({ subtree: true }).length), 0);

    await page.click('#results [data-action="retry"]');
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await value(), "0 / 2");
    assert.equal(await status(), "시작 전");

    await page.click("#pause-game");
    await page.click('#pause [data-action="menu"]');
    await page.click('[data-confirm="ok"]');
    await start(["1100001111", "1111000111", "1111101111"], "T", { kind: "tsd" });
    assert.equal(await filled(), 0);
    await runKeys(page, [
      ["ArrowRight", 1],
      ["KeyZ", 1],
      ["ArrowDown", 1],
      ["KeyZ", 1],
    ]);
    assert.equal(await filled(), 0);
    await runKeys(page, [["Space", 1]]);
    assert.equal(await status(), "목표 달성");
    assert.equal(await filled(), 6);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("실패 복기에서 마지막 수를 다시 놓아도 퍼즐 완료는 따로 남긴다", async () => {
  const { page, context, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  try {
    const cells = new Uint8Array(PUZZLE_CELLS);
    cells.set(Array.from("11100001111110000111", Number), PUZZLE_CELLS - 20);
    const code = encodePuzzle({ cells, pieces: "II", goal: { kind: "lines", lines: 2 } });
    await page.goto(`${url}#puzzle=${code}`);
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.evaluate(() => window.advanceFrame());
    await runKeys(page, [
      ["Space", 1],
      ["F24", 10],
      ["ArrowLeft", 1],
      ["Space", 1],
    ]);
    assert.equal(await text(page, "results-title"), "실패");
    await page.click("#results-watch");
    const review = page.locator("#puzzle-review");
    assert.equal(await review.getByRole("img").count(), 2);
    assert.ok(await review.getByText("2줄 목표 중 1줄을 지웠어요.").isVisible());
    await review.getByRole("button", { name: "이 수부터 연습" }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.evaluate(() => window.advanceFrame());
    assert.equal(await text(page, "puzzle-goal-hud .goal-value"), "1 / 2");
    assert.match(await text(page, "session-title"), /마지막 수 연습/);
    assert.equal(await page.evaluate(() => localStorage.getItem("tetrisharp:run:suspended") ?? "null"), "null");
    await runKeys(page, [["Space", 1]]);
    assert.equal(await text(page, "results-title"), "성공!");
    assert.equal(await text(page, "results-main"), "마지막 수 연습");
    await page.click('#results [data-action="menu"]');
    await page.locator("#puzzles[open]").waitFor();
    assert.match(await page.locator("[data-received-play]").textContent(), /아직/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("본편 상황 연출: 높은 판과 벽 차기를 표시하고 판을 낮추면 위험선을 걷는다", async () => {
  const { context, page, errors } = await openPage(
    () => {
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ access: { countdown: "off" }, visual: { effects: "full" } })
      );
      window.situation = { danger: 0, kick: 0 };
      const moveTo = CanvasRenderingContext2D.prototype.moveTo;
      const translate = CanvasRenderingContext2D.prototype.translate;
      CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
        if (this.canvas.id === "board" && y === 2 + 0.87) window.situation.danger++;
        return moveTo.call(this, x, y);
      };
      CanvasRenderingContext2D.prototype.translate = function (x, y) {
        if (this.canvas.id === "board" && x === 5 && this.getTransform().a > 1) window.situation.kick++;
        return translate.call(this, x, y);
      };
    },
    undefined,
    { frameClock: true }
  );
  try {
    const cells = new Uint8Array(PUZZLE_CELLS);
    cells[28] = 1;
    for (let i = cells.length - 40; i < cells.length; i++) cells[i] = Number(i % 10 !== 5);
    const code = encodePuzzle({ cells, pieces: "TI", goal: { kind: "lines", lines: 4 } });
    assert.ok(code);
    await page.goto(`${url}#puzzle=${code}`);
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await runKeys(page, [["F24", 16]]);
    assert.ok((await page.evaluate(() => window.situation.danger)) > 0);
    await runKeys(page, [["ArrowUp", 1], ...Array.from({ length: 4 }, () => ["ArrowLeft", 1]), ["KeyZ", 1]]);
    assert.ok((await page.evaluate(() => window.situation.kick)) > 0);
    await runKeys(page, [
      ["Space", 1],
      ["F24", 10],
      ["ArrowUp", 1],
      ["Space", 1],
      ["F24", 24],
    ]);
    assert.equal(await text(page, "results-title"), "성공!");
    const end = await page.evaluate(() => window.situation.danger);
    await runKeys(page, [["F24", 10]]);
    assert.equal(await page.evaluate(() => window.situation.danger), end);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("본편 연출: 홀드로 꺼낸 T로 두 줄을 지우고 다음 I로 콤보와 퍼펙트 클리어를 완성한다", async () => {
  const { context, page, errors } = await openPage(
    () => {
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ access: { countdown: "off" }, visual: { effects: "full" } })
      );
      window.seenAccents = {};
      const canvas = CanvasRenderingContext2D.prototype;
      const fill = canvas.fillRect;
      const arc = canvas.arc;
      const rect = canvas.rect;
      const text = canvas.fillText;
      canvas.fillRect = function (x, y, w, h) {
        if (this.canvas.id === "board" && y === 2.92) window.seenAccents[x < 1 ? "hold" : "next"] = true;
        return fill.call(this, x, y, w, h);
      };
      canvas.arc = function (...args) {
        if (this.canvas.id === "board" && args[5] === true) window.seenAccents.spin = true;
        return arc.apply(this, args);
      };
      canvas.rect = function (x, y, w, h) {
        if (this.canvas.id === "board" && w > 9 && w < 10 && h > 19 && h < 20) window.seenAccents.perfect = true;
        return rect.call(this, x, y, w, h);
      };
      canvas.fillText = function (...args) {
        if (this.canvas.id === "board" && args[0] === "콤보") window.seenAccents.combo = true;
        return text.apply(this, args);
      };
    },
    undefined,
    { frameClock: true }
  );
  try {
    const cells = new Uint8Array(PUZZLE_CELLS);
    cells.set(
      [..."11....22771112...27711888.8877"].map(value => Number(value !== ".")),
      cells.length - 30
    );
    const code = encodePuzzle({
      cells,
      pieces: "ZIOS",
      holdStart: "T",
      rules: { ...DEFAULT_RULES, hold: { enabled: true } },
    });
    assert.ok(code);
    await page.goto(`${url}#puzzle=${code}`);
    await page.waitForFunction(() => document.body.dataset.screen === "play");
    await page.evaluate(() => window.advanceFrame());
    await runKeys(page, [
      ["KeyC", 1],
      ["ArrowRight", 1],
      ["KeyZ", 1],
      ["ArrowDown", 70],
      ["KeyZ", 1],
      ["Space", 1],
      ["F24", 20],
      ["ArrowLeft", 1],
      ["Space", 1],
      ["F24", 30],
    ]);
    assert.equal(await text(page, "results-title"), "성공!");
    assert.deepEqual(await page.evaluate(() => window.seenAccents), {
      next: true,
      hold: true,
      spin: true,
      combo: true,
      perfect: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("퍼즐 콤보 이어 가기: 줄을 못 지운 피스가 나오면 남은 피스와 상관없이 바로 실패", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const first = PUZZLES.find(p => p.kind === "combo");
  assert.ok(first.pieces.length >= 3);
  await openPuzzle(page, first.number);
  assert.match(await text(page, "mode-objective"), /콤보/);
  // 가운데에 곧장 떨어뜨리면 우물 밖 벽 위에 얹혀 줄을 못 지운다 → 첫 피스에서 실패
  await runKeys(page, [["Space", 1]]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "실패");
  // 퍼즐 결과: "너무 일찍 끝난 판" 안내 없이, 점수·레벨 대신 쓴 피스·깬 단계(4차 평가 F37)
  assert.equal(await text(page, "race-result"), "");
  const stats = await text(page, "results-stats");
  assert.match(stats, /쓴 피스1 \/ \d/);
  assert.match(stats, /깬 단계0 \/ \d+/);
  assert.doesNotMatch(stats, /점수|레벨|순위/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 T-spin Mini: 곧장 떨어뜨리면 실패, 바닥까지 내린 뒤 마지막에 돌려 넣으면 Mini로 성공", async () => {
  const { context, page, errors } = await openPage(
    () => {
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ access: { countdown: "off" }, visual: { effects: "full" } })
      );
      window.spinArcs = 0;
      const arc = CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (this.canvas.id === "board" && args[5] === true) window.spinArcs++;
        return arc.apply(this, args);
      };
    },
    undefined,
    { frameClock: true }
  );
  // 첫 Mini 단계: 오른쪽 벽 아래 한 칸 빈 줄
  const first = PUZZLES.find(p => p.kind === "mini");
  await openPuzzle(page, first.number);
  assert.match(await text(page, "mode-objective"), /Mini/);
  await runKeys(page, [["Space", 1]]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "실패");
  assert.equal(await page.evaluate(() => window.spinArcs), 0);
  await page.click('#results [data-action="menu"]');
  await openPuzzle(page, first.number);
  // 오른쪽 네 칸 → 바닥까지 소프트 드롭 → 반시계로 돌려 넣고, 그대로 두면(고정 지연) 회전이 마지막 동작으로 남는다
  await runKeys(page, [
    ["ArrowRight", 1],
    ["ArrowRight", 1],
    ["ArrowRight", 1],
    ["ArrowRight", 1],
    ["ArrowDown", 70],
    ["KeyZ", 1],
    ["F24", 60],
  ]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "성공!");
  assert.ok((await page.evaluate(() => window.spinArcs)) > 0, "판정된 T스핀 자리에서 회전선이 그려진다");
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 돌려 넣기: 곧장 떨어뜨리면 틈에 안 들어가고, 바닥까지 내린 뒤 돌려 끼우면 성공", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  // 첫 돌려 넣기 단계: 눕힌 Z, 틈 오른쪽 아래 칸이 위 칸에 가려 곧장은 못 들어간다
  const first = PUZZLES.find(p => p.kind === "spin");
  assert.equal(first.pieces[0], "Z");
  await openPuzzle(page, first.number);
  assert.match(await text(page, "mode-objective"), /돌려 끼워/);
  await runKeys(page, [["Space", 1]]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "실패", "곧장 떨어뜨리면 실패");
  await page.click('#results [data-action="menu"]');
  await openPuzzle(page, first.number);
  // 바닥까지 소프트 드롭 → 반시계 → 오른쪽 → 반시계(벽 차기로 틈에 끼워진다) → 하드 드롭
  await runKeys(page, [
    ["ArrowDown", 70],
    ["KeyZ", 1],
    ["ArrowRight", 1],
    ["KeyZ", 1],
    ["Space", 1],
  ]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "성공!");
  assert.deepEqual(errors, []);
  await context.close();
});

test("휴대폰 제스처로 밀어 넣기: 옆으로 한 칸 → 끌어내려 소프트 드롭 → 멈춘 채 한 칸 반 옆으로 밀면 정확히 한 칸 들어가고, 튕겨 내리면 성공", async () => {
  const { context, page, errors } = await openPage(
    () =>
      localStorage.setItem(
        "tetrisharp:settings",
        JSON.stringify({ touch: "on", touchMode: "gestures", access: { countdown: "off" } })
      ),
    undefined,
    { frameClock: true, viewport: { width: 390, height: 844 }, hasTouch: true }
  );
  await openList(page, "#open-practice");
  await page.click('[data-drill="gesture-training"]');
  await page.click('[data-practice-stage="gesture-lesson-1"]');
  await page.evaluate(() => window.advanceFrame());
  await runKeys(page, [["KeyA", 1]]);
  assert.equal(await page.locator("body").getAttribute("data-screen"), "play", "터치에서는 제스처로 연습한다");
  const { x, y, width } = await page.locator(".board-wrap").boundingBox();
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: x + width * 0.25, y: y + 80 },
      { id: 2, x: x + width * 0.75, y: y + 80 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.evaluate(() => window.advanceFrame());
  assert.equal(await text(page, "results-title"), "성공!");
  await page.click('#results [data-action="next-puzzle"]');
  assert.equal(await text(page, "session-title"), "손가락을 떼지 않고 밀어 넣기");
  await page.evaluate(() => window.advanceFrame());
  await page.evaluate(() => {
    const wrap = /** @type {HTMLElement} */ (document.querySelector(".board-wrap"));
    const board = /** @type {HTMLElement} */ (document.getElementById("board"));
    const r = board.getBoundingClientRect();
    const cell = r.width / 10;
    let id = 30;
    const fire = (type, x, y) =>
      wrap.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        })
      );
    const frames = n => {
      for (let i = 0; i < n; i++) window.advanceFrame();
    };
    const x0 = r.left + r.width / 2;
    const y0 = r.top + r.height / 3;
    // 1) 옆으로 한 칸 남짓 밀고 떼기 → 오른쪽 한 칸
    fire("pointerdown", x0, y0);
    fire("pointermove", x0 + cell * 0.6, y0);
    fire("pointermove", x0 + cell * 1.2, y0);
    fire("pointerup", x0 + cell * 1.2, y0);
    frames(2);
    // 2) 새 손가락으로 천천히 끌어내려 소프트 드롭(바닥까지), 멈춘 채 왼쪽으로 한 칸 반 → 한 칸만 밀어 넣는다
    id += 1;
    fire("pointerdown", x0, y0);
    for (let i = 1; i <= 4; i++) {
      fire("pointermove", x0 + i, y0 + cell * 0.6 * i);
      frames(3);
    }
    frames(70);
    const y1 = y0 + cell * 2.4;
    fire("pointermove", x0 + 4 - cell * 0.8, y1);
    fire("pointermove", x0 + 4 - cell * 1.6, y1);
    frames(2);
    // 3) 떼면 가로로 바뀌었으니 하드 드롭은 없다(처마 아래로 옮겨졌을 뿐, 중력이 없으니 그대로 떠 있다)
    fire("pointerup", x0 + 4 - cell * 1.6, y1);
    frames(2);
    // 4) 새 손가락으로 아래로 튕겨 하드 드롭 → 처마 아래 빈칸에 들어가 2줄
    id += 1;
    fire("pointerdown", x0, y0);
    for (let i = 1; i <= 4; i++) fire("pointermove", x0, y0 + cell * i);
    fire("pointerup", x0, y0 + cell * 5);
    frames(2);
  });
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "성공!");
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 밀어 넣기: 곧장 떨어뜨리면 처마에 걸리고, 소프트 드롭으로 내린 뒤 옆으로 밀어 넣으면 성공", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  // 첫 밀어 넣기 단계: I 하나, 처마가 빈칸 왼쪽 위를 덮는다
  const first = PUZZLES.find(p => p.kind === "tuck");
  await openPuzzle(page, first.number);
  assert.match(await text(page, "mode-objective"), /밀어 넣어/);
  await runKeys(page, [["Space", 1]]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "실패", "곧장 떨어뜨리면 처마에 걸린다");
  await page.click('#results [data-action="menu"]');
  await openPuzzle(page, first.number);
  // 오른쪽 한 칸 → 소프트 드롭으로 바닥까지(중력 없음: 3프레임에 한 칸) → 왼쪽으로 밀어 처마 아래 → 하드 드롭
  await runKeys(page, [
    ["ArrowRight", 1],
    ["ArrowDown", 70],
    ["ArrowLeft", 1],
    ["Space", 1],
  ]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "성공!");
  assert.deepEqual(errors, []);
  await context.close();
});

test("첫 화면 로고: 여섯 번은 아무 일 없고, 3초 안에 일곱 번이면 숨은 테마·업적이 열린다", async () => {
  const { context, page, errors } = await openPage();
  try {
    const tap = async n => {
      for (let i = 0; i < n; i++) await page.click("#go-home");
    };
    const themeChips = () => page.locator("#set-theme button").count();
    await tap(6);
    assert.equal(await text(page, "menu-notice"), "", "여섯 번은 조용하다");
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    assert.equal(await themeChips(), 20, "아직 숨어 있다");
    await page.click("#settings-close");

    await page.waitForTimeout(3100); // 앞의 여섯 번은 3초가 지나 사라진다
    await tap(6);
    assert.equal(await text(page, "menu-notice"), "");
    await tap(1);
    assert.equal(await text(page, "menu-notice"), "무언가 열렸어요");
    // 휴대폰에서도 바로 보이게 머리글에서 반응한다(로고 애니메이션 + 가운데 한 줄)
    assert.equal(await text(page, "session-title"), "무언가 열렸어요");
    assert.match((await page.locator("#go-home").getAttribute("class")) ?? "", /is-found/);
    assert.equal(await page.locator("#go-home").textContent(), "Tetri#", "로고 글자는 그대로");
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem("tetrisharp:settings") || "{}").visual?.theme),
      "sharp"
    );
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
    assert.equal(await themeChips(), 21);
    assert.equal(await page.locator('#set-theme [data-value="sharp"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".theme-stage-name").textContent(), "샤프");
    await page.click("#settings-close");

    await page.click("#open-achievements");
    assert.match(await page.locator('[data-achievement="secret-sharp"]').textContent(), /샵을 찾았다/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("업적: Custom 규칙 판은 결과에 '플레이 업적만 쌓여요'를 알려 주고, 업적 목록에도 적는다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await page.click('[data-rules="custom"]');
  await startMode(page, "sprint40");
  // 가운데에 계속 떨어뜨려 금방 막힌다
  for (let i = 0; i < 40 && (await page.locator("#results").isHidden()); i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(30);
  }
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-achievements"), "Custom 규칙 판은 플레이 업적만 쌓여요");
  await page.click('#results [data-action="menu"]');
  await page.click("#open-achievements");
  assert.match(await page.locator("#achievements .notice-slot").textContent(), /플레이 업적은 모든 규칙/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("퍼즐 첫 수 보기와 목록으로: 힌트는 자리와 누를 순서를 보이고, 결과의 '퍼즐 목록'은 방금 한 단계에 포커스를 둔 목록을 연다", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const spin = PUZZLES.find(p => p.kind === "spin");
  await openPuzzle(page, spin.number);
  assert.equal(await page.locator("#downstack-hint").isVisible(), true, "퍼즐에도 힌트 단추");
  assert.equal(await page.locator("#downstack-hint .btn-label").textContent(), "첫 수 보기");
  await page.click("#downstack-hint");
  // 첫 수는 화면 밖(Worker)에서 찾는다: 찾는 동안 문구가 먼저 보이고, 찾으면 바뀐다
  await page.waitForFunction(
    () => document.getElementById("downstack-status")?.textContent?.startsWith("첫 수 ·"),
    null,
    {
      polling: 50,
    }
  );
  assert.match(await text(page, "downstack-status"), /^첫 수 · .*반시계 회전/);
  assert.equal(await page.locator("#downstack-hint .btn-label").textContent(), "힌트 숨기기");
  await page.click("#downstack-hint");
  assert.equal(await text(page, "downstack-status"), "", "한 번 더 누르면 숨긴다");
  // 결과에서 "퍼즐 목록" → 목록이 열리고 방금 한 단계에 포커스
  await runKeys(page, [["Space", 1]]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await page.locator('#results [data-action="menu"] .btn-label').textContent(), "퍼즐 목록");
  await page.click('#results [data-action="menu"]');
  // 목록은 클릭 처리가 끝난 뒤에 열린다. 이 판은 그리기 프레임을 멈춰 두었으니 시간 간격으로 기다린다
  await page.waitForFunction(() => document.getElementById("puzzles")?.open, null, { polling: 50 });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-puzzle")), String(spin.number));
  assert.equal(await page.evaluate(() => document.body.dataset.screen), "menu", "목록을 닫으면 첫 화면");
  assert.deepEqual(errors, []);
  await context.close();
});

test("연습 목록으로: 연습 중 일시정지의 '연습 목록으로'는 그 연습 줄에 포커스를 둔 목록을 연다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  await openList(page, "#open-practice");
  await page.click('[data-drill="pc"]');
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('#pause [data-action="menu"] .btn-label').textContent(), "연습 목록으로");
  await page.click('#pause [data-action="menu"]');
  // 진행 중인 판이면 묻는다
  await page.waitForFunction(() => document.getElementById("confirm-title")?.textContent === "연습 목록으로 갈까요?");
  await page.click('[data-confirm="ok"]');
  await page.waitForFunction(() => document.getElementById("practice")?.open);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-drill")), "pc");
  assert.deepEqual(errors, []);
  await context.close();
});

test("단축키: H는 첫 수 보기, 결과에서 N은 다음 단계", async () => {
  const { context, page, errors } = await openPage(
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
    undefined,
    { frameClock: true }
  );
  const first = PUZZLES.find(p => p.kind === "tuck");
  await openPuzzle(page, first.number);
  assert.equal(await page.locator("#downstack-hint kbd[data-key]").textContent(), "H", "단추에 단축키 표시");
  await page.keyboard.press("KeyH");
  // 첫 수는 화면 밖(Worker)에서 찾는다. 이 판은 그리기 프레임을 멈춰 두었으니 시간 간격으로 기다린다
  await page.waitForFunction(
    () => document.getElementById("downstack-status")?.textContent?.startsWith("첫 수 ·"),
    null,
    {
      polling: 50,
    }
  );
  await page.keyboard.press("KeyH");
  assert.equal(await text(page, "downstack-status"), "");
  // 밀어 넣어 성공 → 결과에서 N = 다음 단계
  await runKeys(page, [
    ["ArrowRight", 1],
    ["ArrowDown", 70],
    ["ArrowLeft", 1],
    ["Space", 1],
  ]);
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  assert.equal(await text(page, "results-title"), "성공!");
  assert.equal(await page.locator('#results [data-action="next-puzzle"] kbd[data-key]').textContent(), "N");
  await page.keyboard.press("KeyN");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  assert.match(await text(page, "session-title"), new RegExp(`퍼즐 ${first.number + 1} `));
  assert.deepEqual(errors, []);
  await context.close();
});

test("결과에서 Esc는 퍼즐 목록: 같은 Esc 입력이 방금 연 목록을 닫지 않는다", async () => {
  const { context, page, errors } = await openPage(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const first = PUZZLES.find(p => p.kind === "tuck");
  await openList(page, "#open-puzzles");
  await page.click(`[data-puzzle="${first.number}"]`);
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.getElementById("results")?.hidden);
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("puzzles")?.open);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.getElementById("puzzles")?.open), true, "열린 채로 남는다");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-puzzle")), String(first.number));
  assert.deepEqual(errors, []);
  await context.close();
});
