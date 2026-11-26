/* global document, KeyboardEvent, window */
// 한 파일짜리 배포본을 임시 폴더에 만들고, 그 파일 하나만 제공하는 서버에서 실제 Chromium으로 연다.
// 다른 요청은 모두 막는다 → 번들이 외부 파일 없이 혼자 도는지 확인한다.
import { after, before } from "node:test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "../../tools/build.mjs";
import { launchOptions } from "./browser.mjs";

/** 실제 배포본 하나를 각 브라우저 테스트 파일에 제공한다. */
export const useBuiltGame = () => {
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

  return {
    openPage,
    get dir() {
      return dir;
    },
    get html() {
      return html;
    },
    get result() {
      return result;
    },
    get browser() {
      return browser;
    },
    get url() {
      return url;
    },
  };
};

/** 직접 만든 드롭다운(js/ui/select.js)에서 값을 고른다 */
export const choose = async (page, id, value) => {
  await page.click(`#${id}`);
  await page.click(`#${id}-list [data-value="${value}"]`);
};

export const text = (page, id) => page.locator(`#${id}`).textContent();

export const visible = (page, id) => page.locator(`#${id}`).isVisible();

export const playReplayFrames = (page, inputs, from, to, delay = 0, topOut = false) =>
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

/**
 * 첫 화면에서 퍼즐·연습 목록을 연다. 퍼즐·연습을 마치고 나오면 그 목록이 이미 열려 있으므로(목록으로 돌아가기)
 * 열려 있으면 닫고 첫 화면의 단추로 처음부터 연다.
 */
export const openList = async (page, button) => {
  const dialog = button === "#open-practice" ? "#practice" : "#puzzles";
  // 목록은 키·클릭 처리가 끝난 뒤에 열린다(같은 Esc가 닫지 않게) → 한 박자 기다린 뒤 본다
  await page.waitForTimeout(30);
  if (await page.locator(`${dialog}[open]`).count()) {
    await page.locator(`${dialog}[open]`).evaluate(d => /** @type {HTMLDialogElement} */ (d).close());
  }
  await page.click(button);
};

/** 메뉴에서 모드를 골라 카운트다운이 끝날 때까지 기다린다. */
export const startMode = async (page, id) => {
  await page.click(`[data-mode="${id}"]`);
  await page.waitForFunction(() => document.body.dataset.screen === "play", null, {
    timeout: 3000,
  });
};

// ---- 디자인 시스템: 원칙 2(레이아웃 고정)와 테마 — docs/DESIGN_SYSTEM.md ----

/** 선택자마다 위치·크기(소수점 반올림) */
export const rects = (page, selectors) =>
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
