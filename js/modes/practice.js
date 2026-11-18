// 연습 모드: 정해진 자리를 깔아 두고 같은 동작을 반복한다. 중력 없음, 기록 없음.
// 고정할 때마다 성공/시도를 세고 판을 다시 깐다(자유 쌓기는 판이 높아졌을 때만 비운다).
import { HEIGHT, WIDTH, set } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { formatTime } from "./format.js";

/** 보드를 비운다 */
const clear = board => board.cells.fill(0);

/**
 * T-spin Double 자리. 구멍은 s..s+2열(아래 두 줄), 지붕은 왼쪽(s열) 또는 오른쪽(s+2열).
 * 지붕이 왼쪽이면 오른쪽을 보는 T를 시계 방향으로, 오른쪽이면 왼쪽을 보는 T를 반시계로 돌려 넣는다.
 */
export const buildTsd = (board, s, roofLeft) => {
  clear(board);
  for (let x = 0; x < WIDTH; x++) {
    if (x < s || x > s + 2) set(board, x, HEIGHT - 2, GARBAGE);
    if (x !== s + 1) set(board, x, HEIGHT - 1, GARBAGE);
  }
  set(board, roofLeft ? s : s + 2, HEIGHT - 3, GARBAGE);
};

/** 4줄 우물: 아래 네 줄을 한 열만 비우고 채운다 */
export const buildWell = (board, column) => {
  clear(board);
  for (let y = HEIGHT - 4; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (x !== column) set(board, x, y, GARBAGE);
};

/** 보이는 영역 위쪽 4줄 안에 블록이 있으면 "높다" */
const tooHigh = board => {
  for (let y = HEIGHT - 20; y < HEIGHT - 16; y++)
    for (let x = 0; x < WIDTH; x++) if (board.cells[y * WIDTH + x]) return true;
  return false;
};

export const DRILLS = Object.freeze([
  Object.freeze({
    id: "tsd",
    name: "T-spin Double",
    description: "좌우가 바뀌는 T-spin Double 자리에 T를 돌려 넣기",
    sequence: Object.freeze(["T"]),
    build: (board, rng) => buildTsd(board, rng.int(WIDTH - 2), rng.int(2) === 0),
    success: ev => ev.tspin === "full" && ev.lines === 2,
  }),
  Object.freeze({
    id: "quad",
    name: "4줄 우물",
    description: "한쪽에 비워 둔 우물에 I를 세워 4줄 지우기",
    sequence: Object.freeze(["I"]),
    build: (board, rng) => buildWell(board, rng.int(2) === 0 ? 0 : WIDTH - 1),
    success: ev => ev.lines === 4,
  }),
  Object.freeze({
    id: "free",
    name: "자유 쌓기",
    description: "중력 없이 천천히 — 판이 높아지면 비워요",
    sequence: null,
    build: board => clear(board),
    success: null,
  }),
]);

const cache = new Map();

/** 연습 한 종류 → 모드 객체(같은 종류는 같은 객체) */
export const practiceMode = drill => {
  if (cache.has(drill.id)) return cache.get(drill.id);
  const mode = Object.freeze({
    id: `practice-${drill.id}`,
    name: `연습 · ${drill.name}`,
    description: drill.description,
    rules: MODERN,
    practice: true,
    hud: Object.freeze(["time", "lines", "pieces"]),
    ...(drill.sequence ? { sequence: drill.sequence } : {}),
    setup: (state, rng) => {
      state.practice = { tries: 0, success: 0, rng };
      drill.build(state.board, rng);
    },
    gravityFor: () => 0,
    onLock: (state, ev, events) => {
      const p = state.practice;
      if (!drill.success) {
        if (!tooHigh(state.board)) return false;
        clear(state.board);
        events.push({ type: "practice", reset: true });
        return true;
      }
      p.tries += 1;
      const ok = drill.success(ev);
      if (ok) p.success += 1;
      events.push({ type: "practice", success: ok });
      drill.build(state.board, p.rng);
      return true;
    },
    check: () => null,
    hudLines: state =>
      drill.success
        ? { label: "성공", value: `${state.practice.success} / ${state.practice.tries}` }
        : { label: "줄", value: String(state.stats.lines) },
    hudTime: state => ({ label: "시간", frames: state.frame }),
    summary: state => ({
      title: "연습 끝",
      main: drill.success ? `${state.practice.success} / ${state.practice.tries}` : `${state.stats.lines}줄`,
    }),
    record: Object.freeze({ metric: "frames", order: "asc" }),
    formatRecord: e => formatTime(e.frames),
    isRecordable: () => false,
  });
  cache.set(drill.id, mode);
  return mode;
};

export const findPractice = id => {
  const drill = DRILLS.find(d => `practice-${d.id}` === id);
  return drill ? practiceMode(drill) : null;
};
