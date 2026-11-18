// 개인 기록. 키 = "모드|규칙 id" → 같은 모드라도 규칙이 다르면 따로 센다.
// 프리셋은 이름(modern·retro·arcade), Custom은 내용 해시가 id라 조합마다 기록표가 따로 생긴다.
const MAX_ENTRIES = 10;

/** @typedef {{ frames: number, lines: number, pieces: number, score?: number, level?: number, splits?: number[], playerName?: string, date: string }} RecordEntry */

/** @param {{ id: string }} rules */
export const recordKey = (mode, rules) => `${mode.id}|${rules.id}`;

const cleanName = value =>
  typeof value === "string" ? [...value.replace(/\s+/gu, " ").trim()].slice(0, 24).join("").trimEnd() : "";

const nonNegative = v => Number.isFinite(v) && v >= 0;
const isEntry = e =>
  e &&
  typeof e === "object" &&
  ["frames", "lines", "pieces"].every(k => nonNegative(e[k])) &&
  (e.score === undefined || nonNegative(e.score)) &&
  (e.level === undefined || nonNegative(e.level));

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createRecords = store => {
  let playerName = cleanName(store.get("playerName", ""));
  const readAll = () => {
    const raw = store.get("records", null);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  };

  const clean = e => {
    const { playerName: name, splits, ...entry } = e;
    const normalizedName = cleanName(name);
    if (normalizedName) entry.playerName = normalizedName;
    if (Array.isArray(splits) && splits.every(nonNegative)) entry.splits = splits;
    return entry;
  };

  /** @returns {RecordEntry[]} */
  const list = (mode, rules) => {
    const entries = readAll()[recordKey(mode, rules)];
    return Array.isArray(entries) ? entries.filter(isEntry).map(clean) : [];
  };

  const compare = mode => {
    const { metric, order } = mode.record;
    const value = e => e[metric] ?? 0;
    // 같은 값이면 더 빨리 세운 기록(프레임이 적은 쪽)이 앞, 그것도 같으면 먼저 세운 기록이 앞.
    return (a, b) => (order === "asc" ? value(a) - value(b) : value(b) - value(a)) || a.frames - b.frames;
  };

  return {
    get playerName() {
      return playerName;
    },
    setPlayerName(value) {
      playerName = cleanName(value);
      return store.set("playerName", playerName);
    },
    list,
    /** 이 모드에 기록이 있는 규칙 id들(기록 화면의 규칙 고르기용) */
    rulesIdsFor: mode =>
      Object.keys(readAll())
        .filter(k => k.startsWith(`${mode.id}|`))
        .map(k => k.slice(mode.id.length + 1)),
    best: (mode, rules) => list(mode, rules)[0] ?? null,
    /**
     * @param {RecordEntry} entry
     * @returns {{ rank: number, isBest: boolean, previousBest: RecordEntry | null }}
     */
    add(mode, rules, entry) {
      const previous = list(mode, rules);
      const previousBest = previous[0] ?? null;
      const saved = clean(entry);
      const next = [...previous, saved].sort(compare(mode));
      const rank = next.indexOf(saved);
      const all = readAll();
      all[recordKey(mode, rules)] = next.slice(0, MAX_ENTRIES);
      store.set("records", all);
      return { rank, isBest: rank === 0, previousBest };
    },
  };
};
