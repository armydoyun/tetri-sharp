// 저장 데이터 백업: 이 브라우저에 쌓인 설정·기록·이름·Custom 규칙·리플레이·내 퍼즐을 JSON 파일 하나로 내보내고 다시 들인다.
// 들일 때는 항목마다 원래 저장할 때와 같은 검사를 거친다. 알 수 없는 항목은 버린다.
import { sanitizeSettings } from "./settings.js";
import { PUZZLES } from "../modes/puzzles.js";
import { STYLES } from "../modes/versus.js";
import { PRACTICE_PROGRESS_KEY, sanitizePracticeProgress } from "./practice-progress.js";
import { EXPEDITION_PROGRESS_KEY, sanitizeExpeditionProgress } from "./expedition-progress.js";
import { TIME_SHIFT_PROGRESS_KEY, sanitizeTimeShiftProgress } from "./time-shift-progress.js";
import { SPRINT_HISTORY_KEY, sanitizeSprintHistory } from "./sprint-history.js";
import { ACHIEVEMENTS_KEY, ACHIEVEMENT_TOTALS_KEY, sanitizeAchievements, sanitizeTotals } from "./achievements.js";
import { RULE_SLOTS_KEY, sanitizeRuleSlots } from "./rule-slots.js";
import { CUSTOM_PUZZLES_KEY, mergeCustomPuzzles, sanitizeCustomPuzzles } from "./custom-puzzles.js";
import { PUZZLE_PACKS_KEY, sanitizePuzzlePacks, serializePuzzlePacks } from "./puzzle-packs.js";
import { DAILY_PUZZLE_CLEARED, sanitizeDailyPuzzleCleared } from "./daily-puzzle.js";
import { isEntry } from "./records.js";
import { sanitizeRuleBody } from "../rules/sanitize.js";
import { sanitizeReplay } from "../replay/replay.js";

const APP = "tetri-sharp";
const BACKUP_KIND = "backup";
const BACKUP_VERSION = 1;

/** 백업에 담는 저장소 키 */
const BACKUP_KEYS = Object.freeze([
  "settings",
  "records",
  "playerName",
  "lastMode",
  "lastRules",
  "customRules",
  "replay:last",
  "replay:best",
  "versus:stats",
  "versus:style",
  "puzzle:cleared",
  DAILY_PUZZLE_CLEARED,
  PRACTICE_PROGRESS_KEY,
  EXPEDITION_PROGRESS_KEY,
  TIME_SHIFT_PROGRESS_KEY,
  SPRINT_HISTORY_KEY,
  ACHIEVEMENTS_KEY,
  ACHIEVEMENT_TOTALS_KEY,
  RULE_SLOTS_KEY,
  CUSTOM_PUZZLES_KEY,
  PUZZLE_PACKS_KEY,
]);

const MAX_TABLES = 500;
const MAX_TEXT = 64;

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createBackup = (store, date = new Date().toISOString()) => {
  /** @type {Record<string, any>} */
  const data = {};
  for (const key of BACKUP_KEYS) {
    const value = store.get(key, undefined);
    if (value !== undefined) data[key] = value;
  }
  return { app: APP, kind: BACKUP_KIND, v: BACKUP_VERSION, date, data };
};

const isPlainObject = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const shortText = v => (typeof v === "string" ? v.slice(0, MAX_TEXT) : undefined);

/**
 * 파일에서 읽은 값을 검사해 저장해도 되는 항목만 남긴다. 백업 파일이 아니면 null.
 * @returns {null | { date: string, data: Record<string, any>, summary: { records: number, replays: number, puzzles: number, practice: number, attempts: number } }}
 */
export const parseBackup = (raw, findMode) => {
  if (!isPlainObject(raw) || raw.app !== APP || raw.kind !== BACKUP_KIND || raw.v !== BACKUP_VERSION) return null;
  if (!isPlainObject(raw.data)) return null;
  const src = raw.data;
  /** @type {Record<string, any>} */
  const data = {};
  let recordCount = 0;
  let replayCount = 0;

  if (Array.isArray(src["puzzle:cleared"])) {
    data["puzzle:cleared"] = [
      ...new Set(src["puzzle:cleared"].filter(n => Number.isInteger(n) && n >= 1 && n <= PUZZLES.length)),
    ];
  }
  if (Array.isArray(src[DAILY_PUZZLE_CLEARED])) {
    data[DAILY_PUZZLE_CLEARED] = sanitizeDailyPuzzleCleared(src[DAILY_PUZZLE_CLEARED]);
  }
  if (src[PRACTICE_PROGRESS_KEY] !== undefined) {
    data[PRACTICE_PROGRESS_KEY] = sanitizePracticeProgress(src[PRACTICE_PROGRESS_KEY]);
  }
  if (src[EXPEDITION_PROGRESS_KEY] !== undefined)
    data[EXPEDITION_PROGRESS_KEY] = sanitizeExpeditionProgress(src[EXPEDITION_PROGRESS_KEY]);
  if (Array.isArray(src[TIME_SHIFT_PROGRESS_KEY]))
    data[TIME_SHIFT_PROGRESS_KEY] = sanitizeTimeShiftProgress(src[TIME_SHIFT_PROGRESS_KEY]);
  if (src[SPRINT_HISTORY_KEY] !== undefined) data[SPRINT_HISTORY_KEY] = sanitizeSprintHistory(src[SPRINT_HISTORY_KEY]);
  if (src[ACHIEVEMENTS_KEY] !== undefined) data[ACHIEVEMENTS_KEY] = sanitizeAchievements(src[ACHIEVEMENTS_KEY]);
  if (src[ACHIEVEMENT_TOTALS_KEY] !== undefined)
    data[ACHIEVEMENT_TOTALS_KEY] = sanitizeTotals(src[ACHIEVEMENT_TOTALS_KEY]);
  const slots = src[RULE_SLOTS_KEY] !== undefined ? sanitizeRuleSlots(src[RULE_SLOTS_KEY]) : null;
  if (slots) data[RULE_SLOTS_KEY] = slots;
  if (src[CUSTOM_PUZZLES_KEY] !== undefined) data[CUSTOM_PUZZLES_KEY] = sanitizeCustomPuzzles(src[CUSTOM_PUZZLES_KEY]);
  if (src[PUZZLE_PACKS_KEY] !== undefined)
    data[PUZZLE_PACKS_KEY] = serializePuzzlePacks(sanitizePuzzlePacks(src[PUZZLE_PACKS_KEY]));
  if (src.settings !== undefined) data.settings = sanitizeSettings(src.settings);
  if (isPlainObject(src.records)) {
    const records = {};
    for (const [key, list] of Object.entries(src.records).slice(0, MAX_TABLES)) {
      if (!/^[\w-]{1,40}\|[\w-]{1,40}$/.test(key) || !Array.isArray(list)) continue;
      const entries = list.filter(isEntry).slice(0, 10);
      if (!entries.length) continue;
      records[key] = entries;
      recordCount += entries.length;
    }
    data.records = records;
  }
  for (const key of ["playerName", "lastMode", "lastRules"]) {
    const text = shortText(src[key]);
    if (text !== undefined) data[key] = text;
  }
  if (src.customRules !== undefined) data.customRules = sanitizeRuleBody(src.customRules);
  if (src["replay:last"] !== undefined) {
    const replay = sanitizeReplay(src["replay:last"], findMode);
    if (replay) {
      data["replay:last"] = src["replay:last"];
      replayCount += 1;
    }
  }
  if (isPlainObject(src["replay:best"])) {
    const best = {};
    for (const [key, value] of Object.entries(src["replay:best"]).slice(0, MAX_TABLES)) {
      if (!/^[\w-]{1,40}\|[\w-]{1,40}$/.test(key)) continue;
      const list = (Array.isArray(value) ? value : [value]).filter(r => sanitizeReplay(r, findMode)).slice(0, 3);
      if (!list.length) continue;
      best[key] = list;
      replayCount += list.length;
    }
    data["replay:best"] = best;
  }
  if (isPlainObject(src["versus:stats"])) {
    const stats = {};
    const count = v => (Number.isInteger(v) && v >= 0 ? Math.min(v, 1e6) : 0);
    // 난이도 7 × 성향 3 = 21칸
    for (const [key, value] of Object.entries(src["versus:stats"]).slice(0, 40)) {
      if (!/^[\w-]{1,20}$/.test(key) || !isPlainObject(value)) continue;
      stats[key] = { win: count(value.win), loss: count(value.loss) };
    }
    data["versus:stats"] = stats;
  }
  // 고른 CPU 성향(아는 이름만)
  if (STYLES.some(style => style.id === src["versus:style"])) data["versus:style"] = src["versus:style"];
  return {
    date: typeof raw.date === "string" ? raw.date.slice(0, 40) : "",
    data,
    summary: {
      records: recordCount,
      replays: replayCount,
      puzzles: data["puzzle:cleared"]?.length ?? 0,
      practice: Object.keys(data[PRACTICE_PROGRESS_KEY] ?? {}).length,
      attempts: Object.values(data[SPRINT_HISTORY_KEY] ?? {}).reduce((count, attempts) => count + attempts.length, 0),
    },
  };
};

/**
 * 검사를 마친 백업으로 저장소를 바꾼다. 백업에 없는 항목은 지운다(설정은 기본값으로).
 * @returns {boolean} 모두 저장했으면 true
 */
export const restoreBackup = (store, parsed) => {
  const values = {};
  for (const key of BACKUP_KEYS) {
    // 내 퍼즐·받은 퍼즐은 바꾸지 않고 합친다(이 기기에서 만든 퍼즐을 잃지 않게)
    if (key === CUSTOM_PUZZLES_KEY) {
      if (key in parsed.data)
        values[key] = mergeCustomPuzzles(sanitizeCustomPuzzles(store.get(key, null)), parsed.data[key]);
      continue;
    }
    if (key === PUZZLE_PACKS_KEY) {
      if (key in parsed.data)
        values[key] = serializePuzzlePacks(
          sanitizePuzzlePacks([...sanitizePuzzlePacks(store.get(key, [])), ...parsed.data[key]])
        );
      continue;
    }
    if (key === DAILY_PUZZLE_CLEARED) {
      if (key in parsed.data) {
        values[key] = sanitizeDailyPuzzleCleared([
          ...sanitizeDailyPuzzleCleared(store.get(key, [])),
          ...parsed.data[key],
        ]);
      }
      continue;
    }
    // 이전 버전의 백업에는 이 진행도 항목이 없으므로 기존 값을 보존한다.
    if (
      (key === "puzzle:cleared" ||
        key === PRACTICE_PROGRESS_KEY ||
        key === EXPEDITION_PROGRESS_KEY ||
        key === TIME_SHIFT_PROGRESS_KEY ||
        key === SPRINT_HISTORY_KEY ||
        key === ACHIEVEMENTS_KEY ||
        key === RULE_SLOTS_KEY) &&
      !(key in parsed.data)
    )
      continue;
    values[key] = parsed.data[key] ?? (key === "settings" ? sanitizeSettings(null) : null);
  }
  return store.setMany(values);
};
