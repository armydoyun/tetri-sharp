import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../../js/core/rng.js";
import { PIECE_TYPES } from "../../js/core/pieces.js";
import { createBag7 } from "../../js/rules/randomizer/bag7.js";

test("7개씩 끊으면 매번 7종이 정확히 한 번씩", () => {
  const bag = createBag7(createRng(123));
  for (let round = 0; round < 50; round++) {
    const seven = Array.from({ length: 7 }, () => bag.next());
    assert.deepEqual([...seven].sort(), [...PIECE_TYPES].sort());
  }
});

test("같은 시드는 같은 순서", () => {
  const a = createBag7(createRng(9));
  const b = createBag7(createRng(9));
  for (let i = 0; i < 70; i++) assert.equal(a.next(), b.next());
});
