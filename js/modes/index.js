// 모드: 목표·종료 조건·레벨 진행·HUD·기록 방식. 조작 물리는 RuleSet(rules/presets.js)이 정한다.
// 모든 함수가 순수 함수라 엔진과 함께 Node 테스트에서 그대로 돈다.
import { MODERN } from "../rules/presets.js";
import { formatScore, formatTime } from "./format.js";

/**
 * @typedef {Object} Mode
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {import("../rules/presets.js").RuleSet} rules
 * @property {(state: any, events: any[]) => null | { result: string }} check
 * @property {(state: any) => number} [levelFor]
 * @property {(state: any) => number} [gravityFor]
 * @property {(state: any) => { label: string, value: string }} hudLines
 * @property {(state: any) => { label: string, frames: number }} hudTime   경과 또는 남은 시간
 * @property {(state: any) => { title: string, main: string }} summary    결과 화면 제목·큰 글씨
 * @property {{ metric: "frames" | "lines" | "score", order: "asc" | "desc" }} record  순위 기준
 * @property {(entry: any) => string} formatRecord
 * @property {(state: any) => boolean} isRecordable  이번 판을 기록에 남길지
 */

// ---- 레벨·중력 ----

export const MAX_LEVEL = 15;
export const LINES_PER_LEVEL = 10;

/** 가이드라인 중력 곡선: 한 줄 내려오는 데 (0.8 − (L−1)·0.007)^(L−1) 초 → 프레임당 칸 수 */
export const guidelineGravity = level => {
  const L = Math.min(Math.max(1, level), 20);
  const secondsPerRow = Math.pow(0.8 - (L - 1) * 0.007, L - 1);
  return 1 / (secondsPerRow * 60);
};

const levelByLines = state => Math.min(MAX_LEVEL, 1 + Math.floor(state.stats.lines / LINES_PER_LEVEL));

const elapsed = state => ({ label: "시간", frames: state.frame });
const recordTime = e => formatTime(e.frames);
const recordLines = e => `${e.lines}줄`;
const recordScore = e => `${formatScore(e.score ?? 0)}점`;

// ---- 모드 ----

const SPRINT_GOAL = 40;

/** @type {Mode} */
export const SPRINT_40 = Object.freeze({
  id: "sprint40",
  name: "Sprint 40L",
  description: "40줄을 가장 빨리 지우기",
  rules: MODERN,
  goal: SPRINT_GOAL,
  check: state => (state.stats.lines >= SPRINT_GOAL ? { result: "clear" } : null),
  hudLines: state => ({ label: "남은 줄", value: String(Math.max(0, SPRINT_GOAL - state.stats.lines)) }),
  hudTime: elapsed,
  summary: state =>
    state.over === "clear"
      ? { title: "완료!", main: formatTime(state.frame) }
      : { title: "게임 오버", main: `${state.stats.lines} / ${SPRINT_GOAL}줄` },
  record: Object.freeze({ metric: "frames", order: "asc" }),
  formatRecord: recordTime,
  isRecordable: state => state.over === "clear",
});

const MARATHON_GOAL = 150;

/** @type {Mode} */
export const MARATHON = Object.freeze({
  id: "marathon",
  name: "Marathon",
  description: "150줄 — 10줄마다 레벨업, 점점 빨라진다",
  rules: MODERN,
  goal: MARATHON_GOAL,
  check: state => (state.stats.lines >= MARATHON_GOAL ? { result: "clear" } : null),
  levelFor: levelByLines,
  gravityFor: state => guidelineGravity(state.level),
  hudLines: state => ({ label: "줄", value: `${state.stats.lines} / ${MARATHON_GOAL}` }),
  hudTime: elapsed,
  summary: state => ({
    title: state.over === "clear" ? "완료!" : "게임 오버",
    main: `${formatScore(state.score)}점`,
  }),
  record: Object.freeze({ metric: "score", order: "desc" }),
  formatRecord: recordScore,
  isRecordable: state => state.score > 0,
});

const ULTRA_FRAMES = 2 * 60 * 60;

/** @type {Mode} */
export const ULTRA = Object.freeze({
  id: "ultra",
  name: "Ultra",
  description: "2분 동안 최고 점수 — T-spin과 B2B를 노려라",
  rules: MODERN,
  timeLimit: ULTRA_FRAMES,
  check: state => (state.frame >= ULTRA_FRAMES ? { result: "timeUp" } : null),
  hudLines: state => ({ label: "줄", value: String(state.stats.lines) }),
  hudTime: state => ({ label: "남은 시간", frames: ULTRA_FRAMES - state.frame }),
  summary: state => ({
    title: state.over === "timeUp" ? "시간 종료!" : "게임 오버",
    main: `${formatScore(state.score)}점`,
  }),
  record: Object.freeze({ metric: "score", order: "desc" }),
  formatRecord: recordScore,
  isRecordable: state => state.score > 0,
});

/** @type {Mode} */
export const ZEN = Object.freeze({
  id: "zen",
  name: "Endless",
  description: "끝없이 쌓고 지우기 — 막힐 때까지",
  rules: MODERN,
  check: () => null,
  hudLines: state => ({ label: "줄", value: String(state.stats.lines) }),
  hudTime: elapsed,
  summary: state => ({ title: "게임 오버", main: `${state.stats.lines}줄` }),
  record: Object.freeze({ metric: "lines", order: "desc" }),
  formatRecord: recordLines,
  isRecordable: state => state.stats.lines > 0,
});

export const MODES = Object.freeze([SPRINT_40, MARATHON, ULTRA, ZEN]);
export const findMode = id => MODES.find(m => m.id === id) ?? SPRINT_40;
