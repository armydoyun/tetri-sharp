// 게임패드(Gamepad API, 표준 배치). 매 프레임 상태를 읽어 키보드와 같은 버튼 비트로 바꾼다.
// 버튼 배치는 설정에서 바꿀 수 있다(동작마다 2개까지, 한 버튼은 한 동작에만) — 키보드 배치와 같은 규칙.
// 표준 배치 번호: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Back · 9 Start · 10 LS · 11 RS · 12~15 십자키(위·아래·왼·오) · 16 Home
// 왼쪽 스틱(좌우·아래)과 메뉴 이동(A 선택, 십자키 위·아래)은 고정이다.
import { BTN } from "../core/engine.js";
import { ACTIONS, SLOTS } from "./keymap.js";
import { t } from "../i18n/index.js";

export const PAD_BUTTON_COUNT = 17;

export const DEFAULT_PADMAP = Object.freeze({
  LEFT: [14],
  RIGHT: [15],
  SOFT: [13],
  HARD: [12],
  CW: [1],
  CCW: [0, 2],
  R180: [3],
  HOLD: [4, 5],
  RESTART: [8],
  PAUSE: [9],
  UNDO: [],
});

/** 버튼 이름(패드에 적힌 글자). 십자키는 화면에서 화살표 아이콘으로 보여 준다(PAD_ICONS). */
export const PAD_BUTTON_NAMES = Object.freeze([
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "Back",
  "Start",
  "LS",
  "RS",
  t("십자 위"),
  t("십자 아래"),
  t("십자 왼쪽"),
  t("십자 오른쪽"),
  "Home",
]);
export const PAD_ICONS = Object.freeze({ 12: "arrow-up", 13: "arrow-down", 14: "arrow-left", 15: "arrow-right" });

export const padButtonName = i => PAD_BUTTON_NAMES[i] ?? t("버튼 {n}", { n: i });

/** 메뉴에서 쓰는 버튼(고정): A 선택, 십자키 위·아래 이동 */
export const PAD_MENU = Object.freeze({ 0: "select", 12: "up", 13: "down" });

const isButton = i => Number.isInteger(i) && i >= 0 && i < PAD_BUTTON_COUNT;

/** 저장된 배치를 믿지 않고 다시 만든다: 잘못된 번호·중복은 버리고, 빠진 동작은 기본값(겹치지 않는 것만). */
export const sanitizePadmap = raw => {
  const src = raw && typeof raw === "object" ? raw : DEFAULT_PADMAP;
  const used = new Set();
  /** @type {Record<string, number[]>} */
  const out = {};
  for (const { id } of ACTIONS) {
    out[id] = [];
    for (const i of Array.isArray(src[id]) ? src[id] : []) {
      if (out[id].length >= SLOTS) break;
      if (isButton(i) && !used.has(i)) {
        used.add(i);
        out[id].push(i);
      }
    }
  }
  for (const { id } of ACTIONS) {
    if (Array.isArray(src[id])) continue;
    out[id] = DEFAULT_PADMAP[id].filter(i => !used.has(i));
    for (const i of out[id]) used.add(i);
  }
  return out;
};

/** action의 slot에 버튼을 넣는다. 다른 동작에 있던 같은 버튼은 빼낸다. */
export const assignPadButton = (padmap, actionId, slot, button) => {
  if (!isButton(button)) return { padmap, movedFrom: null };
  let movedFrom = null;
  /** @type {Record<string, number[]>} */
  const next = {};
  for (const [id, list] of Object.entries(padmap)) {
    if (id !== actionId && list.includes(button)) movedFrom = id;
    next[id] = list.filter(i => i !== button);
  }
  const list = [...(next[actionId] ?? [])];
  const at = Math.min(slot, list.length);
  if (at < list.length) list[at] = button;
  else list.push(button);
  next[actionId] = list.slice(0, SLOTS);
  return { padmap: next, movedFrom };
};

export const clearPadButton = (padmap, actionId, slot) => ({
  ...padmap,
  [actionId]: (padmap[actionId] ?? []).filter((_, i) => i !== slot),
});

/** 읽기용으로 바꾼다: 버튼 번호 → 게임 비트 / 시스템 동작 */
export const compilePadmap = padmap => {
  /** @type {Record<number, number>} */
  const buttons = {};
  /** @type {Record<number, "restart" | "pause" | "undo">} */
  const system = {};
  for (const action of ACTIONS) {
    for (const i of padmap[action.id] ?? []) {
      if (action.bit) buttons[i] = action.bit;
      else if (action.system) system[i] = action.system;
    }
  }
  return { buttons, system };
};

const DEFAULT_COMPILED = compilePadmap(DEFAULT_PADMAP);
const DEADZONE = 0.5;
const isDown = b => Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b));

/** 눌린 버튼 번호들 */
export const pressedButtons = pad => {
  const out = [];
  if (!pad) return out;
  for (let i = 0; i < pad.buttons.length; i++) if (isDown(pad.buttons[i])) out.push(i);
  return out;
};

/**
 * 패드 하나의 상태 → { held, system: Set, menu: Set }
 * @param {{ buttons: ArrayLike<any>, axes?: ArrayLike<number> } | null} pad
 */
export const readPad = (pad, compiled = DEFAULT_COMPILED) => {
  let held = 0;
  const system = new Set();
  const menu = new Set();
  if (!pad) return { held, system, menu };
  for (const i of pressedButtons(pad)) {
    held |= compiled.buttons[i] || 0;
    if (compiled.system[i]) system.add(compiled.system[i]);
    if (PAD_MENU[i]) menu.add(PAD_MENU[i]);
  }
  const [ax = 0, ay = 0] = Array.from(pad.axes ?? []);
  if (ax < -DEADZONE) held |= BTN.LEFT;
  if (ax > DEADZONE) held |= BTN.RIGHT;
  if (ay > DEADZONE) {
    held |= BTN.SOFT;
    menu.add("down");
  }
  if (ay < -DEADZONE) menu.add("up");
  return { held, system, menu };
};

/** 연결된 패드 목록(접근이 막혀 있으면 빈 목록) */
export const connectedPads = () => {
  try {
    return [...(navigator.getGamepads?.() ?? [])].filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * 연결된 모든 패드를 합쳐 읽는다. 시스템·메뉴 버튼은 새로 눌린 순간에만 알린다.
 * @param {{ onSystem: (action: string) => void, onMenu: (action: string) => void, getMap?: () => ReturnType<typeof compilePadmap> }} options
 */
export const createGamepad = ({ onSystem, onMenu, getMap = () => DEFAULT_COMPILED }) => {
  let held = 0;
  let prevSystem = new Set();
  let prevMenu = new Set();
  let connected = 0;
  return {
    get held() {
      return held;
    },
    get connected() {
      return connected;
    },
    poll() {
      const list = connectedPads();
      connected = list.length;
      held = 0;
      const system = new Set();
      const menu = new Set();
      const compiled = getMap();
      for (const pad of list) {
        const r = readPad(pad, compiled);
        held |= r.held;
        r.system.forEach(a => system.add(a));
        r.menu.forEach(a => menu.add(a));
      }
      for (const a of system) if (!prevSystem.has(a)) onSystem(a);
      for (const a of menu) if (!prevMenu.has(a)) onMenu(a);
      prevSystem = system;
      prevMenu = menu;
    },
  };
};
