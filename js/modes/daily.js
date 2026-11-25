// 오늘의 도전: 날짜로 정한 시드와 모드. 같은 날이면 누구나 같은 블록 순서, 규칙은 늘 Modern.
// 서버 없이도 공정하게 겨룰 수 있게 결과는 리플레이 코드로 주고받는다(js/replay/share.js).
// 모드는 날짜만으로 정해진다: ROTATION_START 전은 늘 Sprint 40L, 그날부터 Sprint 40L → Ultra → Dig를 날마다 돌린다.
// 리플레이·결과 코드는 열 때 날짜로 모드를 다시 만들어 검증하므로, 이미 지난 날짜의 모드는 바꾸지 않는다.
import { DIG, SPRINT_40, ULTRA } from "./index.js";
import { MODERN } from "../rules/presets.js";
import { t } from "../i18n/index.js";

/** 이 기기 시간대 기준 날짜 "YYYY-MM-DD" */
export const dateKey = (date = new Date()) => {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
};

/** 오늘부터 최근 7일의 로컬 달력 날짜. */
export const recentDailyKeys = (date = new Date()) => {
  const day = new Date(date);
  day.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, () => {
    const key = dateKey(day);
    day.setDate(day.getDate() - 1);
    return key;
  });
};

/** 날짜 → 32비트 시드(FNV-1a). 같은 날짜면 어디서나 같은 값 */
export const dailySeed = key => {
  let h = 0x811c9dc5;
  for (const ch of `tetri-sharp-daily-${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/** 이 날부터 날마다 모드가 바뀐다(이전 날짜는 Sprint 40L 그대로) */
export const ROTATION_START = "2026-12-01";
/** 몇 분 안에 끝나고 같은 블록 순서로 겨루기 좋은 모드들 */
const DAILY_ROTATION = Object.freeze([SPRINT_40, ULTRA, DIG]);

/** "YYYY-MM-DD" 두 날짜 사이 날 수(달력 기준, 시간대와 무관) */
const daysBetween = (from, to) => {
  const utc = key => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
};

/** 그날 도전의 바탕 모드 */
export const dailyBase = key =>
  key < ROTATION_START ? SPRINT_40 : DAILY_ROTATION[daysBetween(ROTATION_START, key) % DAILY_ROTATION.length];

const cache = new Map();

/** 날짜 → 모드(같은 날짜는 같은 객체). 그날의 바탕 모드 그대로에 시드와 규칙만 고정한다. */
export const dailyMode = key => {
  if (cache.has(key)) return cache.get(key);
  const base = dailyBase(key);
  const mode = Object.freeze({
    ...base,
    id: `daily-${key.replace(/-/g, "")}`,
    name: t("오늘의 도전 · {date}", { date: key }),
    description: t("{mode} · 날마다 바뀌는 같은 블록 순서 · 결과를 공유해 겨루기", { mode: base.name }),
    baseName: base.name,
    rules: MODERN,
    daily: key,
    fixedSeed: dailySeed(key),
  });
  cache.set(key, mode);
  return mode;
};

/** "daily-20261118" → 그날의 모드 */
export const findDaily = id => {
  const m = /^daily-(\d{4})(\d{2})(\d{2})$/.exec(String(id));
  return m ? dailyMode(`${m[1]}-${m[2]}-${m[3]}`) : null;
};
