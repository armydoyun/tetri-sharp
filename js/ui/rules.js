// Custom 규칙 편집 대화상자. 바꿀 때마다 onChange(규칙 내용)를 부르고, 저장·적용은 호출한 쪽이 한다.
import { gravityLabel } from "../modes/format.js";
import { MODERN, PRESET_LIST } from "../rules/presets.js";
import { GRAVITY_OPTIONS, LIMITS, makeCustomRules, sanitizeRuleBody } from "../rules/sanitize.js";
import { el, fieldRow, fillDialog, focusKey, restoreFocus } from "./dom.js";
import { button, confirmButton, rangeRow, slider, tabBar, textInput, toggle } from "./components.js";
import { dropdown, splitOption } from "./select.js";
import { decodeRules, encodeRules, rulesLink } from "../rules/share.js";
import { MAX_RULE_NAME, MAX_RULE_SLOTS } from "../storage/rule-slots.js";
import { t } from "../i18n/index.js";
import { copyText } from "./clipboard.js";
import { spinMask, spinSettings, T_SPIN } from "../rules/spins.js";
import { spinChoiceLabel, spinControls } from "./spin-settings.js";

const ms = frames => `${Math.round((frames * 1000) / 60)}ms`;
const HANDLING_OFF = t("‘조작감 고정’을 켜면 쓸 수 있어요");
const SDF_INSTANT_OFF = t("즉시 소프트 드롭을 켜서 배율을 쓰지 않아요.");

/**
 * 편집 항목. path는 규칙 객체 안의 위치.
 * when이 거짓이면 항목을 숨기지 않고 같은 자리에서 비활성으로 두며, 설명 줄에 off(쓸 수 없는 이유)를 보여 준다(원칙 2).
 * @type {ReadonlyArray<{ section?: string, path?: string, label?: string, hint?: string, type?: "select" | "toggle" | "number",
 *   options?: ReadonlyArray<[any, string]>, range?: readonly number[], unit?: (v: number) => string, when?: (r: any) => boolean, off?: string | ((r: any) => string), reserveHints?: string[], fallback?: any }>}
 */
const FIELDS = [
  { section: t("피스") },
  {
    path: "rotation",
    label: t("회전 시스템"),
    type: "select",
    options: [
      ["srs", t("SRS — 벽차기 5단계 (현대 표준)")],
      ["ars", t("ARS — 좌우 1칸만, 중앙열 규칙 (아케이드)")],
      ["classic", t("킥 없음 — 막히면 안 돈다 (옛날 방식)")],
    ],
  },
  {
    path: "randomizer",
    label: t("생성기"),
    type: "select",
    options: [
      ["bag7", t("7-Bag — 7개마다 한 벌씩")],
      ["bag14", t("14-Bag — 두 벌씩 섞기")],
      ["random", t("완전 무작위")],
      ["nesReroll", t("직전 재추첨 — 같은 게 나오면 한 번 다시")],
      ["history4", t("이력 4개 — 최근 4개를 피함")],
    ],
  },
  {
    path: "previewCount",
    label: t("넥스트 미리보기"),
    hint: t("다음에 나올 피스를 몇 개까지 미리 보여 줄지"),
    type: "number",
    range: LIMITS.previewCount,
    unit: v => t("{n}개", { n: v }),
  },
  { path: "hold.enabled", label: t("홀드"), hint: t("피스 하나를 맡겨 두었다가 바꿔 쓰기"), type: "toggle" },
  { path: "ghost", label: t("고스트"), hint: t("피스가 떨어질 자리를 흐리게 보여 줘요"), type: "toggle" },
  { path: "hardDrop", label: t("하드 드롭"), hint: t("한 번에 바닥까지 떨어뜨리고 바로 고정"), type: "toggle" },

  {
    path: "allow180",
    label: t("180도 회전 허용"),
    hint: t("꺼 두면 플레이와 미리 회전에 180도 입력을 쓰지 않아요."),
    type: "toggle",
    fallback: true,
  },

  { section: t("고정·낙하") },
  {
    path: "lock.type",
    label: t("고정 방식"),
    type: "select",
    options: [
      ["moveReset", t("움직이면 리셋 (횟수 제한)")],
      ["stepReset", t("더 내려갔을 때만 리셋")],
      ["infinite", t("무제한 리셋 (인피니티)")],
      ["none", t("닿으면 다음 낙하 때 즉시 고정")],
    ],
  },
  {
    path: "lock.delay",
    label: t("고정 지연"),
    type: "number",
    range: LIMITS.lockDelay,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.lock.type !== "none",
    off: t("고정 방식이 ‘즉시 고정’이라 쓰지 않아요"),
  },
  {
    path: "lock.maxResets",
    label: t("리셋 한도"),
    type: "number",
    range: LIMITS.maxResets,
    unit: v => t("{n}회", { n: v }),
    when: r => r.lock.type === "moveReset",
    off: t("‘움직이면 리셋’ 방식에서만 써요"),
  },
  {
    path: "gravityMode",
    label: t("중력 적용"),
    type: "select",
    options: [
      ["mode", t("모드 기본 — 레벨별 중력이 없는 모드는 아래 값을 써요.")],
      ["fixed", t("고정 중력 — 기본 플레이 모드에서 아래 값을 유지해요.")],
    ],
    fallback: "mode",
  },
  {
    path: "gravity",
    label: t("기본 중력"),
    type: "select",
    options: GRAVITY_OPTIONS.map(g => [g, gravityLabel(g, t)]),
  },
  { path: "are.spawn", label: t("생성 지연"), type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },
  { path: "are.lineClear", label: t("줄 삭제 지연"), type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },

  { section: t("점수") },
  { path: "spin", label: t("스핀 판정") },
  {
    path: "scoring",
    label: t("점수표"),
    type: "select",
    options: [
      ["guideline", t("가이드라인 — B2B·콤보·퍼펙트 클리어")],
      ["classic", t("클래식 — 줄 수만")],
    ],
  },

  { section: t("조작") },
  {
    path: "irs",
    label: t("미리 회전 (IRS)"),
    hint: t("생성 순간 회전 키를 누르고 있으면 돌린 채로 나온다"),
    type: "toggle",
  },
  {
    path: "ihs",
    label: t("미리 홀드 (IHS)"),
    hint: t("생성 순간 홀드 키를 누르고 있으면 바로 홀드"),
    type: "toggle",
    when: r => r.hold.enabled,
    off: t("홀드가 꺼져 있어 쓰지 않아요"),
  },
  { path: "fixedHandlingOn", label: t("조작감 고정"), hint: t("켜면 개인 설정 대신 아래 값으로 강제"), type: "toggle" },
  {
    path: "fixedHandling.das",
    label: "DAS",
    type: "number",
    range: LIMITS.das,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
    off: HANDLING_OFF,
    fallback: 16,
  },
  {
    path: "fixedHandling.arr",
    label: "ARR",
    type: "number",
    range: LIMITS.arr,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
    off: HANDLING_OFF,
    fallback: 6,
  },
  {
    path: "fixedHandling.sdf",
    label: "SDF",
    type: "number",
    range: LIMITS.sdf,
    unit: v => t("{n}배", { n: v }),
    when: r => r.fixedHandling && !r.fixedHandling.instantSoftDrop,
    off: r => (r.fixedHandling ? SDF_INSTANT_OFF : HANDLING_OFF),
    reserveHints: [HANDLING_OFF, SDF_INSTANT_OFF],
    fallback: 30,
  },
  {
    path: "fixedHandling.instantSoftDrop",
    label: t("즉시 소프트 드롭"),
    type: "toggle",
    hint: t("소프트 드롭을 누르면 즉시 바닥까지 내려요."),
    when: r => r.fixedHandling,
    off: HANDLING_OFF,
  },
  {
    path: "fixedHandling.dcd",
    label: "DCD",
    type: "select",
    hint: t("피스가 나오거나 회전한 뒤 자동 가로 이동을 다시 시작하기까지 기다리는 시간"),
    options: [
      [-1, t("개인 설정 따르기")],
      [0, t("끄기")],
      ...Array.from(
        { length: LIMITS.dcd[1] },
        (_, i) => /** @type {[number, string]} */ ([i + 1, `${i + 1}F · ${ms(i + 1)}`])
      ),
    ],
    when: r => r.fixedHandling,
    off: HANDLING_OFF,
    fallback: -1,
  },
];

const getPath = (obj, path) => {
  if (path === "fixedHandlingOn") return Boolean(obj.fixedHandling);
  return path.split(".").reduce((o, k) => o?.[k], obj);
};

const setPath = (obj, path, value) => {
  const next = structuredClone(obj);
  if (path === "fixedHandlingOn") {
    next.fixedHandling = value ? { das: 16, arr: 6, sdf: 30, dcd: 0 } : null;
    return next;
  }
  const keys = path.split(".");
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  return next;
};

/** 고른 선택지의 설명(있으면) */
const selectedDescription = (field, rules) => {
  if (field.type !== "select") return "";
  const value = getPath(rules, field.path) ?? field.fallback;
  const found = field.options.find(([v]) => v === value);
  return found ? splitOption(found[1])[1] : "";
};

const defaultRules = sanitizeRuleBody(MODERN);

/** 편집기와 같은 이름·값·활성 조건으로 Modern 기준 변경점을 보여 준다. */
export const ruleChanges = rules =>
  FIELDS.flatMap(field => {
    if (!field.path || field.path === "gravityMode" || (field.when && !field.when(rules))) return [];
    if (field.path === "spin") {
      const mask = spinMask(rules);
      return mask === T_SPIN ? [] : [`${field.label} · ${spinChoiceLabel(mask)}`];
    }
    const value = getPath(rules, field.path) ?? field.fallback;
    const base = getPath(defaultRules, field.path) ?? field.fallback;
    const fixedGravity = field.path === "gravity" && rules.gravityMode === "fixed";
    if (!fixedGravity && value === base && (!field.when || field.when(defaultRules))) return [];
    // 고정 조작에서 값이 개인 설정을 따라가면 실제 변경점이 없다.
    if (field.path === "fixedHandling.dcd" && value === -1) return [];
    const format =
      field.type === "toggle"
        ? value => (value ? t("켜기") : t("끄기"))
        : (field.unit ?? (value => splitOption(field.options.find(([v]) => v === value)[1])[0]));
    return [`${fixedGravity ? t("고정 중력") : field.label} ${format(value)}`];
  });

export const noRuleChanges = () => t("Modern 기본값과 같아요.");

/** 탭: FIELDS의 구역 이름 + 공유 */
const TABS = [...FIELDS.filter(f => f.section).map(f => [f.section, f.section]), [t("공유"), t("공유")]];

/**
 * @param {{ dialog: HTMLDialogElement, getRules: () => any, onChange: (body: any) => void,
 *   onClose: () => void, onTrial: () => void, previewImport: (body: any) => Promise<boolean>,
 *   slots: ReturnType<typeof import("../storage/rule-slots.js").createRuleSlots> }} options
 */
export const createRulesUI = ({ dialog, getRules, onChange, onClose, onTrial, previewImport, slots }) => {
  const control = (field, rules, disabled) => {
    const id = `rule-${field.path.replace(/\./g, "-")}`;
    const value = getPath(rules, field.path) ?? field.fallback;
    const commit = v => {
      undo = null;
      onChange(sanitizeRuleBody(setPath(rules, field.path, v)));
      render(id);
    };
    if (field.type === "select") {
      // 닫혀 있을 때는 짧은 이름만, 목록에서는 설명까지 보여 준다.
      return dropdown({
        id,
        label: field.label,
        disabled,
        value,
        onChange: commit,
        options: field.options.map(([v, text]) => {
          const [name, hint] = splitOption(text);
          return { value: v, label: name, hint };
        }),
      });
    }
    if (field.type === "toggle") {
      const input = toggle({ id, checked: Boolean(value), disabled });
      input.addEventListener("change", () => commit(input.checked));
      return input;
    }
    const [min, max] = field.range;
    const output = el("output", { text: field.unit(value), htmlFor: id });
    const input = slider({
      id,
      min: String(min),
      max: String(max),
      step: "1",
      value: String(value),
      disabled,
    });
    input.addEventListener("input", () => (output.textContent = field.unit(Number(input.value))));
    input.addEventListener("change", () => commit(Number(input.value)));
    return rangeRow(input, output, field.unit);
  };

  const notice = el("p", { class: "notice-slot", role: "status", id: "rules-record" });
  /** 잠깐 보여 줄 알림(다음 렌더 한 번만). 없으면 기록표 이름을 보여 준다. */
  let message = "";
  /**
   * 프리셋으로 채우기 직전의 규칙(되돌리기용). 프리셋은 지금 고른 내 규칙을 덮어쓰므로 한 번은 되돌릴 수 있게 한다.
   * 다른 값을 고치거나 다른 규칙으로 옮기면 비운다(되돌리면 그 고친 것까지 사라지므로).
   * @type {null | { body: any, slot: number }}
   */
  let undo = null;
  let importInput = "";

  const shareSection = rules => {
    const code = encodeRules(rules);
    const codeInput = textInput({
      id: "rule-share-code",
      num: true,
      value: code,
      readOnly: true,
    });
    const copyCode = button({ label: t("복사"), icon: "copy", size: "s", id: "rule-share-copy" });
    copyCode.addEventListener("click", async () => {
      message = (await copyText(code, codeInput))
        ? t("규칙 코드를 복사했어요")
        : t("복사하지 못했어요. 코드를 선택해 직접 복사해 주세요");
      notice.textContent = message;
    });
    const link = rulesLink(rules, location.href);
    const copyLink = button({
      label: t("링크 복사"),
      icon: "link",
      size: "s",
      id: "rule-share-link",
    });
    copyLink.addEventListener("click", async () => {
      message = (await copyText(link))
        ? t("링크를 복사했어요. 받은 사람이 열면 이 규칙이 내 규칙에 새로 들어가요")
        : t("복사하지 못했어요");
      notice.textContent = message;
    });
    const pasteInput = textInput({
      id: "rule-share-paste",
      num: true,
      value: importInput,
      placeholder: t("TS1-로 시작하는 코드나 링크"),
      autocomplete: "off",
      spellcheck: false,
    });
    pasteInput.addEventListener("input", () => (importInput = pasteInput.value));
    const load = button({ label: t("불러오기"), icon: "folder", size: "s", id: "rule-share-load" });
    let previewing = false;
    const doLoad = async () => {
      if (previewing) return;
      const body = decodeRules(pasteInput.value);
      if (!body) {
        notice.textContent = t("읽을 수 없는 코드예요");
        return;
      }
      previewing = true;
      const accepted = await previewImport(body);
      previewing = false;
      if (!accepted) return;
      if (!slots.add(t("받은 규칙"), body)) {
        notice.textContent = t("내 규칙이 가득 찼어요({n}개). 하나를 지우고 다시 불러와 주세요", { n: MAX_RULE_SLOTS });
        return;
      }
      undo = null;
      importInput = "";
      message = t("새 칸으로 불러왔어요");
      render("rule-share-paste");
    };
    load.addEventListener("click", doLoad);
    pasteInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        doLoad();
      }
    });
    const changes = ruleChanges(rules);
    return el(
      "section",
      { class: "field-section" },
      el(
        "div",
        { class: "rule-share-summary" },
        el("strong", { text: changes.length ? t("Modern 기본값과 다른 설정") : noRuleChanges() }),
        ...(changes.length ? [el("ul", { class: "rule-change-list" }, ...changes.map(text => el("li", { text })))] : [])
      ),
      fieldRow({
        id: "rule-share-code",
        label: t("규칙 코드"),
        hint: t("지금 조합을 코드로"),
        control: el("span", { class: "inline-control" }, codeInput, copyCode),
      }),
      fieldRow({
        id: "rule-share-link",
        label: t("공유 링크"),
        hint: t("배포 주소에서 열었을 때 쓸모 있어요"),
        control: el("span", { class: "inline-control" }, copyLink),
      }),
      fieldRow({
        id: "rule-share-paste",
        label: t("코드 불러오기"),
        hint: t("코드나 링크를 붙여 넣고 변경점을 확인해요."),
        control: el("span", { class: "inline-control" }, pasteInput, load),
      })
    );
  };

  let tab = TABS[0][0];
  let spinDetails = null;
  let lastField = null;
  let trialScroll = 0;
  dialog.addEventListener("focusin", e => {
    if (e.target instanceof HTMLElement && e.target.closest(".field-section"))
      lastField = focusKey(e.target.closest(".select") ?? e.target);
  });
  // 좁거나 낮은 화면(휴대폰): 고정 머리가 크면 스크롤 칸이 아래 조금만 남는다 → 내 규칙·프리셋 줄은 몸통과 함께 스크롤, 탭만 고정
  const compact = window.matchMedia("(max-width: 720px), (max-height: 600px)");

  /** @param {string} [focusId] 다시 그린 뒤 포커스를 돌려줄 컨트롤 */
  const render = (focusId, keepScroll = true) => {
    const rules = getRules();
    const scroll = keepScroll ? (dialog.querySelector(".dialog-body")?.scrollTop ?? 0) : 0;
    const body = el("div", {});

    // 내 규칙 줄: 지금 고친 규칙의 이름, 새 규칙, 지우기(어느 탭에서든 보인다)
    const state = slots.read();
    const current = state.slots[state.active];
    const nameInput = /** @type {HTMLInputElement} */ (
      textInput({
        id: "rule-slot-name",
        value: current.name,
        maxLength: MAX_RULE_NAME,
        "aria-label": t("규칙 이름"),
        autocomplete: "off",
      })
    );
    // 다음으로 누른 버튼을 포커스 이동 중에 교체하지 않는다.
    nameInput.addEventListener("change", () => {
      nameInput.value = slots.rename(nameInput.value);
      notice.textContent = t("이름을 바꿨어요");
    });
    const addSlot = button({ label: t("새 규칙"), icon: "plus", size: "s", id: "rule-slot-add" });
    addSlot.disabled = state.slots.length >= MAX_RULE_SLOTS;
    addSlot.addEventListener("click", () => {
      if (!slots.add(t("내 규칙 {n}", { n: state.slots.length + 1 }), PRESET_LIST[0])) return;
      undo = null;
      message = t("새 규칙을 만들었어요(Modern 값에서 시작)");
      render("rule-slot-name");
    });
    const duplicateSlot = button({
      label: t("복제"),
      icon: "copy",
      size: "s",
      id: "rule-slot-duplicate",
      disabled: state.slots.length >= MAX_RULE_SLOTS,
      onClick: () => {
        const suffix = t("복사본");
        const name = slots
          .active()
          .name.slice(0, MAX_RULE_NAME - suffix.length - 1)
          .trimEnd();
        if (!slots.add(`${name} ${suffix}`, rules)) return;
        undo = null;
        message = t("현재 규칙을 복제했어요");
        render("rule-slot-name");
      },
    });
    // 지우기는 두 번 눌러 확정(브라우저 확인창 대신). 이 규칙의 기록은 남는다
    const removeSlot = confirmButton({
      label: t("지우기"),
      confirmLabel: t("정말 지우기"),
      icon: "close",
      size: "s",
      id: "rule-slot-remove",
      title: t("‘{name}’ 규칙을 지워요. 이 규칙의 기록은 남아요.", { name: current.name }),
      disabled: state.slots.length <= 1,
      onConfirm: () => {
        slots.remove();
        undo = null;
        message = t("규칙을 지웠어요");
        render("rule-slot-name");
      },
    });
    const slotRow = el(
      "div",
      { class: "rule-slot-row" },
      el("span", { class: "field-help num", text: `${state.active + 1} / ${state.slots.length}` }),
      nameInput,
      el("div", { class: "rule-slot-actions" }, addSlot, duplicateSlot, removeSlot)
    );

    // 프리셋 줄과 탭은 몸통 위에 고정(어느 탭에서든 보인다). 휴대폰에서는 탭만 고정하고 두 줄은 몸통 맨 위로
    const presets = el(
      "div",
      { class: "rule-presets" },
      el("span", { class: "field-help", text: t("프리셋에서 시작") }),
      ...PRESET_LIST.map(p => {
        const b = button({ label: p.name, size: "s", "data-preset": p.id });
        b.addEventListener("click", () => {
          undo = { body: sanitizeRuleBody(rules), slot: state.active };
          onChange(sanitizeRuleBody(p));
          message = t("‘{rule}’을 {name} 값으로 채웠어요. 되돌리기로 전으로 돌아갈 수 있어요.", {
            rule: slots.active().name,
            name: p.name,
          });
          render();
          /** @type {HTMLElement | null} */ (dialog.querySelector(`[data-preset="${p.id}"]`))?.focus();
        });
        return b;
      })
    );
    const tabs = tabBar({
      tabs: TABS,
      active: tab,
      onSelect: t => {
        tab = t;
        lastField = null;
        render(undefined, false);
        /** @type {HTMLElement | null} */ (dialog.querySelector(`.dialog-tabs [data-value="${t}"]`))?.focus();
      },
    });

    if (compact.matches) body.append(el("div", { class: "rule-tabs-head is-in-body" }, slotRow, presets));
    if (tab === t("공유")) {
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
        if (field.path === "spin") {
          const { preset, details } = spinControls({
            prefix: "rule",
            rules,
            expanded: spinDetails?.open,
            onChange: (mask, focusId) => {
              undo = null;
              onChange(sanitizeRuleBody({ ...rules, ...spinSettings(mask) }));
              render(focusId);
            },
          });
          spinDetails = details;
          section.append(preset, details);
          continue;
        }
        const disabled = Boolean(field.when && !field.when(rules));
        const id = `rule-${field.path.replace(/\./g, "-")}`;
        const hint = disabled
          ? typeof field.off === "function"
            ? field.off(rules)
            : field.off
          : selectedDescription(field, rules) || field.hint || "";
        const reserveHints = [
          ...(field.reserveHints ?? []),
          ...(field.when && field.hint ? [field.hint] : []),
          ...(typeof field.off === "string" ? [field.off] : []),
        ];
        section.append(
          fieldRow({ id, label: field.label, hint, reserveHints, control: control(field, rules, disabled), disabled })
        );
      }
      body.append(section);
    }

    // 되돌리기: 늘 같은 자리(발)에 있고, 프리셋으로 채운 직후에만 누를 수 있다(원칙 2)
    if (undo && undo.slot !== state.active) undo = null;
    const undoButton = button({ label: t("되돌리기"), icon: "undo", id: "rule-undo", disabled: !undo });
    undoButton.addEventListener("click", () => {
      if (!undo) return;
      const { body: before } = undo;
      undo = null;
      onChange(before);
      message = t("프리셋으로 채우기 전으로 되돌렸어요");
      render("rule-undo");
    });
    notice.dataset.recordKey = makeCustomRules(rules).id;
    notice.textContent = message || t("변경은 즉시 저장되며, 규칙 조합마다 기록을 따로 보관해요.");
    message = "";
    const trial = button({
      label: t("시험 플레이"),
      icon: "play",
      variant: "primary",
      id: "rule-trial",
      onClick: () => {
        trialScroll = body.scrollTop;
        dialog.close("trial");
        onTrial();
      },
    });
    fillDialog(dialog, {
      title: t("Custom 규칙"),
      body,
      notice,
      actions: [trial, undoButton],
      closeId: "rules-close",
      tabs: compact.matches
        ? el("div", { class: "rule-tabs-head" }, tabs)
        : el("div", { class: "rule-tabs-head" }, slotRow, presets, tabs),
    });
    body.scrollTop = scroll;
    if (focusId) /** @type {HTMLElement | null} */ (dialog.querySelector(`#${focusId}`))?.focus();
  };

  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "trial") onClose();
  });
  // 화면을 돌리거나 창 크기를 바꿔 기준을 넘으면 그 배치로 다시 그린다
  compact.addEventListener("change", () => {
    if (dialog.open) render(undefined, false);
  });

  return {
    /** @param {"share"} [startTab] 공유 탭으로 바로 열기(첫 화면 규칙 카드의 공유 버튼) */
    open(startTab) {
      if (startTab === "share") tab = t("공유");
      lastField = null;
      dialog.returnValue = "";
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (
        dialog.querySelector(startTab === "share" ? "#rule-share-copy" : "#rules-close")
      )?.focus();
    },
    returnFromTrial() {
      dialog.returnValue = "";
      message = t("시험 플레이를 마쳤어요");
      render(undefined, false);
      dialog.showModal();
      restoreFocus(dialog, lastField ?? "#rule-trial");
      dialog.querySelector(".dialog-body").scrollTop = trialScroll;
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
