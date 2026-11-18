// Custom 규칙 편집 대화상자. 바꿀 때마다 onChange(규칙 내용)를 부르고, 저장·적용은 호출한 쪽이 한다.
import { PRESET_LIST } from "../rules/presets.js";
import { GRAVITY_OPTIONS, LIMITS, makeCustomRules, sanitizeRuleBody } from "../rules/sanitize.js";
import { button, el, fieldRow, fillDialog, tabBar } from "./dom.js";
import { decodeRules, encodeRules, rulesLink } from "../rules/share.js";

const ms = frames => `${Math.round((frames * 1000) / 60)}ms`;

const GRAVITY_LABELS = ["1칸/초", "1.25칸/초", "2칸/초", "6칸/초", "1G (60칸/초)", "20G (즉시 바닥)"];

/**
 * 편집 항목. path는 규칙 객체 안의 위치.
 * when이 거짓이면 항목을 숨기지 않고 같은 자리에서 비활성으로 두며, 설명 줄에 off(쓸 수 없는 이유)를 보여 준다(원칙 2).
 * @type {ReadonlyArray<{ section?: string, path: string, label: string, hint?: string, type: "select" | "toggle" | "number",
 *   options?: ReadonlyArray<[any, string]>, range?: readonly number[], unit?: (v: number) => string, when?: (r: any) => boolean, off?: string, fallback?: any }>}
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
  {
    path: "previewCount",
    label: "넥스트 미리보기",
    hint: "다음에 나올 피스를 몇 개까지 미리 보여 줄지",
    type: "number",
    range: LIMITS.previewCount,
    unit: v => `${v}개`,
  },
  { path: "hold.enabled", label: "홀드", hint: "피스 하나를 맡겨 두었다가 바꿔 쓰기", type: "toggle" },
  { path: "ghost", label: "고스트", hint: "피스가 떨어질 자리를 흐리게 보여 줘요", type: "toggle" },
  { path: "hardDrop", label: "하드 드롭", hint: "한 번에 바닥까지 떨어뜨리고 바로 고정", type: "toggle" },

  { section: "고정·낙하" },
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
    off: "고정 방식이 ‘즉시 고정’이라 쓰지 않아요",
  },
  {
    path: "lock.maxResets",
    label: "리셋 한도",
    type: "number",
    range: LIMITS.maxResets,
    unit: v => `${v}회`,
    when: r => r.lock.type === "moveReset",
    off: "‘움직이면 리셋’ 방식에서만 써요",
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

  { section: "조작" },
  { path: "irs", label: "미리 회전 (IRS)", hint: "생성 순간 회전 키를 누르고 있으면 돌린 채로 나온다", type: "toggle" },
  {
    path: "ihs",
    label: "미리 홀드 (IHS)",
    hint: "생성 순간 홀드 키를 누르고 있으면 바로 홀드",
    type: "toggle",
    when: r => r.hold.enabled,
    off: "홀드가 꺼져 있어 쓰지 않아요",
  },
  { path: "fixedHandlingOn", label: "조작감 고정", hint: "켜면 개인 설정 대신 아래 값으로 강제", type: "toggle" },
  {
    path: "fixedHandling.das",
    label: "DAS",
    type: "number",
    range: LIMITS.das,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
    off: "‘조작감 고정’을 켜면 쓸 수 있어요",
    fallback: 16,
  },
  {
    path: "fixedHandling.arr",
    label: "ARR",
    type: "number",
    range: LIMITS.arr,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
    off: "‘조작감 고정’을 켜면 쓸 수 있어요",
    fallback: 6,
  },
  {
    path: "fixedHandling.sdf",
    label: "SDF",
    type: "number",
    range: LIMITS.sdf,
    unit: v => `${v}배`,
    when: r => r.fixedHandling,
    off: "‘조작감 고정’을 켜면 쓸 수 있어요",
    fallback: 30,
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

/** "SRS — 벽차기 5단계 (현대 표준)" → ["SRS", "벽차기 5단계 (현대 표준)"] */
const splitOption = label => {
  const at = label.indexOf(" — ");
  return at < 0 ? [label, ""] : [label.slice(0, at), label.slice(at + 3)];
};

/** 고른 선택지의 설명(있으면) */
const selectedDescription = (field, rules) => {
  if (field.type !== "select") return "";
  const value = getPath(rules, field.path) ?? field.fallback;
  const found = field.options.find(([v]) => v === value);
  return found ? splitOption(found[1])[1] : "";
};

/** 탭: FIELDS의 구역 이름 + 공유 */
const TABS = [...FIELDS.filter(f => f.section).map(f => [f.section, f.section]), ["공유", "공유"]];

/**
 * @param {{ dialog: HTMLDialogElement, getRules: () => any, onChange: (body: any) => void, onClose?: () => void }} options
 */
export const createRulesUI = ({ dialog, getRules, onChange, onClose }) => {
  const control = (field, rules, disabled) => {
    const id = `rule-${field.path.replace(/\./g, "-")}`;
    const value = getPath(rules, field.path) ?? field.fallback;
    const commit = v => {
      onChange(sanitizeRuleBody(setPath(rules, field.path, v)));
      render(id);
    };
    if (field.type === "select") {
      const select = el("select", { id, class: "select", disabled });
      field.options.forEach(([v, label], i) => {
        // 선택 상자에는 짧은 이름만(긴 설명은 잘리므로 아래 설명 줄에 보여 준다)
        select.append(el("option", { value: String(i), text: splitOption(label)[0], selected: v === value }));
      });
      select.addEventListener("change", () => commit(field.options[Number(select.value)][0]));
      return select;
    }
    if (field.type === "toggle") {
      const input = el("input", { id, type: "checkbox", class: "toggle", checked: Boolean(value), disabled });
      input.addEventListener("change", () => commit(input.checked));
      return input;
    }
    const [min, max] = field.range;
    const output = el("output", { text: field.unit(value), htmlFor: id });
    const input = el("input", {
      id,
      type: "range",
      min: String(min),
      max: String(max),
      step: "1",
      value: String(value),
      disabled,
    });
    input.addEventListener("input", () => (output.textContent = field.unit(Number(input.value))));
    input.addEventListener("change", () => commit(Number(input.value)));
    return el("span", { class: "range" }, input, output);
  };

  const notice = el("p", { class: "notice-slot", role: "status", id: "rules-record" });
  /** 잠깐 보여 줄 알림(다음 렌더 한 번만). 없으면 기록표 이름을 보여 준다. */
  let message = "";

  /** 클립보드에 복사. 막혀 있으면 입력칸을 선택해 둔다. */
  const copy = async (text, input) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      input?.select();
      try {
        return document.execCommand("copy");
      } catch {
        return false;
      }
    }
  };

  const shareSection = rules => {
    const code = encodeRules(rules);
    const codeInput = el("input", {
      id: "rule-share-code",
      class: "text-input num",
      type: "text",
      value: code,
      readOnly: true,
    });
    const copyCode = button({ text: "복사", iconName: "copy", className: "btn btn-small", id: "rule-share-copy" });
    copyCode.addEventListener("click", async () => {
      message = (await copy(code, codeInput))
        ? "규칙 코드를 복사했어요"
        : "복사하지 못했어요. 코드를 선택해 직접 복사해 주세요";
      notice.textContent = message;
    });
    const link = rulesLink(rules, location.href);
    const copyLink = button({ text: "링크 복사", iconName: "link", className: "btn btn-small", id: "rule-share-link" });
    copyLink.addEventListener("click", async () => {
      message = (await copy(link, null))
        ? "링크를 복사했어요. 받은 사람이 열면 이 규칙이 Custom으로 들어가요"
        : "복사하지 못했어요";
      notice.textContent = message;
    });
    const pasteInput = el("input", {
      id: "rule-share-paste",
      class: "text-input num",
      type: "text",
      placeholder: "TS1-로 시작하는 코드나 링크",
      autocomplete: "off",
      spellcheck: false,
    });
    const load = button({ text: "불러오기", iconName: "folder", className: "btn btn-small", id: "rule-share-load" });
    const doLoad = () => {
      const body = decodeRules(pasteInput.value);
      if (!body) {
        notice.textContent = "읽을 수 없는 코드예요";
        return;
      }
      onChange(body);
      message = `불러왔어요 · 기록표 ${makeCustomRules(body).id}`;
      render("rule-share-paste");
    };
    load.addEventListener("click", doLoad);
    pasteInput.addEventListener("keydown", e => {
      if (e.key === "Enter") doLoad();
    });
    return el(
      "section",
      { class: "field-section" },
      fieldRow({
        id: "rule-share-code",
        label: "규칙 코드",
        hint: "지금 조합을 코드로",
        control: el("span", { class: "inline-control" }, codeInput, copyCode),
      }),
      fieldRow({
        id: "rule-share-link",
        label: "공유 링크",
        hint: "배포 주소에서 열었을 때 쓸모 있어요",
        control: el("span", { class: "inline-control" }, copyLink),
      }),
      fieldRow({
        id: "rule-share-paste",
        label: "코드 불러오기",
        hint: "받은 코드나 링크를 붙여 넣기",
        control: el("span", { class: "inline-control" }, pasteInput, load),
      })
    );
  };

  let tab = TABS[0][0];

  /** @param {string} [focusId] 다시 그린 뒤 포커스를 돌려줄 컨트롤 */
  const render = (focusId, keepScroll = true) => {
    const rules = getRules();
    const scroll = keepScroll ? (dialog.querySelector(".dialog-body")?.scrollTop ?? 0) : 0;
    const body = el("div", {});

    // 프리셋 줄과 탭은 몸통 위에 고정(어느 탭에서든 보인다)
    const presets = el(
      "div",
      { class: "rule-presets" },
      el("span", { class: "field-help", text: "프리셋에서 시작" }),
      ...PRESET_LIST.map(p => {
        const b = button({ text: p.name, className: "btn btn-small", "data-preset": p.id });
        b.addEventListener("click", () => {
          onChange(sanitizeRuleBody(p));
          message = `${p.name} 값으로 채웠어요 · 기록표 ${makeCustomRules(p).id}`;
          render();
        });
        return b;
      })
    );
    const tabs = tabBar({
      tabs: TABS,
      active: tab,
      onSelect: t => {
        tab = t;
        render(undefined, false);
        /** @type {HTMLElement | null} */ (dialog.querySelector(`.dialog-tabs [data-value="${t}"]`))?.focus();
      },
    });

    if (tab === "공유") {
      body.append(shareSection(rules));
    } else {
      const section = el("section", { class: "field-section" });
      let current = null;
      for (const field of FIELDS) {
        if (!field.path) {
          current = field.section;
          continue;
        }
        if (current !== tab) continue;
        const disabled = Boolean(field.when && !field.when(rules));
        const id = `rule-${field.path.replace(/\./g, "-")}`;
        const hint = disabled ? field.off : selectedDescription(field, rules) || field.hint;
        section.append(fieldRow({ id, label: field.label, hint, control: control(field, rules, disabled), disabled }));
      }
      body.append(section);
    }

    notice.textContent = message || `기록표 ${makeCustomRules(rules).id} · 조합마다 기록이 따로 쌓여요`;
    message = "";
    fillDialog(dialog, {
      title: "Custom 규칙",
      body,
      notice,
      actions: [],
      closeId: "rules-close",
      tabs: el("div", { class: "rule-tabs-head" }, presets, tabs),
    });
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
