import assert from "node:assert/strict";
import { test } from "node:test";
import { BTN, createGame } from "../../js/core/engine.js";
import { sameCells } from "../../js/modes/placement-hints.js";
import { SPIN_LESSONS } from "../../js/modes/spin-lessons.js";

const { LEFT, RIGHT, SOFT, HARD, CW, CCW } = BTN;
const setup = mode => {
  const game = createGame({ rules: mode.rules, mode, handling: { das: 8, arr: 1, sdf: Infinity } });
  game.step();
  return game;
};
const play = (game, moves) => moves.flatMap(move => game.step(move === SOFT ? { held: SOFT } : { pressed: move }));

test("스핀 연습 10개: 안내한 회전과 배치로 모두 실제 스핀을 판정하고 목표 줄을 지운다", () => {
  const routes = [
    [RIGHT, CCW, SOFT, CCW],
    [CW, SOFT, CW],
    [RIGHT, CCW, SOFT, CCW],
    [CCW, SOFT, CW],
    [RIGHT, CW, SOFT, CCW],
    [CCW, SOFT, CW],
    [LEFT, SOFT, CCW],
    [RIGHT, RIGHT, SOFT, CW],
    [LEFT, SOFT, CW],
    [RIGHT, SOFT, CCW],
  ];
  assert.equal(SPIN_LESSONS.length, routes.length);
  for (const [i, mode] of SPIN_LESSONS.entries()) {
    const [piece] = mode.sequence;
    const game = setup(mode);
    assert.equal(game.state.spinLesson.usedHint, false);
    const hint = mode.hint(game.state);
    const direction = routes[i].at(-1) === CW ? "시계 회전" : "반시계 회전";
    assert.ok(hint.endsWith(`${direction}, 그대로 두기`), mode.name);
    const target = game.state.spinLesson.hintCells;
    assert.equal(target.length, 4, mode.name);
    assert.equal(mode.hint(game.state), "");
    assert.deepEqual(game.state.spinLesson.hintCells, []);
    assert.equal(game.state.spinLesson.usedHint, true, "힌트를 숨겨도 이번 시도의 힌트 사용은 남는다");
    const events = play(game, [...routes[i], HARD]);
    const lock = events.find(event => event.type === "lock");
    assert.ok(sameCells(lock.cells, target), mode.name);
    if (piece === "T") assert.equal(lock.tspin, "full", mode.name);
    else assert.equal(lock.spinPiece, piece, mode.name);
    assert.equal(lock.lines, piece === "T" ? 2 : 1, mode.name);
    assert.equal(game.state.over, "clear", mode.name);
  }
});

test("스핀 연습: 실제 마지막 동작·열린 방향·O 제자리 회전에 맞는 실패 이유를 보여 준다", () => {
  const attempts = [
    [0, [HARD], "피스를 놓기 직전에 회전하세요."],
    [0, [CW, LEFT, HARD], "회전 뒤에 피스가 더 내려갔어요."],
    [0, [LEFT, SOFT, CW, RIGHT, HARD], "회전 뒤에 옆으로 움직였어요."],
    [4, [LEFT, SOFT, CW, HARD], "왼쪽이 열려 있어요."],
    [8, [LEFT, SOFT, CCW, HARD], "O가 제자리에서 돌았어요. 대각선 아래의 틈에 넣으세요."],
  ];
  for (const [i, moves, reason] of attempts) {
    const mode = SPIN_LESSONS[i];
    const game = setup(mode);
    play(game, moves);
    assert.equal(game.state.over, "fail", mode.name);
    assert.equal(mode.summary(game.state).note, reason);
  }
});
