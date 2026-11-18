// 테스트용 탐색기: 보드와 피스 하나로 닿을 수 있는 모든 고정 자리를 찾는다(이동·회전·한 칸 내리기).
// 연습 모드의 자리가 실제로 풀리는지 확인하는 데 쓴다.
import {
  HEIGHT,
  WIDTH,
  clearLines,
  collides,
  createBoard,
  get,
  inBounds,
  isEmpty,
  place,
} from "../../js/core/board.js";
import { PIECES } from "../../js/core/pieces.js";
import { detectTSpin } from "../../js/core/tspin.js";
import { ROTATIONS } from "../../js/rules/rotation/index.js";

const copy = board => ({ ...board, cells: board.cells.slice() });

/**
 * @returns {{ x: number, y: number, rot: number, tspin: string, lines: number, perfect: boolean }[]}
 */
export const placements = (board, type, rotationId = "srs") => {
  const rotation = ROTATIONS[rotationId];
  const size = PIECES[type].size;
  const fits = (x, y, rot) => !collides(board, rotation.cells(type, rot), x, y);
  const start = { x: Math.floor((WIDTH - size) / 2), y: HEIGHT - 20 - 2, rot: rotation.spawnRotation(type) };
  if (fits(start.x, start.y + 1, start.rot)) start.y += 1;
  const seen = new Set();
  const out = new Map();
  const queue = [{ ...start, type, lastAction: null, kick: 0 }];
  while (queue.length) {
    const a = queue.shift();
    const key = `${a.x},${a.y},${a.rot},${a.lastAction === "rotate" ? a.kick : "m"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fits(a.x, a.y + 1, a.rot)) {
      const tspin = detectTSpin(board, a);
      const b = copy(board);
      place(b, rotation.cells(type, a.rot), a.x, a.y, 1);
      const lines = clearLines(b).length;
      const k = `${a.x},${a.y},${a.rot},${tspin}`;
      if (!out.has(k)) out.set(k, { x: a.x, y: a.y, rot: a.rot, tspin, lines, perfect: lines > 0 && isEmpty(b) });
    }
    for (const dx of [-1, 1]) if (fits(a.x + dx, a.y, a.rot)) queue.push({ ...a, x: a.x + dx, lastAction: "move" });
    if (fits(a.x, a.y + 1, a.rot)) queue.push({ ...a, y: a.y + 1, lastAction: "drop" });
    for (const d of [1, 3, 2]) {
      const to = (a.rot + d) % 4;
      const blocked = (cx, cy) => !inBounds(board, a.x + cx, a.y + cy) || get(board, a.x + cx, a.y + cy) !== 0;
      const kicks = rotation.kicks(type, a.rot, to, blocked);
      for (let i = 0; i < kicks.length; i++) {
        const [dx, dy] = kicks[i];
        if (fits(a.x + dx, a.y + dy, to)) {
          queue.push({ ...a, x: a.x + dx, y: a.y + dy, rot: to, lastAction: "rotate", kick: i });
          break;
        }
      }
    }
  }
  return [...out.values()];
};

export { createBoard };
