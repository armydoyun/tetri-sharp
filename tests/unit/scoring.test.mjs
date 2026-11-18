import { test } from "node:test";
import assert from "node:assert/strict";
import { clearName, scoreLock } from "../../js/rules/scoring/guideline.js";

const base = { tspin: "none", b2b: 0, combo: -1, perfect: false, level: 1 };
const score = o => scoreLock({ ...base, ...o });

test("줄 수별 기본 점수 × 레벨", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(lines => score({ lines }).points),
    [0, 100, 300, 500, 800]
  );
  assert.equal(score({ lines: 4, level: 3 }).points, 2400);
});

test("T-spin과 Mini 점수 (줄 안 지워도 점수)", () => {
  assert.equal(score({ lines: 0, tspin: "full" }).points, 400);
  assert.equal(score({ lines: 2, tspin: "full" }).points, 1200);
  assert.equal(score({ lines: 3, tspin: "full" }).points, 1600);
  assert.equal(score({ lines: 0, tspin: "mini" }).points, 100);
  assert.equal(score({ lines: 1, tspin: "mini" }).points, 200);
});

test("B2B: 어려운 클리어가 이어지면 ×1.5, 쉬운 클리어가 끊고, 줄 없는 고정은 그대로", () => {
  const first = score({ lines: 4 });
  assert.equal(first.b2b, 1);
  assert.equal(first.b2bApplied, false);
  const second = score({ lines: 4, b2b: first.b2b });
  assert.equal(second.points, 1200);
  assert.ok(second.b2bApplied);
  assert.equal(score({ lines: 2, tspin: "full", b2b: 2 }).points, 1800);
  assert.equal(score({ lines: 1, b2b: 2 }).b2b, 0, "싱글은 B2B를 끊는다");
  assert.equal(score({ lines: 0, b2b: 2 }).b2b, 2, "줄을 안 지우면 유지");
  assert.equal(score({ lines: 0, tspin: "full", b2b: 2 }).b2b, 2, "줄 없는 T-spin도 유지만");
});

test("콤보: 연속으로 지울 때마다 +50 × 콤보 × 레벨, 안 지우면 끊긴다", () => {
  const c0 = score({ lines: 1 });
  assert.equal(c0.combo, 0);
  assert.equal(c0.points, 100);
  const c1 = score({ lines: 1, combo: c0.combo });
  assert.equal(c1.combo, 1);
  assert.equal(c1.points, 150);
  assert.equal(score({ lines: 1, combo: 3, level: 2 }).points, 200 + 50 * 4 * 2);
  assert.equal(score({ lines: 0, combo: 5 }).combo, -1);
});

test("퍼펙트 클리어 보너스", () => {
  assert.equal(score({ lines: 1, perfect: true }).points, 100 + 800);
  assert.equal(score({ lines: 4, perfect: true }).points, 800 + 2000);
  assert.equal(score({ lines: 4, perfect: true, b2b: 1 }).points, 1200 + 3200);
});

test("화면 이름", () => {
  assert.equal(clearName({ lines: 2, tspin: "full" }), "T-SPIN DOUBLE");
  assert.equal(clearName({ lines: 0, tspin: "mini" }), "MINI T-SPIN");
  assert.equal(clearName({ lines: 4, tspin: "none" }), "QUAD");
});
