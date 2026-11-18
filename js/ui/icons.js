// 아이콘: 직접 그린 선 아이콘(24×24 격자, 선 1.75, 둥근 끝·둥근 모서리). 이모지·글자 기호는 아이콘으로 쓰지 않는다.
// 색은 글자색(currentColor)을, 크기는 글자 크기를 따른다(css/base.css .icon).
// 새 아이콘을 넣을 때: 24×24 안 2px 여백, 선만(채움 없음), 같은 굵기 — docs/DESIGN_SYSTEM.md "아이콘".

const SVG_NS = "http://www.w3.org/2000/svg";

/** 이름 → SVG 요소 목록 [태그, 속성] */
export const ICONS = Object.freeze({
  // 설정: 슬라이더 세 줄
  sliders: [
    ["path", { d: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" }],
    ["circle", { cx: 15, cy: 6, r: 2 }],
    ["circle", { cx: 9, cy: 12, r: 2 }],
    ["circle", { cx: 17, cy: 18, r: 2 }],
  ],
  edit: [["path", { d: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" }]],
  play: [["path", { d: "M8 5.5v13L18.5 12z" }]],
  pause: [["path", { d: "M9 5.5v13M15 5.5v13" }]],
  forward: [["path", { d: "M4 6.5v11l7-5.5zM13 6.5v11l7-5.5z" }]],
  restart: [["path", { d: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" }]],
  close: [["path", { d: "M6 6l12 12M18 6 6 18" }]],
  menu: [["path", { d: "M5 7h14M5 12h14M5 17h14" }]],
  download: [["path", { d: "M12 4v11M7 10l5 5 5-5M5 20h14" }]],
  folder: [["path", { d: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" }]],
  star: [["path", { d: "M12 4l2.4 5 5.4.8-3.9 3.8.9 5.4L12 16.5 7.2 19l.9-5.4-3.9-3.8 5.4-.8z" }]],
  reset: [["path", { d: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4M12 8.5V12l2.5 1.5" }]],
  gamepad: [
    [
      "path",
      { d: "M7 8h10a4 4 0 0 1 4 4v1.5a2.5 2.5 0 0 1-4.6 1.4L15 13H9l-1.4 1.9A2.5 2.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4z" },
    ],
    ["path", { d: "M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01" }],
  ],
  keyboard: [
    ["rect", { x: 3, y: 6.5, width: 18, height: 11, rx: 2 }],
    ["path", { d: "M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" }],
  ],
  "arrow-left": [["path", { d: "M19 12H5M11 6l-6 6 6 6" }]],
  "arrow-right": [["path", { d: "M5 12h14M13 6l6 6-6 6" }]],
  "arrow-up": [["path", { d: "M12 19V5M6 11l6-6 6 6" }]],
  "arrow-down": [["path", { d: "M12 5v14M6 13l6 6 6-6" }]],
});

/**
 * @param {keyof typeof ICONS} name
 * @param {{ label?: string, className?: string }} [options]  label이 있으면 화면 읽기 프로그램이 읽는다(없으면 장식)
 * @returns {SVGSVGElement}
 */
export const icon = (name, { label, className } = {}) => {
  const parts = ICONS[name];
  if (!parts) throw new Error(`아이콘이 없습니다: ${name}`);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon${className ? ` ${className}` : ""}`);
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
  }
  for (const [tag, attrs] of parts) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
};

/** HTML에 적어 둔 <span data-icon="이름"></span> 자리를 SVG로 바꾼다. */
export const hydrateIcons = (root = document) => {
  for (const slot of root.querySelectorAll("[data-icon]")) {
    const name = /** @type {keyof typeof ICONS} */ (slot.getAttribute("data-icon"));
    slot.replaceWith(icon(name));
  }
};
