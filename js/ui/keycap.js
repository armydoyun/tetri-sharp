// 키캡: 키 하나를 작은 키 모양으로 보여 준다. 화살표 키는 SVG 아이콘, 나머지는 짧은 이름.
import { PAD_ICONS, padButtonName } from "../input/gamepad.js";
import { KEY_ICONS, keyLabel } from "../input/keymap.js";
import { icon } from "./icons.js";

const renderKeycap = (label, iconName) => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  if (iconName) kbd.append(icon(iconName, { label }));
  else kbd.textContent = label;
  return kbd;
};

/** @param {string} code  KeyboardEvent.code */
export const keycap = code => renderKeycap(keyLabel(code), KEY_ICONS[code]);

/** @param {number} button  Gamepad API 버튼 번호 */
export const padKeycap = button => renderKeycap(padButtonName(button), PAD_ICONS[button]);
