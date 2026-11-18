// 모드: 목표·종료 조건·레벨 진행·HUD·기록 방식. 조작 물리는 RuleSet(rules/presets.js)이 정한다.
// 모든 함수가 순수 함수라 엔진과 함께 Node 테스트에서 그대로 돈다.
import { MODERN } from "../rules/presets.js";
import { GARBAGE } from "../core/pieces.js";
import { get, set } from "../core/board.js";
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
 * @property {{ metric: "frames" | "lines" | "score" | "level", order: "asc" | "desc" }} record  순위 기준
 * @property {(state: any) => string} [hudLevel]  HUD 레벨 칸 (기본: 레벨 숫자)
 * @property {readonly number[]} [splits]  구간 기록을 남길 줄 수
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
  /** 구간 기록: 이 줄 수에 닿은 시각을 남겨 최고 기록과 비교한다 */
  splits: Object.freeze([10, 20, 30, 40]),
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
  description: "150줄 · 10줄마다 빨라진다",
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
  description: "2분 동안 최고 점수",
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

// ---- Master: 레벨 0 → 999. 고정할 때마다 +1(구간 끝 x99에서는 멈춤), 줄을 지우면 지운 줄 수만큼 +.
// 레벨에 따라 중력이 오르다 200에서 한 번 늦춰지고, 500부터 20G. ----

/** [시작 레벨, 중력(1/256 G 단위)] — 아케이드 게임의 고전적인 곡선을 따른다. */
export const MASTER_GRAVITY = Object.freeze([
  [0, 4],
  [30, 6],
  [35, 8],
  [40, 10],
  [50, 12],
  [60, 16],
  [70, 32],
  [80, 48],
  [90, 64],
  [100, 80],
  [120, 96],
  [140, 112],
  [160, 128],
  [170, 144],
  [200, 4],
  [220, 32],
  [230, 64],
  [233, 96],
  [236, 128],
  [239, 160],
  [243, 192],
  [247, 224],
  [251, 256],
  [300, 512],
  [330, 768],
  [360, 1024],
  [400, 1280],
  [420, 1024],
  [450, 768],
  [500, 5120],
]);

export const masterGravity = level => {
  let g = MASTER_GRAVITY[0][1];
  for (const [from, value] of MASTER_GRAVITY) if (level >= from) g = value;
  return g / 256;
};

const MASTER_MAX = 999;

/** @type {Mode} */
export const MASTER = Object.freeze({
  id: "master",
  name: "Master",
  description: "레벨 999까지 · 500부터 20G",
  rules: MODERN,
  initialLevel: 0,
  levelStep: 100,
  levelAfterLock: (state, lines) => {
    const L = state.level;
    if (lines > 0) return Math.min(MASTER_MAX, L + lines);
    // 구간 끝(x99)과 998에서는 줄을 지워야만 넘어간다.
    return L % 100 === 99 || L === MASTER_MAX - 1 ? L : L + 1;
  },
  gravityFor: state => masterGravity(state.level),
  scoreLevel: state => 1 + Math.floor(state.level / 100),
  check: state => (state.level >= MASTER_MAX ? { result: "clear" } : null),
  hudLines: state => ({ label: "줄", value: String(state.stats.lines) }),
  hudLevel: state => `${state.level} / ${Math.min(MASTER_MAX, (Math.floor(state.level / 100) + 1) * 100)}`,
  hudTime: elapsed,
  summary: state => ({
    title: state.over === "clear" ? "완료!" : "게임 오버",
    main: `레벨 ${state.level}`,
  }),
  record: Object.freeze({ metric: "level", order: "desc" }),
  formatRecord: e => `레벨 ${e.level ?? 0}`,
  isRecordable: state => state.level > 0,
});

// ---- Dig: 바닥에 깔린 쓰레기 줄(줄마다 구멍 하나)을 모두 파내기 ----

const DIG_ROWS = 10;

/** 쓰레기 줄이 몇 개 남았는지(가비지 칸이 하나라도 있는 줄 수) */
export const garbageRows = board => {
  let n = 0;
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (get(board, x, y) === GARBAGE) {
        n += 1;
        break;
      }
    }
  }
  return n;
};

/** @type {Mode} */
export const DIG = Object.freeze({
  id: "dig",
  name: "Dig",
  description: `쓰레기 ${DIG_ROWS}줄을 가장 빨리 파내기`,
  rules: MODERN,
  goal: DIG_ROWS,
  setup: (state, rng) => {
    const b = state.board;
    let hole = -1;
    for (let i = 0; i < DIG_ROWS; i++) {
      // 바로 위 줄과 같은 열에는 구멍을 내지 않는다(한 번에 여러 줄이 뚫리지 않게).
      let h = rng.int(b.width - 1);
      if (h >= hole && hole >= 0) h += 1;
      hole = h;
      const y = b.height - 1 - i;
      for (let x = 0; x < b.width; x++) if (x !== h) set(b, x, y, GARBAGE);
    }
  },
  check: state => (garbageRows(state.board) === 0 ? { result: "clear" } : null),
  hudLines: state => ({ label: "남은 쓰레기", value: String(garbageRows(state.board)) }),
  hudTime: elapsed,
  summary: state =>
    state.over === "clear"
      ? { title: "완료!", main: formatTime(state.frame) }
      : { title: "게임 오버", main: `${DIG_ROWS - garbageRows(state.board)} / ${DIG_ROWS}줄` },
  record: Object.freeze({ metric: "frames", order: "asc" }),
  formatRecord: recordTime,
  isRecordable: state => state.over === "clear",
});

/** @type {Mode} */
export const ZEN = Object.freeze({
  id: "zen",
  name: "Endless",
  description: "막힐 때까지 끝없이",
  rules: MODERN,
  check: () => null,
  hudLines: state => ({ label: "줄", value: String(state.stats.lines) }),
  hudTime: elapsed,
  summary: state => ({ title: "게임 오버", main: `${state.stats.lines}줄` }),
  record: Object.freeze({ metric: "lines", order: "desc" }),
  formatRecord: recordLines,
  isRecordable: state => state.stats.lines > 0,
});

export const MODES = Object.freeze([SPRINT_40, MARATHON, ULTRA, MASTER, DIG, ZEN]);
export const findMode = id => MODES.find(m => m.id === id) ?? SPRINT_40;
