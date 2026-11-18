// 퍼즐 모드: 정해진 판과 정해진 피스로 목표를 이루는 단계형 문제. 중력 없음, 늘 Modern 규칙.
//  - 판 비우기: 아래 두 줄의 구멍을 주어진 피스로 채워 퍼펙트 클리어(피스 1~4개)
//  - T-spin Double / Triple: 주어진 T 하나로
// 단계는 시드로 만들어 어디서나 같고, 모든 단계는 풀 수 있게 만든다(단위 테스트가 탐색기로 확인한다).
import { MODERN } from "../rules/presets.js";
import { createRng } from "../core/rng.js";
import { WIDTH } from "../core/board.js";
import { buildPcExact, buildTsd, buildTst } from "./practice.js";
import { t } from "../i18n/index.js";

const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

/**
 * 단계 계획: [종류, 피스 수]. 앞쪽은 쉽게(피스 하나), 뒤로 갈수록 피스가 늘고 T-spin이 섞인다.
 * @type {ReadonlyArray<[ "pc" | "tsd" | "tst", number ]>}
 */
const PLAN = Object.freeze([
  ["pc", 1],
  ["pc", 1],
  ["pc", 1],
  ["tsd", 1],
  ["pc", 1],
  ["pc", 2],
  ["pc", 2],
  ["tsd", 1],
  ["pc", 2],
  ["tst", 1],
  ["pc", 2],
  ["pc", 2],
  ["tsd", 1],
  ["pc", 3],
  ["tst", 1],
  ["pc", 3],
  ["pc", 2],
  ["pc", 3],
  ["tsd", 1],
  ["pc", 3],
  ["tst", 1],
  ["pc", 3],
  ["pc", 4],
  ["pc", 3],
  ["tsd", 1],
  ["pc", 4],
  ["tst", 1],
  ["pc", 4],
  ["pc", 4],
  ["pc", 4],
]);

/**
 * 단계 하나 만들기: 판을 그리는 함수, 피스 순서, 목표.
 * 판 비우기는 시드로 피스를 뽑아 구멍을 만들고, 못 만들면 다음 시드로 다시 한다(늘 같은 결과).
 */
const makeStage = index => {
  const [kind, count] = PLAN[index];
  if (kind === "tsd" || kind === "tst") {
    const rng = createRng(7001 + index);
    const right = rng.int(2) === 0;
    const where = kind === "tsd" ? rng.int(WIDTH - 2) : right ? 1 + rng.int(7) : 2 + rng.int(7);
    // 자리는 만들 때 한 번 정한다(다시 해도 같은 문제)
    return {
      kind,
      pieces: ["T"],
      build: board => (kind === "tsd" ? buildTsd(board, where, right) : buildTst(board, where, right)),
      goal: ev => ev.tspin === "full" && ev.lines === (kind === "tsd" ? 2 : 3),
    };
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = createRng(9001 + index * 977 + attempt);
    const pieces = Array.from({ length: count }, () => TYPES[rng.int(TYPES.length)]);
    const board = { width: WIDTH, height: 40, cells: new Uint8Array(WIDTH * 40) };
    const holeRng = createRng(31 + index * 131 + attempt);
    if (!buildPcExact(board, pieces, holeRng)) continue;
    const cells = board.cells.slice();
    return {
      kind,
      pieces,
      build: target => target.cells.set(cells),
      goal: ev => ev.perfect,
    };
  }
  throw new Error(`퍼즐 단계를 만들 수 없습니다: ${index + 1}`);
};

/** 모든 단계(앞에서 한 번 만들어 둔다) */
export const PUZZLES = Object.freeze(PLAN.map((_, i) => Object.freeze({ number: i + 1, ...makeStage(i) })));

export const KIND_NAMES = Object.freeze({
  pc: t("판 비우기"),
  tsd: "T-spin Double",
  tst: "T-spin Triple",
});

const cache = new Map();

/** 단계 → 모드 */
export const puzzleMode = puzzle => {
  if (cache.has(puzzle.number)) return cache.get(puzzle.number);
  const need = puzzle.pieces.length;
  const mode = Object.freeze({
    id: `puzzle-${puzzle.number}`,
    name: t("퍼즐 {n} · {kind}", { n: puzzle.number, kind: KIND_NAMES[puzzle.kind] }),
    description: KIND_NAMES[puzzle.kind],
    rules: MODERN,
    puzzle,
    hud: Object.freeze(["time", "lines", "pieces"]),
    sequence: Object.freeze([...puzzle.pieces]),
    setup: state => {
      state.puzzle = { placed: 0, result: null, need };
      puzzle.build(state.board);
    },
    gravityFor: () => 0,
    onLock: (state, ev) => {
      const p = state.puzzle;
      p.placed += 1;
      if (puzzle.goal(ev)) p.result = "clear";
      else if (p.placed >= need) p.result = "fail";
      return false;
    },
    check: state => (state.puzzle.result ? { result: state.puzzle.result } : null),
    hudLines: state => ({ label: t("남은 피스"), value: String(Math.max(0, need - state.puzzle.placed)) }),
    hudTime: state => ({ label: t("시간"), frames: state.frame }),
    summary: state => ({
      title: state.over === "clear" ? t("성공!") : t("실패"),
      main: t("단계 {n}", { n: puzzle.number }),
    }),
    record: Object.freeze({ metric: "frames", order: "asc" }),
    formatRecord: () => "",
    isRecordable: () => false,
    noReplay: false,
  });
  cache.set(puzzle.number, mode);
  return mode;
};

export const findPuzzle = id => {
  const m = /^puzzle-(\d+)$/.exec(String(id));
  const p = m && PUZZLES[Number(m[1]) - 1];
  return p ? puzzleMode(p) : null;
};

/** 깬 단계(이 기기) */
export const createPuzzleProgress = store => {
  const read = () => {
    const raw = store.get("puzzle:cleared", []);
    return new Set(Array.isArray(raw) ? raw.filter(n => Number.isInteger(n) && n >= 1 && n <= PUZZLES.length) : []);
  };
  return {
    cleared: read,
    markCleared(n) {
      const s = read();
      s.add(n);
      store.set(
        "puzzle:cleared",
        [...s].sort((a, b) => a - b)
      );
    },
    /** 다음에 할 단계: 아직 안 깬 가장 앞 단계 */
    next() {
      const s = read();
      return PUZZLES.find(p => !s.has(p.number)) ?? PUZZLES[PUZZLES.length - 1];
    },
  };
};
