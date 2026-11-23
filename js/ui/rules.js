// Custom 규칙 편집 대화상자. 바꿀 때마다 onChange(규칙 내용)를 부르고, 저장·적용은 호출한 쪽이 한다.
import { PRESET_LIST } from "../rules/presets.js";
import { GRAVITY_OPTIONS, LIMITS, makeCustomRules, sanitizeRuleBody } from "../rules/sanitize.js";
import { el, fieldRow, fillDialog } from "./dom.js";
import { button, confirmButton, rangeRow, slider, tabBar, textInput, toggle } from "./components.js";
import { dropdown } from "./select.js";
import { decodeRules, encodeRules, rulesLink } from "../rules/share.js";
import { MAX_RULE_NAME, MAX_RULE_SLOTS } from "../storage/rule-slots.js";
import { t } from "../i18n/index.js";

const ms = frames => `${Math.round((frames * 1000) / 60)}ms`;

const GRAVITY_LABELS = [t("1칸/초"), t("1.25칸/초"), t("2칸/초"), t("6칸/초"), t("1G (60칸/초)"), t("20G (즉시 바닥)")];

/**
 * 편집 항목. path는 규칙 객체 안의 위치.
 * when이 거짓이면 항목을 숨기지 않고 같은 자리에서 비활성으로 두며, 설명 줄에 off(쓸 수 없는 이유)를 보여 준다(원칙 2).
 * @type {ReadonlyArray<{ section?: string, path?: string, label?: string, hint?: string, type?: "select" | "toggle" | "number",
 *   options?: ReadonlyArray<[any, string]>, range?: readonly number[], unit?: (v: number) => string, when?: (r: any) => boolean, off?: string, fallback?: any }>}
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
    path: "gravity",
    label: t("기본 중력"),
    hint: t("Marathon은 레벨에 따라 따로 정해진다"),
    type: "select",
    options: GRAVITY_OPTIONS.map((g, i) => [g, GRAVITY_LABELS[i]]),
  },
  { path: "are.spawn", label: t("생성 지연"), type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },
  { path: "are.lineClear", label: t("줄 삭제 지연"), type: "number", range: LIMITS.are, unit: v => `${v}F · ${ms(v)}` },

  { section: t("점수") },
  {
    path: "tspin",
    label: t("T-spin 판정"),
    type: "select",
    options: [
      ["threeCorner", t("3-corner (Mini 포함)")],
      ["none", t("없음")],
    ],
  },
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
    off: t("‘조작감 고정’을 켜면 쓸 수 있어요"),
    fallback: 16,
  },
  {
    path: "fixedHandling.arr",
    label: "ARR",
    type: "number",
    range: LIMITS.arr,
    unit: v => `${v}F · ${ms(v)}`,
    when: r => r.fixedHandling,
    off: t("‘조작감 고정’을 켜면 쓸 수 있어요"),
    fallback: 6,
  },
  {
    path: "fixedHandling.sdf",
    label: "SDF",
    type: "number",
    range: LIMITS.sdf,
    unit: v => t("{n}배", { n: v }),
    when: r => r.fixedHandling,
    off: t("‘조작감 고정’을 켜면 쓸 수 있어요"),
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
const TABS = [...FIELDS.filter(f => f.section).map(f => [f.section, f.section]), [t("공유"), t("공유")]];

/**
 * @param {{ dialog: HTMLDialogElement, getRules: () => any, onChange: (body: any) => void, onClose?: () => void }} options
 */
/**
 * slots: 내 규칙(이름 붙인 Custom 규칙 여러 개). 편집기는 지금 고른 하나를 고친다.
 *   read() → { slots: [{ name, body }], active }, rename(name), add(name, body) → 가득 찼으면 false, remove()
 */
export const createRulesUI = ({ dialog, getRules, onChange, onClose, slots }) => {
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
    const codeInput = textInput({
      id: "rule-share-code",
      num: true,
      value: code,
      readOnly: true,
    });
    const copyCode = button({ label: t("복사"), icon: "copy", size: "s", id: "rule-share-copy" });
    copyCode.addEventListener("click", async () => {
      message = (await copy(code, codeInput))
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
      message = (await copy(link, null))
        ? t("링크를 복사했어요. 받은 사람이 열면 이 규칙이 내 규칙에 새로 들어가요")
        : t("복사하지 못했어요");
      notice.textContent = message;
    });
    const pasteInput = textInput({
      id: "rule-share-paste",
      num: true,
      placeholder: t("TS1-로 시작하는 코드나 링크"),
      autocomplete: "off",
      spellcheck: false,
    });
    const load = button({ label: t("불러오기"), icon: "folder", size: "s", id: "rule-share-load" });
    const doLoad = () => {
      const body = decodeRules(pasteInput.value);
      if (!body) {
        notice.textContent = t("읽을 수 없는 코드예요");
        return;
      }
      // 받은 규칙은 지금 규칙을 덮어쓰지 않고 새 칸으로 들어간다
      if (!slots.add(t("받은 규칙"), body)) {
        notice.textContent = t("내 규칙이 가득 찼어요({n}개). 하나를 지우고 다시 불러와 주세요", { n: MAX_RULE_SLOTS });
        return;
      }
      message = t("새 칸으로 불러왔어요");
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
        hint: t("받은 코드나 링크를 붙여 넣기"),
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
    // 이름은 change에서만 저장한다(Enter도 change를 일으킨다). 저장하면 편집기를 다시 그리며 이 입력칸이 빠지는데,
    // 그때 한 번 더 오는 change·blur에서 다시 그리면 그리는 도중에 또 그리게 되므로 한 번만 처리한다.
    let saved = false;
    const saveName = () => {
      if (saved || !nameInput.isConnected || nameInput.value.trim() === current.name) return;
      saved = true;
      slots.rename(nameInput.value);
      message = t("이름을 바꿨어요");
      render("rule-slot-name");
    };
    nameInput.addEventListener("change", saveName);
    const addSlot = button({ label: t("새 규칙"), icon: "plus", size: "s", id: "rule-slot-add" });
    addSlot.disabled = state.slots.length >= MAX_RULE_SLOTS;
    addSlot.addEventListener("click", () => {
      if (!slots.add(t("내 규칙 {n}", { n: state.slots.length + 1 }), PRESET_LIST[0])) return;
      message = t("새 규칙을 만들었어요(Modern 값에서 시작)");
      render("rule-slot-name");
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
      addSlot,
      removeSlot
    );

    // 프리셋 줄과 탭은 몸통 위에 고정(어느 탭에서든 보인다)
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
            rule: current.name,
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
        render(undefined, false);
        /** @type {HTMLElement | null} */ (dialog.querySelector(`.dialog-tabs [data-value="${t}"]`))?.focus();
      },
    });

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
        const disabled = Boolean(field.when && !field.when(rules));
        const id = `rule-${field.path.replace(/\./g, "-")}`;
        const hint = disabled ? field.off : selectedDescription(field, rules) || field.hint || "";
        section.append(fieldRow({ id, label: field.label, hint, control: control(field, rules, disabled), disabled }));
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
    fillDialog(dialog, {
      title: t("Custom 규칙"),
      body,
      notice,
      actions: [undoButton],
      closeId: "rules-close",
      tabs: el("div", { class: "rule-tabs-head" }, slotRow, presets, tabs),
    });
    body.scrollTop = scroll;
    if (focusId) /** @type {HTMLElement | null} */ (dialog.querySelector(`#${focusId}`))?.focus();
  };

  dialog.addEventListener("close", () => onClose?.());

  return {
    /** @param {"share"} [startTab] 공유 탭으로 바로 열기(첫 화면 규칙 카드의 공유 버튼) */
    open(startTab) {
      if (startTab === "share") tab = t("공유");
      render();
      dialog.showModal();
      /** @type {HTMLElement | null} */ (
        dialog.querySelector(startTab === "share" ? "#rule-share-copy" : "#rules-close")
      )?.focus();
    },
    get isOpen() {
      return dialog.open;
    },
  };
};
