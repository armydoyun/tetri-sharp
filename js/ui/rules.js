// Custom 규칙 편집 대화상자. 바꿀 때마다 onChange(규칙 내용)를 부르고, 저장·적용은 호출한 쪽이 한다.
import { PRESET_LIST } from "../rules/presets.js";
import { GRAVITY_OPTIONS, LIMITS, makeCustomRules, sanitizeRuleBody } from "../rules/sanitize.js";

const ms = frames => `${Math.round((frames * 1000) / 60)}ms`;

const GRAVITY_LABELS = ["1칸/초", "1.25칸/초", "2칸/초", "6칸/초", "1G (60칸/초)", "20G (즉시 바닥)"];

/**
 * 편집 항목. path는 규칙 객체 안의 위치, when은 이 항목을 보여 줄 조건.
 * @type {ReadonlyArray<{ section?: string, path: string, label: string, hint?: string, type: "select" | "toggle" | "number",
 *   options?: ReadonlyArray<[any, string]>, range?: readonly number[], unit?: (v: number) => string, when?: (r: any) => boolean }>}
 */
const FIELDS = [
  { section: "피스" },
  {
    path: "rotation",
    label: "회전 시스템",
    type: "select",
    options: [
      ["srs", "SRS — 벽차기 5단계 (현대 표준)"],
      ["ars", "ARS — 좌우 1칸만, 중앙열 규칙 (아케이드)"],
      ["classic", "킥 없음 — 막히면 안 돈다 (옛날 방식)"],
    ],
  },
  {
    path: "randomizer",
    label: "생성기",
    type: "select",
    options: [
      ["bag7", "7-Bag — 7개마다 한 벌씩"],
      ["bag14", "14-Bag — 두 벌씩 섞기"],
      ["random", "완전 무작위"],
      ["nesReroll", "직전 재추첨 — 같은 게 나오면 한 번 다시"],
      ["history4", "이력 4개 — 최근 4개를 피함"],
    ],
  },
  { path: "previewCount", label: "넥스트 미리보기", type: "number", range: LIMITS.previewCount, unit: v => `${v}개` },
  { path: "hold.enabled", label: "홀드", type: "toggle" },
  { path: "ghost", label: "고스트(착지 위치 표시)", type: "toggle" },
  { path: "hardDrop", label: "하드 드롭", type: "toggle" },

  { section: "고정과 낙하" },
  {
    path: "lock.type",
    label: "고정 방식",
    type: "select",
    options: [
      ["moveReset", "움직이면 리셋 (횟수 제한)"],
      ["stepReset", "더 내려갔을 때만 리셋"],
      ["infinite", "무제한 리셋 (인피니티)"],
      ["none", "닿으면 다음 낙하 때 즉시 고정"],
    ],
  },
  {
    path: "lock.delay",
    label: "고정 지연",
    type: "number",
    range: LIMITS.lockDelay,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.lock.type !== "none",
  },
  {
    path: "lock.maxResets",
    label: "리셋 한도",
    type: "number",
    range: LIMITS.maxResets,
    unit: v => `${v}회`,
    when: r => r.lock.type === "moveReset",
  },
  {
    path: "gravity",
    label: "기본 중력",
    hint: "Marathon은 레벨에 따라 따로 정해진다",
    type: "select",
    options: GRAVITY_OPTIONS.map((g, i) => [g, GRAVITY_LABELS[i]]),
  },
  { path: "are.spawn", label: "생성 지연", type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },
  { path: "are.lineClear", label: "줄 삭제 지연", type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },

  { section: "점수" },
  {
    path: "tspin",
    label: "T-spin 판정",
    type: "select",
    options: [
      ["threeCorner", "3-corner (Mini 포함)"],
      ["none", "없음"],
    ],
  },
  {
    path: "scoring",
    label: "점수표",
    type: "select",
    options: [
      ["guideline", "가이드라인 — B2B·콤보·퍼펙트 클리어"],
      ["classic", "클래식 — 줄 수만"],
    ],
  },

  { section: "조작감" },
  { path: "fixedHandlingOn", label: "조작감 고정", hint: "켜면 개인 설정 대신 아래 값으로 강제", type: "toggle" },
  {
    path: "fixedHandling.das",
    label: "DAS",
    type: "number",
    range: LIMITS.das,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
  },
  {
    path: "fixedHandling.arr",
    label: "ARR",
    type: "number",
    range: LIMITS.arr,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
  },
  {
    path: "fixedHandling.sdf",
    label: "SDF",
    type: "number",
    range: LIMITS.sdf,
    unit: v => `×${v}`,
    when: r => r.fixedHandling,
  },
];

const getPath = (obj, path) => {
  if (path === "fixedHandlingOn") return Boolean(obj.fixedHandling);
  return path.split(".").reduce((o, k) => o?.[k], obj);
};

const setPath = (obj, path, value) => {
  const next = structuredClone(obj);
  if (path === "fixedHandlingOn") {
    next.fixedHandling = value ? { das: 16, arr: 6, sdf: 30 } : null;
    return next;
  }
  const keys = path.split(".");
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  return next;
};

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("data-") || k.startsWith("aria-")) node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children);
  return node;
};

/**
 * @param {{ dialog: HTMLDialogElement, getRules: () => any, onChange: (body: any) => void, onClose?: () => void }} options
 */
export const createRulesUI = ({ dialog, getRules, onChange, onClose }) => {
  const control = (field, rules) => {
    const id = `rule-${field.path.replace(/\./g, "-")}`;
    const value = getPath(rules, field.path);
    const commit = v => {
      onChange(sanitizeRuleBody(setPath(rules, field.path, v)));
      render(id);
    };
    if (field.type === "select") {
      const select = el("select", { id, class: "rule-select" });
      field.options.forEach(([v, label], i) => {
        select.append(el("option", { value: String(i), text: label, selected: v === value }));
      });
      select.addEventListener("change", () => commit(field.options[Number(select.value)][0]));
      return select;
    }
    if (field.type === "toggle") {
      const input = el("input", { id, type: "checkbox", class: "rule-toggle", checked: Boolean(value) });
      input.addEventListener("change", () => commit(input.checked));
      return input;
    }
    const [min, max] = field.range;
    const output = el("output", { class: "settings-value", text: field.unit(value) });
    const input = el("input", {
      id,
      type: "range",
      min: String(min),
      max: String(max),
      step: "1",
      value: String(value),
    });
    input.addEventListener("input", () => (output.textContent = field.unit(Number(input.value))));
    input.addEventListener("change", () => commit(Number(input.value)));
    return el("span", { class: "rule-range" }, input, output);
  };

  /** @param {string} [focusId] 다시 그린 뒤 포커스를 돌려줄 컨트롤 */
  const render = focusId => {
    const rules = getRules();
    const scroll = dialog.querySelector(".settings-body")?.scrollTop ?? 0;
    const body = el("div", { class: "settings-body" });

    const presets = el(
      "div",
      { class: "rule-presets" },
      el("span", { class: "settings-help", text: "프리셋에서 시작:" }),
      ...PRESET_LIST.map(p => {
        const b = el("button", { type: "button", class: "btn btn-small", text: p.name, "data-preset": p.id });
        b.addEventListener("click", () => {
          onChange(sanitizeRuleBody(p));
          render();
        });
        return b;
      })
    );
    body.append(presets);

    let section = null;
    for (const field of FIELDS) {
      if (!field.path) {
        section = el("section", { class: "settings-section" }, el("h3", { text: field.section }));
        body.append(section);
        continue;
      }
      if (field.when && !field.when(rules)) continue;
      const id = `rule-${field.path.replace(/\./g, "-")}`;
      section.append(
        el(
          "div",
          { class: "settings-row rule-row" },
          el(
            "label",
            { class: "settings-label", htmlFor: id },
            el("strong", { text: field.label }),
            ...(field.hint ? [el("small", { text: field.hint })] : [])
          ),
          control(field, rules)
        )
      );
    }

    const close = el("button", { type: "button", class: "btn btn-primary", text: "닫기", id: "rules-close" });
    close.addEventListener("click", () => dialog.close());
    const recordId = makeCustomRules(rules).id;
    dialog.replaceChildren(
      el("h2", { class: "settings-title", text: "Custom 규칙" }),
      body,
      el(
        "footer",
        { class: "settings-footer" },
        el("p", { class: "settings-notice", text: `기록표 ${recordId} — 조합마다 기록이 따로 쌓인다` }),
        close
      )
    );
    body.scrollTop = scroll;
    if (focusId) /** @type {HTMLElement | null} */ (dialog.querySelector(`#${focusId}`))?.focus();
  };

  dialog.addEventListener("close", () => onClose?.());

  return {
    open() {
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (dialog.querySelector("#rules-close"))?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
