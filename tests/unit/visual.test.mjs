import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffects } from "../../js/render/effects.js";
import { createSlide } from "../../js/render/motion.js";
import { CONTRAST_PALETTE, DEFAULT_THEME, THEMES, THEME_IDS, findTheme } from "../../js/render/themes.js";
import { sanitizeSettings, sanitizeVisual } from "../../js/storage/settings.js";

const lockEvent = { type: "lock", lines: 2, rows: [38, 39], cells: [[0, 39]], tspin: "full", perfect: false };
const dropEvent = { type: "hardDrop", distance: 10, cells: [[0, 39]] };
/** 무엇이든 받아 주는 가짜 2D 컨텍스트(호출 기록) */
const fakeCtx = (calls = []) =>
  new Proxy(
    {},
    {
      get: (_, k) => (k === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...a) => calls.push([k, ...a])),
      set: () => true,
    }
  );

test("테마 세 가지, 기본은 모던", () => {
  assert.deepEqual([...THEME_IDS].sort(), ["minimal", "modern", "retro"]);
  assert.equal(DEFAULT_THEME, "modern");
  assert.equal(findTheme("없음"), THEMES.modern);
});

test("테마마다 8색이 모두 다르고, 블록·고스트를 그린다", () => {
  for (const theme of Object.values(THEMES)) {
    assert.equal(theme.palette.length, 9, theme.id);
    assert.equal(new Set(theme.palette.slice(1)).size, 8, `${theme.id} 색 중복`);
    const calls = [];
    theme.block(fakeCtx(calls), 0, 0, 30, theme.palette[1]);
    theme.ghost(fakeCtx(calls), 0, 0, 30, theme.palette[1]);
    assert.ok(calls.length > 2, theme.id);
  }
  assert.equal(new Set(CONTRAST_PALETTE.slice(1)).size, 8);
});

test("테마 성격: 레트로는 칸 단위·깜빡임·네모 파편, 미니멀은 연출 최소, 모던은 미끄러짐·퍼지는 빛", () => {
  assert.equal(THEMES.retro.slideMs, 0);
  assert.equal(THEMES.retro.fx.flash, "blink");
  assert.equal(THEMES.retro.fx.particles, "square");
  assert.equal(THEMES.minimal.fx.particles, "none");
  assert.equal(THEMES.minimal.fx.shake, false);
  assert.equal(THEMES.minimal.board.grid, "dots");
  assert.ok(THEMES.modern.slideMs > 0 && THEMES.modern.slideMs <= 80, "짧게");
  assert.equal(THEMES.modern.fx.flash, "sweep");
});

test("효과 수준: full은 테마 연출 전부, reduced는 움직임 없는 것만, off는 없음", () => {
  const count = (level, theme) => {
    const fx = createEffects();
    fx.add([dropEvent, lockEvent], level, 0, theme);
    return fx.count;
  };
  for (const theme of Object.values(THEMES)) assert.equal(count("off", theme), 0, theme.id);
  assert.equal(count("reduced", THEMES.retro), 2, "고정 반짝임 + 줄 섬광");
  assert.ok(count("full", THEMES.retro) > 20, "잔상 + 반짝임 + 섬광 + 파편");
  assert.equal(count("full", THEMES.minimal), 1, "미니멀은 줄 섬광만");
});

test("흔들림은 테마가 허락하고 효과가 전체일 때, 큰 클리어에서만", () => {
  const shaken = (level, theme, ev = lockEvent) => {
    const fx = createEffects();
    fx.add([ev], level, 0, theme);
    return Array.from({ length: 20 }, () => fx.shake(10, 3)).some(o => o.dx || o.dy);
  };
  assert.ok(shaken("full", THEMES.retro));
  assert.equal(shaken("full", THEMES.minimal), false);
  assert.equal(shaken("reduced", THEMES.modern), false);
  assert.equal(shaken("full", THEMES.modern, { ...lockEvent, lines: 1, rows: [39], tspin: "none" }), false);
});

test("효과는 시간이 지나면 사라진다(모든 테마)", () => {
  for (const theme of Object.values(THEMES)) {
    const fx = createEffects();
    fx.add([dropEvent, lockEvent], "full", 0, theme);
    fx.draw(fakeCtx(), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, 5000, theme);
    assert.equal(fx.count, 0, theme.id);
  }
});

test("미끄러짐: 같은 피스는 짧게 따라가고, 새 피스나 0ms는 바로 그 자리", () => {
  const s = createSlide();
  assert.deepEqual(s.at(1, 3, 20, 0, 50), { x: 3, y: 20 }, "처음 나타날 때는 바로");
  s.at(1, 4, 20, 100, 50); // 오른쪽으로 한 칸
  const mid = s.at(1, 4, 20, 125, 50);
  assert.ok(mid.x > 3 && mid.x < 4, `중간 ${mid.x}`);
  assert.deepEqual(s.at(1, 4, 20, 200, 50), { x: 4, y: 20 }, "끝나면 판정 위치");
  assert.deepEqual(s.at(2, 0, 5, 210, 50), { x: 0, y: 5 }, "새 피스는 미끄러지지 않는다");
  s.at(2, 1, 5, 220, 0);
  assert.deepEqual(s.at(2, 1, 5, 221, 0), { x: 1, y: 5 }, "0ms면 칸 단위");
});

test("미끄러지는 중에 또 움직이면 지금 보이는 자리에서 이어서 간다(튀지 않음)", () => {
  const s = createSlide();
  s.at(1, 0, 0, 0, 50);
  s.at(1, 1, 0, 10, 50);
  const before = s.at(1, 1, 0, 30, 50).x;
  const after = s.at(1, 2, 0, 30, 50).x;
  assert.equal(after, before, "방향이 바뀌는 순간 위치가 이어진다");
});

test("시각 설정 보정과 예전 형식 옮기기", () => {
  const v = sanitizeVisual({ effects: "loud", theme: "neon", palette: 3 });
  assert.equal(v.theme, "modern");
  assert.ok(["full", "reduced"].includes(v.effects));
  assert.equal(v.palette, "theme");
  const old = sanitizeVisual({ effects: "off", skin: "outline", palette: "default" });
  assert.deepEqual(old, { theme: "modern", effects: "off", palette: "theme" }, "skin은 버리고 default → theme");
  assert.equal(sanitizeVisual({ palette: "contrast", theme: "retro" }).theme, "retro");
  assert.deepEqual(Object.keys(sanitizeSettings({}).visual).sort(), ["effects", "palette", "theme"]);
});
