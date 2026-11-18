// 저장 데이터 백업: 이 브라우저에 쌓인 설정·기록·이름·Custom 규칙·리플레이를 JSON 파일 하나로 내보내고 다시 들인다.
// 들일 때는 항목마다 원래 저장할 때와 같은 검사를 거친다. 알 수 없는 항목은 버린다.
import { sanitizeSettings } from "./settings.js";
import { isEntry } from "./records.js";
import { sanitizeRuleBody } from "../rules/sanitize.js";
import { sanitizeReplay } from "../replay/replay.js";

const APP = "tetri-sharp";
export const BACKUP_KIND = "backup";
export const BACKUP_VERSION = 1;

/** 백업에 담는 저장소 키 */
export const BACKUP_KEYS = Object.freeze([
  "settings",
  "records",
  "playerName",
  "lastMode",
  "lastRules",
  "customRules",
  "replay:last",
  "replay:best",
  "versus:stats",
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
 * @returns {null | { date: string, data: Record<string, any>, summary: { records: number, replays: number } }}
 */
export const parseBackup = (raw, findMode) => {
  if (!isPlainObject(raw) || raw.app !== APP || raw.kind !== BACKUP_KIND || raw.v !== BACKUP_VERSION) return null;
  if (!isPlainObject(raw.data)) return null;
  const src = raw.data;
  /** @type {Record<string, any>} */
  const data = {};
  let recordCount = 0;
  let replayCount = 0;

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
    for (const [key, value] of Object.entries(src["versus:stats"]).slice(0, 20)) {
      if (!/^[\w-]{1,20}$/.test(key) || !isPlainObject(value)) continue;
      stats[key] = { win: count(value.win), loss: count(value.loss) };
    }
    data["versus:stats"] = stats;
  }
  return {
    date: typeof raw.date === "string" ? raw.date.slice(0, 40) : "",
    data,
    summary: { records: recordCount, replays: replayCount },
  };
};

/**
 * 검사를 마친 백업으로 저장소를 바꾼다. 백업에 없는 항목은 지운다(설정은 기본값으로).
 * @returns {boolean} 모두 저장했으면 true
 */
export const restoreBackup = (store, parsed) => {
  let ok = true;
  for (const key of BACKUP_KEYS) {
    const value = parsed.data[key] ?? (key === "settings" ? sanitizeSettings(null) : null);
    if (!store.set(key, value)) ok = false;
  }
  return ok;
};
