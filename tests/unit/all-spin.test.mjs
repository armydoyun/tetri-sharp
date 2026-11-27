import assert from "node:assert/strict";
import { test } from "node:test";
import { HEIGHT, set, WIDTH } from "../../js/core/board.js";
import { BTN, createGame } from "../../js/core/engine.js";
import { detectSpin, movedByRotation } from "../../js/core/spins.js";
import {
  customPuzzleMode,
  decodePuzzle,
  DEFAULT_RULES,
  encodePuzzle,
  PUZZLE_CELLS,
  solutionTask,
} from "../../js/modes/custom-puzzle.js";
import { runSolverTask } from "../../js/modes/puzzle-solver.js";
import { analyzeReplay } from "../../js/replay/analyze.js";
import { createPlayer, createRecorder, sanitizeReplay, verifyReplay } from "../../js/replay/replay.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { makeCustomRules, rulesId, sanitizeRuleBody } from "../../js/rules/sanitize.js";
import { decodeRules, encodeRules } from "../../js/rules/share.js";
import { ALL_SPINS, spinBit, spinMask, spinSettings, T_SPIN } from "../../js/rules/spins.js";

const pocket = () => {
  const cells = new Uint8Array(PUZZLE_CELLS);
  cells.fill(1, cells.length - WIDTH);
  cells[cells.length - WIDTH + 4] = cells[cells.length - WIDTH + 5] = 0;
  cells[cells.length - 3 * WIDTH + 5] = 1;
  return cells;
};
const oOnly = spinBit("O");
const handling = { das: 12, arr: 2, sdf: Infinity };
const toPocket = [
  [0, BTN.LEFT],
  [BTN.SOFT, 0],
  [0, BTN.CW],
  [0, BTN.HARD],
];

test("미노별 스핀: 기존 없음·T 전용을 정규화하고 Custom 공유 코드로 조합을 보존한다", () => {
  const enabled = spinBit("L") | T_SPIN;
  const custom = makeCustomRules({ ...MODERN, ...spinSettings(enabled) });
  assert.equal(spinMask(decodeRules(encodeRules(custom))), enabled);
  assert.equal(spinMask(sanitizeRuleBody({ ...MODERN, spinPieces: ALL_SPINS })), ALL_SPINS);
  assert.equal(spinMask(sanitizeRuleBody({ ...MODERN, spinPieces: -1 })), T_SPIN);
  assert.equal(rulesId({ ...MODERN, spinPieces: T_SPIN }), rulesId(MODERN));
  assert.equal(rulesId({ ...MODERN, spinPieces: 0 }), rulesId({ ...MODERN, tspin: "none" }));
  assert.notEqual(custom.id, rulesId(MODERN));
});

test("I·J·L·S·Z는 실제 회전 뒤 네 방향이 모두 막히고 해당 미노를 켰을 때 판정한다", () => {
  const fixtures = {
    I: [
      [0, 2],
      [0, 0],
      [-1, 1],
      [4, 1],
    ],
    J: [
      [2, 2],
      [0, -1],
      [-1, 0],
      [3, 1],
    ],
    L: [
      [0, 2],
      [2, -1],
      [-1, 1],
      [3, 0],
    ],
    S: [
      [2, 1],
      [1, -1],
      [-1, 1],
      [3, 0],
    ],
    Z: [
      [1, 2],
      [0, -1],
      [-1, 0],
      [2, 0],
    ],
  };
  for (const [type, blocks] of Object.entries(fixtures)) {
    const fixture = createGame({ rules: { ...MODERN, gravity: 0, ...spinSettings(ALL_SPINS) } });
    fixture.step();
    const board = fixture.state.board;
    const x = 3;
    const y = HEIGHT - 6;
    for (const [dx, dy] of blocks) set(board, x + dx, y + dy, 8);
    fixture.state.active = { type, x, y, rot: 3, lastAction: null, kick: 0 };
    fixture.step({ pressed: BTN.CW });
    const a = { ...fixture.state.active };
    assert.equal(a.rot, 0);
    assert.equal(detectSpin(board, ROTATIONS.srs, a, ALL_SPINS & ~spinBit(type)).spinPiece, undefined);
    assert.equal(detectSpin(board, ROTATIONS.srs, { ...a, lastAction: "move" }, ALL_SPINS).spinPiece, undefined);
    const [leftX, leftY] = blocks[2];
    set(board, x + leftX, y + leftY, 0);
    assert.equal(detectSpin(board, ROTATIONS.srs, a, ALL_SPINS).spinPiece, undefined);
    set(board, x + leftX, y + leftY, 8);
    assert.equal(fixture.step({ pressed: BTN.HARD }).find(e => e.type === "lock").spinPiece, type);
  }
  assert.equal(movedByRotation(ROTATIONS.ars, "I", 0, 2, 0, 0), false);
});

test("O스핀 포켓: 퍼즐 링크·탐색·실제 엔진·리플레이가 같은 이동과 판정을 사용한다", () => {
  const puzzle = { cells: pocket(), pieces: "O", goal: { kind: "lines", lines: 1 } };
  const modeFor = mask => {
    const rules = makeCustomRules({ ...DEFAULT_RULES, ...spinSettings(mask) });
    const parsed = decodePuzzle(encodePuzzle({ ...puzzle, rules }));
    assert.equal(spinMask(parsed.rules), mask);
    return { parsed, rules, mode: { ...customPuzzleMode(parsed), id: "spin-test" } };
  };
  const enabled = modeFor(oOnly);
  const disabled = modeFor(T_SPIN);
  const solution = runSolverTask(solutionTask(enabled.parsed));
  assert.equal(solution.moves[0].spinPiece, "O");
  assert.equal(runSolverTask(solutionTask(disabled.parsed)), null);
  const findMode = () => enabled.mode;
  const seed = 1;
  const recorder = createRecorder({ ...enabled, seed, handling });
  const game = createGame({ ...enabled, seed, handling });
  let events;
  for (const [held, pressed] of toPocket) {
    recorder.input(held, pressed);
    events = game.step({ held, pressed });
    if (pressed === BTN.CW) {
      const task = solutionTask(enabled.parsed);
      const hint = runSolverTask({
        ...task,
        type: "first",
        active: game.state.active,
        combo: -1,
        rest: [],
      });
      assert.deepEqual(hint.steps, [], "이미 돌려 넣었으면 다시 회전시킬 필요가 없다");
      assert.deepEqual(hint.cells, solution.moves[0].cells);
    }
  }
  const lock = events.find(e => e.type === "lock");
  assert.deepEqual(lock.cells, solution.moves[0].cells);
  assert.equal(lock.spinPiece, "O");
  assert.equal(lock.tspin, "none");
  assert.equal(lock.points, 100, "다른 미노의 스핀은 기존 일반 삭제 점수를 유지");
  assert.equal(game.state.tally.clears["O-1"], 1);
  assert.equal(game.state.over, "clear");
  const replay = sanitizeReplay(JSON.parse(JSON.stringify(recorder.finish(game.state))), findMode);
  assert.equal(verifyReplay(replay, findMode).ok, true);
  assert.equal(
    analyzeReplay(replay, findMode).markers.some(mark => mark.label === "O-SPIN SINGLE"),
    true
  );
  const player = createPlayer(replay, findMode);
  let played;
  while (!player.done) played = player.step();
  assert.deepEqual(
    played.find(e => e.type === "lock"),
    lock
  );
  const off = createGame({ ...disabled, handling });
  for (const [held, pressed] of toPocket) events = off.step({ held, pressed });
  assert.equal(events.find(e => e.type === "lock").spinPiece, undefined);
  assert.equal(off.state.over, "fail");
});

test("O는 제자리 회전이나 180도 회전으로 스핀이 되지 않는다", () => {
  const game = createGame({
    rules: { ...MODERN, gravity: 0, ...spinSettings(oOnly) },
    mode: { sequence: ["O"] },
    handling,
  });
  game.step({ held: BTN.SOFT });
  const { x, y } = game.state.active;
  game.step({ pressed: BTN.CW });
  assert.deepEqual([game.state.active.x, game.state.active.y], [x, y]);
  assert.equal(game.step({ pressed: BTN.R180 | BTN.HARD }).find(e => e.type === "lock").spinPiece, undefined);
});
