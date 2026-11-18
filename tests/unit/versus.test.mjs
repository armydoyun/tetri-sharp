import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { HEIGHT, WIDTH, createBoard, set } from "../../js/core/board.js";
import { createBot, evaluate, placements } from "../../js/ai/bot.js";
import { LEVELS, WIN, attackFor, exchangeGarbage, findVersus, versusMode } from "../../js/modes/versus.js";
import { findMode } from "../../js/modes/index.js";
import { parseBackup } from "../../js/storage/backup.js";

const lock = o => ({ type: "lock", lines: 0, tspin: "none", perfect: false, b2b: false, combo: -1, ...o });

test("공격 줄 수: 줄 삭제 종류 + B2B + 콤보 + 퍼펙트 클리어", () => {
  assert.equal(attackFor(lock({ lines: 1, combo: 0 })), 0);
  assert.equal(attackFor(lock({ lines: 2, combo: 0 })), 1);
  assert.equal(attackFor(lock({ lines: 4, combo: 0 })), 4);
  assert.equal(attackFor(lock({ lines: 4, combo: 0, b2b: true })), 5);
  assert.equal(attackFor(lock({ lines: 2, tspin: "full", combo: 0 })), 4);
  assert.equal(attackFor(lock({ lines: 3, tspin: "full", combo: 0 })), 6);
  assert.equal(attackFor(lock({ lines: 1, combo: 4 })), 1);
  assert.equal(attackFor(lock({ lines: 2, combo: 0, perfect: true })), 11);
  assert.equal(attackFor(lock({ lines: 0 })), 0);
});

test("대전 모드는 id로 찾고, 기록·리플레이는 남기지 않는다", () => {
  for (const level of LEVELS) {
    const mode = versusMode(level);
    assert.equal(findVersus(mode.id), mode);
    assert.equal(findMode(mode.id), mode);
    assert.equal(mode.noReplay, true);
    assert.equal(mode.isRecordable({}), false);
  }
});

test("보낸 줄은 먼저 내 받을 쓰레기를 상쇄하고, 남는 만큼 상대에게 간다", () => {
  const mode = versusMode(LEVELS[0]);
  const a = createGame({ rules: MODERN, seed: 1, mode });
  const b = createGame({ rules: MODERN, seed: 1, mode });
  a.state.garbage.pending = 1;
  const events = [];
  mode.onLock(a.state, lock({ lines: 4, combo: 0 }), events);
  assert.equal(a.state.garbage.pending, 0, "1줄 상쇄");
  assert.equal(a.state.garbage.blocked, 1);
  assert.equal(a.state.garbage.sent, 3);
  assert.ok(events.some(e => e.type === "attack" && e.lines === 3));
  exchangeGarbage(a, b);
  assert.equal(b.state.garbage.pending, 3);
  assert.equal(a.state.garbage.outgoing, 0);
  // 줄을 못 지우고 고정하면 받을 쓰레기가 올라온다
  const got = [];
  mode.onLock(b.state, lock({}), got);
  assert.equal(b.state.garbage.received, 3);
  assert.ok(got.some(e => e.type === "garbage" && e.rows === 3));
});

test("finishAs: 바깥에서 판을 끝내면 finish 이벤트, 두 번째는 무시", () => {
  const game = createGame({ rules: MODERN, seed: 1, mode: versusMode(LEVELS[0]) });
  game.step();
  assert.deepEqual(game.finishAs(WIN), [{ type: "finish", result: WIN }]);
  assert.equal(game.state.over, WIN);
  assert.deepEqual(game.finishAs(WIN), []);
});

test("봇 평가: 구멍을 만드는 자리보다 평평한 자리를 고른다", () => {
  const board = createBoard();
  for (let x = 0; x < WIDTH - 2; x++) set(board, x, HEIGHT - 1, 8);
  const best = placements(board, ROTATIONS.srs, "O", 4, HEIGHT - 22)[0];
  assert.equal(best.x, WIDTH - 2, "O는 오른쪽 두 칸 빈자리로");
  const flat = createBoard();
  const holey = createBoard();
  set(holey, 0, HEIGHT - 2, 8);
  assert.ok(evaluate(flat, 0) > evaluate(holey, 0));
});

const solo = (level, frames, seed = 3) => {
  const mode = versusMode(level);
  const game = createGame({ rules: MODERN, seed, mode });
  const bot = createBot({ game, rotation: ROTATIONS.srs, level, seed });
  for (let f = 0; f < frames && !game.state.over; f++) game.step(bot.input());
  return game.state;
};

test("봇은 PPS에 맞춰 피스를 놓고, 혼자 두면 오래 버틴다", () => {
  for (const level of LEVELS.slice(1)) {
    const state = solo(level, 60 * 60);
    assert.equal(state.over, null, `${level.id}: 1분 동안 막히지 않는다`);
    const pps = state.stats.pieces / 60;
    assert.ok(Math.abs(pps - level.pps) < level.pps * 0.35, `${level.id}: PPS ${pps.toFixed(2)} ≈ ${level.pps}`);
    assert.ok(state.stats.lines > 0);
  }
});

test("같은 시드면 봇도 똑같이 둔다(결정론)", () => {
  const a = solo(LEVELS[2], 1800, 11);
  const b = solo(LEVELS[2], 1800, 11);
  assert.deepEqual(Array.from(a.board.cells), Array.from(b.board.cells));
});

test("최강 봇은 쉬움 봇을 이긴다", () => {
  const easy = LEVELS[0];
  const master = LEVELS[3];
  const a = createGame({ rules: MODERN, seed: 5, mode: versusMode(easy) });
  const b = createGame({ rules: MODERN, seed: 5, mode: versusMode(master) });
  const ba = createBot({ game: a, rotation: ROTATIONS.srs, level: easy, seed: 1 });
  const bb = createBot({ game: b, rotation: ROTATIONS.srs, level: master, seed: 2 });
  for (let f = 0; f < 60 * 300 && !a.state.over && !b.state.over; f++) {
    a.step(ba.input());
    b.step(bb.input());
    exchangeGarbage(a, b);
  }
  assert.ok(a.state.over, "쉬움이 먼저 막힌다");
  assert.equal(b.state.over, null);
});

test("백업: 대전 전적도 옮기고 이상한 값은 버린다", () => {
  const parsed = parseBackup(
    { app: "tetri-sharp", kind: "backup", v: 1, data: { "versus:stats": { hard: { win: 3, loss: -2 }, "x y": {} } } },
    findMode
  );
  assert.deepEqual(parsed.data["versus:stats"], { hard: { win: 3, loss: 0 } });
});
