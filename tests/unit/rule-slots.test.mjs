import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RULE_NAME,
  MAX_RULE_SLOTS,
  RULE_SLOTS_KEY,
  createRuleSlots,
  sanitizeRuleSlots,
} from "../../js/storage/rule-slots.js";
import { createStore, memoryBackend } from "../../js/storage/store.js";
import { PRESETS } from "../../js/rules/presets.js";
import { sanitizeRuleBody } from "../../js/rules/sanitize.js";
import { createBackup, parseBackup } from "../../js/storage/backup.js";
import { findMode } from "../../js/modes/index.js";

const retro = sanitizeRuleBody(PRESETS.retro);
const arcade = sanitizeRuleBody(PRESETS.arcade);

test("내 규칙: 처음에는 기존 Custom 규칙을 '내 규칙 1'로 옮긴다", () => {
  const store = createStore(memoryBackend());
  store.set("customRules", retro);
  const slots = createRuleSlots(store);
  assert.equal(slots.read().slots.length, 1);
  assert.equal(slots.active().name, "내 규칙 1");
  assert.deepEqual(slots.active().body, retro);
});

test("내 규칙: 새 칸은 고른 칸이 되고, 지금 고른 규칙은 이전 키(customRules)에도 같이 적힌다", () => {
  const store = createStore(memoryBackend());
  const slots = createRuleSlots(store);
  assert.equal(slots.add("받은 규칙", arcade), true);
  assert.equal(slots.read().active, 1);
  assert.deepEqual(store.get("customRules", null), arcade, "이전 버전·백업이 읽는 키");
  assert.equal(slots.add("받은 규칙", retro), true);
  assert.equal(slots.active().name, "받은 규칙 2", "이름이 겹치면 번호");
  slots.select(0);
  assert.deepEqual(store.get("customRules", null), slots.read().slots[0].body);
  slots.rename("  내   대회 규칙  ");
  assert.equal(slots.active().name, "내 대회 규칙");
  slots.update(retro);
  assert.deepEqual(slots.active().body, retro);
  assert.equal(slots.remove(), true);
  assert.equal(slots.read().slots.length, 2);
  const longName = "x".repeat(MAX_RULE_NAME);
  assert.equal(slots.add(longName, retro), true);
  assert.equal(slots.add(longName, arcade), true);
  assert.equal(slots.active().name, longName.slice(0, -2) + " 2", "이름 끝의 중복 번호도 저장된다");
});

test("내 규칙: 최대 10개, 마지막 하나는 지우지 않는다", () => {
  const slots = createRuleSlots(createStore(memoryBackend()));
  for (let i = 1; i < MAX_RULE_SLOTS; i++) assert.equal(slots.add(`r${i}`, retro), true);
  assert.equal(slots.add("넘침", retro), false);
  while (slots.read().slots.length > 1) slots.remove();
  assert.equal(slots.remove(), false);
});

test("내 규칙 저장값: 이상한 값은 정리하고, 백업에 담겨 돌아온다", () => {
  assert.equal(sanitizeRuleSlots({ slots: [] }), null);
  const clean = sanitizeRuleSlots({
    slots: [{ name: "", body: { rotation: "nope" } }, { name: "x".repeat(99) }],
    active: 7,
  });
  assert.equal(clean.active, 0, "범위 밖 번호는 0");
  assert.equal(clean.slots[0].name, "내 규칙 1");
  assert.equal(clean.slots[1].name.length, 24);
  const store = createStore(memoryBackend());
  createRuleSlots(store).add("받은 규칙", arcade);
  const parsed = parseBackup(JSON.parse(JSON.stringify(createBackup(store))), findMode);
  assert.equal(parsed.data[RULE_SLOTS_KEY].slots.length, 2);
  assert.equal(parsed.data[RULE_SLOTS_KEY].active, 1);
});
