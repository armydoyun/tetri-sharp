import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRules, encodeRules, rulesLink } from "../../js/rules/share.js";
import { ARCADE, MODERN, RETRO } from "../../js/rules/presets.js";
import { makeCustomRules, sanitizeRuleBody } from "../../js/rules/sanitize.js";

test("코드 왕복: 프리셋 내용을 코드로 바꿨다 되돌리면 같은 규칙(같은 기록표)", () => {
  for (const preset of [MODERN, RETRO, ARCADE]) {
    const code = encodeRules(preset);
    assert.match(code, /^TS1-[\w-]+$/);
    const back = decodeRules(code);
    assert.deepEqual(back, sanitizeRuleBody(preset));
    assert.equal(makeCustomRules(back).id, makeCustomRules(preset).id);
  }
});

test("링크에서도 읽는다", () => {
  const link = rulesLink(RETRO, "https://example.github.io/tetri-sharp/?x=1#old");
  assert.match(link, /^https:\/\/example\.github\.io\/tetri-sharp\/\?x=1#rules=/);
  assert.deepEqual(decodeRules(link), sanitizeRuleBody(RETRO));
  assert.deepEqual(decodeRules(`  ${encodeRules(RETRO)}  `), sanitizeRuleBody(RETRO), "앞뒤 공백 허용");
});

test("잘못된 코드는 null, 손으로 고친 값은 허용 범위로 보정", () => {
  for (const bad of ["", "hello", "TS1-", "TS1-@@@", "TS1-bm90IGpzb24", 42, null, `TS1-${"A".repeat(5000)}`]) {
    assert.equal(decodeRules(/** @type {any} */ (bad)), null, String(bad).slice(0, 20));
  }
  const hacked = `TS1-${btoa(JSON.stringify({ previewCount: 99, rotation: "teleport" })).replace(/=+$/, "")}`;
  const body = decodeRules(hacked);
  assert.equal(body.previewCount, 6);
  assert.equal(body.rotation, "srs");
});
