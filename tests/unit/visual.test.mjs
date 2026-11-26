import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL_ID } from "../../js/core/pieces.js";
import { createEffects } from "../../js/render/effects.js";
import { clearSections } from "../../js/render/clear-sweep.js";
import { createSlide } from "../../js/render/motion.js";
import { CONTRAST_PALETTE, DEFAULT_THEME, THEMES, THEME_IDS, findTheme } from "../../js/render/themes.js";
import { sanitizeSettings, sanitizeVisual } from "../../js/storage/settings.js";
import { CANDIDATES } from "../../js/theme-preview/candidates.js";
import { EXISTING_PREVIEWS } from "../../js/theme-preview/existing.js";

const previewThemes = Object.values(CANDIDATES).map(({ theme }) => theme);
const allThemes = [...Object.values(THEMES), ...previewThemes];

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
const studio = THEMES.modern.motion;
const dropEvent = { type: "hardDrop", distance: 14, cells: lockEvent.cells };
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

test("견본 줄 삭제는 테마별로 다른 형태로 블록을 지우고 행 안에 머문다", () => {
  const signatures = new Set();
  const variants = [...previewThemes, ...Object.values(EXISTING_PREVIEWS).map(({ theme }) => theme)];
  const remaining = sections =>
    sections.reduce(
      (sum, { visible, alpha }) =>
        sum + visible.reduce((area, rect) => area + (rect.right - rect.left) * (rect.bottom - rect.top) * alpha, 0),
      0
    );
  assert.equal(new Set(variants.map(({ motion }) => motion.clearSweep.shape)).size, 10);
  for (const { motion } of variants) {
    const sweep = motion.clearSweep;
    for (const pivot of [null, 0.3]) {
      const area = t => remaining(clearSections(sweep, t * sweep.travel, pivot, 10));
      assert.ok(Math.abs(area(0) - 1) < 1e-8);
      assert.ok(area(0.25) > area(0.75));
      assert.equal(area(1), 0);
    }

    const calls = [];
    const fx = createEffects();
    fx.add([clearEvent], "full", 0, motion);
    fx.draw(fakeCtx(calls), { bx: 0, cell: 16, cols: 10, toY: y => y * 16 }, 70, "#fff", "full");
    const bands = calls.filter(([name]) => name === "fillRect");
    assert.ok(bands.length);
    for (const [, x, y, w, h] of bands) {
      assert.ok(x >= 0 && x + w <= 160.000001);
      assert.ok(y >= 39 * 16 && y + h <= 40 * 16);
    }
    signatures.add(JSON.stringify([sweep.shape, sweep.ink, bands]));
  }
  assert.equal(signatures.size, variants.length);
  const frame = (id, at = 0.32) => clearSections(CANDIDATES[id].theme.motion.clearSweep, at, null, 10);
  assert.equal(frame("tide")[0].visible.length, 2);
  assert.ok(frame("tide")[0].trail[0][0] > 0);
  assert.ok(frame("press")[0].sy < 1);
  assert.ok(frame("porcelain").some(section => section.sx < 1 && section.sy < 1));
  assert.notEqual(frame("film", 0.48)[0].alpha, frame("film", 0.48)[2].alpha);
  assert.ok(frame("ink")[0].alpha < 1);
});

test("기존 테마의 새 연출은 견본 설정에만 붙는다", () => {
  assert.deepEqual(Object.keys(EXISTING_PREVIEWS).sort(), Object.keys(THEMES).sort());
  for (const [id, { theme, reference }] of Object.entries(EXISTING_PREVIEWS)) {
    assert.equal(reference, id);
    assert.equal(theme.palette, THEMES[id].palette);
    assert.ok(theme.motion.clearSweep);
    assert.equal(THEMES[id].motion.clearSweep, undefined);
  }
  assert.equal(EXISTING_PREVIEWS.sharp.theme.motion.clearSweep.crossbars, true);
  assert.equal(THEMES.sharp.motion.clear, "hash");
});

test("테마 아홉 가지, 기본은 모던", () => {
  assert.deepEqual([...THEME_IDS].sort(), [
    "forest",
    "frame",
    "graphite",
    "midnight",
    "minimal",
    "modern",
    "retro",
    "stone",
    "white",
  ]);
  assert.equal(DEFAULT_THEME, "modern");
  assert.equal(findTheme("없음"), THEMES.modern);
});

test("테마마다 8색이 모두 다르고, 블록·고스트를 그린다", () => {
  for (const theme of allThemes) {
    assert.equal(theme.palette.length, 9, theme.id);
    assert.equal(new Set(theme.palette.slice(1)).size, 8, `${theme.id} 색 중복`);
    const calls = [];
    theme.block(fakeCtx(calls), 0, 0, 30, theme.palette[1]);
    theme.ghost(fakeCtx(calls), 0, 0, 30, theme.palette[1]);
    assert.ok(calls.length > 2, theme.id);
  }
  assert.equal(new Set(CONTRAST_PALETTE.slice(1)).size, 8);
});

test("테마마다 보드 색 · 격자·마감·모서리 묶음 · 줄 삭제 모양이 서로 다르다", () => {
  const themes = allThemes;
  assert.equal(new Set(themes.map(theme => theme.board.bg)).size, themes.length);
  assert.equal(
    new Set(themes.map(theme => `${theme.gridStyle}/${theme.finish}/${theme.radius}`)).size,
    themes.length,
    "격자·마감·모서리가 모두 같은 테마는 없다"
  );
  assert.equal(new Set(Object.values(THEMES).map(theme => theme.motion.clear)).size, Object.keys(THEMES).length);
  for (const theme of themes) {
    assert.ok(["lines", "dots", "none", "hash"].includes(theme.gridStyle), theme.name);
    assert.ok(["flat", "inset", "frame"].includes(theme.finish), theme.name);
  }
});

// 상대 휘도·대비(WCAG)와 색 차이(CIE76 ΔE)
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const linear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = hex => {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const lab = hex => {
  const [r, g, b] = channels(hex).map(linear);
  const f = v => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

test("테마 원칙 '명료': 일곱 피스는 보드와 3:1 넘게 대비되고 서로 ΔE 15 넘게 다르다. 쓰레기도 보인다", () => {
  for (const theme of allThemes) {
    const pieces = theme.palette.slice(1, 8);
    for (const [i, color] of pieces.entries())
      assert.ok(contrast(color, theme.board.bg) >= 3, `${theme.name} ${"IJLOSTZ"[i]} 대비`);
    for (let i = 0; i < 7; i++)
      for (let j = i + 1; j < 7; j++)
        assert.ok(deltaE(pieces[i], pieces[j]) >= 15, `${theme.name} ${"IJLOSTZ"[i]}·${"IJLOSTZ"[j]} 구분`);
    assert.ok(contrast(theme.palette[8], theme.board.bg) >= 2.2, `${theme.name} 쓰레기`);
  }
});

test("테마 원칙 '고전 느낌 없이': 블록·고스트에 그라데이션·그림자·빛 번짐을 쓰지 않는다", () => {
  for (const theme of allThemes) {
    const calls = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) =>
            calls.push([name, ...args]),
        set: (_, name) => {
          calls.push([`set:${String(name)}`]);
          return true;
        },
      }
    );
    theme.block(ctx, 0, 0, 30, theme.palette[1]);
    theme.ghost(ctx, 0, 0, 30, theme.palette[1], "strong");
    const names = calls.map(([name]) => name);
    for (const banned of ["createLinearGradient", "createRadialGradient", "set:shadowBlur", "set:shadowColor"])
      assert.ok(!names.includes(banned), `${theme.name}: ${banned}`);
  }
});

test("블록 마감: 단색은 한 번, 안쪽 선(inset)과 프레임은 면 + 선, 고스트는 늘 윤곽선", () => {
  const count = theme => {
    const calls = [];
    theme.block(fakeCtx(calls), 0, 0, 30, theme.palette[1]);
    return calls.filter(([name]) => name === "fill" || name === "stroke").length;
  };
  assert.equal(count(THEMES.modern), 1);
  assert.equal(count(THEMES.stone), 1);
  assert.equal(count(THEMES.frame), 2);
  assert.equal(count(THEMES.minimal), 2, "블루프린트도 안쪽 선");
  const ghost = [];
  THEMES.frame.ghost(fakeCtx(ghost), 0, 0, 30, "#fff");
  assert.deepEqual(
    ghost.filter(([name]) => name === "fill" || name === "stroke").map(([name]) => name),
    ["stroke"]
  );
});

test("새 줄 삭제 모양(번쩍임·훑기·작은 네모·모이기·옅어지기·가라앉기)도 수명이 끝나면 사라진다", () => {
  for (const id of ["graphite", "frame", "stone", "midnight", "forest", "white"]) {
    const { motion } = THEMES[id];
    const fx = createEffects();
    fx.add([clearEvent], "full", 0, motion);
    const calls = [];
    fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, 30, "#fff", "full");
    assert.ok(
      calls.some(([name]) => name === "fillRect"),
      id
    );
    fx.prune(motion.clearMs, "full");
    const after = [];
    fx.draw(fakeCtx(after), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, motion.clearMs, "#fff", "full");
    assert.deepEqual(after, [], id);
  }
});

test("착지한 블록만 열 바닥을 기준으로 눌렸다가 원래 크기로 돌아온다", () => {
  const fx = createEffects();
  const value = CELL_ID.L;
  fx.add([lockEvent], "full", 0, studio);
  assert.deepEqual(fx.landing(0, 38, value, 0), { floor: 40, scale: 1 });
  assert.deepEqual(fx.landing(0, 39, value, 33), { floor: 40, scale: 0.85 });
  assert.deepEqual(fx.landing(1, 38, value, 33), { floor: 39, scale: 0.85 });
  assert.ok(fx.landing(0, 38, value, 100).scale > 1);
  assert.equal(fx.landing(2, 39, value, 33), null);
  assert.equal(fx.landing(0, 39, CELL_ID.O, 29), null);
  assert.equal(fx.landing(0, 39, value, studio.landMs), null);
});

test("줄 삭제·연습 보드 교체·효과 줄임은 낡은 착지 좌표를 버린다", () => {
  const fx = createEffects();
  for (const event of [clearEvent, { type: "practice", success: false }]) {
    fx.add([lockEvent], "full", 0, studio);
    fx.add([event], "full", 16, studio);
    assert.equal(fx.landing(0, 39, CELL_ID.L, 20), null);
  }
  fx.add([lockEvent], "full", 0, studio);
  fx.prune(20, "reduced");
  assert.equal(fx.landing(0, 39, CELL_ID.L, 20), null);
});

test("줄 삭제 표시가 차지하는 범위와 수명은 효과 수준에 따른다", () => {
  const marks = (level, now, percent = 100, motion = studio) => {
    const fx = createEffects();
    const calls = [];
    fx.add([clearEvent], level, 0, motion);
    fx.prune(now, level, percent);
    fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, now, "#fff", level, percent);
    return calls.filter(([name]) => name === "fillRect");
  };
  assert.ok(marks("full", 30)[0][4] > marks("reduced", 30)[0][4]);
  assert.equal(marks("reduced", 30)[0][4], 1.2);
  assert.deepEqual(marks("off", 30), []);
  assert.deepEqual(marks("full", studio.clearMs), []);
  assert.deepEqual(marks("full", 0, 0), []);
  for (const { motion } of [THEMES.retro, THEMES.minimal]) {
    assert.deepEqual(
      marks("full", motion.clearMs / 2, 100, motion),
      marks("full", motion.clearMs * 0.625, 125, motion)
    );
    assert.ok(marks("full", motion.clearMs * 1.25 - 1, 125, motion).length);
    assert.deepEqual(marks("full", motion.clearMs * 1.25, 125, motion), []);
    assert.deepEqual(marks("full", motion.clearMs * 0.75, 75, motion), []);
  }
  assert.deepEqual(marks("reduced", 174, 0), marks("reduced", 174, 150));
  assert.ok(marks("reduced", 174, 0).length);
  assert.deepEqual(marks("reduced", 175, 150), []);
});

test("하드 드롭은 테마마다 다른 압축과 짧은 잔상을 만들고 줄임·끄기에서는 생략한다", () => {
  const samples = [];
  for (const { motion } of Object.values(THEMES)) {
    const fx = createEffects();
    fx.add([dropEvent, lockEvent], "full", 0, motion);
    samples.push(fx.landing(0, 39, CELL_ID.L, motion.landMs * 0.2).scale);

    const geometry = { bx: 0, by: 360, cell: 10, toY: y => y * 10 };
    const calls = [];
    fx.drawDrops(fakeCtx(calls), geometry, 0, "#fff");
    assert.equal(calls.filter(([name]) => name === "fillRect").length, 3);
    const [, , top, , height] = calls.find(([name]) => name === "fillRect");
    assert.equal(height, Math.min(motion.trailCells * 10, 380 - geometry.by));
    assert.ok(top >= geometry.by);

    for (const [now, level] of [
      [motion.trailMs, "full"],
      [20, "reduced"],
      [20, "off"],
    ]) {
      fx.add([dropEvent, lockEvent], "full", 0, motion);
      fx.prune(now, level);
      const after = [];
      fx.drawDrops(fakeCtx(after), geometry, now, "#fff");
      assert.deepEqual(after, []);
    }
  }
  assert.equal(new Set(samples).size, samples.length);
  assert.equal(samples[0], 0.8);
});

test("줄 삭제는 스튜디오에서 가운데로부터, 페이퍼에서 왼쪽부터, 블루프린트에서 두 줄로 그린다", () => {
  const marks = Object.values(THEMES).map(({ motion }) => {
    const fx = createEffects();
    fx.add([clearEvent], "full", 0, motion);
    const calls = [];
    fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, 30, "#fff", "full");
    return calls.filter(([name]) => name === "fillRect");
  });
  assert.ok(marks[0][0][1] > 0);
  assert.equal(marks[1][0][1], 0);
  assert.equal(marks[2].length, 2);
});

test("특수 줄 삭제는 테마별 강조를 그리되 줄임·끄기와 기존 수명을 따른다", () => {
  const quad = { ...lockEvent, lines: 4, rows: [36, 37, 38, 39] };
  const spin = { ...clearEvent, piece: "T", tspin: "full" };
  const mini = { ...spin, tspin: "mini" };
  const chain = { ...quad, b2b: true };
  const draws = (event, motion, level = "full", now = motion.clearMs / 2) => {
    const calls = [];
    const fx = createEffects();
    fx.add([event], level, 0, motion);
    fx.prune(now, level);
    fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: row => row * 10, cols: 10 }, now, "#fff", level);
    return calls;
  };
  for (const { motion } of Object.values(THEMES)) {
    const plain = { ...motion, accent: null };
    assert.deepEqual(draws(clearEvent, motion), draws(clearEvent, plain));
    assert.deepEqual(draws({ ...lockEvent, tspin: "full" }, motion), []);
    for (const event of [quad, spin, mini, chain]) {
      assert.ok(draws(event, motion).length > draws(event, plain).length);
      assert.deepEqual(draws(event, motion, "reduced"), draws(event, plain, "reduced"));
      assert.deepEqual(draws(event, motion, "off"), []);
      assert.deepEqual(draws(event, motion, "full", motion.clearMs), []);
    }
    assert.ok(draws(chain, motion).length > draws(quad, motion).length);
  }
  assert.ok(draws(spin, THEMES.midnight.motion).some(([name]) => name === "arc"));
  assert.ok(draws(spin, THEMES.stone.motion).some(([name]) => name === "lineTo"));
  assert.ok(draws(spin, studio).every(([name]) => name !== "arc" && name !== "lineTo"));
});

test("연속 삭제로 같은 줄이 겹치면 새로운 효과만 남긴다", () => {
  const fx = createEffects();
  fx.add([clearEvent], "full", 0, studio);
  fx.add([clearEvent], "full", 40, studio);
  const calls = [];
  fx.draw(fakeCtx(calls), { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, 75, "#fff", "full");
  assert.equal(calls.filter(([name]) => name === "fillRect").length, 1);
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

test("빠른 이동은 한 칸 이상 뒤처지지 않고 회전·낙하는 즉시 반영한다", () => {
  const s = createSlide();
  s.at(1, 0, 0, 0, 50);
  s.at(1, 1, 0, 10, 50);
  const after = s.at(1, 2, 0, 30, 50).x;
  assert.equal(after, 1);
  assert.deepEqual(s.at(1, 1, 0, 34, 50, 1), { x: 1, y: 0 }, "회전 후 이전 방향의 잔여 이동은 없앤다");
  assert.deepEqual(s.at(1, 1, 1, 37, 50, 1), { x: 1, y: 1 }, "한 칸 낙하도 즉시 그린다");
  s.at(1, 2, 1, 38, 50, 1);
  const before = s.at(1, 2, 1, 48, 50, 1);
  assert.deepEqual(s.at(1, 1, 1, 48, 50, 1), before, "한 칸 안에서 방향을 바꿀 때는 부드럽게 잇는다");
});

test("시각 설정 보정과 예전 형식 옮기기", () => {
  const v = sanitizeVisual({ effects: "loud", theme: "vapor", palette: 3 });
  assert.equal(v.theme, "modern");
  assert.ok(["full", "reduced"].includes(v.effects));
  assert.equal(v.palette, "theme");
  const old = sanitizeVisual({ effects: "off", skin: "outline", palette: "default" });
  assert.deepEqual(
    old,
    {
      theme: "modern",
      effects: "off",
      clearEffectLength: 100,
      palette: "theme",
      pattern: "off",
      ghost: "normal",
      grid: "on",
      inputs: "off",
      colors: {},
    },
    "skin은 버리고 default → theme, 새 항목은 기본값"
  );
  assert.equal(sanitizeVisual({ palette: "contrast", theme: "retro" }).theme, "retro");
  assert.deepEqual(Object.keys(sanitizeSettings({}).visual).sort(), [
    "clearEffectLength",
    "colors",
    "effects",
    "ghost",
    "grid",
    "inputs",
    "palette",
    "pattern",
    "theme",
  ]);
  assert.equal(sanitizeVisual({ clearEffectLength: 0 }).clearEffectLength, 0);
  assert.equal(sanitizeVisual({ clearEffectLength: 200 }).clearEffectLength, 150);
  assert.equal(sanitizeVisual({ clearEffectLength: 73 }).clearEffectLength, 75);
  assert.equal(sanitizeVisual({ clearEffectLength: "invalid" }).clearEffectLength, 100);
  assert.equal(sanitizeVisual({ ghost: "huge", grid: 0, pattern: "on" }).ghost, "normal");
  assert.equal(sanitizeVisual({ pattern: "on" }).pattern, "on");
  assert.deepEqual(sanitizeVisual({ colors: { T: "#AABBCC", I: "red", Q: "#000000" } }).colors, { T: "#aabbcc" });
});
