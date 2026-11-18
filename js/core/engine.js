// 게임 엔진. 한 번의 step()이 한 프레임(1/60초)을 진행한다. DOM·실시간 시계·Math.random을 쓰지 않으므로
// 같은 (규칙, 조작 설정, 시드, 입력 기록)이면 언제 어디서 돌려도 결과가 같다 → 테스트·리플레이의 바탕.
import {
  HEIGHT,
  VISIBLE_ROWS,
  WIDTH,
  clearLines,
  collides,
  createBoard,
  get,
  inBounds,
  isEmpty,
  place,
} from "./board.js";
import { CELL_ID, PIECES } from "./pieces.js";
import { createRng } from "./rng.js";
import { detectTSpin } from "./tspin.js";
import { SCORINGS } from "../rules/scoring/index.js";
import { ROTATIONS } from "../rules/rotation/index.js";
import { RANDOMIZERS } from "../rules/randomizer/index.js";

/** 버튼 비트. 입력은 매 프레임 { held, pressed } 두 비트마스크로 들어온다. */
export const BTN = Object.freeze({
  LEFT: 1,
  RIGHT: 2,
  SOFT: 4,
  HARD: 8,
  CW: 16,
  CCW: 32,
  R180: 64,
  HOLD: 128,
});

/** 보이는 영역의 맨 윗줄 y */
export const VISIBLE_TOP = HEIGHT - VISIBLE_ROWS;

/**
 * 조작 설정(프레임 단위). 규칙과 달리 플레이어 개인 설정이다.
 * @typedef {Object} Handling
 * @property {number} das  자동 이동이 시작되기까지의 프레임
 * @property {number} arr  자동 이동 한 칸당 프레임(0 = 즉시 벽까지)
 * @property {number} sdf  소프트 드롭 배율(Infinity = 즉시 바닥까지)
 */

/** @type {Handling} */
export const DEFAULT_HANDLING = Object.freeze({ das: 8, arr: 0.6, sdf: 20 });

/** ms → 프레임 */
export const msToFrames = ms => (ms * 60) / 1000;

/**
 * @typedef {Object} Active
 * @property {import("./pieces.js").PieceType} type
 * @property {number} rot
 * @property {number} x
 * @property {number} y
 * @property {"move" | "rotate" | "drop" | null} lastAction  T-spin 판정용
 * @property {number} kick  마지막 회전에서 쓴 킥 번호
 */

/**
 * 모드: 목표·종료 조건·레벨 진행. check()가 결과를 돌려주면 그 프레임에 게임이 끝난다.
 * @typedef {Object} ModeHook
 * @property {(state: any, events: any[]) => null | { result: string }} [check]
 * @property {(state: any) => number} [levelFor]    줄 수 등에 따른 레벨 (없으면 1 고정)
 * @property {(state: any) => number} [gravityFor]  레벨 등에 따른 중력 (없으면 rules.gravity)
 * @property {number} [initialLevel]                  시작 레벨 (기본 1)
 * @property {(state: any, lines: number) => number} [levelAfterLock]  고정마다 레벨을 올리는 방식(levelFor 대신)
 * @property {number} [levelStep]                     레벨업 알림 간격 (기본 1, Master는 100)
 * @property {(state: any) => number} [scoreLevel]    점수에 곱할 레벨 (기본 state.level)
 */

/**
 * @param {{ rules: import("../rules/presets.js").RuleSet, handling?: Handling, seed?: number, mode?: ModeHook }} options
 */
export const createGame = ({ rules, handling = DEFAULT_HANDLING, seed = 1, mode }) => {
  const rotation = ROTATIONS[rules.rotation];
  if (!rotation) throw new Error(`알 수 없는 회전 시스템: ${rules.rotation}`);
  const makeRandomizer = RANDOMIZERS[rules.randomizer];
  if (!makeRandomizer) throw new Error(`알 수 없는 생성기: ${rules.randomizer}`);

  const scoring = SCORINGS[rules.scoring ?? "guideline"];
  if (!scoring) throw new Error(`알 수 없는 점수표: ${rules.scoring}`);
  // 규칙이 조작감을 고정하면(예: Retro) 개인 설정 대신 그 값을 쓴다.
  const withRules = h => (rules.fixedHandling ? { ...h, ...rules.fixedHandling } : h);
  handling = withRules(handling);

  const randomizer = makeRandomizer(createRng(seed));
  const board = createBoard();
  const queueSize = Math.max(1, rules.previewCount);

  const state = {
    board,
    /** @type {Active | null} */
    active: null,
    /** @type {import("./pieces.js").PieceType[]} */
    queue: Array.from({ length: queueSize }, () => randomizer.next()),
    /** @type {import("./pieces.js").PieceType | null} */
    hold: null,
    holdUsed: false,
    frame: 0,
    are: 0,
    gravityAcc: 0,
    lock: { timer: 0, resets: 0, lowestY: 0, touched: false },
    das: { dir: 0, charge: 0, arrAcc: 0 },
    prevHeld: 0,
    stats: { pieces: 0, lines: 0 },
    score: 0,
    level: 1,
    /** 이어지고 있는 어려운 클리어 수(0 = B2B 없음) */
    b2b: 0,
    /** 연속으로 줄을 지운 고정 수 - 1 (-1 = 콤보 없음) */
    combo: -1,
    /** @type {null | "blockOut" | "lockOut" | string} 끝난 이유(모드 목표 달성이면 모드가 정한 결과) */
    over: null,
  };

  state.level = mode?.initialLevel ?? 1;
  if (mode?.levelFor) state.level = mode.levelFor(state);

  /** 이번 프레임에 누르고 있는 버튼 — 생성 순간의 IRS/IHS 판정에 쓴다 */
  let currentHeld = 0;
  /** 이번 프레임에 IRS로 이미 쓴 회전 버튼(같은 프레임에 한 번 더 돌지 않게) */
  let consumed = 0;

  const currentGravity = () => {
    let g = mode?.gravityFor ? mode.gravityFor(state) : rules.gravity;
    return g >= 20 ? Infinity : g;
  };

  /** @type {any[]} 이번 프레임에 일어난 일 */
  let events = [];

  const cells = a => rotation.cells(a.type, a.rot);
  const fits = (a, dx, dy, rot = a.rot) => !collides(board, rotation.cells(a.type, rot), a.x + dx, a.y + dy);
  const grounded = a => !fits(a, 0, 1);

  const takeNext = () => {
    const type = /** @type {import("./pieces.js").PieceType} */ (state.queue.shift());
    state.queue.push(randomizer.next());
    return type;
  };

  const resetLock = y => {
    state.lock = { timer: 0, resets: 0, lowestY: y, touched: false };
  };

  /** @param {import("./pieces.js").PieceType} type */
  const spawn = type => {
    const size = PIECES[type].size;
    /** @type {Active} */
    const a = {
      type,
      rot: rotation.spawnRotation(type),
      x: Math.floor((WIDTH - size) / 2),
      y: VISIBLE_TOP - 2,
      lastAction: null,
      kick: 0,
    };
    // IRS: 생성 순간 회전 버튼을 누르고 있으면 돌린 채로 나온다(돌린 모양이 들어갈 때만).
    if (rules.irs) {
      const bit = [BTN.CW, BTN.CCW, BTN.R180].find(b => currentHeld & b);
      if (bit) {
        const to = (a.rot + (bit === BTN.CW ? 1 : bit === BTN.CCW ? 3 : 2)) % 4;
        if (fits(a, 0, 0, to)) {
          a.rot = to;
          consumed |= bit;
          events.push({ type: "irs", piece: type });
        }
      }
    }
    if (!fits(a, 0, 0)) {
      state.active = null;
      state.over = "blockOut";
      events.push({ type: "gameOver", reason: "blockOut" });
      return;
    }
    // 가이드라인: 생성 직후 한 칸 내려와 보이는 영역 맨 윗줄에 걸친다.
    if (fits(a, 0, 1)) a.y += 1;
    // 20G: 생성되자마자 바닥까지.
    if (currentGravity() === Infinity) while (fits(a, 0, 1)) a.y += 1;
    state.active = a;
    state.gravityAcc = 0;
    resetLock(a.y);
    events.push({ type: "spawn", piece: type });
  };

  /** 다음 피스를 꺼내 생성한다. IHS: 생성 순간 홀드를 누르고 있으면 바로 홀드한 피스와 바꾼다. */
  const spawnNext = () => {
    let type = takeNext();
    if (rules.ihs && rules.hold.enabled && currentHeld & BTN.HOLD && !state.holdUsed) {
      const held = state.hold;
      state.hold = type;
      state.holdUsed = true;
      events.push({ type: "hold", piece: type, initial: true });
      type = held ?? takeNext();
    }
    spawn(type);
  };

  const lockPiece = () => {
    const a = /** @type {Active} */ (state.active);
    const shape = cells(a);
    const tspin = rules.tspin === "threeCorner" ? detectTSpin(board, a) : "none";
    place(board, shape, a.x, a.y, CELL_ID[a.type]);
    state.active = null;
    state.holdUsed = false;
    state.stats.pieces += 1;

    const cleared = clearLines(board);
    const lines = cleared.length;
    const perfect = lines > 0 && isEmpty(board);
    const scoreLevel = mode?.scoreLevel ? mode.scoreLevel(state) : state.level;
    const scored = scoring.scoreLock({ lines, tspin, b2b: state.b2b, combo: state.combo, perfect, level: scoreLevel });
    state.score += scored.points;
    state.b2b = scored.b2b;
    state.combo = scored.combo;
    state.stats.lines += lines;
    events.push({
      type: "lock",
      piece: a.type,
      lines,
      rows: cleared,
      tspin,
      perfect,
      points: scored.points,
      b2b: scored.b2bApplied,
      combo: scored.combo,
      level: state.level,
    });

    const nextLevel = mode?.levelAfterLock
      ? mode.levelAfterLock(state, lines)
      : mode?.levelFor
        ? mode.levelFor(state)
        : state.level;
    const levelStep = mode?.levelStep ?? 1;
    if (Math.floor(nextLevel / levelStep) > Math.floor(state.level / levelStep))
      events.push({ type: "levelUp", level: nextLevel });
    state.level = nextLevel;

    // 줄이 지워지지 않았고 모든 칸이 보이는 영역 위에 있으면 Lock Out.
    if (!cleared.length && shape.every(([, cy]) => a.y + cy < VISIBLE_TOP)) {
      state.over = "lockOut";
      events.push({ type: "gameOver", reason: "lockOut" });
      return;
    }
    state.are = cleared.length ? rules.are.lineClear : rules.are.spawn;
    if (state.are <= 0) spawnNext();
  };

  /** 이동·회전이 성공했을 때 고정 타이머를 규칙에 따라 되돌린다. */
  const onShifted = () => {
    const l = state.lock;
    if (rules.lock.type === "infinite") l.timer = 0;
    else if (rules.lock.type === "moveReset" && l.touched && l.resets < rules.lock.maxResets) {
      l.timer = 0;
      l.resets += 1;
    }
  };

  /** 더 낮은 줄에 처음 닿으면 리셋 횟수와 타이머를 새로 시작한다. */
  const onDescended = a => {
    if (a.y > state.lock.lowestY) {
      state.lock.lowestY = a.y;
      if (rules.lock.type !== "none") {
        state.lock.timer = 0;
        state.lock.resets = 0;
      }
    }
  };

  const shift = (a, dx) => {
    if (!fits(a, dx, 0)) return false;
    a.x += dx;
    a.lastAction = "move";
    onShifted();
    return true;
  };

  const rotate = (a, delta) => {
    const to = (((a.rot + delta) % 4) + 4) % 4;
    // 회전 시스템이 "어느 칸이 막혔는지"를 보고 킥을 정할 수 있게(ARS 중앙열 규칙) 조회 함수를 넘긴다.
    const blocked = (cx, cy) => {
      const x = a.x + cx;
      const y = a.y + cy;
      return !inBounds(board, x, y) || get(board, x, y) !== 0;
    };
    const kicks = rotation.kicks(a.type, a.rot, to, blocked);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (fits(a, dx, dy, to)) {
        a.x += dx;
        a.y += dy;
        a.rot = to;
        a.lastAction = "rotate";
        a.kick = i;
        onShifted();
        onDescended(a);
        events.push({ type: "rotate", kick: i });
        return true;
      }
    }
    return false;
  };

  const dropOne = a => {
    if (!fits(a, 0, 1)) return false;
    a.y += 1;
    a.lastAction = "drop";
    onDescended(a);
    return true;
  };

  /** DAS/ARR: 이번 프레임에 몇 칸 움직일지 정한다. 피스가 없어도(ARE 중) 충전은 계속된다. */
  const updateDas = (held, pressed) => {
    const d = state.das;
    const isHeld = dir => (dir < 0 ? held & BTN.LEFT : held & BTN.RIGHT);
    let tap = 0;
    // 마지막에 누른 방향이 이긴다.
    if (pressed & BTN.LEFT) tap = -1;
    if (pressed & BTN.RIGHT) tap = 1;
    if (!tap && d.dir && !isHeld(d.dir)) {
      // 누르던 방향을 놓았는데 반대쪽이 아직 눌려 있으면 그쪽으로 다시 시작한다.
      tap = isHeld(-d.dir) ? -d.dir : 0;
      if (!tap) d.dir = 0;
    }
    if (tap) {
      d.dir = tap;
      d.charge = 0;
      d.arrAcc = 0;
      return { dir: tap, steps: 1 };
    }
    if (!d.dir) return { dir: 0, steps: 0 };

    const wasCharged = d.charge >= handling.das;
    d.charge += 1;
    if (d.charge < handling.das) return { dir: d.dir, steps: 0 };
    if (handling.arr <= 0) return { dir: d.dir, steps: Infinity };
    // DAS가 차는 순간 바로 한 칸, 이후 ARR마다 한 칸.
    d.arrAcc = wasCharged ? d.arrAcc + 1 : handling.arr;
    let steps = 0;
    while (d.arrAcc >= handling.arr) {
      steps += 1;
      d.arrAcc -= handling.arr;
    }
    return { dir: d.dir, steps };
  };

  const applyGravity = (a, held) => {
    let g = currentGravity();
    if (held & BTN.SOFT) g = handling.sdf === Infinity ? Infinity : Math.max(g * handling.sdf, g);
    if (g >= 20) g = Infinity;
    state.gravityAcc += g;
    while (state.gravityAcc >= 1) {
      if (!dropOne(a)) {
        state.gravityAcc = 0;
        // 고정 지연이 없는 규칙: 바닥에 닿은 채로 한 칸 더 떨어지려 하면 그 자리에서 고정.
        if (rules.lock.type === "none") lockPiece();
        return;
      }
      state.gravityAcc -= 1;
      if (held & BTN.SOFT) state.score += scoring.SOFT_DROP_POINTS;
    }
  };

  const updateLock = a => {
    if (!grounded(a)) return;
    const l = state.lock;
    l.touched = true;
    if (rules.lock.type === "none") return;
    if (rules.lock.type === "moveReset" && l.resets >= rules.lock.maxResets) return lockPiece();
    l.timer += 1;
    if (l.timer >= rules.lock.delay) lockPiece();
  };

  /**
   * 한 프레임 진행.
   * @param {{ held?: number, pressed?: number }} [input]
   *   held: 지금 누르고 있는 버튼, pressed: 지난 프레임 이후 새로 눌린 버튼(짧게 눌렀다 뗀 것 포함)
   * @returns {any[]} 이번 프레임의 이벤트
   */
  const step = input => {
    const out = advance(input);
    if (!state.over && mode?.check) {
      const done = mode.check(state, out);
      if (done) {
        state.over = done.result;
        state.active = null;
        out.push({ type: "finish", ...done });
      }
    }
    return out;
  };

  const advance = ({ held = 0, pressed = 0 } = {}) => {
    events = [];
    if (state.over) return events;
    currentHeld = held;
    consumed = 0;
    if (state.frame === 0 && !state.active) spawnNext();
    state.frame += 1;
    pressed |= held & ~state.prevHeld;
    state.prevHeld = held;
    pressed &= ~consumed;

    const move = updateDas(held, pressed);

    if (!state.active) {
      state.are -= 1;
      if (state.are <= 0) spawnNext();
      return events;
    }

    if (pressed & BTN.HOLD && rules.hold.enabled && !state.holdUsed) {
      const current = state.active.type;
      const next = state.hold ?? takeNext();
      state.hold = current;
      state.holdUsed = true;
      events.push({ type: "hold", piece: current });
      spawn(next);
      if (!state.active) return events;
    }

    let a = state.active;
    if (pressed & BTN.CW) rotate(a, 1);
    if (pressed & BTN.CCW) rotate(a, -1);
    if (pressed & BTN.R180) rotate(a, 2);

    for (let i = 0; i < move.steps && shift(a, move.dir); i++);

    if (pressed & BTN.HARD && rules.hardDrop) {
      let distance = 0;
      while (dropOne(a)) distance += 1;
      state.score += distance * scoring.HARD_DROP_POINTS;
      events.push({ type: "hardDrop", distance });
      lockPiece();
      return events;
    }

    applyGravity(a, held);
    if (state.active === a) updateLock(a);
    return events;
  };

  /** 현재 피스를 그대로 떨어뜨렸을 때의 y (고스트 표시용) */
  const ghostY = () => {
    const a = state.active;
    if (!a) return null;
    let dy = 0;
    while (fits(a, 0, dy + 1)) dy += 1;
    return a.y + dy;
  };

  return {
    step,
    state,
    rules,
    get handling() {
      return handling;
    },
    /** 조작 설정을 바꾼다(설정 화면에서 바로 반영). DAS 충전 상태는 그대로 둔다. */
    setHandling(next) {
      handling = withRules(next);
    },
    ghostY,
    /** 현재 피스의 칸 좌표(보드 기준) */
    activeCells: () =>
      state.active ? cells(state.active).map(([x, y]) => [state.active.x + x, state.active.y + y]) : [],
    /** 임의 피스·회전의 모양(미리보기 그리기용) */
    shapeOf: (type, rot = 0) => rotation.cells(type, rot),
  };
};
