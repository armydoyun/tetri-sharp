import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../../js/core/rng.js";

test("같은 시드는 같은 수열을 만든다", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test("다른 시드는 다른 수열을 만든다", () => {
  const a = createRng(1);
  const b = createRng(2);
  const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
  assert.ok(same < 20);
});

test("next()는 [0, 1), int(n)은 [0, n) 정수", () => {
  const rng = createRng(7);
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    const k = rng.int(7);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 7);
  }
});
