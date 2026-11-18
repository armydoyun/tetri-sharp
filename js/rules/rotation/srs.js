// SRS(Super Rotation System). 모양은 core/pieces.js의 기본 회전 상태를 그대로 쓰고, 킥 테이블만 여기서 정한다.
// 표준 표는 y가 위로 증가하는 좌표라서, 보드 좌표(y가 아래로 증가)에 맞게 dy 부호를 뒤집어 둔다.
import { cellsOf } from "../../core/pieces.js";

/** @typedef {[number, number]} Offset */

// 키: "from>to" (0=스폰, 1=R, 2=180, 3=L). 값: y-up 기준 [dx, dy] 목록 — 아래에서 뒤집는다.
const JLSTZ_UP = {
  "0>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "1>0": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "1>2": [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  "2>1": [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  "2>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  "3>2": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "3>0": [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  "0>3": [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};

const I_UP = {
  "0>1": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "1>0": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "1>2": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  "2>1": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "2>3": [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  "3>2": [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  "3>0": [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  "0>3": [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

/** @param {Record<string, Offset[]>} table */
const toBoard = table =>
  Object.freeze(Object.fromEntries(Object.entries(table).map(([k, list]) => [k, list.map(([x, y]) => [x, 0 - y])])));

const JLSTZ = toBoard(JLSTZ_UP);
const I = toBoard(I_UP);
// 표준 SRS에는 180° 회전이 없다. 제자리 회전만 허용하고, 막히면 한 칸 위로만 시도한다.
const HALF = Object.freeze([
  [0, 0],
  [0, -1],
]);
const NONE = Object.freeze([[0, 0]]);

export default Object.freeze({
  id: "srs",
  cells: cellsOf,
  spawnRotation: () => 0,
  /**
   * @param {import("../../core/pieces.js").PieceType} type
   * @returns {ReadonlyArray<Offset>}
   */
  kicks(type, from, to) {
    if (type === "O") return NONE;
    if ((from + 2) % 4 === to) return HALF;
    return (type === "I" ? I : JLSTZ)[`${from}>${to}`];
  },
});
