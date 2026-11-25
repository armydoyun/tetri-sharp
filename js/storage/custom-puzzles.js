// 내 퍼즐·받은 퍼즐: 이 기기에 남기는 만든 퍼즐 목록. 퍼즐 자체는 링크 코드(js/modes/custom-puzzle.js)로 담는다.
// 저장 형식 { made: [{ id, code, created, updated }], received: [{ code, received, solved, hinted, best }] }
//  - made: 만든 퍼즐. id로 같은 퍼즐을 고쳐 나간다(고치면 코드가 바뀐다). code에는 확인 표시까지 담는다.
//  - received: 링크로 받은 퍼즐. 같은 퍼즐(확인 표시 뺀 코드)이면 하나로. 풀었는지·첫 수 보기를 썼는지·가장 빠른 시간(프레임).
// 읽을 때마다 허용된 값으로 다시 만든다(백업 파일도 같은 검사를 거친다).
import { decodePuzzle, encodePuzzle, puzzleId } from "../modes/custom-puzzle.js";

export const CUSTOM_PUZZLES_KEY = "customPuzzles";
export const MAX_MADE = 100;
export const MAX_RECEIVED = 100;

/** @typedef {{ id: string, code: string, created: string, updated: string }} MadePuzzle */
/** @typedef {{ code: string, received: string, solved: boolean, hinted: boolean, best: number | null }} ReceivedPuzzle */
/** @typedef {{ made: MadePuzzle[], received: ReceivedPuzzle[] }} CustomPuzzles */

const isDate = v => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isId = v => typeof v === "string" && /^[\w-]{1,40}$/.test(v);
/** 링크 코드를 다시 만들어 정리한다(읽을 수 없으면 null). code는 확인 표시까지, key는 같은 퍼즐인지 가리는 코드 */
const cleanCode = code => {
  const p = decodePuzzle(code);
  const shared = p && encodePuzzle(p, { checked: true });
  const key = p && puzzleId(p);
  return shared && key ? { code: shared, key } : null;
};

/**
 * 저장된 값(또는 백업 파일)을 믿을 수 있는 값으로
 * @returns {CustomPuzzles}
 */
export const sanitizeCustomPuzzles = raw => {
  const src = raw && typeof raw === "object" ? raw : {};
  const now = new Date(0).toISOString();
  const seenIds = new Set();
  /** @type {MadePuzzle[]} */
  const made = [];
  for (const item of Array.isArray(src.made) ? src.made : []) {
    if (made.length >= MAX_MADE) break;
    const clean = item && isId(item.id) && !seenIds.has(item.id) ? cleanCode(item.code) : null;
    if (!clean) continue;
    seenIds.add(item.id);
    made.push({
      id: item.id,
      code: clean.code,
      created: isDate(item.created) ? item.created : now,
      updated: isDate(item.updated) ? item.updated : now,
    });
  }
  const seenKeys = new Set();
  /** @type {ReceivedPuzzle[]} */
  const received = [];
  for (const item of Array.isArray(src.received) ? src.received : []) {
    if (received.length >= MAX_RECEIVED) break;
    const clean = item ? cleanCode(item.code) : null;
    if (!clean || seenKeys.has(clean.key)) continue;
    seenKeys.add(clean.key);
    const best = Number(item.best);
    received.push({
      code: clean.code,
      received: isDate(item.received) ? item.received : now,
      solved: item.solved === true,
      hinted: item.hinted === true,
      best: Number.isInteger(best) && best > 0 && best < 1e9 ? best : null,
    });
  }
  return { made, received };
};

/**
 * 두 목록을 합친다(백업 불러오기): 만든 퍼즐은 id로, 받은 퍼즐은 같은 퍼즐끼리. 겹치면 더 최근에 고친 것·푼 기록을 남긴다.
 * @param {CustomPuzzles} a @param {CustomPuzzles} b
 * @returns {CustomPuzzles}
 */
export const mergeCustomPuzzles = (a, b) => {
  const made = new Map();
  for (const item of [...a.made, ...b.made]) {
    const old = made.get(item.id);
    if (!old || item.updated > old.updated) made.set(item.id, item);
  }
  const received = new Map();
  for (const item of [...a.received, ...b.received]) {
    const key = cleanCode(item.code)?.key;
    if (!key) continue;
    const old = received.get(key);
    received.set(
      key,
      old
        ? {
            ...old,
            solved: old.solved || item.solved,
            hinted: old.hinted || item.hinted,
            best: [old.best, item.best].filter(v => v !== null).sort((x, y) => x - y)[0] ?? null,
            received: old.received < item.received ? old.received : item.received,
          }
        : item
    );
  }
  return sanitizeCustomPuzzles({
    made: [...made.values()].sort((x, y) => (x.updated < y.updated ? 1 : -1)),
    received: [...received.values()].sort((x, y) => (x.received < y.received ? 1 : -1)),
  });
};

/** @param {ReturnType<typeof import("./store.js").createStore>} store */
export const createCustomPuzzles = (store, now = () => new Date().toISOString()) => {
  const read = () => sanitizeCustomPuzzles(store.get(CUSTOM_PUZZLES_KEY, null));
  const write = (/** @type {CustomPuzzles} */ state) => store.set(CUSTOM_PUZZLES_KEY, state);
  const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    read,
    /** 만든 퍼즐(최근에 고친 것부터) */
    made: () => read().made,
    /** 받은 퍼즐(최근에 받은 것부터) */
    received: () => read().received,
    /** @param {string} id */
    find: id => read().made.find(item => item.id === id) ?? null,
    /** 같은 퍼즐(확인 표시 뺀 코드)인 만든 퍼즐 @param {string} code */
    findByCode: code => {
      const key = cleanCode(code)?.key;
      return (key && read().made.find(item => cleanCode(item.code)?.key === key)) || null;
    },
    /**
     * 만든 퍼즐을 저장한다. id가 없으면 새로 만든다. 가득 찼으면 null.
     * @param {string | null} id
     * @param {string} code  확인 표시까지 담은 코드
     * @returns {string | null} 저장한 퍼즐의 id
     */
    save(id, code) {
      const clean = cleanCode(code);
      if (!clean) return null;
      const state = read();
      const at = id ? state.made.findIndex(item => item.id === id) : -1;
      const time = now();
      if (at >= 0) {
        const item = state.made[at];
        if (item.code === clean.code) return item.id;
        state.made.splice(at, 1);
        state.made.unshift({ ...item, code: clean.code, updated: time });
      } else {
        if (state.made.length >= MAX_MADE) return null;
        state.made.unshift({ id: id && isId(id) ? id : newId(), code: clean.code, created: time, updated: time });
      }
      return write(state) ? state.made[0].id : null;
    },
    /** @param {string} id */
    remove(id) {
      const state = read();
      state.made = state.made.filter(item => item.id !== id);
      write(state);
    },
    /**
     * 링크로 연 퍼즐을 받은 퍼즐에 남긴다(같은 퍼즐이면 그대로). 가득 찼으면 가장 오래된 것을 지운다.
     * 내가 만든 퍼즐이면 남기지 않는다.
     * @returns {boolean} 새로 남겼으면 true
     */
    receive(code) {
      const clean = cleanCode(code);
      if (!clean) return false;
      const state = read();
      if (state.made.some(item => cleanCode(item.code)?.key === clean.key)) return false;
      if (state.received.some(item => cleanCode(item.code)?.key === clean.key)) return false;
      state.received.unshift({ code: clean.code, received: now(), solved: false, hinted: false, best: null });
      state.received = state.received.slice(0, MAX_RECEIVED);
      return write(state);
    },
    /**
     * 받은 퍼즐을 푼 기록: 풀었으면 가장 빠른 시간, 첫 수 보기를 썼는지
     * @param {string} code @param {{ solved: boolean, hinted: boolean, frames: number }} result
     */
    recordReceived(code, { solved, hinted, frames }) {
      const key = cleanCode(code)?.key;
      const state = read();
      const item = key && state.received.find(r => cleanCode(r.code)?.key === key);
      if (!item) return;
      if (solved) {
        item.solved = true;
        item.best = item.best === null ? frames : Math.min(item.best, frames);
      }
      if (hinted) item.hinted = true;
      write(state);
    },
    /** @param {string} code */
    removeReceived(code) {
      const key = cleanCode(code)?.key;
      const state = read();
      state.received = state.received.filter(item => cleanCode(item.code)?.key !== key);
      write(state);
    },
  };
};
