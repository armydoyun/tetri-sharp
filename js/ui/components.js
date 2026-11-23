// UI 컴포넌트 — 누르고 고르고 적는 것은 모두 여기서 만든다(docs/DESIGN_SYSTEM.md "컴포넌트").
// 화면 코드는 <button>·<input>을 직접 조립하지 않는다: 구조와 class가 하나로 정해져 있어야
// 아래 턱을 뺀 버튼 면의 가운데 맞춤, 상태가 바뀌어도 크기가 그대로인 약속을 CSS 한 곳에서 지킬 수 있다.
// 정적 HTML(index.html)의 버튼도 같은 구조를 따른다: [아이콘][.btn-label][.btn-meta][kbd].
import { el } from "./dom.js";
import { icon as iconSvg } from "./icons.js";
import { t } from "../i18n/index.js";

export { dropdown } from "./select.js";

/** @typedef {import("./icons.js").IconName} IconName */
/** @typedef {"default" | "primary" | "ghost"} ButtonVariant */
/** @typedef {"m" | "s"} ButtonSize */

/**
 * 버튼 class 이름. 정적 HTML과 같은 이름을 쓰도록 한 곳에서 만든다.
 * @param {{ variant?: ButtonVariant, size?: ButtonSize, wrap?: boolean, iconOnly?: boolean, extra?: string }} o
 */
export const buttonClass = ({ variant = "default", size = "m", wrap = false, iconOnly = false, extra = "" } = {}) =>
  [
    "btn",
    variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "",
    size === "s" ? "btn-small" : "",
    wrap ? "btn-wrap" : "",
    iconOnly ? "btn-icon-only" : "",
    extra,
  ]
    .filter(Boolean)
    .join(" ");

/**
 * 버튼: [아이콘] [이름] [단축키]. 이름이 길 수 있는 곳(좁은 칸·영어)은 wrap으로 줄을 바꾸게 한다.
 * 나머지 속성(id, disabled, title, data-*, aria-*)은 그대로 붙는다.
 * @param {{
 *   label: string,
 *   icon?: IconName,
 *   variant?: ButtonVariant,
 *   size?: ButtonSize,
 *   wrap?: boolean,
 *   kbd?: string,
 *   onClick?: (e: MouseEvent) => void,
 *   class?: string,
 *   [attr: string]: any,
 * }} o
 * @returns {HTMLButtonElement}
 */
export const button = ({ label, icon, variant, size, wrap, kbd, onClick, class: extra, ...attrs }) => {
  const b = el(
    "button",
    { type: "button", ...attrs, class: buttonClass({ variant, size, wrap, extra }) },
    ...(icon ? [iconSvg(icon)] : []),
    el("span", { class: "btn-label", text: label }),
    ...(kbd ? [el("kbd", { text: kbd })] : [])
  );
  if (onClick) b.addEventListener("click", onClick);
  return b;
};

/**
 * 아이콘만 있는 정사각형 버튼(닫기 등). 이름은 화면 읽기 프로그램과 툴팁으로만 보인다.
 * @param {{ icon: IconName, label: string, variant?: ButtonVariant, size?: ButtonSize, onClick?: (e: MouseEvent) => void, class?: string, [attr: string]: any }} o
 * @returns {HTMLButtonElement}
 */
export const iconButton = ({ icon, label, variant = "ghost", size = "s", onClick, class: extra, ...attrs }) => {
  const b = el(
    "button",
    {
      type: "button",
      "aria-label": label,
      title: label,
      ...attrs,
      class: buttonClass({ variant, size, iconOnly: true, extra }),
    },
    iconSvg(icon)
  );
  if (onClick) b.addEventListener("click", onClick);
  return b;
};

/**
 * 세그먼트(짧은 선택지 2~5개). 칸 폭이 같고 고른 칸은 색만 바뀐다(크기·글자 위치 그대로).
 * wrap: 이름이 길면 두 줄로 꺾는 설정 선택지(.choice). 아니면 한 줄 고정(.segmented).
 * 고른 값은 aria-pressed로 표시한다. 값을 밖에서 바꿀 때는 setSegmented()를 쓴다.
 * @param {{
 *   id?: string,
 *   label: string,
 *   options: ReadonlyArray<readonly [string, string]>,
 *   value: string,
 *   onChange: (v: string) => void,
 *   wrap?: boolean,
 *   class?: string,
 *   arrows?: boolean,
 * }} o
 * @returns {HTMLDivElement}
 */
export const segmented = ({ id, label, options, value, onChange, wrap = false, class: extra, arrows = false }) => {
  const group = el("div", {
    class: [wrap ? "choice" : "segmented", extra].filter(Boolean).join(" "),
    role: "group",
    id,
    "aria-label": label,
  });
  group.append(...segmentButtons(options, value, onChange));
  // 탭처럼 쓰는 세그먼트는 좌우 화살표·Home·End로 옮겨 간다
  if (arrows)
    group.addEventListener("keydown", e => {
      const buttons = [...group.querySelectorAll("button")];
      const current = buttons.findIndex(b => b === e.target);
      if (current < 0) return;
      const offset = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? buttons.length - 1
            : offset
              ? (current + offset + buttons.length) % buttons.length
              : -1;
      if (next < 0) return;
      e.preventDefault();
      buttons[next].click();
    });
  return /** @type {HTMLDivElement} */ (group);
};

/**
 * 세그먼트 칸들만 만든다: HTML에 이미 있는 .segmented 틀(#rule-tabs 등)을 채울 때
 * @param {ReadonlyArray<readonly [string, string]>} options
 * @param {string} value
 * @param {(v: string) => void} onChange
 */
export const segmentButtons = (options, value, onChange) =>
  options.map(([v, text]) => {
    const b = el("button", { type: "button", text, "data-value": v, "aria-pressed": String(v === value) });
    b.addEventListener("click", () => onChange(v));
    return b;
  });

/**
 * 목록 줄. 번호가 있으면 [번호 | 이름·설명 | 정보 | >](연습·CPU 난이도),
 * 없으면 [이름·설명 / 정보 | >](첫 화면 모드 목록, .menu-row-stacked). 정보 칸은 비어 있어도 자리를 차지한다.
 * @param {{ index?: number, title: string, desc: string, meta?: string, onClick: () => void, [attr: string]: any }} o
 * @returns {HTMLButtonElement}
 */
export const menuRow = ({ index, title, desc, meta, onClick, ...attrs }) => {
  const b = el(
    "button",
    { type: "button", ...attrs, class: index === undefined ? "menu-row menu-row-stacked" : "menu-row" },
    ...(index === undefined ? [] : [el("span", { class: "menu-index num", text: String(index).padStart(2, "0") })]),
    el("span", { class: "menu-text" }, el("strong", { text: title }), el("small", { text: desc })),
    ...(meta === undefined ? [] : [el("span", { class: "mode-best num", text: meta })]),
    iconSvg("chevron-right")
  );
  b.addEventListener("click", onClick);
  return b;
};

/**
 * 세그먼트의 고른 칸을 바꾼다(다시 그리지 않고 표시만)
 * @param {HTMLElement} group
 * @param {string} value
 */
export const setSegmented = (group, value) => {
  for (const b of group.querySelectorAll(":scope > button"))
    b.setAttribute("aria-pressed", String(/** @type {HTMLElement} */ (b).dataset.value === value));
};

/**
 * 카드형 선택(이름 + 설명이 긴 선택지). 설명은 잘리지 않고 줄바꿈한다.
 * @param {{ id: string, label: string, options: ReadonlyArray<{ value: string, title: string, desc: string, preview?: HTMLElement }>, value: string, onChange: (v: string) => void }} o
 */
export const choiceCards = ({ id, label, options, value, onChange }) => {
  const group = el("div", { class: "choice-cards", role: "group", id, "aria-label": label });
  for (const o of options) {
    const b = el(
      "button",
      { type: "button", class: "choice-card", "data-value": o.value, "aria-pressed": String(o.value === value) },
      ...(o.preview ? [o.preview] : []),
      el("strong", { text: o.title }),
      el("small", { text: o.desc })
    );
    b.addEventListener("click", () => onChange(o.value));
    group.append(b);
  }
  return group;
};

/** 대화상자 탭 줄: 한 줄 세그먼트 + 화살표 이동 */
export const tabBar = ({ tabs, active, onSelect }) =>
  segmented({ id: "dialog-tab", label: t("구역"), options: tabs, value: active, onChange: onSelect, arrows: true });

/**
 * 켜기/끄기 스위치(체크박스를 블록 모양으로). 이름은 fieldRow의 label이 붙인다.
 * @param {{ id?: string, checked?: boolean, disabled?: boolean, onChange?: (on: boolean) => void, [attr: string]: any }} o
 * @returns {HTMLInputElement}
 */
export const toggle = ({ onChange, ...attrs } = {}) => {
  const input = /** @type {HTMLInputElement} */ (
    el("input", { type: "checkbox", ...attrs, class: "switch", role: "switch" })
  );
  if (onChange) input.addEventListener("change", () => onChange(input.checked));
  return input;
};

/** 슬라이더: 채운 만큼을 --fill로 넘겨 칸 모양 막대를 그린다(css .range). 보통 rangeRow로 값과 함께 쓴다. */
export const slider = attrs => {
  const input = /** @type {HTMLInputElement} */ (el("input", { type: "range", ...attrs }));
  const paint = () => {
    const min = Number(input.min);
    const max = Number(input.max);
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--fill", `${pct}%`);
  };
  input.addEventListener("input", paint);
  paint();
  return input;
};

/**
 * 슬라이더 + 값 한 줄. 값 칸 폭은 이 슬라이더가 보일 수 있는 가장 긴 값(최솟값·최댓값·중간값)에 맞춘다
 * → 값이 바뀌어도 막대 길이가 흔들리지 않고, 긴 값("120F · 2000ms")도 잘리지 않는다.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} output
 * @param {(v: number) => string} format
 */
export const rangeRow = (input, output, format) => {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  let longest = 0;
  // 값이 많지 않으니 전부 재 본다(가장 긴 값이 끝값이 아닐 수도 있다: "즉시" 등)
  for (let v = min; v <= max + 1e-9; v += step) longest = Math.max(longest, [...format(v)].length);
  output.dataset.ch = String(longest + 0.5);
  output.style.minWidth = `${longest + 0.5}ch`;
  return el("span", { class: "range" }, input, output);
};

/**
 * 글자 입력 칸(움푹 들어간 칸). 숫자·코드는 num으로 고정폭 숫자를 쓴다.
 * @param {{ num?: boolean, class?: string, [attr: string]: any }} o
 * @returns {HTMLInputElement}
 */
export const textInput = ({ num = false, class: extra, ...attrs } = {}) =>
  /** @type {HTMLInputElement} */ (
    el("input", {
      type: "text",
      ...attrs,
      class: ["text-input", num ? "num" : "", extra].filter(Boolean).join(" "),
    })
  );
