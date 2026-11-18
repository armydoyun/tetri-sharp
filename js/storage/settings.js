// 사용자 설정: 조작감(Handling, ms 단위)과 키 배치. 저장된 값은 항상 검증·보정해서 쓴다.
import { msToFrames } from "../core/engine.js";
import { DEFAULT_KEYMAP, sanitizeKeymap } from "../input/keymap.js";

export const SETTINGS_VERSION = 1;
export const SDF_INFINITE = 41; // 슬라이더 맨 끝 = 즉시 바닥까지

/** [최소, 최대, 기본] */
export const HANDLING_LIMITS = Object.freeze({
  das: Object.freeze({ min: 0, max: 333, step: 1, default: 133 }),
  arr: Object.freeze({ min: 0, max: 83, step: 1, default: 10 }),
  sdf: Object.freeze({ min: 5, max: SDF_INFINITE, step: 1, default: 20 }),
});

export const VISUAL_OPTIONS = Object.freeze({
  effects: Object.freeze(["full", "reduced", "off"]),
  skin: Object.freeze(["flat", "bevel", "outline"]),
  palette: Object.freeze(["default", "contrast"]),
});

/** 동작 줄이기를 켠 환경이면 효과 기본값을 "reduced"로 */
const prefersReducedMotion = () => {
  try {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
};

export const defaultVisual = () => ({
  effects: prefersReducedMotion() ? "reduced" : "full",
  skin: "bevel",
  palette: "default",
});

export const DEFAULT_SETTINGS = Object.freeze({
  v: SETTINGS_VERSION,
  handling: Object.freeze({ das: 133, arr: 10, sdf: 20 }),
  keymap: DEFAULT_KEYMAP,
  visual: Object.freeze(defaultVisual()),
});

export const sanitizeVisual = raw => {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = defaultVisual();
  /** @type {any} */
  const out = {};
  for (const [key, allowed] of Object.entries(VISUAL_OPTIONS)) out[key] = allowed.includes(r[key]) ? r[key] : d[key];
  return out;
};

const clampNum = (value, { min, max, default: fallback }) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export const sanitizeHandling = raw => {
  const h = raw && typeof raw === "object" ? raw : {};
  return {
    das: clampNum(h.das, HANDLING_LIMITS.das),
    arr: clampNum(h.arr, HANDLING_LIMITS.arr),
    sdf: clampNum(h.sdf, HANDLING_LIMITS.sdf),
  };
};

export const sanitizeSettings = raw => {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    v: SETTINGS_VERSION,
    handling: sanitizeHandling(s.handling ?? DEFAULT_SETTINGS.handling),
    keymap: sanitizeKeymap(s.keymap ?? DEFAULT_KEYMAP),
    visual: sanitizeVisual(s.visual),
  };
};

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const loadSettings = store => sanitizeSettings(store.get("settings", null));
export const saveSettings = (store, settings) => store.set("settings", sanitizeSettings(settings));

/** 설정(ms) → 엔진(프레임) */
export const toEngineHandling = h => ({
  das: msToFrames(h.das),
  arr: msToFrames(h.arr),
  sdf: h.sdf >= SDF_INFINITE ? Infinity : h.sdf,
});
