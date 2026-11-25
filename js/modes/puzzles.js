// 퍼즐 모드: 정해진 판과 정해진 피스로 목표를 이루는 단계형 문제. 중력 없음, 늘 Modern 규칙.
//  - 판 비우기: 아래 두 줄의 구멍을 주어진 피스로 채워 퍼펙트 클리어(피스 1~4개)
//  - 4줄 만들기: 한 열을 우물로 남긴 아래 네 줄의 구멍을 앞 피스로 채우고 마지막 I로 4줄(피스 2~4개)
//  - 콤보 이어 가기: 4칸 우물에 피스를 하나씩 넣어 피스마다 한 줄 이상 지우기(콤보가 끊기면 실패)
//  - 밀어 넣기: 처마 아래 빈칸에 피스 하나를 소프트 드롭으로 내린 뒤 옆으로 밀어 넣어 2줄(곧장 떨어뜨려서는 안 풀린다)
//  - 돌려 넣기: S·Z·L·J 하나를 바닥 근처에서 돌려(벽 차기) 틈에 끼워 2줄(곧장 떨어뜨리거나 밀어 넣어서는 안 풀린다)
//  - T-spin Mini: T 하나를 벽이나 턱 옆에서 돌려 넣어 Mini로 줄 지우기(곧장 떨어뜨리면 Mini가 아니다)
//  - T-spin Double / Triple: 주어진 T 하나로
// 단계는 시드로 만들어 어디서나 같고, 모든 단계는 풀 수 있게 만든다(단위 테스트가 탐색기로 확인한다).
import { MODERN } from "../rules/presets.js";
import { createRng } from "../core/rng.js";
import { WIDTH } from "../core/board.js";
import { GARBAGE } from "../core/pieces.js";
import { buildPcExact, buildQuadExact, buildTsd, buildTst } from "./practice.js";
import { t } from "../i18n/index.js";
import { goalOf } from "./puzzle-goals.js";

const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

/**
 * 단계 계획: [종류, 피스 수]. 앞쪽은 쉽게(피스 하나), 뒤로 갈수록 피스가 늘고 T-spin이 섞인다.
 * 뒤에 붙인 단계(31~)는 나중에 더한 장이다. 이미 있는 단계의 번호(id)·시드는 바꾸지 않는다(진행도·리플레이가 id로 맞는다).
 * @type {ReadonlyArray<[ "pc" | "quad" | "tuck" | "combo" | "spin" | "mini" | "tsd" | "tst", number ]>}
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
  // 콤보 이어 가기(판은 아래 COMBO_BOARDS, 피스 수는 판에 적힌 피스 수)
  ["combo", 3],
  ["combo", 3],
  ["combo", 4],
  ["combo", 4],
  ["combo", 5],
  ["combo", 5],
  ["combo", 6],
  ["combo", 7],
  // 돌려 넣기(판은 아래 SPIN_BOARDS)
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  ["spin", 1],
  // T-spin Mini(판은 아래 MINI_BOARDS)
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
  ["mini", 1],
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

/**
 * 돌려 넣기 판(아래 서너 줄, 위에서부터). 틈이 피스 모양이지만 처마나 어긋난 칸 때문에 곧장 떨어뜨리거나
 * 바닥에서 옆으로 밀어서는 들어가지 않고, 근처에서 돌려야(벽 차기) 들어간다.
 * 무작위 판 가운데 "돌리면 2줄, 위에서만 돌리고 내리기·밀기로는 2줄 못 지움"을 탐색기로 고른 것(단위 테스트가 다시 확인한다).
 * 180° 회전 없이 풀리는 판만 쓴다(휴대폰 버튼·제스처에는 180° 회전이 없다).
 * 눕힌 S·Z부터 세운 S, L·J까지.
 */
/** @type {ReadonlyArray<[string, string[]]>} */
const SPIN_BOARDS = Object.freeze([
  ["Z", ["........#.", "####..####", "#####..###"]],
  ["S", ["#.........", "#.#.....#.", "####..####", "###..#####"]],
  ["J", ["#.#.......", "#####.####", "#####...##"]],
  ["L", [".#......#.", "#######...", "#######.##"]],
  ["S", [".##.......", "..........", "##..######", "###.######"]],
  ["Z", [".#...#....", ".##..#..#.", "#####..###", "######..##"]],
  ["J", [".......#..", "###....#..", "###.######", "###...####"]],
  ["L", ["##..#....#", "########.#", "######...#"]],
]);

/**
 * T-spin Mini 판: T를 돌려 마지막에 넣으면 모서리 셋이 막혀 Mini가 되고 맨 아래 한 줄이 지워진다.
 * 무작위 판 가운데 "180° 회전 없이 Mini로 한 줄"이 되는 것을 탐색기로 골랐다(단위 테스트가 다시 확인한다).
 * 벽에 붙은 자리부터 턱 사이 자리까지.
 */
/** @type {ReadonlyArray<[string, string[]]>} */
const MINI_BOARDS = Object.freeze([
  ["T", ["....#.....", "#########."]],
  ["T", ["...#......", ".#########"]],
  ["T", ["..#.......", "..........", "###.######"]],
  ["T", ["......#...", ".#........", "#######.##"]],
  ["T", ["...#......", "......#...", "##.#######"]],
  ["T", [".#..##.#..", "#######..."]],
  ["T", ["...#...#..", ".......##.", "####.#####"]],
  ["T", [".....#....", "#......#..", "####.#####"]],
]);

/** 판 그림(행 문자열, 위에서부터)을 보드 맨 아래에 그린다 */
const drawRows = (board, rows) => {
  board.cells.fill(0);
  const top = board.height - rows.length;
  rows.forEach((row, dy) => {
    for (let x = 0; x < WIDTH; x++) if (row[x] === "#") board.cells[(top + dy) * WIDTH + x] = GARBAGE;
  });
};

/**
 * 콤보 판: [피스 순서, 우물 왼쪽 열(0 또는 6), 맨 아래 줄 우물에서 비운 칸(0~3)].
 * 4칸 폭 우물 밖은 피스 수+1 줄 높이로 채우고, 우물 맨 아래에는 세 칸이 남아 있다(4-wide 콤보 자리).
 * 피스마다 한 줄 이상 지우는 길이 있는 순서만 골랐다(단위 테스트가 탐색기로 다시 확인한다).
 */
/** @type {ReadonlyArray<[string, number, number]>} */
const COMBO_BOARDS = Object.freeze([
  ["LZT", 0, 1],
  ["JTS", 0, 0],
  ["JJLT", 6, 2],
  ["TLTZ", 6, 1],
  ["ZJLTL", 6, 0],
  ["TJLIS", 6, 2],
  ["JZLJSZ", 6, 0],
  ["JLTJITZ", 6, 2],
]);

/** 같은 종류 단계 가운데 몇 번째인가(판 목록에서 고를 때) */
const nthOfKind = index => PLAN.slice(0, index).filter(([k]) => k === PLAN[index][0]).length;

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
      ...goalOf(kind, 1),
    };
  }
  if (kind === "tuck" || kind === "spin") {
    const [piece, rows] = (kind === "tuck" ? TUCK_BOARDS : SPIN_BOARDS)[nthOfKind(index)];
    return { kind, pieces: [piece], build: board => drawRows(board, rows), ...goalOf(kind, 1) };
  }
  if (kind === "mini") {
    const [piece, rows] = MINI_BOARDS[nthOfKind(index)];
    return {
      kind,
      pieces: [piece],
      build: board => drawRows(board, rows),
      ...goalOf(kind, 1),
    };
  }
  if (kind === "combo") {
    const [order, left, gap] = COMBO_BOARDS[nthOfKind(index)];
    const pieces = [...order];
    if (pieces.length !== count) throw new Error(`콤보 단계 피스 수가 맞지 않습니다: ${index + 1}`);
    return {
      kind,
      pieces,
      build: board => {
        board.cells.fill(0);
        for (let y = board.height - count - 1; y < board.height; y++)
          for (let x = 0; x < WIDTH; x++) {
            const inWell = x >= left && x < left + 4;
            if (!inWell || (y === board.height - 1 && x !== left + gap)) board.cells[y * WIDTH + x] = GARBAGE;
          }
      },
      ...goalOf(kind, count),
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
        ...goalOf(kind, count),
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
      ...goalOf(kind, count),
    };
  }
  throw new Error(`퍼즐 단계를 만들 수 없습니다: ${index + 1}`);
};

export const KIND_NAMES = Object.freeze({
  pc: t("판 비우기"),
  quad: t("4줄 만들기"),
  tuck: t("처마 밀어 넣기"),
  combo: t("콤보 이어 가기"),
  spin: t("돌려 넣기"),
  mini: "T-spin Mini",
  tsd: "T-spin Double",
  tst: "T-spin Triple",
});

/** 장 순서(쉬운 것부터): 판 비우기 → 4줄 만들기 → 콤보 → 밀어 넣기 → 돌려 넣기 → T-spin Mini → Double → Triple */
export const CHAPTERS = Object.freeze(["pc", "quad", "combo", "tuck", "spin", "mini", "tsd", "tst"]);

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
      else if (p.placed >= need || puzzle.broken?.(ev)) p.result = "fail";
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
