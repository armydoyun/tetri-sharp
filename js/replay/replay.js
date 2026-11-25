// 리플레이: 엔진이 결정론적이므로 (시드, 규칙, 조작 설정, 모드, 프레임별 입력)만 있으면 한 판을 그대로 다시 돌릴 수 있다.
// 입력은 바뀐 프레임만 남긴다 → 2분짜리 판도 수십 KB 안쪽.
//
// 파일 형식(v1)
//   { app, v, date, seed, mode, rules, handling, inputs: [[i, held, pressed]...], changes: [[i, handling]...], result }
//   i = step() 호출 순번(0부터). held는 바뀔 때까지 유지된다. changes는 게임 중 조작 설정을 바꾼 기록.
import { createGame } from "../core/engine.js";
import { settleBattleFrame } from "../modes/versus.js";
import { PRESETS } from "../rules/presets.js";
import { makeCustomRules } from "../rules/sanitize.js";

const REPLAY_VERSION = 1;
const APP = "tetri-sharp";
const MAX_INPUTS = 500000;

/** JSON에는 Infinity가 없으므로 SDF ∞는 -1로 적는다. */
const encodeHandling = h => ({ das: h.das, arr: h.arr, sdf: h.sdf === Infinity ? -1 : h.sdf });
const decodeHandling = h => {
  const num = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  const sdf = Number(h?.sdf);
  return {
    das: num(Number(h?.das), 0, 120, 8),
    arr: num(Number(h?.arr), 0, 60, 0.6),
    sdf: sdf === -1 || sdf === Infinity ? Infinity : num(sdf, 1, 1000, 20),
  };
};

const resultOf = state => ({
  frames: state.frame,
  lines: state.stats.lines,
  pieces: state.stats.pieces,
  score: state.score,
  level: state.level,
  over: state.over,
});

/**
 * 한 판을 기록한다. 게임 루프가 step() 직전에 input()을 부른다.
 * @param {{ seed: number, mode: { id: string }, rules: any, handling: any }} options
 */
export const createRecorder = ({ seed, mode, rules, handling }) => {
  /** @type {number[][]} */
  const inputs = [];
  /** @type {any[][]} */
  const changes = [];
  let index = 0;
  let lastHeld = 0;
  return {
    /** 이번 step()에 넣을 입력 */
    input(held, pressed) {
      if (held !== lastHeld || pressed) inputs.push([index, held, pressed]);
      lastHeld = held;
      index += 1;
    },
    /** 게임 중 조작 설정이 바뀌었다(다음 step()부터 적용) */
    handlingChanged(next) {
      changes.push([index, encodeHandling(next)]);
    },
    /** @returns {any} 리플레이 파일 내용 */
    finish(state) {
      return {
        app: APP,
        v: REPLAY_VERSION,
        date: new Date().toISOString(),
        seed,
        mode: mode.id,
        rules: { ...rules },
        handling: encodeHandling(handling),
        inputs,
        changes,
        result: resultOf(state),
      };
    },
  };
};

/**
 * 리플레이를 재생한다. step()을 부를 때마다 한 프레임 진행한다.
 * @param {any} replay  sanitizeReplay()를 거친 값
 * @param {(state: any) => void} [onSpawn]
 * @param {(id: string) => any} findMode
 */
export const createPlayer = (replay, findMode, onSpawn) => {
  const mode = findMode(replay.mode);
  const game = createGame({
    rules: replay.rules,
    handling: decodeHandling(replay.handling),
    seed: replay.seed,
    mode,
    onSpawn,
  });
  // 결과 화면에서만 사용하는 대전 기록은 CPU가 실제로 누른 입력도 저장한다.
  const opponent = replay.cpu ? createPlayer(replay.cpu, findMode) : null;
  let cpuEvents = [];
  let index = 0;
  let spawnFrame = 0;
  let cursor = 0;
  let change = 0;
  let held = 0;
  let lastInput = { held: 0, pressed: 0 };
  return {
    game,
    mode,
    cpu: opponent?.game ?? null,
    get cpuEvents() {
      return cpuEvents;
    },
    /** 마지막 step()에 넣은 입력(분석용) */
    get input() {
      return lastInput;
    },
    get frame() {
      return index;
    },
    get spawnFrame() {
      return spawnFrame;
    },
    /** 게임이 끝났거나 기록된 길이만큼 다 돌렸으면 true */
    get done() {
      const length = replay.result?.frames ?? 0;
      return Boolean(game.state.over) || (length > 0 && index >= length);
    },
    step() {
      while (change < replay.changes.length && replay.changes[change][0] <= index) {
        game.setHandling(decodeHandling(replay.changes[change][1]));
        change += 1;
      }
      let pressed = 0;
      if (cursor < replay.inputs.length && replay.inputs[cursor][0] === index) {
        held = replay.inputs[cursor][1];
        pressed = replay.inputs[cursor][2];
        cursor += 1;
      }
      index += 1;
      lastInput = { held, pressed };
      const pieceId = game.state.pieceId;
      const events = game.step({ held, pressed });
      if (opponent) {
        cpuEvents = opponent.step();
        settleBattleFrame(game, opponent.game, events);
      }
      if (game.state.pieceId !== pieceId) spawnFrame = index;
      return events;
    },
  };
};

/** 끝까지 돌려 기록된 결과와 같은지 확인한다(불러온 파일 검증). */
export const verifyReplay = (replay, findMode, onFrame) => {
  const player = createPlayer(replay, findMode);
  const limit = (replay.result?.frames ?? 0) + 10;
  while (!player.game.state.over && player.frame < limit) {
    player.step();
    onFrame?.(player.game.state);
  }
  const actual = resultOf(player.game.state);
  const expected = replay.result ?? {};
  const same = ["frames", "lines", "pieces", "score", "level"].every(k => actual[k] === expected[k]);
  return { ok: same, actual, expected };
};

/**
 * 밖에서 들어온 리플레이(파일·저장소)를 검증해 안전한 값으로 만든다. 이상하면 null.
 * 규칙은 프리셋 id면 프리셋을, 아니면 내용으로 Custom 규칙을 다시 만든다(id도 다시 계산).
 */
export const sanitizeReplay = (raw, findMode) => {
  if (!raw || typeof raw !== "object" || raw.app !== APP || raw.v !== REPLAY_VERSION) return null;
  const seed = Number(raw.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const mode = findMode(raw.mode);
  if (!mode || mode.id !== raw.mode || mode.versus) return null;
  if (!Array.isArray(raw.inputs) || raw.inputs.length > MAX_INPUTS) return null;
  let prev = -1;
  const inputs = [];
  for (const entry of raw.inputs) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [i, held, pressed] = entry;
    if (![i, held, pressed].every(n => Number.isInteger(n) && n >= 0) || i <= prev || held > 255 || pressed > 255)
      return null;
    inputs.push([i, held, pressed]);
    prev = i;
  }
  const changes = [];
  for (const entry of Array.isArray(raw.changes) ? raw.changes : []) {
    if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || entry[0] < 0) return null;
    changes.push([entry[0], decodeHandling(entry[1])]);
  }
  const preset = PRESETS[raw.rules?.id];
  const rules = preset ?? makeCustomRules(raw.rules);
  const r = raw.result && typeof raw.result === "object" ? raw.result : {};
  const n = v => (Number.isFinite(v) && v >= 0 ? v : 0);
  const name = typeof raw.name === "string" ? [...raw.name.replace(/\s+/gu, " ").trim()].slice(0, 24).join("") : "";
  return {
    app: APP,
    v: REPLAY_VERSION,
    ...(name ? { name } : {}),
    date: typeof raw.date === "string" ? raw.date.slice(0, 40) : "",
    seed,
    mode: mode.id,
    rules,
    handling: decodeHandling(raw.handling),
    inputs,
    changes,
    result: {
      frames: n(r.frames),
      lines: n(r.lines),
      pieces: n(r.pieces),
      score: n(r.score),
      level: n(r.level),
      over: typeof r.over === "string" ? r.over.slice(0, 20) : null,
    },
  };
};

/** 저장소용: 마지막 판 + 기록표마다 상위 3개 기록의 리플레이 */
const MAX_BEST = 30;
export const MAX_RANKED = 3;

/** 기록 한 줄과 리플레이 결과가 같은 판인지(같은 시간·줄·피스·점수) */
export const replayMatches = (replay, entry) =>
  Boolean(replay && entry) &&
  replay.result.frames === entry.frames &&
  replay.result.lines === entry.lines &&
  replay.result.pieces === entry.pieces &&
  replay.result.score === (entry.score ?? replay.result.score);

/** 예전 형식(기록표마다 리플레이 하나)도 목록으로 읽는다. */
const toList = value => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []);
const newest = list => list.reduce((d, r) => (String(r?.date) > d ? String(r?.date) : d), "");

/** @param {ReturnType<typeof import("../storage/store.js").createStore>} store */
export const createReplayStore = (store, findMode) => {
  const readMap = () => {
    const all = store.get("replay:best", {});
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  };
  /** 기록표 하나의 리플레이들(읽을 수 있는 것만) */
  const ranked = key =>
    toList(readMap()[key])
      .map(r => sanitizeReplay(r, findMode))
      .filter(Boolean);

  return {
    saveLast: replay => store.set("replay:last", replay),
    last: () => sanitizeReplay(store.get("replay:last", null), findMode),
    /**
     * 새 리플레이를 기록표에 넣는다. top: 지금 상위 기록들 — 이 기록과 맞지 않는 리플레이는 버린다.
     * 저장 공간이 모자라면 오래된 기록표의 2·3위 리플레이부터 지워 가며 다시 시도한다.
     */
    saveRanked(key, replay, top) {
      const map = readMap();
      const keep = top.slice(0, MAX_RANKED);
      const list = [replay, ...toList(map[key])].filter(r => r?.result && keep.some(e => replayMatches(r, e)));
      // 상위 기록 순서대로 늘어놓는다.
      map[key] = keep.map(e => list.find(r => replayMatches(r, e))).filter(Boolean);
      const keys = Object.keys(map).sort((a, b) => newest(toList(map[a])).localeCompare(newest(toList(map[b]))));
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BEST))) delete map[k];
      if (store.set("replay:best", map)) return true;
      for (const k of Object.keys(map).sort((a, b) => newest(toList(map[a])).localeCompare(newest(toList(map[b]))))) {
        if (k === key || toList(map[k]).length <= 1) continue;
        map[k] = toList(map[k]).slice(0, 1);
        if (store.set("replay:best", map)) return true;
      }
      map[key] = map[key].slice(0, 1);
      return store.set("replay:best", map);
    },
    /** 예전 방식: 1위 리플레이만 바꾼다 */
    saveBest(key, replay) {
      return this.saveRanked(key, replay, [replay.result]);
    },
    ranked,
    best: key => ranked(key)[0] ?? null,
    /** 기록 한 줄에 맞는 리플레이 */
    forEntry: (key, entry) => ranked(key).find(r => replayMatches(r, entry)) ?? null,
  };
};
