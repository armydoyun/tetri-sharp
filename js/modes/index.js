// 모드: 목표·종료 조건·레벨 진행·HUD·기록 방식. 조작 물리는 RuleSet(rules/presets.js)이 정한다.
// 모든 함수가 순수 함수라 엔진과 함께 Node 테스트에서 그대로 돈다.
import { MODERN } from "../rules/presets.js";
import { GARBAGE } from "../core/pieces.js";
import { get, set } from "../core/board.js";
import { findPractice } from "./practice.js";
import { formatScore, formatTime } from "./format.js";
import { t } from "../i18n/index.js";

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
 * @property {readonly string[]} [hud]  정보 칸에 보일 항목(time·score·level·lines·pieces·pps·split)
 * @property {(entry: any) => string} formatRecord
 * @property {(state: any) => boolean} isRecordable  이번 판을 기록에 남길지
 * @property {{ finish: string, progress: (state: any) => { value: number, max: number, text: string } }} [race]
 *   "내 기록과 달리기"를 할 수 있는 모드: 최고 기록 리플레이가 끝나야 하는 결과와 진행 막대
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

const elapsed = state => ({ label: t("시간"), frames: state.frame });
const recordTime = e => formatTime(e.frames);
const recordLines = e => t("{n}줄", { n: e.lines });
const recordScore = e => t("{n}점", { n: formatScore(e.score ?? 0) });

// ---- 모드 ----

const SPRINT_GOAL = 40;

/** @type {Mode} */
export const SPRINT_40 = Object.freeze({
  id: "sprint40",
  name: "Sprint 40L",
  description: t("40줄을 가장 빨리 지우기"),
  rules: MODERN,
  goal: SPRINT_GOAL,
  /** 구간 기록: 이 줄 수에 닿은 시각을 남겨 최고 기록과 비교한다 */
  splits: Object.freeze([10, 20, 30, 40]),
  hud: Object.freeze(["time", "lines", "pieces", "pps", "split"]),
  check: state => (state.stats.lines >= SPRINT_GOAL ? { result: "clear" } : null),
  hudLines: state => ({ label: t("남은 줄"), value: String(Math.max(0, SPRINT_GOAL - state.stats.lines)) }),
  hudTime: elapsed,
  summary: state =>
    state.over === "clear"
      ? { title: t("완료!"), main: formatTime(state.frame) }
      : { title: t("게임 오버"), main: t("{n} / {goal}줄", { n: state.stats.lines, goal: SPRINT_GOAL }) },
  record: Object.freeze({ metric: "frames", order: "asc" }),
  formatRecord: recordTime,
  isRecordable: state => state.over === "clear",
  race: Object.freeze({
    finish: "clear",
    progress: state => {
      const lines = Math.min(SPRINT_GOAL, state.stats.lines);
      return { value: lines, max: SPRINT_GOAL, text: t("{n} / {goal}줄", { n: lines, goal: SPRINT_GOAL }) };
    },
  }),
});

const MARATHON_GOAL = 150;

/** @type {Mode} */
export const MARATHON = Object.freeze({
  id: "marathon",
  hud: Object.freeze(["time", "score", "level", "lines", "pieces", "pps"]),
  name: "Marathon",
  description: t("150줄 · 10줄마다 빨라진다"),
  rules: MODERN,
  goal: MARATHON_GOAL,
  check: state => (state.stats.lines >= MARATHON_GOAL ? { result: "clear" } : null),
  levelFor: levelByLines,
  gravityFor: state => guidelineGravity(state.level),
  hudLines: state => ({ label: t("줄"), value: `${state.stats.lines} / ${MARATHON_GOAL}` }),
  hudTime: elapsed,
  summary: state => ({
    title: state.over === "clear" ? t("완료!") : t("게임 오버"),
    main: t("{n}점", { n: formatScore(state.score) }),
  }),
  record: Object.freeze({ metric: "score", order: "desc" }),
  formatRecord: recordScore,
  isRecordable: state => state.score > 0,
});

const ULTRA_FRAMES = 2 * 60 * 60;

/** @type {Mode} */
export const ULTRA = Object.freeze({
  id: "ultra",
  hud: Object.freeze(["time", "score", "lines", "pieces", "pps"]),
  name: "Ultra",
  description: t("2분 동안 최고 점수"),
  rules: MODERN,
  timeLimit: ULTRA_FRAMES,
  check: state => (state.frame >= ULTRA_FRAMES ? { result: "timeUp" } : null),
  hudLines: state => ({ label: t("줄"), value: String(state.stats.lines) }),
  hudTime: state => ({ label: t("남은 시간"), frames: ULTRA_FRAMES - state.frame }),
  summary: state => ({
    title: state.over === "timeUp" ? t("시간 종료!") : t("게임 오버"),
    main: t("{n}점", { n: formatScore(state.score) }),
  }),
  record: Object.freeze({ metric: "score", order: "desc" }),
  formatRecord: recordScore,
  isRecordable: state => state.score > 0,
  race: Object.freeze({
    finish: "timeUp",
    progress: state => ({
      value: Math.min(ULTRA_FRAMES, state.frame),
      max: ULTRA_FRAMES,
      text: t("{n}점", { n: formatScore(state.score) }),
    }),
  }),
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
  hud: Object.freeze(["time", "level", "lines", "pieces", "pps"]),
  name: "Master",
  description: t("레벨 999까지 · 500부터 20G"),
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
  hudLines: state => ({ label: t("줄"), value: String(state.stats.lines) }),
  hudLevel: state => `${state.level} / ${Math.min(MASTER_MAX, (Math.floor(state.level / 100) + 1) * 100)}`,
  hudTime: elapsed,
  summary: state => ({
    title: state.over === "clear" ? t("완료!") : t("게임 오버"),
    main: t("레벨 {n}", { n: state.level }),
  }),
  record: Object.freeze({ metric: "level", order: "desc" }),
  formatRecord: e => t("레벨 {n}", { n: e.level ?? 0 }),
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
  hud: Object.freeze(["time", "lines", "pieces", "pps"]),
  name: "Dig",
  description: t("쓰레기 {n}줄을 가장 빨리 파내기", { n: DIG_ROWS }),
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
  hudLines: state => ({ label: t("남은 쓰레기"), value: String(garbageRows(state.board)) }),
  hudTime: elapsed,
  summary: state =>
    state.over === "clear"
      ? { title: t("완료!"), main: formatTime(state.frame) }
      : {
          title: t("게임 오버"),
          main: t("{n} / {goal}줄", { n: DIG_ROWS - garbageRows(state.board), goal: DIG_ROWS }),
        },
  record: Object.freeze({ metric: "frames", order: "asc" }),
  formatRecord: recordTime,
  isRecordable: state => state.over === "clear",
  race: Object.freeze({
    finish: "clear",
    progress: state => {
      const dug = DIG_ROWS - garbageRows(state.board);
      return { value: dug, max: DIG_ROWS, text: t("{n} / {goal}줄", { n: dug, goal: DIG_ROWS }) };
    },
  }),
});

// ---- Survival: 시간이 갈수록 쓰레기 줄이 쌓여 대기한다. 줄을 지우면 대기 중인 줄을 막고(T-spin은 두 배),
// 줄을 못 지우고 고정하면 대기 중인 줄이 한꺼번에 아래에서 올라온다. 막힐 때까지 버틴 시간이 기록. ----

export const SURVIVAL_LEVEL_FRAMES = 30 * 60;
/** 쓰레기 한 줄이 쌓이기까지의 프레임(레벨이 오를수록 짧다) */
export const survivalInterval = level => Math.max(60, 300 - (level - 1) * 20);
/** 줄을 지웠을 때 막는 쓰레기 줄 수 */
export const survivalBlock = lockEvent => lockEvent.lines * (lockEvent.tspin === "full" ? 2 : 1);
/** 같은 구멍이 이어질 확률(%) — 구멍이 한 열에 모여 있어야 파낼 수 있다 */
const SAME_HOLE = 70;

/** 보드를 n줄 밀어 올리고 아래에 구멍 하나짜리 쓰레기 줄을 넣는다. */
export const raiseGarbage = (board, n, nextHole) => {
  const w = board.width;
  board.cells.copyWithin(0, n * w);
  for (let i = 0; i < n; i++) {
    const y = board.height - n + i;
    const hole = nextHole();
    for (let x = 0; x < w; x++) set(board, x, y, x === hole ? 0 : GARBAGE);
  }
};

/** @type {Mode} */
export const SURVIVAL = Object.freeze({
  id: "survival",
  hud: Object.freeze(["time", "level", "lines", "pieces", "pps"]),
  name: "Survival",
  description: t("올라오는 쓰레기 줄 버티기 · 줄을 지우면 막아요"),
  rules: MODERN,
  setup: (state, rng) => {
    state.garbage = { pending: 0, timer: 0, hole: rng.int(10), received: 0, blocked: 0, rng };
  },
  levelFor: state => Math.min(MAX_LEVEL, 1 + Math.floor(state.frame / SURVIVAL_LEVEL_FRAMES)),
  gravityFor: state => guidelineGravity(Math.min(state.level, 10)),
  onFrame: (state, events) => {
    const g = state.garbage;
    g.timer += 1;
    if (g.timer < survivalInterval(state.level)) return;
    g.timer = 0;
    g.pending += 1;
    events.push({ type: "garbagePending", pending: g.pending });
  },
  onLock: (state, ev, events) => {
    const g = state.garbage;
    if (ev.lines > 0) {
      const blocked = Math.min(g.pending, survivalBlock(ev));
      g.pending -= blocked;
      g.blocked += blocked;
      return false;
    }
    if (!g.pending) return false;
    const n = Math.min(g.pending, 12);
    raiseGarbage(state.board, n, () => {
      if (g.rng.int(100) >= SAME_HOLE) {
        const h = g.rng.int(state.board.width - 1);
        g.hole = h >= g.hole ? h + 1 : h;
      }
      return g.hole;
    });
    g.received += n;
    g.pending -= n;
    events.push({ type: "garbage", rows: n });
    return false;
  },
  check: () => null,
  hudLines: state => ({ label: t("받을 쓰레기"), value: String(state.garbage.pending) }),
  hudTime: elapsed,
  summary: state => ({ title: t("게임 오버"), main: formatTime(state.frame) }),
  record: Object.freeze({ metric: "frames", order: "desc" }),
  formatRecord: recordTime,
  isRecordable: state => state.stats.pieces > 0,
});

/** @type {Mode} */
export const ZEN = Object.freeze({
  id: "zen",
  hud: Object.freeze(["time", "score", "lines", "pieces", "pps"]),
  name: "Endless",
  description: t("막힐 때까지 끝없이"),
  rules: MODERN,
  check: () => null,
  hudLines: state => ({ label: t("줄"), value: String(state.stats.lines) }),
  hudTime: elapsed,
  summary: state => ({ title: t("게임 오버"), main: t("{n}줄", { n: state.stats.lines }) }),
  record: Object.freeze({ metric: "lines", order: "desc" }),
  formatRecord: recordLines,
  isRecordable: state => state.stats.lines > 0,
});

export const MODES = Object.freeze([SPRINT_40, MARATHON, ULTRA, MASTER, DIG, SURVIVAL, ZEN]);
/** "내 기록과 달리기"를 할 수 있는 모드 */
export const RACE_MODES = Object.freeze(MODES.filter(m => m.race));
export const findMode = id => MODES.find(m => m.id === id) ?? findPractice(id) ?? SPRINT_40;
