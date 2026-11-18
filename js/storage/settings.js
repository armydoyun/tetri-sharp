// 사용자 설정: 조작감(Handling, ms 단위)과 키 배치. 저장된 값은 항상 검증·보정해서 쓴다.
import { msToFrames } from "../core/engine.js";
import { DEFAULT_KEYMAP, sanitizeKeymap } from "../input/keymap.js";
import { DEFAULT_PADMAP, sanitizePadmap } from "../input/gamepad.js";
import { DEFAULT_THEME, THEME_IDS } from "../render/themes.js";
import { LANG_OPTIONS } from "../i18n/index.js";

export const SETTINGS_VERSION = 1;
export const SDF_INFINITE = 41; // 슬라이더 맨 끝 = 즉시 바닥까지

/** [최소, 최대, 기본] */
export const HANDLING_LIMITS = Object.freeze({
  das: Object.freeze({ min: 0, max: 333, step: 1, default: 133 }),
  arr: Object.freeze({ min: 0, max: 83, step: 1, default: 10 }),
  sdf: Object.freeze({ min: 5, max: SDF_INFINITE, step: 1, default: 20 }),
});

export const TOUCH_OPTIONS = Object.freeze(["auto", "on", "off"]);
export const SCHEME_OPTIONS = Object.freeze(["system", "light", "dark"]);
/** 게임 화면: dark(늘 어둡게) · scheme(화면 색 따르기) */
export const GAME_SURFACE_OPTIONS = Object.freeze(["dark", "scheme"]);

export const VISUAL_OPTIONS = Object.freeze({
  // 게임 테마(블록·격자·움직임·연출의 모습) — js/render/themes.js
  theme: THEME_IDS,
  // 접근성: 테마와 상관없이 적용
  effects: Object.freeze(["full", "reduced", "off"]),
  palette: Object.freeze(["theme", "contrast"]),
  // 블록 무늬: 피스마다 다른 무늬(색을 구분하기 어려워도 알아볼 수 있게)
  pattern: Object.freeze(["off", "on"]),
  // 고스트 진하기
  ghost: Object.freeze(["normal", "strong", "faint"]),
  // 격자 선
  grid: Object.freeze(["on", "off"]),
});

/** 접근성·편의: 화면 읽기 알림, 진동, 카운트다운 길이 */
export const ACCESS_OPTIONS = Object.freeze({
  announce: Object.freeze(["on", "off"]),
  vibrate: Object.freeze(["on", "off"]),
  countdown: Object.freeze(["normal", "short", "off"]),
});
export const defaultAccess = () => ({ announce: "on", vibrate: "on", countdown: "normal" });
export const sanitizeAccess = raw => {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = defaultAccess();
  /** @type {any} */
  const out = {};
  for (const [key, allowed] of Object.entries(ACCESS_OPTIONS)) out[key] = allowed.includes(r[key]) ? r[key] : d[key];
  return out;
};

/** 터치 조작 방식: buttons(보드 아래 버튼) · gestures(보드를 밀고 두드리기) */
export const TOUCH_MODE_OPTIONS = Object.freeze(["buttons", "gestures"]);

/** 조작감 프리셋(ms·배율). 처음 하는 사람이 숫자를 몰라도 고를 수 있게 */
export const HANDLING_PRESETS = Object.freeze({
  relaxed: Object.freeze({ das: 200, arr: 50, sdf: 10 }),
  standard: Object.freeze({ das: 133, arr: 10, sdf: 20 }),
  fast: Object.freeze({ das: 100, arr: 0, sdf: 30 }),
  instant: Object.freeze({ das: 67, arr: 0, sdf: 41 }),
});
/** 지금 조작감과 같은 프리셋 id(없으면 null = 직접 조절) */
export const handlingPresetOf = h =>
  Object.entries(HANDLING_PRESETS).find(([, p]) => p.das === h.das && p.arr === h.arr && p.sdf === h.sdf)?.[0] ?? null;

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
  pattern: "off",
  ghost: "normal",
  grid: "on",
});

export const DEFAULT_SETTINGS = Object.freeze({
  v: SETTINGS_VERSION,
  handling: Object.freeze({ das: 133, arr: 10, sdf: 20 }),
  keymap: DEFAULT_KEYMAP,
  padmap: DEFAULT_PADMAP,
  /** 터치 버튼: auto(터치 화면이면) · on · off */
  touch: "auto",
  visual: Object.freeze(defaultVisual()),
  /** 효과음 크기 0~100 (0 = 끄기) */
  volume: 50,
  /** 화면 언어: auto(브라우저 언어) · ko · en */
  lang: "auto",
  /** 화면 색: system(기기 설정) · light · dark */
  scheme: "system",
  /** 게임 화면: dark(늘 어둡게, 기본) · scheme(화면 색을 따르기) */
  gameSurface: "dark",
  access: Object.freeze(defaultAccess()),
  touchMode: "buttons",
});

export const VOLUME_LIMITS = Object.freeze({ min: 0, max: 100, step: 5, default: 50 });

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
    touch: TOUCH_OPTIONS.includes(s.touch) ? s.touch : "auto",
    visual: sanitizeVisual(s.visual),
    volume: clampNum(s.volume, VOLUME_LIMITS),
    lang: LANG_OPTIONS.includes(s.lang) ? s.lang : "auto",
    scheme: SCHEME_OPTIONS.includes(s.scheme) ? s.scheme : "system",
    gameSurface: GAME_SURFACE_OPTIONS.includes(s.gameSurface) ? s.gameSurface : "dark",
    access: sanitizeAccess(s.access),
    touchMode: TOUCH_MODE_OPTIONS.includes(s.touchMode) ? s.touchMode : "buttons",
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
