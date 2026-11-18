import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL_ID } from "../../js/core/pieces.js";
import { createEffects } from "../../js/render/effects.js";
import { createSlide } from "../../js/render/motion.js";
import { CONTRAST_PALETTE, DEFAULT_THEME, THEMES, THEME_IDS, findTheme } from "../../js/render/themes.js";
import { sanitizeSettings, sanitizeVisual } from "../../js/storage/settings.js";

const lockEvent = {
  type: "lock",
  piece: "L",
  lines: 0,
  rows: [],
  cells: [
    [0, 38],
    [0, 39],
    [1, 38],
    [2, 38],
  ],
};
const clearEvent = { ...lockEvent, lines: 1, rows: [39] };
const fakeCtx = (calls = []) =>
  new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) =>
          calls.push([name, ...args]),
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

test("세 테마의 보드 색과 블록 모서리가 서로 다르다", () => {
  const themes = Object.values(THEMES);
  assert.equal(new Set(themes.map(theme => theme.board.bg)).size, 3);
  assert.equal(new Set(themes.map(theme => theme.radius)).size, 3);
});

test("착지한 블록만 열 바닥을 기준으로 눌렸다가 원래 크기로 돌아온다", () => {
  const fx = createEffects();
  const value = CELL_ID.L;
  fx.add([lockEvent], "full", 0);
  assert.deepEqual(fx.landing(0, 38, value, 0), { floor: 40, scale: 1 });
  assert.deepEqual(fx.landing(0, 39, value, 29), { floor: 40, scale: 0.88 });
  assert.deepEqual(fx.landing(1, 38, value, 29), { floor: 39, scale: 0.88 });
  assert.ok(fx.landing(0, 38, value, 85).scale > 0.88);
  assert.equal(fx.landing(2, 39, value, 29), null);
  assert.equal(fx.landing(0, 39, CELL_ID.O, 29), null);
  assert.equal(fx.landing(0, 39, value, 145), null);
});

test("줄 삭제·연습 보드 교체·효과 줄임은 낡은 착지 좌표를 버린다", () => {
  const fx = createEffects();
  for (const event of [clearEvent, { type: "practice", success: false }]) {
    fx.add([lockEvent], "full", 0);
    fx.add([event], "full", 16);
    assert.equal(fx.landing(0, 39, CELL_ID.L, 20), null);
  }
  fx.add([lockEvent], "full", 0);
  fx.prune(20, "reduced");
  assert.equal(fx.landing(0, 39, CELL_ID.L, 20), null);
});

test("줄 삭제 표시가 차지하는 범위와 수명은 효과 수준에 따른다", () => {
  const marks = (level, now) => {
    const fx = createEffects();
    const calls = [];
    fx.add([clearEvent], level, 0);
    fx.prune(now, level);
    fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, now, "#fff", level);
    return calls.filter(([name]) => name === "fillRect");
  };
  assert.ok(marks("full", 30)[0][4] > marks("reduced", 30)[0][4]);
  assert.equal(marks("reduced", 30)[0][4], 1.2);
  assert.deepEqual(marks("off", 30), []);
  assert.deepEqual(marks("full", 175), []);
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
