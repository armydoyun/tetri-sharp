// 내 규칙: 이름을 붙인 Custom 규칙 여러 개(최대 10개)와 지금 고른 하나.
// 저장 형식: { slots: [{ name, body }], active: 번호 }.
// 이전 버전과 백업은 "customRules"(규칙 하나)만 안다 → 지금 고른 규칙을 그 키에도 늘 같이 적는다.
// 처음 읽을 때 이 키가 없으면 기존 "customRules"를 "내 규칙 1"로 옮긴다.
import { MODERN } from "../rules/presets.js";
import { sanitizeRuleBody } from "../rules/sanitize.js";
import { t } from "../i18n/index.js";

export const RULE_SLOTS_KEY = "customRuleSlots";
export const MAX_RULE_SLOTS = 10;
export const MAX_RULE_NAME = 24;

const cleanName = (name, fallback) => {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_RULE_NAME) : "";
  return text || fallback;
};

/** 저장된 값(또는 백업 파일)을 믿을 수 있는 값으로. 읽을 수 없으면 null */
export const sanitizeRuleSlots = raw => {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.slots)) return null;
  const slots = raw.slots
    .filter(s => s && typeof s === "object")
    .slice(0, MAX_RULE_SLOTS)
    .map((s, i) => ({
      name: cleanName(s.name, t("내 규칙 {n}", { n: i + 1 })),
      body: sanitizeRuleBody(s.body ?? MODERN),
    }));
  if (!slots.length) return null;
  const active = Number.isInteger(raw.active) && raw.active >= 0 && raw.active < slots.length ? raw.active : 0;
  return { slots, active };
};

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createRuleSlots = store => {
  const read = () =>
    sanitizeRuleSlots(store.get(RULE_SLOTS_KEY, null)) ?? {
      slots: [{ name: t("내 규칙 {n}", { n: 1 }), body: sanitizeRuleBody(store.get("customRules", MODERN) ?? MODERN) }],
      active: 0,
    };
  const write = state => {
    store.set(RULE_SLOTS_KEY, state);
    store.set("customRules", state.slots[state.active].body);
    return state;
  };
  /** 이름이 겹치면 뒤에 번호를 붙인다("받은 규칙", "받은 규칙 2") */
  const uniqueName = (slots, name) => {
    const taken = new Set(slots.map(s => s.name));
    if (!taken.has(name)) return name;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = name.slice(0, MAX_RULE_NAME - suffix.length).trimEnd() + suffix;
      if (!taken.has(candidate)) return candidate;
    }
  };
  return {
    /** @returns {{ slots: { name: string, body: any }[], active: number }} */
    read,
    /** 지금 고른 규칙 */
    active: () => {
      const s = read();
      return s.slots[s.active];
    },
    select(index) {
      const s = read();
      if (index >= 0 && index < s.slots.length) write({ ...s, active: index });
    },
    /** 지금 고른 규칙의 내용을 바꾼다(편집기) */
    update(body) {
      const s = read();
      s.slots[s.active] = { ...s.slots[s.active], body: sanitizeRuleBody(body) };
      write(s);
    },
    rename(name) {
      const s = read();
      const current = s.slots[s.active];
      const others = s.slots.filter((_, i) => i !== s.active);
      s.slots[s.active] = { ...current, name: uniqueName(others, cleanName(name, current.name)) };
      write(s);
      return s.slots[s.active].name;
    },
    /**
     * 새 칸을 만들어 고른다. 가득 찼으면(10개) 만들지 않고 false.
     * @returns {boolean}
     */
    add(name, body) {
      const s = read();
      if (s.slots.length >= MAX_RULE_SLOTS) return false;
      s.slots.push({
        name: uniqueName(s.slots, cleanName(name, t("내 규칙 {n}", { n: s.slots.length + 1 }))),
        body: sanitizeRuleBody(body),
      });
      write({ ...s, active: s.slots.length - 1 });
      return true;
    },
    /** 지금 고른 칸을 지운다(마지막 하나는 지우지 않는다) */
    remove() {
      const s = read();
      if (s.slots.length <= 1) return false;
      s.slots.splice(s.active, 1);
      write({ slots: s.slots, active: Math.min(s.active, s.slots.length - 1) });
      return true;
    },
  };
};
