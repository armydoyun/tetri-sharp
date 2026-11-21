// 오늘의 도전: 날짜로 정한 시드로 하는 Sprint 40L. 같은 날이면 누구나 같은 블록 순서, 규칙은 늘 Modern.
// 서버 없이도 공정하게 겨룰 수 있게 결과는 리플레이 코드로 주고받는다(js/replay/share.js).
import { SPRINT_40 } from "./index.js";
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

const cache = new Map();

/** 날짜 → 모드(같은 날짜는 같은 객체). Sprint 40L 그대로에 시드와 규칙만 고정한다. */
export const dailyMode = key => {
  if (cache.has(key)) return cache.get(key);
  const mode = Object.freeze({
    ...SPRINT_40,
    id: `daily-${key.replace(/-/g, "")}`,
    name: t("오늘의 도전 · {date}", { date: key }),
    description: t("날마다 바뀌는 같은 블록 순서로 40줄 · 결과를 공유해 겨루기"),
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
