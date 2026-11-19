// 작은 DOM 도우미와 대화상자 틀. 설정·규칙 편집이 같은 모양(머리·몸통·발)을 쓴다.
import { icon } from "./icons.js";
import { t } from "../i18n/index.js";

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [attrs]  class·text는 특별 취급, data-·aria-는 속성, 나머지는 프로퍼티
 * @param {...(Node | string)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role") node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children);
  return node;
};

/**
 * 아이콘 + 글자 버튼
 * @param {{ text?: string, iconName?: import("./icons.js").IconName, className?: string, [attr: string]: any }} options
 */
export const button = ({ text, iconName, className = "btn", ...attrs }) =>
  el("button", { type: "button", class: className, ...attrs }, ...(iconName ? [icon(iconName)] : []), text ?? "");

/**
 * 대화상자 내용을 [머리(제목·닫기) | 몸통 | 발(알림 칸·버튼)]으로 채운다.
 * 알림 칸(.notice-slot)은 늘 두 줄 자리를 차지해 글이 생겨도 버튼이 움직이지 않는다.
 * @param {HTMLDialogElement} dialog
 * @param {{ title: string, body: HTMLElement, notice: HTMLElement, actions: HTMLElement[], closeId: string, tabs?: HTMLElement | null }} parts
 */
export const fillDialog = (dialog, { title, body, notice, actions, closeId, tabs = null }) => {
  const close = el(
    "button",
    { type: "button", class: "btn btn-ghost btn-small", "aria-label": t("닫기") },
    icon("close")
  );
  close.addEventListener("click", () => dialog.close());
  const done = button({ text: t("닫기"), className: "btn btn-primary", id: closeId });
  done.addEventListener("click", () => dialog.close());
  body.classList.add("dialog-body");
  dialog.classList.toggle("dialog-tabbed", Boolean(tabs));
  // 같은 구역의 슬라이더는 값 칸 폭을 가장 긴 것에 맞춘다 → 막대 끝이 줄마다 나란하다
  for (const section of body.querySelectorAll(".field-section")) {
    /** @type {HTMLElement[]} */
    const outs = [...section.querySelectorAll(".range output[data-ch]")].map(o => /** @type {HTMLElement} */ (o));
    const widest = Math.max(0, ...outs.map(o => Number(o.dataset.ch)));
    for (const o of outs) o.style.minWidth = `${widest}ch`;
  }
  dialog.replaceChildren(
    el("header", { class: "dialog-head" }, el("h2", { class: "dialog-title", text: title }), close),
    ...(tabs ? [el("div", { class: "dialog-tabs" }, tabs)] : []),
    body,
    el("footer", { class: "dialog-foot" }, notice, ...actions, done)
  );
};

/**
 * 설정 한 줄: [이름 + 설명 줄 | 조작]. 설명 줄은 비어 있어도 자리를 차지한다.
 * @param {{ id: string, label: string, hint?: string, control: HTMLElement, disabled?: boolean, className?: string }} o
 */
export const fieldRow = ({ id, label, hint, control, disabled = false, className = "" }) =>
  el(
    "div",
    { class: `field-row${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}` },
    el(
      "label",
      { class: "field-label", htmlFor: id },
      el("strong", { text: label }),
      // 줄 높이를 지키려고 빈 설명도 공백 한 칸으로 남긴다.
      ...(hint === undefined ? [] : [el("small", { text: hint || " " })])
    ),
    control
  );

/**
 * 세그먼트 선택(짧은 선택지 2~4개). 칸 폭이 같고 고른 칸은 색만 바뀐다.
 * @param {{ id: string, label: string, options: ReadonlyArray<[string, string]>, value: string, onChange: (v: string) => void, className?: string }} o
 */
export const choice = ({ id, label, options, value, onChange, className = "choice" }) => {
  const group = el("div", { class: className, role: "group", id, "aria-label": label });
  for (const [v, text] of options) {
    const b = el("button", { type: "button", text, "data-value": v, "aria-pressed": String(v === value) });
    b.addEventListener("click", () => onChange(v));
    group.append(b);
  }
  return group;
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

/** 슬라이더: 채운 만큼을 --fill로 넘겨 칸 모양 막대를 그린다(css .range). */
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

/** 켜기/끄기 스위치(체크박스를 블록 모양으로) */
export const switchInput = attrs =>
  /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", class: "switch", role: "switch", ...attrs }));

/** 대화상자 탭 줄 */
export const tabBar = ({ tabs, active, onSelect }) =>
  choice({
    id: "dialog-tab",
    label: t("구역"),
    options: tabs,
    value: active,
    onChange: onSelect,
    className: "segmented",
  });
