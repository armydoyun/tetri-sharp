import { test } from "node:test";
import assert from "node:assert/strict";
import { RANK_ORDER, RANK_STEPS, nextRankStep, rankOf } from "../../js/modes/ranks.js";
import { MODES, ZEN, findMode } from "../../js/modes/index.js";

test("랭크: 기준을 넘을 때마다 D → C → B → A → S → S+", () => {
  const sprint = findMode("sprint40");
  const at = seconds => rankOf(sprint, { frames: seconds * 60 });
  assert.equal(at(240), "D", "완주했으면 적어도 D");
  assert.equal(at(180), "C", "기준과 같으면 그 랭크");
  assert.equal(at(119), "B");
  assert.equal(at(80), "A");
  assert.equal(at(50), "S");
  assert.equal(at(30), "S+");
  const ultra = findMode("ultra");
  assert.equal(rankOf(ultra, { score: 9999 }), "D");
  assert.equal(rankOf(ultra, { score: 80000 }), "S+", "점수는 클수록 좋다");
});

test("랭크는 메뉴의 모든 기본 모드에 있고, 기준은 갈수록 어렵다", () => {
  for (const m of MODES) {
    const table = RANK_STEPS[m.id];
    assert.ok(table, m.id);
    assert.equal(table.steps.length, RANK_ORDER.length - 1);
    for (let i = 1; i < table.steps.length; i++) {
      const harder =
        table.better === "lower" ? table.steps[i] < table.steps[i - 1] : table.steps[i] > table.steps[i - 1];
      assert.ok(harder, `${m.id} ${RANK_ORDER[i + 1]}`);
    }
  }
});

test("랭크가 없는 경우: 기록 없음, 이전 규칙 모드", () => {
  assert.equal(rankOf(findMode("sprint40"), null), null);
  assert.equal(rankOf(ZEN, { lines: 500 }), null, "이전 규칙 Endless는 랭크를 매기지 않는다");
});

test("다음 랭크 기준: 지금 랭크의 바로 위, S+면 없다", () => {
  const master = findMode("master");
  assert.deepEqual(nextRankStep(master, { level: 450 }), { rank: "A", value: 600 });
  assert.equal(nextRankStep(master, { level: 999 }), null);
});
