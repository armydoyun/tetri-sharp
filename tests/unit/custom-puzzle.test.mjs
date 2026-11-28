// 만든 퍼즐(js/modes/custom-puzzle.js): 링크 코드 1.·2., 목표·규칙·중력·처음 홀드 피스, 퍼즐 모드의 홀드 규칙, 탐색 설정
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTH } from "../../js/core/board.js";
import { BTN, createGame } from "../../js/core/engine.js";
import {
  CHECKED_AUTO,
  CHECKED_TRIED,
  DEFAULT_RULES,
  PUZZLE_CELLS,
  baseRules,
  customPuzzleMode,
  decodePuzzle,
  encodePuzzle,
  ruleSummary,
  searchOptions,
  solutionTask,
} from "../../js/modes/custom-puzzle.js";
import { template } from "../../js/modes/puzzle-edit.js";
import { placementKey, runSolverTask } from "../../js/modes/puzzle-solver.js";

const BOTTOM = PUZZLE_CELLS - WIDTH;
/** 바닥 줄 앞 n칸을 채운 판 */
const bottomRow = n => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, BOTTOM, BOTTOM + n);
  return cells;
};

test("링크 1.: 처음 형식은 그대로 열리고 Modern·홀드 없음·중력 없음·판 비우기다", () => {
  const code = `1.${"0".repeat(47)}fff.I`;
  const p = decodePuzzle(code);
  assert.ok(p);
  assert.equal(
    p.cells.reduce((n, v) => n + v, 0),
    12
  );
  assert.deepEqual(p.goal, { kind: "pc", lines: 0 });
  assert.equal(p.gravity, "none");
  assert.deepEqual(p.rules, DEFAULT_RULES);
  assert.equal(p.rules.hold.enabled, false);
  // 다시 만들면 2. 형식, 같은 퍼즐
  const again = decodePuzzle(encodePuzzle(p));
  assert.deepEqual(again?.cells, p.cells);
  assert.equal(again?.pieces, "I");
});

test("링크 2.: 기본 퍼즐은 짧고, 목표·중력·바탕·바뀐 규칙·처음 홀드·제목이 오간다", () => {
  const cells = bottomRow(6);
  const plain = encodePuzzle({ cells, pieces: "I" });
  assert.match(plain ?? "", /^2\.-\.1[0-9a-f]{3}\.I$/, "쓰는 높이만 담는다");
  const rules = { ...baseRules("retro"), hold: { enabled: true }, previewCount: 3, tspin: "threeCorner" };
  assert.equal(baseRules("modern").hold.enabled, false, "퍼즐 바탕 규칙은 홀드 없이");
  const full = {
    cells,
    pieces: "IOT",
    goal: { kind: "lines", lines: 3 },
    gravity: /** @type {const} */ ("20g"),
    base: /** @type {const} */ ("retro"),
    rules,
    holdStart: "Z",
    title: "  첫 퍼즐  ",
    desc: "가로로 한 줄\n두 줄",
  };
  const code = encodePuzzle(full);
  assert.ok(code && code.length < 100, code ?? "");
  const back = decodePuzzle(code);
  assert.ok(back);
  assert.deepEqual(back.goal, { kind: "lines", lines: 3 });
  assert.equal(back.gravity, "20g");
  assert.equal(back.base, "retro");
  assert.equal(back.rules.hold.enabled, true);
  assert.equal(back.rules.previewCount, 3);
  assert.equal(back.rules.tspin, "threeCorner");
  assert.equal(back.rules.rotation, "classic", "바꾸지 않은 항목은 바탕(Retro)을 따른다");
  assert.equal(back.holdStart, "Z");
  assert.equal(back.title, "첫 퍼즐");
  assert.equal(back.desc, "가로로 한 줄 두 줄");
  assert.equal(encodePuzzle(back), code, "다시 만들어도 같은 코드");
});

test("링크 2.: 확인 표시는 공유할 때만 담고, 같은 퍼즐인지 가릴 때는 뺀다", () => {
  const p = { cells: bottomRow(6), pieces: "I", checked: CHECKED_AUTO | CHECKED_TRIED };
  const id = encodePuzzle(p);
  const shared = encodePuzzle(p, { checked: true });
  assert.notEqual(id, shared);
  assert.equal(decodePuzzle(shared)?.checked, CHECKED_AUTO | CHECKED_TRIED);
  assert.equal(encodePuzzle(decodePuzzle(shared) ?? p), id);
});

test("링크 2.: 모르는 설정은 건너뛰고, 망가진 코드는 거절한다", () => {
  const code = /** @type {string} */ (encodePuzzle({ cells: bottomRow(6), pieces: "I" }));
  const [, , board, pieces] = code.split(".");
  assert.ok(decodePuzzle(`2.og_Q9_xyz.${board}.${pieces}`), "모르는 기호");
  assert.equal(decodePuzzle(`2.-.${board}.`), null, "피스 없음");
  assert.equal(decodePuzzle(`2.-.0.${pieces}`), null, "높이 0");
  assert.equal(decodePuzzle(`2.-.${board}0.${pieces}`), null, "보드 길이");
  assert.equal(decodePuzzle(`2.-.${board}.${pieces}.@@`), null, "제목 글자");
  assert.equal(decodePuzzle(`2.-.${board}.X`), null, "피스 글자");
  assert.equal(decodePuzzle(`3.-.${board}.${pieces}`), null, "버전");
  assert.equal(decodePuzzle(`2.-.${"k" + "0".repeat(50)}.${"I".repeat(51)}`), null, "피스 51개");
});

test("규칙 요약: 처음 형식과 다른 것만", () => {
  assert.equal(ruleSummary({ cells: bottomRow(6), pieces: "I" }), "");
  const summary = ruleSummary({
    cells: bottomRow(6),
    pieces: "I",
    gravity: "20g",
    rules: { ...DEFAULT_RULES, hold: { enabled: true }, rotation: "ars" },
    holdStart: "T",
  });
  assert.equal(summary, "20G · ARS 회전 · 홀드(처음 T)");
});

/** 엔진으로 버튼을 차례로 누른다(누를 때마다 한 프레임 쉬고) */
const play = (game, buttons) => {
  for (let i = 0; i < 3 && !game.state.active; i++) game.step();
  for (const b of buttons) {
    game.step({ pressed: b, held: b });
    game.step();
  }
};

test("퍼즐 모드 홀드: 홀드로 순서를 바꿔 풀고, 목록이 끝나면 홀드한 피스가 나오고, 목록 밖 피스는 나오지 않는다", () => {
  const holdOn = { ...DEFAULT_RULES, hold: { enabled: true } };
  // O를 홀드하고 I를 눕혀 오른쪽 끝에 넣으면 판이 빈다
  const swap = customPuzzleMode({ cells: bottomRow(6), pieces: "OI", rules: holdOn });
  const game = createGame({ rules: swap.rules, mode: swap, seed: 1 });
  play(game, [BTN.HOLD, BTN.RIGHT, BTN.RIGHT, BTN.RIGHT, BTN.HARD]);
  assert.equal(game.state.over, "clear");

  // 처음 홀드 피스: 목록(O)을 놓고 나면 홀드한 I가 다음으로 나온다
  const start = customPuzzleMode({ cells: bottomRow(6), pieces: "O", rules: holdOn, holdStart: "I" });
  const g2 = createGame({ rules: start.rules, mode: start, seed: 1 });
  play(g2, [BTN.LEFT, BTN.LEFT, BTN.LEFT, BTN.LEFT, BTN.HARD]);
  for (let i = 0; i < 3 && !g2.state.active; i++) g2.step();
  assert.equal(g2.state.active?.type, "I");
  assert.equal(g2.state.hold, null);

  // 목록이 끝났고 홀드 칸이 비었으면 홀드할 수 없다
  const last = customPuzzleMode({ cells: bottomRow(6), pieces: "I", rules: holdOn });
  const g3 = createGame({ rules: last.rules, mode: last, seed: 1 });
  play(g3, [BTN.HOLD]);
  assert.equal(g3.state.hold, null);
  assert.equal(g3.state.active?.type, "I");
});

test("퍼즐 모드 중력: 없음은 떨어지지 않고, 20G는 나오자마자 바닥, N줄 지우기는 지운 줄 합계", () => {
  const none = customPuzzleMode({ cells: bottomRow(6), pieces: "I" });
  const g = createGame({ rules: none.rules, mode: none, seed: 1 });
  play(g, []);
  const y = g.state.active?.y;
  for (let i = 0; i < 120; i++) g.step();
  assert.equal(g.state.active?.y, y);
  const fast = customPuzzleMode({ cells: bottomRow(6), pieces: "I", gravity: "20g" });
  const g2 = createGame({ rules: fast.rules, mode: fast, seed: 1 });
  play(g2, []);
  assert.ok((g2.state.active?.y ?? 0) > 30, "바닥까지");

  // 바닥 줄 9칸 + 그 위 줄 9칸, 구멍은 오른쪽 끝: I를 세워 넣으면 두 줄 → 2줄 지우기 성공
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, BOTTOM, BOTTOM + 9);
  cells.fill(1, BOTTOM - WIDTH, BOTTOM - 1);
  const lines = customPuzzleMode({ cells, pieces: "I", goal: { kind: "lines", lines: 2 } });
  const g3 = createGame({ rules: lines.rules, mode: lines, seed: 1 });
  play(g3, [BTN.CW, BTN.RIGHT, BTN.RIGHT, BTN.RIGHT, BTN.RIGHT, BTN.HARD]);
  assert.equal(g3.state.over, "clear");
});

test("자동 확인: 홀드가 있어야 풀리는 판, 20G에서는 못 나오는 구덩이, 목표마다 놓아 볼 높이", () => {
  const holdOn = { ...DEFAULT_RULES, hold: { enabled: true } };
  const solve = p => runSolverTask(solutionTask(p));
  const withHold = solve({ cells: bottomRow(6), pieces: "OI", rules: holdOn });
  assert.ok(withHold && "moves" in withHold);
  assert.equal(withHold.moves[0].hold, true);
  assert.equal(withHold.moves[0].type, "I");
  assert.equal(solve({ cells: bottomRow(6), pieces: "OI" }), null, "홀드가 없으면 O를 먼저 놓아야 해 못 푼다");
  const startHold = solve({ cells: bottomRow(6), pieces: "O", rules: holdOn, holdStart: "I" });
  assert.ok(startHold && "moves" in startHold && startHold.moves[0].hold);

  // 바닥 줄은 오른쪽 끝만 빔, 2열·7열에 높은 벽: 0G면 벽 위로 넘어가 I를 세워 넣지만, 20G면 나오자마자 벽 사이에 떨어진다
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, BOTTOM, BOTTOM + 9);
  for (let row = 10; row < 19; row++) {
    cells[row * WIDTH + 2] = 1;
    cells[row * WIDTH + 7] = 1;
  }
  const pit = { cells, pieces: "I", goal: { kind: "lines", lines: 1 } };
  const free = solve(pit);
  assert.ok(free && "moves" in free);
  assert.equal(solve({ ...pit, gravity: "20g" }), null);

  // 높이: 판 비우기는 블록 수로 정한 높이(처음 판보다 높을 수 있다), 다른 목표는 처음 높이에서 먼저 찾고 판 전체로 넓힌다
  assert.equal(searchOptions({ cells: bottomRow(2), pieces: "IIIIIII" }).ceilingRows, 3, "2칸 + 28칸 = 세 줄");
  assert.equal(searchOptions({ cells: bottomRow(6), pieces: "I" }).ceilingRows, 2, "적어도 두 줄");
  const other = searchOptions({ ...pit });
  assert.equal(other.ceilingRows, undefined);
  assert.equal(other.looseRows, 20);
});

test("풀이 비교는 첫 피스의 칸이 다른 퍼펙트 클리어와 홀드 경로를 찾는다", () => {
  const solve = (rows, pieces, rules) => {
    const cells = new Uint8Array(PUZZLE_CELLS);
    cells.set(
      rows.flatMap(row => [...row].map(Number)),
      PUZZLE_CELLS - rows.length * WIDTH
    );
    const task = solutionTask({ cells, pieces, rules });
    const result = runSolverTask(task);
    assert.ok(result && "moves" in result);
    const baseline = result.moves;
    const other = runSolverTask({ ...task, type: "comparison", excludeFirst: placementKey(baseline[0]) });
    assert.equal(other.comparison, "found");
    assert.notEqual(placementKey(other.alternative[0]), placementKey(baseline[0]));
    return [baseline, other.alternative];
  };
  const pc = solve(["1100110011", "1100110011"], "OO");
  assert.deepEqual(
    pc.map(path => path.map(move => move.lines)),
    [
      [0, 2],
      [0, 2],
    ]
  );
  const [direct, hold] = solve(["1000010011", "1111110011"], "IO", { ...DEFAULT_RULES, hold: { enabled: true } });
  assert.equal(direct[0].hold, false);
  assert.equal(hold[0].hold, true);
  assert.deepEqual(
    hold.map(move => [move.type, move.lines]),
    [
      ["O", 1],
      ["I", 1],
    ]
  );
});

test("풀이 비교는 같은 첫 배치를 제외하고 다른 경로를 찾지 못했는지 또는 탐색 제한에 걸렸는지 구분한다", () => {
  const spinTask = solutionTask(template("tsd"));
  const spin = runSolverTask(spinTask);
  assert.equal(spin.moves[0].tspin, "full");
  assert.equal(spin.moves[0].lines, 2);
  const key = placementKey(spin.moves[0]);
  assert.equal(key, placementKey({ ...spin.moves[0], cells: spin.moves[0].cells.toReversed(), hold: true }));
  assert.deepEqual(runSolverTask({ ...spinTask, type: "comparison", excludeFirst: key }), { comparison: "checked" });

  const limited = solutionTask({ cells: bottomRow(1), pieces: "IIIIIIII", goal: { kind: "lines", lines: 20 } });
  assert.deepEqual(runSolverTask({ ...limited, type: "comparison", excludeFirst: "I/393,394,395,396" }), {
    comparison: "limit",
  });
});

test("클래식 점수표를 써도 퍼즐의 줄 삭제 연속 횟수는 탐색과 실제 판에서 같다", () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.set(Array.from("11100001111110000111", Number), PUZZLE_CELLS - 2 * WIDTH);
  const puzzle = { cells, pieces: "II", goal: { kind: "combo" }, rules: { ...DEFAULT_RULES, scoring: "classic" } };
  const solution = runSolverTask(solutionTask(puzzle));
  assert.deepEqual(
    solution.moves.map(move => move.lines),
    [1, 1]
  );
  const mode = customPuzzleMode(puzzle);
  const game = createGame({ mode, rules: mode.rules, seed: 1 });
  play(game, [BTN.HARD]);
  assert.equal(game.state.puzzle.combo, 0);
  play(game, [BTN.HARD]);
  assert.equal(game.state.puzzle.combo, 1);
  assert.equal(game.state.combo, -1, "클래식 점수표의 콤보 보너스는 그대로다");
  assert.equal(game.state.over, "clear");
});

test("퍼즐 링크에서도 180도 제한과 고정 DCD·즉시 소프트 드롭이 왕복한다", () => {
  const rules = {
    ...DEFAULT_RULES,
    allow180: false,
    fixedHandling: { das: 7, arr: 2, sdf: 12, dcd: 0, instantSoftDrop: true },
  };
  const source = { cells: bottomRow(6), pieces: "I", rules };
  const decoded = decodePuzzle(encodePuzzle(source));
  assert.equal(decoded.rules.allow180, false);
  assert.deepEqual(decoded.rules.fixedHandling, rules.fixedHandling);
  assert.equal(solutionTask(decoded).opts.allow180, false);
});
