// 사용자 설정: 조작감(Handling, ms 단위)과 키 배치. 저장된 값은 항상 검증·보정해서 쓴다.
import { msToFrames } from "../core/engine.js";
import { DEFAULT_KEYMAP, sanitizeKeymap } from "../input/keymap.js";
import { DEFAULT_PADMAP, sanitizePadmap } from "../input/gamepad.js";
import { DEFAULT_THEME, THEME_IDS } from "../render/themes.js";

export const SETTINGS_VERSION = 1;
export const SDF_INFINITE = 41; // 슬라이더 맨 끝 = 즉시 바닥까지

/** [최소, 최대, 기본] */
export const HANDLING_LIMITS = Object.freeze({
  das: Object.freeze({ min: 0, max: 333, step: 1, default: 133 }),
  arr: Object.freeze({ min: 0, max: 83, step: 1, default: 10 }),
  sdf: Object.freeze({ min: 5, max: SDF_INFINITE, step: 1, default: 20 }),
});

export const VISUAL_OPTIONS = Object.freeze({
  // 게임 테마(블록·격자·움직임·연출의 모습) — js/render/themes.js
  theme: THEME_IDS,
  // 접근성: 테마와 상관없이 적용
  effects: Object.freeze(["full", "reduced", "off"]),
  palette: Object.freeze(["theme", "contrast"]),
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
  theme: DEFAULT_THEME,
  effects: prefersReducedMotion() ? "reduced" : "full",
  palette: "theme",
});

export const DEFAULT_SETTINGS = Object.freeze({
  v: SETTINGS_VERSION,
  handling: Object.freeze({ das: 133, arr: 10, sdf: 20 }),
  keymap: DEFAULT_KEYMAP,
  padmap: DEFAULT_PADMAP,
  visual: Object.freeze(defaultVisual()),
});

export const sanitizeVisual = raw => {
  const r = { ...(raw && typeof raw === "object" ? raw : {}) };
  // 예전 형식: palette "default"는 지금의 "theme"(테마 색). skin(블록 모양)은 테마로 흡수됐다.
  if (r.palette === "default") r.palette = "theme";
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
    padmap: sanitizePadmap(s.padmap ?? DEFAULT_PADMAP),
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
