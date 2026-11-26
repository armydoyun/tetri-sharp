import { test } from "node:test";
import assert from "node:assert/strict";
import { keysFor, solvePuzzle } from "../helpers/puzzle-solve.mjs";
import { PUZZLES } from "../../js/modes/puzzles.js";
import { useBuiltGame, choose, text, visible, openList } from "../helpers/built-game.mjs";

const game = useBuiltGame();
const { openPage } = game;

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
  await page.keyboard.press("KeyU");
  await page.waitForFunction(() => document.body.dataset.screen === "play");
  await page.waitForFunction(() => document.getElementById("hud-pieces")?.textContent === "0");
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
  const other = await game.browser.newContext({ locale: "ko-KR" });
  await other.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const recipient = await other.newPage();
  await recipient.goto(link);
  await recipient.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(
    await text(recipient, "mode-objective"),
    "목표 · T-spin Double · 20G · 홀드(처음 I) · 자동 확인으로 풀 수 있는 퍼즐"
  );
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
  const other = await game.browser.newContext({ locale: "ko-KR" });
  await other.addInitScript(() =>
    localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } }))
  );
  const friend = await other.newPage();
  await friend.goto(link);
  await friend.waitForFunction(() => document.body.dataset.screen === "play");
  assert.equal(await text(friend, "session-title"), "첫 퍼즐");
  assert.equal(
    await text(friend, "mode-objective"),
    "목표 · 판 비우기 · 만든 사람이 직접 풀어 봤어요 · 오른쪽을 보세요"
  );
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
  const mobile = await game.browser.newContext({
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
    await invalid.goto(`${game.url}#puzzle=invalid`);
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
    () => localStorage.setItem("tetrisharp:settings", JSON.stringify({ access: { countdown: "off" } })),
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
  const first = PUZZLES.find(p => p.kind === "tuck");
  await openPuzzle(page, first.number);
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
