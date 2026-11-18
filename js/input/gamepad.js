// 게임패드(Gamepad API, 표준 배치). 매 프레임 상태를 읽어 키보드와 같은 버튼 비트로 바꾼다.
// 표준 배치 번호: 0 A(아래) · 1 B(오른쪽) · 2 X(왼쪽) · 3 Y(위) · 4 LB · 5 RB · 8 Back · 9 Start · 12~15 십자키(위·아래·왼·오)
import { BTN } from "../core/engine.js";

export const PAD_BUTTONS = Object.freeze({
  14: BTN.LEFT,
  15: BTN.RIGHT,
  13: BTN.SOFT,
  12: BTN.HARD,
  0: BTN.CCW,
  1: BTN.CW,
  2: BTN.CCW,
  3: BTN.R180,
  4: BTN.HOLD,
  5: BTN.HOLD,
});

export const PAD_SYSTEM = Object.freeze({ 9: "pause", 8: "restart" });
/** 메뉴에서 쓰는 버튼: A 선택, 십자키 위·아래 이동 */
export const PAD_MENU = Object.freeze({ 0: "select", 12: "up", 13: "down" });

const DEADZONE = 0.5;
const isDown = b => Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b));

/**
 * 패드 하나의 상태 → { held, system: Set, menu: Set }
 * @param {{ buttons: ArrayLike<any>, axes?: ArrayLike<number> } | null} pad
 */
export const readPad = pad => {
  let held = 0;
  const system = new Set();
  const menu = new Set();
  if (!pad) return { held, system, menu };
  for (let i = 0; i < pad.buttons.length; i++) {
    if (!isDown(pad.buttons[i])) continue;
    held |= PAD_BUTTONS[i] || 0;
    if (PAD_SYSTEM[i]) system.add(PAD_SYSTEM[i]);
    if (PAD_MENU[i]) menu.add(PAD_MENU[i]);
  }
  const [ax = 0, ay = 0] = pad.axes ?? [];
  if (ax < -DEADZONE) held |= BTN.LEFT;
  if (ax > DEADZONE) held |= BTN.RIGHT;
  if (ay > DEADZONE) {
    held |= BTN.SOFT;
    menu.add("down");
  }
  if (ay < -DEADZONE) menu.add("up");
  return { held, system, menu };
};

/**
 * 연결된 모든 패드를 합쳐 읽는다. 시스템·메뉴 버튼은 새로 눌린 순간에만 알린다.
 * @param {{ onSystem: (action: string) => void, onMenu: (action: string) => void }} options
 */
export const createGamepad = ({ onSystem, onMenu }) => {
  let held = 0;
  let prevSystem = new Set();
  let prevMenu = new Set();
  let connected = 0;
  const pads = () => {
    try {
      return [...(navigator.getGamepads?.() ?? [])].filter(Boolean);
    } catch {
      return [];
    }
  };
  return {
    get held() {
      return held;
    },
    get connected() {
      return connected;
    },
    poll() {
      const list = pads();
      connected = list.length;
      held = 0;
      const system = new Set();
      const menu = new Set();
      for (const pad of list) {
        const r = readPad(pad);
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
