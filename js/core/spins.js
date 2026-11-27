import { collides } from "./board.js";
import { detectTSpin } from "./tspin.js";
import { spinBit } from "../rules/spins.js";

/** 벽과 놓인 블록으로 상하좌우가 모두 막힌 자리. */
const trapped = (board, cells, x, y) =>
  collides(board, cells, x, y + 1) &&
  collides(board, cells, x - 1, y) &&
  collides(board, cells, x + 1, y) &&
  collides(board, cells, x, y - 1);

/**
 * O는 회전 방향으로 한 칸 옆·한 칸 아래에 있는 막힌 포켓에만 들어갈 수 있다.
 * 포켓의 옆과 위도 막혀 있어 그 이동을 가로나 아래 이동으로 대신할 수 없다.
 * @param {import("./board.js").Board} board
 * @param {import("../rules/rotation/index.js").Rotation} rotation
 * @param {{ type: import("./pieces.js").PieceType, x: number, y: number, rot: number }} a
 * @param {number} to
 * @param {number} mask
 * @param {(cx: number, cy: number) => boolean} blocked
 * @returns {ReadonlyArray<readonly [number, number]>}
 */
export const spinKicks = (board, rotation, a, to, mask, blocked) => {
  if (a.type === "O" && mask & spinBit("O") && (a.rot + 2) % 4 !== to) {
    const dx = (a.rot + 1) % 4 === to ? 1 : -1;
    const cells = rotation.cells("O", to);
    if (!collides(board, cells, a.x + dx, a.y + 1) && trapped(board, cells, a.x + dx, a.y + 1)) return [[dx, 1]];
  }
  return rotation.kicks(a.type, a.rot, to, blocked);
};

/** 모양이나 위치가 실제로 바뀐 회전만 스핀 후보가 된다. */
export const movedByRotation = (rotation, type, from, to, dx, dy) => {
  const before = rotation.cells(type, from);
  return rotation.cells(type, to).some(([x, y]) => !before.some(([oldX, oldY]) => x + dx === oldX && y + dy === oldY));
};

const NO_SPIN = Object.freeze({ tspin: /** @type {const} */ ("none") });

/**
 * T 전용 판정과 다른 미노 판정을 같은 고정 시점에 수행한다.
 * @param {import("./board.js").Board} board
 * @param {import("../rules/rotation/index.js").Rotation} rotation
 * @param {import("./engine.js").Active} a
 * @param {number} mask
 * @returns {{ tspin: "none" | "mini" | "full", spinPiece?: import("./pieces.js").PieceType }}
 */
export const detectSpin = (board, rotation, a, mask, legacyArsSpin = false) => {
  if (a.lastAction !== "rotate" || !(mask & spinBit(a.type))) return NO_SPIN;
  if (a.type === "T") return { tspin: detectTSpin(board, a, legacyArsSpin ? undefined : rotation.id) };
  return a.spinMoved && trapped(board, rotation.cells(a.type, a.rot), a.x, a.y)
    ? { tspin: "none", spinPiece: a.type }
    : NO_SPIN;
};
