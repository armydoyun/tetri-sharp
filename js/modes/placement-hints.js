import { collides } from "../core/board.js";
import { cellsOf } from "../core/pieces.js";
import { ROTATIONS } from "../rules/rotation/index.js";

export const sameCells = (left, right) =>
  left.length === right.length && left.every(([x, y]) => right.some(([cx, cy]) => cx === x && cy === y));

// 현재 피스에서 이동·회전·소프트 드롭으로 닿는 고정 위치.
export function* reachableLandings(board, active) {
  if (!active) return;
  const rotation = ROTATIONS.srs;
  const { type } = active;
  const fits = (x, y, rot) => !collides(board, cellsOf(type, rot), x, y);
  const queue = [];
  const seen = new Set();
  const add = (x, y, rot) => {
    const key = `${x},${y},${rot}`;
    if (seen.has(key) || !fits(x, y, rot)) return;
    seen.add(key);
    queue.push({ x, y, rot });
  };
  add(active.x, active.y, active.rot);
  for (let i = 0; i < queue.length; i++) {
    const { x, y, rot } = queue[i];
    if (fits(x, y + 1, rot)) add(x, y + 1, rot);
    else yield cellsOf(type, rot).map(([cx, cy]) => [x + cx, y + cy]);
    add(x - 1, y, rot);
    add(x + 1, y, rot);
    for (const turns of [1, 2, 3]) {
      const to = (rot + turns) % 4;
      const kicks = rotation.kicks(type, rot, to, (cx, cy) => collides(board, [[cx, cy]], x, y));
      for (const [dx, dy] of kicks) {
        if (!fits(x + dx, y + dy, to)) continue;
        add(x + dx, y + dy, to);
        break;
      }
    }
  }
}
