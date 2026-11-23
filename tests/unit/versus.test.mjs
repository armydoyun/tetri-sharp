import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN, createGame } from "../../js/core/engine.js";
import { MODERN } from "../../js/rules/presets.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";
import { HEIGHT, WIDTH, createBoard, set } from "../../js/core/board.js";
import { createBot, evaluate, placements } from "../../js/ai/bot.js";
import {
  LEVELS,
  WIN,
  attackFor,
  exchangeGarbage,
  findVersus,
  settleBattleFrame,
  versusMode,
} from "../../js/modes/versus.js";
import { BATTLE_LESSONS } from "../../js/modes/battle-lessons.js";
import { findMode } from "../../js/modes/index.js";
import { parseBackup } from "../../js/storage/backup.js";
import { createPlayer, createRecorder, sanitizeReplay } from "../../js/replay/replay.js";
import { analyzeReplay } from "../../js/replay/analyze.js";

const lock = o => ({ type: "lock", lines: 0, tspin: "none", perfect: false, b2b: false, combo: -1, ...o });
const levelById = id => LEVELS.find(level => level.id === id);

test("대전 입문 세 문제는 기존 공격 규칙으로 전송·상쇄를 연습한다", () => {
  for (const [index, [hole, blocked, sent]] of [
    [4, 0, 4],
    [1, 4, 0],
    [8, 2, 2],
  ].entries()) {
    const mode = BATTLE_LESSONS[index];
    const create = () => createGame({ mode, rules: mode.rules, seed: mode.fixedSeed });
    const game = create();
    assert.equal(game.state.garbage.pending, blocked);
    game.step();
    game.step({ pressed: BTN.CW });
    const start = game.activeCells()[0][0];
    for (let i = 0; i < Math.abs(hole - start); i++) {
      game.step({ pressed: hole < start ? BTN.LEFT : BTN.RIGHT });
    }
    const events = game.step({ pressed: BTN.HARD });
    assert.equal(game.state.over, "clear");
    assert.equal(events.find(event => event.type === "lock").perfect, false);
    const attack = events.find(event => event.type === "attack");
    assert.equal(attack.base, 4);
    assert.equal(attack.blocked, blocked);
    assert.equal(attack.lines, sent);
    assert.equal(game.state.garbage.pending, 0);

    const miss = create();
    miss.step({ pressed: BTN.HARD });
    assert.equal(miss.state.over, "fail");
    assert.equal(miss.state.garbage.received, blocked);
    assert.equal(miss.state.garbage.sent, 0);
    const retry = create();
    assert.equal(retry.state.garbage.pending, blocked);
    assert.deepEqual(retry.state.board.cells, create().state.board.cells);
  }
});

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

test("대전 모드는 id로 찾고 기록표 순위를 만들지 않는다", () => {
  for (const level of LEVELS) {
    const mode = versusMode(level);
    assert.equal(findVersus(mode.id), mode);
    assert.equal(findMode(mode.id), mode);
    assert.equal(mode.isRecordable({}), false);
  }
});

test("대전 리플레이는 공격 프레임, 양쪽 보드와 쓰레기, 승패를 재현한다", () => {
  const snapshot = ({ state, handling }) => {
    const { board, active, queue, hold, garbage, frame, over } = state;
    const { pending, sent, received, blocked, hole } = garbage;
    return {
      cells: board.cells.slice(),
      active: structuredClone(active),
      queue: [...queue],
      hold,
      pending,
      sent,
      received,
      blocked,
      hole,
      frame,
      over,
      handling,
    };
  };
  for (const [ownLevel, cpuLevel] of [
    ["master", "easy"],
    ["easy", "master"],
  ]) {
    const mode = versusMode(levelById(cpuLevel));
    const options = { rules: MODERN, seed: 5, mode };
    const own = createGame(options);
    const cpu = createGame(options);
    const recorders = [own, cpu].map(game => createRecorder({ ...options, handling: game.handling }));
    const bots = [own, cpu].map((game, i) =>
      createBot({ game, rotation: ROTATIONS.srs, level: levelById(i ? cpuLevel : ownLevel), seed: i + 1 })
    );
    const frames = new Map();
    for (let i = 0; i < 60 * 300 && !own.state.over; i++) {
      if (i === 90) {
        const handling = { ...own.handling, sdf: Infinity };
        own.setHandling(handling);
        recorders[0].handlingChanged(handling);
      }
      const events = [own, cpu].map((game, side) => {
        const input = bots[side].input();
        recorders[side].input(input.held, input.pressed);
        return game.step(input);
      });
      settleBattleFrame(own, cpu, events[0]);
      if (
        i % 60 === 0 ||
        own.state.over ||
        events.flat().some(e => e.type === "garbage" || (e.type === "attack" && (e.lines || e.blocked)))
      ) {
        frames.set(own.state.frame, [snapshot(own), snapshot(cpu)]);
      }
    }
    assert.ok(own.state.over);
    assert.equal(own.state.over === WIN, ownLevel === "master");
    assert.ok(own.state.garbage.received + cpu.state.garbage.received > 0);
    const replay = { ...recorders[0].finish(own.state), cpu: recorders[1].finish(cpu.state) };
    const { markers } = analyzeReplay(replay, findMode);
    assert.ok(markers.some(mark => mark.kind === "sent" && mark.label.includes("보냄")));
    assert.ok(markers.some(mark => mark.kind === "received" && mark.label.includes("올라옴")));
    if (ownLevel === "easy") assert.ok(markers.some(mark => mark.kind === "blocked" && mark.label.includes("상쇄")));
    assert.equal(sanitizeReplay(replay, findMode), null);
    // 새 플레이어를 만들어 임의 프레임까지 진행하는 것은 브라우저 되감기와 같다.
    for (const target of [replay.result.frames, markers[0].frame]) {
      const viewer = createPlayer(replay, findMode);
      while (viewer.frame < target && !viewer.done) {
        viewer.step();
        if (frames.has(viewer.frame))
          assert.deepEqual([snapshot(viewer.game), snapshot(viewer.cpu)], frames.get(viewer.frame));
      }
      assert.equal(viewer.frame, target);
    }
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

test("공격 설명은 실제 보너스, 상쇄한 줄, 보낸 줄을 함께 전달한다", () => {
  const mode = versusMode(LEVELS[0]);
  const game = createGame({ rules: MODERN, seed: 1, mode });
  game.state.garbage.pending = 2;
  const explain = clear => {
    const events = [];
    mode.onLock(game.state, lock(clear), events);
    return events[0];
  };
  assert.deepEqual(explain({ lines: 1 }), {
    type: "attack",
    cleared: 1,
    tspin: "none",
    base: 0,
    backToBack: 0,
    combo: 0,
    perfect: 0,
    blocked: 0,
    lines: 0,
  });
  assert.deepEqual(explain({ lines: 1, tspin: "mini", b2b: true, combo: 2 }), {
    type: "attack",
    cleared: 1,
    tspin: "mini",
    base: 0,
    backToBack: 1,
    combo: 1,
    perfect: 0,
    blocked: 2,
    lines: 0,
  });
  assert.deepEqual(explain({ lines: 2, tspin: "full", b2b: true, perfect: true }), {
    type: "attack",
    cleared: 2,
    tspin: "full",
    base: 4,
    backToBack: 1,
    combo: 0,
    perfect: 10,
    blocked: 0,
    lines: 15,
  });
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
  const a = solo(levelById("hard"), 1800, 11);
  const b = solo(levelById("hard"), 1800, 11);
  assert.deepEqual(Array.from(a.board.cells), Array.from(b.board.cells));
});

test("최강 봇은 쉬움 봇을 이긴다", () => {
  const easy = LEVELS[0];
  const master = levelById("master");
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

test("어려움 이상은 두 수 앞을 본다: 한 수만 보는 같은 난이도 봇을 이긴다", () => {
  assert.equal(levelById("hard").lookahead, true);
  assert.ok(!levelById("normal-plus").lookahead, "보통+까지는 그대로 한 수만 본다");
  // 앞보기의 이득만 보려고 실수 확률이 0인 최강끼리 비교한다(어려움은 차선을 14% 골라 판마다 들쭉날쭉하다)
  const hard = levelById("master");
  const oneStep = { ...hard, lookahead: false };
  let wins = 0;
  for (const seed of [7, 8, 9, 10]) {
    const a = createGame({ rules: MODERN, seed, mode: versusMode(hard) });
    const b = createGame({ rules: MODERN, seed, mode: versusMode(hard) });
    const ba = createBot({ game: a, rotation: ROTATIONS.srs, level: hard, seed: 1 });
    const bb = createBot({ game: b, rotation: ROTATIONS.srs, level: oneStep, seed: 2 });
    for (let f = 0; f < 60 * 400 && !a.state.over && !b.state.over; f++) {
      a.step(ba.input());
      b.step(bb.input());
      exchangeGarbage(a, b);
    }
    if (b.state.over && !a.state.over) wins += 1;
  }
  assert.ok(wins >= 3, `네 판 중 ${wins}판 승리`);
});

test("백업: 대전 전적도 옮기고 이상한 값은 버린다", () => {
  const parsed = parseBackup(
    {
      app: "tetri-sharp",
      kind: "backup",
      v: 1,
      data: { "versus:stats": { hard: { win: 3, loss: -2 }, "hard-plus": { win: 1, loss: 2 }, "x y": {} } },
    },
    findMode
  );
  assert.deepEqual(parsed.data["versus:stats"], { hard: { win: 3, loss: 0 }, "hard-plus": { win: 1, loss: 2 } });
});

test("봇 밀어 넣기: 위가 막힌 처마 아래 빈칸은 바닥에서 옆으로 밀어 채운다", () => {
  // 아래 두 줄은 0~2열만 비었고, 0열 바로 위(처마)가 막혀 있다.
  // O를 곧장 떨어뜨려 0~1열에 넣을 수는 없고, 1~2열로 떨어뜨린 뒤 왼쪽으로 한 칸 밀어야 한다.
  const board = createBoard();
  for (let x = 3; x < WIDTH; x++) {
    set(board, x, HEIGHT - 1, 8);
    set(board, x, HEIGHT - 2, 8);
  }
  set(board, 0, HEIGHT - 3, 8);
  const straight = placements(board, ROTATIONS.srs, "O", 4, HEIGHT - 22);
  const tucked = placements(board, ROTATIONS.srs, "O", 4, HEIGHT - 22, { tucks: true });
  const slide = tucked.find(p => p.x === 1 && p.slide === -1);
  assert.ok(slide, "1~2열로 떨어뜨린 뒤 왼쪽으로 미는 후보");
  assert.ok(!straight.some(p => p.slide), "기본 후보에는 밀기가 없다");
  assert.ok(slide.score > straight.find(p => p.x === 1).score, "처마 아래를 채우는 쪽이 낫다");
});

test("봇 T-spin: T-spin Double 자리에서 T를 돌려 넣고, 엔진도 T-spin Double로 판정한다", async () => {
  const { buildTsd } = await import("../../js/modes/practice.js");
  const { VISIBLE_TOP } = await import("../../js/core/engine.js");
  for (const roofLeft of [true, false]) {
    const mode = versusMode(levelById("master"));
    const game = createGame({ rules: MODERN, seed: 4, mode });
    game.step();
    buildTsd(game.state.board, 3, roofLeft);
    game.state.active = { type: "T", rot: 0, x: 3, y: VISIBLE_TOP, lastAction: null, kick: 0 };
    game.state.holdUsed = true;
    const best = placements(game.state.board, ROTATIONS.srs, "T", 3, VISIBLE_TOP, { tucks: true, spins: true })[0];
    assert.equal(best.tspin, "full", `가장 좋은 자리는 T-spin (지붕 ${roofLeft ? "왼쪽" : "오른쪽"})`);
    const bot = createBot({ game, rotation: ROTATIONS.srs, level: levelById("master"), seed: 1 });
    const id = game.state.pieceId;
    let lock = null;
    for (let f = 0; f < 600 && game.state.pieceId === id && !game.state.over; f++) {
      lock = game.step(bot.input()).find(e => e.type === "lock") ?? lock;
    }
    assert.ok(lock, "피스를 놓는다");
    assert.equal(lock.tspin, "full");
    assert.equal(lock.lines, 2);
  }
});

test("봇 밀어 넣기를 엔진에서 실제로 해낸다: 내리고, 밀고, 떨어뜨린다", async () => {
  const { VISIBLE_TOP } = await import("../../js/core/engine.js");
  const { get } = await import("../../js/core/board.js");
  const level = levelById("normal");
  const game = createGame({ rules: MODERN, seed: 4, mode: versusMode(level) });
  game.step();
  const b = game.state.board;
  for (let x = 3; x < WIDTH; x++) {
    set(b, x, HEIGHT - 1, 8);
    set(b, x, HEIGHT - 2, 8);
  }
  set(b, 0, HEIGHT - 3, 8);
  game.state.active = { type: "O", rot: 0, x: 4, y: VISIBLE_TOP, lastAction: null, kick: 0 };
  game.state.holdUsed = true;
  const bot = createBot({ game, rotation: ROTATIONS.srs, level: { ...level, mistake: 0 }, seed: 1 });
  const id = game.state.pieceId;
  for (let f = 0; f < 600 && game.state.pieceId === id && !game.state.over; f++) game.step(bot.input());
  // O가 0~1열 아래 두 줄에 들어가면 그 두 줄은 2열만 남는다(지워지지 않음)
  assert.notEqual(get(b, 0, HEIGHT - 1), 0, "처마 아래 맨 아래 칸이 찼다");
  assert.notEqual(get(b, 0, HEIGHT - 2), 0);
});

test("CPU 성향: 균형은 이전과 같은 id·전적 열쇠, 다른 성향은 id로 다시 찾는다", async () => {
  const { STYLES, versusStatKey, versusMode } = await import("../../js/modes/versus.js");
  const hard = levelById("hard");
  assert.equal(versusMode(hard).id, "versus-hard", "균형은 이전 id 그대로(저장된 이어서 하기와 맞는다)");
  assert.equal(versusStatKey("hard"), "hard");
  assert.equal(versusStatKey("normal-plus", "quad"), "normal-plus-quad");
  for (const level of LEVELS)
    for (const style of STYLES) {
      const mode = versusMode(level, style.id);
      assert.equal(findMode(mode.id), mode, mode.id);
      assert.equal(mode.versus.style, style.id);
      assert.equal(mode.versus.id, level.id, "업적·전적이 보는 난이도 id");
    }
});

test("CPU 성향마다 같은 판을 다르게 본다: 4줄 노림은 낮은 판의 한 줄 삭제를 아끼고, 안정은 반긴다", () => {
  const board = createBoard();
  assert.ok(evaluate(board, 1, "safe") > evaluate(board, 0, "safe"), "안정: 지우는 쪽");
  assert.ok(evaluate(board, 1, "quad") < evaluate(board, 0, "quad"), "4줄 노림: 아끼는 쪽");
  // 4줄 노림은 한 칸만 빈 줄을 쌓아 두는 판을 더 좋게 본다
  const ready = createBoard();
  for (let x = 0; x < WIDTH - 1; x++) set(ready, x, HEIGHT - 1, 8);
  const flat = createBoard();
  for (let x = 0; x < 5; x++) set(flat, x, HEIGHT - 1, 8);
  for (let x = 0; x < 4; x++) set(flat, x, HEIGHT - 2, 8);
  const gap = style => evaluate(ready, 0, style) - evaluate(flat, 0, style);
  assert.ok(gap("quad") > gap("balanced"));
});
