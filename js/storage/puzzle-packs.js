import { decodePack, encodePack } from "../modes/puzzle-pack.js";

export const PUZZLE_PACKS_KEY = "puzzle:packs";
export const MAX_PACKS = 30;

/** @typedef {{ code: string, pack: import("../modes/puzzle-pack.js").PuzzlePack, cleared: number[] }} SavedPack */

/** @param {unknown} raw @returns {SavedPack[]} */
export const sanitizePuzzlePacks = raw => {
  /** @type {Map<string, SavedPack>} */
  const packs = new Map();
  for (const item of Array.isArray(raw) ? raw : []) {
    const pack = decodePack(item?.code);
    const code = pack && encodePack(pack);
    if (!code) continue;
    const existing = packs.get(code);
    if (!existing && packs.size >= MAX_PACKS) continue;
    const cleared = Array.isArray(item.cleared)
      ? item.cleared.filter(index => Number.isInteger(index) && index >= 0 && index < pack.puzzles.length)
      : [];
    packs.set(code, { code, pack, cleared: [...new Set([...(existing?.cleared ?? []), ...cleared])] });
  }
  return [...packs.values()];
};

/** @param {SavedPack[]} entries */
export const serializePuzzlePacks = entries => entries.map(({ code, cleared }) => ({ code, cleared }));

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createPuzzlePacks = store => {
  const read = () => sanitizePuzzlePacks(store.get(PUZZLE_PACKS_KEY, null));
  const write = list => store.set(PUZZLE_PACKS_KEY, serializePuzzlePacks(list));
  return {
    read,
    find: code => read().find(item => item.code === code) ?? null,
    /** @param {string} code */
    add(code) {
      const pack = decodePack(code);
      if (!pack) return null;
      const canonical = encodePack(pack);
      if (!canonical) return null;
      const list = read();
      const existing = list.find(item => item.code === canonical);
      if (existing) return existing;
      const entry = { code: canonical, pack, cleared: [] };
      return list.length < MAX_PACKS && write([entry, ...list]) ? entry : null;
    },
    remove: code => write(read().filter(item => item.code !== code)),
    markCleared(code, index) {
      const list = read();
      const entry = list.find(item => item.code === code);
      if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.pack.puzzles.length) return false;
      if (entry.cleared.includes(index)) return true;
      entry.cleared.push(index);
      return write(list);
    },
  };
};
