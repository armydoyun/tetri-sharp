// 작은 DOM 도우미와 대화상자 틀. 설정·규칙 편집이 같은 모양(머리·몸통·발)을 쓴다.
// 버튼·선택·입력 같은 컴포넌트는 ./components.js에 있다.
import { button, iconButton } from "./components.js";
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
 * 대화상자 내용을 [머리(제목·닫기) | 몸통 | 발(알림 칸·버튼)]으로 채운다.
 * 알림 칸(.notice-slot)은 늘 두 줄 자리를 차지해 글이 생겨도 버튼이 움직이지 않는다.
 * @param {HTMLDialogElement} dialog
 * @param {{ title: string, body: HTMLElement, notice: HTMLElement, actions: HTMLElement[], closeId: string, tabs?: HTMLElement | null }} parts
 */
export const fillDialog = (dialog, { title, body, notice, actions, closeId, tabs = null }) => {
  const close = iconButton({ icon: "close", label: t("닫기"), onClick: () => dialog.close() });
  const done = button({ label: t("닫기"), id: closeId, onClick: () => dialog.close() });
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
