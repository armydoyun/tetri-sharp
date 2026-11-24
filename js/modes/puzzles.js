// 퍼즐 모드: 정해진 판과 정해진 피스로 목표를 이루는 단계형 문제. 중력 없음, 늘 Modern 규칙.
//  - 판 비우기: 아래 두 줄의 구멍을 주어진 피스로 채워 퍼펙트 클리어(피스 1~4개)
//  - 4줄 만들기: 한 열을 우물로 남긴 아래 네 줄의 구멍을 앞 피스로 채우고 마지막 I로 4줄(피스 2~4개)
//  - 밀어 넣기: 처마 아래 빈칸에 피스 하나를 소프트 드롭으로 내린 뒤 옆으로 밀어 넣어 2줄(곧장 떨어뜨려서는 안 풀린다)
//  - T-spin Double / Triple: 주어진 T 하나로
// 단계는 시드로 만들어 어디서나 같고, 모든 단계는 풀 수 있게 만든다(단위 테스트가 탐색기로 확인한다).
import { MODERN } from "../rules/presets.js";
import { createRng } from "../core/rng.js";
import { WIDTH } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { buildPcExact, buildQuadExact, buildTsd, buildTst } from "./practice.js";
import { t } from "../i18n/index.js";

const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

/**
 * 단계 계획: [종류, 피스 수]. 앞쪽은 쉽게(피스 하나), 뒤로 갈수록 피스가 늘고 T-spin이 섞인다.
 * 뒤에 붙인 단계(31~)는 나중에 더한 장이다. 이미 있는 단계의 번호(id)·시드는 바꾸지 않는다(진행도·리플레이가 id로 맞는다).
 * @type {ReadonlyArray<[ "pc" | "quad" | "tuck" | "tsd" | "tst", number ]>}
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
  // 4줄 만들기(피스 수는 마지막 I 포함)
  ["quad", 2],
  ["quad", 2],
  ["quad", 2],
  ["quad", 3],
  ["quad", 3],
  ["quad", 3],
  ["quad", 4],
  ["quad", 4],
  // 밀어 넣기(판은 아래 TUCK_BOARDS)
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
  ["tuck", 1],
]);

/**
 * 밀어 넣기 판(아래 네 줄, 위에서부터). "#" 블록, "." 빈칸.
 * 처마가 빈칸 바로 위를 덮어, 피스를 옆에 내린 뒤 밀어 넣어야만 아래 두 줄이 찬다.
 * 무작위로 만든 판 가운데 "밀어 넣으면 2줄, 곧장 떨어뜨리면 못 지움"을 탐색기로 확인한 것만 골랐다(단위 테스트가 다시 확인한다).
 * 피스 수가 같으니 쉬운 모양(I·L)부터 T까지.
 */
/** @type {ReadonlyArray<[string, string[]]>} */
const TUCK_BOARDS = Object.freeze([
  ["I", ["..##......", ".##.......", "###....###", "##########"]],
  ["I", ["....##....", ".#..#.....", "#####....#", "##########"]],
  ["L", ["##........", "#.........", "#...######", "#.########"]],
  ["L", ["...##.....", "...#......", "####...###", "####.#####"]],
  ["J", ["......##..", "..#....#..", "####...###", "######.###"]],
  ["T", ["...##.....", "...#......", "####...###", "#####.####"]],
  ["T", [".....##...", "...#.#....", "######...#", "#######.##"]],
  ["T", ["...##.....", "....#....#", "#...######", "##.#######"]],
]);

/** 아래 네 줄에서 우물 열을 뺀 빈칸이 몇 덩어리(상하좌우로 이어진)인가 */
const holeGroups = (board, well) => {
  const top = board.height - 4;
  const empty = (x, y) =>
    x !== well && y >= top && y < board.height && x >= 0 && x < WIDTH && !board.cells[y * WIDTH + x];
  const seen = new Set();
  let groups = 0;
  for (let y = top; y < board.height; y++)
    for (let x = 0; x < WIDTH; x++) {
      if (!empty(x, y) || seen.has(y * WIDTH + x)) continue;
      groups += 1;
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = /** @type {[number, number]} */ (stack.pop());
        const key = cy * WIDTH + cx;
        if (seen.has(key) || !empty(cx, cy)) continue;
        seen.add(key);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
  return groups;
};

/**
 * 울퉁불퉁함: 우물 열을 뺀 열마다 위에서 빈칸이 이어진 깊이를 재고, 이웃 열과의 차를 더한다.
 * 한 칸 폭의 좁은 틈이 여기저기 있으면 커진다(깔끔한 판 4~8, 흩어진 판 9~13).
 */
const bumpiness = (board, well) => {
  const top = board.height - 4;
  const depths = [];
  for (let x = 0; x < WIDTH; x++) {
    if (x === well) continue;
    let d = 0;
    while (d < 4 && !board.cells[(top + d) * WIDTH + x]) d += 1;
    depths.push(d);
  }
  return depths.slice(1).reduce((sum, d, i) => sum + Math.abs(d - depths[i]), 0);
};

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
  if (kind === "tuck") {
    const [piece, rows] = TUCK_BOARDS[PLAN.slice(0, index).filter(([k]) => k === "tuck").length];
    return {
      kind,
      pieces: [piece],
      build: board => {
        board.cells.fill(0);
        const top = board.height - rows.length;
        rows.forEach((row, dy) => {
          for (let x = 0; x < WIDTH; x++) if (row[x] === "#") board.cells[(top + dy) * WIDTH + x] = GARBAGE;
        });
      },
      goal: ev => ev.lines === 2,
    };
  }
  if (kind === "quad") {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rng = createRng(12001 + index * 977 + attempt);
      // I는 마지막에 우물로 → 앞 피스에는 I를 섞지 않는다(I가 우물 말고 다른 데 세워지면 헷갈린다)
      const front = Array.from({ length: count - 1 }, () => TYPES[1 + rng.int(TYPES.length - 1)]);
      const well = rng.int(2) === 0 ? rng.int(3) : WIDTH - 1 - rng.int(3);
      const board = { width: WIDTH, height: 40, cells: new Uint8Array(WIDTH * 40) };
      if (!buildQuadExact(board, front, createRng(53 + index * 131 + attempt), well)) continue;
      // 빈칸(우물 빼고)이 판 전체에 흩어지면 처음 보는 사람에게 너무 어렵다 → 한두 덩어리로 모인 판만 쓴다(3차 평가 F36)
      if (holeGroups(board, well) > 2 || bumpiness(board, well) > 8) continue;
      const cells = board.cells.slice();
      return {
        kind,
        pieces: [...front, "I"],
        build: target => target.cells.set(cells),
        goal: ev => ev.lines === 4,
      };
    }
    throw new Error(`퍼즐 단계를 만들 수 없습니다: ${index + 1}`);
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

export const KIND_NAMES = Object.freeze({
  pc: t("판 비우기"),
  quad: t("4줄 만들기"),
  tuck: t("처마 밀어 넣기"),
  tsd: "T-spin Double",
  tst: "T-spin Triple",
});

/** 장 순서(쉬운 것부터): 판 비우기 → 4줄 만들기 → 밀어 넣기 → T-spin Double → T-spin Triple */
export const CHAPTERS = Object.freeze(["pc", "quad", "tuck", "tsd", "tst"]);

/**
 * 모든 단계(앞에서 한 번 만들어 둔다). 보여 주는 순서는 장별로, 장 안에서는 피스가 적은 것부터.
 * - id: 만들 때의 번호(PLAN 순서). 판을 만드는 시드, 모드 id("puzzle-<id>"), 깬 단계 저장이 이 값을 쓴다
 *   → 순서를 바꿔도 저장된 진행도·리플레이·이어서 하기가 그대로 맞는다.
 * - number: 화면에 보이는 단계 번호(보여 주는 순서).
 */
export const PUZZLES = Object.freeze(
  PLAN.map((_, i) => ({ id: i + 1, ...makeStage(i) }))
    .sort(
      (a, b) => CHAPTERS.indexOf(a.kind) - CHAPTERS.indexOf(b.kind) || a.pieces.length - b.pieces.length || a.id - b.id
    )
    .map((stage, i) => Object.freeze({ ...stage, number: i + 1 }))
);

const cache = new Map();

export const makePuzzleMode = (puzzle, rules = MODERN) => {
  const need = puzzle.pieces.length;
  return Object.freeze({
    id: puzzle.number ? `puzzle-${puzzle.id}` : "custom-puzzle",
    name: puzzle.number ? t("퍼즐 {n} · {kind}", { n: puzzle.number, kind: KIND_NAMES[puzzle.kind] }) : t("만든 퍼즐"),
    description: KIND_NAMES[puzzle.kind],
    rules,
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
      main: puzzle.number ? t("단계 {n}", { n: puzzle.number }) : t("만든 퍼즐"),
    }),
    record: Object.freeze({ metric: "frames", order: "asc" }),
    formatRecord: () => "",
    isRecordable: () => false,
    noReplay: !puzzle.number,
  });
};

/** 단계 → 모드 */
export const puzzleMode = puzzle => {
  if (!cache.has(puzzle.id)) cache.set(puzzle.id, makePuzzleMode(puzzle));
  return cache.get(puzzle.id);
};

/** "puzzle-<id>" → 그 단계의 모드(id는 만들 때의 번호) */
export const findPuzzle = id => {
  const m = /^puzzle-(\d+)$/.exec(String(id));
  const p = m && PUZZLES.find(stage => stage.id === Number(m[1]));
  return p ? puzzleMode(p) : null;
};

/** 깬 단계(이 기기). 저장하는 값은 단계 id(만들 때의 번호) */
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
    /** 다음에 할 단계: 보여 주는 순서로 아직 안 깬 가장 앞 단계 */
    next() {
      const s = read();
      return PUZZLES.find(p => !s.has(p.id)) ?? PUZZLES[PUZZLES.length - 1];
    },
  };
};
