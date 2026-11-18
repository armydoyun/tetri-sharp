// 기본 키 배치. e.code(물리 키 위치) 기준이라 한글 입력 상태나 자판 배열과 상관없이 같은 키로 동작한다.
import { BTN } from "../core/engine.js";

export const DEFAULT_KEYMAP = Object.freeze({
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  ArrowDown: BTN.SOFT,
  Space: BTN.HARD,
  ArrowUp: BTN.CW,
  KeyX: BTN.CW,
  KeyZ: BTN.CCW,
  ControlLeft: BTN.CCW,
  KeyA: BTN.R180,
  KeyC: BTN.HOLD,
  ShiftLeft: BTN.HOLD,
});

/** 게임 버튼이 아닌 시스템 키 */
export const SYSTEM_KEYS = Object.freeze({
  Escape: "pause",
  KeyP: "pause",
  KeyR: "restart",
});
