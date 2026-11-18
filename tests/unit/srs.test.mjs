import { test } from "node:test";
import assert from "node:assert/strict";
import srs from "../../js/rules/rotation/srs.js";
import { PIECE_TYPES } from "../../js/core/pieces.js";

test("모든 90° 회전에 킥 5개, 첫 번째는 제자리", () => {
  for (const type of PIECE_TYPES.filter(t => t !== "O")) {
    for (let from = 0; from < 4; from++) {
      for (const to of [(from + 1) % 4, (from + 3) % 4]) {
        const kicks = srs.kicks(type, from, to);
        assert.equal(kicks.length, 5, `${type} ${from}>${to}`);
        assert.deepEqual(kicks[0], [0, 0]);
      }
    }
  }
});

test("반대 방향 회전의 킥은 서로 부호만 반대", () => {
  for (const type of ["T", "I"]) {
    for (let from = 0; from < 4; from++) {
      const to = (from + 1) % 4;
      const fwd = srs.kicks(type, from, to);
      const back = srs.kicks(type, to, from);
      fwd.forEach(([x, y], i) =>
        assert.deepEqual(
          [-x, -y].map(n => n + 0),
          back[i].map(n => n + 0)
        )
      );
    }
  }
});

test("보드 좌표(y 아래로 증가)로 뒤집혀 있다: T 0>R 세 번째 킥은 왼쪽·위", () => {
  assert.deepEqual(srs.kicks("T", 0, 1)[2], [-1, -1]);
});

test("O는 킥이 없다", () => {
  assert.deepEqual(srs.kicks("O", 0, 1), [[0, 0]]);
});
