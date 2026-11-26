import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { botDailyReplay } from "../helpers/daily.mjs";
import { encodeReplayCode } from "../../js/replay/share.js";
import { useBuiltGame, choose, text, visible, startMode, playReplayFrames } from "../helpers/built-game.mjs";

const game = useBuiltGame();
const { openPage } = game;

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
    const context = await game.browser.newContext({ locale, viewport: { width, height }, hasTouch: touch });
    await context.addInitScript(({ replay, record }) => {
      localStorage.setItem("tetrisharp:replay:last", JSON.stringify(replay));
      localStorage.setItem("tetrisharp:records", JSON.stringify({ "sprint40|modern": [record] }));
    }, fixture);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(game.url);
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
    const context = await game.browser.newContext({ locale: "ko-KR", viewport });
    const page = await context.newPage();
    await page.goto(game.url);
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

test("리플레이 링크: #replay= 로 열면 바로 재생하고, '이 기록과 달리기'로 같은 블록 순서로 달린다", async () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/sprint-pb.json", import.meta.url), "utf8"));
  const code = await encodeReplayCode(fixture.replay, "친구");
  const context = await game.browser.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${game.url}#replay=${code}`);
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
    const context = await game.browser.newContext({
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
    await page.goto(game.url);
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

    await page.goto(game.url);
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
