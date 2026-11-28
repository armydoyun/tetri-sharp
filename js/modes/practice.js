// 연습 모드: 정해진 자리를 깔아 두고 같은 동작을 반복한다. 중력 없음, 기록 없음.
// 고정할 때마다 성공/시도를 세고 판을 다시 깐다(자유 쌓기는 판이 높아졌을 때만 비운다).
import { HEIGHT, WIDTH, set } from "../core/board.js";
import { GARBAGE, PIECES } from "../core/pieces.js";
import { MODERN } from "../rules/presets.js";
import { formatTime } from "./format.js";
import { t } from "../i18n/index.js";

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

/**
 * T-spin Triple 자리. 구멍은 c열(아래 세 줄)과 가운데 줄의 c+n열(n = 오른쪽 1, 왼쪽 -1).
 * 반대쪽 c−n열은 두 줄 더 높고, 그 위에서 구멍 위로 지붕이 걸친다. T를 지붕 아래로 돌려 넣는다.
 * @param {number} c  오른쪽이면 1~7, 왼쪽이면 2~8
 */
export const buildTst = (board, c, right) => {
  clear(board);
  const top = HEIGHT - 3;
  const n = right ? 1 : -1;
  for (let y = top; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) set(board, x, y, GARBAGE);
  for (const [x, y] of [
    [c, top],
    [c, top + 1],
    [c + n, top + 1],
    [c, top + 2],
  ])
    set(board, x, y, 0);
  for (let x = 0; x < WIDTH; x++) if ((x - c) * n <= -1) set(board, x, top - 1, GARBAGE);
  set(board, c - n, top - 2, GARBAGE);
  set(board, c, top - 2, GARBAGE);
};

/** 피스의 서로 다른 모양(방향)들. 칸은 (0, 0)부터 시작하게 맞춘다. */
const orientations = type => {
  const seen = new Set();
  const out = [];
  for (const state of PIECES[type].states) {
    const minX = Math.min(...state.map(c => c[0]));
    const minY = Math.min(...state.map(c => c[1]));
    const cells = state.map(([x, y]) => [x - minX, y - minY]);
    const key = JSON.stringify([...cells].sort());
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cells);
    }
  }
  return out;
};

/** 아래 rows줄 안에 들어가는 이 피스의 모든 자리(칸 목록) */
const slotsIn = (type, rows) =>
  orientations(type).flatMap(cells => {
    const w = Math.max(...cells.map(c => c[0])) + 1;
    const h = Math.max(...cells.map(c => c[1])) + 1;
    if (h > rows) return [];
    const out = [];
    for (let x = 0; x + w <= WIDTH; x++)
      for (let y = HEIGHT - rows; y + h <= HEIGHT; y++) out.push(cells.map(([cx, cy]) => [x + cx, y + cy]));
    return out;
  });

const PC_ROWS = 2;

/**
 * 퍼펙트 클리어 마무리: 아래 두 줄을 채우고, 다음에 올 피스들(pieces, 놓는 순서)이 정확히 들어갈 칸만 비운다.
 * 각 피스는 그 순서로 하드 드롭만으로도 들어간다(마지막 피스부터 거꾸로 빼며 위가 뚫려 있는지 확인).
 * S·Z는 어느 방향이든 처마가 있어 마지막 피스가 될 수 없다 → 두 개로 안 되면 하나, 셋, 넷 순서로 찾는다.
 * @param {string[]} queue  다음에 올 피스들(놓는 순서)
 * @returns {number} 쓴 피스 수(0이면 못 찾음)
 */
export const buildPcFinish = (board, queue, rng) => {
  for (const n of [2, 1, 3, 4]) {
    if (n > queue.length) continue;
    const holes = findPcHoles(queue.slice(0, n), rng);
    if (!holes) continue;
    clear(board);
    const empty = new Set(holes.flat().map(([x, y]) => y * WIDTH + x));
    for (let y = HEIGHT - PC_ROWS; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) if (!empty.has(y * WIDTH + x)) set(board, x, y, GARBAGE);
    return n;
  }
  clear(board);
  return 0;
};

/** 배열의 모든 순서 */
const permutations = items =>
  items.length <= 1
    ? [items]
    : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p]));

/**
 * 퍼펙트 클리어 마무리 연습의 한 판. 다음 피스들로 비울 자리를 만들고, 못 만들면 다음 피스의 순서를 바꾼다.
 * S·Z가 먼저 오면 두 줄 안에서 곧장 내려 들어갈 자리가 없어 판을 못 만들 때가 있다(약 4%).
 * 예전에는 그때 빈 판을 두고 "1피스로 비우기"로 넘어가, 첫 피스를 놓자마자 실패했다.
 * 연습이라 다음 피스 순서를 바꿔도 된다: 앞 네 개의 순서를 바꿔 보고, 그래도 안 되면 첫 피스를 바꾼다.
 * @param {string[]} queue  다음 피스(필요하면 이 자리에서 고친다)
 * @returns {number} 필요한 피스 수(1~4)
 */
export const buildPcRound = (board, queue, rng) => {
  const n = buildPcFinish(board, queue, rng);
  if (n) return n;
  const front = queue.slice(0, 4);
  for (const order of permutations(front)) {
    const m = buildPcFinish(board, [...order, ...queue.slice(4)], rng);
    if (m) {
      queue.splice(0, front.length, ...order);
      return m;
    }
  }
  for (const type of ["T", "L", "J", "I", "O"]) {
    const m = buildPcFinish(board, [type, ...queue.slice(1)], rng);
    if (m) {
      queue[0] = type;
      return m;
    }
  }
  // 여기까지 오면 I 하나로도 못 만든 것 — 일어나지 않지만, 빈 판으로 두지는 않는다
  queue[0] = "I";
  return buildPcFinish(board, queue, rng) || 1;
};

/**
 * 주어진 피스를 모두 써야 하는 판 비우기 자리(퍼즐용). 만들 수 없으면 false(판은 비운다).
 * @param {string[]} pieces  놓는 순서
 * @param {number} [rows] 채울 줄 수
 */
export const buildPcExact = (board, pieces, rng, rows = PC_ROWS) => {
  const holes = findPcHoles(pieces, rng, rows);
  clear(board);
  if (!holes) return false;
  const empty = new Set(holes.flat().map(([x, y]) => y * WIDTH + x));
  for (let y = HEIGHT - rows; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) if (!empty.has(y * WIDTH + x)) set(board, x, y, GARBAGE);
  return true;
};

/**
 * 4줄 만들기: 아래 4줄을 채우되 한 열(well)은 비워 우물로 두고, 앞 피스들(pieces, I 빼고 놓는 순서)이 정확히 들어갈 칸만 비운다.
 * 앞 피스를 모두 놓으면 우물 말고는 4줄이 다 차고, 마지막 I를 세워 넣으면 4줄이 지워진다. 앞 피스는 우물을 덮을 수 없다.
 * @returns {boolean} 만들었는가
 */
export const buildQuadExact = (board, pieces, rng, well) => {
  const rows = 4;
  const reserved = new Set();
  for (let y = HEIGHT - rows; y < HEIGHT; y++) reserved.add(y * WIDTH + well);
  const holes = findPcHoles(pieces, rng, rows, reserved);
  clear(board);
  if (!holes) return false;
  const empty = new Set([...reserved, ...holes.flat().map(([x, y]) => y * WIDTH + x)]);
  for (let y = HEIGHT - rows; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) if (!empty.has(y * WIDTH + x)) set(board, x, y, GARBAGE);
  return true;
};

/**
 * @param {string[]} pieces 놓는 순서
 * @param {number} [rows] 채울 줄 수(퍼펙트 클리어는 2줄)
 * @param {Set<number>} [reserved] 처음부터 비워 둘 칸(피스가 들어가면 안 된다, 예: 4줄 우물)
 * @returns {number[][][] | null} 피스마다 비울 칸(놓는 순서의 거꾸로)
 */
const findPcHoles = (pieces, rng, rows = PC_ROWS, reserved = new Set()) => {
  const top = HEIGHT - rows;
  const key = (x, y) => y * WIDTH + x;
  /** 칸들이 위에서 곧장 들어갈 수 있는가: 같은 열에서 위쪽 칸은 모두 비어 있어야 한다 */
  const open = (cells, empty) =>
    cells.every(([x, y]) => {
      for (let yy = top; yy < y; yy++) if (!empty.has(key(x, yy))) return false;
      return true;
    });
  /** 하드 드롭이 정확히 이 자리에 멈추는가: 아래가 막힌 칸이 하나는 있어야 한다 */
  const rests = (cells, empty) => cells.some(([x, y]) => y + 1 >= HEIGHT || !empty.has(key(x, y + 1)));
  const order = [...pieces].reverse(); // 마지막에 놓는 피스부터 뺀다
  /** @type {number[][][] | null} */
  let found = null;
  const search = (i, empty, chosen) => {
    if (found) return;
    if (i === order.length) {
      found = chosen;
      return;
    }
    const slots = slotsIn(order[i], rows);
    // 같은 결과가 나오게 시드 난수로 시작 위치만 돌린다.
    const offset = slots.length ? rng.int(slots.length) : 0;
    for (let k = 0; k < slots.length && !found; k++) {
      const cells = slots[(k + offset) % slots.length];
      if (cells.some(([x, y]) => empty.has(key(x, y)) || reserved.has(key(x, y)))) continue;
      const next = new Set(empty);
      for (const [x, y] of cells) next.add(key(x, y));
      // 이 피스를 놓을 때는 이미 놓인 피스(앞 순서)가 아직 비어 있다 → 남은 피스 칸은 빈칸으로 보지 않는다.
      if (!open(cells, next) || !rests(cells, empty)) continue;
      search(i + 1, next, [...chosen, cells]);
    }
  };
  search(0, new Set(reserved), []);
  return found;
};

/** 4줄 우물: 아래 네 줄을 한 열만 비우고 채운다 */
export const buildWell = (board, column) => {
  clear(board);
  for (let y = HEIGHT - 4; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (x !== column) set(board, x, y, GARBAGE);
};

/** O 피스로 채우는 두 칸짜리 구멍. */
export const buildDoubleWell = (board, column) => {
  clear(board);
  for (let y = HEIGHT - 2; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (x < column || x > column + 1) set(board, x, y, GARBAGE);
    }
  }
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
    description: t("좌우가 바뀌는 T-spin Double 자리에 T를 돌려 넣기"),
    sequence: Object.freeze(["T"]),
    build: (board, rng) => buildTsd(board, rng.int(WIDTH - 2), rng.int(2) === 0),
    success: ev => ev.tspin === "full" && ev.lines === 2,
  }),
  Object.freeze({
    id: "tst",
    name: "T-spin Triple",
    description: t("지붕 아래로 T를 돌려 넣어 세 줄 지우기 · 좌우가 바뀌어요"),
    sequence: Object.freeze(["T"]),
    build: (board, rng) => {
      const right = rng.int(2) === 0;
      buildTst(board, right ? 1 + rng.int(7) : 2 + rng.int(7), right);
    },
    success: ev => ev.tspin === "full" && ev.lines === 3,
  }),
  Object.freeze({
    id: "pc",
    name: t("퍼펙트 클리어 마무리"),
    description: t("아래 두 줄의 구멍을 다음 피스들로 채워 판을 비우기 · 보통 두 개"),
    sequence: null,
    build: (board, rng, state) => {
      state.practice.need = buildPcRound(board, state.queue, rng);
      state.practice.placed = 0;
    },
    // 여러 피스로 한 번의 시도: 판을 비우면 성공, 필요한 수만큼 놓고도 못 비우면 실패
    judge: (ev, p) => {
      if (ev.perfect) return "success";
      p.placed += 1;
      return p.placed >= p.need ? "fail" : "continue";
    },
  }),
  Object.freeze({
    id: "quad",
    name: t("4줄 우물"),
    description: t("한쪽에 비워 둔 우물에 I를 세워 4줄 지우기"),
    sequence: Object.freeze(["I"]),
    build: (board, rng) => buildWell(board, rng.int(2) === 0 ? 0 : WIDTH - 1),
    success: ev => ev.lines === 4,
  }),
  Object.freeze({
    id: "double",
    name: t("2줄 우물"),
    description: t("위치가 바뀌는 두 칸짜리 구멍에 O를 넣어 2줄 지우기"),
    sequence: Object.freeze(["O"]),
    build: (board, rng) => buildDoubleWell(board, rng.int(WIDTH - 1)),
    success: ev => ev.lines === 2,
  }),
  Object.freeze({
    id: "free",
    name: t("자유 쌓기"),
    description: t("중력 없이 천천히 — 판이 높아지면 비워요"),
    sequence: null,
    build: board => clear(board),
    success: null,
  }),
  Object.freeze({
    id: "finesse",
    name: t("피네스 자유 연습"),
    description: t("가장 적은 키 입력으로 놓기 · 더 누르면 실수로 세요"),
    sequence: null,
    build: board => clear(board),
    success: null,
    finesse: true,
  }),
]);

const cache = new Map();

/** 연습 한 종류 → 모드 객체(같은 종류는 같은 객체) */
export const practiceMode = drill => {
  if (cache.has(drill.id)) return cache.get(drill.id);
  const mode = Object.freeze({
    id: `practice-${drill.id}`,
    name: t("연습 · {name}", { name: drill.name }),
    description: drill.description,
    rules: MODERN,
    practice: true,
    finesse: Boolean(drill.finesse),
    hud: Object.freeze(
      drill.success || drill.judge
        ? ["time", "lines", "pieces", "streak"]
        : drill.finesse
          ? ["time", "pieces", "pps", "finesse"]
          : ["time", "lines", "pieces"]
    ),
    ...(drill.sequence ? { sequence: drill.sequence } : {}),
    setup: (state, rng) => {
      state.practice = { tries: 0, success: 0, streak: 0, bestStreak: 0, rng };
      drill.build(state.board, rng, state);
    },
    gravityFor: () => 0,
    onLock: (state, ev, events) => {
      const p = state.practice;
      if (!drill.success && !drill.judge) {
        if (!tooHigh(state.board)) return false;
        clear(state.board);
        events.push({ type: "practice", reset: true });
        return true;
      }
      const verdict = drill.judge ? drill.judge(ev, p) : drill.success(ev) ? "success" : "fail";
      if (verdict === "continue") return false;
      p.tries += 1;
      const ok = verdict === "success";
      if (ok) {
        p.success += 1;
        p.streak += 1;
        p.bestStreak = Math.max(p.streak, p.bestStreak);
      } else {
        p.streak = 0;
      }
      events.push({ type: "practice", success: ok });
      drill.build(state.board, p.rng, state);
      return true;
    },
    check: () => null,
    hudLines: state =>
      drill.success || drill.judge
        ? { label: t("성공"), value: `${state.practice.success} / ${state.practice.tries}` }
        : { label: t("줄"), value: String(state.stats.lines) },
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary: state => ({
      title: t("연습 끝"),
      metric:
        drill.success || drill.judge
          ? `${state.practice.success} / ${state.practice.tries}`
          : drill.finesse
            ? t("실수 {faults} / {pieces}피스", {
                faults: state.finesse?.faults ?? 0,
                pieces: state.finesse?.judged ?? 0,
              })
            : t("{n}줄", { n: state.stats.lines }),
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
