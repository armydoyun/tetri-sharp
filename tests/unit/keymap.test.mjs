import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  DEFAULT_KEYMAP,
  SLOTS,
  assignKey,
  clearKey,
  compileKeymap,
  keyLabel,
  sanitizeKeymap,
} from "../../js/input/keymap.js";
import { BTN } from "../../js/core/engine.js";

const allCodes = km => Object.values(km).flat();

test("기본 배치는 겹치는 키가 없고 모든 동작에 키가 있다", () => {
  const km = sanitizeKeymap(DEFAULT_KEYMAP);
  assert.deepEqual(km, { ...DEFAULT_KEYMAP });
  const codes = allCodes(km);
  assert.equal(new Set(codes).size, codes.length);
  for (const a of ACTIONS) assert.ok(km[a.id].length > 0, a.id);
});

test("sanitize: 잘못된 값·중복·예약 키·초과 칸을 버리고, 빠진 동작은 기본값", () => {
  const km = sanitizeKeymap({
    LEFT: ["KeyJ", "KeyJ", 42, "Escape", "<script>"],
    RIGHT: ["KeyJ", "KeyL"],
    HARD: ["KeyA", "KeyB", "KeyD"],
    // R180 기본값(KeyA)은 HARD가 이미 쓰므로 빠진다.
  });
  assert.deepEqual(km.LEFT, ["KeyJ"]);
  assert.deepEqual(km.RIGHT, ["KeyL"]);
  assert.equal(km.HARD.length, SLOTS);
  assert.deepEqual(km.SOFT, ["ArrowDown"]);
  assert.deepEqual(km.R180, []);
  const codes = allCodes(km);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(sanitizeKeymap("garbage"), sanitizeKeymap(DEFAULT_KEYMAP));
});

test("assignKey: 다른 동작에 있던 키는 옮겨 오고 어디서 왔는지 알려 준다", () => {
  const { keymap, movedFrom } = assignKey({ ...DEFAULT_KEYMAP }, "HARD", 1, "KeyX");
  assert.equal(movedFrom, "CW");
  assert.deepEqual(keymap.HARD, ["Space", "KeyX"]);
  assert.deepEqual(keymap.CW, ["ArrowUp"]);
});

test("assignKey: 칸을 바꿔 끼우고, Esc는 받지 않는다", () => {
  assert.deepEqual(assignKey({ ...DEFAULT_KEYMAP }, "LEFT", 0, "KeyJ").keymap.LEFT, ["KeyJ"]);
  const same = { ...DEFAULT_KEYMAP };
  assert.equal(assignKey(same, "LEFT", 0, "Escape").keymap, same);
});

test("clearKey는 해당 칸만 비운다", () => {
  assert.deepEqual(clearKey({ ...DEFAULT_KEYMAP }, "CW", 0).CW, ["KeyX"]);
});

test("compileKeymap: 게임 버튼 비트와 시스템 동작, Esc는 항상 일시정지", () => {
  const { buttons, system } = compileKeymap(DEFAULT_KEYMAP);
  assert.equal(buttons.Space, BTN.HARD);
  assert.equal(buttons.KeyX, BTN.CW);
  assert.equal(system.KeyR, "restart");
  assert.equal(system.Escape, "pause");
  assert.equal(buttons.KeyR, undefined);
});

test("keyLabel", () => {
  assert.equal(keyLabel("KeyZ"), "Z");
  assert.equal(keyLabel("Digit3"), "3");
  assert.equal(keyLabel("ArrowLeft"), "왼쪽 화살표");
  assert.equal(keyLabel("ShiftLeft"), "L Shift");
});
