// 키캡: 키 하나를 작은 키 모양으로 보여 준다. 화살표 키는 SVG 아이콘, 나머지는 짧은 이름.
import { KEY_ICONS, keyLabel } from "../input/keymap.js";
import { icon } from "./icons.js";

/** @param {string} code  KeyboardEvent.code */
export const keycap = code => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  const name = KEY_ICONS[code];
  if (name) kbd.append(icon(name, { label: keyLabel(code) }));
  else kbd.textContent = keyLabel(code);
  return kbd;
};

/** 키 여러 개를 나란히(사이에 가는 구분 없이) */
export const keycaps = codes => {
  const frag = document.createDocumentFragment();
  for (const code of codes) frag.append(keycap(code));
  return frag;
};
