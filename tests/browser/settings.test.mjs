import { test } from "node:test";
import assert from "node:assert/strict";
import { useBuiltGame, text, startMode, rects } from "../helpers/built-game.mjs";

const game = useBuiltGame();
const { openPage } = game;

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
    const context = await game.browser.newContext({
      locale: "ko-KR",
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(game.url);
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

test("줄 삭제 효과 길이: 전체에서만 배율을 바꾸고 0%와 이전 선택을 저장한다", async () => {
  const { context, page, errors } = await openPage();
  const openVisual = async () => {
    await page.click("#open-settings");
    await page.click('.dialog-tabs [data-value="visual"]');
  };
  const slider = page.locator("#set-clear-effect-length");
  const select = mode => page.click(`#set-effects [data-value="${mode}"]`);
  try {
    await openVisual();
    await select("full");
    assert.equal(await slider.inputValue(), "100");
    assert.equal(await page.getByRole("slider", { name: "줄 삭제 효과 길이" }).count(), 1);
    await slider.press("End");
    assert.equal(await slider.inputValue(), "150");
    await slider.press("ArrowLeft");
    assert.equal(await slider.inputValue(), "145");
    for (const mode of ["reduced", "off"]) {
      await select(mode);
      assert.equal(await slider.isDisabled(), true);
    }
    await select("full");
    assert.equal(await slider.isEnabled(), true);
    assert.equal(await slider.inputValue(), "145");
    await slider.press("Home");
    assert.equal(await slider.inputValue(), "0");
    await page.reload();
    await openVisual();
    assert.equal(await slider.inputValue(), "0");
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
    assert.equal(await name.textContent(), "페이퍼", "소리 버튼으로 이동해도 미리보기 유지");
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
    await page.locator("#settings-close").hover();
    assert.equal(await name.textContent(), "스튜디오", "벗어나면 사용 중 테마로");

    // 누르면 적용되고 미리보기도 그 테마(사용 중)
    await card.click();
    assert.equal(await page.locator('#set-theme [data-value="retro"]').getAttribute("aria-pressed"), "true");
    assert.equal(await name.textContent(), "페이퍼");
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

test("게임 테마: 소리 미리보기는 0%에서 안내만 하고 설정 음량으로 재생한다", async () => {
  const { context, page, errors } = await openPage(() => {
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ volume: 0 }));
    window.themeAudio = { contexts: 0, tones: 0, gain: null };
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
        window.themeAudio.tones++;
        return super.createOscillator();
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
    const tones = await page.evaluate(() => window.themeAudio.tones);
    await listen.click();
    assert.ok((await page.evaluate(() => window.themeAudio.tones)) > tones);
    assert.ok(Math.abs((await page.evaluate(() => window.themeAudio.gain.value)) - 0.3 ** 2) < 1e-6);
    await volume.fill("0");
    assert.equal(await page.evaluate(() => window.themeAudio.gain.value), 0);
    const last = await page.evaluate(() => window.themeAudio.tones);
    await listen.click();
    assert.equal(await notice.textContent(), "소리가 꺼져 있어요.");
    assert.equal(await page.evaluate(() => window.themeAudio.tones), last);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
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

test("화면 색: 시스템이 라이트여도 다크를 고르면 첫 화면이 어두워지고, 새로고침 후에도 유지된다", async () => {
  const context = await game.browser.newContext({
    locale: "ko-KR",
    colorScheme: "light",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(game.url);
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

test("게임 중 화면: 기본은 늘 어둡고, '화면 색 따르기'를 고르면 라이트에서 게임 중에도 밝다", async () => {
  const context = await game.browser.newContext({
    locale: "ko-KR",
    colorScheme: "light",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(game.url);
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

test("휴대폰 가로: 설정 대화상자는 탭을 왼쪽 세로로 두고 내용 칸이 높이 대부분을 쓴다", async () => {
  const context = await game.browser.newContext({
    locale: "ko-KR",
    viewport: { width: 750, height: 342 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(game.url);
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
