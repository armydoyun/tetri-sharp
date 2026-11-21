// 피네스(최소 입력): 빈 판에서 피스를 그 자리·방향으로 옮기는 데 필요한 가장 적은 키 입력 수와
// 실제로 누른 수를 비교한다. 하드 드롭으로 바로 놓은 피스만 판정한다(소프트 드롭·밀어 넣기는 빼고).
import { WIDTH } from "../core/board.js";
import { PIECES } from "../core/pieces.js";
import { BTN } from "../core/engine.js";

const AIR_Y = 4; // 빈 공중(바닥·블록과 상관없는 높이)
const ROTATE_ACTIONS = /** @type {const} */ ([
  [1, "CW"],
  [3, "CCW"],
  [2, "R180"],
]);
const MOVE_BITS = BTN.LEFT | BTN.RIGHT | BTN.CW | BTN.CCW | BTN.R180;

/** 칸 좌표 → 높이를 뺀 모양+가로 위치 키 */
export const finessePlacement = cells => {
  const minY = Math.min(...cells.map(c => c[1]));
  return cells
    .map(([x, y]) => `${x},${y - minY}`)
    .sort()
    .join(" ");
};

/**
 * 빈 판에서 생성 위치 → 목표 칸까지의 최소 입력 수. 동작: 한 칸 이동, 벽까지 밀기(DAS), 회전 세 가지.
 * @param {import("../rules/rotation/index.js").Rotation} rotation
 * @param {import("../core/pieces.js").PieceType} type
 * @param {number[][]} target  고정된 칸(보드 좌표)
 * @returns {{ action: string, hold?: boolean }[] | null}  닿을 수 없으면 null
 */
export const finessePath = (rotation, type, target) => {
  const goal = finessePlacement(target);
  const cellsAt = (x, rot) => rotation.cells(type, rot).map(([cx, cy]) => [x + cx, AIR_Y + cy]);
  const fits = (x, rot) => cellsAt(x, rot).every(([cx]) => cx >= 0 && cx < WIDTH);
  const start = { x: Math.floor((WIDTH - PIECES[type].size) / 2), rot: rotation.spawnRotation(type), path: [] };
  const seen = new Set([`${start.x},${start.rot}`]);
  let frontier = [start];
  for (let cost = 0; frontier.length && cost <= 12; cost++) {
    const next = [];
    for (const s of frontier) {
      if (finessePlacement(cellsAt(s.x, s.rot)) === goal) return s.path;
      const moves = [];
      for (const dx of [-1, 1]) {
        const action = dx < 0 ? "LEFT" : "RIGHT";
        if (fits(s.x + dx, s.rot)) moves.push({ x: s.x + dx, rot: s.rot, step: { action } });
        let x = s.x;
        while (fits(x + dx, s.rot)) x += dx;
        moves.push({ x, rot: s.rot, step: { action, hold: true } });
      }
      for (const [d, action] of ROTATE_ACTIONS) {
        const to = (s.rot + d) % 4;
        const kicks = rotation.kicks(type, s.rot, to, cx => s.x + cx < 0 || s.x + cx >= WIDTH);
        // 공중에서는 벽만 막으므로 위아래 킥은 상관없다. 엔진처럼 맞는 첫 킥을 쓴다.
        const kick = kicks.find(([dx]) => fits(s.x + dx, to));
        if (kick) moves.push({ x: s.x + kick[0], rot: to, step: { action } });
      }
      for (const m of moves) {
        const k = `${m.x},${m.rot}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ x: m.x, rot: m.rot, path: [...s.path, m.step] });
      }
    }
    frontier = next;
  }
  return null;
};

export const finesseCost = (rotation, type, target) => finessePath(rotation, type, target)?.length ?? null;

/** 새로 눌린 버튼 수 */
const countBits = n => {
  let c = 0;
  for (let p = n; p; p &= p - 1) c += 1;
  return c;
};

/**
 * 한 판 동안 피스마다 피네스를 판정한다. 게임 루프가 step() 전후로 부른다.
 * 결과는 game.state.finesse에 남겨 통계 화면이 읽는다.
 * @param {{ state: any, rules: any }} game
 * @param {any} rotation  ROTATIONS[rules.rotation]
 */
export const createFinesseTracker = (game, rotation) => {
  const result = { judged: 0, faults: 0, extra: 0 };
  game.state.finesse = result;
  let prevHeld = 0;
  let inputs = 0;
  let soft = false;
  let lastInputs = 0;
  return {
    result,
    get lastInputs() {
      return lastInputs;
    },
    /**
     * @param {number} held
     * @param {number} pressed
     * @param {boolean} hadActive  step() 전에 움직이는 피스가 있었는지
     * @param {any[]} events  이번 step()의 이벤트
     * @returns {number} 이번 프레임에 판정한 피스의 초과 입력 수(없으면 0)
     */
    frame(held, pressed, hadActive, events) {
      const fresh = (pressed | (held & ~prevHeld)) & MOVE_BITS;
      prevHeld = held;
      if (events.some(e => e.type === "hold")) {
        inputs = 0;
        soft = false;
        return 0;
      }
      if (hadActive || game.state.frame === 1) inputs += countBits(fresh);
      if (held & BTN.SOFT) soft = true;
      const lock = events.find(e => e.type === "lock");
      if (!lock) return 0;
      lastInputs = inputs;
      const hard = events.some(e => e.type === "hardDrop");
      let extra = 0;
      if (hard && !soft) {
        const best = finesseCost(rotation, lock.piece, lock.cells);
        if (best !== null) {
          result.judged += 1;
          extra = Math.max(0, inputs - best);
          if (extra > 0) {
            result.faults += 1;
            result.extra += extra;
          }
        }
      }
      inputs = 0;
      soft = false;
      return extra;
    },
  };
};
