// UI 검수 순회: 화면·대화상자·탭마다 슬라이더를 최솟값·최댓값으로, 선택지·드롭다운 항목을 하나씩 바꿔 가며
// auditInPage()로 문제를 모은다. 브라우저 테스트(tests/browser/ui-audit.test.mjs)와 수동 검수가 함께 쓴다.
import { auditInPage } from "./ui-audit.mjs";

/** @param {import("playwright").Page} page */
export const runScenarios = async (page, { quick = false } = {}) => {
  try {
    return await scenarios(page, quick);
  } catch (e) {
    throw new Error(`${lastStep} 다음에서 멈춤: ${String(e.message).split("\n")[0]}`);
  }
};

let lastStep = "";
const scenarios = async (page, quick) => {
  const found = [];
  const check = async where => {
    lastStep = where;
    await page.waitForTimeout(30);
    for (const p of await page.evaluate(auditInPage)) found.push(`${where} — ${p}`);
  };
  const esc = () => page.keyboard.press("Escape");

  /** 열린 대화상자 안의 모든 슬라이더를 끝값으로 */
  const sliders = async (where, dialogSel) => {
    const ids = await page.$$eval(`${dialogSel} input[type=range]:not(:disabled)`, els => els.map(e => e.id));
    for (const edge of ["max", "min"]) {
      for (const id of ids) {
        await page.$eval(
          `#${id}`,
          (el, e) => {
            el.value = el[e];
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          },
          edge
        );
      }
      await check(`${where} 슬라이더 ${edge}`);
    }
  };
  /** 세그먼트·카드 선택지를 하나씩 눌러 본다 */
  const choices = async (where, dialogSel) => {
    const groups = await page.$$eval(`${dialogSel} .dialog-body :is(.choice, .choice-cards)`, els =>
      els.map(e => e.id).filter(Boolean)
    );
    for (const g of groups) {
      const values = await page.$$eval(`#${g} > button`, els => els.map(e => e.getAttribute("data-value")));
      for (const v of values) {
        if (g === "set-lang") continue; // 언어는 다시 불러온다
        await page.click(`#${g} > [data-value="${v}"]`);
        await check(`${where} ${g}=${v}`);
      }
    }
  };
  /** 드롭다운마다 열어 보고(목록도 검사), 항목을 하나씩 고른다 */
  const dropdowns = async (where, dialogSel) => {
    const ids = await page.$$eval(`${dialogSel} .select:not(:disabled)`, els => els.map(e => e.id));
    for (const id of ids) {
      const values = await page.evaluate(i => {
        document.getElementById(i).click();
        return [...document.querySelectorAll(`#${i}-list [role=option]`)].map(o => o.getAttribute("data-value"));
      }, id);
      await check(`${where} ${id} 목록`);
      await esc();
      for (const v of quick ? values.slice(-1) : values) {
        if (!(await page.$(`#${id}:not(:disabled)`))) break;
        await page.click(`#${id}`);
        await page.click(`#${id}-list [data-value="${v}"]`);
        await check(`${where} ${id}=${v}`);
      }
    }
  };
  /** 스위치를 모두 바꿔 본다 */
  const switches = async (where, dialogSel) => {
    const ids = await page.$$eval(`${dialogSel} .switch:not(:disabled)`, els => els.map(e => e.id));
    for (const id of ids) {
      if (!(await page.$(`#${id}:not(:disabled)`))) continue;
      await page.click(`#${id}`);
      await check(`${where} ${id} 바꿈`);
    }
  };
  const tabs = dialogSel =>
    page.$$eval(`${dialogSel} .dialog-tabs [data-value]`, els => els.map(e => e.getAttribute("data-value")));

  // ---- 첫 화면 ----
  await check("첫 화면");
  for (const r of ["retro", "arcade", "custom", "modern"]) {
    await page.click(`[data-rules="${r}"]`);
    await check(`첫 화면 규칙 ${r}`);
  }
  if (await page.isVisible("#help-title")) {
    await page.click("#help-title");
    await check("첫 화면 조작법 펼침");
    await page.click("#help-title");
  }

  // ---- 설정 ----
  await page.click("#open-settings");
  for (const tab of await tabs("#settings")) {
    await page.click(`#settings .dialog-tabs [data-value="${tab}"]`);
    await check(`설정/${tab}`);
    await sliders(`설정/${tab}`, "#settings");
    await choices(`설정/${tab}`, "#settings");
    if (tab === "keys") {
      await page.click('.key-slot[data-action="HOLD"][data-slot="1"]');
      await check("설정/keys 키 기다림");
      await esc();
    }
  }
  // 설정 초기화는 두 번 눌러 확정한다
  await page.click("#settings-reset");
  await check("설정 초기화 확인 이름");
  await page.click("#settings-reset");
  await esc();

  // ---- Custom 규칙 ----
  await page.click('[data-rules="custom"]');
  await page.click("#edit-rules");
  for (const tab of await tabs("#rules-editor")) {
    await page.click(`#rules-editor .dialog-tabs [data-value="${tab}"]`);
    await check(`규칙/${tab}`);
    const spinDetails = page.locator("#rule-spin-details > summary");
    const hasSpins = await spinDetails.count();
    if (hasSpins) {
      await spinDetails.click();
      await check(`규칙/${tab} 미노별 스핀 펼침`);
    }
    await switches(`규칙/${tab}`, "#rules-editor");
    await sliders(`규칙/${tab}`, "#rules-editor");
    await dropdowns(`규칙/${tab}`, "#rules-editor");
    await switches(`규칙/${tab} 되돌림`, "#rules-editor");
    if (hasSpins) await spinDetails.click();
  }
  for (const p of ["retro", "arcade", "modern"]) {
    await page
      .click(`#rules-editor .rule-presets button:has-text("${p[0].toUpperCase() + p.slice(1)}")`)
      .catch(() => {});
  }
  await esc();
  await page.click('[data-rules="modern"]');

  // ---- 기록 · 연습 · 대전 · 오늘의 도전 ----
  await page.click("#open-records");
  await check("기록");
  await dropdowns("기록", "#records");
  await esc();
  await page.click("#open-practice");
  await check("연습");
  await esc();
  await page.click("#open-daily-puzzle");
  await page.locator("#daily-puzzle-play:enabled").waitFor();
  await check("오늘의 퍼즐");
  await esc();
  await page.click("#open-puzzles");
  await page.click("#puzzle-create");
  await check("퍼즐 만들기");
  for (const tool of ["row", "garbage", "cell"]) {
    await page.click(`#puzzle-tool [data-value="${tool}"]`);
    await check(`퍼즐 만들기 도구=${tool}`);
  }
  for (const id of ["stage-1", "well"]) {
    // 드롭다운은 바깥이 스크롤되면 닫힌다: 열기 단추를 먼저 보이게 하고 스크롤 이벤트가 지나간 뒤 연다
    await page.locator("#puzzle-template").scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    await page.click("#puzzle-template");
    await page.click(`#puzzle-template-list [data-value="${id}"]`);
    await check(`퍼즐 만들기 시작 틀=${id}`);
  }
  for (const h of ["12", "20", "8"]) {
    await page.click(`#puzzle-height [data-value="${h}"]`);
    await check(`퍼즐 만들기 높이=${h}`);
  }
  await page.click("#puzzle-advanced > summary");
  await page.click("#puzzle-spin-details > summary");
  await check("퍼즐 만들기 미노별 스핀 펼침");
  await switches("퍼즐 만들기 미노별 스핀", "#puzzle-spin-details");
  await esc();
  // 퍼즐 목록의 내 퍼즐(방금 편집기가 저장한 퍼즐 한 줄)·받은 퍼즐(빈 목록) 탭
  await page.click("#open-puzzles");
  for (const tab of ["mine", "received", "stages"]) {
    await page.click(`#puzzles .dialog-tabs [data-value="${tab}"]`);
    await check(`퍼즐 목록 ${tab}`);
  }
  await esc();
  if (await page.$('[data-mode="versus"]')) {
    await page.click('[data-mode="versus"]');
    await check("CPU 대전 난이도");
    await esc();
  }
  if (await page.$('[data-mode="daily"]')) {
    await page.click('[data-mode="daily"]');
    await page.waitForTimeout(100);
    await check("오늘의 도전");
    await esc();
  }

  // ---- 게임 화면: 모드마다 계기판, 일시정지, 확인, 결과, 통계 ----
  const modes = await page.$$eval("#mode-list [data-mode]", els =>
    els.map(e => e.getAttribute("data-mode")).filter(m => m !== "versus" && m !== "daily")
  );
  for (const m of quick ? modes.slice(0, 2) : modes) {
    await page.click(`[data-mode="${m}"]`);
    await page.waitForFunction(() => document.body.dataset.screen === "play", null, { timeout: 3000 });
    await check(`게임 ${m}`);
    await esc();
    await check(`게임 ${m} 일시정지`);
    await page.keyboard.press("KeyR");
    await check(`게임 ${m} 다시 시작 확인`);
    await esc();
    await esc();
    for (let i = 0; i < 45 && (await page.evaluate(() => document.getElementById("results").hidden)); i++)
      await page.keyboard.press("Space");
    await page
      .waitForFunction(() => !document.getElementById("results").hidden, null, { timeout: 5000 })
      .catch(() => {});
    await check(`게임 ${m} 결과`);
    if (m === "sprint40") {
      await page.click("#results-splits summary");
      await check(`게임 ${m} 결과 구간 펼침`);
      await page.click('[data-action="stats"]');
      await check("통계");
      await esc();
      await page.click('[data-action="watch"]');
      await page.waitForTimeout(300);
      await check("리플레이");
      await page.click('[data-replay="exit"]');
    }
    await esc();
  }
  // CPU 대전 화면
  if (await page.$('[data-mode="versus"]')) {
    await page.click('[data-mode="versus"]');
    await page.click('#versus [data-level="hard"]');
    await page.waitForFunction(() => document.body.dataset.screen === "play", null, { timeout: 3000 });
    await page.waitForTimeout(1500);
    await check("CPU 대전 게임");
    await esc();
    await page.click('#pause [data-action="menu"]');
    await page.click('[data-confirm="ok"]');
  }
  return [...new Set(found)];
};

/** runScenarios를 돌리고, 도중에 멈추면 어디서 멈췄는지 남긴다 */
export const runScenariosSafe = async (page, options) => {
  try {
    return await runScenarios(page, options);
  } catch (e) {
    return [`검수 중단 — ${String(e.message).split("\n")[0]}`];
  }
};
