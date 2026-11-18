// 개인 기록. 키 = "모드|규칙" → 같은 모드라도 규칙이 다르면 따로 센다(규칙 샌드박스 대비).
const MAX_ENTRIES = 10;

/** @typedef {{ frames: number, lines: number, pieces: number, score?: number, date: string }} RecordEntry */

export const recordKey = mode => `${mode.id}|${mode.rules.id}`;

const nonNegative = v => Number.isFinite(v) && v >= 0;
const isEntry = e =>
  e &&
  typeof e === "object" &&
  ["frames", "lines", "pieces"].every(k => nonNegative(e[k])) &&
  (e.score === undefined || nonNegative(e.score));

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createRecords = store => {
  const readAll = () => {
    const raw = store.get("records", null);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  };

  /** @returns {RecordEntry[]} */
  const list = mode => {
    const entries = readAll()[recordKey(mode)];
    return Array.isArray(entries) ? entries.filter(isEntry) : [];
  };

  const compare = mode => {
    const { metric, order } = mode.record;
    // 같은 값이면 먼저 세운 기록이 앞.
    const value = e => e[metric] ?? 0;
    return (a, b) => (order === "asc" ? value(a) - value(b) : value(b) - value(a));
  };

  return {
    list,
    best: mode => list(mode)[0] ?? null,
    /**
     * @param {RecordEntry} entry
     * @returns {{ rank: number, isBest: boolean, previousBest: RecordEntry | null }}
     */
    add(mode, entry) {
      const previous = list(mode);
      const previousBest = previous[0] ?? null;
      const next = [...previous, entry].sort(compare(mode));
      const rank = next.indexOf(entry);
      const all = readAll();
      all[recordKey(mode)] = next.slice(0, MAX_ENTRIES);
      store.set("records", all);
      return { rank, isBest: rank === 0, previousBest };
    },
  };
};
