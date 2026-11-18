// 7종 미노의 모양. 회전 상태는 0(스폰) · 1(R) · 2(180) · 3(L).
// 모양은 "위에서 본 상자"(y가 아래로 증가)로 적고, 상자를 시계 방향으로 돌려 나머지 상태를 만든다.
// 이렇게 만든 4개 상태는 SRS의 기본 회전 상태와 같다(킥 테이블은 rules/rotation에서 따로 다룬다).

export const PIECE_TYPES = /** @type {const} */ (["I", "J", "L", "O", "S", "T", "Z"]);

/** @typedef {typeof PIECE_TYPES[number]} PieceType */
/** @typedef {[number, number]} Cell  [x, y] — 상자 기준, y는 아래로 증가 */

/** 보드 셀 값: 0 = 빈칸, 1~7 = 미노, 8 = 가비지 */
export const CELL_ID = Object.freeze({ I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 });
export const GARBAGE = 8;

const SPAWN = {
  I: ["....", "####", "....", "...."],
  J: ["#..", "###", "..."],
  L: ["..#", "###", "..."],
  O: ["##", "##"],
  S: [".##", "##.", "..."],
  T: [".#.", "###", "..."],
  Z: ["##.", ".##", "..."],
};

/** @param {string[]} rows @returns {Cell[]} */
const parse = rows => rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "#" ? [[x, y]] : [])));

/** 상자 크기 n 안에서 시계 방향 90° 회전 */
const rotateCW = (cells, n) => cells.map(([x, y]) => [n - 1 - y, x]);

const sortCells = cells => [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);

/** @type {Record<PieceType, { size: number, states: Cell[][] }>} */
export const PIECES = Object.freeze(
  Object.fromEntries(
    PIECE_TYPES.map(type => {
      const size = SPAWN[type].length;
      const states = [parse(SPAWN[type])];
      for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1], size));
      return [type, Object.freeze({ size, states: states.map(sortCells) })];
    })
  )
);

/**
 * @param {PieceType} type
 * @param {number} rot 0~3 (음수나 4 이상도 허용)
 * @returns {Cell[]}
 */
export const cellsOf = (type, rot) => PIECES[type].states[((rot % 4) + 4) % 4];
