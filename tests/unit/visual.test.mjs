import { test } from "node:test";
import assert from "node:assert/strict";
import { createEffects } from "../../js/render/effects.js";
import { PALETTES, SKINS, drawBlock } from "../../js/render/skins.js";
import { sanitizeSettings, sanitizeVisual } from "../../js/storage/settings.js";

const lockEvent = { type: "lock", lines: 2, rows: [38, 39], cells: [[0, 39]], tspin: "full", perfect: false };
const dropEvent = { type: "hardDrop", distance: 10, cells: [[0, 39]] };

test("효과 수준: full은 파편·잔상까지, reduced는 섬광·반짝임만, off는 없음", () => {
  const counts = {};
  for (const level of ["full", "reduced", "off"]) {
    const fx = createEffects();
    fx.add([dropEvent, lockEvent], level, 0);
    counts[level] = fx.count;
  }
  assert.equal(counts.off, 0);
  assert.equal(counts.reduced, 2, "고정 반짝임 + 줄 섬광");
  assert.ok(counts.full > 20, "잔상 + 반짝임 + 섬광 + 줄마다 파편");
});

test("큰 클리어(T-spin)만 화면을 흔들고, reduced에서는 흔들지 않는다", () => {
  const fx = createEffects();
  fx.add([lockEvent], "full", 0);
  const moved = Array.from({ length: 20 }, () => fx.shake(10, 3)).some(o => o.dx || o.dy);
  assert.ok(moved);
  assert.deepEqual(fx.shake(1000, 3), { dx: 0, dy: 0 }, "시간이 지나면 멈춘다");
  const calm = createEffects();
  calm.add([lockEvent], "reduced", 0);
  assert.deepEqual(calm.shake(10, 3), { dx: 0, dy: 0 });
  const small = createEffects();
  small.add([{ ...lockEvent, lines: 1, rows: [39], tspin: "none" }], "full", 0);
  assert.deepEqual(small.shake(10, 3), { dx: 0, dy: 0 }, "싱글은 흔들지 않는다");
});

test("효과는 시간이 지나면 사라진다", () => {
  const fx = createEffects();
  fx.add([dropEvent, lockEvent], "full", 0);
  const fakeCtx = new Proxy(
    {},
    { get: (_, k) => (k === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true }
  );
  fx.draw(fakeCtx, { bx: 0, cell: 10, toY: y => y * 10, cols: 10 }, 5000, "#fff");
  assert.equal(fx.count, 0);
});

test("시각 설정 보정: 모르는 값은 기본값", () => {
  const v = sanitizeVisual({ effects: "loud", skin: "outline", palette: 3 });
  assert.equal(v.skin, "outline");
  assert.ok(["full", "reduced"].includes(v.effects));
  assert.equal(v.palette, "default");
  assert.deepEqual(Object.keys(sanitizeSettings({}).visual).sort(), ["effects", "palette", "skin"]);
});

test("스킨마다 칸을 그리고, 색각 친화 팔레트는 8색이 모두 다르다", () => {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, k) =>
        (...a) =>
          calls.push([k, ...a]),
      set: () => true,
    }
  );
  for (const skin of SKINS) drawBlock(ctx, skin, 0, 0, 20, "#336699");
  assert.ok(calls.filter(c => c[0] === "fillRect").length >= 3);
  assert.ok(
    calls.some(c => c[0] === "strokeRect"),
    "윤곽선 스킨"
  );
  const colors = PALETTES.contrast.slice(1);
  assert.equal(new Set(colors).size, 8);
});
