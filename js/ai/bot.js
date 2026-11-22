// CPU 플레이어. 엔진을 직접 건드리지 않고 사람처럼 매 프레임 버튼 입력만 만든다.
//  1) 새 피스가 나오면 놓을 수 있는 자리(회전 × 가로 위치, 그대로 떨어뜨리기)를 모두 판 위에 놓아 보고 점수를 매긴다.
//     홀드를 쓸 수 있으면 홀드한 피스(또는 다음 피스)로도 똑같이 해 본다.
//  2) 고른 자리로 가려고 매 프레임 실제 피스 상태를 보며 회전 → 좌우 이동 → 하드 드롭을 한 번에 하나씩 누른다.
//  3) 난이도의 PPS에 맞춰 피스마다 생각하는 시간을 둔다. 쉬운 난이도는 가끔 차선을 고른다.
// 결정론: 난수는 시드 PRNG만 쓴다.
import { BTN } from "../core/engine.js";
import { HEIGHT, WIDTH, clearLines, collides, get, inBounds, place } from "../core/board.js";
import { detectTSpin } from "../core/tspin.js";
import { createRng } from "../core/rng.js";

/** 판 점수(높을수록 좋다). 높이·구멍·울퉁불퉁함은 감점, 줄 삭제는 판이 낮을 때 4줄을 더 쳐준다. */
export const evaluate = (board, lines) => {
  const heights = new Array(WIDTH).fill(0);
  let holes = 0;
  let coveredDepth = 0;
  for (let x = 0; x < WIDTH; x++) {
    let seen = false;
    let above = 0;
    for (let y = 0; y < HEIGHT; y++) {
      const filled = board.cells[y * WIDTH + x] !== 0;
      if (filled) {
        if (!seen) heights[x] = HEIGHT - y;
        seen = true;
        above += 1;
      } else if (seen) {
        holes += 1;
        coveredDepth += above;
      }
    }
  }
  // 가장 낮은 열 하나는 우물로 남겨 4줄을 노린다 → 그 열은 울퉁불퉁함 계산에서 뺀다.
  let well = 0;
  for (let x = 1; x < WIDTH; x++) if (heights[x] < heights[well]) well = x;
  let bump = 0;
  for (let x = 0; x < WIDTH - 1; x++) {
    if (x === well || x + 1 === well) continue;
    bump += Math.abs(heights[x] - heights[x + 1]);
  }
  const total = heights.reduce((a, b) => a + b, 0);
  const max = Math.max(...heights);
  const danger = Math.max(0, max - 9);
  // 판이 낮으면 1·2줄 삭제는 아끼고 4줄을 노린다. 높아지면 무엇이든 지운다.
  // (받을 쓰레기가 있을 때 작은 삭제를 서두르게 해 봤지만 같은 난이도끼리 40판에서 이득이 없거나 손해였다.)
  const lineScore = max < 8 ? [0, -2.5, -1.5, 1, 14][lines] : [0, 2, 4, 6, 14][lines];
  return -0.45 * total - 0.32 * bump - 4 * holes - 0.3 * coveredDepth - 1.5 * danger * danger + lineScore;
};

/** 서로 다른 모양의 회전 상태들 */
const distinctRotations = (rotation, type) => {
  const seen = new Set();
  const out = [];
  for (let rot = 0; rot < 4; rot++) {
    const cells = rotation.cells(type, rot);
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    const key = cells
      .map(([x, y]) => `${x - minX},${y - minY}`)
      .sort()
      .join(" ");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(rot);
    }
  }
  return out;
};

/** T-spin 가산점: [지운 줄 수]. 대전에서 공격이 4줄보다 세니 그만큼 쳐준다. */
const SPIN_BONUS = Object.freeze([0, 9, 16, 22]);

/**
 * 이 피스로 갈 수 있는 자리마다 점수. 생성 높이에서 좌우로 막힘없이 간 뒤 떨어뜨리는 자리가 기본이다.
 * options.tucks: 바닥까지 내린 뒤 옆으로 밀어 넣는 자리(처마 아래)도 본다 → slide(칸 수, 부호가 방향)
 * options.spins: T를 바닥에서 한 번 더 돌려 줄을 지우는 T-spin 자리도 본다 → spin(+1 시계, -1 반시계), 가산점
 * @returns {{ rot: number, x: number, score: number, slide?: number, spin?: number, tspin?: string }[]}
 */
export const placements = (board, rotation, type, startX, startY, options = {}) => {
  const { tucks = false, spins = false } = options;
  const out = [];
  /** 보드에 놓아 보고 점수를 매긴다 */
  const score = (cells, x, y) => {
    const b = { ...board, cells: board.cells.slice() };
    place(b, cells, x, y, 9);
    const lines = clearLines(b).length;
    return { score: evaluate(b, lines), lines };
  };
  /** 바닥에서 한 번 돌린다(엔진과 같은 킥 순서). 들어가면 돌린 뒤의 자리 */
  const turn = (x, y, rot, dir) => {
    const to = (rot + dir + 4) % 4;
    const blocked = (cx, cy) => !inBounds(board, x + cx, y + cy) || get(board, x + cx, y + cy) !== 0;
    const kicks = rotation.kicks(type, rot, to, blocked);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (!collides(board, rotation.cells(type, to), x + dx, y + dy)) return { x: x + dx, y: y + dy, rot: to, kick: i };
    }
    return null;
  };
  /** 바닥에 닿은 자리(x, y, rot)에서 T를 돌려 넣는 후보 */
  const addSpins = (base, x, y, rot) => {
    for (const dir of [1, -1]) {
      const r = turn(x, y, rot, dir);
      if (!r) continue;
      const cells = rotation.cells(type, r.rot);
      // 돌린 뒤 더 떨어지면 마지막 동작이 회전이 아니게 되어 T-spin이 아니다 → 그런 자리는 기본 후보로 충분
      if (!collides(board, cells, r.x, r.y + 1)) continue;
      // 줄을 지우는 진짜 T-spin만 후보로 둔다. 그냥 돌려 넣기·Mini까지 두면 처마를 남기는 자리를 고를 수 있다.
      // 봇은 T-spin 자리를 일부러 만들지는 않으므로, 자리가 생겼을 때만 쓴다.
      const tspin = detectTSpin(board, { type, x: r.x, y: r.y, rot: r.rot, lastAction: "rotate", kick: r.kick });
      if (tspin !== "full") continue;
      const placed = score(cells, r.x, r.y);
      if (placed.lines === 0) continue;
      out.push({ ...base, spin: dir, tspin, score: placed.score + (SPIN_BONUS[Math.min(placed.lines, 3)] ?? 0) });
    }
  };
  for (const rot of distinctRotations(rotation, type)) {
    const cells = rotation.cells(type, rot);
    const fits = (x, y) => !collides(board, cells, x, y);
    if (!fits(startX, startY)) continue;
    /** 곧장 떨어뜨렸을 때 닿는 높이(열마다) */
    const restOf = new Map();
    for (const dir of [-1, 1]) {
      for (let x = dir < 0 ? startX : startX + 1; fits(x, startY); x += dir) {
        let y = startY;
        while (fits(x, y + 1)) y += 1;
        restOf.set(x, y);
      }
    }
    for (const [x, y] of restOf) {
      out.push({ rot, x, score: score(cells, x, y).score });
      if (spins && type === "T") addSpins({ rot, x }, x, y, rot);
      if (!tucks) continue;
      // 바닥에서 옆으로 밀기: 곧장 떨어뜨려서는 닿지 않는 자리(위가 막힌 처마 아래)만 새 후보다
      for (const dir of [-1, 1]) {
        let tx = x;
        let ty = y;
        for (let step = 1; step <= 3 && fits(tx + dir, ty); step++) {
          tx += dir;
          while (fits(tx, ty + 1)) ty += 1;
          if (restOf.get(tx) === ty) continue;
          const base = { rot, x, slide: tx - x };
          out.push({ ...base, score: score(cells, tx, ty).score });
          if (spins && type === "T") addSpins(base, tx, ty, rot);
        }
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
};

/**
 * @param {{ game: ReturnType<typeof import("../core/engine.js").createGame>, rotation: any,
 *   level: { pps: number, mistake: number, hold: boolean, holdMinGain?: number, tucks?: boolean, spins?: boolean },
 *   seed?: number }} options
 */
export const createBot = ({ game, rotation, level, seed = 1 }) => {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const rules = game.rules;
  const framesPerPiece = Math.max(1, Math.round(60 / level.pps));
  const holdMinGain = level.holdMinGain ?? 0.5;
  /**
   * 고른 자리와 남은 단계. 맞추기(회전·좌우) → 내리기(바닥까지) → 밀기 → 돌리기 → 떨어뜨리기.
   * 밀기·돌리기가 없으면 맞춘 뒤 곧장 떨어뜨린다.
   * @type {null | { hold: boolean, rot: number, x: number, slide: number, spin: number, phase: "align" | "finish" }}
   */
  let plan = null;
  let pieceId = -1;
  let wait = 0;
  let stuck = 0;
  let last = "";

  /** 후보 중 하나를 고른다(실수 확률만큼 차선) */
  const pick = list => {
    if (!list.length) return null;
    if (level.mistake > 0 && rng.int(100) < level.mistake && list.length > 1) {
      return list[1 + rng.int(Math.min(3, list.length - 1))];
    }
    return list[0];
  };

  const think = () => {
    const s = game.state;
    const a = s.active;
    const options = { tucks: Boolean(level.tucks), spins: Boolean(level.spins) };
    const here = placements(s.board, rotation, a.type, a.x, a.y, options);
    let best = { hold: false, ...(pick(here) ?? { rot: a.rot, x: a.x, score: -Infinity }) };
    const canHold = level.hold && rules.hold.enabled && !s.holdUsed;
    const other = s.hold ?? s.queue[0];
    if (canHold && other && other !== a.type) {
      // 홀드한 피스는 같은 자리(생성 위치)에서 나온다.
      const size = other === "I" ? 4 : other === "O" ? 2 : 3;
      const ox = Math.floor((WIDTH - size) / 2);
      const alt = placements(s.board, rotation, other, ox, a.y, options)[0];
      if (alt && alt.score > best.score + holdMinGain) best = { hold: true, ...alt };
    }
    plan = { hold: best.hold, rot: best.rot, x: best.x, slide: best.slide ?? 0, spin: best.spin ?? 0, phase: "align" };
    // 생각하는 시간: 한 피스에 쓸 프레임에서 움직이는 데 드는 프레임을 뺀 만큼(내리기는 몇 프레임으로 친다)
    const turns = (best.rot - a.rot + 4) % 4 === 2 ? 2 : best.rot !== a.rot ? 1 : 0;
    const extra = plan.slide || plan.spin ? 4 + Math.abs(plan.slide) + (plan.spin ? 1 : 0) : 0;
    const moves = Math.abs(best.x - a.x) + turns + extra + 1;
    wait = Math.max(0, framesPerPiece - moves);
    stuck = 0;
  };

  return {
    /** 이번 프레임에 누를 버튼 */
    input() {
      const s = game.state;
      const a = s.active;
      if (!a || s.over) return { held: 0, pressed: 0 };
      if (s.pieceId !== pieceId) {
        pieceId = s.pieceId;
        think();
      }
      if (wait > 0) {
        wait -= 1;
        return { held: 0, pressed: 0 };
      }
      const p = /** @type {NonNullable<typeof plan>} */ (plan);
      // 같은 상태가 계속되면(벽·블록에 막힘) 그 자리에 떨어뜨린다.
      const now = `${a.x},${a.y},${a.rot}`;
      stuck = now === last ? stuck + 1 : 0;
      last = now;
      const drop = rules.hardDrop ? { held: 0, pressed: BTN.HARD } : { held: BTN.SOFT, pressed: 0 };
      if (stuck > 6) return drop;
      if (p.hold && !s.holdUsed) {
        p.hold = false;
        return { held: 0, pressed: BTN.HOLD };
      }
      if (p.phase === "align") {
        const turn = (p.rot - a.rot + 4) % 4;
        if (turn === 1 || turn === 2) return { held: 0, pressed: BTN.CW };
        if (turn === 3) return { held: 0, pressed: BTN.CCW };
        if (p.x < a.x) return { held: 0, pressed: BTN.LEFT };
        if (p.x > a.x) return { held: 0, pressed: BTN.RIGHT };
        if (!p.slide && !p.spin) return drop;
        p.phase = "finish";
      }
      // 바닥에 닿을 때까지 내린다(밀기 중에 떨어진 뒤에도 다시 내린다)
      const grounded = collides(s.board, rotation.cells(a.type, a.rot), a.x, a.y + 1);
      if (!grounded) return { held: BTN.SOFT, pressed: 0 };
      const target = p.x + p.slide;
      if (a.x !== target) return { held: 0, pressed: a.x < target ? BTN.RIGHT : BTN.LEFT };
      if (p.spin) {
        const dir = p.spin;
        p.spin = 0;
        return { held: 0, pressed: dir > 0 ? BTN.CW : BTN.CCW };
      }
      return drop;
    },
  };
};
