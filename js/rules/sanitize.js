// Custom 규칙 검증과 식별자. 저장된 규칙은 믿지 않고 허용된 값으로만 다시 만든다.
// Custom 규칙의 id는 내용의 해시 → 같은 조합이면 같은 기록표, 하나라도 다르면 다른 기록표.
import { MODERN } from "./presets.js";
import { ROTATIONS } from "./rotation/index.js";
import { RANDOMIZERS } from "./randomizer/index.js";
import { SCORINGS } from "./scoring/index.js";

export const LOCK_TYPES = Object.freeze(["moveReset", "stepReset", "infinite", "none"]);
export const TSPIN_TYPES = Object.freeze(["threeCorner", "none"]);
/** 고를 수 있는 기본 중력(프레임당 칸) */
export const GRAVITY_OPTIONS = Object.freeze([1 / 60, 1 / 48, 2 / 60, 6 / 60, 1, 20]);

/** 숫자 범위: [최소, 최대] @type {Readonly<Record<string, [number, number]>>} */
export const LIMITS = Object.freeze({
  previewCount: [0, 6],
  lockDelay: [0, 120],
  maxResets: [1, 30],
  are: [0, 60],
  das: [0, 30],
  arr: [0, 10],
  sdf: [1, 60],
});

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const clampInt = (value, [min, max], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);
const nearestGravity = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return MODERN.gravity;
  return GRAVITY_OPTIONS.reduce((best, g) => (Math.abs(g - n) < Math.abs(best - n) ? g : best));
};

/**
 * 규칙 내용만(이름·id 제외) 허용된 값으로 정리한다.
 * @returns {Omit<import("./presets.js").RuleSet, "id" | "name">}
 */
export const sanitizeRuleBody = raw => {
  const r = raw && typeof raw === "object" ? raw : {};
  const lock = r.lock && typeof r.lock === "object" ? r.lock : {};
  const are = r.are && typeof r.are === "object" ? r.are : {};
  const fixed = r.fixedHandling && typeof r.fixedHandling === "object" ? r.fixedHandling : null;
  const lockType = pick(lock.type, LOCK_TYPES, MODERN.lock.type);
  return {
    rotation: pick(r.rotation, Object.keys(ROTATIONS), MODERN.rotation),
    randomizer: pick(r.randomizer, Object.keys(RANDOMIZERS), MODERN.randomizer),
    previewCount: clampInt(r.previewCount, LIMITS.previewCount, MODERN.previewCount),
    hold: { enabled: bool(r.hold?.enabled, MODERN.hold.enabled) },
    ghost: bool(r.ghost, MODERN.ghost),
    hardDrop: bool(r.hardDrop, MODERN.hardDrop),
    lock: {
      type: lockType,
      delay: clampInt(lock.delay, LIMITS.lockDelay, MODERN.lock.delay),
      maxResets: clampInt(lock.maxResets, LIMITS.maxResets, MODERN.lock.maxResets),
    },
    are: {
      spawn: clampInt(are.spawn, LIMITS.are, 0),
      lineClear: clampInt(are.lineClear, LIMITS.are, 0),
    },
    gravity: nearestGravity(r.gravity),
    tspin: pick(r.tspin, TSPIN_TYPES, MODERN.tspin),
    scoring: pick(r.scoring, Object.keys(SCORINGS), MODERN.scoring),
    irs: bool(r.irs, MODERN.irs),
    ihs: bool(r.ihs, MODERN.ihs),
    fixedHandling: fixed
      ? {
          das: clampInt(fixed.das, LIMITS.das, 16),
          arr: clampInt(fixed.arr, LIMITS.arr, 6),
          sdf: clampInt(fixed.sdf, LIMITS.sdf, 30),
        }
      : null,
  };
};

/** 키 순서를 고정한 JSON (해시 입력용) */
const stableJson = value =>
  value && typeof value === "object"
    ? Array.isArray(value)
      ? `[${value.map(stableJson).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`)
          .join(",")}}`
    : JSON.stringify(value);

/** FNV-1a 32비트 → 7자리 base36 */
const hash = text => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
};

/** 규칙 내용으로 만든 식별자. 같은 내용이면 항상 같다. */
export const rulesId = body => `custom-${hash(stableJson(sanitizeRuleBody(body)))}`;

/**
 * 저장된 Custom 규칙 → 엔진에 넣을 RuleSet
 * @returns {import("./presets.js").RuleSet}
 */
export const makeCustomRules = raw => {
  const body = sanitizeRuleBody(raw);
  return Object.freeze({ id: rulesId(body), name: "Custom", ...body });
};
