// T-spin 판정 (3-corner 규칙).
// 조건: T 피스이고, 마지막 동작이 회전이며, T의 3×3 상자 네 모서리 중 3개 이상이 막혀 있다(벽·바닥 포함).
//   - 앞쪽(T가 가리키는 쪽) 두 모서리가 모두 막혀 있으면 T-spin
//   - 아니면 Mini — 단, SRS 마지막 킥(5번째, 1칸 옆·2칸 아래)으로 들어간 경우는 T-spin으로 친다.
import { get, inBounds } from "./board.js";

/** 모서리 순서: 왼위, 오른위, 오른아래, 왼아래 */
const CORNERS = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
];
/** 회전 상태별 앞쪽 모서리 (0: 위, 1: 오른쪽, 2: 아래, 3: 왼쪽을 가리킴) */
const FRONT = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

const blocked = (board, x, y) => !inBounds(board, x, y) || get(board, x, y) !== 0;

/**
 * @param {import("./board.js").Board} board  피스를 놓기 전 보드
 * @param {import("./engine.js").Active} a
 * @returns {"none" | "mini" | "full"}
 */
export const detectTSpin = (board, a) => {
  if (a.type !== "T" || a.lastAction !== "rotate") return "none";
  const hit = CORNERS.map(([cx, cy]) => blocked(board, a.x + cx, a.y + cy));
  if (hit.filter(Boolean).length < 3) return "none";
  const [f1, f2] = FRONT[a.rot];
  if (hit[f1] && hit[f2]) return "full";
  return a.kick === 4 ? "full" : "mini";
};
