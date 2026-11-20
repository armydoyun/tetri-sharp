// CPU 플레이어. 엔진을 직접 건드리지 않고 사람처럼 매 프레임 버튼 입력만 만든다.
//  1) 새 피스가 나오면 놓을 수 있는 자리(회전 × 가로 위치, 그대로 떨어뜨리기)를 모두 판 위에 놓아 보고 점수를 매긴다.
//     홀드를 쓸 수 있으면 홀드한 피스(또는 다음 피스)로도 똑같이 해 본다.
//  2) 고른 자리로 가려고 매 프레임 실제 피스 상태를 보며 회전 → 좌우 이동 → 하드 드롭을 한 번에 하나씩 누른다.
//  3) 난이도의 PPS에 맞춰 피스마다 생각하는 시간을 둔다. 쉬운 난이도는 가끔 차선을 고른다.
// 결정론: 난수는 시드 PRNG만 쓴다.
import { BTN } from "../core/engine.js";
import { HEIGHT, WIDTH, clearLines, collides, place } from "../core/board.js";
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

/**
 * 이 피스로 갈 수 있는 자리마다 점수. 생성 높이에서 좌우로 막힘없이 갈 수 있는 자리만 본다.
 * @returns {{ rot: number, x: number, score: number }[]}
 */
export const placements = (board, rotation, type, startX, startY) => {
  const out = [];
  for (const rot of distinctRotations(rotation, type)) {
    const cells = rotation.cells(type, rot);
    const fits = (x, y) => !collides(board, cells, x, y);
    if (!fits(startX, startY)) continue;
    for (const dir of [-1, 1]) {
      for (let x = dir < 0 ? startX : startX + 1; fits(x, startY); x += dir) {
        let y = startY;
        while (fits(x, y + 1)) y += 1;
        const b = { ...board, cells: board.cells.slice() };
        place(b, cells, x, y, 9);
        const lines = clearLines(b).length;
        out.push({ rot, x, score: evaluate(b, lines) });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
};

/**
 * @param {{ game: ReturnType<typeof import("../core/engine.js").createGame>, rotation: any,
 *   level: { pps: number, mistake: number, hold: boolean, holdMinGain?: number }, seed?: number }} options
 */
export const createBot = ({ game, rotation, level, seed = 1 }) => {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const rules = game.rules;
  const framesPerPiece = Math.max(1, Math.round(60 / level.pps));
  const holdMinGain = level.holdMinGain ?? 0.5;
  /** @type {null | { hold: boolean, rot: number, x: number }} */
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
    const here = placements(s.board, rotation, a.type, a.x, a.y);
    let best = { hold: false, ...(pick(here) ?? { rot: a.rot, x: a.x, score: -Infinity }) };
    const canHold = level.hold && rules.hold.enabled && !s.holdUsed;
    const other = s.hold ?? s.queue[0];
    if (canHold && other && other !== a.type) {
      // 홀드한 피스는 같은 자리(생성 위치)에서 나온다.
      const size = other === "I" ? 4 : other === "O" ? 2 : 3;
      const ox = Math.floor((WIDTH - size) / 2);
      const alt = placements(s.board, rotation, other, ox, a.y)[0];
      if (alt && alt.score > best.score + holdMinGain) best = { hold: true, ...alt };
    }
    plan = best;
    // 생각하는 시간: 한 피스에 쓸 프레임에서 움직이는 데 드는 프레임을 뺀 만큼
    const moves = Math.abs(best.x - a.x) + ((best.rot - a.rot + 4) % 4 === 2 ? 2 : best.rot !== a.rot ? 1 : 0) + 1;
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
      const p = /** @type {{ hold: boolean, rot: number, x: number }} */ (plan);
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
      const turn = (p.rot - a.rot + 4) % 4;
      if (turn === 1 || turn === 2) return { held: 0, pressed: BTN.CW };
      if (turn === 3) return { held: 0, pressed: BTN.CCW };
      if (p.x < a.x) return { held: 0, pressed: BTN.LEFT };
      if (p.x > a.x) return { held: 0, pressed: BTN.RIGHT };
      return drop;
    },
  };
};
