// 첫 화면의 키 안내 줄과, 버튼 안 단축키 표시(kbd[data-key])를 지금 키 배치로 채운다.
import { ACTIONS } from "../input/keymap.js";
import { PAD_ICONS, padButtonName } from "../input/gamepad.js";
import { icon } from "../ui/icons.js";
import { keycap } from "../ui/keycap.js";
import { t } from "../i18n/index.js";

/** 게임패드 버튼 키캡(십자키는 화살표 아이콘) */
const padCap = i => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  if (PAD_ICONS[i]) kbd.append(icon(PAD_ICONS[i], { label: padButtonName(i) }));
  else kbd.textContent = padButtonName(i);
  return kbd;
};

/** 안내 한 칸: 동작 이름 + 키캡들 */
const helpItem = (label, caps) => {
  const span = document.createElement("span");
  const name = document.createElement("span");
  name.className = "keys-label";
  name.textContent = label;
  span.append(name, ...caps);
  return span;
};

const textCap = text => {
  const kbd = document.createElement("kbd");
  kbd.className = "keycap";
  kbd.textContent = text;
  return kbd;
};

/**
 * @param {{
 *   target: HTMLElement,
 *   getSettings: () => any,
 *   getRules: () => any,
 *   padConnected: () => boolean,
 * }} options
 */
export const createKeyHelp = ({ target, getSettings, getRules, padConnected }) => {
  const keysOf = id => getSettings().keymap[id] ?? [];

  /** 키 안내. 지금 규칙에서 쓸 수 없는 동작(하드 드롭·홀드가 꺼진 규칙 등)은 뺀다. 키 이름은 키캡(화살표는 SVG). */
  const render = () => {
    const r = getRules();
    const unavailable = new Set([
      ...(r.hardDrop ? [] : ["HARD"]),
      ...(r.hold.enabled ? [] : ["HOLD"]),
      ...(r.allow180 === false ? ["R180"] : []),
    ]);
    /** @type {Element[]} */
    const items = [icon("keyboard", { label: t("키보드") })];
    for (const a of ACTIONS) {
      if (unavailable.has(a.id) || !keysOf(a.id).length) continue;
      items.push(helpItem(a.label, keysOf(a.id).map(keycap)));
    }
    items.push(helpItem(t("메뉴·일시정지"), [textCap("Esc")]));
    if (padConnected()) {
      const br = document.createElement("span");
      br.className = "keys-break";
      items.push(br, icon("gamepad", { label: t("게임패드") }));
      for (const a of ACTIONS) {
        const buttons = getSettings().padmap[a.id] ?? [];
        if (unavailable.has(a.id) || !buttons.length) continue;
        items.push(helpItem(a.label, buttons.map(padCap)));
      }
    }
    target.replaceChildren(...items);
    // 버튼 안 단축키 표시는 첫 번째 키만
    for (const kbd of document.querySelectorAll("kbd[data-key]")) {
      const first = keysOf(kbd.getAttribute("data-key"))[0];
      kbd.replaceChildren(...(first ? [keycap(first)] : []));
    }
  };

  return { render, keysOf };
};
