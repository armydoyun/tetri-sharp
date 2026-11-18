// 작은 DOM 도우미와 대화상자 틀. 설정·규칙 편집이 같은 모양(머리·몸통·발)을 쓴다.
import { icon } from "./icons.js";

/**
 * @param {string} tag
 * @param {Record<string, any>} [attrs]  class·text는 특별 취급, data-·aria-는 속성, 나머지는 프로퍼티
 * @param {...(Node | string)} children
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

/** 아이콘 + 글자 버튼 */
export const button = ({ text, iconName, className = "btn", ...attrs }) =>
  el("button", { type: "button", class: className, ...attrs }, ...(iconName ? [icon(iconName)] : []), text ?? "");

/**
 * 대화상자 내용을 [머리(제목·닫기) | 몸통 | 발(알림 칸·버튼)]으로 채운다.
 * 알림 칸(.notice-slot)은 늘 두 줄 자리를 차지해 글이 생겨도 버튼이 움직이지 않는다.
 * @param {HTMLDialogElement} dialog
 * @param {{ title: string, body: HTMLElement, notice: HTMLElement, actions: HTMLElement[], closeId: string }} parts
 */
export const fillDialog = (dialog, { title, body, notice, actions, closeId, tabs = null }) => {
  const close = el("button", { type: "button", class: "btn btn-ghost btn-small", "aria-label": "닫기" }, icon("close"));
  close.addEventListener("click", () => dialog.close());
  const done = button({ text: "닫기", className: "btn btn-primary", id: closeId });
  done.addEventListener("click", () => dialog.close());
  body.classList.add("dialog-body");
  dialog.classList.toggle("dialog-tabbed", Boolean(tabs));
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
      el("small", { text: hint || " " })
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

/** 대화상자 탭 줄 */
export const tabBar = ({ tabs, active, onSelect }) =>
  choice({ id: "dialog-tab", label: "구역", options: tabs, value: active, onChange: onSelect, className: "segmented" });
