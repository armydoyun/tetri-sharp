// 키 배치 모델. e.code(물리 키 위치) 기준이라 한글 입력 상태나 자판 배열과 상관없이 같은 키로 동작한다.
// 저장 형식: { 동작 id: [키 코드, 키 코드] } — 동작마다 최대 SLOTS개, 한 키는 한 동작에만.
import { BTN } from "../core/engine.js";
import { t } from "../i18n/index.js";

export const SLOTS = 2;

/** @type {ReadonlyArray<{ id: string, label: string, bit?: number, system?: "restart" | "pause" | "undo" }>} */
export const ACTIONS = Object.freeze([
  { id: "LEFT", label: t("왼쪽 이동"), bit: BTN.LEFT },
  { id: "RIGHT", label: t("오른쪽 이동"), bit: BTN.RIGHT },
  { id: "SOFT", label: t("소프트 드롭"), bit: BTN.SOFT },
  { id: "HARD", label: t("하드 드롭"), bit: BTN.HARD },
  { id: "CW", label: t("시계 방향 회전"), bit: BTN.CW },
  { id: "CCW", label: t("반시계 방향 회전"), bit: BTN.CCW },
  { id: "R180", label: t("180° 회전"), bit: BTN.R180 },
  { id: "HOLD", label: t("홀드"), bit: BTN.HOLD },
  { id: "RESTART", label: t("다시 시작"), system: "restart" },
  { id: "PAUSE", label: t("일시정지"), system: "pause" },
  { id: "UNDO", label: t("되돌리기 (연습)"), system: "undo" },
]);

export const DEFAULT_KEYMAP = Object.freeze({
  LEFT: ["ArrowLeft"],
  RIGHT: ["ArrowRight"],
  SOFT: ["ArrowDown"],
  HARD: ["Space"],
  CW: ["ArrowUp", "KeyX"],
  CCW: ["KeyZ", "ControlLeft"],
  R180: ["KeyA"],
  HOLD: ["KeyC", "ShiftLeft"],
  RESTART: ["KeyR"],
  PAUSE: ["KeyP"],
  UNDO: ["KeyU"],
});

/** 바꿀 수 없는 키: Esc는 언제나 일시정지/뒤로. */
export const RESERVED = Object.freeze(["Escape"]);

const isCode = c => typeof c === "string" && /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(c) && !RESERVED.includes(c);

/**
 * 저장된 값을 믿지 않고 다시 만든다: 모르는 동작·잘못된 코드·중복 키는 버리고, 빠진 동작은 기본값(겹치지 않는 키만).
 * @returns {Record<string, string[]>}
 */
export const sanitizeKeymap = raw => {
  const src = raw && typeof raw === "object" ? raw : DEFAULT_KEYMAP;
  const used = new Set();
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const { id } of ACTIONS) {
    out[id] = [];
    for (const c of Array.isArray(src[id]) ? src[id] : []) {
      if (out[id].length >= SLOTS) break;
      if (isCode(c) && !used.has(c)) {
        used.add(c);
        out[id].push(c);
      }
    }
  }
  for (const { id } of ACTIONS) {
    if (Array.isArray(src[id])) continue;
    out[id] = DEFAULT_KEYMAP[id].filter(c => !used.has(c));
    for (const c of out[id]) used.add(c);
  }
  return out;
};

/**
 * action의 slot에 code를 넣는다. 다른 동작에 있던 같은 키는 빼낸다.
 * @returns {{ keymap: Record<string, string[]>, movedFrom: string | null }}
 */
export const assignKey = (keymap, actionId, slot, code) => {
  if (!isCode(code)) return { keymap, movedFrom: null };
  let movedFrom = null;
  /** @type {Record<string, string[]>} */
  const next = {};
  for (const [id, codes] of Object.entries(keymap)) {
    if (id !== actionId && codes.includes(code)) movedFrom = id;
    next[id] = codes.filter(c => c !== code);
  }
  const list = [...(next[actionId] ?? [])];
  const at = Math.min(slot, list.length);
  // 같은 동작 안에서 자리만 바꾼 경우 이미 빠졌으므로 그 자리에 넣는다.
  if (at < list.length) list[at] = code;
  else list.push(code);
  next[actionId] = list.slice(0, SLOTS);
  return { keymap: next, movedFrom };
};

export const clearKey = (keymap, actionId, slot) => ({
  ...keymap,
  [actionId]: (keymap[actionId] ?? []).filter((_, i) => i !== slot),
});

/**
 * 키 이벤트 처리용으로 바꾼다.
 * @returns {{ buttons: Record<string, number>, system: Record<string, "restart" | "pause" | "undo"> }}
 */
export const compileKeymap = keymap => {
  /** @type {Record<string, number>} */
  const buttons = {};
  /** @type {Record<string, "restart" | "pause" | "undo">} */
  const system = { Escape: "pause" };
  for (const action of ACTIONS) {
    for (const code of keymap[action.id] ?? []) {
      if (action.bit) buttons[code] = action.bit;
      else if (action.system) system[code] = action.system;
    }
  }
  return { buttons, system };
};

/** 화살표 키는 글자 기호 대신 SVG 아이콘으로 보여 준다(js/ui/keycap.js). 이름은 글로 쓸 때(알림 문구·화면 읽기)용. */
export const KEY_ICONS = Object.freeze({
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
  ArrowUp: "arrow-up",
  ArrowDown: "arrow-down",
});

const NAMED = {
  ArrowLeft: t("왼쪽 화살표"),
  ArrowRight: t("오른쪽 화살표"),
  ArrowUp: t("위쪽 화살표"),
  ArrowDown: t("아래쪽 화살표"),
  Space: "Space",
  ShiftLeft: "L Shift",
  ShiftRight: "R Shift",
  ControlLeft: "L Ctrl",
  ControlRight: "R Ctrl",
  AltLeft: "L Alt",
  AltRight: "R Alt",
  MetaLeft: "L Meta",
  MetaRight: "R Meta",
  Enter: "Enter",
  Backspace: "Backspace",
  Tab: "Tab",
  Escape: "Esc",
  Slash: "/",
  Period: ".",
  Comma: ",",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

/** 화면 표시용 키 이름 */
export const keyLabel = code => {
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
};
