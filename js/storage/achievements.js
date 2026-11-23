// 업적: 판이 끝날 때 한 번 판정해 처음 이룬 것만 남긴다. 이 기기에 저장하고 백업에 담는다.
// 저장 형식: { [업적 id]: 처음 이룬 날짜(ISO) }. 모르는 id나 날짜가 아닌 값은 읽을 때 버린다.
// 플레이 업적(4줄·T-spin 등)은 실제 모드·오늘의 도전·CPU 대전에서만 센다 — 연습·퍼즐은 자리를 깔아 주므로.
import { t } from "../i18n/index.js";
import { rankOf, RANK_ORDER } from "../modes/ranks.js";

export const ACHIEVEMENTS_KEY = "achievements";

const MIN = 3600; // 1분 = 3600프레임

/**
 * @typedef {{ mode: any, state: any, real: boolean, won: boolean, puzzlesCleared: Set<number>, puzzles: readonly any[] }} Context
 *   real: 실제 플레이(메뉴의 모드·오늘의 도전·CPU 대전). won: CPU 대전에서 이겼는가
 * @typedef {{ id: string, group: string, name: string, description: string, test: (c: Context) => boolean }} Achievement
 */

const play = (id, name, description, test) => ({
  id,
  group: "play",
  name,
  description,
  test: c => c.real && test(c.state),
});
const inMode = (id, modeId, name, description, test) => ({
  id,
  group: "modes",
  name,
  description,
  test: c => c.mode.id === modeId && test(c.state, c.mode),
});
const clears = (state, key) => (state.tally?.clears?.[key] ?? 0) > 0;
const runRank = (state, mode) =>
  rankOf(mode, { frames: state.frame, score: state.score, lines: state.stats.lines, level: state.level });

/** @type {ReadonlyArray<Achievement>} */
export const ACHIEVEMENTS = Object.freeze([
  play("first-line", t("첫 줄"), t("줄을 처음으로 지우기"), s => s.stats.lines > 0),
  play("quad", t("4줄 한 번에"), t("한 피스로 4줄 지우기"), s => clears(s, "none-4")),
  play("tsd", "T-spin Double", t("T를 돌려 넣어 2줄 지우기"), s => clears(s, "full-2")),
  play("tst", "T-spin Triple", t("T를 돌려 넣어 3줄 지우기"), s => clears(s, "full-3")),
  play("perfect", t("퍼펙트 클리어"), t("판을 완전히 비우기"), s => (s.tally?.perfect ?? 0) > 0),
  play("combo5", t("5콤보"), t("줄을 지우는 고정 6번 연속"), s => (s.tally?.maxCombo ?? 0) >= 5),
  play("b2b4", t("백투백 4연속"), t("4줄·T-spin 같은 어려운 삭제 4번 연속"), s => (s.tally?.maxB2b ?? 0) >= 4),

  inMode("sprint-clear", "sprint40", t("Sprint 완주"), t("Sprint 40L 끝까지"), s => s.over === "clear"),
  inMode(
    "sprint-2m",
    "sprint40",
    t("Sprint 2분"),
    t("Sprint 40L 2분 안에"),
    s => s.over === "clear" && s.frame <= 2 * MIN
  ),
  inMode("sprint-1m", "sprint40", t("Sprint 1분"), t("Sprint 40L 1분 안에"), s => s.over === "clear" && s.frame <= MIN),
  inMode("marathon-clear", "marathon", t("Marathon 완주"), t("150줄 끝까지"), s => s.over === "clear"),
  inMode("ultra-30k", "ultra", t("Ultra 3만 점"), t("2분 동안 30,000점"), s => s.over === "timeUp" && s.score >= 30000),
  inMode("master-500", "master", t("20G 진입"), t("Master 레벨 500"), s => s.level >= 500),
  inMode("master-999", "master", t("Master 완주"), t("Master 레벨 999"), s => s.level >= 999),
  inMode("dig-clear", "dig", t("다 파냄"), t("Dig 쓰레기 10줄 모두"), s => s.over === "clear"),
  inMode("survival-3m", "survival", t("3분 버티기"), t("Survival 3분"), s => s.frame >= 3 * MIN),
  inMode("endless-100", "endless", t("Endless 100줄"), t("Endless에서 100줄"), s => s.stats.lines >= 100),
  {
    id: "rank-s",
    group: "modes",
    name: t("랭크 S"),
    description: t("아무 모드에서나 랭크 S 이상"),
    test: c => c.real && c.mode.isRecordable?.(c.state) && RANK_ORDER.indexOf(runRank(c.state, c.mode)) >= 4,
  },
  {
    id: "daily",
    group: "modes",
    name: t("오늘의 도전"),
    description: t("오늘의 도전 끝까지"),
    test: c => Boolean(c.mode.daily) && c.state.over === (c.mode.race?.finish ?? "clear"),
  },

  {
    id: "cpu-win",
    group: "cpu",
    name: t("첫 승리"),
    description: t("CPU 이기기"),
    test: c => Boolean(c.mode.versus) && c.won,
  },
  {
    id: "cpu-hard",
    group: "cpu",
    name: t("어려움 격파"),
    description: t("어려움 이상의 CPU 이기기"),
    test: c => Boolean(c.mode.versus) && c.won && ["hard", "hard-plus", "master"].includes(c.mode.versus.id),
  },
  {
    id: "cpu-master",
    group: "cpu",
    name: t("최강 격파"),
    description: t("최강 CPU 이기기"),
    test: c => Boolean(c.mode.versus) && c.won && c.mode.versus.id === "master",
  },

  {
    id: "puzzle-pc",
    group: "puzzle",
    name: t("판 비우기 장"),
    description: t("퍼즐 판 비우기 장 모두"),
    test: c => c.puzzles.filter(p => p.kind === "pc").every(p => c.puzzlesCleared.has(p.id)),
  },
  {
    id: "puzzle-all",
    group: "puzzle",
    name: t("퍼즐 완주"),
    description: t("퍼즐 30단계 모두"),
    test: c => c.puzzles.every(p => c.puzzlesCleared.has(p.id)),
  },
]);

export const ACHIEVEMENT_GROUPS = Object.freeze([
  ["play", t("플레이")],
  ["modes", t("모드")],
  ["cpu", t("CPU 대전")],
  ["puzzle", t("퍼즐")],
]);

const IDS = new Set(ACHIEVEMENTS.map(a => a.id));

/** 저장된 값(또는 백업 파일)을 믿을 수 있는 값으로: 아는 id와 날짜 문자열만 */
export const sanitizeAchievements = raw => {
  /** @type {Record<string, string>} */
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, date] of Object.entries(raw)) {
    if (IDS.has(id) && typeof date === "string" && date.length <= 40 && !Number.isNaN(Date.parse(date))) out[id] = date;
  }
  return out;
};

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createAchievements = store => {
  const read = () => sanitizeAchievements(store.get(ACHIEVEMENTS_KEY, {}));
  return {
    /** @returns {Record<string, string>} id → 처음 이룬 날짜 */
    unlocked: read,
    /**
     * 판이 끝났을 때: 이번에 처음 이룬 업적을 남기고 돌려준다.
     * @param {Context} context
     * @returns {Achievement[]}
     */
    evaluate(context, date = new Date().toISOString()) {
      const done = read();
      const fresh = ACHIEVEMENTS.filter(a => !done[a.id] && a.test(context));
      if (!fresh.length) return [];
      for (const a of fresh) done[a.id] = date;
      store.set(ACHIEVEMENTS_KEY, done);
      return fresh;
    },
  };
};
